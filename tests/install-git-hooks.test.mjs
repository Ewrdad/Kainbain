import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { HOOKS_PATH, installGitHooks, main } from "../scripts/install-git-hooks.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INSTALLER = path.join(HERE, "..", "scripts", "install-git-hooks.mjs");

/***
 * MARK: makeDir
 * @description A scratch directory under the OS temp dir.
 ***/
function makeDir(prefix) {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/***
 * MARK: makeGitRepo
 * @description A scratch directory that is also a git repository.
 ***/
function makeGitRepo() {
	const root = makeDir("hooks-repo-");
	execFileSync("git", ["init", "-q"], { cwd: root, stdio: "ignore" });
	return root;
}

function readHooksPath(root) {
	try {
		return execFileSync("git", ["-C", root, "config", "--get", "core.hooksPath"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return null;
	}
}

describe("installGitHooks", () => {
	it("sets core.hooksPath in a fresh git repo and reports installed/0", () => {
		const root = makeGitRepo();
		try {
			const result = installGitHooks({ root });
			assert.equal(result.status, "installed");
			assert.equal(result.exitCode, 0);
			assert.equal(readHooksPath(root), HOOKS_PATH);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("is idempotent: a second run reports already-set/0 and changes nothing", () => {
		const root = makeGitRepo();
		try {
			installGitHooks({ root });
			const again = installGitHooks({ root });
			assert.equal(again.status, "already-set");
			assert.equal(again.exitCode, 0);
			assert.equal(readHooksPath(root), HOOKS_PATH);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("never overwrites a foreign hooksPath: reports foreign/2 and leaves the value", () => {
		const root = makeGitRepo();
		try {
			execFileSync("git", ["-C", root, "config", "core.hooksPath", ".husky"], { stdio: "ignore" });
			const result = installGitHooks({ root });
			assert.equal(result.status, "foreign");
			assert.equal(result.exitCode, 2);
			assert.match(result.detail, /\.husky/);
			assert.equal(readHooksPath(root), ".husky");
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("reports not-a-repo/0 outside a git work tree (nothing to hook)", () => {
		const root = makeDir("hooks-notrepo-");
		try {
			const result = installGitHooks({ root });
			assert.equal(result.status, "not-a-repo");
			assert.equal(result.exitCode, 0);
			assert.match(result.detail, /not inside a git work tree/);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("covers linked worktrees: setting it in the primary checkout reads back in a worktree", () => {
		const root = makeGitRepo();
		const worktree = path.join(makeDir("hooks-wt-"), "kb-demo");
		try {
			execFileSync("git", ["-C", root, "config", "user.email", "t@t.t"], { stdio: "ignore" });
			execFileSync("git", ["-C", root, "config", "user.name", "t"], { stdio: "ignore" });
			fs.writeFileSync(path.join(root, "f.txt"), "x");
			execFileSync("git", ["-C", root, "add", "."], { stdio: "ignore" });
			execFileSync("git", ["-C", root, "commit", "-qm", "init"], { stdio: "ignore" });
			installGitHooks({ root });
			execFileSync("git", ["-C", root, "worktree", "add", worktree, "-b", "kb/demo"], { stdio: "ignore" });
			// Worktrees share the common config, so the hook path set in the
			// primary checkout is visible inside the linked worktree.
			assert.equal(readHooksPath(worktree), HOOKS_PATH);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
			fs.rmSync(path.dirname(worktree), { recursive: true, force: true });
		}
	});
});

describe("install-git-hooks CLI", () => {
	function runInstaller(...cliArgs) {
		return spawnSync(process.execPath, [INSTALLER, ...cliArgs], { encoding: "utf8" });
	}

	it("installs for --root and exits 0 with a success line", () => {
		const root = makeGitRepo();
		try {
			const result = runInstaller("--root", root);
			assert.equal(result.status, 0);
			assert.match(result.stdout, /installed/);
			assert.equal(readHooksPath(root), HOOKS_PATH);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("exits 2 on a foreign hooksPath and names the current value", () => {
		const root = makeGitRepo();
		try {
			execFileSync("git", ["-C", root, "config", "core.hooksPath", ".husky"], { stdio: "ignore" });
			const result = runInstaller("--root", root);
			assert.equal(result.status, 2);
			assert.match(result.stderr, /foreign/);
			assert.match(result.stderr, /\.husky/);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("exits 2 on an unknown argument and on a --root that steals a flag", () => {
		assert.equal(runInstaller("--bogus").status, 2);
		const stolen = runInstaller("--root", "--staged");
		assert.equal(stolen.status, 2);
		assert.match(stolen.stderr, /--root requires a directory argument/);
	});

	it("documents the exit-code contract in --help", () => {
		const result = runInstaller("--help");
		assert.equal(result.status, 0);
		assert.match(result.stdout, /exit 0/);
		assert.match(result.stdout, /exit 2/);
	});

	it("main() maps argument errors to exit 2 without touching the filesystem", () => {
		assert.equal(main(["node", "install-git-hooks.mjs", "--nope"]), 2);
		assert.equal(main(["node", "install-git-hooks.mjs", "--root"]), 2);
	});
});
