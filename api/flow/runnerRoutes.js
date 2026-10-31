import { config } from "../config.js";
import { applyRunnerReport } from "./execution/applyRunnerReport.js";
import { applyIntegrationReport } from "./execution/applyIntegrationReport.js";
import { normalizeStageType } from "../projectStore.js";
import { git, defaultBranch } from "../git.js";
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
import { redactSecretsText } from "../../shared/redactSecrets.js";

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
 * MARK: prepareIntegrationAttempt
 * @description Backend-side preparation for one leased `integrate` dispatch
 *   (Step 4): fetches the origin (read-only — the backend never pushes),
 *   reads the remote task-branch and target-branch tips as the attempt's
 *   expected SHAs, and pins a stable `mergeAttemptId` on the task so every
 *   dispatch poll for this merge reuses one queue entry (idempotent
 *   re-enqueue) instead of queueing a duplicate merge per poll. Throws
 *   `INTEGRATION_UNPREPARED` when the refs cannot be read (no origin ref
 *   yet, fetch failure) — the task stays `in_stage` for the next poll.
 * @example await prepareIntegrationAttempt({ taskStore, projectStore, projectId: 'p', task }) => { targetBranch: 'main', ... }
 * @param {Object} args - `{ taskStore, projectStore, projectId, task }`.
 * @returns {Promise<Object>} `{ targetBranch, taskBranch, expectedTaskSha, expectedTargetSha, mergeAttemptId }`.
 ***/
export const prepareIntegrationAttempt = async ({ taskStore, projectStore, projectId, task }) => {
	const unprepared = (detail) => {
		const err = new Error(`Integration attempt unprepared: ${detail}`);
		err.code = "INTEGRATION_UNPREPARED";
		throw err;
	};
	const project = projectStore?.getProject?.(projectId);
	const cwd = project?.cwd;
	if (!cwd) unprepared("project has no checkout");
	const taskBranch = taskStore.resolveTaskBranch(task);
	let targetBranch;
	try {
		targetBranch = await defaultBranch(cwd);
	} catch {
		unprepared("cannot resolve the target branch");
	}
	try {
		// Prune: a deleted remote task branch must vanish from the
		// remote-tracking refs too, or a later attempt would merge a
		// resurrected stale tip.
		await git(cwd, ["fetch", "--prune", "origin"], { timeout: 60000 });
	} catch (e) {
		unprepared(`fetch failed (${e?.message || e})`);
	}
	const readRef = async (ref) => {
		try {
			return (await git(cwd, ["rev-parse", "--verify", ref])).stdout.trim() || null;
		} catch {
			return null;
		}
	};
	const expectedTargetSha = await readRef(`origin/${targetBranch}`);
	const expectedTaskSha = await readRef(`origin/${taskBranch}`);
	if (!expectedTargetSha) unprepared(`remote ref 'origin/${targetBranch}' does not exist`);
	if (!expectedTaskSha) unprepared(`remote ref 'origin/${taskBranch}' does not exist (task work not pushed yet)`);
	// A retry after a failed attempt gets a FRESH attempt id: the failed
	// lease settled terminal (landed/conflict/stale-head/failed) in the
	// integration queue, and re-enqueueing the same id would collide with
	// that settled entry instead of queueing a re-based merge.
	const failedBefore = !!(task.lastError && (task.lastError.message || task.lastError.reason || task.lastError.stageId || task.lastError.stderr));
	let mergeAttemptId = `merge-${String(task.id).slice(0, 8)}-${Date.now()}`;
	if (typeof task.mergeAttemptId === "string" && task.mergeAttemptId.trim() && !failedBefore) {
		mergeAttemptId = task.mergeAttemptId.trim();
	} else {
		taskStore.updateTask(projectId, task.id, { mergeAttemptId }, cwd);
		task.mergeAttemptId = mergeAttemptId;
	}
	return { targetBranch, taskBranch, expectedTaskSha, expectedTargetSha, mergeAttemptId };
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
		integrationQueue,
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
		const project = projectStore.getProject(projectId);
		const stages = resolveStagesForTask(project, task);
		// A null/undefined stage (e.g. the single-assignment claim route) falls
		// back to the task's current stage — dropping the payload here would
		// silently strip kind/command/runOnBranch and the Runner would run the
		// command in the task worktree regardless of the stage's branch mode.
		const resolved = stage || stages.find((x) => String(x?.id) === String(task?.currentStageId)) || stages[0];
		if (!resolved) return {};
		const type = String(resolved.type || "").toLowerCase();
		if (!["ci", "script", "deploy", "command"].includes(type)) return {};
		// Branch mode rides every payload — including the error fallback — so a
		// Runner can never silently degrade a 'primary'/'custom' stage back to
		// the task worktree (which is exactly how publish stages used to fail:
		// deploy.sh refuses to run from a kb/* worktree).
		const runOnBranch = typeof resolved.runOnBranch === "string" ? resolved.runOnBranch : "task";
		const branchPayload = {
			runOnBranch,
			...(runOnBranch === "custom" && typeof resolved.customBranch === "string" && resolved.customBranch.trim()
				? { customBranch: resolved.customBranch.trim() }
				: {}),
		};
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
				...branchPayload,
				env: lifecycleEnv,
			};
		} catch { return { kind: "ci", command: resolved.command || resolved.script || "", timeoutMs: 600000, ...branchPayload, env: lifecycleEnv }; }
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

	app.get("/runners/:id/config", async (request, reply) => {
		// Operator-owned Runner configuration for the System Settings
		// Runner screen (display name, tool filter, job-type switches,
		// directories, project override). No Runner credential needed:
		// same operator surface as approve/deny/pause/resume.
		try {
			return runnerRegistry.getConfig(request.params.id);
		} catch (err) {
			return sendStoreError(reply, err);
		}
	});

	app.patch("/runners/:id/config", async (request, reply) => {
		try {
			return runnerRegistry.updateConfig(request.params.id, request.body || {});
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
		// Settings › Runners can show live assignments.
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
		// Step 6: surface integration-queue health (depth/lease per scope
		// via GET /runners/integration; global lease counters here) so a
		// stuck merge queue is visible before tasks pile up behind it.
		const integration = integrationQueue ? integrationQueue.snapshot() : {};
		return { ...executionLedger.snapshot(), liveAssignments, scheduler, integration };
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
			// The broadcast is redacted even though the stored copy already
			// is: legacy text frames reach this route unredacted from older
			// Runners (the fallback text path), and the live socket must
			// never carry secrets even for one frame.
			if (!receipt.duplicate) {
				eventBridge
					?.emitProcessEvent(ctx.projectId, "process:stdout", {
						taskId: request.params.id,
						projectId: ctx.projectId,
						chunk: `[runner ${runner.runnerId}] ${redactSecretsText(String(request.body?.bytes ?? ""))}`,
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

	app.post("/tasks/:id/log-events", async (request, reply) => {
		let runner;
		try {
			runner = authedRunner(request);
		} catch (err) {
			return sendStoreError(reply, err);
		}
		const ctx = guardedTask(request, reply);
		if (!ctx) return;
		try {
			const receipt = executionLedger.ingestLogEvents({
				claimStore,
				taskStore,
				projectId: ctx.projectId,
				taskId: request.params.id,
				runnerId: runner.runnerId,
				executionId: request.body?.executionId,
				epoch: request.body?.epoch,
				seq: request.body?.seq,
				events: request.body?.events,
			});
			// Live structured stream: fan the ingested entries out over the
			// socket so the Logs tab renders tool calls, results, thinking,
			// errors, and telemetry as they happen — the same records a
			// later refetch persists. Only the entries appended by THIS
			// batch ship (re-read from the stored tail, which the ledger
			// just extended). Fire-and-forget; duplicates never emit.
			if (!receipt.duplicate) {
				const task = taskStore.getTask(ctx.projectId, request.params.id);
				const stored = Array.isArray(task?.logEntries) ? task.logEntries : [];
				const fresh = stored
					.filter(
						(entry) =>
							entry?.meta?.executionId === request.body?.executionId &&
							entry?.meta?.seq === request.body?.seq &&
							entry?.meta?.source === "runner-structured",
					)
					.slice(-200);
				eventBridge
					?.emitProcessEvent(ctx.projectId, "process:log-entries", {
						taskId: request.params.id,
						projectId: ctx.projectId,
						entries: fresh,
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

	app.post("/tasks/:id/verify-sha", async (request, reply) => {
		let runner;
		try {
			runner = authedRunner(request);
		} catch (err) {
			return sendStoreError(reply, err);
		}
		const ctx = guardedTask(request, reply);
		if (!ctx) return;
		try {
			return executionLedger.noteRemoteVerification({
				claimStore,
				taskStore,
				projectId: ctx.projectId,
				taskId: request.params.id,
				runnerId: runner.runnerId,
				executionId: request.body?.executionId,
				epoch: request.body?.epoch,
				sha: request.body?.sha ?? null,
				present: request.body?.present,
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
			// Runner-run integration: the merge already landed via the
			// leased CAS push — verify read-only, freeze the baseline,
			// and advance. Never the generic stage finish.
			const project = projectStore.getProject(ctx.projectId);
			const allStages = resolveStagesForTask(project, live);
			const currentStage =
				allStages.find((s) => String(s?.id) === String(live?.currentStageId)) || allStages[0] || {};
			if (
				normalizeStageType(currentStage.type) === "merge" &&
				request.body?.integration?.outcome === "landed"
			) {
				const finish = await applyIntegrationReport({
					store: taskStore,
					projectStore,
					projectId: ctx.projectId,
					taskId: request.params.id,
					stage: currentStage,
					stages: allStages,
					integration: request.body.integration,
					runnerId: runner.runnerId,
				});
				return { ...receipt, ...finish };
			}
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
				reason: request.body?.reason ?? null,
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
			// The candidate's project travels alongside the requirements so
			// the operator project-scope check in `runnerMatches` can
			// refuse out-of-scope projects loudly (PROJECT_SCOPE) instead
			// of dispatching work the operator unloaded for this Runner.
			const verdict = runnerMatches(runner, req, {
				staleAfterMs: runnerRegistry.staleAfterMs,
				projectId: cand.projectId,
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
			// Merge stages dispatch as leased `integrate` jobs (Step 4): the
			// task claim fences progress/logs/completion exactly like any
			// stage, while the integration lease serializes target-branch
			// writes. A busy integration slot backs the Runner off to poll
			// again (the request stays queued — never lost, never doubled).
			if (req.kind === "merge") {
				let attempt;
				try {
					attempt = await prepareIntegrationAttempt({
						taskStore,
						projectStore,
						projectId: cand.projectId,
						task: cand.task,
					});
				} catch (err) {
					if (err?.code === "INTEGRATION_UNPREPARED") {
						misses.INTEGRATION_UNPREPARED = (misses.INTEGRATION_UNPREPARED || 0) + 1;
						continue;
					}
					return sendStoreError(reply, err);
				}
				let executionId;
				let epoch;
				try {
					({ executionId, epoch } = claimStore.claim(cand.taskId, runner.runnerId, cand.projectId));
				} catch (err) {
					if (err?.code === "CLAIM_CONFLICT") continue;
					return sendStoreError(reply, err);
				}
				if (!integrationQueue) {
					claimStore.invalidate(cand.taskId);
					misses.NO_INTEGRATION_QUEUE = (misses.NO_INTEGRATION_QUEUE || 0) + 1;
					continue;
				}
				integrationQueue.enqueue({
					projectId: cand.projectId,
					targetBranch: attempt.targetBranch,
					taskId: cand.taskId,
					taskBranch: attempt.taskBranch,
					expectedTaskSha: attempt.expectedTaskSha,
					expectedTargetSha: attempt.expectedTargetSha,
					mergeAttemptId: attempt.mergeAttemptId,
				});
				let lease;
				try {
					lease = integrationQueue.acquire({
						projectId: cand.projectId,
						targetBranch: attempt.targetBranch,
						runnerId: runner.runnerId,
					});
				} catch (err) {
					claimStore.invalidate(cand.taskId);
					if (err?.code === "INTEGRATION_BUSY") {
						return { assigned: false, code: "INTEGRATION_BUSY" };
					}
					return sendStoreError(reply, err);
				}
				if (!lease.leased) {
					claimStore.invalidate(cand.taskId);
					misses.INTEGRATION_EMPTY = (misses.INTEGRATION_EMPTY || 0) + 1;
					continue;
				}
				return {
					assigned: true,
					projectId: cand.projectId,
					taskId: cand.taskId,
					runnerId: runner.runnerId,
					executionId,
					epoch,
					stageId: cand.stage?.id ?? null,
					kind: "integrate",
					integration: {
						taskBranch: attempt.taskBranch,
						expectedTaskSha: attempt.expectedTaskSha,
						targetBranch: attempt.targetBranch,
						expectedTargetSha: attempt.expectedTargetSha,
						mergeAttemptId: attempt.mergeAttemptId,
						integrationExecutionId: lease.executionId,
						integrationEpoch: lease.epoch,
					},
					requirements: req,
				};
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

	// ---- Integration leases (Step 3: serialized Runner-run merges) ---------
	// The backend never merges or pushes: it queues merge requests
	// (enqueue is backend-internal, called by the merge stage) and leases
	// the head entry to one Runner per project + target branch. The Runner
	// holds `executionId`/`epoch` exactly like a task claim; a superseded
	// report is stale by construction.
	app.post("/runners/integration/acquire", async (request, reply) => {
		let runner;
		try {
			runner = authedRunner(request);
		} catch (err) {
			return sendStoreError(reply, err);
		}
		if (!integrationQueue) {
			return reply.status(503).send({ error: "Integration queue unavailable.", code: "NO_INTEGRATION_QUEUE" });
		}
		try {
			return integrationQueue.acquire({
				projectId: request.body?.projectId,
				targetBranch: request.body?.targetBranch,
				runnerId: runner.runnerId,
			});
		} catch (err) {
			return sendStoreError(reply, err);
		}
	});

	app.post("/runners/integration/heartbeat", async (request, reply) => {
		let runner;
		try {
			runner = authedRunner(request);
		} catch (err) {
			return sendStoreError(reply, err);
		}
		if (!integrationQueue) {
			return reply.status(503).send({ error: "Integration queue unavailable.", code: "NO_INTEGRATION_QUEUE" });
		}
		try {
			return integrationQueue.heartbeat({
				projectId: request.body?.projectId,
				targetBranch: request.body?.targetBranch,
				executionId: request.body?.executionId,
				epoch: request.body?.epoch,
			});
		} catch (err) {
			return sendStoreError(reply, err);
		}
	});

	app.post("/runners/integration/report", async (request, reply) => {
		let runner;
		try {
			runner = authedRunner(request);
		} catch (err) {
			return sendStoreError(reply, err);
		}
		if (!integrationQueue) {
			return reply.status(503).send({ error: "Integration queue unavailable.", code: "NO_INTEGRATION_QUEUE" });
		}
		try {
			const receipt = integrationQueue.report({
				projectId: request.body?.projectId,
				targetBranch: request.body?.targetBranch,
				executionId: request.body?.executionId,
				epoch: request.body?.epoch,
				outcome: request.body?.outcome,
				mergeSha: request.body?.mergeSha ?? null,
				detail: request.body?.detail ?? null,
			});
			return { ...receipt, runnerId: runner.runnerId };
		} catch (err) {
			return sendStoreError(reply, err);
		}
	});

	app.get("/runners/integration", async (request) => {
		if (!integrationQueue) return { depth: 0, lease: null, counters: {} };
		return {
			...integrationQueue.describe({
				projectId: request.query?.projectId,
				targetBranch: request.query?.targetBranch,
			}),
			counters: integrationQueue.snapshot(),
		};
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