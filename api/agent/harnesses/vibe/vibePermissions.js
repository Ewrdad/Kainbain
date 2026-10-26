import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildChildEnv } from "../shared/harnessScaffold.js";
import { config } from "../../../config/index.js";

/**
 * MARK: vibePermissions
 * @description The SAFE ARGV/ENV SURFACE for spawning Mistral's Vibe CLI
 *   (`vibe --prompt`): spawn-plan building with a hard guard against silent
 *   privilege widening, child-env construction with secret redaction, prompt
 *   staging for oversized prompts, and per-run `--output-dir` provisioning
 *   for the `export.json` cost/usage/stop-reason record.
 *
 *   Defaults (operator-chosen auto-approve: there is no approval UI yet, so
 *   runs approve tools unless the deployment opts out):
 *   - `--workdir <abs project.cwd>` is ALWAYS pinned (never the cwd
 *     default) — vibe must never inherit an unpinned root.
 *   - `--auto-approve` is ON by default (KAINBAIN_VIBE_AUTO_APPROVE=0
 *     restores per-agent approval behaviour), but it is constructed ONLY
 *     from the resolved `autoApprove` setting — never from prompt text.
 *   - `--trust` is ON by default (headless runs cannot answer the trust
 *     prompt; the trust applies to this invocation only and is never
 *     persisted to trusted_folders.toml).
 *   - `--output streaming` + `--output-dir <fresh tmpdir>` are ALWAYS
 *     pinned (harness-owned): streaming is the only scrapeable live
 *     format, and the output dir is the only source of cost/usage.
 *   - The child env is an allowlist projection with secret-shaped names
 *     dropped; an env-provided `MISTRAL_API_KEY` is passed through
 *     explicitly (the cached `~/.vibe/` login remains the primary auth —
 *     the key is an optional override, never a requirement).
 */

export const VIBE_HARNESS_ID = "vibe";

/** Single prompt cap that forces --prompt-file staging (64 KiB, muse parity). */
export const VIBE_PROMPT_FILE_THRESHOLD_BYTES = 64 * 1024;

/** Single stdout line cap in the stream parser (1 MiB, muse/agy parity). */
export const VIBE_MAX_LINE_BYTES = 1024 * 1024;

/** Flags this harness may never construct silently. */
export const VIBE_GUARDED_FLAGS = Object.freeze(["--auto-approve", "--yolo"]);

/** Shell operators rejected in KAINBAIN_VIBE_ARGS (argv is never shell-interpreted). */
const SHELL_OPERATOR_PATTERN = /[|;&><$`(){}!#~*?[\]]/;

/***
 * MARK: vibeLimitGuards (internal)
 * @description Fail-safe guards for the numeric run budgets. Env-provided
 *   values are already range-checked by the config schema (min), but
 *   injected overrides (deps/tests) bypass the schema — an out-of-range
 *   override must degrade to "CLI default applies" (flag omitted), never
 *   to a malformed CLI flag that fails the run.
 ***/
function isPositiveInt(value) {
	return Number.isInteger(value) && value >= 1;
}

/***
 * MARK: assertSafeToolFilter (internal)
 * @description Rejects one `--enabled-tools`/`--disabled-tools` value that
 *   would be misparsed as a CLI flag (leading `-`). The filters travel as
 *   separate argv tokens (never shell-interpreted), so a dash-leading value
 *   is the one injection shape left — fail loudly instead of spawning a run
 *   whose tool sandbox is not what the operator configured.
 ***/
function assertSafeToolFilter(value, flag) {
	if (typeof value !== "string" || !value.trim()) {
		throw new Error(
			`Refusing empty value for vibe ${flag}: tool filters must name a tool, glob, or re: regex`,
		);
	}
	if (value.startsWith("-")) {
		throw new Error(
			`Refusing "${value}" for vibe ${flag}: values starting with "-" would be misparsed as CLI flags`,
		);
	}
}

/** Flags owned by the harness: never accepted via KAINBAIN_VIBE_ARGS (exact
 *  or `--flag=value` form) so every security- and cost-relevant knob keeps a
 *  single auditable provenance (the resolved settings). */
const VIBE_HARNESS_OWNED_FLAGS = Object.freeze([
	"--workdir",
	"--worktree",
	"--add-dir",
	"--prompt",
	"--prompt-file",
	"--output",
	"--output-dir",
	"--auto-approve",
	"--yolo",
	"--trust",
	"--agent",
	"--time-limit",
	"--enabled-tools",
	"--disabled-tools",
	"--continue",
	"--resume",
	"--setup",
	"--check-upgrade",
]);

/***
 * MARK: assertSafeVibeArgs
 * @description Hard guard over a vibe argv array: throws when
 *   `--auto-approve`/`--yolo` is present without the explicit
 *   `autoApprove: true` opt-in, and when the `--workdir` pin is absent
 *   (defense in depth — vibe must never inherit an unpinned root).
 * @example assertSafeVibeArgs(["--prompt", "hi", "--workdir", "/w", "--output", "streaming"], {}) // passes
 * @example assertSafeVibeArgs(["--prompt", "hi", "--auto-approve"], {}) // throws
 * @param {Array<string>} args - The vibe argv under inspection (without the binary).
 * @param {Object} [settings] - Explicit settings ({ autoApprove: true } permits --auto-approve).
 * @returns {boolean} true when the argv is safe.
 ***/
export function assertSafeVibeArgs(args, settings = {}) {
	const list = Array.isArray(args) ? args : [];
	if (!list.includes("--workdir")) {
		throw new Error(
			"Refusing to spawn vibe without --workdir: the workspace root must always be pinned",
		);
	}
	if (
		(list.includes("--auto-approve") || list.includes("--yolo")) &&
		settings?.autoApprove !== true
	) {
		throw new Error(
			"Refusing to spawn vibe with --auto-approve without explicit opt-in (settings.autoApprove === true): --auto-approve approves every tool call without prompting",
		);
	}
	return true;
}

/***
 * MARK: parseVibeExtraArgs
 * @description Validates operator-supplied extra argv (KAINBAIN_VIBE_ARGS):
 *   whitespace-tokenized, never shell-interpreted. Rejects shell operators
 *   and every harness-owned flag (exact and `--flag=value` forms) so the
 *   workspace pin, approval provenance, output contract, and cost
 *   guardrails cannot be widened silently from a string.
 * @example parseVibeExtraArgs("--smart-approve") => ["--smart-approve"]
 * @param {string} raw - Raw extra-args string.
 * @returns {Array<string>} Validated argv tokens.
 ***/
export function parseVibeExtraArgs(raw) {
	if (typeof raw !== "string" || !raw.trim()) return [];
	const tokens = raw.trim().split(/\s+/);
	for (const token of tokens) {
		if (SHELL_OPERATOR_PATTERN.test(token)) {
			throw new Error(
				`Refusing KAINBAIN_VIBE_ARGS token "${token}": shell operators are never interpreted`,
			);
		}
		const flag = token.split("=")[0];
		if (VIBE_HARNESS_OWNED_FLAGS.includes(flag)) {
			throw new Error(
				`Refusing ${flag} in KAINBAIN_VIBE_ARGS: the harness owns this flag (use its KAINBAIN_VIBE_* setting)`,
			);
		}
	}
	return tokens;
}

/***
 * MARK: resolveVibeSettings
 * @description Resolves the vibe harness settings from injected overrides or
 *   the validated engine configuration (`api/config`), which already parses
 *   `KAINBAIN_VIBE_*` (types and the vibe→agent timeout chain) and fails
 *   fast at boot on malformed values. Every knob stays overridable so
 *   tests can point the harness at the fixture mock binary without touching
 *   the environment.
 * @example resolveVibeSettings({ vibeBin: "/tmp/mock-vibe.mjs" }).bin => "/tmp/mock-vibe.mjs"
 * @param {Object} [deps] - Injected overrides.
 * @returns {Object} The resolved settings.
 ***/
export function resolveVibeSettings(deps = {}) {
	const csv = (value) => {
		if (Array.isArray(value)) return value.filter((part) => typeof part === "string" && part);
		if (typeof value === "string" && value.trim()) {
			return value
				.split(",")
				.map((part) => part.trim())
				.filter((part) => part !== "");
		}
		return [];
	};
	return {
		bin: deps.vibeBin || deps.bin || config.vibeBin,
		// Which CLI implementation the harness targets (the launcher's VIBE_CLI
		// selector): 'python' pins the classic CLI whose flag contract this
		// harness is written against, 'rust' opts into the Rust TUI, 'auto'
		// leaves VIBE_CLI unset and follows the upstream rollout.
		cli: deps.vibeCli || deps.cli || config.vibeCli,
		autoApprove:
			deps.autoApprove !== undefined ? Boolean(deps.autoApprove) : config.vibeAutoApprove,
		agent: deps.agent !== undefined ? deps.agent : config.vibeAgent,
		timeLimitS: deps.timeLimitS !== undefined ? deps.timeLimitS : config.vibeTimeLimit,
		trust: deps.trust !== undefined ? Boolean(deps.trust) : config.vibeTrust,
		enabledTools:
			deps.enabledTools !== undefined ? csv(deps.enabledTools) : csv(config.vibeEnabledTools),
		disabledTools:
			deps.disabledTools !== undefined
				? csv(deps.disabledTools)
				: csv(config.vibeDisabledTools),
		// Legacy fallthrough kept (muse pattern): a zero timeout historically
		// meant "unset", so 0 still falls to the agent-stage timeout and then
		// the 30-minute floor.
		timeoutMs:
			deps.timeoutMs || config.vibeTimeoutMs || config.agentTimeoutMs || 1800000,
		extraArgs: deps.extraArgs !== undefined ? deps.extraArgs : config.vibeArgs,
	};
}

/***
 * MARK: buildVibeSpawnPlan
 * @description Builds the spawn plan for one headless programmatic-mode run:
 *   `vibe --prompt TEXT --output streaming --output-dir <tmp> --workdir
 *   <abs> [--trust] [--auto-approve] [...]`.
 *
 *   The prompt travels as the `--prompt` value UNLESS it exceeds 64 KiB —
 *   then it is staged to a `--prompt-file` inside the run tmpdir (the CLI
 *   reads the prompt from the file instead of `-p` text, still in
 *   programmatic mode). The same tmpdir hosts the `--output-dir` export
 *   (`export.json` + session journal copy on every exit), returned as
 *   `outputDir` with a single `cleanup()` for settle-time removal of both.
 * @example await buildVibeSpawnPlan({ prompt: "hi", workspaceDir: "/w" }) => { command: "vibe", args: [...] }
 * @param {Object} opts
 * @param {string} opts.prompt - The stage prompt text.
 * @param {string} opts.workspaceDir - Absolute project workspace root (pinned).
 * @param {Object} [opts.settings] - Explicit settings (bin, autoApprove, agent, limits, tools, extraArgs).
 * @returns {Promise<Object>} { command, args, promptFile, outputDir, cleanup, settings }.
 *
 *   Failure modes (all fail safe, never a half-pinned spawn): a missing
 *   workspaceDir throws before any tmpdir work; an out-of-range numeric
 *   budget (possible only via injected overrides, which bypass the schema's
 *   min checks) omits that flag so the CLI default applies; a dash-leading
 *   tool-filter value or a rejected KAINBAIN_VIBE_ARGS token throws and the
 *   run tmpdir is removed before the error propagates.
 ***/
export async function buildVibeSpawnPlan({ prompt, workspaceDir, settings = {} }) {
	const resolved = resolveVibeSettings(settings);
	if (!workspaceDir || typeof workspaceDir !== "string") {
		throw new Error(
			"buildVibeSpawnPlan requires an absolute workspaceDir (vibe runs are pinned to the project workspace)",
		);
	}
	const workspaceAbs = path.resolve(workspaceDir);

	const runDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "kainbain-vibe-run-"));
	const outputDir = path.join(runDir, "output");
	await fs.promises.mkdir(outputDir, { recursive: true });
	let promptFile = null;
	const cleanup = async () => {
		try {
			await fs.promises.rm(runDir, { recursive: true, force: true });
		} catch {
			// best-effort cleanup
		}
	};

	try {
		const args = [];
		const text = String(prompt ?? "");
		if (Buffer.byteLength(text, "utf8") > VIBE_PROMPT_FILE_THRESHOLD_BYTES) {
			promptFile = path.join(runDir, "prompt.md");
			await fs.promises.writeFile(promptFile, text, "utf8");
			args.push("--prompt-file", promptFile);
		} else {
			args.push("--prompt", text);
		}

		// Harness-owned output contract: streaming rows for live deltas, and
		// the output dir for the export.json cost/usage/stop-reason record.
		args.push("--output", "streaming", "--output-dir", outputDir);
		args.push("--workdir", workspaceAbs);
		if (resolved.trust) args.push("--trust");
		if (typeof resolved.agent === "string" && resolved.agent.trim()) {
			args.push("--agent", resolved.agent.trim());
		}
		// The time-limit flag is fail-safe: an out-of-range override
		// (possible only via injected deps, which bypass the schema's min
		// checks) omits the flag so the CLI default applies — the engine
		// watchdog still bounds every run.
		if (isPositiveInt(resolved.timeLimitS)) args.push("--time-limit", String(resolved.timeLimitS));
		for (const tool of resolved.enabledTools || []) {
			assertSafeToolFilter(tool, "--enabled-tools");
			args.push("--enabled-tools", tool);
		}
		for (const tool of resolved.disabledTools || []) {
			assertSafeToolFilter(tool, "--disabled-tools");
			args.push("--disabled-tools", tool);
		}
		for (const token of parseVibeExtraArgs(resolved.extraArgs)) args.push(token);

		// --auto-approve is the single sanctioned construction site: appended
		// AFTER the guard runs, only from the explicit setting — never from
		// prompt text.
		assertSafeVibeArgs(args, { autoApprove: false });
		if (resolved.autoApprove) args.push("--auto-approve");
		assertSafeVibeArgs(args, { autoApprove: resolved.autoApprove });

		return {
			command: resolved.bin,
			args,
			promptFile,
			outputDir,
			cleanup,
			// The pin and the argv come from ONE object (single source of truth):
			// the harness spawns with plan.env, so a test can assert both without
			// re-deriving the settings.
			env: buildVibeChildEnv(process.env, { cli: resolved.cli }),
			settings: resolved,
		};
	} catch (error) {
		await cleanup();
		throw error;
	}
}

/** Exact env names kept in the child environment. */
const VIBE_ENV_KEEP_EXACT = new Set([
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

/** Env-name prefixes kept in the child environment (vibe/tool config). */
const VIBE_ENV_KEEP_PREFIXES = ["VIBE_", "XDG_"];

/** Secret-name redaction lives in the shared scaffold (SECRET_NAME_PATTERN) —
 *  redaction always wins over the allowlist below. */

/***
 * MARK: buildVibeChildEnv
 * @description Projects the parent process.env onto a minimal allowlist for
 *   the vibe child process, with every secret-shaped name dropped so child
 *   stderr/logs cannot leak host secrets. Vibe authenticates from its own
 *   `~/.vibe/` login cache by default; an env-provided `MISTRAL_API_KEY`
 *   (optional override) is passed through explicitly via the scaffold's
 *   `extra` — the one path that survives secret redaction by design, so the
 *   passthrough stays visible and auditable here instead of hiding in a
 *   prefix allowlist.
 *
 *   `cli` pins the CLI implementation via the launcher's `VIBE_CLI` selector
 *   (`python`/`rust`); `auto`/undefined leaves it inherited-or-unset so the
 *   upstream rollout decides. Both assignments are merged as `extra` (after
 *   the allowlist + redaction) so a parent-provided `VIBE_CLI=rust` cannot
 *   silently override the harness-owned pin.
 * @example buildVibeChildEnv({ PATH: "/bin", MISTRAL_API_KEY: "s3cr3t" }) => { PATH: "/bin", MISTRAL_API_KEY: "s3cr3t" }
 * @example buildVibeChildEnv({ PATH: "/bin", OTHER_KEY: "s3cr3t" }) => { PATH: "/bin" }
 * @example buildVibeChildEnv({ PATH: "/bin", VIBE_CLI: "rust" }, { cli: "python" }) => { PATH: "/bin", VIBE_CLI: "python" }
 * @param {Object} [baseEnv] - The parent environment (defaults to process.env).
 * @param {Object} [opts]
 * @param {string} [opts.cli] - Resolved CLI implementation ('python'|'rust'|'auto'|undefined).
 * @returns {Object} The redacted child environment carrying the CLI pin.
 ***/
export function buildVibeChildEnv(baseEnv = process.env, { cli } = {}) {
	// Allowlist projection + secret redaction are owned by the shared
	// scaffold; this wrapper keeps the vibe keep-sets (and the import surface
	// the harness + tests use) in the vibe folder.
	const extra = {};
	const apiKey = baseEnv?.MISTRAL_API_KEY;
	if (typeof apiKey === "string" && apiKey) extra.MISTRAL_API_KEY = apiKey;
	const selection = typeof cli === "string" ? cli.trim().toLowerCase() : "";
	// VIBE_CLI is not secret-shaped, so it also survives the VIBE_ prefix
	// allowlist; setting it via `extra` is what makes the harness-owned pin
	// win over an inherited value.
	if (selection === "python" || selection === "rust") extra.VIBE_CLI = selection;
	return buildChildEnv(baseEnv, {
		keepExact: VIBE_ENV_KEEP_EXACT,
		keepPrefixes: VIBE_ENV_KEEP_PREFIXES,
		extra,
	});
}

/***
 * MARK: readVibeExport
 * @description Reads the `export.json` cost/usage/stop-reason record the CLI
 *   writes to the run `--output-dir` on every exit. Never throws: a missing
 *   or malformed export degrades to null ("usage unknown") and the stage
 *   still settles on the exit code — the export enriches the run log, it
 *   never gates the run.
 * @example readVibeExport("/tmp/run/output") => { outcome: "finished", costUsd: 0.012, … }
 * @param {string} outputDir - The run's --output-dir.
 * @returns {Object|null} { outcome, stopReason, error, usage, costUsd, steps, exitCode } or null.
 ***/
export function readVibeExport(outputDir) {
	try {
		if (!outputDir || typeof outputDir !== "string") return null;
		/* eslint-disable security/detect-non-literal-fs-filename -- outputDir is the harness-owned run tmpdir from buildVibeSpawnPlan */
		const raw = fs.readFileSync(path.join(outputDir, "export.json"), "utf8");
		/* eslint-enable security/detect-non-literal-fs-filename */
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return null;
		const usage =
			parsed.usage && typeof parsed.usage === "object"
				? {
						inputTokens:
							typeof parsed.usage.input_tokens === "number"
								? parsed.usage.input_tokens
								: null,
						outputTokens:
							typeof parsed.usage.output_tokens === "number"
								? parsed.usage.output_tokens
								: null,
						totalTokens:
							typeof parsed.usage.total_tokens === "number"
								? parsed.usage.total_tokens
								: null,
					}
				: null;
		return {
			outcome: typeof parsed.outcome === "string" ? parsed.outcome : null,
			stopReason: typeof parsed.stop_reason === "string" ? parsed.stop_reason : null,
			error: typeof parsed.error === "string" ? parsed.error : null,
			usage,
			costUsd: typeof parsed.cost_usd === "number" ? parsed.cost_usd : null,
			steps: typeof parsed.steps === "number" ? parsed.steps : null,
			exitCode: typeof parsed.exit_code === "number" ? parsed.exit_code : null,
		};
	} catch {
		return null;
	}
}
