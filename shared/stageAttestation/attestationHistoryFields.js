/***
 * MARK: attestationHistoryFields
 * @description Builds the structured attestation fields attached to a live
 *   stage-history entry (`configHash`, `commitSha`, plus ids so consumers
 *   need not parse prose — the `runnerId` precedent in
 *   `executionLedger.js`). `commitSha` is always present and explicit: a
 *   string when the stage committed, null when the tree was clean (an
 *   attested entry without the key must never exist, so absence of the
 *   whole attestation keeps meaning "predates this feature"). Identity ids
 *   are blank-safe; the config hash is required.
 * @example attestationHistoryFields({ taskId: 't', stageId: '5', configHash: 'sha256:abc', commitSha: null }) => { taskId: 't', stageId: '5', configHash: 'sha256:abc', commitSha: null }
 * @param {Object} fields - Labelled inputs.
 * @param {string} [fields.taskId] - Attested task id.
 * @param {string} [fields.stageId] - Attested stage id.
 * @param {string} fields.configHash - `sha256:<hex>` config hash.
 * @param {string|null} [fields.commitSha] - Full commit SHA, or null when the tree was clean.
 * @returns {Object} Structured entry fields.
 ***/
export function attestationHistoryFields(fields) {
	const configHash = fields?.configHash;
	if (typeof configHash !== "string" || !configHash.trim()) {
		throw new Error("attestationHistoryFields requires a configHash");
	}
	const out = { configHash: configHash.trim() };
	if (typeof fields?.taskId === "string" && fields.taskId.trim()) {
		out.taskId = fields.taskId.trim();
	}
	if (typeof fields?.stageId === "string" && fields.stageId.trim()) {
		out.stageId = fields.stageId.trim();
	}
	out.commitSha =
		typeof fields?.commitSha === "string" && fields.commitSha.trim()
			? fields.commitSha.trim()
			: null;
	// Key order is cosmetic (entries serialize through JSON), but stable
	// order keeps snapshots readable: ids first, then the two hashes.
	return {
		...(out.taskId !== undefined ? { taskId: out.taskId } : {}),
		...(out.stageId !== undefined ? { stageId: out.stageId } : {}),
		configHash: out.configHash,
		commitSha: out.commitSha,
	};
}
