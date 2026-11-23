// Domain: Separate docs repo — strict remote-URL validator (one function per
// file; see `./docsRepo.js` for the barrel).
import { DOCS_REPO_URL_MAX_LENGTH } from "./docsRepoConstants.js";

/***
 * MARK: isValidDocsRepoUrl
 * @description Strict validator for a docs-repo remote URL: a trimmed
 *   1–2048 char string with no whitespace/control characters that looks like
 *   a git remote (`scheme://...`, scp-like `git@host:path`, or a local/
 *   `file://` path). Anything else is rejected with a 400 on write and
 *   degrades to absent on load.
 * @example isValidDocsRepoUrl('https://git.example.com/me/proj-kb.git') => true
 * @example isValidDocsRepoUrl('git@github.com:me/proj-kb.git') => true
 * @example isValidDocsRepoUrl('not a url') => false
 * @param {unknown} value
 * @returns {boolean}
 ***/
export function isValidDocsRepoUrl(value) {
	if (typeof value !== "string") return false;
	const url = value.trim();
	if (url.length === 0 || url.length > DOCS_REPO_URL_MAX_LENGTH) return false;
	if (/\s/.test(url) || /[\x00-\x1f\x7f]/.test(url)) return false;
	if (url.includes("://")) return true; // https://, ssh://, file://, ...
	if (/^[^/@\s]+@[^/@\s]+:.+/.test(url)) return true; // scp-like git@host:path
	if (url.startsWith("/")) return true; // local absolute path used as remote
	return false;
}
