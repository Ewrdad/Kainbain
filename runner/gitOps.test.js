import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { commitAndPush } from "./gitOps.js";
import { RunnerGitError } from "./project.js";

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

	it("still runs repo hooks on task-branch commits (no bypass outside recovery)", async () => {
		// Scope pin: only kb-recovery/* snapshots bypass hooks. A failing
		// repo hook must still reject task output — if the hook ever
		// stopped firing, the rejects below (and the pinned HEAD) fail.
		ctx = worktreeRepo(false);
		const hooksDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-failhooks-"));
		try {
			fs.writeFileSync(path.join(hooksDir, "pre-commit"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
			git(ctx.dir, ["config", "core.hooksPath", hooksDir]);
			const headBefore = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ctx.dir, encoding: "utf8" }).trim();
			fs.writeFileSync(path.join(ctx.dir, "g.txt"), "y");
			await assert.rejects(commitAndPush({ workdir: ctx.dir, branch: "kb/t1", message: "stage" }));
			fs.writeFileSync(path.join(ctx.dir, "h.txt"), "y");
			await assert.rejects(commitAndPush({ workdir: ctx.dir, branch: "kb/t1", message: "stage", author: "Agent" }));
			const headAfter = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ctx.dir, encoding: "utf8" }).trim();
			assert.equal(headAfter, headBefore, "hook rejection committed nothing");
		} finally {
			fs.rmSync(hooksDir, { recursive: true, force: true });
		}
	});

	it("preserves a multi-line message body byte-for-byte in the commit", async () => {
		// Characterization for stage attestation: the Runner carries its
		// proof as trailers appended to the single -m message, so newlines
		// in `message` must survive into `git log --format=%B` verbatim.
		ctx = worktreeRepo(false);
		fs.writeFileSync(path.join(ctx.dir, "g.txt"), "y");
		const message = "kb/t1 s1: Runner host-9 stage output\n\nKainBain-Task: t1\nKainBain-Stage: s1\nKainBain-Config-Hash: sha256:abc123";
		await commitAndPush({ workdir: ctx.dir, branch: "kb/t1", message });
		const full = execFileSync("git", ["log", "-1", "--format=%B"], { cwd: ctx.dir, encoding: "utf8" });
		assert.ok(full.includes("KainBain-Task: t1"));
		assert.ok(full.includes("KainBain-Stage: s1"));
		assert.ok(full.includes("KainBain-Config-Hash: sha256:abc123"));
		const subject = execFileSync("git", ["log", "-1", "--format=%s"], { cwd: ctx.dir, encoding: "utf8" }).trim();
		assert.equal(subject, "kb/t1 s1: Runner host-9 stage output");
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

	it("commits and pushes the paired docs worktree FIRST (docs repo, same branch)", async () => {
		// Code repo + separate docs repo, each with its own origin, both on
		// kb/t1 — the docs-repo project layout the runner prepares.
		ctx = worktreeRepo(true);
		const docs = worktreeRepo(true);
		try {
			fs.writeFileSync(path.join(ctx.dir, "code.txt"), "c");
			const docsTaskDir = path.join(docs.dir, "docs", "tasks", "t1");
			fs.mkdirSync(docsTaskDir, { recursive: true });
			fs.writeFileSync(path.join(docsTaskDir, "plan.md"), "# plan");
			const out = await commitAndPush({
				workdir: ctx.dir,
				branch: "kb/t1",
				message: "kb/t1 s1: stage output",
				taskDocsPath: "docs/tasks/t1",
				docsWorkdir: docs.dir,
			});
			assert.equal(out.pushed, true);
			assert.equal(out.docsPushed, true);
			// Docs commit carries the [docs] prefix; code commit does not.
			const docsSubject = execFileSync("git", ["log", "-1", "--format=%s", "kb/t1"], { cwd: docs.origin, encoding: "utf8" }).trim();
			assert.equal(docsSubject, "[docs] kb/t1 s1: stage output");
			const codeSubject = execFileSync("git", ["log", "-1", "--format=%s", "kb/t1"], { cwd: ctx.origin, encoding: "utf8" }).trim();
			assert.equal(codeSubject, "kb/t1 s1: stage output");
			// The docs branch actually carries the task docs file.
			const docsFile = execFileSync("git", ["show", "kb/t1:docs/tasks/t1/plan.md"], { cwd: docs.origin, encoding: "utf8" });
			assert.equal(docsFile, "# plan");
		} finally {
			fs.rmSync(docs.dir, { recursive: true, force: true });
			fs.rmSync(docs.origin, { recursive: true, force: true });
		}
	});

	it("aborts before the code push when the docs worktree push fails", async () => {
		ctx = worktreeRepo(true);
		const docs = worktreeRepo(false); // no origin on the docs side
		try {
			fs.writeFileSync(path.join(ctx.dir, "code.txt"), "c");
			fs.writeFileSync(path.join(docs.dir, "docs-note.txt"), "d");
			await assert.rejects(
				commitAndPush({
					workdir: ctx.dir,
					branch: "kb/t1",
					message: "stage",
					docsWorkdir: path.join(docs.dir, "does-not-exist"),
				}),
				(err) => /docs repo/.test(err.message),
			);
			// Code origin never received the branch tip with the new commit:
			// the pre-existing kb/t1 is untouched (no new commit pushed).
			const codeSubject = execFileSync("git", ["log", "-1", "--format=%s", "kb/t1"], { cwd: ctx.origin, encoding: "utf8" }).trim();
			assert.equal(codeSubject, "init");
		} finally {
			fs.rmSync(docs.dir, { recursive: true, force: true });
		}
	});
});

describe("commitAndPush task docs rescue", () => {
	it("force-adds gitignored task docs so the backend can see plans", async () => {
		const ctx2 = worktreeRepo(true);
		try {
			fs.writeFileSync(path.join(ctx2.dir, ".gitignore"), "docs/tasks/\n");
			const docsDir = path.join(ctx2.dir, "docs/tasks/t1");
			fs.mkdirSync(docsDir, { recursive: true });
			fs.writeFileSync(path.join(docsDir, "IMPLEMENTATION_PLAN.md"), "plan");
			const out = await commitAndPush({ workdir: ctx2.dir, branch: "kb/t1", message: "stage", taskDocsPath: "docs/tasks/t1" });
			assert.equal(out.pushed, true);
			const shown = execFileSync("git", ["show", "HEAD:docs/tasks/t1/IMPLEMENTATION_PLAN.md"], { cwd: ctx2.dir, encoding: "utf8" });
			assert.equal(shown, "plan");
		} finally {
			fs.rmSync(ctx2.dir, { recursive: true, force: true });
			if (ctx2.origin) fs.rmSync(ctx2.origin, { recursive: true, force: true });
		}
	});

	it("integrates a sibling stage push before publishing (no silent divergence)", async () => {
		const origin = fs.mkdtempSync(path.join(os.tmpdir(), "kb-runner-bare-"));
		execFileSync("git", ["init", "-q", "--bare"], { cwd: origin, stdio: "ignore" });
		const clone = (name) => {
			const dir = fs.mkdtempSync(path.join(os.tmpdir(), `kb-runner-${name}-`));
			execFileSync("git", ["clone", "-q", origin, dir], { stdio: "ignore" });
			execFileSync("git", ["config", "user.email", "t@t.t"], { cwd: dir, stdio: "ignore" });
			execFileSync("git", ["config", "user.name", "t"], { cwd: dir, stdio: "ignore" });
			return dir;
		};
		const a = clone("a");
		const b = clone("b");
		try {
			execFileSync("git", ["checkout", "-qb", "kb/t1"], { cwd: a, stdio: "ignore" });
			fs.writeFileSync(path.join(a, "base.txt"), "base");
			execFileSync("git", ["add", "."], { cwd: a, stdio: "ignore" });
			execFileSync("git", ["commit", "-qm", "init"], { cwd: a, stdio: "ignore" });
			execFileSync("git", ["push", "-q", "origin", "kb/t1"], { cwd: a, stdio: "ignore" });
			// Sibling stage (B) based on the same tip, then A lands first.
			execFileSync("git", ["fetch", "-q", "origin"], { cwd: b, stdio: "ignore" });
			execFileSync("git", ["checkout", "-qb", "kb/t1", "origin/kb/t1"], { cwd: b, stdio: "ignore" });
			fs.writeFileSync(path.join(a, "a.txt"), "a");
			execFileSync("git", ["add", "."], { cwd: a, stdio: "ignore" });
			execFileSync("git", ["commit", "-qm", "a work"], { cwd: a, stdio: "ignore" });
			execFileSync("git", ["push", "-q", "origin", "kb/t1"], { cwd: a, stdio: "ignore" });
			fs.writeFileSync(path.join(b, "b.txt"), "b");
			const out = await commitAndPush({ workdir: b, branch: "kb/t1", message: "b work" });
			assert.equal(out.pushed, true);
			execFileSync("git", ["fetch", "-q", "origin"], { cwd: a, stdio: "ignore" });
			const logAfter = execFileSync("git", ["log", "--format=%s", "origin/kb/t1"], { cwd: a, encoding: "utf8" });
			assert.match(logAfter, /b work/);
			assert.match(logAfter, /a work/);
		} finally {
			fs.rmSync(a, { recursive: true, force: true });
			fs.rmSync(b, { recursive: true, force: true });
			fs.rmSync(origin, { recursive: true, force: true });
		}
	});

	it("never commits the backend-owned task.md snapshot (a5228675)", async () => {
		const ctx2 = worktreeRepo(true);
		try {
			fs.writeFileSync(path.join(ctx2.dir, ".gitignore"), "docs/tasks/\n");
			const docsDir = path.join(ctx2.dir, "docs/tasks/t1");
			fs.mkdirSync(docsDir, { recursive: true });
			fs.writeFileSync(path.join(docsDir, "task.md"), "live snapshot");
			fs.writeFileSync(path.join(docsDir, "report.md"), "report");
			await commitAndPush({ workdir: ctx2.dir, branch: "kb/t1", message: "stage", taskDocsPath: "docs/tasks/t1" });
			const listed = execFileSync("git", ["ls-tree", "-r", "--name-only", "HEAD"], { cwd: ctx2.dir, encoding: "utf8" });
			assert.ok(listed.split("\n").includes("docs/tasks/t1/report.md"));
			assert.ok(!listed.split("\n").includes("docs/tasks/t1/task.md"));
		} finally {
			fs.rmSync(ctx2.dir, { recursive: true, force: true });
			if (ctx2.origin) fs.rmSync(ctx2.origin, { recursive: true, force: true });
		}
	});
});

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function wireRealBinaryGuard(dir) {
	fs.mkdirSync(path.join(dir, "scripts", "githooks"), { recursive: true });
	for (const name of ["githooks/pre-commit", "check-binary-guard.mjs", "check-proof-and-hygiene.mjs"]) {
		fs.copyFileSync(path.join(REPO_ROOT, "scripts", name), path.join(dir, "scripts", name));
	}
	git(dir, ["config", "core.hooksPath", "scripts/githooks"]);
}

describe("commitAndPush hook failures", () => {
	let dirs;
	beforeEach(() => {
		dirs = [];
	});
	afterEach(() => {
		for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
	});

	it("surfaces a hook-rejected stage commit with the structured envelope", async () => {
		const { dir, origin } = worktreeRepo(false);
		dirs.push(dir);
		assert.equal(origin, null);
		wireRealBinaryGuard(dir);
		git(dir, ["add", "."]);
		git(dir, ["commit", "-qm", "wire guard"]);
		fs.writeFileSync(path.join(dir, "bad.png"), Buffer.from([0xef, 0xbf, 0xbd, 0x50, 0x4e, 0x47]));
		await assert.rejects(commitAndPush({ workdir: dir, branch: "kb/t1", message: "stage" }), (err) => {
			assert.ok(err instanceof RunnerGitError);
			assert.equal(err.code, "git-hook-rejected");
			assert.equal(err.exitCode, 1);
			assert.equal(err.gitFailure.kind, "hook-rejected");
			assert.deepEqual(err.gitFailure.files, ["bad.png"]);
			// The daemon fills the phase (stage-commit here); the git layer
			// leaves it null.
			assert.equal(err.gitFailure.phase, null);
			return true;
		});
	});

	it("carries merge conflicts as structured merge-conflict detail", async () => {
		const { dir, origin } = worktreeRepo(true);
		dirs.push(dir, origin);
		// Local commit A on kb/t1…
		fs.writeFileSync(path.join(dir, "f.txt"), "aaa\n");
		git(dir, ["add", "."]);
		git(dir, ["commit", "-qm", "a work"]);
		// …diverges from a pushed commit B touching the same hunk.
		const sibling = fs.mkdtempSync(path.join(os.tmpdir(), "kb-runner-sib-"));
		dirs.push(sibling);
		execFileSync("git", ["clone", "-q", origin, sibling], { stdio: "ignore" });
		git(sibling, ["config", "user.email", "t@t.t"]);
		git(sibling, ["config", "user.name", "t"]);
		git(sibling, ["checkout", "-q", "kb/t1"]);
		fs.writeFileSync(path.join(sibling, "f.txt"), "bbb\n");
		git(sibling, ["add", "."]);
		git(sibling, ["commit", "-qm", "b work"]);
		git(sibling, ["push", "-q", "origin", "kb/t1"]);
		await assert.rejects(commitAndPush({ workdir: dir, branch: "kb/t1", message: "stage" }), (err) => {
			assert.ok(err instanceof RunnerGitError);
			assert.equal(err.code, "sync-conflict");
			assert.equal(err.gitFailure.kind, "merge-conflict");
			assert.deepEqual(err.gitFailure.files, ["f.txt"]);
			assert.ok(err.gitFailure.remedy.includes("kb/t1"));
			assert.ok(err.gitFailure.summary.includes("f.txt"));
			return true;
		});
	});

	it("keeps the structured failure when labelling a docs-repo error", async () => {
		const code = worktreeRepo(false);
		const docs = worktreeRepo(false);
		dirs.push(code.dir, docs.dir);
		wireRealBinaryGuard(docs.dir);
		git(docs.dir, ["add", "."]);
		git(docs.dir, ["commit", "-qm", "wire guard"]);
		fs.writeFileSync(path.join(docs.dir, "bad.png"), Buffer.from([0xef, 0xbf, 0xbd, 0x50, 0x4e, 0x47]));
		await assert.rejects(
			commitAndPush({ workdir: code.dir, branch: "kb/t1", message: "stage", docsWorkdir: docs.dir }),
			(err) => {
				assert.ok(err instanceof RunnerGitError);
				assert.equal(err.code, "git-hook-rejected");
				assert.ok(err.message.startsWith(`docs repo (${path.basename(docs.dir)}):`));
				assert.equal(err.exitCode, 1);
				assert.equal(err.gitFailure.kind, "hook-rejected");
				assert.deepEqual(err.gitFailure.files, ["bad.png"]);
				assert.ok(err.gitFailure.summary.startsWith(`docs repo (${path.basename(docs.dir)}): Commit blocked`));
				return true;
			},
		);
	});
});
