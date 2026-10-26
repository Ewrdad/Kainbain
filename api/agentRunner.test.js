import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	createAgentRunner,
	extractAssistantText,
	parseStageVerdict,
	buildImageAttachments,
} from "./agentRunner.js";
import { config } from "./config.js";
import { FALLBACK_MODELS } from "./models.js";

describe("extractAssistantText", () => {
	it("extracts text from getLastAssistantText method", () => {
		const session = {
			getLastAssistantText: () => "Extracted from helper",
		};
		expect(extractAssistantText(session)).toBe("Extracted from helper");
	});

	it("extracts text from messages array", () => {
		const session = {
			messages: [
				{ role: "user", content: "hello" },
				{ role: "assistant", content: "assistant response" },
			],
		};
		expect(extractAssistantText(session)).toBe("assistant response");
	});

	it("extracts text from message content array", () => {
		const session = {
			messages: [
				{ role: "assistant", content: [{ text: "part 1 " }, { text: "part 2" }] },
			],
		};
		expect(extractAssistantText(session)).toBe("part 1 part 2");
	});

	it("falls back to provided fallback when no assistant message", () => {
		const session = { messages: [] };
		expect(extractAssistantText(session, "fallback text")).toBe("fallback text");
	});
});

describe("createAgentRunner", () => {
	afterEach(() => {
		// Restore the module-singleton config knob after strict-mode tests.
		config.strictModelRunnable = false;
	});
	it("throws if getOrCreateSession is not provided or invalid", async () => {
		const runner = createAgentRunner();
		await expect(runner("prompt", { projectId: "p1" })).rejects.toThrow(
			/getOrCreateSession resolver is required/,
		);
	});

	it("throws if projectId cannot be resolved", async () => {
		const runner = createAgentRunner({ getOrCreateSession: vi.fn() });
		await expect(runner("prompt")).rejects.toThrow(
			/No projectId provided for agent execution/,
		);
	});

	it("executes prompt and returns structured output", async () => {
		const mockSession = {
			prompt: vi.fn().mockResolvedValue("Agent finished work"),
			messages: [{ role: "assistant", content: "Agent finished work" }],
		};
		const getOrCreateSession = vi.fn().mockResolvedValue(mockSession);

		const runner = createAgentRunner({ getOrCreateSession });
		const res = await runner("Solve bug", { projectId: "proj-1" });

		expect(getOrCreateSession).toHaveBeenCalledWith("proj-1", {});
		expect(mockSession.prompt).toHaveBeenCalled();
		expect(res.output).toBe("Agent finished work");
		expect(res.failed).toBe(false);
	});

	it("carries the running harness id on success for reliability tracking", async () => {
		const mockSession = {
			harnessId: "pi",
			prompt: vi.fn().mockResolvedValue("Agent finished work"),
			messages: [{ role: "assistant", content: "Agent finished work" }],
		};
		const getOrCreateSession = vi.fn().mockResolvedValue(mockSession);

		const runner = createAgentRunner({ getOrCreateSession });
		const res = await runner("Solve bug", { projectId: "proj-1" });

		expect(res.failed).toBe(false);
		expect(res.failureKind).toBe("none");
		expect(res.harnessId).toBe("pi");
	});

	it("carries the running harness id on infrastructure failures", async () => {
		const mockSession = {
			harnessId: "antigravity",
			prompt: vi.fn().mockRejectedValue(new Error("socket hang up")),
			messages: [],
		};
		const getOrCreateSession = vi.fn().mockResolvedValue(mockSession);

		const runner = createAgentRunner({ getOrCreateSession });
		const res = await runner("Solve bug", { projectId: "proj-1" });

		expect(res.failed).toBe(true);
		expect(res.failureKind).toBe("infrastructure");
		expect(res.harnessId).toBe("antigravity");
	});

	it("reports a null harness id when the session predates the harness contract", async () => {
		const mockSession = {
			prompt: vi.fn().mockResolvedValue("Agent finished work"),
			messages: [{ role: "assistant", content: "Agent finished work" }],
		};
		const getOrCreateSession = vi.fn().mockResolvedValue(mockSession);

		const runner = createAgentRunner({ getOrCreateSession });
		const res = await runner("Solve bug", { projectId: "proj-1" });

		expect(res.failed).toBe(false);
		expect(res.harnessId).toBeNull();
	});

	it("passes stage run metadata so the resolver begins a fresh per-stage session", async () => {
		const mockSession = {
			prompt: vi.fn().mockResolvedValue("done"),
			messages: [{ role: "assistant", content: "done" }],
		};
		const getOrCreateSession = vi.fn().mockResolvedValue(mockSession);

		const runner = createAgentRunner({ getOrCreateSession });
		await runner("Plan the work", {
			projectId: "proj-1",
			taskId: "task-9",
			stage: { id: "s3", name: "Plan", type: "agent" },
		});

		expect(getOrCreateSession).toHaveBeenCalledWith("proj-1", {
			taskId: "task-9",
			stageId: "s3",
		});
	});

	it("forwards a stage harness override (trimmed) so the stage runs on that harness", async () => {
		const mockSession = {
			prompt: vi.fn().mockResolvedValue("done"),
			messages: [{ role: "assistant", content: "done" }],
		};
		const getOrCreateSession = vi.fn().mockResolvedValue(mockSession);

		const runner = createAgentRunner({ getOrCreateSession });
		await runner("Debug visually", {
			projectId: "proj-1",
			taskId: "task-9",
			stage: { id: "s7", name: "Visual Debug", type: "agent", harness: "  antigravity  " },
		});

		expect(getOrCreateSession).toHaveBeenCalledWith("proj-1", {
			taskId: "task-9",
			stageId: "s7",
			harness: "antigravity",
		});
	});

	it("omits the harness override when the stage inherits (blank)", async () => {
		const mockSession = {
			prompt: vi.fn().mockResolvedValue("done"),
			messages: [{ role: "assistant", content: "done" }],
		};
		const getOrCreateSession = vi.fn().mockResolvedValue(mockSession);

		const runner = createAgentRunner({ getOrCreateSession });
		await runner("Plan the work", {
			projectId: "proj-1",
			taskId: "task-9",
			stage: { id: "s3", name: "Plan", type: "agent", harness: "   " },
		});

		expect(getOrCreateSession).toHaveBeenCalledWith("proj-1", {
			taskId: "task-9",
			stageId: "s3",
		});
	});

	it("handles timeout gracefully and returns classified error", async () => {
		const mockSession = {
			prompt: vi.fn().mockImplementation(
				() =>
					new Promise((resolve) => {
						setTimeout(() => resolve("late"), 50);
					}),
			),
			messages: [],
		};
		const getOrCreateSession = vi.fn().mockResolvedValue(mockSession);

		const runner = createAgentRunner({ getOrCreateSession });
		const res = await runner("Slow task", {
			projectId: "proj-1",
			timeout: 10,
		});

		expect(res.failed).toBe(true);
		expect(res.failureReason).toContain("[Timeout Error]");
	});

	it("detects explicit fail_stage tool call and reports failure (fallback decided by stage config)", async () => {
		let listener = null;
		const mockSession = {
			subscribe: vi.fn().mockImplementation((cb) => {
				listener = cb;
				return () => {
					listener = null;
				};
			}),
			prompt: vi.fn().mockImplementation(async () => {
				// Simulate tool invocation during session prompt
				listener?.({
					type: "tool_started",
					toolName: "fail_stage",
					args: {
						reason: "Tests did not pass minimum coverage criteria",
					},
				});
				return "Review determined that stage cannot pass.";
			}),
			messages: [
				{
					role: "assistant",
					content: "Review determined that stage cannot pass.",
				},
			],
		};
		const getOrCreateSession = vi.fn().mockResolvedValue(mockSession);

		const runner = createAgentRunner({ getOrCreateSession });
		const res = await runner("Review code", { projectId: "proj-1" });

		expect(res.failed).toBe(true);
		expect(res.failureReason).toBe(
			"[Agent Review Rejection] Tests did not pass minimum coverage criteria",
		);
		// The agent does not (and cannot) specify the fallback stage.
		expect(res.fallbackStageId).toBeNull();
		expect(res.output).toBe("Review determined that stage cannot pass.");
	});

	it("detects Fail_stage_skill tool call and reports failure (fallback decided by stage config)", async () => {
		let listener = null;
		const mockSession = {
			subscribe: vi.fn().mockImplementation((cb) => {
				listener = cb;
				return () => {
					listener = null;
				};
			}),
			prompt: vi.fn().mockImplementation(async () => {
				listener?.({
					type: "tool_started",
					toolName: "Fail_stage_skill",
					args: {
						message: "Architecture review failed due to missing security controls",
					},
				});
				return "Failing stage as requested";
			}),
			messages: [
				{
					role: "assistant",
					content: "Failing stage as requested",
				},
			],
		};
		const getOrCreateSession = vi.fn().mockResolvedValue(mockSession);

		const runner = createAgentRunner({ getOrCreateSession });
		const res = await runner("Review architecture", { projectId: "proj-1" });

		expect(res.failed).toBe(true);
		expect(res.failureReason).toBe(
			"[Agent Review Rejection] Architecture review failed due to missing security controls",
		);
		// The agent does not (and cannot) specify the fallback stage.
		expect(res.fallbackStageId).toBeNull();
	});

	it("uses default failure reason when none is provided in fail_stage args", async () => {
		let listener = null;
		const mockSession = {
			subscribe: vi.fn().mockImplementation((cb) => {
				listener = cb;
				return () => {
					listener = null;
				};
			}),
			prompt: vi.fn().mockImplementation(async () => {
				listener?.({
					type: "tool_started",
					name: "fail_stage",
					arguments: {},
				});
				return "Failed without explicit reason";
			}),
			messages: [],
		};
		const getOrCreateSession = vi.fn().mockResolvedValue(mockSession);

		const runner = createAgentRunner({ getOrCreateSession });
		const res = await runner("Run stage", { projectId: "proj-1" });

		expect(res.failed).toBe(true);
		expect(res.failureReason).toBe(
			"[Agent Review Rejection] Stage failure reported by agent review",
		);
		expect(res.failureKind).toBe("rejected");
		expect(res.fallbackStageId).toBeNull();
	});

	it("tags explicit fail_stage decisions as rejected (not infrastructure)", async () => {
		let listener = null;
		const mockSession = {
			subscribe: vi.fn().mockImplementation((cb) => {
				listener = cb;
				return () => {
					listener = null;
				};
			}),
			prompt: vi.fn().mockImplementation(async () => {
				listener?.({
					type: "tool_started",
					toolName: "fail_stage",
					args: { reason: "Does not meet the bar" },
				});
				return "Review complete";
			}),
			messages: [{ role: "assistant", content: "Review complete" }],
		};
		const runner = createAgentRunner({
			getOrCreateSession: vi.fn().mockResolvedValue(mockSession),
		});
		const res = await runner("Review code", { projectId: "proj-1" });

		expect(res.failed).toBe(true);
		expect(res.failureKind).toBe("rejected");
		expect(res.failureReason).toContain("[Agent Review Rejection]");
	});

	it("parses verdict blocks (last block wins, multiline values)", () => {
		expect(
			parseStageVerdict(
				"review prose\nKAINBAIN_VERDICT: FAIL\nKAINBAIN_REASON: red\nmore reason\nKAINBAIN_FIX: blue\nmore fix",
			),
		).toEqual({
			verdict: "FAIL",
			reason: "red\nmore reason",
			fix: "blue\nmore fix",
		});
		expect(parseStageVerdict("all good\nKAINBAIN_VERDICT: PASS").verdict).toBe(
			"PASS",
		);
		expect(
			parseStageVerdict("KAINBAIN_VERDICT: FAIL\nKAINBAIN_VERDICT: PASS").verdict,
		).toBe("PASS");
		expect(parseStageVerdict("Verdict: FAIL (prose only)").verdict).toBeNull();
		expect(parseStageVerdict("KAINBAIN_VERDICT: MAYBE").verdict).toBeNull();
		expect(parseStageVerdict("").verdict).toBeNull();
	});

	it("ignores verdict blocks inside fenced code blocks (skill examples are not signals)", () => {
		const fencedFail =
			"```text\nKAINBAIN_VERDICT: FAIL\nKAINBAIN_REASON: red\nKAINBAIN_FIX: blue\n```";
		expect(parseStageVerdict(fencedFail).verdict).toBeNull();
		// A fenced example neither starts a verdict nor supersedes a real one.
		expect(
			parseStageVerdict(`KAINBAIN_VERDICT: PASS\n${fencedFail}`).verdict,
		).toBe("PASS");
		expect(
			parseStageVerdict(
				`${fencedFail}\nall good\nKAINBAIN_VERDICT: PASS`,
			).verdict,
		).toBe("PASS");
		// Tilde fences and info strings behave the same; an unclosed fence
		// swallows the rest (fail open, never a spurious FAIL).
		expect(
			parseStageVerdict("~~~text\nKAINBAIN_VERDICT: FAIL\n~~~").verdict,
		).toBeNull();
		expect(parseStageVerdict("```\nKAINBAIN_VERDICT: FAIL").verdict).toBeNull();
	});

	it("fails the stage on a reasoned FAIL verdict block (wrapped-harness path)", async () => {
		const output =
			"Deep review complete.\nKAINBAIN_VERDICT: FAIL\nKAINBAIN_REASON: canary test red\nKAINBAIN_FIX: pause the stage in spec setup";
		const mockSession = {
			subscribe: () => () => {},
			prompt: vi.fn().mockResolvedValue(output),
			messages: [{ role: "assistant", content: output }],
		};
		const runner = createAgentRunner({
			getOrCreateSession: vi.fn().mockResolvedValue(mockSession),
		});
		const res = await runner("Review code", { projectId: "proj-1" });

		expect(res.failed).toBe(true);
		expect(res.failureKind).toBe("rejected");
		expect(res.fallbackStageId).toBeNull();
		expect(res.failureReason).toContain("canary test red");
		expect(res.failureReason).toContain("pause the stage in spec setup");
		expect(res.output).toBe(output);
	});

	it("ignores verdict-looking blocks inside fenced code (quoted examples)", () => {
		// The stage-verdict skill's own FAIL example, as echoed back by the
		// mock harness (Mock reply: <prompt>) or quoted by a real agent:
		// fenced, so it must never read as a live FAIL.
		const quotedExample =
			"Mock reply: how to fail\n```text\nKAINBAIN_VERDICT: FAIL\nKAINBAIN_REASON: <what is wrong>\nKAINBAIN_FIX: <how to fix>\n```\nStage execution completed";
		expect(parseStageVerdict(quotedExample).verdict).toBeNull();
		// A real unfenced verdict after a quoted example still wins.
		expect(
			parseStageVerdict(
				`${quotedExample}\nall done\nKAINBAIN_VERDICT: PASS`,
			).verdict,
		).toBe("PASS");
		expect(
			parseStageVerdict(
				"```\nKAINBAIN_VERDICT: PASS\n```\nKAINBAIN_VERDICT: FAIL\nKAINBAIN_REASON: red\nKAINBAIN_FIX: blue",
			),
		).toEqual({ verdict: "FAIL", reason: "red", fix: "blue" });
	});

	it("fails OPEN on a reasonless FAIL verdict (passes, never fails without guidance)", async () => {
		const output = "Something is wrong.\nKAINBAIN_VERDICT: FAIL";
		const mockSession = {
			subscribe: () => () => {},
			prompt: vi.fn().mockResolvedValue(output),
			messages: [{ role: "assistant", content: output }],
		};
		const runner = createAgentRunner({
			getOrCreateSession: vi.fn().mockResolvedValue(mockSession),
		});
		const res = await runner("Review code", { projectId: "proj-1" });

		expect(res.failed).toBe(false);
		expect(res.failureKind).toBe("none");
	});

	it("fails OPEN on a FAIL verdict with reason but no fix guidance", async () => {
		const output =
			"Bad news.\nKAINBAIN_VERDICT: FAIL\nKAINBAIN_REASON: canary test red";
		const mockSession = {
			subscribe: () => () => {},
			prompt: vi.fn().mockResolvedValue(output),
			messages: [{ role: "assistant", content: output }],
		};
		const runner = createAgentRunner({
			getOrCreateSession: vi.fn().mockResolvedValue(mockSession),
		});
		const res = await runner("Review code", { projectId: "proj-1" });

		expect(res.failed).toBe(false);
	});

	it("passes on a PASS verdict block or prose-only verdicts", async () => {
		for (const output of [
			"Solid work.\nKAINBAIN_VERDICT: PASS",
			"Verdict: STAGE FAILED — rework required (prose, no block)",
		]) {
			const mockSession = {
				subscribe: () => () => {},
				prompt: vi.fn().mockResolvedValue(output),
				messages: [{ role: "assistant", content: output }],
			};
			const runner = createAgentRunner({
				getOrCreateSession: vi.fn().mockResolvedValue(mockSession),
			});
			const res = await runner("Review code", { projectId: "proj-1" });
			expect(res.failed).toBe(false);
		}
	});

	it("tags model exceptions (e.g. 503) as infrastructure failures", async () => {
		const mockSession = {
			subscribe: () => () => {},
			prompt: vi
				.fn()
				.mockRejectedValue(new Error("503 Internal server error")),
			messages: [],
		};
		const runner = createAgentRunner({
			getOrCreateSession: vi.fn().mockResolvedValue(mockSession),
		});
		const res = await runner("Review code", { projectId: "proj-1" });

		expect(res.failed).toBe(true);
		expect(res.failureKind).toBe("infrastructure");
		expect(res.failureReason).toContain("[Model Connection Error]");
		expect(res.failureReason).toContain("503");
	});

	it("tags session run_error events as infrastructure failures", async () => {
		let listener = null;
		const mockSession = {
			subscribe: vi.fn().mockImplementation((cb) => {
				listener = cb;
				return () => {
					listener = null;
				};
			}),
			prompt: vi.fn().mockImplementation(async () => {
				listener?.({ type: "run_error", error: { message: "fetch failed" } });
				return "partial output";
			}),
			messages: [{ role: "assistant", content: "partial output" }],
		};
		const runner = createAgentRunner({
			getOrCreateSession: vi.fn().mockResolvedValue(mockSession),
		});
		const res = await runner("Review code", { projectId: "proj-1" });

		expect(res.failed).toBe(true);
		expect(res.failureKind).toBe("infrastructure");
	});
});


describe("createAgentRunner model overrides", () => {
	const makeSession = (overrides = {}) => ({
		prompt: vi.fn().mockResolvedValue("done"),
		messages: [{ role: "assistant", content: "done" }],
		subscribe: () => () => {},
		...overrides,
	});

	it("switches to the stage model when it resolves against the contract's model list", async () => {
		const glm = { provider: "ollama-cloud-direct", id: "glm-5.3-flash:cloud" };
		const mockSession = makeSession({
			getActiveModel: async () => ({
				provider: "ollama-cloud",
				id: "deepseek-v4-flash:0731-cloud",
			}),
			switchModel: vi.fn().mockResolvedValue(glm),
			listModels: async () => [
				{ provider: "ollama-cloud", id: "deepseek-v4-flash:0731-cloud" },
				glm,
			],
		});
		const getOrCreateSession = vi.fn().mockResolvedValue(mockSession);
		const runner = createAgentRunner({ getOrCreateSession });

		await runner("do work", {
			projectId: "proj-1",
			stage: { id: "s1", model: "ollama-cloud-direct::glm-5.3-flash:cloud" },
		});

		expect(mockSession.switchModel).toHaveBeenCalledWith(glm);
	});

	it("visibly warns and keeps the session model when the stage model is unavailable", async () => {
		const mockSession = makeSession({
			getActiveModel: async () => ({
				provider: "ollama-cloud",
				id: "deepseek-v4-flash:0731-cloud",
			}),
			switchModel: vi.fn().mockResolvedValue(undefined),
			listModels: async () => [
				{ provider: "ollama-cloud", id: "deepseek-v4-flash:0731-cloud" },
			],
		});
		const getOrCreateSession = vi.fn().mockResolvedValue(mockSession);
		const runner = createAgentRunner({ getOrCreateSession });
		const chunks = [];

		await runner("do work", {
			projectId: "proj-1",
			stage: { id: "s1", model: "deepseek-v4-pro:preview-cloud" },
			onChunk: (c) => chunks.push(c),
		});

		expect(mockSession.switchModel).not.toHaveBeenCalled();
		const joined = chunks.join("");
		expect(joined).toContain("[WARN]");
		expect(joined).toContain("deepseek-v4-pro:preview-cloud");
		expect(joined).toContain("deepseek-v4-flash:0731-cloud");
	});

	it("names the discovery failure when the stage model cannot resolve on a broken catalogue (warn-first default)", async () => {
		const mockSession = makeSession({
			harnessId: "antigravity",
			getActiveModel: async () => null,
			switchModel: vi.fn().mockResolvedValue(undefined),
			listModels: async () => [],
			getModelDiscoveryStatus: async () => ({
				ok: false,
				error: {
					code: "AGY_BIN_MISSING",
					message: "The agy CLI was not found.",
					hint: "Install the Antigravity CLI.",
				},
			}),
		});
		const getOrCreateSession = vi.fn().mockResolvedValue(mockSession);
		const runner = createAgentRunner({ getOrCreateSession });
		const chunks = [];

		const res = await runner("do work", {
			projectId: "proj-1",
			stage: { id: "s1", model: "antigravity::antigravity::gemini-3.1-pro-high" },
			onChunk: (c) => chunks.push(c),
		});

		// Warn-first: the stage still runs, but the broken catalogue is loud.
		expect(res.failed).toBe(false);
		expect(mockSession.prompt).toHaveBeenCalled();
		const joined = chunks.join("");
		expect(joined).toContain("[WARN]");
		expect(joined).toContain("gemini-3.1-pro-high");
		expect(joined).toContain("AGY_BIN_MISSING");
		expect(joined).toContain("The agy CLI was not found.");
		expect(joined).toContain("Install the Antigravity CLI.");
	});

	it("fails fast when strict model-discovery mode is on and discovery failed", async () => {
		config.strictModelDiscovery = true;
		try {
			const mockSession = makeSession({
				harnessId: "antigravity",
				getActiveModel: async () => null,
				switchModel: vi.fn().mockResolvedValue(undefined),
				listModels: async () => [],
				getModelDiscoveryStatus: async () => ({
					ok: false,
					error: {
						code: "AGY_MODELS_AUTH",
						message: "authentication problem.",
						hint: "Run `agy auth login`.",
					},
				}),
			});
			const getOrCreateSession = vi.fn().mockResolvedValue(mockSession);
			const runner = createAgentRunner({ getOrCreateSession });
			const chunks = [];

			const res = await runner("do work", {
				projectId: "proj-1",
				stage: { id: "s1", model: "antigravity::antigravity::gemini-3.1-pro-high" },
				onChunk: (c) => chunks.push(c),
			});

			// Strict mode: no quota is spent on the wrong backend.
			expect(mockSession.switchModel).not.toHaveBeenCalled();
			expect(mockSession.prompt).not.toHaveBeenCalled();
			expect(res.failed).toBe(true);
			expect(res.failureReason).toContain("[Model Discovery Error]");
			expect(res.failureReason).toContain("AGY_MODELS_AUTH");
			expect(chunks.join("")).toContain("[Model Discovery Error]");
		} finally {
			config.strictModelDiscovery = false;
		}
	});

	it("still warn-and-runs in strict mode for a cross-harness stale key (the fix is the key, not discovery)", async () => {
		config.strictModelDiscovery = true;
		try {
			const mockSession = makeSession({
				harnessId: "pi",
				getActiveModel: async () => null,
				switchModel: vi.fn().mockResolvedValue(undefined),
				listModels: async () => [],
				getModelDiscoveryStatus: async () => ({
					ok: false,
					error: { code: "AGY_BIN_MISSING", message: "m", hint: "h" },
				}),
			});
			const getOrCreateSession = vi.fn().mockResolvedValue(mockSession);
			const runner = createAgentRunner({ getOrCreateSession });
			const chunks = [];

			const res = await runner("do work", {
				projectId: "proj-1",
				stage: { id: "s1", model: "antigravity::antigravity::gemini-3.8-flash-medium" },
				onChunk: (c) => chunks.push(c),
			});

			expect(res.failed).toBe(false);
			expect(mockSession.prompt).toHaveBeenCalled();
			expect(chunks.join("")).toContain("scoped to harness 'antigravity'");
		} finally {
			config.strictModelDiscovery = false;
		}
	});

	it("tells the operator exactly how to fix a cross-harness stale model key", async () => {
		const mockSession = makeSession({
			harnessId: "pi",
			getActiveModel: async () => null,
			switchModel: vi.fn().mockResolvedValue(undefined),
			listModels: async () => [],
		});
		const getOrCreateSession = vi.fn().mockResolvedValue(mockSession);
		const runner = createAgentRunner({ getOrCreateSession });
		const chunks = [];

		await runner("do work", {
			projectId: "proj-1",
			stage: { id: "s1", model: "antigravity::antigravity::gemini-3.8-flash-medium" },
			onChunk: (c) => chunks.push(c),
		});

		const joined = chunks.join("");
		expect(joined).toContain("scoped to harness 'antigravity'");
		expect(joined).toContain("change the stage model to a 'pi' model");
		expect(joined).toContain("change the project harness to 'antigravity' in Settings");
	});

	it("visibly warns when switchModel throws instead of silently continuing", async () => {
		const glm = { provider: "ollama-cloud-direct", id: "glm-5.3-flash:cloud" };
		const mockSession = makeSession({
			getActiveModel: async () => ({
				provider: "ollama-cloud",
				id: "deepseek-v4-flash:0731-cloud",
			}),
			switchModel: vi.fn().mockRejectedValue(new Error("model locked")),
			listModels: async () => [glm],
		});
		const getOrCreateSession = vi.fn().mockResolvedValue(mockSession);
		const runner = createAgentRunner({ getOrCreateSession });
		const chunks = [];

		const res = await runner("do work", {
			projectId: "proj-1",
			stage: { id: "s1", model: "ollama-cloud-direct::glm-5.3-flash:cloud" },
			onChunk: (c) => chunks.push(c),
		});

		expect(mockSession.switchModel).toHaveBeenCalled();
		expect(chunks.join("")).toContain("Failed to switch stage model");
		expect(res.failed).toBe(false);
	});

	it("falls back to resolveModelRef (full registry) when the snapshot transiently drops the model", async () => {
		const glm = { provider: "ollama-cloud-direct", id: "glm-5.3-flash:cloud" };
		const mockSession = makeSession({
			getActiveModel: async () => ({
				provider: "ollama-cloud",
				id: "deepseek-v4-flash:0731-cloud",
			}),
			switchModel: vi.fn().mockResolvedValue(glm),
			// Availability snapshot is missing glm (auth re-check flake)...
			listModels: async () => [
				{ provider: "ollama-cloud", id: "deepseek-v4-flash:0731-cloud" },
			],
			// ...but the registry still knows it.
			resolveModelRef: vi.fn(async () => glm),
			// The provider HAS configured auth — the flake case.
			modelRuntime: {
				getProviderAuthStatus: () => ({
					configured: true,
					source: "models_json_key",
					label: "models.json",
				}),
			},
		});
		const getOrCreateSession = vi.fn().mockResolvedValue(mockSession);
		const runner = createAgentRunner({ getOrCreateSession });
		const chunks = [];

		await runner("do work", {
			projectId: "proj-1",
			stage: { id: "s1", model: "ollama-cloud-direct::glm-5.3-flash:cloud" },
			onChunk: (c) => chunks.push(c),
		});

		expect(mockSession.resolveModelRef).toHaveBeenCalledWith(
			"ollama-cloud-direct::glm-5.3-flash:cloud",
			);
		// The stage still proceeds (warn-first semantics)...
		expect(mockSession.switchModel).toHaveBeenCalledWith(glm);
		// ...but a registry-only resolution is never silent: the model was not
			// snapshot-confirmed as runnable, so the guard names the auth state.
		expect(chunks.join("")).toContain("[WARN]");
		expect(chunks.join("")).toContain("glm-5.3-flash:cloud");
		expect(chunks.join("")).toContain("auth configured");
	});

	it("warns loudly when the stage model has no valid credentials (warn-first default)", async () => {
		const glm = { provider: "google", id: "gemini-2.5-pro" };
		const mockSession = makeSession({
			getActiveModel: async () => ({
				provider: "ollama-cloud",
				id: "deepseek-v4-flash:0731-cloud",
			}),
			switchModel: vi.fn().mockResolvedValue(glm),
			// Snapshot has no google models: no credentials for that provider.
			listModels: async () => [
				{ provider: "ollama-cloud", id: "deepseek-v4-flash:0731-cloud" },
			],
			// The registry still knows the (uncredentialed) model.
			resolveModelRef: vi.fn(async () => glm),
			modelRuntime: {
				getProviderAuthStatus: () => ({ configured: false }),
			},
		});
		const getOrCreateSession = vi.fn().mockResolvedValue(mockSession);
		const runner = createAgentRunner({ getOrCreateSession });
		const chunks = [];

		const res = await runner("do work", {
			projectId: "proj-1",
			stage: { id: "s1", model: "google::gemini-2.5-pro" },
			onChunk: (c) => chunks.push(c),
		});

		// Warn-first: the stage still runs, but the missing credentials are loud.
		expect(res.failed).toBe(false);
		const joined = chunks.join("");
		expect(joined).toContain("[WARN]");
		expect(joined).toContain("no valid credentials");
		expect(joined).toContain("auth not configured");
		expect(joined).toContain("gemini-2.5-pro");
	});

	it("fails fast with an authentication error when strict model-runnable mode is on", async () => {
		config.strictModelRunnable = true;
		const glm = { provider: "google", id: "gemini-2.5-pro" };
		const mockSession = makeSession({
			getActiveModel: async () => ({
				provider: "ollama-cloud",
				id: "deepseek-v4-flash:0731-cloud",
			}),
			switchModel: vi.fn().mockResolvedValue(glm),
			listModels: async () => [
				{ provider: "ollama-cloud", id: "deepseek-v4-flash:0731-cloud" },
			],
			resolveModelRef: vi.fn(async () => glm),
			modelRuntime: {
				getProviderAuthStatus: () => ({ configured: false }),
			},
		});
		const getOrCreateSession = vi.fn().mockResolvedValue(mockSession);
		const runner = createAgentRunner({ getOrCreateSession });
		const chunks = [];

		const res = await runner("do work", {
			projectId: "proj-1",
			stage: { id: "s1", model: "google::gemini-2.5-pro" },
			onChunk: (c) => chunks.push(c),
		});

		// Strict mode: no quota is spent on an uncredentialed model.
		expect(mockSession.switchModel).not.toHaveBeenCalled();
		expect(mockSession.prompt).not.toHaveBeenCalled();
		expect(res.failed).toBe(true);
		expect(res.failureReason).toContain("[Authentication Error]");
		expect(res.failureReason).toContain("gemini-2.5-pro");
		expect(chunks.join("")).toContain("[Authentication Error]");
	});

	it("runs normally in strict mode when the stage model is snapshot-confirmed runnable", async () => {
		config.strictModelRunnable = true;
		const glm = { provider: "ollama-cloud-direct", id: "glm-5.3-flash:cloud" };
		const mockSession = makeSession({
			getActiveModel: async () => ({
				provider: "ollama-cloud",
				id: "deepseek-v4-flash:0731-cloud",
			}),
			switchModel: vi.fn().mockResolvedValue(glm),
			listModels: async () => [
				{ provider: "ollama-cloud", id: "deepseek-v4-flash:0731-cloud" },
				glm,
			],
		});
		const getOrCreateSession = vi.fn().mockResolvedValue(mockSession);
		const runner = createAgentRunner({ getOrCreateSession });
		const chunks = [];

		const res = await runner("do work", {
			projectId: "proj-1",
			stage: { id: "s1", model: "ollama-cloud-direct::glm-5.3-flash:cloud" },
			onChunk: (c) => chunks.push(c),
		});

		expect(mockSession.switchModel).toHaveBeenCalledWith(glm);
		expect(mockSession.prompt).toHaveBeenCalled();
		expect(res.failed).toBe(false);
		expect(chunks.join("")).not.toContain("[WARN]");
	});

	it("still supports pre-contract sessions via the classic modelRuntime/setModel fields", async () => {
		const glm = { provider: "ollama-cloud-direct", id: "glm-5.3-flash:cloud" };
		const mockSession = makeSession({
			model: { provider: "ollama-cloud", id: "deepseek-v4-flash:0731-cloud" },
			setModel: vi.fn().mockResolvedValue(undefined),
			modelRuntime: {
				getAvailableSnapshot: () => [glm],
			},
		});
		const getOrCreateSession = vi.fn().mockResolvedValue(mockSession);
		const runner = createAgentRunner({ getOrCreateSession });

		await runner("do work", {
			projectId: "proj-1",
			stage: { id: "s1", model: "ollama-cloud-direct::glm-5.3-flash:cloud" },
		});

		expect(mockSession.setModel).toHaveBeenCalledWith(glm);
	});

	// --- Harness-scoped reference normalization (harness::provider::id) ---
	it("normalizes a stored legacy 2-part ref against the session's harness", async () => {
		const glm = {
			provider: "ollama-cloud-direct",
			id: "glm-5.3-flash:cloud",
			key: "pi::ollama-cloud-direct::glm-5.3-flash:cloud",
			harness: "pi",
		};
		const mockSession = makeSession({
			harnessId: "pi",
			getActiveModel: async () => ({
				provider: "ollama-cloud",
				id: "deepseek-v4-flash:0731-cloud",
			}),
			switchModel: vi.fn().mockResolvedValue(glm),
			// The contract snapshot now carries harness-scoped keys.
			listModels: async () => [glm],
		});
		const getOrCreateSession = vi.fn().mockResolvedValue(mockSession);
		const runner = createAgentRunner({ getOrCreateSession });
		const chunks = [];

		await runner("do work", {
			projectId: "proj-1",
			stage: { id: "s1", model: "ollama-cloud-direct::glm-5.3-flash:cloud" },
			onChunk: (c) => chunks.push(c),
		});

		expect(mockSession.switchModel).toHaveBeenCalledWith(glm);
		// Normalization succeeded — no fallback warning.
		expect(chunks.join("")).not.toContain("[WARN]");
	});

	it("still switches on a canonical 3-part ref when the session has no harnessId", async () => {
		const glm = { provider: "ollama-cloud-direct", id: "glm-5.3-flash:cloud" };
		const mockSession = makeSession({
			getActiveModel: async () => ({
				provider: "ollama-cloud",
				id: "deepseek-v4-flash:0731-cloud",
			}),
			switchModel: vi.fn().mockResolvedValue(glm),
			listModels: async () => [glm],
		});
		const getOrCreateSession = vi.fn().mockResolvedValue(mockSession);
		const runner = createAgentRunner({ getOrCreateSession });

		await runner("do work", {
			projectId: "proj-1",
			stage: {
				id: "s1",
				model: "pi::ollama-cloud-direct::glm-5.3-flash:cloud",
			},
		});

		expect(mockSession.switchModel).toHaveBeenCalledWith(glm);
	});

	it("warns (but still switches) when a 3-part ref names a foreign harness", async () => {
		const glm = {
			provider: "ollama-cloud-direct",
			id: "glm-5.3-flash:cloud",
			key: "pi::ollama-cloud-direct::glm-5.3-flash:cloud",
			harness: "pi",
		};
		const mockSession = makeSession({
			harnessId: "pi",
			getActiveModel: async () => ({
				provider: "ollama-cloud",
				id: "deepseek-v4-flash:0731-cloud",
			}),
			switchModel: vi.fn().mockResolvedValue(glm),
			listModels: async () => [glm],
		});
		const getOrCreateSession = vi.fn().mockResolvedValue(mockSession);
		const runner = createAgentRunner({ getOrCreateSession });
		const chunks = [];

		await runner("do work", {
			projectId: "proj-1",
			stage: {
				id: "s1",
				model: "retired-harness::ollama-cloud-direct::glm-5.3-flash:cloud",
			},
			onChunk: (c) => chunks.push(c),
		});

		// Still switched (provider::id is unique with one configured harness)…
		expect(mockSession.switchModel).toHaveBeenCalledWith(glm);
		// …and the stale key form was loudly flagged, not silently accepted.
		const joined = chunks.join("");
		expect(joined).toContain("[WARN]");
		expect(joined).toContain("retired-harness");
		expect(joined).toContain("provider::id");
	});

	it("keeps the 'default' sentinel skipping model switching entirely", async () => {
		const glm = { provider: "ollama-cloud-direct", id: "glm-5.3-flash:cloud" };
		const mockSession = makeSession({
			harnessId: "pi",
			switchModel: vi.fn(),
			listModels: async () => [glm],
		});
		const getOrCreateSession = vi.fn().mockResolvedValue(mockSession);
		const runner = createAgentRunner({ getOrCreateSession });

		await runner("do work", {
			projectId: "proj-1",
			stage: { id: "s1", model: "default" },
		});

		expect(mockSession.switchModel).not.toHaveBeenCalled();
	});

});

describe("createAgentRunner grouped log streaming", () => {
	/***
	 * MARK: makeEventSession
	 * @description Builds a mock session that replays a realistic normalized
	 *   event sequence during prompt(): two turns with thinking, assistant
	 *   text, a successful tool call and a failing one.
	 ***/
	function makeEventSession() {
		let listener = null;
		const replay = async () => {
			// Turn 1
			listener?.({ type: "run_started" });
			listener?.({ type: "message_started", message: { role: "assistant" } });
			listener?.({
				type: "assistant_delta",
				assistantMessageEvent: { type: "thinking_delta", delta: "hidden reasoning " },
			});
			listener({
				type: "assistant_delta",
				assistantMessageEvent: { type: "thinking_delta", delta: "tokens" },
			});
			listener?.({ type: "assistant_delta", assistantMessageEvent: { type: "thinking_end" } });
			listener?.({
				type: "assistant_delta",
				assistantMessageEvent: { type: "text_delta", delta: "Fixing the " },
			});
			listener?.({
				type: "assistant_delta",
				assistantMessageEvent: { type: "text_delta", delta: "config now." },
			});
			listener?.({ type: "assistant_delta", assistantMessageEvent: { type: "text_end" } });
			listener?.({
				type: "tool_started",
				toolName: "edit",
				toolCallId: "tc-1",
				args: { path: "src/config.js" },
			});
			listener?.({ type: "tool_finished", toolName: "edit", toolCallId: "tc-1", result: "patched" });
			listener?.({ type: "run_finished" });
			// Turn 2
			listener?.({ type: "run_started" });
			listener?.({
				type: "assistant_delta",
				assistantMessageEvent: { type: "text_delta", delta: "Done." },
			});
			listener?.({ type: "run_finished" });
		};
		return {
			subscribe: (cb) => {
				listener = cb;
				return () => {
					listener = null;
				};
			},
			prompt: vi.fn().mockImplementation(replay),
			messages: [{ role: "assistant", content: "Done." }],
		};
	}

	it("streams grouped blocks instead of token fragments", async () => {
		const chunks = [];
		const session = makeEventSession();
		const runner = createAgentRunner({ getOrCreateSession: vi.fn().mockResolvedValue(session) });

		const res = await runner("fix config", { projectId: "proj-1", onChunk: (c) => chunks.push(c) });

		// Every chunk is a COMPLETE semantic block — no token fragments.
		expect(chunks).toEqual([
			"[AGENT] Agent reasoning with model default...",
			"[THINKING] (23 chars)",
			"Fixing the config now.",
			'[TOOL] edit({"path":"src/config.js"})',
			"[RESULT] patched",
			"[AGENT] Agent reasoning with model default...",
			"Done.",
		]);

		// Thinking never reaches the main log stream by default; the marker
		// carries the character count instead.
		expect(chunks.join("\n")).not.toContain("hidden reasoning");
		expect(chunks).toContain("[THINKING] (23 chars)");

		// Tool blocks stay correlated with their tool call id.
		const result = res;
		expect(result.logEntries).toHaveLength(8); // 2x[AGENT] + thinking + marker + text + tool + result + text
		const toolEntry = result.logEntries.find((e) => e.text.startsWith("[TOOL]"));
		expect(toolEntry.meta).toMatchObject({ toolName: "edit", toolCallId: "tc-1" });
		const resultEntry = result.logEntries.find((e) => e.text.startsWith("[RESULT]"));
		expect(resultEntry.meta.toolCallId).toBe("tc-1");

		// Thinking is routed to the dedicated thinking feed only.
		const thinkingEntry = result.logEntries.find((e) => e.kind === "thinking" && e.feed === "thinking");
		expect(thinkingEntry.text).toBe("hidden reasoning tokens");
	});

	it("still detects fail_stage and tracks modified files alongside the streamer", async () => {
		let listener = null;
		const session = {
			subscribe: (cb) => {
				listener = cb;
				return () => {
					listener = null;
				};
			},
			prompt: vi.fn().mockImplementation(async () => {
				listener?.({ type: "run_started" });
				listener?.({
					type: "tool_started",
					toolName: "fail_stage",
					toolCallId: "tc-f",
					args: { reason: "coverage too low" },
				});
				return "cannot pass";
			}),
			messages: [],
		};
		const runner = createAgentRunner({ getOrCreateSession: vi.fn().mockResolvedValue(session) });
		const chunks = [];

		const res = await runner("review", { projectId: "proj-1", onChunk: (c) => chunks.push(c) });

		expect(res.failed).toBe(true);
		expect(res.failureReason).toBe("[Agent Review Rejection] coverage too low");
		// The fail_stage call is still visible as a grouped [TOOL] entry.
		expect(chunks.join("\n")).toContain("[TOOL] fail_stage(");
		expect(res.logEntries.some((e) => e.meta.toolName === "fail_stage")).toBe(true);
	});
});

describe("buildImageAttachments", () => {
	let tempCwd;
	const visionModel = FALLBACK_MODELS.find((m) => m.input?.includes("image"));
	const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

	beforeEach(() => {
		tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-runner-images-"));
	});

	afterEach(() => {
		try {
			fs.rmSync(tempCwd, { recursive: true, force: true });
		} catch {
			// ignore cleanup error
		}
	});

	const writeAsset = (taskId, name, bytes = pngBytes) => {
		const assetsDir = path.join(tempCwd, "docs", "tasks", taskId, "assets");
		fs.mkdirSync(assetsDir, { recursive: true });
		fs.writeFileSync(path.join(assetsDir, name), bytes);
	};

	it("returns nothing when no image files are provided", async () => {
		const result = await buildImageAttachments({
			imageFiles: [],
			cwd: tempCwd,
			taskId: "t1",
			session: { harnessId: "pi" },
			modelRef: visionModel.id,
		});
		expect(result.images).toEqual([]);
		expect(result.note).toBeNull();
	});

	it("degrades to a path-only note for harnesses without image dispatch", async () => {
		const notes = [];
		const result = await buildImageAttachments({
			imageFiles: ["assets/a.png"],
			cwd: tempCwd,
			taskId: "t1",
			session: { harnessId: "muse" },
			modelRef: visionModel.id,
			emit: (msg) => notes.push(msg),
		});
		expect(result.images).toEqual([]);
		expect(result.note).toContain("no image-input support");
		expect(notes).toHaveLength(1);
	});

	it("degrades for unknown harnesses and unknown models (no crash, no bytes)", async () => {
		const result = await buildImageAttachments({
			imageFiles: ["assets/a.png"],
			cwd: tempCwd,
			taskId: "t1",
			session: { harnessId: "brand-new-harness" },
			modelRef: "ghost::model",
		});
		expect(result.images).toEqual([]);
	});

	it("attaches base64 image content for a vision-capable harness+model", async () => {
		writeAsset("t1", "shot.png");
		const session = {
			harnessId: "pi",
			listModels: async () => FALLBACK_MODELS,
		};
		const result = await buildImageAttachments({
			imageFiles: ["assets/shot.png"],
			cwd: tempCwd,
			taskId: "t1",
			session,
			modelRef: visionModel.id,
		});
		expect(result.images).toHaveLength(1);
		expect(result.images[0].type).toBe("image");
		// pi-ai ImageContent is flat ({ type, data, mimeType }); the Anthropic
		// wire shape ({ source: { type: "base64", ... } }) is never valid here
		// — adapters read block.data / block.mimeType directly.
		expect(result.images[0]).not.toHaveProperty("source");
		expect(result.images[0].mimeType).toBe("image/png");
		expect(typeof result.images[0].data).toBe("string");
		expect(
			Buffer.from(result.images[0].data, "base64").equals(pngBytes),
		).toBe(true);
		expect(result.note).toContain("attaching 1 task image(s)");
	});

	it("skips missing files and oversized files instead of failing the stage", async () => {
		writeAsset("t2", "tiny.png", Buffer.from([1, 2, 3]));
		writeAsset("t2", "huge.png", Buffer.alloc(config.taskImageMaxBytes + 1, 9));
		const originalTotalCap = config.taskImageMaxAttachBytes;
		config.taskImageMaxAttachBytes = 8;
		try {
			const result = await buildImageAttachments({
				imageFiles: ["assets/ghost.png", "assets/huge.png", "assets/tiny.png"],
				cwd: tempCwd,
				taskId: "t2",
				session: { harnessId: "pi", listModels: async () => FALLBACK_MODELS },
				modelRef: visionModel.id,
			});
			expect(result.images).toHaveLength(1);
			expect(result.note).toContain("2 file(s) skipped");
		} finally {
			config.taskImageMaxAttachBytes = originalTotalCap;
		}
	});
});

describe("createAgentRunner image dispatch", () => {
	const visionModel = FALLBACK_MODELS.find((m) => m.input?.includes("image"));
	const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 5, 6]);

	const makeSession = (overrides = {}) => ({
		prompt: vi.fn().mockResolvedValue("done"),
		messages: [{ role: "assistant", content: "done" }],
		...overrides,
	});

	it("passes image bytes in prompt options for a vision-capable session", async () => {
		const tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-runner-disp-"));
		try {
			const assetsDir = path.join(tempCwd, "docs", "tasks", "task-v", "assets");
			fs.mkdirSync(assetsDir, { recursive: true });
			fs.writeFileSync(path.join(assetsDir, "shot.png"), pngBytes);

			const session = makeSession({
				harnessId: "pi",
				model: { id: visionModel.id },
				listModels: async () => FALLBACK_MODELS,
			});
			const runner = createAgentRunner({
				getOrCreateSession: vi.fn().mockResolvedValue(session),
			});
			await runner("Work with the image", {
				projectId: "proj-1",
				taskId: "task-v",
				cwd: tempCwd,
				imageFiles: ["assets/shot.png"],
			});

			const options = session.prompt.mock.calls[0]?.[1] || {};
			expect(options.images).toHaveLength(1);
			expect(options.images[0]).not.toHaveProperty("source");
			expect(options.images[0].mimeType).toBe("image/png");
		} finally {
			fs.rmSync(tempCwd, { recursive: true, force: true });
		}
	});

	it("sends path mentions only for sessions without image dispatch", async () => {
		const session = makeSession({ harnessId: "muse" });
		const runner = createAgentRunner({
			getOrCreateSession: vi.fn().mockResolvedValue(session),
		});
		await runner("Work with images by path", {
			projectId: "proj-1",
			taskId: "task-nv",
			cwd: "/tmp",
			imageFiles: ["assets/shot.png"],
		});

		const options = session.prompt.mock.calls[0]?.[1] || {};
		expect(options.images).toBeUndefined();
	});

	it("never attaches bytes for sessions without a known model (default: no vision)", async () => {
		const tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-runner-nomodel-"));
		try {
			const assetsDir = path.join(tempCwd, "docs", "tasks", "task-nm", "assets");
			fs.mkdirSync(assetsDir, { recursive: true });
			fs.writeFileSync(path.join(assetsDir, "shot.png"), pngBytes);

			const session = makeSession({ harnessId: "pi" }); // no model, no listModels
			const runner = createAgentRunner({
				getOrCreateSession: vi.fn().mockResolvedValue(session),
			});
			await runner("Work with images", {
				projectId: "proj-1",
				taskId: "task-nm",
				cwd: tempCwd,
				imageFiles: ["assets/shot.png"],
			});

			const options = session.prompt.mock.calls[0]?.[1] || {};
			expect(options.images).toBeUndefined();
		} finally {
			fs.rmSync(tempCwd, { recursive: true, force: true });
		}
	});
});
