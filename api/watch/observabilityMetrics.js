// Domain: Watching The Work — comprehensive metrics aggregation across projects.
import {
	readActiveSessionDisplay,
	resolveActiveTaskDisplay,
	resolveMonitorTarget,
} from "../activeTaskDisplay.js";
import { getGitLockStats } from "../work/gitLock.js";
import { normalizeStageType } from "../projectStore.js";

/***
 * MARK: computeObservabilityMetrics
 * @description Aggregates comprehensive telemetry across projects: queue order, successes,
 * failures, active task details, full prompt, live debug information, and stats.
 * Awaits read-only harness capabilities for the observed model and prompt.
 * The activeTask payload carries the run harness's `modelSelection` (`"none"`
 * for harness-managed models) so monitor surfaces can hide the Model pill,
 * plus `isAutomatedStage` (true for scripted ci/deploy/merge stages, which
 * report no model or harness) so monitor surfaces can hide both pills there.
 * Alias runs additionally carry `alias: { name, targetIndex }` (the alias
 * behind the run plus the picked weighted-target index) while `harness` /
 * `model` / `modelDetails` describe the PICKED concrete target
 * (`modelDetails.source` is `"alias"` unless a live session was observed,
 * which stays `"session"`); unknown/deleted/blank aliases carry
 * `alias: null` plus `aliasMissing: "<name>"` with the fallback actually
 * shown. Queued/idle picks are peek previews of the next rotation slot
 * (display reads never consume a step); live-session values are actuals.
 * @param {Object} taskStore - TaskStore instance.
 * @param {string} [filterProjectId]
 * @returns {Promise<Object>}
 ***/
export async function computeObservabilityMetrics(taskStore, filterProjectId) {
	const projects =
		taskStore.projectStore && typeof taskStore.projectStore.listProjects === "function"
			? taskStore.projectStore.listProjects()
			: [];
	const targetProjects = filterProjectId
		? projects.filter((p) => p.id === filterProjectId)
		: projects;

	// Single source of truth for "running" is the engine owner
	// (engineState.activeTaskId while status === 'running'). Task statuses
	// are stale-prone labels: counting every running_* task is what produced
	// phantom second runners on the monitor.
	const engineState = taskStore.getEngineState();
	const isEngineOwner = (task) =>
		engineState.status === "running" &&
		engineState.activeTaskId != null &&
		String(engineState.activeTaskId) === String(task.id);

	let total = 0;
	let completed = 0;
	let failed = 0;
	let running = 0;
	let waitingHuman = 0;
	let paused = 0;
	let inStage = 0;
	let blocked = 0;

	const recentCompleted = [];
	const recentFailed = [];
	const allTasks = [];

	for (const project of targetProjects) {
		const tasks = taskStore.listTasks(project.id, project.cwd);
		for (const task of tasks) {
			total += 1;
			allTasks.push({ ...task, projectName: project.name });
			const isTaskBlocked = taskStore.isTaskBlocked(project.id, task.id).blocked;

			if (task.status === "completed") {
				completed += 1;
				recentCompleted.push({
					id: task.id,
					title: task.title,
					goal: task.goal,
					projectId: project.id,
					projectName: project.name,
					completedAt: task.updatedAt,
					timeInStage: task.timeInStage,
					reportsCount: task.reports?.length || 0,
				});
			} else if (task.status === "failed") {
				failed += 1;
				recentFailed.push({
					id: task.id,
					title: task.title,
					goal: task.goal,
					projectId: project.id,
					projectName: project.name,
					failedAt: task.updatedAt,
					failureReason:
						task.failureReason || task.lastError?.message || "Execution error",
					lastError: task.lastError || null,
				});
			} else if (isEngineOwner(task)) {
				// Only the engine owner counts as running (0..1 total). Any
				// other running_* label is stale and must not inflate the count.
				running += 1;
			} else if (task.status === "waiting_human") {
				waitingHuman += 1;
			} else if (task.status === "paused") {
				paused += 1;
			} else {
				inStage += 1;
				if (isTaskBlocked) blocked += 1;
			}
		}
	}

	recentCompleted.sort(
		(a, b) =>
			new Date(b.completedAt || 0).getTime() -
			new Date(a.completedAt || 0).getTime(),
	);
	recentFailed.sort(
		(a, b) =>
			new Date(b.failedAt || 0).getTime() - new Date(a.failedAt || 0).getTime(),
	);

	const resolvedSum = completed + failed;
	const successRate =
		resolvedSum > 0 ? ((completed / resolvedSum) * 100).toFixed(1) : "100.0";
	const failureRate =
		resolvedSum > 0 ? ((failed / resolvedSum) * 100).toFixed(1) : "0.0";

	let activeTask = null;

	// The engine owner is the only live task. A stale running_* label on a
	// non-owner must never be promoted to activeTask (that phantom is what
	// made the monitor name two runners at once); with no owner the panel
	// falls through to the last-executed task below.
	if (engineState.activeTaskId) {
		const found = allTasks.find((t) => t.id === engineState.activeTaskId);
		if (found) {
			const project = projects.find((p) => p.id === found.projectId);
			const reports = taskStore.getTaskReports(
				found.projectId,
				found.id,
				project?.cwd,
			);
			activeTask = {
				...found,
				reports,
			};
		}
	}

	if (!activeTask && (recentCompleted.length > 0 || recentFailed.length > 0)) {
		const lastId = recentCompleted[0]?.id || recentFailed[0]?.id;
		const found = allTasks.find((t) => t.id === lastId);
		if (found) {
			activeTask = {
				...found,
				isLastExecuted: true,
			};
		}
	}

	if (activeTask) {
		const project = projects.find((p) => p.id === activeTask.projectId);
		const isActive =
			engineState.activeTaskId === activeTask.id &&
			engineState.activeProjectId === activeTask.projectId &&
			engineState.status === "running";
		const stageId = isActive
			? engineState.activeStageId
			: activeTask.currentStageId;
		const stage = taskStore._resolveStagesForTask(project, activeTask).find(
			(s) =>
				String(s.id) === String(stageId) ||
				s.name?.toLowerCase() === String(stageId).toLowerCase(),
		);
		// Do not use get(): its project fallback can belong to a different task.
		const entry = taskStore.sessionStore?.sessions?.get(
			`${activeTask.projectId}:${activeTask.id}`,
		);
		const session =
			isActive && entry?.taskId === activeTask.id && entry?.stageId === stageId
				? entry.session
				: null;
		// Display-only read: peeking reports the alias rotation's next target
		// without consuming a step (every dashboard poll would otherwise skew
		// the configured percent split). The full-pick display seam owns
		// stage alias refs; the legacy fallbacks serve only older test
		// doubles that stub the harness-only paths.
		const displayTarget = taskStore.sessionStore?.resolveDisplayTarget?.(project, stage, { peek: true });
		const resolvedHarness = displayTarget
			? { name: displayTarget.harnessName, harness: displayTarget.harness }
			: (taskStore.sessionStore?.resolveDisplayHarness?.(project, stage, { peek: true })
				?? taskStore.sessionStore?._resolveHarness?.(project, stage?.harness, { peek: true }));
		// One consistent monitor triple: the live session's actuals win over
		// the peek preview; the alias identity rides along untouched.
		const monitorTarget = resolveMonitorTarget({
			session,
			displayTarget,
			resolvedHarness,
			stage,
			project,
		});
		const observed = await readActiveSessionDisplay(session);
		// An alias reference substitutes its peeked pick's model for the
		// alias NAME in the stage slot (and suppresses the project slot —
		// dispatch never consults the project default there); legacy doubles
		// without the seam keep today's raw slots.
		const effStage = displayTarget
			? { ...stage, harness: monitorTarget.harnessName, model: monitorTarget.modelRef }
			: { ...stage, harness: monitorTarget.harnessName };
		const effProject = displayTarget
			? { ...project, defaultModel: monitorTarget.projectModelRef }
			: project;
		let display = resolveActiveTaskDisplay(
			activeTask,
			effStage,
			effProject,
			observed.model,
			monitorTarget.harnessInstance,
		);
		// A resolved alias (missing aliases carry `aliasMissing` instead
		// and never populate `alias`).
		const resolvedAlias = monitorTarget.aliasName;
		// The picked concrete target reports source "alias" (a queued/idle
		// pick is a peek preview; a live session's observed values keep
		// source "session" and win over the preview, exactly as today).
		if (resolvedAlias && display.modelDetails?.source === "stage") {
			display = {
				...display,
				modelDetails: { ...display.modelDetails, source: "alias" },
			};
		}
		const input = observed.messages.find(
			(message) => message?.role === "user",
		)?.content;
		const dispatchedPrompt =
			typeof input === "string"
				? input
				: Array.isArray(input)
					? input
							.filter((part) => part.type === "text")
							.map((part) => part.text)
							.join("\n")
					: null;
		activeTask = {
			...activeTask,
			...display,
			stageId: stageId || null,
			// The alias identity behind the picked harness/model (scripted
			// stages report no model identity at all, alias included).
			alias:
				!display.isAutomatedStage && resolvedAlias
					? {
							name: resolvedAlias,
							targetIndex: monitorTarget.targetIndex,
						}
					: null,
			aliasMissing:
				!display.isAutomatedStage
					? monitorTarget.aliasMissing
					: null,
			// Keep the persisted field intact; expose dispatch-only additions separately.
			dispatchedPrompt: dispatchedPrompt || null,
			promptPending:
				isActive && normalizeStageType(stage?.type) === "agent" && !dispatchedPrompt && !session,
			promptSource: dispatchedPrompt ? "session" : "curated",
		};
	}

	const queue = taskStore.getScheduledQueue(filterProjectId);

	return {
		stats: {
			total,
			completed,
			failed,
			running,
			waitingHuman,
			paused,
			inStage,
			blocked,
			queueDepth: queue.length,
			successRate: Number(successRate),
			failureRate: Number(failureRate),
		},
		engineState,
		queue,
		activeTask,
		recentCompleted: recentCompleted.slice(0, 10),
		recentFailed: recentFailed.slice(0, 10),
		executionQueue: {
			isRunning: taskStore.executionQueue.isRunning,
			size: taskStore.executionQueue.size,
			highQueueSize: taskStore.executionQueue.highQueue.length,
			normalQueueSize: taskStore.executionQueue.normalQueue.length,
		},
		schedulerRunning: taskStore.schedulerRunning,
		schedulerStats: { ...(taskStore.schedulerStats || {}) },
		// Git serialization-gate contention (totals only — per-repo paths
		// stay out of the snapshot): waits > 0 proves the gate is
		// serializing concurrent git demand; climbing waits with piling
		// stages points at a bypass outside the gate.
		gitContention: { ...getGitLockStats().totals },
	};
}
