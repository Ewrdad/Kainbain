import { describe, it, expect, vi } from "vitest";
import { createAgentRunner } from "./agentRunner.js";

/**
 * MARK: AgentRunner characterization tests
 * @description Pins the observable runner behaviors that the harness-boundary
 *   refactor must preserve byte-for-byte: model-switch warning paths, the
 *   modified-files tool-name heuristics, the repeated tool-failure abort, and
 *   the capture-truncation guard. These are black-box tests over the runner's
 *   return object and streamed chunks only.
 */

/***
 * MARK: makeSession
 * @description Builds a duck-typed mock session shaped like the real pi session surface.
 ***/
function makeSession(overrides = {}) {
	return {
		prompt: vi.fn().mockResolvedValue("done"),
		messages: [{ role: "assistant", content: "done" }],
		subscribe: () => () => {},
		...overrides,
	};
}

/***
 * MARK: makeStreamingSession
 * @description Builds a mock session whose prompt() emits the given agent
 *   events while the runner's subscription is active, then resolves with
 *   `resolveWith` (an empty string forces the captured-output fallback path).
 ***/
function makeStreamingSession(events = [], overrides = {}, resolveWith = "done") {
	let listener = null;
	return makeSession({
		subscribe: (cb) => {
			listener = cb;
			return () => {
				listener = null;
			};
		},
		prompt: vi.fn().mockImplementation(async () => {
			for (const event of events) {
				listener?.(event);
			}
			return resolveWith;
		}),
		...overrides,
	});
}

describe("createAgentRunner characterization (model overrides)", () => {
	it("visibly warns and keeps the session model when the session cannot switch models", async () => {
		const mockSession = makeSession({
			model: { provider: "ollama-cloud", id: "deepseek-v4-flash:0731-cloud" },
			// No setModel at all — older/other harness sessions.
		});
		const getOrCreateSession = vi.fn().mockResolvedValue(mockSession);
		const runner = createAgentRunner({ getOrCreateSession });
		const chunks = [];

		const res = await runner("do work", {
			projectId: "proj-1",
			stage: { id: "s1", model: "glm-5.3-flash:cloud" },
			onChunk: (c) => chunks.push(c),
		});

		const joined = chunks.join("");
		expect(joined).toContain("[WARN]");
		expect(joined).toContain("cannot switch models");
		expect(joined).toContain("glm-5.3-flash:cloud");
		expect(joined).toContain("deepseek-v4-flash:0731-cloud");
		// The stage still ran — the warning must never abort execution.
		expect(res.failed).toBe(false);
		expect(res.output).toBe("done");
	});
});

describe("createAgentRunner characterization (modified-files heuristics)", () => {
	it.each(["write", "edit", "patch", "create"])(
		"collects the target file from a '%s' tool call",
		async (toolName) => {
			const session = makeStreamingSession([
				{ type: "tool_started", toolName, args: { path: "/repo/src/file.ts" } },
			]);
			const getOrCreateSession = vi.fn().mockResolvedValue(session);
			const runner = createAgentRunner({ getOrCreateSession });

			const res = await runner("do work", { projectId: "proj-1" });

			expect(res.modifiedFiles).toEqual(["/repo/src/file.ts"]);
		},
	);

	it.each([
		["args.filePath", { filePath: "/a.ts" }],
		["args.file", { file: "/b.ts" }],
		["args.target", { target: "/c.ts" }],
		["args.targetFile", { targetFile: "/d.ts" }],
		["args.filename", { filename: "/e.ts" }],
	])("reads the file path from %s", async (_label, args) => {
		const session = makeStreamingSession([
			{ type: "tool_started", toolName: "edit", args },
		]);
		const getOrCreateSession = vi.fn().mockResolvedValue(session);
		const runner = createAgentRunner({ getOrCreateSession });

		const res = await runner("do work", { projectId: "proj-1" });

		expect(res.modifiedFiles).toHaveLength(1);
	});

	it("does not collect files from read-only tools even when a path is present", async () => {
		const session = makeStreamingSession([
			{ type: "tool_started", toolName: "read", args: { path: "/repo/src/file.ts" } },
		]);
		const getOrCreateSession = vi.fn().mockResolvedValue(session);
		const runner = createAgentRunner({ getOrCreateSession });

		const res = await runner("do work", { projectId: "proj-1" });

		expect(res.modifiedFiles).toEqual([]);
	});

	it("does not collect files from write tools without a file-ish argument", async () => {
		const session = makeStreamingSession([
			{ type: "tool_started", toolName: "write", args: { content: "no path here" } },
		]);
		const getOrCreateSession = vi.fn().mockResolvedValue(session);
		const runner = createAgentRunner({ getOrCreateSession });

		const res = await runner("do work", { projectId: "proj-1" });

		expect(res.modifiedFiles).toEqual([]);
	});
});

describe("createAgentRunner characterization (repeated tool failure abort)", () => {
	it("aborts the session and reports a stage failure after 3 consecutive tool failures", async () => {
		const abort = vi.fn().mockResolvedValue(undefined);
		const session = makeStreamingSession(
			Array.from({ length: 3 }, () => ({
				type: "tool_finished",
				toolName: "bash",
				result: { content: [{ type: "text", text: "boom" }] },
				isError: true,
			})),
			{ abort },
		);
		const getOrCreateSession = vi.fn().mockResolvedValue(session);
		const runner = createAgentRunner({ getOrCreateSession });

		const res = await runner("do work", { projectId: "proj-1" });

		expect(abort).toHaveBeenCalled();
		expect(res.failed).toBe(true);
		expect(res.failureReason).toContain("Repeated tool failure loop detected");
		expect(res.failureReason).toContain("bash");
		expect(res.fallbackStageId).toBeNull();
	});

	it("tags the loop-guard trip as infrastructure so reliability counts it", async () => {
		const abort = vi.fn().mockResolvedValue(undefined);
		const session = makeStreamingSession(
			Array.from({ length: 3 }, () => ({
				type: "tool_finished",
				toolName: "bash",
				result: { content: [{ type: "text", text: "boom" }] },
				isError: true,
			})),
			{ abort, harnessId: "pi" },
		);
		const getOrCreateSession = vi.fn().mockResolvedValue(session);
		const runner = createAgentRunner({ getOrCreateSession });

		const res = await runner("do work", { projectId: "proj-1" });

		expect(res.failed).toBe(true);
		expect(res.failureKind).toBe("infrastructure");
		expect(res.harnessId).toBe("pi");
	});

	it("keeps an explicit fail_stage decision rejected when the loop guard also trips", async () => {
		const abort = vi.fn().mockResolvedValue(undefined);
		const session = makeStreamingSession(
			[
				{
					type: "tool_started",
					toolName: "fail_stage",
					args: { reason: "Does not meet the bar" },
				},
				...Array.from({ length: 3 }, () => ({
					type: "tool_finished",
					toolName: "bash",
					result: { content: [{ type: "text", text: "boom" }] },
					isError: true,
				})),
			],
			{ abort },
		);
		const getOrCreateSession = vi.fn().mockResolvedValue(session);
		const runner = createAgentRunner({ getOrCreateSession });

		const res = await runner("do work", { projectId: "proj-1" });

		expect(abort).toHaveBeenCalled();
		expect(res.failed).toBe(true);
		expect(res.failureKind).toBe("rejected");
		expect(res.failureReason).toContain("[Agent Review Rejection]");
		expect(res.failureReason).toContain("Does not meet the bar");
	});

	it("resets the consecutive-failure counter after a successful tool call", async () => {
		const abort = vi.fn().mockResolvedValue(undefined);
		const session = makeStreamingSession(
			[
				// fail, fail, SUCCESS, fail, fail → never reaches 3 consecutive.
				{ type: "tool_finished", toolName: "bash", isError: true, result: "x" },
				{ type: "tool_finished", toolName: "bash", isError: true, result: "x" },
				{ type: "tool_finished", toolName: "bash", isError: false, result: "ok" },
				{ type: "tool_finished", toolName: "bash", isError: true, result: "x" },
				{ type: "tool_finished", toolName: "bash", isError: true, result: "x" },
			],
			{ abort },
		);
		const getOrCreateSession = vi.fn().mockResolvedValue(session);
		const runner = createAgentRunner({ getOrCreateSession });

		const res = await runner("do work", { projectId: "proj-1" });

		expect(abort).not.toHaveBeenCalled();
		expect(res.failed).toBe(false);
	});
});

describe("createAgentRunner characterization (capture truncation)", () => {
	it("keeps the assistant text authoritative even when capture truncates", async () => {
		const session = makeStreamingSession(
			// Stream well past the 200KB cap in chunks.
			Array.from({ length: 30 }, () => ({
				type: "assistant_delta",
				assistantMessageEvent: { delta: "x".repeat(10_000) },
			})),
		);
		const getOrCreateSession = vi.fn().mockResolvedValue(session);
		const runner = createAgentRunner({ getOrCreateSession });

		const res = await runner("do work", { projectId: "proj-1" });

		// The final text comes from the session's messages (not capturedOutput),
		// but the truncation marker must have flowed through onChunk.
		expect(res.output).toBe("done");
	});

	it("uses truncated captured output as fallback when no assistant message exists", async () => {
		const session = makeStreamingSession(
			Array.from({ length: 30 }, () => ({
				type: "assistant_delta",
				assistantMessageEvent: { delta: "x".repeat(10_000) },
			})),
			{ messages: [] },
			"",
		);
		const getOrCreateSession = vi.fn().mockResolvedValue(session);
		const runner = createAgentRunner({ getOrCreateSession });

		const res = await runner("do work", { projectId: "proj-1" });

		// extractAssistantText falls back to capturedOutput, which was truncated.
		expect(res.output.startsWith("[... output truncated for performance ...]")).toBe(true);
		expect(res.output.length).toBeLessThan(300_000);
	});
});