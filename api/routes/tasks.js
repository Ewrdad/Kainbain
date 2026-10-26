// Role: barrel only — registers work/flow/watch route modules onto the app, defines no handlers.
/***
 * MARK: tasksRoutes
 * @description Facade registering task routes partitioned by business domain:
 *   - The Work: task CRUD, preview, and summary projections (api/work/taskWorkRoutes.js)
 *   - The Flow: stage execution, advancement, failback, and controls (api/flow/taskFlowRoutes.js)
 *   - Watching The Work: logs, stuck checks, and reports (api/watch/taskWatchRoutes.js)
 * @example app.register(tasksRoutes, { deps })
 ***/

import { createAgentRunner } from "../agentRunner.js";
import { createStuckChecker } from "../stuckCheck.js";
import { registerTaskWorkRoutes } from "../work/taskWorkRoutes.js";
import { registerTaskFlowRoutes } from "../flow/taskFlowRoutes.js";
import { registerTaskWatchRoutes } from "../watch/taskWatchRoutes.js";

export default async function tasksRoutes(app, { deps }) {
	const {
		resolveAndGuardProject,
		getOrCreateSession,
		projectStore,
		taskStore,
		promptEngine,
		isAgentRunning,
		agentRunner: injectedAgentRunner,
		sessionStore,
		stuckChecker: injectedStuckChecker,
	} = deps;

	const agentRunner =
		injectedAgentRunner ||
		createAgentRunner({
			getOrCreateSession,
			// Project lookup for alias resolution: stages on the virtual
			// `alias` harness resolve to the alias's current harness + model
			// before dispatch (mirrors the composition root in api/index.js).
			getProject: (projectId) => projectStore.getProject(projectId),
		});

	const stuckChecker =
		injectedStuckChecker ||
		createStuckChecker({ sessionStore, taskStore, projectStore });

	const routedDeps = {
		...deps,
		agentRunner,
		stuckChecker,
	};

	await registerTaskWorkRoutes(app, routedDeps);
	await registerTaskFlowRoutes(app, routedDeps);
	await registerTaskWatchRoutes(app, routedDeps);
}
