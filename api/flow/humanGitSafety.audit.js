/* eslint-disable security/detect-non-literal-fs-filename */
/***
 * MARK: humanGitSafety.audit
 * @description Test-only git-argv audit for the human-review git-safety
 *   contract. Installs a `git` wrapper earlier on PATH that appends every
 *   spawned git invocation (space-joined argv) to a log file and then execs
 *   the real git, so integration tests observe the true process-boundary argv
 *   while production code keeps running real git. No production module imports
 *   this file.
 *
 *   Test-harness git calls must use the exported absolute-path `realGit()`
 *   helper so they bypass the wrapper and never pollute the audit log.
 * @example import { realGit, installGitAuditWrapper } from './humanGitSafety.audit.js';
 ***/
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { findOnPath, isWindows } from "../utils/platform.js";

let _realGit = null;

/***
 * MARK: realGitPath
 * @description Absolute path of the real git binary (resolved before any PATH
 *   shadowing). Throws when git cannot be resolved — the audit cannot run.
 *   Resolution is a pure PATH search (no shell involved) so it works on
 *   Windows (`where` semantics via PATHEXT) as well as POSIX.
 * @param {string} [platform] - Platform override for tests (default process.platform).
 ***/
export function realGitPath(platform = process.platform) {
	if (_realGit) return _realGit;
	if (!isWindows(platform)) {
		for (const candidate of ["/usr/bin/git", "/usr/local/bin/git"]) {
			try {
				if (fs.existsSync(candidate)) {
					_realGit = candidate;
					return _realGit;
				}
			} catch {
				// probe next candidate
			}
		}
	}
	const found = findOnPath("git", platform);
	if (found) {
		_realGit = found;
		return _realGit;
	}
	throw new Error("humanGitSafety.audit: cannot resolve an absolute git path");
}

/***
 * MARK: realGit
 * @description Runs git via its absolute path, bypassing an installed audit
 *   wrapper. For test-harness snapshots only — never for the code under test.
 ***/
export function realGit(cwd, ...args) {
	return execFileSync(realGitPath(), args, {
		cwd,
		stdio: ["ignore", "pipe", "pipe"],
	}).toString();
}

/***
 * MARK: installGitArgvAudit
 * @description Installs the argv-logging `git` wrapper on this process's PATH
 *   and returns the audit handle. One install per test file (vitest isolates
 *   files in separate workers); pair with `uninstall()` in afterAll.
 *   POSIX-only: the wrapper is a `#!/bin/sh` script, so install throws a
 *   clear error on Windows instead of installing a broken wrapper.
 * @param {Object} [opts]
 * @param {string} [opts.platform] - Platform override for tests (default process.platform).
 ***/
export function installGitArgvAudit({ platform = process.platform } = {}) {
	if (isWindows(platform)) {
		throw new Error(
			"humanGitSafety.audit: git argv audit is not supported on Windows (POSIX shell wrapper)",
		);
	}
	const real = realGitPath(platform);
	const previousPath = process.env.PATH || "";
	const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-git-audit-"));
	const logFile = path.join(binDir, "argv.log");
	fs.writeFileSync(logFile, "");
	// "$*" joins argv with spaces: classification only needs the subcommand
	// plus flag detection, and git branch names cannot contain whitespace.
	fs.writeFileSync(
		path.join(binDir, "git"),
		`#!/bin/sh\nprintf '%s\\n' "$*" >> "${logFile}"\nexec "${real}" "$@"\n`,
		{ mode: 0o755 },
	);
	process.env.PATH = `${binDir}${path.delimiter}${previousPath}`;
	let uninstalled = false;
	return {
		binDir,
		logFile,
		argvLines() {
			return fs
				.readFileSync(logFile, "utf8")
				.split("\n")
				.map((line) => line.trim())
				.filter(Boolean);
		},
		clear() {
			fs.writeFileSync(logFile, "");
		},
		/***
		 * MARK: settle
		 * @description Waits until no new git invocations land for `quietMs`
		 *   (drains deferred jobs such as the timeline diffstat backfill).
		 ***/
		async settle({ quietMs = 250, timeoutMs = 15000 } = {}) {
			const started = Date.now();
			let lastSize = -1;
			let lastChange = Date.now();
			for (;;) {
				let size = 0;
				try {
					size = fs.statSync(logFile).size;
				} catch {
					size = 0;
				}
				const now = Date.now();
				if (size !== lastSize) {
					lastSize = size;
					lastChange = now;
				} else if (now - lastChange >= quietMs) {
					return;
				}
				if (now - started > timeoutMs) {
					throw new Error(
						`humanGitSafety.audit: git activity did not settle within ${timeoutMs}ms`,
					);
				}
				await new Promise((resolve) => setTimeout(resolve, 50));
			}
		},
		uninstall() {
			if (uninstalled) return;
			uninstalled = true;
			process.env.PATH = previousPath;
			try {
				fs.rmSync(binDir, { recursive: true, force: true });
			} catch {
				// ignore teardown errors
			}
		},
	};
}

const READ_SUBCOMMANDS = new Set([
	"status",
	"rev-parse",
	"symbolic-ref",
	"diff",
	"log",
	"show-ref",
	"rev-list",
	"merge-base",
	"ls-files",
	"for-each-ref",
]);

const MUTATING_SUBCOMMANDS = new Set([
	"checkout",
	"switch",
	"restore",
	"add",
	"rm",
	"mv",
	"commit",
	"push",
	"fetch",
	"pull",
	"merge",
	"rebase",
	"cherry-pick",
	"revert",
	"reset",
	"stash",
	"clean",
	"tag",
	"update-ref",
	"worktree",
	"am",
	"apply",
	"config",
	"gc",
	"prune",
]);

/***
 * MARK: classifyGitArgv
 * @description Classifies one space-joined git argv line as `read`,
 *   `ref-create` (`git branch <name> [<start-point>]` with no flags),
 *   `tree-mutating`, or `unexpected` (fail closed: unknown subcommands are
 *   violations so new git usage gets an explicit allow-list decision).
 ***/
export function classifyGitArgv(line) {
	const tokens = String(line || "")
		.trim()
		.split(/\s+/)
		.filter(Boolean);
	const subcommand = tokens[0] || "";
	if (subcommand === "branch") {
		const rest = tokens.slice(1);
		const flagged = rest.some((token) => token.startsWith("-"));
		if (!flagged && (rest.length === 1 || rest.length === 2)) {
			return { kind: "ref-create", subcommand, argv: line };
		}
		return { kind: "tree-mutating", subcommand, argv: line };
	}
	if (subcommand === "reflog" && tokens.includes("expire")) {
		return { kind: "tree-mutating", subcommand, argv: line };
	}
	if (subcommand === "remote") {
		// Bare `remote` (and `-v`) only lists configured remotes; every
		// other verb mutates config/refs or performs network I/O, none of
		// which belongs on a human review path.
		const rest = tokens.slice(1);
		const readOnly =
			rest.length === 0 ||
			(rest.length === 1 && (rest[0] === "-v" || rest[0] === "--verbose"));
		return {
			kind: readOnly ? "read" : "tree-mutating",
			subcommand,
			argv: line,
		};
	}
	if (MUTATING_SUBCOMMANDS.has(subcommand)) {
		return { kind: "tree-mutating", subcommand, argv: line };
	}
	if (READ_SUBCOMMANDS.has(subcommand) || subcommand === "reflog") {
		return { kind: "read", subcommand, argv: line };
	}
	return { kind: "unexpected", subcommand, argv: line };
}

/***
 * MARK: auditGitArgv
 * @description Splits recorded argv lines into reads, ref-creations, and
 *   violations (tree-mutating plus unexpected). Human review operations must
 *   produce zero violations.
 ***/
export function auditGitArgv(lines) {
	const reads = [];
	const refCreates = [];
	const violations = [];
	for (const line of lines || []) {
		const classified = classifyGitArgv(line);
		if (classified.kind === "read") reads.push(classified);
		else if (classified.kind === "ref-create") refCreates.push(classified);
		else violations.push(classified);
	}
	return { reads, refCreates, violations };
}
