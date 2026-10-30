import { redactDeepStrings } from "../shared/redactSecrets.js";

/**
 * MARK: structuredEventSender
 * @description Batches normalized agent session events for the backend
 *   `POST /tasks/:id/log-events` endpoint (structured log transport). The
 *   sender redacts every event before it leaves the Runner (defense in depth
 *   for locally-read secrets), caps oversized payloads, and degrades to
 *   legacy text frames: the first failed batch flips the sender to
 *   text-fallback mode, converts that batch to text, and all later events
 *   flow through the daemon's `onLog` path instead — so an old backend
 *   degrades to today's coarse text view instead of losing logs.
 *
 *   Pure batching over an injected client: no harness imports, no I/O of its
 *   own. The daemon owns the `onLog` gating via `isStructured()`.
 */

/***
 * MARK: MAX_EVENT_BYTES
 * @description Per-event JSON cap before transport. Oversized payloads (full
 *   file contents in a tool result) are truncated field-first, never dropped
 *   silently without the marker.
 * @example MAX_EVENT_BYTES => 65536
 ***/
export const MAX_EVENT_BYTES = 65536;

/***
 * MARK: sanitizeStructuredEvent
 * @description Makes one session event JSON-safe and transport-bounded:
 *   redacts secrets/PII (position- and shape-aware), drops functions and
 *   unserializable values via a JSON round-trip, and truncates oversized
 *   payload fields with a visible marker. Returns null when the event has no
 *   usable type or still exceeds the cap after truncation.
 * @example sanitizeStructuredEvent({ type: 'assistant_delta', delta: 'hi' }) => { type: 'assistant_delta', delta: 'hi' }
 * @param {Object} event - One normalized session event.
 * @param {number} [maxBytes] - Per-event JSON cap.
 * @returns {Object|null} The sanitized event, or null to skip it.
 ***/
export const sanitizeStructuredEvent = (event, maxBytes = MAX_EVENT_BYTES) => {
	if (!event || typeof event !== "object" || typeof event.type !== "string") {
		return null;
	}
	const cap = maxBytes > 0 ? maxBytes : MAX_EVENT_BYTES;
	let redacted;
	try {
		redacted = redactDeepStrings(event);
	} catch {
		return null;
	}
	const sizeOf = (value) => {
		try {
			return JSON.stringify(value)?.length ?? Infinity;
		} catch {
			return Infinity;
		}
	};
	if (sizeOf(redacted) <= cap) return redacted;
	// Truncate the large free-text payload fields first, keeping the event
	// envelope (type, toolName, meta) so the step stays visible.
	const truncated = { ...redacted };
	for (const field of ["result", "partialResult", "delta", "content", "text", "output"]) {
		if (typeof truncated[field] === "string" && truncated[field].length > 1000) {
			truncated[field] = `${truncated[field].slice(0, 1000)}…[truncated for transport]`;
		}
		if (sizeOf(truncated) <= cap) return truncated;
	}
	return null;
};

/***
 * MARK: textForStructuredEvent
 * @description Legacy text derivation for one structured event — the same two
 *   shapes the pre-structured `onLog` path forwarded
 *   (`assistant_delta.delta`, `harness_log.text`). Returns null for
 *   tool/telemetry/permission/plan events, which have no legacy text form.
 * @example textForStructuredEvent({ type: 'assistant_delta', delta: 'hi' }) => 'hi'
 * @param {Object} event - One normalized session event.
 * @returns {string|null} The legacy text, or null when there is none.
 ***/
export const textForStructuredEvent = (event) => {
	if (!event || typeof event !== "object") return null;
	if (event.type === "assistant_delta" && typeof event.delta === "string") {
		return event.delta;
	}
	if (event.type === "harness_log" && typeof event.text === "string") {
		return event.text;
	}
	return null;
};

/***
 * MARK: createStructuredEventSender
 * @description Buffers sanitized session events and ships them as sequenced
 *   batches. Flushes on `batchSize`, on `flushMs` of quiet, on explicit
 *   `flush()`/`close()`, and immediately on run-closing events
 *   (`run_finished`, `run_error`) so the tail never waits for the timer.
 *   The first send failure flips to text-fallback permanently for this
 *   execution: the failed batch converts to text via `onTextFallback` and
 *   later events are left to the daemon's `onLog` path (`isStructured()`
 *   goes false).
 * @example const sender = createStructuredEventSender({ client, taskId: 't', projectId: 'p', executionId: 'e', epoch: 1, onTextFallback: () => {} })
 * @param {Object} opts - Options.
 * @param {Object} opts.client - Runner backend client with `logEvents`.
 * @param {string} opts.taskId - Task id.
 * @param {string} opts.projectId - Project id.
 * @param {string} opts.executionId - Lease execution id.
 * @param {number} opts.epoch - Lease epoch.
 * @param {Function} [opts.onTextFallback] - Called with legacy text per convertible event after the fallback flip.
 * @param {Object} [opts.logger] - Logger for send warnings.
 * @param {number} [opts.batchSize=25] - Events per batch.
 * @param {number} [opts.flushMs=500] - Quiet-ms before a partial batch ships.
 * @returns {Object} Sender with `queueEvent`, `flush`, `close`, `isStructured`.
 ***/
export const createStructuredEventSender = ({
	client,
	taskId,
	projectId,
	executionId,
	epoch,
	onTextFallback = () => {},
	logger = null,
	batchSize = 25,
	flushMs = 500,
}) => {
	let seq = 0;
	let pending = [];
	let structured = true;
	let timer = null;
	let inFlight = null;

	const warn = (message) => {
		try {
			if (logger && typeof logger.warn === "function") logger.warn(message);
		} catch {
			// Logging must never break the run.
		}
	};

	const clearTimer = () => {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
	};

	const armTimer = () => {
		if (timer || flushMs <= 0) return;
		timer = setTimeout(() => {
			timer = null;
			flush().catch(() => {});
		}, flushMs);
		if (typeof timer.unref === "function") timer.unref();
	};

	const sendBatch = async (batch, batchSeq) => {
		await client.logEvents({
			taskId,
			projectId,
			executionId,
			epoch,
			seq: batchSeq,
			events: batch,
		});
	};

	const fallBack = (failedBatch, err) => {
		structured = false;
		clearTimer();
		pending = [];
		warn(
			`Structured log transport failed (${err?.message || err}); falling back to text frames.`,
		);
		for (const event of failedBatch) {
			const text = textForStructuredEvent(event);
			if (text) {
				try {
					onTextFallback(text);
				} catch {
					// A throwing fallback must never break the run.
				}
			}
		}
	};

	const flush = async () => {
		if (!structured || pending.length === 0) return;
		if (inFlight) {
			await inFlight;
			return;
		}
		const batch = pending;
		pending = [];
		clearTimer();
		const batchSeq = seq;
		seq += 1;
		inFlight = sendBatch(batch, batchSeq).catch((err) => {
			fallBack(batch, err);
		});
		try {
			await inFlight;
		} finally {
			inFlight = null;
		}
		// Events queued while the batch was in flight ship next.
		if (structured && pending.length > 0) {
			await flush();
		}
	};

	const queueEvent = (event) => {
		if (!structured) return;
		const sanitized = sanitizeStructuredEvent(event);
		if (!sanitized) return;
		pending.push(sanitized);
		if (
			event?.type === "run_finished" ||
			event?.type === "run_error" ||
			pending.length >= Math.max(1, batchSize)
		) {
			flush().catch(() => {});
			return;
		}
		armTimer();
	};

	const close = async () => {
		clearTimer();
		await flush();
	};

	const isStructured = () => structured;

	return { queueEvent, flush, close, isStructured };
};
