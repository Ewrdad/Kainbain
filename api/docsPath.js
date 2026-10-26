// Domain: Project docs linkage — per-project docs folder name + centralised-docs opt-out.
// The `<cwd>/<docsDirName>` entry (default `docs`) links a project's task
// storage (`<name>/tasks/<taskId>/task.md`) into its notes space.
// A project whose own repository already owns `docs/` picks another link name
// (e.g. `kainbain-docs`); a project with `centralizedDocs === false` skips the
// link entirely and stores tasks in a plain local directory.
import path from "node:path";

/***
 * MARK: DEFAULT_DOCS_DIR_NAME
 * @description The link-folder name used when a project sets no custom `docsDirName`.
 * @example DEFAULT_DOCS_DIR_NAME === "docs"
 ***/
export const DEFAULT_DOCS_DIR_NAME = "docs";

/***
 * MARK: DOCS_DIR_MAX_LENGTH
 * @description Maximum accepted length for a custom docs folder name.
 * @example DOCS_DIR_MAX_LENGTH === 64
 ***/
export const DOCS_DIR_MAX_LENGTH = 64;

/***
 * MARK: DOCS_DIR_RESERVED_NAMES
 * @description Folder names that must never become the docs link: navigation
 *   aliases plus KainBain/git internals and the dependency directory.
 ***/
export const DOCS_DIR_RESERVED_NAMES = [
	".",
	"..",
	".kainbain",
	".git",
	"node_modules",
];

const DOCS_DIR_PATTERN = /^[A-Za-z0-9._-]+$/;

/***
 * MARK: isValidDocsDirName
 * @description Strict validator for a custom docs link-folder name: a trimmed
 *   1–64 char bare name (`[A-Za-z0-9._-]+`) that is not reserved and carries
 *   no path separator. Anything else is rejected with a 400 on write and
 *   degrades to the default on load.
 * @example isValidDocsDirName('kainbain-docs') => true
 * @example isValidDocsDirName('../escape') => false
 * @param {unknown} value
 * @returns {boolean}
 ***/
export function isValidDocsDirName(value) {
	if (typeof value !== "string") return false;
	const name = value.trim();
	if (name.length === 0 || name.length > DOCS_DIR_MAX_LENGTH) return false;
	if (!DOCS_DIR_PATTERN.test(name)) return false;
	if (name.includes("/") || name.includes("\\")) return false;
	const lowered = name.toLowerCase();
	if (DOCS_DIR_RESERVED_NAMES.some((reserved) => reserved.toLowerCase() === lowered)) {
		return false;
	}
	return true;
}

/***
 * MARK: resolveDocsDirName
 * @description The effective docs link-folder name for a project: the trimmed
 *   custom `docsDirName` when valid, else the `docs` default. Tolerant by
 *   design (mirrors `normalizeAppStatus`): garbage degrades, never throws —
 *   so legacy `project.json` files without the field load unchanged.
 * @example resolveDocsDirName({ docsDirName: 'kainbain-docs' }) => 'kainbain-docs'
 * @example resolveDocsDirName({}) => 'docs'
 * @param {Object} [project]
 * @returns {string}
 ***/
export function resolveDocsDirName(project) {
	const raw = project?.docsDirName;
	if (typeof raw === "string" && isValidDocsDirName(raw)) {
		return raw.trim();
	}
	return DEFAULT_DOCS_DIR_NAME;
}

/***
 * MARK: isCentralizedDocsEnabled
 * @description Whether a project links its docs folder into the centralised
 *   notes space. Only an explicit `centralizedDocs === false` opts out;
 *   absent (legacy projects) and every other value mean enabled.
 * @example isCentralizedDocsEnabled({ centralizedDocs: false }) => false
 * @example isCentralizedDocsEnabled({}) => true
 * @param {Object} [project]
 * @returns {boolean}
 ***/
export function isCentralizedDocsEnabled(project) {
	return project?.centralizedDocs !== false;
}

/***
 * MARK: normalizeDocsSettings
 * @description Normalizes the docs settings found on a source object
 *   (create/update payload, loaded file, in-memory project). Only keys
 *   present on the source are returned, so spreading the result never invents
 *   keys; clearing is explicit (blank `docsDirName` in, `undefined` out =
 *   back to the default). Tolerant: an invalid name degrades to `undefined`
 *   (write paths validate strictly beforehand and 400 instead).
 *   Idempotent: normalizing twice changes nothing.
 * @example normalizeDocsSettings({ docsDirName: '  k-docs  ' }) => { docsDirName: 'k-docs' }
 * @param {Object} [source]
 * @returns {{docsDirName?: string, centralizedDocs?: boolean}}
 ***/
export function normalizeDocsSettings(source) {
	const normalized = {};
	if (!source || typeof source !== "object") return normalized;
	if (source.docsDirName !== undefined) {
		const raw = source.docsDirName;
		if (raw === null || (typeof raw === "string" && !raw.trim())) {
			normalized.docsDirName = undefined;
		} else if (isValidDocsDirName(raw)) {
			const trimmed = raw.trim();
			normalized.docsDirName =
				trimmed === DEFAULT_DOCS_DIR_NAME ? undefined : trimmed;
		} else {
			normalized.docsDirName = undefined;
		}
	}
	if (source.centralizedDocs !== undefined) {
		normalized.centralizedDocs =
			source.centralizedDocs === false ? false : undefined;
	}
	return normalized;
}

/***
 * MARK: assertValidDocsDirNameForWrite
 * @description Strict write-path validation for `docsDirName`: blank clears
 *   to the default (returns `undefined`), a valid custom name returns
 *   trimmed (the `docs` default normalizes to `undefined` so default
 *   projects keep their existing file shape), anything else throws a 400
 *   `INVALID_DOCS_DIR_NAME` without touching the project.
 * @example assertValidDocsDirNameForWrite('k-docs') => 'k-docs'
 * @param {unknown} value
 * @returns {string|undefined}
 ***/
export function assertValidDocsDirNameForWrite(value) {
	if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
		return undefined;
	}
	if (typeof value === "string" && isValidDocsDirName(value)) {
		const trimmed = value.trim();
		return trimmed === DEFAULT_DOCS_DIR_NAME ? undefined : trimmed;
	}
	const err = new Error(
		"docsDirName must be a bare folder name (1-64 chars of letters, digits, '.', '_' or '-', no slashes) and must not be '.', '..', '.kainbain', '.git' or 'node_modules'",
	);
	err.statusCode = 400;
	err.code = "INVALID_DOCS_DIR_NAME";
	throw err;
}

/***
 * MARK: resolveDocsPath
 * @description The absolute docs link path for a working directory: 
 *   `<cwd>/<docsDirName>`, honouring the project's custom name. Null when
 *   no working directory is known.
 * @example resolveDocsPath('/repo', { docsDirName: 'k-docs' }) => '/repo/k-docs'
 * @param {string} cwd
 * @param {Object} [project]
 * @returns {string|null}
 ***/
export function resolveDocsPath(cwd, project) {
	if (!cwd || typeof cwd !== "string" || !cwd.trim()) return null;
	return path.join(path.resolve(cwd), resolveDocsDirName(project));
}

/***
 * MARK: resolveTasksDir
 * @description The absolute tasks directory for a working directory:
 *   `<cwd>/<docsDirName>/tasks`. Null when no working directory is known.
 * @example resolveTasksDir('/repo', {}) => '/repo/docs/tasks'
 * @param {string} cwd
 * @param {Object} [project]
 * @returns {string|null}
 ***/
export function resolveTasksDir(cwd, project) {
	const docsPath = resolveDocsPath(cwd, project);
	return docsPath ? path.join(docsPath, "tasks") : null;
}

/***
 * MARK: resolveTaskDocsDir
 * @description The absolute storage directory for one task:
 *   `<cwd>/<docsDirName>/tasks/<taskId>`. Null when the cwd or task id is missing.
 * @example resolveTaskDocsDir('/repo', {}, 't-1') => '/repo/docs/tasks/t-1'
 * @param {string} cwd
 * @param {Object} [project]
 * @param {string} taskId
 * @returns {string|null}
 ***/
export function resolveTaskDocsDir(cwd, project, taskId) {
	if (!taskId || typeof taskId !== "string") return null;
	const tasksDir = resolveTasksDir(cwd, project);
	return tasksDir ? path.join(tasksDir, taskId) : null;
}

/***
 * MARK: docsProjectFor
 * @description Best-effort project record lookup for per-project docs folder
 *   resolution: a direct `getProject` (ProjectStore) or a linked
 *   `projectStore.getProject` (TaskStore) is authoritative, and a missing
 *   lookup (unit-test doubles) degrades to the `docs` default. Mirrors
 *   `kainbainProjectFor` (see `api/kainbainDir.js`).
 * @example docsProjectFor(taskStore, 'p1') => { id: 'p1', docsDirName: 'k-docs' }
 * @param {Object} store - TaskStore or ProjectStore instance (or compatible double).
 * @param {string} projectId
 * @returns {Object|null}
 ***/
export function docsProjectFor(store, projectId) {
	try {
		if (!store || !projectId) return null;
		if (typeof store.getProject === "function") {
			return store.getProject(projectId) || null;
		}
		return store?.projectStore?.getProject?.(projectId) || null;
	} catch {
		return null;
	}
}

/***
 * MARK: reportRelPath
 * @description The stored markdown-reference form for a stage report file
 *   (`./<docsDirName>/tasks/<taskId>/<filename>`), honouring the project's
 *   custom link name so prompts and report metadata stay consistent.
 * @example reportRelPath({}, 't-1', 'plan-20261007.md') => './docs/tasks/t-1/plan-20261007.md'
 * @param {Object} [project]
 * @param {string} taskId
 * @param {string} filename
 * @returns {string}
 ***/
export function reportRelPath(project, taskId, filename) {
	return `./${resolveDocsDirName(project)}/tasks/${taskId}/${filename}`;
}

/***
 * MARK: docsTasksIgnorePath
 * @description The git-ignored artifact prefix for a project
 *   (`<docsDirName>/tasks/`), honouring the custom link name.
 * @example docsTasksIgnorePath({ docsDirName: 'k-docs' }) => 'k-docs/tasks/'
 * @param {Object} [project]
 * @returns {string}
 ***/
export function docsTasksIgnorePath(project) {
	return `${resolveDocsDirName(project)}/tasks/`;
}
