#!/usr/bin/env node
/***
 * MARK: package-runner
 * @description Builds one versioned runner archive for the GitHub Releases
 *   update channel (Option A, ADR 0012): copies the runner runtime tree
 *   (runner/, shared/, the harness modules under api/ it loads) into a
 *   versioned dir, installs the discovery-leg npm closure
 *   (`RUNNER_LEG_BUNDLED_DEPS`, pinned from api/package-lock.json) into
 *   the staged api/ tree, stamps runnerVersion + the build identity
 *   (`build { sha, builtAt, dirty }`, from git HEAD at release time) into
 *   BOTH packaged version.json copies — the archive-root one the updater
 *   checks and the runner/ one the booted daemon actually reads — and
 *   tars it as kainbain-runner-<version>-<platform>-<arch>.tar.gz. The staged bundle
 *   ships its whole leg closure (the pi SDK used to be a manual
 *   `npm install --prefix api` step hosts routinely skipped, so pi legs
 *   failed with ERR_MODULE_NOT_FOUND while the runner advertised 0
 *   models); tests, secrets, and VCS metadata are never packaged (CI
 *   fails the build if they leak), and only the leg-closure node_modules
 *   under api/ ships.
 * @example node scripts/package-runner.mjs --platform linux --arch x64 --version 1.2.3 --out dist/
 ***/
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");

/***
 * MARK: parsePackagerArgs
 * @description Parses `--key value` and `--key=value` command-line args into
 *   `{ key: value }`. Pure (never mutates the input list), skips positionals
 *   and a bare `--`, and treats a flag with no following value as `"true"`
 *   (the caller validates required keys, so a missing value fails with the
 *   usage error, never with a mystery `"true"` path). Unknown keys are kept
 *   so callers can warn on typos instead of silently ignoring them.
 * @example parsePackagerArgs({ args: ['--platform', 'linux', '--arch=x64'] }) => { platform: 'linux', arch: 'x64' }
 * @param {Object} [opts] - Options.
 * @param {string[]} [opts.args] - Raw argv slice (usually `process.argv.slice(2)`).
 * @returns {Object} Parsed key/value map (all values are strings).
 ***/
export const parsePackagerArgs = ({ args = [] } = {}) => {
	const parsedArgs = {};
	const inputList = Array.isArray(args) ? [...args] : [];
	let index = 0;
	while (index < inputList.length) {
		const currentArg = inputList[index];
		if (typeof currentArg !== "string" || !currentArg.startsWith("--") || currentArg === "--") {
			index += 1;
			continue;
		}
		const withoutDashes = currentArg.slice(2);
		const equalsAt = withoutDashes.indexOf("=");
		if (equalsAt !== -1) {
			const key = withoutDashes.slice(0, equalsAt).trim();
			const value = withoutDashes.slice(equalsAt + 1);
			if (key) parsedArgs[key] = value;
			index += 1;
			continue;
		}
		const key = withoutDashes.trim();
		const nextValue = inputList[index + 1];
		if (typeof nextValue === "string" && nextValue && !nextValue.startsWith("--")) {
			if (key) parsedArgs[key] = nextValue;
			index += 2;
			continue;
		}
		if (key) parsedArgs[key] = "true";
		index += 1;
	}
	return parsedArgs;
};

const FORBIDDEN_BASENAMES = new Set([".git", ".hg", "node_modules", ".env", ".env.local", "coverage", "dist"]);
const FORBIDDEN_SUFFIXES = [".test.js", ".test.jsx", ".spec.js"];

/***
 * MARK: RUNNER_LEG_BUNDLED_DEPS
 * @description Npm packages the discovery legs load that are NOT part of
 *   the copied source tree: the bare specifiers in
 *   `LEG_MODULE_SPECIFIERS` (runner/harnessModelDiscovery.js) minus the
 *   relative harness modules that `copyPruned` already ships. Today that
 *   is only the pi SDK the pi leg reaches through its harness. The
 *   bundle-import conformance test pins this list against that table, so
 *   a new bare leg import fails the build until it is bundled here.
 * @example RUNNER_LEG_BUNDLED_DEPS => ['@earendil-works/pi-coding-agent']
 ***/
export const RUNNER_LEG_BUNDLED_DEPS = ["@earendil-works/pi-coding-agent"];

/***
 * MARK: copyPruned
 * @description Copies one source path into the bundle stage, skipping test
 *   files and forbidden dirs (node_modules, .git, dist, coverage, .env).
 *   Symlink-safe: directory symlinks are never descended (they can cycle or
 *   escape the source tree), file symlinks resolve once to their target
 *   bytes, dangling links and non-files (fifo, socket, device) are skipped.
 *   A visited-dir set (by realpath) stops symlink cycles that re-enter an
 *   already-copied tree. Throws with the failing path when the source cannot
 *   be read, so a half-copied stage fails the build instead of shipping.
 * @example copyPruned('/repo/runner', '/tmp/stage/name/runner')
 * @param {string} src - Source path.
 * @param {string} dest - Destination path.
 * @param {Set<string>} [seenDirs] - Realpaths already copied (cycle guard).
 ***/
const copyPruned = (src, dest, seenDirs = new Set()) => {
	let entryStat;
	try {
		entryStat = fs.lstatSync(src);
	} catch (err) {
		throw new Error(`package-runner: cannot copy '${src}': ${err?.message || err}`);
	}
	if (entryStat.isSymbolicLink()) {
		let targetStat = null;
		try {
			targetStat = fs.statSync(src);
		} catch {
			return;
		}
		if (!targetStat.isFile()) return;
		const base = path.basename(src);
		if (FORBIDDEN_SUFFIXES.some((suffix) => base.endsWith(suffix))) return;
		fs.mkdirSync(path.dirname(dest), { recursive: true });
		fs.copyFileSync(src, dest);
		return;
	}
	if (entryStat.isDirectory()) {
		const base = path.basename(src);
		if (FORBIDDEN_BASENAMES.has(base)) return;
		let realDir = null;
		try {
			realDir = fs.realpathSync(src);
		} catch {
			realDir = null;
		}
		if (realDir) {
			if (seenDirs.has(realDir)) return;
			seenDirs.add(realDir);
		}
		fs.mkdirSync(dest, { recursive: true });
		for (const entry of fs.readdirSync(src)) {
			copyPruned(path.join(src, entry), path.join(dest, entry), seenDirs);
		}
		return;
	}
	if (!entryStat.isFile()) return;
	const base = path.basename(src);
	if (FORBIDDEN_SUFFIXES.some((suffix) => base.endsWith(suffix))) return;
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	fs.copyFileSync(src, dest);
};

const isShippedLegNodeModules = (full, stageDir) => {
	const rel = path.relative(stageDir, full).split(path.sep);
	return rel[0] === "api" && rel[1] === "node_modules";
};

const assertClean = (stageDir) => {
	const violations = [];
	const walk = (dir) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				// The installed leg closure under api/node_modules ships
				// by design (see stageLegNpmDeps); never scan inside it —
				// published packages carry their own test files.
				if (isShippedLegNodeModules(full, stageDir)) continue;
				if (FORBIDDEN_BASENAMES.has(entry.name)) violations.push(full);
				else walk(full);
			} else if (
				FORBIDDEN_SUFFIXES.some((suffix) => entry.name.endsWith(suffix)) ||
				entry.name === ".env" ||
				entry.name === ".env.local" ||
				entry.name.endsWith(".minisig") && full.includes("secret")
			) {
				violations.push(full);
			}
		}
	};
	walk(stageDir);
	if (violations.length > 0) {
		throw new Error(`package-runner: forbidden files in archive:\n${violations.join("\n")}`);
	}
};

/***
 * MARK: stageLegNpmDeps
 * @description Installs the discovery-leg npm closure
 *   (`RUNNER_LEG_BUNDLED_DEPS`) into the staged api/ tree, pinned to the
 *   exact versions in the source api/package-lock.json and honoring the
 *   source api/package.json overrides (security pins), `--omit=dev`.
 *   Needs `npm` on PATH and registry access (release CI has both). Skipped
 *   by tests staging fake roots (`installLegDeps: false`), and auto-skipped
 *   by `packageRunner` when the root has no api/package.json to pin from.
 * @example stageLegNpmDeps({ stage: '/tmp/stage/name', root: '/repo' })
 ***/
export const hasLegDepSource = ({ root = REPO_ROOT } = {}) =>
	fs.existsSync(path.join(root, "api", "package.json"));

export const stageLegNpmDeps = ({ stage, root = REPO_ROOT } = {}) => {
	if (!hasLegDepSource({ root })) {
		throw new Error(
			`package-runner: cannot stage the discovery-leg closure: no api/package.json under '${root}' (fake/layout roots must pass installLegDeps: false).`,
		);
	}
	try {
		execFileSync("npm", ["--version"], { encoding: "utf8", timeout: 15000, stdio: ["ignore", "pipe", "ignore"] });
	} catch {
		throw new Error(
			"package-runner: cannot stage the discovery-leg closure: 'npm' is not on PATH (install Node.js/npm, or pass installLegDeps: false for a layout-only bundle without the pi leg).",
		);
	}
	const apiPkg = JSON.parse(fs.readFileSync(path.join(root, "api", "package.json"), "utf8"));
	let lock = null;
	try {
		lock = JSON.parse(fs.readFileSync(path.join(root, "api", "package-lock.json"), "utf8"));
	} catch {
		lock = null;
	}
	const dependencies = {};
	for (const name of RUNNER_LEG_BUNDLED_DEPS) {
		const locked = lock?.packages?.[`node_modules/${name}`]?.version;
		dependencies[name] = typeof locked === "string" && locked ? locked : (apiPkg.dependencies?.[name] ?? "*");
	}
	const stageApi = path.join(stage, "api");
	fs.writeFileSync(
		path.join(stageApi, "package.json"),
		// Preserve the source tree's module format: api/ is ESM
		// (`"type": "module"`) and the staged harness files keep their .js
		// extensions, so the staged package.json must say the same.
		`${JSON.stringify({ name: "kainbain-runner-api-bundle", private: true, type: apiPkg.type ?? "module", dependencies, overrides: apiPkg.overrides ?? {} }, null, 2)}\n`,
	);
	try {
		execFileSync("npm", ["install", "--prefix", stageApi, "--omit=dev", "--no-audit", "--no-fund", "--loglevel=error"], {
			stdio: "pipe",
		});
	} catch (err) {
		throw new Error(`package-runner: npm install of the leg closure failed: ${err?.message || err}`);
	}
};

/***
 * MARK: resolveBuildStamp
 * @description Builds the release's build identity from git: `sha` is HEAD,
 *   `builtAt` is now (ISO), `dirty` is whether the packaged tree
 *   (runner/, shared/, api/) has uncommitted changes. Best-effort: when
 *   git is missing or the root is not a checkout every field is null and
 *   the caller warns — a release from a non-checkout still packages, but
 *   its runners report an unknown build.
 * @example resolveBuildStamp({ root: '/repo' }) => { sha: 'abc123', builtAt: '2026-11-01T00:00:00.000Z', dirty: false }
 * @param {Object} [opts] - Options.
 * @param {string} [opts.root] - Repo root (defaults to the checkout).
 * @param {Function} [opts.runGit] - `(args, cwd) => stdout` seam (tests).
 * @param {string} [opts.now] - ISO builtAt override (tests).
 * @returns {{sha: string|null, builtAt: string|null, dirty: boolean|null}} Build stamp.
 ***/
export const resolveBuildStamp = ({ root = REPO_ROOT, runGit, now } = {}) => {
	const run = typeof runGit === "function"
		? runGit
		: (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", timeout: 15000, stdio: ["ignore", "pipe", "ignore"] });
	try {
		const sha = String(run(["rev-parse", "HEAD"], root) ?? "").trim();
		if (!sha) return { sha: null, builtAt: null, dirty: null };
		const status = String(run(["status", "--porcelain", "--", "runner", "shared", "api"], root) ?? "");
		return {
			sha: sha.slice(0, 128),
			builtAt: typeof now === "string" && now ? now : new Date().toISOString(),
			dirty: status.trim() ? true : false,
		};
	} catch {
		return { sha: null, builtAt: null, dirty: null };
	}
};

/***
 * MARK: validatePackageSourceTree
 * @description Checks the source tree holds a releasable runner layout
 *   before anything is staged: `runner/`, `shared/`, `api/` dirs plus the
 *   boot entrypoint (`runner/main.js`), the wrapper (`runner/bin/kainbain-runner`),
 *   and a parseable `runner/version.json`. Fails fast with every missing
 *   path named, so a wrong `--root` or a partial checkout fails here with
 *   the fix attached instead of mid-copy with an ENOENT or, worse, as a
 *   bundle that boots to a missing entrypoint on a remote host.
 * @example validatePackageSourceTree({ root: '/repo' })
 * @param {Object} [opts] - Options.
 * @param {string} [opts.root] - Source tree root to check.
 ***/
export const validatePackageSourceTree = ({ root = REPO_ROOT } = {}) => {
	const missingPaths = [];
	for (const requiredDir of ["runner", "shared", "api"]) {
		try {
			if (!fs.statSync(path.join(root, requiredDir)).isDirectory()) missingPaths.push(`${requiredDir}/`);
		} catch {
			missingPaths.push(`${requiredDir}/`);
		}
	}
	for (const requiredFile of ["runner/main.js", path.join("runner", "bin", "kainbain-runner"), "runner/version.json"]) {
		try {
			if (!fs.statSync(path.join(root, requiredFile)).isFile()) missingPaths.push(requiredFile);
		} catch {
			missingPaths.push(requiredFile);
		}
	}
	if (missingPaths.length === 0) {
		try {
			JSON.parse(fs.readFileSync(path.join(root, "runner", "version.json"), "utf8"));
		} catch (err) {
			throw new Error(`package-runner: source tree under '${root}' has an unreadable runner/version.json (${err?.message || err}); fix or re-checkout before packaging.`);
		}
	}
	if (missingPaths.length > 0) {
		throw new Error(
			`package-runner: source tree under '${root}' is not a releasable runner tree (missing: ${missingPaths.join(", ")}). ` +
				"Point --root at the repo checkout (the dir holding runner/, shared/, api/), not at runner/ itself.",
		);
	}
};

/***
 * MARK: packageRunner
 * @description Builds one runner bundle: validates every input FIRST (the
 *   source tree via `validatePackageSourceTree`, platform/arch, semver
 *   version, and that `outDir` is usable), then stages a pruned copy of
 *   runner/ + shared/ + api/, installs the discovery-leg npm closure unless
 *   skipped, stamps `runnerVersion` and the git build identity into both
 *   version.json copies, writes INSTALL.txt, runs the forbidden-file gate
 *   (`assertClean` — test files, node_modules, .env, and secrets never
 *   ship; a hit fails the build instead of leaking), and tars the stage as
 *   `<outDir>/kainbain-runner-<version>-<platform>-<arch>.tar.gz`. All
 *   validation happens before anything is staged, so a bad invocation
 *   leaves no partial stage or tarball behind. Throws with a named cause on
 *   any failure; never swallows a copy error mid-stage.
 * @example packageRunner({ platform: 'linux', arch: 'x64', version: '1.2.3', outDir: 'dist' }) => { name, tarball, version, platform, arch, build }
 * @param {Object} opts - Labelled inputs.
 * @param {string} opts.platform - Target platform (`linux` or `darwin`).
 * @param {string} opts.arch - Target arch (`x64` or `arm64`).
 * @param {string} opts.version - Runner version to stamp (semver, optional leading `v`).
 * @param {string} opts.outDir - Directory the tarball (and stage) are written to; created when missing.
 * @param {string} [opts.root] - Source tree root (defaults to this repo).
 * @param {boolean} [opts.installLegDeps] - Install the leg npm closure (auto-skipped for layout-only roots without api/package.json).
 * @param {Object} [opts.build] - Precomputed build stamp override (tests); defaults to `resolveBuildStamp({ root })`.
 * @returns {{name: string, tarball: string, version: string, platform: string, arch: string, build: Object}} The built bundle descriptor.
 ***/
export const packageRunner = ({ platform, arch, version, outDir, root = REPO_ROOT, installLegDeps = true, build } = {}) => {
	if (!["linux", "darwin"].includes(platform)) {
		throw new Error(`package-runner: unsupported platform '${platform}' (v1: linux, darwin).`);
	}
	if (!["x64", "arm64"].includes(arch)) {
		throw new Error(`package-runner: unsupported arch '${arch}' (v1: x64, arm64).`);
	}
	validatePackageSourceTree({ root });
	if (typeof outDir !== "string" || !outDir.trim()) {
		throw new Error("package-runner: --out needs a directory (got an empty value).");
	}
	try {
		if (fs.existsSync(outDir) && !fs.statSync(outDir).isDirectory()) {
			throw new Error(`package-runner: --out '${outDir}' exists and is not a directory.`);
		}
	} catch (err) {
		if (err?.message?.startsWith("package-runner:")) throw err;
		throw new Error(`package-runner: cannot use --out '${outDir}': ${err?.message || err}`);
	}
	// Created only after every check above passed, so a rejected --out never
	// leaves a directory behind and a file-as-outDir gets the clear error.
	fs.mkdirSync(outDir, { recursive: true });
	const clean = String(version || "").trim().replace(/^v/, "");
	// Full semver incl. canary pre-releases (`1.2.3-rc.1`): the release
	// workflow keeps the tag's suffix so a canary manifest never claims to
	// be the final version it previews.
	if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(clean)) {
		throw new Error(`package-runner: version must be semver (got '${version}').`);
	}
	const name = `kainbain-runner-${clean}-${platform}-${arch}`;
	const stage = path.join(outDir, name);
	fs.rmSync(stage, { recursive: true, force: true });
	fs.mkdirSync(stage, { recursive: true });
	copyPruned(path.join(root, "runner"), path.join(stage, "runner"));
	copyPruned(path.join(root, "shared"), path.join(stage, "shared"));
	copyPruned(path.join(root, "api"), path.join(stage, "api"));
	// Ship the whole discovery-leg closure: without the pi SDK the pi leg
	// throws ERR_MODULE_NOT_FOUND on every scan (N3). Fake/layout roots
	// used by layout-only tests carry no api/package.json to pin from, so
	// the closure is skipped there even when the caller leaves the default
	// on — release builds always have the source tree, so they still ship it.
	if (installLegDeps && hasLegDepSource({ root })) stageLegNpmDeps({ stage, root });
	// Release metadata + entrypoint live at the archive root.
	const versionJson = JSON.parse(fs.readFileSync(path.join(root, "runner", "version.json"), "utf8"));
	versionJson.runnerVersion = clean;
	const stamp = build !== undefined ? build : resolveBuildStamp({ root });
	if (build === undefined && !stamp.sha) {
		console.error("package-runner: warning: no git checkout at the release root — packaging with an unknown build identity.");
	}
	versionJson.build = {
		sha: typeof stamp?.sha === "string" && stamp.sha ? stamp.sha : null,
		builtAt: typeof stamp?.builtAt === "string" && stamp.builtAt ? stamp.builtAt : null,
		dirty: typeof stamp?.dirty === "boolean" ? stamp.dirty : null,
	};
	fs.writeFileSync(path.join(stage, "version.json"), `${JSON.stringify(versionJson, null, 2)}\n`);
	fs.writeFileSync(path.join(stage, "runner", "version.json"), `${JSON.stringify(versionJson, null, 2)}\n`);
	fs.writeFileSync(
		path.join(stage, "INSTALL.txt"),
		[
			`kainbain-runner ${clean} (${platform}/${arch})`,
			"",
			"Install: extract under <install-root>/releases/<version>/unpacked",
			"or point the wrapper at it: KAINBAIN_RUNNER_INSTALL_ROOT=<root>",
			"runner/bin/kainbain-runner",
			"",
			"The pi discovery dependency (@earendil-works/pi-coding-agent,",
			"pinned from the release lockfile) ships inside the archive's",
			"api/node_modules — no separate npm install is needed. All",
			"harnesses and the mock harness otherwise need only the host",
			"Node runtime.",
			"",
		].join("\n"),
	);
	assertClean(stage);
	const tarball = path.join(outDir, `${name}.tar.gz`);
	fs.rmSync(tarball, { force: true });
	execFileSync("tar", ["-czf", tarball, "-C", outDir, name]);
	return { name, tarball, version: clean, platform, arch, build: versionJson.build };
};

const main = () => {
	const usage = "Usage: node scripts/package-runner.mjs --platform <linux|darwin> --arch <x64|arm64> --version <semver> [--out <dir>]";
	const args = parsePackagerArgs({ args: process.argv.slice(2) });
	if (args.help === "true" || args.h === "true") {
		console.log(usage);
		return;
	}
	try {
		// parsePackagerArgs keeps unknown keys so typos surface here instead of
		// being silently ignored (a '--platfrom' must never mean "default").
		// Warned before the required-key check so a typo is visible even when
		// another arg is the one that fails.
		const knownKeys = new Set(["platform", "arch", "version", "out", "help", "h"]);
		for (const unknownKey of Object.keys(args)) {
			if (!knownKeys.has(unknownKey)) console.error(`package-runner: warning: unknown arg '--${unknownKey}' ignored.`);
		}
		if (args.out === "true") {
			throw new Error("package-runner: --out needs a directory (got a bare --out flag with no value).");
		}
		for (const requiredKey of ["platform", "arch", "version"]) {
			if (typeof args[requiredKey] !== "string" || !args[requiredKey] || args[requiredKey] === "true") {
				throw new Error(`package-runner: missing --${requiredKey} (need --platform <linux|darwin> --arch <x64|arm64> --version <semver>).`);
			}
		}
		const outDir = path.resolve(typeof args.out === "string" ? args.out : path.join(REPO_ROOT, "dist"));
		const result = packageRunner({
			platform: args.platform,
			arch: args.arch,
			version: args.version,
			outDir,
		});
		console.log(`packaged ${result.tarball}`);
	} catch (err) {
		console.error(err?.message || err);
		console.error(usage);
		process.exitCode = 1;
	}
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main();
}
