import { describe, it, expect, vi } from "vitest";
import { killProcessTreeSync, killProcessTree } from "./processTree.js";

describe("api/utils/processTree", () => {
	describe("killProcessTreeSync", () => {
		it("returns false for invalid pid", () => {
			expect(killProcessTreeSync(null)).toBe(false);
			expect(killProcessTreeSync(0)).toBe(false);
			expect(killProcessTreeSync(-1)).toBe(false);
		});

		it("invokes taskkill on Windows", () => {
			const execFileSyncFn = vi.fn();
			const result = killProcessTreeSync(1234, { platform: "win32", execFileSyncFn });

			expect(result).toBe(true);
			expect(execFileSyncFn).toHaveBeenCalledWith(
				"taskkill",
				["/PID", "1234", "/T", "/F"],
				expect.objectContaining({ stdio: ["ignore", "pipe", "pipe"] }),
			);
		});

		it("swallows taskkill errors cleanly when process is already gone on Windows", () => {
			const execFileSyncFn = vi.fn(() => {
				const err = new Error("Command failed: taskkill");
				err.status = 128;
				throw err;
			});
			const child = { kill: vi.fn() };
			const result = killProcessTreeSync(1234, { child, platform: "win32", execFileSyncFn });

			expect(result).toBe(true);
			expect(child.kill).toHaveBeenCalledWith("SIGKILL");
		});

		it("invokes process.kill(-pid) on POSIX, falling back to child.kill", () => {
			const processKillFn = vi.fn((pid) => {
				if (pid < 0) throw new Error("ESRCH");
			});
			const child = { kill: vi.fn() };
			const result = killProcessTreeSync(5678, { child, platform: "linux", processKillFn });

			expect(result).toBe(true);
			expect(processKillFn).toHaveBeenCalledWith(-5678, "SIGKILL");
			expect(child.kill).toHaveBeenCalledWith("SIGKILL");
		});

		it("swallows all errors when pid is already dead on POSIX", () => {
			const processKillFn = vi.fn(() => {
				throw new Error("ESRCH");
			});
			const child = {
				kill: vi.fn(() => {
					throw new Error("ESRCH");
				}),
			};
			const result = killProcessTreeSync(5678, { child, platform: "linux", processKillFn });

			expect(result).toBe(true);
		});
	});

	describe("killProcessTree (async)", () => {
		it("returns false for invalid pid", async () => {
			expect(await killProcessTree(null)).toBe(false);
			expect(await killProcessTree(0)).toBe(false);
		});

		it("spawns taskkill on Windows", async () => {
			const fakeTaskkill = {
				on: vi.fn((event, cb) => {
					if (event === "close") setTimeout(() => cb(0), 5);
				}),
			};
			const spawnFn = vi.fn().mockReturnValue(fakeTaskkill);

			const result = await killProcessTree(4321, { platform: "win32", spawnFn });
			expect(result).toBe(true);
			expect(spawnFn).toHaveBeenCalledWith(
				"taskkill",
				["/PID", "4321", "/T", "/F"],
				expect.objectContaining({ windowsHide: true }),
			);
		});

		it("signals process group on POSIX", async () => {
			const processKillFn = vi.fn();
			const result = await killProcessTree(4321, { signal: "SIGTERM", platform: "linux", processKillFn });

			expect(result).toBe(true);
			expect(processKillFn).toHaveBeenCalledWith(-4321, "SIGTERM");
		});
	});
});
