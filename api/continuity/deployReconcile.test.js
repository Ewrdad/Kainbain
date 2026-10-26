import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DeployManager } from "../deployManager.js";
import {
	autoResumeTask,
	findResumedCandidate,
	isAutoResumableWithReason,
	isResumedStageRunnable,
} from "../flow/taskScheduler.js";
import {
	completeDeployStage,
	hasDeployAttemptWaitMarker,
	isDeployDispatchBlocked,
	isLockContentionResult,
	isRolledBackResult,
	noteDeployAttemptInFlight,
	noteDeployLockWait,
	reconcileInterruptedDeploys,
	DEPLOY_ATTEMPT_IN_FLIGHT_REASON,
} from "./deployReconcile.js";
import {
	isDeployAttemptInFlight,
	readDeployAttemptCheckpoint,
} from "./deployMarkers.js";

function makeStore({ projects = [{ id: "p-1", name: "P", cwd: "/repo", stages: STAGES }] } = {}) {
	const maps = new Map();
	const store = {
		projects,
		projectStore: {
			listProjects: () => projects,
			getProject: (pid) => projects.find((p) => p.id === pid),
		},
		engineState: { status: "idle", activeTaskId: null },
		executionQueue: { isRunning: false },
		schedulerStats: null,
		schedulerRunning: false,
		schedulerTimer: null,
		_kickTimer: null,
		_onIdleTimer: null,
		lastCompletedTask: null,
		deployManager: null,
		sessionStore: null,
		defaultAgentRunner: null,
		defaultPromptEngine: null,
		defaultSchedulerInterval: 3000,
		blockedIds: new Set(),
		getTask: (pid, tid) => maps.get(pid)?.get(tid),
		seed: (pid, task) => {
			if (!maps.has(pid)) maps.set(pid, new Map());
			maps.get(pid).set(task.id, task);
			return task;
		},
		listTasks: (pid) => Array.from(maps.get(pid)?.values() || []),
		isTaskBlocked: (pid, tid) => ({
			blocked: store.blockedIds.has(`${pid}:${tid}`),
			blockers: store.blockedIds.has(`${pid}:${tid}`) ? ["base"] : [],
			hasCycle: false,
		}),
		getEngineState: () => store.engineState,
		_resetAutoIteration: vi.fn(),
		executeStage: vi.fn(async () => ({ ok: true })),
		_recordHistory: vi.fn((t, action, ts) => {
			t.history = t.history || [];
			t.history.push({ timestamp: ts, action });
		}),
		_resolveProjectCwd: (pid, cwd) => cwd || "/repo",
		_saveTaskMarkdown: vi.fn(),
		saveStageReport: vi.fn(),
		handleStageFailure: vi.fn(),
		advanceStage: vi.fn(),
		setEngineState: vi.fn(),
	};
	return store;
}

function task(overrides = {}) {
	return {
		id: "t-1",
		projectId: "p-1",
		status: "in_stage",
		currentStageId: "s-1",
		enteredStageAt: "2026-09-24T10:00:00.000Z",
		updatedAt: "2026-09-24T10:00:00.000Z",
		history: [],
		...overrides,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	vi.useRealTimers();
});

const STAGES = [
	{ id: "s-1", name: "Build", type: "agent" },
	{ id: "s-2", name: "Review", type: "human" },
	{ id: "s-3", name: "Integrate", type: "merge" },
];

describe("completeDeployStage", () => {
	it("returns null for unknown tasks", () => {
		expect(
			completeDeployStage(makeStore(), "p-1", "ghost", {}, STAGES, "/repo", {}),
		).toBeNull();
	});

	it("marks the deploy passed, reports, and advances", () => {
		const store = makeStore();
		store.seed("p-1", task({ status: "interrupted" }));
		const stage = { id: "s-d", name: "Deploy", type: "deploy" };
		const lastResult = { buildNumber: 42, finishedAt: new Date().toISOString(), message: "ok" };
		const done = completeDeployStage(store, "p-1", "t-1", stage, STAGES, "/repo", lastResult);
		expect(done.status).toBe("in_stage");
		expect(done.wasInterrupted).toBe(false);
		expect(done.history.at(-1).action).toContain("build 42");
		expect(store.saveStageReport).toHaveBeenCalledWith(
			"p-1",
			"t-1",
			expect.objectContaining({ status: "PASSED" }),
		);
		expect(store.advanceStage).toHaveBeenCalledWith("p-1", "t-1", STAGES, undefined, "/repo");
	});
});


describe("reconcileInterruptedDeploys", () => {
	const deployStage = { id: "s-d", name: "Deploy", type: "deploy" };

	function deployStore(taskOverrides = {}, lastResult = null) {
		const store = makeStore({
			projects: [{ id: "p-1", name: "P", cwd: "/repo", stages: [deployStage] }],
		});
		store.deployManager = { readJson: () => lastResult };
		store.seed("p-1", task({ status: "interrupted", currentStageId: "s-d", ...taskOverrides }));
		return store;
	}

	it("returns [] without a deploy manager or matching tasks", async () => {
		expect(await reconcileInterruptedDeploys(makeStore())).toEqual([]);
		const store = deployStore();
		store.seed("p-1", task({ id: "calm", status: "in_stage", currentStageId: "s-d" }));
		await expect(reconcileInterruptedDeploys(store)).resolves.toEqual([]);
	});

	it("completes successful deploys", async () => {
		const store = deployStore(
			{ enteredStageAt: "2026-09-24T09:00:00.000Z" },
			{ status: "success", startedAt: "2026-09-24T10:00:00.000Z", buildNumber: 7, finishedAt: "2026-09-24T10:01:00.000Z" },
		);
		await expect(reconcileInterruptedDeploys(store)).resolves.toEqual([
			{ projectId: "p-1", taskId: "t-1" },
		]);
		expect(store.advanceStage).toHaveBeenCalled();
	});

	it("adopts and advances a deploy for a ci-typed deploy-command stage", async () => {
		// The post-migration shape: the deploy is a ci stage whose command
		// runs deploy.sh — reconcile must recognise it by command and settle
		// the interruption with the durable result, exactly like the legacy
		// deploy-typed stage above.
		const ciDeployStage = { id: "s-d", name: "Deploy", type: "ci", command: "./deploy.sh --prod" };
		const store = makeStore({
			projects: [{ id: "p-1", name: "P", cwd: "/repo", stages: [ciDeployStage] }],
		});
		store.deployManager = {
			readJson: () => ({
				status: "success",
				startedAt: "2026-09-24T10:00:00.000Z",
				buildNumber: 7,
				finishedAt: "2026-09-24T10:01:00.000Z",
			}),
		};
		store.seed(
			"p-1",
			task({
				status: "interrupted",
				currentStageId: "s-d",
				enteredStageAt: "2026-09-24T09:00:00.000Z",
			}),
		);
		await expect(reconcileInterruptedDeploys(store)).resolves.toEqual([
			{ projectId: "p-1", taskId: "t-1" },
		]);
		expect(store.advanceStage).toHaveBeenCalled();
	});

	it("fails back a failed ci deploy stage like ordinary CI, even once a merge has landed", async () => {
		// A deploy-command stage is an ordinary ci stage: a reconciled
		// failure routes to its configured fallback (no skipFailback) so an
		// agent can fix it — even when its failback target is the git-only
		// merge stage. The landed merge itself is never rewound; only the
		// merge stage's OWN failure parks.
		const ciDeployStage = { id: "s-d", name: "Deploy", type: "ci", command: "./deploy.sh --prod" };
		const store = makeStore({
			projects: [{ id: "p-1", name: "P", cwd: "/repo", stages: [ciDeployStage] }],
		});
		store.deployManager = {
			readJson: () => ({
				status: "failed",
				startedAt: "2026-09-24T10:00:00.000Z",
				message: "Gate 'canary-e2e' failed (exit 1)",
			}),
		};
		store.seed(
			"p-1",
			task({
				status: "interrupted",
				currentStageId: "s-d",
				enteredStageAt: "2026-09-24T09:00:00.000Z",
				reviewBaseline: { mainSha: "abc123", mergedAt: "2026-09-24T08:00:00.000Z" },
			}),
		);
		await expect(reconcileInterruptedDeploys(store)).resolves.toHaveLength(1);
		const failureOpts = store.handleStageFailure.mock.calls[0][4];
		expect(failureOpts?.skipFailback).not.toBe(true);
	});

	it("adopts an in-flight checkpoint for a ci-typed deploy-command stage without a second deploy", async () => {
		// Restart mid-deploy: the attempt checkpoint on disk proves the
		// deploy is still running, so reconcile parks-with-reason instead of
		// re-dispatching (the resume loop).
		const ciDeployStage = { id: "s-d", name: "Deploy", type: "ci", command: "./deploy.sh --prod" };
		const store = makeStore({
			projects: [{ id: "p-1", name: "P", cwd: "/repo", stages: [ciDeployStage] }],
		});
		const checkpoint = {
			status: "running",
			pid: 4242,
			startedAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};
		store.deployManager = {
			readJson: (name) =>
				name === "attempt-deploy-t-1-1.json" ? checkpoint : null,
			isPidAlive: () => true,
		};
		const parked = store.seed(
			"p-1",
			task({
				status: "interrupted",
				currentStageId: "s-d",
				deployAttemptId: "deploy-t-1-1",
			}),
		);
		await expect(reconcileInterruptedDeploys(store)).resolves.toEqual([]);
		expect(store.advanceStage).not.toHaveBeenCalled();
		expect(store.handleStageFailure).not.toHaveBeenCalled();
		expect(parked.deployAttemptInFlightNoted).toBe("deploy-t-1-1");
	});

	it("accepts a newer build even when started before stage entry", async () => {
		const store = deployStore(
			{ enteredStageAt: "2026-09-24T10:00:00.000Z", deployBuildAtEntry: 5 },
			{ status: "deploying", startedAt: "2026-09-24T09:00:00.000Z", buildNumber: 6, finishedAt: "2026-09-24T09:01:00.000Z" },
		);
		await expect(reconcileInterruptedDeploys(store)).resolves.toHaveLength(1);
	});

	it("fails the stage when the deploy result failed", async () => {
		const store = deployStore(
			{ enteredStageAt: "2026-09-24T09:00:00.000Z" },
			{ status: "failed", startedAt: "2026-09-24T10:00:00.000Z", buildNumber: 7, message: "red" },
		);
		await expect(reconcileInterruptedDeploys(store)).resolves.toHaveLength(1);
		expect(store.handleStageFailure).toHaveBeenCalledWith(
			"p-1",
			"t-1",
			deployStage,
			expect.any(Error),
			expect.objectContaining({ projectCwd: "/repo" }),
		);
	});

	it("enriches a reconciled shared-gate failure exactly like the live path (continuation)", async () => {
		// A prod deploy restarts the API, so a failure that settles around the
		// restart must still name its cause and the project blocker instead of
		// degrading to a bare "exit 1".
		const mergeStage = {
			id: "s-m",
			name: "Merge and deploy",
			type: "merge",
			command: "./deploy.sh --prod",
		};
		const store = makeStore({
			projects: [{ id: "p-1", name: "P", cwd: "/repo", stages: [mergeStage] }],
		});
		store.deployManager = {
			readJson: (name) =>
				name === "last-result.json"
					? {
							status: "failed",
							startedAt: "2026-09-24T10:00:00.000Z",
							message: "Gate 'canary-e2e' failed (exit 1)",
							failedCommand: "npm run test:canary",
							deployAttemptId: "deploy-t-1-9",
						}
						: null,
			readHistory: () => [
				{
					status: "failed",
					message: "Gate 'canary-e2e' failed (exit 1)",
					headSha: "abc123",
				},
			],
		};
		store.seed(
			"p-1",
			task({
				status: "interrupted",
				currentStageId: "s-m",
				enteredStageAt: "2026-09-24T09:00:00.000Z",
				deployAttemptId: "deploy-t-1-9",
				preMergeMainSha: "abc123",
			}),
		);
		await expect(reconcileInterruptedDeploys(store)).resolves.toHaveLength(1);
		const failure = store.handleStageFailure.mock.calls[0][3];
		expect(failure.message).toContain("Deploy command `./deploy.sh --prod` failed");
		expect(failure.message).toContain("no task change will pass");
		expect(failure.deployGate).toBe("canary-e2e");
		expect(failure.deployFailedCommand).toBe("npm run test:canary");
		expect(failure.projectBlocker).toMatchObject({
			gate: "canary-e2e",
			mainSha: "abc123",
			key: "canary-e2e@abc123",
		});
	});

	it("skips stale, result-less, and non-deploy interruptions", async () => {
		const agentStore = makeStore({
			projects: [{ id: "p-1", name: "P", cwd: "/repo", stages: STAGES }],
		});
		agentStore.deployManager = { readJson: () => ({ status: "success", startedAt: "2026-09-24T10:00:00.000Z", buildNumber: 1 }) };
		agentStore.seed("p-1", task({ status: "interrupted", currentStageId: "s-1" }));
		expect(await reconcileInterruptedDeploys(agentStore)).toEqual([]);

		const stale = deployStore(
			{ enteredStageAt: "2026-09-24T10:00:00.000Z" },
			{ status: "success", startedAt: "2026-09-24T09:00:00.000Z", buildNumber: 1 },
		);
		expect(await reconcileInterruptedDeploys(stale)).toEqual([]);

		const noResult = deployStore({ enteredStageAt: "2026-09-24T09:00:00.000Z" }, null);
		expect(await reconcileInterruptedDeploys(noResult)).toEqual([]);

		const unstarted = deployStore(
			{ enteredStageAt: "2026-09-24T09:00:00.000Z" },
			{ status: "success", buildNumber: 1 },
		);
		expect(await reconcileInterruptedDeploys(unstarted)).toEqual([]);
	});

	it("covers running_deploy tasks without a matching stage", async () => {
		const store = makeStore({
			projects: [{ id: "p-1", name: "P", cwd: "/repo", stages: STAGES }],
		});
		store.deployManager = { readJson: () => null };
		store.seed("p-1", task({ status: "running_deploy", currentStageId: "ghost" }));
		expect(await reconcileInterruptedDeploys(store)).toEqual([]);
	});

	it("reconciles an interrupted merge-and-deploy stage on success", async () => {
		const mergeDeploy = { id: "s-m", name: "Merge and deploy", type: "merge", command: "./deploy.sh --prod" };
		const store = makeStore({
			projects: [{ id: "p-1", name: "P", cwd: "/repo", stages: [mergeDeploy] }],
		});
		store.deployManager = {
			readJson: () => ({
				status: "success",
				startedAt: "2026-09-24T10:00:00.000Z",
				buildNumber: 8,
				finishedAt: "2026-09-24T10:01:00.000Z",
			}),
		};
		store.seed(
			"p-1",
			task({
				status: "interrupted",
				currentStageId: "s-m",
				enteredStageAt: "2026-09-24T09:00:00.000Z",
				deployBuildAtEntry: 7,
			}),
		);
		await expect(reconcileInterruptedDeploys(store)).resolves.toEqual([
			{ projectId: "p-1", taskId: "t-1" },
		]);
		expect(store.advanceStage).toHaveBeenCalled();
	});

	it("reconciles a still-running_merge task left behind by the restart", async () => {
		const mergeDeploy = { id: "s-m", name: "Merge and deploy", type: "merge", command: "./deploy.sh --prod" };
		const store = makeStore({
			projects: [{ id: "p-1", name: "P", cwd: "/repo", stages: [mergeDeploy] }],
		});
		store.deployManager = {
			readJson: () => ({
				status: "deploying",
				startedAt: "2026-09-24T10:00:00.000Z",
				buildNumber: 8,
				finishedAt: "2026-09-24T10:01:00.000Z",
			}),
		};
		store.seed(
			"p-1",
			task({
				status: "running_merge",
				currentStageId: "s-m",
				enteredStageAt: "2026-09-24T09:00:00.000Z",
			}),
		);
		await expect(reconcileInterruptedDeploys(store)).resolves.toEqual([
			{ projectId: "p-1", taskId: "t-1" },
		]);
		expect(store.advanceStage).toHaveBeenCalled();
	});

	it("parks a merge-and-deploy task without failback when the deploy result failed", async () => {
		const mergeDeploy = { id: "s-m", name: "Merge and deploy", type: "merge", command: "./deploy.sh --prod" };
		const store = makeStore({
			projects: [{ id: "p-1", name: "P", cwd: "/repo", stages: [mergeDeploy] }],
		});
		store.deployManager = {
			readJson: () => ({
				status: "failed",
				startedAt: "2026-09-24T10:00:00.000Z",
				buildNumber: 8,
				message: "health check failed",
			}),
		};
		store.seed(
			"p-1",
			task({
				status: "interrupted",
				currentStageId: "s-m",
				enteredStageAt: "2026-09-24T09:00:00.000Z",
			}),
		);
		await expect(reconcileInterruptedDeploys(store)).resolves.toHaveLength(1);
		expect(store.handleStageFailure).toHaveBeenCalledWith(
			"p-1",
			"t-1",
			mergeDeploy,
			expect.any(Error),
			expect.objectContaining({ projectCwd: "/repo", skipFailback: true }),
		);
	});

	it("ignores merge stages whose command is not a deploy", async () => {
		const plainMerge = { id: "s-m", name: "Merge", type: "merge", command: "echo merged" };
		const store = makeStore({
			projects: [{ id: "p-1", name: "P", cwd: "/repo", stages: [plainMerge] }],
		});
		store.deployManager = {
			readJson: () => ({
				status: "success",
				startedAt: "2026-09-24T10:00:00.000Z",
				buildNumber: 8,
			}),
		};
		store.seed("p-1", task({ status: "interrupted", currentStageId: "s-m" }));
		expect(await reconcileInterruptedDeploys(store)).toEqual([]);
		expect(store.advanceStage).not.toHaveBeenCalled();
	});

	it("isolates a per-task failure so later tasks still reconcile", async () => {
		const mergeDeploy = { id: "s-m", name: "Merge and deploy", type: "merge", command: "./deploy.sh --prod" };
		const store = makeStore({
			projects: [{ id: "p-1", name: "P", cwd: "/repo", stages: [mergeDeploy] }],
		});
		store.deployManager = {
			readJson: () => ({
				status: "success",
				startedAt: "2026-09-24T10:00:00.000Z",
				buildNumber: 8,
			}),
		};
		store.seed(
			"p-1",
			task({
				id: "t-bad",
				status: "interrupted",
				currentStageId: "s-m",
				enteredStageAt: "2026-09-24T09:00:00.000Z",
			}),
		);
		store.seed(
			"p-1",
			task({
				id: "t-good",
				status: "interrupted",
				currentStageId: "s-m",
				enteredStageAt: "2026-09-24T09:00:00.000Z",
			}),
		);
		// The first task's advance throws (corrupt state, disk error, ...):
		// it must be recorded and skipped, never aborting the second task.
		store.advanceStage.mockImplementationOnce(() => {
			throw new Error("advance exploded");
		});
		const reconciled = await reconcileInterruptedDeploys(store);
		expect(reconciled).toEqual([{ projectId: "p-1", taskId: "t-good" }]);
		expect(store._recordHistory).toHaveBeenCalledWith(
			expect.objectContaining({ id: "t-bad" }),
			expect.stringContaining("Deploy reconciliation skipped"),
			expect.any(String),
		);
	});

	it("treats a throwing last-result read as a skip, not a crash", async () => {
		const mergeDeploy = { id: "s-m", name: "Merge and deploy", type: "merge", command: "./deploy.sh --prod" };
		const store = makeStore({
			projects: [{ id: "p-1", name: "P", cwd: "/repo", stages: [mergeDeploy] }],
		});
		store.deployManager = {
			readJson: () => {
				throw new Error("disk unreadable");
			},
		};
		store.seed("p-1", task({ status: "interrupted", currentStageId: "s-m" }));
		await expect(reconcileInterruptedDeploys(store)).resolves.toEqual([]);
		expect(store.advanceStage).not.toHaveBeenCalled();
		expect(store.handleStageFailure).not.toHaveBeenCalled();
	});
});


describe("isDeployDispatchBlocked", () => {
	const mergeDeploy = { id: "s-m", name: "Merge and deploy", type: "merge", command: "./deploy.sh --prod" };
	const plainDeploy = { id: "s-d", name: "Deploy", type: "deploy" };

	it("passes non-deploy stages even while the lock is held", () => {
		const store = makeStore();
		store.deployManager = { isDeployLocked: () => true };
		expect(
			isDeployDispatchBlocked(store, { projectId: "p-1", taskId: "t-1", stage: STAGES[0] }),
		).toEqual({ blocked: false, reason: "" });
	});

	it("passes deploy candidates when nothing holds the lock", () => {
		const store = makeStore();
		expect(
			isDeployDispatchBlocked(store, { projectId: "p-1", taskId: "t-1", stage: mergeDeploy }),
		).toEqual({ blocked: false, reason: "" });
	});

	it("fails open when the probe is missing or throws", () => {
		const store = makeStore();
		store.deployManager = { isDeployLocked: () => { throw new Error("no flock"); } };
		expect(
			isDeployDispatchBlocked(store, { projectId: "p-1", taskId: "t-1", stage: plainDeploy }).blocked,
		).toBe(false);
	});

	it("blocks on a foreign-held deploy lock", () => {
		const store = makeStore();
		store.deployManager = { isDeployLocked: () => true };
		const result = isDeployDispatchBlocked(store, { projectId: "p-1", taskId: "t-1", stage: mergeDeploy });
		expect(result.blocked).toBe(true);
		expect(result.reason).toMatch(/another process/);
	});

	it("defers a ci-typed deploy stage on the same lock (command-based detection)", () => {
		// The post-migration shape: a plain ci stage whose command runs
		// deploy.sh is deploy work and must respect the deploy lock.
		const store = makeStore();
		store.deployManager = { isDeployLocked: () => true };
		const ciDeploy = { id: "s-d2", name: "Deploy", type: "ci", command: "./deploy.sh --prod" };
		const blocked = isDeployDispatchBlocked(store, { projectId: "p-1", taskId: "t-1", stage: ciDeploy });
		expect(blocked.blocked).toBe(true);
		expect(blocked.reason).toMatch(/another process/);
		// A plain ci stage is never blocked by the deploy lock.
		const plainCi = { id: "s-c", name: "Tests", type: "ci", command: "npm test" };
		expect(
			isDeployDispatchBlocked(store, { projectId: "p-1", taskId: "t-1", stage: plainCi }).blocked,
		).toBe(false);
	});

	it("blocks on a live sibling deploy run, never on itself", () => {
		const store = makeStore();
		store.seed("p-1", task({ id: "sibling", status: "running_merge", currentStageId: "s-m" }));
		const blocked = isDeployDispatchBlocked(store, { projectId: "p-1", taskId: "t-1", stage: mergeDeploy });
		expect(blocked.blocked).toBe(true);
		expect(blocked.reason).toMatch(/running_merge/);
		const self = isDeployDispatchBlocked(store, { projectId: "p-1", taskId: "sibling", stage: mergeDeploy });
		expect(self.blocked).toBe(false);
	});
});


describe("noteDeployLockWait", () => {
	it("throttles notes to one per interval", () => {
		const store = makeStore();
		const deferred = task({ projectId: "p-1" });
		noteDeployLockWait(store, deferred, "/repo", "test reason");
		noteDeployLockWait(store, deferred, "/repo", "test reason");
		const notes = deferred.history.filter((entry) =>
			String(entry.action).includes("Waiting for the production deploy lock"),
		);
		expect(notes).toHaveLength(1);
		expect(notes[0].action).toMatch(/test reason/);
	});
});


describe("isLockContentionResult", () => {
	it.each([
		["legacy waiter clobber", { status: "failed", failedCommand: "flock", message: "Another deployment is already in progress" }, true],
		["real gate failure", { status: "failed", failedCommand: "./run-tests.sh", message: "Gate 'final-test-suite' failed (exit 1)" }, false],
		["success", { status: "success", message: "Deployment complete and healthy" }, false],
		["null", null, false],
	])("classifies %s", (_, record, expected) => {
		expect(isLockContentionResult(record)).toBe(expected);
	});
});


describe("reconcileInterruptedDeploys lock-contention guard", () => {
	const deployStage = { id: "s-d", name: "Deploy", type: "deploy" };

	it("ignores a waiter contention record even with a fresh lock-busy sidecar", async () => {
		const store = makeStore({
			projects: [{ id: "p-1", name: "P", cwd: "/repo", stages: [deployStage] }],
		});
		// The sidecar exists (a waiter parked) but reconciliation only ever
		// reads last-result.json — and the record there is contention noise
		// from the pre-fix clobber, which must neither advance nor park.
		store.deployManager = {
			readJson: (name) =>
				name === "lock-busy.json"
					? { status: "lock-busy", startedAt: "2026-09-24T10:05:00.000Z" }
					: {
							status: "failed",
							startedAt: "2026-09-24T10:04:00.000Z",
							finishedAt: "2026-09-24T10:04:30.000Z",
							buildNumber: 7,
							message: "Another deployment is already in progress",
							failedCommand: "flock",
						},
		};
		const parked = store.seed(
			"p-1",
			task({ status: "interrupted", currentStageId: "s-d", enteredStageAt: "2026-09-24T09:00:00.000Z" }),
		);
		await expect(reconcileInterruptedDeploys(store)).resolves.toEqual([]);
		expect(store.advanceStage).not.toHaveBeenCalled();
		expect(store.handleStageFailure).not.toHaveBeenCalled();
		expect(parked.status).toBe("interrupted");
	});

	it("still parks on a genuine fresh gate failure beside a sidecar", async () => {
		const store = makeStore({
			projects: [{ id: "p-1", name: "P", cwd: "/repo", stages: [deployStage] }],
		});
		store.deployManager = {
			readJson: (name) =>
				name === "lock-busy.json"
					? { status: "lock-busy", startedAt: "2026-09-24T10:05:00.000Z" }
					: {
							status: "failed",
							startedAt: "2026-09-24T10:04:00.000Z",
							finishedAt: "2026-09-24T10:04:30.000Z",
							buildNumber: 7,
							message: "Gate 'final-test-suite' failed (exit 1)",
							failedCommand: "./run-tests.sh",
						},
		};
		store.seed(
			"p-1",
			task({ status: "interrupted", currentStageId: "s-d", enteredStageAt: "2026-09-24T09:00:00.000Z" }),
		);
		await expect(reconcileInterruptedDeploys(store)).resolves.toHaveLength(1);
		expect(store.handleStageFailure).toHaveBeenCalledTimes(1);
	});
});


describe("WP6 isRolledBackResult", () => {
	it.each([
		["rolled-back", { status: "rolled-back" }, true],
		["rolled_back", { status: "rolled_back" }, true],
		["flag", { status: "failed", rolledBack: true }, true],
		["failed", { status: "failed" }, false],
		["success", { status: "success" }, false],
		["null", null, false],
	])("classifies %s → %s", (_, record, expected) => {
		expect(isRolledBackResult(record)).toBe(expected);
	});
});


describe("WP6 reconcile decision table", () => {
	const deployStage = { id: "s-d", name: "Deploy", type: "deploy" };
	const mergeDeploy = { id: "s-m", name: "Merge and deploy", type: "merge", command: "./deploy.sh --prod" };

	function markedDeployStore(taskOverrides, lastResult, { checkpoint, pidAlive } = {}) {
		const store = makeStore({
			projects: [{ id: "p-1", name: "P", cwd: "/repo", stages: [deployStage, mergeDeploy] }],
		});
		store.deployManager = {
			readJson: (name) => {
				if (typeof name === "string" && name.startsWith("attempt-")) {
					return checkpoint || null;
				}
				return lastResult;
			},
			...(pidAlive !== undefined ? { isPidAlive: pidAlive } : {}),
		};
		store._recordTimeline = vi.fn((t, entry) => {
			t.timeline = t.timeline || [];
			t.timeline.push(entry);
		});
		store.seed("p-1", task({ status: "interrupted", ...taskOverrides }));
		return store;
	}

	it("stale result + markers resumes WITHOUT advancing on the stale evidence", async () => {
		const store = markedDeployStore(
			{ currentStageId: "s-d", enteredStageAt: "2026-09-24T10:00:00.000Z", deployAttemptId: "deploy-t-1-9" },
			{ status: "success", startedAt: "2026-09-24T09:00:00.000Z", buildNumber: 1, finishedAt: "2026-09-24T09:01:00.000Z" },
		);
		await expect(reconcileInterruptedDeploys(store)).resolves.toEqual([
			{ projectId: "p-1", taskId: "t-1" },
		]);
		const resumed = store.getTask("p-1", "t-1");
		expect(resumed.status).toBe("in_stage");
		expect(store.advanceStage).not.toHaveBeenCalled();
		expect(store.handleStageFailure).not.toHaveBeenCalled();
		expect(
			resumed.history.some((h) => String(h.action).includes("no fresh last-result.json")),
		).toBe(true);
		expect((resumed.timeline || []).some((e) => e.status === "Resumed")).toBe(true);
	});

	it("in-flight attempt checkpoint parks ONCE without resuming the merge/deploy stage", async () => {
		// Regression guard for the resume loop: a restart mid-deploy leaves the
		// detached deploy still running (live checkpoint pid). Re-dispatching
		// the merge stage here started a SECOND full deploy + service restart,
		// which interrupted the stage again — four `reconcile-resume` entries
		// and no end. Reconciliation must WAIT for the deploy's own result.
		const alive = vi.fn(() => true);
		const store = markedDeployStore(
			{
				currentStageId: "s-m",
				enteredStageAt: "2026-09-24T10:00:00.000Z",
				deployAttemptId: "deploy-t-1-9",
				mergeAttemptId: "merge-t-1-9",
			},
			{ status: "success", startedAt: "2026-09-24T09:00:00.000Z", buildNumber: 1 },
			{ checkpoint: { status: "running", pid: 4242 }, pidAlive: alive },
		);
		// Three scheduler ticks: the park reason must be recorded exactly once
		// and the task must stay interrupted (never flipped to in_stage).
		await reconcileInterruptedDeploys(store);
		await reconcileInterruptedDeploys(store);
		await reconcileInterruptedDeploys(store);
		const parked = store.getTask("p-1", "t-1");
		expect(parked.status).toBe("interrupted");
		expect(store.advanceStage).not.toHaveBeenCalled();
		expect(store.handleStageFailure).not.toHaveBeenCalled();
		expect(alive).toHaveBeenCalledWith(4242);
		const parkEntries = parked.history.filter(
			(h) => String(h.action).includes(DEPLOY_ATTEMPT_IN_FLIGHT_REASON),
		);
		expect(parkEntries).toHaveLength(1);
		expect(parkEntries[0].action).toContain("deploy-t-1-9");
		// No `reconcile-resume` history at all: the stage was NOT resumed.
		expect(
			parked.history.some((h) => String(h.action).includes("no fresh last-result.json")),
		).toBe(false);
		expect((parked.timeline || []).some((e) => e.status === "Resumed")).toBe(false);
		// And Rule 0 must NOT re-dispatch it: the scheduler would otherwise
		// start the second deploy this whole change exists to prevent.
		expect(hasDeployAttemptWaitMarker(parked)).toBe(true);
		expect(
			isAutoResumableWithReason(parked, mergeDeploy).resumable,
		).toBe(false);
		expect(isResumedStageRunnable(mergeDeploy, { task: parked })).toBe(false);
		expect(findResumedCandidate(store)).toBeNull();
	});

	it("in-flight retry checkpoint wins over a matching stale failed result", async () => {
		// A genuine retry reuses the attempt id, so the previous attempt's
		// terminal `failed` last-result.json still matches the id. Trusting it
		// before the per-attempt checkpoint would fail a demonstrably running
		// retry; the in-flight checkpoint is the more precise, attempt-scoped
		// fact and must win.
		const alive = vi.fn(() => true);
		const store = markedDeployStore(
			{
				currentStageId: "s-d",
				enteredStageAt: "2026-09-24T10:00:00.000Z",
				deployAttemptId: "deploy-t-1-9",
			},
			{
				status: "failed",
				deployAttemptId: "deploy-t-1-9",
				startedAt: "2026-09-24T10:00:00.000Z",
				finishedAt: "2026-09-24T10:01:00.000Z",
				message: "Gate 'final-test-suite' failed",
			},
			{ checkpoint: { status: "running", pid: 4242 }, pidAlive: alive },
		);
		await reconcileInterruptedDeploys(store);
		const parked = store.getTask("p-1", "t-1");
		expect(parked.status).toBe("interrupted");
		expect(store.handleStageFailure).not.toHaveBeenCalled();
		expect(store.advanceStage).not.toHaveBeenCalled();
		expect(alive).toHaveBeenCalledWith(4242);
		expect(hasDeployAttemptWaitMarker(parked)).toBe(true);
	});

	it("clears the wait marker and resumes once the deploy process is gone", async () => {
		const store = markedDeployStore(
			{
				currentStageId: "s-m",
				enteredStageAt: "2026-09-24T10:00:00.000Z",
				deployAttemptId: "deploy-t-1-8",
			},
			null,
			{ checkpoint: { status: "running", pid: 999999 }, pidAlive: () => false },
		);
		// Simulate a previous tick having parked it while the pid was alive.
		store.getTask("p-1", "t-1").deployAttemptInFlightNoted = "deploy-t-1-8";
		await reconcileInterruptedDeploys(store);
		const resumed = store.getTask("p-1", "t-1");
		expect(resumed.status).toBe("in_stage");
		expect(hasDeployAttemptWaitMarker(resumed)).toBe(false);
	});

	it("stale attempt checkpoint (dead pid) falls back to the resume path", async () => {
		const store = markedDeployStore(
			{
				currentStageId: "s-m",
				enteredStageAt: "2026-09-24T10:00:00.000Z",
				deployAttemptId: "deploy-t-1-8",
			},
			null,
			{ checkpoint: { status: "running", pid: 999999 }, pidAlive: () => false },
		);
		await expect(reconcileInterruptedDeploys(store)).resolves.toEqual([
			{ projectId: "p-1", taskId: "t-1" },
		]);
		expect(store.getTask("p-1", "t-1").status).toBe("in_stage");
	});

	it("terminal success checkpoint advances without re-running the deploy", async () => {
		const store = markedDeployStore(
			{
				currentStageId: "s-d",
				enteredStageAt: "2026-09-24T10:00:00.000Z",
				deployAttemptId: "deploy-t-1-7",
				deployBuildAtEntry: 3,
			},
			null,
			{
				checkpoint: {
					status: "success",
					buildNumber: 4,
					updatedAt: "2026-09-24T10:05:00.000Z",
					message: "Deployment complete and healthy",
				},
			},
		);
		await reconcileInterruptedDeploys(store);
		expect(store.advanceStage).toHaveBeenCalledTimes(1);
		expect(store.handleStageFailure).not.toHaveBeenCalled();
		const advanced = store.getTask("p-1", "t-1");
		expect(advanced.status).toBe("in_stage");
		// Consumed markers: a later deploy-like stage must not adopt this
		// attempt's checkpoint as its own.
		expect(advanced.deployAttemptId).toBeUndefined();
		expect(advanced.deployBuildAtEntry).toBeUndefined();
	});

	it("checkpoint success without a build still advances via the entry build", async () => {
		// Old checkpoints (written before buildNumber existed) carry no build;
		// with no fresh last-result.json either, the stage-entry marker is the
		// last build attribution left — never record "build undefined".
		const store = markedDeployStore(
			{
				currentStageId: "s-d",
				enteredStageAt: "2026-09-24T10:00:00.000Z",
				deployAttemptId: "deploy-t-1-7",
				deployBuildAtEntry: 3,
			},
			null,
			{
				checkpoint: {
					status: "success",
					updatedAt: "2026-09-24T10:05:00.000Z",
					message: "Deployment complete and healthy",
				},
			},
		);
		await reconcileInterruptedDeploys(store);
		expect(store.advanceStage).toHaveBeenCalledTimes(1);
		const advanced = store.getTask("p-1", "t-1");
		expect(
			advanced.history.some((h) => String(h.action).includes("build 3")),
		).toBe(true);
		expect(
			advanced.history.some((h) => String(h.action).includes("undefined")),
		).toBe(false);
	});

	it("failed attempt checkpoint on a landed merge parks with skipFailback", async () => {
		const store = markedDeployStore(
			{
				currentStageId: "s-m",
				enteredStageAt: "2026-09-24T10:00:00.000Z",
				deployAttemptId: "deploy-t-1-6",
			},
			null,
			{ checkpoint: { status: "failed", message: "Gate 'final-test-suite' failed" } },
		);
		await reconcileInterruptedDeploys(store);
		expect(store.handleStageFailure).toHaveBeenCalledTimes(1);
		expect(store.handleStageFailure).toHaveBeenCalledWith(
			"p-1",
			"t-1",
			expect.objectContaining({ id: "s-m" }),
			expect.any(Error),
			expect.objectContaining({ skipFailback: true }),
		);
	});

	it("readDeployAttemptCheckpoint / isDeployAttemptInFlight are total on bad input", () => {
		expect(readDeployAttemptCheckpoint(makeStore(), "")).toBeNull();
		expect(readDeployAttemptCheckpoint(makeStore(), undefined)).toBeNull();
		expect(readDeployAttemptCheckpoint(makeStore(), "d-1")).toBeNull();
		expect(
			readDeployAttemptCheckpoint(
				{ deployManager: { readJson: () => [] } },
				"d-1",
			),
		).toBeNull();
		expect(isDeployAttemptInFlight(makeStore(), { status: "running", pid: 1 })).toBe(false);
		expect(
			isDeployAttemptInFlight(
				{ deployManager: { isPidAlive: () => true } },
				{ status: "deploying", pid: 1 },
			),
		).toBe(false);
		expect(
			isDeployAttemptInFlight(
				{ deployManager: { isPidAlive: () => true } },
				{ status: "running", pid: 0 },
			),
		).toBe(false);
	});

	it("missing result + merge markers resumes the merge stage", async () => {
		const store = markedDeployStore(
			{ currentStageId: "s-m", enteredStageAt: "2026-09-24T10:00:00.000Z", preMergeMainSha: "abc", mergeAttemptId: "merge-t-1-1" },
			null,
		);
		await expect(reconcileInterruptedDeploys(store)).resolves.toEqual([
			{ projectId: "p-1", taskId: "t-1" },
		]);
		expect(store.getTask("p-1", "t-1").status).toBe("in_stage");
		expect(store.advanceStage).not.toHaveBeenCalled();
	});

	it("running_merge with markers normalises to a Rule 0 resume", async () => {
		const store = markedDeployStore(
			{ status: "running_merge", currentStageId: "s-m", enteredStageAt: "2026-09-24T10:00:00.000Z", mergeAttemptId: "merge-t-1-2" },
			null,
		);
		await expect(reconcileInterruptedDeploys(store)).resolves.toEqual([
			{ projectId: "p-1", taskId: "t-1" },
		]);
		expect(store.getTask("p-1", "t-1").status).toBe("in_stage");
	});

	it("markerless + stale result parks WITH a recorded reason (no silent park)", async () => {
		const store = markedDeployStore(
			{ currentStageId: "s-d", enteredStageAt: "2026-09-24T10:00:00.000Z" },
			{ status: "success", startedAt: "2026-09-24T09:00:00.000Z", buildNumber: 1 },
		);
		await expect(reconcileInterruptedDeploys(store)).resolves.toEqual([]);
		const parked = store.getTask("p-1", "t-1");
		expect(parked.status).toBe("interrupted");
		expect(store.advanceStage).not.toHaveBeenCalled();
		expect(
			parked.history.some((h) => String(h.action).includes("no rehydration markers")),
		).toBe(true);
	});

	it("records the markerless park reason once across repeated reconcile passes", async () => {
		// Regression guard: `reconcileInterruptedDeploys` runs EVERY scheduler
		// tick (~3s), so an unguarded reason write would append history and
		// rewrite the task file forever for a permanently parked task.
		const store = markedDeployStore(
			{ currentStageId: "s-d", enteredStageAt: "2026-09-24T10:00:00.000Z" },
			{ status: "success", startedAt: "2026-09-24T09:00:00.000Z", buildNumber: 1 },
		);
		await reconcileInterruptedDeploys(store);
		await reconcileInterruptedDeploys(store);
		await reconcileInterruptedDeploys(store);
		const parked = store.getTask("p-1", "t-1");
		const parkEntries = parked.history.filter((h) =>
			String(h.action).includes("no rehydration markers"),
		);
		expect(parkEntries).toHaveLength(1);
		// One history write and one persistence for the whole run, not one per
		// tick.
		expect(store._recordHistory).toHaveBeenCalledTimes(1);
		expect(store._saveTaskMarkdown).toHaveBeenCalledTimes(1);
	});

	it("a rolled-back result on a landed merge stage keeps skipFailback (no rewind)", async () => {
		// Regression guard: the dedicated rolled-back branch must carry the same
		// no-rewind guard as the generic merge failure branch; merged work is
		// never sent back to "In Progress".
		const store = markedDeployStore(
			{
				currentStageId: "s-m",
				enteredStageAt: "2026-09-24T09:00:00.000Z",
				deployAttemptId: "deploy-t-1-5",
			},
			{ status: "rolled-back", startedAt: "2026-09-24T10:00:00.000Z", buildNumber: 7 },
		);
		await reconcileInterruptedDeploys(store);
		expect(store.handleStageFailure).toHaveBeenCalledTimes(1);
		expect(store.handleStageFailure).toHaveBeenCalledWith(
			"p-1",
			"t-1",
			expect.objectContaining({ id: "s-m" }),
			expect.any(Error),
			expect.objectContaining({ skipFailback: true }),
		);
	});

	it("a non-fresh rolled-back result on a merge stage also keeps skipFailback", async () => {
		const store = markedDeployStore(
			{ currentStageId: "s-m", enteredStageAt: "2026-09-24T10:00:00.000Z" },
			{ status: "rolled-back", startedAt: "2026-09-24T09:00:00.000Z", buildNumber: 1 },
		);
		await reconcileInterruptedDeploys(store);
		expect(store.handleStageFailure).toHaveBeenCalledWith(
			"p-1",
			"t-1",
			expect.objectContaining({ id: "s-m" }),
			expect.any(Error),
			expect.objectContaining({ skipFailback: true }),
		);
	});

	it("rolled-back result fails back with evidence and never resumes", async () => {
		const store = markedDeployStore(
			{ currentStageId: "s-d", enteredStageAt: "2026-09-24T09:00:00.000Z", deployAttemptId: "deploy-t-1-3" },
			{ status: "rolled-back", startedAt: "2026-09-24T10:00:00.000Z", buildNumber: 7, message: "restored .prev" },
		);
		await expect(reconcileInterruptedDeploys(store)).resolves.toEqual([
			{ projectId: "p-1", taskId: "t-1" },
		]);
		expect(store.handleStageFailure).toHaveBeenCalledTimes(1);
		expect(store.getTask("p-1", "t-1").status).toBe("interrupted");
	});

	it("autoResumeTask records a Resumed timeline entry carrying evidence", () => {
		const store = markedDeployStore(
			{ currentStageId: "s-d", preMergeMainSha: "abc123", deployAttemptId: "deploy-t-1-4" },
			{ status: "success", startedAt: new Date(Date.now() - 30_000).toISOString(), finishedAt: new Date(Date.now() - 20_000).toISOString() },
		);
		autoResumeTask(store, "p-1", "t-1", "/repo", { reason: "test-verdict" });
		const resumed = store.getTask("p-1", "t-1");
		expect(resumed.status).toBe("in_stage");
		// Generic evidence carries only the generic (merge) markers: deploy
		// entry markers are continuity-owned and must not leak into the
		// generic resume evidence.
		expect(store._recordTimeline).toHaveBeenCalledWith(
			resumed,
			expect.objectContaining({
				status: "Resumed",
				reason: "test-verdict",
				markers: ["preMergeMainSha"],
				verdict: "auto-resumed",
			}),
		);
	});
});


describe("WP6 reconcile with a real DeployManager checkpoint (end-to-end)", () => {
	const deployStage = { id: "s-d", name: "Deploy", type: "deploy" };
	let deployDir;
	let manager;

	beforeEach(() => {
		deployDir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-reconcile-e2e-"));
		manager = new DeployManager({ deployDir, repoRoot: "/repo", prodDir: path.join(deployDir, "prod") });
	});

	function realStore(overrides = {}) {
		const store = makeStore({
			projects: [{ id: "p-1", name: "P", cwd: "/repo", stages: [deployStage] }],
		});
		store.deployManager = manager;
		store.seed("p-1", task({ status: "interrupted", currentStageId: "s-d", ...overrides }));
		return store;
	}

	it("waits (no resume, no advance) while the attempt process is still alive", async () => {
		const attemptId = "deploy-e2e-1";
		fs.writeFileSync(
			path.join(deployDir, `attempt-${attemptId}.json`),
			JSON.stringify({
				attemptId,
				status: "running",
				// process.pid is this test runner — provably alive.
				pid: process.pid,
				startedAt: new Date(Date.now() - 60_000).toISOString(),
				updatedAt: new Date(Date.now() - 1000).toISOString(),
			}),
		);
		const store = realStore({
			deployAttemptId: attemptId,
			enteredStageAt: "2026-09-24T10:00:00.000Z",
		});
		const reconciled = await reconcileInterruptedDeploys(store);
		// Nothing acted on: the deploy is in flight, so the tick waits for it.
		expect(reconciled).toEqual([]);
		const parked = store.getTask("p-1", "t-1");
		expect(parked.status).toBe("interrupted");
		expect(store.advanceStage).not.toHaveBeenCalled();
		expect(
			parked.history.some((h) => String(h.action).includes(DEPLOY_ATTEMPT_IN_FLIGHT_REASON)),
		).toBe(true);
	});

	it("waits on a freshly refreshed checkpoint even when the pid reads dead (no duplicate deploy)", async () => {
		const attemptId = "deploy-e2e-3";
		fs.writeFileSync(
			path.join(deployDir, `attempt-${attemptId}.json`),
			JSON.stringify({
				attemptId,
				status: "running",
				// Provably dead pid, but the heartbeat ticker refreshed 5s ago.
				pid: 2147483647,
				startedAt: new Date(Date.now() - 600_000).toISOString(),
				updatedAt: new Date(Date.now() - 5_000).toISOString(),
			}),
		);
		const store = realStore({
			deployAttemptId: attemptId,
			enteredStageAt: "2026-09-24T10:00:00.000Z",
		});
		const reconciled = await reconcileInterruptedDeploys(store);
		expect(reconciled).toEqual([]);
		expect(store.getTask("p-1", "t-1").status).toBe("interrupted");
		expect(store.advanceStage).not.toHaveBeenCalled();
	});

	it("resumes when the checkpoint pid is dead AND the refresh is stale (deploy really died)", async () => {
		const attemptId = "deploy-e2e-4";
		fs.writeFileSync(
			path.join(deployDir, `attempt-${attemptId}.json`),
			JSON.stringify({
				attemptId,
				status: "running",
				pid: 2147483647,
				startedAt: new Date(Date.now() - 3_600_000).toISOString(),
				updatedAt: new Date(Date.now() - 3_600_000).toISOString(),
			}),
		);
		const store = realStore({
			deployAttemptId: attemptId,
			deployBuildAtEntry: 7,
			enteredStageAt: "2026-09-24T10:00:00.000Z",
		});
		const reconciled = await reconcileInterruptedDeploys(store);
		// No live deploy for this attempt: resume under Rule 0 so the stage
		// re-runs from its known-safe point (a genuine retry, not a duplicate).
		expect(reconciled).toEqual([{ projectId: "p-1", taskId: "t-1" }]);
		expect(store.getTask("p-1", "t-1").status).toBe("in_stage");
	});

	it("advances once a fresh success result lands for the attempt (no re-dispatch)", async () => {
		const attemptId = "deploy-e2e-2";
		fs.writeFileSync(
			path.join(deployDir, "last-result.json"),
			JSON.stringify({
				status: "success",
				buildNumber: 12,
				deployAttemptId: attemptId,
				startedAt: new Date(Date.now() - 10_000).toISOString(),
				finishedAt: new Date().toISOString(),
				message: "Deployment complete and healthy",
			}),
		);
		const store = realStore({
			deployAttemptId: attemptId,
			enteredStageAt: "2026-09-24T10:00:00.000Z",
		});
		await reconcileInterruptedDeploys(store);
		expect(store.advanceStage).toHaveBeenCalledTimes(1);
		expect(store.getTask("p-1", "t-1").status).toBe("in_stage");
	});

	it("waits when a retry's live checkpoint coexists with the prior attempt's failed result", async () => {
		// Real deploy.sh writes the new `running` checkpoint at retry entry
		// BEFORE its gates finish, while `last-result.json` still holds the
		// previous attempt's `failed` record under the same (reused) id. The
		// per-attempt checkpoint must win: the retry is demonstrably running.
		const attemptId = "deploy-e2e-5";
		fs.writeFileSync(
			path.join(deployDir, `attempt-${attemptId}.json`),
			JSON.stringify({
				attemptId,
				status: "running",
				pid: process.pid,
				startedAt: new Date(Date.now() - 60_000).toISOString(),
				updatedAt: new Date(Date.now() - 1_000).toISOString(),
			}),
		);
		fs.writeFileSync(
			path.join(deployDir, "last-result.json"),
			JSON.stringify({
				status: "failed",
				buildNumber: 11,
				deployAttemptId: attemptId,
				startedAt: new Date(Date.now() - 120_000).toISOString(),
				finishedAt: new Date(Date.now() - 60_000).toISOString(),
				message: "Gate 'final-test-suite' failed",
			}),
		);
		const store = realStore({
			deployAttemptId: attemptId,
			enteredStageAt: "2026-09-24T10:00:00.000Z",
		});
		const reconciled = await reconcileInterruptedDeploys(store);
		expect(reconciled).toEqual([]);
		expect(store.getTask("p-1", "t-1").status).toBe("interrupted");
		expect(store.handleStageFailure).not.toHaveBeenCalled();
	});
});


describe("WP6 noteDeployAttemptInFlight once-only park reason", () => {
	it("records once across ticks and stays deduped after a persistence round-trip", () => {
		const store = makeStore();
		const inFlight = task({ status: "interrupted" });
		expect(
			noteDeployAttemptInFlight(store, inFlight, "/repo", {
				attemptId: "deploy-t-1-9",
				pid: 4242,
			}),
		).toBe(true);
		// Second call on the SAME object is a cheap in-process no-op.
		expect(
			noteDeployAttemptInFlight(store, inFlight, "/repo", {
				attemptId: "deploy-t-1-9",
				pid: 4242,
			}),
		).toBe(false);
		// Persistence keeps only timestamp + action, so simulate a reload with
		// that shape: the action-embedded attempt id must still dedup.
		const reloaded = task({
			status: "interrupted",
			history: inFlight.history.map((h) => ({ timestamp: h.timestamp, action: h.action })),
		});
		expect(
			noteDeployAttemptInFlight(store, reloaded, "/repo", {
				attemptId: "deploy-t-1-9",
				pid: 4242,
			}),
		).toBe(false);
		expect(
			reloaded.history.filter((h) =>
				String(h.action).includes(DEPLOY_ATTEMPT_IN_FLIGHT_REASON),
			),
		).toHaveLength(1);
	});

	it("records again for a different attempt id (a new attempt is not silenced)", () => {
		const store = makeStore();
		const first = task({ status: "interrupted" });
		noteDeployAttemptInFlight(store, first, "/repo", { attemptId: "deploy-t-1-1" });
		const second = task({ status: "interrupted", history: [...first.history] });
		expect(
			noteDeployAttemptInFlight(store, second, "/repo", { attemptId: "deploy-t-1-2" }),
		).toBe(true);
	});
});

describe("completeDeployStage fail-safe hardening", () => {
	const deployStage = { id: "s-d", name: "Deploy", type: "deploy" };

	it("advances a history-less task instead of half-flipping it", () => {
		const store = makeStore({
			projects: [{ id: "p-1", name: "P", cwd: "/repo", stages: [deployStage] }],
		});
		const bare = task({ status: "interrupted", currentStageId: "s-d" });
		delete bare.history;
		store.seed("p-1", bare);
		const out = completeDeployStage(store, "p-1", "t-1", deployStage, [deployStage], "/repo", {
			status: "success",
			buildNumber: 9,
			finishedAt: "2026-09-24T10:01:00.000Z",
		});
		expect(out).not.toBeNull();
		expect(store.getTask("p-1", "t-1").status).toBe("in_stage");
		expect(store.getTask("p-1", "t-1").history).toHaveLength(1);
		expect(store.advanceStage).toHaveBeenCalled();
	});

	it("rejects a missing result instead of advancing blind", () => {
		const store = makeStore({
			projects: [{ id: "p-1", name: "P", cwd: "/repo", stages: [deployStage] }],
		});
		store.seed("p-1", task({ status: "interrupted", currentStageId: "s-d" }));
		expect(completeDeployStage(store, "p-1", "t-1", deployStage, [deployStage], "/repo", null)).toBeNull();
		expect(store.getTask("p-1", "t-1").status).toBe("interrupted");
		expect(store.advanceStage).not.toHaveBeenCalled();
	});
});
