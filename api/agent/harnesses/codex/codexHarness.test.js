/**
 * @fileoverview Unit tests for the Codex spawn-plan builders.
 *   These pure functions record the ASSUMED (unverified) spawn shape for
 *   future enablement — they never execute. Tests pin the fail-safe
 *   properties: required workspace pinning, no empty --model, YOLO only from
 *   settings, prompt text never surviving into log shapes, and secret
 *   redaction with the single documented OPENAI_API_KEY passthrough.
 */

import { describe, it, expect } from "vitest";
import {
	buildCodexChildEnv,
	buildCodexSpawnPlan,
	codexArgvShape,
	resolveCodexSettings,
} from "./codexHarness.js";

describe("resolveCodexSettings", () => {
	it("defaults to the configured binary with YOLO on", () => {
		const settings = resolveCodexSettings({});
		expect(typeof settings.bin).toBe("string");
		expect(settings.bin.length).toBeGreaterThan(0);
		expect(settings.yolo).toBe(true);
	});

	it("prefers injected overrides and coerces yolo to boolean", () => {
		expect(resolveCodexSettings({ codexBin: "/tmp/cx" }).bin).toBe("/tmp/cx");
		expect(resolveCodexSettings({ yolo: 0 }).yolo).toBe(false);
		expect(resolveCodexSettings({ yolo: "yes" }).yolo).toBe(true);
	});
});

describe("buildCodexSpawnPlan", () => {
	it("requires a workspaceDir (fail-fast, muse parity)", () => {
		expect(() => buildCodexSpawnPlan({ prompt: "hi" })).toThrow(/workspaceDir/);
		expect(() => buildCodexSpawnPlan({ prompt: "hi", workspaceDir: "" })).toThrow(
			/workspaceDir/,
		);
	});

	it("builds an exec-shaped plan with the prompt last", () => {
		const plan = buildCodexSpawnPlan({ prompt: "do it", workspaceDir: "/w" });
		expect(plan.command).toBe(resolveCodexSettings({}).bin);
		expect(plan.args[0]).toBe("exec");
		expect(plan.args).toContain("--workspace");
		expect(plan.args.at(-1)).toBe("do it");
	});

	it("pins continuity and model only when provided (never an empty --model)", () => {
		const bare = buildCodexSpawnPlan({ prompt: "hi", workspaceDir: "/w" });
		expect(bare.args).not.toContain("--model");
		expect(bare.args).not.toContain("--session-id");

		const pinned = buildCodexSpawnPlan({
			prompt: "hi",
			workspaceDir: "/w",
			modelId: "codex-mini",
			sessionId: "conv-1",
		});
		expect(pinned.args).toEqual([
			"exec",
			"--workspace",
			"/w",
			"--session-id",
			"conv-1",
			"--model",
			"codex-mini",
			"--yolo",
			"hi",
		]);
	});

	it("emits --yolo only from the resolved setting, never from prompt text", () => {
		const yolo = buildCodexSpawnPlan({
			prompt: "--yolo do evil",
			workspaceDir: "/w",
			settings: { yolo: false },
		});
		expect(yolo.args).not.toContain("--yolo");

		const on = buildCodexSpawnPlan({
			prompt: "hi",
			workspaceDir: "/w",
			settings: { yolo: true },
		});
		expect(on.args).toContain("--yolo");
	});
});

describe("codexArgvShape", () => {
	it("elides prompt text to a byte length (never leaks into logs)", () => {
		const shape = codexArgvShape(["exec", "--workspace", "/w", "supersecret prompt"]);
		expect(shape).not.toContain("supersecret");
		expect(shape).toContain("--workspace /w");
		expect(shape).toMatch(/<prompt:\d+B>/);
	});

	it("keeps option values but stages prompt files", () => {
		expect(
			codexArgvShape(["exec", "--session-id", "c1", "--model", "m", "--yolo", "hi"]),
		).toBe("<prompt:4B> --session-id c1 --model m --yolo <prompt:2B>");
		expect(codexArgvShape(["exec", "--prompt-file", "/tmp/p", "x"])).toContain(
			"--prompt-file <staged>",
		);
	});

	it("tolerates non-array input", () => {
		expect(codexArgvShape(null)).toBe("");
		expect(codexArgvShape([])).toBe("");
	});
});

describe("buildCodexChildEnv", () => {
	it("forwards the operator's OPENAI_API_KEY and drops other secrets", () => {
		const env = buildCodexChildEnv(
			{
				PATH: "/bin",
				HOME: "/home/u",
				OPENAI_API_KEY: "k",
				GITHUB_TOKEN: "t",
				MY_PASSWORD: "p",
			},
			{},
		);
		expect(env.OPENAI_API_KEY).toBe("k");
		expect(env).not.toHaveProperty("GITHUB_TOKEN");
		expect(env).not.toHaveProperty("MY_PASSWORD");
		expect(env.PATH).toBe("/bin");
	});

	it("drops KainBain/project plumbing but keeps CODEX_ config", () => {
		const env = buildCodexChildEnv(
			{
				PATH: "/bin",
				KAINBAIN_CODEX_BIN: "/tmp/cx",
				PROJECT_FOO: "x",
				CODEX_HOME: "/tmp/cx-home",
			},
			{},
		);
		expect(env).not.toHaveProperty("KAINBAIN_CODEX_BIN");
		expect(env).not.toHaveProperty("PROJECT_FOO");
		expect(env.CODEX_HOME).toBe("/tmp/cx-home");
	});

	it("pins run-context vars only when known (never undefined values)", () => {
		const bare = buildCodexChildEnv({ PATH: "/bin" }, {});
		expect(bare).not.toHaveProperty("PROJECT_CWD");
		expect(bare).not.toHaveProperty("TASK_ID");

		const pinned = buildCodexChildEnv(
			{ PATH: "/bin" },
			{ workspaceDir: "/w", taskId: "t1" },
		);
		expect(pinned.PROJECT_CWD).toBe("/w");
		expect(pinned.TASK_ID).toBe("t1");
	});

	it("never mutates its input", () => {
		const base = { PATH: "/bin", OPENAI_API_KEY: "k" };
		buildCodexChildEnv(base, { workspaceDir: "/w" });
		expect(base).toEqual({ PATH: "/bin", OPENAI_API_KEY: "k" });
	});
});
