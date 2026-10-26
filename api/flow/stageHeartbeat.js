// Domain: The Flow — Stage heartbeat protocol and in-flight stall watchdog.
import { config } from "../config/index.js";
import { isTripped } from "./circuitBreaker.js";
import {
	resolveCandidateStage,
	resolveStagesForTask,
} from "./stageResolution.js";
import {
	stageElapsedSeconds,
	resolveStageTimeout,
	resolveEffectiveStageType,
} from "./stagePolicy.js";
import { _appendProcessLog } from "../watch/index.js";

export const STALLED_STATUS_NOTE =
	"Stage marked stalled — silence threshold exceeded";

/***
 * MARK: _ensureHeartbeatMap
 * @description Ensures `store.stageHeartbeats` exists as a Map.
 * @param {Object} store
 * @returns {Map<string, Object>}
 ***/
function _ensureHeartbeatMap(store) {
	if (!store) return new Map();
	if (!(store.stageHeartbeats instanceof Map)) {
		store.stageHeartbeats = new Map();
	}
	return store.stageHeartbeats;
}

/***
 * MARK: recordStageHeartbeat
 * @description Standardized heartbeat emission for a running task stage.
 *   Stored in-memory on the store so active processes can be monitored
 *   without filesystem churn.
 * @param {Object} store
 * @param {string} taskId
 * @param {Object} [opts]
 * @param {string} [opts.stageId]
 * @param {string} [opts.kind]
 * @param {number} [opts.timestamp]
 ***/
export function recordStageHeartbeat(store, taskId, { stageId, kind, timestamp } = {}) {
	if (!store || !taskId) return;
	const map = _ensureHeartbeatMap(store);
	map.set(String(taskId), {
		lastBeatAt: typeof timestamp === "number" ? timestamp : Date.now(),
		stageId: stageId || null,
		kind: kind || null,
	});
}

/***
 * MARK: getStageHeartbeat
 * @description Looks up the last heartbeat record for a task.
 * @param {Object} store
 * @param {string} taskId
 * @returns {Object|null} `{ lastBeatAt, stageId, kind }` or null.
 ***/
export function getStageHeartbeat(store, taskId) {
	if (!store || !taskId) return null;
	const map = _ensureHeartbeatMap(store);
	return map.get(String(taskId)) || null;
}

/***
 * MARK: clearStageHeartbeat
 * @description Removes the heartbeat record when a stage completes or exits.
 * @param {Object} store
 * @param {string} taskId
 ***/
export function clearStageHeartbeat(store, taskId) {
	if (!store || !taskId) return;
	const map = _ensureHeartbeatMap(store);
	map.delete(String(taskId));
}

/***
 * MARK: STALL_HANDLED_TTL_MS
 * @description Safety expiry for a stall-handled marker. The marker exists
 *   only long enough for the terminated in-flight run to settle and have its
 *   duplicate failure routing suppressed (milliseconds in practice); an
 *   entry older than this is treated as stale and never suppresses a genuine
 *   later failure.
 ***/
export const STALL_HANDLED_TTL_MS = 5 * 60 * 1000;

function _ensureStallHandledMap(store) {
	if (!store) return new Map();
	if (!(store._stallHandled instanceof Map)) {
		store._stallHandled = new Map();
	}
	return store._stallHandled;
}

/***
 * MARK: markStallHandled
 * @description Records that the watchdog already handled a stall for a task.
 *   The watchdog terminates the in-flight run, which then settles with a
 *   non-zero exit and would otherwise route the SAME failure a second time
 *   (transient retry + failback): this marker lets the failure routers
 *   suppress that duplicate. In-memory only (a heartbeat/stall is only
 *   meaningful while the process is alive); single-use and TTL-bounded.
 * @param {Object} store
 * @param {string} taskId
 * @param {Object} [opts]
 * @param {number} [opts.timestamp]
 ***/
export function markStallHandled(store, taskId, { timestamp } = {}) {
	if (!store || !taskId) return;
	const map = _ensureStallHandledMap(store);
	map.set(
		String(taskId),
		typeof timestamp === "number" ? timestamp : Date.now(),
	);
}

/***
 * MARK: consumeStallHandled
 * @description Single-use check: whether a fresh stall-handled marker exists
 *   for the task. Always removes the marker so a later genuine failure is
 *   never suppressed. A marker older than `ttlMs` returns false (stale).
 * @param {Object} store
 * @param {string} taskId
 * @param {Object} [opts]
 * @param {number} [opts.now]
 * @param {number} [opts.ttlMs]
 * @returns {boolean}
 ***/
export function consumeStallHandled(
	store,
	taskId,
	{ now = Date.now(), ttlMs = STALL_HANDLED_TTL_MS } = {},
) {
	if (!store || !taskId) return false;
	const map = _ensureStallHandledMap(store);
	const key = String(taskId);
	if (!map.has(key)) return false;
	const at = map.get(key);
	map.delete(key);
	const age = now - (typeof at === "number" ? at : 0);
	return age >= 0 && age <= ttlMs;
}

/***
 * MARK: clearStallHandled
 * @description Removes any stall-handled marker for a task (stage exit).
 * @param {Object} store
 * @param {string} taskId
 ***/
export function clearStallHandled(store, taskId) {
	if (!store || !taskId) return;
	_ensureStallHandledMap(store).delete(String(taskId));
}

/***
 * MARK: noteStallKill
 * @description Records on the task the context of a watchdog stall kill so
 *   the stage's own report writer can tell the truth: this was not a command
 *   failure, the child was terminated by the silence watchdog while it was
 *   (as far as anyone knew) still running. In-memory on the task object and
 *   single-use (consumed by the report writer); `at` is ISO-stamped so a
 *   stale marker from an old incident is never re-reported.
 * @example noteStallKill(task, { at, stageId: "ci-1", silenceMs, thresholdMs, stageTimeoutMs, stageType: "ci", stageName: "CI" })
 * @param {Object} task - The active task (mutated in place).
 * @param {Object} context - { at, stageId?, stageName?, stageType?, silenceMs, thresholdMs, stageTimeoutMs? }.
 ***/
export function noteStallKill(task, context) {
	if (!task || !context) return;
	task.stallKill = { ...context };
}

/***
 * MARK: consumeStallKill
 * @description Single-use read of the stall context: returns it (and clears
 *   it) when it is fresh, belongs to the asked-for stage, and no older run
 *   already reported it. A stale marker (older than `ttlMs`) is cleared and
 *   forgotten; a marker for a different stage is left for that stage's
 *   report.
 * @example consumeStallKill(task, { now, stageId: "ci-1" }) => { silenceMs, ... } | null
 * @param {Object} task - The task carrying a possible `stallKill` context.
 * @param {Object} [opts]
 * @param {number} [opts.now] - Reference time (defaults to real Date.now(); the marker's own `at` decides freshness).
 * @param {string} [opts.stageId] - The stage about to report; a marker naming a different stage is not consumed.
 * @param {number} [opts.ttlMs] - Defaults to STALL_HANDLED_TTL_MS.
 * @returns {Object|null} The stall context when this report should carry it.
 ***/
export function consumeStallKill(
	task,
	{ now = Date.now(), stageId, ttlMs = STALL_HANDLED_TTL_MS } = {},
) {
	const context = task?.stallKill;
	if (!context) return null;
	const atMs = Date.parse(context.at);
	const fresh =
		Number.isFinite(atMs) && now - atMs >= 0 && now - atMs <= ttlMs;
	const forThisStage =
		!stageId ||
		!context.stageId ||
		String(context.stageId) === String(stageId);
	if (fresh && forThisStage) {
		delete task.stallKill;
		return context;
	}
	if (!fresh) {
		// A stale marker from an old incident must never decorate a new report.
		delete task.stallKill;
	}
	return null;
}

/***
 * MARK: resolveStallThresholdMs
 * @description Resolves the silence threshold in ms for a given stage type or stage object.
 *   Agent: KAINBAIN_AGENT_STALL_TIMEOUT_MS (default 600000 / 10m).
 *   CI / Script: KAINBAIN_CI_STALL_TIMEOUT_MS (default 300000 / 5m).
 *   Merge: KAINBAIN_MERGE_STALL_TIMEOUT_MS (default 900000 / 15m).
 *   A threshold <= 0 disables the watchdog for that type.
 * @param {string|Object} stageOrType
 * @param {Object} [cfg]
 * @returns {number} Threshold in ms (0 = disabled).
 ***/
export function resolveStallThresholdMs(stageOrType, cfg = config) {
	const type =
		stageOrType && typeof stageOrType === "object"
			? resolveEffectiveStageType(stageOrType)
			: String(stageOrType || "").toLowerCase();
	let raw = 0;
	if (type === "agent" || type === "review") {
		raw = cfg?.agentStallTimeoutMs ?? 600000;
	} else if (type === "ci" || type === "script" || type === "deploy") {
		// Legacy alias: the removed `deploy` type reads as `ci` (a deploy
		// command is an ordinary ci stage with the CI stall budget).
		raw = cfg?.ciStallTimeoutMs ?? 300000;
	} else if (type === "merge") {
		raw = cfg?.mergeStallTimeoutMs ?? 900000;
	} else {
		return 0;
	}
	const parsed = Number(raw);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/***
 * MARK: watchdogTick
 * @description Scans the single active running task for heartbeat silence.
 *   If the elapsed silence exceeds the configured threshold, terminates the
 *   child process, records the stall across history/logs/timeline, and routes
 *   through `handleTransientFailure` as an infrastructure stall.
 *   Skipped if the engine is tripped (containment invariant).
 * @param {Object} store
 * @param {Object} [opts]
 * @param {number} [opts.now]
 * @param {Object} [opts.cfg]
 * @returns {Object|null} The transient failure result if a stall was handled, or null.
 ***/
export function watchdogTick(store, { now = Date.now(), cfg = config } = {}) {
	if (!store) return null;
	if (isTripped(store)) return null;

	const activeTaskId = store.engineState?.activeTaskId;
	if (!activeTaskId || store.engineState?.status !== "running") {
		return null;
	}

	// Resolve the active task and project
	let activeProject = null;
	let activeTask = null;

	if (store.engineState?.activeProjectId) {
		activeProject =
			store.projectStore?.getProject?.(store.engineState.activeProjectId) || null;
		if (activeProject) {
			activeTask = store.getTask?.(activeProject.id, activeTaskId) || null;
		}
	}

	if (!activeTask && store.projectStore?.listProjects) {
		for (const p of store.projectStore.listProjects()) {
			const candidate = store.getTask?.(p.id, activeTaskId);
			if (candidate) {
				activeProject = p;
				activeTask = candidate;
				break;
			}
		}
	}

	if (!activeTask || !activeProject) return null;

	let stages = [];
	let stage = null;
	try {
		stages = resolveStagesForTask(activeProject, activeTask);
		stage = resolveCandidateStage(stages, activeTask.currentStageId);
	} catch {
		return null;
	}

	const stageType = resolveEffectiveStageType(stage);
	const threshold = resolveStallThresholdMs(stageType, cfg);
	if (threshold <= 0) return null;

	const hb = getStageHeartbeat(store, activeTaskId);
	// Only instrumented stages are watched: every stage entry point records
	// a heartbeat (`runCommandStage`, agent `process:start`,
	// `executeMergeStage`), so a missing record means "not instrumented"
	// (or a double without the seam) — never "silent". The wall-clock stage
	// timeout remains the backstop for those.
	if (!hb || typeof hb.lastBeatAt !== "number") {
		return null;
	}
	const lastBeatAt = hb.lastBeatAt;

	// Every instrumented stage ticks its own heartbeat while it runs
	// (`runCommandStage` keep-alive, agent `process:start`,
	// `executeMergeStage` liveness), so silence past the threshold is a
	// genuine stall regardless of what the command does.
	const silenceMs = now - lastBeatAt;
	if (silenceMs <= threshold) {
		return null;
	}

	// Stall breached!
	activeTask.stallCount = (Number(activeTask.stallCount) || 0) + 1;
	const timestampIso = new Date(now).toISOString();
	const stageLabel = stage?.name || stage?.id || activeTask.currentStageId || "Stage";

	// Stamp the kill context on the task so the stage's own report writer can
	// name the stall instead of rendering an ordinary FAILED CI report (the
	// original incident was filed as "tests are failing" because nothing in
	// the report said the watchdog killed a healthy, still-running gate).
	noteStallKill(activeTask, {
		at: timestampIso,
		stageId: stage?.id ?? null,
		stageName: stage?.name || stage?.id || null,
		stageType,
		silenceMs,
		thresholdMs: threshold,
		stageTimeoutMs: resolveStageTimeout(stage, stageType, cfg, activeProject),
	});

	if (typeof store._recordHistory === "function") {
		store._recordHistory(
			activeTask,
			`Stage marked stalled — no heartbeat for ${silenceMs}ms (threshold: ${threshold}ms) on stage '${stageLabel}'`,
			timestampIso,
		);
	}

	_appendProcessLog(
		activeTask,
		`[STALL] ${STALLED_STATUS_NOTE}: no heartbeat for ${silenceMs}ms (threshold: ${threshold}ms); terminating process`,
	);

	const elapsedSec = stageElapsedSeconds(activeTask, now);
	const durationLabel = elapsedSec === undefined ? "0s" : `${elapsedSec}s`;

	const timelineEntry = {
		stage: stageLabel,
		status: "Stalled",
		duration: durationLabel,
		timestamp: timestampIso,
		reason: `no heartbeat for ${silenceMs}ms (threshold: ${threshold}ms)`,
		stageId: stage?.id,
		stageName: stage?.name || stage?.id,
	};

	if (typeof store._recordTimeline === "function") {
		store._recordTimeline(activeTask, timelineEntry);
	} else if (typeof store.recordTimeline === "function") {
		store.recordTimeline(activeTask, timelineEntry);
	}

	if (typeof store._saveTaskMarkdown === "function") {
		store._saveTaskMarkdown(activeProject.cwd, activeTask);
	}

	const stallError = new Error(
		`Stage marked stalled — no heartbeat for ${silenceMs}ms (threshold: ${threshold}ms)`,
	);
	stallError.code = "ESTALL";
	stallError.stall = true;

	return routeStallRecovery(store, {
		projectId: activeProject.id,
		taskId: activeTaskId,
		stage,
		stageType,
		error: stallError,
		bridge: store.eventBridge,
		projectCwd: activeProject.cwd,
	});
}

/***
 * MARK: routeStallRecovery
 * @description Shared termination + transient-retry tail for every stall
 *   recovery path: the heartbeat watchdog (`watchdogTick`) and wedged-queue
 *   recovery (`recoverWedgedQueueEntry`). Terminates the in-flight run
 *   (child kill, plus agent/review session abort), clears the heartbeat,
 *   counts `stallRecoveries`, idles the engine, and routes the occupant
 *   through `handleTransientFailure` with the stall de-duplication discipline
 *   (`clearStallHandled` before, `markStallHandled` after, so the run's own
 *   late settlement is suppressed exactly once and a genuine later failure
 *   is never suppressed).
 * @param {Object} store
 * @param {Object} [opts]
 * @param {string} [opts.projectId]
 * @param {string} [opts.taskId]
 * @param {Object} [opts.stage]
 * @param {string} [opts.stageType] - Effective stage type (resolved from `stage` when omitted).
 * @param {Error} [opts.error] - Stall error routed to the transient ladder.
 * @param {Object} [opts.bridge]
 * @param {string} [opts.projectCwd]
 * @returns {Object|null} The transient-failure result, or null when routing is unavailable.
 ***/
export function routeStallRecovery(
	store,
	{ projectId = null, taskId = null, stage = null, stageType = null, error = null, bridge = null, projectCwd = null } = {},
) {
	try {
		if (!store || taskId == null) return null;
		const type = stageType || resolveEffectiveStageType(stage);

		try {
			store.killTaskProcess?.(taskId);
		} catch {
			// Child kill is best-effort
		}

		// Agent/review stages run as an in-process session (no registered child
		// process), so the child kill above is a no-op for them. Abort the stage
		// session so a heartbeat-silent agent is actually terminated instead of
		// merely recorded. Command stages (ci/script/merge) never touch the
		// project session: their child kill is the real termination and aborting
		// the shared session could kill an operator's interactive run.
		if (type === "agent" || type === "review") {
			try {
				const sessionScope = projectId ?? store.engineState?.activeProjectId;
				const activeSession =
					sessionScope == null ? null : store.sessionStore?.get?.(sessionScope);
				const sessionTaskId = activeSession?.taskId;
				// Only abort when the session belongs to this task (or the session
				// does not track a task id, the legacy shape).
				if (
					typeof activeSession?.abort === "function" &&
					(sessionTaskId === undefined || String(sessionTaskId) === String(taskId))
				) {
					Promise.resolve(activeSession.abort()).catch(() => {});
				}
			} catch {
				// Session abort is best-effort; the stall record + retry still stand.
			}
		}

		clearStageHeartbeat(store, taskId);

		if (store.schedulerStats) {
			store.schedulerStats.stallRecoveries =
				(store.schedulerStats.stallRecoveries || 0) + 1;
		}

		if (typeof store.setEngineState === "function") {
			store.setEngineState({
				status: "idle",
				activeTaskId: null,
				activeProjectId: null,
			});
		} else if (store.engineState) {
			store.engineState.status = "idle";
			store.engineState.activeTaskId = null;
			store.engineState.activeProjectId = null;
		}

		// Defensive: a stale marker left by a previous stall that never settled
		// must never suppress THIS stall's own routing below.
		clearStallHandled(store, taskId);

		if (typeof store.handleTransientFailure === "function") {
			const transientResult = store.handleTransientFailure(
				projectId,
				taskId,
				stage,
				error,
				{
					bridge: bridge ?? store.eventBridge,
					projectCwd,
					stall: true,
				},
			);
			// The terminated run settles asynchronously and would otherwise route
			// the SAME failure a second time (a failback right after this transient
			// retry). Mark it handled so the routers suppress the duplicate. Marked
			// AFTER this call so this recovery's own routing is never suppressed.
			// The marker is stamped with real wall-clock time (never a caller's
			// logical `now`) so the TTL comparison is always against actual time.
			markStallHandled(store, taskId);
			return transientResult;
		}

		return null;
	} catch {
		// Recovery must never throw out of its caller (scheduler tick,
		// stage exit, operator abort): a failed rescue must not become a
		// second outage.
		return null;
	}
}

/***
 * MARK: resolveWedgeStuckMs
 * @description Wall-clock budget after which a queue entry that never settles
 *   counts as wedged. Prefers the occupant stage's stall-silence threshold
 *   (the same budget the heartbeat watchdog enforces) and falls back to the
 *   queue settle guarantee (`queueEntryTimeoutMs`, default 15 min) when the
 *   stage is unknown. Returns 0 only when the operator disabled every guard
 *   (stage threshold and queue timeout both 0) — callers must treat 0 as
 *   "never time-based-recover", never as "recover immediately".
 * @param {Object} store
 * @param {Object|null} [stage]
 * @param {Object} [cfg]
 * @returns {number} Stuck budget in ms (0 = all guards disabled).
 ***/
export function resolveWedgeStuckMs(store, stage = null, cfg = config) {
	try {
		if (stage) {
			const stageMs = resolveStallThresholdMs(stage, cfg);
			if (stageMs > 0) return stageMs;
		}
	} catch {
		// Fall through to the queue budget.
	}
	try {
		const queueMs = Number(cfg?.queueEntryTimeoutMs ?? 900000);
		if (Number.isFinite(queueMs) && queueMs > 0) return queueMs;
	} catch {
		// All guards disabled.
	}
	return 0;
}

/***
 * MARK: resolveWedgeOccupant
 * @description Best-effort resolution of a wedged queue entry's owner: the
 *   project, task, and current stage for (`projectId`, `taskId`). Every seam
 *   is guarded so a half-torn store (mocks, startup, teardown) yields nulls
 *   instead of throwing — callers settle first and route only what resolved.
 * @param {Object} store
 * @param {string|null} [projectId]
 * @param {string|null} [taskId]
 * @returns {{ project: Object|null, task: Object|null, stage: Object|null }}
 ***/
export function resolveWedgeOccupant(store, projectId = null, taskId = null) {
	const out = { project: null, task: null, stage: null };
	try {
		if (!store || taskId == null) return out;
		let project = null;
		try {
			if (
				projectId != null &&
				typeof store.projectStore?.getProject === "function"
			) {
				project = store.projectStore.getProject(projectId) || null;
			}
		} catch {
			project = null;
		}
		let task = null;
		try {
			if (project && typeof store.getTask === "function") {
				task = store.getTask(project.id, taskId) || null;
			}
		} catch {
			task = null;
		}
		if (!task) {
			// The entry's project tag may be stale (project removed or
			// entry predates tagging): scan every project before giving up.
			try {
				const projects = store.projectStore?.listProjects?.() || [];
				for (const candidate of projects) {
					try {
						const found =
							candidate && typeof store.getTask === "function"
								? store.getTask(candidate.id, taskId)
								: null;
						if (found) {
							project = candidate;
							task = found;
							break;
						}
					} catch {
						// Next project.
					}
				}
			} catch {
				// Scan failed; task stays unresolved.
			}
		}
		out.project = project;
		out.task = task;
		if (project && task) {
			try {
				const stages = resolveStagesForTask(project, task) || [];
				out.stage = resolveCandidateStage(stages, task.currentStageId) || null;
			} catch {
				out.stage = null;
			}
		}
	} catch {
		// Best-effort: callers handle nulls.
	}
	return out;
}

/***
 * MARK: fireWedgePushOnce
 * @description Once-per-episode operator alert for a destructive wedge
 *   recovery (the queue entry was force-settled and its occupant routed to
 *   the transient ladder). Latched on `store._wedgedStallNotified`, cleared
 *   by the next real dispatch — repeated ticks of the same episode never
 *   re-page. Never throws and never awaits: the push seam owns delivery.
 * @param {Object} store
 * @param {Object} [detail] - `{ taskId, projectId, ageMs, reason }`.
 ***/
function fireWedgePushOnce(store, detail = {}) {
	try {
		if (!store || store._wedgedStallNotified) return;
		store._wedgedStallNotified = true;
		const notify = store.notifySchedulerStall;
		if (typeof notify !== "function") return;
		const maybe = notify.call(store, detail);
		if (maybe && typeof maybe.catch === "function") maybe.catch(() => {});
	} catch {
		// Push must never break recovery.
	}
}

/***
 * MARK: recoverWedgedQueueEntry
 * @description Full wedge rescue for one ExecutionQueue entry that never
 *   settled: force-settles the latch FIRST (so one corpse can never block
 *   dispatch, whatever happens below), terminates the in-flight run, records
 *   uniform stall evidence on the occupant task, routes it through the
 *   transient-failure ladder, and pages the operator once per episode.
 *   Idempotent across racing rescuers (queue timeout, scheduler tick, abort):
 *   the queue's single settle path lets exactly one settle win, and the
 *   stall-handled marker suppresses the late run's duplicate routing.
 *   Never throws.
 * @param {Object} store
 * @param {Object} [opts]
 * @param {Object} [opts.entry] - Queue entry to rescue (defaults to the live one).
 * @param {string} [opts.projectId] - Occupant project (defaults to the entry tag).
 * @param {string} [opts.taskId] - Occupant task (defaults to the entry tag).
 * @param {Object} [opts.stage] - Occupant stage (resolved when omitted).
 * @param {Error} [opts.error] - Settle reason (defaults to a wedge error).
 * @param {number|null} [opts.ageMs] - Entry age for evidence (read live when omitted).
 * @param {string} [opts.reason] - Machine-readable rescue cause: `engine-idle` | `engine-running` | `entry-timeout`.
 * @param {Object} [opts.bridge]
 * @param {string} [opts.projectCwd]
 * @param {number} [opts.now] - Reference time for evidence (defaults to wall clock).
 * @returns {Object|null} The transient-failure result, or null when the occupant could not be routed.
 ***/
export function recoverWedgedQueueEntry(
	store,
	{
		entry = null,
		projectId = null,
		taskId = null,
		stage = null,
		error = null,
		ageMs = null,
		reason = "wedged-queue-entry",
		bridge = null,
		projectCwd = null,
		now = Date.now(),
	} = {},
) {
	try {
		if (!store) return null;
		const queue = store.executionQueue;
		const target = entry || queue?.activeEntry || null;
		const resolvedTaskId = taskId ?? target?.taskId ?? null;
		const resolvedProjectId = projectId ?? target?.projectId ?? null;
		let liveAgeMs = ageMs;
		try {
			if (liveAgeMs == null && queue && typeof queue.activeAgeMs === "number") {
				liveAgeMs = queue.activeAgeMs;
			}
		} catch {
			liveAgeMs = null;
		}

		// Unpark first: the latch release must not depend on anything below.
		try {
			if (typeof queue?.settleActive === "function") {
				queue.settleActive(
					error instanceof Error
						? error
						: new Error(
								`Scheduler recovered wedged ExecutionQueue entry (cause: ${reason})`,
							),
				);
			}
		} catch {
			// Settle is best-effort; occupant routing below still stands.
		}

		const occupant = resolveWedgeOccupant(store, resolvedProjectId, resolvedTaskId);
		const finalStage = stage || occupant.stage || null;
		const finalProject = occupant.project || null;
		const finalProjectId =
			resolvedProjectId ?? finalProject?.id ?? store.engineState?.activeProjectId ?? null;
		const task = occupant.task;
		const referenceNow = Number.isFinite(now) ? now : Date.now();
		const at = new Date(referenceNow).toISOString();
		const ageLabel =
			typeof liveAgeMs === "number" && Number.isFinite(liveAgeMs) ? `${liveAgeMs}ms` : "unknown age";
		let stuckMs = 0;
		try {
			stuckMs = resolveWedgeStuckMs(store, finalStage);
		} catch {
			stuckMs = 0;
		}

		if (task) {
			const stageLabel =
				finalStage?.name || finalStage?.id || task.currentStageId || "unknown stage";
			const stageType = resolveEffectiveStageType(finalStage);
			try {
				noteStallKill(task, {
					at,
					stageId: finalStage?.id ?? null,
					stageName: finalStage?.name || finalStage?.id || null,
					stageType,
					silenceMs: typeof liveAgeMs === "number" ? liveAgeMs : null,
					thresholdMs: stuckMs > 0 ? stuckMs : null,
					stageTimeoutMs: resolveStageTimeout(finalStage, stageType, config, finalProject),
				});
			} catch {
				// Evidence is audit-only; routing still stands.
			}
			try {
				if (typeof store._recordHistory === "function") {
					store._recordHistory(
						task,
						`Scheduler wedge recovery (${reason}): queue entry in flight ${ageLabel} with no fresh heartbeat; force-settled and routed to transient retry`,
						at,
					);
				}
			} catch {
				// Evidence is audit-only.
			}
			try {
				_appendProcessLog(
					task,
					`[STALL] Scheduler wedge recovery (${reason}): entry in flight ${ageLabel} with no fresh heartbeat; terminated and routed to transient retry`,
				);
			} catch {
				// Evidence is audit-only.
			}
			try {
				const recordTimeline =
					typeof store._recordTimeline === "function"
						? store._recordTimeline.bind(store)
						: typeof store.recordTimeline === "function"
							? store.recordTimeline.bind(store)
							: null;
				if (recordTimeline) {
					recordTimeline(task, {
						stage: finalStage?.name || finalStage?.id || task.currentStageId,
						status: "Stalled",
						duration: "0s",
						timestamp: at,
						reason: `wedged queue entry (${reason}; in flight ${ageLabel})`,
						stageId: finalStage?.id,
						stageName: finalStage?.name || finalStage?.id,
					});
				}
			} catch {
				// Evidence is audit-only.
			}
			let finalCwd = projectCwd;
			try {
				if (finalCwd == null && finalProject) {
					finalCwd =
						typeof store._resolveProjectCwd === "function"
							? store._resolveProjectCwd(finalProject.id, null)
							: (finalProject.cwd ?? null);
				}
			} catch {
				finalCwd = projectCwd;
			}
			try {
				if (typeof store._saveTaskMarkdown === "function" && finalCwd) {
					store._saveTaskMarkdown(finalCwd, task);
				}
			} catch {
				// Persistence is best-effort; routing still stands.
			}

			const routedError =
				error instanceof Error
					? error
					: new Error(`Wedged queue entry (${reason}; in flight ${ageLabel})`);
			try {
				routedError.stall = true;
			} catch {
				// Non-extensible error objects keep their original shape.
			}
			const routed = routeStallRecovery(store, {
				projectId: finalProjectId,
				taskId: resolvedTaskId,
				stage: finalStage,
				error: routedError,
				bridge: bridge ?? store.eventBridge,
				projectCwd: finalCwd,
			});
			fireWedgePushOnce(store, {
				taskId: resolvedTaskId,
				projectId: finalProjectId,
				ageMs: typeof liveAgeMs === "number" ? liveAgeMs : null,
				reason,
			});
			return routed;
		}

		// No occupant resolved (entry untagged or task gone): the latch is
		// released above, which is the rescue that matters. Page only when a
		// task id is known so the alert names actionable work.
		if (resolvedTaskId != null) {
			fireWedgePushOnce(store, {
				taskId: resolvedTaskId,
				projectId: finalProjectId,
				ageMs: typeof liveAgeMs === "number" ? liveAgeMs : null,
				reason,
			});
		}
		return null;
	} catch {
		// Recovery must never throw out of its caller.
		return null;
	}
}
