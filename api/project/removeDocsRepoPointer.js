// Domain: Docs-repo pointers — pointer drop (one function per file; see
// `./docsRepoPointer.js` for the barrel).
import path from "node:path";
import { readDocsRepoPointers } from "./readDocsRepoPointers.js";
import { writeDocsRepoPointers } from "./writeDocsRepoPointers.js";

/***
 * MARK: removeDocsRepoPointer
 * @description Drops the pointer for `cwd` (used when a project disables its
 *   docs repo). Idempotent; never throws.
 * @example removeDocsRepoPointer('/repo', { registryFile: '/tmp/r.json' }) => true
 * @param {string} cwd - Absolute main-checkout path.
 * @param {Object} [overrides]
 * @param {string} [overrides.registryFile] - Explicit registry path (tests inject).
 * @returns {boolean}
 ***/
export function removeDocsRepoPointer(cwd, overrides = {}) {
	if (!cwd || typeof cwd !== "string" || !cwd.trim()) return false;
	const resolvedCwd = path.resolve(cwd.trim());
	const current = readDocsRepoPointers(overrides);
	if (!(resolvedCwd in current)) return true;
	const next = { ...current };
	delete next[resolvedCwd];
	return writeDocsRepoPointers(next, overrides);
}
