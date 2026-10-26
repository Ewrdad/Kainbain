/***
 * MARK: taskFlowRoutes
 * @description The Flow routes: stage execution, advancement, failback,
 *   rejection, steering, follow-up, pausing, resuming, and completion.
 ***/

import {
	ORPHANED_RUNNING_STATUSES,
	resolveStagesForTask,
} from "./taskScheduler.js";
import {
	circuitSnapshot,
	isTripped,
	resetEngine,
	tripEngine,
} from "./circuitBreaker.js";
import { normalizeStageType } from "../projectStore.js";
import { ReviewStore } from "../reviewStore.js";
import { buildCommentsGuidance } from "../reviewCommentFormatter.js";

/***
 * MARK: loadHumanReviewComments
 * @description Reads the review threads a human recorded while a checkpoint
 *   waited, from the task's sidecar comment store. Returns an empty list when
 *   the sidecar is missing or unreadable so approval never fails on it.
 * @example await loadHumanReviewComments(project, 't-1') => [{ filePath: './docs/tasks/t-1/plan.md', line: 3, body: 'consider this' }]
 * @param {Object} [project] - Project with a cwd (the sidecar's base dir).
 * @param {string} taskId
 * @returns {Promise<Array>} Sidecar comment records.
 ***/
async function loadHumanReviewComments(project, taskId) {
	if (!project?.cwd || !taskId) return [];
	try {
		const store = new ReviewStore(project.cwd, project);
		const sidecar = await store.listComments(taskId);
		return Array.isArray(sidecar?.comments) ? sidecar.comments : [];
	} catch {
		return [];
	}
}

export async function registerTaskFlowRoutes(app, deps) {
	const {
		resolveAndGuardProject,
		getOrCreateSession,
		projectStore,
		taskStore,
		promptEngine,
		agentRunner,
	} = deps;

	const curateAndStorePrompt = (projectId, task, project, extraCtx = {}) => {
		const stages = resolveStagesForTask(project, task);
		const currentStage =
			stages.find((s) => String(s.id) === String(task.currentStageId)) ||
			stages[0];
		const curatedPrompt = promptEngine.curatePrompt(task, currentStage, {
			...extraCtx,
			project,
			projectName: project?.name,
			projectRepo: project?.gitUrl || project?.gitRepo,
			projectCwd: project?.cwd,
		});
		taskStore.updateTask(
			projectId,
			task.id,
			{ prompt: curatedPrompt },
			project?.cwd,
		);
		return curatedPrompt;
	};

	/***
	 * MARK: Execute Task Stage
	 ***/
	app.post("/tasks/:id/execute", async (request, reply) => {
		const id = resolveAndGuardProject(request.body?.projectId, reply);
		if (!id) return;

		const { priority } = request.body || {};
		const project = projectStore.getProject(id);
		const existing = taskStore.getTask(id, request.params.id);
		if (!existing) return reply.status(404).send({ error: "Task not found" });

		const blockCheck = taskStore.isTaskBlocked(id, request.params.id);
		if (blockCheck.blocked) {
			return reply.status(409).send({
				error: "Task is blocked by unresolved dependencies",
				blockedBy: blockCheck.blockers,
			});
		}

		const stages = resolveStagesForTask(project, existing);

		// The engine runs one task at a time. Dispatching a second execution
		// while another task owns the engine used to silently queue it behind
		// a hours-long run (or double-run the same task on double-click),
		// which is how two tasks ended up running at once.
		const engine = taskStore.engineState;
		const engineBusyWithOther =
			engine?.status === "running" &&
			engine?.activeTaskId &&
			String(engine.activeTaskId) !== String(existing.id);
		if (engineBusyWithOther) {
			return reply.status(409).send({
				error: "Engine is already running another task",
				activeTaskId: engine.activeTaskId,
			});
		}
		const alreadyProcessing =
			ORPHANED_RUNNING_STATUSES.has(existing.status) &&
			engine?.status === "running" &&
			String(engine?.activeTaskId) === String(existing.id);
		if (alreadyProcessing) {
			return reply
				.status(409)
				.send({ error: "Task is already processing" });
		}
		// Tier-5 containment: a tripped engine admits no dispatch except the
		// half-open canary. Fail loudly so an operator sees why nothing runs.
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

		const result = await taskStore.executeStage(id, request.params.id, {
			stages,
			projectCwd: project?.cwd,
			agentRunner,
			promptEngine,
			priority: priority || "normal",
		});
		if (!result) return reply.status(404).send({ error: "Task not found" });
		return result;
	});

	/***
	 * MARK: Advance Task
	 ***/
	app.post("/tasks/:id/advance", async (request, reply) => {
		const id = resolveAndGuardProject(
			request.body?.projectId || request.query?.projectId,
			reply,
		);
		if (!id) return;

		const existing = taskStore.getTask(id, request.params.id);
		if (!existing) return reply.status(404).send({ error: "Task not found" });

		if (existing.status === "completed") {
			return reply.status(409).send({ error: "Task is already completed" });
		}
		// A terminal-failed task has no stage to advance from: approving it
		// used to return the task unchanged (a silent no-op with live APPROVE
		// buttons). Fail loudly with the recovery path instead — retry the
		// stage once the repo is healthy.
		if (existing.status === "failed") {
			return reply.status(409).send({
				error:
					"Task failed in its current stage — retry the stage instead of approving",
				currentStageId: existing.currentStageId || null,
				failureReason:
					existing.failureReason || existing.lastError?.message || null,
			});
		}
		if (ORPHANED_RUNNING_STATUSES.has(existing.status)) {
			const isActivelyProcessing =
				taskStore.engineState?.status === "running" &&
				String(taskStore.engineState?.activeTaskId) === String(existing.id);
			if (isActivelyProcessing) {
				const isCiLike =
					existing.status === "running_ci" ||
					existing.status === "running_deploy" ||
					existing.status === "running_merge";
				if (!isCiLike) {
					return reply
						.status(409)
						.send({ error: "Task is currently processing or advancing" });
				}
				taskStore.killTaskProcess(existing.id);
				existing.skipRequested = true;
			}
		}

		const { guidance } = request.body || {};
		const project = projectStore.getProject(id);
		// Review threads captured during the checkpoint travel with the approval:
		// they land in the human approval report and in the task goal so the next
		// agent stage considers them (plan §2.3).
		const reviewComments = await loadHumanReviewComments(project, existing.id);
		const carriedGuidance = buildCommentsGuidance({
			guidance,
			comments: reviewComments,
		});
		if (carriedGuidance && String(carriedGuidance).trim()) {
			existing.goal = `${existing.goal}\n\n## Human Guidance\n${String(carriedGuidance).trim()}`;
			existing.body = existing.goal;
			taskStore._recordHistory(
				existing,
				`Approved with human guidance: ${String(carriedGuidance).trim()}`,
			);
		}

		const stages = resolveStagesForTask(project, existing);
		// Capture the exiting stage before advanceStage mutates the task:
		// approving a human checkpoint only ensures the task-branch ref
		// exists (create-only) — never commits, pushes, or switches branches,
		// so the operator's live tree is left exactly as it was.
		const exitingStageId = existing.currentStageId;
		const exitingStage = stages.find(
			(s) =>
				String(s.id) === String(exitingStageId) ||
				(s.name &&
					String(s.name).toLowerCase() ===
						String(exitingStageId).toLowerCase()),
		);
		const task = taskStore.advanceStage(
			id,
			request.params.id,
			stages,
			undefined,
			project?.cwd,
			{ comments: reviewComments, guidance },
		);
		if (!task) return reply.status(404).send({ error: "Task not found" });

		// Curate the newly entered stage's prompt before touching git state:
		// updateTask mutates the stored task in place, so curating first
		// guarantees the stored prompt belongs to the new stage instead of
		// the previous one. (Human checkpoints carry no agent prompt of
		// their own; approval performs no commit, so the prompt is purely
		// for the next stage's dispatch.)
		const curatedPrompt = curateAndStorePrompt(id, task, project);

		if (
			exitingStage &&
			normalizeStageType(exitingStage.type) === "human" &&
			typeof taskStore._isBranchModeEnabled === "function" &&
			taskStore._isBranchModeEnabled(id) &&
			typeof taskStore.ensureTaskBranchRef === "function"
		) {
			// Best-effort, warn-only: a late-created ref still lets later
			// work stages pick the branch up. Reviewer edits made during
			// waiting_human stay uncommitted in the working tree (agent/CI
			// stages sweep them up; merge refuses a dirty tree until the
			// operator commits).
			await taskStore
				.ensureTaskBranchRef(task, project?.cwd, {
					stageName: exitingStage.name || exitingStage.id,
				})
				.catch((refError) => {
					taskStore.eventBridge?.emitSystemLog?.(
						id,
						`[WARN] Human-stage branch-ref ensure skipped: ${refError?.message || refError}`,
						{ taskId: task.id },
					);
				});
		}

		return {
			...task,
			curatedPrompt,
		};
	});

	/***
	 * MARK: Follow Up Task
	 ***/
	app.post("/tasks/:id/follow-up", async (request, reply) => {
		const { prompt } = request.body || {};
		if (!prompt || !String(prompt).trim()) {
			return reply.status(400).send({ error: "Prompt is required" });
		}
		const id = resolveAndGuardProject(
			request.body?.projectId || request.query?.projectId,
			reply,
		);
		if (!id) return;

		const project = projectStore.getProject(id);
		const session = await getOrCreateSession(id);
		const stages = resolveStagesForTask(
			project,
			taskStore.getTask(id, request.params.id),
		);
		const task = await taskStore.followUpTask(id, request.params.id, prompt, {
			session,
			projectCwd: project?.cwd,
			stages,
			agentRunner,
			promptEngine,
		});
		if (!task) return reply.status(404).send({ error: "Task not found" });
		return task;
	});

	/***
	 * MARK: Steer Task
	 ***/
	app.post("/tasks/:id/steer", async (request, reply) => {
		const { goal, guidance } = request.body || {};
		const steerText = guidance || goal;
		if (!steerText || !String(steerText).trim()) {
			return reply.status(400).send({ error: "Guidance is required" });
		}
		const id = resolveAndGuardProject(
			request.body?.projectId || request.query?.projectId,
			reply,
		);
		if (!id) return;

		const project = projectStore.getProject(id);
		const session = await getOrCreateSession(id);
		const task = await taskStore.steerTask(id, request.params.id, steerText, {
			session,
			projectCwd: project?.cwd,
		});
		if (!task) return reply.status(404).send({ error: "Task not found" });
		return task;
	});

	/***
	 * MARK: Pause Task
	 ***/
	app.post("/tasks/:id/pause", async (request, reply) => {
		const id = resolveAndGuardProject(
			request.body?.projectId || request.query?.projectId,
			reply,
		);
		if (!id) return;

		const project = projectStore.getProject(id);
		const task = taskStore.pauseTask(id, request.params.id, project?.cwd);
		if (!task) return reply.status(404).send({ error: "Task not found" });
		return task;
	});

	/***
	 * MARK: Resume Task
	 ***/
	app.post("/tasks/:id/resume", async (request, reply) => {
		const id = resolveAndGuardProject(
			request.body?.projectId || request.query?.projectId,
			reply,
		);
		if (!id) return;

		const project = projectStore.getProject(id);
		const existing = taskStore.getTask(id, request.params.id);
		if (!existing) return reply.status(404).send({ error: "Task not found" });

		// Same engine-busy semantics as /execute: the engine runs one task at
		// a time, so resuming into a running engine would stack a confusing
		// duplicate dispatch behind the live run.
		const resumeEngine = taskStore.engineState;
		if (
			resumeEngine?.status === "running" &&
			resumeEngine?.activeTaskId &&
			String(resumeEngine.activeTaskId) !== String(existing.id)
		) {
			return reply.status(409).send({
				error: "Engine is already running another task",
				activeTaskId: resumeEngine.activeTaskId,
			});
		}

		const stages = resolveStagesForTask(project, existing);
		const task = await taskStore.resumeTask(id, request.params.id, {
			stages,
			projectCwd: project?.cwd,
			agentRunner,
			promptEngine,
			priority: "high",
		});
		return task;
	});

	/***
	 * MARK: Retry Task Stage
	 ***/
	app.post("/tasks/:id/retry", async (request, reply) => {
		const id = resolveAndGuardProject(
			request.body?.projectId || request.query?.projectId,
			reply,
		);
		if (!id) return;

		const project = projectStore.getProject(id);
		const existing = taskStore.getTask(id, request.params.id);
		if (!existing) return reply.status(404).send({ error: "Task not found" });

		// Same engine-busy semantics as /execute: retrying into a running
		// engine would stack a confusing duplicate dispatch behind the live
		// run instead of executing now.
		const retryEngine = taskStore.engineState;
		if (
			retryEngine?.status === "running" &&
			retryEngine?.activeTaskId &&
			String(retryEngine.activeTaskId) !== String(existing.id)
		) {
			return reply.status(409).send({
				error: "Engine is already running another task",
				activeTaskId: retryEngine.activeTaskId,
			});
		}

		const stages = resolveStagesForTask(project, existing);
		const task = await taskStore.retryStage(id, request.params.id, {
			stages,
			projectCwd: project?.cwd,
			agentRunner,
			promptEngine,
			priority: "high",
		});
		return task;
	});

	/***
	 * MARK: Abort Task
	 ***/
	app.post("/tasks/:id/abort", async (request, reply) => {
		const id = resolveAndGuardProject(
			request.body?.projectId || request.query?.projectId,
			reply,
		);
		if (!id) return;

		const project = projectStore.getProject(id);
		const task = taskStore.abortTask(id, request.params.id, project?.cwd);
		if (!task) return reply.status(404).send({ error: "Task not found" });
		return task;
	});

	/***
	 * MARK: Failback Task
	 ***/
	app.post("/tasks/:id/failback", async (request, reply) => {
		const { fallbackStageId } = request.body || {};
		const id = resolveAndGuardProject(
			request.body?.projectId || request.query?.projectId,
			reply,
		);
		if (!id) return;

		const existing = taskStore.getTask(id, request.params.id);
		if (!existing) return reply.status(404).send({ error: "Task not found" });

		const project = projectStore.getProject(id);
		const stages = resolveStagesForTask(project, existing);
		const task = taskStore.failbackStage(
			id,
			request.params.id,
			stages,
			fallbackStageId,
			undefined,
			project?.cwd,
		);
		if (!task) return reply.status(404).send({ error: "Task not found" });

		const curatedPrompt = curateAndStorePrompt(id, task, project);

		return {
			...task,
			curatedPrompt,
		};
	});

	/***
	 * MARK: Reject Task (Enhanced Human Review)
	 ***/
	app.post("/tasks/:id/reject", async (request, reply) => {
		const { feedback } = request.body || {};
		if (!feedback || !String(feedback).trim()) {
			return reply.status(400).send({ error: "Feedback is required" });
		}
		const id = resolveAndGuardProject(
			request.body?.projectId || request.query?.projectId,
			reply,
		);
		if (!id) return;

		const existing = taskStore.getTask(id, request.params.id);
		if (!existing) return reply.status(404).send({ error: "Task not found" });

		if (existing.status === "completed") {
			return reply.status(409).send({ error: "Task is already completed" });
		}
		if (ORPHANED_RUNNING_STATUSES.has(existing.status)) {
			return reply
				.status(409)
				.send({ error: "Task cannot be rejected while processing" });
		}

		const project = projectStore.getProject(id);
		const stages = resolveStagesForTask(project, existing);
		// Line-by-line threads recorded against stage reports/code join the
		// rejection report so a fail keeps the full written record (the
		// formatter skips them when the feedback draft already carries them).
		const reviewComments = await loadHumanReviewComments(project, existing.id);
		const rejectedTask = taskStore.rejectTask(
			id,
			request.params.id,
			stages,
			feedback,
			undefined,
			project?.cwd,
			reviewComments,
		);
		if (!rejectedTask) return reply.status(404).send({ error: "Task not found" });

		const finalPrompt = curateAndStorePrompt(id, rejectedTask, project, {
			feedback: String(feedback).trim(),
		});

		return {
			...rejectedTask,
			curatedPrompt: finalPrompt,
			feedback: String(feedback).trim(),
		};
	});

	/***
	 * MARK: Move Task
	 ***/
	app.post("/tasks/:id/move", async (request, reply) => {
		const { stageId } = request.body || {};
		if (!stageId) return reply.status(400).send({ error: "stageId is required" });
		const id = resolveAndGuardProject(
			request.body?.projectId || request.query?.projectId,
			reply,
		);
		if (!id) return;

		const project = projectStore.getProject(id);
		const task = taskStore.moveToStage(
			id,
			request.params.id,
			stageId,
			"Moved",
			undefined,
			project?.cwd,
			{ operatorMove: true },
		);
		if (!task) return reply.status(404).send({ error: "Task not found" });
		return task;
	});

	/***
	 * MARK: Jump Task
	 ***/
	app.post("/tasks/:id/jump", async (request, reply) => {
		const { stageId } = request.body || {};
		if (!stageId) return reply.status(400).send({ error: "stageId is required" });
		const id = resolveAndGuardProject(
			request.body?.projectId || request.query?.projectId,
			reply,
		);
		if (!id) return;

		const project = projectStore.getProject(id);
		const task = taskStore.moveToStage(
			id,
			request.params.id,
			stageId,
			"Jumped",
			undefined,
			project?.cwd,
			{ operatorMove: true },
		);
		if (!task) return reply.status(404).send({ error: "Task not found" });
		return task;
	});

	/***
	 * MARK: Complete Task
	 ***/
	app.post("/tasks/:id/complete", async (request, reply) => {
		const id = resolveAndGuardProject(
			request.body?.projectId || request.query?.projectId,
			reply,
		);
		if (!id) return;

		const project = projectStore.getProject(id);
		const task = taskStore.completeTask(id, request.params.id, project?.cwd);
		if (!task) return reply.status(404).send({ error: "Task not found" });
		return task;
	});

	/***
	 * MARK: Engine Containment State
	 * @description Global engine + Tier-5 containment snapshot. Un-scoped by
	 *   design (containment is host-wide, not per project) so the UI banner
	 *   and an operator can always read it.
	 ***/
	app.get("/engine/state", async () => {
		return {
			engine: taskStore.getEngineState(),
			circuit: circuitSnapshot(taskStore),
			schedulerStats: { ...(taskStore.schedulerStats || {}) },
		};
	});

	/***
	 * MARK: Trip Engine
	 * @description Operator emergency stop: trips global containment with a
	 *   required reason. Work in flight settles quietly on its next failure
	 *   callback; queued tasks stay `in_stage` with budgets untouched.
	 ***/
	app.post("/engine/trip", async (request, reply) => {
		const reason = String(request.body?.reason || "").trim();
		if (!reason) {
			return reply.status(400).send({ error: "reason is required" });
		}
		const operator = String(request.body?.operator || "").trim() || null;
		const circuit = tripEngine(taskStore, {
			reason,
			source: "manual",
			operator,
		});
		return { tripped: true, circuit };
	});

	/***
	 * MARK: Reset Engine
	 * @description Lifts global containment. The reset reason is REQUIRED and
	 *   logged/broadcast — an operator must record why containment was safe
	 *   to lift. Works whether the trip was manual or automatic.
	 ***/
	app.post("/engine/reset", async (request, reply) => {
		const reason = String(request.body?.reason || "").trim();
		if (!reason) {
			return reply.status(400).send({ error: "reason is required" });
		}
		const operator = String(request.body?.operator || "").trim() || null;
		const circuit = resetEngine(taskStore, {
			reason,
			source: "manual",
			operator,
		});
		return { tripped: false, circuit };
	});
}
