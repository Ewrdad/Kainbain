/**
 * @fileoverview Contract tests for the codex harness theoretical shim.
 *   The engine drives every harness through `createSession` + `prompt`
 *   (api/agentRunner.js) — so this gate proves THAT path: the honest
 *   "not installed" reply, the normalized event stream, and zero spawns
 *   (the shim imports no child_process surface at all). No real codex
 *   binary is spawned on this device.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	CODEX_NOT_INSTALLED_HINT,
	HARNESS_ID,
	createCodexHarness,
} from "./codexHarness.js";
import { runSessionContractTests } from "../../sessionContract.test.js";

const tmpRoots = [];
afterEach(() => {
	while (tmpRoots.length > 0) {
		const root = tmpRoots.pop();
		fs.rmSync(root, { recursive: true, force: true });
	}
});

function testProject() {
	return { id: "p", cwd: process.cwd() };
}

describe(`codexHarness.contract (${HARNESS_ID})`, () => {
	let harness;

	beforeEach(() => {
		harness = createCodexHarness({});
	});

	it("exposes the harness id and description", () => {
		expect(harness.id).toBe(HARNESS_ID);
		expect(typeof harness.description).toBe("string");
		expect(harness.description.length).toBeGreaterThan(0);
	});

	it("declares modelSelection 'list' with an honestly empty catalogue", async () => {
		expect(harness.modelSelection).toBe("list");
		await expect(harness.listModels()).resolves.toEqual([]);
		await expect(harness.resolveModelRef("codex::a::b")).resolves.toBeNull();
		await expect(harness.readHistoryFromDisk(testProject())).resolves.toEqual({
			messages: [],
			tree: [],
		});
	});

	it("requires a project cwd (fail-fast, muse parity)", async () => {
		await expect(harness.createSession(null)).rejects.toThrow(/cwd/);
		await expect(harness.createSession({})).rejects.toThrow(/cwd/);
	});

	it("prompt() replies with the honest setup hint (never silent success)", async () => {
		const session = await harness.createSession(testProject(), {
			taskId: "t",
			stageId: "s",
		});
		const reply = await session.prompt("Do the work");
		expect(reply).toBe(CODEX_NOT_INSTALLED_HINT);
		expect(session.getLastAssistantText()).toBe(CODEX_NOT_INSTALLED_HINT);

		const messages = session.getMessages();
		expect(messages).toEqual([
			{ role: "user", content: "Do the work" },
			{ role: "assistant", content: CODEX_NOT_INSTALLED_HINT },
		]);
	});

	it("prompt() streams assistant_delta then run_finished (normalized vocabulary)", async () => {
		const session = await harness.createSession(testProject());
		const seen = [];
		const unsub = session.subscribe((event) => seen.push(event));
		const chunks = [];
		await session.prompt("Say hello", { onChunk: (chunk) => chunks.push(chunk) });
		unsub();

		expect(seen.map((e) => e.type)).toEqual([
			"run_started",
			"assistant_delta",
			"run_finished",
		]);
		expect(chunks).toEqual([CODEX_NOT_INSTALLED_HINT]);
		expect(session.isStreaming).toBe(false);
	});

	it("prompt() rejects non-string input and prompts after dispose", async () => {
		const session = await harness.createSession(testProject());
		await expect(session.prompt(null)).rejects.toThrow(TypeError);
		await session.dispose();
		await expect(session.prompt("late")).rejects.toThrow(/disposed/);
		// Disposing twice never rejects (TTL sweep + explicit dispose race).
		await session.dispose();
	});

	it("switchModel() never claims a switch on the empty catalogue", async () => {
		const session = await harness.createSession(testProject());
		await expect(session.switchModel("codex::a::b")).resolves.toBeNull();
		await expect(session.getActiveModel()).resolves.toBeNull();
	});

	it("reports CODEX_BIN_MISSING with the setup hint for a missing binary", () => {
		const missing = createCodexHarness({
			codexBin: path.join(os.tmpdir(), "kainbain-definitely-missing-codex"),
		});
		const status = missing.getModelDiscoveryStatus();
		expect(status.ok).toBe(false);
		expect(status.error.code).toBe("CODEX_BIN_MISSING");
		expect(status.error.hint).toContain("KAINBAIN_CODEX_BIN");
	});

	it("reports ok when the configured binary exists (fixture executable)", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-harness-"));
		tmpRoots.push(root);
		const bin = path.join(root, "codex");
		fs.writeFileSync(bin, "#!/bin/sh\nexit 0\n");
		fs.chmodSync(bin, 0o755);

		const status = createCodexHarness({ codexBin: bin }).getModelDiscoveryStatus();
		expect(status).toEqual({ ok: true });
	});

	it("exposes no spawn-capable surface (theoretical shim)", async () => {
		// The engine path is createSession + prompt; a `runSession` entry
		// point would be dead surface that drifts from the contract.
		expect(harness.runSession).toBeUndefined();
		expect(typeof harness.createSession).toBe("function");
	});
});

runSessionContractTests({
	name: "codex harness (theoretical shim)",
	createSession: async () => {
		const h = createCodexHarness({});
		return h.createSession({ id: "p", cwd: process.cwd() }, { taskId: "t", stageId: "s" });
	},
});
