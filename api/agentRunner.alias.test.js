import { describe, it, expect, vi, afterEach } from "vitest";
import {
	createAgentRunner,
	resolveStageTarget,
	resolveProjectDefaultTarget,
} from "./agentRunner.js";
import { config } from "./config.js";

/***
 * MARK: agentRunner alias resolution tests
 * @description Pins the alias dispatch choke point: non-alias stages pass
 *   through exactly as before (inherit/override/sentinel/blank), stage-level
 *   alias references resolve to the alias's current harness + model, the
 *   project-default alias resolves the model while the session inherits the
 *   harness, unknown/deleted aliases fall back loudly, and alias→alias loops
 *   are guarded. Runner-level tests prove editing an alias changes dispatch
 *   with no stage edit.
 ***/

const ALIAS_PROJECT = {
	id: "proj-alias",
	harness: "pi",
	defaultModel: "google::base",
	modelAliases: [
		{ name: "small", harness: "pi", model: "google::small-model" },
		{ name: "design", harness: "custom", model: "special-model" },
	],
};

describe("resolveStageTarget (non-alias passthrough)", () => {
	it("inherits harness and model when nothing is set", () => {
		expect(resolveStageTarget({ harness: "pi" }, {})).toMatchObject({
			harnessName: "",
			modelRef: undefined,
			aliasResolved: false,
			aliasMissing: null,
		});
	});

	it("passes stage harness overrides through", () => {
		expect(
			resolveStageTarget({ harness: "pi" }, { harness: "custom" }),
		).toMatchObject({ harnessName: "custom", modelRef: undefined });
	});

	it("prefers the explicit model over stage.model, sentinel untouched", () => {
		expect(
			resolveStageTarget({ harness: "pi" }, { model: "a" }, { model: "b" }),
		).toMatchObject({ modelRef: "b" });
		expect(
			resolveStageTarget({ harness: "pi" }, { model: "default" }),
		).toMatchObject({ modelRef: "default", aliasMissing: null });
	});

	it("never treats a bare model as an alias without harness=alias", () => {
		expect(
			resolveStageTarget(ALIAS_PROJECT, { model: "small" }),
		).toMatchObject({
			harnessName: "",
			modelRef: "small",
			aliasResolved: false,
			aliasMissing: null,
		});
	});
});

describe("resolveStageTarget (alias references)", () => {
	it("resolves a stage-level alias to its current harness + model", () => {
		expect(
			resolveStageTarget(ALIAS_PROJECT, { harness: "alias", model: "small" }),
		).toEqual({
			harnessName: "pi",
			modelRef: "google::small-model",
			aliasName: "small",
			aliasResolved: true,
			aliasMissing: null,
		});
	});

	it("resolves the project-default alias to its concrete harness + model together", () => {
		const project = {
			...ALIAS_PROJECT,
			harness: "alias",
			defaultModel: "design",
		};
		// One rotation pick serves BOTH halves: the session override and the
		// model switch can never land on different weighted targets.
		expect(resolveStageTarget(project, {})).toEqual({
			harnessName: "custom",
			modelRef: "special-model",
			aliasName: "design",
			aliasResolved: true,
			aliasMissing: null,
		});
	});

	it("falls back loudly on unknown stage aliases", () => {
		const target = resolveStageTarget(ALIAS_PROJECT, {
			harness: "alias",
			model: "ghost",
		});
		expect(target.aliasResolved).toBe(false);
		expect(target.aliasMissing).toBe("ghost");
		// Falls back to the project's non-alias default.
		expect(target.harnessName).toBe("");
		expect(target.modelRef).toBe("google::base");
	});

	it("falls back loudly on blank stage alias names", () => {
		for (const model of ["", "   ", undefined]) {
			const target = resolveStageTarget(ALIAS_PROJECT, {
				harness: "alias",
				model,
			});
			expect(target.aliasResolved).toBe(false);
			expect(target.aliasMissing).toBe("(blank)");
			expect(target.harnessName).toBe("");
			expect(target.modelRef).toBe("google::base");
		}
	});

	it("keeps self-managed harness aliases switch-free (blank model)", () => {
		const project = {
			harness: "pi",
			modelAliases: [{ name: "cli", harness: "custom", model: "" }],
		};
		expect(
			resolveStageTarget(project, { harness: "alias", model: "cli" }),
		).toEqual({
			harnessName: "custom",
			modelRef: "",
			aliasName: "cli",
			aliasResolved: true,
			aliasMissing: null,
		});
	});

	it("guards alias→alias loops as unknown", () => {
		const project = {
			harness: "pi",
			modelAliases: [{ name: "loop", harness: "alias", model: "small" }],
		};
		// Raw (pre-validation) data can still carry a loop — never resolve it.
		const target = resolveStageTarget(project, {
			harness: "alias",
			model: "loop",
		});
		expect(target.aliasResolved).toBe(false);
		expect(target.aliasMissing).toBe("loop");
	});
});

describe("resolveStageTarget (weighted aliases)", () => {
	it("rotates stage-level references across targets honouring the split", () => {
		const project = {
			id: "proj-weighted-stage",
			harness: "pi",
			modelAliases: [
				{
					name: "mix",
					targets: [
						{ harness: "pi", model: "google::m1", percent: 50 },
						{ harness: "custom", model: "m2", percent: 50 },
					],
				},
			],
		};
		const seen = new Set();
		for (let i = 0; i < 10; i++) {
			const target = resolveStageTarget(project, {
				harness: "alias",
				model: "mix",
			});
			expect(target.aliasResolved).toBe(true);
			expect(target.aliasMissing).toBe(null);
			seen.add(`${target.harnessName}::${target.modelRef}`);
		}
		expect([...seen].sort()).toEqual(["custom::m2", "pi::google::m1"]);
	});

	it("keeps harness and model on the same target for project-default aliases", () => {
		const project = {
			id: "proj-weighted-default",
			harness: "alias",
			defaultModel: "mix",
			modelAliases: [
				{
					name: "mix",
					targets: [
						{ harness: "pi", model: "google::m1", percent: 50 },
						{ harness: "custom", model: "m2", percent: 50 },
					],
				},
			],
		};
		for (let i = 0; i < 10; i++) {
			const target = resolveStageTarget(project, {});
			expect(target.aliasResolved).toBe(true);
			expect(`${target.harnessName}::${target.modelRef}`).toMatch(
				/^(pi::google::m1|custom::m2)$/,
			);
		}
	});

	it("skips weighted targets on unknown harnesses", () => {
		const project = {
			id: "proj-weighted-skip",
			harness: "pi",
			modelAliases: [
				{
					name: "mix",
					targets: [
						{ harness: "no-such-harness", model: "m1", percent: 90 },
						{ harness: "pi", model: "google::m1", percent: 10 },
					],
				},
			],
		};
		const target = resolveStageTarget(project, {
			harness: "alias",
			model: "mix",
		});
		expect(target).toMatchObject({
			harnessName: "pi",
			modelRef: "google::m1",
			aliasResolved: true,
			aliasMissing: null,
		});
	});
});

describe("resolveProjectDefaultTarget", () => {
	it("returns the raw project default when no alias is involved", () => {
		expect(
			resolveProjectDefaultTarget({ harness: "pi", defaultModel: "m" }),
		).toEqual({ harnessName: "", modelRef: "m" });
		expect(resolveProjectDefaultTarget({})).toEqual({
			harnessName: "",
			modelRef: undefined,
		});
	});

	it("carries the project-default alias rotation pick (harness + model)", () => {
		const project = {
			id: "proj-fallback-weighted",
			harness: "alias",
			defaultModel: "mix",
			modelAliases: [
				{
					name: "mix",
					harness: "pi",
					model: "google::m1",
					targets: [{ harness: "pi", model: "google::m1", percent: 100 }],
				},
			],
		};
		expect(resolveProjectDefaultTarget(project)).toEqual({
			harnessName: "pi",
			modelRef: "google::m1",
		});
	});
});

function mockSession() {
	return {
		harnessId: "pi",
		prompt: vi.fn().mockResolvedValue("done"),
		messages: [{ role: "assistant", content: "done" }],
		getActiveModel: vi.fn().mockResolvedValue({ id: "base" }),
		listModels: vi
			.fn()
			.mockResolvedValue([
				{ id: "small-model", provider: "google", key: "google::small-model" },
				{ id: "v2-model", provider: "google", key: "google::v2-model" },
				{ id: "base", provider: "google", key: "google::base" },
			]),
		switchModel: vi.fn().mockResolvedValue(undefined),
	};
}

describe("createAgentRunner (alias dispatch)", () => {
	afterEach(() => {
		config.strictModelRunnable = false;
	});

	it("dispatches a stage alias on the alias target (harness + model)", async () => {
		const session = mockSession();
		const getOrCreateSession = vi.fn().mockResolvedValue(session);
		const project = { ...ALIAS_PROJECT };
		const runner = createAgentRunner({
			getOrCreateSession,
			getProject: () => project,
		});
		await runner("do", {
			projectId: "proj-alias",
			stage: { id: "1", harness: "alias", model: "small" },
		});
		// Session begins on the ALIAS's harness, not "alias" — with the
		// alias's concrete model handed off alongside (target hand-off).
		expect(getOrCreateSession).toHaveBeenCalledWith("proj-alias", {
			stageId: "1",
			harness: "pi",
			model: "google::small-model",
		});
		expect(session.switchModel).toHaveBeenCalledWith(
			expect.objectContaining({ id: "small-model" }),
		);
	});

	it("editing the alias changes dispatch with no stage edit", async () => {
		const project = {
			...ALIAS_PROJECT,
			modelAliases: [{ name: "small", harness: "pi", model: "google::v2-model" }],
		};
		const session = mockSession();
		const runner = createAgentRunner({
			getOrCreateSession: vi.fn().mockResolvedValue(session),
			getProject: () => project,
		});
		await runner("do", {
			projectId: "proj-alias",
			stage: { id: "1", harness: "alias", model: "small" },
		});
		expect(session.switchModel).toHaveBeenCalledWith(
			expect.objectContaining({ id: "v2-model" }),
		);
	});

	it("warns and falls back to the project default on unknown aliases", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const session = mockSession();
			const getOrCreateSession = vi.fn().mockResolvedValue(session);
			const runner = createAgentRunner({
				getOrCreateSession,
				getProject: () => ({ ...ALIAS_PROJECT }),
			});
			const res = await runner("do", {
				projectId: "proj-alias",
				stage: { id: "1", harness: "alias", model: "ghost-alias-xyz" },
				taskId: "t1",
			});
			expect(getOrCreateSession).toHaveBeenCalledWith("proj-alias", {
				taskId: "t1",
				stageId: "1",
			});
			expect(session.switchModel).toHaveBeenCalledWith(
				expect.objectContaining({ id: "base" }),
			);
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("ghost-alias-xyz"),
			);
			expect(
				res.logEntries.map((e) => e?.text ?? String(e)).join("\n"),
			).toContain("ghost-alias-xyz");
		} finally {
			warnSpy.mockRestore();
		}
	});

	it("H2 reproduction: stage resolving to muse + Gemini model skips model switch entirely", async () => {
		const museSession = {
			harnessId: "muse",
			prompt: vi.fn().mockResolvedValue("done"),
			messages: [{ role: "assistant", content: "done" }],
			getActiveModel: vi.fn().mockResolvedValue(null),
			listModels: vi.fn().mockResolvedValue([]),
			switchModel: vi.fn().mockResolvedValue(null),
		};
		const project = {
			id: "proj-muse-gemini",
			harness: "pi",
			modelAliases: [
				{ name: "worker", harness: "muse", model: "antigravity::google::gemini-2.5-flash" },
			],
		};
		const runner = createAgentRunner({
			getOrCreateSession: vi.fn().mockResolvedValue(museSession),
			getProject: () => project,
		});
		const res = await runner("do", {
			projectId: "proj-muse-gemini",
			stage: { id: "1", harness: "alias", model: "worker" },
		});
		// In H2, current code attempts to resolve the model, fails because listModels() is empty, and calls switchModel or warns "not available"
		expect(museSession.switchModel).not.toHaveBeenCalled();
		expect(museSession.listModels).not.toHaveBeenCalled();
		const logs = res.logEntries.map((e) => e?.text ?? String(e)).join("\n");
		expect(logs).not.toContain("is not available; stage is running on");
		expect(logs).not.toContain("scoped to harness");
		expect(logs).toContain("manages its own model");
		expect(logs).toContain("worker");
	});

	it("stage resolving to custom + model string skips the model switch identically (custom is also none)", async () => {
		const customSession = {
			harnessId: "custom",
			prompt: vi.fn().mockResolvedValue("done"),
			messages: [{ role: "assistant", content: "done" }],
			getActiveModel: vi.fn().mockResolvedValue(null),
			listModels: vi.fn().mockResolvedValue([]),
			switchModel: vi.fn().mockResolvedValue(null),
		};
		const project = {
			id: "proj-custom-model",
			harness: "pi",
			modelAliases: [
				{ name: "cli", harness: "custom", model: "pi::ollama-cloud::qwen" },
			],
		};
		const runner = createAgentRunner({
			getOrCreateSession: vi.fn().mockResolvedValue(customSession),
			getProject: () => project,
		});
		const res = await runner("do", {
			projectId: "proj-custom-model",
			stage: { id: "1", harness: "alias", model: "cli" },
		});
		expect(customSession.switchModel).not.toHaveBeenCalled();
		expect(customSession.listModels).not.toHaveBeenCalled();
		const logs = res.logEntries.map((e) => e?.text ?? String(e)).join("\n");
		expect(logs).not.toContain("is not available; stage is running on");
		expect(logs).toContain("manages its own model");
		expect(logs).toContain("cli");
	});
});

