// Domain: The Flow — startup recovery after a stop, crash, or restart.
import {
	autoResumeTask,
	freshSchedulerStats,
	isAutoResumableWithReason,
	kickScheduler,
	reconcileInterruptedRuns,
	resolveCandidateStage,
	resolveStagesForTask,
	startScheduler,
} from "./taskScheduler.js";
import { runInterruptionReconcilePlugins } from "./stageLifecycle.js";
import { isCircuitEnabled, isTripped, loadCircuitState } from "./circuitBreaker.js";

/***
 * MARK: startupRecoverySummary
 * @description One-line human summary of a startup recovery pass, logged at
 *   boot so an operator can see what the restart picked up.
 * @param {Object} summary
 * @returns {string}
 * @example startupRecoverySummary({ interruptedFound: 2, autoResumed: 1 }) => "startup recovery: ..."
 ***/
export function startupRecoverySummary(summary) {
	const found = summary?.interruptedFound ?? 0;
	const resumed = summary?.autoResumed?.length ?? 0;
	const left = Math.max(0, found - resumed);
	return (
		`startup recovery: ${found} interrupted → ${resumed} auto-resumed, ` +
		`${left} left for operator`
	);
}

/***
 * MARK: autoResumeInterrupted
 * @description Converts every auto-resumable `interrupted` task back to
 *   `in_stage` (via `autoResumeTask`, mirroring manual resume) without
 *   dispatching anything itself. Merge interruptions with rehydration
 *   markers resume here when the continuity plugins left them unfinished
 *   (no fresh result); markerless ones stay parked with a recorded reason.
 *   While the circuit breaker is tripped nothing flips
 *   (the deferral reason is recorded instead). Idempotent: a second pass
 *   finds nothing to convert.
 * @param {Object} store
 * @returns {Array<Object>} `{ projectId, taskId }` pairs that were resumed.
 ***/
export function autoResumeInterrupted(store) {
	if (
		!store.projectStore ||
		typeof store.projectStore.listProjects !== "function"
	) {
		return [];
	}
	const resumed = [];
	// WP6 tripped-engine exclusion (WP1 respect): while the circuit breaker
	// is tripped, flipping tasks is pointless (dispatch is gated) and noisy.
	// Record the deferral reason on each parked task and resume nothing.
	const tripped = isCircuitEnabled() && isTripped(store);
	for (const project of store.projectStore.listProjects()) {
		let tasks;
		try {
			tasks = store.listTasks(project.id, project.cwd);
		} catch {
			continue;
		}
		for (const task of tasks) {
			if (task?.status !== "interrupted") continue;
			// Fail-safe: one unreadable task must never block the rest of the
			// pass — or boot, when called from performStartupRecovery.
			try {
				// Same id-then-name resolution as the scheduler candidate
				// scan so startup and ticks agree on which stage a task sits
				// at.
				const stages = resolveStagesForTask(project, task);
				const stage = resolveCandidateStage(stages, task.currentStageId);
				const blocked =
					store.isTaskBlocked(project.id, task.id)?.blocked === true;
				const verdict = isAutoResumableWithReason(task, stage, {
					blocked,
					tripped,
				});
				if (!verdict.resumable) {
					// Record WHY the task stayed parked — a silent
					// `interrupted` is what WP6 eliminates. History only (no
					// timeline: nothing was resumed).
					try {
						const reasonText =
							verdict.reason === "engine-tripped"
								? "Auto-resume deferred: engine circuit breaker tripped — task stays interrupted until the breaker closes"
								: `Auto-resume skipped (${verdict.reason}) — task stays interrupted for the operator`;
						store._recordHistory?.(task, reasonText, new Date().toISOString());
						const cwd =
							typeof store._resolveProjectCwd === "function"
								? store._resolveProjectCwd(project.id, project.cwd)
								: project.cwd;
						store._saveTaskMarkdown?.(cwd, task);
					} catch {
						// Reason recording is best-effort; the park stands.
					}
					continue;
				}
				autoResumeTask(store, project.id, task.id, project.cwd, {
					reason: `startup-recovery (${verdict.reason})`,
				});
				resumed.push({ projectId: project.id, taskId: task.id });
			} catch {
				continue;
			}
		}
	}
	return resumed;
}

/***
 * MARK: countInterrupted
 * @description Counts tasks still carrying the `interrupted` label. Used for
 *   the startup log line ("N interrupted → M auto-resumed").
 * @param {Object} store
 * @returns {number}
 ***/
export function countInterrupted(store) {
	if (
		!store.projectStore ||
		typeof store.projectStore.listProjects !== "function"
	) {
		return 0;
	}
	let count = 0;
	for (const project of store.projectStore.listProjects()) {
		let tasks;
		try {
			tasks = store.listTasks(project.id, project.cwd);
		} catch {
			continue;
		}
		for (const task of tasks) {
			if (task?.status === "interrupted") count += 1;
		}
	}
	return count;
}

/***
 * MARK: performStartupRecovery
 * @description Establishes the initial queue after a stop, crash, or
 *   SIGTERM/SIGINT restart, in strict order:
 *     1. `reconcileInterruptedRuns()` — orphaned `running_*` become
 *        `interrupted` (skipped for the live engine owner).
 *     2. `await runInterruptionReconcilePlugins()` — installed continuity
 *        plugins resolve their interruptions first (no-op with no plugins).
 *        Awaited (never fire-and-forget) so no dispatch can race a
 *        continuity decision.
 *     3. `autoResumeInterrupted()` — eligible agent/ci/script interruptions
 *        flip back to `in_stage`, prioritised for the queue.
 *     4. `startScheduler()` + one `kickScheduler()` so pickup takes ~150 ms.
 *   Recovery only transitions state: dispatch happens through the normal
 *   `scheduleTick` under the busy gate, so the single-active invariant and
 *   the 409 engine-busy semantics hold, and a busy engine means recovery
 *   transitions state without dispatching. Safe to run twice: the second
 *   pass reconciles and resumes nothing. Never rejects: every recovery step
 *   is guarded, so the worst case is "0 auto-resumed, scheduler ticking"
 *   rather than a failed boot.
 * @param {Object} store
 * @param {Object} [opts] - Passed through to `startScheduler`/`kickScheduler`
 *   (`agentRunner`, `promptEngine`, `intervalMs`, `disabled`).
 * @returns {Promise<Object>} `{ runs, deploys, autoResumed, interruptedFound, summary }`.
 ***/
export async function performStartupRecovery(store, opts = {}) {
	if (!store.schedulerStats) store.schedulerStats = freshSchedulerStats();

	// Step 0: restore the durable Tier-5 containment state BEFORE any
	// transition or dispatch. A restart during a systemic outage must come
	// back still tripped — otherwise the very first tick would re-cascade the
	// whole queue the breaker was protecting.
	try {
		loadCircuitState(store);
	} catch {
		// Fail open on containment: a rotted state file must never block boot.
	}

	// Steps 1-3 only transition state; every one is guarded so a corrupt
	// project or task list degrades to "left for operator" instead of
	// preventing boot. Step 4 always runs: the server must leave this
	// function with the scheduler ticking even when recovery found nothing
	// (or everything failed).
	let runs = [];
	let deploys = [];
	let interruptedFound = 0;
	let autoResumed = [];

	// 1. Orphaned live runs collapse to `interrupted` (sync, idempotent).
	try {
		runs = reconcileInterruptedRuns(store) || [];
	} catch {
		runs = [];
	}

	// 2. Continuity plugins resolve their interruptions first. A failure
	// here must never prevent boot: the scheduler's per-tick reconcile
	// retries, and the tasks stay parked as `interrupted`.
	try {
		deploys = (await runInterruptionReconcilePlugins(store)) || [];
	} catch {
		deploys = [];
	}

	// 3. Eligible interruptions become runnable again (no dispatch yet).
	try {
		interruptedFound = countInterrupted(store);
		autoResumed = autoResumeInterrupted(store) || [];
	} catch {
		interruptedFound = 0;
		autoResumed = [];
	}
	if (store.schedulerStats) {
		store.schedulerStats.resumedInterrupted =
			(store.schedulerStats.resumedInterrupted || 0) + autoResumed.length;
	}

	// 4. Start ticking (honours `schedulerDisabled`), then shorten pickup to
	// one debounce instead of one full interval.
	startScheduler(store, opts);
	kickScheduler(store, opts);

	const summary = startupRecoverySummary({ interruptedFound, autoResumed });
	return { runs, deploys, autoResumed, interruptedFound, summary };
}
