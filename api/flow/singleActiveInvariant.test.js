// Domain: The Flow — single-active invariant: at most one live runner.
// Characterization + regression cover for "UI says multiple things are
// running at once": the backend serializes execution (ExecutionQueue +
// scheduler busy-gate), so at most one task may ever hold a live running_*
// status, and restart reconcile must collapse every orphaned running_*
// variant (including running_deploy/advancing) to interrupted.
import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TaskStore } from "../taskStore.js";

const stages = [
	{ id: "1", name: "Work", type: "agent", failback: "start" },
	{ id: "2", name: "Gate", type: "human", failback: "any" },
];

function makeStore() {
	const tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-single-active-"));
	const projectStore = {
		getProject: () => ({ id: "p1", name: "P1", stages, cwd: tempCwd }),
		listProjects: () => [{ id: "p1", name: "P1", stages, cwd: tempCwd }],
	};
	const store = new TaskStore({ eventBridge: {}, projectStore });
	return { store, tempCwd };
}

const LIVE_RUNNING = new Set([
	"running_agent",
	"running_ci",
	"running_deploy",
	"running_merge",
	"advancing",
]);

function liveRunnerCount(store) {
	return ["a", "b"]
		.map((suffix) => store.getTask("p1", `task-${suffix}`))
		.filter((t) => t && LIVE_RUNNING.has(t.status)).length;
}

describe("single-active execution invariant", () => {
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
	const create = (s, tempCwd, id, overrides = {}) =>
		s.createTask("p1", {
			goal: `single-active ${id}`,
			stageId: "1",
			projectCwd: tempCwd,
			...overrides,
		});

	it("serializes two dispatches: at most one live running_* status at any moment", async () => {
		const { store: s, tempCwd } = makeStore();
		track({ store: s, tempCwd });
		const first = create(s, tempCwd, "a");
		const second = create(s, tempCwd, "b");
		// Rename to stable ids for the sampler.
		s._getMap("p1").delete(first.id);
		s._getMap("p1").delete(second.id);
		first.id = "task-a";
		second.id = "task-b";
		s._getMap("p1").set("task-a", first);
		s._getMap("p1").set("task-b", second);

		let releaseFirst;
		const firstGate = new Promise((resolve) => {
			releaseFirst = resolve;
		});
		const firstRunner = vi.fn(async () => {
			await firstGate;
			return "# out\nfirst";
		});
		const secondRunner = vi.fn(async () => "# out\nsecond");

		const firstPending = s.executeStage("p1", "task-a", {
			stages,
			projectCwd: tempCwd,
			agentRunner: firstRunner,
		});
		await vi.waitFor(() => {
			expect(firstRunner).toHaveBeenCalled();
		});
		const secondPending = s.executeStage("p1", "task-b", {
			stages,
			projectCwd: tempCwd,
			agentRunner: secondRunner,
		});

		// While the first job holds the queue, sample liveness: the queued
		// job must not mark itself running behind the live one.
		let maxConcurrent = 0;
		for (let i = 0; i < 20; i++) {
			maxConcurrent = Math.max(maxConcurrent, liveRunnerCount(s));
			expect(liveRunnerCount(s)).toBeLessThanOrEqual(1);
			expect(secondRunner).not.toHaveBeenCalled();
			await new Promise((r) => setTimeout(r, 5));
		}
		expect(s.getTask("p1", "task-a")?.status).toBe("running_agent");
		expect(maxConcurrent).toBe(1);

		releaseFirst();
		await firstPending;
		await secondPending;
		expect(firstRunner).toHaveBeenCalledTimes(1);
		expect(secondRunner).toHaveBeenCalledTimes(1);
		expect(liveRunnerCount(s)).toBe(0);
	});

	// Seed the in-memory map directly: listTasks re-parses task markdown
	// from disk (which already normalizes every running_* variant), while
	// reconcileInterruptedRuns operates on the live in-memory objects the
	// API and sockets actually serve.
	const seedInMemory = (s, taskId, status) => {
		const task = {
			id: taskId,
			workflowId: "custom",
			currentStageId: "1",
			status,
			updatedAt: "2026-01-01T00:00:00.000Z",
			history: [],
			reports: [],
		};
		s._getMap("p1").set(task.id, task);
		return task;
	};

	it.each(["running_agent", "running_ci", "running_merge", "running_deploy", "advancing"])(
		"reconcile collapses orphaned %s on a non-owner to interrupted",
		(status) => {
			const { store: s, tempCwd } = makeStore();
			track({ store: s, tempCwd });
			const task = seedInMemory(s, `orphan-${status}`, status);
			// Engine owned by nobody (restart cleared it): every orphan collapses.
			s.setEngineState({
				status: "idle",
				activeTaskId: null,
				activeProjectId: null,
				activeProjectName: null,
				activeStageId: null,
				activeStageName: null,
				activeStageType: null,
			});
			const save = vi.spyOn(s, "_saveTaskMarkdown").mockImplementation(() => {});
			// listTasks scans task markdown from disk only once per project;
			// mark it scanned so the real listTasks serves the seeded map.
			s.scannedProjects.add("p1");
			expect(s.reconcileInterruptedRuns()).toEqual([
				{ projectId: "p1", taskId: task.id },
			]);
			expect(s.getTask("p1", task.id)).toMatchObject({
				status: "interrupted",
				wasInterrupted: true,
			});
			expect(save).toHaveBeenCalledTimes(1);
			// Idempotent: a second pass finds nothing to do.
			expect(s.reconcileInterruptedRuns()).toEqual([]);
			expect(save).toHaveBeenCalledTimes(1);
		},
	);

	it("reconcile never touches the engine owner's live running status", () => {
		const { store: s, tempCwd } = makeStore();
		track({ store: s, tempCwd });
		const task = seedInMemory(s, "owner-task", "running_agent");
		s.setEngineState({
			status: "running",
			activeTaskId: task.id,
			activeProjectId: "p1",
			activeProjectName: "P1",
			activeStageId: "1",
			activeStageName: "Work",
			activeStageType: "agent",
		});
		s.scannedProjects.add("p1");
		expect(s.reconcileInterruptedRuns()).toEqual([]);
		expect(s.getTask("p1", task.id)?.status).toBe("running_agent");
	});
});
