import { FIELD_SEP, MAX_BODY_CHARS, RECORD_SEP } from "./changelogLimits.js";

/***
 * MARK: parseGitLog
 * @description Parses NUL/RS-delimited `git log` output into changelog
 *   entries, newest-first as emitted. Bodies are capped at MAX_BODY_CHARS
 *   with a `bodyTruncated` flag; malformed records (too few fields, blank
 *   SHA) are skipped rather than failing the whole bake, so one odd commit
 *   can never empty the dialog.
 * @example parseGitLog(raw) => [{ sha, shortSha, subject, body, bodyTruncated, author, authorEmail, date }]
 * @param {string} raw - Raw stdout from the git log invocation.
 * @returns {Array<Object>} Parsed entries, newest first.
 ***/
export function parseGitLog(raw) {
	if (typeof raw !== "string" || raw.length === 0) return [];
	const entries = [];
	for (const record of raw.split(RECORD_SEP)) {
		if (!record.trim()) continue;
		const fields = record.split(FIELD_SEP);
		if (fields.length < 7) continue;
		const [sha, shortSha, author, authorEmail, date, subject, ...bodyParts] = fields;
		if (!sha || !sha.trim()) continue;
		// A body holding a literal NUL is near-impossible (git truncates
		// messages at NUL), but rejoin defensively so extra separators never
		// drop body text.
		const body = bodyParts.join(FIELD_SEP).replace(/^\n/, "").replace(/\s+$/, "");
		const bodyTruncated = body.length > MAX_BODY_CHARS;
		entries.push({
			sha: sha.trim(),
			shortSha: (shortSha || "").trim(),
			subject: (subject || "").trim(),
			body: bodyTruncated ? body.slice(0, MAX_BODY_CHARS) : body,
			bodyTruncated,
			author: (author || "").trim(),
			authorEmail: (authorEmail || "").trim(),
			date: (date || "").trim(),
		});
	}
	return entries;
}
