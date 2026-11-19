import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	docsWorkdirFor,
	prepareWorkdir,
	resolveRunnerDocsRepoUrl,
	resolveRunnerKainbainHome,
	shouldSyncTaskDocs,
	slugForRepo,
	RunnerGitError,
} from "./project.js";
import { commitAndPush } from "./gitOps.js";

// Separate docs repo (runner side): a project with `docsRepo` gets a PAIRED
// docs worktree (`<workdir>-docs`, same `kb/<taskId>` branch in its own
// mirror/adopted checkout) next to the code worktree. Task docs live in the
// docs worktree (synced through git), never copied into the code worktree.

function git(dir, args) {
	execFileSync("git", args, { cwd: dir, stdio: "ignore" });
}

function localRepo(prefix) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	git(dir, ["init", "-q"]);
	git(dir, ["config", "user.email", "t@t.t"]);
	git(dir, ["config", "user.name", "t"]);
	fs.writeFileSync(path.join(dir, "f.txt"), "x");
	git(dir, ["add", "."]);
	git(dir, ["commit", "-qm", "init"]);
	git(dir, ["branch", "-M", "main"]);
	return dir;
}

function bareOrigin(seedRepo, prefix) {
	const origin = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	git(origin, ["init", "-q", "--bare"]);
	git(seedRepo, ["remote", "add", "origin", origin]);
	git(seedRepo, ["push", "-q", "origin", "HEAD:main"]);
	execFileSync("git", ["--git-dir", origin, "symbolic-ref", "HEAD", "refs/heads/main"], {
		stdio: "ignore",
	});
	return origin;
}

describe("docs-repo runner helpers", () => {
	it("docsWorkdirFor derives the paired docs worktree name", () => {
		assert.equal(docsWorkdirFor("/w/kb-t1"), "/w/kb-t1-docs");
		assert.equal(docsWorkdirFor(""), null);
		assert.equal(docsWorkdirFor(null), null);
		assert.equal(docsWorkdirFor(undefined), null);
	});

	it("resolveRunnerDocsRepoUrl reads the redacted URL or null", () => {
		assert.equal(resolveRunnerDocsRepoUrl({ docsRepo: { url: "https://h/kb.git" } }), "https://h/kb.git");
		assert.equal(resolveRunnerDocsRepoUrl({ docsRepo: { url: "  https://h/kb.git  " } }), "https://h/kb.git");
		assert.equal(resolveRunnerDocsRepoUrl({}), null);
		assert.equal(resolveRunnerDocsRepoUrl(null), null);
		assert.equal(resolveRunnerDocsRepoUrl({ docsRepo: null }), null);
		assert.equal(resolveRunnerDocsRepoUrl({ docsRepo: ["https://h/kb.git"] }), null);
		assert.equal(resolveRunnerDocsRepoUrl({ docsRepo: { url: 42 } }), null);
		assert.equal(resolveRunnerDocsRepoUrl({ docsRepo: { url: "   " } }), null);
	});

	it("resolveRunnerKainbainHome prefers the docs checkout, else cwd", () => {
		assert.equal(resolveRunnerKainbainHome("/repo", { docsRepo: { localPath: "/srv/kb" } }), "/srv/kb");
		assert.equal(resolveRunnerKainbainHome("/repo", {}), "/repo");
		assert.equal(resolveRunnerKainbainHome("/repo", null), "/repo");
		assert.equal(resolveRunnerKainbainHome("/repo", { docsRepo: { url: "https://h/kb.git" } }), "/repo");
		assert.equal(resolveRunnerKainbainHome("", {}), null);
		assert.equal(resolveRunnerKainbainHome(null, { docsRepo: { localPath: "/srv/kb" } }), "/srv/kb");
	});

	it("shouldSyncTaskDocs skips the copy for docs-repo projects, keeps it for legacy", () => {
		assert.equal(shouldSyncTaskDocs({}), true);
		assert.equal(shouldSyncTaskDocs({ project: null }), true);
		assert.equal(shouldSyncTaskDocs({ project: { docsRepo: { url: "https://h/kb.git" } } }), false);
		assert.equal(
			shouldSyncTaskDocs({ project: { docsRepo: { url: "https://h/kb.git" } }, docsWorkdir: "/w/kb-t1-docs" }),
			false,
		);
		assert.equal(shouldSyncTaskDocs({ project: {}, docsWorkdir: "/w/kb-t1-docs" }), false);
	});
});

describe("prepareWorkdir with a separate docs repo (clone mode)", () => {
	let tmp;
	let codeRepo;
	let docsRepo;
	let codeOrigin;
	let docsOrigin;
	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kb-runner-docs-work-"));
		codeRepo = localRepo("kb-runner-docs-code-");
		docsRepo = localRepo("kb-runner-docs-doc-");
		codeOrigin = bareOrigin(codeRepo, "kb-runner-docs-code-origin-");
		docsOrigin = bareOrigin(docsRepo, "kb-runner-docs-doc-origin-");
	});
	afterEach(() => {
		for (const d of [tmp, codeRepo, docsRepo, codeOrigin, docsOrigin]) {
			fs.rmSync(d, { recursive: true, force: true });
		}
	});

	it("prepares a paired docs worktree on the same kb/<taskId> branch in its own mirror", async () => {
		const out = await prepareWorkdir({
			repoUrl: codeOrigin,
			docsRepoUrl: docsOrigin,
			workRoot: tmp,
			taskId: "t1",
		});
		assert.equal(out.mode, "clone");
		assert.equal(out.branch, "kb/t1");
		assert.ok(out.docsWorkdir, "docs worktree prepared");
		assert.equal(out.docsWorkdir, `${out.workdir}-docs`);
		// Code worktree from the code mirror, docs worktree from the docs mirror.
		assert.ok(fs.existsSync(path.join(out.workdir, "f.txt")));
		assert.ok(fs.existsSync(path.join(out.docsWorkdir, "f.txt")));
		assert.ok(fs.existsSync(path.join(tmp, "mirrors", slugForRepo(codeOrigin), ".git")));
		assert.ok(fs.existsSync(path.join(tmp, "mirrors", slugForRepo(docsOrigin), ".git")));
		// Both worktrees sit on the synced task branch.
		const codeBranch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
			cwd: out.workdir,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		const docsBranch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
			cwd: out.docsWorkdir,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		assert.equal(codeBranch, "kb/t1");
		assert.equal(docsBranch, "kb/t1");
		// Reuse keeps the pair.
		const again = await prepareWorkdir({
			repoUrl: codeOrigin,
			docsRepoUrl: docsOrigin,
			workRoot: tmp,
			taskId: "t1",
		});
		assert.equal(again.reused, true);
		assert.equal(again.docsWorkdir, out.docsWorkdir);
	});

	it("legacy projects (no docs repo) get no docs worktree", async () => {
		const out = await prepareWorkdir({ repoUrl: codeOrigin, workRoot: tmp, taskId: "t9" });
		assert.equal(out.docsWorkdir ?? null, null);
		assert.equal(out.docsRepoDir ?? null, null);
		assert.ok(!fs.existsSync(`${out.workdir}-docs`));
	});

	it("commitAndPush pushes BOTH worktrees docs-first and reports both shas", async () => {
		const out = await prepareWorkdir({
			repoUrl: codeOrigin,
			docsRepoUrl: docsOrigin,
			workRoot: tmp,
			taskId: "t2",
		});
		fs.writeFileSync(path.join(out.workdir, "code.txt"), "code");
		fs.mkdirSync(path.join(out.docsWorkdir, "docs", "tasks", "t2"), { recursive: true });
		fs.writeFileSync(path.join(out.docsWorkdir, "docs", "tasks", "t2", "plan.md"), "# plan");
		const res = await commitAndPush({
			workdir: out.workdir,
			branch: out.branch,
			message: "stage output",
			docsWorkdir: out.docsWorkdir,
			taskDocsPath: path.join("docs", "tasks", "t2"),
		});
		assert.equal(res.pushed, true);
		assert.equal(res.docsPushed, true);
		assert.match(res.docsSha, /^[0-9a-f]{40}$/);
		// Both remotes carry the synced task branch.
		const codeRemote = execFileSync("git", ["--git-dir", codeOrigin, "rev-parse", "--verify", "refs/heads/kb/t2"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		const docsRemote = execFileSync("git", ["--git-dir", docsOrigin, "rev-parse", "--verify", "refs/heads/kb/t2"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		assert.match(codeRemote, /^[0-9a-f]{40}$/);
		assert.match(docsRemote, /^[0-9a-f]{40}$/);
		// The docs branch carries the docs file; the code branch does not.
		const docsFiles = execFileSync("git", ["--git-dir", docsOrigin, "ls-tree", "-r", "--name-only", "refs/heads/kb/t2"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		assert.ok(docsFiles.includes("docs/tasks/t2/plan.md"));
		const codeFiles = execFileSync("git", ["--git-dir", codeOrigin, "ls-tree", "-r", "--name-only", "refs/heads/kb/t2"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		assert.ok(!codeFiles.includes("docs/tasks/t2/plan.md"));
		assert.ok(codeFiles.includes("code.txt"));
	});

	it("a docs push failure aborts before the code push and is labelled 'docs repo'", async () => {
		const out = await prepareWorkdir({
			repoUrl: codeOrigin,
			docsRepoUrl: docsOrigin,
			workRoot: tmp,
			taskId: "t3",
		});
		// Break the docs remote AFTER the worktree exists: the docs push must
		// fail, and the code branch must never reach its remote.
		git(out.docsWorkdir, ["remote", "set-url", "origin", path.join(tmp, "does-not-exist")]);
		fs.writeFileSync(path.join(out.workdir, "code.txt"), "code");
		fs.writeFileSync(path.join(out.docsWorkdir, "d.txt"), "docs");
		await assert.rejects(
			commitAndPush({
				workdir: out.workdir,
				branch: out.branch,
				message: "stage output",
				docsWorkdir: out.docsWorkdir,
			}),
			(err) => {
				assert.ok(err instanceof RunnerGitError);
				assert.match(String(err.message), /docs repo/);
				return true;
			},
		);
		// The code remote never saw the task branch (docs-first abort).
		let codeBranchOnRemote = null;
		try {
			codeBranchOnRemote = execFileSync(
				"git",
				["--git-dir", codeOrigin, "rev-parse", "--verify", "refs/heads/kb/t3"],
				{ encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
			).trim();
		} catch {
			codeBranchOnRemote = null;
		}
		assert.equal(codeBranchOnRemote, null);
	});
});

describe("prepareWorkdir with a separate docs repo (adopt mode)", () => {
	let tmp;
	let codeRepo;
	let docsRepo;
	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kb-runner-docs-adopt-work-"));
		codeRepo = localRepo("kb-runner-docs-adopt-code-");
		docsRepo = localRepo("kb-runner-docs-adopt-doc-");
	});
	afterEach(() => {
		for (const d of [tmp, codeRepo, docsRepo]) {
			fs.rmSync(d, { recursive: true, force: true });
		}
	});

	it("adopts the docs checkout and creates the paired worktree on the synced branch", async () => {
		const out = await prepareWorkdir({
			localPath: codeRepo,
			docsLocalPath: docsRepo,
			workRoot: tmp,
			taskId: "t1",
		});
		assert.equal(out.mode, "adopt");
		assert.ok(out.docsWorkdir);
		assert.equal(out.docsWorkdir, `${out.workdir}-docs`);
		assert.ok(fs.existsSync(path.join(out.docsWorkdir, "f.txt")));
		const docsBranch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
			cwd: out.docsWorkdir,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		assert.equal(docsBranch, "kb/t1");
		// The primary docs checkout itself is left on its own branch.
		const primaryBranch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
			cwd: docsRepo,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		assert.equal(primaryBranch, "main");
	});
});

describe("collectTaskFiles reads task docs from the paired docs worktree", () => {
	let tmp;
	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kb-runner-docs-collect-"));
	});
	afterEach(() => {
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	it("uses docsWorkdir as the base when provided, else the code workdir", async () => {
		const { collectTaskFiles } = await import("./daemon.js");
		const workdir = path.join(tmp, "kb-t1");
		const docsWorkdir = `${workdir}-docs`;
		for (const base of [workdir, docsWorkdir]) {
			fs.mkdirSync(path.join(base, "docs", "tasks", "t1"), { recursive: true });
		}
		fs.writeFileSync(path.join(workdir, "docs", "tasks", "t1", "code-side.md"), "code");
		fs.writeFileSync(path.join(docsWorkdir, "docs", "tasks", "t1", "docs-side.md"), "docs");
		const fromDocs = collectTaskFiles({ workdir, taskId: "t1", docsWorkdir });
		assert.deepEqual(
			fromDocs.map((f) => f.name).sort(),
			["docs-side.md"],
		);
		const fromCode = collectTaskFiles({ workdir, taskId: "t1" });
		assert.deepEqual(
			fromCode.map((f) => f.name).sort(),
			["code-side.md"],
		);
	});
});
