import { describe, it, expect, beforeEach } from "vitest";
import {
	clearStageLifecyclePlugins,
	emitStageLifecycle,
	listStageLifecyclePlugins,
	registerStageLifecyclePlugin,
	runInterruptionReconcilePlugins,
} from "./stageLifecycle.js";

beforeEach(() => {
	clearStageLifecyclePlugins();
});

describe("registerStageLifecyclePlugin", () => {
	it("registers a named plugin and lists it", () => {
		expect(registerStageLifecyclePlugin({ name: "x" })).toBe(true);
		expect(listStageLifecyclePlugins()).toEqual(["x"]);
	});

	it("rejects nameless or non-object plugins", () => {
		expect(registerStageLifecyclePlugin(null)).toBe(false);
		expect(registerStageLifecyclePlugin({})).toBe(false);
		expect(registerStageLifecyclePlugin({ name: "  " })).toBe(false);
		expect(listStageLifecyclePlugins()).toEqual([]);
	});

	it("replaces a duplicate name instead of double-registering", () => {
		expect(registerStageLifecyclePlugin({ name: "x", v: 1 })).toBe(true);
		expect(registerStageLifecyclePlugin({ name: "x", v: 2 })).toBe(true);
		expect(listStageLifecyclePlugins()).toEqual(["x"]);
	});
});

describe("emitStageLifecycle", () => {
	it("resolves an empty env with no plugins", async () => {
		await expect(emitStageLifecycle("stage:enter", {})).resolves.toEqual({ env: {} });
	});

	it("merges string env contributions in registration order", async () => {
		registerStageLifecyclePlugin({
			name: "a",
			onStageEvent: async () => ({ env: { A: "1", SKIP: "" } }),
		});
		registerStageLifecyclePlugin({
			name: "b",
			onStageEvent: async () => ({ env: { B: "2", N: 3 } }),
		});
		await expect(emitStageLifecycle("stage:enter", {})).resolves.toEqual({
			env: { A: "1", B: "2" },
		});
	});

	it("skips throwing plugins and plugins without a hook", async () => {
		registerStageLifecyclePlugin({ name: "quiet" });
		registerStageLifecyclePlugin({
			name: "boom",
			onStageEvent: async () => {
				throw new Error("continuity bug must not break dispatch");
			},
		});
		registerStageLifecyclePlugin({
			name: "ok",
			onStageEvent: async () => ({ env: { OK: "yes" } }),
		});
		await expect(emitStageLifecycle("stage:enter", {})).resolves.toEqual({
			env: { OK: "yes" },
		});
	});
});

describe("runInterruptionReconcilePlugins", () => {
	it("returns [] with no plugins", async () => {
		await expect(runInterruptionReconcilePlugins({})).resolves.toEqual([]);
	});

	it("concatenates reconciled pairs and skips failures", async () => {
		registerStageLifecyclePlugin({
			name: "a",
			reconcileInterruptions: async () => [{ projectId: "p", taskId: "t" }],
		});
		registerStageLifecyclePlugin({
			name: "boom",
			reconcileInterruptions: async () => {
				throw new Error("must not break startup recovery");
			},
		});
		registerStageLifecyclePlugin({
			name: "b",
			reconcileInterruptions: async () => "not-an-array",
		});
		await expect(runInterruptionReconcilePlugins({})).resolves.toEqual([
			{ projectId: "p", taskId: "t" },
		]);
	});
});
