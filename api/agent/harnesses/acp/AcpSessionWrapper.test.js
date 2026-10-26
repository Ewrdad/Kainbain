import { describe, it, expect } from "vitest";
import { AcpSessionWrapper } from "./AcpSessionWrapper.js";

/**
 * MARK: AcpSessionWrapper tests
 * @description HarnessSession behavior over an in-memory fake runtime (no
 *   spawn): prompt streaming + conversation, the vendor text filter, the
 *   permission policy path, steer/followUp, model pinning, and abort/dispose.
 *   The spawn-backed integration lives in the flavor's agyHarness.acp.test.js.
 */

function makeFakeRuntime({ promptImpl, steerImpl } = {}) {
	const calls = { prompts: [], steers: 0, cancels: 0, aborts: 0, disposed: 0 };
	const hooks = {};
	const runtime = {
		sessionId: "fake-session-1",
		pid: 4242,
		async prompt(parts, opts) {
			calls.prompts.push({ parts, opts });
			if (promptImpl) return promptImpl(parts, opts, hooks);
			// Default: stream one chunk like a live agent would, then end clean.
			hooks.onNotification("session/update", {
				update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "fake reply" } },
			});
			return { stopReason: "end_turn" };
		},
		async steer(text) {
			calls.steers += 1;
			if (steerImpl) return steerImpl(text);
			return { status: "steered" };
		},
		async cancel() {
			calls.cancels += 1;
			return { status: "cancelled" };
		},
		abort() {
			calls.aborts += 1;
			return { status: "aborted" };
		},
		async dispose() {
			calls.disposed += 1;
		},
	};
	return {
		calls,
		hooks,
		createRuntime: async (injected) => {
			hooks.onNotification = injected.onNotification;
			hooks.onRequest = injected.onRequest;
			return runtime;
		},
	};
}

const CATALOG = {
	async listModels() {
		return [{ provider: "p", id: "m1" }];
	},
	async resolveModelRef(ref) {
		return ref === "m1" || ref === "m2" ? { provider: "p", id: ref } : null;
	},
	async getModelDiscoveryStatus() {
		return { ok: true };
	},
};

function makeWrapper(overrides = {}) {
	const fake = makeFakeRuntime(overrides.fake);
	const logs = [];
	const wrapper = new AcpSessionWrapper({
		createRuntime: fake.createRuntime,
		catalog: CATALOG,
		harnessId: "test-acp",
		log: (message) => logs.push(message),
		...overrides.wrapper,
	});
	return { wrapper, fake, logs };
}

describe("AcpSessionWrapper session (fake runtime)", () => {
	it("prompts over the live session and records the conversation", async () => {
		const { wrapper, fake } = makeWrapper();
		const seen = [];
		wrapper.subscribe((event) => seen.push(event));
		const reply = await wrapper.prompt("Say hello");
		expect(reply).toBe("fake reply");
		expect(fake.calls.prompts).toHaveLength(1);
		expect(fake.calls.prompts[0].parts).toEqual([{ type: "text", text: "Say hello" }]);
		const types = seen.map((e) => e.type);
		expect(types).toEqual(["run_started", "message_started", "assistant_delta", "run_finished"]);
		expect(wrapper.getMessages()).toEqual([
			{ role: "user", content: "Say hello" },
			{ role: "assistant", content: "fake reply" },
		]);
		expect(wrapper.getLastAssistantText()).toBe("fake reply");
		expect(wrapper.isStreaming).toBe(false);
	});

	it("forwards onChunk deltas alongside subscribed events", async () => {
		const { wrapper } = makeWrapper();
		const chunks = [];
		await wrapper.prompt("hi", { onChunk: (delta) => chunks.push(delta) });
		expect(chunks).toEqual(["fake reply"]);
	});

	it("traps vendor-smuggled transport failures as run_error (never success)", async () => {
		const { wrapper } = makeWrapper({
			fake: {
				promptImpl: (parts, opts, hooks) => {
					hooks.onNotification("session/update", {
						update: {
							sessionUpdate: "agent_message_chunk",
							content: { type: "text", text: "Agent execution error: model unreachable: Error 502" },
						},
					});
					return { stopReason: "end_turn" };
				},
			},
			wrapper: {
				inspectAssistantText: (text) =>
					text.includes("model unreachable") ? { error: "trapped 502" } : null,
			},
		});
		const seen = [];
		wrapper.subscribe((event) => seen.push(event));
		const reply = await wrapper.prompt("doomed turn");
		expect(reply).toContain("model unreachable");
		const terminal = seen.at(-1);
		expect(terminal.type).toBe("run_error");
		expect(terminal.error).toBe("trapped 502");
		expect(seen.some((e) => e.type === "run_finished")).toBe(false);
	});

	it("answers agent permission requests through the flavor policy", async () => {
		const decisions = [];
		const { wrapper, fake } = makeWrapper({
			fake: {
				promptImpl: async (parts, opts, hooks) => {
					const decision = await hooks.onRequest("requestPermission", {
						toolCall: { toolCallId: "t", title: "Write" },
						options: [{ optionId: "allow-once", kind: "allow_once" }],
					});
					decisions.push(decision);
					hooks.onNotification("session/update", {
						update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "ok" } },
					});
					return { stopReason: "end_turn" };
				},
			},
			wrapper: {
				permissionPolicy: async (method) => {
					expect(method).toBe("requestPermission");
					return { outcome: { outcome: "selected", optionId: "allow-once" } };
				},
			},
		});
		await wrapper.prompt("needs approval");
		expect(decisions).toEqual([{ outcome: { outcome: "selected", optionId: "allow-once" } }]);
		expect(fake.calls.prompts).toHaveLength(1);
	});

	it("cancels deny-safe when the policy throws", async () => {
		const { wrapper } = makeWrapper({
			fake: {
				promptImpl: async (parts, opts, hooks) => {
					const decision = await hooks.onRequest("requestPermission", {});
					expect(decision).toEqual({ outcome: { outcome: "cancelled" } });
					return { stopReason: "cancelled" };
				},
			},
			wrapper: {
				permissionPolicy: async () => {
					throw new Error("policy exploded");
				},
			},
		});
		const seen = [];
		wrapper.subscribe((event) => seen.push(event));
		await wrapper.prompt("needs approval");
		expect(seen.at(-1)).toMatchObject({ type: "run_finished", interrupted: true });
	});

	it("steer/followUp record guidance and resolve Tier-2 statuses", async () => {
		const { wrapper, fake } = makeWrapper();
		await expect(wrapper.steer("Focus on the API")).resolves.toEqual({ status: "steered" });
		await expect(wrapper.followUp("Add tests")).resolves.toEqual({ status: "followed_up" });
		// No runtime yet (lazy start): nothing to steer into, guidance queued.
		expect(fake.calls.steers).toBe(0);
		expect(wrapper.getMessages()).toEqual([
			{ role: "user", content: "Focus on the API" },
			{ role: "user", content: "Add tests" },
		]);

		await wrapper.prompt("now run");
		await wrapper.steer("live correction");
		expect(fake.calls.steers).toBe(1);
	});

	it("switchModel pins the model for subsequent prompts", async () => {
		const { wrapper, fake } = makeWrapper();
		await expect(wrapper.switchModel("m1")).resolves.toMatchObject({ id: "m1" });
		expect(await wrapper.getActiveModel()).toMatchObject({ id: "m1" });
		await wrapper.prompt("pinned run");
		expect(fake.calls.prompts[0].opts).toMatchObject({ model: { provider: "p", id: "m1" } });
	});

	it("switchModel soft-fails on unresolvable refs (never a silent swap)", async () => {
		const { wrapper, fake, logs } = makeWrapper();
		await expect(wrapper.switchModel("nope")).resolves.toBeNull();
		expect(logs.some((line) => line.includes("nope"))).toBe(true);
		await wrapper.prompt("default run");
		expect(fake.calls.prompts[0].opts.model).toBeUndefined();
	});

	it("reports startup failures as run_error and resolves \"\"", async () => {
		const wrapper = new AcpSessionWrapper({
			createRuntime: async () => {
				throw new Error("spawn mock ENOENT");
			},
		});
		const seen = [];
		wrapper.subscribe((event) => seen.push(event));
		await expect(wrapper.prompt("never starts")).resolves.toBe("");
		expect(seen).toEqual([{ type: "run_error", error: "spawn mock ENOENT" }]);
		expect(wrapper.isStreaming).toBe(false);
	});

	it("abort() without a live turn is idle; dispose() is idempotent", async () => {
		const { wrapper, fake } = makeWrapper();
		await expect(wrapper.abort()).resolves.toEqual({ status: "idle" });
		// Lazy runtime never started: disposing tears down nothing (no spawn).
		await wrapper.dispose();
		expect(fake.calls.disposed).toBe(0);
		await wrapper.dispose();
		await expect(wrapper.prompt("after dispose")).rejects.toThrow(/disposed/);
	});

	it("dispose() tears down a started runtime exactly once", async () => {
		const { wrapper, fake } = makeWrapper();
		await wrapper.prompt("warm up");
		await wrapper.dispose();
		await wrapper.dispose();
		expect(fake.calls.disposed).toBe(1);
	});

	it("forwards catalog model + discovery surfaces", async () => {
		const { wrapper } = makeWrapper();
		expect(await wrapper.listModels()).toEqual([{ provider: "p", id: "m1" }]);
		expect(await wrapper.resolveModelRef("m1")).toMatchObject({ id: "m1" });
		expect(await wrapper.getModelDiscoveryStatus()).toEqual({ ok: true });
	});

	it("retries a transient startup failure on the next prompt (no poisoned session)", async () => {
		let attempts = 0;
		const runtime = {
			sessionId: "recovered-session",
			pid: 7,
			async prompt() {
				return { stopReason: "end_turn" };
			},
		};
		const wrapper = new AcpSessionWrapper({
			createRuntime: async () => {
				attempts += 1;
				if (attempts === 1) throw new Error("ACP handshake timed out after 300ms");
				return runtime;
			},
		});
		const seen = [];
		wrapper.subscribe((event) => seen.push(event));
		// First prompt fails at startup and reports a run_error...
		await expect(wrapper.prompt("first try")).resolves.toBe("");
		expect(seen.filter((event) => event.type === "run_error")).toHaveLength(1);
		// ...and the NEXT prompt re-attempts the start instead of replaying it.
		await expect(wrapper.prompt("second try")).resolves.toBe("");
		expect(attempts).toBe(2);
	});

	it("tears down a runtime that finishes starting after dispose() (no orphan process)", async () => {
		let release;
		const gate = new Promise((resolve) => {
			release = resolve;
		});
		let disposedCount = 0;
		const runtime = {
			sessionId: "late-session",
			pid: 3,
			async prompt() {
				return { stopReason: "end_turn" };
			},
			async dispose() {
				disposedCount += 1;
			},
		};
		const wrapper = new AcpSessionWrapper({
			createRuntime: async () => {
				await gate;
				return runtime;
			},
		});
		const promptPromise = wrapper.prompt("starting");
		// Let ensureRuntime reach its await, then dispose mid-start.
		await Promise.resolve();
		await wrapper.dispose();
		release();
		await expect(promptPromise).resolves.toBe("");
		// The late runtime is disposed rather than leaked.
		expect(disposedCount).toBe(1);
	});

	it("routes usage_update rows to the onUsage hook and getLastUsage()", async () => {
		const usageRows = [];
		const { wrapper, logs } = makeWrapper({
			fake: {
				promptImpl: (parts, opts, hooks) => {
					hooks.onNotification("session/update", {
						update: {
							sessionUpdate: "usage_update",
							used: 1200,
							size: 200000,
							cost: { amount: 0.012, currency: "USD" },
							_meta: { steps: 1, totalTokens: 1200 },
						},
					});
					hooks.onNotification("session/update", {
						update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "ok" } },
					});
					return { stopReason: "end_turn" };
				},
			},
			wrapper: { onUsage: (usage) => usageRows.push(usage) },
		});
		await wrapper.prompt("turn with telemetry");
		expect(usageRows).toHaveLength(1);
		expect(usageRows[0]).toMatchObject({
			contextTokensUsed: 1200,
			contextWindowSize: 200000,
			costUsd: 0.012,
			steps: 1,
			totalTokens: 1200,
		});
		expect(wrapper.getLastUsage()).toMatchObject({ totalTokens: 1200 });
		// The telemetry is logged, and it never reached the event stream.
		expect(logs.some((line) => line.includes("ACP usage update"))).toBe(true);
		expect(logs.some((line) => line.includes("cost_usd=0.012"))).toBe(true);
	});

	it("a throwing onUsage consumer never breaks the turn", async () => {
		const { wrapper } = makeWrapper({
			fake: {
				promptImpl: (parts, opts, hooks) => {
					hooks.onNotification("session/update", {
						update: { sessionUpdate: "usage_update", used: 5, size: 10 },
					});
					hooks.onNotification("session/update", {
						update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "ok" } },
					});
					return { stopReason: "end_turn" };
				},
			},
			wrapper: {
				onUsage: () => {
					throw new Error("telemetry consumer exploded");
				},
			},
		});
		const seen = [];
		wrapper.subscribe((event) => seen.push(event));
		await expect(wrapper.prompt("resilient turn")).resolves.toBe("ok");
		expect(seen.at(-1).type).toBe("run_finished");
	});

	it("applies the pinned model through the applySessionModel hook once per session", async () => {
		const applications = [];
		const { wrapper, fake } = makeWrapper({
			fake: {
				promptImpl: (parts, opts) => {
					// With the hook present the prompt params carry no model.
					expect(opts?.model).toBeUndefined();
					return { stopReason: "end_turn" };
				},
			},
			wrapper: {
				initialModel: { provider: "p", id: "m1" },
				applySessionModel: async (runtime, sessionId, model) => {
					applications.push({ sessionId, model });
				},
			},
		});
		await wrapper.prompt("first turn");
		await wrapper.prompt("second turn");
		expect(applications).toEqual([
			{ sessionId: "fake-session-1", model: { provider: "p", id: "m1" } },
		]);
		expect(fake.calls.prompts).toHaveLength(2);
	});

	it("fails the turn as run_error when the model application is rejected", async () => {
		const { wrapper } = makeWrapper({
			fake: {
				promptImpl: () => ({ stopReason: "end_turn" }),
			},
			wrapper: {
				initialModel: { provider: "p", id: "m1" },
				applySessionModel: async () => {
					throw new Error("Unsupported config option model=bogus");
				},
			},
		});
		const seen = [];
		wrapper.subscribe((event) => seen.push(event));
		await expect(wrapper.prompt("doomed pin")).resolves.toBe("");
		const errors = seen.filter((event) => event?.type === "run_error");
		expect(errors).toHaveLength(1);
		expect(errors[0].error).toContain("Unsupported config option");
		// No prompt was ever sent — the pin failed before the turn started.
	});

	it("applies switchModel() live through the hook and never pins a rejected model", async () => {
		const applications = [];
		const { wrapper } = makeWrapper({
			fake: { promptImpl: () => ({ stopReason: "end_turn" }) },
			wrapper: {
				applySessionModel: async (runtime, sessionId, model) => {
					applications.push(model.id);
					if (model.id === "m2") throw new Error("Unsupported config option");
				},
			},
		});
		await wrapper.prompt("warm up");
		await expect(wrapper.switchModel("m1")).resolves.toMatchObject({ id: "m1" });
		expect(applications).toEqual(["m1"]);
		// A model the agent rejects is NOT pinned: the session keeps its model.
		await expect(wrapper.switchModel("m2")).resolves.toBeNull();
		expect(await wrapper.getActiveModel()).toMatchObject({ id: "m1" });
	});
});
