import { describe, it, expect, vi } from "vitest";

import { createTask } from "./taskLifecycle.js";
import { taskBranchName } from "./taskBranches.js";

/***
 * MARK: createTask branch-provisioning contract
 * @description Pins the creation-side branch contract that consumers depend
 *   on (PR-review pages, canary suites, operators auditing `task.branch`):
 *   the branch NAME is assigned synchronously and provisioning is kicked
 *   off during createTask — unawaited so POST /tasks stays instant, with
 *   failure deferred to an honest warning instead of failing creation.
 *   Concurrency safety does NOT come from deferral (an earlier attempt
 *   broke that contract and the canary PR-review suite): it comes from the
 *   per-repo mutex inside api/git.js's `git()`, which serializes these ops
 *   with a concurrently running stage's branch ops — proven by
 *   gitConcurrency.integration.test.js.
 ***/

const STAGES = [{ id: "s-1", name: "Build", type: "agent" }];

function makeStore() {
	const maps = new Map();
	const store = {
		tasksByProject: maps,
		scannedProjects: new Set(),
		dedupeMap: new Map(),
		engineState: { status: "idle" },
		eventBridge: { broadcastGlobal: vi.fn() },
		projectStore: {
			getProject: vi.fn(() => ({ id: "p-1", stages: STAGES })),
		},
		_getMap: (pid) => {
			if (!maps.has(pid)) maps.set(pid, new Map());
			return maps.get(pid);
		},
		_resolveProjectCwd: () => "/tmp/provision-probe-proj",
		_saveTaskMarkdown: vi.fn(),
		_isBranchModeEnabled: () => true,
		_resolveStagesForTask: (proj) => proj?.stages || [],
		ensureTaskBranch: vi.fn(async () => ({ created: true })),
	};
	return store;
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("createTask provisions the task branch (mutex-serialized)", () => {
	it("assigns the branch name synchronously and starts provisioning", async () => {
		const store = makeStore();
		const task = createTask(store, "p-1", { title: "Branchy", goal: "Branchy" });

		expect(task.branch).toBe(taskBranchName(task.id));

		// Provisioning is kicked off during createTask itself (unawaited, but
		// issued), targeting the resolved project cwd.
		expect(store.ensureTaskBranch).toHaveBeenCalledTimes(1);
		const [taskArg, cwdArg] = store.ensureTaskBranch.mock.calls[0];
		expect(taskArg).toBe(task);
		expect(cwdArg).toBe("/tmp/provision-probe-proj");

		// The unawaited promise settles cleanly.
		await store.ensureTaskBranch.mock.results[0].value;
		expect(task.branchProvisionError).toBeUndefined();
	});

	it("no deferral note is written when provisioning is scheduled", async () => {
		const store = makeStore();
		const task = createTask(store, "p-1", { title: "Branchy", goal: "Branchy" });
		await flush();
		await flush();

		expect(
			task.history.some((h) =>
				String(h.action || "").includes("first work-stage pickup"),
			),
		).toBe(false);
	});

	it("records an honest warning instead of throwing when provisioning fails at create", async () => {
		const store = makeStore();
		store.ensureTaskBranch = vi.fn(async () => {
			throw new Error("git exploded");
		});
		const task = createTask(store, "p-1", { title: "Broken", goal: "Broken" });

		// createTask still returns the task synchronously with the branch
		// name; the failure is caught (never an unhandled rejection) and
		// surfaced on the task for first-pickup repair.
		expect(task.branch).toBe(taskBranchName(task.id));

		await flush();
		await flush();
		expect(task.branchProvisionError).toBe("git exploded");
		expect(
			task.history.some((h) =>
				String(h.action || "").includes("branch provisioning deferred (git exploded)"),
			),
		).toBe(true);
	});

	it("does NOT provision when no project cwd can be resolved", async () => {
		const store = makeStore();
		store._resolveProjectCwd = () => null;
		const task = createTask(store, "p-1", { title: "Cwdless", goal: "Cwdless" });

		await flush();
		await flush();
		expect(store.ensureTaskBranch).not.toHaveBeenCalled();
		expect(task.branch).toBe(taskBranchName(task.id));
		expect(task.branchProvisionError).toBeUndefined();
	});

	it("does not touch git when branch mode is off (default)", async () => {
		const store = makeStore();
		store._isBranchModeEnabled = () => false;
		const task = createTask(store, "p-1", { title: "Legacy", goal: "Legacy" });

		await flush();
		await flush();
		expect(task.branch).toBeUndefined();
		expect(store.ensureTaskBranch).not.toHaveBeenCalled();
	});
});