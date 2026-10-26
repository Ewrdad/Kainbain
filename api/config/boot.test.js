import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * MARK: Config boot tests
 * @description Proves the two ticket boot scenarios against a real server
 *   process: an invalid typed value fails fast with a clear CONFIG diagnostic
 *   (never listening), and an isolated clean environment boots on defaults.
 *   Both spawns are bounded (timeout + kill) and isolated (scratch roots,
 *   disabled scheduler, ephemeral port) so they never touch live operations.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const SERVER_ENTRY = path.join(REPO_ROOT, "api", "index.js");

/***
 * MARK: findFreePort
 * @description Binds port 0 to discover a free localhost port for the boot probe.
 * @example await findFreePort() => 34987
 * @returns {Promise<number>} A currently-free port.
 ***/
function findFreePort() {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const { port } = server.address();
			server.close(() => resolve(port));
		});
	});
}

/***
 * MARK: spawnServer
 * @description Spawns the API with a scrubbed environment (only the allowlist
 *   below plus test overrides), resolving when `until` matches or the process
 *   exits. Always kills the child before resolving.
 * @example await spawnServer({ PORT: "1" }, /API running on/)
 * @param {Object} overrides - Extra env vars for the child.
 * @param {RegExp|null} until - Output marker to wait for, or null to wait for exit.
 * @param {number} timeoutMs - Bounded wait before giving up.
 * @returns {Promise<{ code: number|null, signal: string|null, output: string }>}
 ***/
function spawnServer(overrides, until, timeoutMs = 25000) {
	const projectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kb-config-boot-projects-"));
	const notesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kb-config-boot-notes-"));
	const childEnv = {
		PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
		HOME: process.env.HOME || "/home/server",
		NODE_ENV: "test",
		NO_COLOR: "1",
		PROJECTS_ROOT: projectsRoot,
		NOTES_SPACE_ROOT: notesRoot,
		KAINBAIN_DISABLE_SCHEDULER: "true",
		...overrides,
	};
	if (process.env.TMPDIR) childEnv.TMPDIR = process.env.TMPDIR;
	return new Promise((resolve) => {
		const child = spawn(process.execPath, [SERVER_ENTRY], {
			cwd: REPO_ROOT,
			env: childEnv,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let output = "";
		let settled = false;
		const finish = (result) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			try {
				child.kill("SIGTERM");
			} catch {
				// Already exited.
			}
			resolve({ ...result, output });
		};
		const timer = setTimeout(
			() => finish({ code: null, signal: "TIMEOUT", timedOut: true }),
			timeoutMs,
		);
		child.stdout.on("data", (chunk) => {
			output += String(chunk);
			if (until && until.test(output)) finish({ code: null, signal: null, timedOut: false });
		});
		child.stderr.on("data", (chunk) => {
			output += String(chunk);
			if (until && until.test(output)) finish({ code: null, signal: null, timedOut: false });
		});
		child.on("exit", (code, signal) => finish({ code, signal, timedOut: false }));
		child.on("error", (error) => finish({ code: null, signal: `SPAWN_ERROR: ${error.message}`, timedOut: false }));
	});
}

describe("config boot behavior", () => {
	it("fails fast with a clear diagnostic on KAINBAIN_AGENT_TIMEOUT_MS=invalid_number", async () => {
		const result = await spawnServer(
			{ KAINBAIN_AGENT_TIMEOUT_MS: "invalid_number" },
			null,
			25000,
		);
		expect(result.timedOut).toBe(false);
		expect(result.code).not.toBe(0);
		expect(result.output).toContain(
			'CONFIG KAINBAIN_AGENT_TIMEOUT_MS: not a number (got "invalid_number", want an integer >= 0)',
		);
		expect(result.output).not.toContain("API running on");
	}, 30000);

	it("boots cleanly on defaults with an isolated environment", async () => {
		const port = await findFreePort();
		const result = await spawnServer({ PORT: String(port) }, /API running on/, 25000);
		expect(result.timedOut).toBe(false);
		expect(result.output).toContain("API running on");
		expect(result.output).not.toContain("CONFIG ");
	}, 30000);
});
