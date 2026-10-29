import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	RunnerGitError,
	listOrphanWorkdirs,
	maybeRecoverWorkdirLock,
	prepareIntegrationWorkdir,
	prepareWorkdir,
	refreshMirror,
	refreshWorktreeToRemote,
	removeIntegrationWorkdir,
	runGit,
	syncTaskDocs,
} from "./project.js";

function git(dir, args) {
	execFileSync("git", args, { cwd: dir, stdio: "ignore" });
}

function localRepo() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-runner-proj-"));
	git(dir, ["init", "-q"]);
	git(dir, ["config", "user.email", "t@t.t"]);
	git(dir, ["config", "user.name", "t"]);
	fs.writeFileSync(path.join(dir, "f.txt"), "x");
	git(dir, ["add", "."]);
	git(dir, ["commit", "-qm", "init"]);
	return dir;
}

describe("syncTaskDocs", () => {
	it("mirrors idea files and assets into the worktree, keeps agent files, no-ops when absent", async () => {
		const primary = fs.mkdtempSync(path.join(os.tmpdir(), "kb-primary-"));
		const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-work-"));
		fs.mkdirSync(path.join(primary, "docs", "tasks", "t1", "assets"), { recursive: true });
		fs.writeFileSync(path.join(primary, "docs", "tasks", "t1", "idea-1.md"), "idea");
		fs.writeFileSync(path.join(primary, "docs", "tasks", "t1", "assets", "image.png"), "png");
		fs.mkdirSync(path.join(workdir, "docs", "tasks", "t1"), { recursive: true });
		fs.writeFileSync(path.join(workdir, "docs", "tasks", "t1", "agent-notes.md"), "mine");
		assert.equal(await syncTaskDocs({ primaryCwd: primary, workdir, taskId: "t1" }), 2);
		assert.equal(fs.readFileSync(path.join(workdir, "docs", "tasks", "t1", "idea-1.md"), "utf8"), "idea");
		assert.ok(fs.existsSync(path.join(workdir, "docs", "tasks", "t1", "assets", "image.png")));
		assert.equal(fs.readFileSync(path.join(workdir, "docs", "tasks", "t1", "agent-notes.md"), "utf8"), "mine");
		assert.equal(await syncTaskDocs({ primaryCwd: primary, workdir, taskId: "missing" }), 0);
	});

	describe("worktree recovery and stale locks", () => {
		function originWithWorktree() {
			const origin = fs.mkdtempSync(path.join(os.tmpdir(), "kb-origin-"));
			execFileSync("git", ["init", "-q", "--bare"], { cwd: origin, stdio: "ignore" });
			const mirror = fs.mkdtempSync(path.join(os.tmpdir(), "kb-mirror-"));
			execFileSync("git", ["clone", "-q", origin, mirror], { stdio: "ignore" });
			execFileSync("git", ["config", "user.email", "t@t.t"], { cwd: mirror, stdio: "ignore" });
			execFileSync("git", ["config", "user.name", "t"], { cwd: mirror, stdio: "ignore" });
			execFileSync("git", ["checkout", "-qb", "kb/t1"], { cwd: mirror, stdio: "ignore" });
			fs.writeFileSync(path.join(mirror, "f.txt"), "x");
			execFileSync("git", ["add", "."], { cwd: mirror, stdio: "ignore" });
			execFileSync("git", ["commit", "-qm", "init"], { cwd: mirror, stdio: "ignore" });
			execFileSync("git", ["push", "-q", "origin", "kb/t1"], { cwd: mirror, stdio: "ignore" });
			execFileSync("git", ["checkout", "-q", "--detach"], { cwd: mirror, stdio: "ignore" });
			const workdir = path.join(mirror, "wt");
			execFileSync("git", ["worktree", "add", workdir, "kb/t1"], { cwd: mirror, stdio: "ignore" });
			return { origin, mirror, workdir };
		}

		it("parks dirty residue on a recovery branch instead of discarding it", async () => {
			const { origin, mirror, workdir } = originWithWorktree();
			try {
				fs.writeFileSync(path.join(workdir, "uncommitted.txt"), "precious");
				const { recoveredTo } = await refreshWorktreeToRemote(workdir, "kb/t1");
				assert.match(recoveredTo, /^kb-recovery\/t1\//);
				assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: workdir, encoding: "utf8" }).trim(), "");
				const kept = execFileSync("git", ["ls-tree", "-r", "--name-only", recoveredTo], { cwd: mirror, encoding: "utf8" });
				assert.ok(kept.split("\n").includes("uncommitted.txt"));
			} finally {
				execFileSync("git", ["worktree", "remove", "--force", workdir], { cwd: mirror, stdio: "ignore" });
				fs.rmSync(mirror, { recursive: true, force: true });
				fs.rmSync(origin, { recursive: true, force: true });
			}
		});

		it("refuses a fresh index.lock instead of piling on", async () => {
			const dir = localRepo();
			try {
				const dotGit = execFileSync("git", ["rev-parse", "--git-dir"], { cwd: dir, encoding: "utf8" }).trim();
				const lockPath = path.join(dir, dotGit, "index.lock");
				fs.writeFileSync(lockPath, "");
				await assert.rejects(runGit(dir, ["status", "--porcelain"]), (err) => err instanceof RunnerGitError && err.code === "git-lock");
				fs.rmSync(lockPath, { force: true });
			} finally {
				fs.rmSync(dir, { recursive: true, force: true });
			}
		});

		it("recovers a provably-stale index.lock and still runs the command", async () => {
			const dir = localRepo();
			try {
				const dotGit = execFileSync("git", ["rev-parse", "--git-dir"], { cwd: dir, encoding: "utf8" }).trim();
				const lockPath = path.join(dir, dotGit, "index.lock");
				fs.writeFileSync(lockPath, "");
				const ancient = new Date(Date.now() - 120000);
				fs.utimesSync(lockPath, ancient, ancient);
				// Another worker's git may be mid-flight on this machine; wait for quiet.
				let out = null;
				for (let i = 0; i < 100 && out === null; i++) {
					try {
						out = await runGit(dir, ["status", "--porcelain"]);
					} catch (err) {
						if (err instanceof RunnerGitError && err.code === "git-lock" && /live git process/.test(err.message)) {
							await new Promise((r) => setTimeout(r, 300));
						} else {
							throw err;
						}
					}
				}
				assert.ok(out, "stale lock was never recoverable (live git throughout)");
				assert.ok(!fs.existsSync(lockPath));
				const probe = await maybeRecoverWorkdirLock(dir);
				assert.equal(probe.recovered, false);
			} finally {
				fs.rmSync(dir, { recursive: true, force: true });
			}
		});
	});

	describe("prepareIntegrationWorkdir", () => {
		function originWithBranches() {
			const origin = fs.mkdtempSync(path.join(os.tmpdir(), "kb-int-origin-"));
			execFileSync("git", ["init", "-q", "--bare"], { cwd: origin, stdio: "ignore" });
			const seed = fs.mkdtempSync(path.join(os.tmpdir(), "kb-int-seed-"));
			execFileSync("git", ["clone", "-q", origin, seed], { stdio: "ignore" });
			execFileSync("git", ["config", "user.email", "t@t.t"], { cwd: seed, stdio: "ignore" });
			execFileSync("git", ["config", "user.name", "t"], { cwd: seed, stdio: "ignore" });
			fs.writeFileSync(path.join(seed, "base.txt"), "base");
			execFileSync("git", ["add", "."], { cwd: seed, stdio: "ignore" });
			execFileSync("git", ["commit", "-qm", "init"], { cwd: seed, stdio: "ignore" });
			execFileSync("git", ["branch", "-M", "main"], { cwd: seed, stdio: "ignore" });
			execFileSync("git", ["push", "-q", "origin", "main"], { cwd: seed, stdio: "ignore" });
			execFileSync("git", ["checkout", "-qb", "kb/t1"], { cwd: seed, stdio: "ignore" });
			fs.writeFileSync(path.join(seed, "task.txt"), "work");
			execFileSync("git", ["add", "."], { cwd: seed, stdio: "ignore" });
			execFileSync("git", ["commit", "-qm", "work"], { cwd: seed, stdio: "ignore" });
			execFileSync("git", ["push", "-q", "origin", "kb/t1"], { cwd: seed, stdio: "ignore" });
			const shaOf = (ref) => execFileSync("git", ["rev-parse", ref], { cwd: seed, encoding: "utf8" }).trim();
			return { origin, seed, mainSha: shaOf("main"), taskSha: shaOf("kb/t1") };
		}

		it("opens a detached worktree at the expected target when refs match", async () => {
			const { origin, seed, mainSha, taskSha } = originWithBranches();
			const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kb-int-work-"));
			try {
				const { workdir, mirrorDir } = await prepareIntegrationWorkdir({
					repoUrl: origin, workRoot, taskBranch: "kb/t1",
					expectedTaskSha: taskSha, targetBranch: "main", expectedTargetSha: mainSha,
				});
				assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { cwd: workdir, encoding: "utf8" }).trim(), mainSha);
				assert.equal(execFileSync("git", ["rev-parse", "origin/kb/t1"], { cwd: mirrorDir, encoding: "utf8" }).trim(), taskSha);
				await removeIntegrationWorkdir(mirrorDir, workdir);
				assert.ok(!fs.existsSync(workdir));
			} finally {
				fs.rmSync(workRoot, { recursive: true, force: true });
				fs.rmSync(origin, { recursive: true, force: true });
				fs.rmSync(seed, { recursive: true, force: true });
			}
		});

		it("refuses with stale-head when the target moved mid-lease", async () => {
			const { origin, seed, mainSha, taskSha } = originWithBranches();
			const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kb-int-work-"));
			try {
				execFileSync("git", ["checkout", "-q", "main"], { cwd: seed, stdio: "ignore" });
				fs.writeFileSync(path.join(seed, "other.txt"), "someone landed first");
				execFileSync("git", ["add", "."], { cwd: seed, stdio: "ignore" });
				execFileSync("git", ["commit", "-qm", "other work"], { cwd: seed, stdio: "ignore" });
				execFileSync("git", ["push", "-q", "origin", "main"], { cwd: seed, stdio: "ignore" });
				await assert.rejects(
					prepareIntegrationWorkdir({
						repoUrl: origin, workRoot, taskBranch: "kb/t1",
						expectedTaskSha: taskSha, targetBranch: "main", expectedTargetSha: mainSha,
					}),
					(err) => err instanceof RunnerGitError && err.code === "stale-head",
				);
			} finally {
				fs.rmSync(workRoot, { recursive: true, force: true });
				fs.rmSync(origin, { recursive: true, force: true });
				fs.rmSync(seed, { recursive: true, force: true });
			}
		});
	});

	it("never copies the backend-owned task.md snapshot (a5228675)", async () => {
		const primary = fs.mkdtempSync(path.join(os.tmpdir(), "kb-primary-"));
		const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-work-"));
		fs.mkdirSync(path.join(primary, "docs", "tasks", "t1"), { recursive: true });
		fs.writeFileSync(path.join(primary, "docs", "tasks", "t1", "task.md"), "live snapshot");
		fs.writeFileSync(path.join(primary, "docs", "tasks", "t1", "idea-1.md"), "idea");
		assert.equal(await syncTaskDocs({ primaryCwd: primary, workdir, taskId: "t1" }), 1);
		assert.ok(!fs.existsSync(path.join(workdir, "docs", "tasks", "t1", "task.md")));
		assert.equal(fs.readFileSync(path.join(workdir, "docs", "tasks", "t1", "idea-1.md"), "utf8"), "idea");
		fs.rmSync(primary, { recursive: true, force: true });
		fs.rmSync(workdir, { recursive: true, force: true });
	});
});

describe("runner project prep", () => {
	let tmp;
	let repo;
	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kb-runner-work-"));
		repo = localRepo();
	});
	afterEach(() => {
		fs.rmSync(tmp, { recursive: true, force: true });
		fs.rmSync(repo, { recursive: true, force: true });
	});

	it("adopts a local-only repo into a task worktree", async () => {
		const { workdir, branch, mode, reused } = await prepareWorkdir({
			localPath: repo,
			workRoot: tmp,
			taskId: "t1",
		});
		assert.equal(mode, "adopt");
		assert.equal(branch, "kb/t1");
		assert.equal(reused, false);
		assert.ok(fs.existsSync(path.join(workdir, "f.txt")));
		const again = await prepareWorkdir({ localPath: repo, workRoot: tmp, taskId: "t1" });
		assert.equal(again.reused, true);
	});

	it("clones a remote-backed repo and pulls on revisit", async () => {
		const origin = fs.mkdtempSync(path.join(os.tmpdir(), "kb-runner-origin-"));
		try {
			git(origin, ["init", "-q", "--bare"]);
			git(repo, ["remote", "add", "origin", origin]);
			git(repo, ["push", "-q", "origin", "HEAD:main"]);
			execFileSync("git", ["--git-dir", origin, "symbolic-ref", "HEAD", "refs/heads/main"], {
				stdio: "ignore",
			});
			const first = await prepareWorkdir({ repoUrl: origin, workRoot: tmp, taskId: "t1" });
			assert.equal(first.mode, "clone");
			const second = await prepareWorkdir({ repoUrl: origin, workRoot: tmp, taskId: "t2" });
			assert.equal(second.mode, "clone");
			assert.ok(fs.existsSync(path.join(second.workdir, "f.txt")));
		} finally {
			fs.rmSync(origin, { recursive: true, force: true });
		}
	});

	it("resets a reused clone-mode worktree to the remote branch", async () => {
		const origin = fs.mkdtempSync(path.join(os.tmpdir(), "kb-runner-origin-"));
		try {
			git(origin, ["init", "-q", "--bare"]);
			git(repo, ["remote", "add", "origin", origin]);
			git(repo, ["push", "-q", "origin", "HEAD:main"]);
			execFileSync("git", ["--git-dir", origin, "symbolic-ref", "HEAD", "refs/heads/main"], {
				stdio: "ignore",
			});
			const first = await prepareWorkdir({ repoUrl: origin, workRoot: tmp, taskId: "t9" });
			assert.equal(first.reused, false);
			// Publish the task branch, then simulate a dead run's leftovers:
			// an unpushed commit plus a dirty file on top of the remote state.
			git(first.workdir, ["push", "-q", "origin", "kb/t9"]);
			fs.writeFileSync(path.join(first.workdir, "stale.txt"), "leftover");
			git(first.workdir, ["add", "stale.txt"]);
			git(first.workdir, ["commit", "-qm", "unpushed leftover"]);
			fs.writeFileSync(path.join(first.workdir, "f.txt"), "dirty");
			const again = await prepareWorkdir({ repoUrl: origin, workRoot: tmp, taskId: "t9" });
			assert.equal(again.reused, true);
			assert.equal(again.workdir, first.workdir);
			// The dead run's unpushed commit + dirty file park on a recovery
			// branch instead of being silently dropped by the reset.
			assert.match(again.recoveredTo, /^kb-recovery\/t9\//);
			const rescued = execFileSync("git", ["ls-tree", "-r", "--name-only", again.recoveredTo], {
				cwd: first.workdir,
			})
				.toString()
				.split("\n");
			assert.ok(rescued.includes("stale.txt"));
			assert.ok(rescued.includes("f.txt"));
			const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: first.workdir })
				.toString()
				.trim();
			const remoteHead = execFileSync("git", ["rev-parse", "origin/kb/t9"], {
				cwd: first.workdir,
			})
				.toString()
				.trim();
			assert.equal(head, remoteHead);
			assert.equal(fs.readFileSync(path.join(first.workdir, "f.txt"), "utf8"), "x");
			assert.ok(!fs.existsSync(path.join(first.workdir, "stale.txt")));
		} finally {
			fs.rmSync(origin, { recursive: true, force: true });
		}
	});

	it("checks out the local branch when the remote branch is missing", async () => {
		const origin = fs.mkdtempSync(path.join(os.tmpdir(), "kb-runner-origin-"));
		try {
			git(origin, ["init", "-q", "--bare"]);
			git(repo, ["remote", "add", "origin", origin]);
			git(repo, ["push", "-q", "origin", "HEAD:main"]);
			execFileSync("git", ["--git-dir", origin, "symbolic-ref", "HEAD", "refs/heads/main"], {
				stdio: "ignore",
			});
			const first = await prepareWorkdir({ repoUrl: origin, workRoot: tmp, taskId: "t8" });
			// Nothing pushed: refresh must not invent remote state.
			await refreshWorktreeToRemote(first.workdir, "kb/t8");
			const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
				cwd: first.workdir,
			})
				.toString()
				.trim();
			assert.equal(branch, "kb/t8");
		} finally {
			fs.rmSync(origin, { recursive: true, force: true });
		}
	});

	it("refuses past the worktree cap and names orphans", async () => {
		for (let i = 0; i < 5; i++) {
			await prepareWorkdir({ localPath: repo, workRoot: tmp, taskId: `old-${i}` });
		}
		await assert.rejects(
			prepareWorkdir({ localPath: repo, workRoot: tmp, taskId: "new" }),
			(err) => err.code === "WORKTREE_CAP_REACHED",
		);
		assert.equal(listOrphanWorkdirs(tmp, "new").length, 5);
		assert.deepEqual(listOrphanWorkdirs(tmp, "old-0").length, 4);
	});

	it("requires a repo source", async () => {
		await assert.rejects(prepareWorkdir({ workRoot: tmp, taskId: "t1" }), /repoUrl/);
	});

	it("self-heals a diverged mirror with a hard reset (G6)", async () => {
		const origin = fs.mkdtempSync(path.join(os.tmpdir(), "kb-runner-div-origin-"));
		try {
			git(origin, ["init", "-q", "--bare"]);
			git(repo, ["remote", "add", "origin", origin]);
			git(repo, ["push", "-q", "origin", "HEAD:main"]);
			execFileSync("git", ["--git-dir", origin, "symbolic-ref", "HEAD", "refs/heads/main"], {
				stdio: "ignore",
			});
			const first = await prepareWorkdir({ repoUrl: origin, workRoot: tmp, taskId: "t1" });
			assert.equal(first.mode, "clone");
			// Advance the origin past what the mirror has.
			fs.writeFileSync(path.join(repo, "g.txt"), "g");
			git(repo, ["add", "."]);
			git(repo, ["commit", "-qm", "second"]);
			git(repo, ["push", "-q", "origin", "HEAD:main"]);
			// Diverge the mirror checkout directly (a failed pull in the
			// old code left exactly this state behind forever).
			const [mirror] = fs
				.readdirSync(path.join(tmp, "mirrors"))
				.map((n) => path.join(tmp, "mirrors", n));
			git(mirror, ["config", "user.email", "t@t.t"]);
			git(mirror, ["config", "user.name", "t"]);
			fs.writeFileSync(path.join(mirror, "local-only.txt"), "mine");
			git(mirror, ["add", "."]);
			git(mirror, ["commit", "-qm", "local divergence"]);
			// The old `pull --ff-only` path rejects this; the refresh heals.
			await refreshMirror(mirror);
			const mirrorHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: mirror })
				.toString()
				.trim();
			const originHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo })
				.toString()
				.trim();
			assert.equal(mirrorHead, originHead);
			// And the next task prep flows through the healed mirror.
			const second = await prepareWorkdir({ repoUrl: origin, workRoot: tmp, taskId: "t2" });
			assert.equal(second.mode, "clone");
			assert.ok(fs.existsSync(path.join(second.workdir, "g.txt")));
			assert.ok(!fs.existsSync(path.join(second.workdir, "local-only.txt")));
		} finally {
			fs.rmSync(origin, { recursive: true, force: true });
		}
	});
});
