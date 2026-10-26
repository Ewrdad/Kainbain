import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * MARK: Custom harness stage-run integration
 * @description End-to-end proof of the custom AI harness feature THROUGH the
 *   engine's real seams: a project choosing `harness: "custom"` with a
 *   free-text command line runs an AGENT STAGE through the real SessionStore
 *   (registry resolution → fresh stage session) and the real createAgentRunner
 *   (curated prompt → session.prompt → streamed output) — exactly the chain a
 *   pipeline stage executes. The command itself is a real script that echoes
 *   its final argument, proving the curated prompt is APPENDED verbatim and
 *   the stdout becomes the stage's assistant output.
 */

const { SessionStore } = await import("./sessionStore.js");
const { createAgentRunner } = await import("./agentRunner.js");
const { createCustomHarness } = await import("./agent/harnesses/custom/customHarness.js");

let scriptDir;
let project;

beforeAll(() => {
	scriptDir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-custom-stage-"));
	// Echoes the final argv element — the appended prompt.
	const echoPrompt = path.join(scriptDir, "echo-prompt.sh");
	fs.writeFileSync(echoPrompt, '#!/bin/sh\nprintf \'%s\' "$1"\n');
	fs.chmodSync(echoPrompt, 0o755);
	project = {
		id: "proj-custom-stage",
		name: "Custom Stage Project",
		cwd: scriptDir,
		harness: "custom",
		harnessCommand: echoPrompt,
	};
});

afterAll(() => {
	try {
		fs.rmSync(scriptDir, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});

describe("custom harness stage execution (sessionStore + agentRunner)", () => {
	it("runs a stage through the real store: curated prompt appended, stdout becomes the stage output", async () => {
		const store = new SessionStore({ harness: createCustomHarness() });
		const runner = createAgentRunner({
			getOrCreateSession: (projectId, meta) => {
				expect(projectId).toBe(project.id);
				// Stage runs ALWAYS begin a fresh session (one session per stage).
				return store.beginStageSession(project, meta);
			},
			touchSession: () => {},
		});

		const curatedPrompt =
			"# Task\nAdd custom ai harness support\n\n# Stage\nPlease execute the plan.\n\n# Skills\n(none)";
		const result = await runner(curatedPrompt, {
			projectId: project.id,
			taskId: "task-1",
			stage: { id: "s1", name: "In Progress", type: "agent" },
		});

		expect(result.failed).toBe(false);
		// The child's stdout IS the prompt — appended verbatim, nothing lost.
		expect(result.output).toBe(curatedPrompt);
		expect(result.summary).toContain("Add custom ai harness support");
		expect(result.modifiedFiles).toEqual([]);
		// The log entries carry the grouped assistant output for task.logEntries.
		expect(Array.isArray(result.logEntries)).toBe(true);

		await store.dispose(project.id);
	});

	it("fails the stage with the CLI's diagnosis when the command exits non-zero", async () => {
		const failing = path.join(scriptDir, "stage-fail.sh");
		fs.writeFileSync(failing, '#!/bin/sh\necho "boom from stage-fail.sh" >&2\nexit 1\n');
		fs.chmodSync(failing, 0o755);

		// Pin the failing command by overriding the session creator for this test.
		const store2 = new SessionStore({
			createSession: (project2) =>
				createCustomHarness().createSession({ ...project2, harnessCommand: failing }),
		});
		const runner = createAgentRunner({
			getOrCreateSession: (projectId, meta) => store2.beginStageSession(project, meta),
		});

		const result = await runner("this will fail", {
			projectId: project.id,
			stage: { id: "s2", name: "In Progress", type: "agent" },
		});

		expect(result.failed).toBe(true);
		// The classified failure carries the CLI's own stderr diagnosis.
		expect(result.failureReason).toContain("boom from stage-fail.sh");
		expect(result.output).toContain("Agent Execution Error");
		expect(result.output).toContain("stage-fail.sh");

		await store2.dispose(project.id);
	});

	it("model requests are visibly ignored on a none harness (no switch attempt, no silent swap)", async () => {
		const store = new SessionStore({ harness: createCustomHarness() });
		const runner = createAgentRunner({
			getOrCreateSession: (projectId, meta) => store.beginStageSession(project, meta),
		});

		const result = await runner("run regardless", {
			projectId: project.id,
			taskId: "t-model",
			stage: { id: "s3", name: "In Progress", type: "agent", model: "pi::google::gemini" },
			model: "pi::google::gemini",
		});

		// The stage still runs (stdout reply), and the runner logs a visible
		// note that the custom harness manages its own model — model choice
		// for custom lives inside the command line, not in stage settings.
		// No switch is attempted, so the "not available" warning never fires.
		expect(result.failed).toBe(false);
		const texts = (result.logEntries || []).map((e) => e.text).join("\n");
		expect(texts).toContain("manages its own model");
		expect(texts).toContain("pi::google::gemini");
		expect(texts).not.toContain("cannot switch models");
		expect(texts).not.toContain("is not available; stage is running on");

		await store.dispose(project.id);
	});
});