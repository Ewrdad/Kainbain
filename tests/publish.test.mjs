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
		assert.match(r.stdout, /would run: docker build -f frontend\/Dockerfile/);
		// The publish ran in the tip worktree; the primary is untouched.
		assert.equal(git(source, "rev-parse", "HEAD"), git(dir, "rev-parse", "origin/main"));
		assert.equal(git(dir, "rev-parse", "--abbrev-ref", "HEAD"), "kb/task");
		assert.equal(git(dir, "rev-parse", "HEAD"), primaryHead);
		assert.match(git(dir, "status", "--porcelain"), /A {2}wip\.txt/);
	});
});
