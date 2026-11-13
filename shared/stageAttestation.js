/***
 * MARK: stageAttestation (shared)
 * @description Single source of truth for the stage+config attestation
 *   contract, shared verbatim by the backend and the Runner (see
 *   shared/stageAttestation/index.js for the ownership note). One file per
 *   function plus this single front file, following the
 *   shared/toolLogFormat layout.
 ***/
export * from "./stageAttestation/index.js";
