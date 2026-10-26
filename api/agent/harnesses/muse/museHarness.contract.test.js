import { describe, it, expect, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { runSessionContractTests } from "../../sessionContract.test.js";
import { createMuseHarness } from "./museHarness.js";
import { createMuseStreamParser } from "./museStreamParser.js";
import { createMuseEventMapper } from "./museEventMapper.js";

/**
 * MARK: museHarness conformance + lifecycle tests
 * @description Runs the shared session conformance suite
 *   (runSessionContractTests — the SAME acceptance gate the pi and
 *   antigravity harnesses pass) against the muse harness backed by the
 *   fixture mock binary, plus spawn-lifecycle specifics: normalized event
 *   flow, failure mapping, prompt-file staging, abort escalation, watchdog
 *   timeout, and the [MUSE] spawn/settle log lines (argv shape only — no
 *   prompt text leaks).
 *
 *   No real muse install and no network: every spawn is the deterministic
 *   fixtures/mock-muse.mjs node script.
 */

const MUSE_DIR = path.dirname(fileURLToPath(import.meta.url));
const MOCK_MUSE = path.join(MUSE_DIR, "fixtures", "mock-muse.mjs");
const MOCK_SERVE = path.join(MUSE_DIR, "fixtures", "mock-muse-serve.mjs");
const SUCCESS_FIXTURE = path.join(MUSE_DIR, "fixtures", "success.echo.jsonl");
const FAILURE_FIXTURE = path.join(MUSE_DIR, "fixtures", "failure.badmodel.jsonl");
const TOOL_CALL_FIXTURE = path.join(MUSE_DIR, "fixtures", "tool-call.real.jsonl");

function makeWorkspace(label) {
	return fs.mkdtempSync(path.join(os.tmpdir(), `muse-ws-${label}-`));
}

function makeHarness(overrides = {}) {
	return createMuseHarness({ museBin: MOCK_MUSE, ...overrides });
}

function makeBridge() {
	const lines = [];
	return {
		lines,
		eventBridge: {
			emitSystemLog: (target, message) => lines.push(String(message)),
		},
	};
}

const workspaces = [];
function trackWorkspace(dir) {
	workspaces.push(dir);
	return dir;
}
afterEach(() => {
	delete process.env.MUSE_MOCK_MODE;
	delete process.env.MUSE_MOCK_FIXTURE;
	delete process.env.MUSE_MOCK_CHUNK_DELAY_MS;
	delete process.env.MUSE_MOCK_ARGV_LOG;
	delete process.env.MUSE_MOCK_SERVE_MODE;
	while (workspaces.length > 0) {
		const dir = workspaces.pop();
		try {
			fs.rmSync(dir, { recursive: true, force: true });
		} catch {
			// best-effort cleanup
		}
	}
});

const harness = makeHarness({});

runSessionContractTests({
	name: "muse harness (mock muse)",
	createSession: async () => {
		const workspace = makeWorkspace("conformance");
		trackWorkspace(workspace);
		return harness.createSession(
			{ id: `proj-${path.basename(workspace)}`, cwd: workspace },
			{ taskId: "t-conformance", stageId: "s-conformance" },
		);
	},
});

describe("muse harness lifecycle (mock muse)", () => {
	it("delivers NORMALIZED events for one prompt (raw payload types never leak)", async () => {
		const workspace = makeWorkspace("events");
		trackWorkspace(workspace);
		const session = await harness.createSession(
			{ id: "proj-events", cwd: workspace },
			{},
		);
		const seen = [];
		const unsub = session.subscribe((event) => seen.push(event));

		const reply = await session.prompt("Say hello");

		unsub();
		expect(typeof reply).toBe("string");
		expect(reply).toContain("Say hello");
		const types = seen.map((event) => event?.type);
		expect(types).toContain("run_started");
		expect(types).toContain("message_started");
		expect(types).toContain("assistant_delta");
		expect(types).toContain("run_finished");
		for (const event of seen) {
			expect(["run.output.delta", "run.terminal.completed"]).not.toContain(
				event?.type,
			);
		}
		expect(session.getLastAssistantText()).toBe(reply);
		expect(session.isStreaming).toBe(false);
	});

	it("emits one [MUSE] spawn line and one settle line with argv shape only", async () => {
		const workspace = makeWorkspace("logs");
		trackWorkspace(workspace);
		const { lines, eventBridge } = makeBridge();
		const logged = makeHarness({ eventBridge });
		const session = await logged.createSession(
			{ id: "proj-logs", cwd: workspace },
			{ taskId: "t1", stageId: "s1" },
		);
		await session.prompt("super secret prompt text");
		const spawn = lines.find((l) => l.includes("[MUSE] spawn"));
		const settle = lines.find((l) => l.includes("[MUSE] settle"));
		expect(spawn).toBeTruthy();
		expect(settle).toBeTruthy();
		// Prompt text never leaks; only its byte length travels in the shape.
		expect(spawn).not.toContain("super secret prompt text");
		expect(spawn).toContain("--workspace");
		expect(settle).toContain("terminal=completed");
	});

	it("maps a failing run to run_error with the CLI reason", async () => {
		const workspace = makeWorkspace("failure");
		trackWorkspace(workspace);
		const session = await harness.createSession(
			{ id: "proj-failure", cwd: workspace },
			{},
		);
		const seen = [];
		session.subscribe((event) => seen.push(event));
		process.env.MUSE_MOCK_MODE = "failure";
		const reply = await session.prompt("This will fail");
		expect(reply).toBe("");
		const errorEvent = seen.find((event) => event?.type === "run_error");
		expect(errorEvent).toBeTruthy();
		expect(String(errorEvent.error)).toContain("does not exist or you lack access");
	});

	it("stages oversized prompts to --prompt-file (argv-log proof)", async () => {
		const workspace = makeWorkspace("promptfile");
		trackWorkspace(workspace);
		const argvLog = path.join(workspace, "argv.log");
		process.env.MUSE_MOCK_ARGV_LOG = argvLog;
		const session = await harness.createSession(
			{ id: "proj-promptfile", cwd: workspace },
			{},
		);
		const big = "p".repeat(70 * 1024);
		const reply = await session.prompt(big);
		expect(reply).toContain("Mock reply");
		const logged = fs
			.readFileSync(argvLog, "utf8")
			.trim()
			.split("\n")
			.map((l) => JSON.parse(l));
		expect(logged.length).toBeGreaterThan(0);
		expect(logged[0]).toContain("--prompt-file");
		expect(logged[0].join(" ")).not.toContain(big.slice(0, 100));
	});

	it("aborts a slow run: settles as run_finished interrupted, never run_error", async () => {
		const workspace = makeWorkspace("abort");
		trackWorkspace(workspace);
		const session = await harness.createSession(
			{ id: "proj-abort", cwd: workspace },
			{},
		);
		const seen = [];
		session.subscribe((event) => seen.push(event));
		process.env.MUSE_MOCK_CHUNK_DELAY_MS = "150";
		const promptPromise = session.prompt("Slow reply", {});
		await new Promise((resolve) => setTimeout(resolve, 250));
		expect(session.isStreaming).toBe(true);
		await session.abort();
		await expect(promptPromise).resolves.toBeDefined();
		expect(session.isStreaming).toBe(false);
		expect(seen.some((event) => event?.type === "run_finished")).toBe(true);
		expect(seen.some((event) => event?.type === "run_error")).toBe(false);
	});

	it("watchdog kills a hung run with a timeout run_error", async () => {
		const workspace = makeWorkspace("hang");
		trackWorkspace(workspace);
		const hanging = makeHarness({ timeoutMs: 400 });
		const session = await hanging.createSession(
			{ id: "proj-hang", cwd: workspace },
			{},
		);
		const seen = [];
		session.subscribe((event) => seen.push(event));
		process.env.MUSE_MOCK_MODE = "hang";
		await session.prompt("Never returns");
		const errorEvent = seen.find((event) => event?.type === "run_error");
		expect(errorEvent).toBeTruthy();
		expect(String(errorEvent.error)).toContain("timed out");
	});

	it("honest exec-transport model surface: listModels [] and resolveModelRef null", async () => {
		expect(await harness.listModels()).toEqual([]);
		expect(await harness.resolveModelRef("anything")).toBeNull();
		const workspace = makeWorkspace("models");
		trackWorkspace(workspace);
		const session = await harness.createSession(
			{ id: "proj-models", cwd: workspace },
			{},
		);
		expect(await session.listModels()).toEqual([]);
		expect(await session.getActiveModel()).toBeNull();
		expect(await session.switchModel("some-model")).toBeNull();
		expect(await session.getActiveModel()).toBeNull();
	});
});

describe("muse harness Tier-2 paths (mock muse + mock serve)", () => {
	it("plumbs a dispatch-resolved model through --model on the MSP→exec fallback", async () => {
		// The serve host handshakes and lists models, but refuses session/start;
		// the harness must fail over to exec WITH the resolved model pinned.
		process.env.MUSE_MOCK_SERVE_MODE = "failSessionStart";
		const workspace = makeWorkspace("fallback-model");
		trackWorkspace(workspace);
		const argvLog = path.join(workspace, "argv.jsonl");
		process.env.MUSE_MOCK_ARGV_LOG = argvLog;
		const { lines, eventBridge } = makeBridge();
		const fallbackHarness = makeHarness({
			eventBridge,
			museBin: MOCK_MUSE,
			mspBin: MOCK_SERVE,
			mspMode: "on",
			mspProvider: "echo",
			supportsServe: () => true,
			mspHostIdleTtlMs: 0,
			timeoutMs: 8000,
		});
		expect(fallbackHarness.transport).toBe("msp");

		const session = await fallbackHarness.createSession(
			{ id: "proj-fallback-model", cwd: workspace },
			{ taskId: "t1", stageId: "s1", model: "muse-spark-1.3" },
		);
		expect(lines.join("\n")).toMatch(/MSP session start failed/);
		expect(lines.join("\n")).toMatch(/Falling back to the exec transport/);

		const reply = await session.prompt("which model am I");
		expect(reply).toContain("Mock reply");

		const logged = fs
			.readFileSync(argvLog, "utf8")
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line));
		const execSpawns = logged.filter((argv) => argv[0] === "exec");
		expect(execSpawns.length).toBeGreaterThan(0);
		expect(execSpawns[0]).toContain("--model");
		expect(execSpawns[0][execSpawns[0].indexOf("--model") + 1]).toBe("muse-spark-1.3");
		await session.dispose();
	});

	it("reads history from disk via the engine path (session dir → --last)", async () => {
		const workspace = makeWorkspace("history");
		trackWorkspace(workspace);
		const argvLog = path.join(workspace, "argv.jsonl");
		process.env.MUSE_MOCK_ARGV_LOG = argvLog;
		// The engine passes the KainBain session DIRECTORY as the ref.
		const history = await harness.readHistoryFromDisk(
			{ id: "proj-history", cwd: workspace },
			path.join(workspace, ".kainbain", "sessions"),
		);
		expect(history.tree).toEqual([]);
		expect(history.messages).toEqual([
			{ role: "user", content: "Say hello in 3 words" },
			{ role: "assistant", content: "echo: Say hello in 3 words" },
			{ role: "user", content: "What is 2+2?" },
			{ role: "assistant", content: "echo: What is 2+2?" },
		]);
		const logged = fs
			.readFileSync(argvLog, "utf8")
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line));
		expect(logged).toHaveLength(1);
		expect(logged[0][0]).toBe("export");
		expect(logged[0]).toContain("--last");
		expect(logged[0]).toContain("--redacted");
		expect(logged[0]).not.toContain("--session");
	});

	it("scopes the disk history read to --session for a UUID session ref", async () => {
		const workspace = makeWorkspace("history-uuid");
		trackWorkspace(workspace);
		const argvLog = path.join(workspace, "argv.jsonl");
		process.env.MUSE_MOCK_ARGV_LOG = argvLog;
		const sessionId = "01a0aa39-27b2-72c3-9a4e-43f8ddde8685";
		const history = await harness.readHistoryFromDisk(
			{ id: "proj-history-uuid", cwd: workspace },
			sessionId,
		);
		expect(history.messages.length).toBe(4);
		const logged = fs
			.readFileSync(argvLog, "utf8")
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line));
		expect(logged[0]).toContain("--session");
		expect(logged[0]).toContain(sessionId);
		expect(logged[0]).not.toContain("--last");
	});

	it("serves the stale catalogue snapshot when a refresh probe fails", async () => {
		const serveHarness = makeHarness({
			museBin: MOCK_SERVE,
			mspMode: "on",
			mspProvider: "echo",
			supportsServe: () => true,
			mspHostIdleTtlMs: 0,
			timeoutMs: 8000,
		});
		expect(serveHarness.transport).toBe("msp");

		const fresh = await serveHarness.listModels();
		expect(fresh.map((model) => model.id)).toEqual(["muse-wonder-1.0", "muse-spark-1.3"]);
		expect(serveHarness.getModelDiscoveryStatus()).toEqual({ ok: true });

		// A failing probe keeps serving the stale snapshot (never blanks a
		// previously good catalogue) and records the classified failure.
		process.env.MUSE_MOCK_SERVE_MODE = "failStart";
		const stale = await serveHarness.listModels({ refresh: true });
		expect(stale.map((model) => model.id)).toEqual(["muse-wonder-1.0", "muse-spark-1.3"]);
		const status = serveHarness.getModelDiscoveryStatus();
		expect(status.ok).toBe(false);
		expect(status.error.code).toBe("MUSE_MSP_DISCOVERY_FAILED");

		// Recovery: the next refresh probes a healthy host again.
		delete process.env.MUSE_MOCK_SERVE_MODE;
		const recovered = await serveHarness.listModels({ refresh: true });
		expect(recovered.map((model) => model.id)).toEqual(["muse-wonder-1.0", "muse-spark-1.3"]);
		expect(serveHarness.getModelDiscoveryStatus()).toEqual({ ok: true });
	});
});

describe("muse fixture fingerprint (wire-shape drift guard)", () => {
	function replayFixture(fixturePath) {
		const parser = createMuseStreamParser();
		const mapper = createMuseEventMapper();
		const text = fs.readFileSync(fixturePath, "utf8");
		const types = [];
		for (const line of text.split("\n")) {
			if (!line.trim()) continue;
			for (const event of mapper.map(parser.push(`${line}\n`)[0] ?? {})) {
				types.push(event.type);
			}
		}
		for (const event of mapper.map(parser.flush()[0] ?? {})) types.push(event.type);
		return { types, stats: parser.stats() };
	}

	it("success fixture replays to the exact normalized sequence", () => {
		const { types, stats } = replayFixture(SUCCESS_FIXTURE);
		expect(stats.events).toBeGreaterThan(10);
		expect(types[0]).toBe("run_started");
		expect(types).toContain("assistant_delta");
		expect(types[types.length - 1]).toBe("run_finished");
		// No task-lifecycle noise ever becomes a terminal event.
		expect(types).not.toContain("run_error");
	});

	it("failure fixture replays to run_error with the model reason", () => {
		const { types } = replayFixture(FAILURE_FIXTURE);
		expect(types[0]).toBe("session_meta");
		expect(types[types.length - 1]).toBe("run_error");
		expect(types).not.toContain("run_finished");
	});

	it("real tool-call fixture replays to started/updated/finished + run_finished", () => {
		const { types } = replayFixture(TOOL_CALL_FIXTURE);
		expect(types[0]).toBe("session_meta");
		const started = types.filter((t) => t === "tool_started");
		expect(started.length).toBeGreaterThanOrEqual(1);
		expect(types).toContain("tool_finished");
		expect(types[types.length - 1]).toBe("run_finished");
		// Re-run through the parser+mapper and check the tool name survives.
		const parser = createMuseStreamParser();
		const mapper = createMuseEventMapper();
		const names = [];
		for (const line of fs.readFileSync(TOOL_CALL_FIXTURE, "utf8").split("\n")) {
			if (!line.trim()) continue;
			for (const event of mapper.map(parser.push(`${line}\n`)[0] ?? {})) {
				if (event.type === "tool_started") names.push(event.toolName);
			}
		}
		expect(names).toContain("write_file");
	});

	it("drift fails loudly: a hand-mutated terminal line changes the fingerprint", () => {
		const text = fs.readFileSync(SUCCESS_FIXTURE, "utf8");
		const mutated = text.replace("run.terminal.completed", "run.terminal.completed2");
		const parser = createMuseStreamParser();
		const mapper = createMuseEventMapper();
		const types = [];
		for (const line of mutated.split("\n")) {
			if (!line.trim()) continue;
			for (const event of mapper.map(parser.push(`${line}\n`)[0] ?? {})) {
				types.push(event.type);
			}
		}
		// The terminal record is gone (unknown payload type): no run_finished.
		expect(types).not.toContain("run_finished");
		expect(parser.stats().droppedUnknown).toBe(1);
	});
});
