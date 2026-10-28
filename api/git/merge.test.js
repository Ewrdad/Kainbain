import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process.spawn so tests never run real git.
const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({
	spawn: (...args) => spawnMock(...args),
}));

import {
	MERGE_STRATEGY,
	isBranchMergedInto,
	isRegeneratedSnapshotPath,
	abortMerge,
	buildGitConflictDiagnostics,
	mergeBranch,
	partitionMergeConflicts,
	resolveConflictsWithIncoming,
} from "./merge.js";
import { GitError, GitMergeConflictError } from "./errors.js";

/***
 * MARK: git merge unit tests
 * @description Direct tests for the `api/git/merge.js` command family:
 *   ancestry checks, conflict aborts, diagnostics blocks, and the guarded
 *   merge entrypoint. child_process.spawn is mocked — no real git runs.
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

describe("isBranchMergedInto", () => {
	beforeEach(() => {
		spawnMock.mockReset();
	});

	it("reads merge-base ancestry honestly and fails closed", async () => {
		spawnMock.mockImplementation(() => fakeChildFromResponse({ stdout: "" }));
		expect(await isBranchMergedInto("/repo", "main", "kb/task-1")).toBe(true);
		expect(spawnMock).toHaveBeenCalledWith(
			"git",
			["merge-base", "--is-ancestor", "kb/task-1", "main"],
			expect.objectContaining({ cwd: "/repo" }),
		);

		// Exit 1 = not an ancestor (the normal unmerged case).
		spawnMock.mockImplementation(() =>
			fakeChildFromResponse({ code: 1, stderr: "" }),
		);
		expect(await isBranchMergedInto("/repo", "main", "kb/task-1")).toBe(false);

		// Any other git failure (bad repo, bad ref) rethrows, never false.
		spawnMock.mockImplementation(() =>
			fakeChildFromResponse({ code: 128, stderr: "fatal: not a git repository" }),
		);
		await expect(isBranchMergedInto("/repo", "main", "kb/task-1")).rejects.toBeInstanceOf(
			Error,
		);

		await expect(isBranchMergedInto("/repo", "main", "--danger")).rejects.toBeInstanceOf(
			Error,
		);
		expect(spawnMock).not.toHaveBeenCalledWith(
			"git",
			expect.arrayContaining([expect.stringContaining("--danger")]),
			expect.anything(),
		);
	});
});

describe("abortMerge", () => {
	beforeEach(() => {
		spawnMock.mockReset();
	});

	it("is idempotent when no merge is in progress", async () => {
		spawnMock.mockImplementation((cmd, args) => {
			if (args[0] === "merge" && args[1] === "--abort") {
				return fakeChildFromResponse({ code: 1, stderr: "fatal: There is no merge to abort (MERGE_HEAD missing)." });
			}
			// Any other call (rev-parse --verify MERGE_HEAD) says: absent.
			return fakeChildFromResponse({ code: 1, stderr: "fatal: Needed a single revision" });
		});
		await expect(abortMerge("/repo")).resolves.toBeUndefined();
		expect(spawnMock).toHaveBeenCalledTimes(2);
	});

	it("aborts cleanly when a merge is in progress", async () => {
		spawnMock.mockImplementation(() => fakeChildFromResponse({ stdout: "" }));
		await expect(abortMerge("/repo")).resolves.toBeUndefined();
		expect(
			spawnMock.mock.calls.some(([, args]) => args[0] === "merge" && args[1] === "--abort"),
		).toBe(true);
	});
});

describe("buildGitConflictDiagnostics", () => {
	it("builds a machine-actionable block with SHAs, strategy, and files", () => {
		const { block, diagnostics } = buildGitConflictDiagnostics({
			taskBranch: "kb/task-1",
			mainBranch: "main",
			sourceSha: "aaa",
			targetSha: "bbb",
			baseSha: "ccc",
			conflictedFiles: ["file.js", "other.js"],
		});
		expect(diagnostics.taskBranch).toBe("kb/task-1");
		expect(diagnostics.conflictedFiles).toEqual(["file.js", "other.js"]);
		expect(block).toContain("kb/task-1");
		expect(block).toContain("aaa");
		expect(block).toContain("file.js");
		expect(block).toContain(MERGE_STRATEGY);
	});

	it("degrades honestly when SHAs and files are unknown", () => {
		const { block, diagnostics } = buildGitConflictDiagnostics({});
		expect(diagnostics.taskBranch).toBe(null);
		expect(diagnostics.conflictedFiles).toEqual([]);
		expect(block).toContain("unknown");
	});

	it("documents the merge strategy constant", () => {
		expect(MERGE_STRATEGY).toContain("auto-abort");
	});
});

describe("mergeBranch", () => {
	beforeEach(() => {
		spawnMock.mockReset();
	});

	it("resolves on a clean merge", async () => {
		let aborted = false;
		spawnMock.mockImplementation((cmd, args) => {
			if (args[0] === "merge" && args[1] === "--no-edit") {
				return fakeChildFromResponse({ stdout: "Merge made by the 'ort' strategy." });
			}
			if (args[0] === "merge" && args[1] === "--abort") aborted = true;
			return fakeChildFromResponse({ code: 1, stderr: "fatal" }); // MERGE_HEAD check
		});
		const res = await mergeBranch("/repo", "kb/task-1");
		expect(res.stdout).toContain("Merge made");
		expect(aborted).toBe(false);
	});

	it("throws GitMergeConflictError with the canonical message and aborts the merge", async () => {
		const calls = [];
		spawnMock.mockImplementation((cmd, args) => {
			calls.push([...args]);
			const joined = args.join(" ");
			if (joined.startsWith("rev-parse --verify MERGE_HEAD")) {
				// In merge state after conflict.
				return fakeChildFromResponse({ stdout: "abc" });
			}
			if (args[0] === "merge" && args[1] === "--no-edit") {
				return fakeChildFromResponse({
					stdout:
						"Auto-merging file.js\nCONFLICT (content): Merge conflict in file.js\nAutomatic merge failed; fix conflicts and then commit the result.",
					code: 1,
				});
			}
			if (args[0] === "diff") {
				return fakeChildFromResponse({ stdout: "file.js\nother.js" });
			}
			if (args[0] === "merge" && args[1] === "--abort") {
				return fakeChildFromResponse({ stdout: "" });
			}
			return fakeChildFromResponse({ stderr: "" });
		});
		await expect(mergeBranch("/repo", "kb/task-1")).rejects.toMatchObject({
			name: "GitMergeConflictError",
			message: "Merge conflict: please resolve all merge conflicts with main",
			conflictedFiles: ["file.js", "other.js"],
		});
		expect(calls.some((a) => a[0] === "merge" && a[1] === "--abort")).toBe(true);
	});

	it("non-conflict merge failures surface as plain GitError (e.g. unknown branch)", async () => {
		spawnMock.mockImplementation((cmd, args) => {
			const joined = args.join(" ");
			if (joined.startsWith("rev-parse --verify MERGE_HEAD")) {
				return fakeChildFromResponse({ code: 1, stderr: "fatal" }); // not in merge state
			}
			if (args[0] === "merge") {
				return fakeChildFromResponse({ code: 1, stderr: "merge: kb/nope - not something we can merge" });
			}
			return fakeChildFromResponse({ stderr: "" });
		});
		let caught = null;
		try {
			await mergeBranch("/repo", "kb/nope");
		} catch (e) {
			caught = e;
		}
		expect(caught).toBeInstanceOf(GitError);
		expect(caught).not.toBeInstanceOf(GitMergeConflictError);
		expect(caught.message).toContain("not something we can merge");
	});

	it("refuses to start a merge while another is in progress (auto-recovers by aborting first)", async () => {
		const calls = [];
		spawnMock.mockImplementation((cmd, args) => {
			calls.push([...args]);
			const joined = args.join(" ");
			if (joined.startsWith("rev-parse --verify MERGE_HEAD")) {
				// First check: in-progress → triggers abort; re-check → clean.
				return fakeChildFromResponse(calls.length <= 2 ? { stdout: "abc" } : { code: 1, stderr: "fatal" });
			}
			if (args[0] === "merge" && args[1] === "--abort") {
				return fakeChildFromResponse({ stdout: "" });
			}
			if (args[0] === "merge" && args[1] === "--no-edit") {
				return fakeChildFromResponse({ stdout: "Already up to date." });
			}
			return fakeChildFromResponse({ stderr: "" });
		});
		const res = await mergeBranch("/repo", "kb/task-1");
		expect(res.stdout).toContain("Already up to date");
		expect(calls.some((a) => a[0] === "merge" && a[1] === "--abort")).toBe(true);
	});

	it("rejects invalid branch names without spawning", async () => {
		await expect(mergeBranch("/repo", "--force")).rejects.toBeInstanceOf(GitError);
		expect(spawnMock).not.toHaveBeenCalled();
	});
});

describe("isRegeneratedSnapshotPath", () => {
	it("accepts task snapshots and review assets only", () => {
		expect(isRegeneratedSnapshotPath("docs/tasks/abc-123/task.md")).toBe(true);
		expect(
			isRegeneratedSnapshotPath("docs/tasks/abc-123/assets/screenshot-live.png"),
		).toBe(true);
		expect(isRegeneratedSnapshotPath("src/app.js")).toBe(false);
		expect(
			isRegeneratedSnapshotPath("docs/tasks/abc-123/merge-failure-20261028.md"),
		).toBe(false);
		expect(isRegeneratedSnapshotPath("docs/tasks/abc-123/other.md")).toBe(false);
		// Never matches traversal, absolute paths, or option-looking input.
		expect(isRegeneratedSnapshotPath("docs/tasks/../escape/task.md")).toBe(false);
		expect(isRegeneratedSnapshotPath("/docs/tasks/abc/task.md")).toBe(false);
		expect(isRegeneratedSnapshotPath("--theirs")).toBe(false);
		expect(isRegeneratedSnapshotPath("")).toBe(false);
		expect(isRegeneratedSnapshotPath(null)).toBe(false);
		expect(isRegeneratedSnapshotPath(42)).toBe(false);
	});
});

describe("partitionMergeConflicts", () => {
	it("splits snapshots from blocking paths and fails closed on junk", () => {
		expect(
			partitionMergeConflicts([
				"docs/tasks/a/task.md",
				"docs/tasks/b/assets/x.png",
				"src/code.js",
			]),
		).toEqual({
			snapshots: ["docs/tasks/a/task.md", "docs/tasks/b/assets/x.png"],
			blocking: ["src/code.js"],
		});
		expect(partitionMergeConflicts([])).toEqual({ snapshots: [], blocking: [] });
		expect(partitionMergeConflicts(null)).toEqual({ snapshots: [], blocking: [] });
	});
});

describe("resolveConflictsWithIncoming", () => {
	beforeEach(() => {
		spawnMock.mockReset();
	});

	it("checks out snapshot paths with the incoming version", async () => {
		spawnMock.mockImplementation(() => fakeChildFromResponse({ stdout: "" }));
		const resolved = await resolveConflictsWithIncoming("/repo", [
			"docs/tasks/a/task.md",
			"docs/tasks/a/assets/shot.png",
		]);
		expect(resolved).toEqual([
			"docs/tasks/a/task.md",
			"docs/tasks/a/assets/shot.png",
		]);
		expect(spawnMock).toHaveBeenCalledWith(
			"git",
			[
				"checkout",
				"--theirs",
				"--",
				"docs/tasks/a/task.md",
				"docs/tasks/a/assets/shot.png",
			],
			expect.objectContaining({ cwd: "/repo" }),
		);
	});

	it("fails closed on code conflicts, empties, and junk without spawning", async () => {
		await expect(
			resolveConflictsWithIncoming("/repo", [
				"docs/tasks/a/task.md",
				"src/code.js",
			]),
		).rejects.toBeInstanceOf(GitError);
		await expect(resolveConflictsWithIncoming("/repo", [])).rejects.toBeInstanceOf(
			GitError,
		);
		await expect(resolveConflictsWithIncoming("/repo", null)).rejects.toBeInstanceOf(
			GitError,
		);
		expect(spawnMock).not.toHaveBeenCalled();
	});
});
