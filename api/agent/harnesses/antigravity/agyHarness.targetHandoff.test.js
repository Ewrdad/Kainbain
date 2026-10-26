import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveModel } from "../../../models.js";
import { createAntigravityHarness } from "./agyHarness.js";

/***
 * MARK: agyHarness target hand-off tests
 * @description Pins the dispatch→session target hand-off on the antigravity
 *   harness: a dispatch-resolved `model` is pinned for the session's spawns
 *   while `resolveInitialModel` (the S1 foreign-catalog WARN source) is
 *   skipped entirely; legacy refs normalize; foreign project defaults log
 *   INFO (never WARN); unresolvable hand-offs warn once and use agy's
 *   default. The catalog is faked — no CLI spawn, no network.
 ***/

const MODELS = [
	{
		provider: "antigravity",
		id: "gemini-3.8-flash-low",
		name: "gemini-3.8-flash-low",
		key: "antigravity::antigravity::gemini-3.8-flash-low",
	},
	{
		provider: "antigravity",
		id: "gemini-3.1-pro-high",
		name: "gemini-3.1-pro-high",
		key: "antigravity::antigravity::gemini-3.1-pro-high",
	},
];

function fakeCatalog(models = MODELS) {
	return {
		resolveModelRef: vi.fn(async (ref) => resolveModel(models, ref) || null),
		listAgyModels: vi.fn(async () => [...models]),
		getModelDiscoveryStatus: vi.fn(() => ({ ok: true })),
		clearCache: vi.fn(),
	};
}

function makeHarness(models) {
	const emitSystemLog = vi.fn();
	const harness = createAntigravityHarness({
		agyBin: "/definitely/not/a/real/agy-binary",
		catalog: fakeCatalog(models),
		eventBridge: { emitSystemLog },
	});
	return { harness, emitSystemLog };
}

function makeProject(overrides = {}) {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "agy-handoff-"));
	return {
		id: `proj-agy-handoff-${Math.random().toString(36).slice(2)}`,
		name: "AGY Handoff",
		cwd,
		...overrides,
	};
}

describe("agyHarness target hand-off", () => {
	it("pins the dispatch-resolved model and skips resolveInitialModel", async () => {
		const { harness, emitSystemLog } = makeHarness();
		const resolveSpy = vi.spyOn(harness, "resolveInitialModel");
		const project = makeProject({
			defaultModel: "pi::llama-cloud-direct::glm-5.3-flash:cloud",
		});
		const session = await harness.createSession(project, {
			taskId: "t1",
			stageId: "s1",
			model: "gemini-3.8-flash-low",
		});
		expect(await session.getActiveModel()).toMatchObject({
			id: "gemini-3.8-flash-low",
		});
		expect(resolveSpy).not.toHaveBeenCalled();
		// The foreign project default never reaches the catalog: no WARN, no INFO.
		const logged = emitSystemLog.mock.calls.map((call) => String(call[1]));
		expect(logged.some((line) => /Configured model/.test(line))).toBe(false);
		resolveSpy.mockRestore();
	});

	it("normalizes legacy provider::id hand-offs to the canonical form", async () => {
		const { harness } = makeHarness();
		const project = makeProject({ defaultModel: "" });
		const session = await harness.createSession(project, {
			taskId: "t1",
			stageId: "s1",
			model: "antigravity::gemini-3.1-pro-high",
		});
		expect(await session.getActiveModel()).toMatchObject({
			id: "gemini-3.1-pro-high",
		});
	});

	it("warns once and uses agy's default for an unresolvable hand-off", async () => {
		const { harness, emitSystemLog } = makeHarness();
		const project = makeProject({ defaultModel: "" });
		const session = await harness.createSession(project, {
			taskId: "t1",
			stageId: "s1",
			model: "gemini-no-such-model",
		});
		expect(await session.getActiveModel()).toBeNull();
		const logged = emitSystemLog.mock.calls.map((call) => String(call[1]));
		expect(
			logged.some((line) =>
				/Dispatch-resolved model 'gemini-no-such-model' could not be resolved/.test(
					line,
				),
			),
		).toBe(true);
	});

	it("logs INFO (never WARN) for a foreign project default without a hand-off", async () => {
		const { harness, emitSystemLog } = makeHarness();
		const project = makeProject({
			defaultModel: "pi::llama-cloud-direct::glm-5.3-flash:cloud",
		});
		const session = await harness.createSession(project, {
			taskId: "t1",
			stageId: "s1",
		});
		expect(await session.getActiveModel()).toBeNull();
		const logged = emitSystemLog.mock.calls.map((call) => String(call[1]));
		expect(
			logged.some((line) =>
				/\[INFO\] Configured model .* scoped to harness 'pi'/.test(line),
			),
		).toBe(true);
		expect(
			logged.some((line) => /\[WARN\] Configured model/.test(line)),
		).toBe(false);
	});

	it("keeps the loud WARN (with the cross-harness hint) for unqualified misses", async () => {
		const { harness, emitSystemLog } = makeHarness();
		const project = makeProject({ defaultModel: "gemini-no-such-model" });
		await harness.createSession(project, { taskId: "t1", stageId: "s1" });
		const logged = emitSystemLog.mock.calls.map((call) => String(call[1]));
		expect(
			logged.some((line) =>
				/\[WARN\] Configured model 'gemini-no-such-model' could not be resolved against the antigravity model catalog/.test(
					line,
				),
			),
		).toBe(true);
		expect(
			logged.some((line) => /may belong to another harness/.test(line)),
		).toBe(true);
	});
});
