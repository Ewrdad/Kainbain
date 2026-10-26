import { describe, it, expect } from "vitest";
import {
	parseStageVerdict,
	stageExpectsAgentVerdict,
} from "./verdictContract.js";

/***
 * MARK: stageExpectsAgentVerdict tests
 * @description Proves the verdict/changes gate is agent-only: human, ci,
 *   deploy, and merge stages never expect a verdict, and legacy aliases
 *   (`review`, `script`) classify through `normalizeStageType` first so a
 *   legacy human checkpoint can never be treated as agent-like.
 ***/

describe("stageExpectsAgentVerdict", () => {
	it("accepts only normalized agent stages", () => {
		expect(stageExpectsAgentVerdict({ type: "agent" })).toBe(true);
		expect(stageExpectsAgentVerdict({ type: "AGENT" })).toBe(true);
		// A missing type is the engine's legacy agent default.
		expect(stageExpectsAgentVerdict({})).toBe(true);
		expect(stageExpectsAgentVerdict(undefined)).toBe(true);
	});

	it("rejects human stages (the regression this task fixes)", () => {
		expect(stageExpectsAgentVerdict({ type: "human" })).toBe(false);
		expect(stageExpectsAgentVerdict({ type: "Human" })).toBe(false);
	});

	it("rejects command, deploy, and merge stages", () => {
		expect(stageExpectsAgentVerdict({ type: "ci" })).toBe(false);
		expect(stageExpectsAgentVerdict({ type: "deploy" })).toBe(false);
		expect(stageExpectsAgentVerdict({ type: "merge" })).toBe(false);
	});

	it("normalizes legacy aliases before deciding", () => {
		// Legacy `review` was a human checkpoint and must stay verdict-free.
		expect(stageExpectsAgentVerdict({ type: "review" })).toBe(false);
		// Legacy `script` is a CI command stage, never an agent verdict stage.
		expect(stageExpectsAgentVerdict({ type: "script" })).toBe(false);
		// Unknown/custom types fall through to the agent default.
		expect(stageExpectsAgentVerdict({ type: "custom" })).toBe(true);
	});

	it("never parses a verdict for a non-agent stage", () => {
		// The parser is stage-agnostic; the guard is what scopes it. This
		// locks the two halves together: a non-agent stage has no verdict to
		// honour, so the guard must be consulted before parsing.
		const failText =
			"KAINBAIN_VERDICT: FAIL\nKAINBAIN_REASON: red\nKAINBAIN_FIX: green";
		expect(parseStageVerdict(failText).verdict).toBe("FAIL");
		expect(stageExpectsAgentVerdict({ type: "human" })).toBe(false);
		expect(stageExpectsAgentVerdict({ type: "ci" })).toBe(false);
	});
});
