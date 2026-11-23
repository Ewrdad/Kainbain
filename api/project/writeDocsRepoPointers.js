// Domain: Docs-repo pointers — atomic pointer-map write (one function per
// file; see `./docsRepoPointer.js` for the barrel).
import fs from "node:fs";
import path from "node:path";
import { normalizeDocsRepoPointers } from "./normalizeDocsRepoPointers.js";
import { resolveDocsRepoPointersPath } from "./resolveDocsRepoPointersPath.js";

/***
 * MARK: writeDocsRepoPointers
 * @description Persists the pointer map atomically (temp file + rename).
 *   Parent directories are created. Never throws: a failed write logs and
 *   reports false so provisioning can still succeed in memory.
 * @example writeDocsRepoPointers({ '/repo': '/srv/kb/repo' }, { registryFile: '/tmp/r.json' }) => true
 * @param {Object<string, string>} data
 * @param {Object} [overrides]
 * @param {string} [overrides.registryFile] - Explicit registry path (tests inject).
 * @returns {boolean}
 ***/
export function writeDocsRepoPointers(data, overrides = {}) {
	const file = resolveDocsRepoPointersPath(overrides);
	try {
		/* eslint-disable security/detect-non-literal-fs-filename */
		const dir = path.dirname(file);
		if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
		const tempPath = `${file}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
		fs.writeFileSync(tempPath, JSON.stringify(normalizeDocsRepoPointers(data), null, 2), "utf8");
		fs.renameSync(tempPath, file);
		/* eslint-enable security/detect-non-literal-fs-filename */
		return true;
	} catch (err) {
		console.error(`[docsRepoPointer] failed to write ${file}:`, err);
		return false;
	}
}
