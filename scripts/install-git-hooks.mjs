#!/usr/bin/env node
/***
 * MARK: install-git-hooks.mjs
 * @description Installs this repo's committed git hooks for one checkout by
 *   setting the repo-local `core.hooksPath` to `scripts/githooks` — today
 *   that directory holds the pre-commit binary guard
 *   (scripts/githooks/pre-commit), which fails fast when a staged binary
 *   (PNG proof, image asset, zip/tgz) has corrupt magic bytes, naming the
 *   file and the safe remedy. Idempotent: re-running is a no-op. Linked
 *   worktrees share the repo's common config, so one install also covers
 *   every engine-created `kb-*` worktree of the same repo. A FOREIGN
 *   hooksPath (e.g. husky's `.husky`) is never overwritten — that exits 2
 *   with the manual remedy, because clobbering another tool's hook path
 *   would silently disable it. Outside a git work tree there is nothing to
 *   install (exit 0 with a note, e.g. exported tarballs) — the `npm test`
 *   "Binary Guard" branch still enforces magic bytes on every gate run.
 *   Runs automatically as the last step of `npm run setup`; also available
 *   as `npm run hooks:install`. Dependency-free (Node stdlib only).
 * @example node scripts/install-git-hooks.mjs (install for this checkout)
 * @example node scripts/install-git-hooks.mjs --root /tmp/fixture-repo (tests)
 * Exit codes: 0 installed / already-set / not-a-git-work-tree; 2 git
 *   missing, foreign hooksPath, or usage error — never a silent no-op.
 ***/

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");

/***
 * MARK: HOOKS_PATH
 * @description The repo-relative hooks directory this installer activates.
 *   Relative paths resolve against the worktree top when git runs hooks,
 *   so the same value works in the primary checkout and every linked
 *   worktree.
 ***/
export const HOOKS_PATH = "scripts/githooks";

/***
 * MARK: runGitQuiet
 * @description Runs one git argv in a directory, returning stdout trimmed,
 *   or null when the command fails (unset config, not a repo, ...). Never
 *   throws — callers branch on null.
 * @example runGitQuiet("/repo", ["config", "--get", "core.hooksPath"]) => "scripts/githooks" | null
 * @param {string} root - Directory to run git in.
 * @param {string[]} args - Git argv (no shell).
 * @returns {string|null} Trimmed stdout, or null on any failure.
 ***/
export function runGitQuiet(root, args) {
	try {
		return execFileSync("git", ["-C", root, ...args], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return null;
	}
}

/***
 * MARK: installGitHooks
 * @description Decides and performs the hooks install for one checkout.
 *   Decision table, in order: git missing → `git-missing` (exit 2);
 *   not a git work tree → `not-a-repo` (exit 0, nothing to hook); current
 *   hooksPath already ours → `already-set` (0); foreign hooksPath →
 *   `foreign` (2, left untouched, remedy in the message); otherwise set it
 *   → `installed` (0). A git write failure is `git-failed` (2) — never a
 *   silent no-op.
 * @example installGitHooks({ root: "/repo" }) => { status: "installed", exitCode: 0, ... }
 * @param {Object} [opts]
 * @param {string} [opts.root] - Checkout to configure (default: this repo).
 * @returns {{ status: string, exitCode: number, detail: string }}
 ***/
export function installGitHooks({ root = REPO_ROOT } = {}) {
	if (runGitQuiet(root, ["--version"]) === null) {
		return {
			status: "git-missing",
			exitCode: 2,
			detail: "git is not available on PATH, so hooks cannot be installed; the `npm test` Binary Guard branch still enforces binary magic on every run.",
		};
	}
	if (runGitQuiet(root, ["rev-parse", "--is-inside-work-tree"]) !== "true") {
		return {
			status: "not-a-repo",
			exitCode: 0,
			detail: `${root} is not inside a git work tree (exported tarball?); nothing to hook. The \`npm test\` Binary Guard branch still enforces binary magic on every run.`,
		};
	}
	const current = runGitQuiet(root, ["config", "--get", "core.hooksPath"]);
	if (current === HOOKS_PATH) {
		return { status: "already-set", exitCode: 0, detail: `core.hooksPath is already ${HOOKS_PATH} in ${root}.` };
	}
	if (current) {
		return {
			status: "foreign",
			exitCode: 2,
			detail: `${root} already has core.hooksPath=${current} (another hook manager owns it) — left untouched. `
				+ `To add the binary guard by hand, chain it in that manager or run: git -C ${root} config core.hooksPath ${HOOKS_PATH}. `
				+ "Until then, `npm run check:binaries` and the `npm test` Binary Guard branch still enforce binary magic.",
		};
	}
	const setResult = runGitQuiet(root, ["config", "core.hooksPath", HOOKS_PATH]);
	// config writes nothing to stdout; verify by reading back so a failed
	// write can never report success.
	const readBack = runGitQuiet(root, ["config", "--get", "core.hooksPath"]);
	if (setResult !== "" || readBack !== HOOKS_PATH) {
		return {
			status: "git-failed",
			exitCode: 2,
			detail: `failed to set core.hooksPath=${HOOKS_PATH} in ${root} (read-back: ${readBack ?? "(unset)"}).`,
		};
	}
	return { status: "installed", exitCode: 0, detail: `core.hooksPath=${HOOKS_PATH} set in ${root}; linked worktrees of this repo inherit it (shared common config).` };
}

/***
 * MARK: main
 * @description CLI wrapper around installGitHooks: `--root <dir>` targets
 *   another checkout (used by tests), `--help` prints usage. Prints the
 *   decision's detail line and returns its exit code.
 * @example main(["node", "install-git-hooks.mjs", "--root", "/tmp/repo"]) => 0
 * @param {string[]} [argv] - Process argv; defaults to process.argv.
 * @returns {number} Exit code (0 installed/already-set/not-a-repo, 2 otherwise).
 ***/
export function main(argv = process.argv) {
	const args = argv.slice(2);
	if (args.includes("--help") || args.includes("-h")) {
		console.log("Usage: node scripts/install-git-hooks.mjs [--root <dir>]");
		console.log(`Activates this repo's committed git hooks (${HOOKS_PATH}: the pre-commit binary guard) for one checkout.`);
		console.log("Exit codes: exit 0 installed/already-set/not-a-repo, exit 2 git missing/foreign hooksPath/usage error.");
		return 0;
	}
	let root = REPO_ROOT;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--root") {
			const value = args[i + 1];
			if (!value || value.startsWith("-")) {
				console.error("error: --root requires a directory argument");
				return 2;
			}
			root = path.resolve(value);
			i++;
		} else if (arg.startsWith("--root=")) {
			const value = arg.slice("--root=".length);
			if (!value) {
				console.error("error: --root requires a directory argument");
				return 2;
			}
			root = path.resolve(value);
		} else {
			console.error(`error: unknown argument ${arg} (usage: [--root <dir>])`);
			return 2;
		}
	}
	const result = installGitHooks({ root });
	if (result.exitCode === 0) {
		console.log(`✓ git hooks (${result.status}): ${result.detail}`);
	} else {
		console.error(`✗ git hooks not installed (${result.status}): ${result.detail}`);
	}
	return result.exitCode;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
	process.exitCode = main();
}
