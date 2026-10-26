import { normalizedAgentEvent, isNormalizedAgentEvent } from "../../sessionEvents.js";

/**
 * MARK: opencodeSessionEvents
 * @description Pure translation from raw Opencode server SSE events to the
 *   engine's normalized agent-event vocabulary (`api/agent/sessionEvents.js`).
 *   This is THE ONLY place in the engine where raw Opencode event names are
 *   known.
 *
 *   An Opencode SSE event is `{ type: "message.part.updated", properties: {...} }`
 *   (see `@opencode-ai/sdk` `Event` union). The translation maps the subset the
 *   engine needs onto the normalized vocabulary and returns `null` for events
 *   the engine has no use for (session bookkeeping, permissions, todos, …) —
 *   raw names never leak past the harness boundary.
 *
 *   | Normalized       | Opencode source event(s)                              |
 *   |------------------|-------------------------------------------------------|
 *   | run_started      | session.status (busy)                                 |
 *   | message_started  | message.updated (assistant message, still streaming)  |
 *   | assistant_delta  | message.part.updated (text delta)                     |
 *   |                  | message.part.updated (reasoning delta → thinking)     |
 *   | tool_started     | message.part.updated (tool part, pending/running)     |
 *   | tool_updated     | message.part.updated (tool part, running + output)    |
 *   | tool_finished    | message.part.updated (tool part, completed/error)     |
 *   | usage_updated    | message.part.updated (step-finish part: tokens+cost)  |
 *   |                  | message.updated (completed assistant message)         |
 *   | permission_req.  | permission.updated                                    |
 *   | permission_res.  | permission.replied                                    |
 *   | run_finished     | session.idle                                          |
 *   | run_error        | session.error                                         |
 */

/***
 * MARK: OPENCODE_EVENT_TO_NORMALIZED
 * @description The direct rename table from raw Opencode event names to
 *   normalized agent-event names. Events needing payload shaping (parts,
 *   tool state) are handled in `translateOpencodeEvent`; this table covers the
 *   one-to-one renames.
 ***/
export const OPENCODE_EVENT_TO_NORMALIZED = Object.freeze(
	new Map([
		["session.idle", "run_finished"],
		["session.error", "run_error"],
	]),
);

/***
 * MARK: translateToolPart
 * @description Translates an Opencode tool part (with its lifecycle state)
 *   into the matching normalized tool event: pending/running parts become
 *   tool_started (running re-emits as tool_updated when output streams),
 *   completed and errored parts become tool_finished with the result/error
 *   fields the engine reads.
 * @example translateToolPart(part) => { type: "tool_started", toolName, toolCallId, args }
 * @param {Object} part - The Opencode tool part (`part.type === "tool"`).
 * @returns {Object|null} The normalized tool event, or null when nothing usable.
 ***/
function translateToolPart(part) {
	const state = part?.state || {};
	const shared = {
		toolName: part.tool,
		toolCallId: part.callID,
	};
	switch (state.status) {
		case "pending":
		case "running":
			return normalizedAgentEvent("tool_started", {
				...shared,
				args: state.input,
			});
		case "completed":
			return normalizedAgentEvent("tool_finished", {
				...shared,
				args: state.input,
				result: state.output,
				isError: false,
			});
		case "error":
			return normalizedAgentEvent("tool_finished", {
				...shared,
				args: state.input,
				result: state.output ?? state.error,
				isError: true,
				error: state.error,
			});
		default:
			return null;
	}
}

/***
 * MARK: translateMessagePartUpdated
 * @description Translates one `message.part.updated` event into the normalized
 *   vocabulary: text deltas become assistant_delta (pi-ai text_delta protocol),
 *   reasoning deltas become thinking_delta assistant deltas, and tool parts
 *   become the tool lifecycle events. Part snapshots without a delta only
 *   produce a text_end marker (so the log streamer can close its text block);
 *   everything else is declined.
 * @example translateMessagePartUpdated({ part: { type: "text", text: "hi" }, delta: "hi" }) => { type: "assistant_delta", ... }
 * @param {Object} properties - The event's `properties` payload.
 * @returns {Object|null} The normalized event, or null when not translatable.
 ***/
function translateMessagePartUpdated(properties) {
	const part = properties?.part;
	if (!part || typeof part !== "object") return null;

	if (part.type === "text" || part.type === "reasoning") {
		const delta = typeof properties.delta === "string" ? properties.delta : "";
		if (delta) {
			return normalizedAgentEvent("assistant_delta", {
				delta,
				// The engine's log streamer routes on the pi-ai AssistantMessageEvent
				// protocol: text deltas buffer into the text block, thinking deltas
				// into the collapsed thinking block.
				assistantMessageEvent: {
					type: part.type === "reasoning" ? "thinking_delta" : "text_delta",
					delta,
				},
			});
		}
		// A full-part snapshot without a delta: signal block completion only
		// when the part actually finished (time.end set); otherwise ignore.
		if (part.time?.end) {
			return normalizedAgentEvent("assistant_delta", {
				assistantMessageEvent: { type: "text_end" },
			});
		}
		return null;
	}

	if (part.type === "tool") {
		return translateToolPart(part);
	}

	if (part.type === "step-finish") {
		return translateStepFinishPart(part);
	}

	return null;
}

/***
 * MARK: toUsageRecord
 * @description Normalizes an Opencode token block (`tokens: {input, output,
 *   reasoning, cache: {read, write}}` on step-finish parts and completed
 *   assistant messages) into the unified usage payload. Totals derive from
 *   input+output; cache read+write ride as cachedTokens; cost rides as
 *   costUsd. Returns null when the block carries no counters.
 ***/
function toUsageRecord(tokens, cost) {
	if (!tokens || typeof tokens !== "object") return null;
	const pick = (value) =>
		typeof value === "number" && Number.isFinite(value) ? value : null;
	const input = pick(tokens.input);
	const output = pick(tokens.output);
	const cacheRead = pick(tokens.cache?.read);
	const cacheWrite = pick(tokens.cache?.write);
	const cached =
		cacheRead !== null || cacheWrite !== null
			? (cacheRead ?? 0) + (cacheWrite ?? 0)
			: null;
	const usageCost = pick(cost);
	if (input === null && output === null && cached === null && usageCost === null) {
		return null;
	}
	return {
		inputTokens: input,
		outputTokens: output,
		cachedTokens: cached,
		totalTokens:
			input !== null || output !== null ? (input ?? 0) + (output ?? 0) : null,
		costUsd: usageCost,
	};
}

/***
 * MARK: translateStepFinishPart
 * @description Translates a `step-finish` part (per-step tokens + cost)
 *   into a usage_updated event. Parts without counters are declined.
 ***/
function translateStepFinishPart(part) {
	const usage = toUsageRecord(part.tokens, part.cost);
	if (!usage) return null;
	return normalizedAgentEvent("usage_updated", { usage });
}

/***
 * MARK: translateMessageUpdated
 * @description Translates one `message.updated` event: a still-streaming
 *   assistant message becomes message_started; a COMPLETED assistant message
 *   becomes usage_updated carrying its final token/cost counters and model
 *   (completion itself is still signaled by session.idle — this event only
 *   recovers the telemetry); user-message updates carry no engine meaning
 *   and are declined.
 * @example translateMessageUpdated({ info: { role: "assistant", time: {} } }) => { type: "message_started", ... }
 * @param {Object} properties - The event's `properties` (`{ info: Message }`).
 * @returns {Object|null} The normalized event, or null when not translatable.
 ***/
function translateMessageUpdated(properties) {
	const info = properties?.info;
	if (info?.role !== "assistant") return null;
	if (info.time?.completed) {
		const usage = toUsageRecord(info.tokens, info.cost);
		if (!usage) return null;
		const model =
			typeof info.modelID === "string" && info.modelID
				? `${info.providerID || "opencode"}/${info.modelID}`
				: null;
		return normalizedAgentEvent("usage_updated", { usage, model });
	}
	return normalizedAgentEvent("message_started", { message: info });
}

/***
 * MARK: translatePermissionUpdated
 * @description Translates one `permission.updated` event into a
 *   permission_requested audit event: the permission `type` is the method,
 *   the `pattern` (or human `title`) is the target.
 ***/
function translatePermissionUpdated(properties) {
	if (!properties || typeof properties !== "object") return null;
	const method = typeof properties.type === "string" ? properties.type : null;
	const pattern = Array.isArray(properties.pattern)
		? properties.pattern.join(", ")
		: properties.pattern;
	const target =
		(typeof pattern === "string" && pattern) ||
		(typeof properties.title === "string" && properties.title) ||
		null;
	return normalizedAgentEvent("permission_requested", {
		method,
		target,
		permissionId: properties.id ?? null,
	});
}

/***
 * MARK: translatePermissionReplied
 * @description Translates one `permission.replied` event into a
 *   permission_resolved audit event. The reply carries only the permission
 *   id + response, so the id rides as the target for correlation.
 ***/
function translatePermissionReplied(properties) {
	if (!properties || typeof properties !== "object") return null;
	return normalizedAgentEvent("permission_resolved", {
		method: null,
		target:
			typeof properties.permissionID === "string" ? properties.permissionID : null,
		decision: typeof properties.response === "string" ? properties.response : null,
	});
}

/***
 * MARK: translateSessionStatus
 * @description Translates one `session.status` event: a busy session means an
 *   agent run is active (run_started); retry and idle statuses are declined
 *   (retry is transient — failing the stage on a retriable model hiccup would
 *   be wrong, and idle is signaled by session.idle).
 * @example translateSessionStatus({ status: { type: "busy" } }) => { type: "run_started" }
 * @param {Object} properties - The event's `properties` (`{ sessionID, status }`).
 * @returns {Object|null} The normalized event, or null when not translatable.
 ***/
function translateSessionStatus(properties) {
	if (properties?.status?.type === "busy") {
		return normalizedAgentEvent("run_started");
	}
	return null;
}

/***
 * MARK: translateOpencodeEvent
 * @description Translates one raw Opencode SSE event into a normalized agent
 *   event, or null when the engine has no use for it. Unknown event names and
 *   malformed payloads are declined (null), never passed through — raw
 *   Opencode names must not leak past the harness boundary.
 * @example translateOpencodeEvent({ type: "session.idle", properties: {} }) => { type: "run_finished" }
 * @example translateOpencodeEvent({ type: "permission.updated", properties: {} }) => null
 * @example translateOpencodeEvent(null) => null
 * @param {Object|null} raw - The raw Opencode SSE event `{ type, properties }`.
 * @returns {Object|null} The normalized event, or null.
 ***/
export function translateOpencodeEvent(raw) {
	if (!raw || typeof raw !== "object" || typeof raw.type !== "string") {
		return null;
	}

	const properties = raw.properties ?? {};

	switch (raw.type) {
		case "message.updated":
			return translateMessageUpdated(properties);
		case "message.part.updated":
			return translateMessagePartUpdated(properties);
		case "session.status":
			return translateSessionStatus(properties);
		case "permission.updated":
			return translatePermissionUpdated(properties);
		case "permission.replied":
			return translatePermissionReplied(properties);
		default: {
			const normalizedName = OPENCODE_EVENT_TO_NORMALIZED.get(raw.type);
			if (!normalizedName) return null;
			return normalizedAgentEvent(normalizedName, properties);
		}
	}
}

/***
 * MARK: isNormalizedAgentEvent (re-exported for harness-local use)
 * @description Re-exported so the session wrapper can assert its emitted
 *   stream stays inside the normalized vocabulary without importing from the
 *   engine again.
 ***/
export { isNormalizedAgentEvent };