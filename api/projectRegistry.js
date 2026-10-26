// Domain: Multi-project registry — engine-global adopted-project tracking.
// Projects that live outside every scanned root (an existing repo adopted via
// POST /projects/register, or an extra root added by hand) are persisted in
// `~/.kainbain/projects.json` (`{ roots: [...], projects: [...] }`) so the
// scanner re-discovers them after a restart. The file is advisory: missing,
// corrupt, or unreadable degrades to "no registered entries", never a broken
// boot. Writes are atomic (temp file + rename).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "./config.js";

/***
 * MARK: DEFAULT_REGISTRY_FILENAME
 * @description Basename of the engine-global projects registry file.
 * @example DEFAULT_REGISTRY_FILENAME === "projects.json"
 ***/
export const DEFAULT_REGISTRY_FILENAME = "projects.json";

/***
 * MARK: resolveRegistryPath
 * @description The active registry file path: the configured
 *   `projectsRegistryFile` (`KAINBAIN_PROJECTS_REGISTRY_FILE`), defaulting
 *   to `~/.kainbain/projects.json`.
 * @example resolveRegistryPath() => '~/.kainbain/projects.json'
 * @param {Object} [overrides]
 * @param {string} [overrides.registryFile] - Explicit path (tests inject).
 * @returns {string}
 ***/
export function resolveRegistryPath(overrides = {}) {
	if (
		typeof overrides.registryFile === "string" &&
		overrides.registryFile.trim()
	) {
		return path.resolve(overrides.registryFile.trim());
	}
	const configured = config?.projectsRegistryFile;
	if (typeof configured === "string" && configured.trim()) {
		return path.resolve(configured.trim());
	}
	return path.join(os.homedir(), ".kainbain", DEFAULT_REGISTRY_FILENAME);
}

/***
 * MARK: normalizeRegistryData
 * @description Normalizes raw registry content into `{ roots, projects }`
 *   string arrays: trims, drops blanks and non-strings, dedupes. Garbage
 *   degrades to empty lists, never throws.
 * @example normalizeRegistryData({ roots: ['/a', '/a'], projects: [null] }) => { roots: ['/a'], projects: [] }
 * @param {unknown} raw
 * @returns {{roots: string[], projects: string[]}}
 ***/
export function normalizeRegistryData(raw) {
	const clean = (value) => {
		if (!Array.isArray(value)) return [];
		const seen = new Set();
		const out = [];
		for (const entry of value) {
			if (typeof entry !== "string") continue;
			const trimmed = entry.trim();
			if (!trimmed || seen.has(trimmed)) continue;
			seen.add(trimmed);
			out.push(trimmed);
		}
		return out;
	};
	if (!raw || typeof raw !== "object") return { roots: [], projects: [] };
	return { roots: clean(raw.roots), projects: clean(raw.projects) };
}

/***
 * MARK: readRegistry
 * @description Reads the registry file: `{ roots, projects }`, normalized.
 *   A missing or corrupt file reads as empty (the scanner simply finds
 *   nothing extra). Never throws.
 * @example readRegistry({ registryFile: '/tmp/none.json' }) => { roots: [], projects: [] }
 * @param {Object} [overrides]
 * @param {string} [overrides.registryFile] - Explicit path (tests inject).
 * @returns {{roots: string[], projects: string[]}}
 ***/
export function readRegistry(overrides = {}) {
	const file = resolveRegistryPath(overrides);
	try {
		/* eslint-disable security/detect-non-literal-fs-filename */
		if (!fs.existsSync(file)) return { roots: [], projects: [] };
		const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
		return normalizeRegistryData(parsed);
		/* eslint-enable security/detect-non-literal-fs-filename */
	} catch {
		return { roots: [], projects: [] };
	}
}

/***
 * MARK: writeRegistry
 * @description Persists `{ roots, projects }` atomically (temp file +
 *   rename). Parent directories are created. Never throws: a failed write
 *   logs and reports false so adoption can still succeed in memory.
 * @example writeRegistry({ roots: [], projects: ['/repo'] }, { registryFile: '/tmp/r.json' }) => true
 * @param {{roots?: string[], projects?: string[]}} data
 * @param {Object} [overrides]
 * @param {string} [overrides.registryFile] - Explicit path (tests inject).
 * @returns {boolean}
 ***/
export function writeRegistry(data, overrides = {}) {
	const file = resolveRegistryPath(overrides);
	try {
		/* eslint-disable security/detect-non-literal-fs-filename */
		const dir = path.dirname(file);
		if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
		const normalized = normalizeRegistryData(data);
		const tempPath = `${file}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
		fs.writeFileSync(tempPath, JSON.stringify(normalized, null, 2), "utf8");
		fs.renameSync(tempPath, file);
		/* eslint-enable security/detect-non-literal-fs-filename */
		return true;
	} catch (err) {
		console.error(`[projectRegistry] failed to write ${file}:`, err);
		return false;
	}
}

/***
 * MARK: registerProjectPath
 * @description Idempotently records an adopted project directory in the
 *   registry file. Re-registering a known path is a no-op returning true.
 *   Never throws.
 * @example registerProjectPath('/repo', { registryFile: '/tmp/r.json' }) => true
 * @param {string} projectDir - Absolute project directory.
 * @param {Object} [overrides]
 * @param {string} [overrides.registryFile] - Explicit path (tests inject).
 * @returns {boolean}
 ***/
export function registerProjectPath(projectDir, overrides = {}) {
	if (!projectDir || typeof projectDir !== "string") return false;
	// A blank name must never resolve: path.resolve("") returns the
	// process cwd, which would register the server's own directory.
	const trimmed = projectDir.trim();
	if (!trimmed) return false;
	const resolved = path.resolve(trimmed);
	const current = readRegistry(overrides);
	if (current.projects.includes(resolved)) return true;
	return writeRegistry(
		{ roots: current.roots, projects: [...current.projects, resolved] },
		overrides,
	);
}

/***
 * MARK: registerRootPath
 * @description Idempotently records an extra scan root in the registry file.
 *   Never throws.
 * @example registerRootPath('/mnt/nas/projects', { registryFile: '/tmp/r.json' }) => true
 * @param {string} rootDir - Absolute root directory.
 * @param {Object} [overrides]
 * @param {string} [overrides.registryFile] - Explicit path (tests inject).
 * @returns {boolean}
 ***/
export function registerRootPath(rootDir, overrides = {}) {
	if (!rootDir || typeof rootDir !== "string") return false;
	// Same blank-name guard as registerProjectPath: path.resolve("")
	// returns the process cwd, which must never become a scan root.
	const trimmed = rootDir.trim();
	if (!trimmed) return false;
	const resolved = path.resolve(trimmed);
	const current = readRegistry(overrides);
	if (current.roots.includes(resolved)) return true;
	return writeRegistry(
		{ roots: [...current.roots, resolved], projects: current.projects },
		overrides,
	);
}
