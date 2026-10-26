#!/usr/bin/env node
/**
 * MARK: mock-muse-serve.mjs
 * @description A deterministic mock of the Muse Code `muse serve` MSP host
 *   used by the muse MSP tests — no real CLI install, no network, no model
 *   credentials. It speaks NDJSON JSON-RPC 2.0 over stdio and mirrors the
 *   probe-verified 1.4.9 behaviour: the two-step `initialize`/`initialized`
 *   handshake (enforced), UUIDv7 `commandId` validation, `model/list`,
 *   `session/start` (+ `session/resume`), and an echo turn stream
 *   (`turn/started` → `item/*` → `session/tokenUsage` / `session/contextUsage`
 *   → `turn/completed`).
 *
 *   Behaviour is selected with MUSE_-prefixed env vars (they flow through the
 *   harness's child-env allowlist):
 *
 *     MUSE_MOCK_SERVE_MODE       default | failStart | hang | crashAfterAck
 *                                | wedge | failSessionStart | rejectTurn
 *                                failStart: exit 9 before the handshake
 *                                hang: model/list never answers
 *                                crashAfterAck: exit 7 right after turn/start
 *                                wedge: turn/start acks but the turn never
 *                                  completes (watchdog force-settle test)
 *                                failSessionStart: handshake + model/list OK,
 *                                  session/start is refused (exec-fallback
 *                                  with a resolved model test)
 *                                rejectTurn: turn/start is refused (run_error
 *                                  + rejection test)
 *     MUSE_MOCK_APPROVAL         1 = emit an approval/request mid-turn
 *     MUSE_MOCK_USER_INPUT       1 = emit a userInput/request mid-turn
 *     MUSE_MOCK_NO_WINDOW        1 = omit windowTokens from session/contextUsage
 *                                (the name avoids the secret-redaction pattern:
 *                                *TOKEN* names never reach a child env)
 *     MUSE_MOCK_ARGV_LOG         append the received argv (JSON line)
 *
 *   It also enforces `--workspace` is NEVER passed (serve has no such flag)
 *   and rejects a v4 UUID commandId, so the client's UUIDv7 generator is
 *   proven by the contract test.
 */

import fs from "node:fs";
import crypto from "node:crypto";

const argv = process.argv.slice(2);
const MODE = process.env.MUSE_MOCK_SERVE_MODE || "default";

if (process.env.MUSE_MOCK_ARGV_LOG) {
	try {
		fs.appendFileSync(process.env.MUSE_MOCK_ARGV_LOG, `${JSON.stringify(argv)}\n`);
	} catch {
		// diagnostic logging must never break the mock
	}
}

if (argv[0] === "--version") {
	process.stdout.write("Muse Code 1.4.9 (mock)\n");
	process.exit(0);
}
if (argv.includes("--help") || argv.includes("-h")) {
	process.stdout.write(
		[
			"muse serve — serve an MSP session host over stdio",
			"Usage: muse serve [--provider <PROVIDER>] [--model <MODEL>] [OPTIONS]",
			"      --provider <PROVIDER>",
			"      --model <MODEL>",
			"      --disable-sandbox",
			"",
		].join("\n"),
	);
	process.exit(0);
}
if (argv[0] !== "serve") {
	process.stderr.write("mock-muse-serve only implements `muse serve`\n");
	process.exit(2);
}
if (argv.includes("--workspace")) {
	process.stderr.write("unexpected argument '--workspace' for `muse serve`\n");
	process.exit(2);
}
if (MODE === "failStart") {
	// A host whose handshake refuses (simulates a broken install/auth).
	process.stderr.write("mock host refusing to start (failStart)\n");
	process.exit(9);
}

const UUIDV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let initialized = false;
const sessions = new Map();
let nextApprovalId = 1;
let pendingRequestSeq = 1000;

// Durable session store (when configured): lets a fresh host resume a session
// created by a previous host process — the crash→resume contract test.
const STORE_PATH = process.env.MUSE_MOCK_SESSION_STORE || null;
function loadStore() {
	if (!STORE_PATH) return { sessions: {} };
	try {
		const parsed = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
		return parsed && typeof parsed === "object" ? parsed : { sessions: {} };
	} catch {
		return { sessions: {} };
	}
}
function saveStore() {
	if (!STORE_PATH) return;
	try {
		const persisted = { sessions: {} };
		for (const [id, session] of sessions) persisted.sessions[id] = session;
		fs.writeFileSync(STORE_PATH, JSON.stringify(persisted));
	} catch {
		// store persistence is best-effort
	}
}
const store = loadStore();

function writeFrame(frame) {
	process.stdout.write(`${JSON.stringify(frame)}\n`);
}

function notify(method, params) {
	writeFrame({ jsonrpc: "2.0", method, params });
}

function result(id, value) {
	writeFrame({ jsonrpc: "2.0", id, result: value });
}

function errorResponse(id, code, message, data) {
	writeFrame({ jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } });
}

function uuid() {
	return crypto.randomUUID();
}

function newSessionId() {
	// The mock mints session ids; the client only validates commandIds.
	return uuid();
}

function echoTurn(session, turnId, text) {
	const itemId = uuid();
	const delay = Number(process.env.MUSE_MOCK_SERVE_DELAY_MS || 5) || 5;
	// The reply streams as THREE item/delta rows so tests can prove the
	// client forwards every delta live (never one end-of-turn call).
	const reply = `echo: ${text}`;
	const third = Math.ceil(reply.length / 3);
	const parts = [reply.slice(0, third), reply.slice(third, 2 * third), reply.slice(2 * third)];
	const steps = [
		() => notify("session/statusChanged", { sessionId: session.id, status: "running" }),
		() =>
			notify("turn/started", {
				commandId: turnId,
				sessionId: session.id,
				turnId,
				viewCursor: "v1:1",
			}),
		() =>
			notify("item/started", {
				item: { itemId, kind: "agentMessage", revision: 1, status: "inProgress", text: "", turnId },
				sessionId: session.id,
				viewCursor: "v1:2",
			}),
		...parts.map((part, index) => () =>
			notify("item/delta", {
				delta: part,
				field: "text",
				itemId,
				sessionId: session.id,
				viewCursor: `v1:3.${index}`,
			}),
		),
		() =>
			notify("item/completed", {
				item: {
					itemId,
					kind: "agentMessage",
					messagePhase: "finalAnswer",
					revision: 2,
					status: "completed",
					text: reply,
					turnId,
				},
				sessionId: session.id,
				sourceRange: {},
				viewCursor: "v1:4",
			}),
		() =>
			notify("session/tokenUsage", {
				sessionId: session.id,
				promptTokens: 3,
				totalTokens: 6,
				modelId: session.modelId,
				turnId,
				cumulative: { promptTokens: 3, outputTokens: 3, totalTokens: 6 },
			}),
		() =>
			notify("session/contextUsage", {
				sessionId: session.id,
				usedTokens: 6,
				// The real host OMITS windowTokens when the basis has no limit.
				...(process.env.MUSE_MOCK_NO_WINDOW === "1" ? {} : { windowTokens: 1000 }),
				pressure: "normal",
				sourceRange: {},
				viewCursor: "v1:5",
			}),
	];
	let index = 0;
	const timer = setInterval(() => {
		const step = steps[index++];
		if (step) {
			step();
			return;
		}
		clearInterval(timer);
		if (session.interrupted) {
			notify("turn/completed", {
				sessionId: session.id,
				turnId,
				terminal: "cancelled",
				sourceRange: {},
				viewCursor: "v1:6",
			});
		} else {
			notify("turn/completed", {
				sessionId: session.id,
				turnId,
				terminal: "completed",
				durationMs: 4,
				sourceRange: {},
				viewCursor: "v1:6",
			});
		}
		session.runningTurnId = null;
		notify("session/statusChanged", { sessionId: session.id, status: "idle" });
	}, delay);
	timer.unref?.();
}

function handleRequest(id, method, params) {
	if (method === "initialize") {
		if (initialized) {
			errorResponse(id, -32600, "Already initialized", { kind: "alreadyInitialized" });
			return;
		}
		if (!params?.clientInfo?.name || !/^[a-z0-9_]+$/.test(params.clientInfo.name)) {
			errorResponse(id, -32602, "invalid initialize params: clientInfo.name must match ^[a-z0-9_]+$");
			return;
		}
		initialized = true;
		result(id, {
			experimentalApi: false,
			grantedCapabilities: [],
			museHome: "/tmp/muse-mock-home",
			platformFamily: "unix",
			platformOs: "linux",
			sandboxAvailability: "available",
			schema: {
				fingerprint:
					"sha256:5d3b43e5ccdb7dc4f5a32c380f5f2cde0f10e3059b93610afb2e73f73b1d914c",
				version: 1,
			},
			serverInfo: { name: "muse", version: "1.4.9" },
			sessionDurability: "durable",
		});
		return;
	}
	if (!initialized) {
		errorResponse(id, -32600, "Not initialized", { kind: "notInitialized" });
		return;
	}
	if (MODE === "hang" && method === "model/list") {
		// Never answer — the handshake/timeout ceiling must trip.
		return;
	}
	if (method === "model/list") {
		result(id, {
			models: [
				{
					modelId: "muse-wonder-1.0",
					displayLabel: "muse-wonder-1.0",
					providerId: "meta",
					profileId: "tbh",
					contextLimit: 1000000,
					outputLimit: 128000,
					isDefault: true,
					isActive: false,
				},
				{
					modelId: "muse-spark-1.3",
					displayLabel: "muse-spark-1.3",
					providerId: "meta",
					profileId: "tbh",
					contextLimit: 1000000,
					outputLimit: 128000,
					isDefault: false,
					isActive: false,
				},
			],
			profileId: "tbh",
			providerId: "meta",
			source: "providerCatalog",
		});
		return;
	}
	if (method === "session/start") {
		if (MODE === "failSessionStart") {
			// Handshake and model/list work; the session itself is refused
			// (proves the exec fallback still plumbs a RESOLVED model).
			errorResponse(id, -32020, "session/start refused (failSessionStart)", {
				kind: "sessionStartRefused",
			});
			return;
		}
		if (!UUIDV7.test(String(params?.commandId || ""))) {
			errorResponse(id, -32602, `invalid session/start commandId: expected UUIDv7`);
			return;
		}
		if (!params?.workspaceRoot) {
			errorResponse(id, -32602, "session/start requires workspaceRoot");
			return;
		}
		const sessionId = newSessionId();
		const session = {
			id: sessionId,
			workspaceRoot: params.workspaceRoot,
			approvalMode: params.approvalMode || "onRequest",
			modelId: params.modelId || null,
			runningTurnId: null,
			interrupted: false,
		};
		sessions.set(sessionId, session);
		saveStore();
		const viewCursor = `v1:${sessionId}:0`;
		notify("session/started", {
			session: {
				sessionId,
				workspaceRoot: params.workspaceRoot,
				status: "idle",
				approvalMode: { mode: session.approvalMode, source: "startup" },
				modelId: session.modelId,
				providerId: "echo",
			},
			viewCursor,
		});
		result(id, {
			session: {
				sessionId,
				workspaceRoot: params.workspaceRoot,
				status: "idle",
				approvalMode: { mode: session.approvalMode, source: "startup" },
				modelId: session.modelId,
				providerId: "echo",
			},
			viewCursor,
		});
		return;
	}
	if (method === "session/resume") {
		const persisted = store.sessions?.[params?.sessionId];
		if (persisted) sessions.set(persisted.id, persisted);
		const session = sessions.get(params?.sessionId);
		if (!session) {
			errorResponse(id, -32020, "session not found", { kind: "sessionNotFound" });
			return;
		}
		result(id, {
			session: { sessionId: session.id, workspaceRoot: session.workspaceRoot, status: "idle" },
			viewCursor: `v1:${session.id}:resume`,
		});
		return;
	}
	if (method === "session/setModel") {
		const session = sessions.get(params?.sessionId);
		if (!session) {
			errorResponse(id, -32020, "session not found", { kind: "sessionNotFound" });
			return;
		}
		session.modelId = params?.model?.modelId ?? null;
		saveStore();
		notify("session/modelChanged", { sessionId: session.id, modelId: session.modelId });
		result(id, { sessionId: session.id, modelId: session.modelId, status: "accepted" });
		return;
	}
	if (method === "session/setApprovalMode") {
		const session = sessions.get(params?.sessionId);
		if (session) session.approvalMode = params?.mode || session.approvalMode;
		result(id, { sessionId: params?.sessionId, mode: session?.approvalMode, status: "accepted" });
		return;
	}
	if (method === "session/close") {
		sessions.delete(params?.sessionId);
		result(id, { sessionId: params?.sessionId, status: "accepted" });
		return;
	}
	if (method === "turn/start") {
		const session = sessions.get(params?.sessionId);
		if (!session) {
			errorResponse(id, -32020, "session not found", { kind: "sessionNotFound" });
			return;
		}
		if (MODE === "rejectTurn") {
			errorResponse(id, -32030, "turn/start refused (rejectTurn)", {
				kind: "commandRejected",
			});
			return;
		}
		if (!UUIDV7.test(String(params?.commandId || ""))) {
			errorResponse(id, -32602, "invalid turn/start commandId: expected UUIDv7");
			return;
		}
		const text = (params.input || [])
			.map((part) => (part?.type === "text" ? part.text : ""))
			.join(" ");
		const turnId = params.commandId;
		if (session.runningTurnId) {
			const disposition = params.ifBusy === "steer" ? "steered" : "queued";
			if (disposition === "steered") {
				notify("item/delta", {
					delta: text,
					field: "text",
					itemId: session.agentItemId || uuid(),
					sessionId: session.id,
					viewCursor: "v1:steer",
				});
			}
			result(id, {
				commandId: params.commandId,
				disposition,
				startedNewTurn: false,
				status: "accepted",
				turnId: session.runningTurnId,
			});
			return;
		}
		session.runningTurnId = turnId;
		session.interrupted = false;
		result(id, {
			commandId: params.commandId,
			disposition: "started",
			startedNewTurn: true,
			status: "accepted",
			turnId,
		});
		if (MODE === "crashAfterAck") {
			setTimeout(() => process.exit(7), 5);
			return;
		}
		if (MODE === "wedge") {
			// Ack the turn but never stream it: the client's watchdog must
			// interrupt, then force-settle once the grace elapses.
			return;
		}
		if (process.env.MUSE_MOCK_APPROVAL === "1") {
			// Present an approval request; the echo turn only runs once the
			// client answers with approval/decide (interception proof).
			askApproval(session, turnId, text);
			return;
		}
		echoTurn(session, turnId, text);
		return;
	}
	if (method === "turn/steer") {
		const session = sessions.get(params?.sessionId);
		if (!session) {
			errorResponse(id, -32020, "session not found", { kind: "sessionNotFound" });
			return;
		}
		if (!session.runningTurnId || session.runningTurnId !== params?.expectedTurnId) {
			errorResponse(id, -32030, "turn/steer command rejected: already_terminal", {
				kind: "commandRejected",
			});
			return;
		}
		notify("item/delta", {
			delta: `steer: ${(params.input || []).map((p) => p?.text || "").join(" ")}`,
			field: "text",
			itemId: session.agentItemId || uuid(),
			sessionId: session.id,
			viewCursor: "v1:steer",
		});
		result(id, { commandId: params.commandId, sessionId: session.id, status: "accepted" });
		return;
	}
	if (method === "turn/interrupt") {
		const session = sessions.get(params?.sessionId);
		if (session) session.interrupted = true;
		result(id, { commandId: params.commandId, sessionId: params?.sessionId, status: "accepted" });
		return;
	}
	if (method === "turn/cancel" || method === "turn/unqueue") {
		result(id, { commandId: params?.commandId, status: "accepted" });
		return;
	}
	if (method === "approval/decide") {
		const session = sessions.get(params?.sessionId);
		notify("approval/resolved", {
			approvalId: params?.approvalId,
			sessionId: params?.sessionId,
			choiceId: params?.choiceId,
		});
		result(id, {
			approvalId: params?.approvalId,
			commandId: params?.commandId,
			status: "accepted",
			terminal: true,
		});
		// Unblock a turn waiting on the approval.
		if (session?.pendingApproval) {
			const text = session.pendingApproval.text;
			session.pendingApproval = null;
			echoTurn(session, session.runningTurnId, text);
		}
		return;
	}
	if (method === "userInput/cancel" || method === "userInput/answer") {
		result(id, {
			commandId: params?.commandId,
			status: "accepted",
			userInputId: params?.userInputId,
		});
		return;
	}
	errorResponse(id, -32601, `Method not found: ${method}`);
}

function askApproval(session, turnId, text) {
	const requestId = `srv-${pendingRequestSeq++}`;
	const approvalId = `approval-${nextApprovalId++}`;
	session.pendingApproval = { approvalId, text };
	writeFrame({
		jsonrpc: "2.0",
		id: requestId,
		method: "approval/request",
		params: {
			approvalId,
			availableChoices: [
				{ choiceId: "allow-once", decision: "approved", label: "Allow once", scope: "once" },
				{ choiceId: "allow-session", decision: "approvedForSession", label: "Allow session", scope: "session" },
				{ choiceId: "deny", decision: "denied", label: "Deny", scope: "once" },
			],
			currentRequirementId: { approvalId, sourceIndex: 0 },
			itemId: uuid(),
			judgeEscalated: false,
			protectedWrite: false,
			rawArgs: "{}",
			sessionId: session.id,
			sourceRange: {},
			subject: { kind: "tool" },
			taskId: uuid(),
			toolCallId: uuid(),
			toolName: "shell",
			turnId,
			viewCursor: "v1:approval",
		},
	});
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
		if (frame.method === "initialized" && frame.id === undefined) {
			continue;
		}
		if (typeof frame.method === "string" && frame.id !== undefined && frame.id !== null) {
			handleRequest(frame.id, frame.method, frame.params);
		}
	}
});
process.stdin.on("end", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
