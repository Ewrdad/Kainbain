import { normalizedAgentEvent } from "../../sessionEvents.js";

/**
 * MARK: AcpEventMapper
 * @description Pure mapping from ACP `session/update` notifications to the
 *   engine's normalized agent-event vocabulary
 *   (`api/agent/sessionEvents.js`). This is the ONLY place in the generic ACP
 *   core where agent wire discriminators are interpreted; every mapped event
 *   is built with `normalizedAgentEvent()` so an invalid name throws at the
 *   seam instead of leaking wire names to the engine.
 *
 *   Mapping table:
 *
 *     | ACP sessionUpdate        | Normalized      | Payload |
 *     |--------------------------|-----------------|---------|
 *     | agent_message_chunk      | message_started | message: { role: "assistant" } (first chunk of the turn) |
 *     | agent_message_chunk      | assistant_delta | delta (+ assistantMessageEvent protocol tag) |
 *     | tool_call (kind start)   | tool_started    | toolName, toolCallId, args |
 *     | tool_call (kind update)   | tool_updated    | toolName, toolCallId, partialResult |
 *     | tool_call (kind end)      | tool_finished   | toolName, toolCallId, result, isError, error |
 *     | plan                     | message_started | message: { role: "assistant" } (once per turn) |
 *     | usage_update             | (no event)      | telemetry via `extractUsage()` (the wrapper's log/usage hook) |
 *     | anything else            | (no event)      | ignored by design (forward tolerance) |
 *
 *   Turn completion (`session/prompt` resolving) is mapped separately via
 *   `mapPromptResult`: `end_turn`/`cancelled` settle as `run_finished`
 *   (cancelled carries `interrupted: true`); any other stop reason is a
 *   `run_error` so a silent model-side failure can never read as success.
 *
 *   The mapper is stateful across one turn (one `session/prompt` call): it
 *   remembers whether the turn already announced `message_started`, because
 *   the agent streams MANY chunk notifications per turn. Construct a fresh
 *   mapper (or call `resetTurn()`) per turn.
 */

/***
 * MARK: stringifyAcpOutput
 * @description Flattens a tool output payload to the plain string the engine
 *   reads in tool_updated.partialResult / tool_finished.result.
 * @param {string|Object|undefined} output - The raw tool output.
 * @returns {string} The output text ("" when absent).
 ***/
function stringifyAcpOutput(output) {
	if (output === undefined || output === null) return "";
	if (typeof output === "string") return output;
	try {
		return JSON.stringify(output);
	} catch {
		return String(output);
	}
}

/***
 * MARK: createAcpEventMapper
 * @description Builds the per-turn mapper from ACP notifications to
 *   normalized agent events.
 * @example const mapper = createAcpEventMapper(); mapper.mapUpdate({ update: { sessionUpdate: "plan" } }) => [message_started event]
 * @returns {Object} The mapper: { mapUpdate(notification), mapPromptResult(response), resetTurn() }.
 ***/
export function createAcpEventMapper() {
	let announcedMessage = false;

	function ensureMessageStarted() {
		if (announcedMessage) return [];
		announcedMessage = true;
		return [normalizedAgentEvent("message_started", { message: { role: "assistant" } })];
	}

	function mapChunk(update) {
		const events = [...ensureMessageStarted()];
		const content = update?.content;
		const text =
			typeof content === "string"
				? content
				: typeof content?.text === "string"
					? content.text
					: null;
		if (typeof text === "string" && text.length > 0) {
			events.push(
				normalizedAgentEvent("assistant_delta", {
					delta: text,
					assistantMessageEvent: { type: "text_delta", delta: text },
				}),
			);
		}
		return events;
	}

	function mapToolCall(update) {
		const toolCallId = String(update?.toolCallId ?? update?.id ?? "unknown");
		const toolName = typeof update?.title === "string" && update.title
			? update.title
			: typeof update?.name === "string" && update.name
				? update.name
				: "tool";
		const kind = typeof update?.kind === "string" ? update.kind : "start";
		if (kind === "end") {
			const error = update?.error ?? null;
			return [
				normalizedAgentEvent("tool_finished", {
					toolName,
					toolCallId,
					result: stringifyAcpOutput(update?.output ?? update?.content),
					isError: Boolean(error),
					error: typeof error?.message === "string" ? error.message : (error ?? null),
				}),
			];
		}
		if (kind === "update") {
			return [
				normalizedAgentEvent("tool_updated", {
					toolName,
					toolCallId,
					partialResult: stringifyAcpOutput(update?.output ?? update?.content),
				}),
			];
		}
		return [
			normalizedAgentEvent("tool_started", {
				toolName,
				toolCallId,
				args: update?.input ?? update?.args ?? {},
			}),
		];
	}

	return {
		/***
		 * MARK: resetTurn
		 * @description Clears the per-turn message_started latch so the next
		 *   `session/prompt` announces its assistant block fresh.
		 ***/
		resetTurn() {
			announcedMessage = false;
		},

		/***
		 * MARK: mapUpdate
		 * @description Maps one ACP `session/update` notification to zero or
		 *   more normalized agent events. Unknown update kinds are ignored by
		 *   design (forward tolerance) — mapping never throws on data.
		 * @param {Object} notification - The `session/update` params (`{ sessionId, update }`).
		 * @returns {Array<Object>} The normalized agent events for this update.
		 ***/
		mapUpdate(notification) {
			const update = notification?.update;
			if (!update || typeof update !== "object") return [];
			const kind = update.sessionUpdate ?? update.kind;
			if (kind === "agent_message_chunk") return mapChunk(update);
			if (kind === "tool_call") return mapToolCall(update);
			if (kind === "plan") return ensureMessageStarted();
			return [];
		},

		/***
		 * MARK: extractUsage
		 * @description Maps one ACP `usage_update` notification payload to the
		 *   vendor-neutral usage/telemetry record the wrapper logs and hands
		 *   to its `onUsage` hook: context-window use, cost, and per-turn
		 *   token counters. Agents vary in which counters they populate, so
		 *   every field is optional (undefined when the agent did not send
		 *   it) and unknown shapes return null (forward tolerance) — the
		 *   same rule the event mapping follows.
		 * @example mapper.extractUsage({ sessionUpdate: "usage_update", used: 10, size: 100 }) => { contextTokensUsed: 10, contextWindowSize: 100, … }
		 * @param {Object} update - The `session/update`'s `update` payload.
		 * @returns {Object|null} The normalized usage record, or null when the update is not a usage_update.
		 ***/
		extractUsage(update) {
			if (!update || typeof update !== "object") return null;
			if ((update.sessionUpdate ?? update.kind) !== "usage_update") return null;
			const meta = update._meta && typeof update._meta === "object" ? update._meta : {};
			const numberOrNull = (value) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
			const record = {
				contextTokensUsed: numberOrNull(update.used),
				contextWindowSize: numberOrNull(update.size),
				costUsd: numberOrNull(update.cost?.amount),
				steps: numberOrNull(meta.steps),
				promptTokens: numberOrNull(meta.promptTokens),
				completionTokens: numberOrNull(meta.completionTokens),
				cachedTokens: numberOrNull(meta.cachedTokens),
				totalTokens: numberOrNull(meta.totalTokens),
				tokensPerSecond: numberOrNull(meta.tokensPerSecond),
				lastTurnDuration: numberOrNull(meta.lastTurnDuration),
				lastTurnTotalTokens: numberOrNull(meta.lastTurnTotalTokens),
			};
			// An agent that names `usage_update` but ships no usable counter
			// is a shape we do not understand yet — ignore it entirely.
			return Object.values(record).some((value) => value !== undefined) ? record : null;
		},

		/***
		 * MARK: mapPromptResult
		 * @description Maps one `session/prompt` response to its terminal
		 *   normalized event: `end_turn` (and graceful `cancelled`) settle as
		 *   `run_finished`; anything else is a `run_error`.
		 * @param {Object} response - The prompt response (`{ stopReason }`).
		 * @returns {Array<Object>} Exactly one terminal event.
		 ***/
		mapPromptResult(response) {
			const stopReason =
				typeof response?.stopReason === "string" ? response.stopReason : "end_turn";
			if (stopReason === "end_turn") {
				return [normalizedAgentEvent("run_finished", { status: "end_turn", stopReason })];
			}
			if (stopReason === "cancelled") {
				return [
					normalizedAgentEvent("run_finished", {
						status: "cancelled",
						stopReason,
						interrupted: true,
					}),
				];
			}
			return [
				normalizedAgentEvent("run_error", {
					error: `ACP turn stopped unexpectedly (stopReason: ${stopReason})`,
					stopReason,
				}),
			];
		},
	};
}
