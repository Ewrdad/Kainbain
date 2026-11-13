import {
	resolveCandidateStage,
	resolveStagesForTask,
} from '../stageResolution.js';
import {
	normalizeStageType,
} from '../../projectStore.js';
import {
	isAutoApproveReminderDue,
	isAutoApproveStampDue,
	parseAutoApproveDuration,
	resolveAutoApproveReminderLeadMs,
} from '../../../shared/autoApproveDuration.js';

/***
 * MARK: checkAutoApproveTask
 * @description Single shared predicate for "does the auto-approve sweeper
 *   act on this task right now". A task qualifies only when it is still
 *   `waiting_human` at an unpaused `human` stage with a live deadline
 *   stamp, and is neither blocked, Runner-claimed, nor the engine's live
 *   `running` owner. Returns the verdict (`due` past the deadline,
 *   `remind` inside the lead window) or null. Total: unreadable input
 *   reads as null (fail closed — a bad stamp never fires).
 * @example checkAutoApproveTask(store, project, { status: 'in_stage' }) => null
 * @param {Object} store - Task store (block/claim/engine reads only).
 * @param {Object} project - Owning project (stage resolution).
 * @param {Object} task - Candidate task.
 * @param {Object} [opts]
 * @param {number} [opts.now] - Clock injection (defaults to Date.now()).
 * @param {number} [opts.configuredLeadMs] - Configured reminder lead (0 disables reminders).
 * @returns {Object|null} `{ kind: 'due'|'remind', projectId, taskId, task, stage, stages, projectCwd, stampMs, durationMs }`, or null.
 ***/
export const checkAutoApproveTask = (store, project, task, { now = Date.now(), configuredLeadMs } = {}) => {
	try {
		if (!task || typeof task !== "object") return null;
		if (task.status !== "waiting_human") return null;
		const stages = resolveStagesForTask(project, task);
		const stage = resolveCandidateStage(stages, task.currentStageId);
		if (!stage) return null;
		if (normalizeStageType(stage?.type) !== "human") return null;
		if (stage?.paused === true) return null;
		const stampMs = Date.parse(task.autoApproveAt ?? "");
		if (!Number.isFinite(stampMs)) return null;
		// Duration feeds the reminder lead only (the stamp, not the live
		// config, decides firing): prefer the stage value, else the
		// stamp-minus-entry span, so mid-wait config edits never break it.
		let durationMs = parseAutoApproveDuration(stage?.autoApproveAfterMs);
		if (!durationMs) {
			const enteredMs = Date.parse(task.enteredStageAt ?? "");
			const span = stampMs - enteredMs;
			durationMs = Number.isFinite(span) && span > 0 ? span : null;
		}
		// Blocked tasks stay parked: auto-advancing past unresolved
		// dependencies would silently skip the gate they exist to enforce.
		if (typeof store?.isTaskBlocked === "function") {
			let blocked = false;
			try {
				blocked = store.isTaskBlocked(project?.id, task.id)?.blocked === true;
			} catch {
				return null;
			}
			if (blocked) return null;
		}
		// A Runner-held lease owns the task out-of-process: the sweeper
		// must not advance it from under the Runner (D1 — one holder,
		// one runner; mirrors the /execute 409 guard).
		try {
			if (store?.claimStore?.describe?.(task.id)) return null;
		} catch {
			return null;
		}
		// The live engine owner never auto-advances out from under itself
		// (a human-parked task should never own a running engine, but the
		// guard closes the double-advance class entirely).
		const engine = store?.engineState;
		if (
			engine?.status === "running" &&
			engine?.activeTaskId != null &&
			String(engine.activeTaskId) === String(task.id)
		) {
			return null;
		}
		const verdict = {
			projectId: project?.id,
			taskId: task.id,
			task,
			stage,
			stages,
			projectCwd: project?.cwd,
			stampMs,
			durationMs,
		};
		if (isAutoApproveStampDue(task.autoApproveAt, now)) {
			return { ...verdict, kind: "due" };
		}
		const leadMs = resolveAutoApproveReminderLeadMs(durationMs, configuredLeadMs);
		if (leadMs !== null && isAutoApproveReminderDue(task, leadMs, now)) {
			return { ...verdict, kind: "remind" };
		}
		return null;
	} catch {
		return null;
	}
};

/***
 * MARK: collectAutoApproveCandidates
 * @description Scans every project once per sweep (the `countHumanPendingTasks`
 *   pattern) and splits human-parked tasks with live stamps into `due`
 *   (deadline passed) and `reminders` (inside the lead window), each sorted
 *   earliest-deadline-first so batch caps always shed the least-overdue
 *   work. Total: unreadable stores read as empty, never throw.
 * @example collectAutoApproveCandidates(store) => { due: [], reminders: [] }
 * @param {Object} store - Task store.
 * @param {Object} [opts]
 * @param {number} [opts.now] - Clock injection (defaults to Date.now()).
 * @param {number} [opts.configuredLeadMs] - Configured reminder lead (0 disables reminders).
 * @returns {{ due: Array, reminders: Array }} Sorted candidate lists.
 ***/
export function collectAutoApproveCandidates(store, { now = Date.now(), configuredLeadMs } = {}) {
	const due = [];
	const reminders = [];
	try {
		if (!store?.projectStore || typeof store.projectStore.listProjects !== "function") {
			return { due, reminders };
		}
		const projects = store.projectStore.listProjects();
		if (!Array.isArray(projects)) return { due, reminders };
		for (const project of projects) {
			if (!project || typeof project !== "object" || !project.id) continue;
			let tasks;
			try {
				tasks = store.listTasks(project.id, project.cwd);
			} catch {
				continue;
			}
			if (!Array.isArray(tasks)) continue;
			for (const task of tasks) {
				const verdict = checkAutoApproveTask(store, project, task, { now, configuredLeadMs });
				if (!verdict) continue;
				(verdict.kind === "due" ? due : reminders).push(verdict);
			}
		}
	} catch {
		// Fall through with whatever was collected.
	}
	due.sort((a, b) => a.stampMs - b.stampMs);
	reminders.sort((a, b) => a.stampMs - b.stampMs);
	return { due, reminders };
}
