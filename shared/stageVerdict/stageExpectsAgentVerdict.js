import { normalizeStageType } from "./normalizeStageType.js";

/***
 * MARK: stageExpectsAgentVerdict
 * @description The single predicate for "this stage is an agent stage that
 *   may render a verdict". Only the normalized `agent` type qualifies;
 *   human, ci, deploy, and merge stages return false. Legacy types are
 *   normalized first (`review` -> human, `script` -> ci, unknown/empty ->
 *   agent), so this guard can never disagree with `normalizeStageType` and
 *   a legacy `review`/`script` stage can never be treated as agent-like by a
 *   verdict gate. This is what keeps the verdict/changes check off human and
 *   CI stages.
 * @example stageExpectsAgentVerdict({ type: "agent" }) => true
 * @example stageExpectsAgentVerdict({ type: "human" }) => false
 * @example stageExpectsAgentVerdict({ type: "review" }) => false
 * @example stageExpectsAgentVerdict({ type: "script" }) => false
 * @example stageExpectsAgentVerdict({}) => true
 * @param {Object} [stage] - Stage entity (any object carrying `type`).
 * @returns {boolean} True only for normalized agent stages.
 ***/
export function stageExpectsAgentVerdict(stage) {
	return normalizeStageType(stage?.type) === "agent";
}
