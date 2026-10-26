import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildTaskReview } from "./reviewAssembly.js";
import { config } from "./config.js";

/***
 * MARK: reviewAssembly sibling tests
 * @description Matrix over buildTaskReview with faithful module-mock seams
 *   for git.js / reviewDiff.js (stub shapes mirror the real return
 *   contracts): empty-state branches, the D2 snapshot rule (checkpoint commit
 *   only when the shared worktree sits on the task branch), the happy-path
 *   diff/commit/count wiring, patch size/binary/failure handling, and the
 *   never-mutates-refs guarantee (no checkout path exists on the seam).
 ***/

const gitState = vi.hoisted(() => ({
	isRepo: true,
	hasCommits: true,
	branchExists: true,
	current: "kb/task-1",
	clean: true,
	committed: false,
	defaultBranch: "main",
	defaultBranchError: false,
}));

const diffState = vi.hoisted(() => ({
	files: [
		{
			path: "src/app.js",
			oldPath: null,
			status: "modified",
			additions: 3,
			deletions: 1,
			binary: false,
		},
	],
	patch: "@@ -1,3 +1,3 @@\n context",
	patchError: false,
	commits: [
		{ sha: "bbb", author: "Agent", date: "2026-09-24", message: "do thing" },
	],
	counts: { behind: 1, ahead: 2 },
	baseSha: "aaa111",
	headSha: "bbb222",
	resolveNull: false,
}));

vi.mock("./git.js", () => ({
	isGitRepository: vi.fn(async () => gitState.isRepo),
	hasCommits: vi.fn(async () => gitState.hasCommits),
	branchExists: vi.fn(async () => gitState.branchExists),
	currentBranch: vi.fn(async () => gitState.current),
	isWorkingTreeClean: vi.fn(async () => gitState.clean),
	commitAllIfNeeded: vi.fn(async () => ({ committed: gitState.committed })),
	defaultBranch: vi.fn(async () => {
		if (gitState.defaultBranchError) throw new Error("no default branch");
		return gitState.defaultBranch;
	}),
}));

vi.mock("./reviewDiff.js", () => ({
	diffFiles: vi.fn(async () => structuredClone(diffState.files)),
	diffFilePatch: vi.fn(async () => {
		if (diffState.patchError) throw new Error("unreadable");
		return diffState.patch;
	}),
	diffCommitList: vi.fn(async () => structuredClone(diffState.commits)),
	revCount: vi.fn(async () => ({ ...diffState.counts })),
	resolveSha: vi.fn(async (_cwd, ref) =>
		diffState.resolveNull
			? null
			: ref === "main"
				? diffState.baseSha
				: diffState.headSha,
	),
}));

import {
	isGitRepository,
	hasCommits,
	branchExists,
	currentBranch,
	isWorkingTreeClean,
	commitAllIfNeeded,
	defaultBranch,
} from "./git.js";
import { diffFiles, diffFilePatch, revCount } from "./reviewDiff.js";

const TASK = { id: "task-1", branch: "kb/task-1", history: [] };

function depsWith({ project = { useBranches: true }, task = TASK } = {}) {
	return {
		projectStore: { getProject: () => project },
		taskStore: {
			getTask: () => (task ? structuredClone(task) : task),
			_recordHistory: vi.fn(),
			updateTask: vi.fn(),
		},
		eventBridge: { broadcastGlobal: vi.fn() },
	};
}

function expectEmptyReview(review, { branchSupported, reason, branch }) {
	expect(review).toEqual({
		task: expect.anything(),
		branch,
		baseBranch: null,
		baseSha: null,
		headSha: null,
		behindBy: 0,
		aheadBy: 0,
		uncommittedChanges: false,
		branchSupported,
		reason,
		commits: [],
		files: [],
		comments: [],
	});
}

beforeEach(() => {
	Object.assign(gitState, {
		isRepo: true,
		hasCommits: true,
		branchExists: true,
		current: "kb/task-1",
		clean: true,
		committed: false,
		defaultBranch: "main",
		defaultBranchError: false,
	});
	Object.assign(diffState, {
		patch: "@@ -1,3 +1,3 @@\n context",
		patchError: false,
		counts: { behind: 1, ahead: 2 },
		resolveNull: false,
	});
	diffState.files = [
		{
			path: "src/app.js",
			oldPath: null,
			status: "modified",
			additions: 3,
			deletions: 1,
			binary: false,
		},
	];
	vi.clearAllMocks();
});

describe("buildTaskReview empty states", () => {
	it("throws 404 when the project or task is missing", async () => {
		const deps = depsWith({ project: null });
		await expect(buildTaskReview(deps, "/cwd", "proj-1", "task-1")).rejects.toMatchObject({
			statusCode: 404,
		});
		const deps2 = depsWith({ task: null });
		await expect(buildTaskReview(deps2, "/cwd", "proj-1", "task-1")).rejects.toMatchObject({
			statusCode: 404,
		});
	});

	it("returns branchSupported:false when branch support is off", async () => {
		const review = await buildTaskReview(
			depsWith({ project: { useBranches: false } }),
			"/cwd",
			"proj-1",
			"task-1",
		);
		expectEmptyReview(review, {
			branchSupported: false,
			reason: "Branch support is disabled for this project",
			branch: "kb/task-1",
		});
		expect(isGitRepository).toHaveBeenCalledWith("/cwd");
	});

	it("returns branchSupported:false when the cwd is not a git repository", async () => {
		gitState.isRepo = false;
		const review = await buildTaskReview(depsWith(), "/cwd", "proj-1", "task-1");
		expectEmptyReview(review, {
			branchSupported: false,
			reason: "This project is not a git repository",
			branch: "kb/task-1",
		});
	});

	it("returns the unborn-repo empty state when there are no commits", async () => {
		gitState.hasCommits = false;
		const review = await buildTaskReview(depsWith(), "/cwd", "proj-1", "task-1");
		expectEmptyReview(review, {
			branchSupported: true,
			reason: "Repository has no commits yet",
			branch: "kb/task-1",
		});
		expect(hasCommits).toHaveBeenCalledWith("/cwd");
	});

	it("returns the missing-branch empty state when the task branch does not exist", async () => {
		gitState.branchExists = false;
		const review = await buildTaskReview(depsWith(), "/cwd", "proj-1", "task-1");
		expectEmptyReview(review, {
			branchSupported: true,
			reason: "The agent has not created any changes on the task branch yet",
			branch: "kb/task-1",
		});
		expect(branchExists).toHaveBeenCalledWith("/cwd", "kb/task-1");
	});

	it("returns the missing-branch empty state when the task has no branch", async () => {
		const review = await buildTaskReview(
			depsWith({ task: { id: "task-1", branch: null, history: [] } }),
			"/cwd",
			"proj-1",
			"task-1",
		);
		expectEmptyReview(review, {
			branchSupported: true,
			reason: "The agent has not created any changes on the task branch yet",
			branch: null,
		});
	});

	it("returns the no-base-branch empty state when defaultBranch throws", async () => {
		gitState.defaultBranchError = true;
		const review = await buildTaskReview(depsWith(), "/cwd", "proj-1", "task-1");
		expectEmptyReview(review, {
			branchSupported: true,
			reason: "No base branch available to diff against yet",
			branch: "kb/task-1",
		});
	});

	it("returns the no-base-branch empty state when the base resolves to the task branch", async () => {
		gitState.defaultBranch = "kb/task-1";
		const review = await buildTaskReview(depsWith(), "/cwd", "proj-1", "task-1");
		expectEmptyReview(review, {
			branchSupported: true,
			reason: "No base branch available to diff against yet",
			branch: "kb/task-1",
		});
		expect(defaultBranch).toHaveBeenCalledWith("/cwd");
	});

	it("returns the unresolvable-refs empty state when SHAs do not resolve", async () => {
		diffState.resolveNull = true;
		const review = await buildTaskReview(depsWith(), "/cwd", "proj-1", "task-1");
		expectEmptyReview(review, {
			branchSupported: true,
			reason: "Could not resolve the review refs",
			branch: "kb/task-1",
		});
	});
});

describe("buildTaskReview D2 snapshot rule", () => {
	it("checkpoint-commits a dirty worktree that sits on the task branch", async () => {
		gitState.clean = false;
		gitState.committed = true;
		const deps = depsWith();
		const review = await buildTaskReview(deps, "/cwd", "proj-1", "task-1");
		expect(currentBranch).toHaveBeenCalledWith("/cwd");
		expect(commitAllIfNeeded).toHaveBeenCalledWith(
			"/cwd",
			"KainBain (task task-1): checkpoint commit before human review",
			{ expectedBranch: "kb/task-1" },
		);
		expect(deps.taskStore._recordHistory).toHaveBeenCalled();
		expect(deps.taskStore.updateTask).toHaveBeenCalledWith(
			"proj-1",
			"task-1",
			{ history: expect.anything() },
			"/cwd",
		);
		expect(deps.eventBridge.broadcastGlobal).toHaveBeenCalledWith(
			"REVIEW_UPDATED",
			{ projectId: "proj-1", taskId: "task-1", type: "snapshot" },
		);
		expect(review.headSha).toBe("bbb222");
	});

	it("skips the snapshot when the worktree is clean on the task branch", async () => {
		const deps = depsWith();
		await buildTaskReview(deps, "/cwd", "proj-1", "task-1");
		expect(commitAllIfNeeded).not.toHaveBeenCalled();
		expect(deps.taskStore._recordHistory).not.toHaveBeenCalled();
		expect(deps.eventBridge.broadcastGlobal).not.toHaveBeenCalled();
	});

	it("degrades to a skipped snapshot when the branch moved mid-review", async () => {
		// A concurrent task moved the shared checkout between the currentBranch
		// read and the commit: the affinity guard rejects, and the review must
		// still build (no snapshot, no broadcast, no thrown 500).
		gitState.clean = false;
		commitAllIfNeeded.mockRejectedValueOnce(
			new Error("Refusing to commit on the wrong branch"),
		);
		const deps = depsWith();
		const review = await buildTaskReview(deps, "/cwd", "proj-1", "task-1");
		expect(review.branch).toBe("kb/task-1");
		expect(deps.taskStore._recordHistory).toHaveBeenCalledWith(
			expect.anything(),
			expect.stringContaining("snapshot commit skipped"),
		);
		expect(deps.eventBridge.broadcastGlobal).not.toHaveBeenCalled();
	});

	it("never commits when another task owns the worktree, but surfaces dirtiness", async () => {
		gitState.current = "kb/other-task";
		gitState.clean = false;
		const deps = depsWith();
		const review = await buildTaskReview(deps, "/cwd", "proj-1", "task-1");
		expect(commitAllIfNeeded).not.toHaveBeenCalled();
		expect(deps.taskStore._recordHistory).not.toHaveBeenCalled();
		expect(review.uncommittedChanges).toBe(true);
		expect(review.branch).toBe("kb/task-1");
		expect(isWorkingTreeClean).toHaveBeenCalledWith("/cwd", {
			ignorePaths: [],
		});
	});
});

describe("buildTaskReview happy path", () => {
	it("wires diff files, patches, commits, and ahead/behind counts", async () => {
		const review = await buildTaskReview(depsWith(), "/cwd", "proj-1", "task-1");
		expect(review.branch).toBe("kb/task-1");
		expect(review.baseBranch).toBe("main");
		expect(review.baseSha).toBe("aaa111");
		expect(review.headSha).toBe("bbb222");
		expect(review.behindBy).toBe(1);
		expect(review.aheadBy).toBe(2);
		expect(review.uncommittedChanges).toBe(false);
		expect(review.branchSupported).toBe(true);
		expect(review.reason).toBeNull();
		expect(review.commits).toEqual(diffState.commits);
		expect(review.files).toHaveLength(1);
		expect(review.files[0]).toMatchObject({
			path: "src/app.js",
			diff: diffState.patch,
			tooLarge: false,
		});
		expect(review.comments).toEqual([]);
		expect(diffFiles).toHaveBeenCalledWith("/cwd", "main", "kb/task-1");
		expect(diffFilePatch).toHaveBeenCalledWith(
			"/cwd",
			"main",
			"kb/task-1",
			"src/app.js",
		);
		expect(revCount).toHaveBeenCalledWith("/cwd", "main", "kb/task-1");
	});

	it("nulls the diff for binary files", async () => {
		diffState.files = [
			{
				path: "assets/logo.png",
				oldPath: null,
				status: "added",
				additions: 0,
				deletions: 0,
				binary: true,
			},
		];
		const review = await buildTaskReview(depsWith(), "/cwd", "proj-1", "task-1");
		expect(review.files[0]).toMatchObject({
			path: "assets/logo.png",
			diff: null,
			tooLarge: false,
		});
		expect(diffFilePatch).not.toHaveBeenCalled();
	});

	it("marks oversized patches tooLarge with a nulled diff", async () => {
		diffState.patch = "x".repeat(config.reviewDiffMaxBytes + 1);
		const review = await buildTaskReview(depsWith(), "/cwd", "proj-1", "task-1");
		expect(review.files[0].tooLarge).toBe(true);
		expect(review.files[0].diff).toBeNull();
	});

	it("survives a single unreadable patch without sinking the review", async () => {
		diffState.patchError = true;
		const review = await buildTaskReview(depsWith(), "/cwd", "proj-1", "task-1");
		expect(review.files[0]).toMatchObject({ diff: null, tooLarge: false });
		expect(review.commits).toEqual(diffState.commits);
	});
});
