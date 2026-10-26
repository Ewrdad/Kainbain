/***
 * MARK: resolveEngineOwnerSnapshot
 * @description Projects the engine owner's full task record down to the
 * project-independent snapshot the Now Playing bar names. Resolved from the
 * OWNING project (`engineState.activeProjectId`), never the UI-selected one,
 * so switching projects cannot move the bar. Returns null when the engine
 * names no owner or the owner record is gone (the bar then names nothing
 * rather than a second task). Best-effort and never throws.
 * @example resolveEngineOwnerSnapshot(store) => { id: 't1', goal: '...', status: 'running_agent', ... } | null
 * @param {Object} [store] - The TaskStore (read-only use).
 * @returns {Object|null} The owner snapshot, or null.
 ***/
export function resolveEngineOwnerSnapshot(store) {
	let activeTaskId;
	let activeProjectId;
	let activeProjectName;
	try {
		({ activeTaskId, activeProjectId, activeProjectName } =
			store?.engineState || {});
	} catch {
		return null;
	}
	if (activeTaskId == null || activeProjectId == null) return null;
	let task = null;
	try {
		task = store.getTask(activeProjectId, activeTaskId) || null;
	} catch {
		task = null;
	}
	if (!task) {
		try {
			for (const candidate of store._getMap(activeProjectId)?.values?.() ||
				[]) {
				if (String(candidate?.id) === String(activeTaskId)) {
					task = candidate;
					break;
				}
			}
		} catch {
			task = null;
		}
	}
	if (!task) return null;
	let projectName = activeProjectName || null;
	let workflowName = null;
	try {
		projectName =
			store.projectStore?.getProject?.(activeProjectId)?.name || projectName;
	} catch {
		// Keep the engine-carried name.
	}
	try {
		if (task.workflowId) {
			workflowName =
				store.projectStore?.getWorkflow?.(activeProjectId, task.workflowId)
					?.name || null;
		}
	} catch {
		workflowName = null;
	}
	return {
		id: task.id,
		goal: task.goal ?? null,
		title: task.title ?? null,
		status: task.status ?? null,
		workflowId: task.workflowId ?? null,
		workflowName,
		projectId: task.projectId ?? activeProjectId,
		projectName,
		currentStageId: task.currentStageId ?? null,
		updatedAt: task.updatedAt ?? null,
	};
}
