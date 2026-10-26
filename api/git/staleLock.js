import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { normalizeRepoKey } from "../work/gitLock.js";
import { GitError } from "./errors.js";

/***
 * MARK: STALE_GIT_LOCK_AGE_MS
 * @description A `.git/index.lock` younger than this is never auto-removed:
 *   it may belong to a live git process whose holder scan cannot see (a
 *   process starting between scan and check, an unreadable /proc entry).
 *   Older than this with no live git process anywhere, the lock is an
 *   orphan from a crashed/killed git and safe to clear. Fail closed always.
 * @example STALE_GIT_LOCK_AGE_MS => 30000
 ***/
export const STALE_GIT_LOCK_AGE_MS = 30000;


/***
 * MARK: staleLockRecoveryJournal
 * @description Audit trail of every auto-cleared stale lock (bounded: the
 *   newest entries win). `git()` records here; task-level flows drain their
 *   repository's entries via drainGitLockRecoveries and write them into task
 *   history + process logs, so operators can always see what was removed.
 * @private
 ***/
const staleLockRecoveryJournal = [];
const STALE_LOCK_JOURNAL_MAX = 100;


/***
 * MARK: defaultListLiveGitProcesses
 * @description Read-only holder scan: every live `git` process on this
 *   machine (any repository — scoping a pid to one repo is unreliable, so
 *   any live git counts as a possible holder and blocks recovery). Prefers
 *   a /proc cmdline scan on Linux, falls back to `ps -eo args`, and reports
 *   `inconclusive: true` when neither source works. Never kills anything.
 * @example await defaultListLiveGitProcesses() => { holders: [], inconclusive: false }
 * @returns {Promise<{holders: Array<{pid: number, command: string}>, inconclusive: boolean}>}
 ***/
async function defaultListLiveGitProcesses() {
	const isGitArgv = (cmdline) => {
		const first = String(cmdline || "").split("\0")[0];
		const base = first.split("/").pop();
		return base === "git" || base === "git.exe";
	};
	try {
		/* eslint-disable security/detect-non-literal-fs-filename -- /proc scan reads numeric pid dirs only */
		const entries = await fs.promises.readdir("/proc");
		const holders = [];
		let unreadable = 0;
		for (const entry of entries) {
			if (!/^\d+$/.test(entry)) continue;
			let cmdline;
			try {
				cmdline = await fs.promises.readFile(`/proc/${entry}/cmdline`, "utf8");
			} catch {
				unreadable += 1;
				continue;
			}
			if (isGitArgv(cmdline)) {
				holders.push({
					pid: Number(entry),
					command: cmdline.split("\0").slice(0, 3).join(" "),
				});
			}
		}
		/* eslint-enable security/detect-non-literal-fs-filename */
		if (holders.length > 0 || unreadable === 0) {
			return { holders, inconclusive: false };
		}
		// Some processes were unreadable: resolve them through ps (whose
		// output is world-readable) instead of guessing.
	} catch {
		// No /proc (non-Linux): fall through to ps.
	}
	try {
		if (typeof execFile !== "function")
			return { holders: [], inconclusive: true };
		const stdout = await new Promise((resolve, reject) => {
			execFile("ps", ["-eo", "args"], (err, out) =>
				err ? reject(err) : resolve(String(out || "")),
			);
		});
		const holders = [];
		for (const line of stdout.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			const first = trimmed.split(/\s+/)[0];
			const base = first.split("/").pop();
			if (base === "git" || base === "git.exe") {
				holders.push({ pid: null, command: trimmed.slice(0, 120) });
			}
		}
		return { holders, inconclusive: false };
	} catch {
		return { holders: [], inconclusive: true };
	}
}


/***
 * MARK: _resolveGitDir
 * @description Resolves the git dir holding this checkout's `index.lock`.
 *   A plain checkout uses `<cwd>/.git/`; a linked worktree uses a `.git`
 *   FILE pointing at its per-worktree gitdir (e.g.
 *   `<main>/.git/worktrees/<name>/`), whose own `index.lock` is what blocks
 *   worktree ops. Returns null when no git dir can be resolved (fail closed).
 * @private
 * @param {string} projectCwd - Repository working directory.
 * @returns {Promise<string|null>} Absolute git dir, or null.
 ***/
async function _resolveGitDir(projectCwd) {
	const gitPath = path.join(String(projectCwd || ""), ".git");
	let stat = null;
	try {
		/* eslint-disable-next-line security/detect-non-literal-fs-filename -- engine git dir derived from the validated project cwd */
		stat = await fs.promises.stat(gitPath);
	} catch {
		return null;
	}
	if (stat.isDirectory()) return gitPath;
	if (stat.isFile()) {
		try {
			/* eslint-disable-next-line security/detect-non-literal-fs-filename -- worktree pointer read from the engine-resolved checkout path */
			const content = await fs.promises.readFile(gitPath, "utf8");
			const match = content.match(/^gitdir:\s*(.+)$/m);
			if (match) {
				const target = path.resolve(String(projectCwd || ""), match[1].trim());
				/* eslint-disable-next-line security/detect-non-literal-fs-filename -- worktree gitdir resolved from the checkout's own pointer */
				const targetStat = await fs.promises.stat(target).catch(() => null);
				if (targetStat && targetStat.isDirectory()) return target;
			}
		} catch {
			return null;
		}
	}
	return null;
}


/***
 * MARK: maybeRecoverStaleLock
 * @description Fail-closed stale-lock assessment for a repository whose git
 *   op just failed with a lock signature. Deletes the checkout's
 *   `index.lock` ONLY when all three hold: the lock file exists (resolved
 *   worktree-aware, so linked-worktree locks are found at their own gitdir
 *   instead of misreported as missing), no live git process exists
 *   anywhere (a live process in ANY repo blocks recovery — never kill the
 *   holder, never steal its lock), and the lock is older than
 *   STALE_GIT_LOCK_AGE_MS (process-age verification: a lock younger than
 *   the threshold may belong to a just-spawned process the holder scan
 *   cannot see yet). Ownership verification is the machine-wide holder scan
 *   plus the age check; every refusal names its reason plus the verification
 *   basis so the surfaced error tells the operator exactly what to check.
 * @example await maybeRecoverStaleLock(cwd) => { recovered: true, lockPath, ageMs, verificationBasis }
 * @param {string} projectCwd - Repository working directory.
 * @param {Object} [opts] - Unit-test seams (production always defaults).
 * @param {number} [opts.nowMs=Date.now()] - Clock for the age check.
 * @param {Function} [opts.listLiveGitProcesses=defaultListLiveGitProcesses] - Holder scan override.
 * @returns {Promise<{recovered: boolean, reason: string, lockPath: string|null, ageMs: number|null, holders: Array, verificationBasis: string}>}
 ***/
export async function maybeRecoverStaleLock(
	projectCwd,
	{
		nowMs = Date.now(),
		listLiveGitProcesses = defaultListLiveGitProcesses,
	} = {},
) {
	const gitDir = await _resolveGitDir(projectCwd);
	if (!gitDir) {
		return {
			recovered: false,
			reason: "no-git-dir",
			lockPath: null,
			ageMs: null,
			holders: [],
			verificationBasis: "unresolvable-git-dir",
		};
	}
	const lockPath = path.join(gitDir, "index.lock");
	let lockStat = null;
	try {
		/* eslint-disable-next-line security/detect-non-literal-fs-filename -- lock path derived from the validated project cwd */
		lockStat = await fs.promises.stat(lockPath);
	} catch {
		lockStat = null;
	}
	if (!lockStat) {
		return {
			recovered: false,
			reason: "no-lock-file",
			lockPath: null,
			ageMs: null,
			holders: [],
			verificationBasis: "no-lock-file-present",
		};
	}
	const scan = await listLiveGitProcesses();
	const holders = Array.isArray(scan?.holders) ? scan.holders : [];
	if (holders.length > 0) {
		return {
			recovered: false,
			reason: "live-holder",
			lockPath,
			ageMs: null,
			holders,
			verificationBasis: `machine-wide holder scan found ${holders.length} live git process(es) — ownership unverified, lock left in place`,
		};
	}
	if (scan?.inconclusive) {
		return {
			recovered: false,
			reason: "unknown-holder",
			lockPath,
			ageMs: null,
			holders: [],
			verificationBasis:
				"holder scan inconclusive (/proc and ps both unavailable) — ownership unverified, lock left in place",
		};
	}
	const ageMs = nowMs - lockStat.mtimeMs;
	const ageS = Math.max(0, Math.floor(ageMs / 1000));
	if (!(ageMs >= STALE_GIT_LOCK_AGE_MS)) {
		return {
			recovered: false,
			reason: "fresh-lock",
			lockPath,
			ageMs: Math.max(0, Math.floor(ageMs)),
			holders: [],
			verificationBasis: `holder scan clear but lock age ${ageS}s < ${STALE_GIT_LOCK_AGE_MS / 1000}s threshold — may belong to a just-spawned process, lock left in place`,
		};
	}
	const verificationBasis = `machine-wide holder scan clear (no live git process) and lock age ${ageS}s >= ${STALE_GIT_LOCK_AGE_MS / 1000}s threshold`;
	/* eslint-disable-next-line security/detect-non-literal-fs-filename -- lock path derived from the validated project cwd; holder scan proved no live git */
	await fs.promises.unlink(lockPath);
	const repoKey = await normalizeRepoKey(projectCwd);
	staleLockRecoveryJournal.push({
		repoKey,
		cwd: String(projectCwd),
		lockPath,
		ageMs: Math.floor(ageMs),
		verificationBasis,
		recoveredAt: new Date(nowMs).toISOString(),
	});
	while (staleLockRecoveryJournal.length > STALE_LOCK_JOURNAL_MAX) {
		staleLockRecoveryJournal.shift();
	}
	return {
		recovered: true,
		reason: "stale-recovered",
		lockPath,
		ageMs: Math.floor(ageMs),
		holders: [],
		verificationBasis,
	};
}


/***
 * MARK: _withLockCheckSuffix
 * @description Appends the fail-closed assessment to a lock failure so the
 *   surfaced error tells the operator what was checked and what to do next
 *   (instead of git's generic "remove the file manually" advice when a live
 *   process may own it).
 * @private
 ***/
export function _withLockCheckSuffix(err, recovery) {
	let detail = "stale-lock check: no recoverable stale lock — lock left in place";
	if (recovery.reason === "live-holder") {
		detail =
			`stale-lock check: ${recovery.holders.length} live git process(es) found (` +
			`${(recovery.holders[0] && recovery.holders[0].command) || "git"}) — lock left in place; ` +
			"stop that process or wait for it to finish";
	} else if (recovery.reason === "fresh-lock") {
		detail =
			"stale-lock check: lock is fresh (may belong to a just-started process) " +
			"— lock left in place; retry the stage shortly";
	} else if (recovery.reason === "unknown-holder") {
		detail =
			"stale-lock check: holder scan inconclusive — lock left in place; " +
			"remove .git/index.lock manually only when no git process is alive";
	}
	if (err && typeof err === "object" && typeof err.message === "string") {
		const augmented = new GitError(`${err.message} [${detail}]`, {
			code: err.code,
			args: err.args,
			stdout: err.stdout,
			stderr: err.stderr,
		});
		augmented.name = err.name || "GitError";
		return augmented;
	}
	return err;
}


/***
 * MARK: drainGitLockRecoveries
 * @description Removes and returns this repository's journaled stale-lock
 *   recoveries for audit. Task-level flows call this after successful git
 *   work and write each entry into task history + process logs. Empty when
 *   nothing was recovered (the common case).
 * @example await drainGitLockRecoveries(cwd) => [{ lockPath, ageMs, recoveredAt }]
 * @param {string} projectCwd - Repository working directory.
 * @returns {Promise<Array<{repoKey: string, cwd: string, lockPath: string, ageMs: number, recoveredAt: string}>>}
 ***/
export async function drainGitLockRecoveries(projectCwd) {
	const repoKey = await normalizeRepoKey(projectCwd);
	const found = staleLockRecoveryJournal.filter((e) => e.repoKey === repoKey);
	for (const entry of found) {
		const at = staleLockRecoveryJournal.indexOf(entry);
		if (at !== -1) staleLockRecoveryJournal.splice(at, 1);
	}
	return found;
}


/***
 * MARK: formatGitLockRecoveryNotice
 * @description One human audit line for a journaled recovery, shared by
 *   every task-level drain site so history entries read identically.
 * @example formatGitLockRecoveryNotice({ lockPath: '/r/.git/index.lock', ageMs: 87000 }) => "Recovered stale git lock ..."
 * @param {Object} entry - Journal entry from drainGitLockRecoveries.
 * @returns {string} Human-readable audit line.
 ***/
export function formatGitLockRecoveryNotice(entry) {
	const ageS = Math.max(0, Math.round((entry?.ageMs || 0) / 1000));
	const basis = entry?.verificationBasis
		? ` [verification: ${entry.verificationBasis}]`
		: "";
	return (
		`Recovered stale git lock '${entry?.lockPath || ".git/index.lock"}' ` +
		`(age ${ageS}s, no live git process held it) and retried the operation${basis}`
	);
}


