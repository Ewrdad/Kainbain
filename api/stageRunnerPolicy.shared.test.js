import { describe, it, expect } from "vitest";
import {
	STAGE_RUNNER_POLICY_MODES,
	collectInvalidStageRunnerPolicies,
	normalizeStageRunnerPolicy,
	stageRunnerPolicyVerdict,
} from "../shared/stageRunnerPolicy.js";

describe("normalizeStageRunnerPolicy", () => {
	it("returns undefined for absent or malformed policies (legacy no-op, fail open)", () => {
		expect(normalizeStageRunnerPolicy(undefined)).toBeUndefined();
		expect(normalizeStageRunnerPolicy(null)).toBeUndefined();
		expect(normalizeStageRunnerPolicy("allow")).toBeUndefined();
		expect(normalizeStageRunnerPolicy([])).toBeUndefined();
		expect(normalizeStageRunnerPolicy({})).toBeUndefined();
		expect(normalizeStageRunnerPolicy({ mode: "allow" })).toBeUndefined();
		expect(normalizeStageRunnerPolicy({ runners: ["r1"] })).toBeUndefined();
		expect(normalizeStageRunnerPolicy({ mode: "allow", runners: "r1" })).toBeUndefined();
	});

	it("drops unknown modes instead of guessing (the save boundary 400s these)", () => {
		expect(normalizeStageRunnerPolicy({ mode: "only", runners: ["r1"] })).toBeUndefined();
		expect(normalizeStageRunnerPolicy({ mode: "", runners: ["r1"] })).toBeUndefined();
		expect(normalizeStageRunnerPolicy({ mode: 7, runners: ["r1"] })).toBeUndefined();
	});

	it("treats an empty runner list as unrestricted regardless of mode", () => {
		expect(normalizeStageRunnerPolicy({ mode: "allow", runners: [] })).toBeUndefined();
		expect(normalizeStageRunnerPolicy({ mode: "block", runners: [] })).toBeUndefined();
		expect(normalizeStageRunnerPolicy({ mode: "allow", runners: ["  ", "", 7, null] })).toBeUndefined();
	});

	it("trims the mode case-insensitively and cleans the runner list", () => {
		expect(
			normalizeStageRunnerPolicy({ mode: "  Allow ", runners: ["  onsite-1 ", "onsite-1", 7, "", "cloud-2"] }),
		).toEqual({ mode: "allow", runners: ["onsite-1", "cloud-2"] });
		expect(
			normalizeStageRunnerPolicy({ mode: "BLOCK", runners: ["r1"] }),
		).toEqual({ mode: "block", runners: ["r1"] });
	});

	it("keeps unknown runner ids (never auto-prunes; renames show as stale)", () => {
		expect(
			normalizeStageRunnerPolicy({ mode: "allow", runners: ["deleted-runner", "r1"] }),
		).toEqual({ mode: "allow", runners: ["deleted-runner", "r1"] });
	});

	it("matches runner ids exactly (case kept)", () => {
		expect(
			normalizeStageRunnerPolicy({ mode: "allow", runners: ["Onsite-1", "onsite-1"] }),
		).toEqual({ mode: "allow", runners: ["Onsite-1", "onsite-1"] });
	});
});

describe("stageRunnerPolicyVerdict", () => {
	it("allows every runner when the policy is absent or malformed", () => {
		expect(stageRunnerPolicyVerdict(undefined, "r1")).toEqual({ ok: true, reason: "MATCH" });
		expect(stageRunnerPolicyVerdict(null, "r1")).toEqual({ ok: true, reason: "MATCH" });
		expect(stageRunnerPolicyVerdict({ id: "s1" }, "r1")).toEqual({ ok: true, reason: "MATCH" });
		expect(stageRunnerPolicyVerdict({ mode: "only", runners: ["r1"] }, "r2")).toEqual({ ok: true, reason: "MATCH" });
		expect(stageRunnerPolicyVerdict({ mode: "allow", runners: [] }, "r2")).toEqual({ ok: true, reason: "MATCH" });
	});

	it("fails open on a missing runner id rather than throwing", () => {
		const policy = { mode: "allow", runners: ["r1"] };
		expect(stageRunnerPolicyVerdict(policy, undefined)).toEqual({ ok: true, reason: "MATCH" });
		expect(stageRunnerPolicyVerdict(policy, "  ")).toEqual({ ok: true, reason: "MATCH" });
		expect(stageRunnerPolicyVerdict(policy, 7)).toEqual({ ok: true, reason: "MATCH" });
	});

	it("allow-mode admits only listed runners", () => {
		const policy = { mode: "allow", runners: ["onsite-1"] };
		expect(stageRunnerPolicyVerdict(policy, "onsite-1")).toEqual({ ok: true, reason: "MATCH" });
		expect(stageRunnerPolicyVerdict(policy, "  onsite-1  ")).toEqual({ ok: true, reason: "MATCH" });
		expect(stageRunnerPolicyVerdict(policy, "cloud-2")).toEqual({ ok: false, reason: "RUNNER_NOT_ALLOWED" });
		expect(stageRunnerPolicyVerdict(policy, "Onsite-1")).toEqual({ ok: false, reason: "RUNNER_NOT_ALLOWED" });
	});

	it("block-mode refuses only listed runners", () => {
		const policy = { mode: "block", runners: ["cloud-9"] };
		expect(stageRunnerPolicyVerdict(policy, "cloud-9")).toEqual({ ok: false, reason: "RUNNER_BLOCKED" });
		expect(stageRunnerPolicyVerdict(policy, "onsite-1")).toEqual({ ok: true, reason: "MATCH" });
	});

	it("reads the policy off a stage object as well as a bare policy", () => {
		const stage = { id: "s1", name: "Publish", type: "ci", runnerPolicy: { mode: "allow", runners: ["r1"] } };
		expect(stageRunnerPolicyVerdict(stage, "r1")).toEqual({ ok: true, reason: "MATCH" });
		expect(stageRunnerPolicyVerdict(stage, "r2")).toEqual({ ok: false, reason: "RUNNER_NOT_ALLOWED" });
	});

	it("normalizes before matching (whitespace and dupes never strand a listed runner)", () => {
		const stage = { id: "s1", runnerPolicy: { mode: " Allow ", runners: ["  r1 ", "r1"] } };
		expect(stageRunnerPolicyVerdict(stage, "r1")).toEqual({ ok: true, reason: "MATCH" });
	});
});

describe("collectInvalidStageRunnerPolicies", () => {
	it("passes stages without a policy and non-array input", () => {
		expect(collectInvalidStageRunnerPolicies(undefined)).toEqual([]);
		expect(collectInvalidStageRunnerPolicies([{ id: "s1" }, { id: "s2", runnerPolicy: null }])).toEqual([]);
		expect(collectInvalidStageRunnerPolicies([
			{ id: "s1", runnerPolicy: { mode: "allow", runners: ["r1"] } },
			{ id: "s2", runnerPolicy: { mode: "block", runners: [] } },
		])).toEqual([]);
	});

	it("flags unknown modes with the stage position", () => {
		expect(
			collectInvalidStageRunnerPolicies([
				{ id: "s1", runnerPolicy: { mode: "allow", runners: ["r1"] } },
				{ id: "s2", runnerPolicy: { mode: "only", runners: ["r1"] } },
			]),
		).toEqual([{ index: 1, stageId: "s2", problem: "UNKNOWN_MODE", mode: "only" }]);
	});

	it("flags non-object policies and non-array runner lists", () => {
		expect(
			collectInvalidStageRunnerPolicies([
				{ id: "s1", runnerPolicy: "allow" },
				{ id: "s2", runnerPolicy: { mode: "allow", runners: "r1" } },
			]),
		).toEqual([
			{ index: 0, stageId: "s1", problem: "POLICY_NOT_OBJECT", mode: null },
			{ index: 1, stageId: "s2", problem: "RUNNERS_NOT_ARRAY", mode: "allow" },
		]);
	});

	it("never flags unknown runner ids", () => {
		expect(
			collectInvalidStageRunnerPolicies([
				{ id: "s1", runnerPolicy: { mode: "allow", runners: ["deleted-runner", 7] } },
			]),
		).toEqual([]);
	});

	it("accepts both documented modes", () => {
		expect(STAGE_RUNNER_POLICY_MODES).toEqual(["allow", "block"]);
	});
});
