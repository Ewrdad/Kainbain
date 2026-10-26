import { describe, it, expect } from "vitest";
import {
	readActiveSessionDisplay,
	resolveActiveTaskDisplay,
	resolveEngineStageProjection,
	resolveMonitorTarget,
} from "./activeTaskDisplay.js";

describe("readActiveSessionDisplay", () => {
	it("reads accessor-only custom sessions without inventing pi metadata", async () => {
		const prompt = "Dispatched instructions\n\n# Git Context\nExact context\n";
		const observed = await readActiveSessionDisplay({
			getActiveModel: async () => ({ provider: "provider", id: "model:cloud", harnessId: "custom" }),
			getMessages: () => [{ role: "user", content: prompt }],
		});
		expect(observed.messages).toEqual([{ role: "user", content: prompt }]);
		expect(resolveActiveTaskDisplay({}, { model: "pi::provider::requested" }, { harness: "pi" }, observed.model))
			.toMatchObject({
				model: "custom::provider::model:cloud", harness: "custom",
				modelDetails: { provider: "provider", id: "model:cloud", source: "session" },
			});
	});

	it("prefers bound accessors over stale properties, including async reads", async () => {
		const session = {
			model: { id: "stale" }, messages: [{ content: "stale" }],
			actual: { provider: "p", id: "actual" },
			async getActiveModel() { return this.actual; },
			async getMessages() { return [{ role: "user", content: this.actual.id }]; },
		};
		expect(await readActiveSessionDisplay(session)).toEqual({
			model: session.actual, messages: [{ role: "user", content: "actual" }],
		});
	});

	it("treats null and empty accessor results as authoritative", async () => {
		expect(await readActiveSessionDisplay({
			model: "stale", messages: [{ content: "stale" }],
			getActiveModel: async () => null, getMessages: () => [],
		})).toEqual({ model: null, messages: [] });
	});

	it("guards failed capabilities independently and falls back to legacy properties", async () => {
		expect(await readActiveSessionDisplay({
			model: "legacy", messages: [{ role: "user", content: "legacy prompt" }],
			getActiveModel: async () => { throw new Error("disposed"); },
			getMessages: () => { throw new Error("disposed"); },
		})).toEqual({ model: "legacy", messages: [{ role: "user", content: "legacy prompt" }] });
		expect(await readActiveSessionDisplay({
			getActiveModel: async () => { throw new Error("unavailable"); },
			getMessages: () => [{ role: "user", content: "still readable" }],
		})).toEqual({ model: null, messages: [{ role: "user", content: "still readable" }] });
	});

	it("degrades safely for absent, malformed or disposed legacy sessions", async () => {
		for (const session of [null, {}, { getMessages: () => ({}) }, {
			get model() { throw new Error("disposed"); },
			get messages() { throw new Error("disposed"); },
		}]) {
			expect(await readActiveSessionDisplay(session)).toEqual({ model: null, messages: [] });
		}
	});
});

describe("resolveActiveTaskDisplay", () => {
	it.each([
		["pi::provider::model:cloud", "pi::provider::model:cloud", "provider", "model:cloud"],
		["provider::model", "pi::provider::model", "provider", "model"],
		["model", "model", null, "model"],
		["bad::::key", "bad::::key", null, null],
	])("preserves/normalizes %s", (ref, model, provider, id) => {
		const result = resolveActiveTaskDisplay({}, { model: ref }, { harness: "pi" });
		expect(result).toMatchObject({ model, harness: "pi", modelDetails: { provider, id, key: model, source: "stage" } });
	});

	it("uses the stage harness rather than a stale canonical key's harness", () => {
		expect(resolveActiveTaskDisplay({}, { model: "pi::p::m", harness: "custom", name: "Build", type: "agent" }, { harness: "pi" }))
			.toMatchObject({ model: "custom::p::m", harness: "custom", stageName: "Build", stageType: "agent" });
	});

	it("prefers the observed session model, including after a failed switch", () => {
		expect(resolveActiveTaskDisplay({}, { model: "p::requested" }, { harness: "custom" }, { id: "actual", provider: "p", harness: "custom" }))
			.toMatchObject({ model: "custom::p::actual", modelDetails: { source: "session" } });
	});

	it.each([undefined, null, "", "default"])("falls back to project default for %s", (model) => {
		expect(resolveActiveTaskDisplay({}, { model }, { harness: "pi", defaultModel: "p::project" }))
			.toMatchObject({ model: "pi::p::project", modelDetails: { source: "project" } });
	});

	it("handles absent metadata and default without inventing a model or harness", () => {
		expect(resolveActiveTaskDisplay({}, undefined, { defaultModel: "default" })).toEqual({
			model: null, harness: null, modelSelection: "list", isAutomatedStage: false, modelDetails: { provider: null, id: null, key: null, source: "unknown" }, stageName: null, stageType: null,
		});
	});

	it("accepts session keys and string refs and ignores empty session objects", () => {
		expect(resolveActiveTaskDisplay({}, {}, {}, { key: "custom::p::m" }).harness).toBe("custom");
		expect(resolveActiveTaskDisplay({}, {}, {}, "custom::p::m").modelDetails.source).toBe("session");
		expect(resolveActiveTaskDisplay({}, { model: "m" }, {}, {}).modelDetails.source).toBe("stage");
	});
});

describe("resolveActiveTaskDisplay modelSelection", () => {
	const noneHarness = { name: "custom", modelSelection: "none" };
	const listHarness = { name: "pi", modelSelection: "list" };
	const stage = { model: "pi::provider::requested", harness: "custom", name: "Build", type: "agent" };
	const project = { harness: "custom", defaultModel: "pi::provider::project-default" };

	it("never inherits stage/project models for a none harness", () => {
		expect(resolveActiveTaskDisplay({}, stage, project, null, noneHarness)).toEqual({
			model: null, harness: "custom", modelSelection: "none", isAutomatedStage: false,
			modelDetails: { provider: null, id: null, key: null, source: "harness-managed" },
			stageName: "Build", stageType: "agent",
		});
	});

	it("accepts the none selection as a string", () => {
		const result = resolveActiveTaskDisplay({}, stage, project, null, "none");
		expect(result).toMatchObject({ model: null, modelSelection: "none", modelDetails: { source: "harness-managed" } });
	});

	it("still honors an observed session model on a none harness", () => {
		const result = resolveActiveTaskDisplay({}, stage, project, { provider: "p", id: "actual", harnessId: "custom" }, noneHarness);
		expect(result).toMatchObject({
			model: "custom::p::actual", harness: "custom", modelSelection: "none",
			modelDetails: { provider: "p", id: "actual", source: "session" },
		});
	});

	it.each([undefined, null, {}, { name: "pi" }, "list", "free", listHarness])("treats %s as list with the fallback chain intact", (harnessOrSelection) => {
		const result = resolveActiveTaskDisplay({}, stage, project, null, harnessOrSelection);
		expect(result).toMatchObject({
			model: "custom::provider::requested", harness: "custom", modelSelection: "list",
			modelDetails: { provider: "provider", id: "requested", source: "stage" },
		});
	});

	it("defaults to list when the harness instance is absent", () => {
		expect(resolveActiveTaskDisplay({}, stage, project, null))
			.toMatchObject({ model: "custom::provider::requested", modelSelection: "list" });
	});
});

describe("resolveActiveTaskDisplay automated stages", () => {
	const project = { harness: "pi", defaultModel: "pi::provider::project-default" };

	it.each(["ci", "deploy", "merge", "script", "CI", "Deploy", "Merge"])("reports no model identity for scripted %s stages even with config leakage", (stageType) => {
		const stage = { model: "pi::provider::leaked", harness: "pi", name: "Step", type: stageType };
		expect(resolveActiveTaskDisplay({}, stage, project, null)).toEqual({
			model: null, harness: null, modelSelection: "list", isAutomatedStage: true,
			modelDetails: { provider: null, id: null, key: null, source: "scripted" },
			stageName: "Step", stageType,
		});
	});

	it("ignores an observed session model on scripted stages", () => {
		const stage = { model: "pi::p::leaked", harness: "pi", name: "Step", type: "merge" };
		const result = resolveActiveTaskDisplay({}, stage, project, { provider: "p", id: "actual", harnessId: "pi" });
		expect(result).toMatchObject({ model: null, harness: null, isAutomatedStage: true, modelDetails: { source: "scripted" } });
	});

	it.each(["agent", "human", undefined, null, "", "custom"])("marks %s as model-backed (fail-visible)", (stageType) => {
		const result = resolveActiveTaskDisplay({}, { type: stageType, model: "pi::p::m" }, project, null);
		expect(result.isAutomatedStage).toBe(false);
		expect(result.modelDetails.source).not.toBe("scripted");
	});
});

describe("resolveEngineStageProjection", () => {
	const stages = [
		{ id: "1", name: "Catchup", type: "agent" },
		{ id: "merge", name: "Merge and deploy", type: "merge" },
	];

	it("re-points the engine stage at the owner task's actual stage", () => {
		// The reported desync: the board shows the task in Catchup while the
		// engine badge still reads the merge stage it was moved out of.
		const projected = resolveEngineStageProjection({
			engineState: {
				activeTaskId: "t1",
				activeStageId: "merge",
				activeStageName: "Merge and deploy",
				activeStageType: "merge",
			},
			ownerTask: { id: "t1", currentStageId: "1" },
			stages,
		});
		expect(projected).toEqual({
			activeStageId: "1",
			activeStageName: "Catchup",
			activeStageType: "agent",
			reconciled: true,
		});
	});

	it("re-points a stale display name when the id already agrees", () => {
		// Same stage id but a stranded name (e.g. renamed stage, or a snapshot
		// written before the move): the id wins and the name follows it.
		const projected = resolveEngineStageProjection({
			engineState: {
				activeTaskId: "t1",
				activeStageId: "1",
				activeStageName: "Merge and deploy",
				activeStageType: "merge",
			},
			ownerTask: { id: "t1", currentStageId: "1" },
			stages,
		});
		expect(projected).toEqual({
			activeStageId: "1",
			activeStageName: "Catchup",
			activeStageType: "agent",
			reconciled: true,
		});
	});

	it("leaves an agreeing snapshot untouched", () => {
		const projected = resolveEngineStageProjection({
			engineState: {
				activeTaskId: "t1",
				activeStageId: "1",
				activeStageName: "Catchup",
				activeStageType: "agent",
			},
			ownerTask: { id: "t1", currentStageId: "1" },
			stages,
		});
		expect(projected.reconciled).toBe(false);
		expect(projected.activeStageName).toBe("Catchup");
	});

	it("fills a missing stage id when the name already agrees", () => {
		const projected = resolveEngineStageProjection({
			engineState: {
				activeTaskId: "t1",
				activeStageId: null,
				activeStageName: "Catchup",
			},
			ownerTask: { id: "t1", currentStageId: "1" },
			stages,
		});
		expect(projected.reconciled).toBe(true);
		expect(projected.activeStageId).toBe("1");
		expect(projected.activeStageName).toBe("Catchup");
	});

	it("falls back to the task's display name when the stage record is gone", () => {
		const projected = resolveEngineStageProjection({
			engineState: {
				activeTaskId: "t1",
				activeStageId: "merge",
				activeStageName: "Merge and deploy",
			},
			ownerTask: { id: "t1", currentStageId: "gone", currentStageName: "Ghost" },
			stages,
		});
		expect(projected).toEqual({
			activeStageId: "gone",
			activeStageName: "Ghost",
			activeStageType: null,
			reconciled: true,
		});
	});

	it("returns the raw snapshot when there is nothing to reconcile against", () => {
		const raw = {
			activeTaskId: null,
			activeStageId: "merge",
			activeStageName: "Merge and deploy",
			activeStageType: "merge",
		};
		for (const args of [
			{ engineState: raw, ownerTask: { id: "t1", currentStageId: "1" }, stages },
			{ engineState: { ...raw, activeTaskId: "t1" }, ownerTask: null, stages },
			{ engineState: { ...raw, activeTaskId: "t1" }, ownerTask: { id: "t1" }, stages },
		]) {
			const projected = resolveEngineStageProjection(args);
			expect(projected.reconciled).toBe(false);
			expect(projected.activeStageId).toBe("merge");
		}
		// A total absence of an engine snapshot is still total, never throwing.
		expect(resolveEngineStageProjection({ engineState: null }).reconciled).toBe(
			false,
		);
	});
});

describe("resolveMonitorTarget", () => {
	const stage = { harness: "alias", model: "worker" };
	const project = { harness: "pi", defaultModel: "google::base" };
	const peek = {
		harnessName: "antigravity",
		harness: { id: "antigravity", modelSelection: "list" },
		modelRef: "antigravity::google::gemini-x",
		projectModelRef: undefined,
		aliasName: "worker",
		aliasMissing: null,
		targetIndex: 1,
	};

	it("suppresses the peek halves for a live session and resolves selection from the live harness", () => {
		const triple = resolveMonitorTarget({
			session: { harnessId: "muse" },
			displayTarget: peek,
			resolvedHarness: { name: "antigravity", harness: peek.harness },
			stage,
			project,
		});
		expect(triple.harnessName).toBe("muse");
		expect(triple.harnessInstance?.modelSelection).toBe("none");
		expect(triple.modelRef).toBeUndefined();
		expect(triple.projectModelRef).toBeUndefined();
		expect(triple.aliasName).toBe("worker");
		expect(triple.aliasMissing).toBeNull();
		// The peek landed on antigravity while the live run is muse: the
		// peeked slot is not the running slot.
		expect(triple.targetIndex).toBeUndefined();
	});

	it("keeps the peeked targetIndex when the peek agrees with the live harness", () => {
		const triple = resolveMonitorTarget({
			session: { harnessId: "antigravity" },
			displayTarget: peek,
			resolvedHarness: { name: "antigravity", harness: peek.harness },
			stage,
			project,
		});
		expect(triple.harnessName).toBe("antigravity");
		expect(triple.harnessInstance?.modelSelection).toBe("list");
		expect(triple.modelRef).toBeUndefined();
		expect(triple.targetIndex).toBe(1);
	});

	it("falls back to the peeked harness instance when the live harness is unknown", () => {
		const triple = resolveMonitorTarget({
			session: { harnessId: "brand-new-harness" },
			displayTarget: peek,
			resolvedHarness: { name: "antigravity", harness: peek.harness },
			stage,
			project,
		});
		expect(triple.harnessName).toBe("brand-new-harness");
		expect(triple.harnessInstance).toBe(peek.harness);
		expect(triple.modelRef).toBeUndefined();
		expect(triple.targetIndex).toBeUndefined();
	});

	it("shows the full peeked triple when idle (no live session)", () => {
		const triple = resolveMonitorTarget({
			session: null,
			displayTarget: peek,
			resolvedHarness: { name: "antigravity", harness: peek.harness },
			stage,
			project,
		});
		expect(triple).toMatchObject({
			harnessName: "antigravity",
			modelRef: "antigravity::google::gemini-x",
			projectModelRef: undefined,
			aliasName: "worker",
			aliasMissing: null,
			targetIndex: 1,
		});
		expect(triple.harnessInstance).toBe(peek.harness);
	});

	it("keeps raw stage/project slots for legacy doubles without the display seam", () => {
		const triple = resolveMonitorTarget({
			session: { harnessId: "muse" },
			displayTarget: null,
			resolvedHarness: null,
			stage,
			project,
		});
		expect(triple).toMatchObject({
			harnessName: "muse",
			modelRef: "worker",
			projectModelRef: "google::base",
			aliasName: null,
			aliasMissing: null,
			targetIndex: null,
		});
		expect(triple.harnessInstance).toBeNull();
	});

	it("agrees when the dispatch-time peek and the live session name the same harness (no drift)", async () => {
		// Guards the task-card surface against display/dispatch drift: the
		// peek comes from the REAL session-store seam (what the init line
		// logs) and the session carries the harness stamp a dispatch-created
		// session would carry (what the card shows while running).
		const { SessionStore } = await import("./sessionStore.js");
		const store = new SessionStore();
		const liveProject = {
			id: "proj-card",
			harness: "pi",
			defaultModel: "llama-cloud-direct::glm-5.3-flash:cloud",
			modelAliases: [
				{ name: "worker", harness: "antigravity", model: "gemini-3.8-flash-low" },
			],
		};
		const liveStage = { id: "s1", harness: "alias", model: "worker" };
		const displayTarget = store.resolveDisplayTarget(liveProject, liveStage, {
			peek: true,
		});
		expect(displayTarget.harnessName).toBe("antigravity");
		const triple = resolveMonitorTarget({
			session: { harnessId: "antigravity" },
			displayTarget,
			resolvedHarness: {
				name: displayTarget.harnessName,
				harness: displayTarget.harness,
			},
			stage: liveStage,
			project: liveProject,
		});
		expect(triple.harnessName).toBe("antigravity");
		expect(triple.aliasName).toBe("worker");
	});
});
