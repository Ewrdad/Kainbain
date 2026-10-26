import fs from "node:fs";
import path from "node:path";
import { buildChildEnv } from "../shared/harnessScaffold.js";

/**
 * MARK: vibeAcpSupport
 * @description The Mistral Vibe FLAVOR adapter for the generic ACP core
 *   (`api/agent/harnesses/acp/`): everything vibe-specific about a two-way
 *   programmatic ACP session lives here and ONLY here, so the core stays
 *   copy-paste reusable for the next ACP harness (mirroring
 *   `antigravity/agyAcpSupport.js`). Verified against `vibe-acp` 3.0.2
 *   (ACP schema v1.16.0; the captured ground truth is
 *   `fixtures/acp-session-new.json`, refreshed via
 *   `fixtures/probe-vibe-acp.mjs`):
 *
 *   - ACP entrypoint resolution (the standalone `vibe-acp` sibling binary —
 *     the interactive `vibe` CLI has NO `acp` subcommand; `vibe-acp` ships
 *     in the same install dir as `vibe`),
 *   - child-env sanitization (the `~/.vibe/` login cache reaches the child
 *     via `VIBE_*`; secret redaction; the exec path's `VIBE_CLI` pin is NOT
 *     propagated — it is a launcher concern the ACP entrypoint ignores),
 *   - handshake + `session/new` params (vibe ignores a `model` param there —
 *     model pinning goes through `session/set_config_option` after the
 *     session exists),
 *   - the permission-mode mapping (`KAINBAIN_VIBE_AUTO_APPROVE` → the
 *     session's `ask` / `auto-approve` mode),
 *   - model application via `session/set_config_option` (configId `model`),
 *   - the permission-policy resolver (auto-approve → the agent's
 *     `allow_once`; anything else deny-safe cancels — no approval UI yet),
 *   - the swallowed-transport filter (mid-turn "model unreachable / 502"
 *     prose that resolves as a clean turn end),
 *   - startup-failure classification (bin-missing / auth / timeout /
 *     discovery-failed, each with one concrete fix).
 */

/** The ACP protocol version the flavor negotiates (matches the core default). */
export const VIBE_ACP_PROTOCOL_VERSION = 1;

/** Exact env names kept in the ACP child environment. */
const VIBE_ACP_ENV_KEEP_EXACT = new Set([
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

/** Env-name prefixes kept in the ACP child environment (login cache + tool config). */
const VIBE_ACP_ENV_KEEP_PREFIXES = ["VIBE_", "XDG_"];

/**
 * The vendor's standalone ACP binary name — the `vibe` sibling shipped in
 * the same install dir (`~/.local/bin/vibe-acp`, the venv `bin/`, …).
 */
const VIBE_ACP_SIBLING_NAME = "vibe-acp";

/***
 * MARK: resolveVibeAcpEndpoint
 * @description Resolves HOW to reach the Mistral Vibe ACP agent: an explicit
 *   standalone binary override wins (tests point it at the mock fixture);
 *   otherwise the `vibe-acp` SIBLING of the resolved vibe binary (same
 *   install dir — `vibe-acp` ships with every vibe install); otherwise the
 *   bare `vibe-acp` on PATH. The result is spawned directly (never
 *   shell-interpreted).
 * @example resolveVibeAcpEndpoint({ vibeBin: "/home/u/.local/bin/vibe" }) => { command: "/home/u/.local/bin/vibe-acp", args: [], mode: "sibling" }
 * @example resolveVibeAcpEndpoint({ acpBin: "/bin/mock" }) => { command: "/bin/mock", args: [], mode: "override" }
 * @example resolveVibeAcpEndpoint({ vibeBin: "/x/mock-vibe.mjs" }) => { command: "vibe-acp", args: [], mode: "path" }
 * @param {Object} [opts]
 * @param {string} [opts.vibeBin] - The resolved vibe CLI binary (its dir is probed for the sibling).
 * @param {string} [opts.acpBin] - Standalone ACP binary override (tests, custom installs).
 * @param {Function} [opts.existsFn] - Existence check (fs.existsSync by default; injectable for tests).
 * @returns {{command: string, args: Array<string>, mode: "override"|"sibling"|"path"}} The spawn endpoint.
 ***/
export function resolveVibeAcpEndpoint({ vibeBin = "vibe", acpBin = "", existsFn = fs.existsSync } = {}) {
	const override = typeof acpBin === "string" ? acpBin.trim() : "";
	if (override) {
		return { command: override, args: [], mode: "override" };
	}
	if (typeof vibeBin === "string" && vibeBin.trim() && path.isAbsolute(vibeBin)) {
		const sibling = path.join(path.dirname(vibeBin), VIBE_ACP_SIBLING_NAME);
		if (existsFn(sibling)) {
			return { command: sibling, args: [], mode: "sibling" };
		}
	}
	return { command: VIBE_ACP_SIBLING_NAME, args: [], mode: "path" };
}

/***
 * MARK: sanitizeVibeAcpEnv
 * @description Projects the parent environment onto the minimal allowlist
 *   for the ACP agent child: shell/locale/proxy basics plus the `VIBE_`- and
 *   `XDG_`-prefixed names (the `~/.vibe/` login cache override `VIBE_HOME`
 *   reaches the child this way), every secret-shaped name dropped by the
 *   shared scaffold EXCEPT the explicit `MISTRAL_API_KEY` passthrough (the
 *   one override path that survives redaction by design, exactly like the
 *   exec path). The exec path's `VIBE_CLI` launcher pin is deliberately NOT
 *   propagated (even a parent-provided one is stripped): the standalone
 *   `vibe-acp` entrypoint has no python/rust launcher to select, so a stale
 *   pin must not leak into the child. `NODE_NO_WARNINGS=1` keeps runtime
 *   warnings off the protocol stdout. Never mutates its inputs.
 * @example sanitizeVibeAcpEnv({ PATH: "/bin", MISTRAL_API_KEY: "k" }) => { PATH: "/bin", MISTRAL_API_KEY: "k", NODE_NO_WARNINGS: "1" }
 * @example sanitizeVibeAcpEnv({ PATH: "/bin", VIBE_CLI: "rust" }).VIBE_CLI => undefined
 * @param {Object} [baseEnv] - The parent environment (defaults to process.env).
 * @returns {Object} The sanitized child environment (a fresh object).
 ***/
export function sanitizeVibeAcpEnv(baseEnv = process.env) {
	const apiKey = baseEnv?.MISTRAL_API_KEY;
	const projected = buildChildEnv(baseEnv, {
		keepExact: [...VIBE_ACP_ENV_KEEP_EXACT],
		keepPrefixes: VIBE_ACP_ENV_KEEP_PREFIXES,
		extra: {
			NODE_NO_WARNINGS: "1",
			...(typeof apiKey === "string" && apiKey ? { MISTRAL_API_KEY: apiKey } : {}),
		},
	});
	// The launcher selector is exec-path-only; never forward a parent's pin.
	delete projected.VIBE_CLI;
	return projected;
}

/***
 * MARK: buildVibeAcpHandshake
 * @description The ACP `initialize` params for a Mistral Vibe session:
 *   protocol version 1 with the client capabilities the wrapper's
 *   permission interception needs.
 * @returns {Object} The initialize params.
 ***/
export function buildVibeAcpHandshake() {
	return {
		protocolVersion: VIBE_ACP_PROTOCOL_VERSION,
		clientCapabilities: { sessions: { new: true }, permissionInterception: true },
	};
}

/***
 * MARK: buildVibeAcpSessionParams
 * @description The `session/new` params for a Mistral Vibe session: the
 *   project workspace root. NO model field — `vibe-acp` ignores extra
 *   kwargs there (probe-verified); model pinning happens AFTER the session
 *   exists, via `session/set_config_option` (see `applyVibeSessionModel`).
 * @example buildVibeAcpSessionParams({ cwd: "/repo" }) => { cwd: "/repo", mcpServers: [] }
 * @param {Object} [opts]
 * @param {string} [opts.cwd] - The project working directory.
 * @returns {Object} The session params.
 ***/
export function buildVibeAcpSessionParams({ cwd } = {}) {
	return {
		cwd,
		mcpServers: [],
	};
}

/***
 * MARK: resolveVibeSessionMode
 * @description Maps the harness's approval setting onto the vibe session
 *   mode (the `modes` select from `session/new`): auto-approve (the operator
 *   default, matching the exec path's `--auto-approve`) selects the
 *   `auto-approve` mode; opting out selects `ask` so the agent gates tool
 *   executions and the harness's permission policy answers them.
 * @example resolveVibeSessionMode({ autoApprove: true }) => "auto-approve"
 * @example resolveVibeSessionMode({ autoApprove: false }) => "ask"
 * @param {Object} [settings] - The harness settings ({ autoApprove }).
 * @returns {string} The vibe session mode id.
 ***/
export function resolveVibeSessionMode(settings = {}) {
	return settings?.autoApprove === false ? "ask" : "auto-approve";
}

/***
 * MARK: applyVibeSessionMode
 * @description Applies the resolved permission mode on a fresh ACP session
 *   via `session/set_mode` (the native, steerable replacement for the exec
 *   path's `--auto-approve` flag). Non-fatal by design: a mode the agent
 *   does not know is logged and the session keeps its default mode rather
 *   than failing the whole stage.
 * @example await applyVibeSessionMode(runtime, "sess-1", "auto-approve") // session/set_mode { modeId: "auto-approve" }
 * @param {Object} runtime - The started AcpSessionRuntime.
 * @param {string} sessionId - The ACP session id.
 * @param {string} modeId - The vibe mode id (from `resolveVibeSessionMode`).
 * @param {Object} [opts]
 * @param {Function} [opts.log] - Warn logger for an unaccepted mode.
 * @returns {Promise<boolean>} True when the agent accepted the mode.
 ***/
export async function applyVibeSessionMode(runtime, sessionId, modeId, { log } = {}) {
	try {
		await runtime.invoke("session/set_mode", { sessionId, modeId });
		return true;
	} catch (error) {
		log?.(
			`[WARN] vibe session mode '${modeId}' was not accepted (${error?.message || error}); the session keeps its default mode.`,
		);
		return false;
	}
}

/***
 * MARK: describeVibeWorkspaceTrust
 * @description Non-fatal startup diagnostic: when `session/new` reports the
 *   project workspace as `untrusted` (`_meta.workspace_trust`), vibe ignores
 *   project-local config (AGENTS.md, `.vibe/`, `.agents/`) for the session.
 *   The exec path grants invocation-only trust via `--trust`
 *   (`KAINBAIN_VIBE_TRUST=1`, never persisted); the ACP `trust/decision`
 *   route writes PERSISTENTLY to the user's trust store and cannot grant a
 *   session-only trust, so the ACP path must NOT auto-answer it. Instead it
 *   surfaces the divergence on the bridge and leaves the operator the
 *   explicit choice. Returns null when trusted (or the agent did not report
 *   a status), so the common path logs nothing.
 * @example describeVibeWorkspaceTrust({ _meta: { workspace_trust: { status: "untrusted" } } }) => "[WARN] vibe reports ..."
 * @example describeVibeWorkspaceTrust({ _meta: { workspace_trust: { status: "trusted" } } }) => null
 * @param {Object} sessionResult - The raw `session/new` result.
 * @returns {string|null} The warning line, or null when there is nothing to warn about.
 ***/
export function describeVibeWorkspaceTrust(sessionResult) {
	const trust = sessionResult?._meta?.workspace_trust;
	if (trust?.status !== "untrusted") return null;
	const cwd = trust.details?.cwd;
	return (
		`[WARN] vibe reports the workspace${cwd ? ` '${cwd}'` : ""} as untrusted: ` +
		"project-local config (AGENTS.md, .vibe/, .agents/) is ignored for this session. " +
		"Trust the folder once in the interactive vibe CLI, or set KAINBAIN_VIBE_ACP=off to keep " +
		"the exec path's invocation-only --trust (KAINBAIN_VIBE_TRUST)."
	);
}

/***
 * MARK: applyVibeSessionModel
 * @description Pins the session's model via `session/set_config_option`
 *   (configId `model`, value = the model id) — the ONLY model path
 *   `vibe-acp` honors: `session/new` and `session/prompt` ignore model
 *   kwargs (probe-verified against `vibe/acp/agent.py`, 3.0.2). The value
 *   must be one of the model select's option ids (the catalog's ids come
 *   from that same select); an unknown id is a typed InvalidRequest
 *   rejection, which the wrapper surfaces as a run_error — never a silent
 *   fallback to the deployment default.
 * @example await applyVibeSessionModel(runtime, "sess-1", { id: "mistral-large-4-0-3" }) // session/set_config_option { configId: "model", value: "mistral-large-4-0-3" }
 * @param {Object} runtime - The started AcpSessionRuntime.
 * @param {string} sessionId - The ACP session id.
 * @param {Object} modelRef - The resolved model ({ id }).
 * @returns {Promise<Object>} The agent's response (fresh configOptions).
 ***/
export async function applyVibeSessionModel(runtime, sessionId, modelRef) {
	if (!modelRef?.id) {
		throw new Error("applyVibeSessionModel requires a resolved model with an id");
	}
	return runtime.invoke("session/set_config_option", {
		sessionId,
		configId: "model",
		value: modelRef.id,
	});
}

/***
 * MARK: resolveVibePermissionDecision
 * @description Answers one ACP `requestPermission` from the harness's
 *   approval policy. Auto-approve (the default, matching the exec path's
 *   `--auto-approve`) selects the agent's first allow-kind option
 *   (`allow_once` preferred over `allow_always` — one approval never
 *   silently becomes a standing grant); anything else cancels — the engine
 *   has no interactive approval UI yet, so deny-safe is the only honest
 *   non-auto behavior, and the wrapper's log line names the denial.
 * @example resolveVibePermissionDecision(req, { autoApprove: true }).outcome.outcome => "selected"
 * @example resolveVibePermissionDecision(req, { autoApprove: false }).outcome.outcome => "cancelled"
 * @param {Object} request - The permission params (`{ toolCall, options }`).
 * @param {Object} [opts]
 * @param {boolean} [opts.autoApprove=true] - The harness's effective approval mode.
 * @returns {Object} The ACP permission response (`{ outcome }`).
 ***/
export function resolveVibePermissionDecision(request, { autoApprove = true } = {}) {
	const options = Array.isArray(request?.options) ? request.options : [];
	if (autoApprove) {
		const allowOnce = options.find((option) => option?.kind === "allow_once");
		const allowAlways = options.find((option) => option?.kind === "allow_always");
		const selected = allowOnce || allowAlways || null;
		if (selected?.optionId) {
			return { outcome: { outcome: "selected", optionId: selected.optionId } };
		}
		// Auto-approve but the agent offered no allow-kind option: cancel
		// rather than guessing an unknown option id.
	}
	return { outcome: { outcome: "cancelled" } };
}

/** Substrings (case-insensitive) marking a swallowed model-transport failure. */
const VIBE_SWALLOWED_TRANSPORT_MARKERS = [
	"model unreachable",
	"error 502",
	"502 bad gateway",
	"bad gateway",
	"agent execution error",
];

/***
 * MARK: detectSwallowedVibeFailure
 * @description Whether assistant text smuggles a swallowed model-transport
 *   failure: the agent streamed error prose ("model unreachable", "Error
 *   502", …) as an assistant delta and will resolve the turn cleanly. Same
 *   marker discipline as the antigravity filter (the T3 Code failure mode
 *   from pingdotgg/t3code#16010): one strong marker traps the turn, weak
 *   prose needs two hits so code samples mentioning gateways do not
 *   false-trip.
 * @example detectSwallowedVibeFailure("Agent execution error: model unreachable: Error 502") => true
 * @example detectSwallowedVibeFailure("Here is your holiday itinerary") => false
 * @param {unknown} text - The accumulated assistant text for the turn.
 * @returns {boolean} True when the text carries a swallowed transport failure.
 ***/
export function detectSwallowedVibeFailure(text) {
	if (typeof text !== "string" || text.length === 0) return false;
	const lowered = text.toLowerCase();
	if (lowered.includes("model unreachable")) return true;
	if (/error\s*502/.test(lowered)) return true;
	if (lowered.includes("502 bad gateway")) return true;
	const weakHits = VIBE_SWALLOWED_TRANSPORT_MARKERS.filter(
		(marker) =>
			marker !== "model unreachable" &&
			!marker.startsWith("error 502") &&
			!marker.startsWith("502 ") &&
			lowered.includes(marker),
	);
	return weakHits.length >= 2;
}

/***
 * MARK: vibeTransportError
 * @description Builds the typed transport error for a trapped swallowed
 *   failure turn: a retryable `run_error` (never an `end_turn` completion)
 *   with the offending snippet plus the operator fix.
 * @param {string} text - The accumulated assistant text that tripped the filter.
 * @returns {{code: string, message: string, hint: string, error: string}} The structured error.
 ***/
export function vibeTransportError(text) {
	const snippet = String(text || "").trim().slice(-300);
	return {
		code: "VIBE_TRANSPORT_502",
		message: `Mistral Vibe reported a model transport failure mid-turn (${snippet}).`,
		hint: "The model was unreachable (HTTP 502) — retry the turn; if it persists, check the Mistral service status and re-authenticate (`vibe --setup` or a fresh browser login).",
		error: `vibe model unreachable (HTTP 502): ${snippet}`,
	};
}

/***
 * MARK: classifyVibeAcpStartupFailure
 * @description Sorts one ACP session-startup failure into a stable,
 *   user-facing error: `{ code, message, hint }`. Every code maps to exactly
 *   one fix, so the UI and the process log can show the reason plus the
 *   remediation instead of a bare spawn error:
 *   - `VIBE_ACP_BIN_MISSING`: the `vibe-acp` binary is not runnable (ENOENT)
 *     → install / PATH / `KAINBAIN_VIBE_ACP_BIN` (absolute path for systemd).
 *   - `VIBE_ACP_AUTH_REQUIRED`: the agent reports missing credentials →
 *     `vibe --setup` or a browser re-login.
 *   - `VIBE_ACP_TIMEOUT`: the handshake hung past the startup watchdog →
 *     check network/install, or roll back with `KAINBAIN_VIBE_ACP=off`.
 *   - `VIBE_ACP_DISCOVERY_FAILED`: anything else (early exit, no sessionId)
 *     → run the entrypoint by hand, or roll back with `KAINBAIN_VIBE_ACP=off`.
 * @example classifyVibeAcpStartupFailure(new Error("Failed to start ACP agent 'vibe-acp': spawn vibe-acp ENOENT")).code => "VIBE_ACP_BIN_MISSING"
 * @param {Error|string} error - The startup failure.
 * @param {Object} [opts]
 * @param {string} [opts.bin] - The binary path attempted (named in messages).
 * @returns {{code: string, message: string, hint: string}} The classified error.
 ***/
export function classifyVibeAcpStartupFailure(error, { bin } = {}) {
	const detail = error?.message || String(error ?? "unknown error");
	const binary = bin || "vibe-acp";
	if (/ENOENT/i.test(detail)) {
		return {
			code: "VIBE_ACP_BIN_MISSING",
			message: `The Mistral Vibe ACP agent was not found ('${binary}' is not runnable).`,
			hint: "vibe-acp ships in the same install dir as vibe — reinstall Mistral Vibe, or set KAINBAIN_VIBE_ACP_BIN to the vibe-acp absolute path (systemd units cannot see ~/.local/bin), or set KAINBAIN_VIBE_ACP=off to use the legacy exec path.",
		};
	}
	if (/timed out after/i.test(detail)) {
		return {
			code: "VIBE_ACP_TIMEOUT",
			message: `The Mistral Vibe ACP handshake timed out (${detail.trim().slice(-200)}).`,
			hint: "The agent may be hanging — check the network and the vibe install, then retry; a persistent hang means rolling back with KAINBAIN_VIBE_ACP=off until the install is fixed.",
		};
	}
	if (
		/authenticat|not logged in|login required|unauthorized|unauthorised|unauthenticated|invalid credential|expired credential|missing credential|no credentials/i.test(
			detail,
		)
	) {
		return {
			code: "VIBE_ACP_AUTH_REQUIRED",
			message: `The Mistral Vibe ACP agent reported an authentication problem (${detail.trim().slice(-300)}).`,
			hint: "Run `vibe --setup` (or a fresh interactive `vibe` browser login) to provision the ~/.vibe/ login cache, then retry.",
		};
	}
	return {
		code: "VIBE_ACP_DISCOVERY_FAILED",
		message: `The Mistral Vibe ACP session failed to start (${detail.trim().slice(-300)}).`,
		hint: "Run `vibe-acp` by hand in a terminal to see the full error; a persistent failure can be rolled back with KAINBAIN_VIBE_ACP=off (legacy exec path).",
	};
}
