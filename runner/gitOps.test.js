import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { commitAndPush } from "./gitOps.js";

function git(dir, args) {
	execFileSync("git", args, { cwd: dir, stdio: "ignore" });
}

function worktreeRepo(withOrigin) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-runner-git-"));
	git(dir, ["init", "-q"]);
	git(dir, ["config", "user.email", "t@t.t"]);
	git(dir, ["config", "user.name", "t"]);
	fs.writeFileSync(path.join(dir, "f.txt"), "x");
	git(dir, ["add", "."]);
	git(dir, ["commit", "-qm", "init"]);
	git(dir, ["checkout", "-qb", "kb/t1"]);
	let origin = null;
	if (withOrigin) {
		origin = fs.mkdtempSync(path.join(os.tmpdir(), "kb-runner-bare-"));
		git(origin, ["init", "-q", "--bare"]);
		git(dir, ["remote", "add", "origin", origin]);
		git(dir, ["push", "-q", "origin", "kb/t1"]);
	}
	return { dir, origin };
}

describe("commitAndPush", () => {
	let ctx;
	beforeEach(() => {
		ctx = null;
	});
	afterEach(() => {
		if (ctx) {
			fs.rmSync(ctx.dir, { recursive: true, force: true });
			if (ctx.origin) fs.rmSync(ctx.origin, { recursive: true, force: true });
		}
	});

	it("commits and pushes when an origin exists", async () => {
		ctx = worktreeRepo(true);
		fs.writeFileSync(path.join(ctx.dir, "g.txt"), "y");
		const out = await commitAndPush({ workdir: ctx.dir, branch: "kb/t1", message: "stage" });
		assert.equal(out.pushed, true);
		assert.equal(out.skipped, false);
		assert.match(out.sha, /^[0-9a-f]{40}$/);
	});

	it("skips push with no-remote on local-only repos", async () => {
		ctx = worktreeRepo(false);
		fs.writeFileSync(path.join(ctx.dir, "g.txt"), "y");
		const out = await commitAndPush({ workdir: ctx.dir, branch: "kb/t1", message: "stage" });
		assert.equal(out.pushed, false);
		assert.equal(out.pushSkipped, "no-remote");
		assert.match(out.sha, /^[0-9a-f]{40}$/);
	});

	it("skips the commit on a clean tree but still reports the SHA", async () => {
		ctx = worktreeRepo(false);
		const out = await commitAndPush({ workdir: ctx.dir, branch: "kb/t1", message: "stage" });
		assert.equal(out.skipped, true);
		assert.match(out.sha, /^[0-9a-f]{40}$/);
	});

	it("records per-Runner commit identity without touching repo config", async () => {
		ctx = worktreeRepo(false);
		fs.writeFileSync(path.join(ctx.dir, "g.txt"), "y");
		await commitAndPush({
			workdir: ctx.dir,
			branch: "kb/t1",
			message: "stage",
			author: "kainbain-runner/host-9",
		});
		const show = (args) =>
			execFileSync("git", args, { cwd: ctx.dir, encoding: "utf8" }).trim();
		assert.equal(show(["log", "-1", "--format=%an"]), "kainbain-runner/host-9");
		assert.equal(show(["config", "user.name"]), "t");
	});
});
