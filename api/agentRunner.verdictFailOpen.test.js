import { describe, it, expect, vi, afterEach } from "vitest";
import {
	createAgentRunner,
	parseStageVerdict,
} from "./agentRunner.js";
import {
	checkToolLoopGuard,
	formatLoopDiagnostic,
	resolveToolLoopStrikes,
} from "./agent/verdictContract.js";
import { PromptCurationEngine } from "./promptCuration.js";
import { config } from "./config.js";

/**
 * MARK: fail-open verdict contract tests
 * @description Proves stages default to passing: only an explicit
 *   `fail_stage` call or a well-formed FAIL block WITH reason and fix
 *   guidance fails a stage. Reasonless FAIL verdicts, malformed blocks,
 *   prose verdicts, and runs with no verdict at all pass open — so smaller
 *   models that skip the verdict block can never wedge prod into an
 *   unretryable failback loop.
 */

function makeSession(output, { events = [], abort, messages } = {}) {
	let listener = null;
	return {
		subscribe: (cb) => {
			listener = cb;
			return () => {
				listener = null;
			};
		},
		prompt: vi.fn().mockImplementation(async () => {
			for (const event of events) listener?.(event);
			return output;
		}),
		messages: messages ?? [{ role: "assistant", content: output }],
		...(abort ? { abort } : {}),
	};
}

function toolErrorEvents(toolName, count, result = "boom") {
	return Array.from({ length: count }, () => ({
		type: "tool_finished",
		toolName,
		isError: true,
		result,
	}));
}

afterEach(() => {
	config.toolLoopStrikes = 3;
});

describe("fail-open verdict parsing", () => {
	it("passes a reasonless FAIL (never fails without guidance)", async () => {
		const output = "Something is wrong.\nKAINBAIN_VERDICT: FAIL";
		const runner = createAgentRunner({
			getOrCreateSession: vi
				.fn()
				.mockResolvedValue(makeSession(output)),
		});
		const res = await runner("Review code", { projectId: "proj-1" });

		expect(res.failed).toBe(false);
		expect(res.failureKind).toBe("none");
		expect(res.output).toBe(output);
	});

	it("passes a FAIL with reason but no fix guidance", async () => {
		const output =
			"Bad news.\nKAINBAIN_VERDICT: FAIL\nKAINBAIN_REASON: canary test red";
		const runner = createAgentRunner({
			getOrCreateSession: vi
				.fn()
				.mockResolvedValue(makeSession(output)),
		});
		const res = await runner("Review code", { projectId: "proj-1" });

		expect(res.failed).toBe(false);
		expect(res.failureKind).toBe("none");
	});

	it("passes a FAIL with fix but no reason", async () => {
		const output =
			"Bad news.\nKAINBAIN_VERDICT: FAIL\nKAINBAIN_FIX: rerun the suite";
		const runner = createAgentRunner({
			getOrCreateSession: vi
				.fn()
				.mockResolvedValue(makeSession(output)),
		});
		const res = await runner("Review code", { projectId: "proj-1" });

		expect(res.failed).toBe(false);
		expect(res.failureKind).toBe("none");
	});

	it("fails a reasoned FAIL with the agent's own guidance", async () => {
		const output =
			"Deep review complete.\nKAINBAIN_VERDICT: FAIL\nKAINBAIN_REASON: canary test red\nKAINBAIN_FIX: pause the stage in spec setup";
		const runner = createAgentRunner({
			getOrCreateSession: vi
				.fn()
				.mockResolvedValue(makeSession(output)),
		});
		const res = await runner("Review code", { projectId: "proj-1" });

		expect(res.failed).toBe(true);
		expect(res.failureKind).toBe("rejected");
		expect(res.failureReason).toContain("canary test red");
		expect(res.failureReason).toContain("pause the stage in spec setup");
	});

	it("passes when no verdict block is rendered at all", async () => {
		const runner = createAgentRunner({
			getOrCreateSession: vi
				.fn()
				.mockResolvedValue(makeSession("all done, nothing to report")),
		});
		const res = await runner("Do work", { projectId: "proj-1" });

		expect(res.failed).toBe(false);
		expect(res.failureKind).toBe("none");
	});

	it("passes with file changes but no verdict (no mandate)", async () => {
		const events = [
			{ type: "tool_started", toolName: "edit", args: { path: "src/a.js" } },
			{ type: "tool_finished", toolName: "edit", isError: false, result: "ok" },
		];
		const runner = createAgentRunner({
			getOrCreateSession: vi
				.fn()
				.mockResolvedValue(
					makeSession("patched the config", { events }),
				),
		});
		const res = await runner("Do work", { projectId: "proj-1" });

		expect(res.failed).toBe(false);
		expect(res.failureKind).toBe("none");
		expect(res.modifiedFiles).toEqual(["src/a.js"]);
		expect(res.verdictImplicitPass).toBeUndefined();
	});

	it("passes on prose-only verdicts (no machine-readable block)", async () => {
		const runner = createAgentRunner({
			getOrCreateSession: vi
				.fn()
				.mockResolvedValue(
					makeSession("Verdict: STAGE FAILED — rework required (prose, no block)"),
				),
		});
		const res = await runner("Review code", { projectId: "proj-1" });

		expect(res.failed).toBe(false);
		expect(res.failureKind).toBe("none");
	});

	it("passes a reasonless FAIL followed by a malformed verdict line", async () => {
		const output = "Something is wrong.\nKAINBAIN_VERDICT: FAIL\nKAINBAIN_VERDICT: MAYBE";
		const runner = createAgentRunner({
			getOrCreateSession: vi
				.fn()
				.mockResolvedValue(makeSession(output)),
		});
		const res = await runner("Review code", { projectId: "proj-1" });

		expect(res.failed).toBe(false);
		expect(res.failureKind).toBe("none");
	});

	it("still fails a reasoned FAIL followed by trailing garbage", async () => {
		const output =
			"KAINBAIN_VERDICT: FAIL\nKAINBAIN_REASON: canary red\nKAINBAIN_FIX: rerun\nKAINBAIN_VERDICT: MAYBE";
		const runner = createAgentRunner({
			getOrCreateSession: vi
				.fn()
				.mockResolvedValue(makeSession(output)),
		});
		const res = await runner("Review code", { projectId: "proj-1" });

		expect(res.failed).toBe(true);
		expect(res.failureKind).toBe("rejected");
		expect(res.failureReason).toContain("canary red");
	});
});

describe("configurable tool-loop guard", () => {
	it("trips at the default threshold with the failing-tool payload in the diagnostic", async () => {
		const abort = vi.fn().mockResolvedValue(undefined);
		const events = [
			{ type: "tool_started", toolName: "bash", args: { command: "npm test" } },
			...toolErrorEvents("bash", 3, "exit 1: boom"),
		];
		const runner = createAgentRunner({
			getOrCreateSession: vi
				.fn()
				.mockResolvedValue(
					makeSession("done\nKAINBAIN_VERDICT: PASS", { events, abort }),
				),
		});
		const res = await runner("Do work", { projectId: "proj-1" });

		expect(abort).toHaveBeenCalled();
		expect(res.failed).toBe(true);
		expect(res.failureKind).toBe("infrastructure");
		expect(res.failureReason).toContain("Repeated tool failure loop detected");
		expect(res.failureReason).toContain("bash");
		expect(res.failureReason).toContain("boom");
		expect(res.failureReason).toContain("npm test");
	});

	it("honours a stage-level strike override (N-1 errors pass, N trip)", async () => {
		const mkRunner = (count) => {
			const abort = vi.fn().mockResolvedValue(undefined);
			const runner = createAgentRunner({
				getOrCreateSession: vi.fn().mockResolvedValue(
					makeSession("done\nKAINBAIN_VERDICT: PASS", {
						events: toolErrorEvents("bash", count),
						abort,
					}),
				),
			});
			return { runner, abort };
		};

		const under = mkRunner(4);
		const resUnder = await under.runner("Do work", {
			projectId: "proj-1",
			stage: { id: "s1", toolLoopStrikes: 5 },
		});
		expect(under.abort).not.toHaveBeenCalled();
		expect(resUnder.failed).toBe(false);

		const at = mkRunner(5);
		const resAt = await at.runner("Do work", {
			projectId: "proj-1",
			stage: { id: "s1", toolLoopStrikes: 5 },
		});
		expect(at.abort).toHaveBeenCalled();
		expect(resAt.failed).toBe(true);
		expect(resAt.failureReason).toContain("5 consecutive");
	});

	it("honours the global KAINBAIN_TOOL_LOOP_STRIKES config knob", async () => {
		config.toolLoopStrikes = 5;
		try {
			const abort = vi.fn().mockResolvedValue(undefined);
			const runner = createAgentRunner({
				getOrCreateSession: vi.fn().mockResolvedValue(
					makeSession("done\nKAINBAIN_VERDICT: PASS", {
						events: toolErrorEvents("bash", 4),
						abort,
					}),
				),
			});
			const res = await runner("Do work", { projectId: "proj-1" });
			expect(abort).not.toHaveBeenCalled();
			expect(res.failed).toBe(false);
		} finally {
			config.toolLoopStrikes = 3;
		}
	});

	it("checkToolLoopGuard and resolveToolLoopStrikes are pure", () => {
		expect(checkToolLoopGuard(2, 3)).toBe(false);
		expect(checkToolLoopGuard(3, 3)).toBe(true);
		expect(checkToolLoopGuard(5, 5)).toBe(true);
		expect(resolveToolLoopStrikes({})).toBe(3);
		expect(resolveToolLoopStrikes({ cfg: { toolLoopStrikes: 5 } })).toBe(5);
		expect(
			resolveToolLoopStrikes({
				stage: { toolLoopStrikes: 2 },
				cfg: { toolLoopStrikes: 5 },
			}),
		).toBe(2);
		expect(
			formatLoopDiagnostic({
				toolName: "bash",
				consecutiveCount: 3,
				argsExcerpt: '{"command":"x"}',
				errorExcerpt: "boom",
			}),
		).toContain("bash");
	});
});

describe("parseStageVerdict contract forms", () => {
	it("last block wins", () => {
		expect(
			parseStageVerdict(
				"KAINBAIN_VERDICT: FAIL\nKAINBAIN_REASON: a\nKAINBAIN_FIX: b\nall good\nKAINBAIN_VERDICT: PASS",
			).verdict,
		).toBe("PASS");
	});

	it("continues multiline REASON/FIX lines", () => {
		const parsed = parseStageVerdict(
			"KAINBAIN_VERDICT: FAIL\nKAINBAIN_REASON: line one\nline two\nKAINBAIN_FIX: step one\nstep two",
		);
		expect(parsed).toEqual({
			verdict: "FAIL",
			reason: "line one\nline two",
			fix: "step one\nstep two",
		});
	});

	it("ignores fenced blocks (quoted examples are documentation)", () => {
		expect(
			parseStageVerdict("```text\nKAINBAIN_VERDICT: FAIL\n```").verdict,
		).toBeNull();
	});

	it("maps MAYBE and prose verdicts to null (no signal)", () => {
		expect(parseStageVerdict("KAINBAIN_VERDICT: MAYBE").verdict).toBeNull();
		expect(
			parseStageVerdict("Verdict: STAGE FAILED — rework required").verdict,
		).toBeNull();
		expect(parseStageVerdict("").verdict).toBeNull();
	});

	it("never lets a malformed trailing verdict clear a prior valid FAIL", () => {
		const parsed = parseStageVerdict(
			"KAINBAIN_VERDICT: FAIL\nKAINBAIN_REASON: canary red\nKAINBAIN_FIX: rerun\nKAINBAIN_VERDICT: MAYBE",
		);
		expect(parsed).toEqual({
			verdict: "FAIL",
			reason: "canary red",
			fix: "rerun",
		});
	});

	it("keeps a prior PASS across trailing garbage (last well-formed wins)", () => {
		expect(
			parseStageVerdict("KAINBAIN_VERDICT: PASS\nKAINBAIN_VERDICT: BOGUS")
				.verdict,
		).toBe("PASS");
	});

	it("drops REASON/FIX lines that follow a malformed verdict", () => {
		const parsed = parseStageVerdict(
			"KAINBAIN_VERDICT: PASS\nKAINBAIN_VERDICT: BOGUS\nKAINBAIN_REASON: smuggled",
		);
		expect(parsed).toEqual({ verdict: "PASS", reason: "", fix: "" });
	});

	it("still supersedes an early block with a later well-formed one", () => {
		const parsed = parseStageVerdict(
			"KAINBAIN_VERDICT: FAIL\nKAINBAIN_REASON: a\nKAINBAIN_FIX: b\nKAINBAIN_VERDICT: PASS",
		);
		expect(parsed).toEqual({ verdict: "PASS", reason: "", fix: "" });
	});
});

describe("no verdict mandate in agent prompts", () => {
	const task = { id: "task-1", goal: "Do the thing" };

	it("does not inject a machine-checked verdict contract into agent prompts", () => {
		const engine = new PromptCurationEngine();
		const prompt = engine.curatePrompt(task, {
			id: "s1",
			name: "Work",
			type: "agent",
			prompt: "Do it",
		});
		expect(prompt).not.toContain("# Verdict Contract");
		expect(prompt).not.toContain("KAINBAIN_VERDICT: PASS|FAIL");
	});
});

describe("the verdict gate is agent-only", () => {
	const reasonedFail =
		"Nothing changed.\nKAINBAIN_VERDICT: FAIL\nKAINBAIN_REASON: no changes made\nKAINBAIN_FIX: make a change";

	async function run(stageType, output = reasonedFail) {
		const runner = createAgentRunner({
			getOrCreateSession: vi.fn().mockResolvedValue(makeSession(output)),
		});
		return runner("Do work", { projectId: "proj-1", stage: { type: stageType } });
	}

	it("fails a reasoned FAIL on an agent stage", async () => {
		const res = await run("agent");
		expect(res.failed).toBe(true);
		expect(res.failureKind).toBe("rejected");
	});

	it("never fails a human stage from a stray verdict block", async () => {
		const res = await run("human");
		expect(res.failed).toBe(false);
		expect(res.failureKind).toBe("none");
		expect(res.failureReason).toBeNull();
	});

	it("never fails a CI stage from a stray verdict block", async () => {
		for (const type of ["ci", "deploy", "merge", "script"]) {
			const res = await run(type);
			expect(res.failed, type).toBe(false);
			expect(res.failureKind, type).toBe("none");
		}
	});

	it("treats a legacy review stage as human (no verdict gate)", async () => {
		const res = await run("review");
		expect(res.failed).toBe(false);
		expect(res.failureKind).toBe("none");
	});

	it("does not record a no-verdict/no-change rejection on a human stage", async () => {
		const res = await run("human", "all done, nothing to report");
		expect(res.failed).toBe(false);
		expect(String(res.summary || "")).not.toContain("Agent Review Rejection");
	});
});
