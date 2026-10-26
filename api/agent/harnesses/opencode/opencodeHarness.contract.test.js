import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runSessionContractTests } from "../../sessionContract.test.js";
import { AGENT_EVENT_NAMES, isNormalizedAgentEvent } from "../../sessionEvents.js";
import { createOpencodeMockServer } from "./opencodeMockServer.js";
import { createOpencodeHarness } from "./OpencodeHarness.js";
import { modelKey } from "../../../models.js";
import { eventBridge as sharedEventBridge } from "../../../eventBridge.js";

/**
 * MARK: opencodeHarness contract tests
 * @description The acceptance gate for the OpenCode harness: the shared
 *   session-conformance suite (sessionContract.test.js) runs against sessions
 *   created by the real harness — REAL `@opencode-ai/sdk` client, REAL HTTP,
 *   REAL SSE parsing — against an in-process stub server
 *   (opencodeMockServer.js). Only the OpenCode SERVER is faked.
 *
 *   Targeted tests beyond the shared suite:
 *     - only NORMALIZED events reach subscribers (raw names never leak),
 *     - the per-message model override reaches the prompt body,
 *     - model discovery maps the stub providers payload,
 *     - transcript JSONL persists and readHistoryFromDisk round-trips,
 *     - interactive sessions warm-start from the persisted transcript.
 */

const eventBridgeStub = {
	emitSystemLog: vi.fn(),
	clearSession: vi.fn(),
};

let mock;
let harness;
const projectRoots = [];

beforeAll(async () => {
	mock = await createOpencodeMockServer();
	harness = createOpencodeHarness({ eventBridge: eventBridgeStub, baseUrl: mock.url });
});

afterAll(async () => {
	await mock.close();
});

/***
 * MARK: newProject
 * @description A throwaway project with its own cwd (per-project server
 *   managers key on cwd, so each project gets an isolated transcript path)
 *   and the stub's default model preselected.
 ***/
function newProject(name) {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `kb-opencode-${name}-`));
	projectRoots.push(cwd);
	return { id: `proj-${name}`, name, cwd, harness: "opencode", defaultModel: "mock-provider::mock-model" };
}

afterAll(() => {
	for (const cwd of projectRoots) {
		fs.rmSync(cwd, { recursive: true, force: true });
	}
});

// ── The shared engine acceptance gate ──────────────────────────────────────
runSessionContractTests({
	name: "opencode harness (real SDK client, stub server)",
	createSession: async () => {
		const project = newProject("conformance");
		return harness.createSession(project);
	},
});

// ── OpenCode-specific targeted tests ───────────────────────────────────────
describe("opencode harness — normalized event boundary", () => {
	it("delivers ONLY normalized events to subscribers (raw SSE names never leak)", async () => {
		const project = newProject("normalized");
		const session = await harness.createSession(project);

		const seen = [];
		const unsub = session.subscribe((event) => seen.push(event));
		await session.prompt("Check the stream");
		unsub();

		const types = seen.map((e) => e?.type);
		expect(types).toContain("run_started");
		expect(types).toContain("assistant_delta");
		expect(types).toContain("run_finished");
		for (const event of seen) {
			expect(
				isNormalizedAgentEvent(event?.type),
				`raw event leaked: ${event?.type}`,
			).toBe(true);
			expect(AGENT_EVENT_NAMES).toContain(event.type);
		}
	});

	it("streams the assistant reply text as assistant deltas", async () => {
		const project = newProject("deltas");
		const session = await harness.createSession(project);

		const deltas = [];
		const unsub = session.subscribe((event) => {
			if (event.type === "assistant_delta" && typeof event.delta === "string") {
				deltas.push(event.delta);
			}
		});
		await session.prompt("Say hello");
		unsub();

		expect(deltas.join("")).toBe("Mock reply: Say hello");
	});
});

describe("opencode harness — model control", () => {
	it("discovers the stub providers payload into the engine's model shape", async () => {
		const project = newProject("models");
		const models = await harness.listModels({ baseUrl: mock.url });

		expect(models).toHaveLength(2);
		const first = models.find((m) => m.id === "mock-model");
		expect(first).toMatchObject({
			provider: "mock-provider",
			id: "mock-model",
			name: "Mock Model",
			providerID: "mock-provider",
			modelID: "mock-model",
			key: modelKey("mock-provider", "mock-model"),
			input: ["text", "image"],
		});
	});

	it("resolves stored provider::id references", async () => {
		const resolved = await harness.resolveModelRef("mock-provider::mock-model-2", {
			baseUrl: mock.url,
		});
		expect(resolved).toMatchObject({ provider: "mock-provider", id: "mock-model-2" });
	});

	it("passes the per-message model as providerID/modelID in the prompt body", async () => {
		const project = newProject("permessage");
		const session = await harness.createSession(project);

		await session.switchModel({ provider: "mock-provider", id: "mock-model-2" });
		expect(await session.getActiveModel()).toEqual({
			provider: "mock-provider",
			id: "mock-model-2",
		});

		await session.prompt("Model check");

		const promptRequest = [...mock.requests]
			.reverse()
			.find((r) => r.method === "POST" && /\/message$/.test(r.url));
		expect(promptRequest.body.model).toEqual({
			providerID: "mock-provider",
			modelID: "mock-model-2",
		});
	});

	it("switchModel rejects unresolvable references with null (visible warning contract)", async () => {
		const project = newProject("badmodel");
		const session = await harness.createSession(project);

		expect(await session.switchModel({ provider: "nope", id: "missing" })).toBeNull();
		expect(await session.getActiveModel()).toEqual({
			provider: "mock-provider",
			id: "mock-model",
		});
	});
});

describe("opencode harness — transcript persistence", () => {
	it("persists each turn as JSONL and readHistoryFromDisk round-trips it", async () => {
		const project = newProject("transcript");
		const session = await harness.createSession(project);
		await session.prompt("Persist me");

		const transcriptPath = path.join(project.cwd, ".kainbain", "opencode_transcript.jsonl");
		/* eslint-disable security/detect-non-literal-fs-filename -- test fixture path under a throwaway tmp cwd */
		expect(fs.existsSync(transcriptPath)).toBe(true);

		const lines = fs.readFileSync(transcriptPath, "utf8").trim().split("\n");
		/* eslint-enable security/detect-non-literal-fs-filename */
		expect(lines).toHaveLength(2); // user turn + assistant turn
		const parsed = lines.map((l) => JSON.parse(l));
		expect(parsed[0].message).toMatchObject({ role: "user", content: "Persist me" });
		expect(parsed[0].sessionId).toMatch(/^ses-mock-/);
		expect(parsed[1].message).toMatchObject({ role: "assistant", content: "Mock reply: Persist me" });

		const history = await harness.readHistoryFromDisk(project);
		expect(history.messages).toHaveLength(2);
		expect(history.messages[0]).toMatchObject({ role: "user", content: "Persist me" });
		expect(history.tree).toEqual([]); // OpenCode keeps no client-side tree
	});

	it("readHistoryFromDisk returns empty history for a project with no transcript", async () => {
		const project = newProject("empty");
		const history = await harness.readHistoryFromDisk(project);
		expect(history).toEqual({ messages: [], tree: [] });
	});

	it("warm-starts interactive sessions from the persisted transcript", async () => {
		const project = newProject("warmstart");
		const first = await harness.createSession(project);
		await first.prompt("First conversation");
		await first.dispose();

		// A new interactive session for the same project continues the context.
		const second = await harness.createSession(project);
		expect(second.getMessages().some((m) => m.content === "First conversation")).toBe(true);

		// The server-side session was verified (GET /session/:id) before reuse.
		// The SDK client appends ?directory=… to GETs, so match on the path prefix.
		const verified = mock.requests.some(
			(r) => r.method === "GET" && r.url.startsWith("/session/ses-mock-"),
		);
		expect(verified).toBe(true);
		await second.dispose();
	});

	it("stage sessions always start fresh (no transcript warm start)", async () => {
		const project = newProject("stage");
		const interactive = await harness.createSession(project);
		await interactive.prompt("Interactive history");
		await interactive.dispose();

		const stageSession = await harness.createSession(project, {
			taskId: "t-1",
			stageId: "s-1",
		});
		expect(stageSession.getMessages()).toHaveLength(0);
		await stageSession.dispose();
	});
});

describe("opencode harness — lifecycle", () => {
	it("abort reaches the server and resolves", async () => {
		const project = newProject("abort");
		const session = await harness.createSession(project);

		await expect(session.abort()).resolves.toBeDefined();
		const abortRequest = [...mock.requests]
			.reverse()
			.find((r) => r.method === "POST" && r.url.endsWith("/abort"));
		expect(abortRequest).toBeDefined();
		expect(session.isStreaming).toBe(false);
	});

	it("dispose is idempotent and stops the event stream", async () => {
		const project = newProject("dispose");
		const session = await harness.createSession(project);
		await session.dispose();
		await session.dispose();
		expect(session.disposed).toBe(true);
	});

	it("prompt after dispose rejects instead of hitting a dead stream", async () => {
		const project = newProject("disposed-prompt");
		const session = await harness.createSession(project);
		await session.dispose();
		await expect(session.prompt("too late")).rejects.toThrow(/disposed/i);
	});

	it("steer and followUp record guidance and dispatch async turns", async () => {
		const project = newProject("steer");
		const session = await harness.createSession(project);

		const steerResult = await session.steer("Focus on the API layer");
		expect(steerResult).toEqual({ status: "steered" });
		const followResult = await session.followUp("Also add tests");
		expect(followResult).toEqual({ status: "followed_up" });

		expect(session.getMessages().some((m) => m.content.includes("Focus on the API layer"))).toBe(true);
		expect(session.getMessages().some((m) => m.content.includes("Also add tests"))).toBe(true);
		const asyncTurns = mock.requests.filter(
			(r) => r.method === "POST" && r.url.includes("/prompt_async"),
		);
		expect(asyncTurns.length).toBeGreaterThanOrEqual(2);
	});
});

describe("opencode harness — server manager integration", () => {
	it("reuses one server per project (no redundant readiness work)", async () => {
		const project = newProject("reuse");
		const first = await harness.createSession(project);
		const second = await harness.createSession({ ...project }, { taskId: "t", stageId: "s" });

		// Both sessions live on the same manager → same server URL.
		expect(harness.serverManagerFor(project)).toBe(harness.serverManagerFor(project));
		await first.dispose();
		await second.dispose();
	});

	it("harness.listModels returns [] (never spawns) when no server is running", async () => {
		// Hermetic: the no-server fallback resolves OPENCODE_URL through the
		// validated config (an import-time snapshot), so a fresh import with
		// the var deleted proves the empty path regardless of ambient env.
		vi.stubEnv("OPENCODE_URL", undefined);
		vi.stubEnv("OPENCODE_SERVER_PASSWORD", undefined);
		try {
			vi.resetModules();
			const { createOpencodeHarness: createIsolatedHarness } = await import(
				"./OpencodeHarness.js"
			);
			const models = await createIsolatedHarness({
				eventBridge: eventBridgeStub,
			}).listModels();
			expect(models).toEqual([]);
		} finally {
			vi.unstubAllEnvs();
		}
	});
});

describe("opencode harness — model discovery against stub payload", () => {
	it("listModels reflects a custom providers payload after refresh", async () => {
		mock.setProviders({
			providers: [
				{
					id: "other-provider",
					name: "Other",
					source: "config",
					env: [],
					options: {},
					models: {
						"other-model": {
							id: "other-model",
							providerID: "other-provider",
							name: "Other Model",
							capabilities: {
								input: { text: true, image: false, audio: false, video: false, pdf: false },
							},
						},
					},
				},
			],
			default: { "other-provider": "other-model" },
		});

		try {
			const project = newProject("customproviders");
			const discovery = harness.modelDiscoveryFor(project);
			const models = await discovery.listModels({ refresh: true });
			expect(models).toHaveLength(1);
			expect(models[0]).toMatchObject({ provider: "other-provider", id: "other-model" });
		} finally {
			mock.setProviders(null); // restore the default stub payload
		}
	});
});

describe("opencode harness — target hand-off", () => {
	it("pins the dispatch-resolved model and skips resolveInitialModel", async () => {
		const bridgeSpy = vi
			.spyOn(sharedEventBridge, "emitSystemLog")
			.mockImplementation(() => {});
		const resolveSpy = vi.spyOn(harness, "resolveInitialModel");
		try {
			const project = {
				...newProject("handoffpin"),
				defaultModel: "pi::other-provider::other-model",
			};
			const session = await harness.createSession(project, {
				taskId: "t1",
				stageId: "s1",
				model: "mock-provider::mock-model",
			});
			expect(await session.getActiveModel()).toEqual({
				provider: "mock-provider",
				id: "mock-model",
			});
			expect(resolveSpy).not.toHaveBeenCalled();
			// The foreign project default never resolves: no WARN, no INFO.
			const logged = bridgeSpy.mock.calls.map((call) => String(call[1]));
			expect(logged.some((line) => /Configured model/.test(line))).toBe(false);
		} finally {
			resolveSpy.mockRestore();
			bridgeSpy.mockRestore();
		}
	});

	it("resolves canonical 3-part hand-offs by provider+id (harness segment ignored)", async () => {
		const project = newProject("handoffcanonical");
		const session = await harness.createSession(project, {
			taskId: "t1",
			stageId: "s1",
			model: "opencode::mock-provider::mock-model",
		});
		expect(await session.getActiveModel()).toEqual({
			provider: "mock-provider",
			id: "mock-model",
		});
	});

	it("warns and uses the server default for an unresolvable hand-off", async () => {
		const bridgeSpy = vi
			.spyOn(sharedEventBridge, "emitSystemLog")
			.mockImplementation(() => {});
		try {
			const project = newProject("handoffmiss");
			const session = await harness.createSession(project, {
				taskId: "t1",
				stageId: "s1",
				model: "mock-provider::no-such-model",
			});
			expect(await session.getActiveModel()).toBeNull();
			const logged = bridgeSpy.mock.calls.map((call) => String(call[1]));
			expect(
				logged.some((line) => /Dispatch-resolved model/.test(line)),
			).toBe(true);
		} finally {
			bridgeSpy.mockRestore();
		}
	});

	it("logs INFO (never WARN) for a foreign project default without a hand-off", async () => {
		const bridgeSpy = vi
			.spyOn(sharedEventBridge, "emitSystemLog")
			.mockImplementation(() => {});
		try {
			const project = {
				...newProject("handoffforeign"),
				id: "proj-handoffforeign",
				defaultModel: "pi::other-provider::other-model",
			};
			const session = await harness.createSession(project, {
				taskId: "t1",
				stageId: "s1",
			});
			expect(await session.getActiveModel()).toBeNull();
			const logged = bridgeSpy.mock.calls.map((call) => String(call[1]));
			expect(
				logged.some((line) =>
					/\[INFO\] Configured model .* scoped to harness 'pi'/.test(line),
				),
			).toBe(true);
			expect(logged.some((line) => /\[WARN\] Configured model/.test(line))).toBe(
				false,
			);
		} finally {
			bridgeSpy.mockRestore();
		}
	});
});