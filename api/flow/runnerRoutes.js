/***
 * MARK: registerRunnerRoutes
 * @description Runner-facing endpoints (ADR 0009 lifecycle steps 1–3): join
 *   registration, heartbeat, the operator approve/deny/revoke + list
 *   surface the Phase 2 onboarding UI drives, and the atomic task-claim
 *   route backed by ClaimStore (200 + lease or 409 + holder). Credential
 *   scope is enforced per request: the claim's Runner always comes from
 *   the authenticated credential, never from the body (R04 wrong-scope).
 * @example await app.register(runnerRoutes, { deps })
 ***/
export async function registerRunnerRoutes(app, { deps }) {
	const {
		runnerRegistry,
		claimStore,
		executionLedger,
		taskStore,
		projectStore,
		resolveAndGuardProject,
	} = deps;

	const sendStoreError = (reply, err) => {
		const status = err.statusCode || 500;
		const body = { error: err.message || "Internal error" };
		if (err.code) body.code = err.code;
		if (err.holder) body.holder = err.holder;
		return reply.status(status).send(body);
	};

	const authedRunner = (request) => {
		const credential = String(
			request.headers?.["x-runner-credential"] || "",
		).trim();
		return runnerRegistry.authenticate(credential);
	};

	app.post("/runners/register", async (request, reply) => {
		try {
			const result = runnerRegistry.register({
				runnerId: request.body?.runnerId,
				joinToken: request.body?.joinToken,
				facts: request.body?.facts || {},
			});
			return reply.status(result.status === "pending" ? 202 : 200).send(result);
		} catch (err) {
			return sendStoreError(reply, err);
		}
	});

	app.post("/runners/heartbeat", async (request, reply) => {
		try {
			const runner = authedRunner(request);
			const result = runnerRegistry.heartbeat({
				runnerId: request.body?.runnerId || runner.runnerId,
				credential: String(
					request.headers?.["x-runner-credential"] || "",
				).trim(),
				facts: request.body?.facts || {},
			});
			return result;
		} catch (err) {
			return sendStoreError(reply, err);
		}
	});

	app.get("/runners", async () => {
		return runnerRegistry.list();
	});

	app.post("/runners/:id/approve", async (request, reply) => {
		try {
			return runnerRegistry.approve(request.params.id);
		} catch (err) {
			return sendStoreError(reply, err);
		}
	});

	app.post("/runners/:id/deny", async (request, reply) => {
		try {
			return runnerRegistry.deny(request.params.id);
		} catch (err) {
			return sendStoreError(reply, err);
		}
	});

	app.post("/runners/:id/revoke", async (request, reply) => {
		try {
			return runnerRegistry.revoke(request.params.id);
		} catch (err) {
			return sendStoreError(reply, err);
		}
	});

	const guardedTask = (request, reply) => {
		const projectId = resolveAndGuardProject(
			request.body?.projectId || request.query?.projectId,
			reply,
		);
		if (!projectId) return null;
		const task = taskStore.getTask(projectId, request.params.id);
		if (!task) {
			reply.status(404).send({ error: "Task not found" });
			return null;
		}
		return { projectId, task };
	};

	app.get("/runners/monitor", async () => {
		return executionLedger.snapshot();
	});

	app.post("/tasks/:id/progress", async (request, reply) => {
		let runner;
		try {
			runner = authedRunner(request);
		} catch (err) {
			return sendStoreError(reply, err);
		}
		const ctx = guardedTask(request, reply);
		if (!ctx) return;
		try {
			return executionLedger.recordProgress({
				claimStore,
				taskStore,
				projectId: ctx.projectId,
				taskId: request.params.id,
				runnerId: runner.runnerId,
				executionId: request.body?.executionId,
				epoch: request.body?.epoch,
				stageId: request.body?.stageId,
				event: request.body?.event,
			});
		} catch (err) {
			return sendStoreError(reply, err);
		}
	});

	app.post("/tasks/:id/logs", async (request, reply) => {
		let runner;
		try {
			runner = authedRunner(request);
		} catch (err) {
			return sendStoreError(reply, err);
		}
		const ctx = guardedTask(request, reply);
		if (!ctx) return;
		try {
			return executionLedger.ingestLogs({
				claimStore,
				taskStore,
				projectId: ctx.projectId,
				taskId: request.params.id,
				runnerId: runner.runnerId,
				executionId: request.body?.executionId,
				epoch: request.body?.epoch,
				seq: request.body?.seq,
				bytes: request.body?.bytes,
			});
		} catch (err) {
			return sendStoreError(reply, err);
		}
	});

	app.post("/tasks/:id/complete-execution", async (request, reply) => {
		let runner;
		try {
			runner = authedRunner(request);
		} catch (err) {
			return sendStoreError(reply, err);
		}
		const ctx = guardedTask(request, reply);
		if (!ctx) return;
		try {
			return await executionLedger.completeExecution({
				claimStore,
				taskStore,
				projectStore,
				projectId: ctx.projectId,
				taskId: request.params.id,
				runnerId: runner.runnerId,
				executionId: request.body?.executionId,
				epoch: request.body?.epoch,
				sha: request.body?.sha ?? null,
				branch: request.body?.branch ?? null,
				posture: request.body?.posture ?? null,
			});
		} catch (err) {
			return sendStoreError(reply, err);
		}
	});

	app.post("/tasks/:id/interrupt", async (request, reply) => {
		let runner;
		try {
			runner = authedRunner(request);
		} catch (err) {
			return sendStoreError(reply, err);
		}
		const ctx = guardedTask(request, reply);
		if (!ctx) return;
		try {
			return executionLedger.interruptExecution({
				claimStore,
				taskStore,
				projectId: ctx.projectId,
				taskId: request.params.id,
				runnerId: runner.runnerId,
				executionId: request.body?.executionId ?? null,
			});
		} catch (err) {
			return sendStoreError(reply, err);
		}
	});

	app.post("/tasks/:id/claim", async (request, reply) => {
		let runner;
		try {
			runner = authedRunner(request);
		} catch (err) {
			return sendStoreError(reply, err);
		}
		const claimedRunnerId = request.body?.runnerId;
		if (
			claimedRunnerId &&
			claimedRunnerId !== runner.runnerId
		) {
			return reply.status(403).send({
				error: "Credential does not belong to the claimed Runner.",
				code: "SCOPE_MISMATCH",
			});
		}
		const projectId = resolveAndGuardProject(
			request.body?.projectId || request.query?.projectId,
			reply,
		);
		if (!projectId) return;
		const task = taskStore.getTask(projectId, request.params.id);
		if (!task) return reply.status(404).send({ error: "Task not found" });
		try {
			const { executionId, epoch } = claimStore.claim(
				request.params.id,
				runner.runnerId,
			);
			return { taskId: request.params.id, runnerId: runner.runnerId, executionId, epoch };
		} catch (err) {
			return sendStoreError(reply, err);
		}
	});
}
