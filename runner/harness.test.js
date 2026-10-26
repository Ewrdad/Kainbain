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
