import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process.spawn so tests never run real git.
const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({
	spawn: (...args) => spawnMock(...args),
}));

import {
	isGitRepository,
	hasCommits,
	currentBranch,
	branchExists,
	countUniqueCommits,
	countBehindCommits,
	isMergeInProgress,
	resolveSha,
	diffRangeNumstat,
} from "./status.js";
import { GitError } from "./errors.js";

/***
 * MARK: git status unit tests
 * @description Direct tests for the `api/git/status.js` read-only
 *   inspectors: repo/commit presence, branch resolution, commit counts,
 *   merge-state detection, SHA resolution, and numstat ranges.
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

describe("status inspectors", () => {
	beforeEach(() => {
		spawnMock.mockReset();
	});

	it("currentBranch returns the trimmed branch", async () => {
		mockGitResponse({ stdout: "main" });
		expect(await currentBranch("/repo")).toBe("main");
	});

	it("branchExists is true on exit 0 and false on failure", async () => {
		mockGitResponse({ stdout: "abc123" });
		expect(await branchExists("/repo", "kb/task-1")).toBe(true);
		mockGitResponse({ code: 1, stderr: "fatal: Needed a single revision" });
		expect(await branchExists("/repo", "kb/task-1")).toBe(false);
	});

	it("branchExists returns false for invalid names without spawning", async () => {
		expect(await branchExists("/repo", "--danger")).toBe(false);
		expect(spawnMock).not.toHaveBeenCalled();
	});

	it("countUniqueCommits parses rev-list counts and fails closed", async () => {
		mockGitResponse({ stdout: "3\n" });
		expect(await countUniqueCommits("/repo", "main", "kb/task-1")).toBe(3);
		expect(spawnMock).toHaveBeenCalledWith(
			"git",
			["rev-list", "--count", "main..kb/task-1"],
			expect.objectContaining({ cwd: "/repo" }),
		);

		mockGitResponse({ stdout: "0" });
		expect(await countUniqueCommits("/repo", "main", "kb/task-1")).toBe(0);

		mockGitResponse({ stdout: "not-a-count" });
		await expect(
			countUniqueCommits("/repo", "main", "kb/task-1"),
		).rejects.toBeInstanceOf(GitError);

		await expect(countUniqueCommits("/repo", "main", "--danger")).rejects.toBeInstanceOf(
			Error,
		);
		expect(spawnMock).not.toHaveBeenCalledWith(
			"git",
			expect.arrayContaining([expect.stringContaining("--danger")]),
			expect.anything(),
		);
	});

	it("countBehindCommits parses rev-list counts and fails closed", async () => {
		mockGitResponse({ stdout: "15\n" });
		expect(await countBehindCommits("/repo", "main", "kb/task-1")).toBe(15);
		expect(spawnMock).toHaveBeenCalledWith(
			"git",
			["rev-list", "--count", "kb/task-1..main"],
			expect.objectContaining({ cwd: "/repo" }),
		);

		mockGitResponse({ stdout: "garbage" });
		await expect(
			countBehindCommits("/repo", "main", "kb/task-1"),
		).rejects.toBeInstanceOf(GitError);

		await expect(countBehindCommits("/repo", "--danger", "kb/task-1")).rejects.toBeInstanceOf(
			Error,
		);
	});

	it("hasCommits / isGitRepository / isMergeInProgress map exit codes honestly", async () => {
		mockGitResponse({ stdout: "abc" });
		expect(await hasCommits("/repo")).toBe(true);
		mockGitResponse({ code: 1, stderr: "fatal: bad revision" });
		expect(await hasCommits("/repo")).toBe(false);

		mockGitResponse({ stdout: "" });
		expect(await isGitRepository("/repo")).toBe(true);
		mockGitResponse({ code: 128, stderr: "fatal: not a git repository" });
		expect(await isGitRepository("/repo")).toBe(false);

		mockGitResponse({ stdout: "abc" });
		expect(await isMergeInProgress("/repo")).toBe(true);
		mockGitResponse({ code: 1, stderr: "fatal" });
		expect(await isMergeInProgress("/repo")).toBe(false);
	});

	it("resolveSha trims the SHA and rejects flag refs without spawning", async () => {
		mockGitResponse({ stdout: "abc123\n" });
		expect(await resolveSha("/repo", "HEAD")).toBe("abc123");
		expect(spawnMock).toHaveBeenCalledWith(
			"git",
			["rev-parse", "HEAD"],
			expect.objectContaining({ cwd: "/repo" }),
		);

		await expect(resolveSha("/repo", " --upload-pack=x")).rejects.toBeInstanceOf(
			GitError,
		);
		await expect(resolveSha("/repo", "")).rejects.toBeInstanceOf(GitError);
	});

	it("diffRangeNumstat passes the two-dot range through to git diff", async () => {
		mockGitResponse({ stdout: "3\t1\tfile.js\n" });
		const res = await diffRangeNumstat("/repo", "base-sha", "head-sha");
		expect(res.stdout).toContain("file.js");
		expect(res.code).toBe(0);
		expect(spawnMock).toHaveBeenCalledWith(
			"git",
			["diff", "--numstat", "--no-color", "base-sha..head-sha"],
			expect.objectContaining({ cwd: "/repo" }),
		);
	});
});
