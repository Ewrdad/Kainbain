/***
 * MARK: workflowsRoutes
 * @description Workflow usage: list in-flight runs and start a workflow.
 * @example app.register(workflowsRoutes, { deps })
 ***/
export default async function workflowsRoutes(app, { deps }) {
	const { resolveAndGuardProject, getOrCreateSession, workflowRegistry } = deps;

	app.get("/workflows", async (request) => {
		const projectId = request.query?.projectId;
		const runs = workflowRegistry.list();
		if (typeof projectId === "string" && projectId) {
			return runs.filter((run) => run.projectId === projectId);
		}
		return runs;
	});

	app.post("/workflows/start", async (request, reply) => {
		const { workflowId } = request.body;
		if (!workflowId)
			return reply.status(400).send({ error: "workflowId is required" });
		const id = resolveAndGuardProject(request.body?.projectId, reply);
		if (!id) return;

		const session = await getOrCreateSession(id);
		await session.prompt(`Execute workflow: ${workflowId}`);

		return workflowRegistry.start({ workflowId, projectId: id });
	});
}
