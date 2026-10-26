// Domain: The Flow — engine guards for terminal/paused work and live runs.
// Regression cover for three production incidents:
//  1. Marking a task done reverted it to an automated stage (an in-flight or
//     queued run settled after the manual complete and advanced/failed back).
//  2. Two tasks ended up running at once (manual dispatch bypassed the busy
//     gate; queued duplicates ran after pause/complete).
//  3. Pausing the engine did not pause it (stop cleared the queue but left
//     the scheduler ticking and the live run executing).
import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TaskStore } from "../taskStore.js";
import { isTerminalTaskStatus } from "./stagePolicy.js";

const stages = [
	{ id: "1", name: "Work", type: "agent", failback: "start" },
	{ id: "2", name: "Gate", type: "human", failback: "any" },
];

function makeStore() {
	const tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-guards-test-"));
	const projectStore = {
		getProject: () => ({ id: "p1", name: "P1", stages, cwd: tempCwd }),
		listProjects: () => [{ id: "p1", name: "P1", stages, cwd: tempCwd }],
	};
	const store = new TaskStore({ eventBridge: {}, projectStore });
	return { store, tempCwd };
}

describe("engine guards for terminal and paused work", () => {
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
		return entry.store;
	};
	const create = (s, tempCwd, overrides = {}) =>
		s.createTask("p1", {
			goal: "guarded",
			stageId: "1",
			projectCwd: tempCwd,
			...overrides,
		});

	it("classifies terminal statuses", () => {
		expect(isTerminalTaskStatus("completed")).toBe(true);
		expect(isTerminalTaskStatus("done")).toBe(true);
		expect(isTerminalTaskStatus("failed")).toBe(true);
		expect(isTerminalTaskStatus("cancelled")).toBe(true);
		expect(isTerminalTaskStatus("in_stage")).toBe(false);
		expect(isTerminalTaskStatus("running_agent")).toBe(false);
		expect(isTerminalTaskStatus("paused")).toBe(false);
		expect(isTerminalTaskStatus(undefined)).toBe(false);
	});

	it("advanceStage on a completed task is a no-op", () => {
		const { store: s, tempCwd } = makeStore();
		track({ store: s, tempCwd });
		const task = create(s, tempCwd);
		s.completeTask("p1", task.id, tempCwd);
		expect(s.getTask("p1", task.id)?.status).toBe("completed");
		const after = s.advanceStage("p1", task.id, stages, undefined, tempCwd);
		expect(after?.status).toBe("completed");
		expect(after?.currentStageId).toBe("1");
	});

	it("failbackStage on a completed task is a no-op", () => {
		const { store: s, tempCwd } = makeStore();
		track({ store: s, tempCwd });
		const task = create(s, tempCwd);
		s.completeTask("p1", task.id, tempCwd);
		const after = s.failbackStage("p1", task.id, stages, null, undefined, tempCwd);
		expect(after?.status).toBe("completed");
		expect(after?.currentStageId).toBe("1");
	});

	it("handleStageFailure on a completed task does not fail back", () => {
		const { store: s, tempCwd } = makeStore();
		track({ store: s, tempCwd });
		const task = create(s, tempCwd);
		s.completeTask("p1", task.id, tempCwd);
		const result = s.handleStageFailure("p1", task.id, stages[0], new Error("late"), {
			stages,
			projectCwd: tempCwd,
		});
		expect(result?.status).toBe("completed");
		expect(s.getTask("p1", task.id)?.status).toBe("completed");
		expect(s.getTask("p1", task.id)?.currentStageId).toBe("1");
	});

	it("handleTransientFailure on a completed task keeps it completed", () => {
		const { store: s, tempCwd } = makeStore();
		track({ store: s, tempCwd });
		const task = create(s, tempCwd);
		s.completeTask("p1", task.id, tempCwd);
		const result = s.handleTransientFailure("p1", task.id, stages[0], new Error("late"), {
			projectCwd: tempCwd,
		});
		expect(result?.status).toBe("completed");
		expect(s.getTask("p1", task.id)?.status).toBe("completed");
	});

	it("a late failure on a paused task does not fail back", () => {
		const { store: s, tempCwd } = makeStore();
		track({ store: s, tempCwd });
		const task = create(s, tempCwd);
		s.pauseTask("p1", task.id, tempCwd);
		const result = s.handleStageFailure("p1", task.id, stages[0], new Error("aborted"), {
			stages,
			projectCwd: tempCwd,
		});
		expect(result?.status).toBe("paused");
		expect(s.getTask("p1", task.id)?.status).toBe("paused");
		expect(s.getTask("p1", task.id)?.currentStageId).toBe("1");
	});

	it("a late transient failure on a paused task does not retry", () => {
		const { store: s, tempCwd } = makeStore();
		track({ store: s, tempCwd });
		const task = create(s, tempCwd);
		s.pauseTask("p1", task.id, tempCwd);
		const result = s.handleTransientFailure("p1", task.id, stages[0], new Error("unreachable"), {
			projectCwd: tempCwd,
		});
		expect(result?.status).toBe("paused");
		expect(s.getTask("p1", task.id)?.status).toBe("paused");
		expect(s.getTask("p1", task.id)?.infraRetryCount || 0).toBe(0);
	});

	it("an explicit re-dispatch of a completed task still runs", async () => {
		// Explicit re-runs are legitimate (the Env-probe contract re-runs a
		// completed task); only jobs that were already queued when the task
		// finished are stale.
		const { store: s, tempCwd } = makeStore();
		track({ store: s, tempCwd });
		const task = create(s, tempCwd);
		s.completeTask("p1", task.id, tempCwd);
		const agentRunner = vi.fn(async () => "# out\nre-run");
		const result = await s.executeStage("p1", task.id, {
			stages,
			projectCwd: tempCwd,
			agentRunner,
		});
		expect(agentRunner).toHaveBeenCalledTimes(1);
		expect(result?.status).toBe("passed");
	});

	it("a completed task's merge stage is not re-run on re-dispatch", async () => {
		// The human-checkpoint pass's fire-and-forget auto-execute can land
		// AFTER an explicit /execute finished the (fast) merge. Re-running the
		// merge stage of a terminal-completed task finds countUniqueCommits ==
		// 0 and used to park the completed task as failed ("no commits of its
		// own" — 2026-10-06 canary pr-review report). Other stage types keep
		// the re-dispatch contract (Env-probe); a failed task's merge re-run
		// stays the recovery path.
		const { store: s, tempCwd } = makeStore();
		track({ store: s, tempCwd });
		const mergeStages = [{ id: "m", name: "Merge to Main", type: "merge" }];
		const task = create(s, tempCwd);
		s.updateTask("p1", task.id, { currentStageId: "m" }, tempCwd);
		s.completeTask("p1", task.id, tempCwd);

		const result = await s.executeStage("p1", task.id, {
			stages: mergeStages,
			projectCwd: tempCwd,
		});
		expect(result?.status).toBe("completed");
		expect(result?.message).toContain("not re-run");
		const settledTask = s.getTask("p1", task.id);
		expect(settledTask?.status).toBe("completed");
		expect(settledTask?.failureReason ?? null).toBeNull();
	});

	it("a failed task's merge stage re-run stays allowed (recovery path)", async () => {
		const { store: s, tempCwd } = makeStore();
		track({ store: s, tempCwd });
		const mergeStages = [{ id: "m", name: "Merge to Main", type: "merge" }];
		const task = create(s, tempCwd);
		s.updateTask("p1", task.id, { currentStageId: "m" }, tempCwd);
		s.updateTask("p1", task.id, { status: "failed" }, tempCwd);

		const result = await s.executeStage("p1", task.id, {
			stages: mergeStages,
			projectCwd: tempCwd,
		});
		// The merge flow itself ran (and failed on the non-repo cwd) — the
		// guard swallowed nothing: recovery re-runs of failed tasks proceed.
		expect(result?.message ?? "").not.toContain("not re-run");
		expect(
			s.getTask("p1", task.id)?.failureReason ?? "",
		).toContain("merge stage requires git");
	});

	it("executeStage does not run a manually paused task", async () => {
		const { store: s, tempCwd } = makeStore();
		track({ store: s, tempCwd });
		const task = create(s, tempCwd);
		s.pauseTask("p1", task.id, tempCwd);
		const agentRunner = vi.fn(async () => "# out\nnope");
		const result = await s.executeStage("p1", task.id, {
			stages,
			projectCwd: tempCwd,
			agentRunner,
		});
		expect(agentRunner).not.toHaveBeenCalled();
		expect(result?.status).toBe("paused");
		expect(s.getTask("p1", task.id)?.status).toBe("paused");
	});

	it("a job queued behind a long run does not start after complete", async () => {
		const { store: s, tempCwd } = makeStore();
		track({ store: s, tempCwd });
		const holder = create(s, tempCwd);
		const task = create(s, tempCwd);
		let releaseHolder;
		const holderGate = new Promise((resolve) => {
			releaseHolder = resolve;
		});
		const holderRunner = vi.fn(async () => {
			await holderGate;
			return "# out\nfirst";
		});
		const holderPending = s.executeStage("p1", holder.id, {
			stages,
			projectCwd: tempCwd,
			agentRunner: holderRunner,
		});
		// Let the holder claim the queue before queuing the second job.
		await vi.waitFor(() => {
			expect(holderRunner).toHaveBeenCalled();
		});
		const agentRunner = vi.fn(async () => "# out\nlate");
		const pending = s.executeStage("p1", task.id, {
			stages,
			projectCwd: tempCwd,
			agentRunner,
		});
		s.completeTask("p1", task.id, tempCwd);
		releaseHolder();
		await holderPending;
		const result = await pending;
		expect(agentRunner).not.toHaveBeenCalled();
		expect(result?.status).toBe("completed");
		expect(s.getTask("p1", task.id)?.status).toBe("completed");
	});

	it("completeTask on a running task stops the live run", () => {
		const { store: s, tempCwd } = makeStore();
		track({ store: s, tempCwd });
		const task = create(s, tempCwd);
		s.updateTask("p1", task.id, { status: "running_agent" }, tempCwd);
		const kill = vi.fn();
		s._activeChildren.set(task.id, { pid: 999999999, kill });
		const abort = vi.fn();
		s.sessionStore = { get: () => ({ abort }) };
		s.setEngineState({
			status: "running",
			activeTaskId: task.id,
			activeProjectId: "p1",
			activeProjectName: "P1",
			activeStageId: "1",
			activeStageName: "Work",
			activeStageType: "agent",
		});
		const done = s.completeTask("p1", task.id, tempCwd);
		expect(done?.status).toBe("completed");
		expect(kill).toHaveBeenCalledWith("SIGKILL");
		expect(abort).toHaveBeenCalled();
		expect(s.getEngineState().status).toBe("idle");
		expect(s.getEngineState().activeTaskId).toBeNull();
	});

	it("pauseTask on the engine owner halts the live run and holds pause", () => {
		const { store: s, tempCwd } = makeStore();
		track({ store: s, tempCwd });
		const task = create(s, tempCwd);
		s.updateTask("p1", task.id, { status: "running_agent" }, tempCwd);
		const kill = vi.fn();
		s._activeChildren.set(task.id, { pid: 999999999, kill });
		const abort = vi.fn();
		s.sessionStore = { get: () => ({ abort }) };
		s.setEngineState({
			status: "running",
			activeTaskId: task.id,
			activeProjectId: "p1",
			activeProjectName: "P1",
			activeStageId: "1",
			activeStageName: "Work",
			activeStageType: "agent",
		});
		const paused = s.pauseTask("p1", task.id, tempCwd);
		expect(paused?.status).toBe("paused");
		expect(kill).toHaveBeenCalledWith("SIGKILL");
		expect(abort).toHaveBeenCalled();
		expect(s.getEngineState().status).toBe("paused");
	});

	it("pauseTask on a completed task leaves it completed", () => {
		const { store: s, tempCwd } = makeStore();
		track({ store: s, tempCwd });
		const task = create(s, tempCwd);
		s.completeTask("p1", task.id, tempCwd);
		const paused = s.pauseTask("p1", task.id, tempCwd);
		expect(paused?.status).toBe("completed");
	});

	it("cancelProjectExecutions parks running tasks as interrupted", () => {
		const { store: s, tempCwd } = makeStore();
		track({ store: s, tempCwd });
		const task = create(s, tempCwd);
		s.updateTask("p1", task.id, { status: "running_agent" }, tempCwd);
		const kill = vi.fn();
		s._activeChildren.set(task.id, { pid: 999999999, kill });
		s.setEngineState({
			status: "running",
			activeTaskId: task.id,
			activeProjectId: "p1",
			activeProjectName: "P1",
			activeStageId: "1",
			activeStageName: "Work",
			activeStageType: "agent",
		});
		s.cancelProjectExecutions("p1");
		expect(kill).toHaveBeenCalledWith("SIGKILL");
		expect(s.getTask("p1", task.id)?.status).toBe("interrupted");
		expect(s.getTask("p1", task.id)?.wasInterrupted).toBe(true);
		expect(s.getEngineState().status).toBe("idle");
	});

	it("scheduleTick skips paused and completed tasks", async () => {
		const { store: s, tempCwd } = makeStore();
		track({ store: s, tempCwd });
		const paused = create(s, tempCwd);
		s.pauseTask("p1", paused.id, tempCwd);
		const agentRunner = vi.fn(async () => "# out\nnope");
		const tick = await s.scheduleTick({ agentRunner });
		expect(tick).toBeNull();
		expect(agentRunner).not.toHaveBeenCalled();
	});
});
