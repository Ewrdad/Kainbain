import { git } from "./exec.js";
import fs from "node:fs";
import path from "node:path";
import { GitDirtyTreeError } from "./errors.js";
import { DEFAULT_KAINBAIN_DIR_NAME, resolveKainbainDirName } from "../kainbainDir.js";
import { normalizeRepoKey } from "../work/gitLock.js";
import { getWorkingTreeStatus } from "./workingTreeStatus.js";
import { _resolveIgnorePaths, _parsePorcelainEntries } from "./workingTreeStatus.js";

/***
 * MARK: SWEEPABLE_DIR_PREFIXES
 * @description Engine-owned scratch directories whose stray contents are
 *   safe to sweep during dirty-tree recovery: task quarantine drop zones
 *   and temp work areas. Anything outside these prefixes (or not matching
 *   SWEEPABLE_BASENAME_PATTERNS) is never swept — user files always survive
 *   to the detailed failure report instead.
 ***/
export const SWEEPABLE_DIR_PREFIXES = [
	`${DEFAULT_KAINBAIN_DIR_NAME}/tmp/`,
	`${DEFAULT_KAINBAIN_DIR_NAME}/quarantine/`,
];


/***
 * MARK: SWEEPABLE_BASENAME_PATTERNS
 * @description Basename patterns for unambiguous machine debris (crashed
 *   editors, aborted tool runs) that the sweep step may delete. Kept
 *   deliberately narrow: build outputs (`*.log`, `dist/`) may be meaningful
 *   to the operator, so they survive to the failure report instead.
 ***/
export const SWEEPABLE_BASENAME_PATTERNS = [
	/^\.DS_Store$/i,
	/^Thumbs\.db$/i,
	/\.tmp$/i,
	/\.temp$/i,
	/~$/,
	/\.bak$/i,
	/\.orig$/i,
	/\.rej$/i,
];


/***
 * MARK: _resolveSweepablePrefixes
 * @description The engine-owned sweep prefixes for a project hint: the
 *   default `.kainbain/` debris prefixes always apply, plus the same
 *   suffixes under the project's custom state folder when one is set.
 * @example _resolveSweepablePrefixes({ project: { kainbainDirName: '.kb' } })
 * @param {Object} [opts] - assessDirtyTree options (project, kainbainDirName).
 * @returns {Array<string>}
 * @private
 ***/
function _resolveSweepablePrefixes(opts = {}) {
	const hint =
		opts.project ||
		(opts.kainbainDirName !== undefined
			? { kainbainDirName: opts.kainbainDirName }
			: null);
	const names = new Set([DEFAULT_KAINBAIN_DIR_NAME]);
	if (hint) names.add(resolveKainbainDirName(hint));
	const prefixes = new Set(SWEEPABLE_DIR_PREFIXES);
	for (const name of names) {
		if (name === DEFAULT_KAINBAIN_DIR_NAME) continue;
		for (const prefix of SWEEPABLE_DIR_PREFIXES) {
			prefixes.add(prefix.replace(DEFAULT_KAINBAIN_DIR_NAME, name));
		}
	}
	return [...prefixes];
}


/***
 * MARK: _isSweepablePath
 * @description Whether an untracked dirty path is engine debris the sweep
 *   step may delete. Directories are swept only under engine-owned prefixes;
 *   anywhere else only single files matching the basename patterns qualify.
 * @private
 ***/
function _isSweepablePath(repoPath, prefixes = SWEEPABLE_DIR_PREFIXES) {
	const p = String(repoPath || "").replace(/\\/g, "/");
	if (!p) return false;
	if (prefixes.some((prefix) => p === prefix.slice(0, -1) || p.startsWith(prefix))) {
		return true;
	}
	const base = p.split("/").pop();
	return SWEEPABLE_BASENAME_PATTERNS.some((re) => re.test(base));
}


/***
 * MARK: dirtyTreeRecoveryJournal
 * @description Audit trail of dirty-tree recovery ladder runs that swept or
 *   stashed anything (bounded: the newest entries win). Task-level flows
 *   drain their repository's entries via drainDirtyTreeRecoveries and write
 *   them into task history + process logs, so every auto-sweep and marked
 *   stash stays auditable for Tier 1 resume.
 * @private
 ***/
const dirtyTreeRecoveryJournal = [];
const DIRTY_TREE_JOURNAL_MAX = 100;


/***
 * MARK: drainDirtyTreeRecoveries
 * @description Removes and returns this repository's journaled dirty-tree
 *   recovery runs for audit. Empty when the ladder never acted (the common
 *   case: clean trees and opted-out guards journal nothing).
 * @example await drainDirtyTreeRecoveries(cwd) => [{ recovered, stashRef, recoveryAttempts }]
 * @param {string} projectCwd - Repository working directory.
 * @returns {Promise<Array<{repoKey: string, cwd: string, taskId: string|null, recovered: boolean, stashRef: string|null, recoveryAttempts: Array, recoveredAt: string}>>}
 ***/
export async function drainDirtyTreeRecoveries(projectCwd) {
	const repoKey = await normalizeRepoKey(projectCwd);
	const found = dirtyTreeRecoveryJournal.filter((e) => e.repoKey === repoKey);
	for (const entry of found) {
		const at = dirtyTreeRecoveryJournal.indexOf(entry);
		if (at !== -1) dirtyTreeRecoveryJournal.splice(at, 1);
	}
	return found;
}


/***
 * MARK: formatDirtyTreeRecoveryNotice
 * @description One human audit line for a journaled ladder run, shared by
 *   every task-level drain site so history entries read identically.
 * @example formatDirtyTreeRecoveryNotice({ recovered: true, stashRef: 'abc' }) => "Dirty-tree recovery …"
 * @param {Object} entry - Journal entry from drainDirtyTreeRecoveries.
 * @returns {string} Human-readable audit line.
 ***/
export function formatDirtyTreeRecoveryNotice(entry) {
	const steps = (entry?.recoveryAttempts || [])
		.map((a) => {
			if (a.step === "sweep")
				return `swept ${a.removed?.length || 0} artifact(s)`;
			if (a.step === "stash")
				return a.ref
					? `stashed to '${a.ref}'`
					: `stash skipped (${a.detail || "no tracked changes"})`;
			return a.step;
		})
		.join("; ");
	return (
		`Dirty-tree recovery ${entry?.recovered ? "restored a clean tree" : "ran without restoring a clean tree"}` +
		(steps ? ` (${steps})` : "")
	);
}


/***
 * MARK: _sweepDirtyArtifacts
 * @description Step 1 of the ladder: deletes untracked engine-debris paths.
 *   Files are unlinked; directories are removed recursively ONLY under
 *   engine-owned prefixes (SWEEPABLE_DIR_PREFIXES) — anything else is left
 *   for the failure report. Never throws: per-path failures are recorded on
 *   the attempt and the path stays for step 3 reporting.
 * @private
 ***/
async function _sweepDirtyArtifacts(projectCwd, sweepablePaths, enginePrefixes = SWEEPABLE_DIR_PREFIXES) {
	const removed = [];
	const failed = [];
	for (const repoPath of sweepablePaths) {
		const abs = path.join(String(projectCwd || ""), repoPath);
		const norm = String(repoPath).replace(/\\/g, "/");
		const underEnginePrefix = enginePrefixes.some(
			(prefix) => norm === prefix.slice(0, -1) || norm.startsWith(prefix),
		);
		try {
			/* eslint-disable-next-line security/detect-non-literal-fs-filename -- abs is the engine-resolved repo path of a ladder-classified artifact */
			const stat = await fs.promises.stat(abs).catch(() => null);
			if (!stat) continue;
			if (stat.isDirectory()) {
				if (!underEnginePrefix) {
					failed.push({ path: repoPath, reason: "directory outside engine prefix" });
					continue;
				}
				await fs.promises.rm(abs, { recursive: true, force: true });
			} else {
				/* eslint-disable-next-line security/detect-non-literal-fs-filename -- abs is the engine-resolved repo path of a ladder-classified artifact */
				await fs.promises.unlink(abs);
			}
			removed.push(repoPath);
		} catch (err) {
			failed.push({ path: repoPath, reason: err?.message || String(err) });
		}
	}
	return { removed, failed };
}


/***
 * MARK: recoverDirtyTree
 * @description Ordered auto-recovery ladder, run before a dirty tree parks a
 *   task or raises GitDirtyTreeError:
 *     1. Ignored-artifact sweep: delete untracked engine debris (see
 *        SWEEPABLE_BASENAME_PATTERNS / SWEEPABLE_DIR_PREFIXES — never user
 *        files), then re-assess.
 *     2. Stash with task marker: `git stash push -m "kainbain-task-<taskId>"`
 *        preserves tracked modifications (untracked files stay for step 3
 *        reporting), then re-assess. The stash ref is returned so Tier 1
 *        resume can restore it.
 *     3. Detailed failure report: the caller (requireCleanWorkingTree)
 *        throws GitDirtyTreeError carrying every blocking path plus the
 *        full `recoveryAttempts` trail.
 *   Runs that sweep or stash anything are journaled for
 *   drainDirtyTreeRecoveries; already-clean trees journal nothing.
 * @example await recoverDirtyTree('/repo', { taskId: 't-1' }) => { recovered: true, recoveryAttempts: [...], stashRef }
 * @param {string} projectCwd
 * @param {Object} [opts]
 * @param {string} [opts.taskId] - Task id for the stash marker (defaults to 'auto').
 * @param {Object} [opts.statusOpts] - getWorkingTreeStatus/assessDirtyTree options (ignorePaths, project, docsDirName).
 * @returns {Promise<{recovered: boolean, alreadyClean: boolean, dirtyPaths: Array<string>, recoveryAttempts: Array, stashRef: string|null}>}
 ***/
export async function recoverDirtyTree(projectCwd, opts = {}) {
	const taskId = typeof opts.taskId === "string" && opts.taskId ? opts.taskId : "auto";
	const statusOpts = opts.statusOpts || opts;
	const recoveryAttempts = [];
	let stashRef = null;

	let assessment = await assessDirtyTree(projectCwd, statusOpts);
	if (assessment.clean) {
		return {
			recovered: true,
			alreadyClean: true,
			dirtyPaths: [],
			recoveryAttempts,
			stashRef,
		};
	}

	const sweepablePrefixes = _resolveSweepablePrefixes(statusOpts);
	if (assessment.sweepablePaths.length > 0) {
		const { removed, failed } = await _sweepDirtyArtifacts(
			projectCwd,
			assessment.sweepablePaths,
			sweepablePrefixes,
		);
		recoveryAttempts.push({
			step: "sweep",
			ok: failed.length === 0,
			removed,
			failed,
			detail: (() => {
				if (removed.length === 0) return "no sweepable artifacts could be removed";
				const extra =
					removed.length > 10 ? ` (+${removed.length - 10} more)` : "";
				return `removed ${removed.length} ignored artifact(s): ${removed.slice(0, 10).join(", ")}${extra}`;
			})(),
		});
		assessment = await assessDirtyTree(projectCwd, statusOpts);
	}

	if (!assessment.clean && assessment.stashablePaths.length > 0) {
		const marker = `kainbain-task-${taskId}`;
		try {
			await git(projectCwd, ["stash", "push", "-m", marker]);
			try {
				const { stdout } = await git(projectCwd, [
					"rev-parse",
					"--verify",
					"refs/stash",
				]);
				stashRef = stdout.trim() || null;
			} catch {
				stashRef = null;
			}
			recoveryAttempts.push({
				step: "stash",
				ok: true,
				marker,
				ref: stashRef,
				stashed: assessment.stashablePaths,
				detail: `stashed ${assessment.stashablePaths.length} tracked path(s) with marker '${marker}'${stashRef ? ` (ref ${stashRef})` : ""} — restore on resume with 'git stash pop'`,
			});
		} catch (err) {
			recoveryAttempts.push({
				step: "stash",
				ok: false,
				marker,
				ref: null,
				stashed: [],
				detail: `stash with marker '${marker}' failed: ${err?.message || err}`,
			});
		}
		assessment = await assessDirtyTree(projectCwd, statusOpts);
	}

	const recovered = assessment.clean;
	if (recoveryAttempts.length > 0) {
		const repoKey = await normalizeRepoKey(projectCwd);
		dirtyTreeRecoveryJournal.push({
			repoKey,
			cwd: String(projectCwd),
			taskId: taskId === "auto" ? null : taskId,
			recovered,
			stashRef,
			recoveryAttempts: recoveryAttempts.map((a) => ({ ...a })),
			recoveredAt: new Date().toISOString(),
		});
		while (dirtyTreeRecoveryJournal.length > DIRTY_TREE_JOURNAL_MAX) {
			dirtyTreeRecoveryJournal.shift();
		}
	}
	return {
		recovered,
		alreadyClean: false,
		dirtyPaths: assessment.dirtyPaths,
		recoveryAttempts,
		stashRef,
	};
}


/***
 * MARK: _formatLadderReport
 * @description Renders the recovery-attempt trail for the GitDirtyTreeError
 *   message and the Tier 3 failback prompt: what was tried, what moved, and
 *   the exact paths still blocking.
 * @private
 ***/
function _formatLadderReport(recoveryAttempts, dirtyPaths) {
	const lines = [];
	for (const attempt of recoveryAttempts) {
		if (attempt.step === "sweep") {
			lines.push(`- Ignored-artifact sweep: ${attempt.detail}`);
		} else if (attempt.step === "stash") {
			lines.push(`- Stash with task marker: ${attempt.detail}`);
		}
	}
	if (dirtyPaths.length > 0) {
		lines.push(
			`- Still blocked by ${dirtyPaths.length} path(s): ${dirtyPaths.slice(0, 10).join(", ")}${dirtyPaths.length > 10 ? ` (+${dirtyPaths.length - 10} more)` : ""}`,
		);
	}
	return lines.join("\n");
}


/***
 * MARK: requireCleanWorkingTree
 * @description Hard guard: runs the dirty-tree recovery ladder (sweep, marked
 *   stash, detailed report) and throws GitDirtyTreeError — listing every
 *   offending path plus the full `recoveryAttempts` trail — only when the
 *   tree is still dirty afterwards. Callers MUST invoke this before any
 *   branch switch so uncommitted work can never be lost. Pass
 *   `{ recovery: 'off' }` for the legacy immediate-throw behavior (used by
 *   read-only or explicitly strict paths); pass `{ taskId }` so the stash
 *   marker names the owning task for Tier 1 resume.
 * @example await requireCleanWorkingTree(cwd); // throws if dirty
 * @param {string} projectCwd
 * @param {Object} [opts]
 * @param {string} [opts.context] - Human string included in the error, e.g. 'checkout'.
 * @param {string} [opts.recovery] - 'ladder' (default) or 'off'.
 * @param {string} [opts.taskId] - Task id for the stash marker.
 * @returns {Promise<{clean: boolean, recoveryAttempts: Array, stashRef: string|null}>}
 ***/
export async function requireCleanWorkingTree(projectCwd, opts = {}) {
	if (opts.recovery === "off") {
		const { clean, dirtyPaths } = await getWorkingTreeStatus(projectCwd, opts);
		if (!clean) {
			throw new GitDirtyTreeError(
				`Working tree is not clean${opts.context ? ` (refusing ${opts.context})` : ""}: ${dirtyPaths.slice(0, 10).join(", ")}${dirtyPaths.length > 10 ? ` (+${dirtyPaths.length - 10} more)` : ""}. Commit or stash your changes first — switching branches now could lose work.`,
				{ dirtyPaths, recoveryAttempts: [] },
			);
		}
		return { clean: true, recoveryAttempts: [], stashRef: null };
	}
	const ladder = await recoverDirtyTree(projectCwd, {
		taskId: opts.taskId,
		statusOpts: opts,
	});
	if (ladder.recovered) {
		return {
			clean: true,
			recoveryAttempts: ladder.recoveryAttempts,
			stashRef: ladder.stashRef,
		};
	}
	const ladderReport = _formatLadderReport(
		ladder.recoveryAttempts,
		ladder.dirtyPaths,
	);
	throw new GitDirtyTreeError(
		`Working tree is not clean${opts.context ? ` (refusing ${opts.context})` : ""}: ${ladder.dirtyPaths.slice(0, 10).join(", ")}${ladder.dirtyPaths.length > 10 ? ` (+${ladder.dirtyPaths.length - 10} more)` : ""}. Commit or stash your changes first — switching branches now could lose work.` +
			(ladderReport ? `\n[Dirty-tree recovery ladder]\n${ladderReport}` : ""),
		{ dirtyPaths: ladder.dirtyPaths, recoveryAttempts: ladder.recoveryAttempts },
	);
}

/***
 * MARK: assessDirtyTree
 * @description Classifies the working tree without mutating it: the pure
 *   assessment half of the dirty-tree recovery ladder. `dirtyPaths` is the
 *   full non-ignored set (the same set `getWorkingTreeStatus` reports);
 *   `sweepablePaths` are untracked engine-debris paths the sweep step may
 *   delete; `stashablePaths` are tracked modifications a marked stash can
 *   preserve; `blockingPaths` are everything else (untracked user files that
 *   can only be reported, never swept or stashed).
 * @example await assessDirtyTree('/repo') => { clean: false, dirtyPaths: [...], sweepablePaths: [...], ... }
 * @param {string} projectCwd
 * @param {Object} [opts] - getWorkingTreeStatus options (ignorePaths, project, docsDirName, kainbainDirName).
 * @returns {Promise<{clean: boolean, dirtyPaths: Array<string>, sweepablePaths: Array<string>, stashablePaths: Array<string>, blockingPaths: Array<string>}>}
 ***/
export async function assessDirtyTree(projectCwd, opts = {}) {
	const ignorePaths = _resolveIgnorePaths(opts);
	const sweepablePrefixes = _resolveSweepablePrefixes(opts);
	const { stdout } = await git(projectCwd, ["status", "--porcelain", "-uall"]);
	const dirtyPaths = [];
	const sweepablePaths = [];
	const stashablePaths = [];
	const blockingPaths = [];
	for (const { status, path: rawPath } of _parsePorcelainEntries(stdout)) {
		const p = rawPath.replace(/\\/g, "/").replace(/["']/g, "");
		const ignored = ignorePaths.some((prefix) => {
			const normPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
			return p === prefix || p.startsWith(normPrefix);
		});
		if (ignored) continue;
		dirtyPaths.push(rawPath);
		const untracked = status === "??";
		if (untracked && _isSweepablePath(p, sweepablePrefixes)) {
			sweepablePaths.push(rawPath);
		} else if (!untracked) {
			stashablePaths.push(rawPath);
		} else {
			blockingPaths.push(rawPath);
		}
	}
	return {
		clean: dirtyPaths.length === 0,
		dirtyPaths,
		sweepablePaths,
		stashablePaths,
		blockingPaths,
	};
}

