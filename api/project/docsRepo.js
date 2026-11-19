// Domain: Separate docs repo — a project may keep ALL KainBain-specific
// information (task docs, plans, reports, and the `.kainbain/` state folder
// incl. `project.json`) in a separate, private git repo ("docs repo") instead
// of inside the main project repo. The main repo then stays free of KainBain
// traces (stealth use on shared/public repos). The single seam is
// `resolveKainbainHome`: docs/state resolvers map (cwd, project) onto the
// docs-repo checkout when `project.docsRepo` is set, and onto `cwd` otherwise
// (legacy projects behave byte-identically).
import path from "node:path";
import { redactCredentials } from "../git/validation.js";

/***
 * MARK: DOCS_REPO_URL_MAX_LENGTH
 * @description Maximum accepted length for a docs-repo remote URL.
 * @example DOCS_REPO_URL_MAX_LENGTH === 2048
 ***/
export const DOCS_REPO_URL_MAX_LENGTH = 2048;

/***
 * MARK: DOCS_REPO_PATH_MAX_LENGTH
 * @description Maximum accepted length for a docs-repo local checkout path.
 * @example DOCS_REPO_PATH_MAX_LENGTH === 4096
 ***/
export const DOCS_REPO_PATH_MAX_LENGTH = 4096;

/***
 * MARK: DOCS_REPO_BRANCH_MODE_SYNCED
 * @description The only v1 branch mode: the docs repo carries the same
 *   `kb/<taskId>` task branches as the code repo, created/checked out/pushed
 *   together so docs history tracks task history.
 * @example DOCS_REPO_BRANCH_MODE_SYNCED === "synced"
 ***/
export const DOCS_REPO_BRANCH_MODE_SYNCED = "synced";

/***
 * MARK: isValidDocsRepoUrl
 * @description Strict validator for a docs-repo remote URL: a trimmed
 *   1–2048 char string with no whitespace/control characters that looks like
 *   a git remote (`scheme://...`, scp-like `git@host:path`, or a local/
 *   `file://` path). Anything else is rejected with a 400 on write and
 *   degrades to absent on load.
 * @example isValidDocsRepoUrl('https://git.example.com/me/proj-kb.git') => true
 * @example isValidDocsRepoUrl('git@github.com:me/proj-kb.git') => true
 * @example isValidDocsRepoUrl('not a url') => false
 * @param {unknown} value
 * @returns {boolean}
 ***/
export function isValidDocsRepoUrl(value) {
	if (typeof value !== "string") return false;
	const url = value.trim();
	if (url.length === 0 || url.length > DOCS_REPO_URL_MAX_LENGTH) return false;
	if (/\s/.test(url) || /[\x00-\x1f\x7f]/.test(url)) return false;
	if (url.includes("://")) return true; // https://, ssh://, file://, ...
	if (/^[^/@\s]+@[^/@\s]+:.+/.test(url)) return true; // scp-like git@host:path
	if (url.startsWith("/")) return true; // local absolute path used as remote
	return false;
}

/***
 * MARK: isValidDocsRepoLocalPath
 * @description Strict validator for the docs-repo local checkout path: a
 *   trimmed 1–4096 char ABSOLUTE path (relative paths are rejected — the
 *   backend resolves against its own cwd, never the client's).
 * @example isValidDocsRepoLocalPath('/srv/kainbain-docs/my-proj') => true
 * @example isValidDocsRepoLocalPath('relative/path') => false
 * @param {unknown} value
 * @returns {boolean}
 ***/
export function isValidDocsRepoLocalPath(value) {
	if (typeof value !== "string") return false;
	const p = value.trim();
	if (p.length === 0 || p.length > DOCS_REPO_PATH_MAX_LENGTH) return false;
	if (!path.isAbsolute(p)) return false;
	return true;
}

/***
 * MARK: hasDocsRepo
 * @description Whether a project record carries an active separate docs
 *   repo: `docsRepo` must be an object with a valid `url` or a valid
 *   `localPath`. Legacy projects (no `docsRepo`) and garbage degrade to
 *   false — never throws.
 * @example hasDocsRepo({ docsRepo: { url: 'https://git.example.com/me/kb.git' } }) => true
 * @example hasDocsRepo({}) => false
 * @param {Object} [project]
 * @returns {boolean}
 ***/
export function hasDocsRepo(project) {
	const repo = project?.docsRepo;
	if (!repo || typeof repo !== "object" || Array.isArray(repo)) return false;
	return isValidDocsRepoUrl(repo.url) || isValidDocsRepoLocalPath(repo.localPath);
}

/***
 * MARK: resolveDocsRepoLocalPath
 * @description The absolute local checkout path of a project's docs repo,
 *   or null when the project has none (legacy) or the stored path is not a
 *   valid absolute path.
 * @example resolveDocsRepoLocalPath({ docsRepo: { localPath: '/srv/kb/proj' } }) => '/srv/kb/proj'
 * @param {Object} [project]
 * @returns {string|null}
 ***/
export function resolveDocsRepoLocalPath(project) {
	const repo = project?.docsRepo;
	if (!repo || typeof repo !== "object" || Array.isArray(repo)) return null;
	if (!isValidDocsRepoLocalPath(repo.localPath)) return null;
	return path.resolve(repo.localPath.trim());
}

/***
 * MARK: docsRepoUrlFor
 * @description The docs-repo remote URL as safe to expose (API responses,
 *   claim payloads, logs): the stored value is already credential-redacted
 *   at write time, and this re-redacts defensively so a hand-edited
 *   project.json can never leak a token through the API. Null when unset.
 * @example docsRepoUrlFor({ docsRepo: { url: 'https://git.example.com/me/kb.git' } }) => 'https://git.example.com/me/kb.git'
 * @param {Object} [project]
 * @returns {string|null}
 ***/
export function docsRepoUrlFor(project) {
	const repo = project?.docsRepo;
	if (!repo || typeof repo !== "object" || Array.isArray(repo)) return null;
	if (!isValidDocsRepoUrl(repo.url)) return null;
	return redactCredentials(repo.url.trim());
}

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

/***
 * MARK: normalizeDocsRepoSettings
 * @description Tolerant read-path normalizer for `docsRepo` found on a source
 *   object (loaded project.json, in-memory project). Only keys present on
 *   the source are returned, so spreading never invents keys; invalid fields
 *   degrade to absent (write paths 400 strictly beforehand). The URL is
 *   credential-redacted here too, so a hand-edited config with a token never
 *   reaches an API response. Idempotent.
 * @example normalizeDocsRepoSettings({ docsRepo: { url: 'https://t@git.example.com/me/kb.git' } }) => { docsRepo: { url: 'https://git.example.com/me/kb.git', branchMode: 'synced' } }
 * @param {Object} [source]
 * @returns {{docsRepo?: {url?: string, localPath?: string, branchMode?: string}}}
 ***/
export function normalizeDocsRepoSettings(source) {
	const normalized = {};
	if (!source || typeof source !== "object") return normalized;
	const raw = source.docsRepo;
	if (raw === undefined) return normalized;
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
		normalized.docsRepo = undefined;
		return normalized;
	}
	const out = {};
	if (raw.url !== undefined && raw.url !== null) {
		if (isValidDocsRepoUrl(raw.url)) out.url = redactCredentials(raw.url.trim());
		else out.url = undefined;
	}
	if (raw.localPath !== undefined && raw.localPath !== null) {
		if (isValidDocsRepoLocalPath(raw.localPath)) out.localPath = path.resolve(raw.localPath.trim());
		else out.localPath = undefined;
	}
	if (raw.branchMode !== undefined && raw.branchMode !== null) {
		out.branchMode = raw.branchMode === DOCS_REPO_BRANCH_MODE_SYNCED ? DOCS_REPO_BRANCH_MODE_SYNCED : undefined;
	}
	// An object with no usable field at all clears the setting.
	if (!hasDocsRepo({ docsRepo: out })) {
		normalized.docsRepo = undefined;
		return normalized;
	}
	if (out.url === undefined) delete out.url;
	if (out.localPath === undefined) delete out.localPath;
	if (!out.branchMode) out.branchMode = DOCS_REPO_BRANCH_MODE_SYNCED;
	normalized.docsRepo = out;
	return normalized;
}

/***
 * MARK: assertValidDocsRepoForWrite
 * @description Strict write-path validation for `docsRepo`: null/undefined or
 *   an object with neither a valid `url` nor a valid `localPath` clears the
 *   setting (returns `undefined`); a valid object returns the normalized,
 *   credential-redacted form (`branchMode` fixed to `synced` in v1); anything
 *   else throws a 400 `INVALID_DOCS_REPO_URL` / `INVALID_DOCS_REPO_PATH`
 *   without touching the project.
 * @example assertValidDocsRepoForWrite({ url: 'https://git.example.com/me/kb.git', localPath: '/srv/kb/proj' }) => { url: 'https://git.example.com/me/kb.git', localPath: '/srv/kb/proj', branchMode: 'synced' }
 * @param {unknown} value
 * @returns {{url?: string, localPath?: string, branchMode: string}|undefined}
 ***/
export function assertValidDocsRepoForWrite(value) {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "object" || Array.isArray(value)) {
		const err = new Error("docsRepo must be an object with 'url' and/or 'localPath', or null to disable");
		err.statusCode = 400;
		err.code = "INVALID_DOCS_REPO";
		throw err;
	}
	const urlRaw = value.url;
	const pathRaw = value.localPath;
	const hasUrl = typeof urlRaw === "string" && !!urlRaw.trim();
	const hasPath = typeof pathRaw === "string" && !!pathRaw.trim();
	if (!hasUrl && !hasPath) return undefined; // blank clears
	if (hasUrl && !isValidDocsRepoUrl(urlRaw)) {
		const err = new Error(
			"docsRepo.url must be a git remote URL (https://…, ssh://…, git@host:path, file://… or an absolute local path), max 2048 chars, no whitespace",
		);
		err.statusCode = 400;
		err.code = "INVALID_DOCS_REPO_URL";
		throw err;
	}
	if (hasPath && !isValidDocsRepoLocalPath(pathRaw)) {
		const err = new Error(
			"docsRepo.localPath must be an absolute path (max 4096 chars) to the docs-repo checkout on this host",
		);
		err.statusCode = 400;
		err.code = "INVALID_DOCS_REPO_PATH";
		throw err;
	}
	const out = { branchMode: DOCS_REPO_BRANCH_MODE_SYNCED };
	if (hasUrl) out.url = redactCredentials(urlRaw.trim());
	if (hasPath) out.localPath = path.resolve(pathRaw.trim());
	return out;
}
