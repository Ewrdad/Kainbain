import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process.spawn so tests never run real git.
const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({
	spawn: (...args) => spawnMock(...args),
}));

import { hasRemote, pushBranchIfRemote } from "./remote.js";
import { GitError } from "./errors.js";

/***
 * MARK: git remote unit tests
 * @description Direct tests for the `api/git/remote.js` command family:
 *   remote existence checks and guarded push with auto-upstream tracking.
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

describe("hasRemote", () => {
	beforeEach(() => {
		spawnMock.mockReset();
	});

	it("returns true when the remote URL resolves", async () => {
		spawnMock.mockImplementation((cmd, args) => {
			expect(cmd).toBe("git");
			expect(args).toEqual(["remote", "get-url", "origin"]);
			return fakeChildFromResponse({ stdout: "/tmp/remote.git\n" });
		});
		expect(await hasRemote("/repo")).toBe(true);
	});

	it("returns false when no remote is configured (never throws)", async () => {
		spawnMock.mockImplementation(() =>
			fakeChildFromResponse({ code: 128, stderr: "fatal: No such remote 'origin'" }),
		);
		expect(await hasRemote("/repo")).toBe(false);
	});

	it("returns false for unsafe remote names without spawning", async () => {
		expect(await hasRemote("/repo", "--upload-pack=touch")).toBe(false);
		expect(await hasRemote("/repo", "with space")).toBe(false);
		expect(spawnMock).not.toHaveBeenCalled();
	});

	it("looks up a custom remote name", async () => {
		spawnMock.mockImplementation((cmd, args) => {
			expect(args).toEqual(["remote", "get-url", "upstream"]);
			return fakeChildFromResponse({ stdout: "/tmp/up.git\n" });
		});
		expect(await hasRemote("/repo", "upstream")).toBe(true);
	});
});

describe("pushBranchIfRemote", () => {
	beforeEach(() => {
		spawnMock.mockReset();
	});

	it("skips with zero push spawned when no remote exists", async () => {
		const calls = [];
		spawnMock.mockImplementation((cmd, args) => {
			calls.push([...args]);
			return fakeChildFromResponse({ code: 128, stderr: "fatal: No such remote" });
		});
		const res = await pushBranchIfRemote("/repo", "kb/task-1");
		expect(res).toEqual({ pushed: false, skipped: "no-remote" });
		expect(calls.some((a) => a[0] === "push")).toBe(false);
	});

	it("pushes with -u on the first push (no upstream yet)", async () => {
		const calls = [];
		spawnMock.mockImplementation((cmd, args) => {
			calls.push([...args]);
			if (args[0] === "remote") return fakeChildFromResponse({ stdout: "/tmp/r.git" });
			if (args[0] === "rev-parse") {
				return fakeChildFromResponse({ code: 128, stderr: "fatal: no upstream" });
			}
			return fakeChildFromResponse({ stdout: "" });
		});
		const res = await pushBranchIfRemote("/repo", "kb/task-1");
		expect(res).toEqual({ pushed: true, skipped: null });
		expect(calls).toContainEqual(["push", "-u", "origin", "kb/task-1"]);
	});

	it("pushes plainly when an upstream already exists", async () => {
		const calls = [];
		spawnMock.mockImplementation((cmd, args) => {
			calls.push([...args]);
			if (args[0] === "remote") return fakeChildFromResponse({ stdout: "/tmp/r.git" });
			if (args[0] === "rev-parse") {
				return fakeChildFromResponse({ stdout: "origin/kb/task-1" });
			}
			return fakeChildFromResponse({ stdout: "" });
		});
		const res = await pushBranchIfRemote("/repo", "kb/task-1");
		expect(res).toEqual({ pushed: true, skipped: null });
		expect(calls).toContainEqual(["push", "origin", "kb/task-1"]);
		expect(calls.some((a) => a.includes("-u"))).toBe(false);
	});

	it("honors an explicit setUpstream override", async () => {
		const calls = [];
		spawnMock.mockImplementation((cmd, args) => {
			calls.push([...args]);
			if (args[0] === "remote") return fakeChildFromResponse({ stdout: "/tmp/r.git" });
			return fakeChildFromResponse({ stdout: "" });
		});
		const res = await pushBranchIfRemote("/repo", "kb/task-1", {
			setUpstream: true,
		});
		expect(res).toEqual({ pushed: true, skipped: null });
		expect(calls).toContainEqual(["push", "-u", "origin", "kb/task-1"]);
		// No upstream probe when the caller decides.
		expect(
			calls.some((a) => a.join(" ").includes("@{upstream}")),
		).toBe(false);
	});

	it("surfaces push failures as a catchable error (caller warns and continues)", async () => {
		spawnMock.mockImplementation((cmd, args) => {
			if (args[0] === "remote") return fakeChildFromResponse({ stdout: "/tmp/r.git" });
			if (args[0] === "rev-parse") {
				return fakeChildFromResponse({ code: 128, stderr: "fatal: no upstream" });
			}
			return fakeChildFromResponse({ code: 128, stderr: "fatal: Authentication failed" });
		});
		await expect(pushBranchIfRemote("/repo", "kb/task-1")).rejects.toBeInstanceOf(
			GitError,
		);
	});

	it("rejects invalid branch names without spawning", async () => {
		await expect(pushBranchIfRemote("/repo", "--force")).rejects.toBeInstanceOf(
			GitError,
		);
		expect(spawnMock).not.toHaveBeenCalled();
	});
});
