/***
 * MARK: formatAttestationTrailers
 * @description Formats the machine-parseable git-trailer block a wrap-up
 *   commit carries: task id, stage id, and config hash. Subjects stay
 *   untouched (the changelog filter reads subjects only), and the block is
 *   appended AFTER body truncation so it can never be truncated away. Fails
 *   loud on blank fields — a partial block would attest nothing.
 * @example formatAttestationTrailers({ taskId: 't', stageId: '5', configHash: 'sha256:abc' }) => 'KainBain-Task: t\nKainBain-Stage: 5\nKainBain-Config-Hash: sha256:abc'
 * @param {Object} fields - Labelled inputs.
 * @param {string} fields.taskId - Attested task id.
 * @param {string} fields.stageId - Attested stage id.
 * @param {string} fields.configHash - `sha256:<hex>` config hash.
 * @returns {string} Three-line trailer block.
 ***/
export function formatAttestationTrailers(fields) {
	const taskId = fields?.taskId;
	const stageId = fields?.stageId;
	const configHash = fields?.configHash;
	if (typeof taskId !== "string" || !taskId.trim()) {
		throw new Error("formatAttestationTrailers requires a taskId");
	}
	if (typeof stageId !== "string" || !stageId.trim()) {
		throw new Error("formatAttestationTrailers requires a stageId");
	}
	if (typeof configHash !== "string" || !configHash.trim()) {
		throw new Error("formatAttestationTrailers requires a configHash");
	}
	return [
		`KainBain-Task: ${taskId.trim()}`,
		`KainBain-Stage: ${stageId.trim()}`,
		`KainBain-Config-Hash: ${configHash.trim()}`,
	].join("\n");
}
