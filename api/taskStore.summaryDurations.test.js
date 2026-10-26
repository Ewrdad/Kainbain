import { describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import tasksRoutes from "./routes/tasks.js";
import { TaskStore, toTaskSummary } from "./taskStore.js";
import { toTaskDurationSummary } from "./taskDurationSummary.js";
import { computeStageAnalytics } from "../frontend/src/components/workflow/stageAnalytics.js";

const stages = [
	{ id: "1", name: "Plan" },
	{ id: "2", name: "Review" },
	{ id: "3", name: "Empty" },
];
const start = "2026-01-01T00:00:00.000Z";
const end = "2026-01-01T00:02:00.000Z";

function boardTasks(task) {
	const project = { id: "p1", stages };
	const store = new TaskStore({
		projectStore: { getProject: () => project },
	});
	store._getMap("p1").set("t1", task);
	return store.listTasks("p1").map((task) => toTaskDurationSummary(task, stages));
}

describe("canonical task list lifecycle", () => {
	it.each(["running_agent", "running_ci", "running_merge"])(
		"reconciles cached %s state once without persisting derived samples",
		(status) => {
			const project = { id: "p1", stages };
			const store = new TaskStore({ projectStore: {
				getProject: () => project,
				listProjects: () => [project],
			} });
			const task = {
				id: "t1", workflowId: "custom", currentStageId: "1", status,
				updatedAt: start, history: [], reports: [],
			};
			store._getMap("p1").set(task.id, task);
			const save = vi.spyOn(store, "_saveTaskMarkdown").mockImplementation(() => {});
			expect(store.reconcileInterruptedRuns()).toEqual([{ projectId: "p1", taskId: "t1" }]);
			expect(store.getTask("p1", "t1")).toMatchObject({ status: "interrupted", wasInterrupted: true });
			expect(task.updatedAt).not.toBe(start);
			expect(task.history).toEqual([{
				timestamp: task.updatedAt,
				action: "Stage execution interrupted by server restart",
			}]);
			expect(store.listTasks("p1")[0]).toBe(task);
			expect(store.listTasks("p1", undefined, "custom")[0]).toBe(task);
			expect(store.getTasks("p1", "custom")[0]).toBe(task);
			expect(task).not.toHaveProperty("stageDurationSamples");
			expect(save).toHaveBeenCalledWith(undefined, task);
			expect(store.reconcileInterruptedRuns()).toEqual([]);
			expect(save).toHaveBeenCalledTimes(1);
			expect(task.history).toHaveLength(1);
		},
	);
});

describe("board summary duration compatibility", () => {
	it("keeps the one-argument compact projection separate from duration enrichment", () => {
		const task = {
			id: "t1", prompt: "curated prompt", processLogs: "large logs",
			logEntries: [{ message: "log" }], stats: { tokens: 100 }, history: [],
			timeline: [{ stage: "Plan", duration: "3m" }],
			reports: [{ stageName: "Plan", content: "**Duration:** 3m" }],
		};
		const original = structuredClone(task);
		expect(toTaskSummary.length).toBe(1);
		const compact = toTaskSummary(task);
		expect(compact).toEqual({ id: "t1", reports: [{ stageName: "Plan" }] });
		const enriched = toTaskDurationSummary(task, stages);
		expect(enriched).toEqual({ ...compact, stageDurationSamples: [
			{ stageId: "1", stageName: "Plan", stageType: "agent", seconds: [180] },
		] });
		expect(toTaskSummary(enriched)).toEqual(enriched);
		expect(task).toEqual(original);
	});

	it("projects duration evidence only at the HTTP board boundary for each workflow", async () => {
		const customStages = [{ id: "9", name: "Build" }];
		const project = { id: "p1", stages, workflows: [{ id: "custom", stages: customStages }] };
		const store = new TaskStore({ projectStore: { getProject: () => project } });
		const task = {
			id: "t1", workflowId: "custom", currentStageId: "9", history: [],
			timeline: [{ stage: "Build", duration: "2m 5s" }],
			reports: [{ stageName: "Build", content: "Legacy report without duration" }],
		};
		store._getMap("p1").set(task.id, task);
		store._getMap("p1").set("t2", { id: "t2", reports: [{ stageName: "Plan", duration: 30 }] });
		const original = structuredClone(task);
		const app = Fastify();
		try {
			await app.register(tasksRoutes, { deps: {
				resolveAndGuardProject: () => "p1",
				projectStore: store.projectStore, taskStore: store,
				agentRunner: vi.fn(), stuckChecker: vi.fn(),
			} });
			for (const query of ["", "&workflowId=custom"]) {
				const response = await app.inject({ method: "GET", url: `/tasks?projectId=p1${query}` });
				expect(response.statusCode).toBe(200);
				const records = response.json();
				// Compact board responses retain duration evidence, not detail bodies.
				expect(records[0]).not.toHaveProperty("timeline");
				expect(records[0]).not.toHaveProperty("history");
				expect(records[0].reports[0]).not.toHaveProperty("content");
				const summaries = records.map(toTaskSummary);
				expect(summaries).toHaveLength(query ? 1 : 2);
				expect(summaries[0].stageDurationSamples).toEqual([
					{ stageId: "9", stageName: "Build", stageType: "agent", seconds: [125] },
				]);
				expect(summaries[0]).not.toHaveProperty("timeline");
				expect(summaries[0]).not.toHaveProperty("history");
				expect(summaries[0].reports[0]).not.toHaveProperty("content");
				expect(computeStageAnalytics(customStages, summaries).byStage["9"].avgDuration).toBe("2m 5s");
				if (!query) expect(summaries[1].stageDurationSamples[0].seconds).toEqual([30]);
			}
			const detail = await app.inject({ method: "GET", url: "/tasks/t1?projectId=p1" });
			expect(detail.statusCode).toBe(200);
			expect(detail.json()).toMatchObject(original);
			expect(store.getTask("p1", "t1")).toBe(task);
			expect(task).toEqual(original);
		} finally {
			await app.close();
		}
	});

	it.each([
		["structured reports", { reports: [{ stageName: "Plan", duration: 45 }] }, 45],
		["legacy markdown", { reports: [{ stageName: "Plan", content: "**Duration:** 3m" }] }, 180],
		["timeline only", { timeline: [{ stage: "Plan", duration: "2m 5s" }] }, 125],
		["history only", { history: [
			{ timestamp: start, action: "Created and placed in stage 'Plan'" },
			{ timestamp: end, action: "Advanced to stage 'Review'" },
		] }, 120],
		["same visit deduplication", {
			reports: [{ stageName: "Plan", content: "**Duration:** 30s", createdAt: end }],
			timeline: [{ stage: "Plan", duration: "2m", timestamp: end }],
			history: [
				{ timestamp: start, action: "Created and placed in stage 'Plan'" },
				{ timestamp: end, action: "Advanced to stage 'Review'" },
			],
		}, 30],
	])("keeps %s averages after detail fields are stripped", (_label, evidence, seconds) => {
		const task = { id: "t1", currentStageId: "2", ...evidence };
		const original = structuredClone(task);
		const summaries = JSON.parse(JSON.stringify(boardTasks(task)));
		expect(summaries[0]).not.toHaveProperty("history");
		expect(summaries[0]).not.toHaveProperty("timeline");
		for (const report of summaries[0].reports || []) expect(report).not.toHaveProperty("content");
		const stats = computeStageAnalytics(stages, summaries);
		expect(stats.byStage["1"].avgDurationSeconds).toBe(seconds);
		expect(stats.byStage["3"].avgDuration).toBe("--");
		expect(task).toEqual(original);
	});

	it("recomputes full task evidence instead of trusting stale summary samples", () => {
		const task = {
			id: "t1",
			history: [],
			reports: [{ stageName: "Plan", duration: 12 }],
			stageDurationSamples: [{ stageId: "1", stageName: "Plan", seconds: [999] }],
		};
		expect(computeStageAnalytics(stages, boardTasks(task)).byStage["1"].avgDurationSeconds).toBe(12);
		task.reports[0].duration = 24;
		expect(computeStageAnalytics(stages, boardTasks(task)).byStage["1"].avgDurationSeconds).toBe(24);
	});

	it("uses each task's workflow and retains name matching after stage ids change", () => {
		const project = {
			stages,
			workflows: [{ id: "custom", stages: [{ id: "9", name: "Build" }] }],
		};
		const store = new TaskStore({ projectStore: { getProject: () => project } });
		store._getMap("p1").set("t1", {
			id: "t1", workflowId: "custom",
			timeline: [{ stage: "Build", duration: "1m" }],
		});
		const summaries = store.getTasks("p1", "custom")
			.map((task) => toTaskDurationSummary(task, project.workflows[0].stages));
		expect(summaries[0].stageDurationSamples).toEqual([
			{ stageId: "9", stageName: "Build", stageType: "agent", seconds: [60] },
		]);
		expect(computeStageAnalytics([{ id: "10", name: "Build" }], summaries)
			.byStage["10"].avgDurationSeconds).toBe(60);
		expect(store.getTasks("p1", "missing")).toEqual([]);
	});

	it("carries each stage's normalized type on its duration samples", () => {
		const typedStages = [
			{ id: "1", name: "Implement", type: "agent" },
			{ id: "2", name: "Review Plan", type: "review" },
			{ id: "3", name: "Verify", type: "CI" },
			{ id: "4", name: "Ship", type: "deploy" },
			{ id: "5", name: "Land", type: "merge" },
			{ id: "6", name: "Legacy", type: "custom" },
			{ id: "7", name: "Untyped" },
		];
		const task = {
			id: "t1", currentStageId: "7",
			timeline: typedStages.map((stage) => ({ stage: stage.name, duration: "1m" })),
		};
		const summaries = [toTaskDurationSummary(task, typedStages)];
		expect(summaries[0].stageDurationSamples).toEqual([
			{ stageId: "1", stageName: "Implement", stageType: "agent", seconds: [60] },
			{ stageId: "2", stageName: "Review Plan", stageType: "human", seconds: [60] },
			{ stageId: "3", stageName: "Verify", stageType: "ci", seconds: [60] },
			{ stageId: "4", stageName: "Ship", stageType: "ci", seconds: [60] },
			{ stageId: "5", stageName: "Land", stageType: "merge", seconds: [60] },
			{ stageId: "6", stageName: "Legacy", stageType: "agent", seconds: [60] },
			{ stageId: "7", stageName: "Untyped", stageType: "agent", seconds: [60] },
		]);
	});
});
