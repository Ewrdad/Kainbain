// Domain: The Flow — regression cover for task 072e2cfa: "Reporting on
// actively running stages seems to be confusing".
//
// The reported desync: after a manual operator intervention (a stage move)
// the observability header kept reading `ACTIVE: <old stage>` while the board
// showed the task in the new stage, and it survived a page refresh because
// the stranded stage lived in persisted state. These tests prove, at the
// backend level (no browser), that:
//   1. an operator move while running parks the task and releases the engine
//      (all surfaces agree, refresh-stable);
//   2. an already-stranded persisted engine snapshot is reconciled at read
//      time without a migration;
//   3. the monitor payload's `activeTask` stage agrees with the task's actual
//      pipeline stage.
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TaskStore } from "../taskStore.js";

const stages = [
	{ id: "catchup", name: "Catchup", type: "agent" },
	{ id: "merge", name: "Merge and deploy", type: "merge" },
];

function makeStore() {
	const tempCwd = fs.mkdtempSync(
		path.join(os.tmpdir(), "kainbain-running-stage-"),
	);
	const project = { id: "p1", name: "P1", stages, cwd: tempCwd };
	const projectStore = {
		getProject: () => project,
		listProjects: () => [project],
	};
	const store = new TaskStore({ eventBridge: {}, projectStore });
	return { store, tempCwd, project };
}

describe("running-stage agreement (manual intervention)", () => {
	let entries = [];
	afterEach(() => {
		for (const { store, tempCwd } of entries) {
			try {
				store.stopScheduler();
			} catch {
				// ignore teardown errors
			}
			try {
				fs.rmSync(tempCwd, { recursive: true, force: true });
			} catch {
				// ignore teardown errors
			}
		}
		entries = [];
	});
	const track = (entry) => {
		entries.push(entry);
		return entry;
	};

	it("operator move while running parks the task and releases the engine", async () => {
		const { store, tempCwd } = makeStore();
		track({ store, tempCwd });
		const task = store.createTask("p1", {
			goal: "merge work",
			stageId: "merge",
			projectCwd: tempCwd,
		});
		// Simulate the live merge run owning the engine.
		task.status = "running_merge";
		store.setEngineState({
			status: "running",
			activeTaskId: task.id,
			activeProjectId: "p1",
			activeProjectName: "P1",
			activeStageId: "merge",
			activeStageName: "Merge and deploy",
			activeStageType: "merge",
		});

		// The operator drags the task to Catchup (the UI calls /tasks/:id/move).
		const moved = store.moveToStage(
			"p1",
			task.id,
			"catchup",
			"Moved",
			undefined,
			tempCwd,
			{ operatorMove: true },
		);

		expect(moved.currentStageId).toBe("catchup");
		expect(moved.status).toBe("in_stage");
		const engine = store.getEngineState();
		expect(engine.status).toBe("idle");
		expect(engine.activeTaskId).toBeNull();
		expect(engine.activeStageId).toBeNull();
		expect(engine.activeStageName).toBeNull();

		// Refresh stability: the markdown on disk carries the new stage and no
		// live-looking status, and re-reading the engine state is unchanged.
		const reloaded = store
			.listTasks("p1", tempCwd)
			.find((t) => String(t.id) === String(task.id));
		expect(reloaded.currentStageId).toBe("catchup");
		expect(reloaded.status).not.toMatch(/^running_/);
		expect(store.getEngineState().activeStageName).toBeNull();
	});

	it("reconciles an already-stranded persisted snapshot at read time", async () => {
		const { store, tempCwd } = makeStore();
		track({ store, tempCwd });
		const task = store.createTask("p1", {
			goal: "catchup work",
			stageId: "catchup",
			projectCwd: tempCwd,
		});
		// A stale engine snapshot from before a manual move: the task is in
		// Catchup while the engine still names Merge and deploy.
		task.status = "running_merge";
		store.setEngineState({
			status: "running",
			activeTaskId: task.id,
			activeProjectId: "p1",
			activeProjectName: "P1",
			activeStageId: "merge",
			activeStageName: "Merge and deploy",
			activeStageType: "merge",
		});

		const engine = store.getEngineState();
		expect(engine.activeStageId).toBe("catchup");
		expect(engine.activeStageName).toBe("Catchup");
		expect(engine.activeStageType).toBe("agent");
		expect(engine.stageReconciled).toBe(true);
		// The reconciliation is a read-time projection, never a state mutation.
		expect(store.engineState.activeStageName).toBe("Merge and deploy");
	});

	it("monitor payload's active task stage agrees with the task's real stage", async () => {
		const { store, tempCwd } = makeStore();
		track({ store, tempCwd });
		const task = store.createTask("p1", {
			goal: "catchup work",
			stageId: "catchup",
			projectCwd: tempCwd,
		});
		task.status = "running_merge";
		store.setEngineState({
			status: "running",
			activeTaskId: task.id,
			activeProjectId: "p1",
			activeProjectName: "P1",
			activeStageId: "merge",
			activeStageName: "Merge and deploy",
			activeStageType: "merge",
		});

		const metrics = await store.getObservabilityMetrics("p1");
		expect(metrics.engineState.activeStageName).toBe("Catchup");
		expect(metrics.activeTask.currentStageId).toBe("catchup");
		expect(metrics.activeTask.stageName).toBe("Catchup");
		expect(metrics.activeTask.stageId).toBe("catchup");
	});

	it("operator move mid command-stage run stays parked when the orphaned run settles", async () => {
		// The reported bug is about a merge/deploy run: for command stages
		// the interrupted run settles through handleStageFailure with a
		// plain non-zero exit (no operator-abort marker), which used to fail
		// the task back with a spurious failureReason and auto-retry,
		// undoing the operator's move. This test awaits the settling run.
		const cmdStages = [
			{ id: "plan", name: "Plan", type: "agent", failback: "start" },
			{
				id: "deploy",
				name: "Deploy",
				type: "deploy",
				command: "echo deploying",
				failback: "previous",
			},
		];
		const emitted = [];
		const bridge = {
			emitProcessEvent: (projId, eventName, payload) => {
				emitted.push({ eventName, payload });
			},
			emitSystemLog: () => {},
			emitNotification: () => {},
			broadcastGlobal: () => {},
		};
		const cmdCwd = fs.mkdtempSync(
			path.join(os.tmpdir(), "kainbain-running-stage-cmd-"),
		);
		const cmdProject = { id: "p1", name: "P1", stages: cmdStages, cwd: cmdCwd };
		const cmdProjectStore = {
			getProject: () => cmdProject,
			listProjects: () => [cmdProject],
		};
		const cmdStore = new TaskStore({
			eventBridge: bridge,
			projectStore: cmdProjectStore,
		});
		track({ store: cmdStore, tempCwd: cmdCwd });
		const cmdTask = cmdStore.createTask("p1", {
			goal: "deploy work",
			stageId: "deploy",
			projectCwd: cmdCwd,
		});

		// The deploy command blocks until the operator move lands, then
		// settles the way a killed child does: plain non-zero exit, no abort
		// marker.
		let seenCommand = null;
		let signalStarted;
		const startedGate = new Promise((resolve) => {
			signalStarted = resolve;
		});
		let signalRelease;
		const releaseGate = new Promise((resolve) => {
			signalRelease = resolve;
		});
		const execRunner = async (command) => {
			seenCommand = command;
			signalStarted();
			await releaseGate;
			return { exitCode: 1, stdout: "", stderr: "killed" };
		};

		const runPromise = cmdStore.executeStage("p1", cmdTask.id, {
			stages: cmdStages,
			execRunner,
			projectCwd: cmdCwd,
		});
		await startedGate;
		expect(seenCommand).toBe("echo deploying");
		// The run is live and owns the engine when the operator drags the task.
		expect(cmdStore.getTask("p1", cmdTask.id).status).toBe("running_ci");

		const moved = cmdStore.moveToStage(
			"p1",
			cmdTask.id,
			"plan",
			"Moved",
			undefined,
			cmdCwd,
			{ operatorMove: true },
		);
		expect(moved.currentStageId).toBe("plan");
		expect(moved.status).toBe("in_stage");
		signalRelease();

		// Await the settling orphaned run: it must NOT fail back, retry, or
		// blame the destination stage.
		const result = await runPromise;
		expect(result.status).not.toBe("retrying");
		const settled = cmdStore.getTask("p1", cmdTask.id);
		expect(settled.currentStageId).toBe("plan");
		expect(settled.status).toBe("in_stage");
		expect(settled.failureReason).toBeNull();
		expect(settled.lastError).toBeNull();
		expect(settled.autoRetrying).toBeFalsy();
		expect(settled.autoIterationCount || 0).toBe(0);
		// The superseded marker is consumed, never left behind for later runs.
		expect(settled.supersededStageId).toBeUndefined();
		expect(cmdStore.getEngineState().status).toBe("idle");
		const routed = emitted.filter(
			(e) =>
				e.eventName === "stage:failback" || e.eventName === "stage:auto_retry",
		);
		expect(routed).toEqual([]);

		// A later genuine failure in the destination stage still routes
		// normally: the superseded marker was consumed, not left behind.
		const genuine = cmdStore.handleStageFailure(
			"p1",
			cmdTask.id,
			{ id: "plan", name: "Plan", type: "agent" },
			new Error("genuine plan failure"),
			{ stages: cmdStages, bridge, projectCwd: cmdCwd },
		);
		expect(cmdStore.getTask("p1", cmdTask.id).failureReason).toBe(
			"genuine plan failure",
		);
		expect(genuine.status).not.toBe("in_stage");

		// Refresh stability: the parked destination survives a reload.
		const reloaded = cmdStore
			.listTasks("p1", cmdCwd)
			.find((t) => String(t.id) === String(cmdTask.id));
		expect(reloaded.currentStageId).toBe("plan");
	});

	it("does not mark a stale running_* non-owner as running", async () => {
		const { store, tempCwd } = makeStore();
		track({ store, tempCwd });
		const owner = store.createTask("p1", {
			goal: "owner work",
			stageId: "catchup",
			projectCwd: tempCwd,
		});
		const stale = store.createTask("p1", {
			goal: "stale work",
			stageId: "merge",
			projectCwd: tempCwd,
		});
		owner.status = "running_agent";
		stale.status = "running_merge";
		store.setEngineState({
			status: "running",
			activeTaskId: owner.id,
			activeProjectId: "p1",
			activeProjectName: "P1",
			activeStageId: "catchup",
			activeStageName: "Catchup",
			activeStageType: "agent",
		});

		const metrics = await store.getObservabilityMetrics("p1");
		// Exactly one runner is reported, and it is the owner.
		expect(metrics.stats.running).toBe(1);
		expect(metrics.activeTask.id).toBe(owner.id);
		expect(metrics.activeTask.stageName).toBe("Catchup");
	});
});
