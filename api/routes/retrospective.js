/***
 * MARK: retrospectiveRoutes
 * @description Cross-task retrospective chat API: a stateless single-turn
 *   endpoint (`POST /retrospective/chat`) that folds the frontend-held
 *   transcript plus selected-task context into ONE prompt text and runs it
 *   through an ephemeral harness session (registry-resolved, never a task's
 *   live session, never persisted into task logs). Ticket suggestions come
 *   back as structured drafts — the endpoint NEVER creates tasks; the user's
 *   Confirm click calls `POST /tasks`. A bounded `output` tail of the
 *   assistant text observed during the turn rides along on success and on
 *   504/502 failures (when non-empty) so the UI can show partial progress.
 *
 *   Degradation policy: a session lacking the `prompt` member gets the
 *   standard `501 { code: "unsupported_by_harness" }` via
 *   `guardSessionCapability` (see api/crew/sessionCapabilities.js); unknown
 *   task ids surface as `404 { code: "task_not_found" }`.
 * @example app.register(retrospectiveRoutes, { deps })
 ***/

import {
	harnessModelSelection,
	resolveHarnessForProject as registryResolveHarness,
} from "../agent/harnessRegistry.js";
import { resolveStageTarget } from "../agentRunner.js";
import { toTaskSummary } from "../work/taskIdentity.js";
import { taskStageDurationSamples } from "../taskDurationSummary.js";
import {
	runChatTurn,
	truncateOutputTail,
	CHAT_OUTPUT_TAIL_MAX_CHARS,
} from "./retrospectiveChat.js";
import { config as appConfig } from "../config.js";
import { buildSkillsPromptSections } from "../skills/skillInjection.js";

/** Minimum gap between CHAT_PROGRESS broadcasts for one turn (WS chatter guard). */
export const CHAT_PROGRESS_BROADCAST_MIN_INTERVAL_MS = 500;

/***
 * MARK: RETROSPECTIVE_SESSION_META
 * @description Marker ids forcing a FRESH ephemeral session: without
 *   taskId/stageId the pi harness would RESUME the latest persisted (live)
 *   session from disk. These markers keep chat turns off live history.
 ***/
export const RETROSPECTIVE_SESSION_META = Object.freeze({
	taskId: "retrospective",
	stageId: "chat",
});

/** Maximum tasks injectable as context on one turn. */
export const MAX_CHAT_TASK_IDS = 10;

/** Character ceiling for the serialized task-context block. */
export const MAX_CHAT_CONTEXT_CHARS = 12000;

/** History entries kept per task inside the context block (newest first). */
export const MAX_HISTORY_ENTRIES_PER_TASK = 10;

/** Chat input caps */
export const MAX_CHAT_MESSAGES = 50;
export const MAX_CHAT_MESSAGE_CHARS = 8000;
export const MAX_CHAT_TRANSCRIPT_CHARS = 40000;

/***
 * MARK: contextMetaForTasks
 * @description Serializes selected tasks into a bounded context block for
 *   the chat prompt: summary fields (id, title, status, stage, failure
 *   evidence), per-stage duration samples, report stage metadata, and the
 *   newest history entries. Truncates the oldest tasks first when the block
 *   exceeds `MAX_CHAT_CONTEXT_CHARS` and says so in the prompt.
 * @example contextMetaForTasks([{ id: 't1', ... }], { resolveStages: () => [] }) => { block, truncated, contextTaskIds, chars }
 * @param {Array<Object>} tasks - Full task records (already validated present).
 * @param {Object} [opts]
 * @param {Function} [opts.resolveStages] - `(task) => stages[]` for duration samples.
 * @returns {{ block: string, truncated: boolean, contextTaskIds: string[], chars: number }}
 ***/
export function contextMetaForTasks(tasks, { resolveStages = () => [] } = {}) {
	const list = Array.isArray(tasks) ? tasks : [];
	if (list.length === 0) {
		return { block: "", truncated: false, contextTaskIds: [], chars: 0 };
	}
	const chunks = [];
	for (const task of list) {
		const summary = toTaskSummary(task);
		const stages = resolveStages(task) || [];
		const samples = taskStageDurationSamples(task, stages);
		const activeSeconds = samples.reduce(
			(total, sample) =>
				total +
				(Array.isArray(sample.seconds)
					? sample.seconds.reduce((sum, s) => sum + (Number(s) || 0), 0)
					: 0),
			0,
		);
		const history = Array.isArray(task.history) ? task.history : [];
		const recentHistory = history
			.slice(-MAX_HISTORY_ENTRIES_PER_TASK)
			.map((entry) => {
				if (!entry || typeof entry !== "object") return null;
				const parts = [
					entry.stage ? `stage=${entry.stage}` : null,
					entry.status ? `status=${entry.status}` : null,
					entry.timestamp ? `at=${entry.timestamp}` : null,
				].filter(Boolean);
				return parts.length > 0 ? `- ${parts.join(" ")}` : null;
			})
			.filter(Boolean);
		const lines = [
			`## Task ${summary.id || task.id || "unknown"}: ${summary.title || "Untitled task"}`,
			`status=${summary.status || "unknown"} stage=${summary.stage || summary.stageId || "unknown"} workflow=${summary.workflowId || summary.workflow || "unknown"}`,
		];
		// Context enrichment: goal snippet (first ~500 chars)
		if (task.goal && typeof task.goal === "string" && task.goal.trim()) {
			const goalExcerpt = task.goal.trim().slice(0, 500);
			lines.push(`goal=${goalExcerpt}${task.goal.trim().length > 500 ? "…" : ""}`);
		}
		if (summary.failureReason) lines.push(`failureReason=${summary.failureReason}`);
		if (summary.lastError?.message) {
			const firstLine = String(summary.lastError.message).split("\n")[0].trim();
			lines.push(`lastError=${firstLine}`);
		}
		if (samples.length > 0) {
			lines.push(
				`stageDurations: ${samples
					.map(
						(sample) =>
							`${sample.stageName || sample.stageId}=[${(sample.seconds || []).join(",")}]s`,
					)
					.join("; ")} (active total ${Math.round(activeSeconds)}s)`,
			);
		}
		// Context enrichment: report stage metadata (names/statuses)
		const reports = Array.isArray(task.reports) ? task.reports : [];
		if (reports.length > 0) {
			const reportMeta = reports
				.filter(Boolean)
				.map((r) => {
					const name = r.stageName || r.stageId || r.name || "stage";
					const st = r.status || "unknown";
					return `${name}=${st}`;
				})
				.join(",");
			if (reportMeta) lines.push(`reports: ${reportMeta}`);
		}
		if (recentHistory.length > 0) {
			lines.push("recent history (newest last):", ...recentHistory);
		}
		chunks.push({ taskId: summary.id || task.id, text: lines.join("\n") });
	}

	let truncated = false;
	let kept = chunks;
	let block = kept.map((c) => c.text).join("\n\n");
	while (kept.length > 1 && block.length > MAX_CHAT_CONTEXT_CHARS) {
		kept = kept.slice(1);
		truncated = true;
		block = kept.map((c) => c.text).join("\n\n");
	}
	if (block.length > MAX_CHAT_CONTEXT_CHARS) {
		block = `${block.slice(0, MAX_CHAT_CONTEXT_CHARS)}\n[…truncated…]`;
		truncated = true;
	}
	return {
		block,
		truncated,
		contextTaskIds: kept.map((c) => c.taskId).filter(Boolean),
		chars: block.length,
	};
}

/***
 * MARK: buildTaskContextBlock
 * @description Serializes selected tasks into a bounded context block for
 *   the chat prompt. Keeps the classic { block, truncated } signature for callers.
 ***/
export function buildTaskContextBlock(tasks, opts = {}) {
	const { block, truncated } = contextMetaForTasks(tasks, opts);
	return { block, truncated };
}

/***
 * MARK: parseTicketSuggestions
 * @description Extracts ticket drafts from a model reply: the model is
 *   instructed to emit fenced ```json `[{title, goal}]`; parsing is
 *   defensive — unparseable or malformed replies yield `[]` with the raw
 *   reply left intact for the user to read.
 * @example parseTicketSuggestions('…```json\n[{"title":"T","goal":"G"}]\n```') => [{ title: 'T', goal: 'G' }]
 * @param {string} reply - The assistant reply text.
 * @returns {Array<{title: string, goal: string}>} Clean drafts only.
 ***/
export function parseTicketSuggestions(reply) {
	if (typeof reply !== "string" || !reply) return [];
	const fences = [...reply.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
	const candidates = fences.map((match) => match[1].trim());
	candidates.push(reply.trim());
	for (const candidate of candidates) {
		const start = candidate.indexOf("[");
		const end = candidate.lastIndexOf("]");
		if (start === -1 || end === -1 || end <= start) continue;
		try {
			const parsed = JSON.parse(candidate.slice(start, end + 1));
			if (!Array.isArray(parsed)) continue;
			const drafts = [];
			for (const draft of parsed) {
				if (!draft || typeof draft !== "object") continue;
				const title = typeof draft.title === "string" ? draft.title.trim() : "";
				const goal = typeof draft.goal === "string" ? draft.goal.trim() : "";
				if (!title || !goal) continue;
				drafts.push({ title, goal });
			}
			if (drafts.length > 0) return drafts;
		} catch {
			// Try the next candidate; unparseable replies degrade to [].
		}
	}
	return [];
}

/***
 * MARK: buildChatPrompt
 * @description Folds system instructions, skill sections, the task-context block,
 *   and the frontend-held transcript into the single prompt text for the turn.
 * @example buildChatPrompt({ messages: [{ role: 'user', content: 'hi' }], contextBlock: '' }) => '…'
 * @param {Object} args
 * @param {Array<{role: string, content: string}>} args.messages - Transcript, oldest first.
 * @param {string} [args.contextBlock] - Serialized task context (may be empty).
 * @param {boolean} [args.contextTruncated] - Whether the block was truncated.
 * @param {Array<string>} [args.skillSections=[]] - Pre-rendered skill markdown sections.
 * @param {string} [args.projectId] - Current project id, surfaced in
 *   empty-selection turns so the model can scope its own recent-task lookups.
 * @returns {string} The full prompt text.
 ***/
export function buildChatPrompt({
	messages,
	contextBlock = "",
	contextTruncated = false,
	skillSections = [],
	projectId = null,
}) {
	const transcript = (Array.isArray(messages) ? messages : [])
		.map((message) => {
			const role = message?.role === "assistant" ? "Assistant" : "User";
			return `${role}: ${message?.content || ""}`;
		})
		.join("\n\n");
	const contextSection =
		contextBlock && contextBlock.trim()
			? [
					"Selected task context (read-only summaries; newest task last):",
					contextBlock,
					contextTruncated
						? "(Note: the oldest tasks were dropped to fit the context budget.)"
						: null,
				]
					.filter(Boolean)
					.join("\n")
			: [
					"No tasks selected: no task-context block was injected. For overview or",
					"general-trend questions, inspect recent tasks yourself using the task",
					"API/tooling described by the retrospective-task-lookup skill (start with",
					"GET /tasks?projectId=<projectId>, bounded to recent rows), then cite",
					"every task id you touch. Say 'not in the provided context' if listing is",
					"unavailable.",
					typeof projectId === "string" && projectId.trim()
						? `Project id for API lookups: ${projectId.trim()}.`
						: null,
				]
					.filter(Boolean)
					.join("\n");

	const validSkillSections = Array.isArray(skillSections)
		? skillSections.filter((s) => typeof s === "string" && s.trim().length > 0)
		: [];

	const parts = [
		"You are a retrospective assistant for an automated task pipeline. Help the user review recent tasks, find failure and efficiency patterns, and suggest improvements.",
		"When you propose follow-up work, also emit ticket drafts as ONE fenced ```json block containing a JSON array of {title, goal} objects (title: short imperative summary, goal: one-paragraph actionable description). Emit the block only when you genuinely propose new work; otherwise omit it.",
		"Never claim to have created, filed, or run anything — you only suggest; the user confirms.",
	];

	if (validSkillSections.length > 0) {
		parts.push("", ...validSkillSections);
	}

	parts.push("", contextSection, "", "Conversation:", transcript);

	return parts.join("\n");
}

/***
 * MARK: resolveChatReplyText
 * @description Normalizes the harness `prompt()` result to reply text: a
 *   string result wins, otherwise the session's last assistant text, else an
 *   empty string (the turn still reports success with no suggestions).
 * @example resolveChatReplyText(session, 'hi') => 'hi'
 * @param {Object} session - The ephemeral harness session.
 * @param {unknown} result - The `prompt()` resolution value.
 * @returns {Promise<string>} The reply text.
 ***/
export async function resolveChatReplyText(session, result) {
	if (typeof result === "string") return result;
	try {
		if (session && typeof session.getLastAssistantText === "function") {
			const text = await session.getLastAssistantText();
			if (typeof text === "string" && text) return text;
		}
	} catch {
		// Fall through to the empty reply.
	}
	return "";
}

const chatBodySchema = {
	type: "object",
	properties: {
		projectId: { type: "string" },
		messages: {
			type: "array",
			minItems: 1,
			maxItems: MAX_CHAT_MESSAGES,
			items: {
				type: "object",
				required: ["content"],
				properties: {
					role: { type: "string" },
					content: { type: "string", maxLength: MAX_CHAT_MESSAGE_CHARS },
				},
			},
		},
		taskIds: { type: "array", maxItems: MAX_CHAT_TASK_IDS, items: { type: "string" } },
		harness: { type: "string" },
		model: { type: "string" },
		strictTaskIds: { type: "boolean" },
		turnId: { type: "string" },
	},
};

const chatResponseSchema = {
	type: "object",
	properties: {
		reply: { type: "string" },
		suggestions: {
			type: "array",
			items: {
				type: "object",
				properties: {
					title: { type: "string" },
					goal: { type: "string" },
				},
			},
		},
		harness: { type: "string" },
		model: {},
		modelRequested: { type: "boolean" },
		unknownTaskIds: { type: "array", items: { type: "string" } },
		contextTaskIds: { type: "array", items: { type: "string" } },
		contextTruncated: { type: "boolean" },
		contextChars: { type: "number" },
		output: { type: "string" },
	},
};

export default async function retrospectiveRoutes(app, { deps }) {
	const {
		projectStore,
		taskStore,
		workflowRegistry,
		resolveAndGuardProject,
		guardSessionCapability,
		resolveHarness = registryResolveHarness,
		skillsRegistry,
		loadSkill: loadSkillOverride,
		promptTimeoutMs: promptTimeoutMsOverride,
		eventBridge,
	} = deps;

	function resolveStagesForTask(project, task) {
		try {
			const workflows = project?.workflows || workflowRegistry?.list?.() || [];
			const match = Array.isArray(workflows)
				? workflows.find((workflow) => workflow?.id === task?.workflowId)
				: null;
			return match?.stages || project?.stages || [];
		} catch {
			return [];
		}
	}

	/***
	 * MARK: Post Retrospective Chat
	 * @description Runs one stateless retrospective chat turn through an
	 *   ephemeral harness session. Request
	 *   `{ projectId?, messages: [{role, content}], taskIds?, harness?, model?, strictTaskIds?, turnId? }`;
	 *   response `{ reply, suggestions: [{title, goal}], harness, model, modelRequested, unknownTaskIds, contextTaskIds, contextTruncated, contextChars }`.
	 *   When the client sends a `turnId`, the turn's streamed assistant
	 *   deltas are also broadcast live as `CHAT_PROGRESS` WebSocket frames
	 *   (`{ turnId, tail }`, throttled) so the chat's working card can scroll
	 *   real output; the HTTP settle stays the done signal (no CHAT_DONE).
	 * @example POST /retrospective/chat { messages: [{ role: 'user', content: 'Any trends?' }] }
	 ***/
	app.post(
		"/retrospective/chat",
		{ schema: { body: chatBodySchema, response: { 200: chatResponseSchema } } },
		async (request, reply) => {
			const body = request.body || {};
			const projectId = resolveAndGuardProject(body.projectId, reply);
			if (!projectId) return;
			const project = projectStore.getProject(projectId);
			if (!project) {
				reply.status(404).send({ error: "Project not found" });
				return;
			}

			const messages = Array.isArray(body.messages) ? body.messages : [];
			if (messages.length > MAX_CHAT_MESSAGES) {
				reply.status(400).send({
					error: `messages array exceeds maximum limit of ${MAX_CHAT_MESSAGES}`,
					code: "chat_input_too_large",
				});
				return;
			}

			let transcriptCharCount = 0;
			const cleanMessages = [];
			for (const message of messages) {
				if (!message || typeof message.content !== "string") continue;
				if (message.content.length > MAX_CHAT_MESSAGE_CHARS) {
					reply.status(400).send({
						error: `message content exceeds maximum limit of ${MAX_CHAT_MESSAGE_CHARS} characters`,
						code: "chat_input_too_large",
					});
					return;
				}
				transcriptCharCount += message.content.length;
				if (message.content.trim().length > 0) {
					cleanMessages.push({
						role: message.role === "assistant" ? "assistant" : "user",
						content: message.content,
					});
				}
			}

			if (transcriptCharCount > MAX_CHAT_TRANSCRIPT_CHARS) {
				reply.status(400).send({
					error: `total transcript exceeds maximum limit of ${MAX_CHAT_TRANSCRIPT_CHARS} characters`,
					code: "chat_input_too_large",
				});
				return;
			}

			if (cleanMessages.length === 0) {
				reply
					.status(400)
					.send({ error: "messages must contain at least one non-empty message" });
				return;
			}

			const taskIds = Array.isArray(body.taskIds) ? body.taskIds : [];
			if (taskIds.length > MAX_CHAT_TASK_IDS) {
				reply
					.status(400)
					.send({ error: `taskIds is limited to ${MAX_CHAT_TASK_IDS} tasks per turn` });
				return;
			}

			const strictTaskIds = Boolean(body.strictTaskIds);
			const tasks = [];
			const unknownTaskIds = [];

			for (const taskId of taskIds) {
				const task = taskStore.getTask(projectId, taskId);
				if (!task) {
					if (strictTaskIds) {
						reply.status(404).send({
							error: `Task ${taskId} not found`,
							code: "task_not_found",
							taskId,
						});
						return;
					}
					unknownTaskIds.push(taskId);
				} else {
					tasks.push(task);
				}
			}

			// If all given taskIds were unknown and at least one was given, 404.
			// Names every unknown id (not just the first) so API callers can
			// prune them all; `taskId` stays for backwards compatibility.
			if (taskIds.length > 0 && tasks.length === 0) {
				reply.status(404).send({
					error: `Task ${taskIds[0]} not found`,
					code: "task_not_found",
					taskId: taskIds[0],
					unknownTaskIds: taskIds,
				});
				return;
			}

			const requestedHarness =
				typeof body.harness === "string" && body.harness.trim()
					? body.harness.trim()
					: undefined;
			const requestedModel =
				typeof body.model === "string" && body.model.trim()
					? body.model.trim()
					: null;
			// TARGET OWNERSHIP: chat turns resolve through the same choke
			// point as stage dispatch, so `harness: "alias"` + foreign models
			// behave identically in both paths. A chat turn consumes one
			// rotation step like any run (it spends real quota). Unknown
			// aliases fall back to the project default (never the raw alias
			// name) with a visible warning, mirroring dispatch.
			const chatTarget = resolveStageTarget(
				project,
				{
					...(requestedHarness ? { harness: requestedHarness } : {}),
					...(requestedModel ? { model: requestedModel } : {}),
				},
				{},
			);
			if (chatTarget.aliasMissing) {
				request.log?.warn?.(
					`Unknown model alias "${chatTarget.aliasMissing}" for project ${projectId}; running the chat turn on the project default instead.`,
				);
			}
			const { name: harnessName, harness } = resolveHarness(project, {
				harnessName: chatTarget.harnessName || requestedHarness,
			});
			// The resolved model rides to session creation (target hand-off);
			// alias-miss fallbacks pass nothing so the project-default path
			// behaves as before (the fallback switch below still applies it).
			const handoffModel =
				!chatTarget.aliasMissing &&
				chatTarget.modelRef &&
				chatTarget.modelRef !== "default"
					? chatTarget.modelRef
					: null;
			const session = await harness.createSession(project, {
				...RETROSPECTIVE_SESSION_META,
				...(handoffModel ? { model: handoffModel } : {}),
			});

			try {
				if (!guardSessionCapability(reply, session, "prompt", "Retrospective chat")) {
					return;
				}
				// The switch target is the RESOLVED ref (an alias name never
				// reaches the switch): the project-default fallback on alias
				// misses, the dispatch-resolved ref otherwise (which equals
				// the requested model for non-alias turns). A creation-pinned
				// session skips the redundant re-pin.
				const switchTarget = chatTarget.aliasMissing
					? chatTarget.modelRef || null
					: (chatTarget.modelRef ?? requestedModel);
				const switchPinned =
					Boolean(handoffModel) &&
					typeof session.getActiveModel === "function" &&
					(await session
						.getActiveModel()
						.then(
							(active) =>
								active &&
								typeof active === "object" &&
								typeof switchTarget === "string" &&
								(active.id === switchTarget ||
									active.key === switchTarget ||
									(active.provider &&
										`${active.provider}::${active.id}` === switchTarget)),
						)
						.catch(() => false));
				let modelRequested = true;
				if (switchTarget && !switchPinned) {
					const switchRef = switchTarget;
					if (harnessModelSelection(harness) === "none") {
						// A harness that manages its own model never takes a
						// switch: the requested model is ignored (never
						// resolved, never switched to) and the turn runs on
						// the harness default.
						modelRequested = false;
						if (request.log?.info) {
							request.log.info(
								`Requested model ${switchRef} ignored (harness '${harnessName}' manages its own model); continuing with harness default`,
							);
						}
					} else if (typeof session.switchModel === "function") {
						try {
							let target = switchRef;
							if (typeof harness.resolveModelRef === "function") {
								target =
									(await harness.resolveModelRef(switchRef)) || switchRef;
							}
							await session.switchModel(target);
						} catch {
							modelRequested = false;
							if (request.log?.warn) {
								request.log.warn(
									`Failed to switch model to ${switchRef}; continuing with session default`,
								);
							}
						}
					} else {
						// A requested model the session cannot switch to is a
						// rejected switch, not a silent success: report it so
						// the UI can name the fallback model.
						modelRequested = false;
						if (request.log?.warn) {
							request.log.warn(
								`Requested model ${switchRef} unavailable (no switchModel); continuing with session default`,
							);
						}
					}
				}

				// Resolve stage skill injection (Phase 4)
				let skillSections = [];
				let skillChars = 0;
				try {
					const loadSkillFn =
						typeof loadSkillOverride === "function"
							? loadSkillOverride
							: skillsRegistry
								? (name) => skillsRegistry.getSkill(name, { projectCwd: project.cwd })
								: null;

					if (loadSkillFn) {
						// Per-turn override for the skill's self-referential
						// KB_config `projectCwd` keyword: without this the
						// `{{projectCwd}}` lookup paths reach the model
						// unresolved (custom keywords win over built-ins and no
						// `projectCwd` built-in exists).
						const chatSkillConfig = {
							projectCwd:
								typeof project?.cwd === "string" && project.cwd.trim()
									? project.cwd
									: "./",
						};
						const { sections, usedChars } = buildSkillsPromptSections({
							skills: [
								{
									name: "retrospective-task-lookup",
									mode: "direct",
									config: chatSkillConfig,
								},
							],
							interpolationContext: { project, taskIds: tasks.map((t) => t.id) },
							maxChars: appConfig.chatSkillsMaxChars || 6000,
							loadSkill: loadSkillFn,
						});
						skillSections = sections;
						skillChars = usedChars || 0;
					}
				} catch (err) {
					if (request.log?.warn) {
						request.log.warn(`Retrospective chat skill injection failed: ${err?.message}`);
					}
				}

				const { block, truncated, contextTaskIds, chars: contextChars } =
					contextMetaForTasks(tasks, {
						resolveStages: (task) => resolveStagesForTask(project, task),
					});

				const promptText = buildChatPrompt({
					messages: cleanMessages,
					contextBlock: block,
					contextTruncated: truncated,
					skillSections,
					projectId,
				});

				if (request.log?.debug) {
					// Attribution line for slow/hung turns: the built prompt size
					// plus the resolved model pin down whether a turn outlived an
					// outer timeout because the prompt was pathological or the
					// model leg was slow (Fastify's own request log already
					// carries the turn duration via responseTime).
					request.log.debug({
						skillChars,
						contextChars,
						transcriptChars: transcriptCharCount,
						promptChars: promptText.length,
						model: switchTarget || null,
					});
				}

				// No-timeout default: a disabled `chatPromptTimeoutMs` (0) must
				// pass through as 0 so runChatTurn skips its race — `||`
				// would wrongly resurrect the old 30 min ceiling here.
				const promptTimeoutMs =
					promptTimeoutMsOverride !== undefined
						? promptTimeoutMsOverride
						: (appConfig.chatPromptTimeoutMs ?? 0);

				// Live progress: the client's turnId keys CHAT_PROGRESS broadcasts
				// carrying the same bounded tail the 200 body will (the winner of
				// the onChunk/subscribe pair, never both concatenated — the same
				// rule runChatTurn's own finalizer keeps, so progress and the
				// final `output` tail can never disagree). Throttled so a chatty
				// model doesn't flood the socket; a broadcast sink must never
				// fail the turn. Turns without a turnId (old clients) skip this.
				const turnId =
					typeof body.turnId === "string" && body.turnId.trim()
						? body.turnId.trim().slice(0, 128)
						: null;
				const canBroadcastProgress =
					Boolean(turnId) && Boolean(eventBridge && typeof eventBridge.broadcast === "function");
				let progressChunkText = "";
				let progressSubscribedText = "";
				let lastProgressBroadcastAt = 0;
				const broadcastChatProgress = () => {
					const now = Date.now();
					if (now - lastProgressBroadcastAt < CHAT_PROGRESS_BROADCAST_MIN_INTERVAL_MS) return;
					lastProgressBroadcastAt = now;
					try {
						eventBridge.broadcast(projectId, "CHAT_PROGRESS", {
							turnId,
							tail: truncateOutputTail(progressChunkText || progressSubscribedText),
							projectId,
						});
					} catch {
						// Broadcast is best-effort; the unary settle stays truthful.
					}
				};

				let responseReply = "";
				let responseOutput = "";
				try {
					const turnResult = await runChatTurn({
						session,
						promptText,
						timeoutMs: promptTimeoutMs,
						onProgress: canBroadcastProgress
							? (delta, source) => {
									if (source === "subscribed") {
										progressSubscribedText = `${progressSubscribedText}${delta}`.slice(
											-CHAT_OUTPUT_TAIL_MAX_CHARS,
										);
									} else {
										progressChunkText = `${progressChunkText}${delta}`.slice(
											-CHAT_OUTPUT_TAIL_MAX_CHARS,
										);
									}
									broadcastChatProgress();
								}
							: undefined,
					});
					responseReply = turnResult.replyText;
					responseOutput = turnResult.output || "";
				} catch (turnErr) {
					// Additive partial output: whatever the model streamed before
					// the timeout/failure, so the UI can show it instead of a bare
					// error. Old clients ignore the unknown field.
					const partialOutput =
						typeof turnErr?.partialOutput === "string" && turnErr.partialOutput
							? { output: turnErr.partialOutput }
							: {};
					if (turnErr?.code === "chat_prompt_timeout") {
						reply.status(504).send({
							error: turnErr.message,
							code: "chat_prompt_timeout",
							...partialOutput,
						});
						return;
					}
					reply.status(502).send({
						error: turnErr?.message || "Chat prompt failed",
						code: "chat_prompt_failed",
						...partialOutput,
					});
					return;
				}

				let activeModel = null;
				try {
					if (typeof session.getActiveModel === "function") {
						activeModel = await session.getActiveModel();
					}
				} catch {
					activeModel = null;
				}

				return {
					reply: responseReply,
					suggestions: parseTicketSuggestions(responseReply),
					harness: harnessName,
					// The resolved ref (never a raw alias name) when the
					// session reports no active model.
					model:
						activeModel?.id || activeModel?.key || switchTarget || null,
					modelRequested,
					unknownTaskIds,
					contextTaskIds,
					contextTruncated: truncated,
					contextChars,
					...(responseOutput ? { output: responseOutput } : {}),
				};
			} finally {
				try {
					await session.dispose();
				} catch {
					// Dispose is best-effort on the ephemeral session.
				}
			}
		},
	);
}
