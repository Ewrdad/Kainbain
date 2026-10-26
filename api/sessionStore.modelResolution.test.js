import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";

/**
 * MARK: SessionStore model resolution tests
 * @description Verifies that stage sessions resolve the project's configured
 *   model against the shared ModelRuntime snapshot, refresh a stale snapshot
 *   and retry before falling back, and loudly surface every fallback instead
 *   of silently swapping models (which silently burns quota on the wrong
 *   model).
 */

const modelRuntimeMock = vi.hoisted(() => {
	let snapshot = [];
	const state = { refreshHook: null };
	const runtime = {
		setSnapshot: (models) => {
			snapshot = models;
		},
		getSnapshot: () => snapshot,
		onRefresh: (fn) => {
			state.refreshHook = fn;
		},
		getAvailableSnapshot: () => [...snapshot],
		refresh: vi.fn(async () => {
			// Simulate the runtime re-reading models.json from disk: whatever the
			// test staged via onRefresh/setSnapshot becomes available.
			if (state.refreshHook) state.refreshHook();
			return { aborted: false, errors: new Map() };
		}),
	};
	runtime.refreshHook = state.refreshHook;
	// Keep a stable reference so beforeEach can rewire the hook.
	runtime.state = state;
	return runtime;
});

vi.mock("@earendil-works/pi-coding-agent", () => {
	return {
		ModelRuntime: { create: vi.fn(async () => modelRuntimeMock) },
		SessionManager: {
			create: vi.fn(() => ({ entries: [], getEntries: () => [] })),
		},
		createAgentSession: vi.fn(async (opts) => ({
			session: {
				model: opts.model || null,
				messages: [],
				isStreaming: false,
				dispose: () => {},
				subscribe: () => () => {},
				on: () => {},
			},
		})),
	};
});

vi.mock("./eventBridge.js", () => ({
	eventBridge: {
		emitSystemLog: vi.fn(),
		clearSession: vi.fn(),
		handleAgentEvent: vi.fn(),
	},
}));

import { SessionStore } from "./sessionStore.js";
import { eventBridge } from "./eventBridge.js";

const project = {
	id: "proj-model",
	name: "Model Project",
	cwd: "/tmp/kb-model-proj",
	agentDir: "/tmp/kb-model-agent",
	defaultModel: "ollama-cloud-direct::glm-5.3-flash:cloud",
};

function makeStore() {
	return new SessionStore({ baseDir: path.join(os.tmpdir(), "kainbain-model-test") });
}

describe("sessionStore model resolution", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset any per-test overrides of the shared hoisted runtime so tests
		// stay isolated. The default refresh re-runs the staged onRefresh hook
		// (simulating a re-read of models.json from disk).
		modelRuntimeMock.state.refreshHook = null;
		modelRuntimeMock.refresh = vi.fn(async () => {
			if (modelRuntimeMock.state.refreshHook) {
				modelRuntimeMock.state.refreshHook();
			}
			return { aborted: false, errors: new Map() };
		});
		modelRuntimeMock.setSnapshot([]);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("resolves the project's configured composite model key", async () => {
		const runtime = await store_runtime();
		runtime.setSnapshot([
			{ provider: "ollama-cloud", id: "deepseek-v4-flash:0731-cloud" },
			{ provider: "ollama-cloud-direct", id: "glm-5.3-flash:cloud" },
		]);

		const store = makeStore();
		const session = await store.getOrCreate(project);

		expect(session.model).toEqual({
			provider: "ollama-cloud-direct",
			id: "glm-5.3-flash:cloud",
		});
		expect(eventBridge.emitSystemLog).not.toHaveBeenCalled();
	});

	it("refreshes a stale runtime snapshot and retries before falling back", async () => {
		const runtime = await store_runtime();
		// Initial snapshot predates a models.json change: glm not yet present.
		runtime.setSnapshot([
			{ provider: "ollama-cloud", id: "deepseek-v4-flash:0731-cloud" },
		]);
		// After the refresh triggered by the failed resolution, glm appears.
		let refreshed = false;
		runtime.onRefresh(() => {
			runtime.setSnapshot([
				{ provider: "ollama-cloud", id: "deepseek-v4-flash:0731-cloud" },
				{ provider: "ollama-cloud-direct", id: "glm-5.3-flash:cloud" },
			]);
			refreshed = true;
		});

		const store = makeStore();
		const session = await store.getOrCreate(project);

		expect(refreshed).toBe(true);
		expect(session.model).toEqual({
			provider: "ollama-cloud-direct",
			id: "glm-5.3-flash:cloud",
		});
		// Resolution succeeded after refresh — no fallback warning.
		expect(eventBridge.emitSystemLog).not.toHaveBeenCalled();
	});

	it("surfaces a visible warning and falls back when the model cannot be resolved at all", async () => {
		const runtime = await store_runtime();
		runtime.setSnapshot([
			{ provider: "ollama-cloud", id: "deepseek-v4-flash:0731-cloud" },
		]);

		const store = makeStore();
		const session = await store.getOrCreate(project);

		// Falls back to the deepseek-v4-flash match instead of failing hard.
		expect(session.model).toEqual({
			provider: "ollama-cloud",
			id: "deepseek-v4-flash:0731-cloud",
		});
		// The fallback must be LOUD, not silent.
		expect(eventBridge.emitSystemLog).toHaveBeenCalledWith(
			"proj-model",
			expect.stringContaining("glm-5.3-flash:cloud"),
			expect.objectContaining({ level: "warn", tag: "[WARN]" }),
		);
	});
});

async function store_runtime() {
	const { ModelRuntime } = await import("@earendil-works/pi-coding-agent");
	return ModelRuntime.create();
}