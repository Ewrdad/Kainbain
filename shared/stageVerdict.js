/***
 * MARK: stageVerdict (shared)
 * @description Single source of truth for the agent stage-verdict contract,
 *   shared verbatim by the backend and the Runner (see
 *   shared/stageVerdict/index.js for the ownership note). One file per
 *   function plus this barrel, following the shared/toolLogFormat layout.
 ***/
export * from "./stageVerdict/index.js";
