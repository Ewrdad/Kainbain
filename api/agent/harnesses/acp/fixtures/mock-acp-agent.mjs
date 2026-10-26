#!/usr/bin/env node
/**
 * MARK: mock-acp-agent.mjs
 * @description A deterministic mock ACP (Agent Client Protocol) agent used by
 *   the ACP core + flavor tests — no real agent install, no network, no
 *   credentials. It speaks JSON-RPC 2.0 over newline-delimited stdio:
 *
 *     initialize    -> { protocolVersion: 1, agentCapabilities }
 *     session/new   -> { sessionId, modes, configOptions } (stable across
 *                      prompts: one session; the mode/model selects mirror
 *                      the ACP config-option surface with vendor-neutral ids)
 *     session/set_mode -> { } (validates modeId against the available modes)
 *     session/set_config_option -> { configOptions } (validates configId +
 *                      value against the session/new config options)
 *     session/prompt-> streams session/update notifications (agent chunks,
 *                      one tool_call start/update/end triplet, one
 *                      usage_update telemetry row), issues one
 *                      agent-initiated `requestPermission` mid-turn, then
 *                      resolves with { stopReason: "end_turn" }
 *     session/steer -> { status: "steered" }
 *     session/cancel-> { status: "cancelled" }
 *
 *   Behavior is selected with environment variables (`ACP_MOCK_*` is the
 *   canonical spelling; the `<flavor>_ACP_MOCK_*` aliases — e.g.
 *   AGY_ACP_MOCK_* for the Antigravity flavor — pass a flavor adapter's
 *   sanitized child-env allowlist, exactly like the exec paths' mock env
 *   names; the bare ACP_MOCK_* spellings also work when the core is driven
 *   directly with a custom env):
 *
 *     ACP_MOCK_MODE (or AGY_ACP_MOCK_MODE)
 *                          success (default) | no_permission | 502_error | hang | hang_handshake | crash | bad_handshake
 *                          `hang` never answers `session/prompt` (a hung TURN);
 *                          `hang_handshake` never answers `initialize` (a hung
 *                          handshake the runtime's start watchdog must settle).
 *     ACP_MOCK_CHUNK_DELAY_MS (or AGY_ACP_MOCK_CHUNK_DELAY_MS)
 *                          delay between outbound frames (default 0)
 *     ACP_MOCK_PROMPT_LOG (or AGY_ACP_MOCK_PROMPT_LOG)
 *                          when set, each session/prompt params object is
 *                          appended as a JSON line (model-pin assertions)
 *     ACP_MOCK_CONFIG_LOG (or AGY_ACP_MOCK_CONFIG_LOG)
 *                          when set, each session/set_mode and
 *                          session/set_config_option params object is
 *                          appended as a JSON line (mode/model assertions)
 *     ACP_MOCK_WORKSPACE_TRUST (or AGY_ACP_MOCK_WORKSPACE_TRUST)
 *                          when set (e.g. `untrusted`), echoed as the
 *                          session/new `_meta.workspace_trust.status` so the
 *                          flavor's trust diagnostic has a fixture
 *
 *   Diagnostics go to stderr (stdout stays purely JSON-RPC, per the ACP rule).
 */

import fs from "node:fs";

const MODE = process.env.AGY_ACP_MOCK_MODE || process.env.ACP_MOCK_MODE || "success";
const CHUNK_DELAY_MS =
	Number(process.env.AGY_ACP_MOCK_CHUNK_DELAY_MS || process.env.ACP_MOCK_CHUNK_DELAY_MS || 0) || 0;
const PROMPT_LOG = process.env.AGY_ACP_MOCK_PROMPT_LOG || process.env.ACP_MOCK_PROMPT_LOG || null;
const CONFIG_LOG = process.env.AGY_ACP_MOCK_CONFIG_LOG || process.env.ACP_MOCK_CONFIG_LOG || null;
const WORKSPACE_TRUST =
	process.env.AGY_ACP_MOCK_WORKSPACE_TRUST || process.env.ACP_MOCK_WORKSPACE_TRUST || null;
const SESSION_ID = "mock-acp-session-1";

/** Vendor-neutral session modes (mirrors the ACP `session/new` `modes` shape). */
const AVAILABLE_MODES = [
	{ id: "default", name: "Default", description: "Asks before tool executions" },
	{ id: "hands-off", name: "Hands-off", description: "Auto-approves tool executions" },
];

/** Vendor-neutral config-option selects (mirrors the ACP `configOptions`
 *  shape: a select carries `options` of `{ value, name, description? }`). */
const CONFIG_OPTIONS = [
	{
		id: "mode",
		name: "Session Mode",
		category: "mode",
		type: "select",
		currentValue: "default",
		options: AVAILABLE_MODES.map((mode) => ({ value: mode.id, name: mode.name })),
	},
	{
		id: "model",
		name: "Model",
		category: "model",
		type: "select",
		currentValue: "mock-model-a",
		options: [
			{ value: "mock-model-a", name: "Mock Model A", description: "fixture-a" },
			{ value: "mock-model-b", name: "Mock Model B", description: "fixture-b" },
		],
	},
];

/***
 * MARK: appendConfigLog (internal)
 * @description Appends one config/mode request params object to the operator's
 *   diagnostic log file — test assertions read it to prove WHICH config values
 *   the client applied. Never breaks the mock on write failures.
 ***/
function appendConfigLog(params) {
	if (!CONFIG_LOG) return;
	try {
		fs.appendFileSync(CONFIG_LOG, `${JSON.stringify(params)}\n`);
	} catch {
		// Diagnostic logging must never break the mock.
	}
}

function sleep(ms) {
	if (ms <= 0) return;
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function send(frame) {
	fs.writeSync(1, `${JSON.stringify(frame)}\n`);
}

function respond(id, result) {
	send({ jsonrpc: "2.0", id, result });
}

function respondError(id, code, message) {
	send({ jsonrpc: "2.0", id, error: { code, message } });
}

function notify(method, params) {
	send({ jsonrpc: "2.0", method, params });
}

function promptTextOf(params) {
	const parts = params?.prompt;
	if (Array.isArray(parts)) {
		return parts
			.filter((part) => part?.type === "text" && typeof part.text === "string")
			.map((part) => part.text)
			.join("");
	}
	return "";
}

let agentRequestSeq = 0;

/** Mid-turn permission gate: resolves with the client's decision. */
async function requestPermission() {
	agentRequestSeq += 1;
	const id = `mock-perm-${agentRequestSeq}`;
	const pending = new Promise((resolve) => pendingResolvers.set(id, resolve));
	send({
		jsonrpc: "2.0",
		id,
		method: "requestPermission",
		params: {
			sessionId: SESSION_ID,
			toolCall: { toolCallId: "tool-1", title: "Write file src/example.js" },
			options: [
				{ optionId: "allow-once", kind: "allow_once", name: "Allow once" },
				{ optionId: "reject", kind: "reject", name: "Reject" },
			],
		},
	});
	return pending;
}

const pendingResolvers = new Map(); // agent-request id -> resolve(response result)
const pendingPrompts = new Map(); // client-request id -> { promptText } (hang mode never settles)

function streamChunks(text) {
	const reply = `Mock ACP reply: ${text}`;
	const deltas = reply.match(/.{1,12}/gs) || [reply];
	for (const delta of deltas) {
		notify("session/update", {
			sessionId: SESSION_ID,
			update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: delta } },
		});
		sleep(CHUNK_DELAY_MS);
	}
	return reply;
}

/***
 * MARK: streamUsageUpdate (internal)
 * @description Emits one `usage_update` telemetry row (context window use,
 *   cost, and per-turn token counters in `_meta`), mirroring the ACP usage
 *   update shape so the core's telemetry mapping has a deterministic fixture.
 ***/
function streamUsageUpdate() {
	notify("session/update", {
		sessionId: SESSION_ID,
		update: {
			sessionUpdate: "usage_update",
			used: 1200,
			size: 200000,
			cost: { amount: 0.012, currency: "USD" },
			_meta: {
				steps: 1,
				promptTokens: 900,
				completionTokens: 300,
				cachedTokens: 128,
				totalTokens: 1200,
				tokensPerSecond: 42.5,
				lastTurnDuration: 3.5,
				lastTurnTotalTokens: 1200,
			},
		},
	});
	sleep(CHUNK_DELAY_MS);
}

function streamToolCall() {
	notify("session/update", {
		sessionId: SESSION_ID,
		update: {
			sessionUpdate: "tool_call",
			toolCallId: "tool-1",
			title: "Write file src/example.js",
			kind: "start",
			input: { path: "src/example.js" },
		},
	});
	sleep(CHUNK_DELAY_MS);
	notify("session/update", {
		sessionId: SESSION_ID,
		update: {
			sessionUpdate: "tool_call",
			toolCallId: "tool-1",
			title: "Write file src/example.js",
			kind: "update",
			output: "writing…",
		},
	});
	sleep(CHUNK_DELAY_MS);
	notify("session/update", {
		sessionId: SESSION_ID,
		update: {
			sessionUpdate: "tool_call",
			toolCallId: "tool-1",
			title: "Write file src/example.js",
			kind: "end",
			output: "wrote 12 lines",
		},
	});
	sleep(CHUNK_DELAY_MS);
}

async function handlePrompt(id, params) {
	if (PROMPT_LOG) {
		try {
			fs.appendFileSync(PROMPT_LOG, `${JSON.stringify(params)}\n`);
		} catch {
			// Diagnostic logging must never break the mock.
		}
	}
	const text = promptTextOf(params);
	if (MODE === "hang") {
		// Never answer: the caller's timeout/abort must settle the turn.
		pendingPrompts.set(id, { promptText: text });
		return;
	}
	if (MODE === "crash") {
		notify("session/update", {
			sessionId: SESSION_ID,
			update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Starting…" } },
		});
		await new Promise((resolve) => setTimeout(resolve, 20));
		fs.writeSync(2, "mock-acp-agent: simulated hard crash (no prompt response follows)\n");
		process.exit(1);
	}
	if (MODE === "502_error") {
		// The swallowed-transport failure: error prose smuggled inside an
		// assistant delta, then a CLEAN turn end (the flavor adapter must
		// trap the text and report run_error instead).
		notify("session/update", {
			sessionId: SESSION_ID,
			update: {
				sessionUpdate: "agent_message_chunk",
				content: {
					type: "text",
					text: "Agent execution error: model unreachable: Error 502 Bad Gateway — retrying upstream",
				},
			},
		});
		sleep(CHUNK_DELAY_MS);
		respond(id, { stopReason: "end_turn" });
		return;
	}
	streamChunks(text);
	if (MODE !== "no_permission") {
		const decision = await requestPermission();
		const outcome = decision?.outcome?.outcome;
		if (outcome !== "selected") {
			respond(id, { stopReason: "cancelled" });
			return;
		}
	}
	streamToolCall();
	streamUsageUpdate();
	respond(id, { stopReason: "end_turn" });
}

async function handleFrame(frame) {
	if (!frame || typeof frame !== "object" || Array.isArray(frame)) return;
	// Agent-request responses (client answering OUR requestPermission).
	if ((frame.result !== undefined || frame.error !== undefined) && typeof frame.method !== "string") {
		const resolve = pendingResolvers.get(frame.id);
		if (resolve) {
			pendingResolvers.delete(frame.id);
			resolve(frame.result);
		}
		return;
	}
	if (typeof frame.method !== "string") return;
	const { method, params, id } = frame;
	switch (method) {
		case "initialize": {
			if (MODE === "hang_handshake") {
				// Never answer: the client's start watchdog must time us out.
				break;
			}
			if (MODE === "bad_handshake") {
				respond(id, { protocolVersion: 99, agentCapabilities: {} });
			} else {
				respond(id, {
					protocolVersion: 1,
					agentCapabilities: { sessions: { new: true }, prompt: true, steer: true },
				});
			}
			break;
		}
		case "session/new": {
			const result = {
				sessionId: SESSION_ID,
				modes: {
					currentModeId: "default",
					availableModes: AVAILABLE_MODES,
				},
				configOptions: CONFIG_OPTIONS,
			};
			// `ACP_MOCK_WORKSPACE_TRUST=untrusted` mirrors the real agent's
			// `_meta.workspace_trust` so the flavor's non-destructive trust
			// diagnostic has an end-to-end fixture.
			if (WORKSPACE_TRUST) {
				result._meta = {
					workspace_trust: { status: WORKSPACE_TRUST, details: null },
				};
			}
			respond(id, result);
			break;
		}
		case "session/set_mode": {
			appendConfigLog({ method, ...params });
			const modeId = params?.modeId;
			if (AVAILABLE_MODES.some((mode) => mode.id === modeId)) {
				respond(id, {});
			} else {
				respondError(id, -32602, `Unknown session mode: ${modeId}`);
			}
			break;
		}
		case "session/set_config_option": {
			appendConfigLog({ method, ...params });
			const option = CONFIG_OPTIONS.find((entry) => entry.id === params?.configId);
			if (option && option.options.some((entry) => entry.value === params?.value)) {
				respond(id, { configOptions: CONFIG_OPTIONS });
			} else {
				respondError(
					id,
					-32602,
					`Unsupported config option ${params?.configId}=${params?.value ?? ""}`,
				);
			}
			break;
		}
		case "session/prompt": {
			if (id === undefined || id === null) break;
			await handlePrompt(id, params);
			break;
		}
		case "session/steer": {
			respond(id, { status: "steered" });
			break;
		}
		case "session/cancel": {
			respond(id, { status: "cancelled" });
			break;
		}
		default: {
			if (id !== undefined && id !== null) respondError(id, -32601, `Method not found: ${method}`);
			break;
		}
	}
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
	buffer += chunk;
	let index;
	while ((index = buffer.indexOf("\n")) !== -1) {
		const line = buffer.slice(0, index).trim();
		buffer = buffer.slice(index + 1);
		if (!line) continue;
		let frame;
		try {
			frame = JSON.parse(line);
		} catch {
			continue;
		}
		void handleFrame(frame);
	}
});
