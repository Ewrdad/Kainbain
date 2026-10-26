import { _appendProcessLog } from "../../watch/index.js";
import { emitAlert } from "../../observability/alerts.js";
import {
	readSurvey,
	resolveSurveyGate,
	resolveQuestionMeOutputFile,
} from "../../work/taskSurvey.js";
import { stageHasQuestionMe } from "../../../shared/survey.js";

/***
 * MARK: parkTaskForSurvey
 * @description Shared question-me gate (was inline in executeStage): a
 *   finished agent stage carrying the `question-me` skill parks for a human
 *   survey instead of auto-advancing — unless the agent asked nothing or
 *   the questions are already answered. Used by the embedded finish AND
 *   the Runner-report finish so a remote run can never skip the human
 *   survey the embedded path would require.
 * @example parkTaskForSurvey({ store, projectId: 'p', taskId: 't', task, stage, projectObj, cwd, bridge, stageType, ... }) => { parked: false }
 * @param {Object} args - Context.
 * @param {Object} args.store - Task store.
 * @param {string} args.projectId - Project id.
 * @param {string} args.taskId - Task id.
 * @param {Object} args.task - Task entity (mutated).
 * @param {Object} args.stage - Finished stage.
 * @param {Object} args.projectObj - Project entity.
 * @param {string} args.cwd - Project working directory.
 * @param {Object} args.bridge - Event bridge (optional).
 * @param {string} args.stageType - Normalized stage type.
 * @param {string} args.finalOutput - Stage output.
 * @param {string} args.streamedOutput - Streamed fallback output.
 * @param {string} [args.summary] - Run summary.
 * @param {Array} [args.modifiedFiles] - Modified files.
 * @param {string} [args.duration] - Run duration.
 * @param {string} [args.via] - Attribution suffix (e.g. "via Runner r1").
 * @returns {Object} `{ parked, response }` — response is the route payload
 *   when parked.
 ***/
export function parkTaskForSurvey({
	store,
	projectId,
	taskId,
	task,
	stage,
	projectObj,
	cwd,
	bridge,
	stageType,
	finalOutput,
	streamedOutput,
	summary = "",
	modifiedFiles = [],
	duration = "0.0",
	via = "",
}) {
	// Remember the configured survey file so the parked task keeps
	// resolving the same document after a restart / pipeline edit.
	if (stageHasQuestionMe(stage)) {
		task.surveyFile = resolveQuestionMeOutputFile(stage);
	}
	store._saveTaskMarkdown(cwd, task);

	const surveyGate = resolveSurveyGate(
		stage,
		readSurvey(cwd, projectObj, taskId, stage).rounds,
	);
	if (!surveyGate.park) return { parked: false, response: null };

	const parkedAt = new Date().toISOString();
	task.status = "waiting_human";
	task.surveyPending = true;
	task.updatedAt = parkedAt;
	task.history.push({
		timestamp: parkedAt,
		action: `Survey requested by the 'question-me' skill (${surveyGate.reason}) — awaiting human answers${via ? ` (${via})` : ""}`,
	});
	_appendProcessLog(
		task,
		`[INFO] question-me parked stage '${stage.name || stage.id}' for a human survey (${surveyGate.reason})`,
	);
	store._saveTaskMarkdown(cwd, task);
	void emitAlert(bridge, {
		event: "task.survey_wait",
		severity: "info",
		projectId,
		taskId,
		stage: { id: stage.id, name: stage.name || stage.id, type: stageType },
		message: "Awaiting survey answers",
		ui: {
			event: "stage:survey_wait",
			payload: {
				taskId,
				stageId: stage.id,
				stageName: stage.name || stage.id,
				message: "Awaiting survey answers",
			},
		},
	});
	bridge?.broadcastGlobal?.("TASK_UPDATED", task);

	task.infraRetryCount = 0;
	store.lastCompletedTask = { projectId, taskId, timestamp: Date.now() };
	return {
		parked: true,
		response: {
			task,
			stageType,
			status: "waiting_human",
			output: finalOutput || streamedOutput,
			summary,
			modifiedFiles,
			model: stage.model || null,
			duration,
			surveyStatus: surveyGate.status,
		},
	};
}
