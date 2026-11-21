/***
 * MARK: gitFailure
 * @description Single front file for the shared commit/hook-failure
 *   contract: the kind/phase taxonomy, the hook-output parser, the
 *   transport envelope builder, the determinism predicate, and the
 *   streak signature. The runner (`runner/project.js`,
 *   `runner/daemon.js`) classifies failures with this module and reports
 *   the envelope on `complete({ outcome: "failed", gitFailure })`; the
 *   backend (`api/flow/execution/applyRunnerReport.js`) persists it as
 *   `lastError.gitDiagnostics` through the existing failure pipeline; the
 *   UI (`frontend/src/components/tasks/GitFailureDetails.jsx`) renders it.
 *   No layer invents its own field names. The runner bundle ships shared/
 *   next to runner/ (see `runner/daemon.js`), so
 *   `../shared/gitFailure.js` resolves both in the repo and in every
 *   deployed layout — the same copy the backend executes.
 ***/
export { GIT_FAILURE_KINDS, GIT_FAILURE_PHASES, GIT_FAILURE_LIMITS, GIT_FAILURE_PARK_AFTER } from "./gitFailureKinds.js";
export { parseHookFailure } from "./parseHookFailure.js";
export { summarizeGitFailure } from "./summarizeGitFailure.js";
export { buildGitFailureDetails } from "./buildGitFailureDetails.js";
export { isDeterministicGitFailure } from "./isDeterministicGitFailure.js";
export { gitFailureSignature } from "./gitFailureSignature.js";
