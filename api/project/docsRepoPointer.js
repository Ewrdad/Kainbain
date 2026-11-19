// Domain: Docs-repo pointers — engine-global map from a project's main
// checkout (`cwd`) to its separate docs-repo checkout (`docsRepo.localPath`).
// A project whose KainBain home lives in the docs repo keeps ZERO KainBain
// files in the main repo (stealth), so the scanner cannot find a
// `project.json` there; this pointer (stored engine-globally, next to the
// projects registry — never inside the main repo) lets `_loadProjectFile`
// rediscover the config at `<docsRepo.localPath>/.kainbain/project.json`.
// The file is advisory: missing/corrupt degrades to an empty map, never a
// broken boot. Writes are atomic (temp file + rename).
import fs from "node:fs";
import path from "node:path";
import { resolveRegistryPath } from "../projectRegistry.js";

/***
 * MARK: DOCS_REPO_POINTERS_FILENAME
 * @description Basename of the engine-global docs-repo pointer file, stored
 *   next to the projects registry (never inside a project repo).
 * @example DOCS_REPO_POINTERS_FILENAME === "docs-repo-pointers.json"
 ***/
export const DOCS_REPO_POINTERS_FILENAME = "docs-repo-pointers.json";

/***
 * MARK: resolveDocsRepoPointersPath
 * @description The active pointer-file path: the directory of the resolved
 *   registry file (explicit override wins, else `KAINBAIN_PROJECTS_REGISTRY_FILE`,
 *   else `~/.kainbain/`) plus `docs-repo-pointers.json`.
 * @example resolveDocsRepoPointersPath({ registryFile: '/tmp/r.json' }) => '/tmp/docs-repo-pointers.json'
 * @param {Object} [overrides]
 * @param {string} [overrides.registryFile] - Explicit registry path (tests inject).
 * @returns {string}
 ***/
export function resolveDocsRepoPointersPath(overrides = {}) {
	return path.join(path.dirname(resolveRegistryPath(overrides)), DOCS_REPO_POINTERS_FILENAME);
}

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

/***
 * MARK: readDocsRepoPointers
 * @description Reads the pointer map. A missing or corrupt file reads as {}
 *   (the scanner then simply finds no docs-repo projects there). Never throws.
 * @example readDocsRepoPointers({ registryFile: '/tmp/none.json' }) => {}
 * @param {Object} [overrides]
 * @param {string} [overrides.registryFile] - Explicit registry path (tests inject).
 * @returns {Object<string, string>}
 ***/
export function readDocsRepoPointers(overrides = {}) {
	const file = resolveDocsRepoPointersPath(overrides);
	try {
		/* eslint-disable security/detect-non-literal-fs-filename */
		if (!fs.existsSync(file)) return {};
		return normalizeDocsRepoPointers(JSON.parse(fs.readFileSync(file, "utf8")));
		/* eslint-enable security/detect-non-literal-fs-filename */
	} catch {
		return {};
	}
}

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
