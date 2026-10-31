import { git } from "./exec.js";
import { _assertValidBranchName } from "./validation.js";
import { currentBranch, hasCommits, isGitRepository } from "./status.js";
import { defaultBranch } from "./branch.js";
import { getWorkingTreeStatus } from "./workingTreeStatus.js";


/***
 * MARK: hasRemote
 * @description Whether the repository has a remote with the given name
 *   (default 'origin'). Exit-code driven and never throws for a missing
 *   remote: a pure-local repository simply reports false so callers can skip
 *   push entirely.
 * @example await hasRemote('/repo') => true
 * @example await hasRemote('/local-only-repo') => false
 * @param {string} projectCwd - Working directory for the command.
 * @param {string} [name='origin'] - Remote name to look up.
 * @returns {Promise<boolean>}
 ***/
export async function hasRemote(projectCwd, name = "origin") {
	const remote =
		typeof name === "string" && name.trim() ? name.trim() : "origin";
	if (/^-/.test(remote) || /[\s\\'"`$]/.test(remote) || remote.length > 255) {
		return false;
	}
	try {
		await git(projectCwd, ["remote", "get-url", remote]);
		return true;
	} catch {
		return false;
	}
}


/***
 * MARK: pushBranchIfRemote
 * @description Pushes the given branch to the remote, but only when a remote
 *   exists. Pure-local repositories resolve { pushed: false, skipped:
 *   'no-remote' } with zero push spawned. The first push uses `git push -u`
 *   so the branch tracks the remote; later pushes are plain. Push failures
 *   (auth, network, unreachable remote) reject with a GitError so the caller
 *   can log a warning and continue — a failed push must never fail a stage
 *   whose work already passed.
 * @example await pushBranchIfRemote('/repo', 'kb/task-1') => { pushed: true, skipped: null }
 * @param {string} projectCwd - Working directory for the command.
 * @param {string} branch - Branch to push.
 * @param {Object} [opts]
 * @param {string} [opts.remote='origin'] - Remote name to push to.
 * @param {boolean} [opts.setUpstream] - Force or skip `-u`; defaults to auto-detect (first push sets upstream).
 * @param {number} [opts.timeout=120000] - Push command timeout in ms.
 * @returns {Promise<{pushed: boolean, skipped: string|null}>}
 ***/
export async function pushBranchIfRemote(projectCwd, branch, opts = {}) {
	_assertValidBranchName(branch, "push");
	const remote =
		typeof opts.remote === "string" && opts.remote.trim()
			? opts.remote.trim()
			: "origin";
	if (!(await hasRemote(projectCwd, remote))) {
		return { pushed: false, skipped: "no-remote" };
	}
	let setUpstream = opts.setUpstream;
	if (typeof setUpstream !== "boolean") {
		try {
			await git(projectCwd, [
				"rev-parse",
				"--abbrev-ref",
				"--symbolic-full-name",
				`${branch}@{upstream}`,
			]);
			setUpstream = false;
		} catch {
			setUpstream = true;
		}
	}
	const args = setUpstream
		? ["push", "-u", remote, branch]
		: ["push", remote, branch];
	await git(projectCwd, args, { timeout: opts.timeout || 120000 });
	return { pushed: true, skipped: null };
}


/***
 * MARK: convergeDivergedBranch
 * @description Converges a DIVERGED default branch (local ahead AND behind
 *   the remote) without touching any worktree: builds the merge with
 *   plumbing (`merge-tree --write-tree` + `commit-tree`), pushes the merge
 *   commit to the remote branch (a fast-forward, because the remote tip is
 *   one of its parents), and leaves the local ref alone — the caller then
 *   moves the ref to the refreshed tracking tip. This closes the dead end
 *   where a diverged local main made the pre-deploy tip sync skip
 *   (`local-ahead`) while a plain push of the ahead commits is rejected
 *   non-fast-forward, so deploy.sh's tip guard parked every retry forever.
 *   Never orphans work: a conflicting merge or a failed push returns
 *   `{ ok: false, skipped }` and nothing is reset or pushed.
 * @param {string} projectCwd - Working directory for the commands.
 * @param {Object} opts
 * @param {string} opts.remote - Remote name.
 * @param {string} opts.mainBranch - Default branch name.
 * @param {string} opts.localSha - Local tip sha (ahead side).
 * @param {string} opts.remoteSha - Remote tip sha (behind side).
 * @param {number} [opts.timeout=60000] - Per-command timeout in ms.
 * @returns {Promise<{ok: boolean, skipped?: string, mergeSha?: string, detail: string}>}
 ***/
async function convergeDivergedBranch(projectCwd, { remote, mainBranch, localSha, remoteSha, timeout = 60000 }) {
	const firstLine = (msg) => String(msg ?? "").split("\n")[0];
	const short = (sha) => (typeof sha === "string" && sha ? sha.slice(0, 7) : "unknown");
	const isSha = (sha) => typeof sha === "string" && /^[0-9a-f]{40}$/i.test(sha);
	if (!isSha(localSha) || !isSha(remoteSha)) {
		return { ok: false, skipped: "diverged-unmergeable", detail: "cannot converge: local/remote tip is not a commit sha" };
	}
	let treeSha = null;
	try {
		const { stdout } = await git(projectCwd, ["merge-tree", "--write-tree", localSha, remoteSha], { timeout });
		treeSha = String(stdout).trim().split("\n")[0] || null;
	} catch (e) {
		return {
			ok: false,
			skipped: "diverged-unmergeable",
			detail: `local '${mainBranch}' ${short(localSha)} and '${remote}/${mainBranch}' ${short(remoteSha)} do not auto-merge (${firstLine(e?.message)}) — nothing reset or pushed; resolve the divergence manually`,
		};
	}
	if (!isSha(treeSha)) {
		return { ok: false, skipped: "diverged-unmergeable", detail: "merge-tree produced no tree — nothing reset or pushed" };
	}
	let mergeSha = null;
	try {
		const { stdout } = await git(projectCwd, [
			"-c", "user.name=KainBain Sync",
			"-c", "user.email=kainbain-sync@local",
			"commit-tree", treeSha,
			"-p", localSha,
			"-p", remoteSha,
			"-m", `Merge '${remote}/${mainBranch}' into '${mainBranch}' (pre-publish tip convergence)`,
		], { timeout });
		mergeSha = String(stdout).trim() || null;
	} catch (e) {
		return { ok: false, skipped: "merge-commit-failed", detail: `could not build the convergence merge: ${firstLine(e?.message)}` };
	}
	if (!isSha(mergeSha)) {
		return { ok: false, skipped: "merge-commit-failed", detail: "commit-tree produced no sha" };
	}
	try {
		await git(projectCwd, ["push", remote, `${mergeSha}:refs/heads/${mainBranch}`], { timeout });
	} catch (e) {
		return {
			ok: false,
			skipped: "push-failed",
			detail: `could not land convergence merge ${short(mergeSha)} on '${remote}/${mainBranch}' (${firstLine(e?.message)}) — local commits are untouched; push manually once the remote accepts it`,
		};
	}
	return {
		ok: true,
		mergeSha,
		detail: `diverged '${mainBranch}' converged: merge ${short(mergeSha)} of '${remote}/${mainBranch}' ${short(remoteSha)} pushed to '${remote}/${mainBranch}' (fast-forward)`,
	};
}

/***
 * MARK: syncDefaultBranchToRemote
 * @description Makes the local default branch (main/master) match the remote
 *   source of truth: fetches the remote, then hard-resets the local default
 *   ref to the remote tracking ref. Tracked modifications on the default
 *   branch are discarded by the reset — the remote is authoritative — while
 *   untracked files are left untouched (reset never deletes them; the
 *   clean-tree guard still reports genuinely precious untracked user files).
 *   Hard rule: a local ref that is purely AHEAD of the remote (unpushed
 *   commits — e.g. a just-landed merge whose push failed) is NEVER reset.
 *   Resetting it would orphan completed work and trap the task in a land-it,
 *   lose-it, land-it-again loop, so the sync skips loudly
 *   (`skipped: 'local-ahead'`) and the caller proceeds on the ahead line; a
 *   host-side push job is expected to publish the ahead commits shortly
 *   after. A DIVERGED ref (ahead AND behind) is instead converged safely:
 *   the remote tip is merged into the local tip via plumbing, the merge is
 *   pushed to the remote branch (fast-forward), and the local ref is then
 *   moved to the new tip — so HEAD ends on origin's tip and downstream tip
 *   guards (e.g. deploy.sh's) pass on the same run. A conflicting divergence
 *   or a failed push skips loudly without touching anything. Pure-local
 *   repositories, missing remotes/refs, and failed fetches resolve to a
 *   warn-only `{ synced: false, skipped }` — never a throw — so callers
 *   treat sync as best-effort freshness, not a gate.
 *   Never throws: every failure mode resolves to a skipped result with
 *   `detail` for audit logging.
 * @example await syncDefaultBranchToRemote('/repo') => { synced: true, mainBranch: 'main', before: 'abc', after: 'def' }
 * @param {string} projectCwd - Working directory for the command.
 * @param {Object} [opts]
 * @param {string} [opts.remote='origin'] - Remote name holding the truth.
 * @param {string} [opts.mainBranch] - Default branch to sync (resolved via defaultBranch() when omitted).
 * @param {number} [opts.timeout=60000] - Fetch command timeout in ms.
 * @returns {Promise<{synced: boolean, skipped: string|null, remote: string, mainBranch: string|null, before: string|null, after: string|null, ahead: number|null, behind: number|null, detail: string|null}>}
 ***/
export async function syncDefaultBranchToRemote(projectCwd, opts = {}) {
	const remote =
		typeof opts.remote === "string" && opts.remote.trim()
			? opts.remote.trim()
			: "origin";
	const timeout =
		typeof opts.timeout === "number" && opts.timeout > 0
			? opts.timeout
			: 60000;
	const done = (partial) => ({
		synced: false,
		skipped: null,
		remote,
		mainBranch: null,
		before: null,
		after: null,
		ahead: null,
		behind: null,
		detail: null,
		...partial,
	});
	try {
		if (/^-/.test(remote) || /[\s\\'"`$]/.test(remote) || remote.length > 255) {
			return done({ skipped: "bad-remote", detail: `invalid remote name '${remote}'` });
		}
		let repo = false;
		try {
			repo = await isGitRepository(projectCwd);
		} catch {
			repo = false;
		}
		if (!repo) return done({ skipped: "no-git" });
		let commits = false;
		try {
			commits = await hasCommits(projectCwd);
		} catch {
			commits = false;
		}
		if (!commits) return done({ skipped: "no-commits" });
		if (!(await hasRemote(projectCwd, remote))) {
			return done({ skipped: "no-remote" });
		}
		let mainBranch = null;
		if (typeof opts.mainBranch === "string" && opts.mainBranch.trim()) {
			mainBranch = opts.mainBranch.trim();
		} else {
			try {
				mainBranch = await defaultBranch(projectCwd);
			} catch {
				mainBranch = null;
			}
		}
		if (!mainBranch) return done({ skipped: "no-main" });
		try {
			_assertValidBranchName(mainBranch, "sync default branch");
		} catch (e) {
			return done({ skipped: "bad-branch", detail: e?.message || String(e) });
		}
		try {
			await git(projectCwd, ["fetch", remote], { timeout });
		} catch (e) {
			return done({
				mainBranch,
				skipped: "fetch-failed",
				detail: e?.message || String(e),
			});
		}
		const tracking = `${remote}/${mainBranch}`;
		let remoteSha = null;
		try {
			const { stdout } = await git(projectCwd, [
				"rev-parse",
				"--verify",
				tracking,
			]);
			remoteSha = stdout.trim() || null;
		} catch {
			remoteSha = null;
		}
		if (!remoteSha) {
			return done({
				mainBranch,
				skipped: "no-remote-ref",
				detail: `remote ref '${tracking}' does not exist`,
			});
		}
		let localSha = null;
		try {
			const { stdout } = await git(projectCwd, [
				"rev-parse",
				"--verify",
				mainBranch,
			]);
			localSha = stdout.trim() || null;
		} catch {
			localSha = null;
		}
		if (localSha === remoteSha) {
			// Same tip, but the checkout may still carry uncommitted tracked
			// modifications (operator edits with no new remote commits):
			// reset those away so the tree is clean for the next operation.
			// Untracked files survive the reset; the clean-tree guard still
			// reports genuinely precious ones loudly.
			let currentEq = null;
			try {
				currentEq = await currentBranch(projectCwd);
			} catch {
				currentEq = null;
			}
			if (currentEq === mainBranch) {
				let dirty = 0;
				try {
					dirty = (await getWorkingTreeStatus(projectCwd, {})).dirtyPaths.length;
				} catch {
					dirty = 0;
				}
				if (dirty > 0) {
					try {
						await git(projectCwd, ["reset", "--hard", tracking]);
					} catch (e) {
						return done({
							mainBranch,
							before: localSha,
							after: remoteSha,
							skipped: "ref-update-failed",
							detail: e?.message || String(e),
						});
					}
					return done({
						synced: true,
						skipped: null,
						mainBranch,
						before: localSha,
						after: remoteSha,
						ahead: 0,
						discardedPaths: dirty,
						detail: `discarded ${dirty} tracked path(s) on '${mainBranch}' (remote is authoritative; prior state in reflog)`,
					});
				}
			}
			return done({
				mainBranch,
				before: localSha,
				after: remoteSha,
				skipped: "already-in-sync",
			});
		}
		// Local-only commits ahead of the remote are counted for the audit
		// line (best-effort; a failed read is "unknown", never a sync
		// failure), alongside how far the remote has moved past the local
		// tip (behind). A purely ahead ref STOPS HERE: resetting it would
		// orphan completed work (e.g. a just-landed merge whose push
		// failed), trapping the task in a land-it, lose-it, land-it-again
		// loop. The caller proceeds on the ahead line and reports the skip
		// loudly. A DIVERGED ref (ahead AND behind) is different: neither a
		// reset (orphans the ahead commits) nor a plain push (rejected
		// non-fast-forward) can converge it, which used to dead-end the
		// pre-deploy tip sync and park deploy.sh's tip guard on every retry.
		// Converge it instead: merge the remote tip into the local tip via
		// plumbing, push the merge (a fast-forward for the remote), refresh
		// the tracking ref, and fall through to the shared ref move below so
		// HEAD ends exactly on the integration tip.
		let ahead = null;
		if (localSha) {
			try {
				const { stdout } = await git(projectCwd, [
					"rev-list",
					"--count",
					`${remoteSha}..${localSha}`,
				]);
				const n = Number.parseInt(String(stdout).trim(), 10);
				ahead = Number.isInteger(n) ? n : null;
			} catch {
				ahead = null;
			}
		} else {
			ahead = 0;
		}
		let behind = null;
		if (localSha) {
			try {
				const { stdout } = await git(projectCwd, [
					"rev-list",
					"--count",
					`${localSha}..${remoteSha}`,
				]);
				const n = Number.parseInt(String(stdout).trim(), 10);
				behind = Number.isInteger(n) ? n : null;
			} catch {
				behind = null;
			}
		} else {
			behind = 0;
		}
		let convergedDetail = null;
		if (
			typeof ahead === "number" &&
			ahead > 0 &&
			typeof behind === "number" &&
			behind > 0
		) {
			const conv = await convergeDivergedBranch(projectCwd, {
				remote,
				mainBranch,
				localSha,
				remoteSha,
				timeout,
			});
			if (!conv.ok) {
				return done({
					mainBranch,
					before: localSha,
					after: localSha,
					ahead,
					behind,
					skipped: conv.skipped,
					detail: conv.detail,
				});
			}
			convergedDetail = conv.detail;
			// Refresh the tracking ref so the ref move below lands on the
			// merge that was just pushed (or on whatever the remote holds
			// now if a concurrent push won the race).
			try {
				await git(projectCwd, ["fetch", remote, mainBranch], { timeout });
				const { stdout } = await git(projectCwd, [
					"rev-parse",
					"--verify",
					tracking,
				]);
				remoteSha = stdout.trim() || remoteSha;
			} catch {
				// Keep the pre-push remoteSha: the ref move below still
				// verifies the tracking ref itself.
			}
		}
		if (typeof ahead === "number" && ahead > 0 && !convergedDetail) {
			return done({
				mainBranch,
				before: localSha,
				after: localSha,
				ahead,
				behind,
				skipped: "local-ahead",
				detail: `local '${mainBranch}' is ${ahead} commit(s) ahead of '${remote}/${mainBranch}' — refusing to reset so unpushed work (e.g. a landed merge) is never orphaned; proceeding on the ahead line`,
			});
		}
		let current = null;
		try {
			current = await currentBranch(projectCwd);
		} catch {
			current = null;
		}
		// Tracked modifications discarded by the reset below (best-effort
		// count for the audit line; engine-ignored paths never count).
		let discardedPaths = null;
		if (current === mainBranch) {
			try {
				const { dirtyPaths } = await getWorkingTreeStatus(projectCwd, {});
				discardedPaths = dirtyPaths.length;
			} catch {
				discardedPaths = null;
			}
		}
		try {
			if (current === mainBranch) {
				await git(projectCwd, ["reset", "--hard", tracking]);
			} else if (!localSha) {
				await git(projectCwd, ["branch", mainBranch, tracking]);
			} else {
				// The default branch is not checked out here: move the ref
				// directly. Refused when another linked worktree holds the
				// checkout — that skips warn-only below instead of touching
				// a sibling tree.
				await git(projectCwd, ["branch", "-f", mainBranch, tracking]);
			}
		} catch (e) {
			return done({
				mainBranch,
				before: localSha,
				after: remoteSha,
				ahead,
				behind,
				skipped: "ref-update-failed",
				detail: e?.message || String(e),
			});
		}
		const discardedDetail =
			typeof discardedPaths === "number" && discardedPaths > 0
				? `discarded ${discardedPaths} tracked path(s) on '${mainBranch}' (remote is authoritative; prior state in reflog)`
				: null;
		return done({
			synced: true,
			skipped: null,
			mainBranch,
			before: localSha,
			after: remoteSha,
			ahead,
			behind,
			discardedPaths,
			detail: [convergedDetail, discardedDetail].filter(Boolean).join("; ") || null,
		});
	} catch (e) {
		return done({ skipped: "error", detail: e?.message || String(e) });
	}
}


