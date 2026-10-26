// Domain: The Flow — circuit-breaker trip sensors (failures, disk, memory).
// Pure, injectable aggregators: the scheduler feeds probes/timestamps in, the
// sensors decide whether to trip, so WP10 can fault-inject without mocking
// the world and WP2 can later swap the classifier body without callers moving.
import fs from "node:fs";
import os from "node:os";
import { config } from "../config.js";
import {
	isOperatorAbortError,
	isTransientInfrastructureError,
} from "../work/index.js";
import {
	isCircuitEnabled,
	isTripped,
	tripEngine,
} from "./circuitBreaker.js";

/***
 * MARK: freshCircuitSensors
 * @description Zeroed in-memory sensor accumulators. Deliberately NOT
 *   persisted: only the trip decision is durable — a restart starts with a
 *   clean failure window (the trip itself, if still active, already gates
 *   dispatch from the loaded state).
 * @example freshCircuitSensors() => { infra: [], auth: [], memCriticalTicks: 0 }
 * @returns {Object}
 ***/
export function freshCircuitSensors() {
	return { infra: [], auth: [], memCriticalTicks: 0, lastProbe: null };
}

/***
 * MARK: getCircuitSensors
 * @description Returns the store's sensor accumulators, minting them on
 *   first use.
 * @param {Object} store
 * @returns {Object}
 ***/
export function getCircuitSensors(store) {
	if (!store || typeof store !== "object") return freshCircuitSensors();
	if (!store.circuitSensors) store.circuitSensors = freshCircuitSensors();
	return store.circuitSensors;
}

/***
 * MARK: errorSignalText
 * @description Flattens an error (message/stdout/stderr/failureReason) into
 *   one lower-case-free haystack the matchers scan. Total: always a string.
 * @example errorSignalText(new Error("401 unauthorized")) => "401 unauthorized"
 * @param {*} error
 * @returns {string}
 ***/
export function errorSignalText(error) {
	if (!error) return "";
	if (typeof error === "string") return error;
	const parts = [];
	if (typeof error === "object") {
		for (const key of ["message", "stderr", "stdout", "failureReason"]) {
			/* eslint-disable-next-line security/detect-object-injection -- key comes from the fixed field list above */
			const value = error[key];
			if (typeof value === "string" && value) parts.push(value);
		}
	}
	if (parts.length === 0) parts.push(String(error));
	return parts.join("\n");
}

/***
 * MARK: AUTH_FAILURE_SIGNATURE
 * @description Provider authentication rejection signature: revoked/expired
 *   credentials never self-heal by retrying, so a short streak across
 *   distinct tasks is enough to trip. Kept as one exported pattern so the
 *   sensor and its tests agree on exactly what an auth failure is.
 ***/
export const AUTH_FAILURE_SIGNATURE =
	/\[Authentication Error\]|unauthorized|\b401\b|\b403\b|invalid api key|invalid_api_key|authentication failed|api key (?:is )?(?:invalid|revoked|expired)|permission denied/i;

/***
 * MARK: isAuthFailure
 * @description Whether an error carries a provider-authentication signature.
 *   Operator aborts are never auth failures.
 * @example isAuthFailure("[Authentication Error] invalid api key") => true
 * @param {*} error
 * @returns {boolean}
 ***/
export function isAuthFailure(error) {
	if (!error) return false;
	if (isOperatorAbortError(error)) return false;
	return AUTH_FAILURE_SIGNATURE.test(errorSignalText(error));
}

/***
 * MARK: CONNECTION_FAILURE_SIGNATURE
 * @description Shared-connectivity failure signature (host network severed,
 *   provider gateway down). Complementary to `isTransientInfrastructureError`
 *   (which already covers 502/503/504 and socket errors) so the infra window
 *   also catches the unrecoverable-bucket connection strings.
 ***/
export const CONNECTION_FAILURE_SIGNATURE =
	/ECONNREFUSED|ENOTFOUND|ECONNRESET|ENETUNREACH|EAI_AGAIN|ETIMEDOUT|fetch failed|socket hang up|network (?:error|failure|unreachable|reset|timeout)|\[Model Connection Error\]/i;

/***
 * MARK: isInfraLikeFailure
 * @description The narrow infrastructure classifier seam the trip sensors
 *   consume today. Auth failures are excluded (they own a faster sensor) and
 *   deliberate rejections (`failureKind: "rejected"`) are never
 *   infrastructure. WP2 can replace this body with the unified classifier
 *   without changing a single caller.
 * @example isInfraLikeFailure("ECONNREFUSED") => true
 * @param {*} error
 * @param {Object} [opts]
 * @param {string} [opts.failureKind]
 * @returns {boolean}
 ***/
export function isInfraLikeFailure(error, { failureKind } = {}) {
	if (!error) return false;
	if (failureKind === "rejected") return false;
	if (failureKind === "infrastructure") return true;
	if (isOperatorAbortError(error)) return false;
	if (isAuthFailure(error)) return false;
	if (isTransientInfrastructureError(error)) return true;
	return CONNECTION_FAILURE_SIGNATURE.test(errorSignalText(error));
}

/***
 * MARK: CIRCUIT_FAILURE_WINDOW_MS_FALLBACK
 * @description Fallback sliding-window span (ms) used when the configured
 *   `circuitInfraFailureWindowMs` / `circuitAuthFailureWindowMs` is missing
 *   or non-finite (unit doubles, un-loaded config). Must fail CLOSED enough
 *   to trip: without it `pruneWindow` would keep only same-instant entries
 *   and a systemic outage would never accumulate to the threshold.
 * @example CIRCUIT_FAILURE_WINDOW_MS_FALLBACK => 600000
 ***/
export const CIRCUIT_FAILURE_WINDOW_MS_FALLBACK = 600000;

/***
 * MARK: resolveFailureWindowMs
 * @description Reads a configured failure-window span, falling back to
 *   `CIRCUIT_FAILURE_WINDOW_MS_FALLBACK` when the value is missing or
 *   non-finite. A configured 0 keeps its `pruneWindow` meaning (only the
 *   current instant counts).
 * @example resolveFailureWindowMs(undefined) => 600000
 * @param {*} raw
 * @returns {number}
 ***/
export function resolveFailureWindowMs(raw) {
	const parsed = Number(raw);
	return Number.isFinite(parsed) ? parsed : CIRCUIT_FAILURE_WINDOW_MS_FALLBACK;
}

/***
 * MARK: pruneWindow
 * @description Drops window entries older than `windowMs` (using a
 *   non-positive window as "keep everything" is wrong for a circuit breaker,
 *   so a window <= 0 means "only the current instant"). Pure: returns a new
 *   array.
 * @example pruneWindow([{ at: 1 }], 100, 50) => []
 * @param {Array<Object>} entries
 * @param {number} now
 * @param {number} windowMs
 * @returns {Array<Object>}
 ***/
export function pruneWindow(entries, now, windowMs) {
	const span = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 0;
	return entries.filter(
		(entry) => Number.isFinite(entry?.at) && now - entry.at <= span,
	);
}

/***
 * MARK: distinctTaskCount
 * @description Number of distinct task ids in a failure window: the trip
 *   rule counts TASKS, not attempts, so one flaky task can never trip the
 *   globe by itself.
 * @example distinctTaskCount([{ taskId: "a" }, { taskId: "a" }]) => 1
 * @param {Array<Object>} entries
 * @returns {number}
 ***/
export function distinctTaskCount(entries) {
	return new Set(entries.map((entry) => String(entry?.taskId))).size;
}

/***
 * MARK: recordCircuitSuccess
 * @description A stage pass proves the shared infrastructure works: clears
 *   both failure windows (and the memory debouncer). Never trips.
 * @example recordCircuitSuccess(store)
 * @param {Object} store
 ***/
export function recordCircuitSuccess(store) {
	const sensors = getCircuitSensors(store);
	sensors.infra = [];
	sensors.auth = [];
	sensors.memCriticalTicks = 0;
}

/***
 * MARK: recordCircuitFailure
 * @description Feeds one stage failure into the sliding windows and trips the
 *   engine when a threshold is reached. Returns the trip snapshot, or null
 *   when no sensor fired. Auth is evaluated first (fast trip): an auth
 *   failure counts only in the auth window, infra only in the infra window,
 *   so the two thresholds stay independently tunable.
 * @example recordCircuitFailure(store, { taskId: "t1", error: "401" })
 * @param {Object} store
 * @param {Object} opts
 * @param {string} [opts.taskId]
 * @param {*} [opts.error]
 * @param {string} [opts.failureKind]
 * @param {number} [opts.now]
 * @returns {Object|null}
 ***/
export function recordCircuitFailure(
	store,
	{ taskId, error, failureKind, now = Date.now() } = {},
) {
	if (!isCircuitEnabled()) return null;
	// A trip already in force needs no re-evaluation; re-trip escalation is
	// owned by the canary path.
	if (isTripped(store)) return null;
	if (!taskId) return null;
	const sensors = getCircuitSensors(store);
	const entry = { taskId: String(taskId), at: now };

	if (isAuthFailure(error)) {
		if (config?.circuitAuthSensorEnabled === false) return null;
		sensors.auth = pruneWindow(
			[...sensors.auth, entry],
			now,
			resolveFailureWindowMs(config?.circuitAuthFailureWindowMs),
		);
		const threshold = Math.max(
			1,
			Math.floor(Number(config?.circuitAuthFailureThreshold) || 1),
		);
		// Count consecutive auth failures, not distinct tasks only: a
		// provider-wide credential revocation surfaces as repeated failures on
		// WHICHEVER task the single-active scheduler happens to be running, so
		// a distinct-task-only rule would never fire in a one-task queue.
		const total = sensors.auth.length;
		const distinct = distinctTaskCount(sensors.auth);
		if (total >= threshold) {
			return tripEngine(store, {
				reason: `Sustained provider authentication failures (${total} consecutive across ${distinct} distinct task${distinct === 1 ? "" : "s"}, threshold ${threshold})`,
				source: "auto:auth",
				now,
			});
		}
		return null;
	}

	if (!isInfraLikeFailure(error, { failureKind })) return null;
	if (config?.circuitInfraSensorEnabled === false) return null;
	sensors.infra = pruneWindow(
		[...sensors.infra, entry],
		now,
		resolveFailureWindowMs(config?.circuitInfraFailureWindowMs),
	);
	const threshold = Math.max(
		1,
		Math.floor(Number(config?.circuitInfraFailureThreshold) || 1),
	);
	// Consecutive infrastructure failures (the scheduler retries the SAME
	// stage in place, so a systemic outage shows up as a streak on whichever
	// task is running). The distinct-task count is reported for auditability;
	// the trip itself must not depend on the queue rotating tasks, or a
	// one-task queue would walk every retry to a parked `failed`.
	const total = sensors.infra.length;
	const distinct = distinctTaskCount(sensors.infra);
	if (total >= threshold) {
		return tripEngine(store, {
			reason: `Consecutive infrastructure failures (${total} within the window across ${distinct} distinct task${distinct === 1 ? "" : "s"}, threshold ${threshold})`,
			source: "auto:infra",
			now,
		});
	}
	return null;
}

/***
 * MARK: probeMemoryUsagePct
 * @description Host memory-usage percentage using the same math as
 *   `healthChecker.checkDevice` (total − free) / total. Returns null on any
 *   probe failure so callers fail open instead of tripping on a bad read.
 * @example probeMemoryUsagePct() => 42
 * @returns {number|null}
 ***/
export function probeMemoryUsagePct() {
	try {
		const total = os.totalmem();
		const free = os.freemem();
		if (!Number.isFinite(total) || total <= 0) return null;
		return Math.round(((total - free) / total) * 100);
	} catch {
		return null;
	}
}

/***
 * MARK: probeDiskFreeBytes
 * @description Free bytes on the filesystem holding `targetPath` via
 *   `fs.statfsSync` (bavail × bsize = space available to unprivileged
 *   users). Returns null when statfs is unavailable or the path is
 *   unreadable — probe failure must never block dispatch.
 * @example probeDiskFreeBytes("/home") => 53687091200
 * @param {string} targetPath
 * @returns {number|null}
 ***/
export function probeDiskFreeBytes(targetPath) {
	try {
		if (typeof fs.statfsSync !== "function") return null;
		const stats = fs.statfsSync(targetPath);
		const free = Number(stats?.bavail) * Number(stats?.bsize);
		return Number.isFinite(free) ? free : null;
	} catch {
		return null;
	}
}

/***
 * MARK: readSensorProbes
 * @description Reads the live host probes (memory + disk). A probe error
 *   yields null for that signal, which `evaluateResourceSensors` treats as
 *   "no evidence" (fail open).
 * @example readSensorProbes() => { memPct: 42, diskFreeBytes: 53687091200 }
 * @returns {{ memPct: number|null, diskFreeBytes: number|null }}
 ***/
export function readSensorProbes() {
	const target =
		typeof config?.circuitDiskProbePath === "string" && config.circuitDiskProbePath
			? config.circuitDiskProbePath
			: os.homedir();
	return {
		memPct: probeMemoryUsagePct(),
		diskFreeBytes: probeDiskFreeBytes(target),
	};
}

/***
 * MARK: evaluateResourceSensors
 * @description Evaluates the resource trip sensors from injected probe
 *   values (tests) or the live host probes. Disk below the floor trips
 *   immediately; memory at/above the critical percentage must persist for M
 *   consecutive ticks before tripping (GC-spike debouncer). Returns the trip
 *   snapshot, or null. Probe failures fail open. Already-tripped engines
 *   return null without re-tripping (original cause and canary preserved).
 * @example evaluateResourceSensors(store, { probes: { memPct: 99, diskFreeBytes: 1e12 } })
 * @param {Object} store
 * @param {Object} [opts]
 * @param {Object} [opts.probes] - `{ memPct, diskFreeBytes }` overrides.
 * @param {number} [opts.now]
 * @returns {Object|null}
 ***/
export function evaluateResourceSensors(store, { probes, now = Date.now() } = {}) {
	if (!isCircuitEnabled()) return null;
	// A trip already in force needs no re-evaluation: re-tripping here would
	// overwrite the original reason/source and clear a canary in flight.
	// Re-trip escalation is owned by the canary path.
	if (isTripped(store)) return null;
	const sensors = getCircuitSensors(store);
	const resolved = probes || readSensorProbes();
	sensors.lastProbe = { ...resolved, at: new Date(now).toISOString() };

	// Disk floor: a confirmed breach is systemic (no task can write its
	// artifacts), so it trips on first evidence.
	if (config?.circuitDiskSensorEnabled !== false) {
		// Reject null/undefined explicitly: `Number(null)` is 0, which would
		// read as a disk-floor breach and trip on a failed probe.
		const free = Number.isFinite(resolved.diskFreeBytes)
			? resolved.diskFreeBytes
			: NaN;
		const floor = Number.isFinite(config?.circuitDiskFreeFloorBytes)
			? config.circuitDiskFreeFloorBytes
			: NaN;
		if (Number.isFinite(free) && Number.isFinite(floor) && floor > 0 && free < floor) {
			return tripEngine(store, {
				reason: `Host disk free ${formatBytes(free)} is below the ${formatBytes(floor)} safety floor`,
				source: "auto:disk",
				now,
			});
		}
	}

	// Memory: sustained-over-M-ticks, not a single sample.
	if (config?.circuitMemSensorEnabled !== false) {
		const memPct = Number.isFinite(resolved.memPct) ? resolved.memPct : NaN;
		const critical = Number.isFinite(config?.healthMemCriticalPct)
			? config.healthMemCriticalPct
			: NaN;
		const need = Math.max(
			1,
			Math.floor(Number(config?.circuitMemSustainedTicks) || 1),
		);
		if (Number.isFinite(memPct) && Number.isFinite(critical) && memPct >= critical) {
			sensors.memCriticalTicks = (Number(sensors.memCriticalTicks) || 0) + 1;
			if (sensors.memCriticalTicks >= need) {
				return tripEngine(store, {
					reason: `Memory usage ${memPct}% at/above critical ${critical}% for ${sensors.memCriticalTicks} consecutive ticks`,
					source: "auto:memory",
					now,
				});
			}
		} else {
			sensors.memCriticalTicks = 0;
		}
	}
	return null;
}

/***
 * MARK: formatBytes
 * @description Human-readable byte size for trip reasons (binary units).
 * @example formatBytes(1073741824) => "1.0 GiB"
 * @param {number} bytes
 * @returns {string}
 ***/
export function formatBytes(bytes) {
	const value = Number(bytes);
	if (!Number.isFinite(value)) return "unknown";
	const units = ["B", "KiB", "MiB", "GiB", "TiB"];
	let scaled = Math.abs(value);
	let unit = 0;
	while (scaled >= 1024 && unit < units.length - 1) {
		scaled /= 1024;
		unit += 1;
	}
	const sign = value < 0 ? "-" : "";
	const fixed = unit === 0 ? String(Math.round(scaled)) : scaled.toFixed(1);
	/* eslint-disable-next-line security/detect-object-injection -- unit is a bounded numeric index into the fixed units list */
	return `${sign}${fixed} ${units[unit]}`;
}
