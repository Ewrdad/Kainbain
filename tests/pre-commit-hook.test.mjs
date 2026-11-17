import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");

const VALID_PNG = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
// The text-round-trip corruption signature: U+FFFD (ef bf bd) where 0x89 belongs.
const CORRUPT_PNG = Buffer.from([
	0xef, 0xbf, 0xbd, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);

/***
 * MARK: makeHookableRepo
 * @description Builds a fixture git repo that carries the real committed
 *   hook and guard scripts (copied from this repo, so the test exercises the
 *   exact bytes agents get), points core.hooksPath at scripts/githooks, and
 *   seeds the given files. Returns the repo root; callers remove it.
 * @example const root = makeHookableRepo({ "docs/tasks/demo/p.png": CORRUPT_PNG })
 ***/
function makeHookableRepo(files) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pre-commit-hook-"));
	for (const [relPath, content] of Object.entries(files)) {
		const full = path.join(root, relPath);
		fs.mkdirSync(path.dirname(full), { recursive: true });
		fs.writeFileSync(full, content);
	}
	// The hook runs `node <root>/scripts/check-binary-guard.mjs`, which
	// imports ./check-proof-and-hygiene.mjs — copy both, plus the hook.
	for (const rel of [
		"scripts/check-binary-guard.mjs",
		"scripts/check-proof-and-hygiene.mjs",
		"scripts/githooks/pre-commit",
	]) {
		const target = path.join(root, rel);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.copyFileSync(path.join(REPO_ROOT, rel), target);
	}
	fs.chmodSync(path.join(root, "scripts/githooks/pre-commit"), 0o755);
	execFileSync("git", ["init", "-q"], { cwd: root, stdio: "ignore" });
	execFileSync("git", ["config", "user.email", "hook-test@example.com"], { cwd: root, stdio: "ignore" });
	execFileSync("git", ["config", "user.name", "hook-test"], { cwd: root, stdio: "ignore" });
	execFileSync("git", ["config", "core.hooksPath", "scripts/githooks"], { cwd: root, stdio: "ignore" });
	return root;
}

function git(cwd, args) {
	return spawnSync("git", args, { cwd, encoding: "utf8" });
}

describe("pre-commit hook (end to end, real git commit)", () => {
	it("blocks a commit that stages a text-corrupted PNG, naming the file and the safe remedy", () => {
		const root = makeHookableRepo({ "docs/tasks/demo/pretty-proof.png": CORRUPT_PNG });
		try {
			assert.equal(git(root, ["add", "docs/tasks/demo/pretty-proof.png"]).status, 0);
			const commit = git(root, ["commit", "-m", "stage output"]);
			assert.notEqual(commit.status, 0, "commit must be rejected");
			const err = commit.stderr + commit.stdout;
			assert.match(err, /pretty-proof\.png/);
			assert.match(err, /expected magic 89504e47, found efbfbd/);
			assert.match(err, /capture-screenshot\.mjs/);
			assert.match(err, /binary guard rejected staged binaries/);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("allows the commit once the staged PNG has valid magic", () => {
		const root = makeHookableRepo({ "docs/tasks/demo/pretty-proof.png": CORRUPT_PNG });
		try {
			git(root, ["add", "docs/tasks/demo/pretty-proof.png"]);
			assert.notEqual(git(root, ["commit", "-m", "bad"]).status, 0);
			// Binary-safe "restore": rewrite the bytes directly, never via a text tool.
			fs.writeFileSync(path.join(root, "docs/tasks/demo/pretty-proof.png"), VALID_PNG);
			git(root, ["add", "docs/tasks/demo/pretty-proof.png"]);
			const commit = git(root, ["commit", "-m", "stage output"]);
			assert.equal(commit.status, 0, commit.stderr);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("--no-verify still bypasses (documented for intentional baseline entries only)", () => {
		const root = makeHookableRepo({ "docs/tasks/demo/pretty-proof.png": CORRUPT_PNG });
		try {
			git(root, ["add", "docs/tasks/demo/pretty-proof.png"]);
			const commit = git(root, ["commit", "--no-verify", "-m", "baseline entry"]);
			assert.equal(commit.status, 0, commit.stderr);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("passes a clean tree commit (hook runs, finds nothing corrupt)", () => {
		const root = makeHookableRepo({
			"docs/tasks/demo/pretty-proof.png": VALID_PNG,
			"docs/tasks/demo/notes.md": Buffer.from("text\n"),
		});
		try {
			git(root, ["add", "."]);
			const commit = git(root, ["commit", "-m", "clean"]);
			assert.equal(commit.status, 0, commit.stderr);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});
