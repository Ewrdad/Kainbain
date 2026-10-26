import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isWindows, resolveShell, buildStageEnv, findOnPath } from "./platform.js";

describe("api/utils/platform", () => {
	describe("isWindows", () => {
		it("detects win32 correctly", () => {
			expect(isWindows("win32")).toBe(true);
			expect(isWindows("linux")).toBe(false);
			expect(isWindows("darwin")).toBe(false);
		});
	});

	describe("resolveShell", () => {
		it("resolves COMSPEC / cmd.exe on Windows", () => {
			const res = resolveShell("win32", {});
			expect(res.file).toBe("cmd.exe");
			expect(res.argsPrefix).toEqual(["/d", "/s", "/c"]);

			const custom = resolveShell("win32", { COMSPEC: "C:\\Windows\\System32\\cmd.exe" });
			expect(custom.file).toBe("C:\\Windows\\System32\\cmd.exe");
		});

		it("resolves SHELL / /bin/sh on POSIX", () => {
			const res = resolveShell("linux", {});
			expect(res.file).toBe("/bin/sh");
			expect(res.argsPrefix).toEqual(["-c"]);

			const custom = resolveShell("linux", { SHELL: "/usr/bin/bash" });
			expect(custom.file).toBe("/usr/bin/bash");
		});
	});

	describe("buildStageEnv", () => {
		it("reproduces sanitized Linux env and includes XDG / DBUS when available", () => {
			const env = buildStageEnv("/repo/test", "task-100", "linux", {
				USER: "alice",
				HOME: "/home/alice",
				PATH: "/bin:/usr/bin",
				LANG: "en_GB.UTF-8",
				NODE_ENV: "test",
				XDG_RUNTIME_DIR: "/run/user/1000",
			});

			expect(env.USER).toBe("alice");
			expect(env.HOME).toBe("/home/alice");
			expect(env.PATH).toBe("/bin:/usr/bin");
			expect(env.LANG).toBe("en_GB.UTF-8");
			expect(env.NODE_ENV).toBe("test");
			expect(env.PROJECT_CWD).toBe("/repo/test");
			expect(env.TASK_ID).toBe("task-100");
			expect(env.XDG_RUNTIME_DIR).toBe("/run/user/1000");
			expect(env.DBUS_SESSION_BUS_ADDRESS).toBe("unix:path=/run/user/1000/bus");
		});

		it("handles missing USER/HOME on Windows without hardcoded /home/server", () => {
			const homeSpy = vi.spyOn(os, "homedir").mockImplementation(() => {
				throw new Error("no homedir");
			});
			const userSpy = vi.spyOn(os, "userInfo").mockImplementation(() => {
				throw new Error("no user");
			});

			const env = buildStageEnv("/repo/test", "task-100", "win32", {
				PATH: "C:\\Windows\\system32",
			});

			expect(env.PROJECT_CWD).toBe("/repo/test");
			expect(env.TASK_ID).toBe("task-100");
			expect(env.HOME).toBe(os.tmpdir());
			expect(env.USER).toBe("kainbain");
			expect(env.XDG_RUNTIME_DIR).toBeUndefined();
			expect(env.DBUS_SESSION_BUS_ADDRESS).toBeUndefined();

			homeSpy.mockRestore();
			userSpy.mockRestore();
		});

		it("falls back safely when os.userInfo() throws", () => {
			const spy = vi.spyOn(os, "userInfo").mockImplementation(() => {
				throw new Error("no passwd entry");
			});

			const env = buildStageEnv("/repo/test", "task-100", "linux", {});
			// Generic app identity — never a host-specific login like "server".
			expect(env.USER).toBe("kainbain");
			expect(env.HOME).toBeDefined();
			spy.mockRestore();
		});

		it("omits XDG/DBUS runtime vars on macOS (Linux-only)", () => {
			const env = buildStageEnv("/repo/test", "task-100", "darwin", {
				USER: "alice",
				HOME: "/Users/alice",
				PATH: "/usr/bin:/bin",
			});

			expect(env.USER).toBe("alice");
			expect(env.HOME).toBe("/Users/alice");
			expect(env.XDG_RUNTIME_DIR).toBeUndefined();
			expect(env.DBUS_SESSION_BUS_ADDRESS).toBeUndefined();
		});
	});

	describe("findOnPath", () => {
		it("returns absolute path if file exists", () => {
			expect(findOnPath(process.execPath, "linux")).toBe(process.execPath);
		});

		it("returns null for non-existent absolute path", () => {
			expect(findOnPath("/non/existent/binary/path", "linux")).toBeNull();
		});

		it("finds binary on POSIX PATH", () => {
			const nodeDir = path.dirname(process.execPath);
			const found = findOnPath(path.basename(process.execPath), "linux", {
				PATH: `/nonexistent:${nodeDir}`,
			});
			expect(found).toBe(process.execPath);
		});

		it("finds binary with PATHEXT on Windows", () => {
			const nodeDir = path.dirname(process.execPath);
			const base = path.basename(process.execPath);
			const found = findOnPath(base, "win32", {
				PATH: `C:\\nonexistent;${nodeDir}`,
				PATHEXT: ".EXE;.CMD",
			});
			expect(found).toBe(process.execPath);
		});

		it("returns null if not found on PATH", () => {
			expect(findOnPath("definitely_not_a_real_binary_name_12345", "linux", { PATH: "/bin:/usr/bin" })).toBeNull();
		});

		it("ignores non-executable files on POSIX (command -v semantics)", () => {
			const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-findonpath-"));
			try {
				const plain = path.join(dir, "notexec");
				fs.writeFileSync(plain, "#!/bin/sh\necho hi\n", { mode: 0o644 });
				expect(findOnPath("notexec", "linux", { PATH: dir })).toBeNull();
				expect(findOnPath(plain, "linux")).toBeNull();

				fs.chmodSync(plain, 0o755);
				expect(findOnPath("notexec", "linux", { PATH: dir })).toBe(plain);
				expect(findOnPath(plain, "linux")).toBe(plain);
			} finally {
				fs.rmSync(dir, { recursive: true, force: true });
			}
		});
	});
});
