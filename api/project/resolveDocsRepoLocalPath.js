// Domain: Separate docs repo — local checkout path resolver (one function
// per file; see `./docsRepo.js` for the barrel).
import path from "node:path";
import { isValidDocsRepoLocalPath } from "./isValidDocsRepoLocalPath.js";

/***
 * MARK: resolveDocsRepoLocalPath
 * @description The absolute local checkout path of a project's docs repo,
 *   or null when the project has none (legacy) or the stored path is not a
 *   valid absolute path.
 * @example resolveDocsRepoLocalPath({ docsRepo: { localPath: '/srv/kb/proj' } }) => '/srv/kb/proj'
 * @param {Object} [project]
 * @returns {string|null}
 ***/
export function resolveDocsRepoLocalPath(project) {
	const repo = project?.docsRepo;
	if (!repo || typeof repo !== "object" || Array.isArray(repo)) return null;
	if (!isValidDocsRepoLocalPath(repo.localPath)) return null;
	return path.resolve(repo.localPath.trim());
}
