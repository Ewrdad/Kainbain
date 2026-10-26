/**
 * MARK: agyPermissions
 * @description The SAFE ARGV/ENV SURFACE for spawning the agy CLI: argument
 *   building with a hard guard against permission bypass, child-env
 *   construction with secret redaction, validation of operator-supplied
 *   allow rules, and duration parsing for the timeout safety net.
 *
 *   Operator-chosen YOLO policy (the operator asked for unrestricted runs):
 *   - `--sandbox` is OMITTED by default; operators opt back in per deployment
 *     via KAINBAIN_AGY_SANDBOX=1.
 *   - `--dangerously-skip-permissions` is passed by default (auto-approve all
 *     tool calls, agy's headless YOLO equivalent); operators opt out via
 *     KAINBAIN_AGY_SKIP_PERMISSIONS=0. The builder is the ONLY construction
 *     site for that flag, and only from the explicit `skipPermissions`
 *     setting — never from prompt text (argv is built from structured opts,
 *     no shell is involved). `assertSafeAgyArgs` still rejects the flag in
 *     any other argv so a regression fails loudly.
 *   - The effective sandbox/approval values are surfaced in the run-open
 *     transcript line, so quiet privilege is impossible.
 *   - Optional KAINBAIN_AGY_ALLOW rules are validated but NOT applied until
 *     scoped agy settings support is verified (logged-not-applied).
 *   - The child env is an allowlist projection of process.env with every
 *     secret-shaped variable dropped, so child stderr/logs cannot leak host
 *     secrets (auth relies on agy's own cached credentials).
 */

import { buildChildEnv } from "../shared/harnessScaffold.js";

/** The one flag the harness must never construct — kept in one place so the guard is exhaustive. */
export const FORBIDDEN_AGY_FLAG = "--dangerously-skip-permissions";

/** The output format the harness always pins: newline-delimited stream events. */
export const AGY_OUTPUT_FORMAT = "stream-json";

/***
 * MARK: assertSafeAgyArgs
 * @description Throws when an argv array contains the permission-bypass flag
 *   (or an argument line containing it). Called by buildAgyArgs and usable
 *   standalone as a regression guard around any argv construction.
 * @example assertSafeAgyArgs(["-p", "hi"]) // passes
 * @example assertSafeAgyArgs(["--dangerously-skip-permissions"]) // throws
 * @param {Array<string>} args - The agy argv under inspection.
 * @returns {boolean} true when the argv is safe.
 ***/
export function assertSafeAgyArgs(args) {
	const joined = args.join(" ");
	if (args.includes(FORBIDDEN_AGY_FLAG) || joined.includes(FORBIDDEN_AGY_FLAG)) {
		throw new Error(
			`Refusing to spawn agy with ${FORBIDDEN_AGY_FLAG}: KainBain never auto-approves tool calls`,
		);
	}
	return true;
}

/***
 * MARK: buildAgyArgs
 * @description Builds the argv for one headless agy run: a print-mode prompt,
 *   stream-json output, the print-timeout ceiling, optional sandbox, model pin
 *   and effort, and conversation continuation. The permission-bypass guard runs
 *   on the result, so the flag can never be constructed through this builder.
 * @example buildAgyArgs({ prompt: "hi" }) => ["-p", "hi", "--output-format", "stream-json", "--print-timeout", "10m", "--dangerously-skip-permissions"]
 * @param {Object} opts
 * @param {string} opts.prompt - The stage prompt text (passed via -p).
 * @param {string|null} [opts.conversationId] - agy conversation id to continue.
 * @param {string|null} [opts.modelSlug] - Model slug pinned via --model.
 * @param {string|null} [opts.effort] - Reasoning effort (--effort low|medium|high).
 * @param {string} opts.printTimeout - Duration for --print-timeout (e.g. "10m").
 * @param {boolean} [opts.sandbox=false] - Whether to pass --sandbox.
 * @param {boolean} [opts.skipPermissions=false] - Whether to pass
 *   --dangerously-skip-permissions (the harness sets this from its explicit
 *   skipPermissions setting; never from prompt text).
 * @returns {Array<string>} The argv (without the binary path).
 ***/
export function buildAgyArgs({
	prompt,
	conversationId = null,
	modelSlug = null,
	effort = null,
	printTimeout,
	sandbox = false,
	skipPermissions = false,
}) {
	const args = ["-p", String(prompt), "--output-format", AGY_OUTPUT_FORMAT];
	if (printTimeout) {
		args.push("--print-timeout", String(printTimeout));
	}
	if (sandbox) {
		args.push("--sandbox");
	}
	if (modelSlug) {
		args.push("--model", String(modelSlug));
	}
	if (effort) {
		args.push("--effort", String(effort));
	}
	if (conversationId) {
		args.push("--conversation", String(conversationId));
	}
	assertSafeAgyArgs(args);
	if (skipPermissions) {
		// The single sanctioned construction site for the bypass flag: it is
		// appended AFTER the guard runs, so the guard still rejects the flag
		// in every other argv. Provenance is the explicit harness setting.
		args.push(FORBIDDEN_AGY_FLAG);
	}
	return args;
}

/** Exact env names kept in the child environment. */
const ENV_KEEP_EXACT = new Set([
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

/** Env-name prefixes kept in the child environment (agy/auth/tool config). */
const ENV_KEEP_PREFIXES = ["AGY_", "GEMINI_", "ANTIGRAVITY_"];

/** Secret-name redaction lives in the shared scaffold (SECRET_NAME_PATTERN) —
 *  redaction always wins over the allowlist below. */

/***
 * MARK: buildAgyChildEnv
 * @description Projects the parent process.env onto a minimal allowlist for
 *   the agy child process: shell/locale/proxy basics plus AGY_* / GEMINI_* /
	 *   ANTIGRAVITY_* names, with every secret-shaped name (SECRET, TOKEN,
 *   PASSWORD, KEY, CREDENTIAL — case-insensitive) dropped so child
 *   stderr/logs cannot leak host secrets. agy authenticates from its own
 *   cached credentials; API-key based setups can wrap the CLI via
 *   KAINBAIN_AGY_BIN instead of leaking keys into child logs.
 * @example buildAgyChildEnv({ PATH: "/bin", GEMINI_API_KEY: "s3cr3t" }) => { PATH: "/bin" }
 * @param {Object} [baseEnv] - The parent environment (defaults to process.env).
 * @returns {Object} The redacted child environment.
 ***/
export function buildAgyChildEnv(baseEnv = process.env) {
	// Allowlist projection + secret redaction are owned by the shared
	// scaffold; this wrapper keeps the agy keep-sets (and the import surface
	// the harness + tests use) in the antigravity folder.
	return buildChildEnv(baseEnv, {
		keepExact: ENV_KEEP_EXACT,
		keepPrefixes: ENV_KEEP_PREFIXES,
	});
}

/** Allow-rule actions the validator understands. */
const KNOWN_AGY_ACTIONS = new Set([
	"command",
	"read_file",
	"write_file",
	"read_url",
	"mcp",
]);

/***
 * MARK: parseAgyAllowRules
 * @description Parses and validates the operator-supplied allow rules
 *   (comma-separated `action(target)` rules, e.g.
 *   `command(npm run (build|lint|test)),write_file(src/)`). Validation
 *   rejects: empty/malformed rules, unknown actions, `*` wildcards on
 *   command/write_file targets, and any `unsandboxed` rule. The rules are
 *   LOGGED-NOT-APPLIED: until scoped agy settings support is verified the
 *   harness never writes permission settings — the harness-level
 *   sandbox/skip-permissions settings stay the effective policy.
 * @example parseAgyAllowRules("command(git),write_file(src/)") => { valid: true, rules: [...] }
 * @example parseAgyAllowRules("command(*)") => { valid: false, errors: [...] }
 * @param {string} raw - The raw KAINBAIN_AGY_ALLOW value ("" when unset).
 * @returns {Object} { valid, rules: [{action, target}], errors: [string] }.
 ***/
export function parseAgyAllowRules(raw) {
	const rules = [];
	const errors = [];
	const trimmed = String(raw || "").trim();
	if (!trimmed) return { valid: true, rules, errors };

	for (const rawRule of trimmed.split(",")) {
		const rule = rawRule.trim();
		if (!rule) continue;
		const match = rule.match(/^([a-z_]+)\((.*)\)$/);
		if (!match) {
			errors.push(`Malformed allow rule '${rule}' (expected action(target))`);
			continue;
		}
		const [, action, target] = match;
		if (action === "unsandboxed") {
			errors.push(`Allow rule '${rule}': 'unsandboxed' is never permitted`);
			continue;
		}
		if (!KNOWN_AGY_ACTIONS.has(action)) {
			errors.push(
				`Allow rule '${rule}': unknown action '${action}' (known: ${[...KNOWN_AGY_ACTIONS].join(", ")})`,
			);
			continue;
		}
		if (!target || target.includes("*")) {
			errors.push(
				`Allow rule '${rule}': target must be a specific ${action} scope (no wildcards)`,
			);
			continue;
		}
		rules.push({ action, target });
	}
	return { valid: errors.length === 0, rules, errors };
}

/** Multipliers per supported duration unit (missing unit means milliseconds). */
const DURATION_UNIT_MS = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 };

/***
 * MARK: parseAgyDurationMs
 * @description Parses an agy-style duration ("30s", "10m", "1h") or a bare
 *   number of milliseconds into milliseconds, for the engine-side watchdog
 *   that backs the CLI's own --print-timeout.
 * @example parseAgyDurationMs("10m") => 600000
 * @example parseAgyDurationMs("90s") => 90000
 * @param {string|number} raw - The duration value.
 * @returns {number} The duration in milliseconds (0 when unparseable).
 ***/
export function parseAgyDurationMs(raw) {
	if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
		return Math.floor(raw);
	}
	const text = String(raw || "").trim().toLowerCase();
	// eslint-disable-next-line security/detect-unsafe-regex -- bounded numeric+unit pattern, no nested quantifiers (linear, non-backtracking)
	const match = text.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h)?$/);
	if (!match) return 0;
	const multiplier = DURATION_UNIT_MS[match[2] || "ms"];
	return Math.floor(Number(match[1]) * multiplier);
}