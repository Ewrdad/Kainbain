import { formatAttestationTrailers } from "./formatAttestationTrailers.js";

/***
 * MARK: appendAttestationTrailers
 * @description Appends the attestation trailer block to a commit body: after
 *   a blank line when a body exists, or as the whole body when the commit
 *   would otherwise be subject-only (prompt-less stages still attest). The
 *   existing body is kept verbatim — callers truncate first, then append, so
 *   the proof can never be truncated away.
 * @example appendAttestationTrailers('prompt', { taskId: 't', stageId: '5', configHash: 'sha256:abc' }) => 'prompt\n\nKainBain-Task: t\nKainBain-Stage: 5\nKainBain-Config-Hash: sha256:abc'
 * @param {string|null} [body] - Existing commit body, if any.
 * @param {Object} fields - Trailer fields (see formatAttestationTrailers).
 * @returns {string} Body carrying the trailer block.
 ***/
export function appendAttestationTrailers(body, fields) {
	const block = formatAttestationTrailers(fields);
	if (typeof body === "string" && body.trim()) return `${body}\n\n${block}`;
	return block;
}
