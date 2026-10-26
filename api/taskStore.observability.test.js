import { describe, it, expect, vi } from "vitest";
import { TaskStore } from "./taskStore.js";
import { SessionStore } from "./sessionStore.js";
import { registerHarness } from "./agent/harnessRegistry.js";

let observabilityProbeUnique = 7000;
const nextObservabilityProbeId = (prefix) => `${prefix}-${++observabilityProbeUnique}`;

/*** MARK: observability contract
 * @description Uses in-memory tasks and sessions only; never dispatches a real agent or writes a project.
 ***/
function fixture() {
	const stage = { id: "build", name: "Build", type: "agent", harness: "custom", model: "p::requested" };
	const project = { id: "project", name: "Project", harness: "pi", stages: [stage] };
	const store = new TaskStore();
	store.projectStore = { listProjects: () => [project] };
	store.getTaskReports = () => [{ stageName: "Plan" }];
	const task = store.createTask(project.id, { title: "Task", goal: "Full goal", stageId: "build" });
	task.prompt = "Full curated prompt\nwith context";
	task.status = "running_agent";
	store.engineState = { status: "running", activeTaskId: task.id, activeProjectId: project.id, activeStageId: stage.id };
	store.sessionStore = { sessions: new Map(), _resolveHarness: (_project, override) => ({ name: override || "pi" }) };
	return { store, project, stage, task };
}

describe("observability active task", () => {
	it("reads accessor-only non-pi session model and byte-exact dispatched prompt", async () => {
		const { store, task, stage } = fixture();
		stage.harness = "antigravity";
		stage.model = "antigravity::antigravity::requested";
		const dispatchedPrompt = `${task.prompt}\n\n# Git Context\nDispatch-only context\n`;
		store.sessionStore.sessions.set(`project:${task.id}`, {
			taskId: task.id,
			stageId: stage.id,
			session: {
				harnessId: "antigravity",
				getActiveModel: async () => ({ provider: "antigravity", id: "actual" }),
				getMessages: () => [{ role: "user", content: dispatchedPrompt }],
			},
		});
		const { activeTask } = await store.getObservabilityMetrics();
		expect(activeTask.model).toBe("antigravity::antigravity::actual");
		expect(activeTask.modelDetails.source).toBe("session");
		expect(activeTask.prompt).toBe(task.prompt);
		expect(activeTask.dispatchedPrompt).toBe(dispatchedPrompt);
	});

	it.each(["opencode", "muse"])("reads the %s contract without pi properties", async (harnessId) => {
		const { store, task, stage } = fixture();
		stage.harness = harnessId;
		stage.model = "default";
		const prompt = `${task.prompt}\n\n# Git Context\nExact dispatched instructions`;
		store.sessionStore.sessions.set(`project:${task.id}`, {
			taskId: task.id, stageId: stage.id,
			session: {
				harnessId,
				getActiveModel: async () => harnessId === "muse" ? null : { provider: "p", id: "actual" },
				getMessages: () => [{ role: "user", content: prompt }, { role: "user", content: "Follow-up" }],
			},
		});
		const { activeTask } = await store.getObservabilityMetrics();
		expect(activeTask).toMatchObject({
			harness: harnessId, dispatchedPrompt: prompt, promptSource: "session",
			model: harnessId === "muse" ? null : "opencode::p::actual",
			modelDetails: { source: harnessId === "muse" ? "unknown" : "session" },
		});
	});

	it("preserves legacy fields and adds normalized stage/harness/model details", async () => {
		const { store, task } = fixture();
		const before = structuredClone(task);
		const metrics = await store.getObservabilityMetrics();
		expect(metrics.activeTask).toMatchObject({ ...before, reports: [{ stageName: "Plan" }], model: "custom::p::requested", harness: "custom", modelDetails: { source: "stage", provider: "p", id: "requested" }, stageName: "Build", stageType: "agent", stageId: "build" });
		expect(metrics.queue[0]).toMatchObject({ model: "p::requested", harness: "custom" });
		expect(task).toEqual(before);
		expect((await store.getObservabilityMetrics("different")).activeTask).toBeNull();
	});

	it("uses only a live session belonging to the exact task AND stage", async () => {
		const { store, task } = fixture();
		const entry = { taskId: task.id, stageId: "build", session: { harnessId: "custom", model: { provider: "p", id: "actual" }, messages: [{ role: "user", content: `${task.prompt}\n# Git Context` }, { role: "user", content: "Later follow-up" }] } };
		store.sessionStore.sessions.set(`project:${task.id}`, entry);
		expect((await store.getObservabilityMetrics()).activeTask).toMatchObject({ model: "custom::p::actual", prompt: task.prompt, dispatchedPrompt: `${task.prompt}\n# Git Context`, promptSource: "session", promptPending: false });
		entry.session.messages[0].content = [{ type: "text", text: "Block prompt" }];
		expect((await store.getObservabilityMetrics()).activeTask.dispatchedPrompt).toBe("Block prompt");
		entry.stageId = "previous";
		expect((await store.getObservabilityMetrics()).activeTask).toMatchObject({ dispatchedPrompt: null, promptPending: true });
		expect((await store.getObservabilityMetrics()).activeTask.modelDetails.source).toBe("stage");
		entry.stageId = "build";
		entry.taskId = "another-task";
		expect((await store.getObservabilityMetrics()).activeTask.modelDetails.source).toBe("stage");
		store.sessionStore.sessions.delete(`project:${task.id}`);
		store.sessionStore.sessions.set("project", entry);
		expect((await store.getObservabilityMetrics()).activeTask.modelDetails.source).toBe("stage");
	});

	it("exposes modelSelection none with no invented model for harnesses without model selection", async () => {
		const { store, task, stage } = fixture();
		stage.harness = "custom";
		stage.model = "pi::provider::requested";
		store.sessionStore._resolveHarness = (_project, override) => ({
			name: override || "pi", harness: { name: "custom", modelSelection: "none" },
		});
		const { activeTask } = await store.getObservabilityMetrics();
		expect(activeTask).toMatchObject({
			harness: "custom", model: null, modelSelection: "none",
			modelDetails: { source: "harness-managed" },
		});
	});

	it("defaults modelSelection to list when the resolver returns a name only", async () => {
		const { store } = fixture();
		const { activeTask } = await store.getObservabilityMetrics();
		expect(activeTask).toMatchObject({
			harness: "custom", model: "custom::p::requested", modelSelection: "list",
			modelDetails: { source: "stage" },
		});
	});

	it("reads the harness display-only (peek) so dashboard polls never consume an alias rotation step", async () => {
		const { store } = fixture();
		const resolveSpy = vi.fn((_project, override) => ({ name: override || "pi" }));
		store.sessionStore._resolveHarness = resolveSpy;
		await store.getObservabilityMetrics();
		// EVERY harness read on the observability path (active-task display
		// AND the scheduled queue) must peek: one consuming read per 15s
		// dashboard poll would skew a weighted alias split.
		expect(resolveSpy).toHaveBeenCalled();
		for (const call of resolveSpy.mock.calls) {
			expect(call[2]).toEqual({ peek: true });
		}
	});

	it("shows the concrete target harness for a stage alias ref without warning", async () => {
		const targetName = nextObservabilityProbeId("observability-alias-target");
		registerHarness(targetName, () => ({ modelSelection: "list" }), {
			description: "observability alias display probe",
		});
		const { store, project, stage } = fixture();
		stage.harness = "alias";
		stage.model = "small";
		project.modelAliases = [{ name: "small", harness: targetName, model: "m1" }];
		store.sessionStore = new SessionStore({});
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const { activeTask } = await store.getObservabilityMetrics();
			expect(activeTask.harness).toBe(targetName);
			const lines = warnSpy.mock.calls.map((args) => String(args[0]));
			expect(
				lines.some((line) => line.includes('Unknown harness "alias"')),
			).toBe(false);
		} finally {
			warnSpy.mockRestore();
		}
	});

	it("reports the picked target plus the alias identity for a stage alias ref", async () => {
		const targetName = nextObservabilityProbeId("observability-alias-target");
		registerHarness(targetName, () => ({ modelSelection: "list" }), {
			description: "alias display probe",
		});
		const { store, project, stage } = fixture();
		stage.harness = "alias";
		stage.model = "small";
		project.modelAliases = [
			{ name: "small", harness: targetName, model: "google::char-model" },
		];
		store.sessionStore = new SessionStore({});
		const { activeTask, queue } = await store.getObservabilityMetrics();
		expect(activeTask).toMatchObject({
			harness: targetName,
			model: `${targetName}::google::char-model`,
			modelDetails: { source: "alias", provider: "google", id: "char-model" },
			alias: { name: "small", targetIndex: 0 },
			aliasMissing: null,
		});
		expect(queue[0]).toMatchObject({
			harness: targetName,
			model: "google::char-model",
			alias: { name: "small", targetIndex: 0 },
			aliasMissing: null,
		});
	});

	it("reports the picked weighted target index for a weighted alias", async () => {
		const first = nextObservabilityProbeId("observability-alias-w1");
		const second = nextObservabilityProbeId("observability-alias-w2");
		for (const name of [first, second]) {
			registerHarness(name, () => ({ modelSelection: "list" }), {
				description: "weighted alias display probe",
			});
		}
		const { store, project, stage } = fixture();
		stage.harness = "alias";
		stage.model = "mix";
		project.modelAliases = [
			{
				name: "mix",
				targets: [
					{ harness: first, model: "m1", percent: 50 },
					{ harness: second, model: "m2", percent: 50 },
				],
			},
		];
		store.sessionStore = new SessionStore({});
		// Fresh rotation: the peek preview is target 0 on both surfaces.
		const before = await store.getObservabilityMetrics();
		expect(before.activeTask.alias).toEqual({ name: "mix", targetIndex: 0 });
		expect(before.activeTask).toMatchObject({ harness: first, model: "m1" });
		expect(before.queue[0].alias).toEqual({ name: "mix", targetIndex: 0 });
		// Advance the live rotation once: the preview moves to target 1.
		const { selectAliasTarget } = await import("./aliasSelector.js");
		selectAliasTarget(project, "mix", { isHarnessKnown: () => true });
		const after = await store.getObservabilityMetrics();
		expect(after.activeTask.alias).toEqual({ name: "mix", targetIndex: 1 });
		expect(after.activeTask).toMatchObject({ harness: second, model: "m2" });
		expect(after.queue[0].alias).toEqual({ name: "mix", targetIndex: 1 });
	});

	it("reports the picked target plus the alias for an inherited project-default alias", async () => {
		const targetName = nextObservabilityProbeId("observability-alias-default");
		registerHarness(targetName, () => ({ modelSelection: "list" }), {
			description: "project-default alias display probe",
		});
		const { store, project, stage } = fixture();
		delete stage.harness;
		delete stage.model;
		project.harness = "alias";
		project.defaultModel = "small";
		project.modelAliases = [
			{ name: "small", harness: targetName, model: "google::m1" },
		];
		store.sessionStore = new SessionStore({});
		const { activeTask, queue } = await store.getObservabilityMetrics();
		expect(activeTask).toMatchObject({
			harness: targetName,
			model: `${targetName}::google::m1`,
			modelDetails: { source: "alias" },
			alias: { name: "small", targetIndex: 0 },
			aliasMissing: null,
		});
		expect(queue[0]).toMatchObject({
			harness: targetName,
			model: "google::m1",
			alias: { name: "small", targetIndex: 0 },
			aliasMissing: null,
		});
	});

	it("stays fail-visible for an unknown alias: names it and shows the fallback actually used", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const { store, project, stage } = fixture();
			stage.harness = "alias";
			stage.model = "ghost";
			project.harness = "pi";
			project.defaultModel = "google::base";
			project.modelAliases = [];
			store.sessionStore = new SessionStore({});
			const { activeTask, queue } = await store.getObservabilityMetrics();
			expect(activeTask).toMatchObject({
				harness: "pi",
				model: "pi::google::base",
				modelDetails: { source: "project" },
				alias: null,
				aliasMissing: "ghost",
			});
			expect(queue[0]).toMatchObject({
				harness: "pi",
				model: "google::base",
				alias: null,
				aliasMissing: "ghost",
			});
			const lines = warnSpy.mock.calls.map((args) => String(args[0]));
			expect(lines.some((line) => line.includes('"ghost"'))).toBe(true);
			expect(
				lines.some((line) => line.includes('Unknown harness "alias"')),
			).toBe(false);
		} finally {
			warnSpy.mockRestore();
		}
	});

	it("clears both model slots when the project default itself is an unresolvable alias", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const { store, project, stage } = fixture();
			stage.harness = "alias";
			stage.model = "ghost";
			project.harness = "alias";
			project.defaultModel = "also-ghost";
			project.modelAliases = [];
			store.sessionStore = new SessionStore({});
			const { activeTask, queue } = await store.getObservabilityMetrics();
			// Neither alias name may ever show as a model.
			expect(activeTask).toMatchObject({
				harness: "pi",
				model: null,
				modelDetails: { source: "unknown" },
				alias: null,
				aliasMissing: "ghost",
			});
			expect(queue[0]).toMatchObject({
				harness: "pi",
				model: "default",
				alias: null,
				aliasMissing: "ghost",
			});
		} finally {
			warnSpy.mockRestore();
		}
	});

	it("shows the alias with no invented model for a blank pick model on a none harness", async () => {
		const targetName = nextObservabilityProbeId("observability-alias-none");
		registerHarness(targetName, () => ({ modelSelection: "none" }), {
			description: "self-managed alias display probe",
		});
		const { store, project, stage } = fixture();
		stage.harness = "alias";
		stage.model = "cli";
		project.modelAliases = [{ name: "cli", harness: targetName, model: "" }];
		store.sessionStore = new SessionStore({});
		const { activeTask, queue } = await store.getObservabilityMetrics();
		expect(activeTask).toMatchObject({
			harness: targetName,
			model: null,
			modelSelection: "none",
			modelDetails: { source: "harness-managed" },
			alias: { name: "cli", targetIndex: 0 },
			aliasMissing: null,
		});
		expect(queue[0]).toMatchObject({
			harness: targetName,
			alias: { name: "cli", targetIndex: 0 },
			aliasMissing: null,
		});
	});

	it("keeps session-observed values over the alias preview while still naming the alias", async () => {
		const targetName = nextObservabilityProbeId("observability-alias-live");
		registerHarness(targetName, () => ({ modelSelection: "list" }), {
			description: "live alias display probe",
		});
		const { store, project, stage, task } = fixture();
		stage.harness = "alias";
		stage.model = "small";
		project.modelAliases = [
			{ name: "small", harness: targetName, model: "google::preview" },
		];
		const sessionStore = new SessionStore({});
		store.sessionStore = sessionStore;
		sessionStore.sessions.set(`project:${task.id}`, {
			taskId: task.id,
			stageId: stage.id,
			session: {
				harnessId: targetName,
				getActiveModel: async () => ({ provider: "google", id: "actual" }),
				getMessages: () => [{ role: "user", content: task.prompt }],
			},
		});
		const { activeTask } = await store.getObservabilityMetrics();
		expect(activeTask).toMatchObject({
			harness: targetName,
			model: `${targetName}::google::actual`,
			modelDetails: { source: "session" },
			alias: { name: "small", targetIndex: 0 },
			aliasMissing: null,
		});
	});

	it("reports no alias identity on scripted stages", async () => {
		const targetName = nextObservabilityProbeId("observability-alias-script");
		registerHarness(targetName, () => ({ modelSelection: "list" }), {
			description: "scripted alias display probe",
		});
		const { store, project, stage } = fixture();
		stage.type = "deploy";
		stage.harness = "alias";
		stage.model = "small";
		project.modelAliases = [
			{ name: "small", harness: targetName, model: "google::m1" },
		];
		store.sessionStore = new SessionStore({});
		const { activeTask } = await store.getObservabilityMetrics();
		expect(activeTask).toMatchObject({
			harness: null,
			model: null,
			isAutomatedStage: true,
			alias: null,
			aliasMissing: null,
		});
	});

	it("reports no alias indicator for non-alias runs", async () => {
		const targetName = nextObservabilityProbeId("observability-alias-plain");
		registerHarness(targetName, () => ({ modelSelection: "list" }), {
			description: "non-alias display probe",
		});
		const { store, project, stage } = fixture();
		stage.harness = targetName;
		stage.model = "p::requested";
		project.modelAliases = [
			{ name: "small", harness: targetName, model: "google::m1" },
		];
		store.sessionStore = new SessionStore({});
		const { activeTask, queue } = await store.getObservabilityMetrics();
		expect(activeTask).toMatchObject({
			harness: targetName,
			model: `${targetName}::p::requested`,
			modelDetails: { source: "stage" },
			alias: null,
			aliasMissing: null,
		});
		expect(queue[0]).toMatchObject({
			harness: targetName,
			model: "p::requested",
			alias: null,
			aliasMissing: null,
		});
	});

	it("dashboard polls never consume an alias rotation step", async () => {
		const first = nextObservabilityProbeId("observability-alias-n1");
		const second = nextObservabilityProbeId("observability-alias-n2");
		for (const name of [first, second]) {
			registerHarness(name, () => ({ modelSelection: "list" }), {
				description: "rotation-neutrality probe",
			});
		}
		const { store, project, stage } = fixture();
		stage.harness = "alias";
		stage.model = "mix";
		project.modelAliases = [
			{
				name: "mix",
				targets: [
					{ harness: first, model: "m1", percent: 90 },
					{ harness: second, model: "m2", percent: 10 },
				],
			},
		];
		store.sessionStore = new SessionStore({});
		for (let i = 0; i < 20; i++) {
			await store.getObservabilityMetrics();
		}
		// The live rotation still lands its exact configured split from a
		// fresh phase: 20 polls consumed nothing.
		const { selectAliasTarget } = await import("./aliasSelector.js");
		let minority = 0;
		for (let i = 0; i < 100; i++) {
			const picked = selectAliasTarget(project, "mix", {
				isHarnessKnown: () => true,
			});
			if (picked.harness === second) minority += 1;
		}
		expect(minority).toBe(10);
	});

	it("resolves workflow stages, running fallback, missing model and historical tasks without borrowing live identity", async () => {
		const { store, project, task } = fixture();
		project.workflows = [{ id: "wf", stages: [{ id: "build", harness: "custom", name: "Workflow build" }] }];
		task.workflowId = "wf";
		store.engineState = { status: "idle" };
		// Single-active invariant: a stale running_agent label with no engine
		// owner is never promoted to activeTask (no phantom second runner).
		expect((await store.getObservabilityMetrics()).activeTask).toBeNull();
		expect((await store.getObservabilityMetrics()).stats.running).toBe(0);
		// The engine owner still resolves with full display identity.
		store.engineState = { status: "running", activeTaskId: task.id, activeProjectId: project.id, activeStageId: "build" };
		expect((await store.getObservabilityMetrics()).activeTask).toMatchObject({ model: null, harness: "custom", stageName: "Workflow build", modelDetails: { source: "unknown" } });
		expect((await store.getObservabilityMetrics()).stats.running).toBe(1);
		store.engineState = { status: "idle" };
		task.status = "completed";
		expect((await store.getObservabilityMetrics()).activeTask.isLastExecuted).toBe(true);
	});

	it("never mixes live muse actuals with a peeked Gemini preview (worker-shaped alias, end to end)", async () => {
		const aliasName = nextObservabilityProbeId("observability-worker-e2e");
		const { store, project, stage, task } = fixture();
		stage.harness = "alias";
		stage.model = aliasName;
		project.modelAliases = [
			{
				name: aliasName,
				targets: [
					{ harness: "muse", model: "", percent: 50 },
					{ harness: "antigravity", model: "antigravity::google::gemini-e2e", percent: 50 },
				],
			},
		];
		store.sessionStore = new SessionStore({});
		const { selectAliasTarget } = await import("./aliasSelector.js");
		// Dispatch serves the first rotation pick (muse); the live session
		// below IS that run, while the peek preview has moved on to the
		// minority target.
		const served = selectAliasTarget(project, aliasName, { isHarnessKnown: () => true });
		expect(served.harness).toBe("muse");
		store.sessionStore.sessions.set(`project:${task.id}`, {
			taskId: task.id,
			stageId: stage.id,
			session: {
				harnessId: "muse",
				getActiveModel: async () => null,
				getMessages: () => [],
			},
		});
		const live = await store.getObservabilityMetrics();
		expect(live.activeTask).toMatchObject({
			harness: "muse",
			model: null,
			modelSelection: "none",
			modelDetails: { source: "harness-managed" },
			aliasMissing: null,
		});
		expect(live.activeTask.alias?.name).toBe(aliasName);
		expect(live.activeTask.alias?.targetIndex).toBeUndefined();
		expect(live.activeTask.model ?? "").not.toContain("gemini");
		// Idle (session gone): the full peeked preview shows, halves consistent.
		store.sessionStore.sessions.delete(`project:${task.id}`);
		const idle = await store.getObservabilityMetrics();
		expect(idle.activeTask).toMatchObject({
			harness: "antigravity",
			model: "antigravity::google::gemini-e2e",
			modelSelection: "list",
			modelDetails: { source: "alias" },
			alias: { name: aliasName, targetIndex: 1 },
			aliasMissing: null,
		});
	});
});
