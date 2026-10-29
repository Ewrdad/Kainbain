import fs from "node:fs";
import path from "node:path";
import { RunnerGitError, runGit } from "./project.js";

const PUSH_RETRY_BUDGET = 3;

function pushRejectedNonFastForward(err) {
	return /non-fast-forward|fetch first|failed to push some refs/i.test(
		`${err?.message || ""}\n${err?.stderr || ""}\n${err?.stdout || ""}`,
	);
}

async function listConflictedFiles(workdir) {
	try {
		const { stdout } = await runGit(workdir, ["diff", "--name-only", "--diff-filter=U"]);
		return stdout.split("\n").map((l) => l.trim()).filter(Boolean);
	} catch {
		return [];
	}
}

/***
 * MARK: integrateUpstream
 * @description Merges `origin/<branch>` into the local `<branch>` (the
 *   task-branch equivalent of a developer pulling before pushing). A clean
 *   merge (fast-forward or merge commit) returns `{ integrated: true }`.
 *   A conflict aborts back to the pre-merge tree and throws RunnerGitError
 *   `sync-conflict` with the conflicted file list — the caller reports it
 *   as structured data; the integration Runner never resolves code.
 * @example await integrateUpstream({ workdir: '/w', branch: 'kb/t1' }) => { integrated: true }
 ***/
export async function integrateUpstream({ workdir, branch, author = "" }) {
	const name = (typeof author === "string" && author.trim()) || "KainBain Runner";
	let remoteSha = null;
	try {
		remoteSha = (await runGit(workdir, ["rev-parse", "--verify", `origin/${branch}`])).stdout.trim() || null;
	} catch {
		return { integrated: false, reason: "no-upstream" };
	}
	if (!remoteSha) return { integrated: false, reason: "no-upstream" };
	let localSha = null;
	try {
		localSha = (await runGit(workdir, ["rev-parse", "--verify", branch])).stdout.trim() || null;
	} catch {
		localSha = null;
	}
	if (localSha === remoteSha) return { integrated: true, reason: "already-in-sync" };
	try {
		await runGit(workdir, [
			"-c", `user.name=${name}`,
			"-c", "user.email=kainbain-runner@local",
			"merge", "--no-edit", `origin/${branch}`,
		]);
		return { integrated: true, reason: "merged" };
	} catch (err) {
		const conflicted = await listConflictedFiles(workdir);
		const looksLikeConflict =
			conflicted.length > 0 ||
			/CONFLICT|Automatic merge failed|unmerged/i.test(`${err?.message || ""}\n${err?.stderr || ""}\n${err?.stdout || ""}`);
		try {
			await runGit(workdir, ["merge", "--abort"]);
		} catch {
			// Best effort: the tree may already be clean.
		}
		if (looksLikeConflict) {
			throw new RunnerGitError("sync-conflict", `merging origin/${branch} into ${branch} conflicts (${conflicted.join(", ") || "unknown files"}) — refusing to resolve on the push path`, { cwd: workdir });
		}
		throw err;
	}
}

/***
 * MARK: commitAndPush
 * @description Stage-end git handoff (ADR 0009 step 6): stages all worktree
 *   changes, commits on the task branch (skips the commit when the tree is
 *   clean), integrates the latest `origin/<branch>` (fetch + merge, like a
 *   developer pulling before pushing), and pushes with a bounded retry on
 *   non-fast-forward rejection — only when the repo has an origin.
 *   Grandfathered local-only repos report `no-remote`, matching
 *   `pushBranchIfRemote` today. Conflicts while integrating throw
 *   RunnerGitError `sync-conflict` (structured, never resolved here).
 *   Returns the resulting SHA for the completion report (D2: the
 *   backend verifies presence before accepting).
 * @example await commitAndPush({ workdir: '/w/kb-t1', branch: 'kb/t1', message: 'stage done' }) => { sha: 'abc...', pushed: false }
 * @param {Object} opts - Options.
 * @param {string} opts.workdir - Task worktree.
 * @param {string} opts.branch - Task branch.
 * @param {string} opts.message - Commit message.
 * @param {string} [opts.author] - Per-Runner commit identity (WP-4.1 push attribution), e.g. `kainbain-runner/host-1`. Recorded with `git -c` overrides so repo config is never touched.
 * @returns {Promise<Object>} `{ sha, pushed, skipped, beforeSha, pushState }`.
 ***/
export async function commitAndPush({ workdir, branch, message, author = "", taskDocsPath = "" }) {
	const beforeSha = await runGit(workdir, ["rev-parse", "HEAD"]).then((r) => r.stdout.trim()).catch(() => null);
	await runGit(workdir, ["add", "-A"]);
	// Task docs (plans/reports) must reach the backend even on branches whose
	// .gitignore predates tracked task storage — force-add that one folder,
	// EXCEPT the backend-owned `task.md` live snapshot. Committing task.md
	// on the task branch while the backend holds an untracked copy on main
	// is what produced the untracked-overwrite merge failures (a5228675):
	// the snapshot travels back as a completion payload instead.
	if (taskDocsPath) {
		try {
			const docsDir = path.join(workdir, taskDocsPath);
			const names = fs.readdirSync(docsDir);
			const addable = names.filter((n) => n !== "task.md");
			if (addable.length > 0) {
				await runGit(workdir, [
					"add", "-f", "--",
					...addable.map((n) => path.join(taskDocsPath, n)),
				]);
			}
		} catch { /* folder absent: nothing to rescue */ }
	}
	const status = await runGit(workdir, ["status", "--porcelain"]);
	let skipped = false;
	if (!status.stdout.trim()) {
		skipped = true;
	} else if (typeof author === "string" && author.trim()) {
		await runGit(workdir, [
			"-c",
			`user.name=${author.trim()}`,
			"-c",
			"user.email=kainbain-runner@local",
			"commit",
			"-m",
			message,
		]);
	} else {
		await runGit(workdir, ["commit", "-m", message]);
	}
	const sha = (await runGit(workdir, ["rev-parse", "HEAD"])).stdout.trim();

	let pushed = false;
	let pushSkipped = "no-remote";
	try {
		await runGit(workdir, ["remote", "get-url", "origin"]);
	} catch {
		return { sha, pushed, skipped, pushSkipped, beforeSha, pushState: "no-remote" };
	}
	// Integrate-then-push: a stage that started on a stale base merges the
	// latest remote task-branch work (a sibling stage's push) before
	// publishing, like a developer pulling before pushing. Conflicts are
	// structured failures, never resolved on this path.
	let pushState = "pushed";
	let attempts = 0;
	for (;;) {
		attempts += 1;
		try {
			await runGit(workdir, ["fetch", "origin"]);
			await integrateUpstream({ workdir, branch, author });
			await runGit(workdir, ["push", "origin", `${branch}:${branch}`]);
			pushed = true;
			pushSkipped = null;
			if (attempts > 1) pushState = "pushed-after-retry";
			const finalSha = (await runGit(workdir, ["rev-parse", "HEAD"])).stdout.trim();
			return { sha: finalSha, pushed, skipped, pushSkipped, beforeSha, pushState };
		} catch (err) {
			if (err instanceof RunnerGitError && err.code === "sync-conflict") throw err;
			if (/could not read Username|Authentication failed|Could not resolve host|unable to connect/i.test(`${err?.message || ""}\n${err?.stderr || ""}`)) {
				throw new RunnerGitError("sync-failed", `cannot reach origin to publish ${branch}: ${String(err?.message || err).split("\n")[0]}`, { cwd: workdir });
			}
			if (pushRejectedNonFastForward(err) && attempts < PUSH_RETRY_BUDGET) continue;
			throw err;
		}
	}
}
