import { describe, expect, it } from "vitest";
import {
	createDefaultWorkflow,
	DEFAULT_WORKFLOW_ID,
	DEFAULT_WORKFLOW_NAME,
	normalizeBaseBranchUpdate,
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

	it("carries a configured base branch through normalization", () => {
		const out = normalizeWorkflow({ name: "A", baseBranch: "feature/x" });
		expect(out.baseBranch).toBe("feature/x");
	});

	it("trims the base branch and drops blank values", () => {
		expect(normalizeWorkflow({ name: "A", baseBranch: "  feature/x  " }).baseBranch).toBe(
			"feature/x",
		);
		expect(normalizeWorkflow({ name: "A", baseBranch: "   " })).not.toHaveProperty(
			"baseBranch",
		);
	});

	it("leaves workflows without a base branch byte-identical", () => {
		const out = normalizeWorkflow({ name: "A" });
		expect(out).not.toHaveProperty("baseBranch");
		expect(Object.keys(out).sort()).toEqual(["id", "isDefault", "name", "stages"]);
	});

	it("drops an invalid stored base branch instead of surfacing it", () => {
		const out = normalizeWorkflow({ name: "A", baseBranch: "--evil" });
		expect(out).not.toHaveProperty("baseBranch");
	});
});

describe("normalizeBaseBranchUpdate", () => {
	it("leaves the field untouched when the key is absent", () => {
		expect(normalizeBaseBranchUpdate(undefined)).toEqual({ changed: false });
	});

	it("sets a valid trimmed name", () => {
		expect(normalizeBaseBranchUpdate("  feature/x  ")).toEqual({
			changed: true,
			baseBranch: "feature/x",
		});
	});

	it("clears the field on blank or null input", () => {
		expect(normalizeBaseBranchUpdate("")).toEqual({ changed: true, baseBranch: null });
		expect(normalizeBaseBranchUpdate("   ")).toEqual({ changed: true, baseBranch: null });
		expect(normalizeBaseBranchUpdate(null)).toEqual({ changed: true, baseBranch: null });
	});

	it("refuses invalid git branch names loudly", () => {
		expect(() => normalizeBaseBranchUpdate("--evil")).toThrow(/valid git branch name/);
		expect(() => normalizeBaseBranchUpdate("has space")).toThrow(/valid git branch name/);
	});

	it("refuses wrong-typed values instead of silently clearing the branch", () => {
		expect(() => normalizeBaseBranchUpdate(42)).toThrow(/valid git branch name/);
		expect(() => normalizeBaseBranchUpdate(true)).toThrow(/valid git branch name/);
		expect(() => normalizeBaseBranchUpdate({})).toThrow(/valid git branch name/);
		expect(() => normalizeBaseBranchUpdate(["feature/x"])).toThrow(/valid git branch name/);
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
