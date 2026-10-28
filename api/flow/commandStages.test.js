import { describe, it, expect, vi, beforeEach } from "vitest";

// Never touch real git: the stage layer is verified by the order and choice
// of git calls it makes, while real-repo behaviour lives in the git and
// lifecycle integration tests.
class MockGitError extends Error {}
class MockGitMergeConflictError extends MockGitError {
	constructor(message, conflictedFiles = []) {
		super(message);
		this.conflictedFiles = conflictedFiles;
	}
}

const gitMocks = vi.hoisted(() => ({
	abortMerge: vi.fn(),
	commitAllIfNeeded: vi.fn(),
	pushBranchIfRemote: vi.fn(),
	checkoutBranch: vi.fn(),
	mergeBranch: vi.fn(),
	resolveConflictsWithIncoming: vi.fn(),
	syncBranchWithUpstream: vi.fn(),
	currentBranch: vi.fn(),
	defaultBranch: vi.fn(),
	branchExists: vi.fn(),
	countBehindCommits: vi.fn(),
	countUniqueCommits: vi.fn(),
	isBranchMergedInto: vi.fn(),
	hasCommits: vi.fn(),
	isGitRepository: vi.fn(),
	requireCleanWorkingTree: vi.fn(),
	resolveSha: vi.fn(),
	diffRangeNumstat: vi.fn(),
	// Default mimics the real helper's no-checkout path: run the callback
	// unchanged. Per-test overrides switch/restore/simulate failures.
	withCheckedOutBranch: vi.fn(async (_cwd, _branch, fn) => fn()),
}));

const shaMocks = vi.hoisted(() => ({
	resolveSha: vi.fn(async () => null),
}));

// The task-worktree resolver is dynamically imported inside
// resolveTaskExecutionCwd; mock it so worktree-mode tests never touch disk
// provisioning (the resolved path itself must exist, so tests point it at a
// real temp dir).
const workspaceMocks = vi.hoisted(() => ({
	resolveTaskCwd: vi.fn(),
}));

vi.mock("../work/taskWorkspace.js", () => ({
	resolveTaskCwd: workspaceMocks.resolveTaskCwd,
}));

vi.mock("../reviewDiff.js", () => ({
	resolveSha: shaMocks.resolveSha,
}));

vi.mock("../git.js", async () => {
	// Pure message builders stay real: the conflict/ghost diagnostics they
	// render are the contract under test, not git behavior.
	const actual = await vi.importActual("../git.js");
	return {
		GitError: MockGitError,
		GitMergeConflictError: MockGitMergeConflictError,
		abortMerge: gitMocks.abortMerge,
		buildGitConflictDiagnostics: actual.buildGitConflictDiagnostics,
		MERGE_STRATEGY: actual.MERGE_STRATEGY,
		partitionMergeConflicts: actual.partitionMergeConflicts,
		resolveConflictsWithIncoming: gitMocks.resolveConflictsWithIncoming,
		syncBranchWithUpstream: gitMocks.syncBranchWithUpstream,
		branchExists: gitMocks.branchExists,
		commitAllIfNeeded: gitMocks.commitAllIfNeeded,
		countBehindCommits: gitMocks.countBehindCommits,
		countUniqueCommits: gitMocks.countUniqueCommits,
		isBranchMergedInto: gitMocks.isBranchMergedInto,
		currentBranch: gitMocks.currentBranch,
		defaultBranch: gitMocks.defaultBranch,
		hasCommits: gitMocks.hasCommits,
		isGitRepository: gitMocks.isGitRepository,
		isValidBranchName: actual.isValidBranchName,
		checkoutBranch: gitMocks.checkoutBranch,
		mergeBranch: gitMocks.mergeBranch,
		pushBranchIfRemote: gitMocks.pushBranchIfRemote,
		requireCleanWorkingTree: gitMocks.requireCleanWorkingTree,
		withCheckedOutBranch: gitMocks.withCheckedOutBranch,
		resolveSha: gitMocks.resolveSha,
		diffRangeNumstat: gitMocks.diffRangeNumstat,
	};
});

const {
	runCommandStage,
	executeMergeStage,
	isMergeLanded,
	resolveMergeLandedEvidence,
	buildGhostTaskDiagnostic,
	lastWorkStageOutcome,
	resolveCiBranchPlan,
	resolveCommandExecutionCwd,
} = await import("./commandStages.js");

function stubStore(overrides = {}) {
	return {
		eventBridge: null,
		getTask: vi.fn(),
		updateTask: vi.fn(),
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
		...overrides,
	};
}

function ciTask() {
	return {
		id: "task-1",
		projectId: "proj-1",
		branch: "kb/task-1",
		status: "in_stage",
		history: [],
		logEntries: [],
	};
}

/** Text view over the task's structured entries (the only log storage). */
const logText = (task) => (task.logEntries || []).map((e) => e.text).join("\n");

const okRunner = async () => ({ exitCode: 0, stdout: "ok", stderr: "" });

function baseStage(overrides = {}) {
	return { id: "ci-1", name: "CI", type: "ci", ...overrides };
}

describe("runCommandStage branch lifecycle", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		gitMocks._isBranchModeDefault = true;
	});

	it("finalises the task branch after a passing CI stage in branch mode", async () => {
		const store = stubStore();
		const task = ciTask();
		store.getTask.mockReturnValue(task);

		const result = await runCommandStage(store, "proj-1", "task-1", baseStage(), {
			stages: [baseStage()],
			cwd: "/repo",
			kind: "ci",
			label: "CI",
			logTag: "CI/CMD",
			reportTitle: "CI Stage Report",
			statusValue: "running_ci",
			defaultCommand: "echo hi",
			execRunner: okRunner,
		});

		expect(result.status).toBe("passed");
		expect(store.finalizeTaskBranch).toHaveBeenCalledTimes(1);
		expect(store.finalizeTaskBranch).toHaveBeenCalledWith(
			task,
			"/repo",
			expect.objectContaining({ stageName: "CI" }),
		);
		expect(store.advanceStage).toHaveBeenCalledTimes(1);
		expect(store.handleStageFailure).not.toHaveBeenCalled();
	});

	it("skips finalisation for CI stages when branch mode is off", async () => {
		const store = stubStore({ _isBranchModeEnabled: vi.fn(() => false) });
		const task = ciTask();
		store.getTask.mockReturnValue(task);

		const result = await runCommandStage(store, "proj-1", "task-1", baseStage(), {
			stages: [baseStage()],
			cwd: "/repo",
			kind: "ci",
			label: "CI",
			logTag: "CI/CMD",
			reportTitle: "CI Stage Report",
			statusValue: "running_ci",
			defaultCommand: "echo hi",
			execRunner: okRunner,
		});

		expect(result.status).toBe("passed");
		expect(store.finalizeTaskBranch).not.toHaveBeenCalled();
		expect(store.advanceStage).toHaveBeenCalledTimes(1);
	});

	it("finalises the task branch after a passing deploy-command CI stage (ordinary CI)", async () => {
		// A ci stage whose command runs the deploy script is an ordinary ci
		// stage: it gets the same branch lifecycle as any other ci stage.
		const store = stubStore();
		const task = ciTask();
		store.getTask.mockReturnValue(task);

		const result = await runCommandStage(
			store,
			"proj-1",
			"task-1",
			baseStage({ id: "deploy-1", name: "Deploy", type: "ci", command: "./deploy.sh --prod" }),
			{
				stages: [baseStage()],
				cwd: "/repo",
				kind: "ci",
				label: "CI",
				logTag: "CI/CMD",
				reportTitle: "CI Stage Report",
				statusValue: "running_ci",
				defaultCommand: "./deploy.sh --prod",
				execRunner: okRunner,
			},
		);

		expect(result.status).toBe("passed");
		expect(store.finalizeTaskBranch).toHaveBeenCalledTimes(1);
		expect(store.advanceStage).toHaveBeenCalledTimes(1);
		expect(store.handleStageFailure).not.toHaveBeenCalled();
	});

	it("never stamps deploy attempt markers on a passing deploy-command CI stage", async () => {
		// A deploy-command ci stage is an ordinary ci stage: the generic
		// runner must not write deployAttemptId / deployBuildAtEntry /
		// deployOperationKey onto the task. Those markers belong to the
		// implementation-specific continuity plugin only.
		const store = stubStore();
		const task = ciTask();
		store.getTask.mockReturnValue(task);

		const result = await runCommandStage(
			store,
			"proj-1",
			"task-1",
			baseStage({ id: "deploy-1", name: "Deploy", type: "ci", command: "./deploy.sh --prod" }),
			{
				stages: [baseStage()],
				cwd: "/repo",
				kind: "ci",
				label: "CI",
				logTag: "CI/CMD",
				reportTitle: "CI Stage Report",
				statusValue: "running_ci",
				defaultCommand: "./deploy.sh --prod",
				execRunner: okRunner,
			},
		);

		expect(result.status).toBe("passed");
		for (const call of store.updateTask.mock.calls) {
			expect(call[2]).not.toHaveProperty("deployAttemptId");
			expect(call[2]).not.toHaveProperty("deployBuildAtEntry");
			expect(call[2]).not.toHaveProperty("deployOperationKey");
			expect(call[2]).not.toHaveProperty("deployAttemptInFlightNoted");
		}
	});

	it("fails loudly when the return to default is blocked after CI success", async () => {
		const store = stubStore({
			finalizeTaskBranch: vi.fn(async () => ({
				committed: false,
				commitError: "hook failed",
				pushed: false,
				returnError: "GitDirtyTreeError: refusing",
			})),
		});
		const task = ciTask();
		store.getTask.mockReturnValue(task);

		await runCommandStage(store, "proj-1", "task-1", baseStage(), {
			stages: [baseStage()],
			cwd: "/repo",
			kind: "ci",
			label: "CI",
			logTag: "CI/CMD",
			reportTitle: "CI Stage Report",
			statusValue: "running_ci",
			defaultCommand: "echo hi",
			execRunner: okRunner,
		});

		expect(store.handleStageFailure).toHaveBeenCalledTimes(1);
		expect(store.advanceStage).not.toHaveBeenCalled();
	});
});

describe("executeMergeStage publishing", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		gitMocks.isGitRepository.mockResolvedValue(true);
		gitMocks.hasCommits.mockResolvedValue(true);
		gitMocks.branchExists.mockResolvedValue(true);
		gitMocks.currentBranch.mockResolvedValue("kb/task-1");
		gitMocks.commitAllIfNeeded.mockResolvedValue({ committed: false, hash: null });
		gitMocks.defaultBranch.mockResolvedValue("main");
		gitMocks.checkoutBranch.mockResolvedValue({ switched: true });
		gitMocks.mergeBranch.mockResolvedValue({ merged: true });
		gitMocks.pushBranchIfRemote.mockResolvedValue({ pushed: true, skipped: null });
		gitMocks.countUniqueCommits.mockResolvedValue(2);
		gitMocks.countBehindCommits.mockResolvedValue(0);
		gitMocks.isBranchMergedInto.mockResolvedValue(false);
		gitMocks.resolveSha.mockResolvedValue("a".repeat(40));
		gitMocks.diffRangeNumstat.mockResolvedValue({ stdout: "", stderr: "", code: 0 });
		gitMocks.abortMerge.mockResolvedValue(undefined);
		gitMocks.resolveConflictsWithIncoming.mockResolvedValue(["docs/tasks/task-1/task.md"]);
		gitMocks.syncBranchWithUpstream.mockResolvedValue({ synced: false, skipped: "no-remote" });
	});

	function mergeSetup() {
		const store = stubStore();
		const task = { ...ciTask(), currentStageId: "merge-1" };
		store.getTask.mockReturnValue(task);
		const stage = { id: "merge-1", name: "Merge", type: "merge" };
		return { store, task, stage };
	}

	it("leaves pure-git merges marker-free (no phantom deploy attempt)", async () => {
		const { store, stage } = mergeSetup();

		await executeMergeStage(store, {
			projectId: "proj-1",
			taskId: "task-1",
			stage,
			stages: [stage],
			cwd: "/repo",
			execRunner: okRunner,
		});

		for (const call of store.updateTask.mock.calls) {
			expect(call[2]).not.toHaveProperty("deployAttemptId");
			expect(call[2]).not.toHaveProperty("deployBuildAtEntry");
		}
	});

	it("pushes the default branch after a successful merge", async () => {
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
		expect(gitMocks.mergeBranch).toHaveBeenCalledWith("/repo", "kb/task-1");
		expect(gitMocks.pushBranchIfRemote).toHaveBeenCalledWith("/repo", "main");
		expect(store.handleStageFailure).not.toHaveBeenCalled();
		expect(logText(task)).toContain("Pushed 'main' to remote after merge");
		// The merge stage never finalises the task branch itself.
		expect(store.finalizeTaskBranch).not.toHaveBeenCalled();
	});

	it("never stamps deploy markers, even when the stage carries a deploy command", async () => {
		const { store, task } = mergeSetup();
		// A composite "Merge and deploy" stage before migration: the command
		// is ignored — deploy work belongs to the dedicated CI stage after
		// the merge (normalizeStages migrates the config to that shape).
		const stage = {
			id: "merge-1",
			name: "Merge",
			type: "merge",
			command: "./deploy.sh --prod",
		};
		task.currentStageId = "merge-1";

		const result = await executeMergeStage(store, {
			projectId: "proj-1",
			taskId: "task-1",
			stage,
			stages: [stage],
			cwd: "/repo",
			execRunner: okRunner,
		});

		expect(result.status).toBe("passed");
		for (const call of store.updateTask.mock.calls) {
			expect(call[2]).not.toHaveProperty("deployAttemptId");
			expect(call[2]).not.toHaveProperty("deployBuildAtEntry");
			expect(call[2]).not.toHaveProperty("deployOperationKey");
		}
	});

	it("guards the pre-merge switch strictly (recovery 'off')", async () => {
		// Off the task branch (on main) forces the pre-merge clean-tree guard
		// to run. It must be STRICT: the ladder only runs on work-stage pickup,
		// and stashing here could silently drop an operator's review edits from
		// the merge. Same for the main-branch checkout below it.
		gitMocks.currentBranch.mockResolvedValue("main");
		gitMocks.requireCleanWorkingTree.mockResolvedValue({
			clean: true,
			recoveryAttempts: [],
			stashRef: null,
		});
		const { store, stage } = mergeSetup();

		const result = await executeMergeStage(store, {
			projectId: "proj-1",
			taskId: "task-1",
			stage,
			stages: [stage],
			cwd: "/repo",
			execRunner: okRunner,
		});

		expect(result.status).toBe("passed");
		expect(gitMocks.requireCleanWorkingTree).toHaveBeenCalledTimes(1);
		expect(gitMocks.requireCleanWorkingTree.mock.calls[0][1]).toMatchObject({
			recovery: "off",
		});
		expect(gitMocks.checkoutBranch).toHaveBeenCalledWith("/repo", "main", {
			recovery: "off",
		});
	});

	it("still passes when the post-merge push is skipped (no remote)", async () => {
		gitMocks.pushBranchIfRemote.mockResolvedValue({
			pushed: false,
			skipped: "no-remote",
		});
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
		expect(logText(task)).toContain("skipped push of 'main' after merge");
	});

	it("still passes when the post-merge push fails (warning only)", async () => {
		gitMocks.pushBranchIfRemote.mockRejectedValue(new Error("auth failed"));
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
		expect(store.handleStageFailure).not.toHaveBeenCalled();
		expect(logText(task)).toContain("merge still passes");
	});

	it("refuses to merge a task branch with no work of its own", async () => {
		gitMocks.countUniqueCommits.mockResolvedValue(0);
		const { store, stage } = mergeSetup();

		await executeMergeStage(store, {
			projectId: "proj-1",
			taskId: "task-1",
			stage,
			stages: [stage],
			cwd: "/repo",
			execRunner: okRunner,
		});

		expect(store.handleStageFailure).toHaveBeenCalledTimes(1);
		const failure = store.handleStageFailure.mock.calls[0][3];
		expect(String(failure?.message || failure)).toContain("no commits of its own");
		expect(gitMocks.mergeBranch).not.toHaveBeenCalled();
		expect(gitMocks.pushBranchIfRemote).not.toHaveBeenCalled();
	});

	it("warns (warning-only) when the task branch is far behind main (C6)", async () => {
		gitMocks.countBehindCommits.mockResolvedValue(15);
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
		expect(task.history.some((entry) => String(entry.action).includes("Stale base warning"))).toBe(true);
		expect(task.history.some((entry) => String(entry.action).includes("15 commits behind"))).toBe(true);
		expect(logText(task)).toContain("15 commits behind");
	});

	it("stays silent on a fresh base and never fails a merge for staleness (C6)", async () => {
		gitMocks.countBehindCommits.mockResolvedValue(2);
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
		expect(task.history.some((entry) => String(entry.action).includes("Stale base warning"))).toBe(false);
	});

	it("keeps merge-conflict semantics: abort path fails back, main notes published", async () => {
		const conflict = new MockGitMergeConflictError("Merge conflict", ["a.txt"]);
		gitMocks.mergeBranch.mockRejectedValue(conflict);
		const { store, stage } = mergeSetup();

		await executeMergeStage(store, {
			projectId: "proj-1",
			taskId: "task-1",
			stage,
			stages: [stage],
			cwd: "/repo",
			execRunner: okRunner,
		});

		expect(store.handleStageFailure).toHaveBeenCalledTimes(1);
		const failure = store.handleStageFailure.mock.calls[0][3];
		expect(failure.conflictedFiles).toEqual(["a.txt"]);
		expect(failure.taskBranch).toBe("kb/task-1");
		expect(failure.mainBranch).toBe("main");
		// The conflict still fails back with no merge — but stage file ops
		// end pushed: only main-side bookkeeping is published, never the
		// unmerged task branch.
		for (const call of gitMocks.pushBranchIfRemote.mock.calls) {
			expect(call[1]).toBe("main");
		}
		expect(gitMocks.pushBranchIfRemote.mock.calls.length).toBeGreaterThan(0);
	});

	it("routes ghost tasks to failback with a structured diagnostic and no merge attempt", async () => {
		gitMocks.countUniqueCommits.mockResolvedValue(0);
		const { store, task, stage } = mergeSetup();
		task.history.push({
			timestamp: new Date().toISOString(),
			action: "Agent stage completed: Plan",
		});

		await executeMergeStage(store, {
			projectId: "proj-1",
			taskId: "task-1",
			stage,
			stages: [stage],
			cwd: "/repo",
			execRunner: okRunner,
		});

		expect(store.handleStageFailure).toHaveBeenCalledTimes(1);
		const failure = store.handleStageFailure.mock.calls[0][3];
		// Fast path: neither the default-branch checkout nor the doomed
		// merge is ever attempted.
		expect(gitMocks.checkoutBranch).not.toHaveBeenCalled();
		expect(gitMocks.mergeBranch).not.toHaveBeenCalled();
		expect(gitMocks.pushBranchIfRemote).not.toHaveBeenCalled();
		expect(String(failure?.message || failure)).toContain("no commits of its own");
		expect(String(failure?.message || failure)).toContain("kb/task-1");
		expect(String(failure?.message || failure)).toContain("Agent stage completed: Plan");
		expect(failure.gitDiagnostics).toMatchObject({
			kind: "ghost-task",
			branch: "kb/task-1",
			mainBranch: "main",
			uniqueCommits: 0,
		});
	});

	it("attaches structured conflict diagnostics (SHAs, strategy, files) for Tier 3", async () => {
		const conflict = new MockGitMergeConflictError("Merge conflict", ["a.txt"]);
		conflict.sourceSha = "s".repeat(40);
		conflict.targetSha = "t".repeat(40);
		conflict.baseSha = "b".repeat(40);
		conflict.strategy = "merge --no-edit (auto-abort on conflict)";
		gitMocks.mergeBranch.mockRejectedValue(conflict);
		const { store, stage } = mergeSetup();

		await executeMergeStage(store, {
			projectId: "proj-1",
			taskId: "task-1",
			stage,
			stages: [stage],
			cwd: "/repo",
			execRunner: okRunner,
		});

		expect(store.handleStageFailure).toHaveBeenCalledTimes(1);
		const failure = store.handleStageFailure.mock.calls[0][3];
		expect(failure.sourceSha).toBe("s".repeat(40));
		expect(failure.targetSha).toBe("t".repeat(40));
		expect(failure.baseSha).toBe("b".repeat(40));
		expect(failure.strategy).toContain("merge --no-edit");
		expect(String(failure.message)).toContain("s".repeat(40));
		expect(String(failure.message)).toContain("Git conflict diagnostics:");
		expect(failure.gitDiagnostics).toMatchObject({
			kind: "merge-conflict",
			taskBranch: "kb/task-1",
			mainBranch: "main",
			sourceSha: "s".repeat(40),
			conflictedFiles: ["a.txt"],
		});
	});

	it("heals snapshot-only conflicts with task-branch versions and passes", async () => {
		const conflict = new MockGitMergeConflictError("Merge conflict", [
			"docs/tasks/task-1/task.md",
		]);
		// First (auto-aborting) merge fails; the heal retry keeps the
		// conflicted state instead of aborting.
		gitMocks.mergeBranch
			.mockRejectedValueOnce(conflict)
			.mockRejectedValueOnce(
				new MockGitMergeConflictError("Merge conflict", ["docs/tasks/task-1/task.md"]),
			);
		// Only the heal-finalize commit reports work; earlier stage
		// bookkeeping commits stay empty as in the default fixture.
		gitMocks.commitAllIfNeeded.mockImplementation(async (_cwd, message) =>
			String(message).includes("auto-resolve regenerated snapshot conflicts")
				? { committed: true, hash: "heal123" }
				: { committed: false, hash: null },
		);
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
		expect(store.handleStageFailure).not.toHaveBeenCalled();
		// Retry ran without the auto-abort so resolution was possible.
		expect(gitMocks.mergeBranch).toHaveBeenCalledWith("/repo", "kb/task-1", {
			abortOnConflict: false,
		});
		expect(gitMocks.resolveConflictsWithIncoming).toHaveBeenCalledWith("/repo", [
			"docs/tasks/task-1/task.md",
		]);
		expect(task.history.some((entry) =>
			String(entry.action).includes("auto-resolved regenerated snapshot conflicts"),
		)).toBe(true);
		expect(logText(task)).toContain("Auto-resolved snapshot-only conflicts");
	});

	it("fails loudly when a code file joins the snapshot conflicts", async () => {
		const conflict = new MockGitMergeConflictError("Merge conflict", [
			"docs/tasks/task-1/task.md",
			"src/real-code.js",
		]);
		gitMocks.mergeBranch.mockRejectedValue(conflict);
		const { store, stage } = mergeSetup();

		await executeMergeStage(store, {
			projectId: "proj-1",
			taskId: "task-1",
			stage,
			stages: [stage],
			cwd: "/repo",
			execRunner: okRunner,
		});

		expect(store.handleStageFailure).toHaveBeenCalledTimes(1);
		// No heal retry, no resolution, no finalize commit for the merge.
		expect(gitMocks.mergeBranch).toHaveBeenCalledTimes(1);
		expect(gitMocks.resolveConflictsWithIncoming).not.toHaveBeenCalled();
		expect(gitMocks.abortMerge).not.toHaveBeenCalled();
		const failure = store.handleStageFailure.mock.calls[0][3];
		expect(failure.conflictedFiles).toEqual([
			"docs/tasks/task-1/task.md",
			"src/real-code.js",
		]);
	});

	it("converges the task branch with upstream at merge entry", async () => {
		const { store, stage } = mergeSetup();

		await executeMergeStage(store, {
			projectId: "proj-1",
			taskId: "task-1",
			stage,
			stages: [stage],
			cwd: "/repo",
			execRunner: okRunner,
		});

		expect(gitMocks.syncBranchWithUpstream).toHaveBeenCalledWith(
			"/repo",
			"kb/task-1",
		);
	});

	it("publishes main bookkeeping before the merge attempt", async () => {
		const { store, stage } = mergeSetup();

		const result = await executeMergeStage(store, {
			projectId: "proj-1",
			taskId: "task-1",
			stage,
			stages: [stage],
			cwd: "/repo",
			execRunner: okRunner,
		});

		expect(result.status).toBe("passed");
		// Pre-merge bookkeeping push runs before the merge; the post-merge
		// publish runs after — main is pushed on both sides of the attempt.
		const mainPushes = gitMocks.pushBranchIfRemote.mock.calls.filter(
			(call) => call[1] === "main",
		);
		expect(mainPushes.length).toBeGreaterThanOrEqual(2);
		expect(gitMocks.mergeBranch.mock.invocationCallOrder[0]).toBeGreaterThan(
			gitMocks.pushBranchIfRemote.mock.invocationCallOrder[0],
		);
	});

	it("commits and publishes merge-attempt notes on main after a genuine conflict", async () => {
		const conflict = new MockGitMergeConflictError("Merge conflict", ["src/real-code.js"]);
		gitMocks.mergeBranch.mockRejectedValue(conflict);
		const { store, stage } = mergeSetup();

		await executeMergeStage(store, {
			projectId: "proj-1",
			taskId: "task-1",
			stage,
			stages: [stage],
			cwd: "/repo",
			execRunner: okRunner,
		});

		expect(store.handleStageFailure).toHaveBeenCalledTimes(1);
		expect(
			gitMocks.commitAllIfNeeded.mock.calls.some((call) =>
				String(call[1]).includes("after conflict"),
			),
		).toBe(true);
		expect(gitMocks.pushBranchIfRemote).toHaveBeenCalledWith("/repo", "main");
	});
});

describe("ghost-task diagnostics", () => {
	it("names the empty branch, main, landed evidence, and last work outcome", () => {
		const { message, diagnostics } = buildGhostTaskDiagnostic({
			branch: "kb/task-9",
			mainBranch: "main",
			task: {
				history: [
					{ action: "Running merge stage: integrating 'kb/task-9' into the main branch" },
					{ action: "Agent stage completed: Plan" },
				],
			},
		});
		expect(message).toContain("kb/task-9");
		expect(message).toContain("main");
		expect(message).toContain("Agent stage completed: Plan");
		expect(diagnostics).toMatchObject({
			kind: "ghost-task",
			branch: "kb/task-9",
			uniqueCommits: 0,
		});
	});

	it("degrades to a plain note when history is empty", () => {
		expect(lastWorkStageOutcome({ history: [] })).toContain("no recorded");
		expect(lastWorkStageOutcome(null)).toContain("no recorded");
	});
});

describe("isMergeLanded", () => {
	it("is true when a baseline with mergedAt exists for the merge stage", () => {
		const task = {
			reviewBaseline: {
				baseSha: "a".repeat(40),
				headSha: "b".repeat(40),
				mainSha: "a".repeat(40),
				mergedAt: new Date().toISOString(),
				stageId: "merge-1",
			},
		};
		expect(isMergeLanded(task, { stageId: "merge-1" })).toBe(true);
	});

	it("is false without a baseline", () => {
		expect(isMergeLanded({ history: [] }, { stageId: "merge-1" })).toBe(false);
		expect(isMergeLanded({}, {})).toBe(false);
	});

	it("is false when mergedAt is missing", () => {
		const task = {
			reviewBaseline: {
				baseSha: "a".repeat(40),
				headSha: "b".repeat(40),
				stageId: "merge-1",
			},
		};
		expect(isMergeLanded(task, { stageId: "merge-1" })).toBe(false);
	});

	it("is false for a stale baseline from another stage", () => {
		const task = {
			reviewBaseline: {
				baseSha: "a".repeat(40),
				headSha: "b".repeat(40),
				mergedAt: new Date().toISOString(),
				stageId: "merge-0",
			},
		};
		expect(isMergeLanded(task, { stageId: "merge-1" })).toBe(false);
	});
});

describe("executeMergeStage landed-merge handling", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		gitMocks.isGitRepository.mockResolvedValue(true);
		gitMocks.hasCommits.mockResolvedValue(true);
		gitMocks.branchExists.mockResolvedValue(true);
		gitMocks.currentBranch.mockResolvedValue("kb/task-1");
		gitMocks.commitAllIfNeeded.mockResolvedValue({ committed: false, hash: null });
		gitMocks.defaultBranch.mockResolvedValue("main");
		gitMocks.checkoutBranch.mockResolvedValue({ switched: true });
		gitMocks.mergeBranch.mockResolvedValue({ merged: true });
		gitMocks.pushBranchIfRemote.mockResolvedValue({ pushed: true, skipped: null });
		gitMocks.countUniqueCommits.mockResolvedValue(2);
		gitMocks.countBehindCommits.mockResolvedValue(0);
		gitMocks.isBranchMergedInto.mockResolvedValue(false);
		gitMocks.resolveSha.mockResolvedValue("a".repeat(40));
		gitMocks.diffRangeNumstat.mockResolvedValue({ stdout: "", stderr: "", code: 0 });
		gitMocks.abortMerge.mockResolvedValue(undefined);
		gitMocks.resolveConflictsWithIncoming.mockResolvedValue(["docs/tasks/task-1/task.md"]);
		gitMocks.syncBranchWithUpstream.mockResolvedValue({ synced: false, skipped: "no-remote" });
	});

	const failRunner = async () => ({ exitCode: 1, stdout: "", stderr: "boom" });

	function landedTask() {
		return {
			...ciTask(),
			currentStageId: "merge-1",
			reviewBaseline: {
				baseSha: "a".repeat(40),
				headSha: "b".repeat(40),
				mainSha: "a".repeat(40),
				mergedAt: new Date().toISOString(),
				stageId: "merge-1",
			},
		};
	}

	function landedSetup() {
		const store = stubStore();
		const task = landedTask();
		store.getTask.mockReturnValue(task);
		const stage = { id: "merge-1", name: "Merge", type: "merge" };
		return { store, task, stage };
	}

	it("skips the duplicate git merge and passes on retry after a landed merge", async () => {
		gitMocks.countUniqueCommits.mockResolvedValue(0);
		const { store, task, stage } = landedSetup();

		const result = await executeMergeStage(store, {
			projectId: "proj-1",
			taskId: "task-1",
			stage,
			stages: [stage],
			cwd: "/repo",
			execRunner: okRunner,
		});

		expect(result.status).toBe("passed");
		expect(gitMocks.mergeBranch).not.toHaveBeenCalled();
		expect(gitMocks.checkoutBranch).toHaveBeenCalledWith("/repo", "main", {
			recovery: "off",
		});
		expect(gitMocks.pushBranchIfRemote).toHaveBeenCalledWith("/repo", "main");
		expect(store.handleStageFailure).not.toHaveBeenCalled();
		expect(store.advanceStage).toHaveBeenCalledTimes(1);
		expect(logText(task)).toContain("already landed");
	});

	it("re-merges normally when new work exists after a previous landed merge", async () => {
		gitMocks.countUniqueCommits.mockResolvedValue(2);
		const { store, stage } = landedSetup();

		const result = await executeMergeStage(store, {
			projectId: "proj-1",
			taskId: "task-1",
			stage,
			stages: [stage],
			cwd: "/repo",
			execRunner: okRunner,
		});

		expect(result.status).toBe("passed");
		expect(gitMocks.mergeBranch).toHaveBeenCalledTimes(1);
		expect(store.handleStageFailure).not.toHaveBeenCalled();
	});

	it("still fails back when the task branch is missing (merge never landed)", async () => {
		gitMocks.branchExists.mockResolvedValue(false);
		const { store, stage } = landedSetup();
		// No landed marker: the merge never ran, so today's failback applies.
		store.getTask.mockReturnValue({
			...ciTask(),
			currentStageId: "merge-1",
		});

		await executeMergeStage(store, {
			projectId: "proj-1",
			taskId: "task-1",
			stage,
			stages: [stage],
			cwd: "/repo",
			execRunner: okRunner,
		});

		expect(gitMocks.mergeBranch).not.toHaveBeenCalled();
		expect(store.handleStageFailure).toHaveBeenCalledTimes(1);
		const failureOpts = store.handleStageFailure.mock.calls[0][4];
		expect(failureOpts?.skipFailback).not.toBe(true);
	});

	it("recovers after a restart without re-merging when the merge already landed", async () => {
		gitMocks.countUniqueCommits.mockResolvedValue(0);
		const { store, task, stage } = landedSetup();
		// Server restart collapses running_merge to interrupted; the stage id
		// still points at the merge stage, so resume re-enters here.
		task.status = "interrupted";

		const result = await executeMergeStage(store, {
			projectId: "proj-1",
			taskId: "task-1",
			stage,
			stages: [stage],
			cwd: "/repo",
			execRunner: okRunner,
		});

		expect(result.status).toBe("passed");
		expect(gitMocks.mergeBranch).not.toHaveBeenCalled();
		expect(store.handleStageFailure).not.toHaveBeenCalled();
		expect(store.advanceStage).toHaveBeenCalledTimes(1);
		expect(logText(task)).toContain("already landed");
	});

	it("finishes on main when the task branch was pruned after the merge landed", async () => {
		gitMocks.branchExists.mockResolvedValue(false);
		const { store, task, stage } = landedSetup();

		const result = await executeMergeStage(store, {
			projectId: "proj-1",
			taskId: "task-1",
			stage,
			stages: [stage],
			cwd: "/repo",
			execRunner: okRunner,
		});

		expect(result.status).toBe("passed");
		// A pruned task branch must NOT be recreated for a landed merge: the
		// integration exists on main, so only the publish step remains.
		expect(store.ensureTaskBranch).not.toHaveBeenCalled();
		expect(gitMocks.countUniqueCommits).not.toHaveBeenCalled();
		expect(gitMocks.mergeBranch).not.toHaveBeenCalled();
		expect(gitMocks.checkoutBranch).toHaveBeenCalledWith("/repo", "main", {
			recovery: "off",
		});
		expect(gitMocks.pushBranchIfRemote).toHaveBeenCalledWith("/repo", "main");
		expect(store.handleStageFailure).not.toHaveBeenCalled();
		expect(store.advanceStage).toHaveBeenCalledTimes(1);
		expect(logText(task)).toContain("already landed");
	});

	it("parks failed (no rewind, no merge) when the unique-commit check errors after a landed merge", async () => {
		gitMocks.countUniqueCommits.mockRejectedValue(
			new Error("git rev-list failed"),
		);
		const { store, task, stage } = landedSetup();

		const result = await executeMergeStage(store, {
			projectId: "proj-1",
			taskId: "task-1",
			stage,
			stages: [stage],
			cwd: "/repo",
			execRunner: okRunner,
		});

		// Ambiguous state: the marker says landed but git cannot confirm —
		// the task must neither rewind (lost merge) nor pretend-pass (silent
		// unmerged work). It parks failed with a clear reason.
		expect(result.status).toBe("failed");
		expect(gitMocks.mergeBranch).not.toHaveBeenCalled();
		expect(task.currentStageId).toBe("merge-1");
		const failureError = store.handleStageFailure.mock.calls[0][3];
		expect(failureError.message).toContain("already landed on a previous run");
		expect(failureError.message).toContain("git rev-list failed");
		const failureOpts = store.handleStageFailure.mock.calls[0][4];
		expect(failureOpts).toMatchObject({ skipFailback: true });
	});

	it("still fails back when the unique-commit check errors without a landed marker", async () => {
		gitMocks.countUniqueCommits.mockRejectedValue(
			new Error("git rev-list failed"),
		);
		const { store, stage } = landedSetup();
		store.getTask.mockReturnValue({
			...ciTask(),
			currentStageId: "merge-1",
		});

		await executeMergeStage(store, {
			projectId: "proj-1",
			taskId: "task-1",
			stage,
			stages: [stage],
			cwd: "/repo",
			execRunner: okRunner,
		});

		// Without a marker the failure has today's semantics: failback.
		const failureOpts = store.handleStageFailure.mock.calls[0][4];
		expect(failureOpts?.skipFailback).not.toBe(true);
	});

	it("parks with skipFailback when the pre-merge switch fails on a landed retry", async () => {
		// Off-branch with a dirty tree: the switch check runs before any
		// measurement, but the frozen marker already proves the merge
		// landed — so this parks instead of rewinding to "In Progress".
		gitMocks.currentBranch.mockResolvedValue("main");
		gitMocks.requireCleanWorkingTree.mockRejectedValue(new Error("dirty tree"));
		const { store, stage } = landedSetup();

		const result = await executeMergeStage(store, {
			projectId: "proj-1",
			taskId: "task-1",
			stage,
			stages: [stage],
			cwd: "/repo",
			execRunner: okRunner,
		});

		expect(result.status).toBe("failed");
		expect(store.handleStageFailure).toHaveBeenCalledTimes(1);
		const failureOpts = store.handleStageFailure.mock.calls[0][4];
		expect(failureOpts).toMatchObject({ skipFailback: true });
		expect(gitMocks.mergeBranch).not.toHaveBeenCalled();
	});

	it("parks failed when checkout of the main branch fails during a landed re-entry", async () => {
		gitMocks.countUniqueCommits.mockResolvedValue(0);
		gitMocks.checkoutBranch.mockRejectedValue(new Error("unable to switch"));
		const { store, stage } = landedSetup();

		const result = await executeMergeStage(store, {
			projectId: "proj-1",
			taskId: "task-1",
			stage,
			stages: [stage],
			cwd: "/repo",
			execRunner: okRunner,
		});

		expect(result.status).toBe("failed");
		expect(gitMocks.mergeBranch).not.toHaveBeenCalled();
		const failureOpts = store.handleStageFailure.mock.calls[0][4];
		expect(failureOpts).toMatchObject({ skipFailback: true });
	});

	it("treats an already-merged branch as landed even without a baseline marker", async () => {
		// The ghost-task case: the merge landed on a previous run but the
		// reviewBaseline marker was lost (restart mid-merge). Ancestry alone
		// must re-enter idempotently instead of refusing "no commits".
		gitMocks.countUniqueCommits.mockResolvedValue(0);
		gitMocks.isBranchMergedInto.mockResolvedValue(true);
		const store = stubStore();
		const task = { ...ciTask(), currentStageId: "merge-1" };
		store.getTask.mockReturnValue(task);
		const stage = { id: "merge-1", name: "Merge", type: "merge" };

		const result = await executeMergeStage(store, {
			projectId: "proj-1",
			taskId: "task-1",
			stage,
			stages: [stage],
			cwd: "/repo",
			execRunner: okRunner,
		});

		expect(gitMocks.isBranchMergedInto).toHaveBeenCalledWith("/repo", "main", "kb/task-1");
		expect(result.status).toBe("passed");
		expect(gitMocks.mergeBranch).not.toHaveBeenCalled();
		expect(store.handleStageFailure).not.toHaveBeenCalled();
		expect(store.advanceStage).toHaveBeenCalledTimes(1);
		expect(logText(task)).toContain("already landed");
	});

	it("stays fail-closed when the ancestry read itself fails", async () => {
		// Git is unreadable (exit 128: bad repo, bad ref) and there is no
		// frozen marker: without proof, an empty branch still refuses —
		// and never parks with skipFailback (nothing landed to protect).
		gitMocks.countUniqueCommits.mockResolvedValue(0);
		gitMocks.isBranchMergedInto.mockRejectedValue(new Error("git failed: exit 128"));
		const store = stubStore();
		store.getTask.mockReturnValue({ ...ciTask(), currentStageId: "merge-1" });
		const stage = { id: "merge-1", name: "Merge", type: "merge" };

		await executeMergeStage(store, {
			projectId: "proj-1",
			taskId: "task-1",
			stage,
			stages: [stage],
			cwd: "/repo",
			execRunner: okRunner,
		});

		expect(store.handleStageFailure).toHaveBeenCalledTimes(1);
		const failure = store.handleStageFailure.mock.calls[0][3];
		expect(String(failure?.message || failure)).toContain("no commits of its own");
		const failureOpts = store.handleStageFailure.mock.calls[0][4];
		expect(failureOpts?.skipFailback).not.toBe(true);
		expect(gitMocks.mergeBranch).not.toHaveBeenCalled();
	});

	it("still refuses an empty branch when neither marker nor ancestry proves a landing", async () => {
		gitMocks.countUniqueCommits.mockResolvedValue(0);
		gitMocks.isBranchMergedInto.mockResolvedValue(false);
		const store = stubStore();
		store.getTask.mockReturnValue({ ...ciTask(), currentStageId: "merge-1" });
		const stage = { id: "merge-1", name: "Merge", type: "merge" };

		await executeMergeStage(store, {
			projectId: "proj-1",
			taskId: "task-1",
			stage,
			stages: [stage],
			cwd: "/repo",
			execRunner: okRunner,
		});

		expect(store.handleStageFailure).toHaveBeenCalledTimes(1);
		const failure = store.handleStageFailure.mock.calls[0][3];
		expect(String(failure?.message || failure)).toContain("no commits of its own");
		const failureOpts = store.handleStageFailure.mock.calls[0][4];
		expect(failureOpts?.skipFailback).not.toBe(true);
		expect(gitMocks.mergeBranch).not.toHaveBeenCalled();
	});

	it("saves a command-less Merge Stage Report and consumes merge markers on pass", async () => {
		gitMocks.countUniqueCommits.mockResolvedValue(0);
		const { store, task, stage } = landedSetup();

		const result = await executeMergeStage(store, {
			projectId: "proj-1",
			taskId: "task-1",
			stage,
			stages: [stage],
			cwd: "/repo",
			execRunner: okRunner,
		});

		expect(result.status).toBe("passed");
		const report = store.saveStageReport.mock.calls.at(-1)[2];
		expect(report.content).toContain("# Merge Stage Report");
		expect(report.content).toContain("**Task branch:** kb/task-1");
		expect(report.content).toContain("**Main branch:** main");
		// Git-only report: no command line, no exit code.
		expect(report.content).not.toContain("**Command:**");
		// Single-attempt merge markers are consumed on pass.
		expect(task.mergeAttemptId).toBeUndefined();
		expect(task.preMergeMainSha).toBeUndefined();
	});

	it("reports a pure git failure reason with no deploy evidence wording", async () => {
		// The separation goal: a merge-stage failure names git operations
		// only — never deploy evidence, gates, or post-merge commands.
		const conflict = new MockGitMergeConflictError("Merge conflict", ["a.txt"]);
		gitMocks.mergeBranch.mockRejectedValue(conflict);
		const { store, stage } = landedSetup();

		await executeMergeStage(store, {
			projectId: "proj-1",
			taskId: "task-1",
			stage,
			stages: [stage],
			cwd: "/repo",
			execRunner: okRunner,
		});

		const failure = store.handleStageFailure.mock.calls[0][3];
		const message = String(failure?.message || failure);
		expect(message).toContain("Merge conflict");
		expect(message).not.toContain("Deploy cause:");
		expect(message).not.toContain("deploy.log");
		expect(message).not.toContain("last-result.json");
		expect(message).not.toContain("Post-merge");
	});
});

describe("resolveMergeLandedEvidence", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		gitMocks.isGitRepository.mockResolvedValue(true);
		gitMocks.hasCommits.mockResolvedValue(true);
		gitMocks.branchExists.mockResolvedValue(true);
		gitMocks.defaultBranch.mockResolvedValue("main");
		gitMocks.isBranchMergedInto.mockResolvedValue(false);
	});

	function markedTask() {
		return {
			...ciTask(),
			currentStageId: "merge-1",
			reviewBaseline: {
				baseSha: "a".repeat(40),
				headSha: "b".repeat(40),
				mainSha: "a".repeat(40),
				mergedAt: new Date().toISOString(),
				stageId: "merge-1",
			},
		};
	}

	it("returns marker evidence without touching ancestry", async () => {
		const evidence = await resolveMergeLandedEvidence(stubStore(), {
			task: markedTask(),
			stage: { id: "merge-1" },
			cwd: "/repo",
			branch: "kb/task-1",
			mainBranch: "main",
		});
		expect(evidence).toMatchObject({ landedMarker: true, landed: true });
		expect(gitMocks.isBranchMergedInto).not.toHaveBeenCalled();
	});

	it("returns ancestry evidence when the marker is missing", async () => {
		gitMocks.isBranchMergedInto.mockResolvedValue(true);
		const evidence = await resolveMergeLandedEvidence(stubStore(), {
			task: { ...ciTask(), currentStageId: "merge-1" },
			stage: { id: "merge-1" },
			cwd: "/repo",
			branch: "kb/task-1",
			mainBranch: "main",
		});
		expect(evidence).toMatchObject({ landedMarker: false, ancestryLanded: true, landed: true });
		expect(gitMocks.isBranchMergedInto).toHaveBeenCalledWith("/repo", "main", "kb/task-1");
	});

	it("reports a pruned branch with a marker as landed", async () => {
		gitMocks.branchExists.mockResolvedValue(false);
		const evidence = await resolveMergeLandedEvidence(stubStore(), {
			task: markedTask(),
			stage: { id: "merge-1" },
			cwd: "/repo",
			branch: "kb/task-1",
			mainBranch: "main",
		});
		expect(evidence).toMatchObject({ landed: true, branchPrunedSinceMerge: true });
	});

	it("refuses a missing branch without a marker", async () => {
		gitMocks.branchExists.mockResolvedValue(false);
		await expect(
			resolveMergeLandedEvidence(stubStore(), {
				task: { ...ciTask(), currentStageId: "merge-1" },
				stage: { id: "merge-1" },
				cwd: "/repo",
				branch: "kb/task-1",
				mainBranch: "main",
			}),
		).rejects.toThrow("does not exist");
	});
});

describe("runCommandStage deploy-command CI failure (ordinary CI contract)", () => {
	const failRunner = async () => ({
		exitCode: 1,
		stdout: "deploy failed: health check timeout",
		stderr: "predicate timeout",
	});

	/** A deploy is a normal CI stage whose command runs the deploy script. */
	function deployStage() {
		return {
			id: "deploy-1",
			name: "Deploy",
			type: "ci",
			command: "./deploy.sh --prod",
		};
	}

	function deployOpts(stage) {
		return {
			stages: [stage],
			cwd: "/repo",
			kind: "ci",
			label: "CI",
			logTag: "CI/CMD",
			reportTitle: "CI Stage Report",
			statusValue: "running_ci",
			defaultCommand: "./deploy.sh --prod",
			execRunner: failRunner,
		};
	}

	it("routes a deploy-command CI failure through handleStageFailure with exit code and stderr", async () => {
		// A deploy-command ci stage fails exactly like any other ci stage:
		// the failure carries the exit code and stderr — no deploy-gate
		// enrichment, no last-result.json pointers, no command-name wrapping.
		const store = stubStore();
		const task = ciTask();
		store.getTask.mockReturnValue(task);
		await runCommandStage(store, "proj-1", "task-1", deployStage(), deployOpts(deployStage()));
		expect(store.handleStageFailure).toHaveBeenCalledTimes(1);
		const failure = store.handleStageFailure.mock.calls[0][3];
		expect(failure).toBeInstanceOf(Error);
		expect(failure.message).toContain("predicate timeout");
		expect(failure.exitCode).toBe(1);
		expect(failure.stdout).toContain("deploy failed: health check timeout");
	});

	it("produces a generic failure reason (no deploy-gate or merge wording)", async () => {
		const store = stubStore();
		const task = ciTask();
		store.getTask.mockReturnValue(task);
		await runCommandStage(store, "proj-1", "task-1", deployStage(), deployOpts(deployStage()));
		const failure = store.handleStageFailure.mock.calls[0][3];
		const message = String(failure?.message || failure);
		// Generic failure: no deploy-gate enrichment, no merge wording.
		expect(message).not.toContain("Deploy cause:");
		expect(message).not.toContain("last-result.json");
		expect(message).not.toContain("Post-merge");
		expect(message).not.toContain("project blocker");
	});

	it("does not park the failure (falls back) even after a merge has landed", async () => {
		// Deploy-command CI failures fall back like any other CI failure so
		// an agent can fix them.
		const store = stubStore();
		const task = ciTask();
		task.reviewBaseline = { mainSha: "base-1", mergedAt: "2026-10-14T00:00:00.000Z" };
		store.getTask.mockReturnValue(task);
		await runCommandStage(store, "proj-1", "task-1", deployStage(), deployOpts(deployStage()));
		expect(store.handleStageFailure).toHaveBeenCalledTimes(1);
		const failureOpts = store.handleStageFailure.mock.calls[0][4];
		expect(failureOpts?.skipFailback).toBeFalsy();
	});

	it("keeps the configured failback for a standalone deploy-command CI stage", async () => {
		const store = stubStore();
		const task = ciTask();
		store.getTask.mockReturnValue(task);
		await runCommandStage(store, "proj-1", "task-1", deployStage(), deployOpts(deployStage()));
		const failureOpts = store.handleStageFailure.mock.calls[0][4];
		expect(failureOpts?.skipFailback).not.toBe(true);
	});

	it("keeps the CI failure contract unchanged (no deploy enrichment)", async () => {
		const store = stubStore();
		const task = ciTask();
		store.getTask.mockReturnValue(task);
		await runCommandStage(store, "proj-1", "task-1", baseStage(), {
			stages: [baseStage()],
			cwd: "/repo",
			kind: "ci",
			label: "CI",
			logTag: "CI/CMD",
			reportTitle: "CI Stage Report",
			statusValue: "running_ci",
			defaultCommand: "echo hi",
			execRunner: failRunner,
		});
		expect(store.handleStageFailure).toHaveBeenCalledTimes(1);
		const failure = store.handleStageFailure.mock.calls[0][3];
		expect(failure.message).not.toContain("Deploy cause:");
		expect(failure.message).not.toContain("project blocker");
		expect(failure.deployGate).toBeUndefined();
		expect(failure.projectBlocker).toBeUndefined();
	});
});

/***
 * MARK: resolveCiBranchPlan tests
 * @description Pins the ci branch-mode policy: absent/unknown modes stay on
 *   the task branch (fail-open, never a broken pipeline), while misconfigured
 *   primary/custom modes fail loud and early — never a silent task-branch
 *   fallback — with no git mutation before the throw.
 ***/
describe("resolveCiBranchPlan", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		gitMocks.isGitRepository.mockResolvedValue(true);
		gitMocks.defaultBranch.mockResolvedValue("main");
		gitMocks.branchExists.mockResolvedValue(true);
	});

	it("resolves the task branch for absent, explicit, and unknown modes", async () => {
		for (const stage of [
			{},
			{ runOnBranch: "task" },
			{ runOnBranch: "  TASK " },
			{ runOnBranch: "banana" },
			{ runOnBranch: 42 },
		]) {
			expect(await resolveCiBranchPlan({ stage, cwd: "/repo" })).toEqual({
				mode: "task",
				branch: null,
			});
		}
		// Fail-open must never touch git at all.
		expect(gitMocks.isGitRepository).not.toHaveBeenCalled();
		expect(gitMocks.defaultBranch).not.toHaveBeenCalled();
		expect(gitMocks.branchExists).not.toHaveBeenCalled();
	});

	it("resolves primary mode to the project's default branch", async () => {
		gitMocks.defaultBranch.mockResolvedValue("trunk");
		const plan = await resolveCiBranchPlan({
			stage: { name: "Verify", runOnBranch: "primary" },
			cwd: "/repo",
		});
		expect(plan).toEqual({ mode: "primary", branch: "trunk" });
		expect(gitMocks.defaultBranch).toHaveBeenCalledWith("/repo");
		expect(gitMocks.branchExists).not.toHaveBeenCalled();
	});

	it("rejects primary mode on a non-git project", async () => {
		gitMocks.isGitRepository.mockResolvedValue(false);
		await expect(
			resolveCiBranchPlan({ stage: { name: "Verify", runOnBranch: "primary" }, cwd: "/not-a-repo" }),
		).rejects.toThrow(/not a git repository/);
		expect(gitMocks.defaultBranch).not.toHaveBeenCalled();
	});

	it("rejects primary mode when the default branch cannot be resolved", async () => {
		gitMocks.defaultBranch.mockResolvedValue(null);
		await expect(
			resolveCiBranchPlan({ stage: { name: "Verify", runOnBranch: "primary" }, cwd: "/repo" }),
		).rejects.toThrow(/Could not resolve the primary branch/);
	});

	it("resolves custom mode to the configured existing branch", async () => {
		const plan = await resolveCiBranchPlan({
			stage: { name: "Verify", runOnBranch: "custom", customBranch: "  release/next  " },
			cwd: "/repo",
		});
		expect(plan).toEqual({ mode: "custom", branch: "release/next" });
		expect(gitMocks.branchExists).toHaveBeenCalledWith("/repo", "release/next");
	});

	it("rejects a blank custom branch with an actionable message", async () => {
		await expect(
			resolveCiBranchPlan({
				stage: { name: "Verify", runOnBranch: "custom", customBranch: "   " },
				cwd: "/repo",
			}),
		).rejects.toThrow(/Invalid custom branch '\(blank\)'.*set a valid git branch name/);
		expect(gitMocks.branchExists).not.toHaveBeenCalled();
	});

	it("rejects an invalid custom branch name (git flag injection stays impossible)", async () => {
		await expect(
			resolveCiBranchPlan({
				stage: { name: "Verify", runOnBranch: "custom", customBranch: "--force" },
				cwd: "/repo",
			}),
		).rejects.toThrow(/Invalid custom branch '--force'/);
		expect(gitMocks.branchExists).not.toHaveBeenCalled();
	});

	it("rejects a custom branch that does not exist locally", async () => {
		gitMocks.branchExists.mockResolvedValue(false);
		await expect(
			resolveCiBranchPlan({
				stage: { name: "Verify", runOnBranch: "custom", customBranch: "ghost/branch" },
				cwd: "/repo",
			}),
		).rejects.toThrow(/Custom branch 'ghost\/branch' does not exist locally/);
	});

	it("rejects custom mode on a non-git project", async () => {
		gitMocks.isGitRepository.mockResolvedValue(false);
		await expect(
			resolveCiBranchPlan({
				stage: { name: "Verify", runOnBranch: "custom", customBranch: "release/next" },
				cwd: "/not-a-repo",
			}),
		).rejects.toThrow(/not a git repository/);
		expect(gitMocks.branchExists).not.toHaveBeenCalled();
	});

	it("resolves an unset mode to the task branch (uniform default for every command stage)", async () => {
		await expect(
			resolveCiBranchPlan({ stage: { name: "Verify" }, cwd: "/repo", kind: "ci" }),
		).resolves.toEqual({ mode: "task", branch: null });
		// A deploy command is an ordinary ci stage: same default, no special arm.
		await expect(
			resolveCiBranchPlan({ stage: { name: "Deploy", command: "./deploy.sh --prod" }, cwd: "/repo", kind: "ci" }),
		).resolves.toEqual({ mode: "task", branch: null });
	});
});

/***
 * MARK: resolveCommandExecutionCwd tests
 * @description Pins the execution-directory seam: ci/script kinds route
 *   through the task-worktree resolver, every other kind stays on the primary
 *   checkout without consulting the project store. A deploy-command ci stage
 *   uses the ci path — no deploy-specific cwd rule.
 ***/
describe("resolveCommandExecutionCwd", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("routes ci kinds through the task-worktree resolver (quarantine falls back to the primary checkout)", async () => {
		const getProject = vi.fn(() => ({ workspaceIsolation: "quarantine" }));
		const store = { projectStore: { getProject } };
		expect(await resolveCommandExecutionCwd(store, { kind: "ci", task: ciTask(), cwd: "/repo" })).toBe("/repo");
		expect(getProject).toHaveBeenCalledWith("proj-1");
	});

	it("falls back to the primary checkout when the project lookup throws", async () => {
		const store = { projectStore: { getProject: () => { throw new Error("boom"); } } };
		expect(await resolveCommandExecutionCwd(store, { kind: "script", task: ciTask(), cwd: "/repo" })).toBe("/repo");
	});
});

/***
 * MARK: runCommandStage ci run-on-branch tests
 * @description Pins the non-task CI execution contract: the command runs in
 *   the primary checkout guarded onto the resolved branch, task-branch
 *   finalize is skipped (a verification run must never commit/push onto
 *   primary/custom), plan failures route through handleStageFailure before
 *   any checkout, and failures still restore and route to the stage fallback.
 ***/
describe("runCommandStage ci run-on-branch", () => {
	const runOpts = (overrides = {}) => ({
		stages: [baseStage()],
		cwd: "/repo",
		kind: "ci",
		label: "CI",
		logTag: "CI/CMD",
		reportTitle: "CI Stage Report",
		statusValue: "running_ci",
		defaultCommand: "echo hi",
		execRunner: okRunner,
		...overrides,
	});

	beforeEach(() => {
		vi.clearAllMocks();
		gitMocks.isGitRepository.mockResolvedValue(true);
		gitMocks.defaultBranch.mockResolvedValue("main");
		gitMocks.branchExists.mockResolvedValue(true);
		gitMocks.withCheckedOutBranch.mockImplementation(async (_cwd, _branch, fn) => fn());
		shaMocks.resolveSha.mockResolvedValue(null);
	});

	it("runs primary-mode CI on the default branch and skips task-branch finalize", async () => {
		const store = stubStore();
		const task = ciTask();
		store.getTask.mockReturnValue(task);
		const bridge = { emitProcessEvent: vi.fn() };
		const runner = vi.fn(async () => ({ exitCode: 0, stdout: "on main", stderr: "" }));
		shaMocks.resolveSha.mockResolvedValue("abc123");

		const result = await runCommandStage(
			store,
			"proj-1",
			"task-1",
			baseStage({ runOnBranch: "primary" }),
			runOpts({ bridge, execRunner: runner }),
		);

		expect(result.status).toBe("passed");
		// The command executed in the primary checkout (never the task worktree).
		expect(runner.mock.calls[0][1].cwd).toBe("/repo");
		// Guarded checkout happened exactly once, on the resolved branch.
		expect(gitMocks.withCheckedOutBranch).toHaveBeenCalledTimes(1);
		expect(gitMocks.withCheckedOutBranch).toHaveBeenCalledWith(
			"/repo",
			"main",
			expect.any(Function),
			expect.objectContaining({ taskId: "task-1" }),
		);
		// A verification run must never commit/push onto primary/custom.
		expect(store.finalizeTaskBranch).not.toHaveBeenCalled();
		expect(gitMocks.commitAllIfNeeded).not.toHaveBeenCalled();
		expect(gitMocks.pushBranchIfRemote).not.toHaveBeenCalled();
		expect(store.advanceStage).toHaveBeenCalledTimes(1);
		// Report and logs carry the branch evidence for auditability.
		const report = store.saveStageReport.mock.calls[0][2];
		expect(report.content).toContain("**Branch:** main (primary) @ abc123");
		expect(logText(task)).toContain("Running on primary branch 'main'");
		expect(logText(task)).toContain("task-branch finalize skipped");
		expect(logText(task)).toContain("Returned to 'main'");
		// The console event stream names the branch too.
		const start = bridge.emitProcessEvent.mock.calls
			.map((c) => c[2])
			.find((p) => p && p.command !== undefined);
		expect(start).toMatchObject({ branch: "main", runOnBranch: "primary" });
	});

	it("runs custom-mode CI on the configured branch", async () => {
		const store = stubStore();
		const task = ciTask();
		store.getTask.mockReturnValue(task);
		const runner = vi.fn(okRunner);

		const result = await runCommandStage(
			store,
			"proj-1",
			"task-1",
			baseStage({ runOnBranch: "custom", customBranch: "release/next" }),
			runOpts({ execRunner: runner }),
		);

		expect(result.status).toBe("passed");
		expect(gitMocks.branchExists).toHaveBeenCalledWith("/repo", "release/next");
		expect(gitMocks.withCheckedOutBranch).toHaveBeenCalledWith(
			"/repo",
			"release/next",
			expect.any(Function),
			expect.objectContaining({ taskId: "task-1" }),
		);
		expect(runner.mock.calls[0][1].cwd).toBe("/repo");
		expect(store.finalizeTaskBranch).not.toHaveBeenCalled();
		expect(store.advanceStage).toHaveBeenCalledTimes(1);
		const report = store.saveStageReport.mock.calls[0][2];
		expect(report.content).toContain("**Branch:** release/next (custom)");
	});

	it("fails the stage (and skips finalize) when a primary-mode command exits non-zero", async () => {
		const store = stubStore();
		const task = ciTask();
		store.getTask.mockReturnValue(task);

		const result = await runCommandStage(
			store,
			"proj-1",
			"task-1",
			baseStage({ runOnBranch: "primary" }),
			runOpts({ execRunner: async () => ({ exitCode: 1, stdout: "", stderr: "boom" }) }),
		);

		expect(result.status).toBe("failed");
		// The checkout/restore wrapper still ran (restore-on-failure contract).
		expect(gitMocks.withCheckedOutBranch).toHaveBeenCalledTimes(1);
		expect(store.finalizeTaskBranch).not.toHaveBeenCalled();
		expect(store.advanceStage).not.toHaveBeenCalled();
		expect(store.handleStageFailure).toHaveBeenCalledTimes(1);
	});

	it("routes a plan failure through handleStageFailure before any checkout or command", async () => {
		const store = stubStore();
		const task = ciTask();
		store.getTask.mockReturnValue(task);
		gitMocks.branchExists.mockResolvedValue(false);
		const runner = vi.fn(okRunner);

		const result = await runCommandStage(
			store,
			"proj-1",
			"task-1",
			baseStage({ runOnBranch: "custom", customBranch: "ghost/branch" }),
			runOpts({ execRunner: runner }),
		);

		expect(result).toEqual({ status: "failed" });
		expect(store.handleStageFailure).toHaveBeenCalledTimes(1);
		const routedError = store.handleStageFailure.mock.calls[0][3];
		expect(routedError.message).toContain("does not exist locally");
		// No git mutation and no command execution on a misconfigured stage.
		expect(gitMocks.withCheckedOutBranch).not.toHaveBeenCalled();
		expect(runner).not.toHaveBeenCalled();
		expect(store.finalizeTaskBranch).not.toHaveBeenCalled();
		expect(store.advanceStage).not.toHaveBeenCalled();
	});

	it("surfaces a restore failure as the stage error without masking the command failure", async () => {
		const store = stubStore();
		const task = ciTask();
		store.getTask.mockReturnValue(task);
		gitMocks.withCheckedOutBranch.mockRejectedValue(
			new MockGitError(
				"Could not return to the default branch 'main' after running on 'main' (the command on 'main' had already failed: boom)",
			),
		);

		await runCommandStage(
			store,
			"proj-1",
			"task-1",
			baseStage({ runOnBranch: "primary" }),
			runOpts({ execRunner: async () => ({ exitCode: 1, stdout: "", stderr: "" }) }),
		);

		expect(store.handleStageFailure).toHaveBeenCalledTimes(1);
		const routedError = store.handleStageFailure.mock.calls[0][3];
		expect(routedError.message).toContain("Could not return to the default branch");
		const report = store.saveStageReport.mock.calls[0][2];
		expect(report.content).toContain("Could not return to the default branch");
		expect(store.advanceStage).not.toHaveBeenCalled();
	});

	it("does not use the checkout wrapper for task-mode CI (existing behaviour)", async () => {
		const store = stubStore();
		const task = ciTask();
		store.getTask.mockReturnValue(task);

		const result = await runCommandStage(store, "proj-1", "task-1", baseStage(), runOpts());

		expect(result.status).toBe("passed");
		expect(gitMocks.withCheckedOutBranch).not.toHaveBeenCalled();
		expect(store.finalizeTaskBranch).toHaveBeenCalledTimes(1);
		const report = store.saveStageReport.mock.calls[0][2];
		expect(report.content).not.toContain("**Branch:**");
	});
});

/***
 * MARK: runCommandStage deploy-command run-on-branch tests
 * @description Pins the ordinary CI branch contract for a ci stage whose
 *   command runs the deploy script: the default (unset or 'task') runs from
 *   the task's isolated worktree (primary-checkout fallback when none is
 *   provisioned), primary/custom run on the primary checkout guarded onto
 *   the resolved branch (never the task worktree, never task-branch
 *   finalize), and plan failures route through handleStageFailure before
 *   any checkout. Identical to the ci run-on-branch contract above.
 ***/
describe("runCommandStage deploy-command CI run-on-branch", () => {
	const deployOpts = (overrides = {}) => ({
		stages: [baseStage()],
		cwd: "/repo",
		kind: "ci",
		label: "CI",
		logTag: "CI/CMD",
		reportTitle: "CI Stage Report",
		statusValue: "running_ci",
		defaultCommand: "./deploy.sh --prod",
		execRunner: okRunner,
		...overrides,
	});
	const deployBranchStage = (overrides = {}) =>
		baseStage({
			id: "deploy-1",
			name: "Deploy",
			type: "ci",
			command: "./deploy.sh --prod",
			...overrides,
		});

	beforeEach(() => {
		vi.clearAllMocks();
		gitMocks.isGitRepository.mockResolvedValue(true);
		gitMocks.defaultBranch.mockResolvedValue("main");
		gitMocks.branchExists.mockResolvedValue(true);
		gitMocks.withCheckedOutBranch.mockImplementation(async (_cwd, _branch, fn) => fn());
		shaMocks.resolveSha.mockResolvedValue(null);
	});

	it("runs a primary-mode deploy-command CI stage on the default branch, never the task worktree, without finalize", async () => {
		// Identical to the primary-mode ci contract: guarded checkout of the
		// default branch, no task-branch finalize.
		const store = stubStore();
		const task = ciTask();
		store.getTask.mockReturnValue(task);
		const runner = vi.fn(async () => ({ exitCode: 0, stdout: "deploy ok", stderr: "" }));

		const result = await runCommandStage(
			store,
			"proj-1",
			"task-1",
			deployBranchStage({ runOnBranch: "primary" }),
			deployOpts({ execRunner: runner }),
		);

		expect(result.status).toBe("passed");
		expect(runner.mock.calls[0][1].cwd).toBe("/repo");
		expect(gitMocks.withCheckedOutBranch).toHaveBeenCalledTimes(1);
		expect(gitMocks.withCheckedOutBranch).toHaveBeenCalledWith(
			"/repo",
			"main",
			expect.any(Function),
			expect.objectContaining({ taskId: "task-1" }),
		);
		expect(store.finalizeTaskBranch).not.toHaveBeenCalled();
		expect(gitMocks.commitAllIfNeeded).not.toHaveBeenCalled();
		expect(gitMocks.pushBranchIfRemote).not.toHaveBeenCalled();
		expect(store.advanceStage).toHaveBeenCalledTimes(1);
		const report = store.saveStageReport.mock.calls[0][2];
		expect(report.content).toContain("**Branch:** main (primary)");
		expect(logText(task)).toContain("Running on primary branch 'main'");
		expect(logText(task)).toContain("CI ran on 'main' — task-branch finalize skipped");
	});

	it("runs a custom-mode deploy-command CI stage on the configured branch", async () => {
		const store = stubStore();
		const task = ciTask();
		store.getTask.mockReturnValue(task);
		const runner = vi.fn(okRunner);

		const result = await runCommandStage(
			store,
			"proj-1",
			"task-1",
			deployBranchStage({ runOnBranch: "custom", customBranch: "release/next" }),
			deployOpts({ execRunner: runner }),
		);

		expect(result.status).toBe("passed");
		expect(gitMocks.branchExists).toHaveBeenCalledWith("/repo", "release/next");
		expect(gitMocks.withCheckedOutBranch).toHaveBeenCalledWith(
			"/repo",
			"release/next",
			expect.any(Function),
			expect.objectContaining({ taskId: "task-1" }),
		);
		expect(runner.mock.calls[0][1].cwd).toBe("/repo");
		expect(store.finalizeTaskBranch).not.toHaveBeenCalled();
		expect(store.advanceStage).toHaveBeenCalledTimes(1);
		const report = store.saveStageReport.mock.calls[0][2];
		expect(report.content).toContain("**Branch:** release/next (custom)");
	});

	it("runs a default (unset) task-mode deploy-command CI stage from the task's isolated worktree and finalizes", async () => {
		// Ordinary ci contract: task mode runs in the worktree AND finalizes
		// the task branch (commit + push + return to default).
		const { mkdtempSync } = await import("node:fs");
		const { tmpdir } = await import("node:os");
		const worktree = mkdtempSync(`${tmpdir()}/kb-worktree-`);
		workspaceMocks.resolveTaskCwd.mockResolvedValue(worktree);
		const store = stubStore({
			projectStore: { getProject: vi.fn(() => ({ workspaceIsolation: "worktree" })) },
		});
		const task = ciTask();
		store.getTask.mockReturnValue(task);
		const runner = vi.fn(okRunner);

		const result = await runCommandStage(
			store,
			"proj-1",
			"task-1",
			deployBranchStage(),
			deployOpts({ execRunner: runner }),
		);

		expect(result.status).toBe("passed");
		// The command ran inside the task worktree, not the primary checkout.
		expect(runner.mock.calls[0][1].cwd).toBe(worktree);
		expect(workspaceMocks.resolveTaskCwd).toHaveBeenCalled();
		// No guarded checkout of the primary; task-branch finalize runs.
		expect(gitMocks.withCheckedOutBranch).not.toHaveBeenCalled();
		expect(store.finalizeTaskBranch).toHaveBeenCalledTimes(1);
		expect(store.advanceStage).toHaveBeenCalledTimes(1);
	});

	it("falls back to the primary checkout when a task-mode deploy-command CI stage has no provisioned worktree", async () => {
		workspaceMocks.resolveTaskCwd.mockResolvedValue("/repo");
		const store = stubStore({
			projectStore: { getProject: vi.fn(() => ({ workspaceIsolation: "worktree" })) },
		});
		const task = ciTask();
		store.getTask.mockReturnValue(task);
		const runner = vi.fn(okRunner);

		const result = await runCommandStage(
			store,
			"proj-1",
			"task-1",
			deployBranchStage({ runOnBranch: "task" }),
			deployOpts({ execRunner: runner }),
		);

		expect(result.status).toBe("passed");
		expect(runner.mock.calls[0][1].cwd).toBe("/repo");
		expect(gitMocks.withCheckedOutBranch).not.toHaveBeenCalled();
		// Task mode with branch mode enabled finalizes (ordinary ci contract).
		expect(store.finalizeTaskBranch).toHaveBeenCalledTimes(1);
		const report = store.saveStageReport.mock.calls[0][2];
		expect(report.content).not.toContain("**Branch:**");
	});

	it("routes a custom-mode plan failure through handleStageFailure before any checkout or deploy command", async () => {
		const store = stubStore();
		const task = ciTask();
		store.getTask.mockReturnValue(task);
		gitMocks.branchExists.mockResolvedValue(false);
		const runner = vi.fn(okRunner);

		const result = await runCommandStage(
			store,
			"proj-1",
			"task-1",
			deployBranchStage({ runOnBranch: "custom", customBranch: "ghost/branch" }),
			deployOpts({ execRunner: runner }),
		);

		expect(result).toEqual({ status: "failed" });
		expect(store.handleStageFailure).toHaveBeenCalledTimes(1);
		const routedError = store.handleStageFailure.mock.calls[0][3];
		expect(routedError.message).toContain("does not exist locally");
		expect(gitMocks.withCheckedOutBranch).not.toHaveBeenCalled();
		expect(runner).not.toHaveBeenCalled();
		expect(store.advanceStage).not.toHaveBeenCalled();
	});
});
