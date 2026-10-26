import {
	startSupervisedSpawn,
	withRunContextVars,
} from "../shared/harnessScaffold.js";
import { eventBridge as sharedEventBridge } from "../../../eventBridge.js";

/***
 * MARK: HARNESS_ID
 * @description The stable id of the custom-command harness. Projects select it
 *   via `project.harness = "custom"` together with a free-text command line in
 *   `project.harnessCommand` (e.g. `claude -p` or `muse exec --yolo`).
 * @example HARNESS_ID // => "custom"
 ***/
export const HARNESS_ID = "custom";

/** Shell metacharacters that make a command line unsuitable for shell-less
 *  argv spawning (the prompt must never pass through a shell interpreter). */
const SHELL_METACHARACTERS = new Set([
	"|",
	";",
	"&",
	">",
	"<",
	"(",
	")",
	"$",
	"`",
]);

/***
 * MARK: CustomCommandError
 * @description Error thrown for unusable custom command lines (empty command,
 *   unterminated quotes, shell metacharacters). The message is written for the
 *   project owner: it names the problem and how to fix the stored command.
 ***/
export class CustomCommandError extends Error {}

/***
 * MARK: tokenizeCustomCommandLine
 * @description Tokenizes a free-text command line into argv the way a shell
 *   would split it (without expanding anything): whitespace separates tokens,
 *   single quotes protect everything literally, double quotes protect
 *   everything except backslash escapes, and a backslash outside quotes
 *   escapes the next character. Shell operators (`|`, `;`, `&`, redirection,
 *   `$`, backtick, parens) OUTSIDE quotes throw a CustomCommandError —
 *   commands spawn without a shell, so operator syntax would either break or
 *   smuggle the prompt through a shell.
 * @example tokenizeCustomCommandLine('claude -p') => ["claude", "-p"]
 * @example tokenizeCustomCommandLine('muse exec "--model fast"') => ["muse", "exec", "--model fast"]
 * @example tokenizeCustomCommandLine('claude | tee log') // throws CustomCommandError
 * @param {string} line - The user-configured command line.
 * @returns {Array<string>} The argv tokens.
 * @throws {CustomCommandError} Empty line, unterminated quote, or shell operators.
 ***/
export function tokenizeCustomCommandLine(line) {
	if (typeof line !== "string" || !line.trim()) {
		throw new CustomCommandError(
			"Custom harness command is empty. Set a command line (e.g. `claude -p`) in Project Settings.",
		);
	}

	const tokens = [];
	let current = "";
	let hasToken = false;
	let quote = null; // "'" or '"' while inside a quoted run

	const flushToken = () => {
		if (hasToken) {
			tokens.push(current);
			current = "";
			hasToken = false;
		}
	};

	for (let i = 0; i < line.length; i++) {
		const ch = line[i];

		if (quote) {
			if (ch === quote) {
				quote = null;
				continue;
			}
			// Inside double quotes a backslash escapes the next character
			// (shell semantics); inside single quotes it is literal.
			if (quote === '"' && ch === "\\" && line[i + 1] !== undefined) {
				current += line[i + 1];
				i += 1;
				continue;
			}
			current += ch;
			continue;
		}

		if (ch === "'" || ch === '"') {
			quote = ch;
			hasToken = true;
			continue;
		}
		if (SHELL_METACHARACTERS.has(ch)) {
			throw new CustomCommandError(
				`Custom harness commands run without a shell, so shell operators like "${ch}" are not supported (use quotes for arguments or a wrapper script instead): "${line.trim()}"`,
			);
		}
		if (ch === "\\") {
			if (line[i + 1] !== undefined) {
				current += line[i + 1];
				i += 1;
				hasToken = true;
			}
			continue;
		}
		if (/\s/.test(ch)) {
			flushToken();
			continue;
		}
		current += ch;
		hasToken = true;
	}

	if (quote) {
		throw new CustomCommandError(
			`Custom harness command has an unterminated ${quote === "'" ? "single" : "double"} quote: "${line.trim()}"`,
		);
	}
	flushToken();
	return tokens;
}

/***
 * MARK: buildCustomSpawnPlan
 * @description Turns a custom command line plus the curated prompt into a
 *   spawn plan: leading `VAR=value` tokens become environment assignments,
 *   the first remaining token is the executable, every other token is an
 *   argument, and the curated prompt is APPENDED as the final argument —
 *   `claude -p` becomes `spawn("claude", ["-p", prompt])` with no shell in
 *   between, so the prompt's quotes and newlines travel verbatim. Model
 *   selection (e.g. `--model <id>`) is baked into the command line itself —
 *   the harness never inserts model flags; whatever the user configured is
 *   exactly what spawns, with the prompt appended last.
 * @example buildCustomSpawnPlan('claude -p', 'Fix the bug') => { env: {}, command: 'claude', args: ['-p', 'Fix the bug'] }
 * @example buildCustomSpawnPlan('LOG=debug muse exec --yolo', 'p') => { env: { LOG: 'debug' }, command: 'muse', args: ['exec', '--yolo', 'p'] }
 * @example buildCustomSpawnPlan('claude --model sonnet -p', 'p') => { env: {}, command: 'claude', args: ['--model', 'sonnet', '-p', 'p'] }
 * @param {string} line - The user-configured command line.
 * @param {string} prompt - The curated prompt appended as the final argument.
 * @returns {{env: Object, command: string, args: Array<string>}} The spawn plan.
 * @throws {CustomCommandError} Unusable command line (see tokenizeCustomCommandLine).
 ***/
export function buildCustomSpawnPlan(line, prompt) {
	const tokens = tokenizeCustomCommandLine(line);

	const env = {};
	let cursor = 0;
	// Leading NAME=value tokens are environment assignments (e.g. API keys for
	// the CLI); anything after the first non-assignment token is the command.
	while (
		cursor < tokens.length &&
		/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[cursor])
	) {
		const assignment = tokens[cursor];
		const eq = assignment.indexOf("=");
		const varName = assignment.slice(0, eq);
		env[varName] = assignment.slice(eq + 1);
		cursor += 1;
	}
	if (cursor >= tokens.length) {
		throw new CustomCommandError(
			tokens.length === 0
				? "Custom harness command is empty. Set a command line (e.g. `claude -p`) in Project Settings."
				: `Custom harness command has no command after its environment assignments: "${line.trim()}"`,
		);
	}
	return {
		env,
		command: tokens[cursor],
		args: [...tokens.slice(cursor + 1), prompt],
	};
}

/***
 * MARK: customChildEnv
 * @description Builds the child process environment: the API server's own
 *   environment passes through wholesale (a user-configured command needs
 *   its credentials and config, the same way the deploy manager's script
 *   does — allowlist redaction would break CLI auth, so the custom harness
 *   deliberately does NOT redact), plus the run context variables the CI
 *   stage engine also provides (pinned by the shared scaffold).
 * @example customChildEnv('/repo', 'task-1').PROJECT_CWD // => '/repo'
 * @param {string} cwd - The working directory the command runs in.
 * @param {string} [taskId] - Task id of the running stage (omitted for interactive chats).
 * @returns {Object} The child environment.
 ***/
function customChildEnv(cwd, taskId) {
	return withRunContextVars(process.env, { cwd, taskId });
}

/***
 * MARK: createCustomSession
 * @description Builds ONE HarnessSession bound to a project's custom command.
 *   Every `prompt(text)` runs the configured command with the text appended as
 *   the final argument and streams the child's stdout as the assistant reply.
 *   The command line is read from the project at session creation, so a
 *   harness change or command edit applies on the next stage session.
 * @example const session = await harness.createSession(project, { taskId, stageId });
 * @param {Object} project - The project entity (id, cwd, harnessCommand).
 * @param {Object} [opts]
 * @param {string} [opts.taskId] - Task id of the stage run (context variable + logging only).
 * @param {string} [opts.stageId] - Stage id of the stage run (label only).
 * @param {Object} [opts.eventBridge] - Bridge used to surface stderr lines (defaults to the shared bridge).
 * @returns {Object} A contract-conforming session (no model/tree capabilities).
 ***/
export function createCustomSession(
	project,
	{ taskId, stageId, eventBridge } = {},
) {
	const bridge = eventBridge || sharedEventBridge;
	const commandLine =
		typeof project?.harnessCommand === "string" ? project.harnessCommand : "";
	const workDir = project?.cwd;
	const runLabel = `${stageId || "adhoc"}:${taskId || "chat"}`;

	const messages = [];
	const handlers = new Set();
	let stdoutText = "";
	let stderrText = "";
	let child = null;
	let runSup = null;
	let disposed = false;

	const deliver = (event) => {
		for (const handler of [...handlers]) {
			try {
				handler(event);
			} catch {
				// A failing subscriber must not break the run.
			}
		}
	};

	const emitSystemLog = (text) => {
		if (!text) return;
		bridge?.emitSystemLog?.(project?.id, text);
	};

	const session = {
		harnessId: HARNESS_ID,

		get isStreaming() {
			return Boolean(child);
		},

		get messages() {
			return messages;
		},

		getMessages: () => messages,

		getLastAssistantText: () => {
			// The child's stdout IS the assistant reply; a stage that produced no
			// stdout still reports a completed run (same fallback as pi/mock).
			return stdoutText.trim() ? stdoutText : "Stage execution completed";
		},

		subscribe(handler) {
			handlers.add(handler);
			return () => handlers.delete(handler);
		},

		/***
		 * MARK: prompt
		 * @description Runs the configured command once with `text` appended as
		 *   the final argument — whatever model flags the command needs are
		 *   baked into the command line itself. Stdout streams as assistant
		 *   deltas; stderr lines surface on the activity console through the
		 *   event bridge; a non-zero exit rejects with the captured stderr so
		 *   the stage fails with the CLI's own diagnosis instead of a bare
		 *   exit code.
		 ***/
		prompt(text, { onChunk } = {}) {
			if (disposed) {
				return Promise.reject(new Error("Session is disposed"));
			}
			if (typeof text !== "string" || !text.trim()) {
				return Promise.reject(
					new Error("Custom harness prompt must be a non-empty string"),
				);
			}

			let plan;
			try {
				plan = buildCustomSpawnPlan(commandLine, text);
			} catch (err) {
				return Promise.reject(err);
			}

			messages.push({ role: "user", content: text });
			deliver({ type: "run_started" });
			emitSystemLog(
				`[AGENT] Custom harness running: ${plan.command} ${plan.args.slice(0, -1).join(" ")} "<curated prompt>" (${runLabel})`,
			);

			return new Promise((resolve, reject) => {
				let settled = false;
				const finish = (settle) => {
					if (settled) return;
					settled = true;
					child = null;
					runSup = null;
					settle();
				};

				let spawned;
				try {
					// command + cwd come from trusted project configuration
					// (project.harnessCommand / project.cwd), never from request input.
					// Spawn mechanics (options, detached process group, timer
					// cleanup) are owned by the shared scaffold; the run-outcome
					// handlers below stay here (protocol mapping).
					const sup = startSupervisedSpawn(plan.command, plan.args, {
						cwd: workDir,
						// plan.env holds the leading VAR=value assignments parsed from the
						// command line (e.g. CLI credentials); they must reach the child.
						env: { ...customChildEnv(workDir, taskId), ...plan.env },
						// stdin closed: the prompt travels as an argument, and CLI
						// harnesses waiting on stdin see EOF immediately.
						stdio: ["ignore", "pipe", "pipe"],
						// Own process group so abort() can kill the whole tree.
						detached: true,
					});
					runSup = sup;
					spawned = sup.child;
				} catch (spawnErr) {
					deliver({ type: "run_error", error: spawnErr });
					finish(() => reject(spawnErr));
					return;
				}
				child = spawned;

				spawned.stdout?.on("data", (data) => {
					const chunk = data.toString();
					stdoutText += chunk;
					deliver({ type: "assistant_delta", delta: chunk });
					onChunk?.(chunk);
				});
				spawned.stderr?.on("data", (data) => {
					const chunk = data.toString();
					stderrText += chunk;
					emitSystemLog(`[custom:stderr] ${chunk.trimEnd()}`);
					// Stderr also joins the structured task log (one system
					// record per line) so diagnostics survive in the UI; the
					// process-log line above stays for compatibility.
					for (const line of chunk.split("\n")) {
						if (!line.trim()) continue;
						deliver({
							type: "harness_log",
							text: `[custom:stderr] ${line}`,
							tag: "[custom:stderr]",
						});
					}
				});

				spawned.on("error", (err) => {
					deliver({ type: "run_error", error: err });
					finish(() =>
						reject(
							new Error(
								`Custom harness command could not be started (${plan.command}): ${err.message}`,
							),
						),
					);
				});

				spawned.on("close", (code) => {
					child = null;
					runSup?.dispose();
					runSup = null;
					const reply = stdoutText.trim() ? stdoutText : "Stage execution completed";
					messages.push({ role: "assistant", content: reply });
					// The exit code joins the structured task log as one system
					// record (mirrors the CLI experience: every run ends with a
					// visible status line); the exit code also rides the terminal
					// event payload for structured consumers.
					deliver({
						type: "harness_log",
						text: `[custom] process exited with code ${code ?? "unknown"}`,
						tag: "[custom]",
					});
					if (code === 0) {
						deliver({ type: "run_finished", exitCode: code });
						finish(() => resolve(stdoutText));
						return;
					}
					const stderrTail = stderrText.trim().slice(-2000);
					const failure = new Error(
						`Custom harness command '${plan.command}' exited with code ${code}` +
							(stderrTail ? `: ${stderrTail}` : ""),
					);
					deliver({ type: "run_error", error: failure, exitCode: code });
					finish(() => reject(failure));
				});
			});
		},

		/***
		 * MARK: abort
		 * @description Kills the running child's whole process group (SIGTERM);
		 *   resolves immediately when nothing is running. Idempotent.
		 ***/
		async abort() {
			// Whole-tree SIGTERM through the supervised handle (the child was
			// spawned detached; group-kill with a handle fallback). Single
			// SIGTERM, no escalation — the harness's original abort semantics.
			// Idempotent: resolves immediately when nothing is running.
			runSup?.kill("SIGTERM", { escalate: false });
			return { status: "aborted" };
		},

		async dispose() {
			disposed = true;
			await session.abort();
			handlers.clear();
		},
	};

	return session;
}

/***
 * MARK: createCustomHarness
 * @description Builds the custom-command AgentHarness: one contract-conforming
 *   session per createSession call, bound to the project's free-text command
 *   line (`project.harnessCommand`). The harness owns no model registry and no
 *   persisted history — it takes NO model selection at all (model flags such
 *   as `--model <id>` are baked into the command line itself), model routes
 *   serve an empty list for it, and each stage session's only context is the
 *   prompt handed to it.
 * @example createCustomHarness().createSession(project, { taskId, stageId }) => session
 * @param {Object} [opts]
 * @param {Object} [opts.eventBridge] - Bridge for stderr/system lines (defaults to the shared bridge).
 * @returns {Object} The AgentHarness (id/name/label + the contract surface).
 ***/
export function createCustomHarness({ eventBridge } = {}) {
	return {
		id: HARNESS_ID,
		name: HARNESS_ID,
		label: "Custom command",

		/***
		 * MARK: modelSelection
		 * @description No model selection (`"none"`): the UI hides the model
		 *   control for this harness — model choice lives inside the command
		 *   line the user configured.
		 ***/
		modelSelection: "none",
		reasoningLevels: null,

		/***
		 * MARK: createSession
		 * @description Creates a FRESH custom session per call (one session per
		 *   stage; interactive callers get their own), reading the command line
		 *   from the project at creation time. A dispatch-resolved `model`
		 *   (target hand-off) is accepted and ignored — this harness manages
		 *   its own model via the command line (dispatch already logged the
		 *   ignore line).
		 ***/
		async createSession(project, { taskId, stageId, model } = {}) {
			void model;
			return createCustomSession(project, { taskId, stageId, eventBridge });
		},

		/***
		 * MARK: listModels
		 * @description Reports NO models: a free-text command has no model
		 *   registry. Model routes serve an empty list for this harness (never
		 *   the curated fallback — those models cannot run here), and the UI
		 *   hides model selection from `modelSelection`.
		 ***/
		async listModels() {
			return [];
		},

		/***
		 * MARK: resolveModelRef
		 * @description Resolves nothing: there is no model registry behind a
		 *   custom command. Always null (callers treat null as unresolvable,
		 *   and the agent runner visibly warns when a stage asks this harness
		 *   to switch models).
		 ***/
		async resolveModelRef() {
			return null;
		},

		/***
		 * MARK: readHistoryFromDisk
		 * @description The custom harness persists nothing on disk: sessions are
		 *   one-shot per stage (the run's only context is its curated prompt),
		 *   so persisted history is always empty.
		 ***/
		async readHistoryFromDisk() {
			return { messages: [], tree: [] };
		},
	};
}
