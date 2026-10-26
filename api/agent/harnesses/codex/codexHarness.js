import { binaryAvailable } from "../../harnessDiscovery.js";
import { config } from "../../../config.js";
import { buildChildEnv } from "../shared/harnessScaffold.js";

/**
 * MARK: codexHarness
 * @description The Codex CLI harness: a Tier 2 theoretical shim that
 *   registers the `codex` harness in KainBain without spawning real processes
 *   on this device (`codex` is not installed).
 *
 *   Engine path (the ONLY live path): `createSession(project, meta)` returns
 *   an honest in-memory session whose `prompt()` records the turn and replies
 *   with the "not installed" setup hint — never a silent success, never a
 *   spawn. There is deliberately NO `runSession` member: the engine drives
 *   every harness through `createSession` + `prompt` (see
 *   `api/agentRunner.js`), and a second entry point would be dead surface
 *   that drifts from the contract.
 *
 *   Model contract: `modelSelection: "list"` with an honestly EMPTY catalogue
 *   (`listModels()` returns `[]`, `resolveModelRef()` returns `null`). The
 *   curated fallback is never served to Codex (survey q2 "if possible" is
 *   honoured by honesty: not possible here).
 *
 *   Auth: Codex-native only. `OPENAI_API_KEY` is passed through from the
 *   operator's own environment to the (future) child and `HOME` is kept so
 *   the Codex login cache (`~/.codex/auth.json`) resolves; KainBain never
 *   stores or injects credentials (survey q7).
 *
 *   YOLO: auto-approve by default (survey q3 — no approval UI exists yet).
 *   The flag is constructed ONLY from resolved settings
 *   (`resolveCodexSettings`); `KAINBAIN_CODEX_YOLO=0` restores approvals.
 *
 *   Continuity: a fresh Codex run per stage turn, correlated by conversation
 *   id when the live transport lands (survey q4).
 *
 *   UNVERIFIED (must not be assumed live — see
 *   `docs/EngineDetails/CodexHarness.md`): the exact `codex exec` flags, the
 *   programmatic app-server/JSON-RPC surface, model listing, approval modes,
 *   streaming shapes, telemetry, and resume semantics. `buildCodexSpawnPlan`
 *   records the assumed shape for future enablement; nothing executes it.
 */

/**
 * MARK: HARNESS_ID
 * @description The canonical harness id for this scaffold.
 */
export const HARNESS_ID = "codex";

/**
 * MARK: CODEX_NOT_INSTALLED_HINT
 * @description The honest refusal text surfaced everywhere the harness cannot
 *   run: session replies, discovery status, and setup guidance. Names the
 *   override so a missing binary is never silent.
 */
export const CODEX_NOT_INSTALLED_HINT =
	"Codex CLI is not installed or not found on PATH. "
	+ "Set KAINBAIN_CODEX_BIN to the absolute path of the codex binary to enable.";

/**
 * MARK: resolveCodexSettings
 * @description Resolves Codex-specific settings from injected overrides first,
 *   then the validated engine configuration (`api/config`, which parses
 *   `KAINBAIN_CODEX_*` and fails fast at boot on malformed values), then
 *   built-in defaults. Every knob stays overridable so tests never touch the
 *   environment. There is deliberately NO transport knob: the programmatic
 *   vs exec choice is UNVERIFIED on this device, so the shim pins the
 *   documented exec-shaped plan until primary sources confirm the surface.
 * @example resolveCodexSettings({ codexBin: "/tmp/fake-codex" }).bin => "/tmp/fake-codex"
 * @param {Object} [deps] - Injected overrides.
 * @param {string} [deps.codexBin] - Override the codex binary path.
 * @param {boolean} [deps.yolo] - Override auto-approve (default true).
 * @returns {{bin: string, yolo: boolean}} The resolved settings.
 */
export function resolveCodexSettings(deps = {}) {
	return {
		bin: deps.codexBin || config.codexBin || "codex",
		yolo: deps.yolo !== undefined ? Boolean(deps.yolo) : (config.codexYolo ?? true),
	};
}

/**
 * MARK: createCodexHarness
 * @description Factory for the Codex harness instance (same signature as the
 *   pi/muse/antigravity factories; registers into the same harness seam).
 * @example const harness = createCodexHarness({ eventBridge });
 * @param {Object} [deps]
 * @param {Object} [deps.eventBridge] - The EventBridge singleton (injected for testability).
 * @param {string} [deps.codexBin] - Override the codex binary path.
 * @param {boolean} [deps.yolo] - Override auto-approve (default true).
 * @returns {import("../../harnessContract.js").AgentHarness} The Codex harness instance.
 */
export function createCodexHarness(deps = {}) {
	const { eventBridge } = deps;
	const settings = resolveCodexSettings(deps);

	const log = (message, projectId) => {
		if (!message) return;
		const target = projectId || deps.projectId || "codex";
		eventBridge?.emitSystemLog?.(target, message, {
			projectId: projectId || deps.projectId || null,
			tag: "[CODEX]",
			level: "info",
		});
	};

	/**
	 * MARK: createSession
	 * @description Creates one honest in-memory session: `prompt()` records
	 *   the turn and replies with the setup hint. Requires a project with a
	 *   `cwd` (parity with the muse harness — every CLI run is pinned to the
	 *   project workspace, so a session without one is a fail-fast error,
	 *   not a deferred spawn failure).
	 */
	const createSession = async (project, { taskId, stageId } = {}) => {
		if (!project || !project.cwd) {
			throw new Error(
				"Codex sessions require a project with a cwd (codex runs are pinned to the project workspace)",
			);
		}
		const runLabel = `${stageId || "adhoc"}:${taskId || "chat"}`;
		const messages = [];
		const handlers = new Set();
		let disposed = false;
		let streaming = false;
		let lastAssistant = "";

		const deliver = (event) => {
			for (const handler of [...handlers]) handler(event);
		};

		const session = {
			harnessId: HARNESS_ID,

			get isStreaming() {
				return streaming;
			},

			messages,

			getMessages: () => messages,

			getLastAssistantText: () => lastAssistant,

			async prompt(text, { onChunk } = {}) {
				if (disposed) throw new Error("Codex session is disposed");
				if (streaming) {
					throw new Error("Codex session is already running a prompt");
				}
				if (typeof text !== "string") {
					throw new TypeError("Codex session prompt(text) requires a string");
				}
				messages.push({ role: "user", content: text });
				streaming = true;
				try {
					log(`[CODEX] prompt ${runLabel}: codex unavailable — replying with setup hint`);
					deliver({ type: "run_started" });
					deliver({ type: "assistant_delta", delta: CODEX_NOT_INSTALLED_HINT });
					onChunk?.(CODEX_NOT_INSTALLED_HINT);
					messages.push({ role: "assistant", content: CODEX_NOT_INSTALLED_HINT });
					lastAssistant = CODEX_NOT_INSTALLED_HINT;
					deliver({ type: "run_finished", status: "completed", response: CODEX_NOT_INSTALLED_HINT });
					return CODEX_NOT_INSTALLED_HINT;
				} finally {
					streaming = false;
				}
			},

			subscribe(handler) {
				handlers.add(handler);
				return () => handlers.delete(handler);
			},

			// Legacy event-hook hookpoint (parity with the reference mock):
			// everything is delivered through subscribe, so the engine's
			// `session.on("event", …)` wiring finds the member but receives
			// no legacy events.
			on: () => {},

			async abort() {
				streaming = false;
				return { status: "aborted" };
			},

			async dispose() {
				if (disposed) return;
				disposed = true;
				handlers.clear();
			},

			async steer(text) {
				if (disposed) throw new Error("Codex session is disposed");
				messages.push({ role: "user", content: text });
				return { status: "steered" };
			},

			async followUp(text) {
				if (disposed) throw new Error("Codex session is disposed");
				messages.push({ role: "user", content: text });
				return { status: "followed_up" };
			},

			async compact() {
				return { status: "compacted" };
			},

			async getContextUsage() {
				// Unknown until the live transport lands; the mock-harness
				// shape ({current, limit} numbers) so readers never branch.
				return { current: 0, limit: 100 };
			},

			async getActiveModel() {
				// No catalogue, no pin: the harness manages nothing yet.
				return null;
			},

			async listModels() {
				return [];
			},

			async switchModel(ref) {
				// Honest refusal: the empty catalogue resolves nothing, so a
				// switch must never report success (muse parity: warn + null,
				// never a silent swap).
				const name = typeof ref === "string" ? ref : ref?.id ?? ref?.key;
				log(
					`[WARN] Requested model '${name}' could not be resolved on the codex harness (empty catalogue); the stage keeps the current model.`,
				);
				return null;
			},
		};
		return session;
	};

	return {
		id: HARNESS_ID,
		name: HARNESS_ID,
		label: "Codex",
		description:
			"Codex CLI harness (Tier 2 theoretical shim) — registers the codex harness in KainBain without spawning real processes on this device (codex is not installed). Shows honest 'not installed' messaging when codex is unavailable.",
		// Honest-empty catalogue until a real binary proves one (survey q2):
		// the UI renders the dropdown over listModels() = [] with the
		// unavailable badge from discovery, never the curated fallback.
		modelSelection: "list",
		reasoningLevels: null,
		settings,
		createSession,
		listModels: async () => [],
		async resolveModelRef() {
			return null;
		},
		async readHistoryFromDisk() {
			return { messages: [], tree: [] };
		},
		getModelDiscoveryStatus() {
			// Resolved per call (never frozen at factory time) so a late-set
			// KAINBAIN_CODEX_BIN flips the badge without a restart of the
			// harness instance.
			const configured = deps.codexBin || config.codexBin || settings.bin || "codex";
			if (binaryAvailable(configured)) {
				return { ok: true };
			}
			return {
				ok: false,
				error: {
					code: "CODEX_BIN_MISSING",
					message: `codex binary not found: ${configured}`,
					hint: CODEX_NOT_INSTALLED_HINT,
				},
			};
		},
	};
}

/**
 * MARK: buildCodexSpawnPlan
 * @description Builds the argv for ONE theoretical headless `codex exec` run:
 *   `codex exec --workspace <abs> [--session-id <id>] [--model <id>]
 *   [--yolo] <prompt>`. The prompt travels as the final argv element (no
 *   shell involved); the model travels only when pinned (never an empty
 *   `--model`); the session id pins multi-turn continuity for one KainBain
 *   session (survey q4).
 *
 *   UNVERIFIED — every flag name here is an assumption awaiting primary
 *   Codex CLI sources. This function is documentation-as-code for future
 *   enablement: it is validated by unit tests but NEVER executed on this
 *   device (the harness refuses before any spawn).
 * @example buildCodexSpawnPlan({ prompt: "hi", workspaceDir: "/w" }) => { command: "codex", args: [...] }
 * @param {Object} opts
 * @param {string} opts.prompt - The stage prompt text.
 * @param {string} opts.workspaceDir - Absolute project workspace root (pinned, required).
 * @param {string|null} [opts.modelId] - Model id pinned via --model (null = CLI default).
 * @param {string|null} [opts.sessionId] - Conversation id for continuity (null = fresh run).
 * @param {Object} [opts.settings] - Explicit settings ({ bin, yolo }); falls back to resolveCodexSettings.
 * @returns {{command: string, args: Array<string>, settings: Object}} The spawn plan.
 */
export function buildCodexSpawnPlan({
	prompt,
	workspaceDir,
	modelId = null,
	sessionId = null,
	settings = {},
}) {
	if (!workspaceDir || typeof workspaceDir !== "string") {
		throw new Error(
			"buildCodexSpawnPlan requires a workspaceDir (codex runs are pinned to the project workspace)",
		);
	}
	const resolved = resolveCodexSettings(settings);
	const args = ["exec", "--workspace", workspaceDir];
	if (sessionId) args.push("--session-id", String(sessionId));
	if (modelId) args.push("--model", String(modelId));
	// --yolo is the single sanctioned construction site: appended only from
	// the resolved setting — never from prompt text (muse parity).
	if (resolved.yolo) args.push("--yolo");
	args.push(String(prompt ?? ""));
	return { command: resolved.bin, args, settings: resolved };
}

/**
 * MARK: buildCodexChildEnv
 * @description Builds the child environment for a (future) codex spawn:
 *   a minimal allowlist projection with every secret-shaped name dropped
 *   (the shared scaffold's SECRET_NAME_PATTERN wins over the allowlist —
 *   note this also strips `OPENAI_API_KEY`, so it is forwarded explicitly
 *   below), plus pinned run-context vars.
 *
 *   `OPENAI_API_KEY` passthrough is deliberate and narrow: it forwards the
 *   OPERATOR's own variable (never stored or minted by KainBain) because
 *   Codex-native auth is either this key or the login cache under `HOME`
 *   (both kept working); every other secret-shaped name stays dropped.
 * @example buildCodexChildEnv({ PATH: "/bin", OPENAI_API_KEY: "k" }, {}) => { PATH: "/bin", OPENAI_API_KEY: "k", … }
 * @param {Object} [baseEnv] - The parent environment (defaults to process.env; inject for tests).
 * @param {Object} [opts]
 * @param {string} [opts.workspaceDir] - Project workspace root (pinned as PROJECT_CWD when present).
 * @param {string} [opts.taskId] - Stage task id (pinned as TASK_ID when present).
 * @returns {Object} The redacted child environment (a fresh object).
 */
export function buildCodexChildEnv(baseEnv = process.env, { workspaceDir = null, taskId = null } = {}) {
	const projected = buildChildEnv(baseEnv, {
		keepExact: [
			"PATH",
			"HOME",
			"USERPROFILE",
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
		],
		keepPrefixes: ["CODEX_"],
	});
	const extra = {};
	const apiKey = baseEnv?.OPENAI_API_KEY;
	if (typeof apiKey === "string" && apiKey) {
		// Explicit, documented passthrough (see above): the projection
		// dropped it as secret-shaped; the operator's own key is restored
		// so API-key auth keeps working alongside the login cache.
		extra.OPENAI_API_KEY = apiKey;
	}
	const childEnv = { ...projected, ...extra };
	// Run-context pinning (set only when known — never an `undefined` value).
	if (workspaceDir) childEnv.PROJECT_CWD = workspaceDir;
	if (taskId) childEnv.TASK_ID = taskId;
	return childEnv;
}

/**
 * MARK: codexArgvShape
 * @description Renders an argv array as its flag SHAPE for logs: flags and
 *   their option values are kept, but the prompt payload (any non-flag
 *   token — the final element in plans built above) is elided to a byte
 *   length so prompt text NEVER leaks into logs (muse parity).
 * @example codexArgvShape(["exec", "--workspace", "/w", "hello"]) => "exec --workspace /w <prompt:5B>"
 * @param {Array<string>} args - The argv array.
 * @returns {string} The flag shape string.
 */
export function codexArgvShape(args) {
	const shape = [];
	const list = Array.isArray(args) ? args : [];
	for (let i = 0; i < list.length; i += 1) {
		const token = list[i];
		if (token === "--prompt-file") {
			shape.push("--prompt-file", "<staged>");
			i += 1;
			continue;
		}
		if (token === "--workspace" || token === "--session-id" || token === "--model") {
			shape.push(token, list[i + 1] ?? "");
			i += 1;
			continue;
		}
		if (typeof token === "string" && token.startsWith("--")) {
			shape.push(token);
			continue;
		}
		shape.push(`<prompt:${Buffer.byteLength(String(token), "utf8")}B>`);
	}
	return shape.join(" ");
}
