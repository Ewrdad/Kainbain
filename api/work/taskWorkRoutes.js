/***
 * MARK: taskWorkRoutes
 * @description Task CRUD and board projection routes: create, list, preview,
 *   get, edit, and delete discrete work items.
 ***/

import { _sanitizeTaskTitle } from "./taskIdentity.js";
import { toTaskDurationSummary } from "../taskDurationSummary.js";
import { resolveStage } from "../flow/index.js";
import { resolveStagesForTask } from "../flow/taskScheduler.js";
import { normalizeSurveyFileName, readSurvey, resolveQuestionMeOutputFile, saveSurveyAnswers } from "./taskSurvey.js";
import { stageHasQuestionMe, unansweredRequired } from "../../shared/survey.js";

/***
 * MARK: surveyOutputFileForRequest
 * @description Picks the active survey file for one survey read/submit.
 *   Precedence: an explicit `file`/`outputFile` (or alias) query/body value
 *   wins; otherwise the next `question-me` stage at or after the parked
 *   task's current stage; otherwise the persisted `task.surveyFile` (restart
 *   path); otherwise the first `question-me` stage; otherwise the default.
 *   Every value passes through `normalizeSurveyFileName`, so unsafe input
 *   fails safe to `SURVEY.md` instead of escaping the task folder.
 ***/
export function surveyOutputFileForRequest(task, project, request) {
	const query = request?.query || {};
	const body = request?.body || {};
	const explicitRaw =
		query.file ?? query.outputFile ?? query.surveyFile ?? query.surveyFileName ??
		query.fileName ?? query.targetFile ??
		body.file ?? body.outputFile ?? body.surveyFile ?? body.surveyFileName ??
		body.fileName ?? body.targetFile;
	if (explicitRaw !== undefined && explicitRaw !== null &&
		!(typeof explicitRaw === "string" && explicitRaw.trim() === "")) {
		return normalizeSurveyFileName(explicitRaw);
	}
	const stages = (typeof resolveStagesForTask === "function")
		? (resolveStagesForTask(project, task) || [])
		: [];
	let target = null;
	if (Array.isArray(stages)) {
		// Prefer the next question-me stage at or after the parked task's
		// current stage (so a later survey stage keeps its own configured
		// outputFile) instead of always the first one in the workflow.
		const currentIndex = stages.findIndex(
			(st) => String(st?.id) === String(task?.currentStageId),
		);
		if (currentIndex >= 0) {
			target =
				stages.slice(currentIndex).find(stageHasQuestionMe) || null;
		}
		if (!target && task?.surveyFile) {
			// Persisted selection (e.g. after a restart) wins over
			// rediscovery only when no later question-me stage is configured.
			return normalizeSurveyFileName(task.surveyFile);
		}
		if (!target) {
			target = stages.find(stageHasQuestionMe) || null;
			/* eslint-disable-next-line security/detect-object-injection -- index comes from findIndex on the same array */
			if (!target && currentIndex >= 0) target = stages[currentIndex] || null;
		}
	}
	return resolveQuestionMeOutputFile(target);
}

export async function registerTaskWorkRoutes(app, deps) {
	const {
		resolveAndGuardProject,
		getOrCreateSession,
		projectStore,
		taskStore,
		promptEngine,
		isAgentRunning,
		agentRunner,
		claimStore,
	} = deps;

	// Live Runner assignment for the UI (D5): who holds this task right
	// now, if anyone. `{ runnerId, epoch }` or null — the execution id
	// stays server-side (it rides runner-authenticated calls only).
	const liveClaim = (taskId) => {
		try {
			const hold =
				claimStore && typeof claimStore.describe === "function"
					? claimStore.describe(taskId)
					: null;
			if (!hold) return null;
			return { runnerId: hold.runnerId, epoch: hold.epoch };
		} catch {
			return null;
		}
	};

	const resolveTaskContext = (request, reply) => {
		const { title, goal, stageId, blockedBy } = request.body || {};
		const taskGoal = goal || title;
		if (!taskGoal || !String(taskGoal).trim()) {
			reply.status(400).send({ error: "Goal or title is required" });
			return null;
		}
		const id = resolveAndGuardProject(
			request.body?.projectId || request.query?.projectId,
			reply,
		);
		if (!id) return null;
		const project = projectStore.getProject(id);
		const stage = resolveStage(project, stageId);
		return {
			title: _sanitizeTaskTitle(title || taskGoal.slice(0, 60)),
			goal: taskGoal,
			id,
			stage,
			project,
			blockedBy,
		};
	};

	/***
	 * MARK: List Tasks
	 ***/
	app.get(
		"/tasks",
		{
			schema: {
				querystring: {
					type: "object",
					properties: {
						projectId: { type: "string" },
						workflowId: { type: "string" },
						excludeCompleted: { type: "string" },
					},
				},
				response: {
					200: {
						type: "array",
						items: { type: "object", additionalProperties: true },
					},
				},
			},
		},
		async (request, reply) => {
			const id = resolveAndGuardProject(request.query?.projectId, reply);
			if (!id) return;

			const { workflowId } = request.query || {};
			// Lean board loads: completed tasks only ride the list when the
			// UI asks for them (Show Completed). Query values arrive as
			// strings; default includes everything (other consumers).
			const excludeCompleted =
				request.query?.excludeCompleted === true ||
				request.query?.excludeCompleted === "true" ||
				request.query?.excludeCompleted === "1";
			const project = projectStore.getProject(id);
			// Board lists serve duration-enriched summaries (no log bodies,
			// prompts, histories, or report content); detail views hydrate one
			// full task through GET /tasks/:id on open. Enrich before compacting.
			const toTaskDurationResponse = (task) =>
				toTaskDurationSummary(task, resolveStagesForTask(project, task));
			const toBoardTask = (t) => ({
				...toTaskDurationResponse(t),
				claim: liveClaim(t.id),
			});
			const visible = (t) => !excludeCompleted || t?.status !== "completed";
			if (workflowId) {
				return taskStore
					.getTasks(id, workflowId, project?.cwd)
					.filter(visible)
					.map(toBoardTask);
			}
			return taskStore
				.listTasks(id, project?.cwd)
				.filter(visible)
				.map(toBoardTask);
		},
	);

	/***
	 * MARK: List Tasks Queue Order
	 ***/
	app.get(
		"/tasks/queue",
		{
			schema: {
				querystring: {
					type: "object",
					properties: {
						projectId: { type: "string" },
					},
				},
				response: {
					200: {
						type: "array",
						items: { type: "object", additionalProperties: true },
					},
				},
			},
		},
		async (request, reply) => {
			const id = resolveAndGuardProject(request.query?.projectId, reply);
			if (!id) return;
			return taskStore.getScheduledQueue(id);
		},
	);

	/***
	 * MARK: Preview Prompt
	 ***/
	app.post("/tasks/preview", async (request, reply) => {
		const ctx = resolveTaskContext(request, reply);
		if (!ctx) return;

		const curatedPrompt = promptEngine.curatePrompt(
			{ id: "preview", title: ctx.title, goal: ctx.goal },
			ctx.stage,
			{
				project: ctx.project,
				projectName: ctx.project?.name,
				projectRepo: ctx.project?.gitUrl || ctx.project?.gitRepo,
				projectCwd: ctx.project?.cwd,
			},
		);
		return { curatedPrompt, stageId: ctx.stage.id };
	});

	/***
	 * MARK: Create Task
	 ***/
	app.post(
		"/tasks",
		{
			schema: {
				body: {
					type: "object",
					properties: {
						projectId: { type: "string" },
						title: { type: "string" },
						goal: { type: "string" },
						followUp: { type: "boolean" },
						execute: { type: "boolean" },
						stageId: { type: "string" },
						workflowId: { type: "string" },
						idempotencyKey: { type: "string" },
						blockedBy: { type: "array", items: { type: "string" } },
					},
				},
				response: {
					200: {
						type: "object",
						additionalProperties: true,
						properties: {
							id: { type: "string" },
							title: { type: "string" },
							goal: { type: "string" },
							currentStageId: { type: "string" },
							status: { type: "string" },
							curatedPrompt: { type: "string" },
						},
					},
					400: { type: "object", properties: { error: { type: "string" } } },
				},
			},
		},
		async (request, reply) => {
			const { followUp, execute, idempotencyKey, workflowId } = request.body || {};
			const ctx = resolveTaskContext(request, reply);
			if (!ctx) return;

			let task;
		try {
			task = taskStore.createTask(ctx.id, {
				title: ctx.title,
				goal: ctx.goal,
				stageId: ctx.stage.id,
				workflowId: workflowId || ctx.project?.activeWorkflowId,
				idempotencyKey,
				blockedBy: ctx.blockedBy,
				projectCwd: ctx.project?.cwd,
			});
		} catch (err) {
			return reply.status(400).send({
				error: err?.message || "Invalid blockedBy",
			});
		}

			const finalPrompt = promptEngine.curatePrompt(task, ctx.stage, {
				project: ctx.project,
				projectName: ctx.project?.name,
				projectRepo: ctx.project?.gitUrl || ctx.project?.gitRepo,
				projectCwd: ctx.project?.cwd,
			});

			taskStore.updateTask(
				ctx.id,
				task.id,
				{ prompt: finalPrompt },
				ctx.project?.cwd,
			);

			if (execute) {
				const stages = resolveStagesForTask(ctx.project, task);
				taskStore
					.executeStage(ctx.id, task.id, {
						stages,
						projectCwd: ctx.project?.cwd,
						agentRunner,
						promptEngine,
						priority: "normal",
					})
					.catch((err) => {
						app.log.error(err, "Task auto-execution error");
					});
			} else if (followUp) {
				const session = await getOrCreateSession(ctx.id);
				if (session) {
					if (isAgentRunning(session)) {
						await session.followUp(finalPrompt);
					} else {
						const stages = resolveStagesForTask(ctx.project, task);
						taskStore
							.executeStage(ctx.id, task.id, {
								stages,
								projectCwd: ctx.project?.cwd,
								agentRunner,
								promptEngine,
								priority: "normal",
							})
							.catch((err) => {
								app.log.error(err, "Task auto-execution error");
							});
					}
				}
			}

			return {
				...task,
				curatedPrompt: finalPrompt,
			};
		},
	);

	/***
	 * MARK: Get Task
	 ***/
	app.get("/tasks/:id", async (request, reply) => {
		const id = resolveAndGuardProject(
			request.query?.projectId || request.body?.projectId,
			reply,
		);
		if (!id) return;

		const task = taskStore.getTask(id, request.params.id);
		if (!task) return reply.status(404).send({ error: "Task not found" });
		return { ...task, claim: liveClaim(task.id) };
	});

	/***
	 * MARK: Patch Task
	 ***/
	app.patch("/tasks/:id", async (request, reply) => {
		const id = resolveAndGuardProject(request.body?.projectId, reply);
		if (!id) return;

		const project = projectStore.getProject(id);
		const task = taskStore.getTask(id, request.params.id);
		if (!task) return reply.status(404).send({ error: "Task not found" });

		const updates = {};
		if (typeof request.body?.title === "string" && request.body.title.trim()) {
			updates.title = _sanitizeTaskTitle(request.body.title);
		}
		if (typeof request.body?.goal === "string" && request.body.goal.trim()) {
			updates.goal = request.body.goal.trim();
			updates.body = updates.goal;
		}
		if (typeof request.body?.status === "string") {
			updates.status = request.body.status;
		}
		if (typeof request.body?.branch === "string") {
			updates.branch = request.body.branch;
		}
		if (request.body?.blockedBy !== undefined) {
			updates.blockedBy = request.body.blockedBy;
		}
		if (
			typeof request.body?.stageId === "string" &&
			request.body.stageId !== task.currentStageId
		) {
			taskStore.moveToStage(
				id,
				task.id,
				request.body.stageId,
				"Updated stage",
				undefined,
				project?.cwd,
				{ operatorMove: true },
			);
		}

		if (Object.keys(updates).length === 0 && !request.body?.stageId) {
			return reply.status(400).send({ error: "Nothing to update" });
		}

		let updated;
		try {
			updated = taskStore.updateTask(id, task.id, updates, project?.cwd);
		} catch (err) {
			return reply.status(400).send({
				error: err?.message || "Invalid blockedBy",
			});
		}
		taskStore._recordHistory(updated, "Task details edited");
		return updated;
	});

	/***
	 * MARK: Delete Task
	 ***/
	app.delete("/tasks/:id", async (request, reply) => {
		const id = resolveAndGuardProject(
			request.query?.projectId || request.body?.projectId,
			reply,
		);
		if (!id) return;

		const project = projectStore.getProject(id);
		const ok = taskStore.deleteTask(id, request.params.id, project?.cwd);
		if (!ok) return reply.status(404).send({ error: "Task not found" });
		return { status: "deleted", id: request.params.id };
	});

	/***
	 * MARK: Get Survey
	 * @description Reads a task's `SURVEY.md` (question-me rounds) for the
	 *   survey page: parsed rounds, file status, and the still-missing
	 *   required questions. 404s on unknown tasks; a task without a survey
	 *   file answers `exists: false, status: 'none'` (never 404).
	 ***/
	app.get("/tasks/:id/survey", async (request, reply) => {
		const id = resolveAndGuardProject(
			request.query?.projectId || request.body?.projectId,
			reply,
		);
		if (!id) return;

		const project = projectStore.getProject(id);
		const task = taskStore.getTask(id, request.params.id);
		if (!task) return reply.status(404).send({ error: "Task not found" });

		const outputFile = surveyOutputFileForRequest(task, project, request);
		const survey = readSurvey(project?.cwd, project, task.id, outputFile);
		return {
			taskId: task.id,
			outputFile,
			surveyFile: outputFile,
			exists: survey.exists,
			status: survey.status,
			rounds: survey.rounds,
			errors: survey.errors,
			missing: unansweredRequired(survey.rounds),
			markdown: survey.markdown,
		};
	});

	/***
	 * MARK: Submit Survey
	 * @description Saves survey answers (`{ answers: { [qid]: { selected,
	 *   notes } } }`, merge-only — questions are never added/removed here)
	 *   and, when every visible required question is answered (or the survey
	 *   is explicitly skipped while nothing requires answering), advances the
	 *   task to its next stage. Partial saves stay parked (`advanced: false`)
	 *   so the UI keeps showing the survey. `action: 'skip'` advances only
	 *   when no question requires answering; otherwise it 400s with `missing`.
	 ***/
	app.post("/tasks/:id/survey", async (request, reply) => {
		const id = resolveAndGuardProject(request.body?.projectId, reply);
		if (!id) return;

		const project = projectStore.getProject(id);
		const task = taskStore.getTask(id, request.params.id);
		if (!task) return reply.status(404).send({ error: "Task not found" });

		const action = request.body?.action;
		if (action !== undefined && action !== "save" && action !== "skip") {
			return reply.status(400).send({ error: "action must be 'save' or 'skip'" });
		}

		const outputFile = surveyOutputFileForRequest(task, project, request);
		let survey = readSurvey(project?.cwd, project, task.id, outputFile);
		if (action !== "skip") {
			const patch = request.body?.answers;
			if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
				return reply.status(400).send({ error: "answers must be an object keyed by question id" });
			}
			try {
				const saved = saveSurveyAnswers({
					cwd: project?.cwd,
					project,
					taskId: task.id,
					outputFile,
					patch,
				});
				survey = { ...readSurvey(project?.cwd, project, task.id, outputFile), status: saved.status, missing: saved.missing, unknownIds: saved.unknownIds };
			} catch (err) {
				return reply.status(err?.statusCode || 400).send({ error: err?.message || "Invalid survey answers" });
			}
		}

		const missing = unansweredRequired(survey.rounds || []);
		// A skip confirms "nothing to ask": it completes an explicitly empty
		// survey and a missing one alike. Plain saves never complete those.
		const complete =
			survey.status === "answered" ||
			survey.status === "empty" ||
			(action === "skip" && survey.status === "none");
		if (!complete) {
			if (action === "skip") {
				return reply.status(400).send({
					error: "Survey has unanswered required questions",
					missing,
					status: survey.status,
				});
			}
			return {
				taskId: task.id,
				outputFile,
				surveyFile: outputFile,
				status: survey.status,
				advanced: false,
				missing,
				unknownIds: survey.unknownIds || [],
				rounds: survey.rounds || [],
				errors: survey.errors || [],
			};
		}

		// Advance guard: only a genuine survey handoff moves forward here. A
		// human-checkpoint task opened at the survey URL by hand must never
		// skip approval through this route — it fails safe with guidance
		// instead. Either the persisted park flag or the stage's skill marks
		// a genuine handoff (the flag covers restarts, the skill covers
		// task files written before the flag existed).
		const parkedStages = resolveStagesForTask(project, task);
		const parkedAtStage = (Array.isArray(parkedStages) ? parkedStages : []).find(
			(s) => String(s?.id) === String(task.currentStageId),
		) || null;
		const surveyParked = task.surveyPending === true || stageHasQuestionMe(parkedAtStage);
		if (complete && !surveyParked) {
			return {
				taskId: task.id,
				outputFile,
				surveyFile: outputFile,
				status: survey.status,
				advanced: false,
				missing: [],
				unknownIds: survey.unknownIds || [],
				rounds: survey.rounds || [],
				errors: survey.errors || [],
				note: "Task is not parked at a survey stage — use Approve / Retry instead of the survey to move it.",
			};
		}

		// Double-submit guard: only the parked question-me stage advances. A
		// re-submit after the task already moved on saves answers but never
		// advances a second time.
		if (task.status !== "waiting_human") {
			return {
				taskId: task.id,
				outputFile,
				surveyFile: outputFile,
				status: survey.status,
				advanced: false,
				missing: [],
				unknownIds: survey.unknownIds || [],
				rounds: survey.rounds || [],
				errors: survey.errors || [],
				note: "Task already left the survey stage — not advancing.",
			};
		}

		task.surveyPending = false;
		try { taskStore.updateTask(id, task.id, { surveyPending: false }, project?.cwd); } catch { /* best effort */ }
		taskStore._recordHistory(task, `Survey completed (${survey.status}) — advancing`);
		const advanced = taskStore.advanceStage(id, task.id, [], undefined, project?.cwd);
		return {
			taskId: task.id,
			outputFile,
			surveyFile: outputFile,
			status: survey.status,
			advanced: true,
			currentStageId: advanced?.currentStageId || task.currentStageId,
			unknownIds: survey.unknownIds || [],
			rounds: survey.rounds || [],
			errors: survey.errors || [],
		};
	});
}
