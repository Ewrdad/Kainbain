import { applyRunnerReport } from "./execution/applyRunnerReport.js";

/***
 * MARK: registerRunnerRoutes
 * @description Runner-facing endpoints (ADR 0009 lifecycle steps 1–6): join
 *   registration, heartbeat, the operator approve/deny/revoke + list
 *   surface the Phase 2 onboarding UI drives, the atomic task-claim
 *   route backed by ClaimStore (200 + lease or 409 + holder), and the
 *   execution-report endpoints (progress, logs, complete-execution with
 *   engine-owned finish, interrupt, monitor). Credential
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
			const receipt = await executionLedger.completeExecution({
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
			if (receipt.duplicate) return receipt;
			// Engine-owned finish: the lease fence accepted the report, so
			// the backend now applies the same transitions as the embedded
			// path (report, survey park, failure routing, advance). The
			// task must still be live and on the reported stage; anything
			// else keeps the accepted report but skips the finish.
			const live = taskStore.getTask(ctx.projectId, request.params.id);
			const terminal = ["complete", "failed"].includes(
				String(live?.status).toLowerCase(),
			);
			if (terminal) {
				return { ...receipt, advanced: false, reason: "task-terminal" };
			}
			const runStage = receipt.reportedStage ?? live?.currentStageId ?? null;
			if (runStage && live?.currentStageId && runStage !== live.currentStageId) {
				return { ...receipt, advanced: false, reason: "stage-moved" };
			}
			const outcome = request.body?.outcome ?? "passed";
			if (outcome !== "passed" && outcome !== "failed") {
				return reply.status(400).send({
					error: "outcome must be passed or failed",
					code: "INVALID_OUTCOME",
				});
			}
			const harnessId =
				runner.facts?.harnesses?.[0]?.id || request.body?.harnessId || "unknown";
			const finish = await applyRunnerReport({
				store: taskStore,
				projectStore,
				projectId: ctx.projectId,
				taskId: request.params.id,
				outcome: {
					status: outcome,
					output: request.body?.output ?? "",
					summary: request.body?.summary ?? "",
					modifiedFiles: request.body?.modifiedFiles ?? [],
					harnessId,
					failureKind: request.body?.failureKind ?? null,
					failureReason: request.body?.failureReason ?? null,
					duration: request.body?.durationMs
						? String(Number(request.body.durationMs) / 1000)
						: "0.0",
					runnerId: runner.runnerId,
				},
			});
			return { ...receipt, ...finish };
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
