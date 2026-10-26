import { normalizedAgentEvent } from "../../sessionEvents.js";

/**
 * MARK: agyEventMapper
 * @description Pure mapping from parsed agy stream-JSON rows (see
 *   `agyStreamParser.js`) to the engine's normalized agent-event vocabulary
 *   (`api/agent/sessionEvents.js`). This is THE ONLY place in the engine where
 *   raw agy event names are interpreted; every mapped event is built with
 *   `normalizedAgentEvent()` so an invalid name throws at the seam instead of
 *   leaking raw names to the engine.
 *
 *   Mapping table (each row verified against antigravity.google/docs/cli):
 *
 *     | agy stream event                                          | Normalized      | Payload |
 *     |-----------------------------------------------------------|-----------------|---------|
 *     | init                                                      | run_started     | model, permissionMode, tools, conversationId, runFacts? |
 *     | step_update agent_response, first of its step_index       | message_started | message: { role: "assistant" } |
 *     | step_update agent_response, text_delta                    | assistant_delta | delta (+ assistantMessageEvent protocol tag) |
 *     | step_update tool, first ACTIVE of its step_index          | tool_started    | toolName, toolCallId, args |
 *     | step_update tool, further ACTIVE of the same step_index   | tool_updated    | toolName, toolCallId, partialResult |
 *     | step_update tool, DONE                                    | tool_finished   | toolName, toolCallId, result, isError, error |
 *     | step_update user_input / checkpoint               | harness_log     | one `[AGY] …` line per step (never dropped) |
 *     | step_update unknown step types                      | harness_log     | one `[AGY] …` line (forward tolerance) |
 *     | result, status SUCCESS                                    | run_finished    | status, usage, durationSeconds, conversationId, runFacts? |
 *     | result, status INTERRUPTED / CANCELED                     | run_finished    | same, plus interrupted: true |
 *     | result, any other status (ERROR, INVALID, …)              | run_error       | error (CLI error field, else a status message) |
 *
 *   The mapper is stateful across one run (one `agy` process): it remembers
 *   which agent_response steps already announced `message_started` and which
 *   tool steps are open, because the stream streams MANY step_update rows per
 *   step. One mapper per process; construct a fresh mapper per run.
 */

/** Terminal result statuses the CLI itself reports as a graceful stop. */
const INTERRUPTED_STATUSES = new Set(["INTERRUPTED", "CANCELED"]);

/***
 * MARK: stringifyToolOutput
 * @description Flattens a tool_info.output payload to the plain string the
 *   engine reads in tool_updated.partialResult / tool_finished.result.
 *   Objects/arrays are JSON-rendered so tool output never arrives as [object Object].
 * @param {string|Object|undefined} output - The raw tool output.
 * @returns {string} The output text ("" when absent).
 ***/
function stringifyToolOutput(output) {
	if (output === undefined || output === null) return "";
	if (typeof output === "string") return output;
	try {
		return JSON.stringify(output);
	} catch {
		return String(output);
	}
}

/***
 * MARK: createAgyEventMapper
 * @description Builds the per-run mapper from parsed agy stream rows to
 *   normalized agent events. `map(row)` returns the normalized events the row
 *   produces (an empty array for ignored steps); mapping never throws for
 *   unknown step_types — surprises degrade to "no events" instead of crashes.
 * @example const mapper = createAgyEventMapper();
 * @example mapper.map(parser.push(chunk)[0]) => [{ type: "run_started", ... }]
 * @param {Object} [opts] - Optional per-run context.
 * @param {Object} [opts.runFacts] - Spawn facts ({ harness, model, effort,
 *   sandbox, skipPermissions, timeout, promptChars, promptHash }) merged into
 *   the run_started payload so the transcript can show exactly what this run
 *   uses. Prompt capture is redacted metadata only (size + SHA-256 hex) —
 *   never raw prompt text.
 * @returns {Object} The mapper: { map(row) }.
 ***/
export function createAgyEventMapper({ runFacts } = {}) {
	/** step_index values whose agent_response step already emitted message_started. */
	const announcedAgentSteps = new Set();
	/** step_index → { name } for tool steps whose ACTIVE was already announced. */
	const openToolSteps = new Map();

	function mapInit(row) {
		const payload = row.payload || {};
		return [
			normalizedAgentEvent("run_started", {
				model: typeof payload.model === "string" ? payload.model : null,
				permissionMode: payload.permission_mode ?? null,
				tools: Array.isArray(payload.tools) ? payload.tools : null,
				conversationId: row.conversationId,
				...(runFacts ? { runFacts: { ...runFacts } } : {}),
			}),
		];
	}

	function mapAgentResponseStep(row) {
		const events = [];
		const stepKey = row.stepIndex ?? "anonymous";
		if (!announcedAgentSteps.has(stepKey)) {
			announcedAgentSteps.add(stepKey);
			events.push(
				normalizedAgentEvent("message_started", {
					message: { role: "assistant" },
				}),
			);
		}
		const delta = row.payload?.text_delta;
		if (typeof delta === "string" && delta.length > 0) {
			events.push(
				normalizedAgentEvent("assistant_delta", {
					delta,
					assistantMessageEvent: { type: "text_delta", delta },
				}),
			);
		}
		return events;
	}

	function mapToolStep(row) {
		const toolInfo = row.payload?.tool_info;
		if (!toolInfo || typeof toolInfo !== "object") return [];
		const toolName = typeof toolInfo.name === "string" ? toolInfo.name : "tool";
		const toolCallId = String(row.stepIndex ?? "unknown");
		const state = row.state;

		if (state === "DONE") {
			// A DONE without a prior ACTIVE still closes the tool cleanly: the
			// mapper synthesizes the start so the streamer's tool entry exists.
			const wasOpen = openToolSteps.delete(toolCallId);
			const events = [];
			if (!wasOpen) {
				events.push(
					normalizedAgentEvent("tool_started", {
						toolName,
						toolCallId,
						args: toolInfo.parameters ?? {},
					}),
				);
			}
			const error = toolInfo.error ?? null;
			events.push(
				normalizedAgentEvent("tool_finished", {
					toolName,
					toolCallId,
					result: stringifyToolOutput(toolInfo.output),
					isError: Boolean(error),
					error: error?.message ?? null,
				}),
			);
			return events;
		}

		if (!openToolSteps.has(toolCallId)) {
			openToolSteps.set(toolCallId, { name: toolName });
			return [
				normalizedAgentEvent("tool_started", {
					toolName,
					toolCallId,
					args: toolInfo.parameters ?? {},
				}),
			];
		}
		// Further ACTIVE rows stream tool output as partial updates.
		return [
			normalizedAgentEvent("tool_updated", {
				toolName,
				toolCallId,
				partialResult: stringifyToolOutput(toolInfo.output),
			}),
		];
	}

	function mapAuxStep(row) {
		// user_input / checkpoint / future step types: one bounded line each.
		// Emitted once per step_index (the CLI repeats ACTIVE rows per step;
		// the transcript needs the fact, not every repeat).
		const stepKey = `${row.stepType ?? "unknown"}:${row.stepIndex ?? "?"}`;
		if (announcedAgentSteps.has(stepKey)) return [];
		announcedAgentSteps.add(stepKey);
		const label =
			row.stepType === "user_input"
				? "user input"
				: row.stepType === "checkpoint"
					? "checkpoint"
					: typeof row.stepType === "string" && row.stepType
						? row.stepType
						: "step";
		return [
			normalizedAgentEvent("harness_log", {
				text: `[AGY] ${label} (step ${row.stepIndex ?? "?"})`,
				tag: "[AGY]",
			}),
		];
	}

	function mapResult(row) {
		const payload = row.payload || {};
		const status = typeof payload.status === "string" ? payload.status : "UNKNOWN";
		const meta = {
			status,
			usage: payload.usage ?? null,
			durationSeconds: typeof payload.duration_seconds === "number" ? payload.duration_seconds : null,
			conversationId: row.conversationId,
			...(runFacts ? { runFacts: { ...runFacts } } : {}),
		};
		if (status === "SUCCESS") {
			return [normalizedAgentEvent("run_finished", meta)];
		}
		if (INTERRUPTED_STATUSES.has(status)) {
			// A graceful CLI-reported interruption is not an agent error.
			return [
				normalizedAgentEvent("run_finished", { ...meta, interrupted: true }),
			];
		}
		return [
			normalizedAgentEvent("run_error", {
				error: typeof payload.error === "string" && payload.error
					? payload.error
					: `agy run failed with status ${status}`,
			}),
		];
	}

	return {
		/***
		 * MARK: map
		 * @description Maps one parsed agy stream row to zero or more normalized
		 *   agent events. Non-tool steps (user_input, checkpoint, future step
		 *   types) surface as one bounded `harness_log` line each — visible in
		 *   the transcript, never silently dropped. Tool-less tool steps stay
		 *   silent (no tool identity to log).
		 * @example mapper.map({ event: "result", payload: { status: "SUCCESS" } }) => [run_finished event]
		 * @param {Object} row - A parsed row from agyStreamParser.
		 * @returns {Array<Object>} The normalized agent events for this row.
		 ***/
		map(row) {
			if (!row || typeof row !== "object") return [];
			switch (row.event) {
				case "init":
					return mapInit(row);
				case "step_update": {
					if (row.stepType === "agent_response") return mapAgentResponseStep(row);
					if (row.stepType === "tool") return mapToolStep(row);
					return mapAuxStep(row);
				}
				case "result":
					return mapResult(row);
				default:
					return [];
			}
		},
	};
}