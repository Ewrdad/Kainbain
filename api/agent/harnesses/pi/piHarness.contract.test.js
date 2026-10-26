import { describe, it, expect, vi } from "vitest";
import { runSessionContractTests } from "../../sessionContract.test.js";

/**
 * MARK: piHarness contract conformance
 * @description Runs the shared session conformance suite against the pi
 *   harness's wrapped sessions. The pi SDK is mocked with a session that
 *   speaks RAW pi events (message_update, agent_end, …) so this also proves
 *   the wrapper translates them into the normalized vocabulary before any
 *   engine consumer sees them. This is the mandatory acceptance gate from the
 *   harness contract: any future harness must pass the same suite.
 */

const rawSessionFixture = vi.hoisted(() => {
	/***
	 * Builds a raw pi session: emits RAW pi event names from prompt(), exposes
	 * the pi session surface (prompt/abort/dispose/messages/getLastAssistantText/
	 * model/setModel/modelRuntime/steer/followUp/compact/getContextUsage/
	 * navigateTree/sessionManager).
	 ***/
	return function createRawPiSession() {
		const handlers = new Set();
		const messages = [];
		const entries = [];
		const session = {
			isStreaming: false,
			messages,
			model: { provider: "mock-provider", id: "mock-model" },
			modelRuntime: {
				getAvailableSnapshot: () => [
					{ provider: "mock-provider", id: "mock-model" },
					{ provider: "mock-provider", id: "mock-model-2" },
				],
			},
			subscribe: (handler) => {
				handlers.add(handler);
				return () => handlers.delete(handler);
			},
			prompt: async (text) => {
				messages.push({ role: "user", content: text });
				session.isStreaming = true;
				for (const handler of [...handlers]) handler({ type: "agent_start" });
				const reply = `Raw reply: ${text}`;
				for (const handler of [...handlers]) {
					handler({ type: "message_update", assistantMessageEvent: { delta: reply } });
				}
				messages.push({ role: "assistant", content: reply });
				for (const handler of [...handlers]) handler({ type: "agent_end" });
				session.isStreaming = false;
				return reply;
			},
			getLastAssistantText: () => {
				const assistant = messages.filter((m) => m.role === "assistant");
				return assistant.at(-1)?.content ?? "";
			},
			abort: async () => {
				session.isStreaming = false;
				return { status: "aborted" };
			},
			dispose: () => {},
			disposed: false,
			steer: async (text) => {
				messages.push({ role: "user", content: text });
				return { status: "steered" };
			},
			followUp: async (text) => {
				messages.push({ role: "user", content: text });
				return { status: "followed_up" };
			},
			compact: async () => ({ status: "compacted" }),
			getContextUsage: async () => ({ current: messages.length, limit: 100 }),
			navigateTree: async (targetId) => {
				entries.push({ id: targetId, type: "navigate" });
				return { status: "navigated", targetId };
			},
			sessionManager: {
				getEntries: () => entries,
				branch: async (entryId) => {
					entries.push({ id: `branch-${entryId}`, branchFrom: entryId });
					return { status: "branched" };
				},
			},
			setModel: vi.fn(async (ref) => {
				session.model = ref;
			}),
		};
		return session;
	};
});

vi.mock("@earendil-works/pi-coding-agent", () => ({
	ModelRuntime: {
		create: vi.fn(async () => ({
			getAvailableSnapshot: () => [
				{ provider: "mock-provider", id: "mock-model" },
				{ provider: "mock-provider", id: "mock-model-2" },
			],
			getModels: () => [],
			getModel: () => null,
		})),
	},
	SessionManager: {
		create: vi.fn(() => ({ entries: [], getEntries: () => [] })),
	},
	createAgentSession: vi.fn(async () => ({
		session: rawSessionFixture(),
	})),
}));

vi.mock("../../../eventBridge.js", () => ({
	eventBridge: { emitSystemLog: vi.fn(), clearSession: vi.fn() },
}));

import { createPiHarness } from "./piHarness.js";
import { eventBridge } from "../../../eventBridge.js";
import path from "node:path";
import os from "node:os";

const harness = createPiHarness({ eventBridge });

runSessionContractTests({
	name: "pi harness (wrapped raw pi session, mocked SDK)",
	createSession: () =>
		harness.createSession(
			{ id: "proj-conformance", cwd: "/tmp/kb-conformance" },
			{ sessionDir: path.join(os.tmpdir(), "kainbain-harness-conformance") },
		),
});

describe("pi harness wrapper specifics", () => {
	it("reports its identity metadata (name: pi, label: Pi) for harness-aware engine logs", () => {
		// The engine composes log prose from this metadata (see
		// harnessContract.harnessLabel) instead of hard-coding a vendor name.
		expect(harness.name).toBe("pi");
		expect(harness.label).toBe("Pi");
	});

	it("delivers NORMALIZED events to subscribers (raw pi names never leak)", async () => {
		const session = await harness.createSession(
			{ id: "proj-conformance", cwd: "/tmp/kb-conformance" },
			{ sessionDir: path.join(os.tmpdir(), "kainbain-harness-conformance") },
		);
		const seen = [];
		const unsub = session.subscribe((event) => seen.push(event));
		await session.prompt("Check the stream");
		unsub();

		const types = seen.map((e) => e?.type);
		expect(types).toContain("run_started");
		expect(types).toContain("assistant_delta");
		expect(types).toContain("run_finished");
		// No raw pi name may appear in the normalized stream.
		for (const event of seen) {
			expect(["message_update", "agent_start", "agent_end"]).not.toContain(
				event?.type,
			);
		}
	});

	it("passes through the raw pi surface: prompt/abort/messages/sessionManager", async () => {
		const session = await harness.createSession(
			{ id: "proj-conformance", cwd: "/tmp/kb-conformance" },
			{ sessionDir: path.join(os.tmpdir(), "kainbain-harness-conformance") },
		);
		await session.prompt("Surface check");

		expect(session.messages).toHaveLength(2);
		expect(session.isStreaming).toBe(false);
		await expect(session.abort()).resolves.toBeDefined();
		await expect(session.navigateTree("entry-9")).resolves.toBeDefined();
		expect(Array.isArray(session.sessionManager.getEntries())).toBe(true);
		expect(session.model).toEqual({ provider: "mock-provider", id: "mock-model" });
	});

	it("switchModel uses the pi setModel field and reports the active model", async () => {
		const session = await harness.createSession(
			{ id: "proj-conformance", cwd: "/tmp/kb-conformance" },
			{ sessionDir: path.join(os.tmpdir(), "kainbain-harness-conformance") },
		);

		expect(await session.getActiveModel()).toEqual({
			provider: "mock-provider",
			id: "mock-model",
		});
		const models = await session.listModels();
		expect(models).toHaveLength(2);

		await session.switchModel({ provider: "mock-provider", id: "mock-model-2" });
		expect(await session.getActiveModel()).toEqual({
			provider: "mock-provider",
			id: "mock-model-2",
		});
	});

	it("setModel-free sessions soft-fail: switchModel reports null instead of throwing", async () => {
		// A legacy/limited raw session without setModel.
		const limited = { messages: [], subscribe: () => () => {}, prompt: async () => "x" };
		const harnessWithLimited = createPiHarness({ eventBridge });
		const wrapped = harnessWithLimited.constructor; // marker only
		// Access the wrapper through the harness's public surface by simulating
		// the SDK returning a limited session.
		const { createAgentSession } = await import("@earendil-works/pi-coding-agent");
		createAgentSession.mockResolvedValueOnce({ session: limited });
		const session = await harnessWithLimited.createSession(
			{ id: "proj-limited", cwd: "/tmp/kb-limited" },
			{ sessionDir: path.join(os.tmpdir(), "kainbain-harness-limited") },
		);

		expect(wrapped).toBeTruthy(); // harness module loaded
		await expect(session.switchModel({ id: "whatever" })).resolves.toBeNull();
	});

	/***
	 * MARK: context usage boundary normalization
	 * @description The engine contract pins {current, limit}; raw pi reports its
	 *   own ContextUsage shape ({tokens, contextWindow, percent}) or undefined.
	 *   The wrapper must normalize every raw shape into contract shape.
	 ***/
	describe("getContextUsage boundary normalization", () => {
		async function createWrappedSession(rawSession) {
			const { createAgentSession } = await import(
				"@earendil-works/pi-coding-agent"
			);
			const harnessForUsage = createPiHarness({ eventBridge });
			createAgentSession.mockResolvedValueOnce({ session: rawSession });
			return harnessForUsage.createSession(
				{ id: "proj-context-usage", cwd: "/tmp/kb-context-usage" },
				{ sessionDir: path.join(os.tmpdir(), "kainbain-harness-context-usage") },
			);
		}

		it("maps raw pi shape {tokens, contextWindow} to the {current, limit} contract", async () => {
			const session = await createWrappedSession({
				messages: [],
				subscribe: () => () => {},
				getContextUsage: () => ({ tokens: 12, contextWindow: 100, percent: 12 }),
			});

			await expect(session.getContextUsage()).resolves.toEqual({
				current: 12,
				limit: 100,
			});
		});

		it("maps an undefined raw usage (fresh session) to {current: 0, limit: 0}", async () => {
			const session = await createWrappedSession({
				messages: [],
				subscribe: () => () => {},
				getContextUsage: () => undefined,
			});

			await expect(session.getContextUsage()).resolves.toEqual({
				current: 0,
				limit: 0,
			});
		});

		it("passes an already contract-shaped usage through unchanged", async () => {
			const usage = { current: 5, limit: 200 };
			const session = await createWrappedSession({
				messages: [],
				subscribe: () => () => {},
				getContextUsage: () => usage,
			});

			await expect(session.getContextUsage()).resolves.toEqual(usage);
		});

		it("sessions without getContextUsage still report a {current, limit} pair", async () => {
			const session = await createWrappedSession({
				messages: [],
				subscribe: () => () => {},
			});

			await expect(session.getContextUsage()).resolves.toEqual({
				current: 0,
				limit: 0,
			});
		});
	});
});
