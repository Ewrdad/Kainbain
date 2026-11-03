import { redactDeepStrings } from "../shared/redactSecrets.js";

/**
 * MARK: structuredEventSender
 * @description Batches normalized agent session events for the backend
 *   `POST /tasks/:id/log-events` endpoint (structured log transport). The
 *   sender redacts every event before it leaves the Runner (defense in depth
 *   for locally-read secrets), caps oversized payloads, and degrades to
 *   legacy text frames when the backend cannot take structured batches.
 *
 *   Failure policy (fail safe, never lose the log silently):
 *   - 404/405 (old backend without the route) and 400 (a batch the server
 *     refuses — retrying the identical batch would loop) fall back to text
 *     immediately: the failed batch AND everything still queued convert to
 *     text via `onTextFallback`, and later events flow through the daemon's
 *     `onLog` path instead (`isStructured()` goes false).
 *   - Anything else (network errors, timeouts, 5xx, lease conflicts) is
 *     transient: the failed batch is requeued at the FRONT with its SAME
 *     sequence number (the server dedupes a retry of a batch that actually
 *     landed; a fresh number would store the events twice) and a later
 *     flush retries. After MAX_STRUCTURED_SEND_FAILURES consecutive
 *     failures the sender gives up and falls back to text.
 *   - Unexpected fallbacks leave a one-line marker in the text stream so
 *     the UI reader knows the view is degraded; 404/405 (expected version
 *     skew during a mixed-version rollout) degrade silently to the
 *     long-standing coarse text view.
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
 * MARK: MAX_BATCH_EVENTS
 * @description Most events in one transport batch. Mirrors the backend
 *   contract (`executionLedger.ingestLogEvents` rejects batches over 200):
 *   a flush with more queued sends several sequenced batches instead of
 *   one the server would refuse (which would flip the whole run to text).
 * @example MAX_BATCH_EVENTS => 200
 ***/
export const MAX_BATCH_EVENTS = 200;

/***
 * MARK: MAX_STRUCTURED_SEND_FAILURES
 * @description Consecutive transient send failures tolerated before the
 *   sender gives up on structured transport and falls back to text. One
 *   failure is a backend blip (a deploy restart mid-run must not cost the
 *   run its tool detail); this many in a row is an outage, and the text
 *   path preserves the narrative.
 * @example MAX_STRUCTURED_SEND_FAILURES => 5
 ***/
export const MAX_STRUCTURED_SEND_FAILURES = 5;

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
	// Object-shaped payloads (e.g. result {content:[{text}]}) carry their
	// bulk in nested strings: truncate every long string in place (the
	// redacted clone is ours to mutate) before giving up on the event.
	const seen = new Set();
	const truncateDeep = (node) => {
		if (!node || typeof node !== "object" || seen.has(node)) return;
		// Note: Dates and RegExps cannot reach this walker (the redacted
		// clone converts them to strings), and they carry no enumerable
		// keys anyway, so there is deliberately no special case for them.
		seen.add(node);
		for (const key of Object.keys(node)) {
			// Never write __proto__: the redacted clone has none, and
			// assigning it would change the prototype instead of storing.
			if (key === "__proto__") continue;
			// eslint-disable-next-line security/detect-object-injection -- key comes from Object.keys of the walked payload
			const child = node[key];
			if (typeof child === "string" && child.length > 1000) {
				// eslint-disable-next-line security/detect-object-injection -- key comes from Object.keys of the walked payload
				node[key] = `${child.slice(0, 1000)}…[truncated for transport]`;
			} else {
				truncateDeep(child);
			}
		}
	};
	truncateDeep(truncated);
	if (sizeOf(truncated) <= cap) return truncated;
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
 * MARK: describeSendError
 * @description One-line human reading of a transport failure for the runner
 *   log and the UI degradation marker: the HTTP status when the backend
 *   answered, then the message. Never renders "undefined" — a failure the
 *   sender cannot name is reported as an unknown error instead.
 * @example describeSendError(Object.assign(new Error('nope'), { statusCode: 500 })) => 'HTTP 500 nope'
 * @example describeSendError(undefined) => 'unknown error'
 * @param {*} err - Whatever the send threw.
 * @returns {string} The readable cause.
 ***/
export const describeSendError = (err) => {
	const status =
		err && typeof err === "object" && Number.isInteger(err.statusCode)
			? `HTTP ${err.statusCode} `
			: "";
	const message = err?.message || err || "unknown error";
	return `${status}${message}`;
};

/***
 * MARK: isVersionSkewFailure
 * @description Whether a send failure means the backend predates structured
 *   transport (unknown route): the expected state during a mixed-version
 *   rollout, so the sender degrades silently to the coarse text view.
 * @example isVersionSkewFailure(Object.assign(new Error('x'), { statusCode: 404 })) => true
 * @example isVersionSkewFailure(new Error('fetch failed')) => false
 * @param {*} err - Whatever the send threw.
 * @returns {boolean} True for 404/405 answers.
 ***/
export const isVersionSkewFailure = (err) => {
	const status = err?.statusCode;
	return status === 404 || status === 405;
};

/***
 * MARK: isPermanentSendFailure
 * @description Whether a send failure is unretryable: version skew (the
 *   route does not exist there) or a refused batch (retrying the identical
 *   bytes would fail the same way). Anything else is transient and worth
 *   retrying with the same sequence number.
 * @example isPermanentSendFailure(Object.assign(new Error('x'), { statusCode: 400 })) => true
 * @example isPermanentSendFailure(Object.assign(new Error('x'), { statusCode: 500 })) => false
 * @param {*} err - Whatever the send threw.
 * @returns {boolean} True when retrying cannot help.
 ***/
export const isPermanentSendFailure = (err) => {
	if (isVersionSkewFailure(err)) return true;
	return err?.statusCode === 400;
};

/***
 * MARK: createStructuredEventSender
 * @description Buffers sanitized session events and ships them as sequenced
 *   batches of at most `batchSize` events (never more than
 *   MAX_BATCH_EVENTS, the server's per-batch cap). Flushes on `batchSize`
 *   queued, on `flushMs` of quiet, on explicit `flush()`/`close()`, and
 *   immediately on run-closing events (`run_finished`, `run_error`) so the
 *   tail never waits for the timer. `flushMs <= 0` disables the quiet timer
 *   (explicit flush/close only).
 *
 *   Delivery contract: `flush()` drains everything queued, INCLUDING events
 *   that arrived while a batch was in flight — except that a TRANSIENT
 *   send failure ends the pass with the failed batch requeued at the front
 *   (same sequence number; a later flush retries it). `close()` keeps
 *   flushing until the queue is empty, then — only if the backend stayed
 *   unreachable — falls back, so the caller can rely on the tail landing
 *   before it reports the stage complete. Permanent failures (404/405/400)
 *   fall back immediately instead of retrying.
 * @example const sender = createStructuredEventSender({ client, taskId: 't', projectId: 'p', executionId: 'e', epoch: 1, onTextFallback: () => {} })
 * @param {Object} opts - Options.
 * @param {Object} opts.client - Runner backend client with `logEvents`.
 * @param {string} opts.taskId - Task id.
 * @param {string} opts.projectId - Project id.
 * @param {string} opts.executionId - Lease execution id.
 * @param {number} opts.epoch - Lease epoch.
 * @param {Function} [opts.onTextFallback] - Called with legacy text per convertible event after the fallback flip (plus one degradation marker for unexpected failures).
 * @param {Object} [opts.logger] - Logger for send warnings.
 * @param {number} [opts.batchSize=25] - Events queued per batch (clamped to 1–200; non-numeric falls back to 25).
 * @param {number} [opts.flushMs=500] - Quiet-ms before a partial batch ships (<=0 disables; non-numeric falls back to 500).
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
} = {}) => {
	let seq = 0;
	let pending = [];
	let structured = true;
	let timer = null;
	let inFlight = null;
	let consecutiveSendFailures = 0;
	// Rigid tuning: a non-numeric batch size or flush delay falls back to
	// the defaults. Without this a NaN batch size chunks every flush into
	// an empty batch (splice(0, NaN) takes nothing), which the server
	// refuses (400) and flips the whole run to text for no reason.
	const requestedBatchSize = Number.isNaN(batchSize) ? 25 : batchSize;
	const quietMs = Number.isNaN(flushMs) ? 500 : flushMs;
	// One batch never exceeds the server's per-batch cap, however large
	// the caller sizes its batches: an oversized batch would be refused
	// outright (400) and flip the whole run to text.
	const eventsPerBatch = Math.min(
		Math.max(1, requestedBatchSize),
		MAX_BATCH_EVENTS,
	);

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
		if (timer || quietMs <= 0) return;
		timer = setTimeout(() => {
			timer = null;
			flush().catch(() => {});
		}, quietMs);
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
		// Convert everything not yet sent, not just the failed batch: events
		// queued while that batch was in flight were never transported
		// structured and must not vanish during the fallback transition.
		const unsent = [...failedBatch, ...pending];
		pending = [];
		const cause = describeSendError(err);
		warn(`Structured log transport failed (${cause}); falling back to text frames.`);
		// Unexpected outages leave a visible marker so the UI reader knows
		// the view is degraded; version skew (old backend) degrades
		// silently to the long-standing coarse text view.
		if (!isVersionSkewFailure(err)) {
			try {
				onTextFallback(
					`[runner] structured log transport failed (${cause}); showing text only`,
				);
			} catch {
				// A throwing fallback must never break the run.
			}
		}
		for (const event of unsent) {
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
		// Drain loop, not a single pass: events queued while a batch is in
		// flight must ship too. Taking a batch (`pending` splice) is
		// synchronous, so concurrent flushes can never send the same events
		// twice. A flush waits for a batch another caller started even when
		// the queue looks empty: that batch may fail and requeue, and the
		// waiter must see the requeued events, not resolve early. A
		// transient failure ends the pass with the batch requeued (same
		// seq) instead of looping hot against a dead backend — the quiet
		// timer or the next events retry it.
		for (;;) {
			if (!structured) return;
			if (inFlight) {
				await inFlight;
				continue;
			}
			if (pending.length === 0) return;
			const batch = pending.splice(0, eventsPerBatch);
			clearTimer();
			const batchSeq = seq;
			seq += 1;
			let outcome = null;
			inFlight = sendBatch(batch, batchSeq).then(
				() => {
					outcome = { ok: true };
				},
				(err) => {
					outcome = { ok: false, err };
				},
			);
			try {
				await inFlight;
			} finally {
				inFlight = null;
			}
			if (outcome.ok) {
				consecutiveSendFailures = 0;
				continue;
			}
			consecutiveSendFailures += 1;
			if (
				isPermanentSendFailure(outcome.err) ||
				consecutiveSendFailures >= MAX_STRUCTURED_SEND_FAILURES
			) {
				fallBack(batch, outcome.err);
				return;
			}
			// Transient: retry later with the SAME sequence number. The
			// server dedupes a retry of a batch that actually landed (the
			// response may have been lost, not the batch); a fresh number
			// would store the events twice.
			seq = batchSeq;
			pending = [...batch, ...pending];
			warn(
				`Structured log transport failed (${describeSendError(outcome.err)}); will retry ${pending.length} queued event(s).`,
			);
			armTimer();
			return;
		}
	};

	const queueEvent = (event) => {
		if (!structured) return;
		const closesRun = event?.type === "run_finished" || event?.type === "run_error";
		const sanitized = sanitizeStructuredEvent(event);
		if (!sanitized) {
			// A dropped closing event must still flush what is already
			// queued: the tail must never wait for the timer just because
			// the final envelope was oversized or unusable.
			if (closesRun) flush().catch(() => {});
			return;
		}
		pending.push(sanitized);
		if (closesRun || pending.length >= Math.max(1, requestedBatchSize)) {
			flush().catch(() => {});
			return;
		}
		armTimer();
	};

	const close = async () => {
		clearTimer();
		// Close is the last trigger, so it retries the drain itself: a
		// transient failure leaves events queued for "a later flush" that
		// would never come. Each failing pass counts toward the bound, so
		// a dead backend still terminates — by falling back, which attempts
		// the tail as text rather than dropping it silently.
		for (;;) {
			await flush();
			if (!structured || pending.length === 0) return;
		}
	};

	const isStructured = () => structured;

	return { queueEvent, flush, close, isStructured };
};
