// Domain: Separate docs repo — THE seam (one function per file; see
// `./docsRepo.js` for the barrel).
import path from "node:path";
import { resolveDocsRepoLocalPath } from "./resolveDocsRepoLocalPath.js";

/***
 * MARK: resolveKainbainHome
 * @description THE seam: the directory that serves as a project's KainBain
 *   home — the docs-repo checkout (`docsRepo.localPath`) when the project
 *   has one, else the project working directory `cwd`. Every docs/state
 *   resolver (`resolveDocsPath`, `resolveKainbainDir`, …) maps through here,
 *   so flipping a project onto a docs repo moves docs + state in one place.
 *   Null when neither is known. Never throws.
 * @example resolveKainbainHome('/repo', {}) => '/repo'
 * @example resolveKainbainHome('/repo', { docsRepo: { localPath: '/srv/kb/proj' } }) => '/srv/kb/proj'
 * @param {string} cwd - Project working directory (code home).
 * @param {Object} [project] - Project record (may carry `docsRepo`).
 * @returns {string|null}
 ***/
export function resolveKainbainHome(cwd, project) {
	const localPath = resolveDocsRepoLocalPath(project);
	if (localPath) return localPath;
	if (!cwd || typeof cwd !== "string" || !cwd.trim()) return null;
	return path.resolve(cwd);
}
