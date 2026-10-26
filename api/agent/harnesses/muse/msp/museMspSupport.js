import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildChildEnv } from "../../shared/harnessScaffold.js";
import { config } from "../../../../config/index.js";

/**
 * MARK: museMspSupport
 * @description The Muse Code FLAVOR adapter for the purpose-built Muse
 *   Session Protocol (MSP) client (`api/agent/harnesses/muse/msp/`):
 *   everything muse-specific about the two-way `muse serve` session lives
 *   here and ONLY here, mirroring `vibe/vibeAcpSupport.js`. Verified against
 *   `muse` 1.4.9 with `muse serve --provider echo` and the stable schema
 *   export (`sha256:5d3b43e5…1d914c`, schema v1):
 *
 *   - `serve` spawn-plan building (provider/model pin, sandbox-posture guard,
 *     workspace root carried as the session pin rather than an argv flag),
 *   - child-env sanitization (the `~/.config/muse` cache reaches the child via
 *     `MUSE_*`/`XDG_*`; secret redaction),
 *   - the handshake (`initialize` + the mandatory `initialized` notification)
 *     and session/start params (`workspaceRoot`, never `--workspace`),
 *   - the CLOSED approval-mode enum mapping (select, never create) and the
 *     default-deny permission policy,
 *   - transport selection (`KAINBAIN_MUSE_MSP=auto/on/off`) with an `exec`
 *     fallback that keeps old `muse` installs and the mock working,
 *   - startup-failure classification (bin-missing / handshake-timeout /
 *     auth / discovery-failed, each with one concrete fix naming the
 *     `KAINBAIN_MUSE_MSP=off` rollback).
 */

/** The MSP envelope schema version this client speaks. */
export const MUSE_MSP_SCHEMA_VERSION = 1;

/**
 * The stable-surface fingerprint pinned from the spike/probe. A host whose
 * `initialize.schema.fingerprint` differs is a deliberate protocol change, so
 * the client records the mismatch loudly instead of silently misreading it.
 */
export const MUSE_MSP_SCHEMA_FINGERPRINT =
	"sha256:5d3b43e5ccdb7dc4f5a32c380f5f2cde0f10e3059b93610afb2e73f73b1d914c";

/** The CLOSED approval enforcement modes (select, never create). */
export const MUSE_MSP_APPROVAL_MODES = Object.freeze([
	"allowAll",
	"promptUnmatched",
	"onRequest",
	"denyUnmatched",
]);

/** The default client identification sent in `initialize`. */
export const MUSE_MSP_CLIENT_NAME = "kainbain";

/**
 * Default grace between the per-turn watchdog's `turn/interrupt` and the
 * force-settle of a still-wedged turn (ms). Overridable per harness via
 * `mspTurnSettleGraceMs` (KAINBAIN_MUSE_MSP_TURN_SETTLE_GRACE_MS).
 */
export const DEFAULT_MUSE_MSP_TURN_SETTLE_GRACE_MS = 30000;

/** Exact env names kept in the `muse serve` child environment. */
const MUSE_MSP_ENV_KEEP_EXACT = new Set([
	"PATH",
	"HOME",
	"LANG",
	"TZ",
	"SHELL",
	"TMPDIR",
	"HTTP_PROXY",
	"http_proxy",
	"HTTPS_PROXY",
	"https_proxy",
	"NO_PROXY",
	"no_proxy",
]);

/** Env-name prefixes kept in the `muse serve` child environment (muse cache + tool config). */
const MUSE_MSP_ENV_KEEP_PREFIXES = ["MUSE_", "XDG_"];

/***
 * MARK: resolveMuseMspSettings
 * @description Resolves the MSP-transport settings from injected overrides or
 *   the validated engine configuration (`KAINBAIN_MUSE_MSP*`). These own ONLY
 *   the serve path — every exec setting stays in `musePermissions.js`'s
 *   `resolveMuseSettings`.
 * @example resolveMuseMspSettings({ mspMode: "off" }) => { mspMode: "off", … }
 * @param {Object} [deps] - Injected overrides (mspMode, mspBin, mspStartTimeoutMs, mspHostIdleTtlMs, mspTurnSettleGraceMs, mspEnv).
 * @returns {Object} { mspMode, mspBin, mspStartTimeoutMs, mspHostIdleTtlMs, mspTurnSettleGraceMs, mspEnv }.
 ***/
export function resolveMuseMspSettings(deps = {}) {
	const modeRaw = deps.mspMode !== undefined ? deps.mspMode : config.museMspMode;
	const binRaw = deps.mspBin !== undefined ? deps.mspBin : config.museMspBin;
	return {
		mspMode: typeof modeRaw === "string" && modeRaw.trim() ? modeRaw.trim() : "auto",
		mspBin: typeof binRaw === "string" ? binRaw.trim() : "",
		// Handshake ceiling for the serve session start (tests shorten it; the
		// per-turn watchdog stays engine-side, as with the exec transport).
		mspStartTimeoutMs: deps.mspStartTimeoutMs || config.museMspStartTimeoutMs || 30000,
		// How long a live serve host may sit unused before it is disposed.
		mspHostIdleTtlMs:
			deps.mspHostIdleTtlMs ?? config.museMspHostIdleTtlMs ?? 300000,
		// Grace between the watchdog's turn/interrupt and the force-settle of
		// a wedged turn; the host is evicted from the pool when it elapses.
		mspTurnSettleGraceMs:
			deps.mspTurnSettleGraceMs ||
			config.museMspTurnSettleGraceMs ||
			DEFAULT_MUSE_MSP_TURN_SETTLE_GRACE_MS,
		// Test/diagnostic env merges ON TOP of the sanitized child env (the
		// mock serve knob is MUSE_-prefixed and already allowed, but tests may
		// inject extra explicit values). Never sourced from configuration.
		mspEnv: deps.mspEnv && typeof deps.mspEnv === "object" ? { ...deps.mspEnv } : null,
	};
}

/***
 * MARK: buildMuseServeSpawnPlan
 * @description Builds the spawn plan for ONE long-lived `muse serve` MSP host:
 *   `muse serve --provider <p> [--model <id>] [--trust-workspace] [...]`.
 *   The workspace is NOT an argv pin on `serve` (unlike `exec`): it is pinned
 *   per session on the wire (`session/start.workspaceRoot`), so the plan
 *   carries `workspaceRoot` alongside the argv for the session builder. The
 *   sandbox posture is fixed for the host's lifetime and `--disable-sandbox`
 *   is constructed ONLY from the explicit `yolo` setting.
 * @example buildMuseServeSpawnPlan({ workspaceDir: "/w", settings: { provider: "echo" } }) => { command: "muse", args: ["serve", "--provider", "echo"], workspaceRoot: "/w" }
 * @param {Object} opts
 * @param {string} opts.workspaceDir - Absolute project workspace root (pinned per session).
 * @param {string|null} [opts.modelId] - Model pinned on the host (null = host default).
 * @param {Object} [opts.settings] - Explicit settings (bin, yolo, trustWorkspace, noSessionLog, provider, extraArgs).
 * @returns {Object} { command, args, workspaceRoot, env, settings }.
 ***/
export function buildMuseServeSpawnPlan({ workspaceDir, modelId = null, settings = {} } = {}) {
	if (!workspaceDir || typeof workspaceDir !== "string") {
		throw new Error(
			"buildMuseServeSpawnPlan requires an absolute workspaceDir (muse sessions are pinned to the project workspace)",
		);
	}
	const workspaceRoot = path.resolve(workspaceDir);
	const resolved = resolveMuseSettingsForServe(settings);
	const args = ["serve"];
	if (resolved.provider) args.push("--provider", String(resolved.provider));
	if (modelId) args.push("--model", String(modelId));
	if (resolved.noSessionLog) args.push("--no-session-log");
	if (resolved.trustWorkspace) args.push("--trust-workspace");
	for (const token of parseMuseServeExtraArgs(resolved.extraArgs)) args.push(token);

	// Sandbox posture is fixed for the host's lifetime; --disable-sandbox
	// carries the same provenance rule as exec's --yolo (explicit opt-in only).
	assertSafeMuseServeArgs(args, { yolo: false });
	if (resolved.yolo) args.push("--disable-sandbox");
	assertSafeMuseServeArgs(args, { yolo: resolved.yolo });

	return {
		command: resolved.bin,
		args,
		workspaceRoot,
		settings: resolved,
	};
}

/** Flags this harness may never construct silently on a serve spawn. */
export const MUSE_SERVE_GUARDED_FLAGS = Object.freeze(["--disable-sandbox"]);

const MUSE_SERVE_SHELL_OPERATOR_PATTERN = /[|;&><$`(){}!#~*?[\]]/;

/***
 * MARK: assertSafeMuseServeArgs
 * @description Hard guard over a `muse serve` argv array: throws when
 *   `--disable-sandbox` is present without the explicit `yolo: true` opt-in
 *   (posture widening must be auditable), and when `--workspace` appears
 *   (that is an `exec`-only spelling — the serve path pins the workspace per
 *   session on the wire).
 * @example assertSafeMuseServeArgs(["serve", "--provider", "echo"], {}) // passes
 * @example assertSafeMuseServeArgs(["serve", "--disable-sandbox"], {}) // throws
 * @param {Array<string>} args - The serve argv under inspection (without the binary).
 * @param {Object} [settings] - Explicit settings ({ yolo: true } permits --disable-sandbox).
 * @returns {boolean} true when the argv is safe.
 ***/
export function assertSafeMuseServeArgs(args, settings = {}) {
	const list = Array.isArray(args) ? args : [];
	if (list.includes("--disable-sandbox") && settings?.yolo !== true) {
		throw new Error(
			"Refusing to spawn muse serve with --disable-sandbox without explicit opt-in (settings.yolo === true): the sandbox posture is fixed for the host lifetime",
		);
	}
	if (list.includes("--workspace")) {
		throw new Error(
			"Refusing --workspace on muse serve: the workspace is pinned per session via session/start.workspaceRoot",
		);
	}
	return true;
}

/***
 * MARK: parseMuseServeExtraArgs
 * @description Validates operator-supplied extra argv for the serve host
 *   (whitespace-tokenized, never shell-interpreted). Rejects shell operators,
 *   `--disable-sandbox` (must come from the explicit yolo setting) and
 *   `--provider`/`--model`/`--workspace` (harness-owned pins).
 * @example parseMuseServeExtraArgs("--contributor-mode off") => ["--contributor-mode", "off"]
 * @param {string} raw - Raw extra-args string.
 * @returns {Array<string>} Validated argv tokens.
 ***/
export function parseMuseServeExtraArgs(raw) {
	if (typeof raw !== "string" || !raw.trim()) return [];
	const tokens = raw.trim().split(/\s+/);
	for (const token of tokens) {
		if (MUSE_SERVE_SHELL_OPERATOR_PATTERN.test(token)) {
			throw new Error(
				`Refusing KAINBAIN_MUSE_MSP_ARGS token "${token}": shell operators are never interpreted`,
			);
		}
		if (token === "--disable-sandbox") {
			throw new Error(
				"Refusing --disable-sandbox in KAINBAIN_MUSE_MSP_ARGS: use KAINBAIN_MUSE_YOLO=1 so the opt-in is explicit",
			);
		}
		if (token === "--workspace" || token === "--provider" || token === "--model") {
			throw new Error(
				`Refusing ${token} in KAINBAIN_MUSE_MSP_ARGS: the harness owns the workspace/provider/model pins`,
			);
		}
	}
	return tokens;
}

/** Shared resolveMuseSettings import is avoided to keep the serve surface independent. */
function resolveMuseSettingsForServe(settings = {}) {
	return {
		bin: settings.bin || config.museBin || "muse",
		provider: settings.provider || "meta",
		yolo: settings.yolo !== undefined ? Boolean(settings.yolo) : Boolean(config.museYolo),
		trustWorkspace:
			settings.trustWorkspace !== undefined
				? Boolean(settings.trustWorkspace)
				: Boolean(config.museTrustWorkspace),
		noSessionLog:
			settings.noSessionLog !== undefined
				? Boolean(settings.noSessionLog)
				: Boolean(config.museNoSessionLog),
		extraArgs: settings.mspExtraArgs !== undefined ? settings.mspExtraArgs : config.museMspArgs,
	};
}

/***
 * MARK: sanitizeMuseMspEnv
 * @description Projects the parent environment onto the minimal allowlist for
 *   the `muse serve` child (shell/locale/proxy basics plus `MUSE_*`/`XDG_*`,
 *   every secret-shaped name dropped). `NODE_NO_WARNINGS=1` keeps runtime
 *   warnings off the protocol stdout. Never mutates its inputs.
 * @example sanitizeMuseMspEnv({ PATH: "/bin", MUSE_API_KEY: "s" }) => { PATH: "/bin", NODE_NO_WARNINGS: "1" }
 * @param {Object} [baseEnv] - The parent environment (defaults to process.env).
 * @returns {Object} The sanitized child environment (a fresh object).
 ***/
export function sanitizeMuseMspEnv(baseEnv = process.env) {
	return buildChildEnv(baseEnv, {
		keepExact: [...MUSE_MSP_ENV_KEEP_EXACT],
		keepPrefixes: MUSE_MSP_ENV_KEEP_PREFIXES,
		extra: { NODE_NO_WARNINGS: "1" },
	});
}

/***
 * MARK: buildMuseMspHandshake
 * @description The MSP `initialize` params: client identification (the name
 *   MUST match `^[a-z0-9_]+$` — probe-verified) with no capability requests
 *   (the v1 engine needs none of the grantable capabilities).
 * @example buildMuseMspHandshake({ version: "1.0.0" }) => { clientInfo: { name: "kainbain", version: "1.0.0" } }
 * @param {Object} [opts]
 * @param {string} [opts.version] - Client version string.
 * @returns {Object} The initialize params.
 ***/
export function buildMuseMspHandshake({ version = "1.0.0" } = {}) {
	return {
		clientInfo: { name: MUSE_MSP_CLIENT_NAME, version: String(version) },
		capabilities: {},
	};
}

/***
 * MARK: buildMuseMspSessionParams
 * @description The `session/start` params: the pinned project workspace root
 *   (NEVER the daemon cwd — GOTCHA-3) plus the resolved approval mode and an
 *   optional initial model. The `commandId` (UUIDv7) is added by the
 *   connection layer at send time.
 * @example buildMuseMspSessionParams({ workspaceRoot: "/repo", approvalMode: "allowAll" }) => { workspaceRoot: "/repo", approvalMode: "allowAll" }
 * @param {Object} [opts]
 * @param {string} [opts.workspaceRoot] - Absolute project workspace root.
 * @param {string} [opts.approvalMode] - One of MUSE_MSP_APPROVAL_MODES.
 * @param {string|null} [opts.modelId] - Initial model id (omitted = host default).
 * @returns {Object} The session/start params (without commandId).
 ***/
export function buildMuseMspSessionParams({ workspaceRoot, approvalMode, modelId } = {}) {
	const params = { workspaceRoot };
	if (isKnownApprovalMode(approvalMode)) params.approvalMode = approvalMode;
	if (typeof modelId === "string" && modelId.trim()) params.modelId = modelId.trim();
	return params;
}

/***
 * MARK: isKnownApprovalMode
 * @description Whether a value is a member of the CLOSED approval-mode enum
 *   (select-never-create: an unknown mode must never reach the wire).
 * @example isKnownApprovalMode("allowAll") => true
 * @example isKnownApprovalMode("yolo") => false
 * @param {unknown} value
 * @returns {boolean}
 ***/
export function isKnownApprovalMode(value) {
	return MUSE_MSP_APPROVAL_MODES.includes(value);
}

/***
 * MARK: resolveMuseMspApprovalMode
 * @description Maps the harness's YOLO setting onto the CLOSED approval-mode
 *   enum. YOLO (the operator default — no approval UI yet) selects
 *   `allowAll`; opting out selects `onRequest` so the agent gates tool
 *   executions and the harness's permission policy answers them per request.
 * @example resolveMuseMspApprovalMode({ yolo: true }) => "allowAll"
 * @example resolveMuseMspApprovalMode({ yolo: false }) => "onRequest"
 * @param {Object} [settings] - The harness settings ({ yolo }).
 * @returns {string} The approval mode id.
 ***/
export function resolveMuseMspApprovalMode(settings = {}) {
	return settings?.yolo === false ? "onRequest" : "allowAll";
}

/***
 * MARK: resolveMuseMspApprovalDecision
 * @description Answers one server→client `approval/request` from the harness's
 *   policy. `allowAll` selects the request's approval-family choice
 *   (`scope: "once"` preferred so one approval never silently becomes a
 *   standing grant); `onRequest` selects the first approving choice too (no
 *   interactive approval UI exists yet — the same posture as the exec path's
 *   YOLO default, now per-request and logged). Any unknown/unrecognised shape
 *   DEFAULT-DENIES: it selects a denying choice when one is offered, else
 *   returns null so the caller answers with a JSON-RPC error instead of
 *   guessing a choice id (closed-enum discipline).
 * @example resolveMuseMspApprovalDecision(req, { approvalMode: "allowAll" }) => { choiceId: "allow-once", decision: "approved" }
 * @example resolveMuseMspApprovalDecision({ availableChoices: [] }, {}) => null
 * @param {Object} request - The approval/request params.
 * @param {Object} [opts]
 * @param {string} [opts.approvalMode] - The effective approval mode.
 * @returns {{choiceId: string, decision: string, reason: string}|null} The decision, or null to fail closed.
 ***/
export function resolveMuseMspApprovalDecision(request, { approvalMode = "allowAll" } = {}) {
	const choices = Array.isArray(request?.availableChoices)
		? request.availableChoices.filter(
				(choice) => choice && typeof choice.choiceId === "string" && choice.choiceId,
			)
		: [];
	const approved = choices.filter((choice) => choice.decision === "approved");
	const denied = choices.filter(
		(choice) =>
			choice.decision === "denied" ||
			choice.decision === "deniedPolicyAmendment" ||
			choice.decision === "abort",
	);

	if (approvalMode === "allowAll") {
		const preferred =
			approved.find((choice) => choice.scope === "once") || approved[0] || null;
		if (preferred) {
			return {
				choiceId: preferred.choiceId,
				decision: preferred.decision,
				reason: `allowAll selects '${preferred.choiceId}' (${preferred.decision})`,
			};
		}
	}
	// Deny-safe: no approval UI exists, so anything not explicitly allowed
	// picks a denying choice when the host offers one.
	const denyChoice = denied.find((choice) => choice.decision === "denied") || denied[0] || null;
	if (denyChoice) {
		return {
			choiceId: denyChoice.choiceId,
			decision: denyChoice.decision,
			reason: `policy '${approvalMode}' denies the request via '${denyChoice.choiceId}'`,
		};
	}
	// Unknown option shape: fail closed rather than guess a choice id.
	return null;
}

/***
 * MARK: selectMuseTransport
 * @description Chooses the session transport: `"msp"` for the long-lived
 *   two-way `muse serve` session, `"exec"` for the per-turn CLI spawn.
 *   `"on"` forces MSP, `"off"` forces exec (the documented rollback), and
 *   `"auto"` (default) engages MSP when the entrypoint RESOLVES: an explicit
 *   `KAINBAIN_MUSE_MSP_BIN` override, or a `muse` binary whose `serve`
 *   subcommand answers. The probe is cached per binary, never throws, and
 *   returns false on any doubt — old installs and the test mock keep running
 *   on the exec path.
 * @example selectMuseTransport({ mspMode: "off" }) => "exec"
 * @example selectMuseTransport({ mspMode: "on" }) => "msp"
 * @example selectMuseTransport({ mspMode: "auto", bin: "/bin/mock" }, { supportsServe: () => false }) => "exec"
 * @param {Object} settings - The resolved harness settings (mspMode, mspBin, bin).
 * @param {Object} [opts]
 * @param {Function} [opts.supportsServe] - Probe override (tests inject).
 * @returns {"msp"|"exec"} The transport for new sessions.
 ***/
export function selectMuseTransport(settings, { supportsServe } = {}) {
	if (settings?.mspMode === "off") return "exec";
	if (settings?.mspMode === "on") return "msp";
	if (typeof settings?.mspBin === "string" && settings.mspBin.trim()) return "msp";
	const probe = typeof supportsServe === "function" ? supportsServe : probeMuseServeSupport;
	return probe(settings?.bin) ? "msp" : "exec";
}

/** Per-binary serve-support cache (one probe per resolved binary path). */
const serveSupportCache = new Map();

/***
 * MARK: probeMuseServeSupport
 * @description Whether a resolved muse binary advertises the `serve`
 *   subcommand (`muse serve --help`). Never throws and never blocks longer
 *   than `timeoutMs`; the answer is cached per binary path. Used ONLY for
 *   `auto` transport selection, so a false negative merely keeps the exec
 *   path (the safe direction).
 * @example probeMuseServeSupport("/home/u/.local/bin/muse") => true
 * @param {string} bin - The resolved muse binary.
 * @param {Object} [opts]
 * @param {number} [opts.timeoutMs] - Probe ceiling (default 4000).
 * @param {boolean} [opts.refresh] - Bypass the cache.
 * @returns {boolean} True when `serve` is advertised.
 ***/
export function probeMuseServeSupport(bin, { timeoutMs = 4000, refresh = false } = {}) {
	if (typeof bin !== "string" || !bin) return false;
	if (!refresh && serveSupportCache.has(bin)) return serveSupportCache.get(bin);
	let supported = false;
	try {
		const result = spawnSync(bin, ["serve", "--help"], {
			timeout: timeoutMs,
			encoding: "utf8",
		});
		const output = `${result?.stdout || ""}\n${result?.stderr || ""}`;
		supported = /muse serve|--provider|MSP session host/i.test(output);
	} catch {
		supported = false;
	}
	serveSupportCache.set(bin, supported);
	return supported;
}

/***
 * MARK: classifyMuseMspStartupFailure
 * @description Sorts one serve-session startup failure into a stable,
 *   user-facing error `{ code, message, hint }`. Every code maps to exactly
 *   one fix and every hint names the `KAINBAIN_MUSE_MSP=off` rollback.
 * @example classifyMuseMspStartupFailure(new Error("spawn muse ENOENT")).code => "MUSE_MSP_BIN_MISSING"
 * @param {Error|string} error - The startup failure.
 * @param {Object} [opts]
 * @param {string} [opts.bin] - The binary path attempted (named in messages).
 * @returns {{code: string, message: string, hint: string}} The classified error.
 ***/
export function classifyMuseMspStartupFailure(error, { bin } = {}) {
	const detail = error?.message || String(error ?? "unknown error");
	const binary = bin || "muse";
	if (/ENOENT/i.test(detail)) {
		return {
			code: "MUSE_MSP_BIN_MISSING",
			message: `The muse serve host was not found ('${binary}' is not runnable).`,
			hint: `Install the Muse CLI, point KAINBAIN_MUSE_BIN at its absolute path, or set KAINBAIN_MUSE_MSP=off to use the exec transport.`,
		};
	}
	if (/timed out after/i.test(detail) || /handshake/i.test(detail)) {
		return {
			code: "MUSE_MSP_TIMEOUT",
			message: `The muse serve handshake timed out (${detail.trim().slice(-200)}).`,
			hint: `The host may be hanging — retry; a persistent hang means rolling back with KAINBAIN_MUSE_MSP=off until the install is fixed.`,
		};
	}
	if (
		/authenticat|not logged in|login required|unauthorized|unauthorised|unauthenticated|invalid credential|expired credential|missing credential|no credentials/i.test(
			detail,
		)
	) {
		return {
			code: "MUSE_MSP_AUTH_REQUIRED",
			message: `The muse serve host reported an authentication problem (${detail.trim().slice(-300)}).`,
			hint: `Re-authenticate the muse CLI (its ~/.config/muse cache), then retry; or roll back with KAINBAIN_MUSE_MSP=off.`,
		};
	}
	// Handshake rejections are the notInitialized/alreadyInitialized kinds,
	// matched in both the wire message spelling ("Not initialized") and the
	// camelCase data.kind spelling; the bare word "initialized" is
	// deliberately NOT matched (an unrelated "uninitialized workspace" would
	// otherwise misclassify as a handshake failure instead of the generic
	// discovery failure).
	if (/not initialized|already initialized|notInitialized|alreadyInitialized/i.test(detail)) {
		return {
			code: "MUSE_MSP_HANDSHAKE_FAILED",
			message: `The muse serve handshake was rejected (${detail.trim().slice(-300)}).`,
			hint: `The host and this client disagree on the MSP handshake — check the muse version against the pinned schema fingerprint, then retry; roll back with KAINBAIN_MUSE_MSP=off.`,
		};
	}
	return {
		code: "MUSE_MSP_DISCOVERY_FAILED",
		message: `The muse serve session failed to start (${detail.trim().slice(-300)}).`,
		hint: `Run 'muse serve --provider echo' by hand to see the full error; a persistent failure can be rolled back with KAINBAIN_MUSE_MSP=off (exec transport).`,
	};
}

/***
 * MARK: describeMuseMspSchemaDrift
 * @description Non-fatal startup diagnostic: when `initialize` reports a
 *   schema fingerprint that differs from the pinned one, upstream drift is
 *   recorded loudly (the same discipline as the captured exec fixtures).
 *   Returns null when the fingerprint matches or the host reported none.
 * @example describeMuseMspSchemaDrift({ schema: { fingerprint: "sha256:other" } }) => "[WARN] muse serve schema fingerprint drift…"
 * @param {Object} initializeResult - The raw initialize result.
 * @returns {string|null} The warning line, or null.
 ***/
export function describeMuseMspSchemaDrift(initializeResult) {
	const fingerprint = initializeResult?.schema?.fingerprint;
	if (typeof fingerprint !== "string" || !fingerprint) return null;
	if (fingerprint === MUSE_MSP_SCHEMA_FINGERPRINT) return null;
	return (
		`[WARN] muse serve schema fingerprint drift: host reports ${fingerprint}, ` +
		`this client pins ${MUSE_MSP_SCHEMA_FINGERPRINT}. Re-export and review ` +
		"'muse schema generate-json-schema' before trusting new fields."
	);
}

/***
 * MARK: describeMuseMspSandboxPosture
 * @description Non-fatal startup diagnostic naming the host's fixed sandbox
 *   posture. `serve` fixes posture for the host lifetime, so the escalation
 *   decision (sandbox off, YOLO) must be recorded loudly — never silently.
 * @example describeMuseMspSandboxPosture({ sandboxAvailability: "available" }, { yolo: true }) => "[MUSE MSP] sandbox disabled for this host…"
 * @param {Object} initializeResult - The raw initialize result.
 * @param {Object} [settings] - The harness settings ({ yolo }).
 * @returns {string} The posture line.
 ***/
export function describeMuseMspSandboxPosture(initializeResult, settings = {}) {
	const availability = initializeResult?.sandboxAvailability ?? "unknown";
	if (settings?.yolo) {
		return (
			`[MUSE MSP] sandbox disabled for this host lifetime (--disable-sandbox); ` +
			`host reports sandboxAvailability=${availability}. Set KAINBAIN_MUSE_YOLO=0 to keep the sandbox on.`
		);
	}
	return `[MUSE MSP] sandbox enabled for this host lifetime; host reports sandboxAvailability=${availability}.`;
}
