#!/usr/bin/env node
/***
 * MARK: depcheck.mjs
 * @description Cross-platform dependency check: runs the root, api, and
 *   frontend `depcheck` invocations concurrently (as the old shell one-liner
 *   did with background jobs) and exits non-zero when any of them fails.
 *   Output is condensed — full details only for failures.
 * @example `npm run depcheck` => three PASS lines, exit 0
 ***/

import path from "node:path";
import { fileURLToPath } from "node:url";
import { npmExecutable, runParallel } from "./lib/run-parallel.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NPM = npmExecutable();

/***
 * MARK: buildBranches
 * @description The three depcheck invocations (root + both workspaces).
 * @example buildBranches("npm") => [{ name: "depcheck (api)", ... }, ...]
 * @param {string} [npmExec] - npm binary, defaults to the platform one.
 * @returns {Array<Object>}
 ***/
export function buildBranches(npmExec = NPM) {
	return [
		{ name: "depcheck (api)", file: npmExec, args: ["run", "depcheck:api"] },
		{ name: "depcheck (frontend)", file: npmExec, args: ["run", "depcheck:frontend"] },
		{ name: "depcheck (root)", file: npmExec, args: ["run", "depcheck:root"] },
	];
}

/***
 * MARK: main
 * @description Runs the three checks in one overlap window.
 ***/
async function main() {
	const { ok } = await runParallel(buildBranches(), { cwd: REPO_ROOT });
	process.exitCode = ok ? 0 : 1;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
	await main();
}
