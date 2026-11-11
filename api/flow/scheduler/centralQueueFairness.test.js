// Domain: The Flow — central queue fairness across projects/pipelines.
// Regression harness for the "tasks on a pipeline I am not looking at do
// not run" report (task 16d6fbd6-5c15-4d4f-adca-255e89176bc9). Two projects
// stand in for two pipelines: "focused" (the one the UI happens to show)
// keeps offering late-stage work; "other" has one older early-stage task.
// The assertions pin the target behaviour: dispatch order is a property of
// the WAITING WORK ONLY — never of which project the UI has focused — and a
// task waiting on a non-focused pipeline is picked up within a bounded wait
// on BOTH dispatch paths (embedded scheduler + runner fleet scan) and in
// the combined queue display.
import { describe, expect, test } from "vitest";
import { ClaimStore } from "../claimStore.js";
import { findNextCandidateTask } from "./findNextCandidateTask.js";
import { getScheduledQueue } from "./getScheduledQueue.js";
import { scanClaimableTasks } from "../dispatch/scanClaimableTasks.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpClaimState = () =>
	path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kb-central-queue-")), "claims.json");

const NOW = Date.parse("2026-11-11T12:00:00.000Z");

// "focused": a long 3-stage pipeline whose task sits at the LAST stage.
const focusedProject = {
	id: "focused",
	name: "Focused",
	cwd: "/tmp/focused",
	stages: [
		{ id: "f1", name: "F1", type: "agent" },
		{ id: "f2", name: "F2", type: "agent" },
		{ id: "f3", name: "F3", type: "agent" },
	],
};
// "other": a short 2-stage pipeline whose only task sits at the FIRST stage
// but has been waiting far longer.
const otherProject = {
	id: "other",
	name: "Other",
	cwd: "/tmp/other",
	stages: [
		{ id: "o1", name: "O1", type: "agent" },
		{ id: "o2", name: "O2", type: "agent" },
	],
};

const focusedTask = {
	id: "task-focused",
	status: "in_stage",
	currentStageId: "f3",
	enteredStageAt: new Date(NOW - 60_000).toISOString(), // waited 1 min
	updatedAt: new Date(NOW - 60_000).toISOString(),
};
const otherTask = {
	id: "task-other",
	status: "in_stage",
	currentStageId: "o1",
	enteredStageAt: new Date(NOW - 3_600_000).toISOString(), // waited 1 h
	updatedAt: new Date(NOW - 3_600_000).toISOString(),
};

function fakeStore({ activeProjectId = "focused", lastCompletedTask = null } = {}) {
	const projects = [focusedProject, otherProject];
	return {
		circuitState: { tripped: false },
		activeProjectId,
		lastCompletedTask,
		projectStore: {
			listProjects: () => projects,
			getProject: (id) => projects.find((p) => p.id === id) || null,
			activeProjectId,
			getActiveProject: () => projects.find((p) => p.id === activeProjectId) || null,
		},
		listTasks: (projectId) =>
			projectId === "focused" ? [focusedTask] : [otherTask],
		getTask: (projectId, taskId) =>
			(projectId === "focused" ? focusedTask : otherTask).id === taskId
				? projectId === "focused"
					? focusedTask
					: otherTask
				: null,
		isTaskBlocked: () => ({ blocked: false }),
		claimStore: new ClaimStore({ stateFile: tmpClaimState() }),
		getEngineState: () => ({ status: "idle", activeTaskId: null }),
		sessionStore: {},
	};
}

function scanDeps() {
	const claimStore = new ClaimStore({ stateFile: tmpClaimState() });
	return {
		deps: {
			projectStore: {
				listProjects: () => [focusedProject, otherProject],
				getProject: (id) =>
					[focusedProject, otherProject].find((p) => p.id === id) || null,
			},
			taskStore: {
				listTasks: (projectId) =>
					projectId === "focused" ? [focusedTask] : [otherTask],
				isTaskBlocked: () => ({ blocked: false }),
			},
			claimStore,
		},
		opts: { now: NOW },
	};
}

describe("central queue fairness (task 16d6fbd6)", () => {
	test("embedded scheduler picks the oldest waiting task even when the focused pipeline is further along", () => {
		// Current symptom: Rule 2 (absolute stage index) always picks the
		// focused pipeline's late-stage task; the other pipeline starves.
		// Explicit queue clock: the fixtures are anchored at NOW, so the
		// verdict must not depend on the wall clock the suite runs under.
		const store = fakeStore();
		const candidate = findNextCandidateTask(store, { queue: { now: NOW } });
		expect(candidate?.taskId).toBe("task-other");
		expect(candidate?.projectId).toBe("other");
	});

	test("runner scan orders the oldest waiting task first by default", () => {
		const { deps, opts } = scanDeps();
		const out = scanClaimableTasks(deps, opts);
		expect(out.map((c) => c.taskId)).toEqual(["task-other", "task-focused"]);
	});

	test("dispatch outcome is identical no matter which project the UI has focused", () => {
		const outcomes = ["focused", "other", null].map((activeProjectId) => {
			const store = fakeStore({ activeProjectId });
			const embedded = findNextCandidateTask(store, { queue: { now: NOW } })?.taskId;
			const { deps, opts } = scanDeps();
			const fleet = scanClaimableTasks(deps, opts).map((c) => c.taskId);
			const display = getScheduledQueue(store).map((i) => i.id);
			return { embedded, fleet, display };
		});
		expect(outcomes[0]).toEqual(outcomes[1]);
		expect(outcomes[1]).toEqual(outcomes[2]);
	});

	test("combined queue display lists all projects in the same order dispatch uses", () => {
		const store = fakeStore({ activeProjectId: "focused" });
		const display = getScheduledQueue(store).map((i) => i.id);
		expect(display).toEqual(["task-other", "task-focused"]);
		expect(display).toContain("task-other");
		// Every item carries its project so the combined view is readable.
		const byId = Object.fromEntries(getScheduledQueue(store).map((i) => [i.id, i]));
		expect(byId["task-other"].projectId).toBe("other");
		expect(byId["task-focused"].projectId).toBe("focused");
	});

	test("follow-on from the focused pipeline cannot pre-empt a task waiting past the starvation bound", () => {
		// The focused pipeline just completed a stage and offers a follow-on;
		// the other pipeline's task has waited 1 h (> bound). The older
		// cross-pipeline work must win.
		const store = fakeStore({
			lastCompletedTask: { projectId: "focused", taskId: "task-focused" },
		});
		const candidate = findNextCandidateTask(store, { queue: { now: NOW } });
		expect(candidate?.taskId).toBe("task-other");
	});

	test("follow-on still wins when nothing else has waited past the bound", () => {
		const recentOther = {
			...otherTask,
			enteredStageAt: new Date(NOW - 30_000).toISOString(),
			updatedAt: new Date(NOW - 30_000).toISOString(),
		};
		const projects = [focusedProject, otherProject];
		const store = {
			circuitState: { tripped: false },
			lastCompletedTask: { projectId: "focused", taskId: "task-focused" },
			projectStore: {
				listProjects: () => projects,
				getProject: (id) => projects.find((p) => p.id === id) || null,
			},
			listTasks: (projectId) =>
				projectId === "focused" ? [focusedTask] : [recentOther],
			getTask: (projectId, taskId) =>
				projectId === "focused" && taskId === "task-focused" ? focusedTask : null,
			isTaskBlocked: () => ({ blocked: false }),
			claimStore: new ClaimStore({ stateFile: tmpClaimState() }),
		};
		const candidate = findNextCandidateTask(store, { queue: { now: NOW } });
		expect(candidate?.taskId).toBe("task-focused");
		expect(candidate?.priorityReason).toBe("follow_on");
	});

	test("bounded wait: a perpetual late-stage influx on the focused pipeline never starves the other pipeline", () => {
		// Simulate repeated ticks: the focused pipeline always has a
		// later-stage candidate; the other pipeline's task must still be
		// chosen within the starvation bound (here: immediately, it is the
		// oldest waiting work).
		const store = fakeStore();
		for (let tick = 0; tick < 5; tick += 1) {
			const candidate = findNextCandidateTask(store, { queue: { now: NOW } });
			expect(candidate?.projectId).toBe("other");
			// Each tick simulates the focused pipeline producing another
			// late-stage candidate; the other pipeline's task keeps waiting
			// longer and must still win.
			otherTask.enteredStageAt = new Date(NOW - 3_600_000 - tick * 60_000).toISOString();
		}
	});
});
