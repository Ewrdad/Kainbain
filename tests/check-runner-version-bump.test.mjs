import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	checkRunnerVersionBump,
	defaultBaseRef,
	isRunnerCodePath,
	parseGateSemver,
	readRunnerVersionAtRef,
	semverGreater,
} from "../scripts/check-runner-version-bump.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "check-runner-version-bump.mjs");

const gitAvailable = (() => {
	try {
		execFileSync("git", ["--version"], { stdio: ["ignore", "pipe", "ignore"] });
		return true;
	} catch {
		return false;
	}
})();

describe("isRunnerCodePath", () => {
	it("flags runner code and harness code, nothing else", () => {
		for (const p of ["runner/daemon.js", "runner/updates/index.js", "api/agent/harnesses/pi/piHarness.js"]) {
			assert.equal(isRunnerCodePath(p), true, p);
		}
		for (const p of [
			"runner/version.json",
			"runner/daemon.test.js",
			"runner/README.md",
			"runner/notes.markdown",
			"runner/notes.mdx",
			"runner/README.MD",
			"runner/daemon.TEST.js",
			"runner/daemon.Spec.ts",
			"api/agent/harnesses/pi/piHarness.test.js",
			"api/agent/harnessDiscovery.js",
			"api/routes/status.js",
			"api/version.json",
			"frontend/src/App.jsx",
			"shared/servingModelFor.js",
			"docs/foo.md",
			"",
		]) {
			assert.equal(isRunnerCodePath(p), false, p);
		}
	});
});

describe("parseGateSemver / semverGreater", () => {
	it("parses strict semver with an optional pre-release", () => {
		assert.deepEqual(parseGateSemver("v1.2.3-rc.1"), { major: 1, minor: 2, patch: 3, prerelease: ["rc", "1"] });
		assert.deepEqual(parseGateSemver("1.2.3"), { major: 1, minor: 2, patch: 3, prerelease: [] });
		assert.equal(parseGateSemver("1.2"), null);
		assert.equal(parseGateSemver("not-a-version"), null);
		assert.equal(parseGateSemver(null), null);
	});

	it("orders versions under semver precedence", () => {
		assert.equal(semverGreater("0.2.0", "0.1.0"), true);
		assert.equal(semverGreater("0.10.0", "0.9.0"), true);
		assert.equal(semverGreater("0.1.0", "0.1.0"), false);
		assert.equal(semverGreater("0.0.9", "0.1.0"), false);
		assert.equal(semverGreater("1.2.4-rc.1", "1.2.3"), true);
		assert.equal(semverGreater("1.2.3", "1.2.3-rc.1"), true);
		assert.equal(semverGreater("1.2.3-rc.2", "1.2.3-rc.1"), true);
		assert.equal(semverGreater("1.2.3-rc.1", "1.2.3"), false);
		assert.equal(semverGreater("bogus", "0.1.0"), false);
		assert.equal(semverGreater("0.2.0", "bogus"), false);
	});
});

describe("checkRunnerVersionBump", () => {
	it("fails when runner code changed without a version increase", () => {
		const verdict = checkRunnerVersionBump({
			changedFiles: ["runner/daemon.js", "frontend/src/App.jsx"],
			baseVersion: "0.9.0",
			headVersion: "0.9.0",
		});
		assert.equal(verdict.ok, false);
		assert.deepEqual(verdict.triggers, ["runner/daemon.js"]);
		assert.match(verdict.reason, /runner\/daemon\.js/);
		assert.match(verdict.reason, /bump runnerVersion/);
	});

	it("fails when harness code changed without a version increase", () => {
		const verdict = checkRunnerVersionBump({
			changedFiles: ["api/agent/harnesses/pi/piHarness.js"],
			baseVersion: "0.9.0",
			headVersion: "0.9.0",
		});
		assert.equal(verdict.ok, false);
	});

	it("passes when the version increased over the base", () => {
		const verdict = checkRunnerVersionBump({
			changedFiles: ["runner/daemon.js"],
			baseVersion: "0.9.0",
			headVersion: "0.9.1",
		});
		assert.equal(verdict.ok, true);
		assert.equal(verdict.warned, false);
	});

	it("passes trivially when no runner code changed", () => {
		for (const changedFiles of [[], ["frontend/src/App.jsx"], ["runner/version.json"], ["runner/daemon.test.js"]]) {
			const verdict = checkRunnerVersionBump({ changedFiles, baseVersion: "0.9.0", headVersion: "0.9.0" });
			assert.equal(verdict.ok, true, JSON.stringify(changedFiles));
		}
	});

	it("warn-passes when the base version is unreadable (first release)", () => {
		const verdict = checkRunnerVersionBump({
			changedFiles: ["runner/daemon.js"],
			baseVersion: null,
			headVersion: "0.1.0",
		});
		assert.equal(verdict.ok, true);
		assert.equal(verdict.warned, true);
	});

	it("fails when the release version is not semver", () => {
		const verdict = checkRunnerVersionBump({
			changedFiles: ["runner/daemon.js"],
			baseVersion: "0.9.0",
			headVersion: "bogus",
		});
		assert.equal(verdict.ok, false);
		assert.match(verdict.reason, /not semver/);
	});
});

describe("check-runner-version-bump CLI", () => {
	const runCli = (args) =>
		spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });

	const writeFilesList = (lines) => {
		const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kb-bump-")), "changed.txt");
		fs.writeFileSync(file, `${lines.join("\n")}\n`);
		return file;
	};

	it("exits 1 on runner-code change without a bump (--files hermetic mode)", () => {
		const files = writeFilesList(["runner/daemon.js"]);
		try {
			const res = runCli(["--files", files, "--base-version", "0.9.0", "--head-version", "0.9.0"]);
			assert.equal(res.status, 1);
			assert.match(res.stderr, /bump runnerVersion/);
		} finally {
			fs.rmSync(path.dirname(files), { recursive: true, force: true });
		}
	});

	it("exits 0 when the version increased, or when no runner code changed", () => {
		const bumped = writeFilesList(["runner/daemon.js"]);
		const unrelated = writeFilesList(["frontend/src/App.jsx"]);
		try {
			const okBump = runCli(["--files", bumped, "--base-version", "0.9.0", "--head-version", "0.10.0"]);
			assert.equal(okBump.status, 0);
			assert.match(okBump.stdout, /OK/);
			const okUnrelated = runCli(["--files", unrelated, "--base-version", "0.9.0", "--head-version", "0.9.0"]);
			assert.equal(okUnrelated.status, 0);
		} finally {
			fs.rmSync(path.dirname(bumped), { recursive: true, force: true });
			fs.rmSync(path.dirname(unrelated), { recursive: true, force: true });
		}
	});

	it("rejects an unbumped release over a real git range, then accepts the bump", { skip: !gitAvailable }, () => {
		const repo = fs.mkdtempSync(path.join(os.tmpdir(), "kb-bump-repo-"));
		try {
			const git = (args) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
			git(["init", "-q"]);
			git(["config", "user.email", "t@t.t"]);
			git(["config", "user.name", "t"]);
			fs.mkdirSync(path.join(repo, "runner"), { recursive: true });
			fs.writeFileSync(path.join(repo, "runner", "daemon.js"), "v1\n");
			fs.writeFileSync(
				path.join(repo, "runner", "version.json"),
				JSON.stringify({ component: "runner", apiVersion: "1.0.0", runnerVersion: "0.9.0" }),
			);
			git(["add", "."]);
			git(["commit", "-qm", "base"]);
			git(["tag", "runner-v0.9.0"]);
			// Runner code changes, version untouched: the release must fail.
			fs.writeFileSync(path.join(repo, "runner", "daemon.js"), "v2\n");
			git(["add", "."]);
			git(["commit", "-qm", "runner change without bump"]);
			assert.equal(defaultBaseRef({ root: repo }), "runner-v0.9.0");
			assert.equal(readRunnerVersionAtRef("runner-v0.9.0", repo), "0.9.0");
			const rejected = runCli(["--root", repo, "--head-version", "0.9.0"]);
			assert.equal(rejected.status, 1, `expected rejection, got: ${rejected.stdout}${rejected.stderr}`);
			assert.match(rejected.stderr, /runnerVersion did not increase/);
			// Bumping the version (the documented fix) lets it through.
			fs.writeFileSync(
				path.join(repo, "runner", "version.json"),
				JSON.stringify({ component: "runner", apiVersion: "1.0.0", runnerVersion: "0.9.1" }),
			);
			git(["add", "."]);
			git(["commit", "-qm", "bump runnerVersion"]);
			const accepted = runCli(["--root", repo, "--head-version", "0.9.1"]);
			assert.equal(accepted.status, 0, `expected acceptance, got: ${accepted.stdout}${accepted.stderr}`);
			// The CI scenario: the release tag sits at HEAD (the workflow
			// checks the tag out), so the base must be the PREVIOUS
			// release tag, not HEAD itself.
			git(["tag", "runner-v0.9.1"]);
			assert.equal(defaultBaseRef({ root: repo }), "runner-v0.9.0");
			const tagged = runCli(["--root", repo, "--head-version", "0.9.1"]);
			assert.equal(tagged.status, 0, `expected acceptance at the release tag, got: ${tagged.stdout}${tagged.stderr}`);
		} finally {
			fs.rmSync(repo, { recursive: true, force: true });
		}
	});

	it("warn-passes on a repo with no previous runner release", { skip: !gitAvailable }, () => {
		const repo = fs.mkdtempSync(path.join(os.tmpdir(), "kb-bump-repo-"));
		try {
			const git = (args) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
			git(["init", "-q"]);
			git(["config", "user.email", "t@t.t"]);
			git(["config", "user.name", "t"]);
			fs.mkdirSync(path.join(repo, "runner"), { recursive: true });
			fs.writeFileSync(path.join(repo, "runner", "daemon.js"), "v1\n");
			git(["add", "."]);
			git(["commit", "-qm", "first"]);
			assert.equal(defaultBaseRef({ root: repo }), null);
			const res = runCli(["--root", repo, "--head-version", "0.1.0"]);
			assert.equal(res.status, 0);
			assert.match(res.stderr, /first release/);
		} finally {
			fs.rmSync(repo, { recursive: true, force: true });
		}
	});
});
