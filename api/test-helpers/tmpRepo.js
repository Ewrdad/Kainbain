/* eslint-disable security/detect-non-literal-fs-filename */
// Domain: test support — one shared throwaway-git-repo fixture.
//
// Every test in this file operates on throwaway temp directories (never the
// KainBain repo itself) so branch/checkout/lock tests can run real git.
// Importers calling `skipIfNoGit` first keep the suite green on machines
// without a git binary.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

/***
 * MARK: gitAvailable
 * @description Whether a git binary is usable here. Gate real-git suites
 *   with `describe.skipIf(!gitAvailable)` so they skip (not fail) elsewhere.
 * @example gitAvailable => true
 ***/
export let gitAvailable = true;
try {
	execFileSync("git", ["--version"], { stdio: "ignore" });
} catch {
	gitAvailable = false;
}

/***
 * MARK: runGit
 * @description Synchronously runs a git argv array in `cwd` and returns
 *   stdout. Test setup only — never production code.
 * @example runGit(cwd, "init", "-b", "main") => ''
 * @param {string} cwd - Throwaway repository directory.
 * @param {...string} args - Git argument array.
 * @returns {string} Stdout of the command.
 ***/
export function runGit(cwd, ...args) {
	return execFileSync("git", args, {
		cwd,
		stdio: ["ignore", "pipe", "pipe"],
	}).toString();
}

/***
 * MARK: makeTmpBase
 * @description Creates a unique temp directory to parent per-test repos.
 *   Pair with `rm -rf` (see makeRepoTracker) for cleanup.
 * @example const base = makeTmpBase("kainbain-gitlock-")
 * @param {string} [prefix="kainbain-tmp-repo-"] - mkdtemp prefix.
 * @returns {string} New empty temp directory.
 ***/
export function makeTmpBase(prefix = "kainbain-tmp-repo-") {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/***
 * MARK: makeRepoTracker
 * @description Cleanup tracker: `track(dir)` remembers a directory,
 *   `cleanup()` removes every tracked directory best-effort. Use in
 *   afterAll/afterEach so temp repos never leak between runs.
 * @example const repos = makeRepoTracker(); const cwd = initRepo(...); repos.track(cwd);
 * @returns {{track: Function, cleanup: Function}}
 ***/
export function makeRepoTracker() {
	const dirs = [];
	return {
		track(dir) {
			if (dir) dirs.push(dir);
			return dir;
		},
		cleanup() {
			for (const dir of dirs.splice(0)) {
				try {
					fs.rmSync(dir, { recursive: true, force: true });
				} catch {
					// best-effort cleanup
				}
			}
		},
	};
}

/***
 * MARK: initRepo
 * @description Seeds a throwaway branch-mode git repo: `git init -b`,
 *   test identity, one commit. Returns the repo directory.
 * @example const cwd = initRepo(path.join(base, "r1"))
 * @param {string} cwd - Directory to initialize (created recursively).
 * @param {Object} [opts]
 * @param {string} [opts.initialBranch="main"] - Default branch name.
 * @returns {string} The repo directory.
 ***/
export function initRepo(cwd, { initialBranch = "main" } = {}) {
	fs.mkdirSync(cwd, { recursive: true });
	runGit(cwd, "init", "-b", initialBranch);
	runGit(cwd, "config", "user.email", "kainbain-test@example.com");
	runGit(cwd, "config", "user.name", "KainBain Test");
	fs.writeFileSync(path.join(cwd, "README.md"), "# init\n");
	runGit(cwd, "add", "-A");
	runGit(cwd, "commit", "-m", "init");
	return cwd;
}

/***
 * MARK: plantIndexLock
 * @description Plants a `.git/index.lock` file with a controlled mtime for
 *   stale-lock tests. `ageMs` backdates the lock (old = stale candidate,
 *   0 = fresh). Returns the lock path.
 * @example const lock = plantIndexLock(cwd, 120_000)
 * @param {string} cwd - Throwaway repository directory.
 * @param {number} [ageMs=0] - How old the lock should appear (ms).
 * @returns {string} Absolute path of the planted lock file.
 ***/
export function plantIndexLock(cwd, ageMs = 0) {
	const lockPath = path.join(cwd, ".git", "index.lock");
	fs.writeFileSync(lockPath, "");
	if (ageMs > 0) {
		const at = new Date(Date.now() - ageMs);
		fs.utimesSync(lockPath, at, at);
	}
	return lockPath;
}
