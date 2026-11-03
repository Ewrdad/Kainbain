import { describe, it, expect } from "vitest";
import { stampDispatchRunAttribution } from "./runnerRoutes.js";

// stampDispatchRunAttribution is the runner-side mirror of the embedded
// dispatch stamp (executeStage): the requirement the Runner was matched on
// names the run on the task's timeline and reports. Scripted kinds must
// stamp NOTHING — a CI stage showing a model is the original bug.

const makeTask = () => ({
	id: "t1",
	currentStageId: "s1",
	timeline: [{ stage: "Build", status: "Advanced", timestamp: "2026-01-01T00:00:00.000Z" }],
});

const stage = { id: "s1", name: "Build", type: "agent" };

describe("stampDispatchRunAttribution", () => {
	it("stamps the matched harness/model on the task and its arrival row", () => {
		const task = makeTask();
		const saved = [];
		const taskStore = { _saveTaskMarkdown: (cwd, t) => saved.push(t) };
		const attribution = stampDispatchRunAttribution({
			taskStore,
			project: { id: "p1", cwd: "/tmp/p1" },
			task,
			stage,
			stages: [stage],
			req: { harness: "mock", model: "mock-model", kind: "agent" },
		});
		expect(attribution).toEqual({ harnessId: "mock", modelRef: "mock-model" });
		expect(task.currentRunAttribution).toEqual({
			stageId: "s1",
			harnessId: "mock",
			modelRef: "mock-model",
		});
		expect(task.timeline[0]).toMatchObject({ harnessId: "mock", modelRef: "mock-model" });
		expect(saved).toHaveLength(1);
	});

	it("carries a resolved alias's name and target index alongside the model", () => {
		const task = makeTask();
		const attribution = stampDispatchRunAttribution({
			taskStore: { _saveTaskMarkdown: () => {} },
			project: { id: "p1" },
			task,
			stage,
			stages: [stage],
			req: {
				harness: "mock",
				model: "mock-model",
				kind: "agent",
				alias: { name: "worker", targetIndex: 2 },
			},
		});
		expect(attribution).toEqual({
			harnessId: "mock",
			modelRef: "mock-model",
			aliasName: "worker",
			targetIndex: 2,
		});
	});

	it("stamps nothing for CI/merge kinds — no harness, no model, blank rows", () => {
		for (const kind of ["ci", "merge"]) {
			const task = makeTask();
			const attribution = stampDispatchRunAttribution({
				taskStore: { _saveTaskMarkdown: () => {} },
				project: { id: "p1" },
				task,
				stage: { id: "s1", name: "Build", type: kind },
				stages: [{ id: "s1", name: "Build", type: kind }],
				req: { harness: null, model: "", kind },
			});
			expect(attribution).toBeNull();
			expect(task.currentRunAttribution).toBeUndefined();
			expect(task.timeline[0]).not.toHaveProperty("modelRef");
			expect(task.timeline[0]).not.toHaveProperty("harnessId");
		}
	});

	it("normalizes the default sentinel out of the requirement model", () => {
		const task = makeTask();
		const attribution = stampDispatchRunAttribution({
			taskStore: { _saveTaskMarkdown: () => {} },
			project: { id: "p1" },
			task,
			stage,
			stages: [stage],
			req: { harness: "mock", model: "default", kind: "agent" },
		});
		// harness alone still attributes; the fake model never does.
		expect(attribution).toEqual({ harnessId: "mock" });
		expect(task.timeline[0]).not.toHaveProperty("modelRef");
	});

	it("is total on hostile input — never throws, never stamps garbage", () => {
		expect(stampDispatchRunAttribution({})).toBeNull();
		expect(stampDispatchRunAttribution({ task: null, req: {} })).toBeNull();
		expect(
			stampDispatchRunAttribution({
				taskStore: null,
				project: null,
				task: makeTask(),
				stage: null,
				stages: null,
				req: { harness: 42, model: {}, kind: "agent", alias: "raw-string" },
			}),
		).toBeNull();
	});

	it("survives a throwing taskStore (stamp stays in memory)", () => {
		const task = makeTask();
		const attribution = stampDispatchRunAttribution({
			taskStore: {
				_saveTaskMarkdown: () => {
					throw new Error("disk gone");
				},
			},
			project: { id: "p1", cwd: "/nonexistent" },
			task,
			stage,
			stages: [stage],
			req: { harness: "mock", model: "m", kind: "agent" },
		});
		expect(attribution).toEqual({ harnessId: "mock", modelRef: "m" });
		expect(task.currentRunAttribution?.modelRef).toBe("m");
	});
});
