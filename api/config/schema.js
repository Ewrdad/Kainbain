/***
 * MARK: config schema
 * @description Single source of truth for every environment variable the API
 *   reads. Each entry describes one knob: its config key, canonical env name,
 *   deprecated aliases, type, default, constraints, doc group, and docs.
 *
 *   Why a descriptor table instead of a validation library: the introspection
 *   endpoint (`GET /status/config`, alias `/api/system/config-spec`) and the
 *   `.env.example` generator both need per-variable metadata (group, doc,
 *   secret flag, aliases) that a plain validation schema cannot carry. The
 *   table below is that metadata, and `loadConfig` is its one parser — zero
 *   new dependencies, one place to add a knob.
 *
 *   Fail-fast policy (encoded here, enforced by `loadConfig`):
 *   - Missing or empty value -> default, silently (unchanged behavior).
 *   - Malformed value for a typed variable -> throw `ConfigError` at boot
 *     with `CONFIG <VAR>: <reason> (got "<value>", want <constraint>)`.
 *   - Deprecated alias used while the canonical name is unset -> honor the
 *     alias value but warn once (`CONFIG DEPRECATION ...`).
 *   - Both canonical and alias set -> canonical wins, warn once.
 *
 *   Out of scope on purpose (census, 2026-10-03): `NODE_EXTRA_CA_CERTS` (TLS
 *   bootstrap set by the boot itself), `PATH`/`HOME`/`USER`/`LANG`/
 *   `XDG_RUNTIME_DIR`/`DBUS_SESSION_BUS_ADDRESS` (inherited process runtime,
 *   never app config). Everything else `api/` reads lives in this table.
 *
 * @example import { loadConfig } from "./schema.js"
 * @example loadConfig({ KAINBAIN_AGENT_TIMEOUT_MS: "5000" }).config.agentTimeoutMs => 5000
 ***/

import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CONFIG_DIR = path.dirname(fileURLToPath(import.meta.url));
const API_DIR = path.resolve(CONFIG_DIR, "..");
const REPO_ROOT = path.resolve(API_DIR, "..");

/***
 * MARK: frontend chat ceiling
 * @description Legacy reference for the removed retrospective chat timeouts
 *   (31 min — the deleted frontend `RETROSPECTIVE_CHAT_TIMEOUT_MS`). Chat
 *   turns now run with no timeout by default, so nothing enforces this
 *   value; it is retained only so messages/tests referencing the historic
 *   budget keep a stable anchor. The live pairing check
 *   (`checkTimeoutPairing`) compares the two server ceilings against each
 *   other, not against this constant.
 * @example FRONTEND_CHAT_TIMEOUT_MS => 1860000
 ***/
export const FRONTEND_CHAT_TIMEOUT_MS = 31 * 60 * 1000;

/***
 * MARK: config groups
 * @description Ordered doc groups. Every schema entry belongs to exactly one
 *   group; the group titles drive the `.env.example` sections and the
 *   introspection endpoint.
 * @example CONFIG_GROUPS[0].id => 'server'
 ***/
export const CONFIG_GROUPS = [
	{ id: "server", title: "Server & Network" },
	{ id: "storage", title: "Storage & Paths" },
	{ id: "harnesses", title: "Harnesses & Models" },
	{ id: "timeouts", title: "Timeouts & Autoloop Budgets" },
	{ id: "health", title: "Health & Observability" },
	{ id: "skills", title: "Skills & Prompts" },
	{ id: "tasks", title: "Tasks & Review" },
	{ id: "sessions", title: "Sessions & Workflows" },
];

/***
 * MARK: ConfigError
 * @description Thrown when an explicitly-set variable fails schema validation.
 *   The message is the operator-facing diagnostic printed at boot.
 * @example new ConfigError("PORT", "abc", "an integer 1-65535").message
 ***/
export class ConfigError extends Error {
	constructor(variable, value, constraint, reason) {
		super(
			`CONFIG ${variable}: ${reason} (got "${value}", want ${constraint})`,
		);
		this.name = "ConfigError";
		this.code = "CONFIG_VALIDATION";
		this.variable = variable;
		this.value = value;
		this.constraint = constraint;
	}
}

/***
 * MARK: isUnset
 * @description Whether a raw env value counts as "not provided". `undefined`,
 *   `null`, and the empty string always mean unset; typed parsers additionally
 *   treat whitespace-only strings as unset.
 * @example isUnset("") => true
 ***/
function isUnset(raw) {
	return raw === undefined || raw === null || raw === "";
}

const TRUE_WORDS = new Set(["1", "true", "yes", "on"]);
const FALSE_WORDS = new Set(["0", "false", "no", "off"]);

// eslint-disable-next-line security/detect-unsafe-regex -- bounded numeric+unit duration, no nested quantifiers
const DURATION_PATTERN = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h)?$/;

/***
 * MARK: parseTypedValue
 * @description Parses one raw string into a typed value per schema entry, or
 *   throws `ConfigError` naming the variable, the received value, and the
 *   expected constraint. Pure: no env access, safe to unit-test directly.
 * @example parseTypedValue({ env: "PORT", type: "int", min: 1, max: 65535 }, "3100", "PORT") => 3100
 * @param {Object} entry - The schema entry (type, min, max, values).
 * @param {string} raw - The raw env string (already known to be set).
 * @param {string} variable - The env name the value came from (for errors).
 * @returns {*} The parsed value.
 ***/
export function parseTypedValue(entry, raw, variable) {
	const text = String(raw).trim();
	const fail = (reason, constraint) => {
		throw new ConfigError(variable, String(raw), constraint, reason);
	};
	switch (entry.type) {
		case "int": {
			if (text === "") return undefined;
			const parsed = Number(text);
			if (!Number.isFinite(parsed)) {
				fail("not a number", describeInt(entry));
			}
			const floored = Math.floor(parsed);
			if (entry.min !== undefined && floored < entry.min) {
				fail(`below minimum ${entry.min}`, describeInt(entry));
			}
			if (entry.max !== undefined && floored > entry.max) {
				fail(`above maximum ${entry.max}`, describeInt(entry));
			}
			return floored;
		}
		case "float": {
			if (text === "") return undefined;
			const parsed = Number(text);
			if (!Number.isFinite(parsed)) {
				fail("not a number", describeFloat(entry));
			}
			if (entry.min !== undefined && parsed < entry.min) {
				fail(`below minimum ${entry.min}`, describeFloat(entry));
			}
			if (entry.max !== undefined && parsed > entry.max) {
				fail(`above maximum ${entry.max}`, describeFloat(entry));
			}
			return parsed;
		}
		case "bool": {
			if (text === "") return undefined;
			const lowered = text.toLowerCase();
			if (TRUE_WORDS.has(lowered)) return true;
			if (FALSE_WORDS.has(lowered)) return false;
			fail("not a boolean", "one of 1/true/yes/on or 0/false/no/off");
			break;
		}
		case "enum": {
			if (text === "") return undefined;
			if (entry.values.includes(text)) return text;
			fail("not an allowed value", `one of ${entry.values.join("|")}`);
			break;
		}
		case "url": {
			if (text === "") return undefined;
			let parsed = null;
			try {
				parsed = new URL(text);
			} catch {
				parsed = null;
			}
			if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
				fail("not an http(s) URL", "an absolute http(s) URL");
			}
			return text;
		}
		case "endpoint": {
			if (text === "") return undefined;
			if (/\s/.test(text)) fail("contains whitespace", "a URL or host[:port]");
			if (!parsesAsUrl(text) && !parsesAsUrl(`http://${text}`)) {
				fail("not a URL or host[:port]", "a URL or host[:port]");
			}
			return text;
		}
		case "csv": {
			if (text === "") return undefined;
			return text
				.split(",")
				.map((part) => part.trim())
				.filter((part) => part !== "");
		}
		case "duration": {
			if (text === "") return undefined;
			if (!DURATION_PATTERN.test(text.toLowerCase())) {
				fail("not a duration", 'a duration like "10m", "30s", "1h", or bare ms');
			}
			return text;
		}
		case "path": {
			if (text === "") return undefined;
			return text;
		}
		case "pathlist": {
			if (text === "") return undefined;
			return text
				.split(path.delimiter)
				.map((part) => part.trim())
				.filter((part) => part !== "");
		}
		case "string": {
			// Plain strings keep exact legacy semantics: only the truly empty
			// value counts as unset, and the value is never trimmed.
			if (isUnset(raw)) return undefined;
			return String(raw);
		}
		default:
			fail(`unknown schema type "${entry.type}"`, "a supported schema type");
			break;
	}
}

/***
 * MARK: describeInt
 * @description Human-readable constraint text for an int entry, used in error
 *   diagnostics.
 * @example describeInt({ min: 1, max: 65535 }) => 'an integer 1-65535'
 ***/
function describeInt(entry) {
	if (entry.min !== undefined && entry.max !== undefined) {
		return `an integer ${entry.min}-${entry.max}`;
	}
	if (entry.min !== undefined) return `an integer >= ${entry.min}`;
	if (entry.max !== undefined) return `an integer <= ${entry.max}`;
	return "an integer";
}

/***
 * MARK: describeFloat
 * @description Human-readable constraint text for a float entry.
 * @example describeFloat({ min: 0 }) => 'a number >= 0'
 ***/
function describeFloat(entry) {
	if (entry.min !== undefined && entry.max !== undefined) {
		return `a number ${entry.min}-${entry.max}`;
	}
	if (entry.min !== undefined) return `a number >= ${entry.min}`;
	if (entry.max !== undefined) return `a number <= ${entry.max}`;
	return "a number";
}

/***
 * MARK: parsesAsUrl
 * @description Whether a string parses as an absolute URL (any scheme).
 * @example parsesAsUrl("https://litellm.home") => true
 ***/
function parsesAsUrl(text) {
	try {
		const parsed = new URL(text);
		return Boolean(parsed.host);
	} catch {
		return false;
	}
}

/***
 * MARK: CONFIG_SCHEMA
 * @description The complete variable table. Field guide:
 *   `key` (config object property), `env` (canonical variable), `aliases`
 *   (deprecated fallbacks, honored with a warning), `type`
 *   (int|float|bool|string|enum|path|pathlist|url|endpoint|csv|duration), `default`
 *   (literal, `{ ref: <key> }` chained default, or `() => value` computed
 *   default), `defaultDoc` (docs text for computed defaults), `min`/`max`
 *   (numeric bounds), `values` (enum members), `group` (CONFIG_GROUPS id),
 *   `doc` (one-line operator doc), `secret` (redacted in introspection).
 * @example CONFIG_SCHEMA.find((e) => e.key === "port").default => 3100
 ***/
export const CONFIG_SCHEMA = [
	// --- Server & Network -------------------------------------------------
	{
		key: "port",
		env: "PORT",
		aliases: [],
		type: "int",
		default: 3100,
		min: 1,
		max: 65535,
		group: "server",
		doc: "API listen port (this host runs Forgejo on :3000, so KainBain uses :3100).",
	},
	{
		key: "host",
		env: "HOST",
		aliases: [],
		type: "string",
		default: "0.0.0.0",
		group: "server",
		doc: "API listen address (0.0.0.0 serves LAN + Tailscale; use 127.0.0.1 to lock down to loopback).",
	},
	{
		key: "publicKbUrl",
		env: "PUBLIC_KB_URL",
		aliases: [],
		type: "url",
		default: "http://localhost:3100",
		group: "server",
		doc: "Origin advertised to integrating agents (GET /agent); production serves https://kainbain.home behind nginx.",
	},
	{
		key: "corsAllowedOrigins",
		env: "CORS_ALLOWED_ORIGINS",
		aliases: [],
		type: "csv",
		default: [],
		group: "server",
		doc: "Extra browser origins allowed to call the API, comma-separated exact matches (only loopback and origin-less clients are always allowed; no implicit .home, LAN, or tailnet allowances).",
	},
	{
		key: "nodeEnv",
		env: "NODE_ENV",
		aliases: [],
		type: "enum",
		values: ["development", "test", "production"],
		default: "development",
		group: "server",
		doc: "Runtime mode (test enables CORS bypass + mock harnesses; production is the deployed API).",
	},
	{
		key: "serverRequestTimeoutMs",
		env: "KAINBAIN_SERVER_REQUEST_TIMEOUT_MS",
		aliases: [],
		type: "int",
		default: 0,
		min: 0,
		group: "server",
		doc: "Node HTTP requestTimeout for the API server in ms; 0 (default) disables it so long chat turns are never killed with a bare 408. Set an explicit positive value only above any opt-in chat ceiling.",
	},

	// --- Storage & Paths --------------------------------------------------
	{
		key: "projectsRoot",
		env: "PROJECTS_ROOT",
		aliases: [],
		type: "path",
		default: "/home/server/projects",
		group: "storage",
		doc: "Root directory holding one folder per project (tasks, branches, assets).",
	},
	{
		key: "notesSpaceRoot",
		env: "NOTES_SPACE_ROOT",
		aliases: [],
		type: "path",
		default: "/home/server/apps/notes/silverbullet/space/Projects/Personal",
		group: "storage",
		doc: "Centralised notes space root for project-linked notes (any markdown notes store).",
	},
	{
		key: "projectsRoots",
		env: "PROJECTS_ROOTS",
		aliases: [],
		type: "pathlist",
		default: [],
		group: "storage",
		doc: "Extra project roots scanned alongside PROJECTS_ROOT (OS path-list separated, e.g. colon-separated on POSIX). Projects must be direct children of a root, or registered explicitly.",
	},
	{
		key: "projectsRegistryFile",
		env: "KAINBAIN_PROJECTS_REGISTRY_FILE",
		aliases: [],
		type: "path",
		default: () => path.join(os.homedir(), ".kainbain", "projects.json"),
		defaultDoc: "~/.kainbain/projects.json",
		group: "storage",
		doc: "Engine-global registry of extra project roots and adopted project directories outside every root.",
	},
	{
		key: "seedSampleProjects",
		env: "KAINBAIN_SEED_SAMPLE_PROJECTS",
		aliases: [],
		type: "bool",
		default: false,
		group: "storage",
		doc: "Seed sample projects (Project A-D) on boot when missing. Off by default: fresh machines boot with an empty board instead of junk projects.",
	},
	{
		key: "piAgentDir",
		env: "PI_AGENT_DIR",
		aliases: [],
		type: "path",
		default: () => path.join(os.homedir(), ".pi", "agent"),
		defaultDoc: "~/.pi/agent",
		group: "storage",
		doc: "Pi agent directory (session + extension state for the pi harness).",
	},
	{
		key: "distDir",
		env: "KAINBAIN_DIST",
		aliases: [],
		type: "path",
		default: () => path.join(REPO_ROOT, "frontend", "dist"),
		defaultDoc: "<repo>/frontend/dist",
		group: "storage",
		doc: "Built frontend directory served from the same origin as the API (the deploy script points this at the production build).",
	},
	{
		key: "siteDocsDir",
		env: "KAINBAIN_SITE_DOCS",
		aliases: [],
		type: "path",
		default: () => path.join(REPO_ROOT, "site-docs"),
		defaultDoc: "<repo>/site-docs",
		group: "storage",
		doc: "Markdown docs directory rendered by the in-app Docs tab (GET /docs).",
	},
	{
		key: "skillsDir",
		env: "KAINBAIN_SKILLS_DIR",
		aliases: [],
		type: "path",
		default: () => path.join(REPO_ROOT, "skills"),
		defaultDoc: "<repo>/skills",
		group: "storage",
		doc: "Global stage-skills library directory (each <name>/SKILL.md + optional KB_config.json).",
	},

	// --- Harnesses & Models -----------------------------------------------
	{
		key: "defaultModel",
		env: "KAINBAIN_DEFAULT_MODEL",
		aliases: [],
		type: "string",
		default: "deepseek-v4-flash:0731-cloud",
		group: "harnesses",
		doc: "Default AI model used for new projects / stages when none is set.",
	},
	{
		key: "defaultAccentColor",
		env: "KAINBAIN_DEFAULT_ACCENT_COLOR",
		aliases: [],
		type: "string",
		default: "#7bdb85",
		group: "harnesses",
		doc: "Default project accent color (hex).",
	},
	{
		key: "defaultHarness",
		env: "KAINBAIN_DEFAULT_HARNESS",
		aliases: [],
		type: "string",
		default: "pi",
		group: "harnesses",
		doc: 'Agent harness used when a project does not select one ("pi"). Unknown names surface the registry warning and fall back to pi.',
	},
	{
		key: "agyBin",
		env: "KAINBAIN_AGY_BIN",
		aliases: [],
		type: "string",
		default: "agy",
		group: "harnesses",
		doc: "The agy CLI binary (name on PATH or absolute path) the antigravity harness spawns per stage.",
	},
	{
		key: "agyPrintTimeout",
		env: "KAINBAIN_AGY_PRINT_TIMEOUT",
		aliases: [],
		type: "duration",
		default: "10m",
		group: "harnesses",
		doc: 'agy --print-timeout duration (the CLI response ceiling, e.g. "10m"); the harness also derives its engine-side watchdog from it.',
	},
	{
		key: "agyModelsTimeout",
		env: "KAINBAIN_AGY_MODELS_TIMEOUT_MS",
		aliases: [],
		type: "duration",
		default: "15s",
		group: "harnesses",
		doc: "Watchdog for the `agy models` discovery spawn; a hung CLI degrades to a warn + empty picker instead of pinning model selection. Raise it on heavily loaded hosts where a slow CLI start is misread as a hang.",
	},
	{
		key: "agySandbox",
		env: "KAINBAIN_AGY_SANDBOX",
		aliases: [],
		type: "bool",
		default: false,
		group: "harnesses",
		doc: "Pass --sandbox to agy runs (operator default OFF: unrestricted runs).",
	},
	{
		key: "agySkipPermissions",
		env: "KAINBAIN_AGY_SKIP_PERMISSIONS",
		aliases: [],
		type: "bool",
		default: true,
		group: "harnesses",
		doc: "Pass --dangerously-skip-permissions to agy runs (operator default ON: auto-approved tools).",
	},
	{
		key: "agyAllow",
		env: "KAINBAIN_AGY_ALLOW",
		aliases: [],
		type: "string",
		default: "",
		group: "harnesses",
		doc: "Optional comma-separated action(target) allow rules for agy tools (validated but not yet applied — see the antigravity harness README).",
	},
	{
		key: "agyAcpMode",
		env: "KAINBAIN_AGY_ACP",
		aliases: [],
		type: "enum",
		values: ["auto", "on", "off"],
		default: "auto",
		group: "harnesses",
		doc: "Antigravity session transport: on (two-way ACP session), off (legacy per-turn exec), auto (ACP only when KAINBAIN_AGY_ACP_BIN is set).",
	},
	{
		key: "agyAcpBin",
		env: "KAINBAIN_AGY_ACP_BIN",
		aliases: [],
		type: "string",
		default: "",
		group: "harnesses",
		doc: "Standalone Antigravity ACP agent binary (engages the ACP session path; blank = `agy acp` subcommand when mode is on).",
	},
	{
		key: "codexBin",
		env: "KAINBAIN_CODEX_BIN",
		aliases: [],
		type: "string",
		default: "codex",
		group: "harnesses",
		doc: "Codex CLI binary the codex harness resolves (PATH name or absolute path; ~/.local/bin is probed). The harness is a theoretical shim on devices without the binary: it refuses with a setup hint and never spawns.",
	},
	{
		key: "codexYolo",
		env: "KAINBAIN_CODEX_YOLO",
		aliases: [],
		type: "bool",
		default: true,
		group: "harnesses",
		doc: "Codex auto-approve by default (no approval UI exists yet); 0 restores per-action approvals once the live transport lands.",
	},
	{
		key: "museBin",
		env: "KAINBAIN_MUSE_BIN",
		aliases: [],
		type: "string",
		default: "muse",
		group: "harnesses",
		doc: "Muse Code CLI binary the muse harness spawns (pin a versioned binary to opt out of the launcher auto-update).",
	},
	{
		key: "museApprovalMode",
		env: "KAINBAIN_MUSE_APPROVAL_MODE",
		aliases: [],
		type: "enum",
		values: ["never", "on-request", "untrusted"],
		default: "never",
		group: "harnesses",
		doc: "Muse --approval-mode (never keeps approvals off while the sandbox stays ON, unlike --yolo).",
	},
	{
		key: "museYolo",
		env: "KAINBAIN_MUSE_YOLO",
		aliases: [],
		type: "bool",
		default: true,
		group: "harnesses",
		doc: "Muse --yolo by default (no approval UI exists yet); 0 restores sandbox-on.",
	},
	{
		key: "museTrustWorkspace",
		env: "KAINBAIN_MUSE_TRUST_WORKSPACE",
		aliases: [],
		type: "bool",
		default: false,
		group: "harnesses",
		doc: "Muse --trust-workspace (loads project skills/rules).",
	},
	{
		key: "museNoSessionLog",
		env: "KAINBAIN_MUSE_NO_SESSION_LOG",
		aliases: [],
		type: "bool",
		default: false,
		group: "harnesses",
		doc: "Muse --no-session-log (privacy vs. resume/trace trade-off).",
	},
	{
		key: "museTimeoutMs",
		env: "KAINBAIN_MUSE_TIMEOUT_MS",
		aliases: [],
		type: "int",
		default: { ref: "agentTimeoutMs" },
		min: 0,
		group: "harnesses",
		doc: "Engine-side watchdog ceiling for one muse run (defaults to the agent-stage timeout).",
	},
	{
		key: "museArgs",
		env: "KAINBAIN_MUSE_ARGS",
		aliases: [],
		type: "string",
		default: "",
		group: "harnesses",
		doc: "Extra validated argv for muse runs (e.g. --max-model-steps 200); harness-owned flags are rejected here.",
	},
	{
		key: "museMspMode",
		env: "KAINBAIN_MUSE_MSP",
		aliases: [],
		type: "enum",
		values: ["auto", "on", "off"],
		default: "auto",
		group: "harnesses",
		doc: "Muse session transport: on (two-way MSP session over `muse serve`), off (legacy per-turn exec — the documented rollback), auto (MSP when the resolved muse binary advertises the serve subcommand, or when KAINBAIN_MUSE_MSP_BIN is set).",
	},
	{
		key: "museMspBin",
		env: "KAINBAIN_MUSE_MSP_BIN",
		aliases: [],
		type: "string",
		default: "",
		group: "harnesses",
		doc: "Standalone muse serve binary override (blank = the resolved KAINBAIN_MUSE_BIN; setting it engages the MSP transport).",
	},
	{
		key: "museMspStartTimeoutMs",
		env: "KAINBAIN_MUSE_MSP_START_TIMEOUT_MS",
		aliases: [],
		type: "int",
		default: 30000,
		min: 0,
		group: "harnesses",
		doc: "Handshake ceiling for the muse serve session start (the per-turn watchdog stays engine-side, as with the exec transport).",
	},
	{
		key: "museMspHostIdleTtlMs",
		env: "KAINBAIN_MUSE_MSP_HOST_IDLE_TTL_MS",
		aliases: [],
		type: "int",
		default: 300000,
		min: 0,
		group: "harnesses",
		doc: "Idle TTL before an unused per-project muse serve host is disposed (bounds the host's memory footprint).",
	},
	{
		key: "museMspTurnSettleGraceMs",
		env: "KAINBAIN_MUSE_MSP_TURN_SETTLE_GRACE_MS",
		aliases: [],
		type: "int",
		default: 30000,
		min: 0,
		group: "harnesses",
		doc: "Grace between the muse serve watchdog's turn/interrupt and the force-settle of a wedged turn; the host is evicted from the pool when it elapses.",
	},
	{
		key: "museMspArgs",
		env: "KAINBAIN_MUSE_MSP_ARGS",
		aliases: [],
		type: "string",
		default: "",
		group: "harnesses",
		doc: "Extra validated argv for the muse serve host (e.g. --contributor-mode off); harness-owned pins are rejected here.",
	},
	{
		key: "vibeBin",
		env: "KAINBAIN_VIBE_BIN",
		aliases: [],
		type: "string",
		default: "vibe",
		group: "harnesses",
		doc: "Mistral Vibe CLI binary the vibe harness spawns (PATH name or absolute path; ~/.local/bin is probed).",
	},
	{
		key: "vibeCli",
		env: "KAINBAIN_VIBE_CLI",
		aliases: [],
		type: "enum",
		values: ["python", "rust", "auto"],
		default: "python",
		group: "harnesses",
		doc: "Vibe CLI implementation the harness targets. 'python' (recommended) forces the classic CLI whose flag contract the harness uses (--output-dir/--time-limit/--prompt-file, export.json); 'rust' opts into the Rust TUI; 'auto' leaves VIBE_CLI unset and follows the upstream rollout. On vibe >= 3.0 the pin is ignored (the launcher always runs vibe-rs), so leave 'auto' for new installs; the setting is retained so 2.x installs keep working.",
	},
	{
		key: "vibeAutoApprove",
		env: "KAINBAIN_VIBE_AUTO_APPROVE",
		aliases: [],
		type: "bool",
		default: true,
		group: "harnesses",
		doc: "Vibe --auto-approve by default (no approval UI exists yet); 0 restores per-agent approvals.",
	},
	{
		key: "vibeAgent",
		env: "KAINBAIN_VIBE_AGENT",
		aliases: [],
		type: "string",
		default: "",
		group: "harnesses",
		doc: "Vibe --agent profile (builtin: ask, plan, accept-edits, smart-approve, auto-approve, or custom from ~/.vibe/agents/); empty follows the default_agent config.",
	},
	{
		key: "vibeTimeLimit",
		env: "KAINBAIN_VIBE_TIME_LIMIT",
		aliases: [],
		type: "int",
		default: null,
		min: 1,
		group: "harnesses",
		doc: "Vibe --time-limit per run in seconds (unset: the engine watchdog still applies).",
	},
	{
		key: "vibeTrust",
		env: "KAINBAIN_VIBE_TRUST",
		aliases: [],
		type: "bool",
		default: true,
		group: "harnesses",
		doc: "Vibe --trust for headless runs (skips the trust prompt for this invocation only; never persisted).",
	},
	{
		key: "vibeEnabledTools",
		env: "KAINBAIN_VIBE_ENABLED_TOOLS",
		aliases: [],
		type: "csv",
		default: [],
		group: "harnesses",
		doc: "Vibe --enabled-tools filter (comma-separated exact names, globs, or re: regex; empty disables no filter).",
	},
	{
		key: "vibeDisabledTools",
		env: "KAINBAIN_VIBE_DISABLED_TOOLS",
		aliases: [],
		type: "csv",
		default: [],
		group: "harnesses",
		doc: "Vibe --disabled-tools filter, applied after the enabled filter (same syntax).",
	},
	{
		key: "vibeTimeoutMs",
		env: "KAINBAIN_VIBE_TIMEOUT_MS",
		aliases: [],
		type: "int",
		default: { ref: "agentTimeoutMs" },
		min: 0,
		group: "harnesses",
		doc: "Engine-side watchdog ceiling for one vibe run (defaults to the agent-stage timeout).",
	},
	{
		key: "vibeArgs",
		env: "KAINBAIN_VIBE_ARGS",
		aliases: [],
		type: "string",
		default: "",
		group: "harnesses",
		doc: "Extra validated argv for vibe runs (e.g. --smart-approve); harness-owned flags are rejected here.",
	},
	{
		key: "vibeAcpMode",
		env: "KAINBAIN_VIBE_ACP",
		aliases: [],
		type: "enum",
		values: ["auto", "on", "off"],
		default: "auto",
		group: "harnesses",
		doc: "Vibe session transport: on (two-way ACP session over the standalone vibe-acp agent), off (legacy per-turn exec), auto (ACP when the vibe-acp entrypoint resolves — an explicit KAINBAIN_VIBE_ACP_BIN, or the vibe-acp sibling of the resolved vibe binary).",
	},
	{
		key: "vibeAcpBin",
		env: "KAINBAIN_VIBE_ACP_BIN",
		aliases: [],
		type: "string",
		default: "",
		group: "harnesses",
		doc: "Standalone vibe ACP agent binary override (blank = vibe-acp sibling of the resolved KAINBAIN_VIBE_BIN, then bare vibe-acp on PATH).",
	},
	{
		key: "vibeAcpStartTimeoutMs",
		env: "KAINBAIN_VIBE_ACP_START_TIMEOUT_MS",
		aliases: [],
		type: "int",
		default: 30000,
		min: 0,
		group: "harnesses",
		doc: "Handshake ceiling for the vibe ACP session start (the per-turn watchdog stays engine-side, as with the exec transport).",
	},
	{
		key: "strictModelRunnable",
		env: "KAINBAIN_STRICT_MODEL_RUNNABLE",
		aliases: [],
		type: "bool",
		default: false,
		group: "harnesses",
		doc: "Fail fast (instead of warn-and-continue on the session default) when a stage targets a model without valid credentials.",
	},
	{
		key: "strictModelDiscovery",
		env: "KAINBAIN_STRICT_MODEL_DISCOVERY",
		aliases: [],
		type: "bool",
		default: false,
		group: "harnesses",
		doc: "Fail fast (instead of warn-and-continue) when the requested model cannot resolve and model discovery itself failed.",
	},
	{
		key: "litellmUrl",
		env: "LITELLM_URL",
		aliases: [],
		type: "endpoint",
		default: null,
		group: "harnesses",
		doc: "Explicit LiteLLM endpoint override (else litellm.home, else localhost:4000).",
	},
	{
		key: "litellmHost",
		env: "LITELLM_HOST",
		aliases: [],
		type: "endpoint",
		default: null,
		group: "harnesses",
		doc: "Second LiteLLM endpoint candidate (full URL preferred; bare host[:port] accepted).",
	},
	{
		key: "ollamaCloudUrl",
		env: "OLLAMA_CLOUD_URL",
		aliases: [],
		type: "endpoint",
		default: null,
		group: "harnesses",
		doc: "Explicit Ollama Cloud endpoint override (else ollama.com, else ollama.ai).",
	},
	{
		key: "opencodeUrl",
		env: "OPENCODE_URL",
		aliases: [],
		type: "endpoint",
		default: null,
		group: "harnesses",
		doc: "Connect to this OpenCode server instead of spawning one per project.",
	},
	{
		key: "opencodeServerPassword",
		env: "OPENCODE_SERVER_PASSWORD",
		aliases: [],
		type: "string",
		default: null,
		secret: true,
		group: "harnesses",
		doc: "Bearer password for the OpenCode server (redacted in the config-spec endpoint).",
	},
	{
		key: "opencodeBin",
		env: "KAINBAIN_OPENCODE_BIN",
		aliases: [],
		type: "string",
		default: "opencode",
		group: "harnesses",
		doc: "opencode CLI binary for availability detection (`~/.opencode/bin` is also searched; OPENCODE_URL skips the binary entirely).",
	},

	// --- Timeouts & Autoloop Budgets ---------------------------------------
	{
		key: "agentTimeoutMs",
		env: "KAINBAIN_AGENT_TIMEOUT_MS",
		aliases: ["AGENT_TIMEOUT_MS"],
		type: "int",
		default: 1800000,
		min: 0,
		group: "timeouts",
		doc: "Max wall-clock for one agent stage (30 min).",
	},
	{
		key: "ciTimeoutMs",
		env: "KAINBAIN_CI_TIMEOUT_MS",
		aliases: ["CI_TIMEOUT_MS"],
		type: "int",
		default: 600000,
		min: 0,
		group: "timeouts",
		doc: "Max wall-clock for a CI/script stage (10 min; the canonical `npm run test` gate includes the ~7-min canary E2E suite).",
	},
	{
		key: "mergeTimeoutMs",
		env: "KAINBAIN_MERGE_TIMEOUT_MS",
		aliases: ["MERGE_TIMEOUT_MS"],
		type: "int",
		default: 1800000,
		min: 0,
		group: "timeouts",
		doc: "Max wall-clock for a merge stage (30 min).",
	},
	{
		key: "agentStallTimeoutMs",
		env: "KAINBAIN_AGENT_STALL_TIMEOUT_MS",
		aliases: [],
		type: "int",
		default: 600000,
		min: 0,
		group: "timeouts",
		doc: "Max silence before an agent stage is marked stalled (10 min; 0 disables).",
	},
	{
		key: "ciStallTimeoutMs",
		env: "KAINBAIN_CI_STALL_TIMEOUT_MS",
		aliases: [],
		type: "int",
		default: 300000,
		min: 0,
		group: "timeouts",
		doc: "Max silence before a CI/script stage is marked stalled (5 min; 0 disables). Secondary guard: a running CI/script stage heartbeats on the ciHeartbeatIntervalMs keep-alive while its child runs, so only a stage whose child (and keep-alive) is truly dead goes silent.",
	},
	{
		key: "ciHeartbeatIntervalMs",
		env: "KAINBAIN_CI_HEARTBEAT_INTERVAL_MS",
		aliases: [],
		type: "int",
		default: 30000,
		min: 0,
		group: "timeouts",
		doc: "Keep-alive tick for a running CI/script stage (30s): the stage heartbeat is refreshed on this interval while the child runs, so a legitimately quiet command (a long test gate, an install, a docker build) is never killed as stalled by silence alone. Must stay below KAINBAIN_CI_STALL_TIMEOUT_MS; 0 disables the keep-alive (emergency lever — the silence watchdog then guards alone).",
	},
	{
		key: "mergeStallTimeoutMs",
		env: "KAINBAIN_MERGE_STALL_TIMEOUT_MS",
		aliases: [],
		type: "int",
		default: 900000,
		min: 0,
		group: "timeouts",
		doc: "Max silence before a merge stage is marked stalled (15 min; 0 disables).",
	},
	{
		key: "queueEntryTimeoutMs",
		env: "KAINBAIN_QUEUE_ENTRY_TIMEOUT_MS",
		aliases: [],
		type: "int",
		default: 900000,
		min: 0,
		group: "timeouts",
		doc: "Settle guarantee for one ExecutionQueue entry (15 min; 0 disables). A stage run that neither resolves nor rejects within this budget is force-settled with an EQUEUE_TIMEOUT rejection and routed to the transient-failure ladder, so a single wedged run can never park the scheduler forever. Must stay above the longest stall-silence budget; 0 disables the guarantee (emergency lever — the scheduler wedge watchdog then guards alone).",
	},
	{
		key: "chatPromptTimeoutMs",
		env: "KAINBAIN_CHAT_PROMPT_TIMEOUT_MS",
		aliases: [],
		type: "int",
		default: 0,
		min: 0,
		group: "timeouts",
		doc: "Opt-in ceiling for one retrospective chat turn in ms; 0 (default) disables it so the turn runs until the model answers or the caller cancels. Set an explicit positive value to re-impose a ceiling (slow turns then surface as structured 504 JSON).",
	},
	{
		key: "stuckCheckTimeoutMs",
		env: "KAINBAIN_STUCK_CHECK_TIMEOUT_MS",
		aliases: [],
		type: "int",
		default: 120000,
		min: 0,
		group: "timeouts",
		doc: "Wall-clock timeout for one stuck-check diagnosis model run.",
	},
	{
		key: "autoIterationEnabled",
		env: "KAINBAIN_AUTO_ITERATION_ENABLED",
		aliases: ["AUTO_ITERATION_ENABLED"],
		type: "bool",
		default: true,
		group: "timeouts",
		doc: "Master switch for automatic failback-and-retry after a failed stage (fix -> re-test -> re-review).",
	},
	{
		key: "maxAutoIterations",
		env: "KAINBAIN_MAX_AUTO_ITERATIONS",
		aliases: ["MAX_AUTO_ITERATIONS"],
		type: "int",
		default: 8,
		min: 0,
		group: "timeouts",
		doc: "Max automatic failback->re-execute cycles before a task is parked as failed for a human.",
	},
	{
		key: "maxTransientRetries",
		env: "KAINBAIN_MAX_TRANSIENT_RETRIES",
		aliases: ["MAX_TRANSIENT_RETRIES"],
		type: "int",
		default: 5,
		min: 0,
		group: "timeouts",
		doc: "Max same-stage retries for transient infra failures (5xx, timeouts) before parking at the stage that actually failed.",
	},
	{
		key: "transientRetryBaseMs",
		env: "KAINBAIN_TRANSIENT_RETRY_BASE_MS",
		aliases: [],
		type: "int",
		default: 2000,
		min: 0,
		group: "timeouts",
		doc: "Base delay for Tier-2 transient same-stage retries in ms (linear: base*attempt; exponential: base*2^(attempt-1)). Set 2000/30000/0 with strategy linear to reproduce the legacy timing exactly.",
	},
	{
		key: "transientRetryCapMs",
		env: "KAINBAIN_TRANSIENT_RETRY_CAP_MS",
		aliases: [],
		type: "int",
		default: 60000,
		min: 0,
		group: "timeouts",
		doc: "Ceiling for one Tier-2 transient retry sleep in ms; keeps the scheduler responsive during long gateway flaps.",
	},
	{
		key: "transientRetryJitterMs",
		env: "KAINBAIN_TRANSIENT_RETRY_JITTER_MS",
		aliases: [],
		type: "int",
		default: 1000,
		min: 0,
		group: "timeouts",
		doc: "Symmetric jitter bound in ms applied to each Tier-2 retry delay (actual = base-delay +/- uniform(0, jitter), clamped to [0, cap]); decorrelates retries against rate-limited providers.",
	},
	{
		key: "transientRetryStrategy",
		env: "KAINBAIN_TRANSIENT_RETRY_STRATEGY",
		aliases: [],
		type: "enum",
		values: ["exponential", "linear"],
		default: "exponential",
		group: "timeouts",
		doc: "Tier-2 backoff shape: exponential (base*2^(attempt-1), capped) or linear (base*attempt, capped — legacy behavior with base 2000/cap 30000/jitter 0).",
	},
	{
		key: "toolLoopStrikes",
		env: "KAINBAIN_TOOL_LOOP_STRIKES",
		aliases: [],
		type: "int",
		default: 3,
		min: 1,
		group: "timeouts",
		doc: "Consecutive tool failures before the agent tool-loop guard aborts the stage (global default; per-stage/per-project tuning reserved for WP9 auto-iteration calibration).",
	},

	// --- Health & Observability ---------------------------------------------
	{
		key: "modelCacheTtlMs",
		env: "KAINBAIN_MODEL_CACHE_TTL_MS",
		aliases: [],
		type: "int",
		default: 30000,
		min: 0,
		group: "health",
		doc: "Model-discovery cache TTL.",
	},
	{
		key: "healthCacheTtlMs",
		env: "KAINBAIN_HEALTH_CACHE_TTL_MS",
		aliases: [],
		type: "int",
		default: 15000,
		min: 0,
		group: "health",
		doc: "Health-check aggregate cache TTL.",
	},
	{
		key: "healthLiteLLMTimeoutMs",
		env: "KAINBAIN_HEALTH_LITELLM_TIMEOUT_MS",
		aliases: [],
		type: "int",
		default: 3000,
		min: 0,
		group: "health",
		doc: "LiteLLM probe timeout.",
	},
	{
		key: "healthOllamaTimeoutMs",
		env: "KAINBAIN_HEALTH_OLLAMA_TIMEOUT_MS",
		aliases: [],
		type: "int",
		default: 4000,
		min: 0,
		group: "health",
		doc: "Ollama Cloud probe timeout.",
	},
	{
		key: "healthHarnessTimeoutMs",
		env: "KAINBAIN_HEALTH_HARNESS_TIMEOUT_MS",
		aliases: [],
		type: "int",
		default: 4000,
		min: 0,
		group: "health",
		doc: "Per-harness health-probe timeout (a slow probe reports an error check without blocking the aggregate).",
	},
	{
		key: "modelsHarnessTimeoutMs",
		env: "KAINBAIN_MODELS_HARNESS_TIMEOUT_MS",
		aliases: [],
		type: "int",
		default: 8000,
		min: 0,
		group: "health",
		doc: "Per-harness model-listing timeout (a slow harness serves an honest empty list instead of stalling the catalogue).",
	},
	{
		key: "refreshModelsOnHarnessRefresh",
		env: "KAINBAIN_REFRESH_MODELS_ON_HARNESS_REFRESH",
		aliases: [],
		type: "bool",
		default: true,
		group: "health",
		doc: "System Settings harness Refresh also re-runs the shared model catalogue past both caches; 0 restores the old harness-only refresh.",
	},
	{
		key: "healthMemCriticalPct",
		env: "KAINBAIN_HEALTH_MEM_CRITICAL_PCT",
		aliases: [],
		type: "int",
		default: 95,
		min: 0,
		max: 100,
		group: "health",
		doc: "Memory % used -> device health error.",
	},
	{
		key: "healthMemWarnPct",
		env: "KAINBAIN_HEALTH_MEM_WARN_PCT",
		aliases: [],
		type: "int",
		default: 85,
		min: 0,
		max: 100,
		group: "health",
		doc: "Memory % used -> device health warning.",
	},
	{
		key: "healthLoadCriticalPerCore",
		env: "KAINBAIN_HEALTH_LOAD_CRITICAL_PER_CORE",
		aliases: [],
		type: "float",
		default: 4.0,
		min: 0,
		group: "health",
		doc: "Load-per-core -> device health error.",
	},
	{
		key: "healthLoadWarnPerCore",
		env: "KAINBAIN_HEALTH_LOAD_WARN_PER_CORE",
		aliases: [],
		type: "float",
		default: 2.5,
		min: 0,
		group: "health",
		doc: "Load-per-core -> device health warning.",
	},
	{
		key: "alertWebhookUrl",
		env: "KAINBAIN_ALERT_WEBHOOK_URL",
		aliases: [],
		type: "url",
		default: "",
		group: "health",
		doc: "Outbound alert webhook endpoint (signed POST per parked failure, checkpoint, trip/reset, rollback, and failback warning). Empty (default) disables outbound alerting entirely.",
	},
	{
		key: "alertWebhookSecret",
		env: "KAINBAIN_ALERT_WEBHOOK_SECRET",
		aliases: [],
		type: "string",
		default: "",
		group: "health",
		doc: "HMAC-SHA256 key signing outbound alert bodies (X-KainBain-Signature). Empty sends unsigned; the secret never enters payloads or logs.",
		secret: true,
	},
	{
		key: "alertRetries",
		env: "KAINBAIN_ALERT_RETRIES",
		aliases: [],
		type: "int",
		default: 3,
		min: 0,
		group: "health",
		doc: "Total POST attempts per alert delivery before giving up (a dead sink never fails the task).",
	},
	{
		key: "alertRetryBaseMs",
		env: "KAINBAIN_ALERT_RETRY_BASE_MS",
		aliases: [],
		type: "int",
		default: 500,
		min: 0,
		group: "health",
		doc: "Base backoff between alert retries in ms (exponential with jitter).",
	},
	{
		key: "alertTimeoutMs",
		env: "KAINBAIN_ALERT_TIMEOUT_MS",
		aliases: [],
		type: "int",
		default: 5000,
		min: 0,
		group: "health",
		doc: "Per-attempt timeout for one alert POST in ms.",
	},

	// --- Engine circuit breaker (Tier 5 containment) -----------------------
	{
		key: "circuitBreakerEnabled",
		env: "KAINBAIN_CIRCUIT_ENABLED",
		aliases: [],
		type: "bool",
		default: true,
		group: "health",
		doc: "Master switch for the global engine circuit breaker (Tier 5 containment). 0 disables every auto-trip sensor and the manual trip gate still works.",
	},
	{
		key: "circuitStateFile",
		env: "KAINBAIN_CIRCUIT_STATE_FILE",
		aliases: [],
		type: "path",
		default: () =>
			path.join(os.homedir(), ".kainbain", "engine", "circuit.json"),
		defaultDoc: "~/.kainbain/engine/circuit.json",
		group: "health",
		doc: "Durable JSON file holding the engine containment state (tripped/reset reason, source, timestamps, canary). Survives restarts.",
	},
	{
		key: "circuitInfraSensorEnabled",
		env: "KAINBAIN_CIRCUIT_INFRA_ENABLED",
		aliases: [],
		type: "bool",
		default: true,
		group: "health",
		doc: "Trip sensor: N infrastructure failures across distinct tasks inside the sliding window.",
	},
	{
		key: "circuitInfraFailureThreshold",
		env: "KAINBAIN_CIRCUIT_INFRA_FAILURE_THRESHOLD",
		aliases: [],
		type: "int",
		default: 3,
		min: 1,
		group: "health",
		doc: "Consecutive infrastructure failures (across any tasks, inside the window) before the engine trips. Counted per failure, not per distinct task: the single-active scheduler retries the same stage in place, so a provider outage surfaces as a streak on one task.",
	},
	{
		key: "circuitInfraFailureWindowMs",
		env: "KAINBAIN_CIRCUIT_INFRA_FAILURE_WINDOW_MS",
		aliases: [],
		type: "int",
		default: 600000,
		min: 0,
		group: "health",
		doc: "Sliding window (ms) for the infrastructure-failure trip sensor; failures older than this fall out.",
	},
	{
		key: "circuitAuthSensorEnabled",
		env: "KAINBAIN_CIRCUIT_AUTH_ENABLED",
		aliases: [],
		type: "bool",
		default: true,
		group: "health",
		doc: "Trip sensor: sustained provider authentication failures (HTTP 401/403, invalid api key) across distinct tasks.",
	},
	{
		key: "circuitAuthFailureThreshold",
		env: "KAINBAIN_CIRCUIT_AUTH_FAILURE_THRESHOLD",
		aliases: [],
		type: "int",
		default: 3,
		min: 1,
		group: "health",
		doc: "Consecutive provider-authentication failures (401/403/invalid key) before the engine trips; auth never self-heals by retrying.",
	},
	{
		key: "circuitAuthFailureWindowMs",
		env: "KAINBAIN_CIRCUIT_AUTH_FAILURE_WINDOW_MS",
		aliases: [],
		type: "int",
		default: 600000,
		min: 0,
		group: "health",
		doc: "Sliding window (ms) for the provider-authentication trip sensor.",
	},
	{
		key: "circuitDiskSensorEnabled",
		env: "KAINBAIN_CIRCUIT_DISK_ENABLED",
		aliases: [],
		type: "bool",
		default: true,
		group: "health",
		doc: "Trip sensor: host disk free space below the configured floor.",
	},
	{
		key: "circuitDiskFreeFloorBytes",
		env: "KAINBAIN_CIRCUIT_DISK_FREE_FLOOR_BYTES",
		aliases: [],
		type: "int",
		default: 1073741824,
		min: 0,
		group: "health",
		doc: "Free-disk floor in bytes; a confirmed breach trips the engine before any further dispatch.",
	},
	{
		key: "circuitDiskProbePath",
		env: "KAINBAIN_CIRCUIT_DISK_PROBE_PATH",
		aliases: [],
		type: "path",
		default: () => os.homedir(),
		defaultDoc: "~ (home directory)",
		group: "health",
		doc: "Path whose filesystem is probed for free space by the disk trip sensor.",
	},
	{
		key: "circuitMemSensorEnabled",
		env: "KAINBAIN_CIRCUIT_MEM_ENABLED",
		aliases: [],
		type: "bool",
		default: true,
		group: "health",
		doc: "Trip sensor: memory-critical percentage sustained over M scheduler ticks.",
	},
	{
		key: "circuitMemSustainedTicks",
		env: "KAINBAIN_CIRCUIT_MEM_SUSTAINED_TICKS",
		aliases: [],
		type: "int",
		default: 3,
		min: 1,
		group: "health",
		doc: "Consecutive scheduler ticks memory must stay at/above KAINBAIN_HEALTH_MEM_CRITICAL_PCT before the engine trips (debounces GC spikes).",
	},
	{
		key: "circuitProbeEnabled",
		env: "KAINBAIN_CIRCUIT_PROBE_ENABLED",
		aliases: [],
		type: "bool",
		default: true,
		group: "health",
		doc: "Half-open canary probe: while tripped, admit exactly one test task after the cooldown before lifting containment fully.",
	},
	{
		key: "circuitProbeCooldownMs",
		env: "KAINBAIN_CIRCUIT_PROBE_COOLDOWN_MS",
		aliases: [],
		type: "int",
		default: 60000,
		min: 0,
		group: "health",
		doc: "Delay before the first half-open canary is admitted after a trip, and the base for exponential re-trip backoff.",
	},
	{
		key: "circuitProbeBackoffCapMs",
		env: "KAINBAIN_CIRCUIT_PROBE_BACKOFF_CAP_MS",
		aliases: [],
		type: "int",
		default: 600000,
		min: 0,
		group: "health",
		doc: "Upper bound for the canary re-trip cooldown backoff (each failed canary doubles the wait, capped here).",
	},
	{
		key: "circuitProbeFailureRetrips",
		env: "KAINBAIN_CIRCUIT_PROBE_FAILURE_RETRIPS",
		aliases: [],
		type: "bool",
		default: true,
		group: "health",
		doc: "Whether a non-infrastructure (logical) canary failure also re-trips conservatively. 0 lets a logical failure lift the trip instead.",
	},

	// --- Skills & Prompts ---------------------------------------------------
	{
		key: "stageSkillsMaxChars",
		env: "KAINBAIN_STAGE_SKILLS_MAX_CHARS",
		aliases: [],
		type: "int",
		default: 16000,
		min: 0,
		group: "skills",
		doc: "Cap on injected skill text (chars) in one curated stage prompt.",
	},
	{
		key: "skillsCacheTtlMs",
		env: "KAINBAIN_SKILLS_CACHE_TTL_MS",
		aliases: [],
		type: "int",
		default: 5000,
		min: 0,
		group: "skills",
		doc: "Stage-skills directory scan cache TTL.",
	},
	{
		key: "skillImportMaxBytes",
		env: "KAINBAIN_SKILL_IMPORT_MAX_BYTES",
		aliases: [],
		type: "int",
		default: 1024 * 1024,
		min: 0,
		group: "skills",
		doc: "Max bytes for one skill import upload (.md/.zip); oversized uploads are rejected with 413.",
	},
	{
		key: "skillImportZipMaxEntries",
		env: "KAINBAIN_SKILL_IMPORT_ZIP_MAX_ENTRIES",
		aliases: [],
		type: "int",
		default: 64,
		min: 0,
		group: "skills",
		doc: "Max file entries accepted inside an import zip (zip-bomb guard).",
	},
	{
		key: "skillImportZipMaxBytes",
		env: "KAINBAIN_SKILL_IMPORT_ZIP_MAX_BYTES",
		aliases: [],
		type: "int",
		default: 512 * 1024,
		min: 0,
		group: "skills",
		doc: "Max total uncompressed bytes of an import zip (zip-bomb guard).",
	},
	{
		key: "chatSkillsMaxChars",
		env: "KAINBAIN_CHAT_SKILLS_MAX_CHARS",
		aliases: [],
		type: "int",
		default: 6000,
		min: 0,
		group: "skills",
		doc: "Cap on injected skill text (chars) in one chat turn.",
	},

	// --- Tasks & Review -----------------------------------------------------
	{
		key: "processLogMaxBytes",
		env: "KAINBAIN_PROCESS_LOG_MAX_BYTES",
		aliases: [],
		type: "int",
		default: 32000,
		min: 0,
		group: "tasks",
		doc: "Max bytes of one stage's captured streamed output kept in memory while it runs (in-flight buffers, not stored task logs).",
	},
	{
		key: "logEntriesMaxCount",
		env: "KAINBAIN_LOG_ENTRIES_MAX_COUNT",
		aliases: [],
		type: "int",
		default: 500,
		min: 0,
		group: "tasks",
		doc: "Max structured log entries kept on a task (oldest evicted under a marker; the single bound on task log storage).",
	},
	{
		key: "telemetryMaxCount",
		env: "KAINBAIN_TELEMETRY_MAX_COUNT",
		aliases: [],
		type: "int",
		default: 100,
		min: 0,
		group: "tasks",
		doc: "Max usage-telemetry records kept per stage run (reserved budget inside logEntriesMaxCount).",
	},
	{
		key: "rawMaxCount",
		env: "KAINBAIN_LOG_RAW_MAX_COUNT",
		aliases: [],
		type: "int",
		default: 50,
		min: 0,
		group: "tasks",
		doc: "Max unmapped-wire evidence records kept per stage run (overflow evicted under a raw-lane marker).",
	},
	{
		key: "rawMaxBytes",
		env: "KAINBAIN_LOG_RAW_MAX_BYTES",
		aliases: [],
		type: "int",
		default: 8192,
		min: 0,
		group: "tasks",
		doc: "Max bytes of one raw evidence source payload (scrubbed + truncated).",
	},
	{
		key: "taskImageMaxBytes",
		env: "KAINBAIN_TASK_IMAGE_MAX_BYTES",
		aliases: [],
		type: "int",
		default: 10 * 1024 * 1024,
		min: 0,
		group: "tasks",
		doc: "Max bytes for one uploaded task image (10 MB); oversized uploads are rejected with 413.",
	},
	{
		key: "taskImageMaxPerTask",
		env: "KAINBAIN_TASK_IMAGE_MAX_PER_TASK",
		aliases: [],
		type: "int",
		default: 20,
		min: 0,
		group: "tasks",
		doc: "Max image assets stored per task folder.",
	},
	{
		key: "taskImageMaxPromptRefs",
		env: "KAINBAIN_TASK_IMAGE_MAX_PROMPT_REFS",
		aliases: [],
		type: "int",
		default: 10,
		min: 0,
		group: "tasks",
		doc: "Max image file references injected into one curated stage prompt (overflow is summarized).",
	},
	{
		key: "taskImageMaxAttachBytes",
		env: "KAINBAIN_TASK_IMAGE_MAX_ATTACH_BYTES",
		aliases: [],
		type: "int",
		default: 10 * 1024 * 1024,
		min: 0,
		group: "tasks",
		doc: "Max total bytes of image data attached to one vision-capable dispatch.",
	},
	{
		key: "stuckCheckMaxLogChars",
		env: "KAINBAIN_STUCK_CHECK_MAX_LOG_CHARS",
		aliases: [],
		type: "int",
		default: 20000,
		min: 0,
		group: "tasks",
		doc: "Max chars of per-feed task logs sent to the stuck-check diagnosis model (tail kept).",
	},
	{
		key: "reviewDiffMaxBytes",
		env: "KAINBAIN_REVIEW_DIFF_MAX_BYTES",
		aliases: [],
		type: "int",
		default: 256 * 1024,
		min: 0,
		group: "tasks",
		doc: "Max bytes for a single file diff in the review view.",
	},
	{
		key: "reviewMaxCommentChars",
		env: "KAINBAIN_REVIEW_MAX_COMMENT_CHARS",
		aliases: [],
		type: "int",
		default: 4000,
		min: 0,
		group: "tasks",
		doc: "Max characters for a review comment body.",
	},
	{
		key: "pushNotificationsEnabled",
		env: "KAINBAIN_PUSH_NOTIFICATIONS_ENABLED",
		aliases: [],
		type: "bool",
		default: true,
		group: "tasks",
		doc: "Master switch for Web Push notifications (queue-empty and human-intervention alerts); per-trigger toggles live in General App Settings.",
	},
	{
		key: "vapidSubject",
		env: "VAPID_SUBJECT",
		aliases: [],
		type: "string",
		default: "mailto:admin@kainbain.local",
		group: "server",
		doc: "VAPID contact subject (mailto: or URL) identifying the push sender to browser push services.",
	},

	// --- Sessions & Workflows -------------------------------------------------
	{
		key: "schedulerIntervalMs",
		env: "KAINBAIN_SCHEDULER_INTERVAL_MS",
		aliases: [],
		type: "int",
		default: 3000,
		min: 0,
		group: "sessions",
		doc: "Autonomous scheduler tick interval.",
	},
	{
		key: "schedulerDisabled",
		env: "KAINBAIN_DISABLE_SCHEDULER",
		aliases: ["SCHEDULER_DISABLED", "DISABLE_SCHEDULER"],
		type: "bool",
		default: false,
		group: "sessions",
		doc: "Disable the autonomous scheduler loop (for test harnesses or scratch instances).",
	},
	{
		key: "sessionTtlMs",
		env: "KAINBAIN_SESSION_TTL_MS",
		aliases: [],
		type: "int",
		default: 30 * 60 * 1000,
		min: 0,
		group: "sessions",
		doc: "Idle TTL before a session with no open sockets is disposed.",
	},
	{
		key: "sessionCleanupMs",
		env: "KAINBAIN_SESSION_CLEANUP_MS",
		aliases: [],
		type: "int",
		default: 60 * 1000,
		min: 0,
		group: "sessions",
		doc: "Session cleanup sweep interval.",
	},
	{
		key: "workflowRunTtlMs",
		env: "KAINBAIN_WORKFLOW_RUN_TTL_MS",
		aliases: [],
		type: "int",
		default: 24 * 60 * 60 * 1000,
		min: 0,
		group: "sessions",
		doc: "Workflow-run TTL (entries older than this are swept so the registry does not grow unboundedly).",
	},
	{
		key: "workflowSweepMs",
		env: "KAINBAIN_WORKFLOW_SWEEP_MS",
		aliases: [],
		type: "int",
		default: 60 * 60 * 1000,
		min: 0,
		group: "sessions",
		doc: "Workflow-run TTL sweep interval.",
	},
	{
		key: "selfDeployContinuity",
		env: "KAINBAIN_SELF_DEPLOY_CONTINUITY",
		aliases: [],
		type: "string",
		default: "",
		group: "sessions",
		doc: "Opt this implementation into KainBain's cross-restart self-deploy continuity (api/continuity/). Set to exactly 1 to enable; unset or any other value leaves the generic pipeline free of deploy-specific behaviour.",
	},
];

/***
 * MARK: resolveEntryDefault
 * @description Resolves one entry's default: literals as-is, `{ ref: key }`
 *   chained defaults from the already-loaded config, `() => value` computed
 *   defaults evaluated fresh per load.
 * @example resolveEntryDefault({ default: 3100 }, {}) => 3100
 ***/
function resolveEntryDefault(entry, loadedConfig) {
	const fallback = entry.default;
	if (typeof fallback === "function") return fallback();
	if (fallback !== null && typeof fallback === "object" && fallback.ref) {
		if (!(fallback.ref in loadedConfig)) {
			const known = CONFIG_SCHEMA.some(
				(candidate) => candidate.key === fallback.ref,
			);
			if (!known) {
				throw new Error(
					`CONFIG schema: default of "${entry.env}" references unknown key "${fallback.ref}"`,
				);
			}
			return PENDING_REF;
		}
		return loadedConfig[fallback.ref];
	}
	if (Array.isArray(fallback)) return [...fallback];
	return fallback;
}

/***
 * MARK: pending chained default
 * @description Sentinel for a chained default whose target loads later in
 *   schema order. `loadConfig` resolves these in a second pass so entry order
 *   never matters.
 ***/
const PENDING_REF = Symbol("pending-chained-default");

/***
 * MARK: applyDefault
 * @description Stores one entry's default, deferring chained `{ ref }`
 *   defaults whose target has not loaded yet to the second pass.
 * @example applyDefault(entry, loaded, sources, pendingRefs)
 ***/
function applyDefault(entry, loaded, sources, pendingRefs) {
	const resolved = resolveEntryDefault(entry, loaded);
	if (resolved === PENDING_REF) {
		pendingRefs.push([entry.key, entry]);
	} else {
		loaded[entry.key] = resolved;
	}
	sources[entry.key] = { var: entry.env, source: "default" };
}

/***
 * MARK: readEnvValue
 * @description Reads one variable name from an env-like object. Split out so
 *   the object-injection suppression lives in exactly one place.
 * @example readEnvValue({ PORT: "1" }, "PORT") => "1"
 ***/
function readEnvValue(env, name) {
	/* eslint-disable-next-line security/detect-object-injection -- names come from the compile-time schema */
	return env[name];
}

/***
 * MARK: loadConfig
 * @description Validates an env-like object against CONFIG_SCHEMA and returns
 *   `{ config, warnings, sources }`. Throws `ConfigError` on the first
 *   malformed explicitly-set value (fail fast at boot). Deprecated aliases
 *   are honored with a once-per-load `CONFIG DEPRECATION` warning delivered
 *   to `onWarning` (default: `console.warn`).
 * @example loadConfig({}).config.port => 3100
 * @example loadConfig({ PORT: "nope" }) // throws ConfigError naming PORT
 * @param {Object} [env] - Env-like object (defaults to `process.env`).
 * @param {Object} [options]
 * @param {Function} [options.onWarning] - Warning sink (defaults to console.warn).
 * @returns {{ config: Object, warnings: string[], sources: Object }}
 ***/
export function loadConfig(env = process.env, options = {}) {
	const onWarning = options.onWarning || ((message) => console.warn(message));
	const loaded = {};
	const pendingRefs = [];
	const sources = {};
	const warnings = [];
	const warned = new Set();
	const warnOnce = (message) => {
		if (warned.has(message)) return;
		warned.add(message);
		warnings.push(message);
		onWarning(message);
	};

	for (const entry of CONFIG_SCHEMA) {
		const canonicalRaw = readEnvValue(env, entry.env);
		const canonicalSet = !isUnset(canonicalRaw)
			&& (entry.type === "string" || String(canonicalRaw).trim() !== "");
		let aliasUsed = null;
		let aliasRaw;
		for (const alias of entry.aliases || []) {
			const raw = readEnvValue(env, alias);
			const set = !isUnset(raw)
				&& (entry.type === "string" || String(raw).trim() !== "");
			if (set) {
				aliasUsed = alias;
				aliasRaw = raw;
				break;
			}
		}
		if (aliasUsed && canonicalSet) {
			warnOnce(
				`CONFIG DEPRECATION ${aliasUsed} is deprecated, use ${entry.env} (canonical wins, alias ignored)`,
			);
		} else if (aliasUsed) {
			warnOnce(
				`CONFIG DEPRECATION ${aliasUsed} is deprecated, use ${entry.env}`,
			);
		}

		const activeVar = canonicalSet ? entry.env : aliasUsed;
		const activeRaw = canonicalSet ? canonicalRaw : aliasRaw;
		if (activeVar) {
			const parsed = parseTypedValue(entry, activeRaw, activeVar);
			if (parsed === undefined) {
				applyDefault(entry, loaded, sources, pendingRefs);
			} else {
				loaded[entry.key] = parsed;
				sources[entry.key] = {
					var: activeVar,
					source: canonicalSet ? "env" : "alias",
				};
			}
		} else {
			applyDefault(entry, loaded, sources, pendingRefs);
		}
	}

	let remaining = pendingRefs;
	for (let guard = 0; guard <= CONFIG_SCHEMA.length && remaining.length > 0; guard++) {
		const stillPending = [];
		for (const [key, entry] of remaining) {
			if (entry.default.ref in loaded) {
				/* eslint-disable-next-line security/detect-object-injection -- keys come from the compile-time schema */
				loaded[key] = loaded[entry.default.ref];
			} else {
				stillPending.push([key, entry]);
			}
		}
		if (stillPending.length === remaining.length) {
			throw new Error(
				`CONFIG schema: unresolvable chained default for "${stillPending[0][1].env}"`,
			);
		}
		remaining = stillPending;
	}

	for (const message of checkTimeoutPairing(loaded)) warnOnce(message);
	for (const message of checkCiStallCoherence(loaded)) warnOnce(message);
	return { config: loaded, warnings, sources };
}

/***
 * MARK: checkCiStallCoherence
 * @description Cross-field sanity check for the CI liveness pair: the
 *   keep-alive interval must sit strictly below the silence threshold, or a
 *   healthy quiet stage is killed as stalled between its own heartbeats;
 *   and a disabled keep-alive (0) with an armed watchdog resurrects the
 *   original false-stall defect (a quiet command longer than the threshold
 *   dies), so it warns instead of failing silently. Warns only — an operator
 *   who sets these deliberately keeps the emergency levers.
 * @example checkCiStallCoherence({ ciStallTimeoutMs: 300000, ciHeartbeatIntervalMs: 30000 }) => []
 * @example checkCiStallCoherence({ ciStallTimeoutMs: 20000, ciHeartbeatIntervalMs: 30000 }).length => 1
 * @param {Object} loaded - The fully-loaded config object.
 * @returns {string[]} Warning messages (empty when the pairing is healthy).
 ***/
export function checkCiStallCoherence(loaded) {
	const messages = [];
	const stallMs = Number(loaded.ciStallTimeoutMs);
	const beatMs = Number(loaded.ciHeartbeatIntervalMs);
	// A disabled watchdog (0) has nothing to be coherent with.
	if (!Number.isFinite(stallMs) || stallMs <= 0) {
		return messages;
	}
	if (!Number.isFinite(beatMs) || beatMs <= 0) {
		messages.push(
			`CONFIG WARNING KAINBAIN_CI_HEARTBEAT_INTERVAL_MS=0 disables the command-stage keep-alive while the silence watchdog stays armed (KAINBAIN_CI_STALL_TIMEOUT_MS=${stallMs}): a legitimately quiet CI/script stage longer than ${stallMs}ms will be killed as stalled`,
		);
		return messages;
	}
	if (beatMs >= stallMs) {
		messages.push(
			`CONFIG WARNING KAINBAIN_CI_HEARTBEAT_INTERVAL_MS (${beatMs}) must stay below KAINBAIN_CI_STALL_TIMEOUT_MS (${stallMs}) or a healthy quiet stage is declared stalled between its own heartbeats`,
		);
	}
	return messages;
}

/***
 * MARK: checkTimeoutPairing
 * @description Cross-field sanity checks that warn (never throw): when an
 *   operator opts into a positive chat turn ceiling, the Node HTTP ceiling
 *   must sit above it (disabled 0 ceilings never warn — there is no client
 *   timeout to pair against anymore), and warn thresholds below critical
 *   thresholds.
 * @example checkTimeoutPairing(loadConfig({}).config) => []
 * @param {Object} loaded - The fully-loaded config object.
 * @returns {string[]} Warning messages (empty when the pairing is healthy).
 ***/
export function checkTimeoutPairing(loaded) {
	const messages = [];
	// Chat ceilings are disabled by default (0) — only warn about pairing
	// when the operator opts back into positive ceilings on both knobs and
	// they are mis-ordered (an HTTP ceiling at or below the chat ceiling
	// kills long turns with a bare 408 instead of a structured 504).
	const chatCeiling = loaded.chatPromptTimeoutMs;
	const httpCeiling = loaded.serverRequestTimeoutMs;
	if (chatCeiling > 0 && httpCeiling > 0 && httpCeiling <= chatCeiling) {
		messages.push(
			`CONFIG WARNING KAINBAIN_SERVER_REQUEST_TIMEOUT_MS (${loaded.serverRequestTimeoutMs}) must stay above KAINBAIN_CHAT_PROMPT_TIMEOUT_MS (${loaded.chatPromptTimeoutMs}) or long turns die with a bare 408 instead of a structured 504`,
		);
	}
	if (loaded.healthMemWarnPct > loaded.healthMemCriticalPct) {
		messages.push(
			"CONFIG WARNING KAINBAIN_HEALTH_MEM_WARN_PCT should not exceed KAINBAIN_HEALTH_MEM_CRITICAL_PCT",
		);
	}
	if (loaded.healthLoadWarnPerCore > loaded.healthLoadCriticalPerCore) {
		messages.push(
			"CONFIG WARNING KAINBAIN_HEALTH_LOAD_WARN_PER_CORE should not exceed KAINBAIN_HEALTH_LOAD_CRITICAL_PER_CORE",
		);
	}
	return messages;
}

/***
 * MARK: schema paths
 * @description Repo paths the schema defaults derive from (exported for tests
 *   so default assertions do not re-hardcode join logic).
 * @example REPO_ROOT => '/home/.../kainbain'
 ***/
export { API_DIR, CONFIG_DIR, REPO_ROOT };
