// Domain: Separate docs repo — strict local-checkout-path validator
// (one function per file; see `./docsRepo.js` for the barrel).
import path from "node:path";
import { DOCS_REPO_PATH_MAX_LENGTH } from "./docsRepoConstants.js";

/***
 * MARK: isValidDocsRepoLocalPath
 * @description Strict validator for the docs-repo local checkout path: a
 *   trimmed 1–4096 char ABSOLUTE path (relative paths are rejected — the
 *   backend resolves against its own cwd, never the client's).
 * @example isValidDocsRepoLocalPath('/srv/kainbain-docs/my-proj') => true
 * @example isValidDocsRepoLocalPath('relative/path') => false
 * @param {unknown} value
 * @returns {boolean}
 ***/
export function isValidDocsRepoLocalPath(value) {
	if (typeof value !== "string") return false;
	const p = value.trim();
	if (p.length === 0 || p.length > DOCS_REPO_PATH_MAX_LENGTH) return false;
	if (!path.isAbsolute(p)) return false;
	return true;
}
