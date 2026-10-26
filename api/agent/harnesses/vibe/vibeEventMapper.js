import { normalizedAgentEvent } from "../../sessionEvents.js";
import { VIBE_ASSISTANT_TEXT_KINDS } from "./vibeStreamParser.js";

/**
 * MARK: vibeEventMapper
 * @description Pure mapping from parsed vibe streaming rows (see
 *   `vibeStreamParser.js`) to the engine's normalized agent-event vocabulary
 *   (`api/agent/sessionEvents.js`). This is THE ONLY place in the engine
 *   where raw vibe row shapes are interpreted; every mapped event is built
 *   with `normalizedAgentEvent()` so an invalid name throws at the seam
 *   instead of leaking raw names to the engine.
 *
 *   Mapping table (probe-verified 2026-10-12, seeds in `fixtures/`):
 *
 *     | vibe row                  | Normalized      | Payload |
 *     |---------------------------|-----------------|---------|
 *     | message / role assistant  | message_started (once) + assistant_delta | joined `content[]` text (+ assistantMessageEvent protocol tag) |
 *     | message / role user       | (no event)      | prompt echo (`source: "turn_start"`) — ignored by design |
 *     | effect (tool executed)    | tool_started + tool_finished | `detail.toolName` (fallback `title`), `state.outputText` result; non-`completed` states finish with `isError: true` |
 *     | reasoning                 | reasoning_delta | `text` (fallback: joined `content[]` text) — streams into the thinking lane |
 *     | unknown row types         | (no event)      | forward tolerance (counted, never thrown) |
 *
 *   Cost/usage/stop-reason do NOT flow through this mapper: they arrive
 *   after exit via `--output-dir/export.json` (see `readVibeExport` in
 *   `vibePermissions.js`) and are surfaced as run-log summary lines by
 *   `vibeHarness.js`.
 *
 *   The mapper is stateful across one run (one `vibe --prompt` process): it
 *   remembers whether the assistant stream already announced
 *   `message_started` (vibe emits one row per message, but a run may hold
 *   several), and which tool effects are still open. One mapper per
 *   process; construct a fresh mapper per run.
 */

const TEXT_KINDS = new Set(VIBE_ASSISTANT_TEXT_KINDS);

/***
 * MARK: vibeAssistantText
 * @description Extracts the visible answer text from an assistant `message`
 *   row: the joined `text` of `content[]` blocks whose block `type` is a
 *   known text kind. Non-text blocks (attachments, tool payloads) are
 *   skipped — they are not user-visible prose.
 * @example vibeAssistantText({ content: [{ type: "text", text: "hi" }] }) => "hi"
 * @param {Object} row - The parsed vibe row.
 * @returns {string} The joined text ("" when the row carries none).
 ***/
export function vibeAssistantText(row) {
	const blocks = Array.isArray(row?.content) ? row.content : [];
	let text = "";
	for (const block of blocks) {
		if (!block || typeof block !== "object") continue;
		if (!TEXT_KINDS.has(block.type)) continue;
		if (typeof block.text === "string") text += block.text;
	}
	return text;
}

/***
 * MARK: vibeToolInfo
 * @description Extracts the tool identity + result from an `effect` row:
 *   the name (`detail.toolName`, falling back to the display `title`) and
 *   the settled output text (`state.outputText`, falling back to
 *   `state.output.stdout`).
 * @example vibeToolInfo({ title: "t", detail: { toolName: "n" }, state: { status: "completed", outputText: "ok" } })
 * @param {Object} row - The parsed vibe row.
 * @returns {Object} { name, callId, resultText, status, succeeded }.
 ***/
export function vibeToolInfo(row) {
	const detail =
		row?.detail && typeof row.detail === "object" ? row.detail : {};
	const state = row?.state && typeof row.state === "object" ? row.state : {};
	const name =
		(typeof detail.toolName === "string" && detail.toolName) ||
		(typeof row?.title === "string" && row.title) ||
		"tool";
	const output =
		state.output && typeof state.output === "object" ? state.output : {};
	const resultText =
		(typeof state.outputText === "string" && state.outputText) ||
		(typeof output.stdout === "string" && output.stdout) ||
		(typeof output.output === "string" && output.output) ||
		"";
	const status = typeof state.status === "string" ? state.status : "completed";
	return {
		name,
		callId: typeof row?.id === "string" && row.id ? row.id : "unknown",
		resultText,
		status,
		succeeded: status === "completed",
	};
}

/***
 * MARK: createVibeEventMapper
 * @description Builds the per-run mapper from parsed vibe rows to
 *   normalized agent events. `map(row)` returns the normalized events the
 *   row produces (an empty array for ignored rows); mapping never throws
 *   for unknown row types — surprises degrade to "no events" instead of
 *   crashes.
 * @example const mapper = createVibeEventMapper();
 * @example mapper.map({ rowType: "message", role: "assistant", content: [{ type: "text", text: "hi" }] }) => [{ type: "assistant_delta", … }]
 * @param {Object} [opts] - Optional per-run context.
 * @param {Object} [opts.runFacts] - Spawn facts ({ autoApprove, agent })
 *   merged into the run_started payload so the transcript shows
 *   exactly what this run uses.
 * @returns {Object} The mapper: { map(row), stats() }.
 ***/
export function createVibeEventMapper({ runFacts } = {}) {
	let announcedMessage = false;
	let ignoredUnknown = 0;
	let ignoredByDesign = 0;
	/** effect row id -> { name } for tool effects announced but unsettled. */
	const openTools = new Map();

	function startRun() {
		return [
			normalizedAgentEvent("run_started", {
				model: null,
				...(runFacts ? { runFacts: { ...runFacts } } : {}),
			}),
		];
	}

	function mapAssistant(row) {
		const text = vibeAssistantText(row);
		if (!text) {
			ignoredByDesign += 1;
			return [];
		}
		const events = [];
		if (!announcedMessage) {
			announcedMessage = true;
			events.push(
				normalizedAgentEvent("message_started", {
					message: { role: "assistant" },
				}),
			);
		}
		events.push(
			normalizedAgentEvent("assistant_delta", {
				delta: text,
				assistantMessageEvent: { type: "text_delta", delta: text },
			}),
		);
		return events;
	}

	function mapEffect(row) {
		const info = vibeToolInfo(row);
		const events = [];
		if (!openTools.has(info.callId)) {
			openTools.set(info.callId, { name: info.name });
			events.push(
				normalizedAgentEvent("tool_started", {
					toolName: info.name,
					toolCallId: String(info.callId),
				}),
			);
		}
		// Vibe streams one settled `effect` row per tool call (probe: a
		// single `completed` row carrying the full output). A non-terminal
		// state (no settled output yet) leaves the tool open; the settled
		// row — or run end — closes it.
		const terminal = info.status === "completed" || info.status === "failed";
		if (!terminal) return events;
		openTools.delete(info.callId);
		events.push(
			normalizedAgentEvent("tool_finished", {
				toolName: info.name,
				toolCallId: String(info.callId),
				result: info.resultText,
				isError: !info.succeeded,
				error: info.succeeded ? null : info.resultText || `tool ${info.name} ${info.status}`,
			}),
		);
		return events;
	}

	function mapReasoning(row) {
		// Reasoning rows carry the model's chain-of-thought in `text`
		// (falling back to joined `content[]` text blocks). The delta
		// streams into the engine's thinking lane, where it renders
		// collapsed by default — never dropped, never in the narrative.
		let delta = typeof row?.text === "string" ? row.text : "";
		if (!delta) delta = vibeAssistantText(row);
		if (!delta) {
			ignoredByDesign += 1;
			return [];
		}
		return [normalizedAgentEvent("reasoning_delta", { delta })];
	}

	function map(row) {
		if (!row || typeof row.rowType !== "string") {
			ignoredUnknown += 1;
			return [];
		}
		switch (row.rowType) {
			case "message": {
				if (row.role === "assistant") return mapAssistant(row);
				// The user-role row echoes the prompt (`source:
				// "turn_start"): the harness already knows the prompt.
				ignoredByDesign += 1;
				return [];
			}
			case "effect": {
				return mapEffect(row);
			}
			case "reasoning": {
				return mapReasoning(row);
			}
			default: {
				ignoredUnknown += 1;
				return [];
			}
		}
	}

	function stats() {
		return { ignoredUnknown, ignoredByDesign, openTools: openTools.size };
	}

	return { map, stats, startRun };
}
