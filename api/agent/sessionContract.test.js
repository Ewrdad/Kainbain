import { describe, it, expect } from "vitest";
import { assertHarnessSessionShape } from "./harnessContract.js";
import { createReferenceMockSession } from "./harnesses/mock/mockHarness.js";

/**
 * MARK: Session conformance suite
 * @description The shared acceptance gate for ANY harness session. A session
 *   may only be handed to the engine (agentRunner, sessionStore, eventBridge,
 *   routes) if it passes this suite. The suite is written against observable
 *   behavior only — it never inspects internals — so it runs unchanged against
 *   the pi harness wrapper, the reference mock below, and any future harness.
 *
 *   The contract itself (what each method means for the engine) is documented
 *   in `api/agent/harnessContract.js`.
 *
 *   Usage (from any harness test file):
 *     runSessionContractTests({ name: "pi harness", createSession: () => createPiSession(...) });
 */

/***
 * MARK: runSessionContractTests
 * @description Registers the full session-contract test suite against an
 *   arbitrary session implementation. Required-contract assertions always
 *   run; optional-contract assertions run only when the implementation
 *   provides the method (callers guard optional methods with typeof checks).
 * @example runSessionContractTests({ name: "reference mock", createSession: createReferenceMockSession })
 * @param {Object} spec
 * @param {string} spec.name - Label shown in test output.
 * @param {Function} spec.createSession - (possibly async) factory returning a FRESH session per test.
 ***/
export function runSessionContractTests({ name, createSession }) {
	describe(`agent session contract — ${name}`, () => {
		// ── Contract shape gate ──────────────────────────────────────
		it("satisfies the required HarnessSession shape", async () => {
			const session = await createSession();
			// Throws with the missing members listed; returning true proves shape.
			expect(() => assertHarnessSessionShape(session)).not.toThrow();
		});

		// ── Required conversation surface ──────────────────────────────────
		it("prompt(text) resolves and records the user turn", async () => {
			const session = await createSession();
			const result = await session.prompt("Plan the work");

			// A prompt resolves to a string reply or a result object; both fine.
			expect(result !== undefined).toBe(true);

			const messages = readMessages(session);
			const userTurn = messages.find((m) => m.role === "user");
			expect(userTurn).toBeDefined();
			expect(readText(userTurn)).toContain("Plan the work");
		});

		it("prompt() streams assistant deltas to the subscribed handler and finishes the run", async () => {
			const session = await createSession();
			const seen = [];
			const unsub = session.subscribe((event) => seen.push(event));

			await session.prompt("Say hello", {
				onChunk: (chunk) => seen.push({ type: "onChunk", chunk }),
			});
			if (typeof unsub === "function") unsub();

			const types = seen.map((e) => e?.type);
			expect(types).toContain("assistant_delta");
			expect(types).toContain("run_finished");
		});

		it("getLastAssistantText() returns the assistant reply after a prompt", async () => {
			const session = await createSession();
			await session.prompt("Say hello");

			const text = session.getLastAssistantText();
			expect(typeof text).toBe("string");
			expect(text.trim().length).toBeGreaterThan(0);
		});

		it("exposes the conversation messages with role tags", async () => {
			const session = await createSession();
			await session.prompt("Say hello");

			const messages = readMessages(session);
			expect(Array.isArray(messages)).toBe(true);
			expect(messages.some((m) => m.role === "assistant")).toBe(true);
		});

		it("subscribe(handler) returns an unsubscribe that stops delivery", async () => {
			const session = await createSession();
			const seen = [];
			const unsub = session.subscribe((event) => seen.push(event));
			expect(typeof unsub).toBe("function");

			unsub();
			await session.prompt("Second turn");

			expect(seen).toHaveLength(0);
		});

		// ── Required lifecycle surface ──────────────────────────────────────
		it("isStreaming is a boolean flag at rest", async () => {
			const session = await createSession();
			await session.prompt("Settle");

			expect(typeof session.isStreaming).toBe("boolean");
			expect(session.isStreaming).toBe(false);
		});

		it("abort() resolves", async () => {
			const session = await createSession();
			await expect(session.abort()).resolves.toBeDefined();
		});

		it("dispose() is safe to call and idempotent", async () => {
			const session = await createSession();
			await session.prompt("Warm up");

			await session.dispose();
			// Disposing twice must not reject (TTL sweep + explicit dispose race).
			await session.dispose();
		});

		// ── Optional context-control surface (present ⇒ must behave) ───────
		it("steer(text) resolves and records the guidance when supported", async () => {
			const session = await createSession();
			if (typeof session.steer !== "function") return;

			await expect(session.steer("Focus on the API layer")).resolves.toBeDefined();
			const messages = readMessages(session);
			expect(messages.some((m) => readText(m).includes("Focus on the API layer"))).toBe(
				true,
			);
		});

		it("followUp(text) resolves and records the follow-up when supported", async () => {
			const session = await createSession();
			if (typeof session.followUp !== "function") return;

			await expect(session.followUp("Add tests for that")).resolves.toBeDefined();
			const messages = readMessages(session);
			expect(messages.some((m) => readText(m).includes("Add tests for that"))).toBe(
				true,
			);
		});

		it("compact() resolves when supported", async () => {
			const session = await createSession();
			if (typeof session.compact !== "function") return;

			await expect(session.compact()).resolves.toBeDefined();
		});

		it("getContextUsage() resolves to a current/limit pair when supported", async () => {
			const session = await createSession();
			if (typeof session.getContextUsage !== "function") return;

			const usage = await session.getContextUsage();
			expect(usage).toBeTypeOf("object");
			expect(typeof usage.current).toBe("number");
			expect(typeof usage.limit).toBe("number");
		});

		// ── Optional history-tree surface (present ⇒ must behave) ──────────
		it("navigateTree(id) resolves for a known entry when supported", async () => {
			const session = await createSession();
			if (typeof session.navigateTree !== "function") return;

			// pi-parity implementations reject unknown ids (`Entry <id> not
			// found`, mapped to 404 entry_not_found by the routes), so the
			// target must be a REAL entry: seed one through
			// sessionManager.appendMessage when the implementation offers it.
			// Implementations without a seeding API expose tolerant semantics
			// and accept the synthetic id.
			const targetId = seedEntryId(session) ?? "entry-1";
			await expect(session.navigateTree(targetId)).resolves.toBeDefined();
		});

		it("exposes tree entries and forking via sessionManager when supported", async () => {
			const session = await createSession();
			const tree = session.sessionManager;
			if (!tree || typeof tree.getEntries !== "function") return;

			expect(Array.isArray(tree.getEntries())).toBe(true);
			if (typeof tree.branch === "function") {
				const targetId = seedEntryId(session) ?? "entry-1";
				// pi-parity branch() is synchronous; tolerant implementations may
				// be async — Promise.resolve() accepts both shapes.
				await expect(Promise.resolve(tree.branch(targetId))).resolves.toBeDefined();
			}
		});

		it("rejects tree operations on unknown entries when the implementation is strict", async () => {
			const session = await createSession();
			// Strict, pi-parity implementations (the reference mock among them)
			// seed entries through sessionManager.appendMessage and reject
			// unknown ids with pi's `Entry <id> not found`; tolerant
			// implementations resolve instead. Both are conformant; strictness
			// is only asserted where it is observable.
			if (typeof seedEntryId(session) !== "string") return;

			if (typeof session.navigateTree === "function") {
				await expect(session.navigateTree("no-such-entry")).rejects.toThrow(
					/Entry no-such-entry not found/,
				);
			}
			if (typeof session.sessionManager?.branch === "function") {
				expect(() => session.sessionManager.branch("no-such-entry")).toThrow(
					/Entry no-such-entry not found/,
				);
			}
		});

		// ── Optional model-control surface (present ⇒ must behave) ─────────
		it("model control: reads the active model, lists and switches models when supported", async () => {
			const session = await createSession();
			if (typeof session.getActiveModel !== "function") return;

			const active = await session.getActiveModel();
			expect(active === null || typeof active === "object").toBe(true);

			if (typeof session.listModels === "function") {
				const models = await session.listModels();
				expect(Array.isArray(models)).toBe(true);
			}
			if (typeof session.switchModel === "function") {
				await expect(
					session.switchModel({ provider: "mock-provider", id: "mock-model" }),
				).resolves.toBeDefined();
			}
		});
	});
}

/***
 * MARK: seedEntryId
 * @description Seeds one conversation entry through the session's tree API and
 *   returns its REAL entry id, or null when the implementation offers no
 *   seeding API (tolerant implementations accept synthetic ids). Used by the
 *   history-tree conformance tests so they exercise known entries the same
 *   way route tests do against real pi sessions.
 * @example seedEntryId(session) => 'msg-1' (reference mock) | null (raw pi)
 * @param {Object} session
 * @returns {string|null} The seeded entry id, or null when seeding is unsupported.
 ***/
function seedEntryId(session) {
	const appendMessage = session?.sessionManager?.appendMessage;
	if (typeof appendMessage === "function") {
		return appendMessage({ role: "user", content: "Contract seed entry" });
	}
	return null;
}

/***
 * MARK: readMessages
 * @description Reads the conversation from a session via either the contract
 *   getMessages() method or the classic messages array, so both shapes conform.
 ***/
function readMessages(session) {
	if (typeof session.getMessages === "function") {
		return session.getMessages() || [];
	}
	return Array.isArray(session.messages) ? session.messages : [];
}

/***
 * MARK: readText
 * @description Flattens a message's content (string or content blocks) to plain text.
 ***/
function readText(message) {
	if (typeof message?.content === "string") return message.content;
	if (Array.isArray(message?.content)) {
		return message.content
			.map((c) => (typeof c === "string" ? c : c?.text || ""))
			.join("");
	}
	return "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Reference implementation: the shared in-memory mock session lives in
// `api/agent/harnesses/mock/mockHarness.js` (first-class, harness-level) and is
// re-exported here so existing import sites keep working. The suite below runs
// against it before it becomes the gate for real harness sessions; any drift
// between it and the pi harness is a contract bug, not a harness bug.
// ─────────────────────────────────────────────────────────────────────────────
export { createReferenceMockSession } from "./harnesses/mock/mockHarness.js";

// The suite must first prove it matches reality: run it against the reference
// mock before it becomes the gate for real harness sessions.
describe("conformance suite self-check", () => {
	runSessionContractTests({
		name: "in-memory reference mock",
		createSession: () => createReferenceMockSession(),
	});

	it("reference mock switches models and reports the new active model", async () => {
		const session = createReferenceMockSession({
			model: { provider: "mock", id: "m1" },
			models: [{ provider: "mock", id: "m1" }, { provider: "mock", id: "m2" }],
		});

		await session.switchModel({ provider: "mock", id: "m2" });

		expect(await session.getActiveModel()).toEqual({ provider: "mock", id: "m2" });
		expect(await session.listModels()).toHaveLength(2);
	});
});