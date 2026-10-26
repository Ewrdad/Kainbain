import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertHarnessSessionShape, assertHarnessShape } from "../../harnessContract.js";
import { AGENT_EVENT_NAMES } from "../../sessionEvents.js";
import { runSessionContractTests } from "../../sessionContract.test.js";
import {
	HARNESS_ID,
	CustomCommandError,
	buildCustomSpawnPlan,
	createCustomHarness,
	createCustomSession,
	tokenizeCustomCommandLine,
} from "./customHarness.js";

/**
 * MARK: Custom harness contract conformance
 * @description Holds the custom-command harness to the SAME acceptance gate as
 *   the pi harness (the harness contract's mandatory acceptance gate): its
 *   sessions must satisfy the required HarnessSession shape and pass the full
 *   shared conformance suite — against REAL spawned processes (echo + small
 *   helper scripts in a throwaway directory), so the shell-less spawn plan,
 *   stdout streaming, exit-code handling and abort behavior are all proven
 *   with real processes, never mocks.
 */

/** The project stub every session binds to; `cwd` is the throwaway script dir. */
let scriptDir;
let project;

const makeProject = (harnessCommand) => ({
	id: "proj-custom-test",
	name: "Custom Harness Test",
	cwd: scriptDir,
	harness: "custom",
	harnessCommand,
});

beforeAll(() => {
	scriptDir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-custom-harness-"));
	// Argv dumper: prints every argument on its own line (proves the prompt
	// lands as the FINAL argv element, verbatim, with no shell in between).
	const argvDump = path.join(scriptDir, "argv-dump.sh");
	fs.writeFileSync(argvDump, '#!/bin/sh\nfor arg in "$@"; do printf \'%s\\n\' "$arg"; done\n');
	fs.chmodSync(argvDump, 0o755);
	// Two-part streamer: proves assistant deltas stream WHILE running.
	const streamer = path.join(scriptDir, "stream.sh");
	fs.writeFileSync(streamer, "#!/bin/sh\nprintf 'part1\\n'\nsleep 0.3\nprintf 'part2\\n'\n");
	fs.chmodSync(streamer, 0o755);
	// Failing command: writes to stderr and exits non-zero.
	const failing = path.join(scriptDir, "failing.sh");
	fs.writeFileSync(failing, "#!/bin/sh\necho 'boom from stderr' >&2\nexit 3\n");
	fs.chmodSync(failing, 0o755);
	// Slow command for the abort test.
	const slow = path.join(scriptDir, "slow.sh");
	fs.writeFileSync(slow, "#!/bin/sh\nsleep 30\nprintf 'done\\n'\n");
	fs.chmodSync(slow, 0o755);
	project = {
		id: "proj-custom-test",
		name: "Custom Harness Test",
		cwd: scriptDir,
		harness: "custom",
		harnessCommand: "echo",
	};
});

afterAll(() => {
	try {
		fs.rmSync(scriptDir, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});

runSessionContractTests({
	name: "custom harness",
	createSession: () => createCustomHarness().createSession(project),
});

/***
 * MARK: collectEvents
 * @description Subscribes a collector to a session and returns the events it
 *   saw plus the unsubscribe function (test helper).
 ***/
function collectEvents(session) {
	const seen = [];
	const unsub = session.subscribe((event) => seen.push(event));
	return { seen, unsub };
}

describe("custom command line parsing", () => {
	it("tokenizes plain commands, flags and quoted arguments", () => {
		expect(tokenizeCustomCommandLine("claude -p")).toEqual(["claude", "-p"]);
		expect(tokenizeCustomCommandLine("muse exec --yolo")).toEqual([
			"muse",
			"exec",
			"--yolo",
		]);
		expect(tokenizeCustomCommandLine(`claude -p --model "sonnet 4"`)).toEqual([
			"claude",
			"-p",
			"--model",
			"sonnet 4",
		]);
	});

	it("keeps the prompt-argument grammar intact for a realistic CLI line", () => {
		const plan = buildCustomSpawnPlan("muse exec --yolo", "Fix the login bug");
		expect(plan.command).toBe("muse");
		expect(plan.args).toEqual(["exec", "--yolo", "Fix the login bug"]);
		expect(plan.env).toEqual({});
	});

	it("supports quoted arguments, escaped quotes and env prefixes", () => {
		expect(tokenizeCustomCommandLine(`claude -p --model "sonnet 4"`)).toEqual([
			"claude",
			"-p",
			"--model",
			"sonnet 4",
		]);
		expect(tokenizeCustomCommandLine("'my agent' --flag=\"a b\"")).toEqual([
			"my agent",
			"--flag=a b",
		]);
		const plan = buildCustomSpawnPlan(
			"ANTHROPIC_API_KEY=sk-test LOG=debug claude -p",
			"prompt text",
		);
		expect(plan.env).toEqual({ ANTHROPIC_API_KEY: "sk-test", LOG: "debug" });
		expect(plan.command).toBe("claude");
		expect(plan.args).toEqual(["-p", "prompt text"]);
	});

	it("appends the prompt as the FINAL argument, verbatim (no shell)", () => {
		const prompt = `Multi "line" $prompt with\nnewlines and 'quotes'`;
		const plan = buildCustomSpawnPlan("claude -p", prompt);
		expect(plan.args.at(-1)).toBe(prompt);
	});

	it("rejects empty commands, unterminated quotes and shell operators", () => {
		expect(() => tokenizeCustomCommandLine("   ")).toThrow(CustomCommandError);
		expect(() => tokenizeCustomCommandLine("claude 'open quote")).toThrow(/unterminated/i);
		expect(() => tokenizeCustomCommandLine('claude "open quote')).toThrow(/unterminated/i);
		for (const bad of [
			"claude | tee log",
			"claude && echo hi",
			"claude; echo hi",
			"claude > out",
			"claude < in",
			"echo `id`",
			"echo $(id)",
		]) {
			expect(() => tokenizeCustomCommandLine(bad)).toThrow(CustomCommandError);
		}
		// Metacharacters INSIDE quotes are harmless (literal arguments).
		expect(() => tokenizeCustomCommandLine(`claude -p "a | b"`)).not.toThrow();
		expect(buildCustomSpawnPlan(`claude -p "a | b"`, "x").args).toEqual(["-p", "a | b", "x"]);
	});

	it("throws when nothing but environment assignments is given", () => {
		expect(() => buildCustomSpawnPlan("FOO=bar", "p")).toThrow(/no command/i);
	});
});

describe("custom harness surface", () => {
	it("satisfies the AgentHarness shape and identifies itself", () => {
		const harness = createCustomHarness();
		expect(assertHarnessShape(harness)).toBe(true);
		expect(harness.id).toBe("custom");
		expect(harness.name).toBe("custom");
		expect(harness.label).toBe("Custom command");
	});

	it("sessions satisfy the required HarnessSession shape", async () => {
		const session = await createCustomHarness().createSession(project);
		expect(assertHarnessSessionShape(session)).toBe(true);
		expect(session.harnessId).toBe("custom");
	});

	it("createSession returns a FRESH session per call (one session per stage)", async () => {
		const harness = createCustomHarness();
		const first = await harness.createSession(project, { taskId: "t1", stageId: "s1" });
		const second = await harness.createSession(project, { taskId: "t1", stageId: "s1" });
		expect(first).not.toBe(second);
		await first.prompt("Only in the first stage");
		expect(second.getMessages()).toHaveLength(0);
	});

	it("takes NO model selection: no listable models, nothing resolves", async () => {
		const harness = createCustomHarness();
		expect(harness.modelSelection).toBe("none");
		expect(harness.modelFlag).toBeUndefined();
		// No programmatic catalogue: model routes serve an honest empty list
		// for this harness (never the curated fallback), and no reference
		// resolves (model choice lives inside the command line).
		expect(await harness.listModels()).toEqual([]);
		expect(await harness.resolveModelRef("sonnet")).toBeNull();
		expect(await harness.resolveModelRef("custom::custom::sonnet")).toBeNull();
		expect(await harness.readHistoryFromDisk(project)).toEqual({ messages: [], tree: [] });
	});
});

describe("custom command execution", () => {
	it("runs the command with the prompt appended and streams stdout as the assistant reply", async () => {
		const session = createCustomSession({
			...project,
			harnessCommand: `${scriptDir}/argv-dump.sh`,
		});
		const { seen, unsub } = collectEvents(session);
		const reply = await session.prompt("first-arg-check");

		// The prompt is the FINAL argv element, echoed verbatim by the script.
		expect(reply).toContain("first-arg-check");
		expect(session.getLastAssistantText()).toBe(reply);
		const lines = reply.split("\n").filter(Boolean);
		expect(lines.at(-1)).toBe("first-arg-check");

		unsub();
		const types = seen.map((e) => e?.type);
		expect(types[0]).toBe("run_started");
		expect(types).toContain("assistant_delta");
		expect(types.at(-1)).toBe("run_finished");
		for (const type of types) {
			expect(AGENT_EVENT_NAMES).toContain(type);
		}
		// The conversation records both turns of the run.
		const roles = session.getMessages().map((m) => m.role);
		expect(roles).toEqual(["user", "assistant"]);
	});

	it("streams stdout INCREMENTALLY while the command is still running", async () => {
		const session = createCustomSession({
			...project,
			harnessCommand: `${scriptDir}/stream.sh`,
		});
		const { seen } = collectEvents(session);
		const reply = await session.prompt("stream check");

		expect(reply).toContain("part1");
		expect(reply).toContain("part2");
		const deltas = seen.filter((e) => e?.type === "assistant_delta");
		// Two separate prints at least 0.2s apart must arrive as separate deltas.
		expect(deltas.length).toBeGreaterThanOrEqual(2);
		expect(deltas.map((d) => d.delta).join("")).toBe(reply);
	});

	it("fails the run with the CLI's stderr when the command exits non-zero", async () => {
		const session = createCustomSession({ ...project, harnessCommand: `${scriptDir}/failing.sh` });
		const { seen } = collectEvents(session);
		await expect(session.prompt("doomed")).rejects.toThrow(/boom from stderr/);
		const types = seen.map((e) => e?.type);
		expect(types).toContain("run_error");
		expect(session.getLastAssistantText()).toBeTruthy();
	});

	it("surfaces stderr lines and the exit code as structured harness_log events", async () => {
		const session = createCustomSession({ ...project, harnessCommand: `${scriptDir}/failing.sh` });
		const { seen } = collectEvents(session);
		await expect(session.prompt("doomed")).rejects.toThrow(/boom from stderr/);
		const logs = seen.filter((e) => e?.type === "harness_log");
		expect(logs.some((e) => e.text === "[custom:stderr] boom from stderr")).toBe(true);
		expect(
			logs.some((e) => e.text === "[custom] process exited with code 3"),
		).toBe(true);
		const error = seen.find((e) => e?.type === "run_error");
		expect(error.exitCode).toBe(3);
	});

	it("ends a clean run with an exit-code line before run_finished", async () => {
		const session = createCustomSession({ ...project, harnessCommand: `${scriptDir}/stream.sh` });
		const { seen } = collectEvents(session);
		await session.prompt("clean run");
		const types = seen.map((e) => e?.type);
		expect(types.at(-2)).toBe("harness_log");
		expect(types.at(-1)).toBe("run_finished");
		expect(seen.at(-2).text).toBe("[custom] process exited with code 0");
		expect(seen.at(-1).exitCode).toBe(0);
	});

	it("reports a clear configuration error when no command is set", async () => {
		const session = createCustomSession({ id: "proj-x", cwd: scriptDir });
		await expect(session.prompt("anything")).rejects.toThrow(/command is empty/i);
	});

	it("isStreaming is true only while the child process runs", async () => {
		const session = createCustomSession({ ...project, harnessCommand: `${scriptDir}/stream.sh` });
		expect(session.isStreaming).toBe(false);
		const running = session.prompt("streaming flag");
		await new Promise((r) => setTimeout(r, 50));
		expect(session.isStreaming).toBe(true);
		await expect(running).resolves.toContain("part2");
		expect(session.isStreaming).toBe(false);
	});

	it("abort() kills the running command (whole process group) and resolves", async () => {
		const session = createCustomSession({ ...project, harnessCommand: `${scriptDir}/slow.sh` });
		const running = session.prompt("abort me");
		await new Promise((r) => setTimeout(r, 100));
		expect(session.isStreaming).toBe(true);
		await expect(session.abort()).resolves.toBeDefined();
		// The killed child settles the prompt with a failure (no silent hang).
		await expect(running).rejects.toThrow();
		expect(session.isStreaming).toBe(false);
		// Aborting while nothing runs is a safe no-op.
		await expect(session.abort()).resolves.toBeDefined();
	});

	it("dispose() aborts, clears subscribers and rejects later prompts (idempotent)", async () => {
		const session = createCustomSession(project);
		await session.prompt("warm up");
		await session.dispose();
		await session.dispose();
		await expect(session.prompt("after dispose")).rejects.toThrow(/disposed/i);
		expect(session.subscribe(() => {})).toBeTypeOf("function");
	});

	it("runs the command in the project's cwd with the run context in the environment", async () => {
		// argv-dump.sh receives the prompt as argv; the env contract is proven
		// through a script that prints PROJECT_CWD when set.
		const envDump = path.join(scriptDir, "env-dump.sh");
		fs.writeFileSync(envDump, '#!/bin/sh\nprintf "%s" "$PROJECT_CWD"\n');
		fs.chmodSync(envDump, 0o755);
		const session = createCustomSession({ ...project, harnessCommand: envDump });
		const reply = await session.prompt("env check");
		expect(reply).toBe(scriptDir);
	});

	it("propagates leading VAR=value assignments into the real child environment", async () => {
		// Regression: buildCustomSpawnPlan parses leading VAR=value tokens into
		// plan.env, but the spawn call dropped plan.env — assignments never
		// reached the child. This proves propagation through a REAL process.
		const probe = path.join(scriptDir, "custom-env-probe.sh");
		fs.writeFileSync(probe, '#!/bin/sh\nprintf "FAKE_KEY=[%s] OTHER=[%s]" "$KB_CUSTOM_FAKE_KEY" "$KB_CUSTOM_OTHER"\n');
		fs.chmodSync(probe, 0o755);
		const session = createCustomSession({
			...project,
			harnessCommand: `KB_CUSTOM_FAKE_KEY=secret-value KB_CUSTOM_OTHER=second ${probe}`,
		});
		const reply = await session.prompt("env propagation check");
		expect(reply).toContain("FAKE_KEY=[secret-value]");
		expect(reply).toContain("OTHER=[second]");
	});

	it("surfaces stderr lines through the event bridge while running", async () => {
		const emitted = [];
		const bridge = { emitSystemLog: (projectId, message) => emitted.push({ projectId, message }) };
		const session = createCustomSession(
			{ ...project, harnessCommand: `${scriptDir}/failing.sh` },
			{ eventBridge: bridge },
		);
		await expect(session.prompt("with stderr")).rejects.toThrow();
		expect(emitted.some((e) => e.projectId === project.id && /boom from stderr/.test(e.message))).toBe(
			true,
		);
	});
});

describe("custom harness in the registry", () => {
	it("is registered as a built-in harness", async () => {
		const { HARNESS_CUSTOM, hasHarness, listHarnesses, getHarnessByName } = await import(
			"../../harnessRegistry.js"
		);
		expect(HARNESS_CUSTOM).toBe("custom");
		expect(hasHarness("custom")).toBe(true);
		expect(listHarnesses().map((h) => h.name)).toContain("custom");
		expect(getHarnessByName("custom").id).toBe("custom");
	});
});

describe("custom baked-in model flags (no harness model selection)", () => {
	it("passes a baked-in --model flag through untouched (prompt stays final)", () => {
		const plan = buildCustomSpawnPlan("claude --model sonnet -p", "Do it");
		expect(plan.command).toBe("claude");
		expect(plan.args).toEqual(["--model", "sonnet", "-p", "Do it"]);
	});

	it("sessions expose no model-switching surface", async () => {
		const harness = createCustomHarness();
		const session = await harness.createSession({ ...project, defaultModel: "sonnet" });
		// A stored default model is IGNORED (the command line owns it now) and
		// there is nothing to switch with — the runner warns visibly instead.
		expect(session.modelSelection).toBeUndefined();
		expect(session.switchModel).toBeUndefined();
		expect(session.getActiveModel).toBeUndefined();
		await session.dispose();
	});

	it("prompt() runs the baked-in command verbatim (real process)", async () => {
		const session = createCustomSession({
			...project,
			harnessCommand: `${scriptDir}/argv-dump.sh --model sonnet --verbose`,
		});
		const reply = await session.prompt("baked-flag-check");
		expect(reply.split("\n").filter(Boolean)).toEqual([
			"--model",
			"sonnet",
			"--verbose",
			"baked-flag-check",
		]);
		await session.dispose();
	});
});