import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createMockHarness } from "../api/agent/harnesses/mock/mockHarness.js";
import { runHarnessStage } from "./harness.js";

describe("runHarnessStage", () => {
	it("runs a prompt, forwards log frames in order, returns output", async () => {
		const harness = createMockHarness({ models: [] });
		const logs = [];
		const { output } = await runHarnessStage({
			harness,
			project: { id: "p1" },
			workdir: "/tmp",
			taskId: "t1",
			stageId: "s1",
			prompt: "do the thing",
			onLog: (text) => logs.push(text),
		});
		assert.match(output, /do the thing/);
		assert.ok(logs.some((l) => l.includes("do the thing")));
		assert.ok(logs.some((l) => l.includes("prompt settled")));
	});

	it("fails fast without a conforming harness or prompt", async () => {
		const harness = createMockHarness({ models: [] });
		await assert.rejects(runHarnessStage({ harness: {}, prompt: "x" }), /createSession/);
		await assert.rejects(
			runHarnessStage({ harness, prompt: "" }),
			/prompt string/,
		);
	});

	it("hands the live session to onSession for steering delivery", async () => {
		const harness = createMockHarness({ models: [] });
		let seen = null;
		await runHarnessStage({
			harness,
			project: { id: "p1" },
			workdir: "/tmp",
			taskId: "t1",
			stageId: "s1",
			prompt: "do the thing",
			onSession: (session) => {
				seen = session;
			},
		});
		assert.ok(seen && typeof seen.prompt === "function");
		assert.equal(typeof seen.steer, "function");
	});

	it("forwards every normalized event to onEvent in order", async () => {
		const frames = [
			{ type: "run_started" },
			{ type: "assistant_delta", delta: "hello" },
			{ type: "tool_started", toolName: "bash", toolCallId: "c1", args: { command: "ls" } },
			{ type: "tool_finished", toolName: "bash", toolCallId: "c1", result: "ok" },
			{ type: "usage_updated", usage: { inputTokens: 1 } },
			{ type: "run_finished" },
		];
		const harness = {
			async createSession() {
				return {
					isStreaming: false,
					messages: [],
					getLastAssistantText: () => "hello",
					subscribe: (handler) => {
						for (const frame of frames) handler(frame);
						return () => {};
					},
					prompt: async () => "hello",
					abort: () => {},
					dispose: async () => {},
				};
			},
		};
		const seen = [];
		const logs = [];
		const { output } = await runHarnessStage({
			harness,
			project: { id: "p1" },
			workdir: "/tmp",
			taskId: "t",
			stageId: "s",
			prompt: "x",
			onLog: (text) => logs.push(text),
			onEvent: (event) => seen.push(event),
		});
		assert.equal(output, "hello");
		assert.deepEqual(
			seen.map((e) => e.type),
			frames.map((f) => f.type),
		);
		assert.ok(seen.some((e) => e.type === "tool_started" && e.toolName === "bash"));
		assert.ok(seen.some((e) => e.type === "usage_updated"));
		// Legacy text derivation is unchanged by the structured tap.
		assert.deepEqual(logs, ["hello"]);
	});

	it("keeps onLog byte-identical with and without onEvent", async () => {
		const run = async (withEvents) => {
			const harness = createMockHarness({ models: [] });
			const logs = [];
			const seen = [];
			await runHarnessStage({
				harness,
				project: { id: "p1" },
				workdir: "/tmp",
				taskId: "t1",
				stageId: "s1",
				prompt: "do the thing",
				onLog: (text) => logs.push(text),
				...(withEvents ? { onEvent: (event) => seen.push(event) } : {}),
			});
			return { logs, seen };
		};
		const baseline = await run(false);
		const tapped = await run(true);
		assert.deepEqual(tapped.logs, baseline.logs);
		assert.ok(tapped.seen.length > 0);
		assert.ok(tapped.seen.every((e) => e && typeof e.type === "string"));
	});

	it("survives a throwing onEvent observer", async () => {
		const harness = createMockHarness({ models: [] });
		const { output } = await runHarnessStage({
			harness,
			project: { id: "p1" },
			workdir: "/tmp",
			taskId: "t1",
			stageId: "s1",
			prompt: "do the thing",
			onEvent: () => {
				throw new Error("observer boom");
			},
		});
		assert.match(output, /do the thing/);
	});

	it("disposes the session even when prompting throws", async () => {
		let disposed = false;
		const harness = {
			async createSession() {
				return {
					isStreaming: false,
					messages: [],
					getLastAssistantText: () => "",
					subscribe: () => () => {},
					prompt: async () => {
						throw new Error("boom");
					},
					abort: () => {},
					dispose: async () => {
						disposed = true;
					},
				};
			},
		};
		await assert.rejects(
			runHarnessStage({ harness, project: {}, workdir: "/tmp", taskId: "t", stageId: "s", prompt: "x" }),
			/boom/,
		);
		assert.equal(disposed, true);
	});
});
