import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listOrphanWorkdirs, prepareWorkdir } from "./project.js";

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
});
