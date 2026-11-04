/***
 * MARK: stageVerdict
 * @description Barrel for the shared agent stage-verdict contract: the
 *   stage-type normalizer, the agent-only verdict guard, the verdict-block
 *   parser, and the single pass/fail decision helper. The backend
 *   (`api/agent/verdictContract.js`, `api/project/stageNormalizers.js`)
 *   re-exports this barrel so every existing import keeps working; the
 *   Runner (`runner/daemon.js`) and the backend double-check
 *   (`api/flow/execution/applyRunnerReport.js`) import the decision helper
 *   from here so the embedded and remote paths cannot drift again. The
 *   Runner bundle ships shared/ next to runner/ (see `runner/daemon.js`),
 *   so `../shared/stageVerdict.js` resolves both in the repo and in every
 *   deployed layout — the same copy the backend executes.
 ***/
export { normalizeStageType } from "./normalizeStageType.js";
export { stageExpectsAgentVerdict } from "./stageExpectsAgentVerdict.js";
export { parseStageVerdict } from "./parseStageVerdict.js";
export { decideAgentStageVerdict } from "./decideAgentStageVerdict.js";
