import { execFileSync, spawn } from "node:child_process";
import { isWindows } from "./platform.js";

/***
 * MARK: killProcessTreeSync
 * @description Synchronously terminates a process and its child tree across platforms.
 *   On Windows: executes `taskkill /PID <pid> /T /F`.
 *   On POSIX: attempts process.kill(-pid, "SIGKILL") then falls back to child.kill("SIGKILL").
 *   Guaranteed never to throw if the process or process group is already dead.
 * @param {number} pid - Target process ID.
 * @param {Object} [opts]
 * @param {Object} [opts.child] - Optional Node.js ChildProcess handle for fallback.
 * @param {string} [opts.platform=process.platform] - Platform override for testing.
 * @returns {boolean} True if kill dispatched without error, false otherwise.
 ***/
export function killProcessTreeSync(
	pid,
	{
		child = null,
		platform = process.platform,
		execFileSyncFn = execFileSync,
		processKillFn = process.kill,
	} = {},
) {
	if (typeof pid !== "number" || pid <= 0) return false;

	if (isWindows(platform)) {
		try {
			execFileSyncFn("taskkill", ["/PID", String(pid), "/T", "/F"], {
				stdio: ["ignore", "pipe", "pipe"],
			});
			return true;
		} catch {
			// Process may already be dead or taskkill returned exit code 128
			if (child && typeof child.kill === "function") {
				try {
					child.kill("SIGKILL");
				} catch {
					// already gone
				}
			}
			return true;
		}
	}

	// POSIX
	try {
		processKillFn(-pid, "SIGKILL");
	} catch {
		try {
			if (child && typeof child.kill === "function") {
				child.kill("SIGKILL");
			} else {
				processKillFn(pid, "SIGKILL");
			}
		} catch {
			// already gone
		}
	}
	return true;
}

/***
 * MARK: killProcessTree
 * @description Asynchronously terminates a process and its child tree across platforms.
 *   On Windows: spawns `taskkill /PID <pid> /T /F` asynchronously.
 *   On POSIX: sends signal to process group -pid, falling back to pid.
 * @param {number} pid - Target process ID.
 * @param {Object} [opts]
 * @param {string} [opts.signal="SIGTERM"] - Signal to send on POSIX (default SIGTERM).
 * @param {Object} [opts.child] - Optional Node.js ChildProcess handle.
 * @param {string} [opts.platform=process.platform] - Platform override for testing.
 * @returns {Promise<boolean>}
 ***/
export function killProcessTree(
	pid,
	{
		signal = "SIGTERM",
		child = null,
		platform = process.platform,
		spawnFn = spawn,
		processKillFn = process.kill,
	} = {},
) {
	if (typeof pid !== "number" || pid <= 0) return Promise.resolve(false);

	if (isWindows(platform)) {
		return new Promise((resolve) => {
			try {
				const tk = spawnFn("taskkill", ["/PID", String(pid), "/T", "/F"], {
					stdio: ["ignore", "ignore", "ignore"],
					windowsHide: true,
				});
				tk.on("error", () => {
					if (child && typeof child.kill === "function") {
						try { child.kill(); } catch { /* ignore */ }
					}
					resolve(true);
				});
				tk.on("close", () => resolve(true));
			} catch {
				if (child && typeof child.kill === "function") {
					try { child.kill(); } catch { /* ignore */ }
				}
				resolve(true);
			}
		});
	}

	// POSIX
	try {
		processKillFn(-pid, signal);
	} catch {
		try {
			if (child && typeof child.kill === "function") {
				child.kill(signal);
			} else {
				processKillFn(pid, signal);
			}
		} catch {
			// already gone
		}
	}
	return Promise.resolve(true);
}
