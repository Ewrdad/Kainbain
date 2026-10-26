import { git } from "./exec.js";
import { DEFAULT_KAINBAIN_DIR_NAME, resolveKainbainDirName } from "../kainbainDir.js";
import { resolveDocsDirName } from "../docsPath.js";

/***
 * MARK: DEFAULT_IGNORED_PATHS
 * @description Paths ignored by the working-tree cleanliness guard. KainBain
 *   itself writes task documentation (docs/, when it is a real directory) into
 *   the project during execution; these are engine artifacts rather than work
 *   in flight, so they must not block safe branch switches.
 ***/
export const DEFAULT_IGNORED_PATHS = [`${DEFAULT_KAINBAIN_DIR_NAME}/`];



/***
 * MARK: _parsePorcelainEntries
 * @description Parses `git status --porcelain=v1 -uall` output into
 *   `{ status, path }` entries. Porcelain v1 lines read two status chars +
 *   one space, then the path (quoted when it contains specials; rename lines
 *   read 'old -> new'). Slicing the RAW line keeps unstaged entries (XY
 *   where X is a space) intact; stripping LEADING whitespace here would
 *   corrupt the status columns.
 * @private
 * @param {string} stdout - Raw porcelain output.
 * @returns {Array<{status: string, path: string}>}
 ***/
export function _parsePorcelainEntries(stdout) {
	const entries = [];
	for (const line of String(stdout || "").split("\n")) {
		if (!line.trim()) continue;
		const status = line.slice(0, 2);
		const path = line
			.slice(3)
			.trim()
			.replace(/^"|"$/g, "")
			.replace(/\\\\/g, "\\");
		if (!path) continue;
		entries.push({ status, path });
	}
	return entries;
}


/***
 * MARK: getWorkingTreeStatus
 * @description Inspects `git status --porcelain` and classifies the tree.
 *   Paths under `opts.ignorePaths` (defaults to DEFAULT_IGNORED_PATHS — the
 *   engine's own artifacts) are excluded before judging cleanliness, so a
 *   mid-task report write never blocks a branch switch. Everything else —
 *   including staged changes, modifications, deletions, conflicts AND
 *   untracked files — marks the tree dirty (strict safety default).
 * @example await getWorkingTreeStatus('/repo') => { clean: true, dirtyPaths: [] }
 * @param {string} projectCwd
 * @param {Object} [opts]
 * @param {Array<string>} [opts.ignorePaths=DEFAULT_IGNORED_PATHS] - Path prefixes to ignore.
 * @param {Object} [opts.project] - Project record hint; its custom docs link
 *   name (`<name>/tasks/`) is ignored alongside the `docs/tasks/` default.
 * @param {string} [opts.docsDirName] - Bare docs folder name hint (same effect
 *   as passing a project record carrying it).
 * @returns {Promise<{clean: boolean, dirtyPaths: Array<string>}>}
 ***/

/***
 * MARK: _resolveIgnorePaths
 * @description Resolves the ignore prefix list for working-tree guards.
 *   Porcelain paths are repo-relative, so only relative prefixes can ever
 *   match (a prior absolute-path entry was dead code). The default docs name
 *   is always ignored; a project hint adds its custom link name. Callers
 *   that know the project record should pass { project } (or { docsDirName }).
 * @private
 ***/
export function _resolveIgnorePaths(opts = {}) {
	if (Array.isArray(opts.ignorePaths)) return opts.ignorePaths;
	const hint =
		opts.project ||
		(opts.docsDirName !== undefined || opts.kainbainDirName !== undefined
			? { docsDirName: opts.docsDirName, kainbainDirName: opts.kainbainDirName }
			: null);
	const names = new Set([resolveDocsDirName({})]);
	if (hint) names.add(resolveDocsDirName(hint));
	const stateNames = new Set([DEFAULT_KAINBAIN_DIR_NAME]);
	if (hint) stateNames.add(resolveKainbainDirName(hint));
	return [
		...[...names].map((name) => `${name}/tasks/`),
		...[...stateNames].map((name) => `${name}/`),
	];
}

export async function getWorkingTreeStatus(projectCwd, opts = {}) {
	const ignorePaths = _resolveIgnorePaths(opts);
	const { stdout } = await git(projectCwd, ["status", "--porcelain", "-uall"]);
	const dirtyPaths = [];
	for (const { path } of _parsePorcelainEntries(stdout)) {
		const p = path.replace(/\\/g, "/").replace(/["']/g, "");
		const ignored = ignorePaths.some((prefix) => {
			const normPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
			return p === prefix || p.startsWith(normPrefix);
		});
		if (!ignored) dirtyPaths.push(path);
	}
	return { clean: dirtyPaths.length === 0, dirtyPaths };
}


/***
 * MARK: isWorkingTreeClean
 * @description Boolean wrapper around getWorkingTreeStatus.
 * @example await isWorkingTreeClean('/repo') => true
 * @param {string} projectCwd
 * @param {Object} [opts] - getWorkingTreeStatus options.
 * @returns {Promise<boolean>}
 ***/
export async function isWorkingTreeClean(projectCwd, opts = {}) {
	const { clean } = await getWorkingTreeStatus(projectCwd, opts);
	return clean;
}


