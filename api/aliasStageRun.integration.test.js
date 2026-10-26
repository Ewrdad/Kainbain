import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/***
 * MARK: alias stage-run integration
 * @description End-to-end proof of the model-alias feature THROUGH the
 *   engine's real seams: a stage on the virtual `alias` harness runs through
 *   the real createAgentRunner (alias → concrete dispatch target) and the
 *   real SessionStore (fresh stage session on the target harness) — exactly
 *   the chain a pipeline stage executes. The alias target is the
 *   self-managed `custom` harness running an echo script, so no live AI is
 *   ever called: the echoed prompt proves the run reached the target.
 ***/

const { SessionStore } = await import("./sessionStore.js");
const { createAgentRunner } = await import("./agentRunner.js");

let scriptDir;
let echoPrompt;
let unique = 6000;
const nextId = (prefix) => `${prefix}-${++unique}`;

beforeAll(() => {
	scriptDir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-alias-stage-"));
	// Echoes the final argv element — the appended prompt.
	echoPrompt = path.join(scriptDir, "echo-prompt.sh");
	fs.writeFileSync(echoPrompt, '#!/bin/sh\nprintf \'%s\' "$1"\n');
	fs.chmodSync(echoPrompt, 0o755);
});

afterAll(() => {
	try {
		fs.rmSync(scriptDir, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});

function aliasProject(overrides = {}) {
	return {
		id: nextId("proj-alias-stage"),
		name: "Alias Stage Project",
		cwd: scriptDir,
		harness: "pi",
		harnessCommand: echoPrompt,
		defaultModel: "",
		modelAliases: [{ name: "small", harness: "custom", model: "" }],
		...overrides,
	};
}

describe("alias stage execution (agentRunner + sessionStore)", () => {
	it("runs a stage alias ref on the alias target with no alias warning", async () => {
		const project = aliasProject();
		const store = new SessionStore({});
		const seenMeta = [];
		const runner = createAgentRunner({
			getOrCreateSession: (projectId, meta) => {
				expect(projectId).toBe(project.id);
				seenMeta.push(meta);
				return store.beginStageSession(project, meta);
			},
			getProject: (projectId) =>
				projectId === project.id ? project : null,
			touchSession: () => {},
		});
		const stageMessages = [];
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const result = await runner("prove the alias reached its target", {
				projectId: project.id,
				taskId: nextId("task"),
				stage: { id: "s1", harness: "alias", model: "small" },
				onChunk: (text) => stageMessages.push(text),
			});
			// The session started on the alias's concrete target harness …
			expect(seenMeta[0]?.harness).toBe("custom");
			// … the target executed the prompt (echoed stdout) …
			expect(result.output).toContain("prove the alias reached its target");
			expect(result.failed).toBeFalsy();
			// … and neither the process log nor the stage log warns.
			const lines = warnSpy.mock.calls.map((args) => String(args[0]));
			expect(
				lines.some((line) => line.includes("Unknown model alias")),
			).toBe(false);
			expect(
				lines.some((line) => line.includes('Unknown harness "alias"')),
			).toBe(false);
			expect(
				stageMessages.some((text) => text.includes("Unknown model alias")),
			).toBe(false);
		} finally {
			warnSpy.mockRestore();
			await store.dispose(project.id);
		}
	});

	it("falls back loudly to the project default when the stage alias is deleted", async () => {
		const project = aliasProject({
			harness: "custom",
			modelAliases: [],
		});
		const store = new SessionStore({});
		const seenMeta = [];
		const runner = createAgentRunner({
			getOrCreateSession: (projectId, meta) => {
				seenMeta.push(meta);
				return store.beginStageSession(project, meta);
			},
			getProject: (projectId) =>
				projectId === project.id ? project : null,
			touchSession: () => {},
		});
		const stageMessages = [];
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const result = await runner("run on the project default", {
				projectId: project.id,
				taskId: nextId("task"),
				stage: { id: "s1", harness: "alias", model: "small" },
				onChunk: (text) => stageMessages.push(text),
			});
			// The run still completes — on the project default, not the alias.
			expect(seenMeta[0]?.harness).toBeUndefined();
			expect(result.output).toContain("run on the project default");
			expect(result.failed).toBeFalsy();
			// Both logs name the deleted alias (never the virtual harness).
			const lines = warnSpy.mock.calls.map((args) => String(args[0]));
			expect(lines.some((line) => line.includes('"small"'))).toBe(true);
			expect(
				lines.some((line) => line.includes('Unknown harness "alias"')),
			).toBe(false);
			expect(
				stageMessages.some((text) =>
					text.includes('Unknown model alias "small"'),
				),
			).toBe(true);
		} finally {
			warnSpy.mockRestore();
			await store.dispose(project.id);
		}
	});
});
