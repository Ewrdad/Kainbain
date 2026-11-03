/***
 * MARK: buildChangelogGitFormat
 * @description Builds the `git log --format=` value both the deploy-time baker
 *   (`scripts/generate-changelog.mjs`) and the serve-time live fallback
 *   (`api/deployManager.js`) pass to git, so the emitted fields can never
 *   drift from the order `parseGitLog` reads (`%H` sha, `%h` short, `%an`
 *   author, `%ae` email, `%aI` date, `%s` subject, `%b` body).
 *
 *   The separators are git `%x00`/`%x1e` escapes, never the literal FIELD_SEP
 *   / RECORD_SEP characters: both callers spawn git via an argv array (no
 *   shell, per the `api/git.js` no-shell rule), and an argv string cannot
 *   carry a NUL byte — a literal FIELD_SEP would truncate the `--format`
 *   argument at the first field and bake an empty history. Git decodes the
 *   escapes back to FIELD_SEP / RECORD_SEP in its stdout, which is what
 *   `parseGitLog` splits on.
 * @example buildChangelogGitFormat() => '%H%x00%h%x00%an%x00%ae%x00%aI%x00%s%x00%b%x1e'
 * @returns {string} The `--format=` value (without the `--format=` prefix).
 ***/
export function buildChangelogGitFormat() {
	return ["%H", "%h", "%an", "%ae", "%aI", "%s", "%b"].join("%x00") + "%x1e";
}
