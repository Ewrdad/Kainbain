import { config } from "./config.js";
import {
	harnessModelSelection,
	hasHarness,
	listHarnesses,
	normalizeHarnessRef,
} from "./agent/harnessRegistry.js";
import { selectAliasTarget } from "./aliasSelector.js";
import {
	ALIAS_HARNESS_ID,
	getAliasList,
	normalizeAliasName,
} from "../shared/modelAliases.js";

/***
 * MARK: stuckCheck
 * @description The task "is it stuck?" diagnosis: gathers the recent logs of a
 *   task's current stage, hands them to a one-shot, TOOLS-FREE model run of
 *   the user's choice (typically a smaller/faster model), and reports whether
 *   the execution looks stuck (looping, repeating identical calls, or making
 *   no progress). Strictly advisory — the check never takes actions, never
 *   mutates the task, and never touches the project's interactive session.
 *
 *   The diagnosis session comes from the harness's `createDiagnosisSession`
 *   (see `api/agent/harnesses/pi/piHarness.js`): no tools, no extensions, no
 *   project context files, throwaway temp-dir persistence, disposed after the
 *   run.
 ***/

/***
 * MARK: STUCK_VERDICTS
 * @description The canonical verdict values the parser and the API respond
 *   with. `unclear` covers both explicit uncertainty and unparsable answers —
 *   a chatty model can never crash the consumer.
 ***/
export const STUCK_VERDICTS = ["stuck", "not_stuck", "unclear"];

/***
 * MARK: STUCK_CHECK_SYSTEM_PROMPT
 * @description Fallback system prompt passed to the diagnosis session when the
 *   caller does not supply one. Mirrors the harness's DIAGNOSIS_SYSTEM_PROMPT
 *   so the checker stays self-describing in unit tests with fake harnesses.
 ***/
export const STUCK_CHECK_SYSTEM_PROMPT = [
	"You are a stuck-detection assistant for an automated task pipeline.",
	"You receive the recent logs of one task's current stage and decide whether the execution looks stuck",
	"(looping, repeating identical tool calls, retrying the same failing step, or making no progress).",
	"You are advisory ONLY: you never take actions and you have no tools.",
	"Answer EXACTLY in this format:",
	"VERDICT: STUCK | NOT_STUCK | UNCLEAR",
	"REASONING: one short paragraph citing concrete evidence from the logs (repeated identical commands, unchanged outputs, identical errors, elapsed-turn counts).",
].join("\n");

/***
 * MARK: tailLogText
 * @description Bounds a log payload to at most `maxChars` characters, keeping
 *   the TAIL: each stage run starts a fresh session, so the most recent
 *   entries are the current stage's logs. A truncation marker keeps the cut
 *   visible to the model instead of silently hiding the loss.
 * @example tailLogText('abcdef', 4) => '…cdef'
 * @param {string} text - The full feed text (may be empty).
 * @param {number} [maxChars] - Character budget.
 * @returns {string} The bounded text ("" when the feed is empty).
 ***/
export function tailLogText(text, maxChars = config.stuckCheckMaxLogChars) {
	if (!text || typeof text !== "string") return "";
	const budget = Math.max(1, maxChars);
	if (text.length <= budget) return text;
	const marker = "\n[... older log entries truncated for the stuck check ...]\n";
	const keep = Math.max(1, budget - marker.length);
	return marker + text.slice(text.length - keep);
}

/***
 * MARK: buildStuckCheckUserPrompt
 * @description Builds the one-shot user prompt for the stuck check: the task
 *   goal, the current stage, the bounded main-feed log tail and the tool-call
 *   feed tail, plus the explicit question and answer format. Pure — exported
 *   for unit tests.
 * @example buildStuckCheckUserPrompt({ goal: 'Fix tests', stageName: 'In Progress', mainLog: '...', toolsLog: '...' })
 * @param {Object} [opts]
 * @param {string} [opts.goal] - The task goal / title.
 * @param {string} [opts.stageName] - The current stage name.
 * @param {string} [opts.stageType] - The current stage type (agent/review/...).
 * @param {string} [opts.mainLog] - Bounded main-feed log text.
 * @param {string} [opts.toolsLog] - Bounded tools-feed log text.
 * @param {string} [opts.question] - Optional extra focus question from the user.
 * @param {number} [opts.maxChars] - Per-feed character budget.
 * @returns {string} The complete user prompt.
 ***/
export function buildStuckCheckUserPrompt({
	goal,
	stageName,
	stageType,
	mainLog,
	toolsLog,
	question,
	maxChars,
} = {}) {
	const budget = maxChars ?? config.stuckCheckMaxLogChars;
	const mainTail = tailLogText(mainLog, budget);
	const toolsTail = tailLogText(toolsLog, budget);
	const lines = [
		`Task goal: ${goal || "(unknown)"}`,
		`Current stage: ${stageName || "(unknown)"}${stageType ? ` (type: ${stageType})` : ""}`,
		"",
		"Recent stage logs (most recent last):",
		mainTail || "(no log entries recorded)",
	];
	if (toolsTail) {
		lines.push("", "Tool calls / results from this stage:", toolsTail);
	}
	lines.push(
		"",
		"Question: Based ONLY on the logs above, does this task's current stage execution look stuck (looping, repeating identical calls or errors, or making no progress)? Do not suggest or take any actions.",
	);
	if (question) {
		lines.push(`Additional focus from the user: ${question}`);
	}
	return lines.join("\n");
}

/***
 * MARK: parseStuckVerdict
 * @description Parses a diagnosis model answer into a canonical verdict plus a
 *   short summary. Looks for the `VERDICT:` line (case-insensitive, tolerant
 *   of `NOT STUCK` / `NOT-STUCK` spellings) and the `REASONING:` body;
 *   anything unparsable degrades to `unclear` with the raw answer as summary.
 * @example parseStuckVerdict('VERDICT: STUCK\\nREASONING: same error repeated 6x') => { verdict: 'stuck', summary: 'same error repeated 6x' }
 * @param {string} answer - The raw model answer.
 * @returns {{verdict: string, summary: string}} Canonical verdict + summary.
 ***/
export function parseStuckVerdict(answer) {
	const raw = typeof answer === "string" ? answer : "";
	if (!raw.trim()) {
		return { verdict: "unclear", summary: "The model returned an empty answer." };
	}

	const verdictMatch = raw.match(
		/^\s*(?:\*\*)?\s*VERDICT\s*(?:\*\*)?\s*[:\-–]\s*(.+)$/im,
	);
	let verdict = "unclear";
	if (verdictMatch) {
		// Strip markdown emphasis before classifying so "**VERDICT:** STUCK"
		// style answers still parse.
		const spoken = verdictMatch[1]
			.replace(/[*`]/g, "")
			.trim()
			.toUpperCase()
			.replace(/[^A-Z_]/g, "_");
		if (/^NOT_?STUCK/.test(spoken) || /^NO_?STUCK/.test(spoken)) {
			verdict = "not_stuck";
		} else if (/^STUCK/.test(spoken)) {
			verdict = "stuck";
		} else if (
			/UNCLEAR|UNKNOWN|UNSURE|CANNOT_DETERMINE|CAN_T_DETERMINE/.test(spoken)
		) {
			verdict = "unclear";
		}
	}

	const reasoningMatch = raw.match(
		/^\s*(?:\*\*)?\s*REASONING\s*(?:\*\*)?\s*[:\-–]\s*([\s\S]+)$/im,
	);
	// Strip markdown emphasis from the edges of the summary so bolded answers
	// render cleanly; emphasis inside the text is preserved.
	const summary = (reasoningMatch ? reasoningMatch[1] : raw)
		.replace(/^[\s*`]+|[\s*`]+$/g, "")
		.trim();
	return { verdict, summary };
}

/***
 * MARK: gatherStuckCheckLogs
 * @description Collects the bounded main-feed and tools-feed log tails for a
 *   task via the task log feed API (`taskStore.getTaskLogFeed`). Read-only.
 * @example gatherStuckCheckLogs({ taskStore, projectId, taskId, maxChars }) => { mainLog, toolsLog }
 * @param {Object} opts
 * @param {Object} opts.taskStore - The TaskStore instance.
 * @param {string} opts.projectId - The project id.
 * @param {string} opts.taskId - The task id.
 * @param {number} [opts.maxChars] - Per-feed character budget.
 * @returns {{mainLog: string, toolsLog: string}} The bounded feed texts.
 ***/
export function gatherStuckCheckLogs({
	taskStore,
	projectId,
	taskId,
	maxChars,
}) {
	const mainFeed = taskStore.getTaskLogFeed(projectId, taskId, {
		feed: "main",
		format: "text",
	});
	const toolsFeed = taskStore.getTaskLogFeed(projectId, taskId, {
		feed: "tools",
		format: "text",
	});
	return {
		mainLog: tailLogText(mainFeed?.text, maxChars),
		toolsLog: tailLogText(toolsFeed?.text, maxChars),
	};
}

/***
 * MARK: disposeSessionQuietly
 * @description Best-effort abort + dispose of a diagnosis session. Every error
 *   is swallowed — cleanup must never mask the check's own result or error.
 * @example await disposeSessionQuietly(session)
 * @param {Object} session - The diagnosis session (contract-wrapped).
 * @returns {Promise<void>}
 ***/
export async function disposeSessionQuietly(session) {
	try {
		if (typeof session?.abort === "function") await session.abort();
	} catch {
		// Ignore abort errors during cleanup.
	}
	try {
		session?.dispose?.();
	} catch {
		// Ignore dispose errors during cleanup.
	}
}

/***
 * MARK: runDiagnosisPrompt
 * @description Runs the one-shot diagnosis prompt on a tools-free session and
 *   returns the assistant's answer. Enforces `config.stuckCheckTimeoutMs` by
 *   racing the prompt against a timer that aborts the session; the session is
 *   disposed in every path.
 * @example await runDiagnosisPrompt({ session, prompt }) => 'VERDICT: ...'
 * @param {Object} opts
 * @param {Object} opts.session - The diagnosis session.
 * @param {string} opts.prompt - The user prompt.
 * @param {number} [opts.timeoutMs] - Wall-clock budget (defaults to config).
 * @returns {Promise<string>} The assistant answer ("" when none).
 ***/
export async function runDiagnosisPrompt({ session, prompt, timeoutMs } = {}) {
	const budget = timeoutMs ?? config.stuckCheckTimeoutMs;
	let timer = null;
	try {
		const answer = await Promise.race([
			Promise.resolve(session.prompt(prompt)).then(() => {
				try {
					const text = session.getLastAssistantText();
					return typeof text === "string" ? text : "";
				} catch {
					return "";
				}
			}),
			new Promise((_, reject) => {
				timer = setTimeout(
					() => reject(new Error("Stuck check timed out")),
					budget,
				);
			}),
		]);
		return answer;
	} finally {
		if (timer) clearTimeout(timer);
		await disposeSessionQuietly(session);
	}
}

/***
 * MARK: createStuckChecker
 * @description Builds the stuck-check runner bound to the process stores and
 *   the session store's harness. `checkStuck` is the single entry the route
 *   calls: it guards the task, resolves the requested model through the
 *   harness (`resolveModelRef`), gathers the log tails, runs the one-shot
 *   tools-free diagnosis and returns the canonical verdict. It NEVER mutates
 *   the task — no log entries, no status changes, no session swaps.
 * @example const stuckChecker = createStuckChecker({ sessionStore, taskStore, projectStore });
 * @example await stuckChecker.checkStuck({ projectId: 'p1', taskId: 't1', model: 'ollama-cloud::gpt-oss:20b-cloud', harness: 'pi' })
 * @param {Object} deps
 * @param {Object} deps.sessionStore - Provides `getHarness()` (model resolution + diagnosis sessions).
 * @param {Object} deps.taskStore - The TaskStore (read-only task + log feed access).
 * @param {Object} [deps.projectStore] - Optional; used for the project entity (cwd) lookup.
 * @param {Function} [deps.harnessOverride] - Test seam: replaces the sessionStore harness.
 * @returns {{checkStuck: Function}} The checker.
 ***/
export function createStuckChecker({
	sessionStore,
	taskStore,
	projectStore,
	harnessOverride,
} = {}) {
	return {
		/***
		 * MARK: stuckChecker.checkStuck
		 * @description Runs one stuck diagnosis for a task on the requested
		 *   harness (blank/missing `harness` resolves exactly as before — the
		 *   session store's single-harness default). An explicit alias choice
		 *   (`harness: "alias"` + `model: "<name>"`) runs the diagnosis on
		 *   the alias's current target (peek-only — the rotation is never
		 *   consumed); an unresolvable alias is a 400 naming the alias and
		 *   the project's available aliases. Throws a tagged
		 *   `StuckCheckError` (with `statusCode`) for caller-facing failures:
		 *   unknown task (404), unknown harness (400 naming the available
		 *   ids), unresolvable model (400), no harness available or a harness
		 *   without diagnosis support (503). A harness with
		 *   `modelSelection: 'none'` manages its own model, so model
		 *   resolution is skipped and the check runs model-free. Model/runtime
		 *   failures surface as thrown errors with a readable message; the
		 *   task itself is never modified.
		 * @example await checkStuck({ projectId, taskId, model, harness, question }) => { taskId, stage, model, verdict, summary, answer }
		 ***/
		async checkStuck(
			{ projectId, taskId, model: modelRef, harness: harnessName, question } = {},
		) {
			const task = taskStore.getTask(projectId, taskId);
			if (!task) {
				const err = new Error("Task not found");
				err.statusCode = 404;
				throw err;
			}

			const project = projectStore?.getProject?.(projectId) || { id: projectId };

			// Harness the diagnosis runs on: the caller's explicit choice, else
			// the store default (blank = behave exactly as before). An explicit
			// name that matches no registered harness is a client error — the
			// registry resolution below would otherwise warn-and-fallback and
			// run the diagnosis somewhere the user never asked for. Pinned
			// test seams (harnessOverride / a pinned sessionStore harness)
			// answer for every name, so they skip the registry check.
			const requested = normalizeHarnessRef(harnessName);
			const usingTestSeam = Boolean(harnessOverride) || Boolean(sessionStore?.harness);
			// An explicit alias choice (`harness: "alias"` + `model: "<name>"`,
			// as the panel sends when the virtual Alias row is picked) resolves
			// to its concrete target HERE — peek-only, so the advisory check
			// never consumes a weighted rotation step. An unresolvable alias
			// is a client error naming the alias and the project's aliases.
			let aliasPick = null;
			if (requested === ALIAS_HARNESS_ID && !usingTestSeam) {
				aliasPick = selectAliasTarget(project, modelRef, {
					isHarnessKnown: (name) => hasHarness(name),
					peek: true,
				});
				if (!aliasPick) {
					const available = getAliasList(project).map((a) => a.name);
					const err = new Error(
						`Unknown model alias '${normalizeAliasName(modelRef) || "(blank)"}' for the stuck check. Available: ${available.join(", ") || "(none)"}.`,
					);
					err.statusCode = 400;
					throw err;
				}
			}
			if (requested && !usingTestSeam && !hasHarness(requested) && !aliasPick) {
				const available = listHarnesses().map((e) => e.name);
				const err = new Error(
					`Unknown harness '${requested}' for the stuck check. Available: ${available.join(", ") || "(none)"}.`,
				);
				err.statusCode = 400;
				throw err;
			}
			// The alias's concrete target drives both halves of the diagnosis:
			// the harness the session runs on and the model it resolves.
			const effectiveHarness = aliasPick ? aliasPick.harness : requested;
			const effectiveModelRef = aliasPick ? aliasPick.model : modelRef;

			const harness =
				harnessOverride ||
				(typeof sessionStore?.getHarness === "function"
					// Peek-only: the advisory diagnosis must never consume a step
					// of a weighted project-default alias's rotation (that would
					// skew the stage-dispatch split).
					? sessionStore.getHarness(project, effectiveHarness || undefined, { peek: true })
					: null);
			if (!harness || typeof harness.createDiagnosisSession !== "function") {
				const err = new Error(
					effectiveHarness
						? `Harness '${effectiveHarness}' does not support the stuck check (no diagnosis session).`
						: "No agent harness available for the stuck check",
				);
				err.statusCode = 503;
				throw err;
			}

			// Resolve the user's model choice through the SAME resolution path
			// sessions use (availability snapshot, then full registry). An
			// unresolvable explicit choice is a client error, not a silent swap.
			// A `none` harness (e.g. custom bakes `--model` into its command)
			// owns its model: resolution is skipped and the check runs null.
			const modelSelection = harnessModelSelection(harness);
			let resolvedModel = null;
			if (modelSelection !== "none") {
				if (typeof harness.resolveModelRef === "function") {
					resolvedModel = await harness.resolveModelRef(effectiveModelRef);
				}
				if (!resolvedModel) {
					// An alias choice names the alias the user picked AND the
					// target model that failed, so the fix is obvious.
					const chosen = aliasPick
						? `'${effectiveModelRef}' (from alias '${aliasPick.aliasName}')`
						: `'${modelRef || "(none)"}'`;
					const err = new Error(
						`Model ${chosen} could not be resolved for the stuck check. Pick a model from the list.`,
					);
					err.statusCode = 400;
					throw err;
				}
			}

			const stages = Array.isArray(project?.stages) ? project.stages : [];
			const stage = stages.find(
				(s) => String(s.id) === String(task.currentStageId),
			) ||
				stages[0] || {
					name: task.currentStageId || "Current Stage",
					type: "agent",
				};

			const { mainLog, toolsLog } = gatherStuckCheckLogs({
				taskStore,
				projectId,
				taskId,
			});
			const prompt = buildStuckCheckUserPrompt({
				goal: task.goal || task.title,
				stageName: stage.name,
				stageType: stage.type,
				mainLog,
				toolsLog,
				question,
			});

			const session = await harness.createDiagnosisSession(project, {
				model: resolvedModel,
				systemPrompt: STUCK_CHECK_SYSTEM_PROMPT,
			});

			let answer = "";
			try {
				answer = await runDiagnosisPrompt({ session, prompt });
			} catch (e) {
				const err = new Error(`Stuck check failed: ${e?.message || e}`);
				err.statusCode = 502;
				throw err;
			}

			const { verdict, summary } = parseStuckVerdict(answer);
			return {
				taskId: task.id,
				stage: {
					id: stage.id || task.currentStageId,
					name: stage.name,
					type: stage.type,
				},
				// Null on `none` harnesses (the harness owns its model); the
				// panel renders the model line only when present.
				model: resolvedModel
					? {
							key: resolvedModel.key || `${resolvedModel.provider}::${resolvedModel.id}`,
							id: resolvedModel.id,
							name: resolvedModel.name || resolvedModel.id,
							provider: resolvedModel.provider,
						}
					: null,
				verdict,
				summary,
				answer,
			};
		},
	};
}
