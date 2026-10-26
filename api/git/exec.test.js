import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Mock child_process.spawn so tests never run real git.
const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({
	spawn: (...args) => spawnMock(...args),
}));

import { GitError } from "./errors.js";
import { git } from "./exec.js";

/***
 * MARK: git exec unit tests
 * @description Direct tests for the `api/git/exec.js` process core: argv
 *   array spawning (never a shell string), typed errors, output behavior,
 *   timeout enforcement, and the stale-lock recovery retry seam.
 *   child_process.spawn is mocked — no real git is ever invoked.
 ***/

/** Builds a fake spawn child that replays a mocked git response. */
function fakeChildFromResponse(
	{ stdout = "", stderr = "", code = 0, error = null } = {},
) {
	return {
		pid: 4242,
		stdout: {
			on: (ev, fn) => {
				if (ev === "data" && stdout) setImmediate(() => fn(Buffer.from(stdout)));
			},
		},
		stderr: {
			on: (ev, fn) => {
				if (ev === "data" && stderr) setImmediate(() => fn(Buffer.from(stderr)));
			},
		},
		on: (ev, fn) => {
			if (ev === "close") setImmediate(() => fn(error ? null : code, null));
			if (ev === "error" && error) setImmediate(() => fn(error));
		},
		kill: vi.fn(),
	};
}

/** Configures spawnMock to immediately replay one mocked git response. */
function mockGitResponse(
	{ stdout = "", stderr = "", code = 0, error = null } = {},
) {
	spawnMock.mockImplementation(() => fakeChildFromResponse({ stdout, stderr, code, error }));
	return spawnMock;
}

describe("git()", () => {
	beforeEach(() => {
		spawnMock.mockReset();
	});

	it("spawns git with an argv array (never a shell string)", async () => {
		mockGitResponse({ stdout: "ok" });
		await git("/repo", ["status", "--porcelain"]);
		expect(spawnMock).toHaveBeenCalledWith(
			"git",
			["status", "--porcelain"],
			expect.objectContaining({ cwd: "/repo" }),
		);
	});

	it("resolves stdout/stderr on exit 0", async () => {
		mockGitResponse({ stdout: "refs/heads/main", stderr: "" });
		const res = await git("/repo", ["rev-parse", "HEAD"]);
		expect(res.stdout).toBe("refs/heads/main");
		expect(res.code).toBe(0);
	});

	it("rejects with a GitError carrying code/args/stdout/stderr on non-zero exit", async () => {
		mockGitResponse({ stdout: "", stderr: "fatal: bad thing", code: 128 });
		await expect(git("/repo", ["merge", "nope"])).rejects.toMatchObject({
			name: "GitError",
			code: 128,
			message: expect.stringContaining("bad thing"),
		});
	});

	it("rejects non-string args (no shell interpolation ever)", async () => {
		await expect(git("/repo", ["status", 42])).rejects.toBeInstanceOf(GitError);
	});

	it("rejects a missing working directory", async () => {
		await expect(git("", ["status"])).rejects.toBeInstanceOf(GitError);
		await expect(git(null, ["status"])).rejects.toBeInstanceOf(GitError);
	});

	it("rejects when the binary cannot be spawned", async () => {
		mockGitResponse({ error: new Error("spawn git ENOENT") });
		await expect(git("/repo", ["status"])).rejects.toMatchObject({
			message: expect.stringContaining("Failed to start git"),
		});
	});

	it("rejects when the child exceeds its timeout", async () => {
		const kill = vi.fn();
		spawnMock.mockImplementation(() => ({
			pid: 4242,
			stdout: { on: () => {} },
			stderr: { on: () => {} },
			on: () => {}, // never emits close/error: the timer must fire
			kill,
		}));
		await expect(git("/repo", ["status"], { timeout: 50 })).rejects.toMatchObject({
			name: "GitError",
			message: expect.stringContaining("timed out after 50ms"),
		});
		expect(kill).toHaveBeenCalledWith("SIGKILL");
	});

	describe("stale-lock holder-scan override (listLiveGitProcesses)", () => {
		/* eslint-disable security/detect-non-literal-fs-filename -- throwaway os.tmpdir() dirs only; spawn is mocked so no real git ever runs */
		const LOCK_STDERR =
			"fatal: Unable to create '/repo/.git/index.lock': File exists.";

		function fakeChild({ stdout = "", stderr = "", code = 0 } = {}) {
			return {
				pid: 4242,
				stdout: {
					on: (ev, fn) => {
						if (ev === "data" && stdout) setImmediate(() => fn(Buffer.from(stdout)));
					},
				},
				stderr: {
					on: (ev, fn) => {
						if (ev === "data" && stderr) setImmediate(() => fn(Buffer.from(stderr)));
					},
				},
				on: (ev, fn) => {
					if (ev === "close") setImmediate(() => fn(code, null));
				},
				kill: vi.fn(),
			};
		}

		function plantAgedLock(cwd) {
			fs.mkdirSync(path.join(cwd, ".git"), { recursive: true });
			const lockPath = path.join(cwd, ".git", "index.lock");
			fs.writeFileSync(lockPath, "");
			const old = new Date(Date.now() - 120_000);
			fs.utimesSync(lockPath, old, old);
			return lockPath;
		}

		it("recovers a provably stale lock and retries when the scan reports no holders", async () => {
			const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "kb-git-exec-"));
			try {
				const lockPath = plantAgedLock(cwd);
				let calls = 0;
				spawnMock.mockImplementation(() => {
					calls += 1;
					return calls === 1
						? fakeChild({ code: 128, stderr: LOCK_STDERR })
						: fakeChild({ stdout: "other" });
				});
				const res = await git(cwd, ["checkout", "other"], {
					listLiveGitProcesses: async () => ({
						holders: [],
						inconclusive: false,
					}),
				});
				expect(res.stdout).toBe("other");
				expect(fs.existsSync(lockPath)).toBe(false);
			} finally {
				fs.rmSync(cwd, { recursive: true, force: true });
			}
		});

		it("leaves the lock alone and names the holder when the scan reports one", async () => {
			const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "kb-git-exec-"));
			try {
				const lockPath = plantAgedLock(cwd);
				spawnMock.mockImplementation(() =>
					fakeChild({ code: 128, stderr: LOCK_STDERR }),
				);
				await expect(
					git(cwd, ["checkout", "other"], {
						listLiveGitProcesses: async () => ({
							holders: [{ pid: 424242, command: "git checkout" }],
							inconclusive: false,
						}),
					}),
				).rejects.toMatchObject({
					message: expect.stringContaining("live git process"),
				});
				expect(fs.existsSync(lockPath)).toBe(true);
			} finally {
				fs.rmSync(cwd, { recursive: true, force: true });
			}
		});
		/* eslint-enable security/detect-non-literal-fs-filename */
	});
});
