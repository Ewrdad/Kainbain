import { describe, expect, it } from "vitest";
import {
	createDefaultWorkflow,
	DEFAULT_WORKFLOW_ID,
	DEFAULT_WORKFLOW_NAME,
	normalizeWorkflow,
	normalizeWorkflows,
} from "./workflowDefaults.js";

describe("createDefaultWorkflow", () => {
	it("creates the default workflow", () => {
		const wf = createDefaultWorkflow();
		expect(wf.id).toBe(DEFAULT_WORKFLOW_ID);
		expect(wf.name).toBe(DEFAULT_WORKFLOW_NAME);
		expect(wf.isDefault).toBe(true);
		expect(wf.stages.length).toBeGreaterThan(0);
	});
});

describe("normalizeWorkflow", () => {
	it("normalizes a single workflow", () => {
		const out = normalizeWorkflow({ name: "Bugfix", stages: [] }, true);
		expect(out.name).toBe("Bugfix");
	});

	it("falls back to the default workflow for missing input", () => {
		expect(normalizeWorkflow(null)).toMatchObject({
			id: DEFAULT_WORKFLOW_ID,
			name: DEFAULT_WORKFLOW_NAME,
		});
	});

	it("names the first workflow with the default name and later ones custom", () => {
		expect(normalizeWorkflow({}, true).name).toBe(DEFAULT_WORKFLOW_NAME);
		expect(normalizeWorkflow({}, false).name).toBe("Custom Workflow");
	});

	it("marks the first workflow default unless it explicitly opts out", () => {
		expect(normalizeWorkflow({ name: "A" }, true).isDefault).toBe(true);
		expect(normalizeWorkflow({ name: "A", isDefault: false }, true).isDefault).toBe(false);
	});

	it("fills empty stage lists with the default stages", () => {
		expect(normalizeWorkflow({ name: "A", stages: [] }).stages.length).toBeGreaterThan(0);
	});
});

describe("normalizeWorkflows", () => {
	it("normalizes an empty workflows array to the default workflow", () => {
		const out = normalizeWorkflows([]);
		expect(Array.isArray(out)).toBe(true);
		expect(out).toHaveLength(1);
		expect(out[0].id).toBe(DEFAULT_WORKFLOW_ID);
	});

	it("guarantees exactly one default across many workflows", () => {
		const out = normalizeWorkflows([{ name: "A" }, { name: "B" }]);
		expect(out.filter((w) => w.isDefault)).toHaveLength(1);
	});

	it("migrates legacy root stages into a default workflow", () => {
		const out = normalizeWorkflows(undefined, [{ type: "review" }]);
		expect(out).toHaveLength(1);
		expect(out[0].id).toBe(DEFAULT_WORKFLOW_ID);
		expect(out[0].stages[0].type).toBe("human");
	});
});
