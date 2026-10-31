#!/usr/bin/env node
/***
 * MARK: package-runner
 * @description Builds one versioned runner archive for the GitHub Releases
 *   update channel (Option A, ADR 0012): copies the dependency-free runner
 *   runtime tree (runner/, shared/, the harness modules under api/ it loads,
 *   api/package.json) into a versioned dir, stamps runnerVersion into the
 *   packaged version.json, and tars it as
 *   kainbain-runner-<version>-<platform>-<arch>.tar.gz. The runtime closure
 *   was verified npm-free except a lazy pi-SDK dynamic import (hosts that
 *   serve pi models install it separately); tests, node_modules, secrets,
 *   and VCS metadata are never packaged (CI fails the build if they leak).
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

const assertClean = (stageDir) => {
	const violations = [];
	const walk = (dir) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
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

export const packageRunner = ({ platform, arch, version, outDir, root = REPO_ROOT } = {}) => {
	if (!["linux", "darwin"].includes(platform)) {
		throw new Error(`package-runner: unsupported platform '${platform}' (v1: linux, darwin).`);
	}
	if (!["x64", "arm64"].includes(arch)) {
		throw new Error(`package-runner: unsupported arch '${arch}' (v1: x64, arm64).`);
	}
	const clean = String(version || "").trim().replace(/^v/, "");
	if (!/^\d+\.\d+\.\d+$/.test(clean)) {
		throw new Error(`package-runner: version must be semver (got '${version}').`);
	}
	const name = `kainbain-runner-${clean}-${platform}-${arch}`;
	const stage = path.join(outDir, name);
	fs.rmSync(stage, { recursive: true, force: true });
	fs.mkdirSync(stage, { recursive: true });
	copyPruned(path.join(root, "runner"), path.join(stage, "runner"));
	copyPruned(path.join(root, "shared"), path.join(stage, "shared"));
	copyPruned(path.join(root, "api"), path.join(stage, "api"));
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
			"Hosts serving pi models also need @earendil-works/pi-coding-agent",
			"resolvable from the archive's api/ dir (npm install --prefix api",
			"--omit=dev inside the unpacked tree). All other harnesses and",
			"the mock harness need only the host Node runtime.",
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
