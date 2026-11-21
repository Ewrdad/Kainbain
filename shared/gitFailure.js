/***
 * MARK: gitFailure (shared)
 * @description Single source of truth for the runner commit/hook-failure
 *   contract, shared verbatim by the runner, the backend, and the UI (see
 *   shared/gitFailure/index.js for the ownership note). One file per
 *   function plus this single front file, following the
 *   shared/stageVerdict layout.
 ***/
export * from "./gitFailure/index.js";
