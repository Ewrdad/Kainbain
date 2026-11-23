// Domain: Docs-repo pointers — idempotent pointer record (one function per
// file; see `./docsRepoPointer.js` for the barrel).
import path from "node:path";
import { readDocsRepoPointers } from "./readDocsRepoPointers.js";
import { writeDocsRepoPointers } from "./writeDocsRepoPointers.js";

/***
 * MARK: rememberDocsRepoPointer
 * @description Idempotently records that the project at `cwd` keeps its
 *   KainBain home in the docs-repo checkout at `localPath`. Never throws.
 * @example rememberDocsRepoPointer('/repo', '/srv/kb/repo', { registryFile: '/tmp/r.json' }) => true
 * @param {string} cwd - Absolute main-checkout path.
 * @param {string} localPath - Absolute docs-repo checkout path.
 * @param {Object} [overrides]
 * @param {string} [overrides.registryFile] - Explicit registry path (tests inject).
 * @returns {boolean}
 ***/
export function rememberDocsRepoPointer(cwd, localPath, overrides = {}) {
	if (!cwd || typeof cwd !== "string" || !cwd.trim()) return false;
	if (!localPath || typeof localPath !== "string" || !localPath.trim()) return false;
	const resolvedCwd = path.resolve(cwd.trim());
	const resolvedPath = path.resolve(localPath.trim());
	const current = readDocsRepoPointers(overrides);
	if (current[resolvedCwd] === resolvedPath) return true;
	return writeDocsRepoPointers({ ...current, [resolvedCwd]: resolvedPath }, overrides);
}
