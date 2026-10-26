import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";

/**
 * MARK: piHarness model resolution tests
 * @description Verifies that the pi harness resolves a project's configured
 *   model against the shared ModelRuntime snapshot when creating a session,
 *   refreshes a stale snapshot and retries before falling back, uses the full
 *   registry when the availability snapshot transiently drops a provider, and
 *   loudly surfaces every fallback instead of silently swapping models (which
 *   silently burns quota on the wrong model). The pi SDK module is mocked so
 *   no real runtime is spun up; assertions run against the harness's public
 *   createSession contract surface.
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
		// Full registry (all configured models, availability-filter NOT applied).
		getModel: vi.fn((provider, id) =>
			state.registry?.find((m) => m.provider === provider && m.id === id) || null,
		),
		getModels: vi.fn(() => state.registry || []),
	};
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

vi.mock("../../../eventBridge.js", () => ({
	eventBridge: {
		emitSystemLog: vi.fn(),
		clearSession: vi.fn(),
		handleAgentEvent: vi.fn(),
	},
}));

import { createPiHarness } from "./piHarness.js";
import { eventBridge } from "../../../eventBridge.js";

const project = {
	id: "proj-model",
	name: "Model Project",
	cwd: "/tmp/kb-model-proj",
	agentDir: "/tmp/kb-model-agent",
	defaultModel: "ollama-cloud-direct::glm-5.3-flash:cloud",
};

function makeHarness() {
	return createPiHarness({ eventBridge });
}

describe("piHarness model resolution", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset any per-test overrides of the shared hoisted runtime so tests
		// stay isolated. The default refresh re-runs the staged onRefresh hook
		// (simulating a re-read of models.json from disk).
		modelRuntimeMock.state.refreshHook = null;
		modelRuntimeMock.state.registry = null;
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
		const runtime = modelRuntimeMock;
		runtime.setSnapshot([
			{ provider: "ollama-cloud", id: "deepseek-v4-flash:0731-cloud" },
			{ provider: "ollama-cloud-direct", id: "glm-5.3-flash:cloud" },
		]);

		const harness = makeHarness();
		const session = await harness.createSession(project, {
			sessionDir: path.join(os.tmpdir(), "kainbain-harness-model-test"),
		});

		expect(session.model).toEqual({
			provider: "ollama-cloud-direct",
			id: "glm-5.3-flash:cloud",
		});
		expect(eventBridge.emitSystemLog).not.toHaveBeenCalled();
	});

	it("refreshes a stale runtime snapshot and retries before falling back", async () => {
		const runtime = modelRuntimeMock;
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

		const harness = makeHarness();
		const session = await harness.createSession(project, {
			sessionDir: path.join(os.tmpdir(), "kainbain-harness-model-test"),
		});

		expect(refreshed).toBe(true);
		expect(session.model).toEqual({
			provider: "ollama-cloud-direct",
			id: "glm-5.3-flash:cloud",
		});
		// Resolution succeeded after refresh — no fallback warning.
		expect(eventBridge.emitSystemLog).not.toHaveBeenCalled();
	});

	it("uses the full registry when the availability snapshot transiently drops the provider", async () => {
		const runtime = modelRuntimeMock;
		// Availability check flaked: glm missing from the available snapshot and
		// the refresh does not bring it back...
		runtime.setSnapshot([
			{ provider: "ollama-cloud", id: "deepseek-v4-flash:0731-cloud" },
		]);
		// ...but the model is still configured in the runtime registry.
		runtime.state.registry = [
			{ provider: "ollama-cloud", id: "deepseek-v4-flash:0731-cloud" },
			{ provider: "ollama-cloud-direct", id: "glm-5.3-flash:cloud" },
		];

		const harness = makeHarness();
		const session = await harness.createSession(project, {
			sessionDir: path.join(os.tmpdir(), "kainbain-harness-model-test"),
		});

		expect(session.model).toEqual({
			provider: "ollama-cloud-direct",
			id: "glm-5.3-flash:cloud",
		});
		expect(eventBridge.emitSystemLog).not.toHaveBeenCalled();
	});

	it("surfaces a visible warning and falls back when the model cannot be resolved at all", async () => {
		const runtime = modelRuntimeMock;
		// No deepseek entry anywhere: the fallback is first-available, with
		// no substring preference for any model id.
		runtime.setSnapshot([
			{ provider: "ollama-cloud-direct", id: "glm-5.1:cloud" },
			{ provider: "ollama-cloud-direct", id: "glm-5.2:cloud" },
		]);

		const harness = makeHarness();
		const session = await harness.createSession(project, {
			sessionDir: path.join(os.tmpdir(), "kainbain-harness-model-test"),
		});

		// Falls back to the first available model instead of failing hard.
		expect(session.model).toEqual({
			provider: "ollama-cloud-direct",
			id: "glm-5.1:cloud",
		});
		// The fallback must be LOUD, not silent.
		expect(eventBridge.emitSystemLog).toHaveBeenCalledWith(
			"proj-model",
			expect.stringContaining("glm-5.3-flash:cloud"),
			expect.objectContaining({ level: "warn", tag: "[WARN]" }),
		);
	});

	it("prefers no model id on fallback: first available wins even when deepseek is present", async () => {
		const runtime = modelRuntimeMock;
		// deepseek is present but NOT first: a substring preference would
		// pick it — first-available must win instead.
		runtime.setSnapshot([
			{ provider: "ollama-cloud-direct", id: "glm-5.1:cloud" },
			{ provider: "ollama-cloud", id: "deepseek-v4-flash:0731-cloud" },
		]);

		const harness = makeHarness();
		const session = await harness.createSession(project, {
			sessionDir: path.join(os.tmpdir(), "kainbain-harness-model-test"),
		});

		expect(session.model).toEqual({
			provider: "ollama-cloud-direct",
			id: "glm-5.1:cloud",
		});
		expect(eventBridge.emitSystemLog).toHaveBeenCalledWith(
			"proj-model",
			expect.stringContaining("glm-5.3-flash:cloud"),
			expect.objectContaining({ level: "warn", tag: "[WARN]" }),
		);
	});

	it("resolveModelRef resolves against snapshot then full registry and returns null when unknown", async () => {
		const runtime = modelRuntimeMock;
		runtime.setSnapshot([
			{ provider: "ollama-cloud", id: "deepseek-v4-flash:0731-cloud" },
		]);
		const harness = makeHarness();

		expect(
			await harness.resolveModelRef("ollama-cloud::deepseek-v4-flash:0731-cloud"),
		).toEqual({ provider: "ollama-cloud", id: "deepseek-v4-flash:0731-cloud" });

		runtime.state.registry = [
			{ provider: "ollama-cloud-direct", id: "glm-5.3-flash:cloud" },
		];
		expect(
			await harness.resolveModelRef("ollama-cloud-direct::glm-5.3-flash:cloud"),
		).toEqual({ provider: "ollama-cloud-direct", id: "glm-5.3-flash:cloud" });

		expect(await harness.resolveModelRef("no-such-model")).toBeNull();
	});

	// --- Harness-scoped model keys (harness::provider::id) ---
	describe("harness-scoped model identity", () => {
		it("exposes HARNESS_ID as the harness instance id and on wrapped sessions", async () => {
			const { HARNESS_ID } = await import("./piHarness.js");
			const harness = makeHarness();
			expect(harness.id).toBe(HARNESS_ID);
			expect(HARNESS_ID).toBe("pi");

			const runtime = modelRuntimeMock;
			runtime.setSnapshot([
				{ provider: "ollama-cloud", id: "deepseek-v4-flash:0731-cloud" },
			]);
			const session = await harness.createSession(project, {
				sessionDir: path.join(os.tmpdir(), "kainbain-harness-model-test"),
			});
			expect(session.harnessId).toBe("pi");
		});

		it("listModels tags every model with a harness-scoped key and harness field", async () => {
			const runtime = modelRuntimeMock;
			runtime.setSnapshot([
				{ provider: "ollama-cloud", id: "glm-5.3-flash:cloud" },
			]);
			const harness = makeHarness();

			const models = await harness.listModels();
			expect(models[0].key).toBe("pi::ollama-cloud::glm-5.3-flash:cloud");
			expect(models[0].harness).toBe("pi");
			expect(models[0].provider).toBe("ollama-cloud");
		});

		it("resolves a canonical 3-part reference and normalizes legacy 2-part refs", async () => {
			const runtime = modelRuntimeMock;
			runtime.setSnapshot([
				{ provider: "ollama-cloud-direct", id: "glm-5.3-flash:cloud" },
			]);
			const harness = makeHarness();

			// Canonical harness-scoped form.
			expect(
				await harness.resolveModelRef("pi::ollama-cloud-direct::glm-5.3-flash:cloud"),
			).toEqual({ provider: "ollama-cloud-direct", id: "glm-5.3-flash:cloud" });

			// A foreign harness segment still names the same provider::id model.
			expect(
				await harness.resolveModelRef("other::ollama-cloud-direct::glm-5.3-flash:cloud"),
			).toEqual({ provider: "ollama-cloud-direct", id: "glm-5.3-flash:cloud" });

			// A bare id still resolves via the snapshot fallback.
			expect(await harness.resolveModelRef("glm-5.3-flash:cloud")).toEqual({
				provider: "ollama-cloud-direct",
				id: "glm-5.3-flash:cloud",
			});
		});

		it("resolves a project default stored as a legacy 2-part key", async () => {
			const runtime = modelRuntimeMock;
			runtime.setSnapshot([
				{ provider: "ollama-cloud-direct", id: "glm-5.3-flash:cloud" },
			]);
			const harness = makeHarness();
			const legacyProject = {
				...project,
				defaultModel: "ollama-cloud-direct::glm-5.3-flash:cloud",
			};

			const session = await harness.createSession(legacyProject, {
				sessionDir: path.join(os.tmpdir(), "kainbain-harness-model-test"),
			});
			expect(session.model).toEqual({
				provider: "ollama-cloud-direct",
				id: "glm-5.3-flash:cloud",
			});
			expect(eventBridge.emitSystemLog).not.toHaveBeenCalled();
		});

		it("resolves a project default stored as a canonical 3-part key", async () => {
			const runtime = modelRuntimeMock;
			runtime.setSnapshot([
				{ provider: "ollama-cloud-direct", id: "glm-5.3-flash:cloud" },
			]);
			const harness = makeHarness();
			const canonicalProject = {
				...project,
				defaultModel: "pi::ollama-cloud-direct::glm-5.3-flash:cloud",
			};

			const session = await harness.createSession(canonicalProject, {
				sessionDir: path.join(os.tmpdir(), "kainbain-harness-model-test"),
			});
			expect(session.model).toEqual({
				provider: "ollama-cloud-direct",
				id: "glm-5.3-flash:cloud",
			});
			expect(eventBridge.emitSystemLog).not.toHaveBeenCalled();
		});
	});

	// --- listModels refresh semantics (harness-backed model listing); every
	// listed model carries the harness-scoped key + harness field.
	it("listModels returns the runtime availability snapshot and declares its identity", async () => {
		const runtime = modelRuntimeMock;
		runtime.setSnapshot([
			{ provider: "ollama-cloud", id: "deepseek-v4-flash:0731-cloud" },
			{ provider: "google", id: "gemini-2.5-pro" },
		]);
		const harness = makeHarness();

		await expect(harness.listModels()).resolves.toEqual([
			{
				provider: "ollama-cloud",
				id: "deepseek-v4-flash:0731-cloud",
				key: "pi::ollama-cloud::deepseek-v4-flash:0731-cloud",
				harness: "pi",
			},
			{
				provider: "google",
				id: "gemini-2.5-pro",
				key: "pi::google::gemini-2.5-pro",
				harness: "pi",
			},
		]);
		// Without refresh the snapshot is served as-is: no runtime re-read.
		expect(runtime.refresh).not.toHaveBeenCalled();
		// The registry keys model-listing cache slots by harness id.
		expect(harness.id).toBe("pi");
	});

	it("listModels({ refresh: true }) refreshes the snapshot from disk without network", async () => {
		const runtime = modelRuntimeMock;
		// Snapshot predates a models.json change; the refresh re-reads it.
		runtime.setSnapshot([
			{ provider: "ollama-cloud", id: "deepseek-v4-flash:0731-cloud" },
		]);
		runtime.onRefresh(() => {
			runtime.setSnapshot([
				{ provider: "ollama-cloud", id: "deepseek-v4-flash:0731-cloud" },
				{ provider: "google", id: "gemini-2.5-pro" },
			]);
		});
		const harness = makeHarness();

		const models = await harness.listModels({ refresh: true });

		// Every listed model carries its harness-scoped key + harness field.
		expect(models).toContainEqual({
			provider: "google",
			id: "gemini-2.5-pro",
			key: "pi::google::gemini-2.5-pro",
			harness: "pi",
		});
		// Request paths must never touch provider catalogs over the network.
		expect(runtime.refresh).toHaveBeenCalledWith({ allowNetwork: false });
	});

	it("listModels({ refresh: true }) keeps serving the stale snapshot when the refresh fails", async () => {
		const runtime = modelRuntimeMock;
		runtime.setSnapshot([
			{ provider: "ollama-cloud", id: "deepseek-v4-flash:0731-cloud" },
		]);
		runtime.refresh = vi.fn(async () => {
			throw new Error("models.json unreadable");
		});
		const harness = makeHarness();

		await expect(harness.listModels({ refresh: true })).resolves.toEqual([
			{
				provider: "ollama-cloud",
				id: "deepseek-v4-flash:0731-cloud",
				key: "pi::ollama-cloud::deepseek-v4-flash:0731-cloud",
				harness: "pi",
			},
		]);
		expect(runtime.refresh).toHaveBeenCalledWith({ allowNetwork: false });
	});
});

describe("piHarness target hand-off", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		modelRuntimeMock.state.refreshHook = null;
		modelRuntimeMock.state.registry = null;
		modelRuntimeMock.refresh = vi.fn(async () => ({
			aborted: false,
			errors: new Map(),
		}));
		modelRuntimeMock.setSnapshot([]);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("pins the dispatch-resolved model and skips resolveInitialModel", async () => {
		const runtime = modelRuntimeMock;
		runtime.setSnapshot([
			{ provider: "ollama-cloud-direct", id: "glm-5.3-flash:cloud" },
		]);
		const harness = makeHarness();
		const resolveSpy = vi.spyOn(harness, "resolveInitialModel");
		const session = await harness.createSession(
			{
				...project,
				id: "proj-pi-handoff-pin",
				defaultModel: "antigravity::antigravity::gemini-x",
			},
			{
				taskId: "t1",
				stageId: "s1",
				sessionDir: path.join(os.tmpdir(), "kainbain-harness-model-test"),
				model: "ollama-cloud-direct::glm-5.3-flash:cloud",
			},
		);
		expect(session.model).toEqual({
			provider: "ollama-cloud-direct",
			id: "glm-5.3-flash:cloud",
		});
		expect(resolveSpy).not.toHaveBeenCalled();
		// The foreign project default never resolves: no WARN, no INFO.
		expect(eventBridge.emitSystemLog).not.toHaveBeenCalled();
	});

	it("warns and uses the SDK default for an unresolvable hand-off", async () => {
		const runtime = modelRuntimeMock;
		runtime.setSnapshot([
			{ provider: "ollama-cloud-direct", id: "glm-5.3-flash:cloud" },
		]);
		const harness = makeHarness();
		const session = await harness.createSession(
			{ ...project, id: "proj-pi-handoff-miss" },
			{
				taskId: "t1",
				stageId: "s1",
				sessionDir: path.join(os.tmpdir(), "kainbain-harness-model-test"),
				model: "ollama-cloud-direct::no-such-model",
			},
		);
		expect(session.model).toBeNull();
		expect(eventBridge.emitSystemLog).toHaveBeenCalledWith(
			"proj-pi-handoff-miss",
			expect.stringContaining("Dispatch-resolved model"),
			expect.objectContaining({ level: "warn", tag: "[WARN]" }),
		);
	});

	it("logs INFO (never WARN) for a foreign project default without a hand-off", async () => {
		const runtime = modelRuntimeMock;
		runtime.setSnapshot([
			{ provider: "ollama-cloud-direct", id: "glm-5.3-flash:cloud" },
		]);
		const harness = makeHarness();
		const session = await harness.createSession(
			{
				...project,
				id: "proj-pi-handoff-foreign",
				defaultModel: "antigravity::antigravity::gemini-x",
			},
			{
				taskId: "t1",
				stageId: "s1",
				sessionDir: path.join(os.tmpdir(), "kainbain-harness-model-test"),
			},
		);
		// No first-available fallback for foreign refs: the SDK default wins.
		expect(session.model).toBeNull();
		expect(eventBridge.emitSystemLog).toHaveBeenCalledTimes(1);
		expect(eventBridge.emitSystemLog).toHaveBeenCalledWith(
			"proj-pi-handoff-foreign",
			expect.stringContaining("scoped to harness 'antigravity'"),
			expect.objectContaining({ level: "info", tag: "[INFO]" }),
		);
	});
});
