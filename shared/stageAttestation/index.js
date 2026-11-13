/***
 * MARK: stageAttestation
 * @description Single front file for the shared stage+config attestation
 *   contract: canonical bytes, config hashing, commit-trailer and
 *   history-token carriage, and the history↔commit link check. The backend
 *   (embedded finalize, Runner dispatch/completion) and the Runner import
 *   these same functions so both paths attest byte-identically — the
 *   compliance claim dies if the two sides hash differently. The Runner
 *   bundle ships shared/ next to runner/ (see `runner/daemon.js`), so
 *   `../shared/stageAttestation.js` resolves both in the repo and in every
 *   deployed layout — the same copy the backend executes. Backend + Runner
 *   only: `hashConfig` imports `node:crypto`, which never loads in a
 *   browser, so frontend code must not import this module.
 ***/
export { canonicalize } from "./canonicalize.js";
export { hashConfig } from "./hashConfig.js";
export {
	buildStageConfigInput,
	STAGE_ATTESTATION_OMITTED_KEYS,
} from "./buildStageConfigInput.js";
export { hashStageConfig } from "./hashStageConfig.js";
export { isWellFormedConfigHash } from "./isWellFormedConfigHash.js";
export { formatAttestationTrailers } from "./formatAttestationTrailers.js";
export { parseAttestationTrailers } from "./parseAttestationTrailers.js";
export { appendAttestationTrailers } from "./appendAttestationTrailers.js";
export { formatAttestationToken } from "./formatAttestationToken.js";
export { parseAttestationToken } from "./parseAttestationToken.js";
export { attestationHistoryFields } from "./attestationHistoryFields.js";
export { attachAttestationToEntry } from "./attachAttestationToEntry.js";
export { verifyAttestationLink } from "./verifyAttestationLink.js";
