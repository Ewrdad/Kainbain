import { describe, it, expect, vi } from "vitest";
import { SessionStore } from "./sessionStore.js";
import { eventBridge } from "./eventBridge.js";

/**
 * MARK: SessionStore lifecycle characterization tests
 * @description Pins the session-lifecycle behaviors the harness-boundary
 *   refactor must preserve: carried-over sockets are re-subscribed into the
 *   event bridge, the dual subscribe()/on("event") bookkeeping (including the
 *   fallback unsubscribe path), and TTL sweep interaction with task-scoped keys.
 */

const project = { id: "proj-1", cwd: "/tmp/proj", agentDir: "/tmp/agent" };

/***
 * MARK: makeSessionWithListeners
 * @description Builds a mock session recording how event listeners were
 *   attached, so unsubscribe bookkeeping can be asserted black-box.
 ***/
function makeSessionWithListeners({ onReturns = undefined } = {}) {
	const unsubscribed = [];
	const session = {
		messages: [],
		isStreaming: false,
		disposed: false,
		subscribeHandlers: [],
		onHandlers: [],
		subscribe: (cb) => {
			session.subscribeHandlers.push(cb);
			return () => unsubscribed.push("subscribe");
		},
		on: vi.fn((eventName, handler) => {
			session.onHandlers.push({ eventName, handler });
			if (onReturns === undefined) {
				return () => unsubscribed.push(`on:${eventName}`);
			}
			return onReturns;
		}),
		off: vi.fn(() => unsubscribed.push("off:fallback")),
		removeListener: vi.fn(() => unsubscribed.push("removeListener:fallback")),
		dispose: () => {
			session.disposed = true;
		},
		prompt: async () => ({}),
		steer: async () => ({}),
		followUp: async () => ({}),
	};
	return session;
}

function makeStore(sessionFactory) {
	return new SessionStore({ createSession: sessionFactory });
}

describe("sessionStore lifecycle characterization (socket carry-over)", () => {
	it("re-subscribes carried-over sockets into the event bridge for the new stage session", async () => {
		const subscribeSpy = vi.spyOn(eventBridge, "subscribe");
		try {
			const store = makeStore(async () => makeSessionWithListeners());
			await store.getOrCreate(project);
			const socket = { id: "ws-live" };
			store.subscribe(project.id, socket);
			subscribeSpy.mockClear();

			await store.beginStageSession(project, { taskId: "t1", stageId: "s2" });

			// The preserved socket must be handed back to the event bridge so an
			// open activity console keeps receiving events after the swap.
			expect(subscribeSpy).toHaveBeenCalledWith(project.id, socket);
		} finally {
			subscribeSpy.mockRestore();
		}
	});
});

describe("sessionStore lifecycle characterization (listener bookkeeping)", () => {
	it("records both subscribe and on('event') unsubscribers in session.__unsubs", async () => {
		const store = makeStore(async () => makeSessionWithListeners());
		const session = await store.getOrCreate(project);

		expect(session.__unsubs).toHaveLength(2);
		expect(session.subscribeHandlers).toHaveLength(1);
		expect(session.onHandlers).toHaveLength(1);
		expect(session.onHandlers[0].eventName).toBe("event");
	});

	it("falls back to session.off when on('event') returns no unsubscribe function", async () => {
		const store = makeStore(async () => makeSessionWithListeners({ onReturns: null }));
		const session = await store.getOrCreate(project);

		expect(session.__unsubs).toHaveLength(2);
		// Dispose must run the fallback remover, not silently leak the listener.
		await store.dispose(project.id);
		expect(session.off).toHaveBeenCalledWith("event", session.onHandlers[0].handler);
	});

	it("falls back to removeListener when off is unavailable", async () => {
		const session = makeSessionWithListeners({ onReturns: "not-a-function" });
		delete session.off;
		const store = makeStore(async () => session);

		await store.getOrCreate(project);
		await store.dispose(project.id);
		expect(session.removeListener).toHaveBeenCalledWith(
			"event",
			session.onHandlers[0].handler,
		);
	});

	it("forwards subscribed agent events to the event bridge with the project id", async () => {
		const handleSpy = vi.spyOn(eventBridge, "handleAgentEvent");
		try {
			const store = makeStore(async () => makeSessionWithListeners());
			const session = await store.getOrCreate(project);

			await session.subscribeHandlers[0]({
				type: "message_update",
				delta: "hi",
			});

			expect(handleSpy).toHaveBeenCalledWith("proj-1", "message_update", {
				type: "message_update",
				delta: "hi",
			});
		} finally {
			handleSpy.mockRestore();
		}
	});
});

describe("sessionStore lifecycle characterization (harness delegation)", () => {
	it("delegates session creation to the injected harness with the store's session dir", async () => {
		const createSession = vi.fn(async () => makeSessionWithListeners());
		const harness = { createSession, modelRuntime: vi.fn() };
		const store = new SessionStore({ harness });

		await store.getOrCreate(project, { taskId: "t1" });

		expect(createSession).toHaveBeenCalledWith(project, {
			taskId: "t1",
			stageId: undefined,
			sessionDir: store.sessionDirFor(project),
		});
	});

	it("getModelRuntime delegates to the harness and caches the runtime", async () => {
		const runtime = { marker: true };
		const harness = { modelRuntime: vi.fn(async () => runtime) };
		const store = new SessionStore({ harness });

		expect(await store.getModelRuntime()).toBe(runtime);
		expect(await store.getModelRuntime()).toBe(runtime);
		expect(harness.modelRuntime).toHaveBeenCalledTimes(1);
	});

	it("forwards the dispatch-resolved model to harness.createSession (target hand-off)", async () => {
		const createSession = vi.fn(async () => makeSessionWithListeners());
		const harness = { createSession, modelRuntime: vi.fn() };
		const store = new SessionStore({ harness });

		await store.beginStageSession(project, {
			taskId: "t1",
			stageId: "s1",
			harness: "antigravity",
			model: "gemini-3.8-flash-low",
		});

		expect(createSession).toHaveBeenCalledWith(project, {
			taskId: "t1",
			stageId: "s1",
			sessionDir: store.sessionDirFor(project),
			model: "gemini-3.8-flash-low",
		});
	});

	it("omits the model key for non-dispatch creators (resolveInitialModel path)", async () => {
		const createSession = vi.fn(async () => makeSessionWithListeners());
		const harness = { createSession, modelRuntime: vi.fn() };
		const store = new SessionStore({ harness });

		await store.beginStageSession(project, { taskId: "t1", stageId: "s1" });

		expect(createSession).toHaveBeenCalledWith(project, {
			taskId: "t1",
			stageId: "s1",
			sessionDir: store.sessionDirFor(project),
		});
		// Presence (not just value) selects the hand-off path: the key must
		// be absent, not merely undefined.
		expect("model" in createSession.mock.calls[0][1]).toBe(false);
	});

	it("getModelRuntime reports null (cached) for a harness without model control", async () => {
		// e.g. the custom-command harness: no modelRuntime method. The store
		// must not throw; routes treat null as "no harness models".
		const harness = { createSession: vi.fn(async () => makeSessionWithListeners()) };
		const store = new SessionStore({ harness });

		expect(await store.getModelRuntime()).toBeNull();
		expect(await store.getModelRuntime()).toBeNull();
	});

	it("lazily defaults to the pi harness when none is provided", () => {
		const store = new SessionStore({});
		const harness = store.getHarness();
		expect(harness).toBeTruthy();
		expect(store.getHarness()).toBe(harness); // stable across calls
	});
});

describe("sessionStore lifecycle characterization (TTL sweep)", () => {
	it("sweep disposes task-scoped sessions and clears the project alias", async () => {
		vi.useFakeTimers();
		let store = null;
		try {
			store = makeStore(async () => makeSessionWithListeners());
			store.ttlMs = 1000;
			store.startCleanup();

			await store.getOrCreate(project, { taskId: "t9" });
			expect(store.get(project.id, "t9")).toBeDefined();

			await vi.advanceTimersByTimeAsync(61_000);

			expect(store.get(project.id, "t9")).toBeUndefined();
			expect(store.get(project.id)).toBeUndefined();
		} finally {
			store.stopCleanup?.();
			vi.useRealTimers();
		}
	});
});