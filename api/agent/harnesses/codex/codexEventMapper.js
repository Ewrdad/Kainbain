import { normalizedAgentEvent } from "../../sessionEvents.js";

/**
 * MARK: codexEventMapper
 * @description Pure mapping from theoretical Codex wire rows to the engine's
 *   normalized agent-event vocabulary (`api/agent/sessionEvents.js`). This is
 *   THE ONLY place in the engine where Codex wire discriminators are
 *   interpreted; every mapped event is built with `normalizedAgentEvent()` so
 *   an invalid name throws at the seam instead of leaking raw names past the
 *   harness boundary (muse parity).
 *
 *   Mapping table (THEORETICAL — the wire format is UNVERIFIED on this
 *   device; exercised only against unit fixtures, never a live spawn):
 *
 *     | codex wire `type`        | Normalized           | Payload |
 *     |--------------------------|----------------------|---------|
 *     | status                   | status*              | level, title, message |
 *     | output / delta           | message_started once | assistant message announcement |
 *     |                          | assistant_delta      | delta (+ assistantMessageEvent protocol tag) |
 *     | error                    | run_error            | error (message) |
 *     | permission_request       | permission_requested | method, target |
 *     |                          | permission_resolved  | method, target, decision "allow" (YOLO auto-approve, survey q3) |
 *     | telemetry (token usage)  | usage_updated        | usage {inputTokens,…}, model? |
 *     | telemetry (other)        | harness_log          | one `[codex]` line (never dropped silently) |
 *     | session / resume         | session_meta         | conversationId |
 *     | model_list               | harness_log          | one `[codex] models: N` line (catalogues are data, not events) |
 *     | steer / cancel acks      | harness_log          | one `[codex]` line |
 *     | unknown discriminator    | (no event)           | forward tolerance (counted, never thrown) |
 *
 *   \* `status` is emitted as a `harness_log` line: the normalized
 *   vocabulary (`AGENT_EVENT_NAMES`) carries no generic `status` name, and
 *   inventing one would leak past the boundary. Status text stays visible in
 *   the unified log without claiming engine semantics.
 *
 *   The mapper is stateful across one run: it remembers whether the
 *   assistant stream already announced `message_started`. One mapper per run;
 *   construct a fresh mapper per run.
 */

/***
 * MARK: createCodexEventMapper
 * @description Builds the per-run mapper from Codex wire rows to normalized
 *   agent events. `map(row)` returns the normalized events the row produces
 *   (an empty array for ignored rows); mapping never throws for unknown
 *   input — surprises degrade to "no events" instead of crashes (muse
 *   parity). Permission-response ids default to a per-mapper counter
 *   (`codex-perm-N`) so output is deterministic in tests.
 * @example const mapper = createCodexEventMapper();
 * @example mapper.map({ type: "output", text: "hi" }) => [{ type: "assistant_delta", ... }]
 * @param {Object} [opts] - Optional per-run context.
 * @param {Object} [opts.runFacts] - Spawn facts ({ yolo }) merged into the
 *   permission_resolved payload so the transcript shows what the run uses.
 * @returns {Object} The mapper: { map(row), stats() }.
 ***/
export function createCodexEventMapper({ runFacts } = {}) {
	let announcedMessage = false;
	let permissionCounter = 0;
	let mapped = 0;
	let ignoredUnknown = 0;

	function emit(name, payload) {
		mapped += 1;
		return normalizedAgentEvent(name, payload);
	}

	function mapOutput(text) {
		const events = [];
		if (typeof text !== "string" || text.length === 0) {
			ignoredUnknown += 1;
			return events;
		}
		if (!announcedMessage) {
			announcedMessage = true;
			events.push(
				emit("message_started", { message: { role: "assistant" } }),
			);
		}
		events.push(
			emit("assistant_delta", {
				delta: text,
				assistantMessageEvent: { type: "text_delta", delta: text },
			}),
		);
		return events;
	}

	function mapPermission(payload) {
		permissionCounter += 1;
		const requestId =
			typeof payload.requestId === "string" && payload.requestId
				? payload.requestId
				: `codex-perm-${permissionCounter}`;
		const method = typeof payload.method === "string" && payload.method ? payload.method : "unknown";
		const target = typeof payload.target === "string" && payload.target ? payload.target : "unknown";
		// YOLO auto-approve (survey q3): the request AND its resolution are
		// both audited so the transcript shows what was allowed and why.
		return [
			emit("permission_requested", { method, target, requestId }),
			emit("permission_resolved", {
				method,
				target,
				requestId,
				decision: "allow",
				...(runFacts ? { runFacts: { ...runFacts } } : {}),
			}),
		];
	}

	function mapTelemetry(payload) {
		const usage = payload.usage && typeof payload.usage === "object" ? payload.usage : null;
		if (usage && (typeof usage.inputTokens === "number" || typeof usage.outputTokens === "number" || typeof usage.totalTokens === "number")) {
			const event = { usage: { ...usage } };
			const model = payload.model ?? payload.modelId;
			if (typeof model === "string" && model) event.model = model;
			return [emit("usage_updated", event)];
		}
		const label = typeof payload.event === "string" && payload.event ? payload.event : "telemetry";
		return [emit("harness_log", { text: `[codex] ${label}`, tag: "[codex]" })];
	}

	function mapRow(row) {
		if (!row || typeof row !== "object" || Array.isArray(row)) {
			ignoredUnknown += 1;
			return [];
		}
		const payload = row;
		const kind =
			(typeof payload.type === "string" && payload.type)
			|| (typeof payload.kind === "string" && payload.kind)
			|| "";
		switch (kind) {
			case "status": {
				const message =
					(typeof payload.message === "string" && payload.message)
					|| (typeof payload.title === "string" && payload.title)
					|| "Codex status";
				return [emit("harness_log", { text: `[codex] ${message}`, tag: "[codex]" })];
			}
			case "output":
			case "delta": {
				const text =
					(typeof payload.text === "string" && payload.text)
					|| (typeof payload.content === "string" && payload.content)
					|| "";
				return mapOutput(text);
			}
			case "error": {
				const message =
					(typeof payload.message === "string" && payload.message)
					|| "codex run failed";
				const event = { error: message };
				if (typeof payload.code === "string" && payload.code) event.code = payload.code;
				return [emit("run_error", event)];
			}
			case "permission_request":
			case "permission": {
				return mapPermission(payload);
			}
			case "telemetry": {
				return mapTelemetry(payload);
			}
			case "session":
			case "resume": {
				const conversationId =
					(typeof payload.conversationId === "string" && payload.conversationId)
					|| (typeof payload.sessionId === "string" && payload.sessionId)
					|| null;
				if (!conversationId) {
					ignoredUnknown += 1;
					return [];
				}
				return [emit("session_meta", { conversationId })];
			}
			case "model_list":
			case "models": {
				const models = Array.isArray(payload.models) ? payload.models : [];
				return [emit("harness_log", { text: `[codex] models: ${models.length} listed`, tag: "[codex]" })];
			}
			case "steer":
			case "cancel":
			case "cancelled": {
				return [emit("harness_log", { text: `[codex] ${kind} acknowledged`, tag: "[codex]" })];
			}
			default: {
				ignoredUnknown += 1;
				return [];
			}
		}
	}

	function map(row) {
		// String rows: a JSON line classifies as its object; anything else is
		// a leaked log line preserved verbatim in the unified log (never
		// dropped, never executed).
		if (typeof row === "string") {
			const trimmed = row.trim();
			if (!trimmed) {
				ignoredUnknown += 1;
				return [];
			}
			try {
				return mapRow(JSON.parse(trimmed));
			} catch {
				return [emit("harness_log", { text: `[codex] ${row}`, tag: "[codex]" })];
			}
		}
		return mapRow(row);
	}

	function stats() {
		return { mapped, ignoredUnknown };
	}

	return { map, stats };
}
