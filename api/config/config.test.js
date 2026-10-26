import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	CONFIG_GROUPS,
	CONFIG_SCHEMA,
	ConfigError,
	loadConfig,
	parseTypedValue,
} from "./schema.js";
import { getConfigSpec } from "./index.js";
import { renderEnvExample } from "../../scripts/generate-env-example.mjs";

/**
 * MARK: Config unit tests
 * @description Verifies the schema-driven configuration engine: every default,
 *   fail-fast enforcement with clear diagnostics, type conversion, deprecated
 *   alias policy, chained defaults, cross-field warnings, and the generated
 *   `.env.example` coverage contract.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const ENV_EXAMPLE_PATH = path.join(REPO_ROOT, ".env.example");

/***
 * MARK: loadQuietly
 * @description Loads a bare env object through the schema, collecting warnings
 *   instead of printing them.
 * @example loadQuietly({ PORT: "1" }).config.port => 1
 ***/
function loadQuietly(env) {
	const warnings = [];
	const result = loadConfig(env, { onWarning: (message) => warnings.push(message) });
	return { ...result, warnings };
}

describe("config defaults (clean env boots on valid defaults)", () => {
	const expectedDefaults = {
		// Server & Network
		port: 3100,
		host: "0.0.0.0",
		publicKbUrl: "http://localhost:3100",
		corsAllowedOrigins: [],
		nodeEnv: "development",
		serverRequestTimeoutMs: 0,
		vapidSubject: "mailto:admin@kainbain.local",
		// Storage & Paths
		projectsRoot: "/home/server/projects",
		notesSpaceRoot: "/home/server/apps/notes/silverbullet/space/Projects/Personal",
		projectsRoots: [],
		projectsRegistryFile: path.join(os.homedir(), ".kainbain", "projects.json"),
		seedSampleProjects: false,
		piAgentDir: path.join(os.homedir(), ".pi", "agent"),
		distDir: path.join(REPO_ROOT, "frontend", "dist"),
		siteDocsDir: path.join(REPO_ROOT, "site-docs"),
		skillsDir: path.join(REPO_ROOT, "skills"),
		// Harnesses & Models
		defaultModel: "deepseek-v4-flash:0731-cloud",
		defaultAccentColor: "#7bdb85",
		defaultHarness: "pi",
		agyBin: "agy",
		agyPrintTimeout: "10m",
		agyModelsTimeout: "15s",
		agySandbox: false,
		agySkipPermissions: true,
		agyAllow: "",
		agyAcpMode: "auto",
		agyAcpBin: "",
		codexBin: "codex",
		codexYolo: true,
		museBin: "muse",
		museApprovalMode: "never",
		museYolo: true,
		museTrustWorkspace: false,
		museNoSessionLog: false,
		museTimeoutMs: 1800000,
		museArgs: "",
		museMspMode: "auto",
		museMspBin: "",
		museMspStartTimeoutMs: 30000,
		museMspHostIdleTtlMs: 300000,
		museMspTurnSettleGraceMs: 30000,
		museMspArgs: "",
		vibeBin: "vibe",
		vibeCli: "python",
		vibeAutoApprove: true,
		vibeAgent: "",
		vibeTimeLimit: null,
		vibeTrust: true,
		vibeEnabledTools: [],
		vibeDisabledTools: [],
		vibeTimeoutMs: 1800000,
		vibeArgs: "",
		vibeAcpMode: "auto",
		vibeAcpBin: "",
		vibeAcpStartTimeoutMs: 30000,
		strictModelRunnable: false,
		strictModelDiscovery: false,
		litellmUrl: null,
		litellmHost: null,
		ollamaCloudUrl: null,
		opencodeUrl: null,
		opencodeServerPassword: null,
		opencodeBin: "opencode",
		// Timeouts & Autoloop Budgets
		agentTimeoutMs: 1800000,
		ciTimeoutMs: 600000,
		mergeTimeoutMs: 1800000,
		agentStallTimeoutMs: 600000,
		ciStallTimeoutMs: 300000,
		ciHeartbeatIntervalMs: 30000,
		mergeStallTimeoutMs: 900000,
		queueEntryTimeoutMs: 900000,
		chatPromptTimeoutMs: 0,
		stuckCheckTimeoutMs: 120000,
		autoIterationEnabled: true,
		maxAutoIterations: 8,
		maxTransientRetries: 5,
		transientRetryBaseMs: 2000,
		transientRetryCapMs: 60000,
		transientRetryJitterMs: 1000,
		transientRetryStrategy: "exponential",
		toolLoopStrikes: 3,
		// Health & Observability
		modelCacheTtlMs: 30000,
		healthCacheTtlMs: 15000,
		healthLiteLLMTimeoutMs: 3000,
		healthOllamaTimeoutMs: 4000,
		healthHarnessTimeoutMs: 4000,
		modelsHarnessTimeoutMs: 8000,
		refreshModelsOnHarnessRefresh: true,
		healthMemCriticalPct: 95,
		healthMemWarnPct: 85,
		healthLoadCriticalPerCore: 4.0,
		healthLoadWarnPerCore: 2.5,
		// Engine circuit breaker (Tier 5 containment)
		alertWebhookUrl: "",
		alertWebhookSecret: "",
		alertRetries: 3,
		alertRetryBaseMs: 500,
		alertTimeoutMs: 5000,
		// Engine circuit breaker (Tier 5 containment)
		circuitBreakerEnabled: true,
		circuitStateFile: path.join(os.homedir(), ".kainbain", "engine", "circuit.json"),
		circuitInfraSensorEnabled: true,
		circuitInfraFailureThreshold: 3,
		circuitInfraFailureWindowMs: 600000,
		circuitAuthSensorEnabled: true,
		circuitAuthFailureThreshold: 3,
		circuitAuthFailureWindowMs: 600000,
		circuitDiskSensorEnabled: true,
		circuitDiskFreeFloorBytes: 1073741824,
		circuitDiskProbePath: os.homedir(),
		circuitMemSensorEnabled: true,
		circuitMemSustainedTicks: 3,
		circuitProbeEnabled: true,
		circuitProbeCooldownMs: 60000,
		circuitProbeBackoffCapMs: 600000,
		circuitProbeFailureRetrips: true,
		// Skills & Prompts
		stageSkillsMaxChars: 16000,
		skillsCacheTtlMs: 5000,
		skillImportMaxBytes: 1024 * 1024,
		skillImportZipMaxEntries: 64,
		skillImportZipMaxBytes: 512 * 1024,
		chatSkillsMaxChars: 6000,
		// Tasks & Review
		processLogMaxBytes: 32000,
		logEntriesMaxCount: 500,
		telemetryMaxCount: 100,
		rawMaxCount: 50,
		rawMaxBytes: 8192,
		taskImageMaxBytes: 10 * 1024 * 1024,
		taskImageMaxPerTask: 20,
		taskImageMaxPromptRefs: 10,
		taskImageMaxAttachBytes: 10 * 1024 * 1024,
		stuckCheckMaxLogChars: 20000,
		reviewDiffMaxBytes: 256 * 1024,
		reviewMaxCommentChars: 4000,
		claimTtlMs: 300000,
		pushNotificationsEnabled: true,
		runnerJoinToken: "",
		runnerStaleAfterMs: 60000,
		// Sessions & Workflows
		schedulerIntervalMs: 3000,
		schedulerDisabled: false,
		sessionTtlMs: 30 * 60 * 1000,
		sessionCleanupMs: 60 * 1000,
		workflowRunTtlMs: 24 * 60 * 60 * 1000,
		workflowSweepMs: 60 * 60 * 1000,
		selfDeployContinuity: "",
	};

	it("covers every schema key in the defaults table", () => {
		const schemaKeys = CONFIG_SCHEMA.map((entry) => entry.key).sort();
		expect(Object.keys(expectedDefaults).sort()).toEqual(schemaKeys);
	});

	it("resolves every default from an empty environment", () => {
		const { config, warnings, sources } = loadQuietly({});
		expect(config).toEqual(expectedDefaults);
		expect(warnings).toEqual([]);
		for (const key of Object.keys(expectedDefaults)) {
			/* eslint-disable-next-line security/detect-object-injection -- test indexes the loaded config by schema keys */
			expect(sources[key].source).toBe("default");
		}
	});

	it("pins the D-1 resolution: processLogMaxBytes defaults to 32000 (code won, README was stale)", () => {
		expect(loadQuietly({}).config.processLogMaxBytes).toBe(32000);
	});

	it("gives each load its own csv array (no shared mutable default)", () => {
		const first = loadQuietly({}).config;
		const second = loadQuietly({}).config;
		expect(first.corsAllowedOrigins).not.toBe(second.corsAllowedOrigins);
	});
});

describe("config enforcement (fail fast with a clear diagnostic)", () => {
	it("rejects KAINBAIN_AGENT_TIMEOUT_MS=invalid_number naming the var, value, and constraint", () => {
		let error = null;
		try {
			loadQuietly({ KAINBAIN_AGENT_TIMEOUT_MS: "invalid_number" });
		} catch (thrown) {
			error = thrown;
		}
		expect(error).toBeInstanceOf(ConfigError);
		expect(error.code).toBe("CONFIG_VALIDATION");
		expect(error.variable).toBe("KAINBAIN_AGENT_TIMEOUT_MS");
		expect(error.message).toBe(
			'CONFIG KAINBAIN_AGENT_TIMEOUT_MS: not a number (got "invalid_number", want an integer >= 0)',
		);
	});

	it.each([
		["KAINBAIN_CI_TIMEOUT_MS", "abc"],
		["KAINBAIN_HEALTH_LOAD_WARN_PER_CORE", "lots"],
		["KAINBAIN_MUSE_YOLO", "maybe"],
		["KAINBAIN_AGY_SANDBOX", "2"],
		["NODE_ENV", "prod"],
		["KAINBAIN_MUSE_APPROVAL_MODE", "yolo"],
		["KAINBAIN_VIBE_CLI", "go"],
		["KAINBAIN_VIBE_ACP", "sometimes"],
		["PUBLIC_KB_URL", "not-a-url"],
		["PUBLIC_KB_URL", "ftp://files.home/x"],
		["LITELLM_URL", "has space"],
		["KAINBAIN_AGY_PRINT_TIMEOUT", "10x"],
		["KAINBAIN_AGY_PRINT_TIMEOUT", "-5s"],
		["PORT", "http"],
	])("rejects %s=%s with a CONFIG diagnostic", (variable, value) => {
		expect(() => loadQuietly({ [variable]: value })).toThrowError(ConfigError);
		try {
			loadQuietly({ [variable]: value });
		} catch (error) {
			expect(error.message).toContain(`CONFIG ${variable}:`);
			expect(error.message).toContain(`got "${value}"`);
			expect(error.message).toContain("want ");
		}
	});

	it("enforces int ranges (PORT 1-65535, percents 0-100, non-negative timeouts)", () => {
		expect(() => loadQuietly({ PORT: "0" })).toThrowError(/below minimum 1/);
		expect(() => loadQuietly({ PORT: "65536" })).toThrowError(/above maximum 65535/);
		expect(loadQuietly({ PORT: "1" }).config.port).toBe(1);
		expect(loadQuietly({ PORT: "65535" }).config.port).toBe(65535);
		expect(() => loadQuietly({ KAINBAIN_HEALTH_MEM_WARN_PCT: "101" })).toThrowError(
			/above maximum 100/,
		);
		expect(() => loadQuietly({ KAINBAIN_HEALTH_MEM_WARN_PCT: "-1" })).toThrowError(
			/below minimum 0/,
		);
		expect(() => loadQuietly({ KAINBAIN_AGENT_TIMEOUT_MS: "-5" })).toThrowError(
			/below minimum 0/,
		);
		expect(() => loadQuietly({ KAINBAIN_HEALTH_LOAD_WARN_PER_CORE: "-0.5" })).toThrowError(
			/below minimum 0/,
		);
	});

	it("accepts the documented duration grammar (10m, 30s, 1h, bare ms)", () => {
		for (const value of ["10m", "30s", "1h", "250ms", "500", "1.5h"]) {
			expect(loadQuietly({ KAINBAIN_AGY_PRINT_TIMEOUT: value }).config.agyPrintTimeout).toBe(
				value.trim(),
			);
		}
	});

	it("defaults the agy models discovery watchdog and honors a duration override", () => {
		expect(loadQuietly({}).config.agyModelsTimeout).toBe("15s");
		expect(
			loadQuietly({ KAINBAIN_AGY_MODELS_TIMEOUT_MS: "60s" }).config.agyModelsTimeout,
		).toBe("60s");
		expect(() => loadQuietly({ KAINBAIN_AGY_MODELS_TIMEOUT_MS: "soon" })).toThrowError(
			/not a duration/,
		);
	});

	it("accepts URLs and bare host[:port] endpoints", () => {
		expect(loadQuietly({ PUBLIC_KB_URL: "https://kainbain.home" }).config.publicKbUrl).toBe(
			"https://kainbain.home",
		);
		expect(loadQuietly({ LITELLM_HOST: "litellm.home:4000" }).config.litellmHost).toBe(
			"litellm.home:4000",
		);
		expect(loadQuietly({ OPENCODE_URL: "http://127.0.0.1:4096" }).config.opencodeUrl).toBe(
			"http://127.0.0.1:4096",
		);
	});
});

describe("config type conversion", () => {
	it.each([
		["1", true],
		["true", true],
		["TRUE", true],
		["yes", true],
		["on", true],
		["On", true],
		["0", false],
		["false", false],
		["FALSE", false],
		["no", false],
		["off", false],
		["Off", false],
	])("parses boolean %s as %s", (raw, expected) => {
		expect(loadQuietly({ KAINBAIN_MUSE_YOLO: raw }).config.museYolo).toBe(expected);
	});

	it("floors fractional ints and trims numeric padding (legacy semantics kept)", () => {
		expect(loadQuietly({ KAINBAIN_CI_TIMEOUT_MS: "1500" }).config.ciTimeoutMs).toBe(1500);
		expect(loadQuietly({ KAINBAIN_CI_TIMEOUT_MS: "1500.9" }).config.ciTimeoutMs).toBe(1500);
		expect(loadQuietly({ KAINBAIN_CI_TIMEOUT_MS: "  42 " }).config.ciTimeoutMs).toBe(42);
		expect(
			loadQuietly({ KAINBAIN_HEALTH_LOAD_WARN_PER_CORE: "2.5" }).config
				.healthLoadWarnPerCore,
		).toBe(2.5);
	});

	it("splits csv values, trimming and dropping empties", () => {
		expect(
			loadQuietly({ CORS_ALLOWED_ORIGINS: "https://a.home, https://b.home" }).config
				.corsAllowedOrigins,
		).toEqual(["https://a.home", "https://b.home"]);
		expect(loadQuietly({ CORS_ALLOWED_ORIGINS: "a,, ,b" }).config.corsAllowedOrigins).toEqual([
			"a",
			"b",
		]);
	});

	it("splits pathlist values on the OS delimiter, trimming and dropping empties", () => {
		const sep = path.delimiter;
		expect(
			loadQuietly({ PROJECTS_ROOTS: `/mnt/a${sep} /mnt/b ${sep}${sep}` }).config
				.projectsRoots,
		).toEqual(["/mnt/a", "/mnt/b"]);
		expect(loadQuietly({ PROJECTS_ROOTS: "" }).config.projectsRoots).toEqual(
			[],
		);
	});

	it("treats empty strings as unset (default, silent)", () => {
		const { config, warnings, sources } = loadQuietly({
			KAINBAIN_AGENT_TIMEOUT_MS: "",
			KAINBAIN_MUSE_YOLO: "",
			KAINBAIN_DEFAULT_HARNESS: "",
			PORT: "",
			CORS_ALLOWED_ORIGINS: "",
		});
		expect(config.agentTimeoutMs).toBe(1800000);
		expect(config.museYolo).toBe(true);
		expect(config.defaultHarness).toBe("pi");
		expect(config.port).toBe(3100);
		expect(config.corsAllowedOrigins).toEqual([]);
		expect(warnings).toEqual([]);
		expect(sources.agentTimeoutMs.source).toBe("default");
	});

	it("treats whitespace-only typed values as unset", () => {
		const { config } = loadQuietly({ KAINBAIN_CI_TIMEOUT_MS: "   " });
		expect(config.ciTimeoutMs).toBe(600000);
	});

	it("returns undefined from the raw parser for blank values (unset signal)", () => {
		const entryFor = (type, extra = {}) => ({ env: "PROBE", type, ...extra });
		expect(parseTypedValue(entryFor("int"), "   ", "PROBE")).toBeUndefined();
		expect(parseTypedValue(entryFor("float"), "", "PROBE")).toBeUndefined();
		expect(parseTypedValue(entryFor("bool"), "  ", "PROBE")).toBeUndefined();
		expect(parseTypedValue(entryFor("enum", { values: ["a"] }), "", "PROBE")).toBeUndefined();
		expect(parseTypedValue(entryFor("url"), "", "PROBE")).toBeUndefined();
		expect(parseTypedValue(entryFor("endpoint"), "  ", "PROBE")).toBeUndefined();
		expect(parseTypedValue(entryFor("csv"), "", "PROBE")).toBeUndefined();
		expect(parseTypedValue(entryFor("duration"), "", "PROBE")).toBeUndefined();
		expect(parseTypedValue(entryFor("path"), "  ", "PROBE")).toBeUndefined();
		expect(parseTypedValue(entryFor("pathlist"), "", "PROBE")).toBeUndefined();
		expect(parseTypedValue(entryFor("string"), "", "PROBE")).toBeUndefined();
	});

	it("rejects unknown schema types from the raw parser (schema bug signal)", () => {
		expect(() => parseTypedValue({ env: "PROBE", type: "nope" }, "x", "PROBE")).toThrowError(
			ConfigError,
		);
	});
});

describe("config deprecated aliases", () => {
	it("honors a deprecated alias with a warning when canonical is unset", () => {
		const { config, warnings, sources } = loadQuietly({ AGENT_TIMEOUT_MS: "5000" });
		expect(config.agentTimeoutMs).toBe(5000);
		expect(sources.agentTimeoutMs).toEqual({ var: "AGENT_TIMEOUT_MS", source: "alias" });
		expect(warnings).toEqual([
			"CONFIG DEPRECATION AGENT_TIMEOUT_MS is deprecated, use KAINBAIN_AGENT_TIMEOUT_MS",
		]);
	});

	it("lets the canonical variable win when both are set, warning once", () => {
		const { config, warnings, sources } = loadQuietly({
			KAINBAIN_AGENT_TIMEOUT_MS: "7000",
			AGENT_TIMEOUT_MS: "5000",
		});
		expect(config.agentTimeoutMs).toBe(7000);
		expect(sources.agentTimeoutMs).toEqual({
			var: "KAINBAIN_AGENT_TIMEOUT_MS",
			source: "env",
		});
		expect(warnings).toEqual([
			"CONFIG DEPRECATION AGENT_TIMEOUT_MS is deprecated, use KAINBAIN_AGENT_TIMEOUT_MS (canonical wins, alias ignored)",
		]);
	});

	it("ignores an empty canonical value in favor of a set alias", () => {
		const { config, sources } = loadQuietly({
			KAINBAIN_AGENT_TIMEOUT_MS: "",
			AGENT_TIMEOUT_MS: "5000",
		});
		expect(config.agentTimeoutMs).toBe(5000);
		expect(sources.agentTimeoutMs.source).toBe("alias");
	});

	it("fails fast on a malformed alias value, naming the alias", () => {
		try {
			loadQuietly({ AGENT_TIMEOUT_MS: "junk" });
			expect.unreachable("expected a ConfigError");
		} catch (error) {
			expect(error).toBeInstanceOf(ConfigError);
			expect(error.variable).toBe("AGENT_TIMEOUT_MS");
		}
	});

	it("fails fast on a malformed canonical value even when the alias is valid", () => {
		try {
			loadQuietly({ KAINBAIN_AGENT_TIMEOUT_MS: "junk", AGENT_TIMEOUT_MS: "5000" });
			expect.unreachable("expected a ConfigError");
		} catch (error) {
			expect(error).toBeInstanceOf(ConfigError);
			expect(error.variable).toBe("KAINBAIN_AGENT_TIMEOUT_MS");
		}
	});

	it("supports every documented alias pair", () => {
		const pairs = [
			["KAINBAIN_CI_TIMEOUT_MS", "CI_TIMEOUT_MS", "ciTimeoutMs", "61000", 61000],
			["KAINBAIN_MERGE_TIMEOUT_MS", "MERGE_TIMEOUT_MS", "mergeTimeoutMs", "61000", 61000],
			[
				"KAINBAIN_AUTO_ITERATION_ENABLED",
				"AUTO_ITERATION_ENABLED",
				"autoIterationEnabled",
				"0",
				false,
			],
			["KAINBAIN_MAX_AUTO_ITERATIONS", "MAX_AUTO_ITERATIONS", "maxAutoIterations", "3", 3],
			[
				"KAINBAIN_MAX_TRANSIENT_RETRIES",
				"MAX_TRANSIENT_RETRIES",
				"maxTransientRetries",
				"2",
				2,
			],
			["KAINBAIN_DISABLE_SCHEDULER", "SCHEDULER_DISABLED", "schedulerDisabled", "1", true],
			["KAINBAIN_DISABLE_SCHEDULER", "DISABLE_SCHEDULER", "schedulerDisabled", "true", true],
		];
		for (const [canonical, alias, key, raw, expected] of pairs) {
			const { config, warnings } = loadQuietly({ [alias]: raw });
			/* eslint-disable-next-line security/detect-object-injection -- test indexes the loaded config by schema keys */
			expect(config[key]).toBe(expected);
			expect(warnings.join("\n")).toContain(
				`CONFIG DEPRECATION ${alias} is deprecated, use ${canonical}`,
			);
		}
	});
});

describe("config chained defaults and cross-field warnings", () => {
	it("defaults the muse watchdog to the agent-stage timeout (explicit or alias)", () => {
		expect(loadQuietly({}).config.museTimeoutMs).toBe(1800000);
		expect(
			loadQuietly({ KAINBAIN_AGENT_TIMEOUT_MS: "9000" }).config.museTimeoutMs,
		).toBe(9000);
		expect(loadQuietly({ AGENT_TIMEOUT_MS: "9001" }).config.museTimeoutMs).toBe(9001);
		expect(
			loadQuietly({
				KAINBAIN_AGENT_TIMEOUT_MS: "9000",
				KAINBAIN_MUSE_TIMEOUT_MS: "1000",
			}).config.museTimeoutMs,
		).toBe(1000);
	});

	it("defaults the vibe watchdog to the agent-stage timeout (explicit or alias)", () => {
		expect(loadQuietly({}).config.vibeTimeoutMs).toBe(1800000);
		expect(
			loadQuietly({ KAINBAIN_AGENT_TIMEOUT_MS: "9000" }).config.vibeTimeoutMs,
		).toBe(9000);
		expect(
			loadQuietly({
				KAINBAIN_AGENT_TIMEOUT_MS: "9000",
				KAINBAIN_VIBE_TIMEOUT_MS: "1000",
			}).config.vibeTimeoutMs,
		).toBe(1000);
	});

	it("parses the vibe time limit and tool filters", () => {
		const { config } = loadQuietly({
			KAINBAIN_VIBE_TIME_LIMIT: "120",
			KAINBAIN_VIBE_AGENT: "plan",
			KAINBAIN_VIBE_ENABLED_TOOLS: "file_system.*, bash*",
			KAINBAIN_VIBE_DISABLED_TOOLS: "ask_user_question",
		});
		expect(config.vibeTimeLimit).toBe(120);
		expect(config.vibeAgent).toBe("plan");
		expect(config.vibeEnabledTools).toEqual(["file_system.*", "bash*"]);
		expect(config.vibeDisabledTools).toEqual(["ask_user_question"]);
	});

	it("rejects malformed vibe guardrails at boot", () => {
		expect(() => loadQuietly({ KAINBAIN_VIBE_TIME_LIMIT: "soon" })).toThrow(
			/KAINBAIN_VIBE_TIME_LIMIT/,
		);
		expect(() => loadQuietly({ KAINBAIN_VIBE_AUTO_APPROVE: "maybe" })).toThrow(
			/KAINBAIN_VIBE_AUTO_APPROVE/,
		);
	});

	it("stays silent with the disabled-by-default chat ceilings", () => {
		// No-timeout default: 0/0 must not warn — the pairing checks only
		// apply when an operator opts back into positive ceilings.
		expect(loadQuietly({}).warnings).toEqual([]);
	});

	it("stays silent for an opt-in chat ceiling while the HTTP ceiling is disabled", () => {
		// No client timeout exists to pair against, so a lone positive chat
		// ceiling is healthy on its own.
		const { config, warnings } = loadQuietly({ KAINBAIN_CHAT_PROMPT_TIMEOUT_MS: "1900000" });
		expect(config.chatPromptTimeoutMs).toBe(1900000);
		expect(warnings).toEqual([]);
	});

	it("warns (not throws) when the HTTP ceiling drops to or below an opt-in chat ceiling", () => {
		const { warnings } = loadQuietly({
			KAINBAIN_CHAT_PROMPT_TIMEOUT_MS: "1000000",
			KAINBAIN_SERVER_REQUEST_TIMEOUT_MS: "1000000",
		});
		expect(warnings.join("\n")).toContain(
			"CONFIG WARNING KAINBAIN_SERVER_REQUEST_TIMEOUT_MS (1000000) must stay above KAINBAIN_CHAT_PROMPT_TIMEOUT_MS (1000000)",
		);
	});

	it("stays silent when the HTTP ceiling sits above an opt-in chat ceiling", () => {
		const { warnings } = loadQuietly({
			KAINBAIN_CHAT_PROMPT_TIMEOUT_MS: "1000000",
			KAINBAIN_SERVER_REQUEST_TIMEOUT_MS: "1500000",
		});
		expect(warnings).toEqual([]);
	});

	it("warns when a warn threshold exceeds its critical threshold", () => {
		const { warnings } = loadQuietly({
			KAINBAIN_HEALTH_MEM_WARN_PCT: "96",
			KAINBAIN_HEALTH_LOAD_WARN_PER_CORE: "5",
		});
		expect(warnings.join("\n")).toContain("KAINBAIN_HEALTH_MEM_WARN_PCT should not exceed");
		expect(warnings.join("\n")).toContain(
			"KAINBAIN_HEALTH_LOAD_WARN_PER_CORE should not exceed",
		);
	});

	it("parses the CI keep-alive interval and stays silent on the healthy pairing", () => {
		const { config, warnings } = loadQuietly({
			KAINBAIN_CI_HEARTBEAT_INTERVAL_MS: "15000",
		});
		expect(config.ciHeartbeatIntervalMs).toBe(15000);
		// 15s keep-alive vs the 5-minute silence threshold: healthy.
		expect(warnings).toEqual([]);
	});

	it("warns when the CI keep-alive sits at or above the silence threshold", () => {
		const { warnings } = loadQuietly({
			KAINBAIN_CI_HEARTBEAT_INTERVAL_MS: "300000",
		});
		expect(warnings.join("\n")).toContain(
			"CONFIG WARNING KAINBAIN_CI_HEARTBEAT_INTERVAL_MS (300000) must stay below KAINBAIN_CI_STALL_TIMEOUT_MS (300000)",
		);
	});

	it("warns when the CI keep-alive is disabled while the silence watchdog is armed", () => {
		const { warnings } = loadQuietly({
			KAINBAIN_CI_HEARTBEAT_INTERVAL_MS: "0",
		});
		expect(warnings.join("\n")).toContain(
			"KAINBAIN_CI_HEARTBEAT_INTERVAL_MS=0 disables the command-stage keep-alive",
		);
	});

	it("stays silent when the watchdog and the keep-alive are both disabled", () => {
		const { warnings } = loadQuietly({
			KAINBAIN_CI_STALL_TIMEOUT_MS: "0",
			KAINBAIN_CI_HEARTBEAT_INTERVAL_MS: "0",
		});
		expect(warnings).toEqual([]);
	});
});

describe("config schema self-consistency", () => {
	it("has unique keys, unique env names, and valid groups on every entry", () => {
		const groupIds = new Set(CONFIG_GROUPS.map((group) => group.id));
		const keys = new Set();
		const envs = new Set();
		for (const entry of CONFIG_SCHEMA) {
			expect(entry.key).toBeTruthy();
			expect(entry.env).toBeTruthy();
			expect(entry.type).toBeTruthy();
			expect(entry.doc).toBeTruthy();
			expect(entry.group).toBeTruthy();
			expect(groupIds.has(entry.group)).toBe(true);
			expect(keys.has(entry.key)).toBe(false);
			expect(envs.has(entry.env)).toBe(false);
			keys.add(entry.key);
			envs.add(entry.env);
			for (const alias of entry.aliases || []) {
				expect(envs.has(alias)).toBe(false);
			}
		}
	});

	it("gives every group at least one variable", () => {
		for (const group of CONFIG_GROUPS) {
			expect(
				CONFIG_SCHEMA.some((entry) => entry.group === group.id),
				`group ${group.id} is empty`,
			).toBe(true);
		}
	});

	it("keeps every literal default inside its own constraints", () => {
		for (const entry of CONFIG_SCHEMA) {
			const fallback = entry.default;
			if (fallback === null || typeof fallback === "function") continue;
			if (typeof fallback === "object" && fallback.ref) continue;
			if (entry.type === "int" || entry.type === "float") {
				if (entry.min !== undefined) expect(fallback).toBeGreaterThanOrEqual(entry.min);
				if (entry.max !== undefined) expect(fallback).toBeLessThanOrEqual(entry.max);
			}
			if (entry.type === "enum") expect(entry.values).toContain(fallback);
		}
	});
});

describe(".env.example coverage (every variable documented)", () => {
	it("mentions every canonical variable and every alias", () => {
		const text = fs.readFileSync(ENV_EXAMPLE_PATH, "utf8");
		const names = CONFIG_SCHEMA.flatMap((entry) => [entry.env, ...(entry.aliases || [])]);
		const missing = names.filter((name) => !text.includes(name));
		expect(missing).toEqual([]);
	});

	it("is byte-identical to the generator output (never hand-edit)", () => {
		const committed = fs.readFileSync(ENV_EXAMPLE_PATH, "utf8");
		expect(committed).toBe(renderEnvExample());
	});

	it("emits secrets commented-out with no real values", () => {
		const text = fs.readFileSync(ENV_EXAMPLE_PATH, "utf8");
		expect(text).toContain("# OPENCODE_SERVER_PASSWORD=");
		expect(text).not.toMatch(/^OPENCODE_SERVER_PASSWORD=/m);
	});
});

describe("config module loading (import-time behavior)", () => {
	const HARNESS_KEYS = [
		"KAINBAIN_DEFAULT_HARNESS",
		"KAINBAIN_MUSE_BIN",
		"KAINBAIN_MUSE_APPROVAL_MODE",
		"KAINBAIN_MUSE_YOLO",
		"KAINBAIN_MUSE_TRUST_WORKSPACE",
		"KAINBAIN_MUSE_NO_SESSION_LOG",
		"KAINBAIN_VIBE_BIN",
		"KAINBAIN_VIBE_CLI",
		"KAINBAIN_VIBE_AUTO_APPROVE",
		"KAINBAIN_VIBE_AGENT",
		"KAINBAIN_VIBE_TIME_LIMIT",
		"KAINBAIN_VIBE_TRUST",
		"KAINBAIN_VIBE_ENABLED_TOOLS",
		"KAINBAIN_VIBE_DISABLED_TOOLS",
		"KAINBAIN_VIBE_TIMEOUT_MS",
		"KAINBAIN_VIBE_ARGS",
		"KAINBAIN_VIBE_ACP",
		"KAINBAIN_VIBE_ACP_BIN",
		"KAINBAIN_VIBE_ACP_START_TIMEOUT_MS",
	];

	beforeEach(async () => {
		for (const name of HARNESS_KEYS) {
			vi.stubEnv(name, undefined);
		}
		vi.resetModules();
	});
	afterEach(() => vi.unstubAllEnvs());

	it("defaults defaultHarness to the built-in pi harness", async () => {
		const { config } = await import("./index.js");
		expect(config.defaultHarness).toBe("pi");
	});

	it("defaults the per-harness models timeout and honors its override", async () => {
		const { config } = await import("./index.js");
		expect(config.modelsHarnessTimeoutMs).toBe(8000);
		vi.stubEnv("KAINBAIN_MODELS_HARNESS_TIMEOUT_MS", "1500");
		try {
			vi.resetModules();
			const { config: fresh } = await import("./index.js");
			expect(fresh.modelsHarnessTimeoutMs).toBe(1500);
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it("honors KAINBAIN_DEFAULT_HARNESS as an override", async () => {
		vi.stubEnv("KAINBAIN_DEFAULT_HARNESS", "future-harness");
		try {
			vi.resetModules();
			const { config: fresh } = await import("./index.js");
			expect(fresh.defaultHarness).toBe("future-harness");
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it("falls back to pi when KAINBAIN_DEFAULT_HARNESS is empty", async () => {
		vi.stubEnv("KAINBAIN_DEFAULT_HARNESS", "");
		try {
			vi.resetModules();
			const { config: fresh } = await import("./index.js");
			expect(fresh.defaultHarness).toBe("pi");
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it("defaults the vibe spawn surface to auto-approve + trust (no approval UI yet)", async () => {
		for (const key of HARNESS_KEYS) vi.stubEnv(key, undefined);
		try {
			vi.resetModules();
			const { config: fresh } = await import("./index.js");
			expect(fresh.vibeBin).toBe("vibe");
			// The CLI implementation is pinned to the classic Python CLI: the
			// harness argv (--output-dir/--time-limit/--prompt-file) is only
			// valid there, and the upstream Rust rollout must not flip it.
			expect(fresh.vibeCli).toBe("python");
			expect(fresh.vibeAutoApprove).toBe(true);
			expect(fresh.vibeAgent).toBe("");
			expect(fresh.vibeTimeLimit).toBeNull();
			expect(fresh.vibeTrust).toBe(true);
			expect(fresh.vibeEnabledTools).toEqual([]);
			expect(fresh.vibeDisabledTools).toEqual([]);
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it("honors KAINBAIN_VIBE_BIN and KAINBAIN_VIBE_AUTO_APPROVE=0 as overrides", async () => {
		vi.stubEnv("KAINBAIN_VIBE_BIN", "/tmp/mock-vibe.mjs");
		vi.stubEnv("KAINBAIN_VIBE_AUTO_APPROVE", "0");
		try {
			vi.resetModules();
			const { config: fresh } = await import("./index.js");
			expect(fresh.vibeBin).toBe("/tmp/mock-vibe.mjs");
			expect(fresh.vibeAutoApprove).toBe(false);
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it("honors KAINBAIN_VIBE_CLI=auto|rust as overrides of the Python default", async () => {
		vi.stubEnv("KAINBAIN_VIBE_CLI", "auto");
		try {
			vi.resetModules();
			const { config: autoConfig } = await import("./index.js");
			expect(autoConfig.vibeCli).toBe("auto");
			vi.stubEnv("KAINBAIN_VIBE_CLI", "rust");
			vi.resetModules();
			const { config: rustConfig } = await import("./index.js");
			expect(rustConfig.vibeCli).toBe("rust");
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it("honors KAINBAIN_VIBE_ACP* overrides (transport mode, bin, start timeout)", async () => {
		vi.stubEnv("KAINBAIN_VIBE_ACP", "off");
		vi.stubEnv("KAINBAIN_VIBE_ACP_BIN", "/tmp/mock-vibe-acp.mjs");
		vi.stubEnv("KAINBAIN_VIBE_ACP_START_TIMEOUT_MS", "2500");
		try {
			vi.resetModules();
			const { config: fresh } = await import("./index.js");
			expect(fresh.vibeAcpMode).toBe("off");
			expect(fresh.vibeAcpBin).toBe("/tmp/mock-vibe-acp.mjs");
			expect(fresh.vibeAcpStartTimeoutMs).toBe(2500);
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it("defaults the muse spawn surface to yolo (no approval UI yet)", async () => {
		for (const key of HARNESS_KEYS) vi.stubEnv(key, undefined);
		try {
			vi.resetModules();
			const { config: fresh } = await import("./index.js");
			expect(fresh.museBin).toBe("muse");
			expect(fresh.museApprovalMode).toBe("never");
			expect(fresh.museYolo).toBe(true);
			expect(fresh.museTrustWorkspace).toBe(false);
			expect(fresh.museNoSessionLog).toBe(false);
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it("honors KAINBAIN_MUSE_BIN and KAINBAIN_MUSE_YOLO=0 as overrides", async () => {
		vi.stubEnv("KAINBAIN_MUSE_BIN", "/tmp/mock-muse.mjs");
		vi.stubEnv("KAINBAIN_MUSE_YOLO", "0");
		try {
			vi.resetModules();
			const { config: fresh } = await import("./index.js");
			expect(fresh.museBin).toBe("/tmp/mock-muse.mjs");
			expect(fresh.museYolo).toBe(false);
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it("disables the retrospective chat prompt ceiling by default and honors its override", async () => {
		// No-timeout default: 0 means the turn runs until the model answers
		// or the caller cancels; an explicit positive value re-imposes the
		// opt-in ceiling (slow turns then surface as structured 504 JSON).
		vi.stubEnv("KAINBAIN_CHAT_PROMPT_TIMEOUT_MS", undefined);
		vi.resetModules();
		const { config: freshDefault } = await import("./index.js");
		expect(freshDefault.chatPromptTimeoutMs).toBe(0);
		vi.stubEnv("KAINBAIN_CHAT_PROMPT_TIMEOUT_MS", "45000");
		try {
			vi.resetModules();
			const { config: fresh } = await import("./index.js");
			expect(fresh.chatPromptTimeoutMs).toBe(45000);
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it("disables the server request timeout by default and honors its override", async () => {
		// Node's own HTTP requestTimeout default (300s) would kill a long
		// chat turn with a bare 408, so the API disables it by default
		// (Node treats 0 as no timeout — see api/index.js).
		vi.stubEnv("KAINBAIN_SERVER_REQUEST_TIMEOUT_MS", undefined);
		vi.resetModules();
		const { config: freshDefault } = await import("./index.js");
		expect(freshDefault.serverRequestTimeoutMs).toBe(0);
		vi.stubEnv("KAINBAIN_SERVER_REQUEST_TIMEOUT_MS", "2100000");
		try {
			vi.resetModules();
			const { config: fresh } = await import("./index.js");
			expect(fresh.serverRequestTimeoutMs).toBe(2100000);
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it("fails the import on an invalid value (fail fast before listen)", async () => {
		vi.stubEnv("KAINBAIN_AGENT_TIMEOUT_MS", "invalid_number");
		try {
			vi.resetModules();
			await expect(import("./index.js")).rejects.toThrow(
				'CONFIG KAINBAIN_AGENT_TIMEOUT_MS: not a number (got "invalid_number", want an integer >= 0)',
			);
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it("falls back to default sources for entries missing from spec overrides", () => {
		const { config } = loadQuietly({ PORT: "3101" });
		const spec = getConfigSpec({ config, sources: {}, warnings: [] });
		const port = spec.entries.find((entry) => entry.env === "PORT");
		expect(port).toMatchObject({ value: 3101, source: "default" });
		expect(spec.warnings).toEqual([]);
	});

	it("keeps the legacy api/config.js shim working with the same keys", async () => {
		// Isolate PORT so the 3100 pin holds even when the ambient
		// environment sets PORT (the config module snapshots env at import).
		vi.stubEnv("PORT", undefined);
		try {
			vi.resetModules();
			const fromIndex = await import("./index.js");
			const fromShim = await import("../config.js");
			expect(Object.keys(fromShim.config).sort()).toEqual(
				Object.keys(fromIndex.config).sort(),
			);
			expect(fromShim.default).toBe(fromShim.config);
			expect(fromShim.config.port).toBe(3100);
			expect(fromShim.configSources.port).toEqual({ var: "PORT", source: "default" });
		} finally {
			vi.unstubAllEnvs();
		}
	});
});
