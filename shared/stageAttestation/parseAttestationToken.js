const TOKEN_PATTERN =
	/\[attestation\s+task=([^\s\]]+)\s+stage=([^\s\]]+)\s+config=([^\s\]]+)\s+commit=([^\s\]]+)\]/;

/***
 * MARK: parseAttestationToken
 * @description Recovers attestation fields from a stage-history prose entry —
 *   the reload path for the durable token copy (structured fields do not
 *   survive `task.md` persistence). Total — entries predating the feature
 *   yield null, never a throw. A `commit=none` token parses to a null
 *   `commitSha` (clean-tree attestation, still proof the stage ran).
 * @example parseAttestationToken("Auto-committed [attestation task=t stage=5 config=sha256:abc commit=none]") => { taskId: 't', stageId: '5', configHash: 'sha256:abc', commitSha: null }
 * @param {string|null} [action] - History entry action line.
 * @returns {{taskId: string, stageId: string, configHash: string, commitSha: string|null}|null} Parsed fields.
 ***/
export function parseAttestationToken(action) {
	if (typeof action !== "string" || !action) return null;
	const match = action.match(TOKEN_PATTERN);
	if (!match) return null;
	return {
		taskId: match[1],
		stageId: match[2],
		configHash: match[3],
		commitSha: match[4] === "none" ? null : match[4],
	};
}
