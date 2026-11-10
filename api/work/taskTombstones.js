// Domain: The Work — deletion tombstones for tasks.
//
// `docs/tasks/<id>/` files can be tracked in git (runner worktrees commit
// them), so a plain working-tree deletion is not durable: any branch
// checkout, `reset --hard`, or merge from a kb/* branch that still carries
// the files restores them, and the next scanTasks re-imports the deleted
// task. Tombstones live in `<projectRoot>/<kainbainDir>/.kainbain/` —
// git-ignored engine state that no branch ever carries — so the deletion
// survives every git-level resurrection. scanTasks consults the tombstone
// and purges a resurrected directory instead of importing it.
import path from "node:path";
import fs from "node:fs";
import { resolveKainbainDir } from "../kainbainDir.js";
import { loadStateFile } from "../flow/loadStateFile.js";
import { saveStateFile } from "../flow/saveStateFile.js";

const TOMBSTONE_FILE_NAME = "deleted-tasks.json";
const TOMBSTONE_STATE_VERSION = 1;
// Bound the tombstone set so a long-lived project never grows it unbounded;
// deletions older than this are dropped (a resurrection that old is not a
// live concern, and the on-disk dir is gone anyway after the first purge).
const MAX_TOMBSTONES_KEPT = 5000;

/***
 * MARK: tombstonePathFor
 * @description Absolute path of the project's deletion-tombstone state file.
 * @example tombstonePathFor('/repo', {}) => '/repo/.kainbain/deleted-tasks.json'
 * @param {string} baseDir - Project root.
 * @param {Object} [project] - Project record (custom kainbain dir name).
 * @returns {string|null} Null when no base dir is known.
 ***/
export function tombstonePathFor(baseDir, project) {
	const dir = resolveKainbainDir(baseDir, project);
	return dir ? path.join(dir, TOMBSTONE_FILE_NAME) : null;
}

/***
 * MARK: loadDeletedTaskIds
 * @description Reads the tombstone set for a project. Corrupt or missing
 *   state reads as an empty set — a tombstone must never break a scan.
 * @param {string} baseDir - Project root.
 * @param {Object} [project] - Project record.
 * @returns {Set<string>} Deleted task ids.
 ***/
export function loadDeletedTaskIds(baseDir, project) {
	const file = tombstonePathFor(baseDir, project);
	if (!file) return new Set();
	const raw = loadStateFile(
		file,
		(v) => {
			const list = Array.isArray(v?.deletedTaskIds) ? v.deletedTaskIds : [];
			return new Set(list.filter((id) => typeof id === "string" && id));
		},
		() => {},
	);
	return raw instanceof Set ? raw : new Set();
}

function _persist(file, ids) {
	if (!file) return;
	saveStateFile(
		file,
		{
			version: TOMBSTONE_STATE_VERSION,
			deletedTaskIds: [...ids].slice(-MAX_TOMBSTONES_KEPT),
		},
		() => {},
	);
}

/***
 * MARK: recordTaskDeletion
 * @description Adds a task id to the project's tombstone set (persisted).
 *   Never throws: a tombstone is best-effort hardening, and the in-memory
 *   save guard covers the same-session case regardless.
 * @param {string} baseDir - Project root.
 * @param {Object} [project] - Project record.
 * @param {string} taskId
 * @returns {boolean} True when the tombstone was persisted.
 ***/
export function recordTaskDeletion(baseDir, project, taskId) {
	if (!baseDir || !taskId) return false;
	const file = tombstonePathFor(baseDir, project);
	if (!file) return false;
	try {
		const ids = loadDeletedTaskIds(baseDir, project);
		if (ids.has(String(taskId))) return true;
		ids.add(String(taskId));
		_persist(file, ids);
		return true;
	} catch {
		return false;
	}
}

/***
 * MARK: isTaskDeleted
 * @description Whether a task id carries a deletion tombstone.
 * @param {string} baseDir - Project root.
 * @param {Object} [project] - Project record.
 * @param {string} taskId
 * @returns {boolean}
 ***/
export function isTaskDeleted(baseDir, project, taskId) {
	if (!baseDir || !taskId) return false;
	try {
		return loadDeletedTaskIds(baseDir, project).has(String(taskId));
	} catch {
		return false;
	}
}

/***
 * MARK: clearTaskDeletions
 * @description Drops all tombstones for a project (used when the whole
 *   tasks store is wiped, so a fresh task can never be mistaken for a
 *   deleted one).
 * @param {string} baseDir - Project root.
 * @param {Object} [project] - Project record.
 * @returns {void}
 ***/
export function clearTaskDeletions(baseDir, project) {
	const file = tombstonePathFor(baseDir, project);
	if (!file) return;
	try {
		/* eslint-disable-next-line security/detect-non-literal-fs-filename -- engine state path derived from the project root */
		if (fs.existsSync(file)) fs.rmSync(file, { force: true });
	} catch {
		// Best-effort.
	}
}
