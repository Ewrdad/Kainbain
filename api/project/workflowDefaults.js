import { v4 as uuidv4 } from "uuid";
import { DEFAULT_STAGES, normalizeStages } from "./stageNormalizers.js";
import { isValidBranchName } from "../git/validation.js";
import { normalizeBaseBranchName } from "../work/taskBaseBranch.js";

/***
 * MARK: createDefaultWorkflow
 * @description Creates the initial default named workflow with standard stages.
 * @example createDefaultWorkflow() => { id: 'wf-default', name: 'Feature Pipeline', isDefault: true, stages: [...] }
 * @param {Array<Object>} [stages]
 * @returns {Object}
 ***/
export const DEFAULT_WORKFLOW_ID = "wf-default";
export const DEFAULT_WORKFLOW_NAME = "Feature Pipeline";

export function createDefaultWorkflow(stages = DEFAULT_STAGES) {
	return {
		id: DEFAULT_WORKFLOW_ID,
		name: DEFAULT_WORKFLOW_NAME,
		isDefault: true,
		stages: normalizeStages(stages.map((s) => ({ ...s }))),
	};
}

/***
 * MARK: normalizeBaseBranchUpdate
 * @description Interprets a base-branch write from the API or UI: an absent
 *   value leaves the field untouched, a blank string or null clears it back
 *   to the repo default, a valid git branch name sets it, and anything else
 *   throws loudly (the route turns it into a 400) — a wrong-typed value
 *   must never silently wipe the configured branch.
 * @example normalizeBaseBranchUpdate('  feature/x  ') => { changed: true, baseBranch: 'feature/x' }
 * @example normalizeBaseBranchUpdate('') => { changed: true, baseBranch: null }
 * @param {*} value - Raw incoming value.
 * @returns {{changed: boolean, baseBranch?: string|null}}
 ***/
export function normalizeBaseBranchUpdate(value) {
	if (value === undefined) return { changed: false };
	if (value === null) return { changed: true, baseBranch: null };
	if (typeof value !== "string") {
		throw new Error(
			`Invalid base branch '${String(value)}' — set a valid git branch name, or clear it to use the repo default.`,
		);
	}
	if (!value.trim()) {
		return { changed: true, baseBranch: null };
	}
	const cleaned = value.trim();
	if (!isValidBranchName(cleaned)) {
		throw new Error(
			`Invalid base branch '${cleaned}' — set a valid git branch name, or clear it to use the repo default.`,
		);
	}
	return { changed: true, baseBranch: cleaned };
}

/***
 * MARK: normalizeWorkflow
 * @description Normalizes a single workflow entity with valid id, name, isDefault, normalized stages, and the optional base branch.
 * @example normalizeWorkflow({ name: 'Bugfix', stages: [] }) => { id: 'wf-...', name: 'Bugfix', isDefault: false, stages: [...] }
 * @param {Object} wf
 * @param {boolean} [isFirst=false]
 * @returns {Object}
 ***/
export function normalizeWorkflow(wf, isFirst = false) {
	if (!wf || typeof wf !== "object") {
		return createDefaultWorkflow();
	}
	const id = wf.id || `wf-${uuidv4().slice(0, 8)}`;
	const name = wf.name || (isFirst ? DEFAULT_WORKFLOW_NAME : "Custom Workflow");
	const isDefault = wf.isDefault === true || (isFirst && wf.isDefault !== false);
	const stages = normalizeStages(
		Array.isArray(wf.stages) && wf.stages.length > 0
			? wf.stages
			: DEFAULT_STAGES.map((s) => ({ ...s })),
	);
	const storedBase = normalizeBaseBranchName(wf.baseBranch);
	return {
		id,
		name,
		isDefault,
		stages,
		...(storedBase && isValidBranchName(storedBase) ? { baseBranch: storedBase } : {}),
	};
}

/***
 * MARK: normalizeWorkflows
 * @description Normalizes an array of workflows or migrates legacy root stages into a default workflow.
 * @example normalizeWorkflows([]) => [{ id: 'wf-default', name: 'Feature Pipeline', isDefault: true, stages: [...] }]
 * @param {Array<Object>} [workflows]
 * @param {Array<Object>} [legacyStages]
 * @returns {Array<Object>}
 ***/
export function normalizeWorkflows(workflows, legacyStages) {
	if (Array.isArray(workflows) && workflows.length > 0) {
		const normalized = workflows.map((w, idx) => normalizeWorkflow(w, idx === 0));
		if (!normalized.some((w) => w.isDefault)) {
			normalized[0].isDefault = true;
		}
		return normalized;
	}
	if (Array.isArray(legacyStages) && legacyStages.length > 0) {
		return [
			{
				id: DEFAULT_WORKFLOW_ID,
				name: DEFAULT_WORKFLOW_NAME,
				isDefault: true,
				stages: normalizeStages(legacyStages),
			},
		];
	}
	return [createDefaultWorkflow()];
}
