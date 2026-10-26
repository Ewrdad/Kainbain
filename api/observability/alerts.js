// Domain: Observability — one seam for every human-intervention alert.
import { config } from "../config.js";
import {
	classifyStageError,
	isOperatorAbortError,
	isTransientInfrastructureError,
	isUnrecoverableError,
} from "../work/taskErrors.js";
import { WebhookNotifier } from "./webhookNotifier.js";

/***
 * MARK: alert envelope version
 * @description Version of the webhook envelope below. Receivers switch on
 *   this before reading any other field, so future envelope changes stay
 *   backward compatible.
 * @example ALERT_VERSION => 1
 ***/
export const ALERT_VERSION = 1;

/***
 * MARK: alert events
 * @description Every alert the engine can raise. `task.failed` is an
 *   unscheduled intervention (nobody planned for a human to step in);
 *   `task.checkpoint_wait` is a scheduled checkpoint the flow designed for.
 *   The two are never interchangeable: receivers page on the first and
 *   merely note the second.
 * @example ALERT_EVENTS.includes('task.failed') => true
 ***/
export const ALERT_EVENTS = Object.freeze([
	"task.failed",
	"task.checkpoint_wait",
	"engine.trip",
	"engine.reset",
	"deploy.rollback",
	"stage.failback_warning",
]);

/***
 * MARK: alert severities
 * @description How urgently a human should look: `critical` pages,
 *   `warning` nudges, `info` only records. A scheduled checkpoint is
 *   always `info`; an unscheduled park is always `critical`.
 * @example ALERT_SEVERITIES.includes('critical') => true
 ***/
export const ALERT_SEVERITIES = Object.freeze(["info", "warning", "critical"]);

/***
 * MARK: error kinds
 * @description Classified failure kinds carried on every alert. Matches the
 *   WP2 `classifyStageError` vocabulary; the legacy matchers remain as a
 *   defensive fallback and yield the same four kinds.
 * @example ERROR_KINDS.includes('transient') => true
 ***/
export const ERROR_KINDS = Object.freeze([
	"transient",
	"unrecoverable",
	"operator-abort",
	"logical",
]);

/***
 * MARK: failback warning thresholds
 * @description Fractions of the auto-iteration budget where the engine
 *   warns BEFORE the budget runs out, so a human can step in early instead
 *   of meeting another parked task. Each threshold fires once per task.
 * @example FAILBACK_WARNING_THRESHOLDS => [50, 75]
 ***/
export const FAILBACK_WARNING_THRESHOLDS = Object.freeze([50, 75]);

/***
 * MARK: resolveErrorKind
 * @description Classifies a stage error into the alert vocabulary. WP2's
 *   `classifyStageError` is the single taxonomy and is used whenever it
 *   yields a known kind; the legacy matchers remain as a defensive fallback
 *   for malformed inputs so an alert is still correct (not lost) if the
 *   taxonomy ever fails a shape it does not recognise. Operator aborts come
 *   first (they settle quietly and must never page); transient infrastructure
 *   failures retry in place; unrecoverable ones park immediately; everything
 *   else is ordinary stage logic failing.
 * @example resolveErrorKind(new Error('socket hang up')) => 'transient'
 * @param {string|Error} [error] - The failure to classify.
 * @returns {string} One of `transient|unrecoverable|operator-abort|logical`.
 ***/
export function resolveErrorKind(error) {
	try {
		const classified = classifyStageError?.(error);
		if (classified?.kind && ERROR_KINDS.includes(classified.kind)) {
			return classified.kind;
		}
	} catch {
		// Fall through to the legacy matchers.
	}
	if (isOperatorAbortError(error)) return "operator-abort";
	if (isTransientInfrastructureError(error)) return "transient";
	if (isUnrecoverableError(error)) return "unrecoverable";
	return "logical";
}

/***
 * MARK: resolveErrorClassification
 * @description The full WP2 classification (`{ kind, signal, retryable }`)
 *   for one error, with the same legacy fallback as `resolveErrorKind`. The
 *   `signal` travels on the alert payload so a receiver can route on the
 *   precise cause (e.g. `context-overflow`) not just the coarse kind.
 * @example resolveErrorClassification('connect ECONNREFUSED') => { kind: 'transient', signal: 'connection-refused', retryable: true }
 * @param {string|Error} [error] - The failure to classify.
 * @returns {{ kind: string, signal: string, retryable: boolean }}
 ***/
export function resolveErrorClassification(error) {
	try {
		const classified = classifyStageError?.(error);
		if (classified?.kind && ERROR_KINDS.includes(classified.kind)) {
			return {
				kind: classified.kind,
				signal: classified.signal || "unknown",
				retryable: classified.retryable === true,
			};
		}
	} catch {
		// Fall through to the legacy matchers.
	}
	const kind = resolveErrorKind(error);
	return {
		kind,
		signal: kind === "operator-abort" ? "operator-abort" : "legacy",
		retryable: kind === "transient",
	};
}

/***
 * MARK: resolveAlertSeverity
 * @description Maps a parked task status to its paging severity, so
 *   scheduled and unscheduled human handoffs can never share one.
 *   Operator aborts resolve to null: they are deliberate, never alerts.
 * @example resolveAlertSeverity('failed') => 'critical'
 * @example resolveAlertSeverity('waiting_human') => 'info'
 * @param {string} [status] - Task status after settling (`failed|waiting_human`).
 * @param {string} [kind] - Classified error kind (operator aborts suppress).
 * @returns {string|null} `critical|info`, or null when nothing should page.
 ***/
export function resolveAlertSeverity(status, kind) {
	if (kind === "operator-abort") return null;
	if (status === "failed") return "critical";
	if (status === "waiting_human") return "info";
	return null;
}

/***
 * MARK: toAlertText
 * @description Coerces one free-text alert field to a string without ever
 *   producing `"[object Object]"`: strings pass through, Error values yield
 *   their message, other objects JSON-encode (falling back to `String()` when
 *   circular), and scalars stringify. Receivers always get readable text.
 * @example toAlertText(new Error('boom')) => 'boom'
 * @example toAlertText({ code: 500 }) => '{"code":500}'
 * @param {*} value - The raw field value.
 * @returns {string} Readable text for the envelope.
 ***/
export function toAlertText(value) {
	if (typeof value === "string") return value;
	if (value instanceof Error) return value.message || String(value);
	if (value && typeof value === "object") {
		try {
			return JSON.stringify(value);
		} catch {
			return String(value);
		}
	}
	return String(value);
}

/***
 * MARK: buildAlertPayload
 * @description Builds the signed webhook envelope for one alert: version,
 *   event, severity, timestamp, task/stage identity, classified error, the
 *   head+tail excerpt, and whatever structured report fields are known.
 *   Unknown, undefined, or null fields are dropped, so callers pass what
 *   they have (SHAs, conflict files, attempt counts) without shape-guessing.
 *   Throws on a bad event/severity — use `validateAlertPayload` to check
 *   without throwing, and `emitAlert` (which never throws) on task paths.
 * @example buildAlertPayload({ event: 'task.failed', severity: 'critical' }).version => 1
 ***/
export function buildAlertPayload({
	event,
	severity,
	projectId,
	taskId,
	taskTitle,
	stage,
	kind,
	message,
	signal,
	excerpt,
	attemptCounts,
	shas,
	conflictedFiles,
	links,
	occurredAt,
} = {}) {
	if (!ALERT_EVENTS.includes(event)) {
		throw new TypeError(
			`unknown alert event "${event}" (want one of ${ALERT_EVENTS.join("|")})`,
		);
	}
	if (!ALERT_SEVERITIES.includes(severity)) {
		throw new TypeError(
			`unknown alert severity "${severity}" (want one of ${ALERT_SEVERITIES.join("|")})`,
		);
	}
	const present = (value) => value !== undefined && value !== null;
	const payload = {
		version: ALERT_VERSION,
		event,
		severity,
		occurredAt:
			typeof occurredAt === "string" && occurredAt
				? occurredAt
				: new Date().toISOString(),
	};
	if (present(projectId) || present(taskId) || present(taskTitle)) {
		payload.task = {};
		if (present(projectId)) payload.task.projectId = projectId;
		if (present(taskId)) payload.task.id = taskId;
		if (present(taskTitle)) payload.task.title = taskTitle;
	}
	if (present(stage)) {
		if (typeof stage === "string") {
			payload.stage = { id: stage, name: stage };
		} else {
			payload.stage = {};
			if (present(stage.id)) payload.stage.id = stage.id;
			if (present(stage.name)) payload.stage.name = stage.name;
			if (present(stage.type)) payload.stage.type = stage.type;
		}
	}
	if (present(kind) || present(message) || present(signal)) {
		payload.error = {};
		if (present(kind)) payload.error.kind = kind;
		if (present(message)) payload.error.message = toAlertText(message);
		if (present(signal)) payload.error.signal = toAlertText(signal);
	}
	if (present(attemptCounts)) payload.attemptCounts = attemptCounts;
	if (present(shas)) payload.shas = shas;
	if (present(conflictedFiles)) payload.conflictedFiles = conflictedFiles;
	if (present(excerpt)) payload.excerpt = excerpt;
	if (present(links)) payload.links = links;
	return payload;
}

/***
 * MARK: pickBoundedStrings
 * @description Copies the named string properties of `source` into a fresh
 *   object, trimming and bounding each to `maxLength`. Non-strings, blank
 *   strings, missing keys, and non-object sources are dropped (never
 *   coerced), so payload builders can pass whatever they have without
 *   shape-guessing or leaking an unbounded value into an alert/file. Total:
 *   never throws.
 * @example pickBoundedStrings({ a: ' x ', b: 1 }, ['a', 'b', 'c']) => { a: 'x' }
 * @param {unknown} source - Object to read from.
 * @param {string[]} keys - Property names to copy.
 * @param {number} [maxLength] - Maximum retained string length.
 * @returns {Object} Bounded copy.
 ***/
export function pickBoundedStrings(source, keys, maxLength = 500) {
	const picked = {};
	try {
		if (!source || typeof source !== "object" || Array.isArray(source)) {
			return picked;
		}
		const limit =
			Number.isInteger(maxLength) && maxLength > 0 ? maxLength : 500;
		for (const key of Array.isArray(keys) ? keys : []) {
			if (typeof key !== "string" || !key) continue;
			/* eslint-disable-next-line security/detect-object-injection -- key is a fixed literal from the caller, never from input */
			const value = source[key];
			if (typeof value === "string" && value.trim()) {
				/* eslint-disable-next-line security/detect-object-injection -- key is a fixed literal from the caller, never from input */
				picked[key] = value.trim().slice(0, limit);
			}
		}
	} catch {
		// Return whatever was copied before the failure.
	}
	return picked;
}

/***
 * MARK: validateAlertPayload
 * @description Checks a decoded webhook envelope without throwing, so
 *   receivers and contract tests can assert the schema in one call.
 * @example validateAlertPayload({}) => ['version …', …]
 * @param {Object} [payload] - Decoded JSON envelope to check.
 * @returns {string[]} Human-readable problems; empty means valid.
 ***/
export function validateAlertPayload(payload) {
	const problems = [];
	if (!payload || typeof payload !== "object") return ["payload must be an object"];
	if (payload.version !== ALERT_VERSION) {
		problems.push(`version must be ${ALERT_VERSION}`);
	}
	if (!ALERT_EVENTS.includes(payload.event)) {
		problems.push(`event must be one of ${ALERT_EVENTS.join("|")}`);
	}
	if (!ALERT_SEVERITIES.includes(payload.severity)) {
		problems.push(`severity must be one of ${ALERT_SEVERITIES.join("|")}`);
	}
	if (typeof payload.occurredAt !== "string" || !payload.occurredAt) {
		problems.push("occurredAt must be an ISO timestamp string");
	} else if (Number.isNaN(Date.parse(payload.occurredAt))) {
		problems.push("occurredAt must parse as a date");
	}
	if (payload.task !== undefined) {
		if (typeof payload.task !== "object" || payload.task === null) {
			problems.push("task must be an object when present");
		} else if (payload.task.id === undefined && payload.task.projectId === undefined) {
			problems.push("task must carry an id or projectId");
		}
	}
	if (
		payload.error?.kind !== undefined &&
		!ERROR_KINDS.includes(payload.error.kind)
	) {
		problems.push(`error.kind must be one of ${ERROR_KINDS.join("|")}`);
	}
	return problems;
}

/***
 * MARK: alert sink registry
 * @description Extra `Notifier` sinks (`{ name, send }`) fanned out to
 *   beside the configured webhook — tests register stubs here, and later
 *   Slack/email adapters will plug in the same way without touching
 *   `emitAlert`.
 ***/
const alertSinks = [];

/***
 * MARK: registerAlertSink
 * @description Adds one sink to the fan-out. Returns an unregister
 *   function; tests use it (or `clearAlertSinks`) to stay isolated.
 * @example const stop = registerAlertSink({ name: 't', send: async () => ({}) })
 * @param {Object} sink - `{ name, send(payload) }`.
 * @returns {Function} Unregister function.
 ***/
export function registerAlertSink(sink) {
	if (!sink || typeof sink.send !== "function") {
		throw new TypeError("alert sink must be an object with a send(payload) function");
	}
	const unregister = () => {
		const at = alertSinks.indexOf(sink);
		if (at >= 0) alertSinks.splice(at, 1);
	};
	// Registering the same sink twice pages twice per alert (operational
	// noise with zero extra coverage): the second registration is a no-op
	// returning the same unregister handle.
	if (alertSinks.includes(sink)) return unregister;
	alertSinks.push(sink);
	return unregister;
}

/***
 * MARK: clearAlertSinks
 * @description Removes every registered sink. Test isolation only.
 * @example clearAlertSinks() => (registry empty)
 ***/
export function clearAlertSinks() {
	alertSinks.length = 0;
}

/***
 * MARK: resolveAlertConfig
 * @description Reads the outbound-alert knobs: webhook URL (empty means
 *   the sink stays off and nothing is fetched), HMAC secret, retry budget,
 *   backoff base, and per-attempt timeout. Explicit overrides win, which
 *   is how tests point the sink at a stub without touching env. Counts and
 *   timeouts are coerced to finite non-negative numbers (garbage falls back
 *   to the schema defaults), so a bad env value degrades to defaults rather
 *   than NaN budgets or unbounded loops.
 * @example resolveAlertConfig({ url: 'https://hooks.home/a' }).retries => 3
 ***/
export function resolveAlertConfig(overrides = {}) {
	const merged = {
		url: config.alertWebhookUrl || "",
		secret: config.alertWebhookSecret || "",
		retries: config.alertRetries,
		baseMs: config.alertRetryBaseMs,
		timeoutMs: config.alertTimeoutMs,
		...(overrides && typeof overrides === "object" ? overrides : {}),
	};
	const coerceCount = (value, fallback) => {
		const parsed = Math.floor(Number(value));
		return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
	};
	const coerceMs = (value, fallback) => {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
	};
	return {
		url: typeof merged.url === "string" ? merged.url.trim() : "",
		secret: typeof merged.secret === "string" ? merged.secret : "",
		retries: coerceCount(merged.retries, 3),
		baseMs: coerceMs(merged.baseMs, 500),
		timeoutMs: coerceMs(merged.timeoutMs, 5000),
	};
}

/***
 * MARK: emitAlert
 * @description The one seam every alert-worthy outcome flows through. It
 *   relays the caller's UI emission exactly as today (WebSocket path
 *   untouched), then fans the envelope out to the registered sinks plus
 *   the configured webhook — fire-and-forget with everything caught, so a
 *   dead sink leaves task status and timeline identical. The UI relay runs
 *   BEFORE envelope validation, so a malformed envelope can never swallow
 *   the dashboard event the caller already promised. Resolves, never
 *   rejects; task paths call it detached (`void emitAlert(…)`). The one
 *   side effect beyond the sinks: a CONFIGURED webhook that cannot deliver
 *   is logged to stderr (`console.error`) so a broken alert channel is not
 *   itself silent — logging is guarded and never affects the outcome.
 * @example await emitAlert(null, { event: 'task.failed', severity: 'critical' }) => { delivered: false, … }
 * @param {Object} [bridge] - EventBridge for the UI relay (null skips it).
 * @param {Object} [fields] - Envelope fields plus optional `ui: { event, payload }` relay.
 * @param {Object} [opts] - `{ alertConfig, fetchImpl }` overrides (tests).
 * @returns {Promise<{ delivered: boolean, attempted: number, results: Object[], skipped: string|null }>}
 ***/
export async function emitAlert(bridge, fields = {}, opts = {}) {
	const outcome = { delivered: false, attempted: 0, results: [], skipped: null };
	const input = fields && typeof fields === "object" ? fields : {};
	// Task paths pass opts through from several layers; a null/non-object
	// opts must degrade to defaults, never drop an alert the sinks would
	// otherwise deliver (observed: null opts skipped with a TypeError
	// message while a healthy sink sat registered).
	const options = opts && typeof opts === "object" ? opts : {};
	// UI relay first, synchronously, exactly as the caller would have
	// emitted it: synchronous callers (e.g. moveToStage) keep their
	// observable ordering, an invalid envelope never swallows the UI event,
	// and a UI failure never blocks the sinks.
	try {
		if (input.ui && bridge) {
			const relayed = bridge.emitProcessEvent?.(
				input.projectId,
				input.ui.event,
				input.ui.payload,
			);
			if (relayed && typeof relayed.catch === "function") {
				relayed.catch(() => {});
			}
		}
	} catch {
		// UI must never break alerting either.
	}
	let payload = null;
	try {
		const envelope = { ...input };
		delete envelope.ui;
		payload = buildAlertPayload(envelope);
	} catch (error) {
		outcome.skipped = error?.message || String(error || "invalid alert");
		return outcome;
	}
	const sinks = [...alertSinks];
	try {
		// One coercion path: resolveAlertConfig owns defaults and
		// garbage-tolerance, so a partial override (e.g. `{ url }` alone)
		// keeps the remaining defaults instead of spreading undefined over
		// them. Non-object overrides degrade to defaults, never to no-sinks.
		const alertConfig = resolveAlertConfig(options.alertConfig);
		if (alertConfig.url) {
			sinks.push(
				new WebhookNotifier({ ...alertConfig, fetchImpl: options.fetchImpl }),
			);
		}
	} catch (error) {
		outcome.skipped = error?.message || String(error || "sink setup failed");
		return outcome;
	}
	if (sinks.length === 0) {
		outcome.skipped = "no sinks configured";
		return outcome;
	}
	for (const sink of sinks) {
		try {
			const result = await sink.send(payload);
			outcome.attempted += 1;
			outcome.results.push({ sink: sink?.name || "sink", ...result });
			if (result?.delivered) outcome.delivered = true;
		} catch (error) {
			outcome.attempted += 1;
			outcome.results.push({
				sink: sink?.name || "sink",
				delivered: false,
				attempts: 0,
				lastError: error?.message || String(error || "sink failed"),
			});
		}
	}
	// A configured outbound webhook that cannot deliver is an operational
	// blind spot — the silent-parked-failure class WP7 exists to close — so
	// it is surfaced on stderr. The task path still settles identically; a
	// broken console must never break alerting either, hence the guard.
	const failedWebhook = outcome.results.find(
		(result) => result?.sink === "webhook" && result.delivered === false,
	);
	if (failedWebhook) {
		try {
			console.error(
				`[alerts] outbound webhook delivery failed after ${failedWebhook.attempts} attempt(s): ${failedWebhook.lastError}`,
			);
		} catch {
			// Logging is best-effort; the outcome is still returned.
		}
	}
	return outcome;
}

/***
 * MARK: notifyEngineTrip
 * @description Raises the circuit-breaker trip alert (`critical`). The WP1
 *   breaker calls this from its trip path (`circuitBreaker.js`); covered
 *   by contract tests meanwhile.
 * @example await notifyEngineTrip(null, { reason: '5 failures in a row' }) => { delivered: false, … }
 ***/
export async function notifyEngineTrip(bridge, { reason, source } = {}, opts = {}) {
	return emitAlert(
		bridge,
		{
			event: "engine.trip",
			severity: "critical",
			message: reason || "engine circuit tripped",
			...(source !== undefined ? { links: { source } } : {}),
		},
		opts,
	);
}

/***
 * MARK: notifyEngineReset
 * @description Raises the circuit-breaker recovery notice (`info`).
 *   Called from the breaker's reset path (`circuitBreaker.js`).
 * @example await notifyEngineReset(null, { reason: 'manual reset' }) => { delivered: false, … }
 ***/
export async function notifyEngineReset(bridge, { reason } = {}, opts = {}) {
	return emitAlert(
		bridge,
		{
			event: "engine.reset",
			severity: "info",
			message: reason || "engine circuit reset",
		},
		opts,
	);
}

/***
 * MARK: notifyDeployRollback
 * @description Raises the deploy-rollback alert (`critical`): the live
 *   build was just rewound to the last known-good deployment, which a
 *   watching operator would otherwise only notice from the version flip.
 * @example await notifyDeployRollback(null, { pid: 123 }) => { delivered: false, … }
 ***/
export async function notifyDeployRollback(
	bridge,
	{ pid, build, sha, reason } = {},
	opts = {},
) {
	return emitAlert(
		bridge,
		{
			event: "deploy.rollback",
			severity: "critical",
			message: reason || "deploy rolled back to the last known-good build",
			...(pid !== undefined || build !== undefined || sha !== undefined
				? {
						links: {
							...(pid !== undefined ? { pid } : {}),
							...(build !== undefined ? { build } : {}),
							...(sha !== undefined ? { sha } : {}),
						},
					}
				: {}),
		},
		opts,
	);
}

/***
 * MARK: sanitizeFailbackWarnings
 * @description Normalizes persisted or in-memory failback-warning state to a
 *   clean list of fired threshold percents. Corrupt, missing, or
 *   foreign-shaped values collapse to `[]` (fail-safe — an unreadable ledger
 *   simply warns again rather than crashing the retry path or skipping a
 *   warning forever). Only the known `FAILBACK_WARNING_THRESHOLDS` survive,
 *   deduplicated, so a hand-edited task file cannot inject phantom
 *   thresholds. Accepts the live array, the JSON string the task file
 *   carries, and numeric strings.
 * @example sanitizeFailbackWarnings('[50]') => [50]
 * @example sanitizeFailbackWarnings('corrupt') => []
 * @param {*} value - Raw stored value (array or JSON string).
 * @returns {number[]} Clean list of fired threshold percents.
 ***/
export function sanitizeFailbackWarnings(value) {
	let raw = value;
	if (typeof raw === "string") {
		const trimmed = raw.trim();
		if (!trimmed) return [];
		try {
			raw = JSON.parse(trimmed);
		} catch {
			return [];
		}
	}
	if (!Array.isArray(raw)) return [];
	const clean = [];
	for (const entry of raw) {
		const pct = typeof entry === "string" ? Number(entry) : entry;
		if (
			FAILBACK_WARNING_THRESHOLDS.includes(pct) &&
			!clean.includes(pct)
		) {
			clean.push(pct);
		}
	}
	return clean;
}

/***
 * MARK: maybeEmitFailbackWarning
 * @description Warns (`warning`, not paging) when repeated failbacks burn
 *   past half — then three-quarters — of the auto-iteration budget, so a
 *   human can intervene before the task parks. Edge-triggered: each
 *   threshold fires once per task for the life of the current attempt,
 *   tracked on the in-memory task and cleared by `resetFailbackWarnings`
 *   (called from `resetAttemptBudgets`) when a fresh attempt begins. Never
 *   rejects; task paths call it detached.
 * @example await maybeEmitFailbackWarning(null, { task, attempt: 4, maxAttempts: 8 }) => { warned: true, … }
 ***/
export async function maybeEmitFailbackWarning(
	bridge,
	{ projectId, task, stage, attempt, maxAttempts, error } = {},
	opts = {},
) {
	const outcome = { warned: false, thresholds: [] };
	try {
		const kind = resolveErrorKind(error);
		if (kind === "operator-abort") return outcome;
		const budget = Math.floor(Number(maxAttempts) || 0);
		const count = Math.floor(Number(attempt) || 0);
		if (
			!task ||
			typeof task !== "object" ||
			Array.isArray(task) ||
			budget <= 0 ||
			count <= 0
		) {
			return outcome;
		}
		// Normalize (not just type-check): a task rehydrated from disk or
		// carrying foreign-shaped state still edge-triggers correctly, and
		// phantom thresholds from a hand-edited file cannot fire.
		task.failbackWarningsSent = sanitizeFailbackWarnings(task.failbackWarningsSent);
		for (const pct of FAILBACK_WARNING_THRESHOLDS) {
			const threshold = Math.ceil((budget * pct) / 100);
			if (count >= threshold && !task.failbackWarningsSent.includes(pct)) {
				task.failbackWarningsSent.push(pct);
				outcome.thresholds.push(pct);
			}
		}
		if (outcome.thresholds.length === 0) return outcome;
		outcome.warned = true;
		const stageId = typeof stage === "string" ? stage : stage?.id;
		const stageName =
			typeof stage === "string" ? stage : stage?.name || stage?.id;
		await emitAlert(
			bridge,
			{
				event: "stage.failback_warning",
				severity: "warning",
				projectId,
				taskId: task.id,
				...(stageId !== undefined
					? { stage: { id: stageId, ...(stageName ? { name: stageName } : {}) } }
					: {}),
				kind,
				message: `task used ${count}/${budget} auto-iterations (thresholds ${outcome.thresholds.join(", ")}%)`,
				attemptCounts: { attempt: count, maxAttempts: budget },
			},
			opts,
		);
	} catch {
		// Warnings must never break the retry path.
	}
	return outcome;
}

/***
 * MARK: resetFailbackWarnings
 * @description Clears a task's fired failback-warning thresholds so the
 *   next genuine attempt warns again. Called from `resetAttemptBudgets`.
 * @example resetFailbackWarnings(task) => (task.failbackWarningsSent gone)
 * @param {Object} [task] - Task whose warning state resets.
 ***/
export function resetFailbackWarnings(task) {
	if (task && typeof task === "object" && "failbackWarningsSent" in task) {
		delete task.failbackWarningsSent;
	}
}
