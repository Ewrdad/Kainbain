#!/usr/bin/env node
/***
 * MARK: setup.mjs
 * @description Single-command contributor setup (`npm run setup`): installs
 *   the root, `api`, `frontend`, and `canary-e2e` dependency trees in order,
 *   then installs the Playwright Chromium browsers used by the root
 *   `@playwright/test` (screenshot tooling) AND by `canary-e2e`. Fails fast
 *   naming the step that failed. The browser install selects flags per OS:
 *   Linux additionally installs the browser's system dependencies
 *   (`--with-deps`, needs apt and usually root) and falls back to a plain
 *   browser install with a warning when that fails; macOS/Windows install
 *   the browser only. Two browser installs are needed because `canary-e2e`
 *   pins its own `@playwright/test` and Playwright keys each browser build
 *   to its version — and `npm test` runs the canary suite by default, so a
 *   fresh clone must have both.
 * @example `npm run setup` => four installs + two Chromium installs, exit 0
 ***/

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { npmExecutable } from "./lib/run-parallel.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NPM = npmExecutable();

/***
 * MARK: npxExecutable
 * @description The npx binary name for direct spawn: `npx.cmd` on Windows
 *   (where `npx` alone is not executable without a shell), `npx` elsewhere.
 * @example npxExecutable("win32") => "npx.cmd"
 * @param {string} [targetPlatform] - defaults to process.platform.
 * @returns {string}
 ***/
export function npxExecutable(targetPlatform = process.platform) {
	return targetPlatform === "win32" ? "npx.cmd" : "npx";
}

/***
 * MARK: installSteps
 * @description The dependency-install steps in run order (root first so the
 *   workspace tooling exists before the workspace installs run).
 * @example installSteps() => [{ name: "root dependencies", dir: "/repo" }, ...]
 * @returns {Array<{ name: string, dir: string }>}
 ***/
export function installSteps() {
	return [
		{ name: "root dependencies", dir: REPO_ROOT },
		{ name: "api dependencies", dir: path.join(REPO_ROOT, "api") },
		{ name: "frontend dependencies", dir: path.join(REPO_ROOT, "frontend") },
		{ name: "canary-e2e dependencies", dir: path.join(REPO_ROOT, "canary-e2e") },
	];
}

/***
 * MARK: playwrightAttempts
 * @description The Playwright install command line(s) to try in order: on
 *   Linux first with system dependencies, then (on failure) the browser
 *   alone; elsewhere the browser alone.
 * @example playwrightAttempts("linux") => [["playwright", "install", "--with-deps", "chromium"], [...]]
 * @param {string} [targetPlatform] - defaults to process.platform.
 * @returns {Array<Array<string>>}
 ***/
export function playwrightAttempts(targetPlatform = process.platform) {
	const browserOnly = ["playwright", "install", "chromium"];
	if (targetPlatform === "linux") {
		return [["playwright", "install", "--with-deps", "chromium"], browserOnly];
	}
	return [browserOnly];
}

/***
 * MARK: browserInstallTargets
 * @description The Playwright browser installs in run order. Two targets are
 *   needed because `root` and `canary-e2e` pin different `@playwright/test`
 *   versions (^1.62.1 resolving to 1.64 vs 1.63 here) and Playwright keys
 *   each browser build to its own version — one `playwright install` cannot
 *   cover both. Since `npm test` now runs the canary suite by default (see
 *   scripts/run-tests.mjs), a fresh clone must install BOTH browsers or the
 *   gate fails before any spec runs. Each target runs its own resolved
 *   `playwright` binary from `dir`.
 * @example browserInstallTargets("linux")[1].name => "canary-e2e Playwright Chromium"
 * @param {string} [targetPlatform] - defaults to process.platform.
 * @returns {Array<{ name: string, dir: string, attempts: Array<Array<string>> }>}
 ***/
export function browserInstallTargets(targetPlatform = process.platform) {
	return [
		{
			name: "Playwright Chromium",
			dir: REPO_ROOT,
			attempts: playwrightAttempts(targetPlatform),
		},
		{
			// Linux system packages are shared, so the root target's
			// `--with-deps` attempt already covers them; canary only needs the
			// browser build its pinned Playwright resolves to.
			name: "canary-e2e Playwright Chromium",
			dir: path.join(REPO_ROOT, "canary-e2e"),
			attempts: [["playwright", "install", "chromium"]],
		},
	];
}

/***
 * MARK: runInherited
 * @description Runs one command with inherited stdio (the user watches the
 *   install live) and resolves its exit code. A spawn failure resolves as 1
 *   after printing the cause — never a throw.
 * @example await runInherited("npm", ["install"], { cwd: "/repo" }) => 0
 * @param {string} file
 * @param {Array<string>} args
 * @param {Object} [opts]
 * @param {string} [opts.cwd]
 * @param {Function} [opts.spawnFn] - spawn seam, for tests.
 * @returns {Promise<number>}
 ***/
export function runInherited(file, args, { cwd = REPO_ROOT, spawnFn = spawn } = {}) {
	return new Promise((resolve) => {
		let child;
		try {
			child = spawnFn(file, args, { cwd, stdio: "inherit", windowsHide: true });
		} catch (error) {
			console.error(`Failed to start '${file}': ${error.message}`);
			resolve(1);
			return;
		}
		child.on("error", (error) => {
			console.error(`Failed to start '${file}': ${error.message}`);
			resolve(1);
		});
		child.on("close", (exitCode) => {
			resolve(exitCode ?? 1);
		});
	});
}

/***
 * MARK: main
 * @description Runs every install step, then the Playwright browser install.
 *   Fails fast naming the failing step.
 ***/
async function main() {
	for (const step of installSteps()) {
		console.log(`→ Installing ${step.name}...`);
		const exitCode = await runInherited(NPM, ["install"], { cwd: step.dir });
		if (exitCode !== 0) {
			console.error(`❌ Setup failed at step '${step.name}' (exit ${exitCode}).`);
			process.exitCode = exitCode;
			return;
		}
	}

	for (const target of browserInstallTargets()) {
		for (const [index, args] of target.attempts.entries()) {
			const withDeps = args.includes("--with-deps");
			console.log(
				withDeps
					? `→ Installing ${target.name} + system dependencies...`
					: `→ Installing ${target.name}...`,
			);
			const exitCode = await runInherited(npxExecutable(), args, { cwd: target.dir });
			if (exitCode === 0) break;
			if (index < target.attempts.length - 1) {
				console.warn(
					"⚠️  System-dependency install failed (it needs apt and usually root) — " +
						"falling back to the browser alone. Install the OS packages manually if Chromium fails to launch.",
				);
				continue;
			}
			console.error(`❌ Setup failed at step '${target.name}' (exit ${exitCode}).`);
			process.exitCode = exitCode;
			return;
		}
	}

	console.log("--------------------------------------------------");
	console.log("✅ Setup complete! Next steps:");
	console.log("   npm test      # full verification gate");
	console.log("   npm run dev   # start API + frontend dev servers");
	console.log("--------------------------------------------------");
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
	await main();
}
