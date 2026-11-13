import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Isolate the tip-worktree deploy source: publish.sh may re-exec from a
// pristine worktree at origin/<default> when this checkout is not the tip
// (it normally sits on a kb/* task branch in these tests).
const SOURCE_DIR = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-publish-src-")), "source");
const run = (args, env = {}) =>
	spawnSync("./publish.sh", args, {
		cwd: ROOT,
		encoding: "utf8",
		env: { ...process.env, KAINBAIN_DEPLOY_SOURCE_DIR: SOURCE_DIR, ...env },
	});

describe("publish.sh", () => {
	it("dry-run --all prints the full command plan and exits 0", () => {
		const r = run(["--dry-run", "--all"], { KAINBAIN_DOCKERHUB_NAMESPACE: "dryrun-probe" });
		assert.equal(r.status, 0, r.stderr + r.stdout);
		assert.match(r.stdout, /would run: docker build -f Dockerfile/);
		assert.match(r.stdout, /would run: docker push docker\.io\/dryrun-probe\/kainbain-backend:/);
		assert.match(r.stdout, /would run: docker push docker\.io\/dryrun-probe\/kainbain-frontend:/);
		assert.match(r.stdout, /would run: bash scripts\/package-runner\.sh/);
		assert.match(r.stdout, /dry-run: nothing built, pushed, or written/);
	});

	it("fails closed with exit 2 naming the namespace variable when unset", () => {
		const env = { ...process.env };
		delete env.KAINBAIN_DOCKERHUB_NAMESPACE;
		const r = spawnSync("./publish.sh", ["--dry-run", "--frontend"], { cwd: ROOT, encoding: "utf8", env });
		assert.equal(r.status, 2);
		assert.match(r.stderr, /KAINBAIN_DOCKERHUB_NAMESPACE/);
	});

	it("rejects unknown arguments with exit 2", () => {
		assert.equal(run(["--bogus"], { KAINBAIN_DOCKERHUB_NAMESPACE: "x" }).status, 2);
	});

	it("publishes the merged tip from a diverged kb/* primary with staged WIP (primary untouched)", () => {
		// Fixture repo pair: primary on kb/task with staged WIP, diverged
		// from an origin/main that advanced via another merge.
		const base = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-publish-tip-"));
		const remote = path.join(base, "origin.git");
		const dir = path.join(base, "work");
		const git = (cwd, ...args) => {
			const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
			assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
			return r.stdout.trim();
		};
		const bare = (...args) => {
			const r = spawnSync("git", args, { encoding: "utf8" });
			assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
		};
		bare("init", "--bare", remote);
		bare("init", "-b", "main", dir);
		git(dir, "config", "user.email", "publish-tip@test");
		git(dir, "config", "user.name", "publish-tip");
		const commit = (name, content, msg) => {
			fs.writeFileSync(path.join(dir, name), content);
			git(dir, "add", "-A");
			git(dir, "-c", "user.email=publish-tip@test", "-c", "user.name=publish-tip", "commit", "-qm", msg);
		};
		// Minimal publishable tree at the tip.
		fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
		fs.mkdirSync(path.join(dir, "frontend"), { recursive: true });
		fs.copyFileSync(path.join(ROOT, "publish.sh"), path.join(dir, "publish.sh"));
		fs.chmodSync(path.join(dir, "publish.sh"), 0o755);
		fs.writeFileSync(path.join(dir, "scripts", "check-component-compat.mjs"), "process.exit(0);\n");
		fs.writeFileSync(
			path.join(dir, "frontend", "version.json"),
			JSON.stringify({ component: "frontend", apiVersion: "1.0.0", requires: { backendApi: ">=1.0.0 <2.0.0" } }),
		);
		commit("file.txt", "one\n", "one");
		git(dir, "remote", "add", "origin", remote);
		git(dir, "push", "-u", "origin", "main");
		git(dir, "checkout", "-qb", "kb/task");
		commit("task.txt", "task work\n", "task work");
		git(dir, "checkout", "-q", "main");
		commit("file.txt", "merged elsewhere\n", "other merge");
		git(dir, "push", "origin", "main");
		git(dir, "checkout", "-q", "kb/task");
		fs.writeFileSync(path.join(dir, "wip.txt"), "wip\n");
		git(dir, "add", "wip.txt");
		const primaryHead = git(dir, "rev-parse", "HEAD");
		const source = path.join(base, "source");
		const r = spawnSync("./publish.sh", ["--dry-run", "--frontend"], {
			cwd: dir,
			encoding: "utf8",
			env: {
				...process.env,
				KAINBAIN_DOCKERHUB_NAMESPACE: "dryrun-probe",
				KAINBAIN_DEPLOY_SOURCE_DIR: source,
			},
		});
		assert.equal(r.status, 0, r.stderr + r.stdout);
		assert.match(r.stdout, /publishing the merged tip 'origin\/main'/);
		// Clean-checkout bootstrap: the tip worktree has no node_modules, so
		// the frontend build's deps must be installed before it can run
		// (the 2026-11-01 publish failures: vite MODULE_NOT_FOUND).
		assert.match(r.stdout, /would run: npm install --prefix frontend/);
		assert.match(r.stdout, /would run: docker build -f frontend\/Dockerfile/);
		// The publish ran in the tip worktree; the primary is untouched.
		assert.equal(git(source, "rev-parse", "HEAD"), git(dir, "rev-parse", "origin/main"));
		assert.equal(git(dir, "rev-parse", "--abbrev-ref", "HEAD"), "kb/task");
		assert.equal(git(dir, "rev-parse", "HEAD"), primaryHead);
		assert.match(git(dir, "status", "--porcelain"), /A {2}wip\.txt/);
	});
	it("runner gate runs the same suite list as scripts/run-tests.mjs (no under-tested channel)", async () => {
		// The publish gate once ran 6 runner suites and omitted every
		// updates-* suite, so a green publish could ship a broken updater.
		// The two lists are pinned equal here instead of sharing code:
		// publish.sh must stay dependency-free bash.
		const publish = fs.readFileSync(path.join(ROOT, "publish.sh"), "utf8");
		const gateLine = publish.split("\n").find((line) => line.includes("runner) run node --test"));
		assert.ok(gateLine, "publish.sh has a runner gate line");
		const gated = [...gateLine.matchAll(/runner\/[A-Za-z0-9-]+\.test\.js/g)].map((m) => m[0]).sort();
		const { buildBranches } = await import("../scripts/run-tests.mjs");
		const { branches } = buildBranches({ hasBash: true, hasDocker: true, hasDepcheck: true, nodeExec: "node", npmExec: "npm" });
		const runnerBranch = branches.find((branch) => branch.name === "Unit Tests (runner)");
		const expected = runnerBranch.args.filter((arg) => arg.startsWith("runner/")).sort();
		assert.deepEqual(gated, expected, "publish.sh runner gate names every suite in the gate branch");
	});
	it("--runner cuts and pushes the runner-v* tag once, then skips it as already released", () => {
		// Fixture repo pair with a stubbed runner build (the tag flow, not
		// the tarball, is under test): --fast skips the unit gates.
		const base = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-publish-tag-"));
		const remote = path.join(base, "origin.git");
		const dir = path.join(base, "work");
		const git = (cwd, ...args) => {
			const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
			assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
			return r.stdout.trim();
		};
		const bare = (...args) => {
			const r = spawnSync("git", args, { encoding: "utf8" });
			assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
		};
		bare("init", "--bare", remote);
		bare("init", "-b", "main", dir);
		git(dir, "config", "user.email", "publish-tag@test");
		git(dir, "config", "user.name", "publish-tag");
		fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
		fs.mkdirSync(path.join(dir, "runner"), { recursive: true });
		fs.mkdirSync(path.join(dir, "api", "node_modules"), { recursive: true });
		fs.copyFileSync(path.join(ROOT, "publish.sh"), path.join(dir, "publish.sh"));
		fs.chmodSync(path.join(dir, "publish.sh"), 0o755);
		fs.writeFileSync(path.join(dir, "scripts", "check-component-compat.mjs"), "process.exit(0);\n");
		fs.writeFileSync(
			path.join(dir, "scripts", "package-runner.sh"),
			'#!/usr/bin/env bash\nset -euo pipefail\nmkdir -p dist\necho stub > "dist/kainbain-runner-${1:-dev}.tar.gz"\n',
		);
		fs.chmodSync(path.join(dir, "scripts", "package-runner.sh"), 0o755);
		fs.writeFileSync(path.join(dir, "api", "node_modules", ".keep"), "");
		fs.writeFileSync(
			path.join(dir, "runner", "version.json"),
			JSON.stringify({ component: "runner", apiVersion: "1.0.0", runnerVersion: "0.2.0", requires: { backendApi: ">=1.0.0 <2.0.0" } }),
		);
		fs.writeFileSync(path.join(dir, "file.txt"), "one\n");
		git(dir, "add", "-A");
		git(dir, "-c", "user.email=publish-tag@test", "-c", "user.name=publish-tag", "commit", "-qm", "one");
		git(dir, "remote", "add", "origin", remote);
		git(dir, "push", "-u", "origin", "main");
		bare("--git-dir", remote, "symbolic-ref", "HEAD", "refs/heads/main");
		const head = git(dir, "rev-parse", "HEAD");
		// Dry-run first (in the fixture, so the checkout's own script runs
		// instead of re-exec'ing into the primary like the repo tests do).
		const planned = spawnSync("./publish.sh", ["--dry-run", "--runner"], { cwd: dir, encoding: "utf8", env: process.env });
		assert.equal(planned.status, 0, planned.stderr + planned.stdout);
		assert.match(planned.stdout, /would run: bash scripts\/package-runner\.sh/);
		assert.match(planned.stdout, /would run: git tag -a runner-v0\.2\.0/);
		assert.match(planned.stdout, /would run: git push origin runner-v0\.2\.0/);
		assert.match(planned.stdout, /dry-run: nothing built, pushed, or written/);
		const first = spawnSync("./publish.sh", ["--runner", "--fast"], { cwd: dir, encoding: "utf8", env: process.env });
		assert.equal(first.status, 0, first.stderr + first.stdout);
		assert.match(first.stdout, /tagged \+ pushed runner-v0\.2\.0/);
		const peeled = spawnSync("git", ["--git-dir", remote, "rev-parse", "runner-v0.2.0^{}"], { encoding: "utf8" });
		assert.equal(peeled.status, 0);
		assert.equal(peeled.stdout.trim(), head, "the tag points at the published commit");
		const second = spawnSync("./publish.sh", ["--runner", "--fast"], { cwd: dir, encoding: "utf8", env: process.env });
		assert.equal(second.status, 0, second.stderr + second.stdout);
		assert.match(second.stdout, /already exists/);
	});
	it("fast-forwards a behind local main ref when publishing from a kb/* branch", () => {
		// Same fixture shape, but origin/main advances past the local main
		// ref (via a second clone, so no history is rewritten), and the
		// primary sits on kb/task. A dry run must move the local main ref
		// to the tip without touching the checkout or its WIP.
		const base = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-publish-ff-"));
		const remote = path.join(base, "origin.git");
		const dir = path.join(base, "work");
		const git = (cwd, ...args) => {
			const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
			assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
			return r.stdout.trim();
		};
		const bare = (...args) => {
			const r = spawnSync("git", args, { encoding: "utf8" });
			assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
		};
		bare("init", "--bare", remote);
		bare("init", "-b", "main", dir);
		git(dir, "config", "user.email", "publish-ff@test");
		git(dir, "config", "user.name", "publish-ff");
		fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
		fs.mkdirSync(path.join(dir, "frontend"), { recursive: true });
		fs.copyFileSync(path.join(ROOT, "publish.sh"), path.join(dir, "publish.sh"));
		fs.chmodSync(path.join(dir, "publish.sh"), 0o755);
		fs.writeFileSync(path.join(dir, "scripts", "check-component-compat.mjs"), "process.exit(0);\n");
		fs.writeFileSync(
			path.join(dir, "frontend", "version.json"),
			JSON.stringify({ component: "frontend", apiVersion: "1.0.0", requires: { backendApi: ">=1.0.0 <2.0.0" } }),
		);
		fs.writeFileSync(path.join(dir, "file.txt"), "one\n");
		git(dir, "add", "-A");
		git(dir, "-c", "user.email=publish-ff@test", "-c", "user.name=publish-ff", "commit", "-qm", "one");
		git(dir, "remote", "add", "origin", remote);
		git(dir, "push", "-u", "origin", "main");
		bare("--git-dir", remote, "symbolic-ref", "HEAD", "refs/heads/main");
		// Advance origin/main from a second clone; local main stays behind.
		const dir2 = path.join(base, "other");
		bare("clone", "-q", remote, dir2);
		git(dir2, "config", "user.email", "publish-ff@test");
		git(dir2, "config", "user.name", "publish-ff");
		fs.writeFileSync(path.join(dir2, "file.txt"), "merged elsewhere\n");
		git(dir2, "add", "-A");
		git(dir2, "-c", "user.email=publish-ff@test", "-c", "user.name=publish-ff", "commit", "-qm", "other merge");
		git(dir2, "push", "-q", "origin", "main");
		git(dir, "fetch", "-q", "origin");
		git(dir, "checkout", "-qb", "kb/task");
		fs.writeFileSync(path.join(dir, "wip.txt"), "wip\n");
		git(dir, "add", "wip.txt");
		const primaryHead = git(dir, "rev-parse", "HEAD");
		assert.notEqual(git(dir, "rev-parse", "main"), git(dir, "rev-parse", "origin/main"));
		const r = spawnSync("./publish.sh", ["--dry-run", "--frontend"], {
			cwd: dir,
			encoding: "utf8",
			env: {
				...process.env,
				KAINBAIN_DOCKERHUB_NAMESPACE: "dryrun-probe",
				KAINBAIN_DEPLOY_SOURCE_DIR: path.join(base, "source"),
			},
		});
		assert.equal(r.status, 0, r.stderr + r.stdout);
		assert.equal(git(dir, "rev-parse", "main"), git(dir, "rev-parse", "origin/main"));
		assert.equal(git(dir, "rev-parse", "--abbrev-ref", "HEAD"), "kb/task");
		assert.equal(git(dir, "rev-parse", "HEAD"), primaryHead);
		assert.match(git(dir, "status", "--porcelain"), /A {2}wip\.txt/);
	});
});
