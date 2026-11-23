// Domain: Docs-repo pointers — pointer lookup (one function per file; see
// `./docsRepoPointer.js` for the barrel).
import path from "node:path";
import { readDocsRepoPointers } from "./readDocsRepoPointers.js";

/***
 * MARK: docsRepoPointerFor
 * @description Looks up the docs-repo checkout path registered for a main
 *   checkout, or null when none. Never throws.
 * @example docsRepoPointerFor('/repo', { registryFile: '/tmp/r.json' }) => '/srv/kb/repo'
 * @param {string} cwd - Absolute main-checkout path.
 * @param {Object} [overrides]
 * @param {string} [overrides.registryFile] - Explicit registry path (tests inject).
 * @returns {string|null}
 ***/
export function docsRepoPointerFor(cwd, overrides = {}) {
	if (!cwd || typeof cwd !== "string" || !cwd.trim()) return null;
	try {
		return readDocsRepoPointers(overrides)[path.resolve(cwd.trim())] || null;
	} catch {
		return null;
	}
}
