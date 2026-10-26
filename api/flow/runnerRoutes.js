import { config } from "../config.js";
import { applyRunnerReport } from "./execution/applyRunnerReport.js";
import { circuitSnapshot, isTripped } from "./circuitBreaker.js";
import { scanClaimableTasks } from "./dispatch/scanClaimableTasks.js";
import { resolveAliasRequirement } from "./dispatch/resolveAliasRequirement.js";
import { runnerMatches } from "./dispatch/runnerMatches.js";

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
		steerStore,
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
			// D5 pull channel (ADR 0011): pending steers for this
			// Runner's live executions ride the heartbeat response, so
			// steering needs no second channel. Stale Runner, live
			// lease: the steer waits here until the TTL lapses.
			const pendingSteers = [];
			for (const hold of claimStore.liveHolds()) {
				if (hold.runnerId !== runner.runnerId) continue;
				for (const steer of steerStore.pendingFor(hold.executionId)) {
					pendingSteers.push({
						steerId: steer.steerId,
						taskId: hold.taskId,
						projectId: hold.projectId,
						executionId: hold.executionId,
						epoch: hold.epoch,
						text: steer.text,
					});
				}
			}
			return { ...result, pendingSteers };
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

	app.post("/runners/:id/rotate", async (request, reply) => {
		try {
			return runnerRegistry.rotate(request.params.id);
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
		// Multi-Runner UI (WP-3.4): who runs what right now, so
		// Settings › Harness › Runners can show live assignments.
		const liveAssignments = claimStore.liveHolds().map((hold) => ({
			runnerId: hold.runnerId,
			projectId: hold.projectId,
			taskId: hold.taskId,
			epoch: hold.epoch,
		}));
		return { ...executionLedger.snapshot(), liveAssignments };
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
				projectId,
			);
			return { taskId: request.params.id, runnerId: runner.runnerId, executionId, epoch };
		} catch (err) {
			return sendStoreError(reply, err);
		}
	});

	app.post("/runners/dispatch", async (request, reply) => {
		let runner;
		try {
			runner = authedRunner(request);
		} catch (err) {
			return sendStoreError(reply, err);
		}
		if (!runnerRegistry.isFresh(runner)) {
			return reply.status(409).send({
				error: `Runner ${runner.runnerId} is stale — heartbeat, then ask again`,
				code: "STALE_RUNNER",
			});
		}
		if (isTripped(taskStore)) {
			const circuit = circuitSnapshot(taskStore);
			return reply.status(409).send({
				error: "Engine is tripped — dispatch is stopped",
				tripped: true,
				reason: circuit.reason,
				source: circuit.source,
				trippedAt: circuit.trippedAt,
			});
		}
		const projectIds = Array.isArray(request.body?.projectIds)
			? request.body.projectIds
			: undefined;
		// D8 burn control (ADR 0010): the fleet cap stops parallel burn
		// before any scan; per-project caps skip that project's candidates
		// below. 0 disables that cap (default: single-Runner behaviour).
		const fleetCap = config.runnerMaxConcurrentFleet || 0;
		if (fleetCap > 0 && claimStore.countLiveHolds() >= fleetCap) {
			return reply.status(429).send({
				error: `Fleet at Runner concurrency cap (${fleetCap}); backing off.`,
				code: "FLEET_CONCURRENCY_EXHAUSTED",
			});
		}
		const projectCap = config.runnerMaxConcurrentPerProject || 0;
		const candidates = scanClaimableTasks(
			{ projectStore, taskStore, claimStore },
			{ projectIds, maxWaitMs: config.dispatchMaxWaitMs || 0 },
		);
		if (candidates.length === 0) {
			return { assigned: false, code: "NO_CLAIMABLE_TASKS" };
		}
		// A harness is dispatch-servable when some active, fresh Runner
		// advertises it. Alias targets on unserved harnesses are skipped
		// for this resolution (share redistributes, per the alias
		// contract); nothing served at all resolves null → loud miss.
		const isHarnessKnown = (name) =>
			runnerRegistry.records().some(
				(rec) =>
					rec?.status === "active" &&
					runnerRegistry.isFresh(rec) &&
					(rec.capabilities?.harnesses || []).some((h) => h?.id === name),
			);
		const misses = {};
		for (const cand of candidates) {
			let req = cand.req;
			if (cand.req.alias) {
				const resolved = resolveAliasRequirement({
					project: projectStore.getProject(cand.projectId),
					aliasName: cand.req.alias,
					isHarnessKnown,
				});
				if (!resolved) {
					misses.ALIAS_UNRESOLVED = (misses.ALIAS_UNRESOLVED || 0) + 1;
					continue;
				}
				req = {
					...cand.req,
					harness: resolved.harness,
					model: resolved.model,
					alias: { name: resolved.aliasName, targetIndex: resolved.targetIndex },
				};
			}
			const verdict = runnerMatches(runner, req, {
				staleAfterMs: runnerRegistry.staleAfterMs,
			});
			if (!verdict.ok) {
				misses[verdict.reason] = (misses[verdict.reason] || 0) + 1;
				continue;
			}
			if (
				projectCap > 0 &&
				claimStore.countLiveHolds({ projectId: cand.projectId }) >= projectCap
			) {
				misses.PROJECT_BUSY = (misses.PROJECT_BUSY || 0) + 1;
				continue;
			}
			try {
				const { executionId, epoch } = claimStore.claim(
					cand.taskId,
					runner.runnerId,
					cand.projectId,
				);
				return {
					assigned: true,
					projectId: cand.projectId,
					taskId: cand.taskId,
					runnerId: runner.runnerId,
					executionId,
					epoch,
					stageId: cand.stage?.id ?? null,
					requirements: req,
				};
			} catch (err) {
				if (err?.code === "CLAIM_CONFLICT") continue;
				return sendStoreError(reply, err);
			}
		}
		return { assigned: false, code: "NO_CAPABLE_MATCH", misses };
	});

	// ---- Steering acks (D5, ADR 0011) --------------------------------------
	// The unified POST /tasks/:id/steer (taskFlowRoutes) queues against the
	// live lease; the Runner pulls on heartbeat and acks here.
	app.post("/tasks/:id/steer-ack", async (request, reply) => {
		let runner;
		try {
			runner = authedRunner(request);
		} catch (err) {
			return sendStoreError(reply, err);
		}
		const ctx = guardedTask(request, reply);
		if (!ctx) return;
		try {
			const hold = claimStore.describe(request.params.id);
			if (
				!hold ||
				hold.executionId !== request.body?.executionId ||
				hold.epoch !== request.body?.epoch ||
				hold.runnerId !== runner.runnerId
			) {
				return reply.status(409).send({
					error: `Ack targets a superseded execution (no matching live lease).`,
					code: "STALE_EPOCH",
				});
			}
			return steerStore.ack(request.body.executionId, request.body?.steerId, {
				ok: request.body?.ok,
				detail: request.body?.detail,
			});
		} catch (err) {
			return sendStoreError(reply, err);
		}
	});

	app.get("/tasks/:id/steers", async (request, reply) => {
		const ctx = guardedTask(request, reply);
		if (!ctx) return;
		const executionId = request.query?.executionId;
		if (!executionId || typeof executionId !== "string") {
			return reply.status(400).send({
				error: "steers requires an executionId query.",
				code: "INVALID_STEER_ARGS",
			});
		}
		return {
			taskId: request.params.id,
			executionId,
			pending: steerStore.pendingFor(executionId),
			receipts: steerStore.receiptsFor(executionId),
		};
	});
}
