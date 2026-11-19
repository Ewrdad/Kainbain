// Domain: Docs-repo pointers — pointer-map normalizer (one function per
// file; see `./docsRepoPointer.js` for the barrel).
import path from "node:path";

/***
 * MARK: normalizeDocsRepoPointers
 * @description Normalizes raw pointer content into a `{ "<resolvedCwd>": "<resolvedLocalPath>" }`
 *   map: non-object input degrades to `{}`; non-string or blank entries are
 *   dropped; both sides resolve to absolute paths so a trailing-slash or
 *   relative hand edit never creates a phantom entry.
 * @example normalizeDocsRepoPointers({ '/repo': '/srv/kb/repo' }) => { '/repo': '/srv/kb/repo' }
 * @param {unknown} raw
 * @returns {Object<string, string>}
 ***/
export function normalizeDocsRepoPointers(raw) {
	const out = {};
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
	for (const [cwd, localPath] of Object.entries(raw)) {
		if (typeof cwd !== "string" || !cwd.trim()) continue;
		if (typeof localPath !== "string" || !localPath.trim()) continue;
		if (!path.isAbsolute(localPath.trim())) continue;
		try {
			out[path.resolve(cwd.trim())] = path.resolve(localPath.trim());
		} catch {
			// Unresolvable paths are skipped, never fatal.
		}
	}
	return out;
}
