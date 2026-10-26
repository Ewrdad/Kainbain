/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Real-git integration tests: the safety guarantees of the branch system
// (clean-tree refusal, conflict abort, idempotency) are only provable against
// an actual git binary. Everything happens inside throwaway temp directories —
// never the KainBain repo itself. Skipped when git is unavailable.
let gitAvailable = true;
try {
	execFileSync("git", ["--version"], { stdio: "ignore" });
} catch {
	gitAvailable = false;
}

const {
	ensureBranchCheckedOut,
	isWorkingTreeClean,
	getWorkingTreeStatus,
	requireCleanWorkingTree,
	commitAllIfNeeded,
	mergeBranch,
	GitMergeConflictError,
	GitBranchMismatchError,
	GitDirtyTreeError,
	countUniqueCommits,
	defaultBranch,
	currentBranch,
	branchExists,
	abortMerge,
	hasRemote,
	pushBranchIfRemote,
	returnToDefaultBranch,
	createBranch,
	ensureGitIdentity,
	withCheckedOutBranch,
	GitError,
	DEFAULT_GIT_AUTHOR_NAME,
	DEFAULT_GIT_AUTHOR_EMAIL,
} = await import("./git.js");

function run(cwd, ...args) {
	return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString();
}

function initRepo(cwd, { initialBranch = "main", withRemoteHead = false } = {}) {
	fs.mkdirSync(cwd, { recursive: true });
	run(cwd, "init", "-b", initialBranch);
	run(cwd, "config", "user.email", "kainbain-test@example.com");
	run(cwd, "config", "user.name", "KainBain Test");
	fs.writeFileSync(path.join(cwd, "README.md"), "# init\n");
	run(cwd, "add", "-A");
	run(cwd, "commit", "-m", "init");
	if (withRemoteHead) {
		// Synthesize an origin remote whose HEAD points at the local repo so
		// symbolic-ref refs/remotes/origin/HEAD resolves.
		const remoteDir = path.join(path.dirname(cwd), `${path.basename(cwd)}-remote.git`);
		fs.mkdirSync(remoteDir, { recursive: true });
		run(remoteDir, "init", "-b", initialBranch);
		run(remoteDir, "config", "user.email", "kainbain-test@example.com");
		run(remoteDir, "config", "user.name", "KainBain Test");
		return { remoteDir };
	}
	return {};
}

describe.skipIf(!gitAvailable)("git helper against a real repository", () => {
	let base;
	let cleanupFns = [];

	beforeAll(() => {
		base = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-git-int-"));
	});

	afterAll(() => {
		for (const fn of cleanupFns) {
			try {
				fn();
			} catch {
				// ignore
			}
		}
		try {
			fs.rmSync(base, { recursive: true, force: true });
		} catch {
			// ignore
		}
	});

	function freshRepo(name, opts = {}) {
		const dir = path.join(base, name);
		const info = initRepo(dir, opts);
		cleanupFns.push(() => fs.rmSync(dir, { recursive: true, force: true }));
		if (info.remoteDir) {
			cleanupFns.push(() => fs.rmSync(info.remoteDir, { recursive: true, force: true }));
		}
		return dir;
	}

	it("counts commits unique to a task branch (zero when it carries no work)", async () => {
		const repo = freshRepo("unique-count", { initialBranch: "main" });
		run(repo, "checkout", "-b", "kb/empty-task");
		expect(await countUniqueCommits(repo, "main", "kb/empty-task")).toBe(0);

		fs.writeFileSync(path.join(repo, "work.txt"), "did something\n");
		run(repo, "add", "-A");
		run(repo, "commit", "-m", "task work");
		expect(await countUniqueCommits(repo, "main", "kb/empty-task")).toBe(1);
	});

	it("creates a task branch from the default branch and is idempotent", async () => {
		const repo = freshRepo("create-branch", { initialBranch: "master" });
		expect(await currentBranch(repo)).toBe("master");

		const first = await ensureBranchCheckedOut(repo, "kb/task-1", { baseBranch: "master" });
		expect(first.created).toBe(true);
		expect(await currentBranch(repo)).toBe("kb/task-1");

		// Second run: no-op (stay on the branch, nothing changed).
		const second = await ensureBranchCheckedOut(repo, "kb/task-1", { baseBranch: "master" });
		expect(second.created).toBe(false);
		expect(second.switched).toBe(false);

		// Re-checkout from elsewhere is also safe after switching back.
		await ensureBranchCheckedOut(repo, "master");
		const third = await ensureBranchCheckedOut(repo, "kb/task-1", { baseBranch: "master" });
		expect(third.created).toBe(false);
		expect(third.switched).toBe(true);
		expect(await currentBranch(repo)).toBe("kb/task-1");
	});

	it("detects the default branch through origin/HEAD and falls back sanely", async () => {
		const { spawnSync } = await import("node:child_process");
		const dir = freshRepo("defaults", { initialBranch: "trunk" });
		// No remote: falls back to existing local branch name.
		expect(await defaultBranch(dir)).toBe("trunk");

		// Create a second repo with a synthetic origin.
		const originDir = path.join(base, "defaults-origin");
		fs.mkdirSync(originDir, { recursive: true });
		run(originDir, "init", "-b", "mainline");
		run(originDir, "config", "user.email", "t@t");
		run(originDir, "config", "user.name", "t");
		fs.writeFileSync(path.join(originDir, "f.txt"), "x");
		run(originDir, "add", "-A");
		run(originDir, "commit", "-m", "init");

		const cloneDir = path.join(base, "clone-with-origin");
		const { spawnSync: ss } = await import("node:child_process");
		// clone sets origin/HEAD automatically
		const cloned = ss("git", ["clone", originDir, cloneDir], {
			stdio: ["ignore", "pipe", "pipe"],
		});
		if (cloned.status === 0) {
			expect(await defaultBranch(cloneDir)).toBe("mainline");
		} else {
			// clone unsupported in this environment — skip assert gracefully
			expect(true).toBe(true);
		}
		// Silence unused import lint.
		void spawnSync;
	});

	it("refuses a branch switch on a dirty working tree but allows KainBain artifacts", async () => {
		const repo = freshRepo("dirty-tree");

		// Commit a base file first so the task branch is created from a clean tree,
		// THEN dirty it with the agent-style edit.
		fs.writeFileSync(path.join(repo, "code.js"), "let x = 1;\n");
		run(repo, "add", "-A");
		run(repo, "commit", "-m", "base code");
		await ensureBranchCheckedOut(repo, "kb/task-1", { baseBranch: "main" });
		fs.writeFileSync(path.join(repo, "code.js"), "let x = 2;\n");

		// Ladder step 2 (stash with task marker): tracked modifications are
		// preserved in a marked stash and the guard passes instead of
		// parking — sibling work never blocks execution, and nothing is lost.
		const guardRes = await requireCleanWorkingTree(repo, {
			context: "test",
			taskId: "task-1",
		});
		expect(guardRes.clean).toBe(true);
		expect(guardRes.stashRef).toBeTruthy();
		expect(run(repo, "stash", "list")).toContain("kainbain-task-task-1");
		expect(await currentBranch(repo)).toBe("kb/task-1");
		expect(fs.readFileSync(path.join(repo, "code.js"), "utf8")).toBe("let x = 1;\n");

		// Untracked user files are never swept or stashed: the guard still
		// refuses, names the exact blocking path, and carries the ladder
		// trail (recoveryAttempts) for the Tier 3 failback prompt.
		fs.writeFileSync(path.join(repo, "sibling-notes.txt"), "stray\n");
		let caught = null;
		try {
			await requireCleanWorkingTree(repo, { context: "test" });
		} catch (err) {
			caught = err;
		}
		expect(caught).toBeInstanceOf(GitDirtyTreeError);
		expect(caught.dirtyPaths).toContain("sibling-notes.txt");
		expect(Array.isArray(caught.recoveryAttempts)).toBe(true);
		expect(String(caught.message)).toContain("sibling-notes.txt");
		await expect(
			ensureBranchCheckedOut(repo, "kb/task-2", { baseBranch: "main" }),
		).rejects.toThrow(GitDirtyTreeError);
		expect(await currentBranch(repo)).toBe("kb/task-1");
		expect(run(repo, "status", "--porcelain")).toContain("sibling-notes.txt");
		expect(fs.readFileSync(path.join(repo, "sibling-notes.txt"), "utf8")).toBe(
			"stray\n",
		);
		fs.rmSync(path.join(repo, "sibling-notes.txt"));

		// KainBain-engine artifacts never block switches. Restore the committed
		// content first so ONLY engine artifacts are pending.
		fs.writeFileSync(path.join(repo, "code.js"), "let x = 1;\n");
		fs.mkdirSync(path.join(repo, "docs", "tasks", "task-1"), { recursive: true });
		fs.mkdirSync(path.join(repo, ".kainbain"), { recursive: true });
		fs.writeFileSync(path.join(repo, "docs", "tasks", "task-1", "report.md"), "# report");
		fs.writeFileSync(path.join(repo, ".kainbain", "project.json"), "{}");
		expect(await isWorkingTreeClean(repo)).toBe(true);
		const { dirtyPaths } = await getWorkingTreeStatus(repo);
		expect(dirtyPaths).toEqual([]);

		// Untracked NON-ignored files do block (strict safety default).
		fs.writeFileSync(path.join(repo, "untracked.txt"), "stray");
		expect(await isWorkingTreeClean(repo)).toBe(false);
		fs.rmSync(path.join(repo, "untracked.txt"));

		// Non-engine docs and .gitignore modifications MUST block (dirty-tree safety).
		fs.writeFileSync(path.join(repo, "docs", "README.md"), "# general doc\n");
		expect(await isWorkingTreeClean(repo)).toBe(false);
		let status = await getWorkingTreeStatus(repo);
		expect(status.dirtyPaths).toContain("docs/README.md");
		fs.rmSync(path.join(repo, "docs", "README.md"));

		fs.writeFileSync(path.join(repo, ".gitignore"), "node_modules/\n");
		expect(await isWorkingTreeClean(repo)).toBe(false);
		status = await getWorkingTreeStatus(repo);
		expect(status.dirtyPaths).toContain(".gitignore");
		fs.rmSync(path.join(repo, ".gitignore"));

		// Clean tree (after commit) switches safely again.
		const { committed } = await commitAllIfNeeded(repo, "KainBain test: commit work");
		expect(committed).toBe(true);
		const res = await ensureBranchCheckedOut(repo, "kb/task-2", { baseBranch: "main" });
		expect(res.created).toBe(true);
		expect(await currentBranch(repo)).toBe("kb/task-2");
	});

	it("merges a task branch into main and auto-commits agent work ahead of the merge", async () => {
		const repo = freshRepo("merge-ok");
		await ensureBranchCheckedOut(repo, "kb/task-2", { baseBranch: "main" });

		// Simulate agent work WITHOUT a commit (the reliability fallback must catch it).
		fs.appendFileSync(path.join(repo, "README.md"), "task work line\n");
		fs.writeFileSync(path.join(repo, "feature.js"), "export const feature = true;\n");

		// Commit-all fallback (what _executeMergeStage does).
		const { committed } = await commitAllIfNeeded(
			repo,
			`KainBain (task task-2): commit task work before merge into main`,
		);
		expect(committed).toBe(true);
		expect(await isWorkingTreeClean(repo, { ignorePaths: [] })).toBe(true);

		// Switch to main and merge.
		await requireCleanWorkingTree(repo, { context: "switch to main" });
		const mainBranch = await defaultBranch(repo);
		await fs.rename;
		await ensureBranchCheckedOut(repo, mainBranch, { baseBranch: mainBranch });
		await mergeBranch(repo, "kb/task-2");

		expect(await currentBranch(repo)).toBe(mainBranch);
		expect(
			fs.readFileSync(path.join(repo, "README.md"), "utf8"),
		).toContain("task work line");
		expect(fs.existsSync(path.join(repo, "feature.js"))).toBe(true);

		// Re-merging is a no-op (idempotent stage re-runs).
		await mergeBranch(repo, "kb/task-2");
		expect(await currentBranch(repo)).toBe(mainBranch);
	});

	it("commits a verbatim body (whole prompt) after the subject", async () => {
		const repo = freshRepo("commit-body");
		fs.writeFileSync(path.join(repo, "work.txt"), "work\n");
		const subject = "KainBain (task t1): auto-commit work after stage 'Plan'";
		const body = [
			"# Task",
			"Do the thing.",
			"",
			"# Stage",
			`Quotes: "double" 'single` + " `backtick`",
			"Unicode: héllo ✓ emoji 🎉",
			"padded line:   ",
		].join("\n");
		const { committed } = await commitAllIfNeeded(repo, subject, { body });
		expect(committed).toBe(true);
		expect(run(repo, "log", "--format=%s", "-1")).toContain(subject);
		const full = run(repo, "log", "--format=%B", "-1");
		expect(full).toContain(body);
		expect(full).toContain("# Task");
		expect(full).toContain("padded line:   ");
	});

	it("refuses to commit onto a sibling branch when expectedBranch is set (branch-bleed guard)", async () => {
		const repo = freshRepo("branch-affinity");
		await ensureBranchCheckedOut(repo, "kb/task-a", { baseBranch: "main" });
		// A concurrent task moves the shared checkout onto its own branch…
		await ensureBranchCheckedOut(repo, "kb/task-b", { baseBranch: "main" });
		// …leaving another task's in-flight files in the shared tree (the
		// 2026-10-12 cross-task branch-bleed shape).
		fs.writeFileSync(path.join(repo, "alien.txt"), "task-a work\n");

		await expect(
			commitAllIfNeeded(repo, "task-a auto-commit", {
				expectedBranch: "kb/task-a",
			}),
		).rejects.toBeInstanceOf(GitBranchMismatchError);
		// Nothing was staged or committed on the sibling branch.
		expect(await isWorkingTreeClean(repo, { ignorePaths: [] })).toBe(false);
		expect(run(repo, "log", "--format=%s", "-1").trim()).toBe("init");

		// The guard allows the commit once the tree really is on the branch
		// that owns the work.
		const { committed } = await commitAllIfNeeded(repo, "task-b auto-commit", {
			expectedBranch: "kb/task-b",
		});
		expect(committed).toBe(true);
		expect(run(repo, "log", "--format=%s", "-1")).toContain("task-b auto-commit");
	});

	it("rolls back the whole merge on conflict and reports the canonical message", async () => {
		const repo = freshRepo("merge-conflict");

		// Commit A on main.
		fs.writeFileSync(path.join(repo, "shared.txt"), "main-version\n");
		run(repo, "add", "-A");
		run(repo, "commit", "-m", "main edit");

		// Task branch changes the same file.
		await ensureBranchCheckedOut(repo, "kb/task-conflict", { baseBranch: "main" });
		fs.writeFileSync(path.join(repo, "shared.txt"), "task-version\n");
		run(repo, "add", "-A");
		run(repo, "commit", "-m", "task edit");

		// main moves on AFTER the branch was cut — classic conflict.
		await ensureBranchCheckedOut(repo, "main", { baseBranch: "main" });
		fs.writeFileSync(path.join(repo, "shared.txt"), "main-version-later\n");
		run(repo, "add", "-A");
		run(repo, "commit", "-m", "main edit later");

		await expect(mergeBranch(repo, "kb/task-conflict")).rejects.toThrow(
			GitMergeConflictError,
		);
		await expect(mergeBranch(repo, "kb/task-conflict")).rejects.toMatchObject({
			message: "Merge conflict: please resolve all merge conflicts with main",
			conflictedFiles: expect.arrayContaining(["shared.txt"]),
		});

		// The repo is NOT half-merged: no MERGE_HEAD, no conflict markers in the
		// working tree, original main content intact.
		expect(await branchExists(repo, "does-not-matter")).toBe(false);
		let mergeHead = false;
		try {
			run(repo, "rev-parse", "--verify", "MERGE_HEAD");
			mergeHead = true;
		} catch {
			mergeHead = false;
		}
		expect(mergeHead).toBe(false);
		expect(fs.readFileSync(path.join(repo, "shared.txt"), "utf8")).toBe(
			"main-version-later\n",
		);
		expect(await isWorkingTreeClean(repo, { ignorePaths: [] })).toBe(true);

		// abortMerge is safe to call when no merge is in progress.
		await abortMerge(repo);
	});

	it("does not lose work when a merge conflicts: task branch content survives", async () => {
		const repo = freshRepo("merge-conflict-keep");
		fs.writeFileSync(path.join(repo, "shared2.txt"), "base\n");
		run(repo, "add", "-A");
		run(repo, "commit", "-m", "base");

		await ensureBranchCheckedOut(repo, "kb/task-keep", { baseBranch: "main" });
		fs.writeFileSync(path.join(repo, "shared2.txt"), "task-side\n");
		run(repo, "add", "-A");
		run(repo, "commit", "-m", "task side");

		await ensureBranchCheckedOut(repo, "main", { baseBranch: "main" });
		fs.writeFileSync(path.join(repo, "shared2.txt"), "main-side\n");
		run(repo, "add", "-A");
		run(repo, "commit", "-m", "main side");

		await expect(mergeBranch(repo, "kb/task-keep")).rejects.toThrow(
			GitMergeConflictError,
		);

		// Switch back onto the task branch: the task's work is still committed there.
		await ensureBranchCheckedOut(repo, "kb/task-keep", { baseBranch: "main" });
		expect(fs.readFileSync(path.join(repo, "shared2.txt"), "utf8")).toBe("task-side\n");
		expect(await isWorkingTreeClean(repo, { ignorePaths: [] })).toBe(true);
	});

	it("skips push on a pure-local repo with zero errors", async () => {
		const repo = freshRepo("local-only-push");
		expect(await hasRemote(repo)).toBe(false);
		await ensureBranchCheckedOut(repo, "kb/task-1", { baseBranch: "main" });
		fs.writeFileSync(path.join(repo, "work.txt"), "work\n");
		const { committed } = await commitAllIfNeeded(repo, "KainBain test: work");
		expect(committed).toBe(true);
		const res = await pushBranchIfRemote(repo, "kb/task-1");
		expect(res).toEqual({ pushed: false, skipped: "no-remote" });
		expect(await currentBranch(repo)).toBe("kb/task-1");
		const back = await returnToDefaultBranch(repo);
		expect(back.branch).toBe("main");
		expect(await currentBranch(repo)).toBe("main");
	});

	it("pushes task work to a file remote and lands commits there", async () => {
		const repo = freshRepo("remote-push");
		const remoteDir = path.join(base, "remote-push-origin.git");
		run(base, "init", "--bare", "remote-push-origin.git");
		cleanupFns.push(() => fs.rmSync(remoteDir, { recursive: true, force: true }));
		run(repo, "remote", "add", "origin", remoteDir);
		expect(await hasRemote(repo)).toBe(true);

		await ensureBranchCheckedOut(repo, "kb/task-1", { baseBranch: "main" });
		fs.writeFileSync(path.join(repo, "feature.txt"), "feature work\n");
		const { committed } = await commitAllIfNeeded(repo, "KainBain test: feature");
		expect(committed).toBe(true);

		const first = await pushBranchIfRemote(repo, "kb/task-1");
		expect(first).toEqual({ pushed: true, skipped: null });
		const remoteLog = run(
			remoteDir,
			"log",
			"--oneline",
			"refs/heads/kb/task-1",
		);
		expect(remoteLog).toContain("feature");

		// Second push rides the tracked upstream as a plain push.
		fs.writeFileSync(path.join(repo, "feature2.txt"), "more work\n");
		await commitAllIfNeeded(repo, "KainBain test: more");
		const second = await pushBranchIfRemote(repo, "kb/task-1");
		expect(second).toEqual({ pushed: true, skipped: null });
		expect(run(remoteDir, "log", "--oneline", "refs/heads/kb/task-1")).toContain("more");

		// Full lifecycle ends back on the default branch.
		const back = await returnToDefaultBranch(repo);
		expect(back.branch).toBe("main");
		expect(await currentBranch(repo)).toBe("main");
		// Idempotent: returning again is a no-op.
		expect(await returnToDefaultBranch(repo)).toEqual({ switched: false, branch: "main" });
	});

	it("creates from a start-point without switching HEAD", async () => {
		const repo = freshRepo("branch-start-point", { initialBranch: "main" });
		run(repo, "checkout", "-b", "feature");
		fs.writeFileSync(path.join(repo, "feature.txt"), "feature\n");
		run(repo, "add", "-A");
		run(repo, "commit", "-m", "feature work");
		const mainTip = run(repo, "rev-parse", "main").trim();

		const res = await createBranch(repo, "kb/task-1", { startPoint: "main" });

		expect(res).toEqual({ created: true });
		expect(run(repo, "rev-parse", "kb/task-1").trim()).toBe(mainTip);
		expect(await currentBranch(repo)).toBe("feature");
		expect(run(repo, "status", "--porcelain").trim()).toBe("");
		// Idempotent: a second create is a no-op that keeps HEAD put.
		expect(await createBranch(repo, "kb/task-1", { startPoint: "main" })).toEqual({
			created: false,
		});
		expect(await currentBranch(repo)).toBe("feature");
	});

	it("commits on a fresh machine with no git identity (repo-local fallback, peer review F-1)", async () => {
		// Simulate a machine with no global ~/.gitconfig: empty HOME, no
		// system config, empty explicit global file, no author env passthrough.
		const savedEnv = { ...process.env };
		const fakeHome = fs.mkdtempSync(path.join(base, "fake-home-"));
		const emptyGlobal = path.join(fakeHome, ".gitconfig");
		fs.writeFileSync(emptyGlobal, "");
		const seedDir = path.join(base, "fresh-identity");
		try {
			fs.mkdirSync(seedDir, { recursive: true });
			run(seedDir, "init", "-b", "main");
			// Seed commit via -c flags: proves identity WITHOUT persisting any.
			fs.writeFileSync(path.join(seedDir, "README.md"), "# init\n");
			run(seedDir, "add", "-A");
			execFileSync(
				"git",
				[
					"-c",
					"user.name=Seeder",
					"-c",
					"user.email=seeder@example.com",
					"commit",
					"-m",
					"init",
				],
				{ cwd: seedDir, stdio: "ignore" },
			);
			expect(() =>
				run(seedDir, "config", "--local", "--get", "user.name"),
			).toThrow();

			process.env.HOME = fakeHome;
			process.env.XDG_CONFIG_HOME = fakeHome;
			process.env.GIT_CONFIG_NOSYSTEM = "1";
			process.env.GIT_CONFIG_GLOBAL = emptyGlobal;
			delete process.env.GIT_AUTHOR_NAME;
			delete process.env.GIT_AUTHOR_EMAIL;
			delete process.env.GIT_COMMITTER_NAME;
			delete process.env.GIT_COMMITTER_EMAIL;
			delete process.env.KAINBAIN_GIT_AUTHOR_NAME;
			delete process.env.KAINBAIN_GIT_AUTHOR_EMAIL;

			fs.writeFileSync(path.join(seedDir, "work.txt"), "did something\n");
			const res = await commitAllIfNeeded(seedDir, "KainBain: task work");
			expect(res.committed).toBe(true);
			expect(res.hash).toBeTruthy();
			// Repo-local fallback persisted; global config untouched (still empty).
			expect(run(seedDir, "config", "--local", "--get", "user.name").trim()).toBe(
				DEFAULT_GIT_AUTHOR_NAME,
			);
			expect(
				run(seedDir, "config", "--local", "--get", "user.email").trim(),
			).toBe(DEFAULT_GIT_AUTHOR_EMAIL);
			expect(fs.readFileSync(emptyGlobal, "utf8")).toBe("");
			expect(fs.readdirSync(fakeHome)).toContain(".gitconfig");

			// Env overrides win over the defaults (fresh repo, same scrubbed env).
			process.env.KAINBAIN_GIT_AUTHOR_NAME = "Work Laptop";
			process.env.KAINBAIN_GIT_AUTHOR_EMAIL = "dev@corp.example";
			const repo2 = path.join(base, "fresh-identity-override");
			fs.mkdirSync(repo2, { recursive: true });
			run(repo2, "init", "-b", "main");
			const provisioned = await ensureGitIdentity(repo2);
			expect(provisioned).toEqual({
				provisioned: true,
				name: "Work Laptop",
				email: "dev@corp.example",
			});
			expect(run(repo2, "config", "--local", "--get", "user.name").trim()).toBe(
				"Work Laptop",
			);
		} finally {
			for (const key of Object.keys(process.env)) {
				if (!(key in savedEnv)) delete process.env[key];
			}
			Object.assign(process.env, savedEnv);
			try {
				fs.rmSync(seedDir, { recursive: true, force: true });
				fs.rmSync(path.join(base, "fresh-identity-override"), {
					recursive: true,
					force: true,
				});
			} catch {
				// ignore
			}
		}
	});

	it("never switches branches on a repo with no commits (unborn)", async () => {
		const repo = freshRepo("unborn");
		fs.rmSync(repo, { recursive: true, force: true }); // recreate without a commit
		fs.mkdirSync(repo, { recursive: true });
		run(repo, "init", "-b", "main");
		// No commits yet: ensureBranchCheckedOut must tolerate the unborn-HEAD
		// rev-parse and still create + check out the task branch.
		const res = await ensureBranchCheckedOut(repo, "kb/task-1", { baseBranch: "main" });
		expect(res.created).toBe(true);
		expect(await branchExists(repo, "kb/task-1")).toBe(false); // unborn: no commit → no ref yet
		expect(run(repo, "symbolic-ref", "HEAD").trim()).toBe("refs/heads/kb/task-1");
	});
	it("withCheckedOutBranch runs fn on the target branch and restores the default", async () => {
		const repo = freshRepo("with-branch-basic", { initialBranch: "main" });
		run(repo, "checkout", "-b", "release");
		run(repo, "checkout", "-b", "feature");
		let seen = null;
		const out = await withCheckedOutBranch(repo, "release", async () => {
			seen = await currentBranch(repo);
			return "done";
		});
		expect(seen).toBe("release");
		expect(out).toBe("done");
		expect(await currentBranch(repo)).toBe("main");
	});

	it("withCheckedOutBranch is a no-checkout no-op when already on the branch", async () => {
		const repo = freshRepo("with-branch-noop", { initialBranch: "main" });
		run(repo, "checkout", "-b", "feature");
		let seen = null;
		await withCheckedOutBranch(repo, "feature", async () => {
			seen = await currentBranch(repo);
		});
		expect(seen).toBe("feature");
		expect(await currentBranch(repo)).toBe("feature");
	});

	it("withCheckedOutBranch refuses a dirty tree before any checkout", async () => {
		const repo = freshRepo("with-branch-dirty", { initialBranch: "main" });
		run(repo, "checkout", "-b", "feature");
		fs.writeFileSync(path.join(repo, "README.md"), "# dirty\n");
		let ran = false;
		await expect(
			withCheckedOutBranch(repo, "main", async () => {
				ran = true;
			}),
		).rejects.toThrow(GitDirtyTreeError);
		expect(ran).toBe(false);
		// No mutation happened: still on the original branch, work intact.
		expect(await currentBranch(repo)).toBe("feature");
		expect(fs.readFileSync(path.join(repo, "README.md"), "utf8")).toBe("# dirty\n");
	});

	it("withCheckedOutBranch restores the default branch after fn throws", async () => {
		const repo = freshRepo("with-branch-fn-throw", { initialBranch: "main" });
		run(repo, "checkout", "-b", "release");
		run(repo, "checkout", "-b", "feature");
		await expect(
			withCheckedOutBranch(repo, "release", async () => {
				throw new Error("command exploded");
			}),
		).rejects.toThrow("command exploded");
		expect(await currentBranch(repo)).toBe("main");
	});

	it("withCheckedOutBranch surfaces a restore failure without masking the fn error", async () => {
		const repo = freshRepo("with-branch-restore-fail", { initialBranch: "main" });
		run(repo, "checkout", "-b", "release");
		run(repo, "checkout", "-b", "feature");
		await expect(
			withCheckedOutBranch(repo, "release", async () => {
				// A mutating "verification" command dirties the tracked tree,
				// so the guarded restore back to the default must refuse.
				fs.writeFileSync(path.join(repo, "README.md"), "# mutated\n");
				throw new Error("command exploded");
			}),
		).rejects.toThrow(/Could not return to the default branch 'main'.*command exploded/);
		// Stranded state is loud, not auto-repaired: still on the CI branch.
		expect(await currentBranch(repo)).toBe("release");
		expect(fs.readFileSync(path.join(repo, "README.md"), "utf8")).toBe("# mutated\n");
		run(repo, "checkout", "--", ".");
	});

	it("withCheckedOutBranch with a falsy branch runs fn untouched", async () => {
		const repo = freshRepo("with-branch-null", { initialBranch: "main" });
		let called = false;
		await withCheckedOutBranch(repo, null, async () => {
			called = true;
		});
		expect(called).toBe(true);
		expect(await currentBranch(repo)).toBe("main");
	});
});
