import { normalizedAgentEvent } from "../../sessionEvents.js";

/**
 * MARK: museEventMapper
 * @description Pure mapping from parsed muse exec-stream rows (see
 *   `museStreamParser.js`) to the engine's normalized agent-event vocabulary
 *   (`api/agent/sessionEvents.js`). This is THE ONLY place in the engine
 *   where raw muse payload_type names are interpreted; every mapped event is
 *   built with `normalizedAgentEvent()` so an invalid name throws at the seam
 *   instead of leaking raw names to the engine.
 *
 *   Mapping table (probe-verified, AUDIT.md section 4.2 — with the two
 *   corrections from findings F-01/F-02):
 *
 *     | muse payload_type          | Normalized      | Payload |
 *     |----------------------------|-----------------|---------|
 *     | run.lifecycle.started      | run_started     | prompt, runFacts? |
 *     | run.model.configured       | session_meta    | model (model_id/display_label), provider |
 *     | run.output.delta           | assistant_delta | delta (+ assistantMessageEvent protocol tag) |
 *     | run.terminal.completed     | run_finished    | status "completed", response (final payload.text) |
 *     | run.terminal.failed        | run_error       | error (payload.reason) |
 *     | task.lifecycle.* (except   | tool_started /  | tool intents (operation "tool:<name>") open a tool; |
 *     |  tool intents/output)      | tool_updated    | output chunks stream as partial results |
 *     | tool.result                | tool_finished   | call result text linked to the open tool |
 *     | task.lifecycle.completed / | harness_log     | one `[muse] task …` line per terminal task |
 *     |  failed                    |                 | (failures included: they fire in success too) |
 *     | task.*, runtime.*,         | (no event)      | ignored by design (F-01): transient lifecycles |
 *     | session.*, turn.*,         |                 | fire many times per run |
 *     | task.lifecycle.tool_output_ref |             | (ref pointer; the output text itself arrives via |
 *     |                            |                 | task.lifecycle.output / tool.result) |
 *     | unknown payload types      | (no event)      | forward tolerance (counted, never thrown) |
 *
 *   The mapper is stateful across one run (one `muse exec` process): it
 *   remembers whether the assistant stream already announced
 *   `message_started`, because the stream emits MANY delta rows per run.
 *   One mapper per process; construct a fresh mapper per run.
 */

/***
 * MARK: createMuseEventMapper
 * @description Builds the per-run mapper from parsed muse rows to normalized
 *   agent events. `map(row)` returns the normalized events the row produces
 *   (an empty array for ignored rows); mapping never throws for unknown
 *   payload types — surprises degrade to "no events" instead of crashes.
 * @example const mapper = createMuseEventMapper();
 * @example mapper.map({ payloadType: "run.output.delta", payload: { text: "hi" } }) => [{ type: "assistant_delta", ... }]
 * @param {Object} [opts] - Optional per-run context.
 * @param {Object} [opts.runFacts] - Spawn facts ({ model, yolo, approvalMode })
 *   merged into the run_started payload so the transcript shows exactly what
 *   this run uses.
 * @returns {Object} The mapper: { map(row), stats() }.
 ***/
/** Extracts `tool_name` from the stringified fact dicts on tool.result payloads. */
function factsToolName(payload) {
	for (const key of ["correlation_facts", "edit_facts"]) {
		const facts = payload?.[key];
		if (typeof facts !== "string") continue;
		const match = facts.match(/'tool_name':\s*'([^']+)'/);
		if (match) return match[1];
	}
	return null;
}

export function createMuseEventMapper({ runFacts } = {}) {
	let announcedMessage = false;
	let ignoredUnknown = 0;
	let ignoredByDesign = 0;
	/** task_id -> { name } for tool tasks whose intent was announced. */
	const openTools = new Map();
	/** The most recently opened (still unfinished) tool, if any. */
	let currentToolId = null;

	function map(row) {
		if (!row || typeof row.payloadType !== "string") {
			ignoredUnknown += 1;
			return [];
		}
		const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
		switch (row.payloadType) {
			case "run.lifecycle.started": {
				const events = [
					normalizedAgentEvent("run_started", {
						model: null,
						...(typeof payload.prompt === "string" ? { prompt: payload.prompt } : {}),
						...(runFacts ? { runFacts: { ...runFacts } } : {}),
					}),
				];
				return events;
			}
			case "run.output.delta": {
				const text = payload.text;
				if (typeof text !== "string" || text.length === 0) return [];
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
			case "run.terminal.completed": {
				const text = typeof payload.text === "string" ? payload.text : "";
				return [
					normalizedAgentEvent("run_finished", {
						status: "completed",
						response: text,
					}),
				];
			}
			case "run.terminal.failed": {
				const reason =
					typeof payload.reason === "string" && payload.reason
						? payload.reason
						: "muse run failed";
				return [normalizedAgentEvent("run_error", { error: reason })];
			}
			case "task.lifecycle.side_effect_intent": {
				const event = payload.event;
				const operation =
					event && typeof event === "object" && typeof event.operation === "string"
						? event.operation
						: "";
				if (!operation.startsWith("tool:")) {
					ignoredByDesign += 1;
					return [];
				}
				const toolName = operation.slice("tool:".length) || "tool";
				const taskId =
					event.task_id || `tool-${openTools.size}`;
				openTools.set(taskId, { name: toolName });
				currentToolId = taskId;
				return [
					normalizedAgentEvent("tool_started", {
						toolName,
						toolCallId: String(taskId),
					}),
				];
			}
			case "task.lifecycle.output": {
				const event = payload.event;
				if (!event || typeof event !== "object") {
					ignoredByDesign += 1;
					return [];
				}
				const taskId = payload.task_id || event.task_id;
				const open = taskId ? openTools.get(taskId) : undefined;
				const chunk = typeof event.chunk === "string" ? event.chunk : "";
				if (!open || !chunk) {
					ignoredByDesign += 1;
					return [];
				}
				// Note: the authoritative finish arrives separately as
				// tool.result — output chunks (final or not) only stream text.
				return [
					normalizedAgentEvent("tool_updated", {
						toolName: open.name,
						toolCallId: String(taskId),
						partialResult: chunk,
					}),
				];
			}
			case "tool.result": {
				const text = typeof payload.text === "string" ? payload.text : "";
				const open = currentToolId ? openTools.get(currentToolId) : undefined;
				if (open) {
					openTools.delete(currentToolId);
					const finishedId = currentToolId;
					currentToolId = null;
					return [
						normalizedAgentEvent("tool_finished", {
							toolName: open.name,
							toolCallId: String(finishedId),
							result: text,
							isError: false,
							error: null,
						}),
					];
				}
				const toolName = factsToolName(payload) || "tool";
				const callId =
					typeof payload.call_id === "string" ? payload.call_id : "unknown";
				return [
					normalizedAgentEvent("tool_finished", {
						toolName,
						toolCallId: String(callId),
						result: text,
						isError: false,
						error: null,
					}),
				];
			}
			case "run.model.configured": {
				const modelId =
					(typeof payload.model_id === "string" && payload.model_id) ||
					(typeof payload.display_label === "string" && payload.display_label) ||
					null;
				if (!modelId) {
					ignoredByDesign += 1;
					return [];
				}
				const provider =
					typeof payload.provider_id === "string" && payload.provider_id
						? payload.provider_id
						: null;
				return [
					normalizedAgentEvent("session_meta", {
						model: provider ? `${provider}/${modelId}` : modelId,
					}),
				];
			}
			case "task.lifecycle.completed":
			case "task.lifecycle.failed": {
				const event = payload.event;
				const kind =
					event && typeof event === "object" && typeof event.kind === "string"
						? event.kind
						: row.payloadType === "task.lifecycle.failed"
							? "failed"
							: "completed";
				const taskId =
					event && typeof event === "object" && typeof event.task_id === "string"
						? event.task_id.slice(0, 8)
						: null;
				return [
					normalizedAgentEvent("harness_log", {
						text: `[muse] task ${kind}${taskId ? ` (${taskId})` : ""}`,
						tag: "[muse]",
					}),
				];
			}
			case "runtime.command.accepted":
			case "session.run.linked":
			case "turn.input.user":
			case "task.stream.linked":
			case "task.lifecycle.proposed":
			case "task.lifecycle.accepted":
			case "task.lifecycle.scheduled":
			case "task.lifecycle.started":
			case "task.lifecycle.cancelled":
			case "task.lifecycle.status":
			case "task.lifecycle.tool_output_ref": {
				ignoredByDesign += 1;
				return [];
			}
			default: {
				ignoredUnknown += 1;
				return [];
			}
		}
	}

	function stats() {
		return { ignoredUnknown, ignoredByDesign };
	}

	return { map, stats };
}
