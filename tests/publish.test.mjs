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
		assert.match(r.stdout, /would run: node --test runner\/ciBranchWorkdir\.test\.js/, "dry-run plan includes the derived runner gate");
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
	it("runner gate derives its suite list live from scripts/run-tests.mjs (single source, no second copy)", async () => {
		// The publish gate once ran 6 runner suites and omitted every
		// updates-* suite, so a green publish could ship a broken updater;
		// later the list lived in TWO places and a one-list edit failed the
		// whole fast gate in CI (task 78eac844). There is exactly one list
		// now — RUNNER_TEST_SUITES in scripts/run-tests.mjs — and publish.sh
		// reads it live via node (which the gate already requires), so a
		// run-tests/publish mismatch is impossible by construction.
		const publish = fs.readFileSync(path.join(ROOT, "publish.sh"), "utf8");
		// 1. No hand-maintained copy: no runner suite filename anywhere in
		// publish.sh (not on the deriving line either — it names the script
		// and flag, never suite files).
		const hardcoded = [...publish.matchAll(/runner\/[A-Za-z0-9.-]+\.test\.js/g)].map((m) => m[0]);
		assert.deepEqual(hardcoded, [], "publish.sh must not hardcode runner suite files — it derives them from scripts/run-tests.mjs");
		// 2. The runner case of gate_for() derives from the single source.
		const lines = publish.split("\n");
		const gateStart = lines.findIndex((line) => line === "gate_for() {");
		assert.ok(gateStart >= 0, "publish.sh defines gate_for()");
		const runnerLine = lines.findIndex((line, i) => i > gateStart && line.includes("runner)"));
		assert.ok(runnerLine >= 0, "publish.sh gate_for() has a runner case");
		const caseEnd = lines.findIndex((line, i) => i >= runnerLine && line.includes(";;"));
		assert.ok(caseEnd >= runnerLine, "runner case terminates");
		const runnerCase = lines.slice(runnerLine, caseEnd + 1).join("\n");
		assert.ok(runnerCase.includes("scripts/run-tests.mjs"), "runner case reads scripts/run-tests.mjs");
		assert.ok(runnerCase.includes("--print-runner-suites"), "runner case uses the --print-runner-suites derivation contract");
		assert.ok(runnerCase.includes("return 1"), "runner case fails closed when the lookup fails");
		// 3. What publish runs is exactly what the gate branch runs: the
		// print-mode output deep-equals the branch args (same binding, same
		// order) — the old "no under-tested channel" intent survives.
		const printed = spawnSync(process.execPath, [path.join(ROOT, "scripts", "run-tests.mjs"), "--print-runner-suites"], { encoding: "utf8" });
		assert.equal(printed.status, 0, printed.stderr);
		const { buildBranches } = await import("../scripts/run-tests.mjs");
		const { branches } = buildBranches({ hasBash: true, hasDocker: true, hasDepcheck: true, nodeExec: "node", npmExec: "npm" });
		const runnerBranch = branches.find((branch) => branch.name === "Unit Tests (runner)");
		const expected = runnerBranch.args.filter((arg) => arg.startsWith("runner/"));
		assert.deepEqual(printed.stdout.trim().split("\n"), expected, "publish.sh can only run what the gate branch names");
	});
	it("runner gate executes the derived suites and fails closed when the lookup fails", async () => {
		// Runs the REAL gate_for() from publish.sh in a harness with a
		// stubbed run() (echo only — no suites execute): in the repo it
		// must expand to every suite; where the lookup cannot succeed it
		// must refuse with non-zero exit and never echo a vacuous
		// `node --test` with no files.
		const publish = fs.readFileSync(path.join(ROOT, "publish.sh"), "utf8");
		const lines = publish.split("\n");
		const start = lines.findIndex((line) => line === "gate_for() {");
		assert.ok(start >= 0, "publish.sh defines gate_for()");
		const end = lines.findIndex((line, i) => i > start && line === "}");
		assert.ok(end > start, "gate_for() has a closing brace");
		const gateFn = lines.slice(start, end + 1).join("\n");
		const { RUNNER_TEST_SUITES } = await import("../scripts/run-tests.mjs");
		assert.ok(RUNNER_TEST_SUITES.length > 0, "single source is non-empty");
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-publish-runner-gate-"));
		try {
			const harnessPath = path.join(dir, "gate.sh");
			fs.writeFileSync(harnessPath, `run() { echo "would run: $*"; }\n${gateFn}\ngate_for runner\n`);
			const ok = spawnSync("bash", [harnessPath], { cwd: ROOT, encoding: "utf8" });
			assert.equal(ok.status, 0, ok.stderr);
			for (const suite of RUNNER_TEST_SUITES) {
				assert.ok(ok.stdout.includes(suite), `derived gate runs ${suite}`);
			}
			const brokenPath = path.join(dir, "gate-broken.sh");
			fs.writeFileSync(
				brokenPath,
				`run() { echo "would run: $*"; }\n${gateFn.replaceAll("scripts/run-tests.mjs", "scripts/does-not-exist.mjs")}\ngate_for runner\n`,
			);
			const bad = spawnSync("bash", [brokenPath], { cwd: dir, encoding: "utf8" });
			assert.notEqual(bad.status, 0, "broken lookup must fail closed");
			assert.match(bad.stderr, /refusing to run a gate with no files/);
			assert.doesNotMatch(bad.stdout, /would run: node --test/, "must never run a vacuous node --test");
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
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
		// The runner gate derives its suite list live from
		// scripts/run-tests.mjs --print-runner-suites (even under
		// --dry-run, where only the test command is echoed), so the
		// fixture stubs the print mode; the real derivation is covered
		// by the gate_for harness tests above, not by this tag flow.
		fs.writeFileSync(
			path.join(dir, "scripts", "run-tests.mjs"),
			'if (process.argv.includes("--print-runner-suites")) { console.log("runner/fixture-stub.test.js"); }\n',
		);
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
		assert.match(planned.stdout, /would run: node --test runner\/fixture-stub\.test\.js/, "dry-run expands the derived runner gate");
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

	it("installs frontend deps on a warm checkout when a newly declared package.json dependency is missing from node_modules", () => {
		const base = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-publish-stale-deps-"));
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
		git(dir, "config", "user.email", "publish-deps@test");
		git(dir, "config", "user.name", "publish-deps");
		fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
		fs.mkdirSync(path.join(dir, "frontend", "node_modules", "react"), { recursive: true });
		fs.copyFileSync(path.join(ROOT, "publish.sh"), path.join(dir, "publish.sh"));
		fs.chmodSync(path.join(dir, "publish.sh"), 0o755);
		fs.writeFileSync(path.join(dir, "scripts", "check-component-compat.mjs"), "process.exit(0);\n");
		fs.writeFileSync(
			path.join(dir, "frontend", "version.json"),
			JSON.stringify({ component: "frontend", apiVersion: "1.0.0", requires: { backendApi: ">=1.0.0 <2.0.0" } }),
		);
		fs.writeFileSync(
			path.join(dir, "frontend", "package.json"),
			JSON.stringify({ name: "frontend", dependencies: { react: "^18.0.0", mermaid: "^12.3.0" } }),
		);
		fs.writeFileSync(
			path.join(dir, "frontend", "node_modules", "react", "package.json"),
			JSON.stringify({ name: "react", version: "18.0.0" }),
		);
		fs.writeFileSync(path.join(dir, ".gitignore"), "frontend/node_modules/\n");
		git(dir, "add", "-A");
		git(dir, "-c", "user.email=publish-deps@test", "-c", "user.name=publish-deps", "commit", "-qm", "add mermaid");
		git(dir, "remote", "add", "origin", remote);
		git(dir, "push", "-u", "origin", "main");
		bare("--git-dir", remote, "symbolic-ref", "HEAD", "refs/heads/main");

		// Even though frontend/node_modules exists (warm checkout), mermaid is missing:
		const r1 = spawnSync("./publish.sh", ["--dry-run", "--frontend"], {
			cwd: dir,
			encoding: "utf8",
			env: { ...process.env, KAINBAIN_DOCKERHUB_NAMESPACE: "dryrun-probe" },
		});
		assert.equal(r1.status, 0, r1.stderr + r1.stdout);
		assert.match(r1.stdout, /would run: npm install --prefix frontend --include=dev/);

		// Once mermaid lands in frontend/node_modules, publish skips the install:
		fs.mkdirSync(path.join(dir, "frontend", "node_modules", "mermaid"), { recursive: true });
		fs.writeFileSync(
			path.join(dir, "frontend", "node_modules", "mermaid", "package.json"),
			JSON.stringify({ name: "mermaid", version: "12.3.0" }),
		);
		const r2 = spawnSync("./publish.sh", ["--dry-run", "--frontend"], {
			cwd: dir,
			encoding: "utf8",
			env: { ...process.env, KAINBAIN_DOCKERHUB_NAMESPACE: "dryrun-probe" },
		});
		assert.equal(r2.status, 0, r2.stderr + r2.stdout);
		assert.doesNotMatch(r2.stdout, /would run: npm install --prefix frontend/);
	});
});
