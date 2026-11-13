import {
	circuitSnapshot,
} from '../circuitBreaker.js';
import {
	candidateStageIndex,
	resolveStagesForTask,
} from '../stageResolution.js';
import {
	RESUMED_PRIORITY_RANK,
	RESUMED_QUEUE_REASON,
} from '../routing/tables/index.js';
import { isResumedAfterInterruption } from './isResumedAfterInterruption.js';
import { isResumedStageRunnable } from './isResumedStageRunnable.js';
import { isAutoResumable } from './isAutoResumable.js';
import { isWaitingForPickup } from './isWaitingForPickup.js';
import { compareCentralQueueCandidates } from './compareCentralQueueCandidates.js';
import { isCentralQueueCandidateOverdue } from './isCentralQueueCandidateOverdue.js';
import { resolveCentralQueuePolicy } from './centralQueuePolicy.js';

/***
 * MARK: getScheduledQueue
 * @description Returns the ordered list of all tasks across projects (or filtered by projectId)
 * prioritized for execution according to KainBain's scheduling rules.
 * Lists ONLY tasks waiting to be picked up right now (the shared
 * `isWaitingForPickup` verdict — the same set the bottom-bar queue chip
 * counts): tasks already running, blocked, paused, failed, cancelled, or
 * waiting-human never appear. Emitted items keep `isRunning: false` /
 * `isBlocked: false` for shape compatibility. Alias items carry
 * `alias: { name, targetIndex }` (the alias behind the run plus the
 * picked weighted-target index) while `harness` / `model` describe the
 * PICKED concrete target; unknown/deleted/blank aliases carry
 * `alias: null` plus `aliasMissing: "<name>"` with the fallback actually
 * shown. Picks are peek previews (display reads never consume a rotation
 * step). Non-alias items carry `alias: null` / `aliasMissing: null` with
 * today's raw stage model unchanged. The list order is the shared
 * central-queue dispatch order (`sortCentralQueue`), so the popup mirrors
 * what runs next.
 * @param {Object} store
 * @param {string} [filterProjectId] - Restrict to one project; omitted = ALL projects (the central queue).
 * @param {Object} [opts] - Central-queue policy overrides (`order`, `maxWaitMs`, `now`); omitted = config defaults.
  * @example getScheduledQueue(store) => [{ taskId, status, … }]
 ***/
export function getScheduledQueue(store, filterProjectId, opts = {}) {
	const projects =
		store.projectStore && typeof store.projectStore.listProjects === "function"
			? store.projectStore.listProjects()
			: [];
	const activeEngine = store.getEngineState();
	const queuePolicy = resolveCentralQueuePolicy(opts);
	const items = [];

	const targetProjects = filterProjectId
		? projects.filter((p) => p.id === filterProjectId)
		: projects;

	for (const project of targetProjects) {
		let tasks;
		try {
			tasks = store.listTasks(project.id, project.cwd);
		} catch {
			continue;
		}
		for (const task of tasks) {
			const stages = resolveStagesForTask(project, task);
			const stageIndex = candidateStageIndex(stages, task.currentStageId);
			// Strict: no stages[0] fallback — a task pointing at a deleted
			// stage cannot be picked up, so it is not waiting either.
			const stage = stageIndex !== -1 ? stages[stageIndex] : null;

			let blockCheck;
			try {
				blockCheck = store.isTaskBlocked(project.id, task.id);
			} catch {
				continue;
			}
			let claimed = false;
			try {
				claimed =
					typeof store.claimStore?.describe === "function"
						? store.claimStore.describe(task.id) != null
						: false;
			} catch {
				continue;
			}

			// The queue lists exactly the waiting set — the same verdict the
			// bottom-bar chip counts — so running, blocked, paused, failed,
			// cancelled, and waiting-human tasks never appear here.
			if (
				!isWaitingForPickup(task, {
					store,
					project,
					stage,
					blocked: blockCheck?.blocked === true,
					claimed,
					engineState: activeEngine,
				})
			) {
				continue;
			}

			let priorityRank = 3;
			let priorityReason = "Standard Queue";

			if (
				stageIndex !== -1 &&
				stage &&
				((task.status === "interrupted" &&
					isAutoResumable(task, stage, { blocked: blockCheck.blocked })) ||
					(isResumedAfterInterruption(task) &&
						isResumedStageRunnable(stage, { blocked: blockCheck.blocked, task })))
			) {
				// Mirrors dispatch Rule 0: resumable interruptions — still
				// labelled or already flipped back to `in_stage` by startup
				// recovery — sort ahead of follow-ons so the display matches
				// dispatch order.
				priorityRank = RESUMED_PRIORITY_RANK;
				priorityReason = RESUMED_QUEUE_REASON;
			} else if (
				store.lastCompletedTask &&
				store.lastCompletedTask.projectId === project.id &&
				store.lastCompletedTask.taskId === task.id
			) {
				priorityRank = 1;
				priorityReason = "Follow-On Priority";
			} else {
				priorityRank = 2;
				priorityReason =
					queuePolicy.order === 'furthest-along'
						? `Stage ${stageIndex + 1}/${stages.length || 1} (Priority Rule: Furthest Along)`
						: `Stage ${stageIndex + 1}/${stages.length || 1} (Central Queue: oldest waiting first)`;
			}

			// Display-only read: the full-pick display seam owns stage alias
			// refs (peeking never consumes a rotation step); the legacy
			// fallbacks serve only older test doubles without the seam.
			const displayTarget = store.sessionStore?.resolveDisplayTarget?.(project, stage, { peek: true });
			// Alias queue items report the PICKED target model (never the alias
			// name) plus the alias identity; non-alias items keep today's
			// raw stage model byte-identically.
			const queueModel =
				displayTarget?.aliasName || displayTarget?.aliasMissing
					? [displayTarget.modelRef, displayTarget.projectModelRef].find(
							(value) => typeof value === "string" && value.trim(),
						) || "default"
					: stage?.model || "default";
			// A resolved alias (missing aliases carry `aliasMissing`
			// instead and never populate `alias`).
			const queueAlias =
				displayTarget && !displayTarget.aliasMissing
					? displayTarget.aliasName
					: null;
			items.push({
				id: task.id,
				title: task.title || task.goal?.slice(0, 60) || "Untitled task",
				goal: task.goal || task.title || "",
				prompt: task.prompt || "",
				projectId: project.id,
				projectName: project.name || project.id,
				workflowId: task.workflowId || "wf-default",
				currentStageId: task.currentStageId || stage?.id || null,
				currentStageName: stage?.name || task.currentStageId || "Stage",
				currentStageType: stage?.type || "agent",
				model: queueModel,
				alias: queueAlias
					? {
							name: queueAlias,
							targetIndex: displayTarget.targetIndex,
						}
					: null,
				aliasMissing: displayTarget?.aliasMissing ?? null,
				harness:
					displayTarget?.harnessName ||
					store.sessionStore?.resolveDisplayHarness?.(project, stage, { peek: true })?.name ||
					store.sessionStore?._resolveHarness?.(project, stage?.harness, { peek: true })?.name ||
					stage?.harness ||
					project.harness ||
					null,
				status: task.status,
				// Only waiting tasks are listed, so nothing here runs or
				// blocks; the fields stay for shape compatibility.
				isRunning: false,
				isBlocked: false,
				blockers: [],
				stageIndex: stageIndex !== -1 ? stageIndex : 0,
				totalStages: stages.length || 1,
				enteredStageAt: task.enteredStageAt || task.updatedAt || task.createdAt,
				interruptedAt: task.interruptedAt || null,
				timeInStage: task.timeInStage || 0,
				priorityRank,
				priorityReason,
				updatedAt: task.updatedAt || task.createdAt,
			});
		}
	}

	// Tier-5 containment is a display fact too: when tripped, every queued
	// item is annotated (and its reason reworded) so the queue UI can never
	// contradict the banner served by GET /engine/state.
	const containment = circuitSnapshot(store);
	for (const item of items) {
		item.engineTripped = containment.tripped;
		item.tripReason = containment.tripped ? containment.reason : null;
		item.deferredByTrip = containment.tripped;
		if (containment.tripped) {
			item.priorityReason = `Engine tripped — deferred (${containment.reason || "systemic failure"})`;
		}
	}

	// Corrupt dates collapse to the epoch instead of NaN so one bad timestamp
	// can never poison the order and starve the rest of the queue.
	const safeTime = (value) => {
		const parsed = new Date(value || 0).getTime();
		return Number.isFinite(parsed) ? parsed : 0;
	};
	// The display sorts through the SAME central-queue seam as both dispatch
	// paths, so the popup order is the dispatch order by construction
	// (task 16d6fbd6). A follow-on keeps its display pass only while no other
	// waiting item has waited past the starvation ceiling — mirroring the
	// dispatch-side gate in `findNextCandidateTask`.
	const anyStandardOverdue = items.some(
		(item) =>
			item.priorityRank === 2 && isCentralQueueCandidateOverdue(item, queuePolicy),
	);
	const effectiveRank = (item) =>
		item.priorityRank === 1 && anyStandardOverdue ? 2 : item.priorityRank;
	items.sort((a, b) => {
		const rankA = effectiveRank(a);
		const rankB = effectiveRank(b);
		if (rankA !== rankB) {
			return rankA - rankB;
		}
		if (rankA === 2) {
			return compareCentralQueueCandidates(a, b, queuePolicy);
		}
		// Resumed interruptions: oldest interruption first, matching Rule 0.
		// Uses the `interruptedAt` snapshot, not `updatedAt`: startup
		// recovery stamps every resumed task with "now", which would make
		// the order arbitrary.
		if (
			rankA === RESUMED_PRIORITY_RANK &&
			rankB === RESUMED_PRIORITY_RANK
		) {
			return safeTime(a.interruptedAt || a.updatedAt) - safeTime(b.interruptedAt || b.updatedAt);
		}
		return safeTime(a.enteredStageAt) - safeTime(b.enteredStageAt);
	});

	return items.map((item, idx) => ({ ...item, queueOrder: idx + 1 }));
}
