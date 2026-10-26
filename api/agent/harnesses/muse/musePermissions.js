import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { buildChildEnv } from "../shared/harnessScaffold.js";
import { config } from "../../../config/index.js";

/**
 * MARK: musePermissions
 * @description The SAFE ARGV/ENV SURFACE for spawning the Muse Code CLI
 *   (`muse exec`): spawn-plan building with a hard guard against silent
 *   privilege widening, child-env construction with secret redaction, and
 *   prompt-file staging for oversized prompts.
 *
 *   Defaults (operator-chosen YOLO: there is no approval UI yet, so runs
 *   trust the workspace unless the deployment opts out):
 *   - `--workspace <abs project.cwd>` is ALWAYS pinned (never the cwd
 *     default) — muse must never inherit an unpinned root.
 *   - `--yolo` is ON by default (KAINBAIN_MUSE_YOLO=0 restores sandbox-on
 *     with `--approval-mode never`), but it is constructed ONLY from the
 *     resolved `yolo` setting — never from prompt text.
 *   - `--trust-workspace` stays off unless explicitly enabled (it loads the
 *     project's own skills/rules into the agent context, competing with
 *     KainBain's curated prompt skills).
 *   - The child env is an allowlist projection with secret-shaped names
 *     dropped, so child stderr/logs cannot leak host secrets (muse
 *     authenticates from its own ~/.config/muse cache).
 */

export const MUSE_HARNESS_ID = "muse";

/** Single argv element cap that forces --prompt-file staging (64 KiB). */
export const MUSE_PROMPT_FILE_THRESHOLD_BYTES = 64 * 1024;

/** Single stdout line cap in the stream parser (1 MiB, agy parity). */
export const MUSE_MAX_LINE_BYTES = 1024 * 1024;

/** Flags this harness may never construct silently. */
export const MUSE_GUARDED_FLAGS = Object.freeze(["--yolo"]);

/** Shell operators rejected in KAINBAIN_MUSE_ARGS (argv is never shell-interpreted). */
const SHELL_OPERATOR_PATTERN = /[|;&><$`(){}!#~*?[\]]/;

/***
 * MARK: assertSafeMuseArgs
 * @description Hard guard over a muse argv array: throws when `--yolo` is
 *   present without the explicit `yolo: true` opt-in, and when the
 *   `--workspace` pin is absent (defense in depth — muse must never inherit
 *   an unpinned root).
 * @example assertSafeMuseArgs(["exec", "--workspace", "/w", "--json"], {}) // passes
 * @example assertSafeMuseArgs(["exec", "--yolo"], {}) // throws
 * @param {Array<string>} args - The muse argv under inspection (without the binary).
 * @param {Object} [settings] - Explicit settings ({ yolo: true } permits --yolo).
 * @returns {boolean} true when the argv is safe.
 ***/
export function assertSafeMuseArgs(args, settings = {}) {
	const list = Array.isArray(args) ? args : [];
	if (!list.includes("--workspace")) {
		throw new Error(
			"Refusing to spawn muse without --workspace: the workspace root must always be pinned",
		);
	}
	if (list.includes("--yolo") && settings?.yolo !== true) {
		throw new Error(
			"Refusing to spawn muse with --yolo without explicit opt-in (settings.yolo === true): --yolo disables approval AND sandbox in one flag",
		);
	}
	return true;
}

/***
 * MARK: parseMuseExtraArgs
 * @description Validates operator-supplied extra argv (KAINBAIN_MUSE_ARGS):
 *   whitespace-tokenized, never shell-interpreted. Rejects shell operators,
 *   `--yolo` (must come from the explicit yolo setting so provenance is
 *   auditable), and `--workspace`/`--prompt-file` (harness-owned pins).
 * @example parseMuseExtraArgs("--max-model-steps 200") => ["--max-model-steps", "200"]
 * @param {string} raw - Raw extra-args string.
 * @returns {Array<string>} Validated argv tokens.
 ***/
export function parseMuseExtraArgs(raw) {
	if (typeof raw !== "string" || !raw.trim()) return [];
	const tokens = raw.trim().split(/\s+/);
	for (const token of tokens) {
		if (SHELL_OPERATOR_PATTERN.test(token)) {
			throw new Error(
				`Refusing KAINBAIN_MUSE_ARGS token "${token}": shell operators are never interpreted`,
			);
		}
		if (token === "--yolo") {
			throw new Error(
				"Refusing --yolo in KAINBAIN_MUSE_ARGS: use KAINBAIN_MUSE_YOLO=1 so the opt-in is explicit",
			);
		}
		if (token === "--workspace" || token === "--prompt-file") {
			throw new Error(
				`Refusing ${token} in KAINBAIN_MUSE_ARGS: the harness owns the workspace/prompt pins`,
			);
		}
	}
	return tokens;
}

/***
 * MARK: resolveMuseSettings
 * @description Resolves the muse harness settings from injected overrides or
 *   the validated engine configuration (`api/config`), which already parses
 *   `KAINBAIN_MUSE_*` (types, enums, and the muse→agent timeout chain) and
 *   fails fast at boot on malformed values. Every knob stays overridable so
 *   tests can point the harness at the fixture mock binary without touching
 *   the environment.
 * @example resolveMuseSettings({ museBin: "/tmp/mock-muse.mjs" }).bin => "/tmp/mock-muse.mjs"
 * @param {Object} [deps] - Injected overrides.
 * @returns {Object} { bin, approvalMode, yolo, trustWorkspace, noSessionLog, timeoutMs, extraArgs }.
 ***/
export function resolveMuseSettings(deps = {}) {
	return {
		bin: deps.museBin || deps.bin || config.museBin,
		approvalMode: deps.approvalMode || config.museApprovalMode,
		yolo: deps.yolo !== undefined ? Boolean(deps.yolo) : config.museYolo,
		trustWorkspace:
			deps.trustWorkspace !== undefined
				? Boolean(deps.trustWorkspace)
				: config.museTrustWorkspace,
		noSessionLog:
			deps.noSessionLog !== undefined
				? Boolean(deps.noSessionLog)
				: config.museNoSessionLog,
		// Legacy fallthrough kept: a zero timeout historically meant "unset"
		// (Number("0") is falsy), so 0 still falls to the agent-stage timeout
		// and then the 30-minute floor.
		timeoutMs:
			deps.timeoutMs ||
			config.museTimeoutMs ||
			config.agentTimeoutMs ||
			1800000,
		extraArgs:
			deps.extraArgs !== undefined ? deps.extraArgs : config.museArgs,
	};
}

/***
 * MARK: buildMuseSpawnPlan
 * @description Builds the spawn plan for one headless `muse exec` run:
 *   `muse exec --workspace <abs> --approval-mode <mode> --json [...]`.
 *   The prompt travels as the final argv element UNLESS it exceeds
 *   64 KiB — then it is staged to a `--prompt-file` in a fresh mkdtemp
 *   tmpdir (returned as `promptFile` with a `cleanup()` for settle-time
 *   removal), closing the E2BIG failure for review-sized prompts.
 * @example await buildMuseSpawnPlan({ prompt: "hi", workspaceDir: "/w" }) => { command: "muse", args: [...] }
 * @param {Object} opts
 * @param {string} opts.prompt - The stage prompt text.
 * @param {string} opts.workspaceDir - Absolute project workspace root (pinned).
 * @param {string|null} [opts.modelId] - Model id pinned via --model (v2 passthrough; null = CLI default).
 * @param {Object} [opts.settings] - Explicit settings (bin, approvalMode, yolo, trustWorkspace, noSessionLog, extraArgs).
 * @returns {Promise<Object>} { command, args, promptFile, cleanup }.
 ***/
export async function buildMuseSpawnPlan({
	prompt,
	workspaceDir,
	modelId = null,
	sessionId = null,
	settings = {},
}) {
	const resolved = resolveMuseSettings(settings);
	if (!workspaceDir || typeof workspaceDir !== "string") {
		throw new Error(
			"buildMuseSpawnPlan requires an absolute workspaceDir (muse runs are pinned to the project workspace)",
		);
	}
	const workspaceAbs = path.resolve(workspaceDir);
	const args = ["exec", "--workspace", workspaceAbs];

	if (sessionId) args.push("--session-id", String(sessionId));
	if (resolved.approvalMode) {
		args.push("--approval-mode", String(resolved.approvalMode));
	}
	args.push("--json");
	if (resolved.noSessionLog) args.push("--no-session-log");
	if (resolved.trustWorkspace) args.push("--trust-workspace");
	if (modelId) args.push("--model", String(modelId));
	for (const token of parseMuseExtraArgs(resolved.extraArgs)) args.push(token);

	let promptFile = null;
	let cleanup = async () => {};
	const text = String(prompt ?? "");
	if (Buffer.byteLength(text, "utf8") > MUSE_PROMPT_FILE_THRESHOLD_BYTES) {
		const dir = await fs.promises.mkdtemp(
			path.join(os.tmpdir(), "kainbain-muse-prompt-"),
		);
		promptFile = path.join(dir, "prompt.md");
		await fs.promises.writeFile(promptFile, text, "utf8");
		args.push("--prompt-file", promptFile);
		cleanup = async () => {
			try {
				await fs.promises.rm(dir, { recursive: true, force: true });
			} catch {
				// best-effort cleanup
			}
		};
	} else {
		args.push(text);
	}

	// --yolo is the single sanctioned construction site: appended AFTER the
	// guard runs, only from the explicit setting — never from prompt text.
	assertSafeMuseArgs(args, { yolo: false });
	if (resolved.yolo) args.push("--yolo");
	assertSafeMuseArgs(args, { yolo: resolved.yolo });

	return { command: resolved.bin, args, promptFile, cleanup, settings: resolved };
}

/** Secret-name redaction lives in the shared scaffold (SECRET_NAME_PATTERN) —
 *  redaction always wins over the allowlist below. */

/***
 * MARK: mapMuseExportToHistory
 * @description Maps a `muse export` document (export_schema_version 1) onto
 *   the engine's `{ messages, tree }` history shape. The export is a nested
 *   record log (records arrive stringified inside `record_json` envelopes), so
 *   this walks it for the message-bearing records it knows and ignores the
 *   rest. Probe-verified shapes (muse 1.4.9, echo provider):
 *   - the user prompt: a `runtime.session` record whose `event.kind` is
 *     `"started"` carrying `event.prompt` (the durable run-open record), or
 *     a `turn.input.user` stream row carrying `payload.prompt`;
 *   - the assistant reply: a `runtime.session` record whose `event.kind` is
 *     `"assistant_message_committed"` carrying `event.text` (authoritative),
 *     or `run.output.delta` / `run.terminal.completed` stream rows carrying
 *     `payload.text`.
 *   Assistant deltas ACCUMULATE into one message; an authoritative terminal
 *   text REPLACES the accumulated buffer, so a turn yields exactly one
 *   assistant message. Unknown shapes yield the honest empty history — a read
 *   never fails over an unfamiliar entry. A document that already carries a
 *   `messages` array passes straight through (future-proof).
 * @example mapMuseExportToHistory({ messages: [{ role: "user", content: "hi" }] }) => { messages: [...], tree: [] }
 * @param {Object} document - The parsed export document.
 * @returns {{messages: Array, tree: Array}} The history projection.
 ***/
export function mapMuseExportToHistory(document) {
	if (!document || typeof document !== "object") return { messages: [], tree: [] };
	if (Array.isArray(document.messages)) {
		return { messages: document.messages, tree: Array.isArray(document.tree) ? document.tree : [] };
	}
	const records = [];
	collectRecords(document.events, records);
	const messages = [];
	// Consecutive assistant deltas accumulate into ONE message; an
	// authoritative terminal/committed text replaces the buffer.
	let assistantBuffer = "";
	const flushAssistant = () => {
		if (assistantBuffer) {
			messages.push({ role: "assistant", content: assistantBuffer });
			assistantBuffer = "";
		}
	};
	const pushUser = (text) => {
		if (typeof text !== "string" || !text) return;
		flushAssistant();
		messages.push({ role: "user", content: text });
	};
	const pushAssistant = (text) => {
		if (typeof text !== "string" || !text) return;
		messages.push({ role: "assistant", content: text });
		assistantBuffer = "";
	};
	for (const record of records) {
		const payloadType = record?.payload_type;
		const payload = record?.payload;
		if (!payloadType || !payload || typeof payload !== "object") continue;
		// Durable run-open record: the user prompt rides on event.prompt.
		if (
			payloadType === "runtime.session" &&
			payload.event &&
			typeof payload.event === "object" &&
			payload.event.kind === "started"
		) {
			pushUser(payload.event.prompt);
			continue;
		}
		// Durable assistant commit: the authoritative reply text.
		if (
			payloadType === "runtime.session" &&
			payload.event &&
			typeof payload.event === "object" &&
			payload.event.kind === "assistant_message_committed"
		) {
			pushAssistant(payload.event.text);
			continue;
		}
		// Stream rows (exec --json shape): the prompt echo and the output
		// deltas/terminal text.
		if (payloadType === "turn.input.user") {
			pushUser(payload.prompt ?? payload.text);
			continue;
		}
		if (payloadType === "run.output.delta" && typeof payload.text === "string") {
			assistantBuffer += payload.text;
			continue;
		}
		if (payloadType === "run.terminal.completed") {
			// The terminal text is authoritative: it replaces any accumulated
			// deltas instead of duplicating them.
			pushAssistant(payload.text ?? assistantBuffer);
			continue;
		}
	}
	flushAssistant();
	return { messages, tree: [] };
}

/** Recursively collects record envelopes (including stringified `record_json` children). */
function collectRecords(node, out) {
	if (!node) return;
	if (Array.isArray(node)) {
		for (const entry of node) collectRecords(entry, out);
		return;
	}
	if (typeof node !== "object") return;
	if (typeof node.payload_type === "string") out.push(node);
	if (typeof node.record_json === "string") {
		try {
			collectRecords(JSON.parse(node.record_json), out);
		} catch {
			// corrupt child record — skip it
		}
	}
	for (const value of Object.values(node)) {
		if (value && typeof value === "object") collectRecords(value, out);
	}
}

/** A muse session id is a UUID; anything else (e.g. the engine's session
 *  DIRECTORY path) is not an id and selects the workspace-latest export. */
const MUSE_SESSION_ID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * MARK: readHistoryFromDisk
 * @description Reads a persisted muse session's history via
 *   `muse export --redacted --out <tmpfile>` (export writes a file, so the
 *   tmpfile is read back and parsed), then projects it with
 *   `mapMuseExportToHistory`. With an explicit session id the export is
 *   scoped to it (`--session <id>`); without one — the engine passes the
 *   KainBain session DIRECTORY, and muse keeps its own store keyed by
 *   workspace — the export falls back to `--last`, the workspace's most
 *   recent retained session (the honest read for a single-session project).
 *   Any failure degrades to the honest empty history — a history read never
 *   breaks a page.
 * @example await readHistoryFromDisk({ sessionId: "01a1…", workspaceDir: "/repo" }) => { messages: [...], tree: [] }
 * @param {Object} opts
 * @param {string} [opts.sessionId] - Explicit muse session id (UUID-shaped).
 * @param {string} [opts.workspaceDir] - Absolute project workspace root (pins the export).
 * @param {Object} [opts.settings] - Harness settings override (bin) so the export uses the SAME resolved binary as the sessions.
 * @returns {Promise<Object>} Session history data.
 */
export async function readHistoryFromDisk({ sessionId = null, workspaceDir = null, settings = {} } = {}) {
	const explicitId =
		typeof sessionId === "string" && MUSE_SESSION_ID_PATTERN.test(sessionId.trim())
			? sessionId.trim()
			: null;
	const resolved = resolveMuseSettings(settings);
	let dir = null;
	try {
		dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "kainbain-muse-export-"));
		const outFile = path.join(dir, "export.json");
		const args = ["export", "--redacted", "--out", outFile];
		if (explicitId) {
			args.splice(1, 0, "--session", explicitId);
		} else {
			args.splice(1, 0, "--last");
		}
		await new Promise((resolve, reject) => {
			execFile(
				resolved.bin,
				args,
				{ cwd: workspaceDir ? path.resolve(workspaceDir) : process.cwd(), timeout: 30000 },
				(error) => (error ? reject(error) : resolve()),
			);
		});
		// eslint-disable-next-line security/detect-non-literal-fs-filename -- path is harness-created inside a private mkdtemp
		const document = JSON.parse(await fs.promises.readFile(outFile, "utf8"));
		return mapMuseExportToHistory(document);
	} catch (error) {
		// Best-effort read: an unavailable/corrupt export never breaks a page.
		console.error(`Failed to read Muse session history: ${error?.message || error}`);
		return { messages: [], tree: [] };
	} finally {
		if (dir) {
			await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
		}
	}
}

/**
 * MARK: buildMuseChildEnv
 * @description Projects the parent process.env onto a minimal allowlist for
 *   the muse child process, with every secret-shaped name dropped so child
 *   stderr/logs cannot leak host secrets. Muse authenticates from its own
 *   ~/.config/muse cache; API-key setups wrap the CLI via KAINBAIN_MUSE_BIN.
 * @example buildMuseChildEnv({ PATH: "/bin", MUSE_API_KEY: "s3cr3t" }) => { PATH: "/bin" }
 * @param {Object} [baseEnv] - The parent environment (defaults to process.env).
 * @returns {Object} The redacted child environment.
 */
export function buildMuseChildEnv(baseEnv = process.env) {
	return buildChildEnv(baseEnv, {
		keepExact: new Set([
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
		]),
		keepPrefixes: ["MUSE_", "XDG_"],
	});
}
