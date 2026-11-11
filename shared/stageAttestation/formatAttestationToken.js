/***
 * MARK: formatAttestationToken
 * @description Formats the single-line attestation token appended to a
 *   stage-history prose entry. History persists as prose markdown (see
 *   `saveTaskMarkdown`), so structured entry fields alone would not survive
 *   a reload — this token is the durable copy, and `parseAttestationToken`
 *   recovers it. A null/blank commit SHA renders as `none` (clean-tree
 *   stages attest the run with no commit). Fails loud on blank identity
 *   fields — a partial token would attest nothing.
 * @example formatAttestationToken({ taskId: 't', stageId: '5', configHash: 'sha256:abc', commitSha: '0123' }) => '[attestation task=t stage=5 config=sha256:abc commit=0123]'
 * @param {Object} fields - Labelled inputs.
 * @param {string} fields.taskId - Attested task id.
 * @param {string} fields.stageId - Attested stage id.
 * @param {string} fields.configHash - `sha256:<hex>` config hash.
 * @param {string|null} [fields.commitSha] - Full commit SHA, or null when the tree was clean.
 * @returns {string} Single-line `[attestation …]` token.
 ***/
export function formatAttestationToken(fields) {
	const taskId = fields?.taskId;
	const stageId = fields?.stageId;
	const configHash = fields?.configHash;
	if (typeof taskId !== "string" || !taskId.trim()) {
		throw new Error("formatAttestationToken requires a taskId");
	}
	if (typeof stageId !== "string" || !stageId.trim()) {
		throw new Error("formatAttestationToken requires a stageId");
	}
	if (typeof configHash !== "string" || !configHash.trim()) {
		throw new Error("formatAttestationToken requires a configHash");
	}
	const commit =
		typeof fields?.commitSha === "string" && fields.commitSha.trim()
			? fields.commitSha.trim()
			: "none";
	return `[attestation task=${taskId.trim()} stage=${stageId.trim()} config=${configHash.trim()} commit=${commit}]`;
}
