import {
	candidateStageIndex,
	resolveStagesForTask as defaultResolveStagesForTask,
} from "../stageResolution.js";
import { isSchedulerRunnable } from "./isSchedulerRunnable.js";

// Re-entrancy guard for the engine-snapshot fallback below.
// `store.getEngineState()` derives `openQueueDepth` through
// `countOpenTasksGlobal` -> this predicate, so calling it from inside that
// derivation without a guard would recurse until the stack overflows. While
// any fallback call is in flight, nested calls must rely on the raw field
// (or on nothing) and never call back into `getEngineState()`.
let resolvingEngineSnapshot = false;

/***
 * MARK: isWaitingForPickup
 * @description Single shared predicate for "this task is waiting for a
 *   runner/scheduler to pick it up right now". Backs BOTH the bottom-bar
 *   queue chip (`countOpenTasksGlobal`) and the dispatch-order popup
 *   (`getScheduledQueue`), so the two can never disagree about the set they
 *   describe. A task waits only when every clause holds: its status is
 *   `in_stage` (or `interrupted` and auto-resumable for its current stage),
 *   its current stage resolves to an automated, unpaused stage, it is not
 *   blocked, no Runner holds a live lease on it, and it is not the active
 *   engine owner while the engine runs. Terminal, waiting-human, paused,
 *   advancing, checkpoint, idle, and running_* tasks are never waiting.
 *   Dispatch eligibility itself is delegated to `isSchedulerRunnable` (with
 *   `allowInterrupted`), so the displayed queue mirrors scheduler pickup by
 *   construction. Read-only and total: resolution touches only in-memory
 *   maps (never `listTasks` or a disk rescan) and any unreadable input —
 *   missing store, unresolvable project/stage, throwing checker — resolves
 *   that task to false instead of throwing. The engine snapshot is read
 *   from the raw `store.engineState` field first: `store.getEngineState()`
 *   derives its depth through this predicate, so calling it here unguarded
 *   would recurse; it is only a last-resort fallback when the raw field is
 *   absent, and a module-level re-entrancy guard makes that fallback safe
 *   (nested calls inside the derivation never call back into it).
 * @example isWaitingForPickup({ status: "in_stage", ... }, { store, stage: { type: "agent" } }) => true
 * @example isWaitingForPickup({ status: "completed" }, { store }) => false
 * @param {Object} task - The task record.
 * @param {Object} [context] - Resolution context; every field is optional.
 * @param {Object} [context.store] - The TaskStore (read-only use).
 * @param {Object} [context.project] - Pre-resolved project (skips the lookup).
 * @param {string} [context.projectId] - Project id for lookups/block checks.
 * @param {Object} [context.stage] - Pre-resolved stage (skips resolution).
 * @param {boolean} [context.blocked] - Pre-resolved block verdict.
 * @param {boolean} [context.claimed] - Pre-resolved runner-lease verdict.
 * @param {Object} [context.engineState] - Pre-resolved engine snapshot.
 * @param {Function} [context.resolveStagesForTask] - Stage-list seam for tests.
 * @returns {boolean} True only when the task waits for pickup right now.
 ***/
export function isWaitingForPickup(task, context = {}) {
	try {
		if (!task || typeof task !== "object") return false;
		// Only live, dispatchable labels can wait: this one gate excludes
		// terminal (completed/done/failed/cancelled), waiting_human, paused,
		// advancing, checkpoint, idle, and every running_* status.
		if (task.status !== "in_stage" && task.status !== "interrupted") {
			return false;
		}

		const ctx =
			context && typeof context === "object" ? context : {};
		const store =
			ctx.store && typeof ctx.store === "object" ? ctx.store : null;
		const projectId = ctx.projectId ?? task.projectId ?? null;

		// Project: explicit injection wins, else the in-memory ProjectStore.
		let project = ctx.project ?? null;
		if (!project && projectId != null) {
			const getProject = store?.projectStore?.getProject;
			if (typeof getProject === "function") {
				try {
					project = getProject.call(store.projectStore, projectId) || null;
				} catch {
					return false;
				}
			}
		}

		// Stage: explicit injection wins, else a strict id/name resolution.
		// No stages[0] fallback: a task pointing at a deleted stage cannot
		// be picked up, so it is not waiting either.
		let stage = ctx.stage ?? null;
		if (!stage) {
			const resolveStages =
				typeof ctx.resolveStagesForTask === "function"
					? ctx.resolveStagesForTask
					: defaultResolveStagesForTask;
			let stages;
			try {
				stages = resolveStages(project, task) || [];
			} catch {
				return false;
			}
			let index = -1;
			try {
				index = candidateStageIndex(stages, task.currentStageId);
			} catch {
				return false;
			}
			if (index === -1) return false;
			stage = stages[index] || null;
			if (!stage) return false;
		}

		// Blocked: explicit injection wins, else the store verdict. A store
		// without the checker (minimal doubles) reads as unblocked.
		let blocked = false;
		if (typeof ctx.blocked === "boolean") {
			blocked = ctx.blocked;
		} else if (store && typeof store.isTaskBlocked === "function") {
			try {
				blocked =
					store.isTaskBlocked(projectId ?? project?.id, task.id)
						?.blocked === true;
			} catch {
				return false;
			}
		}

		// Claimed: explicit injection wins, else a live runner lease. A
		// store without a claim store (tests, older wiring) reads as
		// unclaimed.
		let claimed = false;
		if (typeof ctx.claimed === "boolean") {
			claimed = ctx.claimed;
		} else if (
			store?.claimStore &&
			typeof store.claimStore.describe === "function"
		) {
			try {
				claimed = store.claimStore.describe(task.id) != null;
			} catch {
				return false;
			}
		}

		// Scheduler eligibility: automated unpaused stage, unblocked,
		// unclaimed, and — for interruptions — the auto-resume policy.
		let runnable = false;
		try {
			runnable = isSchedulerRunnable(task, stage, {
				blocked,
				allowInterrupted: true,
				claimed,
			});
		} catch {
			return false;
		}
		if (!runnable) return false;

		// The active engine owner is being worked on, not waiting — but only
		// while the engine actively runs it; a stale owner id on an idle
		// engine must not hide a waiting task. The raw `store.engineState`
		// field is the only safe in-derivation source: `getEngineState()`
		// derives its depth through this very predicate, so it is called only
		// as a last-resort fallback, and never re-entrantly (guard above).
		let engineState = ctx.engineState ?? null;
		if (!engineState && store && !resolvingEngineSnapshot) {
			try {
				engineState = store.engineState ?? null;
			} catch {
				engineState = null;
			}
			if (!engineState && typeof store.getEngineState === "function") {
				resolvingEngineSnapshot = true;
				try {
					engineState = store.getEngineState() || null;
				} catch {
					engineState = null;
				} finally {
					resolvingEngineSnapshot = false;
				}
			}
		}
		try {
			const ownerId = engineState?.activeTaskId;
			const engineStatus = engineState?.status;
			if (
				ownerId != null &&
				task.id != null &&
				String(ownerId) === String(task.id) &&
				(engineStatus === "running" || engineStatus === "advancing")
			) {
				return false;
			}
		} catch {
			return false;
		}

		return true;
	} catch {
		return false;
	}
}
