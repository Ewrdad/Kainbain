import { describe, it, expect } from "vitest";
import { buildRunnerAssignmentSummary } from "./runnerAssignmentSummary.js";

const makeStores = ({ project = null, task = null, workflow = null, activeWorkflow = null } = {}) => ({
	projectStore: {
		getProject: () => project,
		getWorkflow: () => workflow,
		getActiveWorkflow: () => activeWorkflow,
	},
	taskStore: {
		getTask: () => task,
	},
});

/***
 * MARK: Runner Assignment Summary Tests
 * @description Unit coverage for the global Runner identity enrichment:
 *   cross-pipeline holds resolve title/stage from the held task's own
 *   project/workflow, missing records degrade to nulls (never throw), and
 *   workflow-specific stages win over the project's top-level stages.
 ***/
describe("buildRunnerAssignmentSummary", () => {
	it("resolves identity from the held task's own project and workflow", () => {
		const summary = buildRunnerAssignmentSummary({
			hold: { projectId: "proj-b", taskId: "task-1" },
			projectStore: {
				getProject: () => ({
					id: "proj-b",
					name: "Project B",
					stages: [{ id: "build", name: "Project-level" }],
					workflows: [{ id: "wf-b", name: "Bugfix Pipeline", stages: [{ id: "build", name: "Build" }] }],
				}),
				getWorkflow: () => ({ id: "wf-b", name: "Bugfix Pipeline", stages: [{ id: "build", name: "Build" }] }),
				getActiveWorkflow: () => ({ id: "wf-b", name: "Bugfix Pipeline", stages: [{ id: "build", name: "Build" }] }),
			},
			taskStore: {
				getTask: () => ({
					id: "task-1",
					title: "Fix login",
					goal: "Repair the login flow",
					status: "in_stage",
					workflowId: "wf-b",
					currentStageId: "build",
				}),
			},
			stageId: "build",
		});
		expect(summary).toMatchObject({
			projectName: "Project B",
			workflowId: "wf-b",
			workflowName: "Bugfix Pipeline",
			taskTitle: "Fix login",
			taskGoal: "Repair the login flow",
			taskStatus: "in_stage",
			stageName: "Build",
		});
	});

	it("returns nulls rather than throwing when the task is missing", () => {
		const summary = buildRunnerAssignmentSummary({
			...makeStores({ project: { id: "p", name: "P" } }),
			hold: { projectId: "p", taskId: "gone" },
			stageId: "build",
		});
		expect(summary).toMatchObject({
			projectName: "P",
			taskTitle: null,
			taskGoal: null,
			taskStatus: null,
			stageName: "build",
		});
	});

	it("returns all nulls rather than throwing when the project is missing", () => {
		const summary = buildRunnerAssignmentSummary({
			...makeStores({}),
			hold: { projectId: "gone", taskId: "gone" },
			stageId: "s-1",
		});
		expect(summary).toMatchObject({
			projectName: null,
			workflowId: null,
			workflowName: null,
			taskTitle: null,
			taskGoal: null,
			taskStatus: null,
			stageName: "s-1",
		});
	});

	it("prefers workflow-specific stage names over the project's top-level stages", () => {
		const task = {
			id: "t",
			title: "T",
			workflowId: "wf-x",
			currentStageId: "build",
		};
		const summary = buildRunnerAssignmentSummary({
			hold: { projectId: "p", taskId: "t" },
			projectStore: {
				getProject: () => ({
					id: "p",
					name: "P",
					stages: [{ id: "build", name: "Project-level" }],
					workflows: [{ id: "wf-x", name: "X", stages: [{ id: "build", name: "Workflow-level" }] }],
				}),
				getWorkflow: () => null,
				getActiveWorkflow: () => ({ id: "wf-x", name: "X", stages: [{ id: "build", name: "Workflow-level" }] }),
			},
			taskStore: { getTask: () => task },
			stageId: "build",
		});
		// resolveStagesForTask prefers the task workflow's stages when present.
		expect(summary.stageName).toBe("Workflow-level");
	});

	it("falls back to the task's current stage when no reported stage matches", () => {
		const summary = buildRunnerAssignmentSummary({
			hold: { projectId: "p", taskId: "t" },
			projectStore: {
				getProject: () => ({ id: "p", name: "P", stages: [{ id: "test", name: "Test" }] }),
				getWorkflow: () => null,
				getActiveWorkflow: () => null,
			},
			taskStore: {
				getTask: () => ({ id: "t", title: "T", currentStageId: "test" }),
			},
			stageId: "unknown-stage",
		});
		expect(summary.stageName).toBe("Test");
	});

	it("tolerates throwing stores without throwing", () => {
		const throwing = () => {
			throw new Error("store down");
		};
		const summary = buildRunnerAssignmentSummary({
			hold: { projectId: "p", taskId: "t" },
			projectStore: { getProject: throwing, getWorkflow: throwing, getActiveWorkflow: throwing },
			taskStore: { getTask: throwing },
			stageId: "s-9",
		});
		expect(summary).toMatchObject({ projectName: null, taskTitle: null, stageName: "s-9" });
	});
});
