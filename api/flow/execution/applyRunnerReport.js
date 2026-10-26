import { generateStageReportContent } from "../../watch/index.js";
import { recordReliabilitySample } from "../../watch/reliabilityShared.js";
import { stageWantsReport } from "../../promptCuration.js";
import { stageElapsedSeconds } from "../stagePolicy.js";
import { resolveStagesForTask } from "../stageResolution.js";
import { normalizeStageType } from "../../projectStore.js";
import { routeStageError } from "./routeStageError.js";
import { parkTaskForSurvey } from "./parkTaskForSurvey.js";

/***
 * MARK: applyRunnerReport
 * @description Engine-owned finish for a Runner-reported stage (remote
 *   dispatch integration, ADR 0009 step 6). The Runner owns git
 *   (clone/worktree/commit/push — transport row 1/2, D2: the backend never
 *   touches remotes for Runner work); the backend owns everything else,
 *   composing the SAME standalone transitions as the embedded path:
 *   formal report save (opt-in stages), reliability sample, question-me
 *   survey park (shared with executeStage — a remote run can never skip
 *   the human survey), failure routing via routeStageError, and
 *   advanceStage plus the scheduler follow-on kick. Call only after the
 *   lease fence accepted the execution (complete-execution does that).
 * @example await applyRunnerReport({ store, projectStore, projectId: 'p', taskId: 't', outcome: { status: 'passed', output: '...' } }) => { advanced: true, ... }
 * @param {Object} args - Context.
 * @param {Object} args.store - Task store.
 * @param {Object} args.projectStore - Project store.
 * @param {string} args.projectId - Project id.
 * @param {string} args.taskId - Task id.
 * @param {Object} args.outcome - Runner outcome.
 * @param {string} args.outcome.status - `passed` or `failed`.
 * @param {string} [args.outcome.output] - Final assistant text.
 * @param {string} [args.outcome.summary] - Run summary.
 * @param {Array} [args.outcome.modifiedFiles] - Modified files.
 * @param {string} [args.outcome.harnessId] - Harness that ran.
 * @param {string} [args.outcome.failureKind] - Failure taxonomy kind.
 * @param {string} [args.outcome.failureReason] - Failure message.
 * @param {string} [args.outcome.duration] - Run duration seconds.
 * @param {string} [args.outcome.runnerId] - Reporting Runner.
 * @returns {Promise<Object>} `{ advanced, status, ... }`.
 ***/
export async function applyRunnerReport({
	store,
	projectStore,
	projectId,
	taskId,
	outcome,
}) {
	const task = store.getTask(projectId, taskId);
	if (!task) {
		const err = new Error(`Task ${taskId} not found`);
		err.statusCode = 404;
		err.code = "TASK_NOT_FOUND";
		throw err;
	}
	const project = projectStore?.getProject?.(projectId);
	const stages = resolveStagesForTask(project, task);
	const stage =
		stages.find(
			(s) =>
				String(s.id) === String(task.currentStageId) ||
				(s.name &&
					String(s.name).toLowerCase() ===
						String(task.currentStageId).toLowerCase()),
		) ||
		stages[0] || { id: "stage", name: "Stage", type: "agent" };
	const stageType = normalizeStageType(stage.type);
	const bridge = store.eventBridge;
	const cwd = project?.cwd;
	const via = outcome.runnerId ? `via Runner ${outcome.runnerId}` : "via Runner";
	const duration = outcome.duration || "0.0";

	if (outcome.status === "failed") {
		return routeStageError(
			store,
			projectId,
			taskId,
			stage,
			new Error(outcome.failureReason || "Stage failed on the Runner"),
			{
				stages,
				bridge,
				projectCwd: cwd,
				runOutcome: {
					harnessId: outcome.harnessId,
					failureKind: outcome.failureKind,
				},
				classifyAs: {
					failureKind: outcome.failureKind,
					failureReason: outcome.failureReason,
				},
			},
		);
	}

	const at = Date.now();
	recordReliabilitySample(store, projectId, taskId, {
		harnessId: outcome.harnessId || "unknown",
		failureKind: "none",
		at,
		atRaw: new Date(at).toISOString(),
		stageId: stage.id,
	});
	bridge?.emitSystemLog?.(
		projectId,
		`[SYSTEM] Stage '${stage.name || stage.id}' completed in ${duration}s (${via})`,
		{ taskId, stageId: stage.id, duration },
	);

	if (stageWantsReport(stage)) {
		const reportContent = generateStageReportContent({
			task,
			stage,
			output: outcome.output || "",
			summary: outcome.summary || "",
			modifiedFiles: outcome.modifiedFiles || [],
			status: "PASSED",
			duration,
		});
		store.saveStageReport(projectId, taskId, {
			stageName: stage.name || stage.id,
			stageId: stage.id,
			duration: stageElapsedSeconds(task),
			status: "PASSED",
			content: reportContent,
			projectCwd: cwd,
			harnessId: outcome.harnessId,
			failureKind: outcome.failureKind || "none",
		});
	}

	task.history.push({
		timestamp: new Date().toISOString(),
		action: `Agent stage completed: ${stage.name || stage.id} (${via})`,
	});
	store._saveTaskMarkdown(cwd, task);

	const surveyPark = parkTaskForSurvey({
		store,
		projectId,
		taskId,
		task,
		stage,
		projectObj: project,
		cwd,
		bridge,
		stageType,
		finalOutput: outcome.output || "",
		streamedOutput: outcome.output || "",
		summary: outcome.summary || "",
		modifiedFiles: outcome.modifiedFiles || [],
		duration,
		via,
	});
	if (surveyPark.parked) return { advanced: false, ...surveyPark.response };

	task.surveyPending = false;
	task.infraRetryCount = 0;
	store.advanceStage(projectId, taskId, stages, bridge, cwd);

	store.lastCompletedTask = { projectId, taskId, timestamp: Date.now() };
	if (store.schedulerRunning) {
		setTimeout(() => {
			store.scheduleTick().catch(() => {});
		}, 50);
	}

	return {
		advanced: true,
		task,
		stageType,
		status: "passed",
		output: outcome.output || "",
		summary: outcome.summary || "",
		modifiedFiles: outcome.modifiedFiles || [],
		model: stage.model || null,
		duration,
	};
}
