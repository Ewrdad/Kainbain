const TRAILER_KEYS = [
	["KainBain-Task", "taskId"],
	["KainBain-Stage", "stageId"],
	["KainBain-Config-Hash", "configHash"],
];

/***
 * MARK: parseAttestationTrailers
 * @description Recovers attestation fields from a commit body
 *   (`git log --format=%B`): the last non-empty occurrence of each trailer
 *   key wins, surrounding prose and CRLF are tolerated. Total — absent
 *   trailers (commits predating the feature, or from old Runners) yield
 *   nulls, never a throw.
 * @example parseAttestationTrailers('body\n\nKainBain-Task: t\nKainBain-Stage: 5\nKainBain-Config-Hash: sha256:abc\n') => { taskId: 't', stageId: '5', configHash: 'sha256:abc' }
 * @param {string|null} [body] - Full commit message body.
 * @returns {{taskId: string|null, stageId: string|null, configHash: string|null}} Parsed fields.
 ***/
export function parseAttestationTrailers(body) {
	const found = { taskId: null, stageId: null, configHash: null };
	if (typeof body !== "string" || !body) return found;
	for (const line of body.split("\n")) {
		const match = line.match(
			/^(KainBain-Task|KainBain-Stage|KainBain-Config-Hash):\s*(.*?)\s*$/,
		);
		if (!match) continue;
		const value = (match[2] || "").trim();
		if (!value) continue;
		for (const [key, field] of TRAILER_KEYS) {
			if (match[1] === key) found[field] = value;
		}
	}
	return found;
}
