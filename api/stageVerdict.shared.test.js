import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	decideAgentStageVerdict,
	normalizeStageType,
	parseStageVerdict,
	stageExpectsAgentVerdict,
} from "../shared/stageVerdict.js";
import * as verdictContract from "./agent/verdictContract.js";
import { normalizeStageType as normalizerStageType } from "./project/stageNormalizers.js";
import { normalizeStageType as storeStageType } from "./projectStore.js";

// The shared agent stage-verdict contract: the parser, the agent-only guard,
// the stage-type normalizer, and the single pass/fail decision live in
// shared/stageVerdict/ so the embedded path, the Runner daemon, and the
// backend double-check decide identically. These tests pin the move (the api/
// doors re-export the same functions) and the decision precedence matrix.

const FAIL_BLOCK =
	"KAINBAIN_VERDICT: FAIL\nKAINBAIN_REASON: canary test red\nKAINBAIN_FIX: pause the stage in spec setup";

describe("stageVerdict — shared module is the single source of truth", () => {
	it("the api/ doors re-export the shared functions", () => {
		expect(verdictContract.parseStageVerdict).toBe(parseStageVerdict);
		expect(verdictContract.stageExpectsAgentVerdict).toBe(stageExpectsAgentVerdict);
		expect(verdictContract.decideAgentStageVerdict).toBe(decideAgentStageVerdict);
		expect(normalizerStageType).toBe(normalizeStageType);
		expect(storeStageType).toBe(normalizeStageType);
	});

	it("shared leaves import only relative modules (never from api/)", () => {
		const dir = path.dirname(fileURLToPath(import.meta.url));
		const sharedDir = path.join(dir, "..", "shared", "stageVerdict");
		/* eslint-disable security/detect-non-literal-fs-filename -- test enumerates the repo's own shared/stageVerdict dir */
		for (const name of fs.readdirSync(sharedDir)) {
			if (!name.endsWith(".js")) continue;
			const text = fs.readFileSync(path.join(sharedDir, name), "utf8");
			for (const match of text.matchAll(/from\s+["']([^"']+)["']/g)) {
				expect(
					match[1].startsWith("."),
					`${name} imports ${match[1]}`,
				).toBe(true);
			}
		}
		/* eslint-enable security/detect-non-literal-fs-filename */
	});
});

describe("stageVerdict — parser parity after the move (S1)", () => {
	it("parses a well-formed FAIL block", () => {
		expect(parseStageVerdict(`Deep review complete.\n${FAIL_BLOCK}`)).toEqual({
			verdict: "FAIL",
			reason: "canary test red",
			fix: "pause the stage in spec setup",
		});
	});

	it("last well-formed block wins", () => {
		expect(
			parseStageVerdict(`${FAIL_BLOCK}\nall good\nKAINBAIN_VERDICT: PASS`).verdict,
		).toBe("PASS");
	});

	it("ignores fenced blocks (quoted examples are documentation)", () => {
		expect(
			parseStageVerdict("```text\nKAINBAIN_VERDICT: FAIL\n```").verdict,
		).toBeNull();
	});

	it("maps malformed and prose verdicts to null (no signal)", () => {
		expect(parseStageVerdict("KAINBAIN_VERDICT: MAYBE").verdict).toBeNull();
		expect(
			parseStageVerdict("Verdict: STAGE FAILED — rework required").verdict,
		).toBeNull();
		expect(parseStageVerdict("").verdict).toBeNull();
	});

	it("never lets a malformed trailing verdict clear a prior valid FAIL", () => {
		expect(
			parseStageVerdict(`${FAIL_BLOCK}\nKAINBAIN_VERDICT: MAYBE`),
		).toEqual({
			verdict: "FAIL",
			reason: "canary test red",
			fix: "pause the stage in spec setup",
		});
	});

	it("the guard is agent-only, including legacy aliases", () => {
		expect(stageExpectsAgentVerdict({ type: "agent" })).toBe(true);
		expect(stageExpectsAgentVerdict({})).toBe(true);
		expect(stageExpectsAgentVerdict(undefined)).toBe(true);
		for (const type of ["human", "ci", "deploy", "merge", "review", "script"]) {
			expect(stageExpectsAgentVerdict({ type }), type).toBe(false);
		}
	});
});

describe("stageVerdict — decision precedence matrix (S2)", () => {
	it("an explicit fail_stage call wins over a PASS text block", () => {
		const decision = decideAgentStageVerdict({
			stage: { type: "agent" },
			output: "all good\nKAINBAIN_VERDICT: PASS",
			failStageRequest: { reason: "human review found a blocker" },
		});
		expect(decision.failed).toBe(true);
		expect(decision.failureReason).toBe(
			"[Agent Review Rejection] human review found a blocker",
		);
		expect(decision.failOpenWarning).toBeNull();
	});

	it("a fail_stage call with no reason still fails with the default reason", () => {
		// The default is the embedded path's long-standing string
		// (api/agentRunner.js latches the same), so a reasonless tool call
		// reads identically wherever the stage ran.
		const expected =
			"[Agent Review Rejection] Stage failure reported by agent review";
		for (const failStageRequest of [
			{},
			{ reason: "" },
			{ reason: null },
			{ reason: "   " },
			{ reason: "\n\t " },
			"   ",
		]) {
			const decision = decideAgentStageVerdict({
				stage: { type: "agent" },
				output: "done",
				failStageRequest,
			});
			expect(decision.failed, JSON.stringify(failStageRequest)).toBe(true);
			expect(decision.failureReason, JSON.stringify(failStageRequest)).toBe(
				expected,
			);
			expect(decision.failOpenWarning).toBeNull();
		}
	});

	it("a bare-string fail_stage latch is trimmed and honoured", () => {
		const decision = decideAgentStageVerdict({
			stage: { type: "agent" },
			output: "done",
			failStageRequest: "  padded reason  ",
		});
		expect(decision.failed).toBe(true);
		expect(decision.failureReason).toBe(
			"[Agent Review Rejection] padded reason",
		);
		expect(decision.failOpenWarning).toBeNull();
	});

	it("the fail_stage latch wins for any stage shape (embedded parity)", () => {
		// The latch is unconditional, exactly as the embedded path checks
		// stageFailureRequested before anything else: callers only capture
		// the tool event on agent paths (the backend double-check always
		// passes null), so the helper never narrows it. Human/CI stages
		// have no session to call the tool from — the loop below pins that
		// narrowing is the caller's job, not the helper's.
		for (const stage of [
			{ type: "agent" },
			{},
			undefined,
			{ type: "human" },
			{ type: "ci" },
		]) {
			const decision = decideAgentStageVerdict({
				stage,
				output: "all good\nKAINBAIN_VERDICT: PASS",
				failStageRequest: { reason: "human review found a blocker" },
			});
			expect(decision.failed, JSON.stringify(stage)).toBe(true);
			expect(decision.failureReason).toBe(
				"[Agent Review Rejection] human review found a blocker",
			);
		}
	});

	it("a falsy fail_stage latch is no signal (falls through to the text verdict)", () => {
		for (const failStageRequest of [null, undefined, "", 0, false]) {
			const decision = decideAgentStageVerdict({
				stage: { type: "agent" },
				output: "done",
				failStageRequest,
			});
			expect(decision, String(failStageRequest)).toEqual({
				failed: false,
				failureReason: null,
				failOpenWarning: null,
			});
		}
	});

	it("FAIL with reason AND fix fails with the Fix guidance: reason", () => {
		const decision = decideAgentStageVerdict({
			stage: { type: "agent" },
			output: `Deep review complete.\n${FAIL_BLOCK}`,
			failStageRequest: null,
		});
		expect(decision.failed).toBe(true);
		expect(decision.failureReason).toBe(
			"[Agent Review Rejection] canary test red Fix guidance: pause the stage in spec setup",
		);
		expect(decision.failOpenWarning).toBeNull();
	});

	it("reasonless FAIL passes open with a warning (embedded parity)", () => {
		for (const output of [
			"Something is wrong.\nKAINBAIN_VERDICT: FAIL",
			"Bad news.\nKAINBAIN_VERDICT: FAIL\nKAINBAIN_REASON: canary test red",
			"Bad news.\nKAINBAIN_VERDICT: FAIL\nKAINBAIN_FIX: rerun the suite",
		]) {
			const decision = decideAgentStageVerdict({
				stage: { type: "agent" },
				output,
				failStageRequest: null,
			});
			expect(decision.failed, output).toBe(false);
			expect(decision.failureReason, output).toBeNull();
			expect(decision.failOpenWarning, output).toContain(
				"Stage verdict FAIL ignored (fail-open)",
			);
		}
	});

	it("malformed blocks, prose verdicts, and no verdict pass silently", () => {
		for (const output of [
			"KAINBAIN_VERDICT: MAYBE",
			"Verdict: STAGE FAILED — rework required (prose, no block)",
			"```text\nKAINBAIN_VERDICT: FAIL\n```",
			"all done, nothing to report",
			"",
			null,
			undefined,
		]) {
			const decision = decideAgentStageVerdict({
				stage: { type: "agent" },
				output,
				failStageRequest: null,
			});
			expect(decision, JSON.stringify(output)).toEqual({
				failed: false,
				failureReason: null,
				failOpenWarning: null,
			});
		}
	});

	it("non-agent stages ignore even a well-formed FAIL block", () => {
		for (const type of ["human", "ci", "deploy", "merge", "review", "script"]) {
			const decision = decideAgentStageVerdict({
				stage: { type },
				output: FAIL_BLOCK,
				failStageRequest: null,
			});
			expect(decision, type).toEqual({
				failed: false,
				failureReason: null,
				failOpenWarning: null,
			});
		}
	});

	it("a missing stage type is the legacy agent default (verdict honoured)", () => {
		const decision = decideAgentStageVerdict({
			stage: {},
			output: FAIL_BLOCK,
			failStageRequest: null,
		});
		expect(decision.failed).toBe(true);
	});
});
