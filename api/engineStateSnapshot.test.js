// Domain: The Flow — engine snapshot is project-independent.
// Pins the single-pipeline contract behind the Now Playing bar: the engine
// snapshot carries the full owner-task snapshot (resolved from the OWNING
// project, never the selected one) plus the global open-task count across
// all projects, so switching projects cannot move the bar.
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TaskStore } from "./taskStore.js";

const stages = [
	{ id: "1", name: "Work", type: "agent", failback: "start" },
	{ id: "2", name: "Gate", type: "human", failback: "any" },
];

function makeStore() {
	const cwdA = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-engsnap-a-"));
	const cwdB = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-engsnap-b-"));
	const projects = [
		{ id: "pA", name: "Project A", stages, cwd: cwdA },
		{ id: "pB", name: "Project B", stages, cwd: cwdB },
	];
	const workflows = {
		"pA:wf-a": { id: "wf-a", name: "Pipeline A" },
		"pB:wf-b": { id: "wf-b", name: "Pipeline B" },
	};
	const projectStore = {
		getProject: (id) => projects.find((p) => p.id === id) || null,
		listProjects: () => [...projects],
		getWorkflow: (projectId, workflowId) =>
			workflows[`${projectId}:${workflowId}`] || null,
	};
	const broadcasts = [];
	const eventBridge = {
		broadcastGlobal: (type, payload) => {
			broadcasts.push({ type, payload });
		},
	};
	const store = new TaskStore({ eventBridge, projectStore });
	return { store, cwds: [cwdA, cwdB], broadcasts };
}

describe("engine snapshot project independence", () => {
	let cleanups = [];
	afterEach(() => {
		for (const { store, cwds } of cleanups) {
			try {
				store.stopScheduler();
			} catch {
				// ignore teardown errors
			}
			for (const cwd of cwds) {
				try {
					fs.rmSync(cwd, { recursive: true, force: true });
				} catch {
					// ignore teardown errors
				}
			}
		}
		cleanups = [];
	});
	const track = (entry) => {
		cleanups.push(entry);
		return entry.store;
	};
	const create = (s, projectId, cwd, goal, workflowId) =>
		s.createTask(projectId, { goal, stageId: "1", projectCwd: cwd, workflowId });

	it("carries the owner snapshot from the owning project while the other project is 'selected'", () => {
		const { store: s, cwds, broadcasts } = makeStore();
		track({ store: s, cwds });
		const owner = create(s, "pB", cwds[1], "owner work in B", "wf-b");
		create(s, "pA", cwds[0], "other work in A", "wf-a");

		s.setEngineState({
			status: "running",
			activeTaskId: owner.id,
			activeProjectId: "pB",
			activeProjectName: "Project B",
		});

		// The bar reads getEngineState (status poll) with project A selected:
		// the snapshot still names B's owner with its display fields.
		const snap = s.getEngineState();
		expect(snap.status).toBe("running");
		expect(snap.activeTaskId).toBe(owner.id);
		expect(snap.activeTask).toMatchObject({
			id: owner.id,
			projectId: "pB",
			projectName: "Project B",
			workflowId: "wf-b",
			workflowName: "Pipeline B",
		});
		expect(snap.activeTask.goal || snap.activeTask.title).toContain(
			"owner work in B",
		);
		// Global queue depth counts open tasks in BOTH projects.
		expect(snap.openQueueDepth).toBe(2);

		// ENGINE_STATE broadcasts carry the same enrichment for live sockets.
		const last = [...broadcasts]
			.reverse()
			.find((b) => b.type === "ENGINE_STATE");
		expect(last?.payload?.activeTask?.id).toBe(owner.id);
		expect(last?.payload?.openQueueDepth).toBe(2);
	});

	it("counts queue depth globally and tracks completion", () => {
		const { store: s, cwds } = makeStore();
		track({ store: s, cwds });
		const a = create(s, "pA", cwds[0], "work A");
		const b = create(s, "pB", cwds[1], "work B");
		expect(s.getEngineState().openQueueDepth).toBe(2);

		s.completeTask("pA", a.id, stages, null, cwds[0]);
		expect(s.getEngineState().openQueueDepth).toBe(1);

		s.completeTask("pB", b.id, stages, null, cwds[1]);
		expect(s.getEngineState().openQueueDepth).toBe(0);
	});

	it("resolves to no owner snapshot when idle or the owner record is gone", () => {
		const { store: s, cwds } = makeStore();
		track({ store: s, cwds });
		create(s, "pA", cwds[0], "work A");

		// Idle engine names no owner but still reports the global depth.
		expect(s.getEngineState()).toMatchObject({
			status: "idle",
			activeTask: null,
			openQueueDepth: 1,
		});

		// Stale owner id (task deleted elsewhere): name nothing, keep depth.
		s.setEngineState({
			status: "running",
			activeTaskId: "task-gone",
			activeProjectId: "pA",
		});
		const snap = s.getEngineState();
		expect(snap.activeTask).toBeNull();
		expect(snap.openQueueDepth).toBe(1);
	});
});
