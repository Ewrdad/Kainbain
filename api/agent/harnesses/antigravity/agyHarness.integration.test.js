import { describe, it, expect, afterEach, vi } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { SessionStore } from "../../../sessionStore.js";
import { createAgentRunner } from "../../../agentRunner.js";
import { createAntigravityHarness } from "./agyHarness.js";

/**
 * MARK: antigravity integration (stage dispatch through the SessionStore)
 * @description End-to-end proof of the wiring seam: a SessionStore carrying
 *   the ANTIGRAVITY harness (the way the engine registry hands it over for a
 *   project selecting `harness: "antigravity"`) drives a REAL agentRunner stage
 *   dispatch — model selection through the session contract, normalized event
 *   streaming, per-stage fresh sessions, and clean disposal. The agy binary is
 *   the deterministic fixture mock, so no CLI install and no network.
 */

const MOCK_AGY = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	"fixtures",
	"mock-agy.mjs",
);

const workspaces = [];

afterEach(() => {
	delete process.env.AGY_MOCK_ARGV_LOG;
	while (workspaces.length > 0) {
		const dir = workspaces.pop();
		try {
			fs.rmSync(dir, { recursive: true, force: true });
		} catch {
			// best-effort cleanup
		}
	}
});

describe("antigravity harness — end-to-end stage dispatch", () => {
	it("streams normalized events, completes a prompt, and disposes cleanly", async () => {
		const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "agy-e2e-"));
		workspaces.push(workspace);
		const argvLog = path.join(workspace, "argv.jsonl");
		process.env.AGY_MOCK_ARGV_LOG = argvLog;

		const harness = createAntigravityHarness({ agyBin: MOCK_AGY });
		const store = new SessionStore({ harness });
		const project = { id: "proj-agy-e2e", cwd: workspace, name: "AGY E2E" };

		try {
			const runner = createAgentRunner({
				// The engine resolves stage sessions through the store; a stage run
				// (taskId/stageId) must begin a FRESH session for that stage.
				// The dispatch target (harness + model) is forwarded like the
				// production getOrCreateSession seam (api/index.js) forwards it.
				getOrCreateSession: (projectId, meta) =>
					store.beginStageSession(project, {
						taskId: meta?.taskId,
						stageId: meta?.stageId,
						harness: meta?.harness,
						model: meta?.model,
					}),
				projectId: project.id,
			});

			const streamedChunks = [];
			const result = await runner("Plan the work", {
				projectId: project.id,
				taskId: "t-e2e",
				stage: { id: "s-implement", model: "gemini-3.1-pro-high" },
				onChunk: (chunk) => streamedChunks.push(chunk),
			});

			// The stage completed on the pinned model with real streamed output.
			expect(result.failed).toBe(false);
			expect(result.output).toContain("Plan the work");
			expect(streamedChunks.length).toBeGreaterThan(0);
			// The grouped log entries carry the assistant block (normalized events
			// flowed through the engine's log streamer).
			const kinds = result.logEntries.map((entry) => entry.kind);
			expect(kinds).toContain("assistant");

			// The stage model selection reached the CLI: the spawned argv pinned
			// --model (the catalog resolved it via the mocked `agy models`).
			// eslint-disable-next-line security/detect-non-literal-fs-filename -- argv log lives in the test's throwaway tmp workspace
			const spawnLines = fs.readFileSync(argvLog, "utf8").trim().split("\n");
			const promptArgvs = spawnLines
				.map((line) => JSON.parse(line))
				.filter((argv) => argv.includes("-p"));
			expect(promptArgvs).toHaveLength(1);
			const spawnArgv = promptArgvs[0];
			expect(spawnArgv).toContain("--model");
			expect(spawnArgv[spawnArgv.indexOf("--model") + 1]).toBe("gemini-3.1-pro-high");
			expect(spawnArgv).not.toContain("--sandbox");
			expect(spawnArgv).toContain("--dangerously-skip-permissions");

			// The store's session registry holds the live session and disposes it.
			expect(store.get(project.id, "t-e2e")).toBeTruthy();
			await store.dispose(project.id);
			expect(store.get(project.id)).toBeUndefined();
		} finally {
			delete process.env.AGY_MOCK_ARGV_LOG;
		}
	}, 20000);

	it("starts a fresh agy process per stage (conversation ids never leak across stages)", async () => {
		const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "agy-fresh-"));
		workspaces.push(workspace);

		const harness = createAntigravityHarness({ agyBin: MOCK_AGY });
		const store = new SessionStore({ harness });
		const project = { id: "proj-agy-fresh", cwd: workspace };

		const first = await store.beginStageSession(project, { taskId: "t1", stageId: "s1" });
		await first.prompt("Stage one");
		const second = await store.beginStageSession(project, { taskId: "t1", stageId: "s2" });

		// A fresh session per stage: new instance, empty conversation, no
		// inherited conversation id (the first run's id must not be reused).
		expect(second).not.toBe(first);
		expect(second.getMessages()).toHaveLength(0);
		expect(second.getLastAssistantText()).toBe("");
		await second.prompt("Only sees its own prompt");
		expect(second.getMessages().some((message) => message.content.includes("own prompt"))).toBe(true);
		await store.dispose(project.id);
	}, 20000);
});

describe("antigravity harness — discovery failure surfacing", () => {
	it("routes discovery failures to the event bridge (the catalog log is wired)", async () => {
		const emitSystemLog = vi.fn();
		const harness = createAntigravityHarness({
			agyBin: "/definitely/not/a/real/agy-binary",
			eventBridge: { emitSystemLog },
		});
		await expect(harness.listModels()).resolves.toEqual([]);
		expect(emitSystemLog).toHaveBeenCalled();
		const logged = emitSystemLog.mock.calls.map((call) => String(call[1]));
		expect(logged.some((line) => /antigravity model discovery failed/.test(line))).toBe(true);
		expect(logged.some((line) => /AGY_BIN_MISSING/.test(line))).toBe(true);
	});

	it("reports discovery health behind getModelDiscoveryStatus (harness + session)", async () => {
		const failing = createAntigravityHarness({
			agyBin: "/definitely/not/a/real/agy-binary",
		});
		await failing.listModels();
		expect(failing.getModelDiscoveryStatus()).toEqual({
			ok: false,
			error: expect.objectContaining({ code: "AGY_BIN_MISSING" }),
		});

		const healthy = createAntigravityHarness({ agyBin: MOCK_AGY });
		await healthy.listModels();
		expect(healthy.getModelDiscoveryStatus()).toEqual({ ok: true });

		const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "agy-status-"));
		workspaces.push(workspace);
		const session = await failing.createSession(
			{ id: "proj-agy-status", cwd: workspace },
			{ taskId: "t1", stageId: "s1" },
		);
		expect(await session.getModelDiscoveryStatus()).toEqual({
			ok: false,
			error: expect.objectContaining({ code: "AGY_BIN_MISSING" }),
		});
		await session.dispose();
	}, 20000);

	it("re-runs discovery past the TTL cache on { refresh: true }", async () => {
		// Regression: the harness ignored the `{ refresh }` opts that
		// `listPublicModels` passes, so the UI Refresh actions re-served the
		// stale TTL snapshot instead of re-checking the CLI.
		const previousMode = process.env.AGY_MOCK_MODELS_MODE;
		try {
			delete process.env.AGY_MOCK_MODELS_MODE;
			const harness = createAntigravityHarness({ agyBin: MOCK_AGY });
			expect(await harness.listModels()).toHaveLength(3);

			// The CLI breaks after the snapshot was cached: a plain listing
			// keeps serving the TTL snapshot (documented cache semantics).
			process.env.AGY_MOCK_MODELS_MODE = "error";
			expect(await harness.listModels()).toHaveLength(3);
			expect(harness.getModelDiscoveryStatus()).toEqual({ ok: true });

			// A refresh drops the cache and re-runs `agy models`: the
			// failure surfaces as an empty list + retained discovery error.
			await expect(harness.listModels({ refresh: true })).resolves.toEqual(
				[],
			);
			expect(harness.getModelDiscoveryStatus()).toEqual({
				ok: false,
				error: expect.objectContaining({ code: "AGY_MODELS_FAILED" }),
			});
		} finally {
			if (previousMode === undefined) {
				delete process.env.AGY_MOCK_MODELS_MODE;
			} else {
				process.env.AGY_MOCK_MODELS_MODE = previousMode;
			}
		}
	}, 20000);

	it("forwards listModels opts from the session so a session refresh re-discovers", async () => {
		const previousMode = process.env.AGY_MOCK_MODELS_MODE;
		const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "agy-refresh-"));
		workspaces.push(workspace);
		try {
			delete process.env.AGY_MOCK_MODELS_MODE;
			const harness = createAntigravityHarness({ agyBin: MOCK_AGY });
			const session = await harness.createSession(
				{ id: "proj-agy-refresh", cwd: workspace },
				{ taskId: "t1", stageId: "s1" },
			);
			try {
				expect(await session.listModels()).toHaveLength(3);
				process.env.AGY_MOCK_MODELS_MODE = "error";
				await expect(session.listModels({ refresh: true })).resolves.toEqual(
					[],
				);
				expect(await session.getModelDiscoveryStatus()).toEqual({
					ok: false,
					error: expect.objectContaining({ code: "AGY_MODELS_FAILED" }),
				});
			} finally {
				await session.dispose();
			}
		} finally {
			if (previousMode === undefined) {
				delete process.env.AGY_MOCK_MODELS_MODE;
			} else {
				process.env.AGY_MOCK_MODELS_MODE = previousMode;
			}
		}
	}, 20000);

	it("names the discovery failure when the project default model cannot resolve", async () => {
		const emitSystemLog = vi.fn();
		const harness = createAntigravityHarness({
			agyBin: "/definitely/not/a/real/agy-binary",
			eventBridge: { emitSystemLog },
		});
		const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "agy-default-"));
		workspaces.push(workspace);
		const resolved = await harness.resolveInitialModel({
			id: "proj-agy-default",
			cwd: workspace,
			name: "AGY Default",
			defaultModel: "antigravity::antigravity::gemini-3.1-pro-high",
		});
		expect(resolved).toBeNull();
		const logged = emitSystemLog.mock.calls.map((call) => String(call[1]));
		expect(
			logged.some((line) => /could not be resolved.*AGY_BIN_MISSING/s.test(line)),
		).toBe(true);
	});
});