// Domain: Separate docs repo — active-docs-repo predicate (one function per
// file; see `./docsRepo.js` for the barrel).
import { isValidDocsRepoUrl } from "./isValidDocsRepoUrl.js";
import { isValidDocsRepoLocalPath } from "./isValidDocsRepoLocalPath.js";

/***
 * MARK: hasDocsRepo
 * @description Whether a project record carries an active separate docs
 *   repo: `docsRepo` must be an object with a valid `url` or a valid
 *   `localPath`. Legacy projects (no `docsRepo`) and garbage degrade to
 *   false — never throws.
 * @example hasDocsRepo({ docsRepo: { url: 'https://git.example.com/me/kb.git' } }) => true
 * @example hasDocsRepo({}) => false
 * @param {Object} [project]
 * @returns {boolean}
 ***/
export function hasDocsRepo(project) {
	const repo = project?.docsRepo;
	if (!repo || typeof repo !== "object" || Array.isArray(repo)) return false;
	return isValidDocsRepoUrl(repo.url) || isValidDocsRepoLocalPath(repo.localPath);
}
