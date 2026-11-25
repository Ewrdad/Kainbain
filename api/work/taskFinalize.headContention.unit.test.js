import { describe, it, expect, vi, beforeEach } from "vitest";

// Unit tests for the failed-stage HEAD-contention recovery in
// `commitFailedStageWork`: the git barrel (`../git.js`) is mocked so the
// retry-once / fail-closed behaviour is asserted exactly, without real git.
const mocks = vi.hoisted(() => ({
	commitAllIfNeeded: vi.fn(),
	checkoutBranch: vi.fn(),
	state: {
		head: "kb/sibling",
		branchExists: true,
		status: { clean: false, dirtyPaths: [] },
	},
}));

vi.mock("../git.js", async (importOriginal) => {
	const mod = await importOriginal();
	return {
		...mod,
		isGitRepository: async () => true,
		commitAllIfNeeded: (...args) => mocks.commitAllIfNeeded(...args),
		checkoutBranch: (...args) => mocks.checkoutBranch(...args),
		currentBranch: async () => mocks.state.head,
		branchExists: async () => mocks.state.branchExists,
		getWorkingTreeStatus: async () => mocks.state.status,
		pushBranchIfRemote: async () => ({ pushed: false, skipped: "no-remote" }),
		resolveSha: async () => "abc123def456",
	};
});

import { GitBranchMismatchError } from "../git/errors.js";

const { commitFailedStageWork } = await import("./taskFinalize.js");

function fakeStore() {
	return {
		_resolveProjectCwd: (_projectId, explicitCwd) => explicitCwd,
		_saveTaskMarkdown: () => {},
		eventBridge: null,
	};
}

function fakeTask() {
	return { id: "t1", projectId: "proj-1", history: [], branch: "kb/t1" };
}

const mismatch = () =>
	new GitBranchMismatchError(
		"Refusing to commit on the wrong branch: expected 'kb/t1' but the working tree is on 'kb/sibling'. A concurrent task likely moved HEAD; re-run the stage so it can re-establish its branch.",
		{ expectedBranch: "kb/t1", actualBranch: "kb/sibling" },
	);

beforeEach(() => {
	mocks.commitAllIfNeeded.mockReset();
	mocks.checkoutBranch.mockReset();
	mocks.state.head = "kb/sibling";
	mocks.state.branchExists = true;
	mocks.state.status = {
		clean: false,
		dirtyPaths: ["docs/tasks/t1/report-failure.md"],
	};
});

describe("commitFailedStageWork HEAD-contention recovery (mocked git)", () => {
	it("T4: retries exactly once after re-establishing the owning branch, then fails closed on a second mismatch", async () => {
		mocks.commitAllIfNeeded.mockRejectedValue(mismatch());
		mocks.checkoutBranch.mockImplementation(async () => {
			mocks.state.head = "kb/t1";
			return { switched: true };
		});
		const task = fakeTask();

		const res = await commitFailedStageWork(fakeStore(), task, "/repo", {
			stageName: "Dev",
		});

		expect(res).toBeNull();
		// Initial attempt + EXACTLY one retry — no loops.
		expect(mocks.commitAllIfNeeded).toHaveBeenCalledTimes(2);
		expect(mocks.commitAllIfNeeded.mock.calls[1][2]).toMatchObject({
			expectedBranch: "kb/t1",
		});
		// The owning branch was re-established strictly: no stash ladder, and
		// no snapshot commit onto the sibling that held HEAD.
		expect(mocks.checkoutBranch).toHaveBeenCalledTimes(1);
		expect(mocks.checkoutBranch.mock.calls[0][1]).toBe("kb/t1");
		expect(mocks.checkoutBranch.mock.calls[0][2]).toMatchObject({
			recovery: "off",
			snapshotCommit: false,
		});
		const errEntry = task.history.find((h) =>
			h.action.startsWith("Error: failed-stage report"),
		);
		expect(errEntry).toBeTruthy();
		expect(errEntry.action).toContain("single retry");
		expect(errEntry.action).toContain("kb/t1");
		expect(errEntry.action).toContain("No commit was made on any branch");
	});

	it("T4b: a successful retry commits on the owning branch and records the note", async () => {
		mocks.commitAllIfNeeded
			.mockRejectedValueOnce(mismatch())
			.mockResolvedValueOnce({ committed: true, hash: "abc123" });
		mocks.checkoutBranch.mockImplementation(async () => {
			mocks.state.head = "kb/t1";
			return { switched: true };
		});
		const task = fakeTask();

		const res = await commitFailedStageWork(fakeStore(), task, "/repo", {
			stageName: "Dev",
		});

		expect(res).toMatchObject({ committed: true, hash: "abc123" });
		expect(mocks.commitAllIfNeeded).toHaveBeenCalledTimes(2);
		const actions = task.history.map((h) => h.action);
		expect(actions.some((a) => a.includes("Auto-committed partial work"))).toBe(true);
		expect(
			actions.some(
				(a) =>
					a.includes("HEAD had moved to 'kb/sibling'") && a.includes("re-established 'kb/t1'"),
			),
		).toBe(true);
		expect(actions.some((a) => a.startsWith("Error:"))).toBe(false);
	});

	it("T5: a non-branch commit error keeps the warn-only skip (no recovery attempted)", async () => {
		mocks.commitAllIfNeeded.mockRejectedValueOnce(new Error("pre-commit hook failed"));
		const task = fakeTask();

		const res = await commitFailedStageWork(fakeStore(), task, "/repo", {
			stageName: "Dev",
		});

		expect(res).toBeNull();
		expect(mocks.commitAllIfNeeded).toHaveBeenCalledTimes(1);
		expect(mocks.checkoutBranch).not.toHaveBeenCalled();
		const actions = task.history.map((h) => h.action);
		expect(
			actions.some(
				(a) =>
					a.includes("Warning: failed-stage auto-commit after 'Dev' skipped") &&
					a.includes("pre-commit hook failed"),
			),
		).toBe(true);
		expect(actions.some((a) => a.startsWith("Error:"))).toBe(false);
	});

	it("fails closed without a checkout when the tree holds foreign dirt", async () => {
		mocks.commitAllIfNeeded.mockRejectedValue(mismatch());
		mocks.state.status = {
			clean: false,
			dirtyPaths: ["docs/tasks/t1/report-failure.md", "src/sibling-work.js"],
		};
		const task = fakeTask();

		const res = await commitFailedStageWork(fakeStore(), task, "/repo", {
			stageName: "Dev",
		});

		expect(res).toBeNull();
		expect(mocks.commitAllIfNeeded).toHaveBeenCalledTimes(1);
		expect(mocks.checkoutBranch).not.toHaveBeenCalled();
		const errEntry = task.history.find((h) =>
			h.action.startsWith("Error: failed-stage report"),
		);
		expect(errEntry).toBeTruthy();
		expect(errEntry.action).toContain("src/sibling-work.js");
		expect(errEntry.action).toContain("No commit was made on any branch");
	});

	it("fails closed without a retry when HEAD already moved back to the owning branch (flapping HEAD)", async () => {
		mocks.commitAllIfNeeded.mockRejectedValue(mismatch());
		// The re-read sees HEAD back on the owning branch.
		mocks.state.head = "kb/t1";
		const task = fakeTask();

		const res = await commitFailedStageWork(fakeStore(), task, "/repo", {
			stageName: "Dev",
		});

		expect(res).toBeNull();
		expect(mocks.commitAllIfNeeded).toHaveBeenCalledTimes(1);
		expect(mocks.checkoutBranch).not.toHaveBeenCalled();
		const errEntry = task.history.find((h) =>
			h.action.startsWith("Error: failed-stage report"),
		);
		expect(errEntry).toBeTruthy();
		expect(errEntry.action).toContain("moved back to the owning branch");
	});

	it("fails closed when the owning branch no longer exists", async () => {
		mocks.commitAllIfNeeded.mockRejectedValue(mismatch());
		mocks.state.branchExists = false;
		const task = fakeTask();

		const res = await commitFailedStageWork(fakeStore(), task, "/repo", {
			stageName: "Dev",
		});

		expect(res).toBeNull();
		expect(mocks.commitAllIfNeeded).toHaveBeenCalledTimes(1);
		expect(mocks.checkoutBranch).not.toHaveBeenCalled();
		const errEntry = task.history.find((h) =>
			h.action.startsWith("Error: failed-stage report"),
		);
		expect(errEntry.action).toContain("no longer exists");
	});

	it("fails closed when the recovery checkout itself is refused", async () => {
		mocks.commitAllIfNeeded.mockRejectedValue(mismatch());
		mocks.checkoutBranch.mockRejectedValueOnce(
			new Error("Working tree is not clean (refusing checkout of branch 'kb/t1')"),
		);
		const task = fakeTask();

		const res = await commitFailedStageWork(fakeStore(), task, "/repo", {
			stageName: "Dev",
		});

		expect(res).toBeNull();
		expect(mocks.commitAllIfNeeded).toHaveBeenCalledTimes(1);
		expect(mocks.checkoutBranch).toHaveBeenCalledTimes(1);
		const errEntry = task.history.find((h) =>
			h.action.startsWith("Error: failed-stage report"),
		);
		expect(errEntry.action).toContain("re-establishing the owning branch");
		expect(errEntry.action).toContain("No commit was made on any branch");
	});
});
