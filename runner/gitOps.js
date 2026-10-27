import { runGit } from "./project.js";

/***
 * MARK: commitAndPush
 * @description Stage-end git handoff (ADR 0009 step 6): stages all worktree
 *   changes, commits on the task branch (skips the commit when the tree is
 *   clean), and pushes only when the repo has an origin — grandfathered
 *   local-only repos report `no-remote`, matching `pushBranchIfRemote`
 *   today. Returns the resulting SHA for the completion report (D2: the
 *   backend verifies presence before accepting).
 * @example await commitAndPush({ workdir: '/w/kb-t1', branch: 'kb/t1', message: 'stage done' }) => { sha: 'abc...', pushed: false }
 * @param {Object} opts - Options.
 * @param {string} opts.workdir - Task worktree.
 * @param {string} opts.branch - Task branch.
 * @param {string} opts.message - Commit message.
 * @param {string} [opts.author] - Per-Runner commit identity (WP-4.1 push attribution), e.g. `kainbain-runner/host-1`. Recorded with `git -c` overrides so repo config is never touched.
 * @returns {Promise<Object>} `{ sha, pushed, skipped }`.
 ***/
export async function commitAndPush({ workdir, branch, message, author = "", taskDocsPath = "" }) {
	await runGit(workdir, ["add", "-A"]);
	// Task docs (plans/reports) must reach the backend even on branches whose
	// .gitignore predates tracked task storage — force-add that one folder.
	if (taskDocsPath) {
		try { await runGit(workdir, ["add", "-f", "--", taskDocsPath]); } catch { /* folder absent: nothing to rescue */ }
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
		return { sha, pushed, skipped, pushSkipped };
	}
	await runGit(workdir, ["push", "origin", `${branch}:${branch}`]);
	pushed = true;
	pushSkipped = null;
	return { sha, pushed, skipped, pushSkipped };
}
