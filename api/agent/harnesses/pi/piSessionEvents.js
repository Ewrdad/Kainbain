import { normalizedAgentEvent, isNormalizedAgentEvent } from "../../sessionEvents.js";

/**
 * MARK: piSessionEvents
 * @description Pure translation from raw pi agent events to the engine's
 *   normalized agent-event vocabulary (`api/agent/sessionEvents.js`). This is
 *   THE ONLY place in the engine where raw pi event names are known.
 *
 *   The translation is a one-to-one rename: every payload field the engine
 *   reads (delta, assistantMessageEvent, toolName, toolCallId, args, result,
 *   isError, error, message, …) is preserved untouched. Events whose name is
 *   already normalized pass through; unknown events pass through unchanged so
 *   the engine ignores them exactly as it does today — translation never
 *   invents or drops behavior.
 */

/***
 * MARK: PI_EVENT_TO_NORMALIZED
 * @description The one-to-one rename table from raw pi event names to
 *   normalized agent-event names.
 ***/
export const PI_EVENT_TO_NORMALIZED = Object.freeze(
	new Map([
		["agent_start", "run_started"],
		["turn_start", "run_started"],
		["message_update", "assistant_delta"],
		["message_start", "message_started"],
		["tool_execution_start", "tool_started"],
		["tool_execution_update", "tool_updated"],
		["tool_execution_end", "tool_finished"],
		["agent_end", "run_finished"],
		["agent_settled", "run_finished"],
		["turn_end", "run_finished"],
		["error", "run_error"],
		["agent_error", "run_error"],
	]),
);

/***
 * MARK: translatePiEvent
 * @description Translates one raw pi event into a normalized agent event.
 *   Already-normalized and unknown events pass through unchanged (same object
 *   semantics: unknown events keep their raw type so downstream consumers
 *   ignore them, exactly as before this boundary existed).
 * @example translatePiEvent({ type: "message_update", delta: "hi" }) => { type: "assistant_delta", delta: "hi" }
 * @example translatePiEvent({ type: "process:start" }) => { type: "process:start" }
 * @example translatePiEvent(null) => null
 * @param {Object|null} raw - The raw event from pi's session.subscribe.
 * @returns {Object|null} The normalized event, or the raw event when no rename applies.
 ***/
export function translatePiEvent(raw) {
	if (!raw || typeof raw !== "object") return raw;
	const rawName = raw.type;
	if (typeof rawName !== "string") return raw;

	// Already normalized — pass through so double-wrapping is a no-op.
	if (isNormalizedAgentEvent(rawName)) return raw;

	const normalizedName = PI_EVENT_TO_NORMALIZED.get(rawName);
	if (!normalizedName) return raw;

	return normalizedAgentEvent(normalizedName, raw);
}