import { attestationHistoryFields } from "./attestationHistoryFields.js";
import { formatAttestationToken } from "./formatAttestationToken.js";

/***
 * MARK: attachAttestationToEntry
 * @description Attests a live stage-history entry in place: assigns the
 *   structured fields and appends the durable prose token to its action
 *   line. Idempotent — an already-attested entry is left untouched (never a
 *   doubled token). Skips quietly when there is no config hash (the caller
 *   keeps its plain entry, the pre-feature posture); throws only when the
 *   entry itself is not an object with a string action (a programming bug).
 * @example attachAttestationToEntry({ action: 'Auto-committed' }, { taskId: 't', stageId: '5', configHash: 'sha256:abc', commitSha: null }) => true
 * @param {Object} entry - History entry to attest (mutated in place).
 * @param {Object} fields - Attestation fields (see attestationHistoryFields).
 * @returns {boolean} True when the entry was attested, false when skipped.
 ***/
export function attachAttestationToEntry(entry, fields) {
	if (!entry || typeof entry !== "object" || typeof entry.action !== "string") {
		throw new Error("attachAttestationToEntry requires a history entry with a string action");
	}
	if (typeof entry.configHash === "string" && entry.configHash.trim()) {
		return false;
	}
	if (typeof fields?.configHash !== "string" || !fields.configHash.trim()) {
		return false;
	}
	const structured = attestationHistoryFields(fields);
	Object.assign(entry, structured);
	entry.action = `${entry.action} ${formatAttestationToken({ ...fields, commitSha: structured.commitSha })}`;
	return true;
}
