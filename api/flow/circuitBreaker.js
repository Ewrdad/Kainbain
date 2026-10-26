// Domain: The Flow — global engine containment (Tier 5 circuit breaker).
// Owns the persisted trip/reset state that gates every dispatch, the
// half-open canary probe, and the EventBridge surfaces operators watch.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { config } from "../config.js";
import { _atomicWriteFileSync } from "../house/index.js";
import { notifyEngineReset, notifyEngineTrip } from "../observability/alerts.js";

/***
 * MARK: CIRCUIT_STATE_VERSION
 * @description Schema version stamped on the durable containment state file.
 *   Bumped only when the persisted shape changes incompatibly; a mismatch
 *   loads as a fresh (un-tripped) state rather than guessing.
 * @example CIRCUIT_STATE_VERSION => 1
 ***/
export const CIRCUIT_STATE_VERSION = 1;

/***
 * MARK: ENGINE_STATE_EVENT
 * @description EventBridge broadcast type emitted on every trip and reset so
 *   the UI banner and future webhook sinks (WP7) observe one canonical event.
 * @example ENGINE_STATE_EVENT => "ENGINE_STATE"
 ***/
export const ENGINE_STATE_EVENT = "ENGINE_STATE";

/***
 * MARK: freshCircuitState
 * @description Creates the zeroed containment state. Kept as an explicit
 *   factory so every load path (missing file, corrupt JSON, version
 *   mismatch) converges on the same shape and the gate predicate never has
 *   to null-check.
 * @example freshCircuitState().tripped => false
 * @returns {Object}
 ***/
export function freshCircuitState() {
	return {
		version: CIRCUIT_STATE_VERSION,
		tripped: false,
		reason: null,
		source: null,
		trippedAt: null,
		tripOperator: null,
		resetReason: null,
		resetAt: null,
		resetSource: null,
		resetOperator: null,
		canaryTaskId: null,
		canaryProjectId: null,
		canaryStartedAt: null,
		probeCooldownUntil: null,
		probeBackoffMs: 0,
		tripCount: 0,
		canarySuccessCount: 0,
		canaryFailureCount: 0,
		lastTrip: null,
		updatedAt: null,
	};
}

/***
 * MARK: normalizeCircuitState
 * @description Coerces one parsed state object onto the fresh shape, keeping
 *   only known fields and dropping anything a future/corrupt writer added.
 *   Total: a non-object reads as a fresh state. Version mismatch resets.
 * @example normalizeCircuitState({ tripped: true }).tripped => true
 * @param {*} raw
 * @returns {Object}
 ***/
export function normalizeCircuitState(raw) {
	const fresh = freshCircuitState();
	if (!raw || typeof raw !== "object") return fresh;
	if (Number(raw.version) !== CIRCUIT_STATE_VERSION) return fresh;
	for (const key of Object.keys(fresh)) {
		if (Object.prototype.hasOwnProperty.call(raw, key)) {
			/* eslint-disable-next-line security/detect-object-injection -- key comes from the fixed freshCircuitState field list */
			fresh[key] = raw[key];
		}
	}
	fresh.tripped = raw.tripped === true;
	return fresh;
}

/***
 * MARK: resolveCircuitStatePath
 * @description Resolves the durable containment-state file: an explicit
 *   `store.circuitStatePath` (tests) wins, then the schema's
 *   `circuitStateFile` (env `KAINBAIN_CIRCUIT_STATE_FILE`), then the
 *   conventional `~/.kainbain/engine/circuit.json`.
 * @example resolveCircuitStatePath({ circuitStatePath: "/tmp/c.json" }) => "/tmp/c.json"
 * @param {Object} [store]
 * @param {string} [explicit]
 * @returns {string}
 ***/
export function resolveCircuitStatePath(store, explicit) {
	if (typeof explicit === "string" && explicit.trim()) return explicit;
	if (typeof store?.circuitStatePath === "string" && store.circuitStatePath.trim()) {
		return store.circuitStatePath;
	}
	const configured = config?.circuitStateFile;
	if (typeof configured === "string" && configured.trim()) return configured;
	return path.join(os.homedir(), ".kainbain", "engine", "circuit.json");
}

/***
 * MARK: getCircuitState
 * @description Returns the store's live containment state, minting a fresh
 *   in-memory one on first read. Never touches disk — callers that need
 *   durability across restarts call `loadCircuitState` at boot.
 * @example getCircuitState(store).tripped => false
 * @param {Object} store
 * @returns {Object}
 ***/
export function getCircuitState(store) {
	if (!store || typeof store !== "object") return freshCircuitState();
	if (!store.circuitState) store.circuitState = freshCircuitState();
	return store.circuitState;
}

/***
 * MARK: isTripped
 * @description The one dispatch-gate predicate every caller shares: whether
 *   the engine is currently in Tier-5 containment. Total by design so a
 *   caller with a partial store (unit doubles) reads as un-tripped.
 * @example isTripped(store) => false
 * @param {Object} [store]
 * @returns {boolean}
 ***/
export function isTripped(store) {
	try {
		return store?.circuitState?.tripped === true;
	} catch {
		return false;
	}
}

/***
 * MARK: isCircuitEnabled
 * @description Whether the circuit breaker is switched on at all
 *   (`KAINBAIN_CIRCUIT_ENABLED`). Disabled means no auto-trip and no gate;
 *   the manual `/engine/trip` route honours the disabled switch too, so an
 *   operator can always run with containment off.
 * @example isCircuitEnabled() => true
 * @returns {boolean}
 ***/
export function isCircuitEnabled() {
	return config?.circuitBreakerEnabled !== false;
}

/***
 * MARK: loadCircuitState
 * @description Loads the durable containment state at boot. A missing file
 *   reads as fresh; a corrupt/unreadable file reads as fresh (fail-open on
 *   containment: never brick boot because a JSON file rotted) and is
 *   reported through the optional `onError` seam. The resolved path is
 *   cached on the store so later saves target the same file.
 * @example loadCircuitState(store) => { tripped: false, ... }
 * @param {Object} store
 * @param {Object} [opts]
 * @param {string} [opts.statePath] - Explicit file path (tests).
 * @param {Function} [opts.onError] - Called with the read/parse error.
 * @returns {Object} The loaded state.
 ***/
export function loadCircuitState(store, { statePath, onError } = {}) {
	const file = resolveCircuitStatePath(store, statePath);
	let loaded = freshCircuitState();
	try {
		/* eslint-disable-next-line security/detect-non-literal-fs-filename -- path is the operator-configured circuit state file, not user-supplied */
		if (fs.existsSync(file)) {
			/* eslint-disable-next-line security/detect-non-literal-fs-filename -- path is the operator-configured circuit state file, not user-supplied */
			const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
			loaded = normalizeCircuitState(parsed);
		}
	} catch (err) {
		loaded = freshCircuitState();
		try {
			onError?.(err);
		} catch {
			// Reporting must never break the load.
		}
	}
	if (store && typeof store === "object") {
		store.circuitState = loaded;
		store.circuitStatePath = file;
	}
	return loaded;
}

/***
 * MARK: saveCircuitState
 * @description Persists the containment state atomically (temp + rename),
 *   exactly like task markdown writes. Best-effort: a persistence failure is
 *   surfaced to the optional `onError` seam but never thrown, because the
 *   in-memory state already gates dispatch and a save problem must not turn
 *   into a dispatch problem. Returns whether the write landed.
 * @example saveCircuitState(store) => true
 * @param {Object} store
 * @param {Object} [opts]
 * @param {string} [opts.statePath] - Explicit file path (tests).
 * @param {Function} [opts.onError] - Called with the write error.
 * @returns {boolean}
 ***/
export function saveCircuitState(store, { statePath, onError } = {}) {
	const file = resolveCircuitStatePath(store, statePath);
	const state = getCircuitState(store);
	state.version = CIRCUIT_STATE_VERSION;
	state.updatedAt = new Date().toISOString();
	try {
		_atomicWriteFileSync(file, JSON.stringify(state, null, 2));
		if (store && typeof store === "object") store.circuitStatePath = file;
		return true;
	} catch (err) {
		try {
			onError?.(err);
		} catch {
			// Reporting must never break the save.
		}
		return false;
	}
}

/***
 * MARK: circuitSnapshot
 * @description Read-only projection served by `GET /engine/state` and pushed
 *   on the ENGINE_STATE event. `isTripped` is duplicated from `tripped` so a
 *   consumer that only knows the boolean name still works. `banner` carries
 *   the plain-text message the UI renders (null while healthy).
 * @example circuitSnapshot(store) => { tripped: false, banner: null, ... }
 * @param {Object} store
 * @returns {Object}
 ***/
export function circuitSnapshot(store) {
	const state = getCircuitState(store);
	const tripped = state.tripped === true;
	return {
		version: state.version,
		tripped,
		isTripped: tripped,
		reason: state.reason || null,
		source: state.source || null,
		trippedAt: state.trippedAt || null,
		tripOperator: state.tripOperator || null,
		resetReason: state.resetReason || null,
		resetAt: state.resetAt || null,
		resetSource: state.resetSource || null,
		resetOperator: state.resetOperator || null,
		canaryTaskId: state.canaryTaskId || null,
		canaryProjectId: state.canaryProjectId || null,
		probeCooldownUntil: state.probeCooldownUntil || null,
		probeBackoffMs: Number(state.probeBackoffMs) || 0,
		tripCount: Number(state.tripCount) || 0,
		canarySuccessCount: Number(state.canarySuccessCount) || 0,
		canaryFailureCount: Number(state.canaryFailureCount) || 0,
		lastTrip: state.lastTrip || null,
		updatedAt: state.updatedAt || null,
		banner: tripped
			? `Engine tripped (${state.source || "manual"}): ${state.reason || "systemic failure"}`
			: null,
	};
}

/***
 * MARK: broadcastCircuitState
 * @description Emits the canonical ENGINE_STATE frame plus a
 *   NOTIFICATION toast and a `[CIRCUIT]` system log line. Best-effort: every
 *   bridge call is guarded so a missing/short-circuited bridge never breaks
 *   the trip itself.
 * @param {Object} store
 * @param {Object} opts
 * @param {string} opts.kind - "trip" | "reset" | "update".
 ***/
export function broadcastCircuitState(store, { kind = "update" } = {}) {
	const snapshot = circuitSnapshot(store);
	const bridge = store?.eventBridge;
	const projectId = snapshot.canaryProjectId || store?.engineState?.activeProjectId || null;
	try {
		// Merge the live engine state (status/active task/…) with the circuit
		// snapshot: the UI's ENGINE_STATE handler replaces its whole object, so
		// a circuit-only payload would wipe the Now Playing fields. One frame,
		// one agreed state.
		const engineState =
			typeof store?.getEngineState === "function"
				? store.getEngineState()
				: { ...(store?.engineState || {}) };
		bridge?.broadcastGlobal?.(ENGINE_STATE_EVENT, {
			...engineState,
			circuit: snapshot,
			tripped: snapshot.tripped,
			tripReason: snapshot.reason,
		});
	} catch {
		// Broadcast must never break containment.
	}
	if (kind === "trip") {
		try {
			bridge?.emitNotification?.(projectId, {
				type: "error",
				title: "Engine Tripped — all work stopped",
				message: `${snapshot.reason || "Systemic failure"} (source: ${snapshot.source || "manual"})`,
				duration: 0,
			});
		} catch {
			// ignore
		}
		try {
			bridge?.emitSystemLog?.(
				projectId,
				`[CIRCUIT] Engine TRIPPED by ${snapshot.source || "manual"} — all dispatch stopped, queued tasks deferred (budgets preserved): ${snapshot.reason || "systemic failure"}`,
				{ taskId: snapshot.canaryTaskId || undefined },
			);
		} catch {
			// ignore
		}
	} else if (kind === "reset") {
		try {
			bridge?.emitNotification?.(projectId, {
				type: "success",
				title: "Engine Reset — work resumed",
				message: snapshot.resetReason
					? `Containment lifted: ${snapshot.resetReason}`
					: "Containment lifted",
			});
		} catch {
			// ignore
		}
		try {
			bridge?.emitSystemLog?.(
				projectId,
				`[CIRCUIT] Engine RESET — dispatch resumed${snapshot.resetReason ? `: ${snapshot.resetReason}` : ""}`,
				{},
			);
		} catch {
			// ignore
		}
	}
	return snapshot;
}

/***
 * MARK: tripEngine
 * @description Trips global containment. Idempotent: tripping an already
 *   tripped engine keeps the original `trippedAt` and reason unless a new
 *   reason is supplied, and escalates the canary cooldown (a trip that
 *   arrives while a canary is in flight means the canary failed). Persists,
 *   then broadcasts ENGINE_STATE + notification + system log. Returns the
 *   snapshot so an HTTP route can echo it back.
 * @example tripEngine(store, { reason: "disk full", source: "auto:disk" })
 * @param {Object} store
 * @param {Object} [opts]
 * @param {string} [opts.reason]
 * @param {string} [opts.source] - "manual" | "auto:<sensor>" | "auto:probe".
 * @param {string} [opts.operator] - Operator identity when known.
 * @param {number} [opts.now]
 * @param {boolean} [opts.escalate=false] - Force a canary-cooldown escalation.
 * @returns {Object} Circuit snapshot.
 ***/
export function tripEngine(
	store,
	{ reason, source = "manual", operator = null, now = Date.now(), escalate = false } = {},
) {
	const state = getCircuitState(store);
	const timestamp = new Date(now).toISOString();
	const isFirstTrip = state.tripped !== true;
	if (isFirstTrip) {
		state.tripped = true;
		state.trippedAt = timestamp;
		state.tripCount = (Number(state.tripCount) || 0) + 1;
		state.canaryTaskId = null;
		state.canaryProjectId = null;
		state.canaryStartedAt = null;
		state.probeBackoffMs = 0;
		state.probeCooldownUntil = now + resolveProbeCooldownMs();
	} else if (escalate) {
		escalateProbeBackoff(store, now);
	}
	state.reason = reason || state.reason || "systemic failure";
	state.source = source || state.source || "manual";
	if (operator) state.tripOperator = operator;
	state.lastTrip = {
		reason: state.reason,
		source: state.source,
		trippedAt: state.trippedAt || timestamp,
		...(state.tripOperator ? { operator: state.tripOperator } : {}),
	};
	state.resetReason = null;
	state.resetAt = null;
	state.resetSource = null;
	state.resetOperator = null;
	// A canary in flight when a re-trip fires is over: stop claiming it so a
	// fresh canary can be admitted after the cooldown.
	if (!isFirstTrip) {
		state.canaryTaskId = null;
		state.canaryProjectId = null;
		state.canaryStartedAt = null;
	}
	saveCircuitState(store);
	const snapshot = broadcastCircuitState(store, { kind: "trip" });
	store?.schedulerStats && (store.schedulerStats.tripCount = state.tripCount);
	// WP7 outbound alert: a fresh trip or an escalated canary re-trip is
	// worth an external page; an idempotent re-trip while already contained
	// is not (it would spam every sensor reading). Detached and guarded so
	// a dead sink never affects containment.
	if (isFirstTrip || escalate) {
		notifyEngineTrip(null, { reason: state.reason, source: state.source }).catch(
			() => {},
		);
	}
	return snapshot;
}

/***
 * MARK: resolveProbeCooldownMs
 * @description Reads the configured initial canary cooldown, floored at 0.
 * @returns {number}
 ***/
function resolveProbeCooldownMs() {
	const raw = Number(config?.circuitProbeCooldownMs);
	return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 60000;
}

/***
 * MARK: resolveProbeBackoffCapMs
 * @description Reads the configured canary-backoff cap, floored at the base
 *   cooldown so the cap can never be smaller than the first wait.
 * @returns {number}
 ***/
function resolveProbeBackoffCapMs() {
	const raw = Number(config?.circuitProbeBackoffCapMs);
	const cap = Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 600000;
	return Math.max(cap, resolveProbeCooldownMs());
}

/***
 * MARK: escalateProbeBackoff
 * @description Doubles the canary cooldown after a failed canary, capped by
 *   `circuitProbeBackoffCapMs`. Keeps the trip set and pushes the next
 *   admission window out.
 * @param {Object} store
 * @param {number} [now]
 * @returns {number} The new cooldown in ms.
 ***/
export function escalateProbeBackoff(store, now = Date.now()) {
	const state = getCircuitState(store);
	const base = resolveProbeCooldownMs();
	const current = Number(state.probeBackoffMs) || 0;
	const next = Math.min(
		(current > 0 ? current : base) * 2,
		resolveProbeBackoffCapMs(),
	);
	state.probeBackoffMs = next;
	state.probeCooldownUntil = now + next;
	return next;
}

/***
 * MARK: resetEngine
 * @description Lifts global containment. `reason` is required by the HTTP
 *   route (operator accountability) but optional here so the half-open probe
 *   can auto-reset with its own source string. Persists, then broadcasts.
 * @example resetEngine(store, { reason: "provider recovered", source: "manual" })
 * @param {Object} store
 * @param {Object} [opts]
 * @param {string} [opts.reason]
 * @param {string} [opts.source] - "manual" | "auto:probe" | "operator".
 * @param {string} [opts.operator] - Operator identity when known.
 * @param {number} [opts.now]
 * @returns {Object} Circuit snapshot.
 ***/
export function resetEngine(
	store,
	{ reason, source = "manual", operator = null, now = Date.now() } = {},
) {
	const state = getCircuitState(store);
	// Capture the pre-reset containment so only a genuine lift (a real
	// tripped -> closed transition) raises an outbound recovery alert.
	const wasTripped = state.tripped === true;
	state.tripped = false;
	state.resetReason = reason || state.resetReason || "reset by operator";
	state.resetAt = new Date(now).toISOString();
	// `source` stays the last TRIP source (the cause); the reset path is
	// recorded separately so a post-reset snapshot can never imply the trip
	// was manual.
	state.resetSource = source;
	if (operator) state.resetOperator = operator;
	state.canaryTaskId = null;
	state.canaryProjectId = null;
	state.canaryStartedAt = null;
	state.probeBackoffMs = 0;
	state.probeCooldownUntil = null;
	// Only a passing half-open probe is a canary success: an operator manual
	// reset must not inflate the probe verdict counters.
	if (source === "auto:probe") {
		state.canarySuccessCount = (Number(state.canarySuccessCount) || 0) + 1;
	}
	saveCircuitState(store);
	const snapshot = broadcastCircuitState(store, { kind: "reset" });
	// WP7 outbound alert: only a genuine containment lift is worth telling
	// an operator about; a no-op reset of an already-closed engine is not.
	if (wasTripped) {
		notifyEngineReset(null, {
			reason: state.resetReason,
			source: state.resetSource,
		}).catch(() => {});
	}
	return snapshot;
}

/***
 * MARK: canaryAdmissionOpen
 * @description Whether a half-open canary may be admitted right now: tripped,
 *   probe enabled, no canary already in flight, and the cooldown elapsed.
 *   Pure read (no mutation) so the scheduler can decide before it searches
 *   for a candidate.
 * @example canaryAdmissionOpen(store) => false
 * @param {Object} store
 * @param {number} [now]
 * @returns {boolean}
 ***/
export function canaryAdmissionOpen(store, now = Date.now()) {
	if (!isTripped(store)) return false;
	if (config?.circuitProbeEnabled === false) return false;
	const state = getCircuitState(store);
	if (state.canaryTaskId) return false;
	const until = Number(state.probeCooldownUntil);
	if (Number.isFinite(until) && now < until) return false;
	return true;
}

/***
 * MARK: markCanary
 * @description Claims the single half-open canary slot for a candidate and
 *   persists it, so a concurrent tick or a restart cannot admit a second
 *   canary. Returns the snapshot.
 * @example markCanary(store, { projectId: "p1", taskId: "t1" })
 * @param {Object} store
 * @param {Object} opts
 * @param {string} [opts.projectId]
 * @param {string} [opts.taskId]
 * @param {number} [opts.now]
 * @returns {Object}
 ***/
export function markCanary(store, { projectId, taskId, now = Date.now() } = {}) {
	const state = getCircuitState(store);
	state.canaryTaskId = taskId || null;
	state.canaryProjectId = projectId || null;
	state.canaryStartedAt = new Date(now).toISOString();
	saveCircuitState(store);
	broadcastCircuitState(store, { kind: "update" });
	return circuitSnapshot(store);
}

/***
 * MARK: isCanaryTask
 * @description Whether a task is the currently-admitted half-open canary.
 *   Used by the failure routers to decide between "re-trip and back off" and
 *   the ordinary (untripped) failure path.
 * @example isCanaryTask(store, "t1") => true
 * @param {Object} store
 * @param {string} taskId
 * @returns {boolean}
 ***/
export function isCanaryTask(store, taskId) {
	try {
		return (
			Boolean(taskId) &&
			String(store?.circuitState?.canaryTaskId) === String(taskId)
		);
	} catch {
		return false;
	}
}

/***
 * MARK: recordCanaryFailure
 * @description Records a failed canary: bumps the failure counter, re-trips
 *   with escalated backoff, and emits a fresh ENGINE_STATE. Returns the new
 *   snapshot.
 * @example recordCanaryFailure(store, { reason: "still 401" })
 * @param {Object} store
 * @param {Object} [opts]
 * @param {string} [opts.reason]
 * @param {string} [opts.source]
 * @param {number} [opts.now]
 * @returns {Object}
 ***/
export function recordCanaryFailure(
	store,
	{ reason, source = "auto:probe", now = Date.now() } = {},
) {
	const state = getCircuitState(store);
	state.canaryFailureCount = (Number(state.canaryFailureCount) || 0) + 1;
	state.canaryTaskId = null;
	state.canaryProjectId = null;
	state.canaryStartedAt = null;
	return tripEngine(store, {
		reason: reason || state.reason,
		source,
		now,
		escalate: true,
	});
}

/***
 * MARK: recordCanarySuccess
 * @description Records a passing canary and lifts containment fully
 *   (`auto:probe`), which is the half-open → closed transition.
 * @example recordCanarySuccess(store)
 * @param {Object} store
 * @param {Object} [opts]
 * @param {string} [opts.reason]
 * @param {number} [opts.now]
 * @returns {Object}
 ***/
export function recordCanarySuccess(store, { reason, now = Date.now() } = {}) {
	return resetEngine(store, {
		reason: reason || "half-open canary probe passed",
		source: "auto:probe",
		now,
	});
}
