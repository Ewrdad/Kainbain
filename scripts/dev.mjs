#!/usr/bin/env node
/***
 * MARK: dev.mjs
 * @description Cross-platform dev entry point (`npm run dev`): clears the API
 *   port (`PORT`, default 3100) and the frontend port (`VITE_PORT`, default
 *   5173) without any OS-specific tooling, then runs the API (`node
 *   index.js` in `api/`) and the Vite frontend (`npm run dev` in
 *   `frontend/`) together in the foreground with prefixed, live-streamed
 *   output. The frontend port is passed as `vite --port <VITE_PORT>
 *   --strictPort` (Vite ignores the `PORT` env var, so the flag is what makes
 *   a non-default `VITE_PORT` bind where the plan says; `--strictPort` fails
 *   loudly instead of silently shifting to another port). Ctrl-C
 *   (SIGINT/SIGTERM) stops both servers; when either server
 *   exits or fails to start, the other is shut down and the run exits with
 *   that server's code. Dependencies are NOT installed here — run `npm run
 *   setup` once after cloning. `./deploy.sh --dev` delegates to this file.
 *   `--dry-run` prints the resolved ports and commands and exits without
 *   touching ports or spawning anything.
 * @example `npm run dev` => API on :3100, Vite on :5173, Ctrl-C stops both
 ***/

import path from "node:path";
import { fileURLToPath } from "node:url";
import { freePort } from "./free-port.mjs";
import { npmExecutable } from "./lib/run-parallel.mjs";
import { runSupervised } from "./lib/run-supervised.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/***
 * MARK: parsePort
 * @description Resolves one dev port from the environment, rejecting garbage
 *   with an error that names the variable.
 * @example parsePort(process.env.PORT, "PORT", 3100) => 3100
 * @param {string|undefined} raw
 * @param {string} varName
 * @param {number} fallback
 * @returns {number}
 ***/
function parsePort(raw, varName, fallback) {
	if (raw === undefined || raw === "") return fallback;
	const port = Number(raw);
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error(`Invalid ${varName}="${raw}": expected a TCP port from 1 to 65535.`);
	}
	return port;
}

/***
 * MARK: resolveDevPlan
 * @description Resolves the supervised children (API + Vite) from the
 *   environment: ports, binaries, working directories, and per-child env
 *   overrides. Pure — safe to unit test.
 * @example resolveDevPlan({}) => { apiPort: 3100, frontendPort: 5173, children: [...] }
 * @param {Object} [env] - defaults to process.env.
 * @returns {{ apiPort: number, frontendPort: number, children: Array<Object> }}
 ***/
export function resolveDevPlan(env = process.env) {
	const apiPort = parsePort(env.PORT, "PORT", 3100);
	const frontendPort = parsePort(env.VITE_PORT, "VITE_PORT", 5173);
	return {
		apiPort,
		frontendPort,
		children: [
			{
				name: "api",
				file: process.execPath,
				args: ["index.js"],
				cwd: path.join(REPO_ROOT, "api"),
				env: { PORT: String(apiPort) },
			},
			{
				name: "web",
				file: npmExecutable(),
				// Vite ignores the PORT env var — the --port flag is what binds it.
			// --strictPort fails loudly instead of silently shifting ports.
			args: ["run", "dev", "--", "--port", String(frontendPort), "--strictPort"],
				cwd: path.join(REPO_ROOT, "frontend"),
				env: { PORT: String(frontendPort) },
			},
		],
	};
}

/***
 * MARK: printDryRun
 * @description Prints the resolved plan without touching ports or spawning.
 * @example printDryRun({ apiPort: 3100, frontendPort: 5173, children: [...] })
 * @param {Object} plan - from resolveDevPlan().
 ***/
function printDryRun(plan) {
	console.log("dev plan (dry run — nothing started):");
	console.log(`  API port:      ${plan.apiPort} (PORT)`);
	console.log(`  Frontend port: ${plan.frontendPort} (VITE_PORT)`);
	for (const child of plan.children) {
		const env = Object.entries(child.env || {})
			.map(([key, value]) => `${key}=${value}`)
			.join(" ");
		console.log(`  ${child.name}: (cd ${child.cwd} && ${env} ${child.file} ${(child.args || []).join(" ")})`);
	}
}

/***
 * MARK: clearPort
 * @description Frees one dev port, reporting the outcome. Returns true when
 *   the port is usable, false (after printing the actionable error) when not.
 * @example await clearPort(3100, "API") => true
 * @param {number} port
 * @param {string} label
 * @returns {Promise<boolean>}
 ***/
async function clearPort(port, label) {
	const result = await freePort(port);
	if (result.ok) {
		console.log(
			result.alreadyFree
				? `Port ${port} (${label}): already free`
				: `Port ${port} (${label}): cleared (previous pid ${result.pids.join(", ")})`,
		);
		return true;
	}
	console.error(`Port ${port} (${label}): ${result.error}`);
	return false;
}

/***
 * MARK: main
 * @description Clears both dev ports, then supervises the API + Vite
 *   children until the first exit or Ctrl-C.
 ***/
async function main() {
	let plan;
	try {
		plan = resolveDevPlan();
	} catch (error) {
		console.error(`❌ ${error.message}`);
		process.exitCode = 1;
		return;
	}

	if (process.argv.includes("--dry-run")) {
		printDryRun(plan);
		return;
	}

	console.log("🛠️  Dev mode enabled. Spinning up development servers...");
	if (!(await clearPort(plan.apiPort, "API"))) {
		process.exitCode = 1;
		return;
	}
	if (!(await clearPort(plan.frontendPort, "frontend"))) {
		process.exitCode = 1;
		return;
	}

	console.log("--------------------------------------------------");
	console.log("✅ Dev servers are spinning up!");
	console.log(`API running on port: ${plan.apiPort}`);
	console.log(`Frontend running on port: ${plan.frontendPort}`);
	console.log("Press Ctrl-C to stop both servers.");
	console.log("--------------------------------------------------");

	const result = await runSupervised(plan.children);
	if (!result.ok) {
		console.error(`❌ Dev server '${result.ended}' exited (code ${result.exitCode}).`);
		console.error("   If dependencies are missing, run: npm run setup");
	}
	process.exitCode = result.exitCode;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
	await main();
}
