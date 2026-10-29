import { config } from "../config.js";
import { applyRunnerReport } from "./execution/applyRunnerReport.js";
import { circuitSnapshot, isTripped } from "./circuitBreaker.js";
import { scanClaimableTasks } from "./dispatch/scanClaimableTasks.js";
import { resolveAliasRequirement } from "./dispatch/resolveAliasRequirement.js";
import { runnerMatches } from "./dispatch/runnerMatches.js";
import { curateRunnerPrompt } from "./curateRunnerPrompt.js";
import { materializeRunnerTaskDocs } from "./execution/materializeRunnerTaskDocs.js";
import { buildCommandKeywordContext, expandStageCommand } from "./commandStages.js";
import { resolveStagesForTask } from "./stageResolution.js";
import { emitStageLifecycle } from "./stageLifecycle.js";
import {
	resolveStageTimeout,
	runnerStageTimeoutStatus,
} from "./stagePolicy.js";

/***
 * MARK: resolveCiTimeoutMs
 * @description CI budget for one dispatched stage, in milliseconds. Honors
 *   the stage's explicit `timeoutMs`, then the legacy `timeout` field the
 *   project file actually carries, then the project default, then the
 *   10-minute floor. The `timeout` fallback matters: without it the
 *   Automated-tests stage's configured 3600000ms never reached the runner
 *   and every gate longer than 10 minutes was SIGKILLed mid-run (task
 *   b5716327: green suites reported as "exit code 1").
 * @example resolveCiTimeoutMs({ timeout: 3600000 }, {}) => 3600000
 * @param {Object} [resolved] - resolved CI stage definition.
 * @param {Object} [project] - project record (optional `ciTimeoutMs`).
 * @returns {number} Effective CI timeout in milliseconds.
 ***/
export const resolveCiTimeoutMs = (resolved, project) => {
	return (
		Number(resolved?.timeoutMs) ||
		Number(resolved?.timeout) ||
		Number(project?.ciTimeoutMs) ||
		600000
	);
};

/***
 * MARK: registerRunnerRoutes
 * @description Runner-facing endpoints (ADR 0009 lifecycle steps 1–6): join
 *   registration, heartbeat, the operator approve/deny/revoke/pause/resume
 *   + list surface the Phase 2 onboarding UI drives, the atomic task-claim
 *   route backed by ClaimStore (200 + lease or 409 + holder), and the
 *   execution-report endpoints (progress, logs, complete-execution with
 *   engine-owned finish, interrupt, monitor). Credential
 *   scope is enforced per request: the claim's Runner always comes from
 *   the authenticated credential, never from the body (R04 wrong-scope).
 * @example await app.register(runnerRoutes, { deps })
 ***/
export const registerRunnerRoutes = async (app, { deps }) => {
	const {
		runnerRegistry,
		claimStore,
		steerStore,
		executionLedger,
		taskStore,
		projectStore,
		resolveAndGuardProject,
		eventBridge,
	} = deps;

	const sendStoreError = (reply, err) => {
		const status = err.statusCode || 500;
		const body = { error: err.message || "Internal error" };
		if (err.code) body.code = err.code;
		if (err.holder) body.holder = err.holder;
		return reply.status(status).send(body);
	};

	const ciPayloadFor = async (projectId, task, stage) => {
		if (!stage) return {};
		const project = projectStore.getProject(projectId);
		const stages = resolveStagesForTask(project, task);
		const resolved = stage || stages.find((x) => String(x?.id) === String(task?.currentStageId)) || stages[0];
		if (!resolved) return {};
		const type = String(resolved.type || "").toLowerCase();
		if (!["ci", "script", "deploy", "command"].includes(type)) return {};
		// Generic lifecycle seam (mirrors runCommandStage): every command
		// stage announces entry the same way, whether a Runner or the
		// backend executes it. Installed continuity plugins may record
		// entry markers and contribute child-process environment here;
		// with no plugins this is an empty bag. Never throws: a plugin
		// failure must not break dispatch.
		let lifecycleEnv = {};
		try {
			const lifecycle = await emitStageLifecycle("stage:enter", {
				store: taskStore,
				projectId,
				taskId: task?.id,
				stage: resolved,
				kind: "ci",
				cwd: project?.cwd || "",
			});
			if (lifecycle && typeof lifecycle.env === "object") {
				lifecycleEnv = lifecycle.env;
			}
		} catch {
			lifecycleEnv = {};
		}
		try {
			const ctx = buildCommandKeywordContext({ task, stage: resolved, project, projectCwd: project?.cwd || "" });
			return {
				kind: "ci",
				command: expandStageCommand(resolved.command || resolved.script || "echo 'CI stage completed'", ctx),
				timeoutMs: resolveCiTimeoutMs(resolved, project),
				runOnBranch: typeof resolved.runOnBranch === "string" ? resolved.runOnBranch : "task",
				env: lifecycleEnv,
			};
		} catch { return { kind: "ci", command: resolved.command || resolved.script || "", timeoutMs: 600000, env: lifecycleEnv }; }
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
				// G11 audit alert: one identity from multiple origins.
				origin: request.ip || null,
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

	app.post("/runners/:id/pause", async (request, reply) => {
		try {
			return runnerRegistry.pause(request.params.id);
		} catch (err) {
			return sendStoreError(reply, err);
		}
	});

	app.post("/runners/:id/resume", async (request, reply) => {
		try {
			return runnerRegistry.resume(request.params.id);
		} catch (err) {
			return sendStoreError(reply, err);
		}
	});

	app.post("/runners/:id/skip", async (request, reply) => {
		// Operator skip: advance the task this Runner currently holds past
		// its stage and release the lease, so the in-flight Runner report
		// lands stale (stage-moved) instead of re-advancing. Same operator
		// surface as pause/resume — no Runner credential needed. 404 when
		// the Runner is unknown or holds nothing; 409 when its task is
		// already on the last stage.
		try {
			const runnerId = request.params.id;
			const record = runnerRegistry
				.records()
				.find((r) => r && r.runnerId === runnerId);
			if (!record) {
				return reply
					.status(404)
					.send({ error: `Unknown Runner ${runnerId}.`, code: "UNKNOWN_RUNNER" });
			}
			const hold = claimStore
				.liveHolds()
				.find((h) => h && h.runnerId === runnerId);
			if (!hold) {
				return reply.status(404).send({
					error: `Runner ${runnerId} has no active task to skip.`,
					code: "NOTHING_TO_SKIP",
				});
			}
			const project = projectStore.getProject(hold.projectId);
			const task = taskStore.getTask(hold.projectId, hold.taskId);
			if (!task) {
				claimStore.invalidate(hold.taskId);
				return reply.status(404).send({
					error: "Held task not found.",
					code: "NOTHING_TO_SKIP",
				});
			}
			const stages = Array.isArray(project?.stages) ? project.stages : [];
			const index = stages.findIndex((s) => s && s.id === task.currentStageId);
			if (index === -1 || index >= stages.length - 1) {
				return reply.status(409).send({
					error: `Task ${hold.taskId} is already on the last stage.`,
					code: "NOTHING_TO_SKIP",
				});
			}
			const next = stages[index + 1];
			taskStore.updateTask(
				hold.projectId,
				hold.taskId,
				{ currentStageId: next.id },
				project?.cwd,
			);
			claimStore.invalidate(hold.taskId);
			return {
				success: true,
				runnerId,
				taskId: hold.taskId,
				from: task.currentStageId,
				to: next.id,
			};
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
		// `scheduler` exposes the cutover deferral counters so a task
		// sitting in_stage is diagnosable: a climbing `deferredDispatch`
		// with no Runner pickup means the fleet is empty or mismatched.
		const liveAssignments = claimStore.liveHolds().map((hold) => {
			const record = runnerRegistry.records().find((r) => r.runnerId === hold.runnerId) || null;
			return {
				runnerId: hold.runnerId,
				projectId: hold.projectId,
				taskId: hold.taskId,
				executionId: hold.executionId,
				epoch: hold.epoch,
				startedAt: hold.startedAt ?? null,
				stageId: executionLedger.stageFor(hold.executionId),
				prompt: executionLedger.promptFor(hold.executionId),
				serving: executionLedger.servingFor(hold.executionId),
				lastSeenAt: record?.lastSeenAt ?? null,
			};
		});
		const sched = taskStore.schedulerStats || {};
		const scheduler = {
			ticks: sched.ticks || 0,
			dispatched: sched.dispatched || 0,
			deferredDispatch: sched.deferredDispatch || 0,
			deferredTripped: sched.deferredTripped || 0,
			lastOutcome: sched.lastOutcome ?? null,
			lastDispatchAt: sched.lastDispatchAt ?? null,
		};
		return { ...executionLedger.snapshot(), liveAssignments, scheduler };
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
				prompt: request.body?.prompt ?? null,
				harness: request.body?.harness ?? null,
				model: request.body?.model ?? null,
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
			const receipt = executionLedger.ingestLogs({
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
			// Live turn-by-turn stream: fan the ingested frame out over the
			// socket so the Logs tab shows Runner output as it happens, not
			// only after the next task refetch. Fire-and-forget: a dead
			// socket must never fail the ingest. Duplicates are suppressed
			// once the stored entry arrives (client dedupes on
			// executionId+seq), and duplicate/old frames are never emitted.
			if (!receipt.duplicate) {
				eventBridge
					?.emitProcessEvent(ctx.projectId, "process:stdout", {
						taskId: request.params.id,
						projectId: ctx.projectId,
						chunk: `[runner ${runner.runnerId}] ${request.body?.bytes ?? ""}`,
						tag: "[RUNNER]",
						runnerId: runner.runnerId,
						executionId: request.body?.executionId,
						seq: request.body?.seq,
					})
					?.catch?.(() => {});
			}
			return receipt;
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
			// Runner-authored task files (plan/survey) land in the backend
			// task folder BEFORE the finish advances the task, so a following
			// backend-run CI stage reading {{taskDocs}} can see them.
			materializeRunnerTaskDocs({
				project: projectStore.getProject(ctx.projectId),
				taskId: request.params.id,
				files: request.body?.taskFiles,
			});
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
		if (runner.paused === true) {
			return reply.status(409).send({
				error: `Runner ${runner.runnerId} is paused — resume it to take new tasks`,
				code: "RUNNER_PAUSED",
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
			return { taskId: request.params.id, runnerId: runner.runnerId, executionId, epoch, ...await ciPayloadFor(projectId, task, null), prompt: curateRunnerPrompt({ project: projectStore.getProject(projectId), task, stageId: task.currentStageId }) };
		} catch (err) {
			return sendStoreError(reply, err);
		}
	});

	app.post("/tasks/:id/claim-heartbeat", async (request, reply) => {
		// Lease renewal for long Runner executions (D1): the claim TTL
		// bounds a dead Runner's hold, so a live Runner must extend it
		// while the harness runs — otherwise the hold lapses mid-stage,
		// the task re-queues, and the finisher reports STALE_EPOCH.
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
			if (!hold || hold.runnerId !== runner.runnerId) {
				const err = new Error(
					`Stale execution for task ${request.params.id}: lease belongs to another Runner.`,
				);
				err.statusCode = 409;
				err.code = "STALE_EPOCH";
				throw err;
			}
			// Wall-clock stage timeout (no infinite renewal): a live Runner
			// renewing its lease forever must not outrun the stage budget —
			// otherwise a stuck harness sits claimed indefinitely and the
			// task reads frozen. On breach the hold is released and the
			// stage fails through the normal failure routing (retry/failback),
			// so the task re-queues instead of stranding.
			const project = projectStore.getProject(ctx.projectId);
			const stages = resolveStagesForTask(project, ctx.task);
			const stage =
				stages.find(
					(s) => String(s?.id) === String(ctx.task?.currentStageId),
				) || null;
			const timeoutMs = resolveStageTimeout(
				stage,
				stage?.type,
				config,
				project,
			);
			const { timedOut, elapsedMs } = runnerStageTimeoutStatus({
				startedAt: hold.startedAt ?? null,
				timeoutMs,
			});
			if (timedOut) {
				claimStore.invalidate(request.params.id);
				const reason =
					`Stage timed out after ${elapsedMs}ms (budget ${timeoutMs}ms) ` +
					`on stage '${stage?.name || stage?.id || ctx.task?.currentStageId}'.`;
				try {
					await applyRunnerReport({
						store: taskStore,
						projectStore,
						projectId: ctx.projectId,
						taskId: request.params.id,
						outcome: {
							status: "failed",
							output: "",
							harnessId: runner.facts?.harnesses?.[0]?.id || "unknown",
							failureKind: "timeout",
							failureReason: reason,
							duration: String(elapsedMs / 1000),
							runnerId: runner.runnerId,
						},
					});
				} catch {
					// The 409 below is the contract; a reporting failure must
					// never mask it (the zombie's late finish stays stale).
				}
				return reply.status(409).send({
					error: reason,
					code: "STAGE_TIMEOUT",
					timeoutMs,
					elapsedMs,
				});
			}
			const { epoch } = claimStore.heartbeat(
				request.params.id,
				request.body?.executionId,
			);
			return { taskId: request.params.id, runnerId: runner.runnerId, epoch };
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
		// Parked Runners keep heartbeating (freshness is liveness, not
		// eligibility) but take no new work: fail fast here as well as in
		// the per-candidate match, so a paused fleet reads as paused and
		// not "no capable match".
		if (runner.paused === true) {
			return reply.status(409).send({
				error: `Runner ${runner.runnerId} is paused — resume it to take new tasks`,
				code: "RUNNER_PAUSED",
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
		runnerRegistry.recordDispatchScope(runner.runnerId, projectIds);
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
					rec?.paused !== true &&
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
					prompt: curateRunnerPrompt({ project: projectStore.getProject(cand.projectId), task: cand.task, stageId: cand.stage?.id }),
					...await ciPayloadFor(cand.projectId, cand.task, cand.stage),
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
};