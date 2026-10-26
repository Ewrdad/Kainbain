import { describe, it, expect, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { runSessionContractTests } from "../../sessionContract.test.js";
import { AcpSessionWrapper } from "../acp/AcpSessionWrapper.js";
import { createVibeHarness, selectVibeTransport } from "./vibeHarness.js";

/**
 * MARK: vibeHarness ACP integration tests
 * @description The Tier-2 path end to end (no real vibe-acp install, no
 *   network, no LLM call): the harness factory pointed at the generic mock
 *   ACP agent drives a long-lived bidirectional session — transport
 *   selection, normalized event streaming, live usage telemetry, permission
 *   interception, the swallowed-502 filter, session-mode setting, model
 *   pinning over session/set_config_option, steering, abort, and classified
 *   startup failures. The shared session conformance suite runs against the
 *   SAME ACP-backed sessions (the gate the exec path passes in
 *   vibeHarness.contract.test.js — the rollback can never rot).
 */

const VIBE_DIR = path.dirname(fileURLToPath(import.meta.url));
const MOCK_ACP_AGENT = path.join(
	VIBE_DIR,
	"..",
	"acp",
	"fixtures",
	"mock-acp-agent.mjs",
);

/***
 * MARK: makeWorkspace
 * @description Builds a workspace directory the ACP child runs in and
 *   registers it for afterEach cleanup (ephemeral everything, no ports).
 ***/
const workspaces = [];
function makeWorkspace(label) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), `vibe-acp-${label}-`));
	workspaces.push(dir);
	return dir;
}

/***
 * MARK: makeAcpHarness
 * @description Builds a harness with the ACP path engaged (acpBin mock +
 *   the mock's env knobs injected through the acpEnv test seam) and a
 *   capturing event bridge for [VIBE ACP] diagnostic assertions.
 ***/
function makeAcpHarness(overrides = {}) {
	const logged = [];
	const harness = createVibeHarness({
		acpBin: MOCK_ACP_AGENT,
		acpEnv: { ACP_MOCK_MODE: "success" },
		eventBridge: { emitSystemLog: (...args) => logged.push(args) },
		...overrides,
	});
	return { harness, logged };
}

async function makeAcpSession(harness, label = "ws", meta = {}) {
	const workspace = makeWorkspace(label);
	const session = await harness.createSession(
		{ id: `proj-${label}`, cwd: workspace, name: `Project ${label}` },
		{ taskId: "t-acp", stageId: "s-acp", ...meta },
	);
	return { session, workspace };
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

runSessionContractTests({
	name: "vibe harness (ACP session, mock agent)",
	createSession: async () => {
		const { harness } = makeAcpHarness();
		const { session } = await makeAcpSession(harness, `conformance-${Date.now()}`);
		return session;
	},
});

describe("vibe transport selection (selectVibeTransport)", () => {
	it("on forces ACP and off forces exec regardless of the endpoint", () => {
		expect(selectVibeTransport({ acpMode: "on" })).toBe("acp");
		expect(selectVibeTransport({ acpMode: "off", acpBin: "/bin/mock" })).toBe("exec");
	});

	it("auto engages ACP when an explicit ACP bin is configured", () => {
		expect(selectVibeTransport({ acpMode: "auto", acpBin: "/bin/mock" })).toBe("acp");
	});

	it("auto engages ACP when the vibe-acp sibling of the vibe binary exists", () => {
		expect(
			selectVibeTransport(
				{ acpMode: "auto", bin: "/home/u/.local/bin/vibe" },
				{ existsFn: (candidate) => candidate === "/home/u/.local/bin/vibe-acp" },
			),
		).toBe("acp");
	});

	it("auto stays on exec when neither resolves (a bare PATH name never auto-engages)", () => {
		expect(
			selectVibeTransport({ acpMode: "auto", bin: "vibe" }, { existsFn: () => true }),
		).toBe("exec");
	});
});

describe("vibe ACP session (mock agent)", () => {
	it("creates ACP-backed sessions when the transport is ACP", async () => {
		const { harness } = makeAcpHarness();
		const { session } = await makeAcpSession(harness, "transport");
		expect(session).toBeInstanceOf(AcpSessionWrapper);
		expect(session.harnessId).toBe("vibe");
		await session.dispose();
	});

	it("stays on the exec path without an ACP endpoint (auto default)", async () => {
		// Hermetic: point the vibe binary at a path with no vibe-acp sibling
		// so the auto sibling probe cannot pick up the host's real install.
		const workspace = makeWorkspace("exec-default");
		const plain = createVibeHarness({
			eventBridge: { emitSystemLog: () => {} },
			vibeBin: path.join(workspace, "no-such-vibe"),
		});
		const session = await plain.createSession({ id: "proj-exec", cwd: workspace }, {});
		expect(session).not.toBeInstanceOf(AcpSessionWrapper);
		await session.dispose();
	});

	it("honors acpMode off even with an endpoint configured (the rollback)", async () => {
		const { harness } = makeAcpHarness({ acpMode: "off" });
		const { session } = await makeAcpSession(harness, "forced-exec");
		expect(session).not.toBeInstanceOf(AcpSessionWrapper);
		await session.dispose();
	});

	it("streams NORMALIZED events incl. the tool triplet over one live session", async () => {
		const { harness, logged } = makeAcpHarness();
		const { session } = await makeAcpSession(harness, "events");
		const seen = [];
		session.subscribe((event) => seen.push(event));
		const reply = await session.prompt("Say hello");
		expect(reply).toContain("Say hello");
		const types = seen.map((event) => event?.type);
		expect(types).toContain("run_started");
		expect(types).toContain("message_started");
		expect(types).toContain("assistant_delta");
		expect(types).toContain("tool_started");
		expect(types).toContain("tool_updated");
		expect(types).toContain("tool_finished");
		expect(types).toContain("run_finished");
		// The session start is diagnosed on the bridge with the [VIBE ACP] tag.
		expect(logged.some((args) => String(args).includes("[VIBE ACP]"))).toBe(true);
		await session.dispose();
	});

	it("logs the live usage telemetry the agent streams (usage_update)", async () => {
		const { harness, logged } = makeAcpHarness();
		const { session } = await makeAcpSession(harness, "usage");
		await session.prompt("Spend some tokens");
		const bridgeText = logged.map((args) => String(args)).join("\n");
		expect(bridgeText).toContain("ACP usage update");
		expect(bridgeText).toContain("cost_usd=0.012");
		expect(bridgeText).toContain("steps=1");
		expect(session.getLastUsage()).toMatchObject({
			totalTokens: 1200,
			costUsd: 0.012,
		});
		await session.dispose();
	});

	it("auto-approves the mid-turn permission gate under the auto-approve default", async () => {
		const { harness, logged } = makeAcpHarness();
		const { session } = await makeAcpSession(harness, "permit");
		const seen = [];
		session.subscribe((event) => seen.push(event));
		await session.prompt("Needs approval");
		expect(seen.some((event) => event?.type === "run_finished")).toBe(true);
		expect(seen.some((event) => event?.type === "run_error")).toBe(false);
		const bridgeText = logged.map((args) => String(args)).join("\n");
		expect(bridgeText).toContain("permission requested");
		expect(bridgeText).toContain("permission resolved");
		await session.dispose();
	});

	it("cancels deny-safe when auto-approve is off (no approval UI exists yet)", async () => {
		const { harness } = makeAcpHarness({ autoApprove: false });
		const { session } = await makeAcpSession(harness, "deny");
		const seen = [];
		session.subscribe((event) => seen.push(event));
		await session.prompt("Needs approval");
		const terminal = seen.at(-1);
		expect(terminal).toMatchObject({ type: "run_finished", interrupted: true });
		expect(seen.some((event) => event?.type === "run_error")).toBe(false);
		await session.dispose();
	});

	it("sets the session mode on creation (auto-approve by default, ask when off)", async () => {
		const configLog = path.join(makeWorkspace("mode-default"), "config.jsonl");
		const { harness } = makeAcpHarness({ acpEnv: { ACP_MOCK_MODE: "success", ACP_MOCK_CONFIG_LOG: configLog } });
		const { session } = await makeAcpSession(harness, "mode-default");
		await session.prompt("First turn");
		// eslint-disable-next-line security/detect-non-literal-fs-filename -- config log lives in the test's throwaway tmp workspace
		const calls = fs.readFileSync(configLog, "utf8").trim().split("\n").map((line) => JSON.parse(line));
		expect(calls[0]).toMatchObject({ method: "session/set_mode", modeId: "auto-approve" });
		await session.dispose();

		const askLog = path.join(makeWorkspace("mode-ask"), "config.jsonl");
		const { harness: askHarness } = makeAcpHarness({
			autoApprove: false,
			acpEnv: { ACP_MOCK_MODE: "success", ACP_MOCK_CONFIG_LOG: askLog },
		});
		const { session: askSession } = await makeAcpSession(askHarness, "mode-ask");
		await askSession.prompt("First turn");
		// eslint-disable-next-line security/detect-non-literal-fs-filename -- config log lives in the test's throwaway tmp workspace
		const askCalls = fs.readFileSync(askLog, "utf8").trim().split("\n").map((line) => JSON.parse(line));
		expect(askCalls[0]).toMatchObject({ method: "session/set_mode", modeId: "ask" });
		await askSession.dispose();
	});

	it("pins the dispatch-resolved model via session/set_config_option, not prompt params", async () => {
		const configLog = path.join(makeWorkspace("modelpin"), "config.jsonl");
		const promptLog = path.join(makeWorkspace("modelpin"), "prompts.jsonl");
		const { harness } = makeAcpHarness({
			acpEnv: { ACP_MOCK_MODE: "success", ACP_MOCK_CONFIG_LOG: configLog, ACP_MOCK_PROMPT_LOG: promptLog },
		});
		const { session } = await makeAcpSession(harness, "modelpin", {
			model: "vibe::mistral::mock-model-b",
		});
		expect(await session.getActiveModel()).toMatchObject({ id: "mock-model-b" });
		await session.prompt("Pinned run");
		// eslint-disable-next-line security/detect-non-literal-fs-filename -- logs live in the test's throwaway tmp workspace
		const configCalls = fs.readFileSync(configLog, "utf8").trim().split("\n").map((line) => JSON.parse(line));
		const pin = configCalls.find((call) => call.method === "session/set_config_option");
		expect(pin).toMatchObject({
			configId: "model",
			value: "mock-model-b",
		});
		// The model is applied ONCE (the pinned model rides the session, not
		// the prompt params — vibe ignores those).
		// eslint-disable-next-line security/detect-non-literal-fs-filename -- logs live in the test's throwaway tmp workspace
		const prompts = fs.readFileSync(promptLog, "utf8").trim().split("\n").map((line) => JSON.parse(line));
		expect(prompts).toHaveLength(1);
		expect(prompts[0].model).toBeUndefined();
		await session.dispose();
	});

	it("switchModel() re-pins on the live session through the hook", async () => {
		const { harness } = makeAcpHarness();
		const { session } = await makeAcpSession(harness, "switchmodel");
		await expect(session.switchModel("mock-model-a")).resolves.toMatchObject({
			id: "mock-model-a",
		});
		expect(await session.getActiveModel()).toMatchObject({ id: "mock-model-a" });
		await session.dispose();
	});

	it("warns and keeps the session default when the model is unresolvable (never a silent swap)", async () => {
		const { harness, logged } = makeAcpHarness();
		const { session } = await makeAcpSession(harness, "unresolvable", {
			model: "vibe::mistral::not-a-model",
		});
		const bridgeText = logged.map((args) => String(args)).join("\n");
		expect(bridgeText).toContain("not-a-model");
		expect(await session.getActiveModel()).toBeNull();
		await session.dispose();
	});

	it("serves the live model list + discovery health through the session", async () => {
		const { harness } = makeAcpHarness();
		const { session } = await makeAcpSession(harness, "models");
		const models = await session.listModels();
		expect(models.map((m) => m.id).sort()).toEqual(["mock-model-a", "mock-model-b"]);
		expect(models[0]).toMatchObject({ provider: "mistral", harness: "vibe" });
		expect(await session.getModelDiscoveryStatus()).toEqual({ ok: true });
		expect(await session.resolveModelRef("mock-model-a")).toMatchObject({ id: "mock-model-a" });
		expect(await session.resolveModelRef("no-such-model")).toBeNull();
		await session.dispose();
	});

	it("traps the swallowed 502 as run_error (never a clean completion)", async () => {
		const { harness } = makeAcpHarness({ acpEnv: { ACP_MOCK_MODE: "502_error" } });
		const { session } = await makeAcpSession(harness, "swallowed-502");
		const seen = [];
		session.subscribe((event) => seen.push(event));
		const reply = await session.prompt("Doomed turn");
		expect(reply).toContain("502");
		const errors = seen.filter((event) => event?.type === "run_error");
		expect(errors).toHaveLength(1);
		expect(errors[0].error).toContain("502");
		expect(seen.some((event) => event?.type === "run_finished")).toBe(false);
		await session.dispose();
	});

	it("keeps conversation continuity across prompts in one ACP session", async () => {
		const promptLog = path.join(makeWorkspace("continuity"), "prompts.jsonl");
		const { harness } = makeAcpHarness({
			acpEnv: { ACP_MOCK_MODE: "success", ACP_MOCK_PROMPT_LOG: promptLog },
		});
		const { session } = await makeAcpSession(harness, "continuity");
		await session.prompt("First turn");
		await session.prompt("Second turn");
		const messages = session.getMessages();
		expect(messages.filter((m) => m.role === "user")).toHaveLength(2);
		expect(messages.filter((m) => m.role === "assistant")).toHaveLength(2);
		expect(session.getLastAssistantText()).toContain("Second turn");
		// Both turns rode the SAME agent session (one stable session id).
		// eslint-disable-next-line security/detect-non-literal-fs-filename -- prompt log lives in the test's throwaway tmp workspace
		const loggedPrompts = fs
			.readFileSync(promptLog, "utf8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		expect(loggedPrompts).toHaveLength(2);
		expect(loggedPrompts[0].sessionId).toBe("mock-acp-session-1");
		expect(loggedPrompts[1].sessionId).toBe("mock-acp-session-1");
		await session.dispose();
	});

	it("steer()/followUp() are best-effort and resolve Tier-2 statuses", async () => {
		const { harness, logged } = makeAcpHarness();
		const { session } = await makeAcpSession(harness, "steer");
		await expect(session.steer("Focus on the API layer")).resolves.toEqual({
			status: "steered",
		});
		await expect(session.followUp("Add tests for that")).resolves.toEqual({
			status: "followed_up",
		});
		const texts = session.getMessages().map((m) => m.content);
		expect(texts.some((t) => t.includes("Focus on the API layer"))).toBe(true);
		expect(texts.some((t) => t.includes("Add tests for that"))).toBe(true);
		// A steer the agent does not accept is logged, never crashed on.
		await session.prompt("Now run");
		const bridgeText = logged.map((args) => String(args)).join("\n");
		expect(bridgeText).not.toContain("[ERROR]");
		await session.dispose();
	});

	it("aborts a slow turn: the child dies and the turn settles as aborted", async () => {
		const { harness } = makeAcpHarness({
			acpEnv: { ACP_MOCK_MODE: "success", ACP_MOCK_CHUNK_DELAY_MS: "150" },
		});
		const { session } = await makeAcpSession(harness, "abort");
		const seen = [];
		session.subscribe((event) => seen.push(event));
		const promptPromise = session.prompt("Slow reply");
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(session.isStreaming).toBe(true);
		await session.abort();
		await expect(promptPromise).resolves.toBeDefined();
		expect(session.isStreaming).toBe(false);
		expect(seen.at(-1)).toMatchObject({ type: "run_finished", interrupted: true });
		expect(seen.some((event) => event?.type === "run_error")).toBe(false);
		await session.dispose();
	});

	it("classifies a missing ACP binary with its fix hint (VIBE_ACP_BIN_MISSING)", async () => {
		const { harness, logged } = makeAcpHarness({
			acpBin: "/nonexistent/vibe-acp-xyz",
		});
		const { session } = await makeAcpSession(harness, "missing-bin");
		const seen = [];
		session.subscribe((event) => seen.push(event));
		await expect(session.prompt("Never starts")).resolves.toBe("");
		expect(seen).toHaveLength(1);
		expect(seen[0].type).toBe("run_error");
		const bridgeText = logged.map((args) => String(args)).join("\n");
		expect(bridgeText).toContain("VIBE_ACP_BIN_MISSING");
		expect(bridgeText).toContain("KAINBAIN_VIBE_ACP_BIN");
		await session.dispose();
	});

	it("times out a hung handshake instead of pinning session creation", async () => {
		const { harness } = makeAcpHarness({
			acpStartTimeoutMs: 300,
			acpEnv: { ACP_MOCK_MODE: "hang_handshake" },
		});
		const { session } = await makeAcpSession(harness, "hang");
		const seen = [];
		session.subscribe((event) => seen.push(event));
		await expect(session.prompt("Never answers")).resolves.toBe("");
		expect(seen).toHaveLength(1);
		expect(seen[0].type).toBe("run_error");
		expect(seen[0].error).toMatch(/timed out after 300ms/);
		await session.dispose();
	});

	it("never leaks prompt text into any [VIBE ACP] log line", async () => {
		const { harness, logged } = makeAcpHarness();
		const { session } = await makeAcpSession(harness, "log-hygiene");
		const secretPrompt = "TOP-SECRET-PROMPT-MARKER-9f1c";
		await session.prompt(secretPrompt);
		const bridgeText = logged.map((args) => String(args)).join("\n");
		expect(bridgeText).not.toContain(secretPrompt);
		await session.dispose();
	});

	it("surfaces an untrusted workspace as a warning without failing or persisting trust", async () => {
		const { harness, logged } = makeAcpHarness({
			acpEnv: { ACP_MOCK_MODE: "success", ACP_MOCK_WORKSPACE_TRUST: "untrusted" },
		});
		const { session } = await makeAcpSession(harness, "trust");
		const seen = [];
		session.subscribe((event) => seen.push(event));
		// Non-fatal: the turn still runs to completion.
		await expect(session.prompt("Trust check")).resolves.toContain("Trust check");
		expect(seen.some((event) => event?.type === "run_finished")).toBe(true);
		expect(seen.some((event) => event?.type === "run_error")).toBe(false);
		const bridgeText = logged.map((args) => String(args)).join("\n");
		expect(bridgeText).toContain("untrusted");
		expect(bridgeText).toContain("AGENTS.md");
		// The flavor never auto-answers trust/decision (a persistent write).
		expect(bridgeText).not.toContain("trust/decision");
		await session.dispose();
	});

	it("probeHealth succeeds on ACP transport when ACP agent is available", async () => {
		const binDir = makeWorkspace("probe-health-bin");
		const versionFixture = path.join(binDir, "vibe");
		// eslint-disable-next-line security/detect-non-literal-fs-filename -- fixture lives in the test's throwaway tmp workspace
		fs.writeFileSync(
			versionFixture,
			'#!/bin/sh\nif [ "$1" = "--version" ]; then echo "vibe 3.0.2 (fixture)"; exit 0; fi\nexit 1\n',
		);
		// eslint-disable-next-line security/detect-non-literal-fs-filename -- fixture lives in the test's throwaway tmp workspace
		fs.chmodSync(versionFixture, 0o755);
		const { harness } = makeAcpHarness({
			vibeBin: versionFixture,
			acpBin: MOCK_ACP_AGENT,
		});
		const health = await harness.probeHealth();
		expect(health.status).toBe("ok");
		expect(health.transport).toBe("acp");
		expect(health.acpBinary).toBe(MOCK_ACP_AGENT);
	});

	it("tolerates projects without a name in resolveInitialModel and createSession", async () => {
		const { harness } = makeAcpHarness();
		const anonProject = { id: "proj-anon", defaultModel: "vibe::mistral::not-found" };
		const resolved = await harness.resolveInitialModel(anonProject);
		expect(resolved).toBeNull();

		const workspace = makeWorkspace("anon-proj");
		const session = await harness.createSession(
			{ id: "proj-anon", cwd: workspace },
			{ model: "vibe::mistral::not-found" },
		);
		expect(session).toBeInstanceOf(AcpSessionWrapper);
		await session.dispose();
	});
});
