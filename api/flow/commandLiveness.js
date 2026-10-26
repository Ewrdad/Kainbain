// Domain: The Flow — keep-alive liveness for running command stages.
//
// Silence is not death: a CI/script stage whose command is legitimately quiet
// (a long test gate, an install, a docker build) used to be killed by the stall
// watchdog simply because its child wrote nothing for longer than the silence
// threshold. `deploy.sh` solved the same problem for deploys with its own
// heartbeat ticker; this module is the command-stage twin. While the stage's
// child process runs, a timer refreshes the stage heartbeat on an interval,
// so the watchdog can never fire for a stage that is merely quiet.
import { recordStageHeartbeat } from "./stageHeartbeat.js";

/***
 * MARK: DEFAULT_CI_HEARTBEAT_INTERVAL_MS
 * @description Default keep-alive cadence for a running CI/script stage
 *   (30s), mirrored by the `ciHeartbeatIntervalMs` config key. An interval
 *   comfortably below the 5-minute CI silence threshold means a healthy
 *   quiet stage beats roughly ten times per silence budget.
 * @example DEFAULT_CI_HEARTBEAT_INTERVAL_MS => 30000
 ***/
export const DEFAULT_CI_HEARTBEAT_INTERVAL_MS = 30000;

/***
 * MARK: inertTicker
 * @description The disabled ticker: a `stop()` that does nothing, returned when
 *   the keep-alive is switched off (interval <= 0) so callers never need to
 *   branch on whether a real timer exists.
 * @example inertTicker.enabled => false
 ***/
const inertTicker = { enabled: false, stop() {} };

/***
 * MARK: resolveCommandHeartbeatIntervalMs
 * @description Resolves the keep-alive interval (ms) for a command stage: an
 *   explicit positive `stage.heartbeatIntervalMs` override wins, otherwise
 *   the `ciHeartbeatIntervalMs` config (default 30s). Anything missing,
 *   negative, or non-numeric resolves to 0, which disables the keep-alive —
 *   the silence watchdog then guards alone (the emergency lever).
 * @example resolveCommandHeartbeatIntervalMs({}, { ciHeartbeatIntervalMs: 5000 }) => 5000
 * @example resolveCommandHeartbeatIntervalMs({ heartbeatIntervalMs: 250 }, {}) => 250
 * @example resolveCommandHeartbeatIntervalMs({ heartbeatIntervalMs: 0 }, {}) => 0
 * @example resolveCommandHeartbeatIntervalMs({}, { ciHeartbeatIntervalMs: 0 }) => 0
 * @param {Object} [stage] - Stage configuration (may carry an override).
 * @param {Object} [cfg] - Resolved config object.
 * @returns {number} Interval in ms (0 = keep-alive disabled).
 ***/
export function resolveCommandHeartbeatIntervalMs(stage, cfg) {
	// An explicit stage-level value wins, including 0 = this stage opts out
	// of the keep-alive (the silence watchdog then guards it alone).
	if (stage?.heartbeatIntervalMs !== undefined) {
		const explicit = Number(stage.heartbeatIntervalMs);
		if (Number.isFinite(explicit) && explicit >= 0) {
			return explicit;
		}
	}
	const fromConfig = Number(
		cfg?.ciHeartbeatIntervalMs ?? DEFAULT_CI_HEARTBEAT_INTERVAL_MS,
	);
	return Number.isFinite(fromConfig) && fromConfig > 0 ? fromConfig : 0;
}

/***
 * MARK: startStageHeartbeatTicker
 * @description Starts the keep-alive for a running command stage: an unref'd
 *   interval timer that refreshes the stage heartbeat every `intervalMs` so
 *   the stall watchdog cannot fire while the child is still running. The
 *   default tick records a stage heartbeat; pass `onTick` for anything else.
 *   `stop()` is idempotent and safe from a `finally` — the caller must stop
 *   the ticker on every exit path BEFORE the terminal task update, the same
 *   invariant as `stop_deploy_heartbeat` in deploy.sh. A throwing `onTick` is
 *   swallowed: a liveness timer must never take the stage down. An interval
 *   <= 0 (or missing store/task) returns the inert ticker — never null.
 * @example const ticker = startStageHeartbeatTicker(store, "task-1", { stageId: "ci-1", kind: "ci", intervalMs: 30000 }); ticker.stop();
 * @example startStageHeartbeatTicker(store, "task-1", { intervalMs: 0 }).enabled => false
 * @param {Object} store - Task store (heartbeat map lives here).
 * @param {string} taskId - Task whose stage heartbeat is refreshed.
 * @param {Object} [opts]
 * @param {string} [opts.stageId] - Stage identity for the heartbeat record.
 * @param {string} [opts.kind] - Stage kind for the heartbeat record.
 * @param {number} [opts.intervalMs] - Tick interval in ms (<= 0 disables).
 * @param {Function} [opts.onTick] - Optional tick action (defaults to recording the stage heartbeat).
 * @param {Function} [opts.setIntervalFn] - Timer seam for tests.
 * @param {Function} [opts.clearIntervalFn] - Timer seam for tests.
 * @returns {{ enabled: boolean, stop: Function }} The ticker handle.
 ***/
export function startStageHeartbeatTicker(
	store,
	taskId,
	{
		stageId,
		kind,
		intervalMs,
		onTick,
		setIntervalFn = setInterval,
		clearIntervalFn = clearInterval,
	} = {},
) {
	const interval = Number(intervalMs);
	if (!store || !taskId || !Number.isFinite(interval) || interval <= 0) {
		return inertTicker;
	}
	let stopped = false;
	const beat =
		typeof onTick === "function"
			? onTick
			: () => recordStageHeartbeat(store, taskId, { stageId, kind });
	let handle = setIntervalFn(() => {
		if (stopped) return;
		try {
			beat();
		} catch {
			// A liveness tick must never propagate an error into the timer
			// queue; the watchdog's silence handling remains the backstop.
		}
	}, interval);
	if (handle && typeof handle.unref === "function") {
		handle.unref();
	}
	return {
		enabled: true,
		stop() {
			if (stopped) return;
			stopped = true;
			const pending = handle;
			handle = null;
			if (pending !== null && pending !== undefined) {
				try {
					clearIntervalFn(pending);
				} catch {
					// Already cleared; nothing to do.
				}
			}
		},
	};
}
