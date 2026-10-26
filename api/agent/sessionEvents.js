/**
 * MARK: sessionEvents
 * @description The engine's own agent-event vocabulary. Every harness session
 *   must deliver events in THIS vocabulary to its subscribers — raw harness
 *   event names never leak past the harness boundary (the raw → normalized
 *   translation for the pi harness lives in `api/agent/harnesses/pi/`).
 *
 *   The vocabulary is a one-to-one rename of the exact events the engine
 *   consumed from pi — nothing added, nothing dropped:
 *
 *     | Normalized       | pi source event(s)                          |
 *     |------------------|---------------------------------------------|
 *     | run_started      | agent_start, turn_start                     |
 *     | assistant_delta  | message_update                              |
 *     | message_started  | message_start (assistant messages only)     |
 *     | tool_started     | tool_execution_start                        |
 *     | tool_updated     | tool_execution_update                       |
 *     | tool_finished    | tool_execution_end                          |
 *     | run_finished     | agent_end, agent_settled, turn_end          |
 *     | run_error        | error, agent_error                          |
 *
 *   The unified log platform adds a second, additive vocabulary for data the
 *   original 8 names could not carry (telemetry, permissions, plans,
 *   reasoning, harness-internal prose). Mappers emit these names; the log
 *   processor (`api/agent/logStream/logProcessor.js`) turns them into
 *   canonical records. Old sessions stay valid — the original 8 names are
 *   unchanged.
 *
 *     | Normalized           | Payload the processor reads                     |
 *     |----------------------|-----------------------------------------------|
 *     | usage_updated        | usage {inputTokens,…}, model?                   |
 *     | session_meta         | model?, effort?, sandbox?, permissions?,        |
 *     |                      | conversationId?, runFacts?                     |
 *     | permission_requested | method?, target?                               |
 *     | permission_resolved  | method?, target?, decision?                    |
 *     | plan_updated         | steps[]                                        |
 *     | reasoning_delta      | delta                                          |
 *     | harness_log          | text, tag?                                     |
 *
 *   A normalized event is a plain object whose `type` field carries the
 *   normalized name and whose remaining fields carry the payload the engine
 *   reads (delta, toolName, toolCallId, args, result, isError, error, …).
 */

/***
 * MARK: AGENT_EVENT_NAMES
 * @description The exhaustive set of normalized agent-event names a harness
 *   session may deliver to its subscribers.
 ***/
export const AGENT_EVENT_NAMES = Object.freeze([
	"run_started",
	"assistant_delta",
	"message_started",
	"tool_started",
	"tool_updated",
	"tool_finished",
	"run_finished",
	"run_error",
	// Unified log platform (additive): telemetry, session metadata,
	// permission audit, plan steps, reasoning deltas, harness-internal prose.
	"usage_updated",
	"session_meta",
	"permission_requested",
	"permission_resolved",
	"plan_updated",
	"reasoning_delta",
	"harness_log",
]);

const KNOWN_AGENT_EVENTS = new Set(AGENT_EVENT_NAMES);

/***
 * MARK: isNormalizedAgentEvent
 * @description Whether an event name belongs to the engine's normalized
 *   agent-event vocabulary (as opposed to a raw harness event or an
 *   engine-owned event like process:stdout).
 * @example isNormalizedAgentEvent("assistant_delta") => true
 * @example isNormalizedAgentEvent("message_update") => false
 * @param {string} name
 * @returns {boolean}
 ***/
export function isNormalizedAgentEvent(name) {
	return KNOWN_AGENT_EVENTS.has(name);
}

/***
 * MARK: normalizedAgentEvent
 * @description Builds a normalized agent event object from a normalized name
 *   and its payload. The name becomes the event's `type` discriminator (the
 *   shape the engine has always consumed); payload fields are spread on top.
 * @example normalizedAgentEvent("assistant_delta", { delta: "hi" }) => { type: "assistant_delta", delta: "hi" }
 * @param {string} name - A name from AGENT_EVENT_NAMES.
 * @param {Object} [payload] - Payload fields the engine reads.
 * @returns {Object} The normalized event object.
 ***/
export function normalizedAgentEvent(name, payload = {}) {
	if (!isNormalizedAgentEvent(name)) {
		throw new Error(
			`'${name}' is not a normalized agent event name (see AGENT_EVENT_NAMES)`,
		);
	}
	const { type: _discarded, ...rest } = payload || {};
	return { type: name, ...rest };
}