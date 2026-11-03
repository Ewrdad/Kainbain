import { PromptCurationEngine } from "../promptCuration.js";
import { buildRetryFailureDetails } from "./execution/buildRetryFailureDetails.js";
import { resolveStagesForTask } from "./stageResolution.js";

const sharedEngine = new PromptCurationEngine();

/***
 * MARK: curateRunnerPrompt
 * @description Backend-side stage prompt curation for a Runner assignment:
 *   the backend owns task/stage/project truth, so it curates the prompt at
 *   claim/dispatch time and ships the finished string over the wire. The
 *   Runner only retargets the backend project cwd prefix to its prepared
 *   worktree (see runner daemon) and hands the prompt to the harness.
 *   A task claimed after a stage failure still carries failureReason/lastError
 *   (the runner-deferral in executeStage returns before the embedded path
 *   consumes them), so the prompt ships a Failure Details section with the
 *   previous attempt's reason and output excerpts — mirroring executeStage.
 *   Returns "" on any failure so callers fall back to a minimal prompt.
 * @example curateRunnerPrompt({ project, task, stageId: 's1' }) => '# Task\n...'
 * @param {Object} opts - `{ project, task, stageId, engine? }` (engine is a test seam).
 * @returns {string} Curated prompt, or "" when it cannot be built.
 ***/
export function curateRunnerPrompt({ project, task, stageId, engine = sharedEngine } = {}) {
	try {
		if (!task) return "";
		const stages = resolveStagesForTask(project, task);
		const stage =
			stages.find((s) => String(s?.id) === String(stageId)) ||
			stages.find((s) => String(s?.id) === String(task.currentStageId)) ||
			stages[0] ||
			{ id: stageId || "stage", name: "Stage" };
		// Retry/failback context for the next attempt: same inputs as the
		// embedded path in executeStage, so a re-run agent step sees what the
		// previous attempt failed on (reason plus head+tail output excerpts).
		const failureDetails = buildRetryFailureDetails({
			priorFailure: task.failureReason || task.lastError?.message || null,
			priorStdout: task.lastError?.stdout || null,
			priorStderr: task.lastError?.stderr || null,
			priorFailedStage:
				task.lastError?.stageName || task.lastError?.stageId || null,
			priorFailedStageType: task.lastError?.stageType || null,
		});
		return engine.curatePrompt(task, stage, {
			project: project || {},
			projectName: project?.name || project?.id || "",
			projectRepo: project?.gitUrl || project?.repoUrl || null,
			projectCwd: project?.cwd || "",
			reports: Array.isArray(task?.reports) ? task.reports : [],
			failureDetails,
		});
	} catch {
		return "";
	}
}
