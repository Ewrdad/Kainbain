#!/usr/bin/env node
/***
 * MARK: canary-preflight.mjs
 * @description Frees the canary suite's DEDICATED scratch ports (API :3399,
 *   vite :5299) before Playwright wires up its own `webServer` entries, so a
 *   scratch stack orphaned by an aborted/killed run can never block the
 *   `canary-e2e` deploy gate with Playwright's opaque
 *   "http://localhost:3399/status is already used" error again.
 *
 *   Safe by construction, never by trust:
 *   - Only the two scratch ports are ever probed. Live services use :3100 /
 *     :5173 (see canary-e2e/playwright.config.js), so this can never touch a
 *     running deployment.
 *   - An occupant is terminated ONLY when it verifies as a scratch-stack
 *     process (cwd under the repo's `canary-e2e`, or the scratch API/vite
 *     command shape). Any other occupant is left alone and reported loudly;
 *     the process exits 1 rather than killing something it does not own.
 *   - When the operator drives their own stack (`CANARY_BASE_URL` /
 *     `CANARY_API_URL` set) the scratch ports are not used at all, so this
 *     is a no-op.
 *
 * Usage:
 *   node scripts/canary-preflight.mjs           # free :3399 and :5299
 *   import { freeScratchPorts } from "./canary-preflight.mjs";
 * @example await freeScratchPorts() => { ok: true, skipped: false, results: [...] }
 ***/

import fs from "node:fs";
import { execFile as execFileCallback } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { freePort } from "./free-port.mjs";

export const SCRATCH_API_PORT = 3399;
export const SCRATCH_VITE_PORT = 5299;
export const SCRATCH_PORTS = [SCRATCH_API_PORT, SCRATCH_VITE_PORT];

/***
 * MARK: usesOperatorStack
 * @description Whether the canary suite will drive an operator-provided stack
 *   instead of provisioning its own scratch stack. Mirrors the guard in
 *   canary-e2e/playwright.config.js: when either URL is set the scratch ports
 *   are irrelevant and must not be touched.
 * @example usesOperatorStack({ CANARY_BASE_URL: "http://x" }) => true
 * @param {Object} [env]
 * @returns {boolean}
 ***/
export function usesOperatorStack(env = process.env) {
	return Boolean(env.CANARY_BASE_URL || env.CANARY_API_URL);
}

/***
 * MARK: isScratchOccupant
 * @description Classifies a port occupant as part of the canary scratch stack.
 *   A scratch API keeps its cwd in `canary-e2e` and runs `../api/index.js`; the
 *   scratch vite child carries `--port 5299 --strictPort`. Anything else —
 *   e.g. a database or an unrelated Node service parked on :3399 — is NOT a
 *   scratch occupant, and the caller must refuse to kill it.
 * @example isScratchOccupant({ port: 3399, cmdline: "node ../api/index.js" }) => true
 * @param {Object} info
 * @param {number} info.port
 * @param {string} [info.cmdline]
 * @param {string} [info.cwd]
 * @returns {boolean}
 ***/
export function isScratchOccupant({ port, cmdline = "", cwd = "" }) {
	if (cwd && /(^|[\\/])canary-e2e$/.test(cwd)) return true;
	if (port === SCRATCH_API_PORT) {
		return /(^|[\\/])api[\\/]index\.js(\s|$)/.test(cmdline);
	}
	if (port === SCRATCH_VITE_PORT) {
		const onScratchPort =
			/(^|\s)--port\s+5299(\s|$)/.test(cmdline) || /(^|\s)5299(\s|$)/.test(cmdline);
		const looksLikeVite = /\bvite\b/.test(cmdline) || /(^|[\\/])frontend$/.test(cwd);
		return onScratchPort && looksLikeVite;
	}
	return false;
}

function defaultExecFile(file, args) {
	return new Promise((resolve, reject) => {
		execFileCallback(file, args, { windowsHide: true }, (error, stdout, stderr) => {
			if (error) {
				reject(error);
			} else {
				resolve({ stdout: String(stdout), stderr: String(stderr) });
			}
		});
	});
}

/***
 * MARK: probeProcess
 * @description Reads a process's command line and working directory. Linux
 *   reads `/proc`; every other OS falls back to `ps -o command=` (cmdline only,
 *   cwd unknown). Returns null when the process cannot be inspected — the
 *   caller treats that as "not verified" and leaves it running.
 * @example await probeProcess(1234) => { cmdline: "node ../api/index.js", cwd: "/repo/canary-e2e" }
 * @param {number} pid
 * @param {Object} [opts]
 * @param {string} [opts.platform] - process.platform override, for tests.
 * @param {Function} [opts.readFileFn] - /proc read seam, for tests.
 * @param {Function} [opts.readlinkFn] - /proc readlink seam, for tests.
 * @param {Function} [opts.execFileFn] - execFile seam, for tests.
 * @returns {Promise<{cmdline: string, cwd: string}|null>}
 ***/
export async function probeProcess(
	pid,
	{
		platform = process.platform,
		readFileFn = fs.readFileSync,
		readlinkFn = fs.readlinkSync,
		execFileFn = defaultExecFile,
	} = {},
) {
	if (platform === "linux") {
		try {
			const cmdline = String(readFileFn(`/proc/${pid}/cmdline`)).replace(/\0/g, " ").trim();
			let cwd = "";
			try {
				cwd = String(readlinkFn(`/proc/${pid}/cwd`));
			} catch {
				// cwd is a bonus signal; the cmdline alone still classifies.
				cwd = "";
			}
			return { cmdline, cwd };
		} catch {
			return null;
		}
	}
	try {
		const { stdout } = await execFileFn("ps", ["-o", "command=", "-p", String(pid)]);
		const cmdline = String(stdout).trim();
		return cmdline ? { cmdline, cwd: "" } : null;
	} catch {
		return null;
	}
}

/***
 * MARK: freeScratchPorts
 * @description Frees :3399 and :5299 for the canary suite. No-op when an
 *   operator stack is configured. Otherwise each port is freed through
 *   `freePort` with a verification guard, so only a process that identifies as
 *   the canary scratch stack is terminated. Never throws: every outcome comes
 *   back as `{ ok, skipped, results }`, and `ok` is false when any port could
 *   not be freed safely.
 * @example await freeScratchPorts() => { ok: true, skipped: false, results: [...] }
 * @param {Object} [opts]
 * @param {Object} [opts.env] - environment override, for tests.
 * @param {Function} [opts.freePortFn] - freePort seam, for tests.
 * @param {Function} [opts.probeFn] - process probe seam, for tests.
 * @param {Object} [opts.log] - console-like sink, for tests.
 * @returns {Promise<{ok: boolean, skipped: boolean, results: Array<Object>}>}
 ***/
export async function freeScratchPorts({
	env = process.env,
	freePortFn = freePort,
	probeFn = probeProcess,
	log = console,
} = {}) {
	if (usesOperatorStack(env)) {
		log.log(
			"canary-preflight: CANARY_BASE_URL/CANARY_API_URL set — driving the operator stack; scratch ports left untouched.",
		);
		return { ok: true, skipped: true, results: [] };
	}

	const results = [];
	for (const port of SCRATCH_PORTS) {
		const result = await freePortFn(port, {
			verifyFn: async (pid) => {
				const info = await probeFn(pid);
				return Boolean(info) && isScratchOccupant({ port, cmdline: info.cmdline, cwd: info.cwd });
			},
		});
		results.push(result);
		if (result.ok) {
			log.log(
				result.alreadyFree
					? `canary-preflight: port ${port} already free`
					: `canary-preflight: freed port ${port} (pid ${result.pids.join(", ")})`,
			);
		} else {
			log.error(`canary-preflight: ${result.error}`);
		}
	}
	return { ok: results.every((result) => result.ok), skipped: false, results };
}

async function cli() {
	const { ok } = await freeScratchPorts();
	if (!ok) process.exitCode = 1;
}

const invokedDirectly =
	process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
	await cli();
}
