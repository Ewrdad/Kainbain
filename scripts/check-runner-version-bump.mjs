#!/usr/bin/env node
/***
 * MARK: check-runner-version-bump
 * @description Release gate for the runner update channel (WP-A): fails
 *   the release when runner code changed since the previous runner-v*
 *   release but `runnerVersion` did not increase. Without this gate a
 *   release can ship new runner code under an old version and the
 *   self-updater — which compares versions, not bytes — never offers it
 *   (every runner reports 0.1.0 forever). Strict per survey q5: runner
 *   code without a bump fails, loudly naming the fix.
 *
 *   Runner code means `runner/**` or `api/agent/harnesses/**`, except
 *   paths that never change runtime behavior: `runner/version.json`
 *   itself (the bump), test/spec files, and markdown docs (docs still
 *   ship in the archive — they just cannot change what the Runner
 *   does). A version.json-only release passes trivially.
 * @example node scripts/check-runner-version-bump.mjs --head-version 1.2.3
 * @example node scripts/check-runner-version-bump.mjs --base runner-v1.2.2 --head-version 1.2.3
 * @example node scripts/check-runner-version-bump.mjs --files changed.txt --base-version 1.2.2 --head-version 1.2.3
 ***/

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");

/***
 * MARK: isRunnerCodePath
 * @description Whether a repo-relative changed path counts as runner
 *   code for the bump gate: `runner/**` or `api/agent/harnesses/**`,
 *   minus paths that never change runtime behavior (the version file
 *   itself, test/spec files, markdown docs). The exclusions match
 *   case-insensitively — a `README.MD` or `daemon.TEST.js` must not
 *   fail a release.
 * @example isRunnerCodePath('runner/daemon.js') => true
 * @param {string} p - Repo-relative changed path.
 * @returns {boolean} True when the path triggers the bump requirement.
 ***/
export function isRunnerCodePath(p) {
	const file = String(p || "").replace(/\\/g, "/").replace(/^\.\//, "");
	if (!file) return false;
	const lowered = file.toLowerCase();
	if (lowered === "runner/version.json") return false;
	if (lowered.endsWith(".md") || lowered.endsWith(".markdown") || lowered.endsWith(".mdx")) return false;
	if (/\.test\.[^.]+$/.test(lowered) || /\.spec\.[^.]+$/.test(lowered)) return false;
	if (file.startsWith("runner/")) return true;
	if (file.startsWith("api/agent/harnesses/")) return true;
	return false;
}

/***
 * MARK: parseGateSemver
 * @description Parses a strict `major.minor.patch` version with an
 *   optional pre-release suffix (tolerates a `v` prefix). Null when
 *   unparseable.
 * @example parseGateSemver('v1.2.3-rc.1') => { major: 1, minor: 2, patch: 3, prerelease: ['rc', '1'] }
 * @param {string} input - Version text.
 * @returns {Object|null} Parsed version, or null.
 ***/
export function parseGateSemver(input) {
	if (typeof input !== "string") return null;
	const m = input.trim().replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
	if (!m) return null;
	return {
		major: Number(m[1]),
		minor: Number(m[2]),
		patch: Number(m[3]),
		prerelease: m[4] ? m[4].split(".") : [],
	};
}

const comparePrereleaseIds = (a, b) => {
	const len = Math.max(a.length, b.length);
	for (let i = 0; i < len; i += 1) {
		const x = a[i];
		const y = b[i];
		if (x === undefined) return y === undefined ? 0 : -1;
		if (y === undefined) return 1;
		const xn = /^\d+$/.test(x);
		const yn = /^\d+$/.test(y);
		if (xn !== yn) return xn ? -1 : 1;
		if (xn) {
			const nx = Number(x);
			const ny = Number(y);
			if (nx !== ny) return nx < ny ? -1 : 1;
		} else if (x !== y) {
			return x < y ? -1 : 1;
		}
	}
	return 0;
};

/***
 * MARK: semverGreater
 * @description Whether version `a` is strictly greater than version `b`
 *   under semver precedence (a release beats its own pre-releases, so
 *   `1.2.4-rc.1` counts as an increase over `1.2.3`). False when either
 *   side is unparseable.
 * @example semverGreater('1.2.4-rc.1', '1.2.3') => true
 * @param {string} a - Candidate version.
 * @param {string} b - Base version.
 * @returns {boolean} True when `a` is strictly greater than `b`.
 ***/
export function semverGreater(a, b) {
	const va = parseGateSemver(a);
	const vb = parseGateSemver(b);
	if (!va || !vb) return false;
	if (va.major !== vb.major) return va.major > vb.major;
	if (va.minor !== vb.minor) return va.minor > vb.minor;
	if (va.patch !== vb.patch) return va.patch > vb.patch;
	if (va.prerelease.length === 0 && vb.prerelease.length > 0) return true;
	if (vb.prerelease.length === 0 && va.prerelease.length > 0) return false;
	return comparePrereleaseIds(va.prerelease, vb.prerelease) > 0;
}

/***
 * MARK: checkRunnerVersionBump
 * @description Pure bump check over a changed-path list plus the base
 *   and head runner versions. Passes when no runner code changed, or
 *   when the head version is strictly greater than the base. Fails when
 *   runner code changed without an increase. Warn-passes when the base
 *   version is unreadable (first release) — warn, don't fail, so a new
 *   channel bootstraps.
 * @example checkRunnerVersionBump({ changedFiles: ['runner/daemon.js'], baseVersion: '1.2.2', headVersion: '1.2.3' }) => { ok: true, ... }
 * @param {Object} opts - Options.
 * @param {string[]} opts.changedFiles - Repo-relative changed paths.
 * @param {string|null} opts.baseVersion - runnerVersion at the base ref.
 * @param {string|null} opts.headVersion - runnerVersion being released.
 * @returns {{ok: boolean, warned: boolean, reason: string, triggers: string[]}} Verdict.
 ***/
export function checkRunnerVersionBump({ changedFiles = [], baseVersion, headVersion } = {}) {
	const triggers = [...new Set(
		(Array.isArray(changedFiles) ? changedFiles : [])
			.map((f) => String(f || "").trim())
			.filter(Boolean)
			.filter(isRunnerCodePath),
	)];
	if (triggers.length === 0) {
		return { ok: true, warned: false, reason: "no runner code changed since the base", triggers };
	}
	if (!parseGateSemver(headVersion)) {
		return {
			ok: false,
			warned: false,
			reason: `release version ${JSON.stringify(headVersion)} is not semver (want X.Y.Z from the runner-v* tag)`,
			triggers,
		};
	}
	if (!parseGateSemver(baseVersion)) {
		return {
			ok: true,
			warned: true,
			reason: `base runnerVersion ${JSON.stringify(baseVersion ?? null)} is unreadable (first release?) — allowing the release; bump runnerVersion on the next runner-code change`,
			triggers,
		};
	}
	if (semverGreater(headVersion, baseVersion)) {
		return { ok: true, warned: false, reason: `runnerVersion increased ${baseVersion} -> ${headVersion}`, triggers };
	}
	return {
		ok: false,
		warned: false,
		reason: `runner code changed (${triggers.slice(0, 5).join(", ")}${triggers.length > 5 ? ` +${triggers.length - 5} more` : ""}) but runnerVersion did not increase (${baseVersion} -> ${headVersion}); bump runnerVersion in runner/version.json (or retag higher) so runners can be offered this release`,
		triggers,
	};
}

const git = (args, cwd) =>
	execFileSync("git", args, { cwd, encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "ignore"] });

/***
 * MARK: defaultBaseRef
 * @description Newest `runner-v*` tag that does not point at the head
 *   commit (the previous runner release). Null when there is none (first
 *   release) or git is unavailable — both warn-pass, never fail.
 * @example defaultBaseRef({ head: 'HEAD' }) => 'runner-v1.2.2'
 * @param {Object} [opts] - Options.
 * @param {string} [opts.head] - Head ref (defaults to HEAD).
 * @param {string} [opts.root] - Repo root (defaults to the checkout).
 * @returns {string|null} Base tag, or null.
 ***/
export function defaultBaseRef({ head = "HEAD", root = REPO_ROOT } = {}) {
	try {
		const headSha = git(["rev-list", "-n", "1", head], root).trim();
		const tags = git(["tag", "--list", "runner-v*", "--sort=-creatordate"], root)
			.split("\n")
			.map((t) => t.trim())
			.filter(Boolean)
			.slice(0, 50);
		for (const tag of tags) {
			try {
				if (git(["rev-list", "-n", "1", tag], root).trim() !== headSha) return tag;
			} catch {
				// One unresolvable tag never blocks the gate.
			}
		}
		return null;
	} catch {
		return null;
	}
}

/***
 * MARK: readRunnerVersionAtRef
 * @description runnerVersion from `runner/version.json` at a git ref.
 *   Null when unreadable.
 * @example readRunnerVersionAtRef('runner-v1.2.2') => '1.2.2'
 * @param {string} ref - Git ref.
 * @param {string} [root] - Repo root (defaults to the checkout).
 * @returns {string|null} runnerVersion, or null.
 ***/
export function readRunnerVersionAtRef(ref, root = REPO_ROOT) {
	try {
		const raw = git(["show", `${ref}:runner/version.json`], root);
		const parsed = JSON.parse(raw);
		return typeof parsed?.runnerVersion === "string" && parsed.runnerVersion ? parsed.runnerVersion : null;
	} catch {
		return null;
	}
}

const readWorktreeRunnerVersion = (root) => {
	try {
		const parsed = JSON.parse(fs.readFileSync(path.join(root, "runner", "version.json"), "utf8"));
		return typeof parsed?.runnerVersion === "string" && parsed.runnerVersion ? parsed.runnerVersion : null;
	} catch {
		return null;
	}
};

const changedFilesSince = (base, head, root) =>
	git(["diff", "--name-only", `${base}...${head}`], root).split("\n").map((s) => s.trim()).filter(Boolean);

function parseArgs(argv) {
	const args = { base: null, head: "HEAD", files: null, baseVersion: null, headVersion: null, root: REPO_ROOT };
	for (let i = 0; i < argv.length; i += 1) {
		if (argv[i] === "--base") args.base = argv[++i];
		else if (argv[i] === "--head") args.head = argv[++i];
		else if (argv[i] === "--files") args.files = argv[++i];
		else if (argv[i] === "--base-version") args.baseVersion = argv[++i];
		else if (argv[i] === "--head-version") args.headVersion = argv[++i];
		else if (argv[i] === "--root") args.root = path.resolve(argv[++i]);
		else throw new Error(`unknown argument: ${argv[i]}`);
	}
	return args;
}

const isMain =
	process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
	try {
		const args = parseArgs(process.argv.slice(2));
		let changedFiles;
		if (args.files) {
			changedFiles = fs.readFileSync(path.resolve(args.files), "utf8").split("\n");
		} else {
			const base = args.base || defaultBaseRef({ head: args.head, root: args.root });
			if (!base) {
				console.error("check-runner-version-bump: warning: no previous runner-v* tag found (first release?) — allowing the release.");
				process.exit(0);
			}
			args.base = base;
			try {
				changedFiles = changedFilesSince(base, args.head, args.root);
			} catch (err) {
				console.error(`check-runner-version-bump: warning: cannot diff ${base}...${args.head} (${err.message}) — allowing the release.`);
				process.exit(0);
			}
		}
		// Non---files mode always resolved a base tag above (or exited);
		// --files mode without an explicit base has no base to compare
		// against, so the check warn-passes instead of comparing the head
		// against itself.
		let baseVersion = args.baseVersion;
		if (baseVersion == null) {
			if (args.base) baseVersion = readRunnerVersionAtRef(args.base, args.root);
			else if (!args.files) baseVersion = readWorktreeRunnerVersion(args.root);
		}
		const headVersion = args.headVersion ?? readWorktreeRunnerVersion(args.root);
		const verdict = checkRunnerVersionBump({ changedFiles, baseVersion, headVersion });
		if (verdict.ok) {
			console.log(`check-runner-version-bump: OK — ${verdict.reason}.`);
			if (verdict.warned) console.error(`check-runner-version-bump: warning: ${verdict.reason}.`);
			process.exit(0);
		}
		console.error(`check-runner-version-bump: ${verdict.reason}.`);
		process.exit(1);
	} catch (err) {
		console.error(`check-runner-version-bump: error: ${err.message}`);
		process.exit(1);
	}
}
