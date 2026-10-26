import { v4 as uuidv4 } from "uuid";
import { DEFAULT_STAGES, normalizeStages } from "./stageNormalizers.js";

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
 * MARK: normalizeWorkflow
 * @description Normalizes a single workflow entity with valid id, name, isDefault, and normalized stages.
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
	return {
		id,
		name,
		isDefault,
		stages,
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
