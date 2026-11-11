import { describe, it, expect } from "vitest";
import { resolveAttestationStage } from "./resolveAttestationStage.js";

const STAGE = { id: "5", name: "In Progress", type: "agent", prompt: "Run." };
const PROJECT = { id: "p1", stages: [STAGE] };
const TASK = { id: "t1", currentStageId: "5" };

describe("resolveAttestationStage", () => {
	it("prefers an explicitly passed stage", () => {
		const explicit = { id: "9", type: "ci" };
		expect(resolveAttestationStage({ stage: explicit, project: PROJECT, task: TASK })).toBe(
			explicit,
		);
	});

	it("falls back to the task's current stage by id", () => {
		expect(resolveAttestationStage({ project: PROJECT, task: TASK })).toBe(STAGE);
	});

	it("matches the current stage by name when the id differs", () => {
		expect(
			resolveAttestationStage({
				project: PROJECT,
				task: { id: "t1", currentStageId: "in progress" },
			}),
		).toBe(STAGE);
	});

	it("resolves workflow-scoped stages like the scheduler does", () => {
		const project = {
			id: "p1",
			stages: [{ id: "other", type: "agent" }],
			workflows: [{ id: "wf-1", stages: [STAGE] }],
		};
		expect(
			resolveAttestationStage({ project, task: { id: "t1", workflowId: "wf-1", currentStageId: "5" } }),
		).toBe(STAGE);
	});

	it("returns null instead of guessing", () => {
		expect(resolveAttestationStage()).toBeNull();
		expect(resolveAttestationStage({})).toBeNull();
		expect(resolveAttestationStage({ stage: { id: "  " }, project: PROJECT, task: TASK })).toBe(
			STAGE,
		);
		expect(resolveAttestationStage({ project: PROJECT, task: null })).toBeNull();
		expect(resolveAttestationStage({ project: null, task: TASK })).toBeNull();
		expect(
			resolveAttestationStage({ project: PROJECT, task: { id: "t1", currentStageId: "missing" } }),
		).toBeNull();
	});
});
