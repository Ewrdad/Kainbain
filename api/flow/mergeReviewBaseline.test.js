import { describe, it, expect, vi, beforeEach } from "vitest";

// Never touch real git: baseline capture is verified by the SHAs it stores
// and the policy branch it takes; real-repo behaviour lives in the
// reviewAssembly integration tests.
class MockGitError extends Error {}
class MockGitMergeConflictError extends MockGitError {
	constructor(message, conflictedFiles = []) {
		super(message);
		this.conflictedFiles = conflictedFiles;
	}
}

const gitMocks = vi.hoisted(() => ({
	commitAllIfNeeded: vi.fn(),
	pushBranchIfRemote: vi.fn(),
	checkoutBranch: vi.fn(),
	mergeBranch: vi.fn(),
	squashMergeBranch: vi.fn(async () => ({ committed: true, hash: "c".repeat(40) })),
	abortSquashMerge: vi.fn(async () => undefined),
	deleteBranch: vi.fn(async () => ({ deleted: true })),
	findSquashCommit: vi.fn(async () => null),
	isBranchContentLanded: vi.fn(async () => false),
	isBranchMergedInto: vi.fn(async () => false),
	syncDefaultBranchToRemote: vi.fn(async () => ({ synced: false, skipped: "no-remote" })),
	syncBranchWithUpstream: vi.fn(async () => ({ synced: false, skipped: "no-remote" })),
	currentBranch: vi.fn(),
	defaultBranch: vi.fn(),
	branchExists: vi.fn(),
	countUniqueCommits: vi.fn(),
	hasCommits: vi.fn(),
	isGitRepository: vi.fn(),
	requireCleanWorkingTree: vi.fn(),
	resolveSha: vi.fn(),
	diffRangeNumstat: vi.fn(),
}));

vi.mock("../git.js", async () => {
	// Pure message builders stay real: the conflict diagnostics they render
	// are the contract under test, not git behavior.
	const actual = await vi.importActual("../git.js");
	return {
		GitError: MockGitError,
		GitMergeConflictError: MockGitMergeConflictError,
		buildGitConflictDiagnostics: actual.buildGitConflictDiagnostics,
		MERGE_STRATEGY: actual.MERGE_STRATEGY,
		branchExists: gitMocks.branchExists,
		commitAllIfNeeded: gitMocks.commitAllIfNeeded,
		countUniqueCommits: gitMocks.countUniqueCommits,
		currentBranch: gitMocks.currentBranch,
		defaultBranch: gitMocks.defaultBranch,
		hasCommits: gitMocks.hasCommits,
		isGitRepository: gitMocks.isGitRepository,
		checkoutBranch: gitMocks.checkoutBranch,
		mergeBranch: gitMocks.mergeBranch,
		squashMergeBranch: gitMocks.squashMergeBranch,
		abortSquashMerge: gitMocks.abortSquashMerge,
		deleteBranch: gitMocks.deleteBranch,
		findSquashCommit: gitMocks.findSquashCommit,
		isBranchContentLanded: gitMocks.isBranchContentLanded,
		isBranchMergedInto: gitMocks.isBranchMergedInto,
		syncDefaultBranchToRemote: gitMocks.syncDefaultBranchToRemote,
		buildSquashCommitMessage: actual.buildSquashCommitMessage,
		SQUASH_MERGE_STRATEGY: actual.SQUASH_MERGE_STRATEGY,
		syncBranchWithUpstream: gitMocks.syncBranchWithUpstream,
		pushBranchIfRemote: gitMocks.pushBranchIfRemote,
		requireCleanWorkingTree: gitMocks.requireCleanWorkingTree,
		resolveSha: gitMocks.resolveSha,
		diffRangeNumstat: gitMocks.diffRangeNumstat,
	};
});

const shaMocks = vi.hoisted(() => ({
	resolveSha: vi.fn(),
}));

vi.mock("../reviewDiff.js", () => ({
	resolveSha: shaMocks.resolveSha,
}));

const { runCommandStage, executeMergeStage, recordReviewBaseline } =
	await import("./commandStages.js");

const HEAD_SHA = "b".repeat(40);
const MAIN_SHA = "a".repeat(40);

function stubStore(overrides = {}) {
	const tasks = new Map();
	return {
		eventBridge: null,
		projectStore: { getProject: () => ({ id: "proj-1", useBranches: true }) },
		getTask: vi.fn((pid, tid) => tasks.get(tid)),
		updateTask: vi.fn((pid, tid, updates) => {
			const task = tasks.get(tid);
			Object.assign(task, updates, { updatedAt: new Date().toISOString() });
			return task;
		}),
		saveStageReport: vi.fn(),
		_saveTaskMarkdown: vi.fn(),
		_isBranchModeEnabled: vi.fn(() => true),
		finalizeTaskBranch: vi.fn(async () => ({
			committed: true,
			pushed: false,
			pushSkipped: "no-remote",
			switched: true,
			returnError: null,
		})),
		advanceStage: vi.fn(),
		handleStageFailure: vi.fn(async () => ({ status: "failed" })),
		resolveTaskBranch: vi.fn((task) => task.branch || "kb/task-1"),
		ensureTaskBranch: vi.fn(async () => ({ created: false, switched: true })),
		_tasks: tasks,
		...overrides,
	};
}

function seedTask(store, overrides = {}) {
	const task = {
		id: "task-1",
		projectId: "proj-1",
		branch: "kb/task-1",
		status: "in_stage",
		history: [],
		logEntries: [],
		...overrides,
	};
	store._tasks.set("task-1", task);
	store.getTask.mockImplementation((pid, tid) => store._tasks.get(tid));
	return task;
}

const okRunner = async () => ({ exitCode: 0, stdout: "ok", stderr: "" });

function mergeDefaults() {
	gitMocks.isGitRepository.mockResolvedValue(true);
	gitMocks.hasCommits.mockResolvedValue(true);
	gitMocks.branchExists.mockResolvedValue(true);
	gitMocks.currentBranch.mockResolvedValue("kb/task-1");
	gitMocks.commitAllIfNeeded.mockResolvedValue({ committed: false, hash: null });
	gitMocks.defaultBranch.mockResolvedValue("main");
	gitMocks.checkoutBranch.mockResolvedValue({ switched: true });
	gitMocks.mergeBranch.mockResolvedValue({ merged: true });
	gitMocks.squashMergeBranch.mockResolvedValue({ committed: true, hash: "c".repeat(40) });
	gitMocks.pushBranchIfRemote.mockResolvedValue({ pushed: false, skipped: "no-remote" });
	gitMocks.countUniqueCommits.mockResolvedValue(2);
	gitMocks.resolveSha.mockImplementation(async (cwd, ref) =>
		ref === "kb/task-1" ? HEAD_SHA : MAIN_SHA,
	);
	gitMocks.diffRangeNumstat.mockResolvedValue({ stdout: "", stderr: "", code: 0 });
	shaMocks.resolveSha.mockImplementation(async (cwd, ref) =>
		ref === "kb/task-1" ? HEAD_SHA : MAIN_SHA,
	);
}

describe("recordReviewBaseline", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mergeDefaults();
	});

	it("freezes the merge SHAs on the task", async () => {
		const store = stubStore();
		const task = seedTask(store);
		const baseline = await recordReviewBaseline(store, {
			projectId: "proj-1",
			taskId: "task-1",
			task,
			cwd: "/repo",
			branch: "kb/task-1",
			mainBranch: "main",
			preMergeMainSha: MAIN_SHA,
			stageId: "merge-1",
		});
		expect(baseline).toMatchObject({
			baseSha: MAIN_SHA,
			headSha: HEAD_SHA,
			mainSha: MAIN_SHA,
			stageId: "merge-1",
		});
		expect(task.reviewBaseline).toMatchObject({ baseSha: MAIN_SHA, headSha: HEAD_SHA });
		expect(store.updateTask).toHaveBeenCalledWith(
			"proj-1",
			"task-1",
			{ reviewBaseline: expect.objectContaining({ headSha: HEAD_SHA }) },
			"/repo",
		);
	});

	it("overwrites the baseline on each merge by default (resettable diff)", async () => {
		const store = stubStore();
		const stale = {
			baseSha: "0".repeat(40),
			headSha: "9".repeat(40),
			mainSha: "0".repeat(40),
			mergedAt: "2026-01-01T00:00:00.000Z",
			stageId: "merge-1",
		};
		const task = seedTask(store, { reviewBaseline: stale });
		const baseline = await recordReviewBaseline(store, {
			projectId: "proj-1",
			taskId: "task-1",
			task,
			cwd: "/repo",
			branch: "kb/task-1",
			mainBranch: "main",
			preMergeMainSha: MAIN_SHA,
			stageId: "merge-1",
		});
		expect(baseline.headSha).toBe(HEAD_SHA);
		expect(baseline).not.toMatchObject({ mergedAt: stale.mergedAt });
	});

	it("keeps the first baseline when the project disabled per-merge reset", async () => {
		const store = stubStore({
			projectStore: {
				getProject: () => ({
					id: "proj-1",
					useBranches: true,
					preserveReviewDiffAfterMerge: true,
					resetReviewBaselineOnMerge: false,
				}),
			},
		});
		const first = {
			baseSha: "0".repeat(40),
			headSha: "9".repeat(40),
			mainSha: "0".repeat(40),
			mergedAt: "2026-01-01T00:00:00.000Z",
			stageId: "merge-1",
		};
		const task = seedTask(store, { reviewBaseline: first });
		const baseline = await recordReviewBaseline(store, {
			projectId: "proj-1",
			taskId: "task-1",
			task,
			cwd: "/repo",
			branch: "kb/task-1",
			mainBranch: "main",
			preMergeMainSha: MAIN_SHA,
			stageId: "merge-1",
		});
		expect(baseline).toEqual(first);
		expect(task.reviewBaseline).toEqual(first);
		expect(store.updateTask).not.toHaveBeenCalled();
	});

	it("leaves the task untouched when SHAs are unresolvable (never throws)", async () => {
		shaMocks.resolveSha.mockRejectedValue(new Error("not a repo"));
		const store = stubStore();
		const task = seedTask(store);
		const baseline = await recordReviewBaseline(store, {
			projectId: "proj-1",
			taskId: "task-1",
			task,
			cwd: "/repo",
			branch: "kb/task-1",
			mainBranch: "main",
			preMergeMainSha: null,
			stageId: "merge-1",
		});
		expect(baseline).toBeNull();
		expect(task.reviewBaseline).toBeUndefined();
	});
});

describe("executeMergeStage review baseline hook", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mergeDefaults();
	});

	function mergeSetup() {
		const store = stubStore();
		const task = seedTask(store, { currentStageId: "merge-1" });
		const stage = { id: "merge-1", name: "Merge", type: "merge" };
		return { store, task, stage };
	}

	it("records the baseline on merge success with the pre-merge main SHA", async () => {
		const { store, task, stage } = mergeSetup();
		const result = await executeMergeStage(store, {
			projectId: "proj-1",
			taskId: "task-1",
			stage,
			stages: [stage],
			cwd: "/repo",
			execRunner: okRunner,
		});
		expect(result.status).toBe("passed");
		expect(task.reviewBaseline).toMatchObject({
			baseSha: MAIN_SHA,
			headSha: HEAD_SHA,
			mainSha: MAIN_SHA,
			stageId: "merge-1",
		});
	});

	it("records no baseline when the merge fails", async () => {
		const conflict = new MockGitMergeConflictError("Merge conflict", ["a.txt"]);
		gitMocks.squashMergeBranch.mockRejectedValue(conflict);
		const { store, task, stage } = mergeSetup();
		await executeMergeStage(store, {
			projectId: "proj-1",
			taskId: "task-1",
			stage,
			stages: [stage],
			cwd: "/repo",
			execRunner: okRunner,
		});
		expect(store.handleStageFailure).toHaveBeenCalledTimes(1);
		expect(task.reviewBaseline).toBeUndefined();
	});

	it("still passes the merge when baseline capture itself fails", async () => {
		shaMocks.resolveSha.mockRejectedValue(new Error("git down"));
		const { store, task, stage } = mergeSetup();
		const result = await executeMergeStage(store, {
			projectId: "proj-1",
			taskId: "task-1",
			stage,
			stages: [stage],
			cwd: "/repo",
			execRunner: okRunner,
		});
		expect(result.status).toBe("passed");
		expect(task.reviewBaseline).toBeUndefined();
	});
});

// Deploy stages stay ref-neutral: the merge hook is the single capture
// point, so a deploy-only run must record nothing.
describe("deploy ref-neutrality (baseline capture point)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mergeDefaults();
	});

	it("records no baseline for deploy stages", async () => {
		const store = stubStore();
		const task = seedTask(store);
		const result = await runCommandStage(
			store,
			"proj-1",
			"task-1",
			{ id: "deploy-1", name: "Deploy", type: "deploy" },
			{
				stages: [],
				cwd: "/repo",
				kind: "deploy",
				label: "Deploy",
				logTag: "DEPLOY/CMD",
				reportTitle: "Deploy Stage Report",
				statusValue: "running_deploy",
				defaultCommand: "./deploy.sh --prod",
				execRunner: okRunner,
			},
		);
		expect(result.status).toBe("passed");
		expect(task.reviewBaseline).toBeUndefined();
		expect(shaMocks.resolveSha).not.toHaveBeenCalled();
	});
});
