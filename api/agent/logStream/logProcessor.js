/**
 * MARK: logProcessor
 * @description THE single place that turns normalized agent events into
 *   canonical log records (`logRecord.js`). The agent log streamer
 *   (`agentLogStreamer.js`) is a thin stateful shell around this processor:
 *   it owns feed plumbing (consumeFeed/snapshot/render) while every
 *   event→record decision lives here, so harnesses and the UI can migrate
 *   independently once this seam and its contract test exist.
 *
 *   Responsibilities:
 *   - block state (text/thinking/tool) and `blockId` assignment;
 *   - telemetry/permission/plan/raw lanes for the unified vocabulary
 *     (`usage_updated`, `session_meta`, `permission_requested/resolved`,
 *     `plan_updated`, `reasoning_delta`, `harness_log`);
 *   - usage telemetry derived from `usage` payloads riding on
 *     `assistant_delta`/`run_finished` (pi message usage/stopReason, agy
 *     result usage) as well as explicit `usage_updated` events;
 *   - unknown-event capture into the bounded raw lane
 *     (`evidence.reason = "unmapped"`) instead of silent drops;
 *   - caps/eviction per lane and total (`logEntriesMaxCount`);
 *   - ANSI strip for `text` (preserved verbatim in `evidence.sourceEvent`).
 *
 *   Backwards compatibility: for the original 8 events the produced entries
 *   keep their exact kind/feed/text/meta — the new canonical fields (`seq`,
 *   `blockId`, `fidelity`, …) are purely additive.
 */

import {
	boundRawSource,
	FIDELITY_SYNTHESIZED,
	makeLogRecord,
	RECORD_LIMITS,
	stripAnsiText,
} from "./logRecord.js";
import {
	redactDeepStrings,
	redactSecretsText,
} from "../../../shared/redactSecrets.js";
import {
	summarizePermission,
	summarizePlan,
	summarizeRaw,
	summarizeToolResult,
	summarizeToolStart,
	summarizeUsage,
} from "../../../shared/toolLogFormat.js";

/***
 * MARK: DEFAULT_PROCESSOR_OPTIONS
 * @description Default options for `createLogProcessor`. Mirrors the
 *   streamer defaults (`maxEntryBytes` 0 = uncapped narrative text; task-log
 *   growth bounded by the structured-entry cap) plus the unified lane
 *   budgets (`telemetryMaxCount`, `rawMaxCount`, `rawMaxBytes`).
 ***/
export const DEFAULT_PROCESSOR_OPTIONS = Object.freeze({
	hideThinking: true,
	toolArgsMaxLength: 400,
	resultMaxLength: 600,
	maxEntryBytes: 0,
	maxEntries: 500,
	telemetryMaxCount: RECORD_LIMITS.telemetryMaxCount,
	rawMaxCount: RECORD_LIMITS.rawMaxCount,
	rawMaxBytes: RECORD_LIMITS.rawMaxBytes,
	harnessId: undefined,
	model: undefined,
	runId: undefined,
});

/***
 * MARK: excerptText
 * @description Bounds a text block to `maxLength` characters, appending an
 *   ellipsis when the text was cut. Storage caps only — display lines
 *   summarize through the shared toolLogFormat grammar instead.
 ***/
function excerptText(text, maxLength) {
	if (!maxLength || maxLength <= 0 || text.length <= maxLength) return text;
	return `${text.slice(0, maxLength)}…`;
}

/***
 * MARK: extractToolResultText
 * @description Flattens a tool_finished result payload into plain text, using
 *   the same shapes the engine has always read: plain string, `{content}`
 *   string, `{content: [{text}]}` array, or a JSON fallback. Redacted on the
 *   way out: the flattened text is appended to the already-stored [TOOL]
 *   entry (`meta.output`) AFTER its record passed the creation redactor, so
 *   an unredacted extract would leak secrets into the store.
 ***/
function extractToolResultText(event) {
	const flatten = () => {
		if (typeof event.result === "string") return event.result;
		if (typeof event.result?.content === "string") return event.result.content;
		if (Array.isArray(event.result?.content)) {
			return event.result.content
				.map((c) => (typeof c === "string" ? c : c?.text || ""))
				.join("");
		}
		if (event.result) {
			try {
				return JSON.stringify(event.result);
			} catch {
				return String(event.result);
			}
		}
		return "";
	};
	return redactSecretsText(flatten());
}

/***
 * MARK: readToolPartial
 * @description Reads the streamed partial output of a tool_updated event,
 *   redacted: partials accumulate on the stored [TOOL] entry after its
 *   record passed the creation redactor.
 ***/
function readToolPartial(event) {
	if (typeof event.partialResult === "string")
		return redactSecretsText(event.partialResult);
	if (typeof event.delta === "string") return redactSecretsText(event.delta);
	return "";
}

/***
 * MARK: createLogProcessor
 * @description Creates the unified event→record processor for one agent
 *   stage run. Pure: no harness imports, no I/O — only the normalized
 *   agent-event vocabulary in, canonical records out.
 * @param {Object} [options] - See DEFAULT_PROCESSOR_OPTIONS.
 * @returns {Object} Processor with handleEvent/system/entries/snapshot helpers.
 ***/
export function createLogProcessor(options = {}) {
	const merged = { ...DEFAULT_PROCESSOR_OPTIONS, ...options };
	const hideThinking = merged.hideThinking !== false;
	const toolArgsMaxLength =
		merged.toolArgsMaxLength ?? DEFAULT_PROCESSOR_OPTIONS.toolArgsMaxLength;
	const resultMaxLength =
		merged.resultMaxLength ?? DEFAULT_PROCESSOR_OPTIONS.resultMaxLength;
	const maxEntryBytes = merged.maxEntryBytes || 0;
	const maxEntries =
		merged.maxEntries > 0 ? merged.maxEntries : DEFAULT_PROCESSOR_OPTIONS.maxEntries;
	const telemetryMaxCount =
		merged.telemetryMaxCount > 0
			? merged.telemetryMaxCount
			: DEFAULT_PROCESSOR_OPTIONS.telemetryMaxCount;
	const rawMaxCount =
		merged.rawMaxCount > 0 ? merged.rawMaxCount : DEFAULT_PROCESSOR_OPTIONS.rawMaxCount;
	const rawMaxBytes =
		merged.rawMaxBytes > 0 ? merged.rawMaxBytes : DEFAULT_PROCESSOR_OPTIONS.rawMaxBytes;
	const contextFields = {};
	if (typeof merged.harnessId === "string" && merged.harnessId) {
		contextFields.harnessId = merged.harnessId;
	}
	if (merged.model !== undefined && merged.model !== null) {
		contextFields.model = merged.model;
	}
	if (typeof merged.runId === "string" && merged.runId) {
		contextFields.runId = merged.runId;
	}

	/** Monotonic entry ids: never Date.now() so same-millisecond events cannot collide. */
	let nextEntryId = 1;
	/** Monotonic record sequence numbers for the canonical record. */
	let nextSeq = 1;
	/** Semantic block counter: one blockId per text/thinking/tool block. */
	let nextBlock = 1;
	/** 1-based turn counter (run_started … run_finished). */
	let turnIndex = 0;
	/** All retained entries in creation order. */
	const entries = [];
	/** Open assistant text block for the streaming message. */
	let textBuffer = "";
	/** Open thinking block for the streaming message. */
	let thinkingBuffer = "";
	/** Role of the message currently streaming (assistant …). */
	let messageRole = null;
	/** The tool entry currently accumulating output (tool_started … tool_finished). */
	let openToolEntry = null;
	/** Wall-clock start per open tool entry (WeakMap so parallel calls keep
	 *  their own start; never stored on the record itself). */
	const toolStartMs = new WeakMap();
	/** Steps faster than this render no measured timing suffix: same-tick
	 *  unit pairs stay byte-identical while real tool calls (≥100ms) show
	 *  how long each step took. Explicit event timings always render. */
	const MEASURED_TIMING_FLOOR_MS = 100;

	const firstFiniteMs = (...values) => {
		for (const value of values) {
			if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
				return value;
			}
		}
		return null;
	};

	const explicitDurationMs = (event = {}) =>
		firstFiniteMs(
			event.durationMs,
			event.duration_ms,
			typeof event.duration_seconds === "number" ? event.duration_seconds * 1000 : null,
			typeof event.durationSeconds === "number" ? event.durationSeconds * 1000 : null,
		);

	const formatDurationMs = (ms) =>
		ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
	/** Marker entry tracking evicted entries, so repeated eviction updates one line. */
	let evictionMarker = null;
	let evictedCount = 0;
	/** Marker entry tracking raw-lane evictions (stays on the raw feed). */
	let rawEvictionMarker = null;
	let rawEvictedCount = 0;
	/** Telemetry records retained (reserved budget inside maxEntries). */
	let telemetryCount = 0;
	/** Last emitted usage payload JSON — suppresses double telemetry when the
	 *  same usage object arrives both as usage_updated and on run_finished. */
	let lastUsageJson = null;

	const capText = (text) =>
		maxEntryBytes > 0 ? excerptText(text, maxEntryBytes) : text;

	const appendRecord = (partial) => {
		const record = makeLogRecord({
			...contextFields,
			turn: turnIndex || 1,
			...partial,
			id: nextEntryId++,
			seq: nextSeq++,
			ts: new Date().toISOString(),
		});
		// ANSI escapes never reach stored text (they would leak into HTML
		// rendering); the verbatim wire bytes stay available in evidence.
		// Secrets/PII are redacted BEFORE the length cap so a truncated
		// secret fragment can never survive beside a cut marker. Clean text
		// passes through byte-identical.
		if (typeof record.text === "string" && record.text) {
			record.text = capText(redactSecretsText(stripAnsiText(record.text)));
		}
		// Structured payloads redact by position (secret-shaped keys) and by
		// shape (tokens, emails, paths inside free text). Numbers/booleans
		// pass through untouched, so usage counts and exit codes survive.
		if (record.meta && typeof record.meta === "object") {
			record.meta = redactDeepStrings(record.meta);
		}
		if (record.tool && typeof record.tool === "object") {
			record.tool = redactDeepStrings(record.tool);
		}
		if (record.usage && typeof record.usage === "object") {
			record.usage = redactDeepStrings(record.usage);
		}
		if (record.evidence && typeof record.evidence === "object") {
			record.evidence = redactDeepStrings(record.evidence);
		}
		entries.push(record);
		evictOverflow();
		return record;
	};

	const appendEntry = ({ kind, feeds: entryFeeds, text, meta, ...rest }) => {
		return appendRecord({
			kind,
			feeds: entryFeeds,
			feed: entryFeeds[0],
			text,
			meta: meta || {},
			...rest,
		});
	};

	function evictOverflow() {
		// Reserve one slot for the eviction marker so the cap holds after it is
		// unshifted (and don't double-reserve once the marker exists). The
		// marker itself is exempt from eviction and always stays at the front.
		const hasMarker = Boolean(evictionMarker && entries.includes(evictionMarker));
		const overflow = entries.length + (hasMarker ? 0 : 1) - maxEntries;
		if (overflow <= 0) return;
		evictedCount += overflow;
		entries.splice(hasMarker ? 1 : 0, overflow);
		if (evictionMarker && !entries.includes(evictionMarker)) {
			evictionMarker = null;
			rawEvictionMarker = null;
		}
		if (rawEvictionMarker && !entries.includes(rawEvictionMarker)) {
			rawEvictionMarker = null;
		}
		const markerText = `[INFO] (${evictedCount} earlier log entries evicted)`;
		if (!evictionMarker) {
			evictionMarker = makeLogRecord({
				...contextFields,
				id: nextEntryId++,
				seq: nextSeq++,
				ts: new Date().toISOString(),
				feed: "main",
				feeds: ["main"],
				kind: "system",
				turn: turnIndex || 1,
				text: markerText,
				meta: { evictedCount },
				fidelity: FIDELITY_SYNTHESIZED,
			});
			entries.unshift(evictionMarker);
		} else {
			evictionMarker.text = markerText;
			evictionMarker.meta = { evictedCount };
		}
		reconcileLaneCounters();
	}

	function reconcileLaneCounters() {
		telemetryCount = entries.filter((e) => e.kind === "telemetry").length;
	}

	function flushText() {
		if (!textBuffer.trim()) {
			textBuffer = "";
			return null;
		}
		const entry = appendEntry({
			kind: "assistant",
			feeds: ["main"],
			text: textBuffer,
			meta: { messageRole: messageRole || "assistant" },
			blockId: `b${nextBlock++}`,
		});
		textBuffer = "";
		return entry;
	}

	function flushThinking() {
		if (!thinkingBuffer.trim()) {
			thinkingBuffer = "";
			return null;
		}
		const block = thinkingBuffer;
		thinkingBuffer = "";
		const charCount = block.length;
		const blockId = `b${nextBlock++}`;
		if (hideThinking) {
			const fullEntry = appendEntry({
				kind: "thinking",
				feeds: ["thinking"],
				text: block,
				meta: { messageRole: messageRole || "assistant", charCount },
				blockId,
			});
			return appendEntry({
				kind: "thinking",
				feeds: ["main"],
				text: `[THINKING] (${charCount} chars)`,
				meta: {
					messageRole: messageRole || "assistant",
					charCount,
					collapsed: true,
					fullTextId: fullEntry.id,
				},
				blockId,
			});
		}
		return appendEntry({
			kind: "thinking",
			feeds: ["main", "thinking"],
			text: block,
			meta: { messageRole: messageRole || "assistant", charCount },
			blockId,
		});
	}

	function flushOpenBlocks() {
		const flushed = [];
		// Thinking flushes before text: models emit thinking first, so markers
		// land above the narrative they precede.
		const thinkingEntries = flushThinking();
		if (Array.isArray(thinkingEntries)) {
			flushed.push(...thinkingEntries);
		} else if (thinkingEntries) {
			flushed.push(thinkingEntries);
		}
		const textEntry = flushText();
		if (textEntry) flushed.push(textEntry);
		return flushed;
	}

	function formatRunOpenLine(event) {
		const facts = event.runFacts;
		if (!facts || facts.harness !== "antigravity") return null;
		const parts = [`model=${facts.model || "agy default"}`];
		if (facts.effort) parts.push(`effort=${facts.effort}`);
		parts.push(`sandbox=${facts.sandbox ? "on" : "off"}`);
		parts.push(`approvals=${facts.skipPermissions ? "auto" : "prompt"}`);
		if (event.permissionMode)
			parts.push(`permission_mode=${event.permissionMode}`);
		if (event.conversationId)
			parts.push(`conversation=${String(event.conversationId).slice(0, 8)}`);
		return `[AGY] run open: ${parts.join(" ")}`;
	}

	function formatRunDoneLine(event) {
		const facts = event.runFacts;
		if (!facts || facts.harness !== "antigravity") return null;
		const usage = event.usage || {};
		/* eslint-disable security/detect-object-injection -- keys are compile-time constants */
		const total =
			typeof usage.total_tokens === "number"
				? usage.total_tokens
				: ["input_tokens", "output_tokens", "thinking_tokens"].reduce(
						(sum, key) => sum + (typeof usage[key] === "number" ? usage[key] : 0),
						0,
					);
		/* eslint-enable security/detect-object-injection */
		const duration =
			typeof event.durationSeconds === "number"
				? ` in ${event.durationSeconds.toFixed(1)}s`
				: "";
		const tokens = total > 0 ? ` · ${total} tokens` : "";
		return `[AGY] run done: status=${event.status || "UNKNOWN"}${duration}${tokens}`;
	}

	function formatSessionMetaLine(event) {
		const parts = [];
		if (typeof event.model === "string" && event.model) {
			parts.push(`model=${event.model}`);
		}
		if (typeof event.effort === "string" && event.effort) {
			parts.push(`effort=${event.effort}`);
		}
		if (typeof event.sandbox === "boolean") {
			parts.push(`sandbox=${event.sandbox ? "on" : "off"}`);
		}
		if (typeof event.permissions === "string" && event.permissions) {
			parts.push(`permissions=${event.permissions}`);
		}
		if (typeof event.conversationId === "string" && event.conversationId) {
			parts.push(`conversation=${event.conversationId.slice(0, 8)}`);
		}
		if (parts.length === 0) return null;
		return `[INFO] session: ${parts.join(" ")}`;
	}

	/** Emits one telemetry record for a usage payload (reserved lane budget). */
	function emitUsageRecord(usage, model) {
		const summary = summarizeUsage(usage);
		if (summary === "usage unknown") return null;
		if (telemetryCount >= telemetryMaxCount) return null;
		const entry = appendEntry({
			kind: "telemetry",
			feeds: ["telemetry"],
			text: `[USAGE] ${summary}`,
			meta: { model: typeof model === "string" ? model : null },
			usage: usage && typeof usage === "object" ? { ...usage } : usage,
		});
		telemetryCount += 1;
		return entry;
	}

	/** Emits usage telemetry unless this exact payload was just emitted. */
	function maybeEmitUsage(usage, model) {
		if (!usage || typeof usage !== "object") return null;
		let key;
		try {
			key = JSON.stringify({ usage, model: model ?? null });
		} catch {
			key = null;
		}
		if (key !== null && key === lastUsageJson) return null;
		const entry = emitUsageRecord(usage, model);
		if (entry && key !== null) lastUsageJson = key;
		return entry;
	}

	const handleRunStarted = (event = {}) => {
		turnIndex += 1;
		const flushed = flushOpenBlocks();
		const line = formatRunOpenLine(event);
		if (!line) return flushed;
		const entry = system(line);
		return entry ? [...flushed, entry] : flushed;
	};

	function handleMessageStarted(event) {
		const role = event.message?.role;
		if (role && role !== "assistant") return [];
		messageRole = role || "assistant";
		return flushOpenBlocks();
	}

	function handleAssistantDelta(event) {
		const emitted = [];
		const ame = event.assistantMessageEvent;
		const ameType = ame?.type;
		switch (ameType) {
			case "thinking_start":
				break;
			case "thinking_delta": {
				const delta = typeof ame?.delta === "string" ? ame.delta : "";
				if (delta) thinkingBuffer += delta;
				break;
			}
			case "thinking_end":
				emitted.push(...flushOpenBlocks());
				break;
			case "text_start":
				break;
			case "text_delta": {
				const delta = typeof ame?.delta === "string" ? ame.delta : "";
				if (delta) textBuffer += delta;
				break;
			}
			case "text_end":
				emitted.push(...flushOpenBlocks());
				break;
			case "toolcall_start":
				// Tool args stream inside the message; the actual tool call is
				// logged from the tool_started event. Close any open text block so
				// the narrative stays separate from the call.
				emitted.push(...flushOpenBlocks());
				break;
			case "toolcall_delta":
			case "toolcall_end":
				break;
			case "done":
				emitted.push(...flushOpenBlocks());
				break;
			default: {
				// No protocol tag (or an unknown one): fall back to the bare-delta
				// shapes the engine has always read.
				const delta =
					(typeof event.delta === "string" && event.delta) ||
					(typeof event.chunk === "string" && event.chunk) ||
					(typeof ame?.delta === "string" && ame.delta) ||
					"";
				if (delta) textBuffer += delta;
				break;
			}
		}
		// Usage riding on the delta (pi message usage/stopReason) becomes
		// telemetry instead of dying in the mapper boundary.
		if (event.usage && typeof event.usage === "object") {
			const usageEntry = maybeEmitUsage(event.usage, event.model);
			if (usageEntry) emitted.push(usageEntry);
		}
		return emitted;
	}

	function handleToolStarted(event) {
		const flushed = flushOpenBlocks();
		const toolName = event.toolName || event.name || "tool";
		const toolCallId = event.toolCallId || event.id || null;
		const args = event.args || event.arguments || {};
		const entry = appendEntry({
			kind: "tool",
			feeds: ["main", "tools"],
			text: `[TOOL] ${toolName}(${summarizeToolStart(toolName, args, { maxLength: toolArgsMaxLength })})`,
			meta: { toolName, toolCallId, args, output: "", isError: false },
			tool: { callId: toolCallId, name: toolName, args },
			blockId: `b${nextBlock++}`,
		});
		openToolEntry = entry;
		toolStartMs.set(entry, Date.now());
		return [...flushed, entry];
	}

	function handleToolUpdated(event) {
		const partial = readToolPartial(event);
		if (!partial || !openToolEntry) return [];
		const outputCap = maxEntryBytes > 0 ? maxEntryBytes : 8192;
		const combined = openToolEntry.meta.output
			? `${openToolEntry.meta.output}\n${partial}`
			: partial;
		openToolEntry.meta.output = excerptText(combined, outputCap);
		if (openToolEntry.tool && typeof openToolEntry.tool === "object") {
			openToolEntry.tool = {
				...openToolEntry.tool,
				partials: openToolEntry.meta.output,
			};
		}
		return [];
	}

	function handleToolFinished(event) {
		const toolName =
			event.toolName || event.name || openToolEntry?.meta.toolName || "tool";
		const toolCallId =
			event.toolCallId || event.id || openToolEntry?.meta.toolCallId || null;
		const isError = Boolean(
			event.isError || event.error || event.result?.isError || event.result?.error,
		);
		const resultText = extractToolResultText(event);
		// Per-step timing: explicit harness timings win; otherwise the
		// measured wall-clock between tool_started and tool_finished, but
		// only for steps slow enough to matter (same-tick unit pairs stay
		// byte-identical). Stored on meta/tool always; rendered on [RESULT].
		const startedAt = openToolEntry ? toolStartMs.get(openToolEntry) : null;
		const measuredMs =
			typeof startedAt === "number" ? Date.now() - startedAt : null;
		const durationMs =
			explicitDurationMs(event) ??
			(typeof measuredMs === "number" && measuredMs >= MEASURED_TIMING_FLOOR_MS
				? measuredMs
				: null);
		const timingSuffix =
			typeof durationMs === "number" ? ` (${formatDurationMs(durationMs)})` : "";
		if (openToolEntry) {
			toolStartMs.delete(openToolEntry);
			openToolEntry.meta.isError = isError;
			// Keep the full output record (streamed partials + final result) on
			// the structured tools feed.
			if (resultText) {
				openToolEntry.meta.output = openToolEntry.meta.output
					? `${openToolEntry.meta.output}\n${resultText}`
					: resultText;
			}
			if (openToolEntry.tool && typeof openToolEntry.tool === "object") {
				openToolEntry.tool = {
					...openToolEntry.tool,
					result: resultText,
					partials: openToolEntry.meta.output,
					...(typeof durationMs === "number" ? { durationMs } : {}),
				};
			}
			if (typeof durationMs === "number") {
				openToolEntry.meta.durationMs = durationMs;
			}
		}
		// The [RESULT] excerpt mirrors today's behavior: the tool's FINAL result;
		// streamed partials only stand in when the result itself is empty.
		const fullOutput = resultText || openToolEntry?.meta.output || "";
		openToolEntry = null;

		const emitted = [];
		if (isError) {
			const errDetail = event.error || resultText || "Tool execution error";
			emitted.push(
				appendEntry({
					kind: "error",
					feeds: ["main"],
					text: `[ERROR] Tool ${toolName} failed: ${typeof errDetail === "string" ? errDetail : JSON.stringify(errDetail)}${timingSuffix}`,
					meta: {
						toolName,
						toolCallId,
						...(typeof durationMs === "number" ? { durationMs } : {}),
					},
				}),
			);
			return emitted;
		}
		const excerpt = summarizeToolResult(toolName, fullOutput.trim(), {
			maxLength: resultMaxLength,
		});
		if (excerpt) {
			emitted.push(
				appendEntry({
					kind: "tool",
					feeds: ["tools"],
					text: `[RESULT] ${excerpt}${timingSuffix}`,
					meta: {
						toolName,
						toolCallId,
						...(typeof durationMs === "number" ? { durationMs } : {}),
					},
					tool: {
						callId: toolCallId,
						name: toolName,
						result: resultText,
						...(typeof durationMs === "number" ? { durationMs } : {}),
					},
				}),
			);
		}
		return emitted;
	}

	const handleRunFinished = (event = {}) => {
		const flushed = flushOpenBlocks();
		const emitted = [...flushed];
		if (event.usage && typeof event.usage === "object") {
			const usageEntry = maybeEmitUsage(event.usage, event.model);
			if (usageEntry) emitted.push(usageEntry);
		}
		const line = formatRunDoneLine(event);
		if (!line) return emitted;
		const entry = system(line);
		return entry ? [...emitted, entry] : emitted;
	};

	function handleRunError(event) {
		const flushed = flushOpenBlocks();
		const message =
			event.error?.message ||
			event.message ||
			String(event.error || "Agent error");
		return [
			...flushed,
			appendEntry({
				kind: "error",
				feeds: ["main"],
				text: `[ERROR] ${message}`,
				meta: {},
			}),
		];
	}

	function handleUsageUpdated(event) {
		const entry = maybeEmitUsage(event.usage, event.model);
		return entry ? [entry] : [];
	}

	function handleSessionMeta(event) {
		const line = formatSessionMetaLine(event);
		if (!line) return [];
		return [system(line)];
	}

	function handlePermissionRequested(event) {
		return [
			appendEntry({
				kind: "permission",
				feeds: ["main"],
				text: summarizePermission(event),
				meta: {
					method: event.method ?? null,
					target: event.target ?? null,
				},
			}),
		];
	}

	function handlePermissionResolved(event) {
		return [
			appendEntry({
				kind: "permission",
				feeds: ["main"],
				text: summarizePermission(event),
				meta: {
					method: event.method ?? null,
					target: event.target ?? null,
					decision: event.decision ?? null,
				},
			}),
		];
	}

	function handlePlanUpdated(event) {
		const steps = Array.isArray(event.steps) ? event.steps : [];
		return [
			appendEntry({
				kind: "plan",
				feeds: ["main"],
				text: summarizePlan(event),
				meta: { steps },
			}),
		];
	}

	function handleReasoningDelta(event) {
		const delta = typeof event.delta === "string" ? event.delta : "";
		if (delta) thinkingBuffer += delta;
		return [];
	}

	function handleHarnessLog(event) {
		const text = typeof event.text === "string" ? event.text : "";
		if (!text.trim()) return [];
		return [system(text)];
	}

	function handleUnknownEvent(event) {
		// Nothing is silently lost: unmapped wire data lands in the bounded
		// raw lane with its source attached (scrubbed + capped) instead of
		// disappearing in a default branch.
		const wireType = typeof event.type === "string" ? event.type : "event";
		const summary = summarizeRaw({
			evidence: { wireType, reason: "unmapped" },
		});
		const entry = appendEntry({
			kind: "raw",
			feeds: ["raw"],
			text: summary,
			meta: {},
			fidelity: FIDELITY_SYNTHESIZED,
			evidence: {
				wireType,
				sourceEvent: boundRawSource(event, rawMaxBytes),
				reason: "unmapped",
			},
		});
		enforceRawBudget();
		return [entry];
	}

	function enforceRawBudget() {
		const rawRecords = entries.filter(
			(e) => e.kind === "raw" && e !== rawEvictionMarker,
		);
		const overflow = rawRecords.length - rawMaxCount;
		if (overflow <= 0) return;
		rawEvictedCount += overflow;
		const victims = new Set(rawRecords.slice(0, overflow));
		for (let i = entries.length - 1; i >= 0; i--) {
			// eslint-disable-next-line security/detect-object-injection -- numeric index into the processor-owned array
			if (victims.has(entries[i])) entries.splice(i, 1);
		}
		const markerText = `[INFO] (${rawEvictedCount} earlier raw entries evicted)`;
		if (!rawEvictionMarker || !entries.includes(rawEvictionMarker)) {
			rawEvictionMarker = makeLogRecord({
				...contextFields,
				id: nextEntryId++,
				seq: nextSeq++,
				ts: new Date().toISOString(),
				feed: "raw",
				feeds: ["raw"],
				kind: "system",
				turn: turnIndex || 1,
				text: markerText,
				meta: { rawEvictedCount },
				fidelity: FIDELITY_SYNTHESIZED,
			});
			entries.push(rawEvictionMarker);
			evictOverflow();
		} else {
			rawEvictionMarker.text = markerText;
			rawEvictionMarker.meta = { rawEvictedCount };
		}
		reconcileLaneCounters();
	}

	function handleEvent(event) {
		if (!event || typeof event.type !== "string") return [];
		switch (event.type) {
			case "run_started":
				return handleRunStarted(event);
			case "message_started":
				return handleMessageStarted(event);
			case "assistant_delta":
				return handleAssistantDelta(event);
			case "tool_started":
				return handleToolStarted(event);
			case "tool_updated":
				return handleToolUpdated(event);
			case "tool_finished":
				return handleToolFinished(event);
			case "run_finished":
				return handleRunFinished(event);
			case "run_error":
				return handleRunError(event);
			case "usage_updated":
				return handleUsageUpdated(event);
			case "session_meta":
				return handleSessionMeta(event);
			case "permission_requested":
				return handlePermissionRequested(event);
			case "permission_resolved":
				return handlePermissionResolved(event);
			case "plan_updated":
				return handlePlanUpdated(event);
			case "reasoning_delta":
				return handleReasoningDelta(event);
			case "harness_log":
				return handleHarnessLog(event);
			default:
				return handleUnknownEvent(event);
		}
	}

	function system(text, kind = "system") {
		if (!text || !String(text).trim()) return null;
		return appendEntry({ kind, feeds: ["main"], text: String(text), meta: {} });
	}

	return {
		handleEvent,
		system,
		get entries() {
			return entries;
		},
	};
}
