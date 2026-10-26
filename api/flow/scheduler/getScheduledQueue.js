import {
	circuitSnapshot,
} from '../circuitBreaker.js';
import {
	candidateStageIndex,
	resolveStagesForTask,
} from '../stageResolution.js';
import {
	normalizeStageType,
} from '../../projectStore.js';
import {
	RESUMED_PRIORITY_RANK,
	RESUMED_QUEUE_REASON,
} from '../routing/tables/index.js';
import { isResumedAfterInterruption } from './isResumedAfterInterruption.js';
import { isResumedStageRunnable } from './isResumedStageRunnable.js';
import { isAutoResumable } from './isAutoResumable.js';

/***
 * MARK: getScheduledQueue
 * @description Returns the ordered list of all tasks across projects (or filtered by projectId)
 * prioritized for execution according to KainBain's scheduling rules.
 * Alias items carry `alias: { name, targetIndex }` (the alias behind the
 * run plus the picked weighted-target index) while `harness` / `model`
 * describe the PICKED concrete target; unknown/deleted/blank aliases carry
 * `alias: null` plus `aliasMissing: "<name>"` with the fallback actually
 * shown. Picks are peek previews (display reads never consume a rotation
 * step). Non-alias items carry `alias: null` / `aliasMissing: null` with
 * today's raw stage model unchanged.
  * @example getScheduledQueue(store) => [{ taskId, status, … }]
 ***/
export function getScheduledQueue(store, filterProjectId) {
	const projects =
		store.projectStore && typeof store.projectStore.listProjects === "function"
			? store.projectStore.listProjects()
			: [];
	const activeEngine = store.getEngineState();
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
			if (
				task.status === "completed" ||
				task.status === "done" ||
				task.status === "failed" ||
				task.status === "cancelled"
			) {
				continue;
			}
			const stages = resolveStagesForTask(project, task);
			const stageIndex = candidateStageIndex(stages, task.currentStageId);
			const stage = stageIndex !== -1 ? stages[stageIndex] : stages[0] || null;

			// Exclude human-review tasks (waiting_human or at a human checkpoint stage) (#29)
			if (
				task.status === "waiting_human" ||
				normalizeStageType(stage?.type) === "human"
			) {
				continue;
			}

			const blockCheck = store.isTaskBlocked(project.id, task.id);
			const isRunning =
				activeEngine.activeTaskId === task.id && activeEngine.status === "running";

			let priorityRank = 3;
			let priorityReason = "Standard Queue";

			if (isRunning) {
				priorityRank = 0;
				priorityReason = "Active Execution";
			} else if (
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
			} else if (blockCheck.blocked) {
				priorityRank = 5;
				priorityReason = `Blocked by: ${blockCheck.blockers.join(", ")}`;
			} else if (task.status === "paused") {
				priorityRank = 6;
				priorityReason = "Paused";
			} else if (stage?.paused) {
				priorityRank = 6;
				priorityReason = "Stage Paused";
			} else {
				priorityRank = 2;
				priorityReason = `Stage ${stageIndex + 1}/${stages.length || 1} (Priority Rule: Furthest Along)`;
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
				isRunning,
				isBlocked: blockCheck.blocked,
				blockers: blockCheck.blockers,
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
		item.deferredByTrip = containment.tripped && !item.isRunning;
		if (containment.tripped && !item.isRunning) {
			item.priorityReason = `Engine tripped — deferred (${containment.reason || "systemic failure"})`;
		}
	}

	// Corrupt dates collapse to the epoch instead of NaN so one bad timestamp
	// can never poison the order and starve the rest of the queue.
	const safeTime = (value) => {
		const parsed = new Date(value || 0).getTime();
		return Number.isFinite(parsed) ? parsed : 0;
	};
	items.sort((a, b) => {
		if (a.priorityRank !== b.priorityRank) {
			return a.priorityRank - b.priorityRank;
		}
		if (a.priorityRank === 2 && b.priorityRank === 2) {
			if (b.stageIndex !== a.stageIndex) {
				return b.stageIndex - a.stageIndex;
			}
			return safeTime(a.enteredStageAt) - safeTime(b.enteredStageAt);
		}
		// Resumed interruptions: oldest interruption first, matching Rule 0.
		// Uses the `interruptedAt` snapshot, not `updatedAt`: startup
		// recovery stamps every resumed task with "now", which would make
		// the order arbitrary.
		if (
			a.priorityRank === RESUMED_PRIORITY_RANK &&
			b.priorityRank === RESUMED_PRIORITY_RANK
		) {
			return safeTime(a.interruptedAt || a.updatedAt) - safeTime(b.interruptedAt || b.updatedAt);
		}
		return safeTime(a.enteredStageAt) - safeTime(b.enteredStageAt);
	});

	return items.map((item, idx) => ({ ...item, queueOrder: idx + 1 }));
}
