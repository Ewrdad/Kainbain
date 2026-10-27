import { PromptCurationEngine } from "../promptCuration.js";
import { resolveStagesForTask } from "./stageResolution.js";

const sharedEngine = new PromptCurationEngine();

/***
 * MARK: curateRunnerPrompt
 * @description Backend-side stage prompt curation for a Runner assignment:
 *   the backend owns task/stage/project truth, so it curates the prompt at
 *   claim/dispatch time and ships the finished string over the wire. The
 *   Runner only retargets the backend project cwd prefix to its prepared
 *   worktree (see runner daemon) and hands the prompt to the harness.
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
		return engine.curatePrompt(task, stage, {
			project: project || {},
			projectName: project?.name || project?.id || "",
			projectRepo: project?.gitUrl || project?.repoUrl || null,
			projectCwd: project?.cwd || "",
			reports: Array.isArray(task?.reports) ? task.reports : [],
		});
	} catch {
		return "";
	}
}
