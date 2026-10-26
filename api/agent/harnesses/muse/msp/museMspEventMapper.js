import { normalizedAgentEvent } from "../../../sessionEvents.js";

/**
 * MARK: museMspEventMapper
 * @description Pure mapping from MSP host notifications to the engine's
 *   normalized agent-event vocabulary (`api/agent/sessionEvents.js`). This is
 *   THE ONLY place in the engine where raw MSP notification names are
 *   interpreted; every mapped event is built with `normalizedAgentEvent()` so
 *   an invalid name throws at the seam instead of leaking raw names.
 *
 *   Mapping table (probe-verified against muse 1.4.9, echo provider):
 *
 *     | MSP notification           | Normalized      | Notes |
 *     |----------------------------|-----------------|-------|
 *     | turn/started               | run_started     | model + submitted prompt |
 *     | item/started (agentMessage)| message_started | once per item |
 *     | item/delta field "text"    | assistant_delta | agentMessage → text_delta, |
 *     |   (or absent — SS4.3.1)    |                 | reasoning → thinking_delta |
 *     | item/delta field "output"  | tool_updated    | toolCall partial result |
 *     | item/started (toolCall)    | tool_started    | tool + callId |
 *     | item/completed (toolCall)  | tool_finished   | visibleOutput + failure; |
 *     |                            |                 | any terminal status other |
 *     |                            |                 | than inProgress/completed |
 *     |                            |                 | (or a failureReason) isError |
 *     | item/completed (agentMsg)  | (no event)      | authoritative response text |
 *     | turn/completed completed   | run_finished    | status "completed", response |
 *     | turn/completed failed      | run_error       | error.message / reason |
 *     | turn/completed cancelled   | run_finished    | status "aborted", interrupted |
 *     | reminderChild / userMessage| (no event)      | echo noise / prompt echo |
 *     | session/tokenUsage         | (telemetry)     | token counters |
 *     | session/contextUsage       | (telemetry)     | context window pressure |
 *     | everything else            | (no event)      | forward tolerance (counted) |
 *
 *   The mapper is stateful across ONE session (one host connection): it
 *   remembers open items and the announced assistant message, because the
 *   stream emits many delta rows per turn. One mapper per session.
 */

/***
 * MARK: createMuseMspEventMapper
 * @description Builds the per-session mapper from MSP notifications to
 *   normalized agent events. `map(method, params)` returns the events the
 *   notification produces (empty for ignored rows); mapping never throws for
 *   unknown notification names — surprises degrade to "no events".
 * @example const mapper = createMuseMspEventMapper();
 * @example mapper.map("item/delta", { itemId, delta: "hi", field: "text" }) => [{ type: "assistant_delta", … }]
 * @param {Object} [opts]
 * @param {Object} [opts.runFacts] - Spawn facts merged into run_started.
 * @returns {Object} The mapper: { map, beginTurn, getUsage, stats }.
 ***/
export function createMuseMspEventMapper({ runFacts } = {}) {
	let announcedMessage = false;
	let ignoredUnknown = 0;
	let ignoredByDesign = 0;
	let lastResponseText = "";
	let activeTurnId = null;
	let submittedPrompt = "";
	/** itemId -> { kind, toolName, toolCallId } for items we are tracking. */
	const openItems = new Map();
	let tokenUsage = null;
	let contextUsage = null;

	function map(method, params) {
		if (typeof method !== "string") {
			ignoredUnknown += 1;
			return [];
		}
		const payload = params && typeof params === "object" ? params : {};
		switch (method) {
			case "turn/started": {
				activeTurnId = typeof payload.turnId === "string" ? payload.turnId : null;
				lastResponseText = "";
				announcedMessage = false;
				const events = [
					normalizedAgentEvent("run_started", {
						model: runFacts?.model ?? null,
						...(submittedPrompt ? { prompt: submittedPrompt } : {}),
						...(runFacts ? { runFacts: { ...runFacts } } : {}),
					}),
				];
				return events;
			}
			case "item/started": {
				const item = payload.item && typeof payload.item === "object" ? payload.item : {};
				if (item.kind === "agentMessage") {
					openItems.set(String(item.itemId ?? ""), { kind: "agentMessage" });
					if (announcedMessage) return [];
					announcedMessage = true;
					return [
						normalizedAgentEvent("message_started", {
							message: { role: "assistant" },
						}),
					];
				}
				if (item.kind === "toolCall") {
					const toolName =
						typeof item.tool === "string" && item.tool ? item.tool : "tool";
					const toolCallId = String(item.callId || item.itemId || "unknown");
					openItems.set(String(item.itemId ?? ""), {
						kind: "toolCall",
						toolName,
						toolCallId,
					});
					return [
						normalizedAgentEvent("tool_started", {
							toolName,
							toolCallId,
							...(typeof item.args === "string" ? { args: item.args } : {}),
						}),
					];
				}
				// reminderChild / userMessage / reasoning / subagent opens are noise.
				openItems.set(String(item.itemId ?? ""), { kind: String(item.kind ?? "unknown") });
				ignoredByDesign += 1;
				return [];
			}
			case "item/delta": {
				const text = typeof payload.delta === "string" ? payload.delta : "";
				if (!text) return [];
				// `field` is a dotted path into the item; absent means "text"
				// (schema SS4.3.1). Only the documented stream fields map — a
				// delta on any other field is not assistant/tool output.
				const field = typeof payload.field === "string" ? payload.field : "text";
				const entry = openItems.get(String(payload.itemId ?? ""));
				if (entry?.kind === "agentMessage" && field === "text") {
					return [
						normalizedAgentEvent("assistant_delta", {
							delta: text,
							assistantMessageEvent: { type: "text_delta", delta: text },
						}),
					];
				}
				if (entry?.kind === "reasoning" && field === "text") {
					return [
						normalizedAgentEvent("assistant_delta", {
							delta: text,
							assistantMessageEvent: { type: "thinking_delta", delta: text },
						}),
					];
				}
				// `visibleOutput` streams via the "output" field (schema SS4.5.4).
				if (entry?.kind === "toolCall" && field === "output") {
					return [
						normalizedAgentEvent("tool_updated", {
							toolName: entry.toolName,
							toolCallId: entry.toolCallId,
							partialResult: text,
						}),
					];
				}
				ignoredByDesign += 1;
				return [];
			}
			case "item/completed": {
				const item = payload.item && typeof payload.item === "object" ? payload.item : {};
				const entry = openItems.get(String(item.itemId ?? ""));
				openItems.delete(String(item.itemId ?? ""));
				if (item.kind === "agentMessage") {
					// The completed item's text is authoritative (an absent or
					// unknown messagePhase still reads as the final answer —
					// schema SS4.5.3), so the LAST non-empty completed message
					// wins; no length heuristics.
					if (typeof item.text === "string" && item.text.length > 0) {
						lastResponseText = item.text;
					}
					return [];
				}
				if (item.kind === "toolCall") {
					const toolName =
						entry?.toolName || (typeof item.tool === "string" ? item.tool : "tool");
					const toolCallId = String(entry?.toolCallId || item.callId || item.itemId || "unknown");
					const result =
						typeof item.visibleOutput === "string" ? item.visibleOutput : "";
					// ItemStatus (schema SS4.4.1): terminal = anything other than
					// "inProgress"; unknown values are terminal-unknown. Treat any
					// non-progress, non-completed status — and any failureReason —
					// as an error: a failed tool call must never read as success.
					const statusFailed =
						typeof item.status === "string" &&
						item.status !== "inProgress" &&
						item.status !== "completed";
					const failed =
						statusFailed ||
						(typeof item.failureReason === "string" && item.failureReason.length > 0);
					return [
						normalizedAgentEvent("tool_finished", {
							toolName,
							toolCallId,
							result,
							isError: Boolean(failed),
							error: failed
								? String(item.failureReason || item.fallbackText || "tool call failed")
								: null,
						}),
					];
				}
				ignoredByDesign += 1;
				return [];
			}
			case "turn/completed": {
				activeTurnId = null;
				const terminal = payload.terminal;
				if (terminal === "completed") {
					return [
						normalizedAgentEvent("run_finished", {
							status: "completed",
							response: lastResponseText,
						}),
					];
				}
				if (terminal === "cancelled") {
					return [
						normalizedAgentEvent("run_finished", {
							status: "aborted",
							interrupted: true,
						}),
					];
				}
				const reason =
					typeof payload.error?.message === "string" && payload.error.message
						? payload.error.message
						: typeof payload.reason === "string" && payload.reason
							? payload.reason
							: "muse turn failed";
				return [normalizedAgentEvent("run_error", { error: reason })];
			}
			case "session/tokenUsage": {
				tokenUsage = {
					promptTokens: numberOrNull(payload.promptTokens),
					totalTokens: numberOrNull(payload.totalTokens),
					modelId: typeof payload.modelId === "string" ? payload.modelId : null,
					cumulative: payload.cumulative && typeof payload.cumulative === "object"
						? { ...payload.cumulative }
						: null,
					turnId: typeof payload.turnId === "string" ? payload.turnId : activeTurnId,
				};
				ignoredByDesign += 1;
				return [];
			}
			case "session/contextUsage": {
				contextUsage = {
					usedTokens: numberOrNull(payload.usedTokens),
					windowTokens: numberOrNull(payload.windowTokens),
					pressure: typeof payload.pressure === "string" ? payload.pressure : null,
				};
				ignoredByDesign += 1;
				return [];
			}
			case "item/updated":
			case "item/readOutput":
			case "session/statusChanged":
			case "session/started":
			case "session/closed":
			case "session/modelChanged":
			case "session/approvalModeChanged":
			case "session/todoListChanged":
			case "session/viewHealthChanged":
			case "turn/foregroundCompleted":
			case "turn/modelRetryScheduled":
			case "turn/retryScheduled":
			case "turn/retracted":
			case "turn/unqueued":
			case "approval/requested":
			case "approval/resolved":
			case "approval/reviewing":
			case "approval/updated":
			case "userInput/requested":
			case "userInput/engaged":
			case "userInput/settled":
			case "usage/changed":
			case "view/gap":
			case "session/listChanged":
			case "session/nameChanged":
			case "session/reasoningEffortChanged":
			case "session/goalChanged":
			case "session/branchChanged":
			case "session/modelRouteUnserved": {
				ignoredByDesign += 1;
				return [];
			}
			default: {
				ignoredUnknown += 1;
				return [];
			}
		}
	}

	/***
	 * MARK: beginTurn
	 * @description Records the prompt submitted for the next turn so the
	 *   `run_started` event can carry it (the host's `turn/started`
	 *   notification does not echo the prompt text).
	 ***/
	function beginTurn({ prompt } = {}) {
		submittedPrompt = typeof prompt === "string" ? prompt : "";
	}

	function getUsage() {
		return {
			tokenUsage,
			contextUsage,
			getContextUsage: () =>
				contextUsage && contextUsage.usedTokens !== null
					? { current: contextUsage.usedTokens, limit: contextUsage.windowTokens ?? null }
					: null,
		};
	}

	function stats() {
		return { ignoredUnknown, ignoredByDesign };
	}

	return { map, beginTurn, getUsage, stats };
}

function numberOrNull(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}
