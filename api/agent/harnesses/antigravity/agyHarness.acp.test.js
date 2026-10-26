import { describe, it, expect, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { runSessionContractTests } from "../../sessionContract.test.js";
import { AcpSessionWrapper } from "../acp/AcpSessionWrapper.js";
import { createAntigravityHarness } from "./agyHarness.js";

/**
 * MARK: agyHarness ACP integration tests
 * @description The Tier-2 path end to end (no real CLI, no network): the
 *   harness factory pointed at the mock ACP agent drives a long-lived
 *   bidirectional session — normalized event streaming, permission
 *   interception, the swallowed-502 filter, steering, model pinning, and
 *   classified startup failures. The shared session conformance suite runs
 *   against the same ACP-backed sessions (the gate the exec path passes).
 */

const MOCK_AGY = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	"fixtures",
	"mock-agy.mjs",
);
const MOCK_ACP_AGENT = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
	"acp",
	"fixtures",
	"mock-acp-agent.mjs",
);

/***
 * MARK: makeWorkspace
 * @description Builds a workspace directory the ACP child runs in and
 *   registers it for afterEach cleanup.
 ***/
const workspaces = [];
function makeWorkspace(label) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), `agy-acp-${label}-`));
	workspaces.push(dir);
	return dir;
}

/***
 * MARK: makeAcpHarness
 * @description Builds a harness with the ACP path engaged (acpBin mock) and
 *   a capturing event bridge for `[AGY ACP]` diagnostic assertions.
 ***/
function makeAcpHarness(overrides = {}) {
	const logged = [];
	const harness = createAntigravityHarness({
		agyBin: MOCK_AGY,
		acpBin: MOCK_ACP_AGENT,
		eventBridge: { emitSystemLog: (...args) => logged.push(args) },
		...overrides,
	});
	return { harness, logged };
}

async function makeAcpSession(harness, label = "ws", meta = {}) {
	const workspace = makeWorkspace(label);
	const session = await harness.createSession(
		{ id: `proj-${label}`, cwd: workspace },
		{ taskId: "t-acp", stageId: "s-acp", ...meta },
	);
	return { session, workspace };
}

afterEach(async () => {
	delete process.env.AGY_ACP_MOCK_MODE;
	delete process.env.AGY_ACP_MOCK_CHUNK_DELAY_MS;
	delete process.env.AGY_ACP_MOCK_PROMPT_LOG;
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
	name: "antigravity harness (ACP session, mock agent)",
	createSession: async () => {
		const { harness } = makeAcpHarness();
		const { session } = await makeAcpSession(harness, `conformance-${Date.now()}`);
		return session;
	},
});

describe("antigravity ACP session (mock agent)", () => {
	it("creates ACP-backed sessions when an ACP endpoint is configured", async () => {
		const { harness } = makeAcpHarness();
		const { session } = await makeAcpSession(harness, "transport");
		expect(session).toBeInstanceOf(AcpSessionWrapper);
		expect(session.harnessId).toBe("antigravity");
		await session.dispose();
	});

	it("stays on the exec path without an ACP endpoint (auto default)", async () => {
		const plain = createAntigravityHarness({ agyBin: MOCK_AGY });
		const workspace = makeWorkspace("exec-default");
		const session = await plain.createSession({ id: "proj-exec", cwd: workspace }, {});
		expect(session).not.toBeInstanceOf(AcpSessionWrapper);
		await session.dispose();
	});

	it("honors acpMode off even with an endpoint configured", async () => {
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
		// The session start is diagnosed on the bridge with the [AGY ACP] tag.
		expect(logged.some((args) => String(args).includes("[AGY ACP]"))).toBe(true);
		await session.dispose();
	});

	it("auto-approves the mid-turn permission gate under the YOLO default", async () => {
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

	it("cancels deny-safe when YOLO is off (no approval UI exists yet)", async () => {
		const { harness } = makeAcpHarness({ skipPermissions: false });
		const { session } = await makeAcpSession(harness, "deny");
		const seen = [];
		session.subscribe((event) => seen.push(event));
		await session.prompt("Needs approval");
		const terminal = seen.at(-1);
		expect(terminal).toMatchObject({ type: "run_finished", interrupted: true });
		expect(seen.some((event) => event?.type === "run_error")).toBe(false);
		await session.dispose();
	});

	it("traps the swallowed 502 as run_error (never a clean completion)", async () => {
		process.env.AGY_ACP_MOCK_MODE = "502_error";
		const { harness } = makeAcpHarness();
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
		process.env.AGY_ACP_MOCK_PROMPT_LOG = promptLog;
		const { harness } = makeAcpHarness();
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

	it("steer()/followUp() resolve Tier-2 statuses and record the guidance", async () => {
		const { harness } = makeAcpHarness();
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
		await session.dispose();
	});

	it("pins switchModel() for subsequent turns on the live session", async () => {
		const promptLog = path.join(makeWorkspace("modelpin"), "prompts.jsonl");
		process.env.AGY_ACP_MOCK_PROMPT_LOG = promptLog;
		const { harness } = makeAcpHarness();
		const { session } = await makeAcpSession(harness, "modelpin");
		await session.switchModel("gemini-3.1-pro-high");
		expect(await session.getActiveModel()).toMatchObject({ id: "gemini-3.1-pro-high" });
		await session.prompt("Pinned run");
		// eslint-disable-next-line security/detect-non-literal-fs-filename -- prompt log lives in the test's throwaway tmp workspace
		const loggedPrompts = fs
			.readFileSync(promptLog, "utf8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		expect(loggedPrompts).toHaveLength(1);
		expect(loggedPrompts[0].model).toMatchObject({
			provider: "antigravity",
			id: "gemini-3.1-pro-high",
		});
		await session.dispose();
	});

	it("aborts a slow turn: the child dies and the turn settles as aborted", async () => {
		process.env.AGY_ACP_MOCK_CHUNK_DELAY_MS = "150";
		const { harness } = makeAcpHarness();
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

	it("classifies a missing ACP binary with its fix hint (AGY_BIN_MISSING)", async () => {
		const { harness, logged } = makeAcpHarness({
			acpBin: "/nonexistent/agy-acp-xyz",
		});
		const { session } = await makeAcpSession(harness, "missing-bin");
		const seen = [];
		session.subscribe((event) => seen.push(event));
		await expect(session.prompt("Never starts")).resolves.toBe("");
		expect(seen).toHaveLength(1);
		expect(seen[0].type).toBe("run_error");
		const bridgeText = logged.map((args) => String(args)).join("\n");
		expect(bridgeText).toContain("AGY_BIN_MISSING");
		expect(bridgeText).toContain("KAINBAIN_AGY_BIN");
		await session.dispose();
	});

	it("times out a hung handshake instead of pinning session creation", async () => {
		process.env.AGY_ACP_MOCK_MODE = "hang_handshake";
		const { harness } = makeAcpHarness({ acpStartTimeoutMs: 300 });
		const { session } = await makeAcpSession(harness, "hang");
		const seen = [];
		session.subscribe((event) => seen.push(event));
		await expect(session.prompt("Never answers")).resolves.toBe("");
		expect(seen).toHaveLength(1);
		expect(seen[0].type).toBe("run_error");
		expect(seen[0].error).toMatch(/timed out after 300ms/);
		await session.dispose();
	});

	it("reports discovery health through the session", async () => {
		const { harness } = makeAcpHarness();
		const { session } = await makeAcpSession(harness, "discovery");
		expect(await session.getModelDiscoveryStatus()).toEqual({ ok: true });
		expect(await session.resolveModelRef("gemini-3.1-pro-high")).toMatchObject({
			id: "gemini-3.1-pro-high",
		});
		expect(await session.resolveModelRef("no-such-model")).toBeNull();
		await session.dispose();
	});
});
