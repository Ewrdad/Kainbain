// Domain: Project state linkage — per-project KainBain state folder name.
// Every per-project engine artifact (`project.json`, `sessions/`,
// `worktrees/`, `quarantine/`, opencode transcripts) lives under
// `<cwd>/<kainbainDirName>` (default `.kainbain`). A project whose repository
// already owns `.kainbain` (or wants a differently-named state folder, e.g.
// `.kb`) picks another name; the git cleanliness guard and generated
// `.gitignore` entries follow the same resolver so custom folders stay
// ignored exactly like the default.
import path from "node:path";

/***
 * MARK: DEFAULT_KAINBAIN_DIR_NAME
 * @description The state-folder name used when a project sets no custom `kainbainDirName`.
 * @example DEFAULT_KAINBAIN_DIR_NAME === ".kainbain"
 ***/
export const DEFAULT_KAINBAIN_DIR_NAME = ".kainbain";

/***
 * MARK: KAINBAIN_DIR_MAX_LENGTH
 * @description Maximum accepted length for a custom state folder name.
 * @example KAINBAIN_DIR_MAX_LENGTH === 64
 ***/
export const KAINBAIN_DIR_MAX_LENGTH = 64;

/***
 * MARK: KAINBAIN_DIR_RESERVED_NAMES
 * @description Folder names that must never become the state folder: navigation
 *   aliases plus git internals, the dependency directory, and the docs link
 *   names (the default `docs` and any project-level custom name, checked
 *   dynamically — see `isValidKainbainDirName`).
 ***/
export const KAINBAIN_DIR_RESERVED_NAMES = [".", "..", ".git", "node_modules"];

const KAINBAIN_DIR_PATTERN = /^[A-Za-z0-9._-]+$/;

/***
 * MARK: isValidKainbainDirName
 * @description Strict validator for a custom state folder name: a trimmed
 *   1–64 char bare name (`[A-Za-z0-9._-]+`) that is not reserved and carries
 *   no path separator. The project's own `docsDirName` (or the `docs`
 *   default) is also reserved so the two link folders can never collide.
 *   Anything else is rejected with a 400 on write and degrades to the
 *   default on load.
 * @example isValidKainbainDirName('.kb') => true
 * @example isValidKainbainDirName('../escape') => false
 * @param {unknown} value
 * @param {Object} [project] - Optional project record carrying `docsDirName`.
 * @returns {boolean}
 ***/
export function isValidKainbainDirName(value, project) {
	if (typeof value !== "string") return false;
	const name = value.trim();
	if (name.length === 0 || name.length > KAINBAIN_DIR_MAX_LENGTH) return false;
	if (!KAINBAIN_DIR_PATTERN.test(name)) return false;
	if (name.includes("/") || name.includes("\\")) return false;
	const lowered = name.toLowerCase();
	if (
		KAINBAIN_DIR_RESERVED_NAMES.some(
			(reserved) => reserved.toLowerCase() === lowered,
		)
	) {
		return false;
	}
	const docsName = project?.docsDirName;
	const reservedDocs =
		typeof docsName === "string" && docsName.trim()
			? docsName.trim().toLowerCase()
			: "docs";
	if (lowered === reservedDocs || lowered === "docs") {
		return false;
	}
	return true;
}

/***
 * MARK: resolveKainbainDirName
 * @description The effective state-folder name for a project: the trimmed
 *   custom `kainbainDirName` when valid, else the `.kainbain` default.
 *   Tolerant by design (mirrors `resolveDocsDirName`): garbage degrades,
 *   never throws — so legacy `project.json` files without the field load
 *   unchanged.
 * @example resolveKainbainDirName({ kainbainDirName: '.kb' }) => '.kb'
 * @example resolveKainbainDirName({}) => '.kainbain'
 * @param {Object} [project]
 * @returns {string}
 ***/
export function resolveKainbainDirName(project) {
	const raw = project?.kainbainDirName;
	if (typeof raw === "string" && isValidKainbainDirName(raw, project)) {
		return raw.trim();
	}
	return DEFAULT_KAINBAIN_DIR_NAME;
}

/***
 * MARK: normalizeKainbainDirSettings
 * @description Normalizes the state-folder setting found on a source object
 *   (create/update payload, loaded file, in-memory project). Only keys
 *   present on the source are returned, so spreading the result never invents
 *   keys; clearing is explicit (blank `kainbainDirName` in, `undefined` out =
 *   back to the default). Tolerant: an invalid name degrades to `undefined`
 *   (write paths validate strictly beforehand and 400 instead).
 *   Idempotent: normalizing twice changes nothing.
 * @example normalizeKainbainDirSettings({ kainbainDirName: '  .kb  ' }) => { kainbainDirName: '.kb' }
 * @param {Object} [source]
 * @returns {{kainbainDirName?: string}}
 ***/
export function normalizeKainbainDirSettings(source) {
	const normalized = {};
	if (!source || typeof source !== "object") return normalized;
	if (source.kainbainDirName !== undefined) {
		const raw = source.kainbainDirName;
		if (raw === null || (typeof raw === "string" && !raw.trim())) {
			normalized.kainbainDirName = undefined;
		} else if (isValidKainbainDirName(raw, source)) {
			const trimmed = raw.trim();
			normalized.kainbainDirName =
				trimmed === DEFAULT_KAINBAIN_DIR_NAME ? undefined : trimmed;
		} else {
			normalized.kainbainDirName = undefined;
		}
	}
	return normalized;
}

/***
 * MARK: assertValidKainbainDirNameForWrite
 * @description Strict write-path validation for `kainbainDirName`: blank clears
 *   to the default (returns `undefined`), a valid custom name returns
 *   trimmed (the `.kainbain` default normalizes to `undefined` so default
 *   projects keep their existing file shape), anything else throws a 400
 *   `INVALID_KAINBAIN_DIR_NAME` without touching the project.
 * @example assertValidKainbainDirNameForWrite('.kb') => '.kb'
 * @param {unknown} value
 * @param {Object} [project] - Optional project record carrying `docsDirName`.
 * @returns {string|undefined}
 ***/
export function assertValidKainbainDirNameForWrite(value, project) {
	if (
		value === undefined ||
		value === null ||
		(typeof value === "string" && !value.trim())
	) {
		return undefined;
	}
	if (typeof value === "string" && isValidKainbainDirName(value, project)) {
		const trimmed = value.trim();
		return trimmed === DEFAULT_KAINBAIN_DIR_NAME ? undefined : trimmed;
	}
	const err = new Error(
		"kainbainDirName must be a bare folder name (1-64 chars of letters, digits, '.', '_' or '-', no slashes) and must not be '.', '..', '.git', 'node_modules', 'docs' or the project's docs folder",
	);
	err.statusCode = 400;
	err.code = "INVALID_KAINBAIN_DIR_NAME";
	throw err;
}

/***
 * MARK: resolveKainbainDir
 * @description The absolute state directory for a working directory:
 *   `<cwd>/<kainbainDirName>`, honouring the project's custom name. Null
 *   when no working directory is known.
 * @example resolveKainbainDir('/repo', { kainbainDirName: '.kb' }) => '/repo/.kb'
 * @param {string} cwd
 * @param {Object} [project]
 * @returns {string|null}
 ***/
export function resolveKainbainDir(cwd, project) {
	if (!cwd || typeof cwd !== "string" || !cwd.trim()) return null;
	return path.join(path.resolve(cwd), resolveKainbainDirName(project));
}

/***
 * MARK: resolveProjectConfigPath
 * @description The absolute `project.json` path for a working directory:
 *   `<cwd>/<kainbainDirName>/project.json`. Null when no working directory
 *   is known.
 * @example resolveProjectConfigPath('/repo', {}) => '/repo/.kainbain/project.json'
 * @param {string} cwd
 * @param {Object} [project]
 * @returns {string|null}
 ***/
export function resolveProjectConfigPath(cwd, project) {
	const dir = resolveKainbainDir(cwd, project);
	return dir ? path.join(dir, "project.json") : null;
}

/***
 * MARK: resolveSessionsDir
 * @description The absolute agent-sessions directory for a working directory:
 *   `<cwd>/<kainbainDirName>/sessions`. Null when no working directory is
 *   known.
 * @example resolveSessionsDir('/repo', {}) => '/repo/.kainbain/sessions'
 * @param {string} cwd
 * @param {Object} [project]
 * @returns {string|null}
 ***/
export function resolveSessionsDir(cwd, project) {
	const dir = resolveKainbainDir(cwd, project);
	return dir ? path.join(dir, "sessions") : null;
}

/***
 * MARK: resolveWorktreesDir
 * @description The absolute task-worktrees directory for a working directory:
 *   `<cwd>/<kainbainDirName>/worktrees`. Null when no working directory is
 *   known.
 * @example resolveWorktreesDir('/repo', {}) => '/repo/.kainbain/worktrees'
 * @param {string} cwd
 * @param {Object} [project]
 * @returns {string|null}
 ***/
export function resolveWorktreesDir(cwd, project) {
	const dir = resolveKainbainDir(cwd, project);
	return dir ? path.join(dir, "worktrees") : null;
}

/***
 * MARK: resolveQuarantineDir
 * @description The absolute task-quarantine directory for a working directory:
 *   `<cwd>/<kainbainDirName>/quarantine`. Null when no working directory is
 *   known.
 * @example resolveQuarantineDir('/repo', {}) => '/repo/.kainbain/quarantine'
 * @param {string} cwd
 * @param {Object} [project]
 * @returns {string|null}
 ***/
export function resolveQuarantineDir(cwd, project) {
	const dir = resolveKainbainDir(cwd, project);
	return dir ? path.join(dir, "quarantine") : null;
}

/***
 * MARK: kainbainIgnorePath
 * @description The git-ignored state-folder prefix for a project
 *   (`<kainbainDirName>/`), honouring the custom name so generated
 *   `.gitignore` entries and the cleanliness guard ignore the project's
 *   actual state folder.
 * @example kainbainIgnorePath({ kainbainDirName: '.kb' }) => '.kb/'
 * @param {Object} [project]
 * @returns {string}
 ***/
export function kainbainIgnorePath(project) {
	return `${resolveKainbainDirName(project)}/`;
}

/***
 * MARK: kainbainProjectFor
 * @description Best-effort project record lookup for per-project state-folder
 *   resolution: a direct `getProject` (ProjectStore) or a linked
 *   `projectStore.getProject` (TaskStore) is authoritative, and a missing
 *   lookup (unit-test doubles) degrades to the `.kainbain` default.
 * @example kainbainProjectFor(taskStore, 'p1') => { id: 'p1', kainbainDirName: '.kb' }
 * @param {Object} store - TaskStore instance (or compatible double).
 * @param {string} projectId
 * @returns {Object|null}
 ***/
export function kainbainProjectFor(store, projectId) {
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
