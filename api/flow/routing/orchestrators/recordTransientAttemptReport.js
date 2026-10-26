import {
	generateStageReportContent,
} from "../../../watch/index.js";
import {
	stageElapsedSeconds,
} from "../../stagePolicy.js";

/***
 * MARK: recordTransientAttemptReport
 * @description Records one failed transient attempt as a FAILED stage report
 *   carrying the harness attribution — but ONLY for attributed runs (a known
 *   harness id plus the infrastructure kind). A timeout that later succeeds
 *   still counts as one failure plus one success for reliability; unattributed
 *   runs keep the old behavior of no report at all.
 * @example recordTransientAttemptReport(store, "p1", "t1", stage, "socket hang up", "Transient…", cwd, "pi", "infrastructure") => (report saved)
 * @param {Object} taskStore - TaskStore instance.
 * @param {string} projectId
 * @param {string} taskId
 * @param {Object} stage
 * @param {string} errorMsg
 * @param {string} summary - Report summary line for this attempt.
 * @param {string} cwd - Project working directory for the report file.
 * @param {string} [harnessId] - Harness that ran the failed attempt.
 * @param {string} [failureKind] - Runner outcome kind (must be "infrastructure").
 * @param {Object} [attribution] - Alias attribution (`{ aliasName, modelRef, targetIndex }`) recorded alongside the attempt.
 ***/
export function recordTransientAttemptReport(
	taskStore,
	projectId,
	taskId,
	stage,
	errorMsg,
	summary,
	cwd,
	harnessId,
	failureKind,
	attribution = {},
) {
	if (typeof harnessId !== "string" || !harnessId.trim()) return;
	if (failureKind !== "infrastructure") return;
	const task = taskStore.getTask(projectId, taskId);
	if (!task) return;
	const content = generateStageReportContent({
		task,
		stage,
		output: errorMsg,
		summary,
		status: "FAILED",
		duration: stageElapsedSeconds(task),
		error: errorMsg,
	});
	taskStore.saveStageReport(projectId, taskId, {
		stageName: stage?.name || stage?.id || "Stage",
		stageId: stage?.id,
		duration: stageElapsedSeconds(task),
		status: "FAILED",
		content,
		projectCwd: cwd,
		harnessId,
		failureKind,
		...attribution,
		// Failure traces keep the `-failure-` filename infix so they stay
		// distinguishable from opt-in success reports in the docs folder.
		failure: true,
	});
}
