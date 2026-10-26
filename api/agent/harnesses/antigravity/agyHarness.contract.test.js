import { describe, it, expect, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { runSessionContractTests } from "../../sessionContract.test.js";
import { createAntigravityHarness } from "./agyHarness.js";

/**
 * MARK: agyHarness conformance + lifecycle tests
 * @description Runs the shared session conformance suite
 *   (runSessionContractTests — the SAME acceptance gate the pi harness passes)
 *   against the antigravity harness backed by the fixture mock agy binary, plus
 *   spawn-lifecycle specifics: abort escalation, dispose idempotence, error
 *   paths (ERROR result, exit-without-result, auth failure, watchdog timeout),
 *   and the model-selection argv surface.
 *
 *   No real agy install and no network: every spawn is the deterministic
 *   fixtures/mock-agy.mjs node script.
 */

const MOCK_AGY = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	"fixtures",
	"mock-agy.mjs",
);

/***
 * MARK: makeWorkspace
 * @description Builds a workspace directory the agy child runs in (spawn
 *   requires an existing cwd) and registers it for afterEach cleanup.
 * @example const workspace = makeWorkspace("abort");
 * @param {string} label - Short label for the tmp directory name.
 * @returns {string} The workspace directory path.
 ***/
function makeWorkspace(label) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), `agy-ws-${label}-`));
	return dir;
}

/** Builds a harness pointed at the mock binary with a short watchdog for tests. */
function makeHarness(overrides = {}) {
	return createAntigravityHarness({
		agyBin: MOCK_AGY,
		printTimeout: overrides.printTimeout || "10m",
		watchdogMs: overrides.watchdogMs,
		...overrides,
	});
}

const workspaces = [];
function trackWorkspace(dir) {
	workspaces.push(dir);
	return dir;
}
afterEach(() => {
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
	name: "antigravity harness (mock agy)",
	createSession: async () => {
		const workspace = makeWorkspace("conformance");
		trackWorkspace(workspace);
		return harness.createSession(
			{ id: `proj-${path.basename(workspace)}`, cwd: workspace },
			{ taskId: "t-conformance", stageId: "s-conformance" },
		);
	},
});

describe("antigravity harness lifecycle (mock agy)", () => {
	it("delivers NORMALIZED events for one prompt (raw agy names never leak)", async () => {
		const workspace = makeWorkspace("events");
		trackWorkspace(workspace);
		const session = await harness.createSession({ id: "proj-events", cwd: workspace }, {});
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
			expect(["init", "step_update", "result"]).not.toContain(event?.type);
		}
		expect(session.getLastAssistantText()).toBe(reply);
		expect(session.isStreaming).toBe(false);
	});

	it("reconstructs the conversation (user turn + assistant reply) from the stream", async () => {
		const workspace = makeWorkspace("messages");
		trackWorkspace(workspace);
		const session = await harness.createSession({ id: "proj-messages", cwd: workspace }, {});
		await session.prompt("Check messages");
		const messages = session.getMessages();
		expect(messages).toHaveLength(2);
		expect(messages[0]).toEqual({ role: "user", content: "Check messages" });
		expect(messages[1].role).toBe("assistant");
		expect(messages[1].content).toContain("Check messages");
	});

	it("continues the agy conversation across prompts within one session", async () => {
		const workspace = makeWorkspace("continue");
		trackWorkspace(workspace);
		const session = await harness.createSession({ id: "proj-continue", cwd: workspace }, {});
		await session.prompt("First turn");
		await session.prompt("Second turn");
		// The second spawn passed --conversation; the mock echoes it in init and
		// the session keeps one conversation id across the session.
		const messages = session.getMessages();
		expect(messages.filter((message) => message.role === "user")).toHaveLength(2);
		expect(messages.filter((message) => message.role === "assistant")).toHaveLength(2);
		expect(messages[3].content).toContain("Second turn");
		// getLastAssistantText reflects the LATEST turn only.
		expect(session.getLastAssistantText()).toContain("Second turn");
	});

	it("aborts a slow run: the child exits within the grace window and no orphan remains", async () => {
	const workspace = makeWorkspace("abort");
		trackWorkspace(workspace);
		const session = await harness.createSession({ id: "proj-abort", cwd: workspace }, {});
		const seen = [];
		session.subscribe((event) => seen.push(event));

		// Slow the mock so the run is still streaming when we abort mid-flight.
		process.env.AGY_MOCK_CHUNK_DELAY_MS = "150";
		const promptPromise = session.prompt("Slow reply", {});
		// Give the child a moment to spawn, then abort mid-stream.
		await new Promise((resolve) => setTimeout(resolve, 250));
		expect(session.isStreaming).toBe(true);
		await session.abort();
		await expect(promptPromise).resolves.toBeDefined();
		expect(session.isStreaming).toBe(false);

		// The interrupted run settles as run_finished, not run_error.
		expect(seen.some((event) => event?.type === "run_finished")).toBe(true);
		expect(seen.some((event) => event?.type === "run_error")).toBe(false);
	});

	it("dispose() is idempotent and kills a live child", async () => {
		const workspace = makeWorkspace("dispose");
		trackWorkspace(workspace);
		const session = await harness.createSession({ id: "proj-dispose", cwd: workspace }, {});
		await session.prompt("Warm up");
		await session.dispose();
		await session.dispose();
		expect(session.isStreaming).toBe(false);
	});

	it("maps an ERROR result to run_error with the CLI error message", async () => {
		const workspace = makeWorkspace("error");
		trackWorkspace(workspace);
		const session = await harness.createSession({ id: "proj-error", cwd: workspace }, {});
		const seen = [];
		session.subscribe((event) => seen.push(event));

		// The mock reads the mode from its environment (AGY_* passes the child-env
		// allowlist) and exits non-zero with an ERROR result envelope.
		process.env.AGY_MOCK_MODE = "error";
		try {
			await session.prompt("This will fail");
		} finally {
			delete process.env.AGY_MOCK_MODE;
		}

		const errorEvent = seen.find((event) => event?.type === "run_error");
		expect(errorEvent).toBeTruthy();
		expect(errorEvent.error).toBe("Model quota exceeded");
	});

	it("surfaces an authentication failure verbatim from the CLI stderr", async () => {
		const workspace = makeWorkspace("auth");
		trackWorkspace(workspace);
		const session = await harness.createSession({ id: "proj-auth", cwd: workspace }, {});
		const seen = [];
		session.subscribe((event) => seen.push(event));

		process.env.AGY_MOCK_MODE = "auth";
		try {
			await session.prompt("Needs auth");
		} finally {
			delete process.env.AGY_MOCK_MODE;
		}

		const errorEvent = seen.find((event) => event?.type === "run_error");
		expect(errorEvent).toBeTruthy();
		expect(errorEvent.error).toContain("authentication required");
		// The auth-shaped stderr tail classifies as auth (never a bare crash).
		expect(errorEvent.code).toBe("AGY_AUTH_REQUIRED");
		expect(errorEvent.hint).toContain("agy auth login");
	});

	it("synthesizes run_error when the CLI crashes without a result line", async () => {
		const workspace = makeWorkspace("crash");
		trackWorkspace(workspace);
		const session = await harness.createSession({ id: "proj-crash", cwd: workspace }, {});
		const seen = [];
		session.subscribe((event) => seen.push(event));

		process.env.AGY_MOCK_MODE = "crash";
		try {
			await session.prompt("Crash me");
		} finally {
			delete process.env.AGY_MOCK_MODE;
		}

		const errorEvent = seen.find((event) => event?.type === "run_error");
		expect(errorEvent).toBeTruthy();
		expect(errorEvent.error).toMatch(/exited with code 1 without a result/);
		expect(errorEvent.error).toContain("simulated hard crash");
		expect(errorEvent.code).toBe("AGY_CRASHED");
		expect(errorEvent.hint).toBeTruthy();
	});

	afterEach(() => {
		delete process.env.AGY_MOCK_CHUNK_DELAY_MS;
	});

	it("reports EXACTLY ONE run_error when the binary cannot be spawned", async () => {
		// Node emits BOTH 'error' and 'close' for a failed spawn (close code −2
		// after ENOENT). The close handler must early-return once the run settled
		// via the error path — a second run_error would double-count the failure
		// downstream (agentRunner records sessionErrorOccurred per event).
		const missingBin = path.join(os.tmpdir(), `agy-missing-${process.pid}-${Date.now()}`);
		const failing = createAntigravityHarness({
			agyBin: missingBin,
			printTimeout: "5s",
		});
		const workspace = makeWorkspace("spawn-fail");
		trackWorkspace(workspace);
		const session = await failing.createSession({ id: "proj-spawn-fail", cwd: workspace }, {});
		const seen = [];
		session.subscribe((event) => seen.push(event));

		await expect(session.prompt("Never starts")).resolves.toBe("");

		const errors = seen.filter((event) => event?.type === "run_error");
		expect(errors).toHaveLength(1);
		expect(errors[0].error).toMatch(/Failed to start agy CLI/);
		expect(errors[0].error).toContain(missingBin);
		expect(errors[0].code).toBe("AGY_BIN_MISSING");
		expect(errors[0].hint).toContain("KAINBAIN_AGY_BIN");
		// No stray normalized events from the phantom close.
		expect(seen.some((event) => event?.type === "run_finished")).toBe(false);
		expect(session.isStreaming).toBe(false);
	});

	it("exposes session.resolveModelRef (pi-session parity) delegating to the catalog", async () => {
		const workspace = makeWorkspace("model-ref");
		trackWorkspace(workspace);
		const session = await harness.createSession({ id: "proj-model-ref", cwd: workspace }, {});
		expect(typeof session.resolveModelRef).toBe("function");

		// Bare slug and composite key resolve through the harness catalog; the
		// engine's model-selection path calls this before falling back to the
		// raw registry (which the agy session does not expose).
		const resolved = await session.resolveModelRef("gemini-3.1-pro-high");
		expect(resolved?.id).toBe("gemini-3.1-pro-high");
		const composite = await session.resolveModelRef("antigravity::gemini-3.8-flash-high");
		expect(composite?.id).toBe("gemini-3.8-flash-high");
		expect(await session.resolveModelRef("no-such-model")).toBeNull();
	});

	it("keeps multi-byte UTF-8 intact when a character splits across stdout chunks", async () => {
		// The mock writes one step_update line split mid-character (after the
		// lead byte of 'é') across two raw writes with a real delay — without a
		// StringDecoder the live delta arrived as mojibake ('h\uFFFD\uFFFDllo').
		const workspace = makeWorkspace("utf8");
		trackWorkspace(workspace);
		const session = await harness.createSession({ id: "proj-utf8", cwd: workspace }, {});
		const deltas = [];
		const seen = [];
		session.subscribe((event) => seen.push(event));

		process.env.AGY_MOCK_MODE = "utf8split";
		try {
			await session.prompt("Say it in unicode", {
				onChunk: (delta) => deltas.push(delta),
			});
		} finally {
			delete process.env.AGY_MOCK_MODE;
		}

		const text = "héllo 日本語 🚀 done";
		expect(deltas.join("")).toContain(text);
		expect(deltas.join("")).not.toContain("\uFFFD"); // no replacement chars
		expect(session.getLastAssistantText()).toContain(text);
		// The result row (mapped live or at close) carries the same intact text.
		expect(seen.filter((event) => event?.type === "assistant_delta").length).toBeGreaterThan(0);
	});

	it("enforces the engine-side watchdog when the child hangs", async () => {
		const workspace = makeWorkspace("hang");
		trackWorkspace(workspace);
		const hanging = makeHarness({ watchdogMs: 250 });
		const session = await hanging.createSession({ id: "proj-hang", cwd: workspace }, {});
		const seen = [];
		session.subscribe((event) => seen.push(event));

		process.env.AGY_MOCK_MODE = "hang";
		try {
			await session.prompt("Never answers");
		} finally {
			delete process.env.AGY_MOCK_MODE;
		}

		const errorEvent = seen.find((event) => event?.type === "run_error");
		expect(errorEvent).toBeTruthy();
		expect(errorEvent.error).toMatch(/timed out after/);
		// The timeout names the engine watchdog ceiling that tripped.
		expect(errorEvent.code).toBe("AGY_RUN_TIMEOUT");
		expect(errorEvent.error).toContain("250ms");
		expect(errorEvent.hint).toContain("KAINBAIN_AGY_PRINT_TIMEOUT");
		expect(session.isStreaming).toBe(false);
	});

	it("carries redacted prompt capture in the run_started runFacts", async () => {
		const workspace = makeWorkspace("runfacts");
		trackWorkspace(workspace);
		const session = await harness.createSession({ id: "proj-runfacts", cwd: workspace }, {});
		const seen = [];
		session.subscribe((event) => seen.push(event));

		await session.prompt("Capture this prompt");

		const started = seen.find((event) => event?.type === "run_started");
		expect(started).toBeTruthy();
		expect(started.runFacts.harness).toBe("antigravity");
		expect(started.runFacts.timeout).toBe("10m");
		expect(started.runFacts.promptChars).toBe("Capture this prompt".length);
		// SHA-256 hex of the prompt — stable, and the raw text never rides along.
		const { createHash } = await import("node:crypto");
		expect(started.runFacts.promptHash).toBe(
			createHash("sha256").update("Capture this prompt", "utf8").digest("hex"),
		);
		expect(JSON.stringify(started.runFacts)).not.toContain("Capture this prompt");
	});

	it("passes a model pin through to the spawned CLI argv", async () => {
		const workspace = makeWorkspace("model");
		trackWorkspace(workspace);
		const argvLog = path.join(workspace, "argv.jsonl");
		process.env.AGY_MOCK_ARGV_LOG = argvLog;
		const session = await harness.createSession({ id: "proj-model", cwd: workspace }, {});
		try {
			await session.switchModel("gemini-3.1-pro-high");
			await session.prompt("Pinned run");
		} finally {
			delete process.env.AGY_MOCK_ARGV_LOG;
		}

		// eslint-disable-next-line security/detect-non-literal-fs-filename -- argv log lives in the test's throwaway tmp workspace
		const spawnLines = fs.readFileSync(argvLog, "utf8").trim().split("\n");
		// The catalog's `agy models` discovery also spawns the mock; only the
		// prompt run carries the -p flag we assert against.
		const promptArgvs = spawnLines
			.map((line) => JSON.parse(line))
			.filter((argv) => argv.includes("-p"));
		expect(promptArgvs).toHaveLength(1);
		const spawnArgv = promptArgvs[0];
		expect(spawnArgv).toContain("--model");
		expect(spawnArgv[spawnArgv.indexOf("--model") + 1]).toBe("gemini-3.1-pro-high");
		expect(spawnArgv).not.toContain("--sandbox");
		expect(spawnArgv).toContain("--dangerously-skip-permissions");
		// First turn: no conversation id yet, so continuity is not passed.
		expect(spawnArgv).not.toContain("--conversation");
	});
});

describe("antigravity resolveInitialModel (project default, mock agy)", () => {
	it("returns null silently when the project sets no default model", async () => {
		const logged = [];
		const h = makeHarness({ eventBridge: { emitSystemLog: (...a) => logged.push(a) } });
		expect(await h.resolveInitialModel({ id: "p1", cwd: "/tmp", defaultModel: "" })).toBeNull();
		expect(await h.resolveInitialModel({ id: "p1", cwd: "/tmp" })).toBeNull();
		expect(logged).toHaveLength(0);
	});

	it("pins the project default for the session's spawns without an explicit switch", async () => {
		const workspace = makeWorkspace("initial-model");
		trackWorkspace(workspace);
		const argvLog = path.join(workspace, "argv.jsonl");
		process.env.AGY_MOCK_ARGV_LOG = argvLog;
		const session = await harness.createSession(
			{ id: "proj-initial", cwd: workspace, defaultModel: "gemini-3.1-pro-high" },
			{},
		);
		try {
			// The project default is the active model from creation (no
			// switchModel call needed — stages without an override use it).
			expect(await session.getActiveModel()).toMatchObject({
				id: "gemini-3.1-pro-high",
			});
			await session.prompt("Default-model run");
		} finally {
			delete process.env.AGY_MOCK_ARGV_LOG;
		}

		// eslint-disable-next-line security/detect-non-literal-fs-filename -- argv log lives in the test's throwaway tmp workspace
		const spawnLines = fs.readFileSync(argvLog, "utf8").trim().split("\n");
		const promptArgvs = spawnLines
			.map((line) => JSON.parse(line))
			.filter((argv) => argv.includes("-p"));
		expect(promptArgvs).toHaveLength(1);
		expect(promptArgvs[0]).toContain("--model");
		expect(promptArgvs[0][promptArgvs[0].indexOf("--model") + 1]).toBe(
			"gemini-3.1-pro-high",
		);
	});

	it("warns and falls back to the agy default when the stored default is unresolvable", async () => {
		const logged = [];
		const h = makeHarness({ eventBridge: { emitSystemLog: (...a) => logged.push(a) } });
		const resolved = await h.resolveInitialModel({
			id: "p-unresolvable",
			name: "Unresolvable",
			cwd: trackWorkspace(makeWorkspace("unresolvable")),
			defaultModel: "no-such-model-xyz",
		});
		expect(resolved).toBeNull();
		expect(logged.some((a) => String(a).includes("no-such-model-xyz"))).toBe(true);
	});
});