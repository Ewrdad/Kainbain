// Domain: Separate docs repo — safe-to-expose URL accessor (one function
// per file; see `./docsRepo.js` for the barrel).
import { redactCredentials } from "../git/validation.js";
import { isValidDocsRepoUrl } from "./isValidDocsRepoUrl.js";

/***
 * MARK: docsRepoUrlFor
 * @description The docs-repo remote URL as safe to expose (API responses,
 *   claim payloads, logs): the stored value is already credential-redacted
 *   at write time, and this re-redacts defensively so a hand-edited
 *   project.json can never leak a token through the API. Null when unset.
 * @example docsRepoUrlFor({ docsRepo: { url: 'https://git.example.com/me/kb.git' } }) => 'https://git.example.com/me/kb.git'
 * @param {Object} [project]
 * @returns {string|null}
 ***/
export function docsRepoUrlFor(project) {
	const repo = project?.docsRepo;
	if (!repo || typeof repo !== "object" || Array.isArray(repo)) return null;
	if (!isValidDocsRepoUrl(repo.url)) return null;
	return redactCredentials(repo.url.trim());
}
