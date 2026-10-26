import { describe, it, expect, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { runSessionContractTests } from "../../sessionContract.test.js";
import { createVibeHarness, vibeArgvShape, vibeExportSummary } from "./vibeHarness.js";
import { createVibeStreamParser } from "./vibeStreamParser.js";
import { createVibeEventMapper } from "./vibeEventMapper.js";

/**
 * MARK: vibeHarness conformance + lifecycle tests
 * @description Runs the shared session conformance suite
 *   (runSessionContractTests — the SAME acceptance gate the pi,
 *   antigravity, and muse harnesses pass) against the vibe harness backed
 *   by the fixture mock binary, plus spawn-lifecycle specifics: normalized
 *   event flow, failure + limit-stop mapping, export.json cost/usage
 *   logging, prompt-file staging, abort escalation, watchdog timeout, and
 *   the [VIBE] spawn/settle log lines (argv shape only — no prompt text
 *   leaks).
 *
 *   No real vibe install and no network: every spawn is the deterministic
 *   fixtures/mock-vibe.mjs node script.
 */

const VIBE_DIR = path.dirname(fileURLToPath(import.meta.url));
const MOCK_VIBE = path.join(VIBE_DIR, "fixtures", "mock-vibe.mjs");
const TEXT_FIXTURE = path.join(VIBE_DIR, "fixtures", "streaming.text-only.jsonl");
const TOOL_CALL_FIXTURE = path.join(VIBE_DIR, "fixtures", "streaming.tool-call.jsonl");

function makeWorkspace(label) {
	return fs.mkdtempSync(path.join(os.tmpdir(), `vibe-ws-${label}-`));
}

function makeHarness(overrides = {}) {
	// Pinned to the exec rollback (acpMode "off"): this suite proves the
	// legacy per-turn path, so the auto sibling probe must never pick up a
	// host vibe-acp install or a future fixtures/vibe-acp file. The ACP
	// transport's conformance runs in vibeHarness.acp.test.js.
	return createVibeHarness({ vibeBin: MOCK_VIBE, acpMode: "off", ...overrides });
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
	delete process.env.VIBE_MOCK_MODE;
	delete process.env.VIBE_MOCK_FIXTURE;
	delete process.env.VIBE_MOCK_CHUNK_DELAY_MS;
	delete process.env.VIBE_MOCK_ARGV_LOG;
	delete process.env.VIBE_MOCK_STRICT;
	delete process.env.VIBE_MOCK_CLI;
	delete process.env.VIBE_CLI;
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
	name: "vibe harness (mock vibe)",
	createSession: async () => {
		const workspace = makeWorkspace("conformance");
		trackWorkspace(workspace);
		return harness.createSession(
			{ id: `proj-${path.basename(workspace)}`, cwd: workspace },
			{ taskId: "t-conformance", stageId: "s-conformance" },
		);
	},
});

describe("vibe harness lifecycle (mock vibe)", () => {
	it("delivers NORMALIZED events for one prompt (raw row types never leak)", async () => {
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
			expect(["message", "effect", "reasoning"]).not.toContain(event?.type);
		}
		expect(session.getLastAssistantText()).toBe(reply);
		expect(session.isStreaming).toBe(false);
	});

	it("replays VIBE_MOCK_FIXTURE verbatim and reads its export record", async () => {
		process.env.VIBE_MOCK_FIXTURE = TEXT_FIXTURE;
		const workspace = makeWorkspace("fixture");
		trackWorkspace(workspace);
		const { lines, eventBridge } = makeBridge();
		const fixtureHarness = makeHarness({ eventBridge });
		const session = await fixtureHarness.createSession(
			{ id: "proj-fixture", cwd: workspace },
			{ taskId: "t-fixture", stageId: "s-fixture" },
		);
		const seen = [];
		const unsub = session.subscribe((event) => seen.push(event));

		const reply = await session.prompt("anything");

		unsub();
		const types = seen.map((event) => event?.type);
		expect(types).toContain("assistant_delta");
		expect(types).toContain("run_finished");
		expect(reply).toContain("PROBE-OK");
		// The fixture branch must write export.json (regression: SESSION_ID
		// was initialized after the fixture branch, so the export never
		// landed and the settle line degraded to export=unknown).
		const settle = lines.find((l) => l.includes("[VIBE] settle"));
		expect(settle).toBeTruthy();
		expect(settle).toContain("outcome=finished");
		expect(settle).toContain("cost_usd=");
	});

	it("emits one [VIBE] spawn line and one settle line with argv shape only", async () => {
		const workspace = makeWorkspace("logs");
		trackWorkspace(workspace);
		const { lines, eventBridge } = makeBridge();
		const logged = makeHarness({ eventBridge });
		const session = await logged.createSession(
			{ id: "proj-logs", cwd: workspace },
			{ taskId: "t1", stageId: "s1" },
		);
		await session.prompt("super secret prompt text");
		const spawn = lines.find((l) => l.includes("[VIBE] spawn"));
		const settle = lines.find((l) => l.includes("[VIBE] settle"));
		expect(spawn).toBeTruthy();
		expect(settle).toBeTruthy();
		// Prompt text never leaks; only its byte length travels in the shape.
		expect(spawn).not.toContain("super secret prompt text");
		expect(spawn).toContain("--workdir");
		expect(spawn).toContain("--output streaming");
		expect(settle).toContain("terminal=completed");
		// The export record lands in the settle line: cost + usage visible.
		expect(settle).toContain("outcome=finished");
		expect(settle).toContain("cost_usd=");
		expect(settle).toContain("tokens=");
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
		process.env.VIBE_MOCK_MODE = "failure";
		const reply = await session.prompt("This will fail");
		expect(reply).toBe("");
		const errorEvent = seen.find((event) => event?.type === "run_error");
		expect(errorEvent).toBeTruthy();
		expect(String(errorEvent.error)).toContain("not available");
	});

	it("maps a limit stop (exit 3) to run_error naming the limit", async () => {
		const workspace = makeWorkspace("limit");
		trackWorkspace(workspace);
		const session = await harness.createSession(
			{ id: "proj-limit", cwd: workspace },
			{},
		);
		const seen = [];
		session.subscribe((event) => seen.push(event));
		process.env.VIBE_MOCK_MODE = "limit";
		const reply = await session.prompt("Expensive prompt");
		const errorEvent = seen.find((event) => event?.type === "run_error");
		expect(errorEvent).toBeTruthy();
		expect(String(errorEvent.error)).toContain("price_limit");
		// Partial assistant text still streamed before the stop — and the
		// turn returns it (the work is preserved, the limit is reported).
		expect(seen.some((event) => event?.type === "assistant_delta")).toBe(true);
		expect(reply).toContain("Partial reply");
	});

	it("surfaces tool calls as started/finished around the answer", async () => {
		const workspace = makeWorkspace("tool");
		trackWorkspace(workspace);
		const session = await harness.createSession(
			{ id: "proj-tool", cwd: workspace },
			{},
		);
		const seen = [];
		session.subscribe((event) => seen.push(event));
		process.env.VIBE_MOCK_MODE = "tool";
		const reply = await session.prompt("Use a tool");
		const types = seen.map((event) => event?.type);
		expect(types).toContain("tool_started");
		expect(types).toContain("tool_finished");
		expect(types).toContain("run_finished");
		const finished = seen.find((event) => event?.type === "tool_finished");
		expect(finished.toolName).toBe("file_system.bash");
		expect(reply).toContain("Mock reply");
	});

	it("stages oversized prompts to --prompt-file (argv-log proof)", async () => {
		const workspace = makeWorkspace("promptfile");
		trackWorkspace(workspace);
		const argvLog = path.join(workspace, "argv.log");
		process.env.VIBE_MOCK_ARGV_LOG = argvLog;
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
		process.env.VIBE_MOCK_CHUNK_DELAY_MS = "150";
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
		process.env.VIBE_MOCK_MODE = "hang";
		await session.prompt("Never returns");
		const errorEvent = seen.find((event) => event?.type === "run_error");
		expect(errorEvent).toBeTruthy();
		expect(String(errorEvent.error)).toContain("timed out");
	});

	it("honest v1 model surface: listModels [] and resolveModelRef null", async () => {
		expect(await harness.listModels()).toEqual([]);
		expect(await harness.resolveModelRef("anything")).toBeNull();
		const workspace = makeWorkspace("models");
		trackWorkspace(workspace);
		const session = await harness.createSession(
			{ id: "proj-models", cwd: workspace },
			{},
		);
		expect(await session.listModels()).toEqual([]);
		expect(await session.switchModel("some-model")).toBeNull();
	});
});

describe("vibe CLI implementation pin (strict-argv regression)", () => {
	// These tests model the pre-3.0 production failure: the host's upstream
	// rollout selected the Rust TUI, whose clap parser rejects the
	// harness-owned `--output-dir`. The strict mock's `rust` mode simulates
	// exactly that legacy parser (ground truth:
	// fixtures/help.rust-pre3.txt), so a missing/mis-set pin fails here
	// instead of in a live stage. Stock Vibe >= 3.0 accepts the flags —
	// that direction is covered by the preflight suite's 3.0 cases
	// (vibeHarness.preflight.test.js with fixtures/help.rust.txt).

	it("runs successfully against a Rust-rollout host when the pin selects the Python CLI", async () => {
		process.env.VIBE_MOCK_STRICT = "1";
		process.env.VIBE_MOCK_CLI = "rust";
		const workspace = makeWorkspace("pin-ok");
		trackWorkspace(workspace);
		// Default resolved pin is `python` (KAINBAIN_VIBE_CLI).
		const pinned = makeHarness({});
		const session = await pinned.createSession(
			{ id: "proj-pin-ok", cwd: workspace },
			{ taskId: "t-pin", stageId: "s-pin" },
		);
		const seen = [];
		session.subscribe((event) => seen.push(event));
		const reply = await session.prompt("Pin works");
		expect(seen.some((event) => event?.type === "run_finished")).toBe(true);
		expect(seen.some((event) => event?.type === "run_error")).toBe(false);
		expect(reply).toContain("Pin works");
	});

	it("names the incompatibility and the fix when the pin is `auto` and the host rejects the flags", async () => {
		process.env.VIBE_MOCK_STRICT = "1";
		process.env.VIBE_MOCK_CLI = "rust";
		const workspace = makeWorkspace("pin-bad");
		trackWorkspace(workspace);
		const unpinned = makeHarness({ cli: "auto" });
		const session = await unpinned.createSession(
			{ id: "proj-pin-bad", cwd: workspace },
			{ taskId: "t-pin", stageId: "s-pin" },
		);
		const seen = [];
		session.subscribe((event) => seen.push(event));
		await session.prompt("This reproduces the production failure");
		const errorEvent = seen.find((event) => event?.type === "run_error");
		expect(errorEvent).toBeTruthy();
		expect(String(errorEvent.error)).toContain("VIBE_CLI_INCOMPATIBLE");
		expect(String(errorEvent.error)).toContain("--output-dir");
		expect(String(errorEvent.error)).toContain("KAINBAIN_VIBE_CLI=python");
	});

	it("threads the pin into the child env asserted at spawn (argv-log proof)", async () => {
		process.env.VIBE_MOCK_STRICT = "1";
		process.env.VIBE_MOCK_CLI = "rust";
		const workspace = makeWorkspace("pin-env");
		trackWorkspace(workspace);
		const argvLog = path.join(workspace, "argv.log");
		process.env.VIBE_MOCK_ARGV_LOG = argvLog;
		const session = await harness.createSession(
			{ id: "proj-pin-env", cwd: workspace },
			{},
		);
		await session.prompt("env pin");
		// The strict Rust mock accepts the run ONLY because the harness set
		// VIBE_CLI=python in the child env; if that pin were dropped the mock
		// would exit 2 before logging argv.
		const rows = fs.readFileSync(argvLog, "utf8").trim().split("\n");
		expect(rows.length).toBeGreaterThan(0);
		expect(JSON.parse(rows[0])).toContain("--output-dir");
	});
});

describe.skipIf(!process.env.KAINBAIN_VIBE_LIVE)(
	"vibe live smoke (opt-in: KAINBAIN_VIBE_LIVE=1)",
	() => {
		it("runs one bounded real prompt end-to-end with the pinned Python CLI", async () => {
			const bin = process.env.KAINBAIN_VIBE_BIN || "vibe";
			const live = createVibeHarness({
				vibeBin: bin,
				trust: true,
				autoApprove: true,
				timeoutMs: 120000,
			});
			const workspace = makeWorkspace("live");
			trackWorkspace(workspace);
			const session = await live.createSession(
				{ id: "proj-live", cwd: workspace },
				{ taskId: "t-live", stageId: "s-live" },
			);
			const seen = [];
			session.subscribe((event) => seen.push(event));
			const reply = await session.prompt(
				"Reply with exactly one short sentence confirming the probe succeeded.",
			);
			expect(seen.some((event) => event?.type === "run_finished")).toBe(true);
			expect(seen.some((event) => event?.type === "run_error")).toBe(false);
			expect(reply.trim().length).toBeGreaterThan(0);
		}, 150000);
	},
);

describe("vibe fixture fingerprint (wire-shape drift guard)", () => {
	function replayFixture(fixturePath) {
		const parser = createVibeStreamParser();
		const mapper = createVibeEventMapper();
		const text = fs.readFileSync(fixturePath, "utf8");
		const types = [];
		for (const line of text.split("\n")) {
			if (!line.trim()) continue;
			for (const row of parser.push(`${line}\n`)) {
				for (const event of mapper.map(row)) types.push(event.type);
			}
		}
		for (const row of parser.flush()) {
			for (const event of mapper.map(row)) types.push(event.type);
		}
		return { types, stats: parser.stats() };
	}

	it("text-only fixture replays to message_started + assistant_delta", () => {
		const { types, stats } = replayFixture(TEXT_FIXTURE);
		expect(stats.droppedUnknown).toBe(0);
		// The user echo is ignored by design; the assistant row speaks.
		expect(types).toEqual(["message_started", "assistant_delta"]);
	});

	it("real tool-call fixture replays the tool before the answer (wire order)", () => {
		const { types } = replayFixture(TOOL_CALL_FIXTURE);
		expect(types).toEqual([
			"tool_started",
			"tool_finished",
			"message_started",
			"assistant_delta",
		]);
		// Re-run through the parser+mapper and check the tool name survives.
		const parser = createVibeStreamParser();
		const mapper = createVibeEventMapper();
		const names = [];
		for (const line of fs.readFileSync(TOOL_CALL_FIXTURE, "utf8").split("\n")) {
			if (!line.trim()) continue;
			for (const row of parser.push(`${line}\n`)) {
				for (const event of mapper.map(row)) {
					if (event.type === "tool_started") names.push(event.toolName);
				}
			}
		}
		expect(names).toContain("file_system.bash");
	});

	it("drift fails loudly: a renamed row type drops the tool events", () => {
		const text = fs.readFileSync(TOOL_CALL_FIXTURE, "utf8");
		const mutated = text.replaceAll('"effect"', '"effect2"');
		const parser = createVibeStreamParser();
		const mapper = createVibeEventMapper();
		const types = [];
		for (const line of mutated.split("\n")) {
			if (!line.trim()) continue;
			for (const row of parser.push(`${line}\n`)) {
				for (const event of mapper.map(row)) types.push(event.type);
			}
		}
		// The tool effect is gone (unknown row type): no tool events.
		expect(types).not.toContain("tool_started");
		expect(parser.stats().droppedUnknown).toBe(1);
	});
});

describe("vibe argv shape + export summary", () => {
	it("elides prompt text to its byte length", () => {
		const shape = vibeArgvShape(["--prompt", "secret text", "--workdir", "/w"]);
		expect(shape).not.toContain("secret text");
		expect(shape).toContain("--prompt <prompt:11B>");
		expect(shape).toContain("--workdir /w");
	});

	it("summarizes the export record, degrading honestly when absent", () => {
		expect(
			vibeExportSummary({
				outcome: "finished",
				stopReason: null,
				error: null,
				usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
				costUsd: 0.001,
				steps: 2,
			}),
		).toBe("outcome=finished stop=- cost_usd=0.001 tokens=10/5/15 steps=2");
		expect(vibeExportSummary(null)).toBe("export=unknown");
	});
});
