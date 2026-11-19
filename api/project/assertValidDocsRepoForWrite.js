// Domain: Separate docs repo — strict write-path validation (one function
// per file; see `./docsRepo.js` for the barrel).
import path from "node:path";
import { redactCredentials } from "../git/validation.js";
import { DOCS_REPO_BRANCH_MODE_SYNCED } from "./docsRepoConstants.js";
import { isValidDocsRepoUrl } from "./isValidDocsRepoUrl.js";
import { isValidDocsRepoLocalPath } from "./isValidDocsRepoLocalPath.js";

/***
 * MARK: assertValidDocsRepoForWrite
 * @description Strict write-path validation for `docsRepo`: null/undefined or
 *   an object with neither a valid `url` nor a valid `localPath` clears the
 *   setting (returns `undefined`); a valid object returns the normalized,
 *   credential-redacted form (`branchMode` fixed to `synced` in v1); anything
 *   else throws a 400 `INVALID_DOCS_REPO_URL` / `INVALID_DOCS_REPO_PATH`
 *   without touching the project.
 * @example assertValidDocsRepoForWrite({ url: 'https://git.example.com/me/kb.git', localPath: '/srv/kb/proj' }) => { url: 'https://git.example.com/me/kb.git', localPath: '/srv/kb/proj', branchMode: 'synced' }
 * @param {unknown} value
 * @returns {{url?: string, localPath?: string, branchMode: string}|undefined}
 ***/
export function assertValidDocsRepoForWrite(value) {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "object" || Array.isArray(value)) {
		const err = new Error("docsRepo must be an object with 'url' and/or 'localPath', or null to disable");
		err.statusCode = 400;
		err.code = "INVALID_DOCS_REPO";
		throw err;
	}
	const urlRaw = value.url;
	const pathRaw = value.localPath;
	const hasUrl = typeof urlRaw === "string" && !!urlRaw.trim();
	const hasPath = typeof pathRaw === "string" && !!pathRaw.trim();
	if (!hasUrl && !hasPath) return undefined; // blank clears
	if (hasUrl && !isValidDocsRepoUrl(urlRaw)) {
		const err = new Error(
			"docsRepo.url must be a git remote URL (https://…, ssh://…, git@host:path, file://… or an absolute local path), max 2048 chars, no whitespace",
		);
		err.statusCode = 400;
		err.code = "INVALID_DOCS_REPO_URL";
		throw err;
	}
	if (hasPath && !isValidDocsRepoLocalPath(pathRaw)) {
		const err = new Error(
			"docsRepo.localPath must be an absolute path (max 4096 chars) to the docs-repo checkout on this host",
		);
		err.statusCode = 400;
		err.code = "INVALID_DOCS_REPO_PATH";
		throw err;
	}
	const out = { branchMode: DOCS_REPO_BRANCH_MODE_SYNCED };
	if (hasUrl) out.url = redactCredentials(urlRaw.trim());
	if (hasPath) out.localPath = path.resolve(pathRaw.trim());
	return out;
}
