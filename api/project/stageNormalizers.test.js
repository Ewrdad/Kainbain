import { describe, expect, it } from "vitest";
import {
	DEFAULT_STAGES,
	migrateMergeDeployStages,
	normalizeStage,
	normalizeStageSkills,
	normalizeStageType,
	normalizeStages,
} from "./stageNormalizers.js";

describe("normalizeStageType", () => {
	it("normalizes legacy stage types", () => {
		expect(normalizeStageType("review")).toBe("human");
		expect(normalizeStageType("deploy")).toBe("ci");
		expect(normalizeStageType("script")).toBe("ci");
	});

	it("passes authoritative types through case-insensitively", () => {
		expect(normalizeStageType("AGENT")).toBe("agent");
		expect(normalizeStageType(" Human ")).toBe("human");
		expect(normalizeStageType("merge")).toBe("merge");
	});

	it("degrades unknown, blank, and non-string types to agent", () => {
		expect(normalizeStageType("custom")).toBe("agent");
		expect(normalizeStageType("")).toBe("agent");
		expect(normalizeStageType(undefined)).toBe("agent");
		expect(normalizeStageType(42)).toBe("agent");
	});
});

describe("normalizeStageSkills", () => {
	it("returns undefined when skills are absent so legacy stages round-trip", () => {
		expect(normalizeStageSkills(undefined)).toBeUndefined();
		expect(normalizeStageSkills(null)).toBeUndefined();
	});

	it("returns empty for a non-list", () => {
		expect(normalizeStageSkills("nope")).toEqual([]);
	});

	it("trims names, coerces mode, and keeps unknown fields", () => {
		expect(normalizeStageSkills([{ name: " a ", mode: "OPTION" }])).toEqual([
			{ name: "a", mode: "option" },
		]);
		expect(normalizeStageSkills([{ name: "a", config: "not-object" }])).toEqual([
			{ name: "a", config: {} },
		]);
	});

	it("drops entries without a usable name", () => {
		expect(normalizeStageSkills([{ name: "  " }, null, "x"])).toEqual([]);
	});
});

describe("normalizeStage", () => {
	it("normalizes stage objects", () => {
		expect(normalizeStage({ id: "1", name: "Test", type: "script" }).type).toBe("ci");
	});

	it("trims the harness override and clears blank values", () => {
		expect(normalizeStage({ id: "1", harness: "  custom  " }).harness).toBe("custom");
		expect(normalizeStage({ id: "1", harness: "" }).harness).toBeUndefined();
		expect("harness" in normalizeStage({ id: "1", type: "agent" })).toBe(false);
	});

	it("maps legacy run-on-branch spellings and drops legacy keys", () => {
		const ci = { id: "1", name: "CI", type: "ci" };
		expect(normalizeStage({ ...ci, runOnBranch: "main" }).runOnBranch).toBe("primary");
		expect(normalizeStage({ ...ci, runOnBranch: "banana" }).runOnBranch).toBe("task");
		const migrated = normalizeStage({ ...ci, executionBranch: "primary" });
		expect(migrated.runOnBranch).toBe("primary");
		expect("executionBranch" in migrated).toBe(false);
	});

	it("keeps legacy stages byte-identical when no optional keys are present", () => {
		const legacy = { id: "s1", name: "Ship", type: "deploy" };
		expect(normalizeStage(legacy)).toEqual({ id: "s1", name: "Ship", type: "ci" });
	});
});

describe("migrateMergeDeployStages", () => {
	it("splits a merge+deploy stage into merge plus a ci deploy stage", () => {
		const out = migrateMergeDeployStages([{ id: "m", type: "merge", command: "./deploy.sh --prod" }]);
		expect(out.length).toBe(2);
		expect(out[0]).toMatchObject({ id: "m", type: "merge" });
		expect("command" in out[0]).toBe(false);
		expect(out[1]).toMatchObject({
			id: "m-deploy",
			name: "Deploy",
			type: "ci",
			command: "./deploy.sh --prod",
			failback: "previous",
		});
	});

	it("is idempotent: re-running never duplicates the deploy stage", () => {
		const once = migrateMergeDeployStages([{ id: "m", type: "merge", command: "./deploy.sh --prod" }]);
		expect(migrateMergeDeployStages(once)).toEqual(once);
	});

	it("leaves command-less merge stages untouched", () => {
		const stages = [{ id: "m", type: "merge" }];
		expect(migrateMergeDeployStages(stages)).toEqual(stages);
	});
});

describe("normalizeStages", () => {
	it("normalizes stage list", () => {
		expect(Array.isArray(normalizeStages([{ type: "review" }]))).toBe(true);
	});

	it("returns empty for non-lists", () => {
		expect(normalizeStages(undefined)).toEqual([]);
	});
});

describe("DEFAULT_STAGES", () => {
	it("default stages exists", () => {
		expect(DEFAULT_STAGES.length).toBeGreaterThan(0);
	});

	it("covers the agent/human/ci pipeline", () => {
		const types = new Set(DEFAULT_STAGES.map((s) => s.type));
		expect(types.has("agent")).toBe(true);
		expect(types.has("human")).toBe(true);
		expect(types.has("ci")).toBe(true);
	});
});
