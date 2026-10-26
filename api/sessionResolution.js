/**
 * @description Factory over projectStore + sessionStore that exposes session
 *   helpers used by agentRunner and routes.
 * @param {Object} options
 * @param {Object} options.projectStore
 * @param {Object} options.sessionStore
 * @returns {Object} { getOrCreateSession, disposeSession, isAgentRunning }
 */
export function createSessionHelpers({ projectStore, sessionStore }) {
	async function getOrCreateSession(projectId, meta = {}) {
		const project = projectStore.getProject(projectId);
		if (!project) return null;
		if (meta && (meta.taskId || meta.stageId)) {
			return sessionStore.beginStageSession(project, meta);
		}
		return sessionStore.getOrCreate(project);
	}

	async function disposeSession(projectId) {
		await sessionStore.dispose(projectId);
	}

	function isAgentRunning(session) {
		return session?.isStreaming === true;
	}

	return { getOrCreateSession, disposeSession, isAgentRunning };
}
