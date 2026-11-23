// Domain: Separate docs repo — stealth guard (one function per file; see
// `./docsRepo.js` for the barrel).
import fs from "node:fs";
import path from "node:path";
import { redactCredentials } from "../git/validation.js";

/***
 * MARK: assertDocsRepoSeparateFromMain
 * @description Stealth guard for the write path: the docs repo must be a
 *   DIFFERENT home from the main project repo. `localPath` may not equal or
 *   live inside the main checkout (nor wrap it) — otherwise `project.json`,
 *   the docs skeleton and task docs would be written into the main repo,
 *   defeating the feature and possibly committing them to a shared remote.
 *   `url` may not equal the main repo's remote — otherwise docs task branches
 *   would be pushed to the shared main remote. Symlinked aliases are resolved
 *   best-effort (realpath) so a symlinked cwd cannot sneak a nested path past
 *   the lexical check. Throws 400 `INVALID_DOCS_REPO_PATH` /
 *   `INVALID_DOCS_REPO_URL`; a no-op when inputs are absent, so callers can
 *   pass values straight through.
 * @example assertDocsRepoSeparateFromMain({ docsRepo: { localPath: '/srv/kb' }, projectCwd: '/repo', mainRepoUrls: ['https://h/app.git'] }) // ok — does not throw
 * @param {Object} opts
 * @param {Object} opts.docsRepo - Normalized docsRepo ({ url?, localPath? }).
 * @param {string} [opts.projectCwd] - Main checkout path.
 * @param {string[]} [opts.mainRepoUrls] - Candidate main-repo remote URLs (raw or redacted).
 * @returns {void}
 ***/
export function assertDocsRepoSeparateFromMain({ docsRepo, projectCwd = null, mainRepoUrls = [] } = {}) {
	const repo = docsRepo && typeof docsRepo === "object" && !Array.isArray(docsRepo) ? docsRepo : null;
	if (!repo) return;
	if (repo.localPath && typeof projectCwd === "string" && projectCwd.trim()) {
		const docsLexical = path.resolve(repo.localPath.trim());
		const mainLexical = path.resolve(projectCwd.trim());
		const pairs = [
			[docsLexical, mainLexical],
			// Compare real paths too, so a symlinked cwd or a symlink inside
			// localPath cannot alias past the lexical check. realpath needs the
			// path to exist, so resolve the deepest existing ancestor and
			// re-append the rest (the docs checkout often does not exist yet
			// at validation time).
			[resolveRealPathBestEffort(docsLexical), resolveRealPathBestEffort(mainLexical)],
		];
		for (const [docsPath, mainPath] of pairs) {
			// path.relative handles the root edge case ("/" + sep is not a
			// prefix of "/repo"): a relative result that is empty or does not
			// climb out with ".." means one path contains the other.
			const docsInMain = path.relative(mainPath, docsPath);
			const mainInDocs = path.relative(docsPath, mainPath);
			const contains = (rel) => rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
			const overlapping = contains(docsInMain) || contains(mainInDocs);
			if (overlapping) {
				const err = new Error(
					`docsRepo.localPath '${docsPath}' must live OUTSIDE the main project repo '${mainPath}' — pointing the docs repo at (or inside) the main repo would write KainBain docs/state into it`,
				);
				err.statusCode = 400;
				err.code = "INVALID_DOCS_REPO_PATH";
				throw err;
			}
		}
	}
	if (repo.url && Array.isArray(mainRepoUrls)) {
		const docsUrl = normalizeRepoUrlForCompare(repo.url);
		for (const candidate of mainRepoUrls) {
			if (typeof candidate !== "string" || !candidate.trim()) continue;
			if (normalizeRepoUrlForCompare(candidate) === docsUrl) {
				const err = new Error(
					"docsRepo.url must point at a DIFFERENT repository than the main project repo — the same URL would push KainBain docs branches to the shared main remote",
				);
				err.statusCode = 400;
				err.code = "INVALID_DOCS_REPO_URL";
				throw err;
			}
		}
	}
}

// Local helper (arrow constant, not a top-level function): resolves symlinks
// for the deepest EXISTING ancestor of `p` and re-appends the missing tail, so
// a not-yet-created docs checkout behind a symlinked parent still resolves.
const resolveRealPathBestEffort = (p) => {
	let rest = "";
	let current = p;
	for (;;) {
		try {
			/* eslint-disable security/detect-non-literal-fs-filename */
			return rest ? path.join(fs.realpathSync(current), rest) : fs.realpathSync(current);
			/* eslint-enable security/detect-non-literal-fs-filename */
		} catch {
			// Not resolvable here — climb one level and retry.
		}
		const parent = path.dirname(current);
		if (parent === current) return p; // filesystem root: give up lexically
		rest = rest ? path.join(path.basename(current), rest) : path.basename(current);
		current = parent;
	}
};

// Local helper (arrow constant, not a top-level function): compares repo URLs
// loosely enough to catch trailing-slash / `.git`-suffix spellings of the same
// remote, while staying credential-insensitive via redactCredentials.
const normalizeRepoUrlForCompare = (url) =>
	redactCredentials(String(url).trim()).replace(/\/+$/, "").replace(/\.git$/i, "");
