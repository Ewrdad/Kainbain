import { describe, it, expect } from "vitest";
import { assertHarnessSessionShape } from "../../harnessContract.js";
import {
	createMockHarness,
	createReferenceMockSession,
} from "./mockHarness.js";
import { runSessionContractTests } from "../../sessionContract.test.js";

/**
 * MARK: Mock harness contract conformance
 * @description Holds the engine's first-class mock harness to the SAME
 *   acceptance gate as the pi harness (the harness contract's mandatory
 *   acceptance gate): its sessions must satisfy the required HarnessSession
 *   shape and pass the full shared conformance suite, and its harness-level
 *   surface must resolve models against the injected registry.
 */

runSessionContractTests({
	name: "mock harness",
	createSession: () => createMockHarness().createSession({}),
});

describe("mock harness surface", () => {
	it("sessions satisfy the required HarnessSession shape", () => {
		expect(assertHarnessSessionShape(createReferenceMockSession())).toBe(true);
	});

	it("createSession returns a FRESH session per call (one session per stage)", async () => {
		const harness = createMockHarness();
		const first = await harness.createSession({}, { taskId: "t1", stageId: "s1" });
		const second = await harness.createSession({}, { taskId: "t1", stageId: "s1" });

		expect(first).not.toBe(second);
		// Fresh context per stage call: history does not leak between sessions.
		await first.prompt("Only in the first stage");
		expect(second.getMessages()).toHaveLength(0);
	});

	it("listModels reports the injected registry, not host state", async () => {
		const models = [
			{ provider: "mock-provider-a", id: "mock-model-a", input: ["text"] },
			{ provider: "mock-provider-b", id: "mock-model-b", input: ["text", "image"] },
		];
		const harness = createMockHarness({ models });

		expect(await harness.listModels()).toEqual(models);
	});

	it("resolveModelRef resolves composite keys, bare ids, and nothing else", async () => {
		const models = [
			{
				provider: "mock-provider-a",
				id: "mock-model-a",
				input: ["text"],
				key: "mock-provider-a::mock-model-a",
			},
			{ provider: "mock-provider-b", id: "mock-model-b" },
		];
		const harness = createMockHarness({ models });

		expect(await harness.resolveModelRef("mock-provider-b::mock-model-b")).toEqual(
			models[1],
		);
		expect(await harness.resolveModelRef("mock-model-a")).toEqual(models[0]);
		expect(await harness.resolveModelRef("unresolvable-model")).toBe(null);
	});

	it("readHistoryFromDisk reports an empty history (the mock owns no disk)", async () => {
		const harness = createMockHarness();
		const history = await harness.readHistoryFromDisk({ id: "proj-1", cwd: "/tmp" });

		expect(history).toEqual({ messages: [], tree: [] });
	});
});

/***
 * MARK: pi tree-semantics parity (strict)
 * @description Pins the reference mock's EXACT core tree semantics — the same
 *   strict forms the route suites assert through the sessionStore seam
 *   (api/routes/sessions.test.js "test mock mirrors pi core tree semantics").
 *   The mock mirrors pi rather than being more permissive so route tests can
 *   exercise real 404 `entry_not_found` and seeded-id/leaf flows in every
 *   run mode.
 ***/
describe("reference mock mirrors pi core tree semantics", () => {
	it("appendMessage seeds real entry ids chained to the leaf and advances the leaf", () => {
		const session = createReferenceMockSession();
		const { sessionManager } = session;

		expect(sessionManager.getLeafId()).toBe(null);

		const firstId = sessionManager.appendMessage({
			role: "user",
			content: "first",
		});
		const secondId = sessionManager.appendMessage({
			role: "assistant",
			content: "second",
		});

		expect(firstId).toBe("msg-1");
		expect(secondId).toBe("msg-2");
		// Entries chain parent → child; the leaf follows the last append.
		const entries = sessionManager.getEntries();
		expect(entries).toHaveLength(2);
		expect(entries[0]).toMatchObject({ id: firstId, parentId: null, type: "message" });
		expect(entries[1]).toMatchObject({ id: secondId, parentId: firstId, type: "message" });
		expect(sessionManager.getLeafId()).toBe(secondId);
	});

	it("navigateTree mirrors pi: user message → parent, other → itself, no-op at leaf", async () => {
		const session = createReferenceMockSession();
		const { sessionManager } = session;
		const firstId = sessionManager.appendMessage({ role: "user", content: "u1" });
		const secondId = sessionManager.appendMessage({ role: "user", content: "u2" });
		const replyId = sessionManager.appendMessage({
			role: "assistant",
			content: "a1",
		});
		expect(sessionManager.getLeafId()).toBe(replyId);
		const entriesBeforeNav = sessionManager.getEntries().length;

		// User-message target: leaf = the entry's parent (null = root).
		await session.navigateTree(secondId);
		expect(sessionManager.getLeafId()).toBe(firstId);
		// No entry appended.
		expect(sessionManager.getEntries().length).toBe(entriesBeforeNav);

		// Non-user target: leaf = the entry itself.
		await session.navigateTree(replyId);
		expect(sessionManager.getLeafId()).toBe(replyId);

		// Navigating to the CURRENT leaf is a no-op.
		await session.navigateTree(replyId);
		expect(sessionManager.getLeafId()).toBe(replyId);
		expect(sessionManager.getEntries().length).toBe(entriesBeforeNav);

		// Unknown id: pi's `Entry <id> not found` (the routes map it to 404).
		await expect(session.navigateTree("no-such-entry")).rejects.toThrow(
			/Entry no-such-entry not found/,
		);
	});

	it("branch mirrors pi: moves the leaf without appending", () => {
		const session = createReferenceMockSession();
		const { sessionManager } = session;
		const firstId = sessionManager.appendMessage({ role: "user", content: "u1" });
		const secondId = sessionManager.appendMessage({ role: "user", content: "u2" });
		expect(sessionManager.getLeafId()).toBe(secondId);
		const entriesBefore = sessionManager.getEntries().length;

		sessionManager.branch(firstId);
		expect(sessionManager.getLeafId()).toBe(firstId);
		expect(sessionManager.getEntries().length).toBe(entriesBefore);
		// Unknown id: pi's `Entry <id> not found` (the routes map it to 404).
		expect(() => sessionManager.branch("no-such-entry")).toThrow(
			/Entry no-such-entry not found/,
		);
	});

	it("context usage is a current/limit pair and compact() counts calls", async () => {
		const session = createReferenceMockSession();

		expect(await session.getContextUsage()).toEqual({ current: 0, limit: 100 });
		expect(await session.compact()).toEqual({ status: "compacted" });
		expect(await session.compact()).toEqual({ status: "compacted" });
		expect(session.compactCalls).toBe(2);
	});

	it("getLastAssistantText falls back to the stage-completed string without a reply", () => {
		const session = createReferenceMockSession();
		// Mirrors the real harness: stages that end without an assistant reply
		// still report a completed stage.
		expect(session.getLastAssistantText()).toBe("Stage execution completed");
	});
});