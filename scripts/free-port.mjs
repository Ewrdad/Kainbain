#!/usr/bin/env node
/***
 * MARK: free-port.mjs
 * @description Cross-platform replacement for the psmisc port-kill command
 *   (Linux-only, with no macOS/Windows TCP support). Probes occupancy with
 *   `node:net`, looks the occupant PID up per OS (`lsof -ti` on Linux/macOS
 *   with an `ss` fallback on Linux, `netstat -ano` on Windows — always via
 *   `execFile`, never a shell), then terminates it with SIGTERM escalating to
 *   SIGKILL. Every OS boundary is an injectable seam so the darwin/win32 paths
 *   stay unit-testable on a Linux-only host.
 *
 * Usage:
 *   node scripts/free-port.mjs 3100 5173
 *   import { freePort } from "./free-port.mjs";
 * @example const result = await freePort(3100) => { ok: true, port: 3100, freed: true, pids: [1234] }
 ***/

import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile as execFileCallback } from "node:child_process";

/***
 * MARK: assertValidPort
 * @description Rejects port numbers outside the TCP range before any probing.
 * @example assertValidPort(3100) => undefined
 * @param {number} port
 ***/
function assertValidPort(port) {
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error(`Invalid port "${port}": expected an integer from 1 to 65535.`);
	}
}

/***
 * MARK: defaultSleep
 * @description Promise-based sleep used between occupancy polls.
 * @example await defaultSleep(100)
 * @param {number} ms
 * @returns {Promise<void>}
 ***/
function defaultSleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/***
 * MARK: defaultExecFile
 * @description Promisified execFile returning stdout/stderr strings; rejects
 *   with the child error (carrying `.code`) on non-zero exit.
 * @example const { stdout } = await defaultExecFile("lsof", ["-ti", "tcp:3100"])
 * @param {string} file
 * @param {Array<string>} args
 * @returns {Promise<{stdout: string, stderr: string}>}
 ***/
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
 * MARK: isPortOccupied
 * @description Probes whether anything is listening on a TCP port by attempting
 *   a bind: EADDRINUSE means occupied. Works identically on every OS.
 * @example await isPortOccupied(3100) => true
 * @param {number} port
 * @returns {Promise<boolean>}
 ***/
export async function isPortOccupied(port) {
	assertValidPort(port);
	return new Promise((resolve, reject) => {
		const probe = net.createServer();
		probe.once("error", (error) => {
			if (error.code === "EADDRINUSE") {
				resolve(true);
			} else {
				reject(error);
			}
		});
		probe.listen(port, "0.0.0.0", () => {
			probe.close(() => resolve(false));
		});
	});
}

/***
 * MARK: pidsFromLsof
 * @description Parses `lsof -ti` output (one PID per line) into numbers.
 * @example pidsFromLsof("1234\n5678\n") => [1234, 5678]
 * @param {string} stdout
 * @returns {Array<number>}
 ***/
function pidsFromLsof(stdout) {
	return stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map(Number)
		.filter((pid) => Number.isInteger(pid) && pid > 0);
}

/***
 * MARK: pidsFromSs
 * @description Parses `ss -ltnp` output, collecting the `pid=<n>` mentions
 *   only from lines whose local address is exactly `:<port>` (the dump
 *   lists every listener, so an unfiltered match would kill unrelated
 *   processes; the lookahead keeps port 3100 from matching 31000).
 * @example pidsFromSs('LISTEN ... 0.0.0.0:3100 ... pid=777', 3100) => [777]
 * @param {string} stdout
 * @param {number} port
 * @returns {Array<number>}
 ***/
function pidsFromSs(stdout, port) {
	const pids = [];
	const localPort = new RegExp(`:${port}(?=\\s)`);
	for (const line of stdout.split("\n")) {
		if (!localPort.test(line)) continue;
		for (const match of line.matchAll(/pid=(\d+)/g)) {
			const pid = Number(match[1]);
			if (pid > 0 && !pids.includes(pid)) pids.push(pid);
		}
	}
	return pids;
}

/***
 * MARK: pidsFromNetstat
 * @description Parses `netstat -ano` output, collecting the PID of every line
 *   whose local address is exactly `:<port>` in LISTENING state. The exact
 *   match matters: port 3100 must not match 31000.
 * @example pidsFromNetstat("TCP 0.0.0.0:3100 ... LISTENING 4321", 3100) => [4321]
 * @param {string} stdout
 * @param {number} port
 * @returns {Array<number>}
 ***/
function pidsFromNetstat(stdout, port) {
	const pids = [];
	for (const line of stdout.split("\n")) {
		const upper = line.toUpperCase();
		if (!upper.includes("LISTENING")) continue;
		const columns = line.trim().split(/\s+/);
		// Columns: Proto, Local Address, Foreign Address, State, PID.
		if (columns.length < 5) continue;
		const localAddress = columns[1];
		const pid = Number(columns[columns.length - 1]);
		if (!Number.isInteger(pid) || pid <= 0) continue;
		if (localAddress.toLowerCase().endsWith(`:${port}`) && !pids.includes(pid)) {
			pids.push(pid);
		}
	}
	return pids;
}

/***
 * MARK: findOccupantPids
 * @description Lists the PIDs listening on a TCP port, per OS: `lsof -ti` on
 *   Linux/macOS (with an `ss` fallback on Linux when lsof is missing),
 *   `netstat -ano` on Windows. Returns [] when nothing is found. Throws a
 *   human-actionable error when no lookup tool exists at all.
 * @example await findOccupantPids(3100) => [1234]
 * @param {number} port
 * @param {Object} [opts]
 * @param {string} [opts.platform] - process.platform override, for tests.
 * @param {Function} [opts.execFileFn] - execFile seam, for tests.
 * @returns {Promise<Array<number>>}
 ***/
export async function findOccupantPids(port, { platform = process.platform, execFileFn = defaultExecFile } = {}) {
	assertValidPort(port);

	if (platform === "win32") {
		const { stdout } = await execFileFn("netstat", ["-ano", "-p", "tcp"]);
		return pidsFromNetstat(stdout, port);
	}

	try {
		const { stdout } = await execFileFn("lsof", ["-ti", `tcp:${port}`]);
		return pidsFromLsof(stdout);
	} catch (error) {
		// lsof exits 1 when nothing matches: a free (or unlistable) port.
		if (error && error.code === 1) return [];
		// lsof missing entirely: fall back to ss on Linux (iproute2 ships it
		// on virtually every distro; lsof is always present on macOS).
		if (error && error.code === "ENOENT" && platform === "linux") {
			try {
				const { stdout } = await execFileFn("ss", ["-ltnp"]);
				return pidsFromSs(stdout, port);
			} catch (ssError) {
				if (ssError && ssError.code === "ENOENT") {
					throw new Error(
						`Cannot list the occupant of port ${port}: neither 'lsof' nor 'ss' is installed. ` +
							`Install one of them, or kill the process holding the port yourself and retry.`,
					);
				}
				throw ssError;
			}
		}
		if (error && error.code === "ENOENT") {
			throw new Error(
				`Cannot list the occupant of port ${port}: 'lsof' is not installed. ` +
					`Install it, or kill the process holding the port yourself and retry.`,
			);
		}
		throw error;
	}
}

/***
 * MARK: waitForRelease
 * @description Polls an occupancy probe until the port releases or time runs out.
 * @example await waitForRelease(async () => false, 1000, 100) => true
 * @param {Function} isOccupiedFn
 * @param {number} waitMs
 * @param {number} pollIntervalMs
 * @param {Function} sleepFn
 * @returns {Promise<boolean>} True when the port released in time.
 ***/
async function waitForRelease(isOccupiedFn, waitMs, pollIntervalMs, sleepFn) {
	const deadline = Date.now() + waitMs;
	for (;;) {
		if (!(await isOccupiedFn())) return true;
		if (Date.now() >= deadline) return false;
		await sleepFn(pollIntervalMs);
	}
}

/***
 * MARK: freePort
 * @description Frees a TCP port the way the old Linux-only deploy path did: no-op when already
 *   free, otherwise SIGTERM the occupant PIDs (skipping our own process),
 *   escalate to SIGKILL when they linger, and report an actionable error when
 *   the port never releases. Never throws for occupant problems — they come
 *   back as `{ ok: false, error }`.
 * @example await freePort(3100) => { ok: true, port: 3100, freed: true, pids: [1234] }
 * @param {number} port
 * @param {Object} [opts]
 * @param {string} [opts.platform] - process.platform override, for tests.
 * @param {Function} [opts.execFileFn] - execFile seam, for tests.
 * @param {Function} [opts.isOccupiedFn] - occupancy probe seam, for tests.
 * @param {Function} [opts.killFn] - process.kill seam, for tests.
 * @param {Function} [opts.verifyFn] - async (pid, port) => boolean occupant
 *   guard. When provided, NO pid is terminated unless it verifies, so a port
 *   shared with unrelated software can never take that software down; a
 *   non-verifying occupant fails the call with `unverifiedPids` set instead
 *   (default: null = allow every occupant, the historical behaviour).
 * @param {Function} [opts.sleepFn] - sleep seam, for tests.
 * @param {number} [opts.termWaitMs] - grace period after SIGTERM (default 3000).
 * @param {number} [opts.killWaitMs] - grace period after SIGKILL (default 2000).
 * @param {number} [opts.pollIntervalMs] - occupancy poll cadence (default 100).
 * @returns {Promise<Object>}
 ***/
export async function freePort(
	port,
	{
		platform = process.platform,
		execFileFn = defaultExecFile,
		isOccupiedFn = null,
		killFn = (pid, signal) => process.kill(pid, signal),
		verifyFn = null,
		sleepFn = defaultSleep,
		termWaitMs = 3000,
		killWaitMs = 2000,
		pollIntervalMs = 100,
	} = {},
) {
	assertValidPort(port);
	const probe = isOccupiedFn || (() => isPortOccupied(port));

	if (!(await probe())) {
		return { ok: true, port, freed: false, alreadyFree: true, pids: [] };
	}

	let pids;
	try {
		pids = await findOccupantPids(port, { platform, execFileFn });
	} catch (error) {
		return { ok: false, port, freed: false, alreadyFree: false, pids: [], error: error.message };
	}

	// Never kill our own process: a self-lookup match means the caller already
	// holds the port, and killing ourselves frees nothing.
	const victims = pids.filter((pid) => pid !== process.pid);
	if (victims.length === 0) {
		if (pids.includes(process.pid)) {
			return {
				ok: false,
				port,
				freed: false,
				alreadyFree: false,
				pids,
				error:
					`Port ${port} is held by the current process itself (pid ${process.pid}); ` +
					`nothing to kill. Stop this process or pick another port.`,
			};
		}
		return {
			ok: false,
			port,
			freed: false,
			alreadyFree: false,
			pids: [],
			error:
				`Port ${port} is occupied but no occupant PID was found. ` +
				`Stop whatever holds port ${port} yourself (or set PORT / VITE_PORT) and retry.`,
		};
	}

	// Verified-victim guard: when the caller supplies `verifyFn`, refuse the
	// whole operation unless EVERY occupant verifies. Killing a subset while an
	// unverified process also holds the port would leave the caller with a
	// half-freed port and no way to tell which process was the real blocker.
	if (typeof verifyFn === "function") {
		const unverified = [];
		for (const pid of victims) {
			let verified = false;
			try {
				verified = Boolean(await verifyFn(pid, port));
			} catch {
				// A throwing probe (e.g. /proc read raced the process exit) must
				// fail safe: treat the occupant as unverified, never as a victim.
				verified = false;
			}
			if (!verified) unverified.push(pid);
		}
		if (unverified.length > 0) {
			return {
				ok: false,
				port,
				freed: false,
				alreadyFree: false,
				pids,
				unverifiedPids: unverified,
				error:
					`Port ${port} is held by pid(s) ${unverified.join(", ")}, which did not match the ` +
					`expected process signature; refusing to terminate them. ` +
					`Stop the process yourself (or set PORT / VITE_PORT) and retry.`,
			};
		}
	}

	for (const pid of victims) {
		try {
			killFn(pid, "SIGTERM");
		} catch {
			// Already gone — the release poll below confirms.
		}
	}
	if (await waitForRelease(probe, termWaitMs, pollIntervalMs, sleepFn)) {
		return { ok: true, port, freed: true, alreadyFree: false, pids: victims };
	}

	for (const pid of victims) {
		try {
			killFn(pid, "SIGKILL");
		} catch {
			// Already gone — the release poll below confirms.
		}
	}
	if (await waitForRelease(probe, killWaitMs, pollIntervalMs, sleepFn)) {
		return { ok: true, port, freed: true, alreadyFree: false, pids: victims };
	}

	return {
		ok: false,
		port,
		freed: false,
		alreadyFree: false,
		pids: victims,
		error:
			`Port ${port} is still occupied after terminating pid(s) ${victims.join(", ")}. ` +
			`Stop whatever holds port ${port} yourself (check with ` +
			(platform === "win32" ? `"netstat -ano"` : `"lsof -ti tcp:${port}"`) +
			`) or set PORT / VITE_PORT and retry.`,
	};
}

/***
 * MARK: cli
 * @description `node scripts/free-port.mjs 3100 5173`: frees each listed port,
 *   printing one line per port. Exits 1 naming the first port that failed.
 ***/
async function cli() {
	const ports = process.argv.slice(2).map(Number);
	if (ports.length === 0 || ports.some((port) => !Number.isInteger(port))) {
		console.error("Usage: node scripts/free-port.mjs <port> [<port> ...]");
		process.exitCode = 1;
		return;
	}
	for (const port of ports) {
		let result;
		try {
			result = await freePort(port);
		} catch (error) {
			console.error(`Port ${port}: ${error.message}`);
			process.exitCode = 1;
			return;
		}
		if (result.ok) {
			console.log(result.alreadyFree ? `Port ${port}: already free` : `Port ${port}: freed (pid ${result.pids.join(", ")})`);
		} else {
			console.error(`Port ${port}: ${result.error}`);
			process.exitCode = 1;
			return;
		}
	}
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
	await cli();
}
