import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	assertSafeMuseArgs,
	buildMuseChildEnv,
	parseMuseExtraArgs,
	mapMuseExportToHistory,
	readHistoryFromDisk,
	MUSE_PROMPT_FILE_THRESHOLD_BYTES,
} from "./musePermissions.js";

const MUSE_DIR = path.dirname(fileURLToPath(import.meta.url));
const MOCK_MUSE = path.join(MUSE_DIR, "fixtures", "mock-muse.mjs");
const EXPORT_FIXTURE = path.join(MUSE_DIR, "fixtures", "muse-export.echo.json");

// Hermetic handles for the settings-dependent builders: resolveMuseSettings
// reads the validated config (an import-time snapshot of the environment),
// so the module is imported fresh with every KAINBAIN_MUSE_* var (plus the
// agent-timeout fallback) deleted — ambient env can never flip a "by
// default" assertion. The pure argv/env helpers above need no isolation and
// stay statically imported.
const MUSE_ENV_KEYS = [
	"KAINBAIN_MUSE_BIN",
	"KAINBAIN_MUSE_APPROVAL_MODE",
	"KAINBAIN_MUSE_YOLO",
	"KAINBAIN_MUSE_TRUST_WORKSPACE",
	"KAINBAIN_MUSE_NO_SESSION_LOG",
	"KAINBAIN_MUSE_TIMEOUT_MS",
	"KAINBAIN_MUSE_ARGS",
	"KAINBAIN_AGENT_TIMEOUT_MS",
];

let buildMuseSpawnPlan;
let resolveMuseSettings;

beforeAll(async () => {
	for (const key of MUSE_ENV_KEYS) vi.stubEnv(key, undefined);
	vi.resetModules();
	const permissions = await import("./musePermissions.js");
	buildMuseSpawnPlan = permissions.buildMuseSpawnPlan;
	resolveMuseSettings = permissions.resolveMuseSettings;
});

afterAll(() => {
	vi.unstubAllEnvs();
});

describe("muse spawn plan (safety-first)", () => {
	it("builds the minimal argv with workspace pin, approval mode, json, and yolo by default", async () => {
		const plan = await buildMuseSpawnPlan({
			prompt: "say hello",
			workspaceDir: "/tmp/ws",
			settings: { museBin: "muse" },
		});
		expect(plan.command).toBe("muse");
		expect(plan.args[0]).toBe("exec");
		expect(plan.args).toContain("--workspace");
		expect(plan.args[plan.args.indexOf("--workspace") + 1]).toBe("/tmp/ws");
		expect(plan.args).toContain("--approval-mode");
		expect(plan.args).toContain("--json");
		// Operator-chosen YOLO default (no approval UI exists yet).
		expect(plan.args).toContain("--yolo");
		expect(plan.args[plan.args.length - 2]).toBe("say hello");
		expect(plan.promptFile).toBeNull();
	});

	it("KAINBAIN_MUSE_BIN override reaches the spawn plan", async () => {
		const plan = await buildMuseSpawnPlan({
			prompt: "hi",
			workspaceDir: "/tmp/ws",
			settings: { museBin: "/tmp/mock-muse.mjs" },
		});
		expect(plan.command).toBe("/tmp/mock-muse.mjs");
	});

	it("refuses --yolo without the explicit opt-in", () => {
		expect(() =>
			assertSafeMuseArgs(["exec", "--workspace", "/w", "--yolo"], {}),
		).toThrow(/explicit opt-in/);
		expect(
			assertSafeMuseArgs(["exec", "--workspace", "/w", "--yolo"], {
				yolo: true,
			}),
		).toBe(true);
	});

	it("refuses a missing --workspace pin", () => {
		expect(() => assertSafeMuseArgs(["exec", "--json"], {})).toThrow(
			/--workspace/,
		);
	});

	it("omits --yolo only when explicitly disabled (opt-out restores sandbox-on)", async () => {
		const plan = await buildMuseSpawnPlan({
			prompt: "hi",
			workspaceDir: "/tmp/ws",
			settings: { yolo: false },
		});
		expect(plan.args).not.toContain("--yolo");
		expect(plan.args).toContain("--approval-mode");
	});

	it("adds --no-session-log and --trust-workspace only when set", async () => {
		const plain = await buildMuseSpawnPlan({
			prompt: "hi",
			workspaceDir: "/tmp/ws",
			settings: {},
		});
		expect(plain.args).not.toContain("--no-session-log");
		expect(plain.args).not.toContain("--trust-workspace");
		const flagged = await buildMuseSpawnPlan({
			prompt: "hi",
			workspaceDir: "/tmp/ws",
			settings: { noSessionLog: true, trustWorkspace: true },
		});
		expect(flagged.args).toContain("--no-session-log");
		expect(flagged.args).toContain("--trust-workspace");
	});

	it("pins --model only when a model is resolved", async () => {
		const plain = await buildMuseSpawnPlan({
			prompt: "hi",
			workspaceDir: "/tmp/ws",
			settings: {},
		});
		expect(plain.args).not.toContain("--model");
		const pinned = await buildMuseSpawnPlan({
			prompt: "hi",
			workspaceDir: "/tmp/ws",
			modelId: "some-model",
			settings: {},
		});
		expect(pinned.args).toContain("--model");
	});

	it("routes oversized prompts to --prompt-file with cleanup", async () => {
		const big = "x".repeat(MUSE_PROMPT_FILE_THRESHOLD_BYTES + 16);
		const plan = await buildMuseSpawnPlan({
			prompt: big,
			workspaceDir: "/tmp/ws",
			settings: {},
		});
		expect(plan.args).toContain("--prompt-file");
		expect(typeof plan.promptFile).toBe("string");
		expect(fs.existsSync(plan.promptFile)).toBe(true);
		expect(fs.readFileSync(plan.promptFile, "utf8")).toBe(big);
		await plan.cleanup();
		expect(fs.existsSync(plan.promptFile)).toBe(false);
	});

	it("redacts secret-shaped env names (redaction wins)", () => {
		const child = buildMuseChildEnv({
			PATH: "/bin",
			MUSE_CONFIG_DIR: "/home/u/.config/muse",
			MUSE_API_KEY: "s3cr3t",
			GITHUB_TOKEN: "t",
			UNRELATED: "drop me",
		});
		expect(child.PATH).toBe("/bin");
		expect(child.MUSE_CONFIG_DIR).toBe("/home/u/.config/muse");
		expect(child.MUSE_API_KEY).toBeUndefined();
		expect(child.GITHUB_TOKEN).toBeUndefined();
		expect(child.UNRELATED).toBeUndefined();
	});

	it("validates extra args without a shell", () => {
		expect(parseMuseExtraArgs("--max-model-steps 200")).toEqual([
			"--max-model-steps",
			"200",
		]);
		expect(() => parseMuseExtraArgs("--yolo")).toThrow(/explicit/);
		expect(() => parseMuseExtraArgs("--workspace /w")).toThrow(/harness owns/);
		expect(() => parseMuseExtraArgs("a|b")).toThrow(/never interpreted/);
	});

	it("resolveMuseSettings defaults to yolo (no approval UI yet)", () => {
		const s = resolveMuseSettings({ museBin: "muse" });
		expect(s.approvalMode).toBe("never");
		expect(s.yolo).toBe(true);
		expect(s.timeoutMs).toBe(1800000);
		expect(resolveMuseSettings({ yolo: false }).yolo).toBe(false);
	});

	it("reads KAINBAIN_MUSE_* overrides through the validated config", async () => {
		// Proves the env -> config -> settings wiring: a fresh module registry
		// sees only the stubbed vars, exactly like process boot.
		vi.stubEnv("KAINBAIN_MUSE_BIN", "/tmp/mock-muse.mjs");
		vi.stubEnv("KAINBAIN_MUSE_YOLO", "0");
		vi.stubEnv("KAINBAIN_MUSE_TIMEOUT_MS", "12345");
		try {
			vi.resetModules();
			const { resolveMuseSettings: freshResolve } = await import(
				"./musePermissions.js"
			);
			const s = freshResolve({});
			expect(s.bin).toBe("/tmp/mock-muse.mjs");
			expect(s.yolo).toBe(false);
			expect(s.timeoutMs).toBe(12345);
		} finally {
			vi.stubEnv("KAINBAIN_MUSE_BIN", undefined);
			vi.stubEnv("KAINBAIN_MUSE_YOLO", undefined);
			vi.stubEnv("KAINBAIN_MUSE_TIMEOUT_MS", undefined);
		}
	});

	it("fails fast at import on a malformed KAINBAIN_MUSE_* value", async () => {
		vi.stubEnv("KAINBAIN_MUSE_YOLO", "maybe");
		try {
			vi.resetModules();
			await expect(import("./musePermissions.js")).rejects.toThrow(
				"CONFIG KAINBAIN_MUSE_YOLO",
			);
		} finally {
			vi.stubEnv("KAINBAIN_MUSE_YOLO", undefined);
		}
	});
});

describe("mapMuseExportToHistory", () => {
	it("passes through a document that already carries messages", () => {
		const history = mapMuseExportToHistory({
			messages: [{ role: "user", content: "hi" }],
			tree: [{ id: "e1" }],
		});
		expect(history.messages).toEqual([{ role: "user", content: "hi" }]);
		expect(history.tree).toEqual([{ id: "e1" }]);
	});

	it("extracts message-bearing records from a nested export document", () => {
		const record = (payloadType, payload) => ({
			envelope: { payload_type: payloadType, payload },
		});
		const history = mapMuseExportToHistory({
			events: [
				record("runtime.session.permission_format_declared", { format: "profile_v1" }),
				record("turn.input.user", { prompt: "hello" }),
				record("run.output.delta", { text: "hello " }),
				record("run.output.delta", { text: "world" }),
				record("run.terminal.completed", { text: "hello world" }),
			],
		});
		// Deltas accumulate into ONE message and the authoritative terminal
		// text REPLACES the buffer — exactly one assistant message per turn.
		expect(history.messages).toEqual([
			{ role: "user", content: "hello" },
			{ role: "assistant", content: "hello world" },
		]);
	});

	it("keeps the accumulated deltas when no terminal text is authoritative", () => {
		const record = (payloadType, payload) => ({
			envelope: { payload_type: payloadType, payload },
		});
		const history = mapMuseExportToHistory({
			events: [
				record("run.output.delta", { text: "hello " }),
				record("run.output.delta", { text: "world" }),
				// A terminal row without text falls back to the buffer.
				record("run.terminal.completed", {}),
			],
		});
		expect(history.messages).toEqual([{ role: "assistant", content: "hello world" }]);
	});

	it("reads the user prompt from turn.input.user payload.prompt (or payload.text)", () => {
		const record = (payloadType, payload) => ({
			envelope: { payload_type: payloadType, payload },
		});
		const history = mapMuseExportToHistory({
			events: [record("turn.input.user", { text: "legacy shape" })],
		});
		expect(history.messages).toEqual([{ role: "user", content: "legacy shape" }]);
	});

	it("maps the REAL captured export (drift guard) to the exact conversation", () => {
		// fixtures/muse-export.echo.json is a real `muse export --redacted`
		// document (muse 1.4.9, echo provider) trimmed to its message-bearing
		// records plus noise. If muse changes the export shape, regenerate the
		// fixture and update this expectation.
		const document = JSON.parse(fs.readFileSync(EXPORT_FIXTURE, "utf8"));
		const history = mapMuseExportToHistory(document);
		expect(history.tree).toEqual([]);
		expect(history.messages).toEqual([
			{ role: "user", content: "Say hello in 3 words" },
			{ role: "assistant", content: "echo: Say hello in 3 words" },
			{ role: "user", content: "What is 2+2?" },
			{ role: "assistant", content: "echo: What is 2+2?" },
		]);
	});

	it("returns the honest empty history for unknown shapes", () => {
		expect(mapMuseExportToHistory({ events: [{ kind: "record" }] })).toEqual({
			messages: [],
			tree: [],
		});
		expect(mapMuseExportToHistory(null)).toEqual({ messages: [], tree: [] });
		expect(mapMuseExportToHistory("not a document")).toEqual({ messages: [], tree: [] });
		// A corrupt stringified child record is skipped, not fatal.
		expect(
			mapMuseExportToHistory({
				events: [
					{
						envelope: {
							children: [{ child_index: 0, record_json: "{corrupt" }],
						},
					},
				],
			}),
		).toEqual({ messages: [], tree: [] });
	});
});

describe("readHistoryFromDisk (hermetic, mock muse export)", () => {
	const MUSE_MOCK_ENV_KEYS = ["MUSE_MOCK_ARGV_LOG", "MUSE_MOCK_EXPORT_FAIL"];

	afterAll(() => {
		for (const key of MUSE_MOCK_ENV_KEYS) vi.stubEnv(key, undefined);
	});

	function makeTmpWorkspace() {
		return fs.mkdtempSync(path.join(os.tmpdir(), "muse-history-"));
	}

	function readArgvLog(logFile) {
		return fs
			.readFileSync(logFile, "utf8")
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line));
	}

	it("reads the workspace-latest session (--last) when the ref is a session DIRECTORY", async () => {
		const workspace = makeTmpWorkspace();
		const argvLog = path.join(workspace, "argv.jsonl");
		vi.stubEnv("MUSE_MOCK_ARGV_LOG", argvLog);
		try {
			// The engine passes the KainBain session DIRECTORY — not a muse id.
			const sessionDir = path.join(workspace, ".kainbain", "sessions");
			const history = await readHistoryFromDisk({
				sessionId: sessionDir,
				workspaceDir: workspace,
				settings: { bin: MOCK_MUSE },
			});
			expect(history.messages).toEqual([
				{ role: "user", content: "Say hello in 3 words" },
				{ role: "assistant", content: "echo: Say hello in 3 words" },
				{ role: "user", content: "What is 2+2?" },
				{ role: "assistant", content: "echo: What is 2+2?" },
			]);
			const logged = readArgvLog(argvLog);
			expect(logged).toHaveLength(1);
			expect(logged[0][0]).toBe("export");
			expect(logged[0]).toContain("--last");
			expect(logged[0]).toContain("--redacted");
			expect(logged[0]).not.toContain("--session");
		} finally {
			vi.stubEnv("MUSE_MOCK_ARGV_LOG", undefined);
			fs.rmSync(workspace, { recursive: true, force: true });
		}
	});

	it("scopes the export to --session <id> for a UUID-shaped ref", async () => {
		const workspace = makeTmpWorkspace();
		const argvLog = path.join(workspace, "argv.jsonl");
		vi.stubEnv("MUSE_MOCK_ARGV_LOG", argvLog);
		try {
			const sessionId = "01a0aa39-27b2-72c3-9a4e-43f8ddde8685";
			const history = await readHistoryFromDisk({
				sessionId,
				workspaceDir: workspace,
				settings: { bin: MOCK_MUSE },
			});
			expect(history.messages.length).toBe(4);
			const logged = readArgvLog(argvLog);
			expect(logged[0]).toContain("--session");
			expect(logged[0]).toContain(sessionId);
			expect(logged[0]).not.toContain("--last");
		} finally {
			vi.stubEnv("MUSE_MOCK_ARGV_LOG", undefined);
			fs.rmSync(workspace, { recursive: true, force: true });
		}
	});

	it("degrades to the honest empty history when the export fails", async () => {
		const workspace = makeTmpWorkspace();
		vi.stubEnv("MUSE_MOCK_EXPORT_FAIL", "1");
		try {
			const history = await readHistoryFromDisk({
				workspaceDir: workspace,
				settings: { bin: MOCK_MUSE },
			});
			expect(history).toEqual({ messages: [], tree: [] });
		} finally {
			vi.stubEnv("MUSE_MOCK_EXPORT_FAIL", undefined);
			fs.rmSync(workspace, { recursive: true, force: true });
		}
	});

	it("degrades to the honest empty history when the binary is missing", async () => {
		const workspace = makeTmpWorkspace();
		try {
			const history = await readHistoryFromDisk({
				workspaceDir: workspace,
				settings: { bin: "/nonexistent/muse" },
			});
			expect(history).toEqual({ messages: [], tree: [] });
		} finally {
			fs.rmSync(workspace, { recursive: true, force: true });
		}
	});
});
