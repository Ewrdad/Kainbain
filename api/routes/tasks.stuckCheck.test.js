import { tempProjectsRoot, tempNotesRoot } from "../isolatedTestRoots.js";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import fs from "node:fs";

// Isolation: temp roots are installed by ../isolatedTestRoots.js, which MUST
// stay the first import — the config loader snapshots process.env at first
// evaluation, so no fixture in this file can ever touch the live projects
// root or the live SilverBullet notes space. (The hoisted vi.mock calls below
// are unaffected — mocks, not store construction.)

afterAll(() => {
	try {
		fs.rmSync(tempProjectsRoot, { recursive: true, force: true });
		fs.rmSync(tempNotesRoot, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});

/**
 * MARK: Task Stuck Check API Integration
 * @description Verifies the advisory "is it stuck?" endpoint: POST
 *   /tasks/:id/stuck-check. The route wiring is authentic — the real Fastify
 *   app from `index.js` with the real pi harness — and only the pi SDK (the
 *   agent layer) is mocked with a controllable ModelRuntime and a tools-free
 *   session factory, so NO real model call ever happens. Asserts the happy
 *   path shape, the diagnosis session constraints (no tools, isolated
 *   resources), log feed usage, and the failure paths.
 */

const sdkMock = vi.hoisted(() => {
	const runtime = {
		snapshot: [
			{
				id: "gpt-oss:20b-cloud",
				name: "GPT-OSS 20B (Cloud)",
				provider: "ollama-cloud",
				input: ["text"],
			},
		],
		getAvailableSnapshot: () => [...runtime.snapshot],
		refresh: vi.fn(async () => ({ aborted: false, errors: new Map() })),
		getModels: vi.fn(() => []),
		getModel: vi.fn(() => null),
	};

	const createdSessions = [];
	const createdSessionOpts = [];
	const loaderOpts = [];

	class DefaultResourceLoader {
		constructor(opts) {
			loaderOpts.push(opts);
		}
		async reload() {}
	}

	return {
		runtime,
		createdSessions,
		createdSessionOpts,
		loaderOpts,
		DefaultResourceLoader,
		answer: { value: "VERDICT: STUCK\nREASONING: The same bash command repeats 9 times." },
		failNextPrompt: { value: false },
	};
});

vi.mock("@earendil-works/pi-coding-agent", () => ({
	ModelRuntime: { create: vi.fn(async () => sdkMock.runtime) },
	SessionManager: {
		create: vi.fn(() => ({ entries: [], getEntries: () => [] })),
		list: vi.fn(async () => []),
		open: vi.fn(() => ({ entries: [], getEntries: () => [] })),
	},
	DefaultResourceLoader: sdkMock.DefaultResourceLoader,
	createAgentSession: vi.fn(async (opts) => {
		sdkMock.createdSessionOpts.push(opts);
		const shouldFail = sdkMock.failNextPrompt.value;
		sdkMock.failNextPrompt.value = false;
		const session = {
			messages: [],
			isStreaming: false,
			subscribe: () => () => {},
			prompt: vi.fn(async () => {
				if (shouldFail) throw new Error("provider exploded");
			}),
			getLastAssistantText: () => sdkMock.answer.value,
			abort: vi.fn(async () => {}),
			dispose: vi.fn(),
		};
		sdkMock.createdSessions.push(session);
		return { session };
	}),
}));

vi.mock("../eventBridge.js", () => ({
	eventBridge: { emitSystemLog: vi.fn(), clearSession: vi.fn() },
}));

const { default: app } = await import("../index.js");
import { taskStore } from "../taskStore.js";

describe("POST /tasks/:id/stuck-check", () => {
	let testProject;

	beforeAll(async () => {
		await app.ready();
		// Dedicated fixture project under the throwaway roots (see top of
		// file): task writes stay inside the temp notes space.
		const res = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: "Stuck Check Test Project", gitUrl: "https://git.example.com/team/fixture.git" },
		});
		expect(res.statusCode).toBe(201);
		testProject = JSON.parse(res.payload);
	});

	async function activeProject() {
		return testProject;
	}

	async function createTask(projectId, goal) {
		const res = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId, goal },
		});
		expect(res.statusCode).toBe(200);
		return JSON.parse(res.payload);
	}

	it("returns 200 with the parsed verdict and runs a tools-free diagnosis session", async () => {
		const project = await activeProject();
		const task = await createTask(project.id, "Stuck check happy path");

		// Seed structured logs on the in-memory task so the prompt carries them.
		const stored = taskStore.getTask(project.id, task.id);
		stored.logEntries = [
			{
				id: 1,
				ts: new Date().toISOString(),
				feeds: ["main"],
				kind: "assistant",
				turn: 1,
				text: "[AGENT] Running npm test",
			},
			{
				id: 2,
				ts: new Date().toISOString(),
				feeds: ["main", "tools"],
				kind: "tool",
				turn: 1,
				text: '[TOOL] bash({"command":"npm test"})',
			},
		];

		const res = await app.inject({
			method: "POST",
			url: `/tasks/${task.id}/stuck-check`,
			payload: {
				projectId: project.id,
				model: "ollama-cloud::gpt-oss:20b-cloud",
			},
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(body.taskId).toBe(task.id);
		expect(body.verdict).toBe("stuck");
		expect(body.summary).toContain("same bash command repeats");
		expect(body.model).toEqual({
			key: "ollama-cloud::gpt-oss:20b-cloud",
			id: "gpt-oss:20b-cloud",
			name: "GPT-OSS 20B (Cloud)",
			provider: "ollama-cloud",
		});
		expect(body.stage).toHaveProperty("name");

		// The diagnosis session was created with NO tools and isolated resources.
		expect(sdkMock.createdSessionOpts.length).toBe(1);
		const opts = sdkMock.createdSessionOpts[0];
		expect(opts.noTools).toBe("all");
		expect(opts.model).toMatchObject({ id: "gpt-oss:20b-cloud", provider: "ollama-cloud" });

		expect(sdkMock.loaderOpts.length).toBe(1);
		expect(sdkMock.loaderOpts[0]).toMatchObject({
			noExtensions: true,
			noSkills: true,
			noPromptTemplates: true,
			noThemes: true,
			noContextFiles: true,
		});
		expect(sdkMock.loaderOpts[0].systemPrompt).toContain("stuck-detection assistant");

		// The prompt carries the task goal and the seeded logs.
		const session = sdkMock.createdSessions[0];
		const promptArg = session.prompt.mock.calls[0][0];
		expect(promptArg).toContain("Task goal: Stuck check happy path");
		expect(promptArg).toContain("[AGENT] Running npm test");
		expect(promptArg).toContain("[TOOL] bash");

		// Session lifecycle: disposed after the run.
		expect(session.dispose).toHaveBeenCalled();

		// READ-ONLY: the task's own state was not touched by the check.
		const after = taskStore.getTask(project.id, task.id);
		expect(after.status).toBe(task.status);
		expect(after.currentStageId).toBe(task.currentStageId);
		expect(after.logEntries).toHaveLength(2);
	});

	it("returns 404 for an unknown task", async () => {
		const project = await activeProject();
		const res = await app.inject({
			method: "POST",
			url: "/tasks/does-not-exist/stuck-check",
			payload: { projectId: project.id, model: "ollama-cloud::gpt-oss:20b-cloud" },
		});
		expect(res.statusCode).toBe(404);
		expect(JSON.parse(res.payload).error).toContain("Task not found");
	});

	it("returns 400 when the requested model cannot be resolved", async () => {
		const project = await activeProject();
		const task = await createTask(project.id, "Stuck check bad model");
		const res = await app.inject({
			method: "POST",
			url: `/tasks/${task.id}/stuck-check`,
			payload: { projectId: project.id, model: "ollama-cloud::nope" },
		});
		expect(res.statusCode).toBe(400);
		expect(JSON.parse(res.payload).error).toContain("could not be resolved");
		// No diagnosis session was created for an unresolvable model.
		expect(sdkMock.createdSessions.length).toBe(1); // only the happy-path one
	});

	it("rejects a request without a project id (guard)", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/tasks/whatever/stuck-check",
			payload: { model: "ollama-cloud::gpt-oss:20b-cloud" },
		});
		// resolveAndGuardProject rejects unknown/missing projects without ever
		// reaching the handler — no diagnosis session may be created.
		expect([400, 404]).toContain(res.statusCode);
		expect(sdkMock.createdSessions.length).toBe(1); // only the happy-path one
	});

	it("returns 502 when the diagnosis run fails", async () => {
		const project = await activeProject();
		const task = await createTask(project.id, "Stuck check provider failure");
		sdkMock.failNextPrompt.value = true;

		const res = await app.inject({
			method: "POST",
			url: `/tasks/${task.id}/stuck-check`,
			payload: { projectId: project.id, model: "ollama-cloud::gpt-oss:20b-cloud" },
		});
		expect(res.statusCode).toBe(502);
		expect(JSON.parse(res.payload).error).toContain("provider exploded");

		// The failed session was still disposed (cleanup runs on the error path).
		const session = sdkMock.createdSessions.at(-1);
		expect(session.dispose).toHaveBeenCalled();
	});

	it("runs the diagnosis on the requested harness when one is named", async () => {
		const project = await activeProject();
		const task = await createTask(project.id, "Stuck check named harness");
		const sessionsBefore = sdkMock.createdSessions.length;

		const res = await app.inject({
			method: "POST",
			url: `/tasks/${task.id}/stuck-check`,
			payload: {
				projectId: project.id,
				model: "ollama-cloud::gpt-oss:20b-cloud",
				harness: "pi",
			},
		});
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload).verdict).toBe("stuck");
		// The named harness carried out exactly one more diagnosis run.
		expect(sdkMock.createdSessions.length).toBe(sessionsBefore + 1);
	});

	it("returns 400 naming the available harnesses for an unknown harness", async () => {
		const project = await activeProject();
		const task = await createTask(project.id, "Stuck check unknown harness");
		const sessionsBefore = sdkMock.createdSessions.length;

		const res = await app.inject({
			method: "POST",
			url: `/tasks/${task.id}/stuck-check`,
			payload: {
				projectId: project.id,
				model: "ollama-cloud::gpt-oss:20b-cloud",
				harness: "no-such-harness",
			},
		});
		expect(res.statusCode).toBe(400);
		expect(JSON.parse(res.payload).error).toContain("Unknown harness 'no-such-harness'");
		// No diagnosis session may run for an unresolvable harness name.
		expect(sdkMock.createdSessions.length).toBe(sessionsBefore);
	});

	it("returns 503 for a registered harness without diagnosis support", async () => {
		const project = await activeProject();
		const task = await createTask(project.id, "Stuck check unsupported harness");
		const sessionsBefore = sdkMock.createdSessions.length;

		const res = await app.inject({
			method: "POST",
			url: `/tasks/${task.id}/stuck-check`,
			payload: { projectId: project.id, harness: "custom" },
		});
		expect(res.statusCode).toBe(503);
		expect(JSON.parse(res.payload).error).toContain("'custom' does not support");
		expect(sdkMock.createdSessions.length).toBe(sessionsBefore);
	});
});