import { buildChildEnv } from "../shared/harnessScaffold.js";

/**
 * MARK: agyAcpSupport
 * @description The Antigravity FLAVOR adapter for the generic ACP core
 *   (`api/agent/harnesses/acp/`): everything Antigravity-specific about a
 *   two-way programmatic session lives here and ONLY here, so the core stays
 *   copy-paste reusable for the next ACP harness (Cursor, Grok, Claude ACP):
 *
 *   - ACP entrypoint resolution (`agy acp` subcommand vs a standalone
 *     ACP-capable binary override),
 *   - child-env sanitization (the nested-session detection trap + secret
 *     redaction + warning suppression),
 *   - the swallowed-transport filter (mid-turn "model unreachable / 502"
 *     prose that resolves as a clean turn end — the T3 Code failure mode
 *     from pingdotgg/t3code#16010),
 *   - the permission-policy resolver (project YOLO setting → ACP
 *     `requestPermission` answers),
 *   - startup-failure classification (bin-missing / auth / timeout /
 *     discovery-failed, each with a fix hint).
 */

/** The ACP protocol version the flavor negotiates (matches the core default). */
export const AGY_ACP_PROTOCOL_VERSION = 1;

/** Env names that must never reach the agent child (nested-session traps). */
const AGY_ACP_ENV_STRIP_EXACT = new Set(["CLAUDECODE"]);

/** Exact env names kept in the ACP child environment. */
const AGY_ACP_ENV_KEEP_EXACT = new Set([
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

/** Env-name prefixes kept in the ACP child environment (agent/auth config). */
const AGY_ACP_ENV_KEEP_PREFIXES = ["AGY_", "GEMINI_", "ANTIGRAVITY_"];

/***
 * MARK: resolveAgyAcpEndpoint
 * @description Resolves HOW to reach the Antigravity ACP agent: an explicit
 *   standalone binary override wins (tests point it at the mock fixture);
 *   otherwise the `agy acp` subcommand is used.
 * @example resolveAgyAcpEndpoint({ agyBin: "agy" }) => { command: "agy", args: ["acp"], mode: "subcommand" }
 * @example resolveAgyAcpEndpoint({ acpBin: "/bin/mock" }) => { command: "/bin/mock", args: [], mode: "standalone" }
 * @param {Object} [opts]
 * @param {string} [opts.agyBin] - The resolved agy CLI binary.
 * @param {string} [opts.acpBin] - Standalone ACP-capable binary override (tests, custom installs).
 * @returns {{command: string, args: Array<string>, mode: "subcommand"|"standalone"}} The spawn endpoint.
 ***/
export function resolveAgyAcpEndpoint({ agyBin = "agy", acpBin = "" } = {}) {
	const override = typeof acpBin === "string" ? acpBin.trim() : "";
	if (override) {
		return { command: override, args: [], mode: "standalone" };
	}
	return { command: agyBin, args: ["acp"], mode: "subcommand" };
}

/***
 * MARK: sanitizeAgyAcpEnv
 * @description Projects the parent environment onto the minimal allowlist
 *   for the ACP agent child: shell/locale/proxy basics plus the
 *   AGY-, GEMINI-, and ANTIGRAVITY-prefixed names, every secret-shaped name
 *   dropped (redaction wins over the allowlist), the nested-session trap
 *   (`CLAUDECODE`) stripped even if a future allowlist would keep it, and
 *   `NODE_NO_WARNINGS=1` pinned so runtime warnings cannot pollute the
 *   protocol stdout. Never mutates its inputs.
 * @example sanitizeAgyAcpEnv({ PATH: "/bin", CLAUDECODE: "1", GEMINI_API_KEY: "s" }) => { PATH: "/bin", NODE_NO_WARNINGS: "1" }
 * @param {Object} [baseEnv] - The parent environment (defaults to process.env).
 * @returns {Object} The sanitized child environment (a fresh object).
 ***/
export function sanitizeAgyAcpEnv(baseEnv = process.env) {
	const projected = buildChildEnv(baseEnv, {
		keepExact: [...AGY_ACP_ENV_KEEP_EXACT],
		keepPrefixes: AGY_ACP_ENV_KEEP_PREFIXES,
		extra: { NODE_NO_WARNINGS: "1" },
	});
	for (const name of AGY_ACP_ENV_STRIP_EXACT) {
		// eslint-disable-next-line security/detect-object-injection -- name comes from a module-level strip set, not user input
		delete projected[name];
	}
	return projected;
}

/** Substrings (case-insensitive) marking a swallowed model-transport failure. */
const SWALLOWED_TRANSPORT_MARKERS = [
	"model unreachable",
	"error 502",
	"502 bad gateway",
	"bad gateway",
	"agent execution error",
];

/***
 * MARK: detectSwallowed502
 * @description Whether assistant text smuggles a swallowed model-transport
 *   failure: the agent streamed error prose ("model unreachable", "Error
 *   502", …) as an assistant delta and will resolve the turn cleanly. The
 *   match is by MEANING fragments (not one exact sentence), so reworded
 *   variants of the same failure still trap — while ordinary prose about
 *   HTTP status codes in code samples stays below the two-marker bar… in
 *   practice a single strong marker ("model unreachable", "error 502")
 *   already trips it, because the agent never emits those phrases as content.
 * @example detectSwallowed502("Agent execution error: model unreachable: Error 502") => true
 * @example detectSwallowed502("Here is your holiday itinerary") => false
 * @param {unknown} text - The accumulated assistant text for the turn.
 * @returns {boolean} True when the text carries a swallowed transport failure.
 ***/
export function detectSwallowed502(text) {
	if (typeof text !== "string" || text.length === 0) return false;
	const lowered = text.toLowerCase();
	// Strong markers name the failure outright — either one traps the turn.
	if (lowered.includes("model unreachable")) return true;
	if (/error\s*502/.test(lowered)) return true;
	if (lowered.includes("502 bad gateway")) return true;
	// Weaker prose ("bad gateway", "agent execution error" alone) only traps
	// in combination, so code samples mentioning gateways do not false-trip.
	const weakHits = SWALLOWED_TRANSPORT_MARKERS.filter(
		(marker) => marker !== "model unreachable" && !marker.startsWith("error 502") && !marker.startsWith("502 ") && lowered.includes(marker),
	);
	return weakHits.length >= 2;
}

/***
 * MARK: swallowed502Error
 * @description Builds the typed transport error for a trapped 502 turn: a
 *   retryable `run_error` (never an `end_turn` completion) with the
 *   offending snippet plus the operator fix.
 * @param {string} text - The accumulated assistant text that tripped the filter.
 * @returns {{code: string, message: string, hint: string, error: string}} The structured error.
 ***/
export function swallowed502Error(text) {
	const snippet = String(text || "").trim().slice(-300);
	return {
		code: "AGY_TRANSPORT_502",
		message: `Antigravity reported a model transport failure mid-turn (${snippet}).`,
		hint: "The model was unreachable (HTTP 502) — retry the turn; if it persists, check the Antigravity service status and re-authenticate (`agy auth login`).",
		error: `Antigravity model unreachable (HTTP 502): ${snippet}`,
	};
}

/***
 * MARK: resolveAgyPermissionDecision
 * @description Answers one ACP `requestPermission` from the harness's
 *   operator-chosen approval policy. YOLO (`skipPermissions`, the default)
 *   selects the agent's first allow-kind option (`allow_once` preferred over
 *   `allow_always`, so one approval never silently becomes a standing grant);
 *   anything else cancels — the engine has no interactive approval UI yet,
 *   so deny-safe is the only honest non-YOLO behavior, and the log line the
 *   wrapper emits names the denial.
 * @example resolveAgyPermissionDecision(req, { skipPermissions: true }).outcome.outcome => "selected"
 * @example resolveAgyPermissionDecision(req, { skipPermissions: false }).outcome.outcome => "cancelled"
 * @param {Object} request - The permission params (`{ toolCall, options }`).
 * @param {Object} [opts]
 * @param {boolean} [opts.skipPermissions=true] - The harness's effective approval mode.
 * @returns {Object} The ACP permission response (`{ outcome }`).
 ***/
export function resolveAgyPermissionDecision(request, { skipPermissions = true } = {}) {
	const options = Array.isArray(request?.options) ? request.options : [];
	if (skipPermissions) {
		const allowOnce = options.find((option) => option?.kind === "allow_once");
		const allowAlways = options.find((option) => option?.kind === "allow_always");
		const selected = allowOnce || allowAlways || null;
		if (selected?.optionId) {
			return { outcome: { outcome: "selected", optionId: selected.optionId } };
		}
		// YOLO but the agent offered no allow-kind option: fall through to
		// cancel rather than guessing an unknown option id.
	}
	return { outcome: { outcome: "cancelled" } };
}

/***
 * MARK: classifyAgyAcpStartupFailure
 * @description Sorts one ACP session-startup failure into a stable,
 *   user-facing error: `{ code, message, hint }`. Every code maps to exactly
 *   one fix, so the UI and the process log can show the reason plus the
 *   remediation instead of a bare spawn error:
 *   - `AGY_BIN_MISSING`: the agent binary is not on PATH (ENOENT) → install
 *     it or set `KAINBAIN_AGY_BIN` / `KAINBAIN_AGY_ACP_BIN`.
 *   - `AGY_AUTH_REQUIRED`: the agent reports missing credentials → re-auth.
 *   - `AGY_TIMEOUT`: the handshake hung past the startup watchdog → check
 *     the CLI/network and retry.
 *   - `AGY_DISCOVERY_FAILED`: anything else (early exit, no sessionId) →
 *     run the ACP entrypoint by hand.
 * @example classifyAgyAcpStartupFailure(new Error("spawn agy ENOENT")).code => "AGY_BIN_MISSING"
 * @param {Error|string} error - The startup failure.
 * @param {Object} [opts]
 * @param {string} [opts.bin] - The binary path attempted (named in messages).
 * @returns {{code: string, message: string, hint: string}} The classified error.
 ***/
export function classifyAgyAcpStartupFailure(error, { bin } = {}) {
	const detail = error?.message || String(error ?? "unknown error");
	const binary = bin || "agy";
	if (/ENOENT/i.test(detail)) {
		return {
			code: "AGY_BIN_MISSING",
			message: `The Antigravity ACP agent was not found ('${binary}' is not runnable).`,
			hint: "Install the Antigravity CLI and ensure it is on PATH or in ~/.local/bin, or set KAINBAIN_AGY_BIN (or KAINBAIN_AGY_ACP_BIN for a standalone ACP binary) to its absolute path.",
		};
	}
	if (/timed out after/i.test(detail)) {
		return {
			code: "AGY_TIMEOUT",
			message: `The Antigravity ACP handshake timed out (${detail.trim().slice(-200)}).`,
			hint: "The CLI may be hanging — check the network and the CLI install, then retry. Older CLI versions without ACP support also hang here: update the CLI or set KAINBAIN_AGY_ACP=off to use exec mode.",
		};
	}
	if (
		/authenticat|auth login|not logged in|login required|unauthorized|unauthorised|unauthenticated|invalid credential|expired credential|missing credential/i.test(
			detail,
		)
	) {
		return {
			code: "AGY_AUTH_REQUIRED",
			message: `The Antigravity ACP agent reported an authentication problem (${detail.trim().slice(-300)}).`,
			hint: "Re-authenticate the CLI (e.g. `agy auth login` in a terminal), then retry.",
		};
	}
	return {
		code: "AGY_DISCOVERY_FAILED",
		message: `The Antigravity ACP session failed to start (${detail.trim().slice(-300)}).`,
		hint: "Run the ACP entrypoint by hand (`agy acp`) to see the full error; older CLI versions without ACP support fail here — update the CLI or set KAINBAIN_AGY_ACP=off to use exec mode.",
	};
}

/***
 * MARK: buildAgyAcpHandshake
 * @description The ACP `initialize` params for an Antigravity session:
 *   protocol version 1 with the client capabilities the wrapper's
 *   permission interception needs.
 * @returns {Object} The initialize params.
 ***/
export function buildAgyAcpHandshake() {
	return {
		protocolVersion: AGY_ACP_PROTOCOL_VERSION,
		clientCapabilities: { sessions: { new: true }, permissionInterception: true },
	};
}

/***
 * MARK: buildAgyAcpSessionParams
 * @description The `session/new` params for an Antigravity session: the
 *   project workspace root plus the pinned model when one is set.
 * @param {Object} [opts]
 * @param {string} [opts.cwd] - The project working directory.
 * @param {Object} [opts.model] - The pinned model (`{ provider, id }`).
 * @returns {Object} The session params.
 ***/
export function buildAgyAcpSessionParams({ cwd, model } = {}) {
	return {
		cwd,
		mcpServers: [],
		...(model?.id ? { model: { provider: model.provider || "antigravity", id: model.id } } : {}),
	};
}
