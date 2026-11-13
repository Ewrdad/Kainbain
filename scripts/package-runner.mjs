#!/usr/bin/env node
/***
 * MARK: package-runner
 * @description Builds one versioned runner archive for the GitHub Releases
 *   update channel (Option A, ADR 0012): copies the runner runtime tree
 *   (runner/, shared/, the harness modules under api/ it loads) into a
 *   versioned dir, installs the discovery-leg npm closure
 *   (`RUNNER_LEG_BUNDLED_DEPS`, pinned from api/package-lock.json) into
 *   the staged api/ tree, stamps runnerVersion into the packaged
 *   version.json, and tars it as
 *   kainbain-runner-<version>-<platform>-<arch>.tar.gz. The staged bundle
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

const parseArgs = (argv) => {
	const out = {};
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg.startsWith("--")) {
			const key = arg.slice(2);
			out[key] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv.splice(i + 1, 1)[0] : "true";
		}
	}
	return out;
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

const copyPruned = (src, dest) => {
	const stat = fs.statSync(src);
	if (stat.isDirectory()) {
		const base = path.basename(src);
		if (FORBIDDEN_BASENAMES.has(base)) return;
		fs.mkdirSync(dest, { recursive: true });
		for (const entry of fs.readdirSync(src)) {
			copyPruned(path.join(src, entry), path.join(dest, entry));
		}
		return;
	}
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
 *   only by tests staging fake roots (`installLegDeps: false`).
 * @example stageLegNpmDeps({ stage: '/tmp/stage/name', root: '/repo' })
 ***/
export const stageLegNpmDeps = ({ stage, root = REPO_ROOT } = {}) => {
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

export const packageRunner = ({ platform, arch, version, outDir, root = REPO_ROOT, installLegDeps = true } = {}) => {
	if (!["linux", "darwin"].includes(platform)) {
		throw new Error(`package-runner: unsupported platform '${platform}' (v1: linux, darwin).`);
	}
	if (!["x64", "arm64"].includes(arch)) {
		throw new Error(`package-runner: unsupported arch '${arch}' (v1: x64, arm64).`);
	}
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
	// throws ERR_MODULE_NOT_FOUND on every scan (N3). Fake roots used by
	// layout-only tests opt out (no lockfile there to pin from).
	if (installLegDeps) stageLegNpmDeps({ stage, root });
	// Release metadata + entrypoint live at the archive root.
	const versionJson = JSON.parse(fs.readFileSync(path.join(root, "runner", "version.json"), "utf8"));
	versionJson.runnerVersion = clean;
	fs.writeFileSync(path.join(stage, "version.json"), `${JSON.stringify(versionJson, null, 2)}\n`);
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
	return { name, tarball, version: clean, platform, arch };
};

const main = () => {
	const args = parseArgs(process.argv.slice(2));
	const outDir = path.resolve(args.out || path.join(REPO_ROOT, "dist"));
	fs.mkdirSync(outDir, { recursive: true });
	const result = packageRunner({
		platform: args.platform,
		arch: args.arch,
		version: args.version,
		outDir,
	});
	console.log(`packaged ${result.tarball}`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main();
}
