import { describe, it, expect, vi, afterEach } from "vitest";
import { SessionStore } from "./sessionStore.js";
import {
	registerHarness,
	resolveHarnessForProject,
} from "./agent/harnessRegistry.js";

/**
 * MARK: SessionStore harness selection unit tests
 * @description Verifies that the SessionStore resolves the agent harness PER
 *   PROJECT through the harness registry (project.harness →
 *   config.defaultHarness → "pi"): a project's registered choice drives
 *   session creation, an unknown choice falls back to the default harness
 *   without failing, and model runtimes are cached per harness name
 *   (never shared across harness types). The built-in pi harness's
 *   createSession is spied so no real pi session / model runtime is spun up.
 */

let unique = 0;
const nextId = (prefix) => `${prefix}-${++unique}`;

function makeMockSession(project) {
	return {
		project,
		messages: [],
		isStreaming: false,
		disposed: false,
		dispose: () => {
			session.disposed = true;
		},
		prompt: async () => ({}),
		steer: async () => ({}),
		followUp: async () => ({}),
		subscribe: () => () => {},
		on: () => () => {},
		abort: async () => {},
	};
}

/***
 * MARK: registerSpyHarness
 * @description Registers a one-off fake harness in the registry and returns
 *   its creation spy, so tests can prove WHICH harness built a session
 *   without touching the pi SDK.
 ***/
function registerSpyHarness(modelRuntime = async () => ({ marker: nextId("rt") })) {
	const name = nextId("fake-harness");
	const createSession = vi.fn(async (project) => makeMockSession(project));
	const modelRuntimeSpy = vi.fn(modelRuntime);
	registerHarness(name, () => ({ createSession, modelRuntime: modelRuntimeSpy }), {
		description: "sessionStore harness-selection test harness",
	});
	return { name, createSession, modelRuntime: modelRuntimeSpy };
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("sessionStore harness selection (per project, via the registry)", () => {
	it("creates sessions through the project's registered harness choice", async () => {
		const fake = registerSpyHarness();
		const store = new SessionStore({});
		const project = { id: nextId("proj"), cwd: "/tmp/proj", harness: fake.name };

		const session = await store.getOrCreate(project);

		expect(fake.createSession).toHaveBeenCalledTimes(1);
		expect(fake.createSession.mock.calls[0][0]).toBe(project);
		expect(session.project).toBe(project);
		expect(store.get(project.id)).toBe(session);
	});

	it("falls back to the default harness for an unknown harness choice and still creates the session", async () => {
		// Intercept the fallback (built-in pi) harness's createSession so no real
		// pi session is spun up; the resolution itself stays registry-driven.
		const { harness: fallbackHarness } = resolveHarnessForProject({
			id: nextId("system"),
		});
		const createSessionSpy = vi
			.spyOn(fallbackHarness, "createSession")
			.mockResolvedValue(makeMockSession({ id: "fallback-proj" }));

		const store = new SessionStore({});
		const project = {
			id: nextId("proj"),
			cwd: "/tmp/proj",
			harness: `nonexistent-${nextId("x")}`,
		};

		const session = await store.getOrCreate(project);

		expect(createSessionSpy).toHaveBeenCalledTimes(1);
		expect(session.id).toBeUndefined(); // the mock, not a real pi session
		expect(session.project.id).toBe("fallback-proj");
	});

	it("creates sessions consistently via the fallback harness when resolving repeatedly", async () => {
		// Intercept the fallback (built-in pi) harness's createSession so the
		// assertion target stays the resolution semantics — spinned the same
		// way as the fallback test above. Without the spy this test spins up
		// a REAL pi session SDK + user-extension load (~2.7s of git-spawning
		// module init) per run, which hermeticity forbids and the file's own
		// MARK header ("no real pi session is spun up") requires avoiding.
		const { harness: fallbackHarness } = resolveHarnessForProject({
			id: nextId("system"),
		});
		const createSessionSpy = vi.spyOn(fallbackHarness, "createSession").mockImplementation(async () =>
			makeMockSession({ id: "warn-once-fallback" }),
		);
		const store = new SessionStore({});
		const project = {
			id: nextId("proj"),
			cwd: "/tmp/proj",
			harness: `nonexistent-${nextId("y")}`,
		};
		const s1 = await store.getOrCreate(project);
		await store.dispose(project.id);
		const s2 = await store.getOrCreate(project);
		expect(s1.project.id).toBe("warn-once-fallback");
		expect(s2.project.id).toBe("warn-once-fallback");
		expect(createSessionSpy).toHaveBeenCalledTimes(2);
	});

	it("caches one model runtime per resolved harness (never shared across harnesses)", async () => {
		const harnessA = registerSpyHarness(async () => ({ marker: "runtime-a" }));
		const harnessB = registerSpyHarness(async () => ({ marker: "runtime-b" }));
		const store = new SessionStore({});

		const projectA = { id: nextId("proj"), harness: harnessA.name };
		const projectB = { id: nextId("proj"), cwd: "/tmp/b", harness: harnessB.name };

		const runtimeA = await store.getModelRuntime(projectA);
		expect(await store.getModelRuntime(projectA)).toBe(runtimeA);
		expect(harnessA.modelRuntime).toHaveBeenCalledTimes(1);

		const runtimeB = await store.getModelRuntime(projectB);
		expect(runtimeB).not.toBe(runtimeA);
		expect(harnessB.modelRuntime).toHaveBeenCalledTimes(1);

		// The project-agnostic resolution (no project) resolves the configured
		// default harness — a separate runtime from the project-chosen ones.
		const defaultRuntime = await store.getModelRuntime();
		expect(defaultRuntime).not.toBe(runtimeA);
		expect(defaultRuntime).not.toBe(runtimeB);
	});

	it("prefers the injected harness seam over the registry", async () => {
		const injectedSession = makeMockSession({ id: "injected-proj" });
		const injectedHarness = {
			createSession: vi.fn(async () => injectedSession),
			modelRuntime: vi.fn(async () => ({ marker: "injected-runtime" })),
		};
		const store = new SessionStore({ harness: injectedHarness });
		const project = { id: nextId("proj"), cwd: "/tmp/injected", harness: "whatever" };

		const session = await store.getOrCreate(project);

		expect(injectedHarness.createSession).toHaveBeenCalledTimes(1);
		expect(session).toBe(injectedSession);
		expect(await store.getModelRuntime(project)).toEqual({
			marker: "injected-runtime",
		});
		expect(injectedHarness.modelRuntime).toHaveBeenCalledTimes(1);
	});

	it("passes the project's session directory policy into harness creation", async () => {
		const fake = registerSpyHarness();
		const store = new SessionStore({});
		const project = { id: nextId("proj"), cwd: "/tmp/dircheck", harness: fake.name };

		await store.getOrCreate(project);

		const [calledProject, meta] = fake.createSession.mock.calls[0];
		expect(calledProject).toBe(project);
		expect(meta.sessionDir).toBe(store.sessionDirFor(project));
	});

	it("runs a stage session on the stage harness override instead of the project harness", async () => {
		const projectHarness = registerSpyHarness();
		const stageHarness = registerSpyHarness();
		const store = new SessionStore({});
		const project = { id: nextId("proj"), cwd: "/tmp/override", harness: projectHarness.name };

		const session = await store.beginStageSession(project, {
			taskId: "task-override",
			stageId: "stage-visual",
			harness: stageHarness.name,
		});

		expect(stageHarness.createSession).toHaveBeenCalledTimes(1);
		expect(projectHarness.createSession).not.toHaveBeenCalled();
		expect(session.project).toBe(project);

		await store.dispose(project.id);
	});

	it("a blank stage override inherits the project harness", async () => {
		const projectHarness = registerSpyHarness();
		const otherHarness = registerSpyHarness();
		const store = new SessionStore({});
		const project = { id: nextId("proj"), cwd: "/tmp/inherit", harness: projectHarness.name };

		for (const blank of [undefined, "", "   "]) {
			await store.beginStageSession(project, {
				taskId: `task-inherit-${blank === undefined ? "undef" : blank.length}`,
				stageId: "stage-1",
				harness: blank,
			});
		}

		expect(projectHarness.createSession).toHaveBeenCalledTimes(3);
		expect(otherHarness.createSession).not.toHaveBeenCalled();

		await store.dispose(project.id);
	});

	it("an unknown stage override degrades and runs on the project harness", async () => {
		const projectHarness = registerSpyHarness();
		const store = new SessionStore({});
		const project = { id: nextId("proj"), cwd: "/tmp/override-bad", harness: projectHarness.name };
		const bogus = `bogus-stage-${nextId("x")}`;

		const session = await store.beginStageSession(project, {
			taskId: "task-override-bad",
			stageId: "stage-1",
			harness: bogus,
		});

		expect(projectHarness.createSession).toHaveBeenCalledTimes(1);
		expect(session.project).toBe(project);

		await store.dispose(project.id);
	});
});