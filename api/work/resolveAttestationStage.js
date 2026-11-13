// Domain: The Work — stage resolution for stage+config attestation.
import { resolveStagesForTask } from "../flow/stageResolution.js";

/***
 * MARK: resolveAttestationStage
 * @description Resolves the stage definition an attestation hash covers: an
 *   explicitly passed stage wins (production callers hand the stage they
 *   just ran to `finalizeTaskBranch`), otherwise the task's current stage is
 *   looked up by id (falling back to a case-insensitive name match, the
 *   same idiom `applyRunnerReport` uses). Total — anything unresolvable
 *   returns null so the caller records a plain pre-feature entry instead of
 *   attesting the wrong stage.
 * @example resolveAttestationStage({ stage: { id: '5', type: 'agent' } }) => { id: '5', type: 'agent' }
 * @example resolveAttestationStage({ project: null, task: null }) => null
 * @param {Object} [input] - Labelled inputs.
 * @param {Object} [input.stage] - Explicit stage definition (wins when usable).
 * @param {Object} [input.project] - Project record (for the fallback lookup).
 * @param {Object} [input.task] - Task entity (reads `currentStageId` for the fallback lookup).
 * @returns {Object|null} Usable stage definition, or null.
 ***/
export function resolveAttestationStage(input) {
	const explicit = input?.stage;
	if (explicit && typeof explicit === "object") {
		if (typeof explicit.id === "string" && explicit.id.trim()) return explicit;
	}
	const project = input?.project;
	const task = input?.task;
	if (!project || typeof project !== "object" || !task || typeof task !== "object") {
		return null;
	}
	let stages = [];
	try {
		stages = resolveStagesForTask(project, task) || [];
	} catch {
		return null;
	}
	if (!Array.isArray(stages)) return null;
	const current = task.currentStageId;
	const found =
		stages.find(
			(s) =>
				s &&
				typeof s === "object" &&
				(String(s.id) === String(current) ||
					(s.name &&
						String(s.name).toLowerCase() === String(current ?? "").toLowerCase())),
		) || null;
	if (!found || typeof found.id !== "string" || !found.id.trim()) return null;
	return found;
}
