import { describe, it, expect, beforeAll, vi } from "vitest";
import Fastify from "fastify";
import retrospectiveRoutes, {
	RETROSPECTIVE_SESSION_META,
	MAX_CHAT_TASK_IDS,
	MAX_CHAT_MESSAGES,
	MAX_CHAT_MESSAGE_CHARS,
	MAX_CHAT_TRANSCRIPT_CHARS,
	buildTaskContextBlock,
	contextMetaForTasks,
	parseTicketSuggestions,
	buildChatPrompt,
	resolveChatReplyText,
} from "./retrospective.js";
import { createMockHarness, createReferenceMockSession } from "../agent/harnesses/mock/mockHarness.js";
import {
	registerHarness,
	resolveHarnessForProject,
} from "../agent/harnessRegistry.js";
import { guardSessionCapability } from "../crew/sessionCapabilities.js";
import { SkillsRegistry } from "../skills/skillsRegistry.js";
import path from "node:path";

/**
 * MARK: Retrospective chat API tests
 * @description Verifies POST /retrospective/chat against a scoped Fastify
 *   instance (never the shared app singleton): the stateless turn shape,
 *   ephemeral-session discipline (marker meta, disposed), task-context
 *   injection, 501 harness degradation, validation/404 paths, defensive
 *   suggestion parsing, and the registry wiring through a test-registered
 *   mock harness. The endpoint creates nothing — ticket creation stays a
 *   frontend `POST /tasks` the user confirms.
 */

const WIRING_HARNESS_NAME = "retrospective-test-mock";

function makeTaskStore(tasksById = {}) {
	return {
		getTask: (projectId, taskId) => tasksById[`${projectId}:${taskId}`] || null,
	};
}

function makeProjectStore(project) {
	return {
		getProject: (id) => (id === project.id ? project : null),
	};
}

function resolveAndGuardProject(requestedId, reply) {
	if (requestedId === "missing-proj") {
		reply.status(404).send({ error: "Project not found" });
		return null;
	}
	return requestedId || "proj-1";
}

function sampleTask(overrides = {}) {
	return {
		id: "task-1",
		title: "Add pagination",
		status: "failed",
		stage: "Implement",
		stageId: "implement",
		workflowId: "wf-default",
		failureReason: "Tests failed",
		lastError: { message: "boom" },
		createdAt: "2026-09-20T10:00:00.000Z",
		updatedAt: "2026-09-20T12:00:00.000Z",
		history: [
			{ stage: "Plan", status: "PASSED", timestamp: "2026-09-20T10:30:00.000Z" },
			{ stage: "Implement", status: "FAILED", timestamp: "2026-09-20T12:00:00.000Z" },
		],
		reports: [{ path: "r1.md", stageId: "implement", stageName: "Implement", status: "FAILED" }],
		...overrides,
	};
}

async function buildApp({ project, tasksById, harness, harnessName = "mock", extraDeps = {} }) {
	const app = Fastify();
	const createSession = vi.fn(async (receivedProject, meta) => {
		const session = harness.createSession
			? await harness.createSession(receivedProject, meta)
			: null;
		return session;
	});
	const resolveHarness = vi.fn(() => ({ name: harnessName, harness: { ...harness, createSession: async (p, m) => createSession(p, m) } }));
	await app.register(retrospectiveRoutes, {
		deps: {
			projectStore: makeProjectStore(project),
			taskStore: makeTaskStore(tasksById),
			workflowRegistry: { list: () => [] },
			resolveAndGuardProject,
			guardSessionCapability,
			resolveHarness,
			...extraDeps,
		},
	});
	await app.ready();
	return { app, createSession, resolveHarness };
}

const project = { id: "proj-1", name: "Fixture", cwd: "/tmp/kb-retro-fixture" };

describe("POST /retrospective/chat", () => {
	it("runs a stateless turn and parses fenced ticket suggestions", async () => {
		const session = createReferenceMockSession();
		const promptSpy = vi.spyOn(session, "prompt");
		const disposeSpy = vi.spyOn(session, "dispose");
		const harness = {
			createSession: async () => session,
			resolveModelRef: async () => null,
		};
		const { app, createSession } = await buildApp({
			project,
			tasksById: { "proj-1:task-1": sampleTask() },
			harness,
		});

		const res = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: {
				projectId: "proj-1",
				messages: [{ role: "user", content: "Find trends" }],
				taskIds: ["task-1"],
			},
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(typeof body.reply).toBe("string");
		expect(body.reply).toContain("Mock reply:");
		expect(body.harness).toBe("mock");

		// Ephemeral-session discipline: marker meta, single prompt, disposed.
		expect(createSession).toHaveBeenCalledTimes(1);
		expect(createSession.mock.calls[0][1]).toMatchObject(RETROSPECTIVE_SESSION_META);
		expect(promptSpy).toHaveBeenCalledTimes(1);
		expect(promptSpy.mock.calls[0][0]).toContain("Add pagination");
		expect(promptSpy.mock.calls[0][0]).toContain("Find trends");
		expect(disposeSpy).toHaveBeenCalled();
		// The mock echoes the prompt, which carries the ```json instruction but
		// no real drafts — unparseable replies degrade to an empty list.
		expect(body.suggestions).toEqual([]);
		await app.close();
	});

	it("returns structured drafts when the reply carries fenced JSON", async () => {
		const replyText = [
			"Two ideas.",
			"```json",
			JSON.stringify([{ title: "Fix flaky test", goal: "Stabilize the suite" }]),
			"```",
		].join("\n");
		const harness = {
			createSession: async () =>
				createReferenceMockSessionWithReply(replyText),
		};
		const { app } = await buildApp({
			project,
			tasksById: { "proj-1:task-1": sampleTask() },
			harness,
		});
		const res = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: {
				messages: [{ role: "user", content: "Suggest tickets" }],
				taskIds: ["task-1"],
			},
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(body.reply).toBe(replyText);
		expect(body.suggestions).toEqual([{ title: "Fix flaky test", goal: "Stabilize the suite" }]);
		await app.close();
	});

	it("degrades with 501 when the session lacks prompt", async () => {
		const harness = {
			createSession: async () => ({ isStreaming: false, dispose: async () => {} }),
		};
		const { app } = await buildApp({ project, tasksById: {}, harness });
		const res = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: { messages: [{ role: "user", content: "hi" }] },
		});
		expect(res.statusCode).toBe(501);
		const body = JSON.parse(res.payload);
		expect(body.code).toBe("unsupported_by_harness");
		expect(body.capability).toBe("prompt");
		await app.close();
	});

	// When all given taskIds are unknown (here, the single taskId "nope"),
	// the route returns 404 task_not_found to preserve the signal for fully-bogus requests.
	it("returns 404 when all requested task ids are unknown", async () => {
		const harness = { createSession: async () => createReferenceMockSession() };
		const { app } = await buildApp({ project, tasksById: {}, harness });
		const res = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: {
				messages: [{ role: "user", content: "hi" }],
				taskIds: ["nope", "gone-too"],
			},
		});
		expect(res.statusCode).toBe(404);
		const body = JSON.parse(res.payload);
		expect(body.code).toBe("task_not_found");
		// Names every unknown id so callers can prune them all; taskId stays
		// for backwards compatibility with the legacy single-id shape.
		expect(body.unknownTaskIds).toEqual(["nope", "gone-too"]);
		expect(body.taskId).toBe("nope");
		await app.close();
	});

	it("rejects empty messages and oversized task selections", async () => {
		const harness = { createSession: async () => createReferenceMockSession() };
		const { app } = await buildApp({ project, tasksById: {}, harness });
		const empty = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: { messages: [{ role: "user", content: "  " }] },
		});
		expect(empty.statusCode).toBe(400);
		const missing = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: {},
		});
		expect(missing.statusCode).toBe(400);
		const tooMany = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: {
				messages: [{ role: "user", content: "hi" }],
				taskIds: Array.from({ length: MAX_CHAT_TASK_IDS + 1 }, (_, i) => `t${i}`),
			},
		});
		expect(tooMany.statusCode).toBe(400);
		await app.close();
	});

	it("applies a requested model via switchModel and reports the active model", async () => {
		const session = createReferenceMockSession({
			models: [{ provider: "mock", id: "m1" }],
		});
		const switchSpy = vi.spyOn(session, "switchModel");
		const harness = {
			createSession: async () => session,
			resolveModelRef: async (target) =>
				target === "m1" ? { provider: "mock", id: "m1" } : null,
		};
		const { app } = await buildApp({ project, tasksById: {}, harness });
		const res = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: { messages: [{ role: "user", content: "hi" }], model: "m1" },
		});
		expect(res.statusCode).toBe(200);
		expect(switchSpy).toHaveBeenCalledWith({ provider: "mock", id: "m1" });
		expect(JSON.parse(res.payload).model).toBe("m1");
		await app.close();
	});

	it("never resolves or switches a model on a none harness (muse-shaped)", async () => {
		const session = createReferenceMockSession({
			models: [{ provider: "mock", id: "m1" }],
		});
		const switchSpy = vi.spyOn(session, "switchModel");
		const resolveSpy = vi.fn(async () => ({ provider: "mock", id: "m1" }));
		const harness = {
			modelSelection: "none",
			createSession: async () => session,
			resolveModelRef: resolveSpy,
		};
		const { app } = await buildApp({
			project,
			tasksById: {},
			harness,
			harnessName: "muse",
		});
		const res = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: {
				messages: [{ role: "user", content: "hi" }],
				harness: "muse",
				model: "antigravity::google::gemini-x",
			},
		});
		expect(res.statusCode).toBe(200);
		expect(resolveSpy).not.toHaveBeenCalled();
		expect(switchSpy).not.toHaveBeenCalled();
		expect(JSON.parse(res.payload).modelRequested).toBe(false);
		await app.close();
	});

	it("wires registry -> createSession -> prompt -> dispose through a test-registered harness", async () => {
		const prompts = [];
		const disposed = [];
		const factory = () =>
			createMockHarnessWithHooks({
				onPrompt: (text) => prompts.push(text),
				onDispose: () => disposed.push(true),
			});
		registerHarness(WIRING_HARNESS_NAME, factory, {
			description: "retrospective wiring-test mock",
		});
		const app = Fastify();
		await app.register(retrospectiveRoutes, {
			deps: {
				projectStore: makeProjectStore({ ...project, harness: WIRING_HARNESS_NAME }),
				taskStore: makeTaskStore({ "proj-1:task-1": sampleTask() }),
				workflowRegistry: { list: () => [] },
				resolveAndGuardProject,
				guardSessionCapability,
				resolveHarness: resolveHarnessForProject,
			},
		});
		await app.ready();
		const res = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: {
				messages: [{ role: "user", content: "Prove the wiring" }],
				taskIds: ["task-1"],
			},
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(body.harness).toBe(WIRING_HARNESS_NAME);
		expect(prompts).toHaveLength(1);
		expect(prompts[0]).toContain("Prove the wiring");
		expect(prompts[0]).toContain("Add pagination");
		expect(disposed).toHaveLength(1);
		await app.close();
	});

	it("falls back (never crashes) for an unknown harness name", async () => {
		const factory = () => createMockHarness();
		const name = "retrospective-fallback-mock";
		registerHarness(name, factory, { description: "fallback wiring-test mock" });
		const app = Fastify();
		await app.register(retrospectiveRoutes, {
			deps: {
				projectStore: makeProjectStore({ ...project, harness: name }),
				taskStore: makeTaskStore({}),
				workflowRegistry: { list: () => [] },
				resolveAndGuardProject,
				guardSessionCapability,
				resolveHarness: resolveHarnessForProject,
			},
		});
		await app.ready();
		const res = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: {
				messages: [{ role: "user", content: "hi" }],
				harness: "no-such-harness",
			},
		});
		expect(res.statusCode).toBe(200);
		// Unknown override degrades to the project's own resolution.
		expect(JSON.parse(res.payload).harness).toBe(name);
		await app.close();
	});
});

describe("buildTaskContextBlock", () => {
	it("serializes failure evidence, durations, and recent history", () => {
		const { block, truncated } = buildTaskContextBlock([sampleTask()], {
			resolveStages: () => [{ id: "implement", name: "Implement" }],
		});
		expect(truncated).toBe(false);
		expect(block).toContain("Add pagination");
		expect(block).toContain("status=failed");
		expect(block).toContain("failureReason=Tests failed");
		expect(block).toContain("lastError=boom");
		expect(block).toContain("Implement");
	});

	it("returns an empty block when nothing is selected", () => {
		expect(buildTaskContextBlock([])).toEqual({ block: "", truncated: false });
	});

	it("truncates oldest tasks first and flags it", () => {
		const tasks = Array.from({ length: 30 }, (_, i) =>
			sampleTask({
				id: `task-${i}`,
				title: `Task ${i} ${"x".repeat(2000)}`,
			}),
		);
		const { block, truncated } = buildTaskContextBlock(tasks, { resolveStages: () => [] });
		expect(truncated).toBe(true);
		expect(block.length).toBeLessThanOrEqual(12000 + 100);
		expect(block).toContain("Task 29");
		expect(block).not.toContain("Task 0");
	});
});

describe("parseTicketSuggestions", () => {
	it("parses fenced JSON drafts", () => {
		const reply = `Here you go:\n\`\`\`json\n${JSON.stringify([{ title: "T", goal: "G" }])}\n\`\`\``;
		expect(parseTicketSuggestions(reply)).toEqual([{ title: "T", goal: "G" }]);
	});

	it("drops drafts missing title or goal", () => {
		const reply = `\`\`\`json\n${JSON.stringify([{ title: "T", goal: "G" }, { title: "", goal: "x" }, { title: "y" }])}\n\`\`\``;
		expect(parseTicketSuggestions(reply)).toEqual([{ title: "T", goal: "G" }]);
	});

	it("returns [] for unparseable replies", () => {
		expect(parseTicketSuggestions("just prose, no fence")).toEqual([]);
		expect(parseTicketSuggestions("```json\nnot json\n```")).toEqual([]);
		expect(parseTicketSuggestions("")).toEqual([]);
		expect(parseTicketSuggestions(null)).toEqual([]);
	});
});

describe("buildChatPrompt", () => {
	it("folds context and transcript into one prompt text", () => {
		const text = buildChatPrompt({
			messages: [
				{ role: "user", content: "What failed?" },
				{ role: "assistant", content: "The tests." },
			],
			contextBlock: "## Task t1",
			contextTruncated: true,
		});
		expect(text).toContain("User: What failed?");
		expect(text).toContain("Assistant: The tests.");
		expect(text).toContain("## Task t1");
		expect(text).toContain("dropped to fit");
		expect(text).toContain("```json");
	});

	it("names the empty-selection case explicitly", () => {
		const text = buildChatPrompt({ messages: [{ role: "user", content: "hi" }] });
		expect(text).toContain("No tasks selected");
	});

	it("points empty-selection turns at recent-task tooling instead of conversation alone", () => {
		const text = buildChatPrompt({ messages: [{ role: "user", content: "hi" }] });
		expect(text).toContain("No tasks selected");
		expect(text).toContain("inspect recent tasks");
		expect(text).toContain("GET /tasks?projectId=<projectId>");
		expect(text).toContain("retrospective-task-lookup");
		expect(text).toContain("not in the provided context");
		expect(text).not.toContain("answer from the conversation alone");
	});

	it("names the project id for API lookups when provided", () => {
		const withProject = buildChatPrompt({
			messages: [{ role: "user", content: "hi" }],
			projectId: "proj-1",
		});
		expect(withProject).toContain("Project id for API lookups: proj-1.");
		const withoutProject = buildChatPrompt({
			messages: [{ role: "user", content: "hi" }],
		});
		expect(withoutProject).not.toContain("Project id for API lookups");
		// The optional parameter stays backward compatible: selected-task
		// turns render identically with or without it.
		const args = {
			messages: [{ role: "user", content: "hi" }],
			contextBlock: "## Task t1",
		};
		expect(buildChatPrompt({ ...args, projectId: "proj-1" })).toBe(
			buildChatPrompt(args),
		);
	});
});

describe("resolveChatReplyText", () => {
	it("prefers string results, then the last assistant text", async () => {
		const session = createReferenceMockSession();
		await expect(resolveChatReplyText(session, "direct")).resolves.toBe("direct");
		await session.prompt("hello");
		await expect(resolveChatReplyText(session, { ok: true })).resolves.toContain(
			"Mock reply: hello",
		);
		await expect(resolveChatReplyText(null, { ok: true })).resolves.toBe("");
	});
});

function createReferenceMockSessionWithReply(replyText) {
	const session = createReferenceMockSession();
	const basePrompt = session.prompt.bind(session);
	session.prompt = async (text, opts) => {
		await basePrompt(text, opts);
		const messages = session.getMessages();
		messages[messages.length - 1] = { role: "assistant", content: replyText };
		return replyText;
	};
	return session;
}

describe("POST /retrospective/chat robustness", () => {
	it("returns 504 chat_prompt_timeout when the model hangs, and still disposes", async () => {
		const dispose = vi.fn(async () => {});
		const harness = {
			createSession: async () => ({
				prompt: () => new Promise(() => {}), // never settles
				dispose,
			}),
		};
		const { app } = await buildApp({
			project,
			tasksById: {},
			harness,
			extraDeps: { promptTimeoutMs: 20 },
		});
		const res = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: { messages: [{ role: "user", content: "hi" }] },
		});
		expect(res.statusCode).toBe(504);
		expect(JSON.parse(res.payload).code).toBe("chat_prompt_timeout");
		expect(dispose).toHaveBeenCalled();
		await app.close();
	});

	it("returns 502 chat_prompt_failed when prompt() throws, and still disposes", async () => {
		const dispose = vi.fn(async () => {});
		const harness = {
			createSession: async () => ({
				prompt: async () => {
					throw new Error("Model exploded");
				},
				dispose,
			}),
		};
		const { app } = await buildApp({ project, tasksById: {}, harness });
		const res = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: { messages: [{ role: "user", content: "hi" }] },
		});
		expect(res.statusCode).toBe(502);
		const body = JSON.parse(res.payload);
		expect(body.code).toBe("chat_prompt_failed");
		expect(body.error).toContain("Model exploded");
		expect(dispose).toHaveBeenCalled();
		await app.close();
	});

	it("includes the streamed output tail in the 200 body (schema-valid)", async () => {
		const harness = { createSession: async () => createReferenceMockSession() };
		const { app } = await buildApp({ project, tasksById: {}, harness });
		const res = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: { messages: [{ role: "user", content: "hi" }] },
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(typeof body.output).toBe("string");
		expect(body.output).toContain("Mock reply:");
		expect(body.output).toBe(body.reply);
		await app.close();
	});

	it("omits the output field when the session streams nothing", async () => {
		const harness = {
			createSession: async () => ({
				prompt: async () => "silent reply",
				dispose: async () => {},
			}),
		};
		const { app } = await buildApp({ project, tasksById: {}, harness });
		const res = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: { messages: [{ role: "user", content: "hi" }] },
		});
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload)).not.toHaveProperty("output");
		await app.close();
	});

	it("includes partial output in the 504 body when deltas arrived before the timeout", async () => {
		const dispose = vi.fn(async () => {});
		const harness = {
			createSession: async () => ({
				prompt: (_text, { onChunk } = {}) =>
					new Promise(() => {
						onChunk?.("warming up…");
					}), // never settles
				dispose,
			}),
		};
		const { app } = await buildApp({
			project,
			tasksById: {},
			harness,
			extraDeps: { promptTimeoutMs: 20 },
		});
		const res = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: { messages: [{ role: "user", content: "hi" }] },
		});
		expect(res.statusCode).toBe(504);
		const body = JSON.parse(res.payload);
		expect(body.code).toBe("chat_prompt_timeout");
		expect(body.output).toBe("warming up…");
		expect(dispose).toHaveBeenCalled();
		await app.close();
	});

	it("includes partial output in the 502 body when deltas arrived before the failure", async () => {
		const harness = {
			createSession: async () => ({
				prompt: async (_text, { onChunk } = {}) => {
					onChunk?.("before the boom");
					throw new Error("Model exploded");
				},
				dispose: async () => {},
			}),
		};
		const { app } = await buildApp({ project, tasksById: {}, harness });
		const res = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: { messages: [{ role: "user", content: "hi" }] },
		});
		expect(res.statusCode).toBe(502);
		const body = JSON.parse(res.payload);
		expect(body.code).toBe("chat_prompt_failed");
		expect(body.output).toBe("before the boom");
		await app.close();
	});

	it("rejects oversized transcripts with structured 400 chat_input_too_large", async () => {
		const harness = { createSession: async () => createReferenceMockSession() };
		const { app } = await buildApp({ project, tasksById: {}, harness });
		// 6 x 7000 chars = 42000: each message under the per-message cap,
		// the transcript over the total — reaches the handler-level check.
		const res = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: {
				messages: Array.from({ length: 6 }, () => ({
					role: "user",
					content: "x".repeat(7000),
				})),
			},
		});
		expect(res.statusCode).toBe(400);
		expect(JSON.parse(res.payload).code).toBe("chat_input_too_large");
		await app.close();
	});

	it("rejects message-count and message-size overflow at the schema layer", async () => {
		const harness = { createSession: async () => createReferenceMockSession() };
		const { app } = await buildApp({ project, tasksById: {}, harness });
		const tooMany = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: {
				messages: Array.from({ length: MAX_CHAT_MESSAGES + 1 }, () => ({
					role: "user",
					content: "hi",
				})),
			},
		});
		expect(tooMany.statusCode).toBe(400);
		const tooLong = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: {
				messages: [{ role: "user", content: "x".repeat(MAX_CHAT_MESSAGE_CHARS + 1) }],
			},
		});
		expect(tooLong.statusCode).toBe(400);
		// Boundary: exactly the per-message cap still turns.
		const atCap = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: {
				messages: [{ role: "user", content: "x".repeat(MAX_CHAT_MESSAGE_CHARS) }],
			},
		});
		expect(atCap.statusCode).toBe(200);
		expect(MAX_CHAT_TRANSCRIPT_CHARS).toBeGreaterThan(0);
		await app.close();
	});

	it("prunes unknown task ids leniently and reports them in the 200", async () => {
		const session = createReferenceMockSession();
		const promptSpy = vi.spyOn(session, "prompt");
		const harness = { createSession: async () => session };
		const { app } = await buildApp({
			project,
			tasksById: { "proj-1:task-1": sampleTask() },
			harness,
		});
		const res = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: {
				messages: [{ role: "user", content: "hi" }],
				taskIds: ["task-1", "ghost-task"],
			},
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(body.unknownTaskIds).toEqual(["ghost-task"]);
		expect(body.contextTaskIds).toEqual(["task-1"]);
		expect(typeof body.contextChars).toBe("number");
		expect(body.contextTruncated).toBe(false);
		expect(promptSpy.mock.calls[0][0]).toContain("Add pagination");
		expect(promptSpy.mock.calls[0][0]).not.toContain("ghost-task");
		await app.close();
	});

	it("restores fail-fast 404 with strictTaskIds: true", async () => {
		const harness = { createSession: async () => createReferenceMockSession() };
		const { app } = await buildApp({
			project,
			tasksById: { "proj-1:task-1": sampleTask() },
			harness,
		});
		const res = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: {
				messages: [{ role: "user", content: "hi" }],
				taskIds: ["task-1", "ghost-task"],
				strictTaskIds: true,
			},
		});
		expect(res.statusCode).toBe(404);
		const body = JSON.parse(res.payload);
		expect(body.code).toBe("task_not_found");
		expect(body.taskId).toBe("ghost-task");
		await app.close();
	});

	it("reports truncation metadata and keeps the newest tasks", async () => {
		const harness = { createSession: async () => createReferenceMockSession() };
		const tasksById = {};
		for (let i = 0; i < MAX_CHAT_TASK_IDS; i += 1) {
			const task = sampleTask({
				id: `big-${i}`,
				title: `Big task ${i} ${"y".repeat(2000)}`,
			});
			tasksById[`proj-1:big-${i}`] = task;
		}
		const { app } = await buildApp({ project, tasksById, harness });
		const res = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: {
				messages: [{ role: "user", content: "hi" }],
				taskIds: Array.from({ length: MAX_CHAT_TASK_IDS }, (_, i) => `big-${i}`),
			},
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(body.contextTruncated).toBe(true);
		expect(body.contextTaskIds.length).toBeLessThan(MAX_CHAT_TASK_IDS);
		expect(body.contextTaskIds).toContain(`big-${MAX_CHAT_TASK_IDS - 1}`);
		expect(body.contextTaskIds).not.toContain("big-0");
		expect(body.unknownTaskIds).toEqual([]);
		await app.close();
	});

	it("reports modelRequested true on success and false on switch failure", async () => {
		const okSession = createReferenceMockSession({
			models: [{ provider: "mock", id: "m1" }],
		});
		const okHarness = {
			createSession: async () => okSession,
			resolveModelRef: async (target) =>
				target === "m1" ? { provider: "mock", id: "m1" } : null,
		};
		const okBuilt = await buildApp({ project, tasksById: {}, harness: okHarness });
		const okRes = await okBuilt.app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: { messages: [{ role: "user", content: "hi" }], model: "m1" },
		});
		expect(okRes.statusCode).toBe(200);
		expect(JSON.parse(okRes.payload).modelRequested).toBe(true);
		await okBuilt.app.close();

		const failingSession = createReferenceMockSession();
		vi.spyOn(failingSession, "switchModel").mockRejectedValueOnce(
			new Error("no such model"),
		);
		const failingHarness = { createSession: async () => failingSession };
		const failingBuilt = await buildApp({
			project,
			tasksById: {},
			harness: failingHarness,
		});
		const failingRes = await failingBuilt.app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: { messages: [{ role: "user", content: "hi" }], model: "ghost-model" },
		});
		expect(failingRes.statusCode).toBe(200);
		const failingBody = JSON.parse(failingRes.payload);
		expect(failingBody.modelRequested).toBe(false);
		expect(failingBody.model).toBe("ghost-model");
		await failingBuilt.app.close();
	});

	it("reports modelRequested false when a model is asked but the session cannot switch", async () => {
		const session = createReferenceMockSession();
		session.switchModel = undefined;
		const harness = { createSession: async () => session };
		const { app } = await buildApp({ project, tasksById: {}, harness });
		const res = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: { messages: [{ role: "user", content: "hi" }], model: "m1" },
		});
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload).modelRequested).toBe(false);
		await app.close();
	});

	it("reports modelRequested true when no model is asked", async () => {
		const harness = { createSession: async () => createReferenceMockSession() };
		const { app } = await buildApp({ project, tasksById: {}, harness });
		const res = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: { messages: [{ role: "user", content: "hi" }] },
		});
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload).modelRequested).toBe(true);
		await app.close();
	});
});

describe("POST /retrospective/chat live progress", () => {
	it("broadcasts throttled CHAT_PROGRESS frames tagged with the turnId", async () => {
		const broadcast = vi.fn();
		const harness = { createSession: async () => createReferenceMockSession() };
		const { app } = await buildApp({
			project,
			tasksById: {},
			harness,
			extraDeps: { eventBridge: { broadcast } },
		});
		const res = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: {
				projectId: "proj-1",
				messages: [{ role: "user", content: "hi" }],
				turnId: "turn-123",
			},
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(broadcast).toHaveBeenCalled();
		for (const call of broadcast.mock.calls) {
			expect(call[0]).toBe("proj-1");
			expect(call[1]).toBe("CHAT_PROGRESS");
			expect(call[2].turnId).toBe("turn-123");
			expect(typeof call[2].tail).toBe("string");
		}
		// The final frame's tail agrees with the body's output tail (same
		// winner rule, never double-counted across the two streams).
		const lastTail = broadcast.mock.calls.at(-1)[2].tail;
		expect(lastTail).toBe(body.output);
		await app.close();
	});

	it("broadcasts subscribe-only (pi-style) streams too", async () => {
		const broadcast = vi.fn();
		const handlers = new Set();
		const harness = {
			createSession: async () => ({
				subscribe: (handler) => {
					handlers.add(handler);
					return () => handlers.delete(handler);
				},
				prompt: async () => {
					for (const handler of [...handlers]) {
						handler({ type: "assistant_delta", delta: "thinking out loud" });
					}
					return "thinking out loud";
				},
				dispose: async () => {},
			}),
		};
		const { app } = await buildApp({
			project,
			tasksById: {},
			harness,
			extraDeps: { eventBridge: { broadcast } },
		});
		const res = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: {
				messages: [{ role: "user", content: "hi" }],
				turnId: "turn-sub",
			},
		});
		expect(res.statusCode).toBe(200);
		expect(broadcast).toHaveBeenCalledWith(
			"proj-1",
			"CHAT_PROGRESS",
			expect.objectContaining({ turnId: "turn-sub", tail: "thinking out loud" }),
		);
		await app.close();
	});

	it("broadcasts nothing without a turnId, and survives a missing bridge", async () => {
		const broadcast = vi.fn();
		const harness = { createSession: async () => createReferenceMockSession() };
		const withBridge = await buildApp({
			project,
			tasksById: {},
			harness,
			extraDeps: { eventBridge: { broadcast } },
		});
		const res = await withBridge.app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: { messages: [{ role: "user", content: "hi" }] },
		});
		expect(res.statusCode).toBe(200);
		expect(broadcast).not.toHaveBeenCalled();
		await withBridge.app.close();

		// Old wiring without eventBridge in deps: the turn still succeeds.
		const withoutBridge = await buildApp({ project, tasksById: {}, harness });
		const res2 = await withoutBridge.app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: { messages: [{ role: "user", content: "hi" }], turnId: "turn-x" },
		});
		expect(res2.statusCode).toBe(200);
		await withoutBridge.app.close();
	});

	it("never fails the turn when the progress broadcast throws", async () => {
		const harness = { createSession: async () => createReferenceMockSession() };
		const { app } = await buildApp({
			project,
			tasksById: {},
			harness,
			extraDeps: {
				eventBridge: {
					broadcast: () => {
						throw new Error("socket gone");
					},
				},
			},
		});
		const res = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: { messages: [{ role: "user", content: "hi" }], turnId: "turn-boom" },
		});
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload).reply).toContain("Mock reply:");
		await app.close();
	});
});

describe("POST /retrospective/chat skill injection", () => {
	function skillDescriptor(overrides = {}) {
		return {
			name: "retrospective-task-lookup",
			body: "SKILL-BODY-MARKER: cite task ids for every claim.",
			config: {},
			keywords: {},
			invalid: false,
			...overrides,
		};
	}

	it("injects the skill between system instructions and task context", async () => {
		const session = createReferenceMockSession();
		const promptSpy = vi.spyOn(session, "prompt");
		const harness = { createSession: async () => session };
		const { app } = await buildApp({
			project,
			tasksById: { "proj-1:task-1": sampleTask() },
			harness,
			extraDeps: { loadSkill: () => skillDescriptor() },
		});
		const res = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: {
				messages: [{ role: "user", content: "TRANSCRIPT-MARKER" }],
				taskIds: ["task-1"],
			},
		});
		expect(res.statusCode).toBe(200);
		const prompt = promptSpy.mock.calls[0][0];
		expect(prompt).toContain("SKILL-BODY-MARKER");
		expect(prompt).toContain("# Stage Skills");
		const skillAt = prompt.indexOf("SKILL-BODY-MARKER");
		const contextAt = prompt.indexOf("Selected task context");
		const transcriptAt = prompt.indexOf("TRANSCRIPT-MARKER");
		expect(skillAt).toBeGreaterThan(-1);
		expect(contextAt).toBeGreaterThan(skillAt);
		expect(transcriptAt).toBeGreaterThan(contextAt);
		await app.close();
	});

	it("still turns 200 when the skill is missing or its loader throws", async () => {
		const loaders = [
			() => null,
			() => ({ ...skillDescriptor(), invalid: true, error: "bad frontmatter" }),
			() => {
				throw new Error("disk gone");
			},
		];
		for (const loadSkill of loaders) {
			const session = createReferenceMockSession();
			const promptSpy = vi.spyOn(session, "prompt");
			const harness = { createSession: async () => session };
			const { app } = await buildApp({
				project,
				tasksById: {},
				harness,
				extraDeps: { loadSkill },
			});
			const res = await app.inject({
				method: "POST",
				url: "/retrospective/chat",
				payload: { messages: [{ role: "user", content: "hi" }] },
			});
			expect(res.statusCode).toBe(200);
			expect(promptSpy.mock.calls[0][0]).not.toContain("SKILL-BODY-MARKER");
			await app.close();
		}
	});

	it("injects the REAL retrospective-task-lookup skill via the registry", async () => {
		const session = createReferenceMockSession();
		const promptSpy = vi.spyOn(session, "prompt");
		const harness = { createSession: async () => session };
		const skillsRegistry = new SkillsRegistry({
			skillsDir: path.resolve(import.meta.dirname, "..", "..", "skills"),
		});
		const { app } = await buildApp({
			project,
			tasksById: { "proj-1:task-1": sampleTask() },
			harness,
			extraDeps: { skillsRegistry },
		});
		const res = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: {
				messages: [{ role: "user", content: "REAL-SKILL-TRANSCRIPT" }],
				taskIds: ["task-1"],
			},
		});
		expect(res.statusCode).toBe(200);
		const prompt = promptSpy.mock.calls[0][0];
		// The real package grounds the turn: lookup ladder + citation contract.
		expect(prompt).toContain("# Stage Skills");
		expect(prompt).toContain("## retrospective-task-lookup");
		expect(prompt).toContain("Cite task ids for every claim");
		expect(prompt.indexOf("## retrospective-task-lookup")).toBeLessThan(
			prompt.indexOf("Selected task context"),
		);
		expect(prompt.indexOf("Selected task context")).toBeLessThan(
			prompt.indexOf("REAL-SKILL-TRANSCRIPT"),
		);
		// Interpolation: the per-turn `projectCwd` override must resolve the
		// skill's self-referential KB_config keyword so lookup paths are
		// usable; no `{{...}}` placeholder may reach the model.
		expect(prompt).toContain(project.cwd);
		expect(prompt).toContain(`${project.cwd}/docs/tasks/<taskId>/`);
		expect(prompt).not.toMatch(/\{\{[^}]+\}\}/);
		await app.close();
	});

	it("turns a no-selection request 200 with real skill listing guidance and no placeholders", async () => {
		const session = createReferenceMockSession();
		const promptSpy = vi.spyOn(session, "prompt");
		const harness = { createSession: async () => session };
		const skillsRegistry = new SkillsRegistry({
			skillsDir: path.resolve(import.meta.dirname, "..", "..", "skills"),
		});
		const { app } = await buildApp({
			project,
			tasksById: {},
			harness,
			extraDeps: { skillsRegistry },
		});
		const res = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: { messages: [{ role: "user", content: "General trends?" }] },
		});
		expect(res.statusCode).toBe(200);
		const prompt = promptSpy.mock.calls[0][0];
		// Empty selection: the prompt must equip the model with generic
		// recent-task tooling, never "conversation alone".
		expect(prompt).toContain("No tasks selected");
		expect(prompt).toContain("inspect recent tasks");
		expect(prompt).toContain("## retrospective-task-lookup");
		expect(prompt).toContain("Listing recent tasks");
		expect(prompt).toContain("Project id for API lookups: proj-1.");
		expect(prompt).not.toMatch(/\{\{[^}]+\}\}/);
		await app.close();
	});

	it("falls back to ./ when project.cwd is missing so no placeholder leaks", async () => {
		const session = createReferenceMockSession();
		const promptSpy = vi.spyOn(session, "prompt");
		const harness = { createSession: async () => session };
		const cwdlessProject = { id: "proj-1", name: "Fixture" };
		const skillsRegistry = new SkillsRegistry({
			skillsDir: path.resolve(import.meta.dirname, "..", "..", "skills"),
		});
		const { app } = await buildApp({
			project: cwdlessProject,
			tasksById: {},
			harness,
			extraDeps: { skillsRegistry },
		});
		const res = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: { messages: [{ role: "user", content: "hi" }] },
		});
		expect(res.statusCode).toBe(200);
		const prompt = promptSpy.mock.calls[0][0];
		expect(prompt).toContain("## retrospective-task-lookup");
		expect(prompt).not.toMatch(/\{\{[^}]+\}\}/);
		await app.close();
	});

	it("omits an oversized skill with a marker and still turns 200", async () => {
		const session = createReferenceMockSession();
		const promptSpy = vi.spyOn(session, "prompt");
		const harness = { createSession: async () => session };
		const { app } = await buildApp({
			project,
			tasksById: {},
			harness,
			extraDeps: { loadSkill: () => skillDescriptor({ body: "z".repeat(7000) }) },
		});
		const res = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: { messages: [{ role: "user", content: "hi" }] },
		});
		expect(res.statusCode).toBe(200);
		const prompt = promptSpy.mock.calls[0][0];
		expect(prompt).toContain("[skill retrospective-task-lookup omitted: size cap]");
		expect(prompt).not.toContain("z".repeat(100));
		await app.close();
	});
});

describe("contextMetaForTasks", () => {
	it("enriches chunks with goal, report metadata, and first-line lastError", () => {
		const { block, truncated, contextTaskIds, chars } = contextMetaForTasks(
			[
				sampleTask({
					goal: `${"g".repeat(600)}`,
					lastError: { message: "first line\nsecond line\nthird" },
				}),
			],
			{ resolveStages: () => [] },
		);
		expect(truncated).toBe(false);
		expect(contextTaskIds).toEqual(["task-1"]);
		expect(chars).toBe(block.length);
		expect(block).toContain(`goal=${"g".repeat(500)}…`);
		expect(block).toContain("reports: Implement=FAILED");
		expect(block).toContain("lastError=first line");
		expect(block).not.toContain("second line");
	});

	it("accounts kept vs dropped task ids under the budget", () => {
		const tasks = Array.from({ length: 10 }, (_, i) =>
			sampleTask({ id: `acct-${i}`, title: `Acct ${i} ${"q".repeat(2000)}` }),
		);
		const { truncated, contextTaskIds } = contextMetaForTasks(tasks, {
			resolveStages: () => [],
		});
		expect(truncated).toBe(true);
		expect(contextTaskIds.length).toBeLessThan(10);
		expect(contextTaskIds[contextTaskIds.length - 1]).toBe("acct-9");
		expect(contextTaskIds).not.toContain("acct-0");
	});

	it("returns empty accounting when nothing is selected", () => {
		expect(contextMetaForTasks([])).toEqual({
			block: "",
			truncated: false,
			contextTaskIds: [],
			chars: 0,
		});
	});
});

describe("buildChatPrompt skills seam", () => {
	it("renders byte-identical output with skillSections: []", () => {
		const args = {
			messages: [{ role: "user", content: "What failed?" }],
			contextBlock: "## Task t1",
			contextTruncated: true,
		};
		expect(buildChatPrompt({ ...args, skillSections: [] })).toBe(buildChatPrompt(args));
		expect(buildChatPrompt({ ...args, skillSections: ["  ", ""] })).toBe(
			buildChatPrompt(args),
		);
	});

	it("renders skill sections between instructions and context", () => {
		const text = buildChatPrompt({
			messages: [{ role: "user", content: "hi" }],
			contextBlock: "## Task t1",
			skillSections: ["# Stage Skills\n## demo-skill\nDo the thing."],
		});
		const skillAt = text.indexOf("## demo-skill");
		expect(skillAt).toBeGreaterThan(-1);
		expect(text.indexOf("Never claim")).toBeLessThan(skillAt);
		expect(skillAt).toBeLessThan(text.indexOf("Selected task context"));
	});
});

function createMockHarnessWithHooks({ onPrompt, onDispose }) {
	const harness = createMockHarness();
	return {
		...harness,
		createSession: async (projectArg, meta) => {
			const session = await harness.createSession(projectArg, meta);
			const basePrompt = session.prompt.bind(session);
			const baseDispose = session.dispose.bind(session);
			session.prompt = async (text, opts) => {
				onPrompt?.(text);
				return basePrompt(text, opts);
			};
			session.dispose = async () => {
				onDispose?.();
				return baseDispose();
			};
			return session;
		},
	};
}

describe("POST /retrospective/chat target resolution", () => {
	const aliasProject = {
		id: "proj-1",
		name: "Alias Fixture",
		cwd: "/tmp/kb-retro-fixture",
		harness: "mock",
		defaultModel: "mock::echo-v1",
		modelAliases: [{ name: "worker", harness: "mock", model: "mock::echo-v1" }],
	};
	const echoModels = [
		{ provider: "mock", id: "echo-v1", name: "Echo", key: "mock::echo-v1" },
	];

	it("resolves harness:alias chat turns through the alias (harness + model together)", async () => {
		const harness = createMockHarness({ models: echoModels });
		const { app, createSession, resolveHarness } = await buildApp({
			project: aliasProject,
			tasksById: { "proj-1:task-1": sampleTask() },
			harness,
		});
		const res = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: {
				projectId: "proj-1",
				messages: [{ role: "user", content: "Find trends" }],
				taskIds: ["task-1"],
				harness: "alias",
				model: "worker",
			},
		});
		expect(res.statusCode).toBe(200);
		// The alias resolved to its concrete harness (not the virtual id)…
		expect(resolveHarness).toHaveBeenCalledWith(aliasProject, {
			harnessName: "mock",
		});
		// …and its concrete model rode to session creation (target hand-off).
		expect(createSession.mock.calls[0][1]).toMatchObject({
			...RETROSPECTIVE_SESSION_META,
			model: "mock::echo-v1",
		});
		const body = JSON.parse(res.payload);
		expect(body.model).toBe("echo-v1");
		await app.close();
	});

	it("falls back to the project default on unknown chat aliases (never the alias name)", async () => {
		const harness = createMockHarness({ models: echoModels });
		const { app, createSession } = await buildApp({
			project: aliasProject,
			tasksById: { "proj-1:task-1": sampleTask() },
			harness,
		});
		const res = await app.inject({
			method: "POST",
			url: "/retrospective/chat",
			payload: {
				projectId: "proj-1",
				messages: [{ role: "user", content: "Find trends" }],
				taskIds: ["task-1"],
				harness: "alias",
				model: "ghost-alias",
			},
		});
		expect(res.statusCode).toBe(200);
		// Alias-miss fallbacks pass nothing to creation (project-default path)…
		expect("model" in createSession.mock.calls[0][1]).toBe(false);
		// …and the turn still lands on the project default, never "ghost-alias".
		const body = JSON.parse(res.payload);
		expect(body.model).toBe("echo-v1");
		await app.close();
	});
});
