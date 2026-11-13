/***
 * MARK: STAGE_ATTESTATION_OMITTED_KEYS
 * @description Stage-definition keys excluded from the attested hash input:
 *   `name` is a display label (the stable `id` binds identity, so renames
 *   must not void an existing attestation) and `paused` is an enable flag
 *   (every pause/unpause cycle would otherwise void proof of identical
 *   behavior). Every other stage key — including settings added tomorrow —
 *   is hashed, so the attestation always covers the whole stage definition.
 * @example STAGE_ATTESTATION_OMITTED_KEYS.has('name') => true
 ***/
export const STAGE_ATTESTATION_OMITTED_KEYS = new Set(["name", "paused"]);

/***
 * MARK: buildStageConfigInput
 * @description Builds the exact object the stage+config hash covers:
 *   `{ taskId, goal, workflowId, stage }`. The task side is an allowlist
 *   (tasks carry volatile runtime state — status, branches, SHAs, history —
 *   that must never enter the hash); the stage side is the whole stage
 *   definition minus `STAGE_ATTESTATION_OMITTED_KEYS`, so a setting added
 *   tomorrow is covered without a code change. Output is JSON-sanitized
 *   (a round-trip that drops `undefined` exactly as the Runner's HTTP fetch
 *   does), which is what makes backend and Runner inputs byte-identical.
 *   Total: unusable input (missing task/stage, blank ids, circular values)
 *   returns null instead of throwing — attestation is audit, and a stage
 *   must never fail because its proof could not be built.
 * @example buildStageConfigInput({ task: { id: 't', goal: 'g' }, stage: { id: '5', type: 'agent' } }) => { taskId: 't', goal: 'g', workflowId: null, stage: { id: '5', type: 'agent' } }
 * @param {Object} [input] - Labelled inputs.
 * @param {Object} [input.task] - Task entity (reads `id`, `goal`, `workflowId`).
 * @param {Object} [input.stage] - Resolved stage definition.
 * @returns {Object|null} Sanitized plain-JSON hash input, or null.
 ***/
export function buildStageConfigInput(input) {
	const task = input?.task;
	const stage = input?.stage;
	if (!task || typeof task !== "object" || !stage || typeof stage !== "object") {
		return null;
	}
	if (typeof task.id !== "string" || !task.id.trim()) return null;
	if (typeof stage.id !== "string" || !stage.id.trim()) return null;
	const stageInput = {};
	for (const key of Object.keys(stage)) {
		if (STAGE_ATTESTATION_OMITTED_KEYS.has(key)) continue;
		stageInput[key] = stage[key];
	}
	const built = {
		taskId: task.id,
		goal: typeof task.goal === "string" ? task.goal : "",
		workflowId:
			typeof task.workflowId === "string" && task.workflowId.trim()
				? task.workflowId
				: null,
		stage: stageInput,
	};
	try {
		const sanitized = JSON.parse(JSON.stringify(built));
		if (!sanitized || typeof sanitized !== "object") return null;
		return sanitized;
	} catch {
		return null;
	}
}
