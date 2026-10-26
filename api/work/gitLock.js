// Domain: The Work — the single serialization gate for git operations.
import fs from "node:fs";
import path from "node:path";

/***
 * MARK: repoChains
 * @description Tail promise per normalized repository key. Each newcomer
 *   chains behind the current tail, so at most one `fn` per repository runs
 *   at a time. Tails never reject (rejections are swallowed on the chain —
 *   the error still propagates to the holder's own caller).
 * @private
 ***/
const repoChains = new Map();

/***
 * MARK: repoCounters
 * @description Per-repository contention counters, exposed read-only through
 *   getGitLockStats for the observability snapshot next to schedulerStats.
 * @private
 ***/
const repoCounters = new Map();

function _countFor(key) {
	let counters = repoCounters.get(key);
	if (!counters) {
		counters = { acquisitions: 0, waits: 0 };
		repoCounters.set(key, counters);
	}
	return counters;
}

/***
 * MARK: normalizeRepoKey
 * @description Resolves the mutex key for a working directory: the real path
 *   when the directory exists (so symlinked/aliased checkouts share one
 *   gate), otherwise the normalized input. Never throws — an unresolvable
 *   path still gets a stable, private gate instead of failing the git op.
 * @example await normalizeRepoKey('/tmp/x') => '/private/tmp/x'
 * @param {string} cwd - Working directory for the git operation.
 * @returns {Promise<string>} Stable mutex key for the repository.
 ***/
export async function normalizeRepoKey(cwd) {
	const raw = typeof cwd === "string" ? cwd : "";
	const normalized = raw.trim() ? path.resolve(raw) : raw;
	if (!normalized) return "";
	try {
		const gitPath = path.join(normalized, ".git");
		try {
			/* eslint-disable-next-line security/detect-non-literal-fs-filename */
			const stat = await fs.promises.stat(gitPath);
			if (stat.isFile()) {
				/* eslint-disable-next-line security/detect-non-literal-fs-filename */
				const content = await fs.promises.readFile(gitPath, "utf8");
				const match = content.match(/^gitdir:\s*(.+)$/m);
				if (match) {
					const targetGitDir = path.resolve(normalized, match[1].trim());
					if (targetGitDir.includes(`${path.sep}worktrees${path.sep}`)) {
						const mainGitDir = path.resolve(targetGitDir, "..", "..");
						const mainRepo = path.dirname(mainGitDir);
						/* eslint-disable-next-line security/detect-non-literal-fs-filename */
						return await fs.promises.realpath(mainRepo);
					}
				}
			}
		} catch {
			// fallback to standard realpath probe
		}
		/* eslint-disable-next-line security/detect-non-literal-fs-filename -- path.resolve normalizes the engine-provided cwd before the realpath probe */
		return await fs.promises.realpath(normalized);
	} catch {
		return normalized;
	}
}

/***
 * MARK: withRepoGitLock
 * @description Runs `fn` under the per-repository git mutex: the single
 *   serialization gate every engine git operation passes through (taken
 *   inside `git()` in `api/git.js`, so callers never take it directly).
 *   Different repositories proceed in parallel; the same repository strictly
 *   serializes, which is what makes concurrent branch operations
 *   (task creation, approvals, running stages) unable to collide on
 *   `.git/index.lock`. The lock always releases — including when `fn`
 *   throws — so a failed op can never wedge later git work.
 *
 *   NOT reentrant: `fn` must never enter `withRepoGitLock` for the same
 *   repository again (directly or via another helper that takes it). Take
 *   the gate at exactly one level — `git()` owns it; composed helpers
 *   (`ensureTaskBranch`, `finalizeTaskBranch`, the merge stage) rely on it
 *   instead of re-taking it.
 * @example await withRepoGitLock(cwd, () => fs.promises.readFile(path.join(cwd, ".git", "HEAD"), "utf8"))
 *   (raw filesystem work only — never call `git()` inside `fn`: `git()`
 *   already takes this gate, and the mutex is not reentrant, so nesting
 *   would deadlock waiting on itself)
 * @param {string} cwd - Working directory (mutex scope).
 * @param {Function} fn - Async work to run exclusively per repository.
 * @returns {Promise<*>} Whatever `fn` resolves.
 ***/
export async function withRepoGitLock(cwd, fn) {
	const key = await normalizeRepoKey(cwd);
	const counters = _countFor(key);
	counters.acquisitions += 1;
	// A newcomer chaining behind a live tail is queued demand, so it counts
	// as one wait. Checking chain presence here (rather than a held flag set
	// later, after `await prior`) keeps the count independent of which
	// contender's `normalizeRepoKey` resolves first.
	if (repoChains.has(key)) counters.waits += 1;

	const prior = repoChains.get(key) || Promise.resolve();
	let releaseMine;
	const mine = new Promise((resolve) => {
		releaseMine = resolve;
	});
	const tail = prior.then(
		() => mine,
		() => mine,
	);
	repoChains.set(key, tail);

	// A predecessor's failure must not break the chain for later waiters;
	// awaiting here only yields our turn, it never surfaces their error.
	try {
		await prior;
	} catch {
		// The predecessor already delivered its own error to its caller.
	}

	try {
		return await fn();
	} finally {
		releaseMine();
		if (repoChains.get(key) === tail) repoChains.delete(key);
	}
}

/***
 * MARK: getGitLockStats
 * @description Read-only contention snapshot for observability: per-repo
 *   acquisitions/waits plus totals. `waits > 0` proves the gate is actually
 *   serializing concurrent git demand; a repo whose waits keep climbing
 *   while stages pile up points at a bypass outside the gate.
 * @example getGitLockStats() => { repos: {...}, totals: { acquisitions: 1, waits: 0 } }
 * @returns {{repos: Object, totals: {acquisitions: number, waits: number}}}
 ***/
export function getGitLockStats() {
	const repos = {};
	let acquisitions = 0;
	let waits = 0;
	for (const [key, counters] of repoCounters.entries()) {
		repos[key] = { ...counters };
		acquisitions += counters.acquisitions;
		waits += counters.waits;
	}
	return { repos, totals: { acquisitions, waits } };
}
