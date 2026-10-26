import { describe, it, expect, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { runSessionContractTests } from "../../../sessionContract.test.js";
import { createMuseHarness } from "../museHarness.js";

/**
 * MARK: muse MSP contract tests
 * @description Hermetic Tier-2 conformance for the `muse serve` MSP transport:
 *   the SAME shared session-contract suite the pi/antigravity/mock harnesses
 *   pass, plus the MSP-specific spine (handshake → model/list → session/start
 *   → turn/start → item/* → turn/completed), live steering, interrupt-based
 *   abort, per-request permission interception, live model switching, and
 *   host-crash → session/resume reconnect.
 *
 *   No real muse install and no network: every host is the deterministic
 *   `fixtures/mock-muse-serve.mjs` node script (echo provider semantics).
 */

const MUSE_DIR = path.dirname(fileURLToPath(import.meta.url));
const MOCK_SERVE = path.join(MUSE_DIR, "..", "fixtures", "mock-muse-serve.mjs");

const workspaces = [];
const storeFiles = [];

function makeWorkspace(label) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), `muse-msp-${label}-`));
	workspaces.push(dir);
	return dir;
}

function makeHarness(overrides = {}) {
	return createMuseHarness({
		museBin: MOCK_SERVE,
		mspMode: "on",
		mspProvider: "echo",
		mspHostIdleTtlMs: 0,
		supportsServe: () => true,
		timeoutMs: 8000,
		...overrides,
	});
}

function makeBridge() {
	const lines = [];
	return {
		lines,
		eventBridge: { emitSystemLog: (target, message) => lines.push(String(message)) },
	};
}

function newStorePath() {
	const file = path.join(
		fs.mkdtempSync(path.join(os.tmpdir(), "muse-msp-store-")),
		"sessions.json",
	);
	storeFiles.push(file);
	return file;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => {
	delete process.env.MUSE_MOCK_SERVE_MODE;
	delete process.env.MUSE_MOCK_SERVE_DELAY_MS;
	delete process.env.MUSE_MOCK_APPROVAL;
	delete process.env.MUSE_MOCK_USER_INPUT;
	delete process.env.MUSE_MOCK_SESSION_STORE;
	delete process.env.MUSE_MOCK_NO_WINDOW;
	while (workspaces.length > 0) {
		const dir = workspaces.pop();
		try {
			fs.rmSync(dir, { recursive: true, force: true });
		} catch {
			// best-effort cleanup
		}
	}
	while (storeFiles.length > 0) {
		const file = storeFiles.pop();
		try {
			fs.rmSync(path.dirname(file), { recursive: true, force: true });
		} catch {
			// best-effort cleanup
		}
	}
});

runSessionContractTests({
	name: "muse harness over MSP (mock serve)",
	createSession: async () => {
		const harness = makeHarness();
		const workspace = makeWorkspace("conformance");
		return harness.createSession(
			{ id: `proj-${path.basename(workspace)}`, cwd: workspace },
			{ taskId: "t-conformance", stageId: "s-conformance" },
		);
	},
});

describe("muse MSP lifecycle (mock serve)", () => {
	it("runs the full handshake → session → turn spine and streams normalized events", async () => {
		const { lines, eventBridge } = makeBridge();
		const harness = makeHarness({ eventBridge });
		const workspace = makeWorkspace("spine");
		const session = await harness.createSession({ id: "proj-spine", cwd: workspace }, {});

		const models = await harness.listModels();
		expect(models.length).toBeGreaterThan(0);
		expect(models[0]).toMatchObject({ provider: "meta", id: "muse-wonder-1.0" });
		expect(models[0].key).toContain("muse");

		const seen = [];
		const unsub = session.subscribe((event) => seen.push(event));
		const reply = await session.prompt("Say hello");
		unsub();

		expect(reply).toContain("echo: Say hello");
		const types = seen.map((event) => event.type);
		expect(types).toContain("run_started");
		expect(types).toContain("message_started");
		expect(types).toContain("assistant_delta");
		expect(types).toContain("run_finished");
		for (const event of seen) {
			expect(event.type).not.toMatch(/turn\/|item\//);
		}
		const usage = await session.getContextUsage();
		expect(usage).toMatchObject({ current: 6, limit: 1000 });
		expect(session.transport).toBe("msp");
		expect(lines.join("\n")).toMatch(/\[MUSE MSP\]/);
		expect(lines.join("\n")).not.toContain("Say hello"); // no prompt text in logs
		await session.dispose();
	});

	it("steers a RUNNING turn with the acknowledged turn id", async () => {
		process.env.MUSE_MOCK_SERVE_DELAY_MS = "40";
		const harness = makeHarness();
		const workspace = makeWorkspace("steer");
		const session = await harness.createSession({ id: "proj-steer", cwd: workspace }, {});

		const running = session.prompt("start the turn");
		let outcome = { status: "no_active_turn" };
		for (let i = 0; i < 50 && outcome.status === "no_active_turn"; i += 1) {
			await sleep(20);
			outcome = await session.steer("focus on the API layer");
		}
		expect(outcome.status).toBe("steered");
		await running;
		await session.dispose();
	});

	it("interrupts a running turn via turn/interrupt and settles as interrupted", async () => {
		process.env.MUSE_MOCK_SERVE_DELAY_MS = "40";
		const harness = makeHarness();
		const workspace = makeWorkspace("abort");
		const session = await harness.createSession({ id: "proj-abort", cwd: workspace }, {});

		const seen = [];
		session.subscribe((event) => seen.push(event));
		const running = session.prompt("long turn");
		await sleep(60);
		await session.abort();
		await running;
		expect(seen.some((event) => event.type === "run_finished" && event.interrupted)).toBe(true);
		await session.dispose();
	});

	it("intercepts approval/request and answers it via approval/decide", async () => {
		process.env.MUSE_MOCK_APPROVAL = "1";
		const { lines, eventBridge } = makeBridge();
		const harness = makeHarness({ eventBridge, yolo: true });
		const workspace = makeWorkspace("approval");
		const session = await harness.createSession({ id: "proj-approval", cwd: workspace }, {});

		const reply = await session.prompt("run a tool");
		expect(reply).toContain("echo: run a tool");
		expect(lines.join("\n")).toMatch(/approval shell/);
		expect(lines.join("\n")).toMatch(/allow-once|policy/);
		await session.dispose();
	});

	it("switches the session model through the live catalogue", async () => {
		const harness = makeHarness();
		const workspace = makeWorkspace("model");
		const session = await harness.createSession({ id: "proj-model", cwd: workspace }, {});

		const switched = await session.switchModel("muse-spark-1.3");
		expect(switched).toMatchObject({ id: "muse-spark-1.3" });
		expect(await session.resolveModelRef("muse-spark-1.3")).toMatchObject({
			id: "muse-spark-1.3",
		});
		await session.dispose();
	});

	it("recovers from a host crash and resumes the session on the next turn", async () => {
		const store = newStorePath();
		process.env.MUSE_MOCK_SESSION_STORE = store;
		process.env.MUSE_MOCK_SERVE_MODE = "crashAfterAck";
		const harness = makeHarness();
		const workspace = makeWorkspace("crash");

		// The host dies mid-turn: the turn must FAIL LOUDLY, never hang.
		const session = await harness.createSession({ id: "proj-crash", cwd: workspace }, {});
		await expect(session.prompt("first turn")).rejects.toThrow(/muse serve host exited/);
		expect(session.getMspSessionId()).toBeTruthy();

		// A fresh host comes up and `session/resume` continues the session.
		delete process.env.MUSE_MOCK_SERVE_MODE;
		const reply = await session.prompt("second turn");
		expect(reply).toContain("echo: second turn");
		await session.dispose();
	});

	it("falls back to the exec transport when the MSP host cannot start", async () => {
		process.env.MUSE_MOCK_SERVE_MODE = "failStart";
		const { lines, eventBridge } = makeBridge();
		const harness = makeHarness({ eventBridge });
		const workspace = makeWorkspace("fallback");
		const session = await harness.createSession({ id: "proj-fallback", cwd: workspace }, {});
		// The exec path is the rollback: the session is a working muse session.
		expect(typeof session.prompt).toBe("function");
		expect(lines.join("\n")).toMatch(/MSP session start failed/);
		expect(lines.join("\n")).toMatch(/KAINBAIN_MUSE_MSP=off/);
		await session.dispose();
	});

	it("keeps the exec transport when the binary does not advertise serve", async () => {
		const harness = createMuseHarness({
			museBin: MOCK_SERVE,
			mspMode: "auto",
			supportsServe: () => false,
			timeoutMs: 8000,
		});
		expect(harness.transport).toBe("exec");
		expect(harness.modelSelection).toBe("none");
		expect(await harness.listModels()).toEqual([]);
	});
});

describe("muse MSP multiplexing + failure modes (mock serve)", () => {
	it("carries TWO sessions on ONE shared host without cross-talk", async () => {
		const harness = makeHarness();
		const workspace = makeWorkspace("mux");
		const project = { id: "proj-mux", cwd: workspace };
		const sessionA = await harness.createSession(project, { taskId: "t", stageId: "sa" });
		const sessionB = await harness.createSession(project, { taskId: "t", stageId: "sb" });

		// Distinct MSP sessions, one pooled host.
		expect(sessionA.getMspSessionId()).toBeTruthy();
		expect(sessionB.getMspSessionId()).toBeTruthy();
		expect(sessionA.getMspSessionId()).not.toBe(sessionB.getMspSessionId());
		expect(harness.hostPool.size()).toBe(1);

		const seenA = [];
		const seenB = [];
		sessionA.subscribe((event) => seenA.push(event));
		sessionB.subscribe((event) => seenB.push(event));

		const [replyA, replyB] = await Promise.all([
			sessionA.prompt("turn for A"),
			sessionB.prompt("turn for B"),
		]);
		expect(replyA).toContain("echo: turn for A");
		expect(replyB).toContain("echo: turn for B");
		expect(replyA).not.toContain("turn for B");
		expect(replyB).not.toContain("turn for A");
		// Each session saw exactly its own run lifecycle.
		expect(seenA.filter((event) => event.type === "run_finished")).toHaveLength(1);
		expect(seenB.filter((event) => event.type === "run_finished")).toHaveLength(1);
		expect(seenA.some((event) => event.type === "run_error")).toBe(false);
		expect(seenB.some((event) => event.type === "run_error")).toBe(false);

		await sessionA.dispose();
		await sessionB.dispose();
	});

	it("forwards every assistant delta to onChunk live (never one end-of-turn call)", async () => {
		const harness = makeHarness();
		const workspace = makeWorkspace("chunks");
		const session = await harness.createSession({ id: "proj-chunks", cwd: workspace }, {});

		const chunks = [];
		let streamingWhenLastChunkArrived = null;
		const reply = await session.prompt("chunk me", {
			onChunk: (delta) => {
				chunks.push(delta);
				streamingWhenLastChunkArrived = session.isStreaming;
			},
		});
		// The mock streams the reply as three item/delta rows.
		expect(chunks).toHaveLength(3);
		expect(chunks.join("")).toBe("echo: chunk me");
		expect(chunks.join("")).toBe(reply);
		// The last chunk arrived while the turn was still streaming.
		expect(streamingWhenLastChunkArrived).toBe(true);
		await session.dispose();
	});

	it("force-settles a wedged turn: run_error, rejection, and host eviction", async () => {
		process.env.MUSE_MOCK_SERVE_MODE = "wedge";
		const harness = makeHarness({ timeoutMs: 150, mspTurnSettleGraceMs: 150 });
		const workspace = makeWorkspace("wedge");
		const session = await harness.createSession({ id: "proj-wedge", cwd: workspace }, {});

		const seen = [];
		session.subscribe((event) => seen.push(event));
		await expect(session.prompt("never completes")).rejects.toThrow(
			/did not settle within 150ms of the watchdog interrupt/,
		);
		const errorEvent = seen.find((event) => event.type === "run_error");
		expect(errorEvent).toBeTruthy();
		expect(String(errorEvent.error)).toMatch(/did not settle/);
		// The wedged host was evicted from the pool (the next turn must not
		// inherit it) — and the next turn fails LOUDLY instead of hanging.
		expect(harness.hostPool.size()).toBe(0);
		await expect(session.prompt("still wedged")).rejects.toThrow(/reconnect failed/);
		await session.dispose();
	});

	it("normalizes context usage to numbers when the host omits the window limit", async () => {
		process.env.MUSE_MOCK_NO_WINDOW = "1";
		const harness = makeHarness();
		const workspace = makeWorkspace("usage");
		const session = await harness.createSession({ id: "proj-usage", cwd: workspace }, {});
		await session.prompt("count my tokens");
		const usage = await session.getContextUsage();
		expect(typeof usage.current).toBe("number");
		expect(typeof usage.limit).toBe("number");
		expect(usage).toEqual({ current: 6, limit: 0 });
		await session.dispose();
	});

	it("delivers run_error AND rejects when turn/start is refused", async () => {
		process.env.MUSE_MOCK_SERVE_MODE = "rejectTurn";
		const harness = makeHarness();
		const workspace = makeWorkspace("rejectturn");
		const session = await harness.createSession({ id: "proj-rejectturn", cwd: workspace }, {});

		const seen = [];
		session.subscribe((event) => seen.push(event));
		// The rejection carries the raw host error; the run_error event carries
		// the wrapped, stage-log-friendly message.
		await expect(session.prompt("refused turn")).rejects.toThrow(/turn\/start refused/);
		const errorEvent = seen.find((event) => event.type === "run_error");
		expect(errorEvent).toBeTruthy();
		expect(String(errorEvent.error)).toMatch(/turn\/start failed: turn\/start refused/);
		await session.dispose();
	});

	it("refuses to prompt a disposed session", async () => {
		const harness = makeHarness();
		const workspace = makeWorkspace("disposed");
		const session = await harness.createSession({ id: "proj-disposed", cwd: workspace }, {});
		await session.dispose();
		await expect(session.prompt("too late")).rejects.toThrow(/disposed/);
	});
});
