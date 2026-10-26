import { config } from "./config.js";
import { resolveStageTimeout } from "./taskStore.js";
import {
	describeProviderAuthStatus,
	isModelRunnable,
	normalizeModelRef,
	parseModelKey,
	resolveModel,
	resolveModelFromRegistry,
} from "./models.js";
import { eventBridge } from "./eventBridge.js";
import { createAgentLogStreamer } from "./agent/logStream/agentLogStreamer.js";
import {
	supportsImages,
} from "./agent/visionSupport.js";
import {
	resolveTaskAssetFile,
	imageMediaType,
} from "./work/taskAssets.js";
import fs from "node:fs";
import {
	ALIAS_HARNESS_ID,
	normalizeAliasName,
} from "../shared/modelAliases.js";
import { hasHarness, harnessModelSelection } from "./agent/harnessRegistry.js";
import { selectAliasTarget } from "./aliasSelector.js";
import { stripUnsupportedReasoningLevel } from "./aliasTargets.js";
import {
	checkToolLoopGuard,
	formatLoopDiagnostic,
	parseStageVerdict,
	resolveToolLoopStrikes,
	stageExpectsAgentVerdict,
} from "./agent/verdictContract.js";

// Re-exported for contract tests and external importers: the verdict parser
// and the tool-loop guard live in ./agent/verdictContract.js (single source
// of truth); the runner only applies their decisions. parseStageVerdict used
// to live here — it is re-exported so existing imports keep working.
export {
	checkToolLoopGuard,
	formatLoopDiagnostic,
	parseStageVerdict,
	resolveToolLoopStrikes,
};

/***
 * MARK: resolveStageTarget
 * @description THE choke point that turns a stage (+ explicit model override)
 *   into the concrete dispatch target BEFORE harness resolution: the harness
 *   override for the session (`harnessName`, "" = inherit the project
 *   resolution) and the model reference to switch to. Non-alias stages pass
 *   through byte-identically (stage harness override, else inherit; explicit
 *   model, else `stage.model`, sentinel `"default"` and blank inherit
 *   untouched). A stage (or project default) on the virtual `alias` harness
 *   resolves through the project's `modelAliases`: the alias's current
 *   harness + model win, so editing an alias changes every referencing stage
 *   with no stage edits. Unknown/deleted aliases (and alias→alias loops)
 *   never silently run the wrong model: the result carries `aliasMissing` and
 *   the caller warns loudly and falls back to the project's default target.
 * @example resolveStageTarget({ harness: "pi" }, { harness: "custom" }) => { harnessName: "custom", modelRef: undefined, … }
 * @example resolveStageTarget({ modelAliases: [{ name: "small", harness: "pi", model: "google::m" }] }, { harness: "alias", model: "small" }) => { harnessName: "pi", modelRef: "google::m", aliasResolved: true, … }
 * @param {Object} [project] - Project entity (`harness`, `defaultModel`, `modelAliases`).
 * @param {Object} [stage] - Stage entity (`harness` override, `model` override).
 * @param {Object} [opts]
 * @param {string} [opts.model] - Explicit model override (wins over `stage.model`, mirroring the runner's `model || stage?.model`).
 * @returns {{harnessName: string, modelRef: string|undefined, aliasName: string|null, aliasResolved: boolean, aliasMissing: string|null}} Concrete target.
 ***/
export function resolveStageTarget(project, stage, { model } = {}) {
	const trimHarness = (v) => (typeof v === "string" ? v.trim() : "");
	const stageHarness = trimHarness(stage?.harness);
	const projectHarness = trimHarness(project?.harness);
	const explicitModel = model !== undefined ? model : stage?.model;
	const plain = (aliasName = null, aliasResolved = false, aliasMissing = null) => ({
		harnessName: stageHarness,
		modelRef: explicitModel,
		aliasName,
		aliasResolved,
		aliasMissing,
	});
	if ((stageHarness || projectHarness) !== ALIAS_HARNESS_ID) {
		return plain();
	}
	if (stageHarness === ALIAS_HARNESS_ID) {
		// Explicit per-stage alias reference: resolve NOW (the session layer
		// never sees the model name, so it cannot resolve this itself). A
		// weighted alias serves one rotation pick per stage run.
		const aliasName = normalizeAliasName(explicitModel);
		const picked =
			aliasName && aliasName !== "default"
				? selectAliasTarget(project, aliasName, {
						isHarnessKnown: (name) => hasHarness(name),
					})
				: null;
		if (picked) {
			return {
				harnessName: picked.harness,
				modelRef: picked.model,
				aliasName,
				aliasResolved: true,
				aliasMissing: null,
			};
		}
		const fallback = resolveProjectDefaultTarget(project);
		return {
			harnessName: fallback.harnessName,
			modelRef: fallback.modelRef,
			aliasName: aliasName || null,
			aliasResolved: false,
			aliasMissing: aliasName || "(blank)",
		};
	}
	// Inherited project-default alias: resolve the alias's rotation pick HERE
	// (harness AND model together) and hand the concrete harness to the
	// session layer as the stage override, so both halves of the dispatch
	// serve the SAME weighted target instead of consuming two rotation
	// steps that could land on different targets.
	const pickedDefault = selectAliasTarget(project, project?.defaultModel, {
		isHarnessKnown: (name) => hasHarness(name),
	});
	if (pickedDefault) {
		return {
			harnessName: pickedDefault.harness,
			modelRef: pickedDefault.model,
			aliasName: normalizeAliasName(project.defaultModel),
			aliasResolved: true,
			aliasMissing: null,
		};
	}
	const fallback = resolveProjectDefaultTarget(project);
	return {
		harnessName: fallback.harnessName,
		modelRef: fallback.modelRef,
		aliasName: normalizeAliasName(project?.defaultModel) || null,
		aliasResolved: false,
		aliasMissing: normalizeAliasName(project?.defaultModel) || "(blank)",
	};
}

/***
 * MARK: resolveProjectDefaultTarget
 * @description The safe fallback behind every alias miss: the project's
 *   default target with any resolvable project-default alias already
 *   applied. When the project default itself is a resolvable alias, the
 *   fallback carries that alias's rotation pick (concrete harness + model
 *   together, so the session override and the model switch serve the SAME
 *   weighted target); otherwise the harness half stays inherit ("") and the
 *   model half is the raw `project.defaultModel` (falsy ⇒ the runner
 *   keeps the session default, exactly like a blank stage model today).
 * @example resolveProjectDefaultTarget({ harness: "pi", defaultModel: "google::m" }) => { harnessName: "", modelRef: "google::m" }
 * @param {Object} [project] - Project entity.
 * @returns {{harnessName: string, modelRef: string|undefined}} Fallback target.
 ***/
export function resolveProjectDefaultTarget(project) {
	if (
		(typeof project?.harness === "string" ? project.harness.trim() : "") ===
		ALIAS_HARNESS_ID
	) {
		const picked = selectAliasTarget(project, project?.defaultModel, {
			isHarnessKnown: (name) => hasHarness(name),
		});
		if (picked) {
			return { harnessName: picked.harness, modelRef: picked.model };
		}
	}
	return { harnessName: "", modelRef: project?.defaultModel };
}

/** `${projectId}:${aliasName}` keys already warned about, so a hot loop cannot spam logs. */
const warnedUnknownAliases = new Set();

/***
 * MARK: agentRunner
 * @description Constructs agent stage executors that switch models, stream events,
 * track modified files from tool calls, and retrieve assistant text.
 ***/

/***
 * MARK: extractAssistantText
 * @description Safely extracts text content from assistant messages across
 *   session shapes: the contract getMessages()/getLastAssistantText() methods
 *   or the classic messages array.
 * @param {Object} session - The harness session instance.
 * @param {string} [fallbackOutput=""] - Fallback string if assistant text cannot be found.
 * @returns {string} The assistant message text.
 ***/
export function extractAssistantText(session, fallbackOutput = "") {
	if (typeof session?.getLastAssistantText === "function") {
		try {
			const txt = session.getLastAssistantText();
			if (txt && typeof txt === "string" && txt.trim()) return txt;
		} catch {
			// ignore
		}
	}

	const messages =
		typeof session?.getMessages === "function"
			? session.getMessages()
			: session?.messages;
	if (Array.isArray(messages) && messages.length > 0) {
		const assistantMsgs = messages.filter((m) => m && m.role === "assistant");
		const lastMsg = assistantMsgs.at(-1);
		if (lastMsg) {
			if (typeof lastMsg.content === "string" && lastMsg.content.trim()) {
				return lastMsg.content;
			}
			if (Array.isArray(lastMsg.content)) {
				const combined = lastMsg.content
					.map((c) => (typeof c === "string" ? c : c?.text || ""))
					.join("")
					.trim();
				if (combined) return combined;
			}
		}
	}

	return fallbackOutput || "Stage execution completed";
}

/***
 * MARK: CAPTURE_TRUNCATION_MARKER
 * @description Prefix applied to the runner's fallback capture when it exceeds
 *   the process-log byte cap (same marker the legacy runner used).
 ***/
const CAPTURE_TRUNCATION_MARKER =
	"[... output truncated for performance ...]\n";

/***
 * MARK: readToolPartial
 * @description Reads the streamed partial output of a tool_updated event.
 * @example readToolPartial({ partialResult: "line1" }) => "line1"
 * @param {Object} toolEvent
 * @returns {string}
 ***/
function readToolPartial(toolEvent) {
	if (typeof toolEvent.partialResult === "string") {
		return toolEvent.partialResult;
	}
	if (typeof toolEvent.delta === "string") {
		return toolEvent.delta;
	}
	return "";
}

/***
 * MARK: buildImageAttachments
 * @description Decides whether THIS run receives image bytes, and builds them when it
 *   does. Byte delivery requires BOTH the harness and the model to advertise vision
 *   (see api/agent/visionSupport.js): capable runs get base64 ImageContent parts read
 *   from the task's assets folder (capped by taskImageMaxAttachBytes / per-file
 *   taskImageMaxBytes); incapable runs degrade silently to the file-path mentions the
 *   curated prompt already carries (never a hard error — the stage must still succeed).
 * @example buildImageAttachments({ imageFiles: ['assets/a.png'], cwd, taskId, session, modelRef, emit }) => { images: [...], note: '...attaching 1 task image(s)...' }
 * @param {Object} opts
 * @param {string[]} [opts.imageFiles] - Relative asset paths from the curated prompt build.
 * @param {string} [opts.cwd] - Project working directory (assets live under docs/tasks/<taskId>/).
 * @param {string} [opts.taskId]
 * @param {Object} opts.session - The resolved harness session (harnessId, listModels, model).
 * @param {string|null} opts.modelRef - The stage/project model reference (or the active model id when none was requested).
 * @param {Function} [opts.emit] - Stage-message emitter for the delivery note.
 * @returns {Promise<{images: Array<Object>, note: string|null}>}
 ***/
export async function buildImageAttachments({
	imageFiles = [],
	cwd,
	taskId,
	session,
	modelRef,
	emit,
	docsProject,
}) {
	if (!Array.isArray(imageFiles) || imageFiles.length === 0 || !cwd || !taskId) {
		return { images: [], note: null };
	}
	const harnessId = typeof session?.harnessId === "string" ? session.harnessId : null;
	const capable = await supportsImages(harnessId, modelRef, {
		listModels:
			typeof session?.listModels === "function"
				? () => session.listModels()
				: null,
	});
	if (!capable) {
		const note =
			`[AGENT] ${imageFiles.length} task image(s) available; this harness/model pair has no image-input support, so images are referenced by file path only (see # Task Images).`;
		emit?.(note);
		return { images: [], note };
	}

	const images = [];
	let attachedBytes = 0;
	let skipped = 0;
	for (const relPath of imageFiles) {
		const name = String(relPath || "").split("/").pop() || "";
		const mediaType = imageMediaType(name);
		if (!mediaType) {
			skipped += 1;
			continue;
		}
		const filePath = resolveTaskAssetFile(cwd, taskId, name, docsProject);
		if (!filePath) {
			skipped += 1;
			continue;
		}
		/* eslint-disable security/detect-non-literal-fs-filename */
		try {
			if (!fs.existsSync(filePath)) {
				skipped += 1;
				continue;
			}
			const buffer = fs.readFileSync(filePath);
			if (
				buffer.length > config.taskImageMaxBytes ||
				attachedBytes + buffer.length > config.taskImageMaxAttachBytes
			) {
				skipped += 1;
				continue;
			}
			attachedBytes += buffer.length;
			// Flat pi-ai ImageContent shape ({ type: "image", data, mimeType });
			// the provider adapters (anthropic-messages, openai-completions,
			// google-shared) read block.data/block.mimeType and translate to
			// wire format themselves — never emit the Anthropic { source: … }
			// shape here.
			images.push({
				type: "image",
				data: buffer.toString("base64"),
				mimeType: mediaType,
			});
		} catch {
			skipped += 1;
		}
		/* eslint-enable security/detect-non-literal-fs-filename */
	}
	if (images.length === 0) {
		return { images: [], note: null };
	}
	const note =
		`[AGENT] Vision-capable harness/model: attaching ${images.length} task image(s) (${attachedBytes} bytes)` +
		(skipped > 0 ? `; ${skipped} file(s) skipped (over size limits or unreadable)` : "") +
		".";
	emit?.(note);
	return { images, note };
}

/***
 * MARK: createAgentRunner
 * @description Constructs an agent runner function that executes an agent/review stage on a session.
 * Every stage execution begins a brand-new session (one session per stage): the run's
 * only context is the curated prompt, so later stages never inherit the research/history
 * of earlier ones. Supports both direct invocation `runner(prompt, { projectId, ... })`
 * and curried `createAgentRunner({ getOrCreateSession, projectId })`.
 * @param {Object} opts
 * @param {Function} opts.getOrCreateSession - Async session resolver `(projectId, meta) => Promise<session>`; when `meta` carries `taskId`/`stageId` it must begin a FRESH session for that stage run (with `meta.harness` forwarded as the stage's harness override when set).
 * @param {Function} [opts.touchSession] - Optional heartbeat `(projectId) => void` invoked on every streamed event so long headless runs are not TTL-disposed mid-stage.
 * @param {string} [opts.projectId] - Optional default project ID.
 * @returns {Function} `(prompt, { cwd, taskId, stage, projectId, model, onChunk, branch, imageFiles }) => Promise<Object>`; `imageFiles` lists relative task asset paths (`assets/<name>`) — bytes are attached only for vision-capable harness+model pairs (see buildImageAttachments).
 * Verdict precedence inside one run (first match wins, fail-open): explicit
 * `fail_stage` tool call > prompt/session exceptions > model errors >
 * session/loop-guard errors > text FAIL verdict with reason and fix guidance
 * > pass. A reasonless FAIL, a malformed block, prose verdicts, and runs
 * with no verdict at all pass open — stages default to passing unless the
 * failure skill (or a well-formed FAIL block) says they failed.
 ***/
export function createAgentRunner(optsOrProjectId = {}, maybeOpts = {}) {
	let getOrCreateSession;
	let touchSession = null;
	let defaultProjectId = null;
	let getProject = null;

	if (typeof optsOrProjectId === "function") {
		getOrCreateSession = optsOrProjectId;
	} else if (typeof optsOrProjectId === "string") {
		defaultProjectId = optsOrProjectId;
		getOrCreateSession = maybeOpts.getOrCreateSession;
		getProject = maybeOpts.getProject || null;
	} else if (optsOrProjectId && typeof optsOrProjectId === "object") {
		getOrCreateSession = optsOrProjectId.getOrCreateSession;
		touchSession = optsOrProjectId.touchSession || null;
		defaultProjectId = optsOrProjectId.projectId || null;
		getProject = optsOrProjectId.getProject || null;
	}

	return async (
		prompt,
		{
			stage,
			projectId,
			model,
			onChunk,
			taskId,
			timeout,
			branch,
			cwd,
			imageFiles,
		} = {},
	) => {
		const resolvedProjectId = projectId || defaultProjectId;
		if (!resolvedProjectId) {
			throw new Error("No projectId provided for agent execution");
		}

		if (typeof getOrCreateSession !== "function") {
			throw new Error("getOrCreateSession resolver is required for agent runner");
		}

		// Observability: when the engine runs the stage on a per-task git branch,
		// surface it so operators (and agents reading their own stream) know which
		// branch they are working on.
		// The stage's log streamer turns the normalized agent-event vocabulary
		// into grouped entries (assistant text / thinking / tool blocks) instead
		// of raw token fragments — see api/agent/logStream/agentLogStreamer.js.
		// Lane budgets come from config so operators can tune the unified
		// telemetry/raw lanes without code changes.
		const streamer = createAgentLogStreamer({
			maxEntries: config.logEntriesMaxCount,
			telemetryMaxCount: config.telemetryMaxCount,
			rawMaxCount: config.rawMaxCount,
			rawMaxBytes: config.rawMaxBytes,
		});
		const emitStageMessage = (message) => {
			const entry = streamer.system(message);
			if (entry) onChunk?.(entry.text);
		};

		if (branch) {
			const branchMsg = `[AGENT] Working on git branch '${branch}'`;
			emitStageMessage(branchMsg);
			eventBridge.emitSystemLog?.(resolvedProjectId, branchMsg, {
				projectId: resolvedProjectId,
				taskId,
			});
		}

		// A model warning is never silent: the stage message always reaches
		// the run log; the process-log line is shared with console.warn.
		const emitModelWarning = (msg) => {
			emitStageMessage(msg);
			eventBridge.emitSystemLog?.(resolvedProjectId, msg, {
				projectId: resolvedProjectId,
				taskId,
				tag: "[WARN]",
				level: "warn",
			});
		};

		// Resolve the stage to its concrete dispatch target BEFORE harness
		// resolution: a stage (or project default) on the virtual `alias`
		// harness becomes the alias's current harness + model, so editing an
		// alias changes every referencing stage with no stage edits. Without
		// a project lookup (unit-test rigs) non-alias stages flow through
		// exactly as before.
		let project = null;
		if (typeof getProject === "function") {
			try {
				project = await getProject(resolvedProjectId);
			} catch {
				project = null;
			}
		}
		const stageTarget = resolveStageTarget(project, stage, { model });

		// Stage executions carry run metadata so the session resolver begins a
		// FRESH session for this stage (one session per stage — no inherited
		// history from earlier stages/tasks), on the stage's harness override
		// when set (stage.harness, already alias-resolved above) — otherwise
		// the session resolver inherits the project harness. A
		// visual-debugging stage can therefore run antigravity+gemini while
		// the rest of the pipeline stays on pi.
		const stageMeta = {};
		if (taskId) stageMeta.taskId = taskId;
		if (stage?.id) stageMeta.stageId = stage.id;
		if (stageTarget.harnessName) {
			stageMeta.harness = stageTarget.harnessName;
		}
		// TARGET HAND-OFF: dispatch owns the harness+model combination, so the
		// concrete model ref rides to session creation alongside the harness
		// override — the harness pins it instead of re-resolving the project
		// default against its own catalog (the S1 foreign-catalog WARN). The
		// sentinel "default" and blank stay unpinned (session default wins),
		// and alias-miss fallbacks pass nothing so the project-default path
		// behaves exactly as before.
		let handoffModelRef = stageTarget.modelRef;
		if (
			!stageTarget.aliasMissing &&
			handoffModelRef &&
			handoffModelRef !== "default"
		) {
			const runHarness =
				(stageTarget.harnessName && String(stageTarget.harnessName).trim()) ||
				(typeof project?.harness === "string" ? project.harness.trim() : "") ||
				"";
			const strippedHandoff = stripUnsupportedReasoningLevel({
				modelRef: handoffModelRef,
				harnessName: runHarness,
			});
			if (strippedHandoff !== handoffModelRef) {
				emitModelWarning(
					`[WARN] reasoning level '${parseModelKey(handoffModelRef)?.reasoning}' not supported by harness '${runHarness || "session"}'; using model default`,
				);
				handoffModelRef = strippedHandoff;
			}
			stageMeta.model = handoffModelRef;
		}
		const session = await getOrCreateSession(resolvedProjectId, stageMeta);
		if (!session) {
			throw new Error(
				`No agent session available for project ${resolvedProjectId}`,
			);
		}
		// The running harness identity for reliability tracking: every result
		// below carries it (null for pre-contract sessions without one), so
		// stage reports can attribute each run to its harness.
		const runHarnessId =
			typeof session.harnessId === "string" && session.harnessId
				? session.harnessId
				: null;

		// An alias that no longer resolves never silently runs the wrong
		// model: warn visibly (stage log every run; console + process log
		// deduped per project + name, mirroring the unknown-harness path)
		// and fall back to the project's default target (already applied to
		// stageTarget above).
		if (stageTarget.aliasMissing) {
			const aliasMsg =
				`[WARN] Unknown model alias "${stageTarget.aliasMissing}" for project ${resolvedProjectId}; ` +
				`running on the project default instead. Update the stage model or the alias in Settings › Model Aliases.`;
			const dedupeKey = `${resolvedProjectId}:${stageTarget.aliasMissing}`;
			if (!warnedUnknownAliases.has(dedupeKey)) {
				warnedUnknownAliases.add(dedupeKey);
				console.warn(`[SYSTEM] ${aliasMsg}`);
			}
			emitModelWarning(aliasMsg);
		}

		// If stage or project requested a specific model, switch to it. A failed
		// switch is never silent: the stage must visibly run on a different
		// model than requested, otherwise quota is silently spent elsewhere.
		// When the session's harness manages its own model (modelSelection:
		// "none"), the model switch is skipped entirely: resolving a model
		// against a harness with no catalogue is an attempt to call that
		// harness with a model it can never run.
		const sessionHarnessSelection =
			(session.harnessId && hasHarness(session.harnessId)
				? harnessModelSelection(session.harnessId)
				: session.modelSelection) || "list";
		const targetModelId = handoffModelRef || stageTarget.modelRef;
		if (sessionHarnessSelection === "none") {
			if (targetModelId && targetModelId !== "default") {
				const aliasNote = stageTarget.aliasName
					? ` (from alias '${stageTarget.aliasName}')`
					: "";
				emitStageMessage(
					`[INFO] Stage requested model '${targetModelId}'${aliasNote} but harness '${session.harnessId || "session"}' manages its own model; model selection is ignored.`,
				);
			}
		} else if (targetModelId && targetModelId !== "default") {
			// Model control goes through the session contract (getActiveModel /
			// switchModel / listModels / resolveModelRef); the classic pi fields are
			// kept as fallbacks for sessions that predate the contract.
			// Stored references may predate harness-scoped keys: normalize legacy
			// `provider::id` values to the session's harness (reported by the
			// session contract) before resolving. Bare ids and sentinels pass
			// through untouched. Sessions without a harnessId (older mocks and
			// pre-contract sessions) keep the reference as-is — every resolver
			// accepts all forms.
			let workingTargetModelId = targetModelId;
			const strippedTargetModelId = stripUnsupportedReasoningLevel({
				modelRef: workingTargetModelId,
				harnessName: session.harnessId || stageTarget.harnessName,
			});
			if (strippedTargetModelId !== workingTargetModelId) {
				emitModelWarning(
					`[WARN] reasoning level '${parseModelKey(workingTargetModelId)?.reasoning}' not supported by harness '${session.harnessId || stageTarget.harnessName || "session"}'; using model default`,
				);
				workingTargetModelId = strippedTargetModelId;
			}
			const targetRef = normalizeModelRef(workingTargetModelId, session.harnessId);
			// A 3-part key naming a DIFFERENT harness still resolves (with one
			// configured harness, provider::id is unique) but is loudly flagged as
			// a stale key form instead of silently accepted.
			const parsedTarget = parseModelKey(targetModelId);
			if (
				parsedTarget?.form === "harness" &&
				session.harnessId &&
				parsedTarget.harness !== session.harnessId
			) {
				emitModelWarning(
					`[WARN] Model reference '${targetModelId}' is scoped to harness '${parsedTarget.harness}' but this session runs on harness '${session.harnessId}'; matching by provider::id. Fix: change the stage model to a '${session.harnessId}' model, or change the project harness to '${parsedTarget.harness}' in Settings.`,
				);
			}
			const readActiveModel = async () => {
				if (typeof session.getActiveModel === "function") {
					return await session.getActiveModel();
				}
				return session.model ?? null;
			};
			const readAvailableModels = async () => {
				if (typeof session.listModels === "function") {
					return await session.listModels();
				}
				return session.modelRuntime?.getAvailableSnapshot?.() || [];
			};
			const resolveViaRegistry = async (ref) => {
				if (typeof session.resolveModelRef === "function") {
					return await session.resolveModelRef(ref);
				}
				return resolveModelFromRegistry(session.modelRuntime, ref);
			};
			// Optional discovery-health report (harnesses with a CLI-backed
			// catalogue, e.g. antigravity): null when the session never
			// reports one, so sessions without the contract read as healthy.
			const readDiscoveryFailure = async () => {
				try {
					if (typeof session.getModelDiscoveryStatus !== "function") {
						return null;
					}
					const status = await session.getModelDiscoveryStatus();
					if (!status || status.ok !== false || !status.error) return null;
					return status.error;
				} catch {
					return null;
				}
			};
			const activeModel = await readActiveModel();
			const currentModelId = activeModel?.id || "session default";
			const canSwitchModels =
				typeof session.switchModel === "function" ||
				typeof session.setModel === "function";
			if (!canSwitchModels) {
				emitModelWarning(
					`[WARN] Stage requested model '${targetModelId}' but this session cannot switch models; running on '${currentModelId}'.`,
				);
			} else {
				const available = await readAvailableModels();
				let targetModel = resolveModel(available, targetRef);
				if (!targetModel) {
					// Availability snapshot can transiently drop a provider; try the
					// runtime's full registry before declaring the model unavailable.
					targetModel = await resolveViaRegistry(targetRef);
				}
				// Idempotent re-pin: session creation already pinned the dispatch
				// target (target hand-off), so a session whose active model IS the
				// target skips the switch — and the runnable gate with it
				// (creation owned that decision and warned if needed).
				// Provider+id+effort must all match; anything else still
				// switches below.
				const alreadyPinned =
					targetModel &&
					activeModel &&
					typeof activeModel === "object" &&
					activeModel.provider === targetModel.provider &&
					activeModel.id === targetModel.id &&
					(activeModel.effort || null) === (targetModel.effort || null) &&
					(activeModel.reasoning || null) === (targetModel.reasoning || null);
				if (targetModel && !alreadyPinned) {
					// Credential-aware dispatch guard: a model that only resolved via
					// the full registry is NOT in the availability snapshot, i.e. its
					// provider has no valid credentials. Warn loudly before quota is
					// spent on a model that will fail at runtime (or fail fast under
					// the opt-in strict knob).
					const runnable = isModelRunnable(available, targetModel);
					if (!runnable) {
						const authDetail = describeProviderAuthStatus(
							session.modelRuntime,
							targetModel.provider,
						);
						if (config.strictModelRunnable) {
							const classified = `[Authentication Error] Stage requested model '${targetModelId}' but provider '${targetModel.provider}' has no valid credentials${authDetail}. Strict model-runnable mode (KAINBAIN_STRICT_MODEL_RUNNABLE) refused to dispatch the stage.`;
							emitModelWarning(classified);
							return {
								output: classified,
								content: classified,
								summary: classified,
								modifiedFiles: [],
								failed: true,
								failureReason: classified,
								harnessId: runHarnessId,
								fallbackStageId: null,
								logEntries: streamer.snapshot().entries,
							};
						}
						emitModelWarning(
							`[WARN] Requested model '${targetModelId}' has no valid credentials${authDetail}; the stage will run it and may fail with an authentication error. Add credentials for provider '${targetModel.provider}' or pick another model in Settings.`,
						);
					}
					try {
						if (typeof session.switchModel === "function") {
							await session.switchModel(targetModel);
						} else {
							// Pre-contract session: the classic setModel field.
							await session.setModel(targetModel);
						}
					} catch (err) {
						const reason = err?.message || String(err);
						emitModelWarning(
							`[WARN] Failed to switch stage model to '${targetModelId}' (${reason}); running on '${currentModelId}'.`,
						);
					}
				} else if (!targetModel) {
					// Unresolvable on a session whose discovery failed: the model
					// may exist — the catalogue is just broken. Name the
					// discovery cause + fix so quota is never silently spent on
					// the session default (or fail fast under the strict knob).
					const discoveryFailure = await readDiscoveryFailure();
					const discoverySuffix = discoveryFailure
						? ` The active harness reports a model-discovery failure [${discoveryFailure.code}]: ${discoveryFailure.message} ${discoveryFailure.hint}`
						: "";
					const namesOtherHarness =
						parsedTarget?.form === "harness" &&
						session.harnessId &&
						parsedTarget.harness !== session.harnessId;
					if (
						config.strictModelDiscovery &&
						discoveryFailure &&
						!namesOtherHarness
					) {
						const classified = `[Model Discovery Error] Stage requested model '${targetModelId}' but it cannot be resolved: model discovery on harness '${session.harnessId || "session"}' failed [${discoveryFailure.code}]: ${discoveryFailure.message} ${discoveryFailure.hint} Strict model-discovery mode (KAINBAIN_STRICT_MODEL_DISCOVERY) refused to dispatch the stage.`;
						emitModelWarning(classified);
						return {
							output: classified,
							content: classified,
							summary: classified,
							modifiedFiles: [],
							failed: true,
							failureReason: classified,
							harnessId: runHarnessId,
							fallbackStageId: null,
							logEntries: streamer.snapshot().entries,
						};
					}
					emitModelWarning(
						`[WARN] Requested model '${targetModelId}' is not available; stage is running on '${currentModelId}' instead. Update the stage/project model in Settings.${discoverySuffix}`,
					);
				}
			}
		}

		// Task image delivery (file-reference-first): the curated prompt always
		// carries the relative asset paths; bytes are attached ONLY when the
		// resolved harness AND model both advertise vision (see
		// buildImageAttachments). The model decision uses the stage's target
		// reference, falling back to the session's active model id for
		// default-model runs.
		const activeModelId = targetModelId || session.model?.id || null;
		let docsProject = null;
		try {
			docsProject =
				typeof getProject === "function" ? getProject(resolvedProjectId) : null;
		} catch {
			docsProject = null;
		}
		const { images: taskImageAttachments } = await buildImageAttachments({
			imageFiles: imageFiles,
			cwd,
			taskId,
			session,
			modelRef: activeModelId,
			emit: emitStageMessage,
			docsProject,
		});

		let capturedOutput = "";
		const MAX_CAPTURED_OUTPUT_LEN = config.processLogMaxBytes;
		const modifiedFiles = new Set();
		// Recent tool errors only (loop-guard context): capped so a session
		// that ignores the loop-guard abort cannot grow memory without bound.
		const toolErrors = [];
		const MAX_TOOL_ERRORS = 50;
		let unsub = null;
		let stageFailureRequested = null;
		let sessionErrorOccurred = null;

		let consecutiveFailedToolCount = 0;
	// Configurable loop-guard threshold (WP4 fail-closed strictness; default
	// 3 preserves legacy behaviour out of the box). Per-stage/per-project
	// tuning is reserved for WP9 auto-iteration calibration.
	const toolLoopStrikes = resolveToolLoopStrikes({
		stage,
		project,
		cfg: config,
	});
	// Last observed tool-call arguments per tool, so the trip diagnostic can
	// name the failing call payload (not just a count). tool_finished events
	// rarely repeat the args; the preceding tool_started does.
	let lastToolCallArgs = null;

		if (typeof session.subscribe === "function") {
			unsub = session.subscribe((event) => {
				if (!event) return;
				// Heartbeat: streaming events prove the session is busy, so keep
				// the TTL sweep from disposing a long headless run mid-stage.
				touchSession?.(resolvedProjectId);

				// The engine consumes the NORMALIZED agent-event vocabulary (see
				// api/agent/sessionEvents.js) — harness sessions deliver it via
				// their wrapped subscribe.

				// --- Side-channel bookkeeping (failure detection, file tracking) ---
				if (event.type === "tool_started") {
					const toolName = event.toolName || event.name || "tool";
					const args = event.args || event.arguments || {};
					try {
						lastToolCallArgs = {
							toolName,
							args: JSON.stringify(args),
						};
					} catch {
						lastToolCallArgs = { toolName, args: "" };
					}
					if (toolName === "fail_stage" || toolName === "Fail_stage_skill") {
						// The agent only reports WHY the stage failed. The failback target is
						// decided by KainBain from the stage configuration — the agent must
						// not (and cannot) override where the task is routed.
						stageFailureRequested = {
							reason:
								args.reason || args.message || "Stage failure reported by agent review",
							targetStage: null,
						};
					}
					const targetFile =
						args.path ||
						args.filePath ||
						args.file ||
						args.target ||
						args.targetFile ||
						args.filename;
					if (
						targetFile &&
						typeof targetFile === "string" &&
						(toolName.includes("write") ||
							toolName.includes("edit") ||
							toolName.includes("patch") ||
							toolName.includes("create"))
					) {
						modifiedFiles.add(targetFile);
					}
				}

				// --- Raw capture for the extractAssistantText fallback path ---
				// Assistant text accumulates exactly as streamed (never through the
				// grouped entries, which would duplicate it at flush time).
				if (event.type === "assistant_delta") {
					const ame = event.assistantMessageEvent;
					const rawText =
						(typeof ame?.delta === "string" && ame.delta) ||
						(typeof event.delta === "string" && event.delta) ||
						(typeof event.chunk === "string" && event.chunk) ||
						"";
					if (rawText) {
						capturedOutput += rawText;
						if (capturedOutput.length > MAX_CAPTURED_OUTPUT_LEN) {
							capturedOutput = `${CAPTURE_TRUNCATION_MARKER}${capturedOutput.slice(-MAX_CAPTURED_OUTPUT_LEN)}`;
						}
					}
				} else if (event.type === "tool_updated") {
					const partial = readToolPartial(event);
					if (partial) {
						capturedOutput += partial;
						if (capturedOutput.length > MAX_CAPTURED_OUTPUT_LEN) {
							capturedOutput = `${CAPTURE_TRUNCATION_MARKER}${capturedOutput.slice(-MAX_CAPTURED_OUTPUT_LEN)}`;
						}
					}
				}

				// --- Grouped log entries: the streamer owns event→entry conversion ---
				// Token deltas buffer inside the streamer and surface as complete
				// blocks (assistant text, collapsed thinking, tool call/result lines).
				const appended = streamer.handleEvent(event);
				for (const entry of appended) {
					// Tool call/result lines and errors join the fallback capture, the
					// way their legacy text lines always did.
					if (entry.kind === "tool" || entry.kind === "error") {
						capturedOutput += entry.text;
						if (capturedOutput.length > MAX_CAPTURED_OUTPUT_LEN) {
							capturedOutput = `${CAPTURE_TRUNCATION_MARKER}${capturedOutput.slice(-MAX_CAPTURED_OUTPUT_LEN)}`;
						}
					}
					onChunk?.(entry.text);
				}

				// --- Tool failure loop detection (configurable threshold; infrastructure semantics unchanged) ---
				if (event.type === "tool_finished") {
					const isErr = Boolean(
						event.isError ||
							event.error ||
							event.result?.isError ||
							event.result?.error,
					);
					if (isErr) {
						let res = "";
						if (typeof event.result === "string") {
							res = event.result;
						} else if (typeof event.result?.content === "string") {
							res = event.result.content;
						} else if (Array.isArray(event.result?.content)) {
							res = event.result.content
								.map((c) => (typeof c === "string" ? c : c?.text || ""))
								.join("");
						} else if (event.result) {
							res = JSON.stringify(event.result);
						}
						const errDetail = event.error || res || "Tool execution error";
						toolErrors.push(
							`${event.toolName || event.name || "tool"}: ${errDetail}`,
						);
						if (toolErrors.length > MAX_TOOL_ERRORS) {
							toolErrors.splice(0, toolErrors.length - MAX_TOOL_ERRORS);
						}

						consecutiveFailedToolCount++;
						if (
							checkToolLoopGuard(consecutiveFailedToolCount, toolLoopStrikes)
						) {
							const failedToolName = event.toolName || event.name || "tool";
							const finishedArgs = event.args || event.arguments;
							let argsExcerpt = "";
							try {
								if (finishedArgs !== undefined) {
									argsExcerpt = JSON.stringify(finishedArgs);
								}
							} catch {
								argsExcerpt = "";
							}
							if (!argsExcerpt && lastToolCallArgs?.args) {
								argsExcerpt = lastToolCallArgs.args;
							}
							const loopErrMsg = formatLoopDiagnostic({
								toolName: failedToolName,
								consecutiveCount: consecutiveFailedToolCount,
								argsExcerpt,
								errorExcerpt: String(errDetail),
							});
							// A loop-guard trip is harness/infrastructure failure,
							// never a deliberate agent decision: it records ONLY
							// the session error (resolving to failureKind
							// "infrastructure") so per-harness and per-alias
							// reliability count it. An explicit fail_stage call
							// still sets stageFailureRequested separately and
							// keeps winning as "rejected" (see below).
							sessionErrorOccurred = loopErrMsg;
							if (typeof session.abort === "function") {
								session.abort().catch(() => {});
							}
						}
					} else {
						consecutiveFailedToolCount = 0;
					}
				} else if (event.type === "run_error") {
					sessionErrorOccurred =
						event.error?.message ||
						event.message ||
						String(event.error || "Agent error");
				} else if (event.type === "run_started") {
					// Report the model the session is ACTUALLY using (after any
					// override/switch), not just the requested reference.
					const activeModelId = session.model?.id || targetModelId || "default";
					emitStageMessage(`[AGENT] Agent reasoning with model ${activeModelId}...`);
				}
			});
		}

		let promptRes = null;
		let promptException = null;
		const executionTimeoutMs =
			timeout || resolveStageTimeout(stage, "agent", config, project);

		try {
			if (typeof session.prompt === "function") {
				let timerId;
				let didTimeout = false;
				const timeoutPromise = new Promise((_, reject) => {
					timerId = setTimeout(() => {
						didTimeout = true;
						reject(
							new Error(`Agent execution timed out after ${executionTimeoutMs}ms`),
						);
					}, executionTimeoutMs);
				});

				// Image bytes ride the prompt options (pi harness PromptOptions.images);
				// incapable/unknown pairs get an empty list and the path mentions only.
				const promptOptions = { onChunk };
				if (taskImageAttachments.length > 0) {
					promptOptions.images = taskImageAttachments;
				}
				try {
					promptRes = await Promise.race([
						session.prompt(prompt, promptOptions),
						timeoutPromise,
					]);
				} finally {
					clearTimeout(timerId);
					if (didTimeout && typeof session.abort === "function") {
						try {
							await session.abort();
						} catch {
							// ignore abort errors
						}
					}
				}
			}
		} catch (err) {
			promptException = err;
			if (typeof session.abort === "function") {
				try {
					await session.abort();
				} catch {
					// ignore abort errors
				}
			}
		} finally {
			unsub?.();
		}

		// Helper to format classified error
		const classifyError = (raw) => {
			const str = String(raw || "");
			if (
				/certificate|self-signed|unable to get local issuer|ECONNREFUSED|ENOTFOUND|fetch failed|Connection error|\b50[234]\b|bad gateway|service unavailable|gateway timeout/i.test(
					str,
				)
			) {
				return `[Model Connection Error] Unable to connect to model service: ${str}`;
			}
			if (/unauthorized|401|403|invalid api key|forbidden/i.test(str)) {
				return `[Authentication Error] Model API key or authorization rejected: ${str}`;
			}
			if (/rate limit|429|quota|context.*length|maximum context/i.test(str)) {
				return `[Model Quota/Context Error] ${str}`;
			}
			if (/timeout|timed out|ETIMEDOUT/i.test(str)) {
				return `[Timeout Error] Stage execution timed out: ${str}`;
			}
			return `[Agent Execution Error] ${str}`;
		};

		// An explicit fail_stage decision wins over any coincidental session or
		// model error (e.g. the abort fired by the tool-failure loop guard after
		// the agent already asked to fail the stage): the agent actively decided
		// the stage should fail, so this is review feedback, not a blip.
		if (stageFailureRequested) {
			const rejectionReason = `[Agent Review Rejection] ${stageFailureRequested?.reason || "Stage rejected by agent review"}`;
			const rejectionOutput =
				typeof promptRes === "string" && promptRes.trim()
					? promptRes
					: extractAssistantText(session, capturedOutput);
			return {
				output: rejectionOutput,
				content: rejectionOutput,
				summary: rejectionReason,
				modifiedFiles: Array.from(modifiedFiles),
				failed: true,
				failureReason: rejectionReason,
				failureKind: "rejected",
				harnessId: runHarnessId,
				fallbackStageId: null,
				logEntries: streamer.snapshot().entries,
			};
		}

		if (promptException) {
			const classified = classifyError(promptException.message || promptException);
			return {
				output: classified,
				content: classified,
				summary: classified,
				modifiedFiles: Array.from(modifiedFiles),
				failed: true,
				failureReason: classified,
				// Infrastructure breakdown (lost connection, 503s, timeouts) — not
				// an active agent decision. The task store retries the same stage
				// instead of failback routing.
				failureKind: "infrastructure",
				harnessId: runHarnessId,
				fallbackStageId: null,
				logEntries: streamer.snapshot().entries,
			};
		}

		const assistantMsgs = Array.isArray(session?.messages)
			? session.messages.filter((m) => m && m.role === "assistant")
			: [];
		const lastAssistantMsg = assistantMsgs.at(-1);
		if (
			lastAssistantMsg &&
			(lastAssistantMsg.stopReason === "error" || lastAssistantMsg.errorMessage)
		) {
			const rawErr =
				lastAssistantMsg.errorMessage ||
				sessionErrorOccurred ||
				"Agent execution encountered an unrecoverable model error";
			const classified = classifyError(rawErr);
			return {
				output: classified,
				content: classified,
				summary: classified,
				modifiedFiles: Array.from(modifiedFiles),
				failed: true,
				failureReason: classified,
				// Model/harness error, not an active agent decision.
				failureKind: "infrastructure",
				harnessId: runHarnessId,
				fallbackStageId: null,
				logEntries: streamer.snapshot().entries,
			};
		}

		if (sessionErrorOccurred) {
			const classified = classifyError(sessionErrorOccurred);
			return {
				output: classified,
				content: classified,
				summary: classified,
				modifiedFiles: Array.from(modifiedFiles),
				failed: true,
				failureReason: classified,
				// Session/run error, not an active agent decision.
				failureKind: "infrastructure",
				harnessId: runHarnessId,
				fallbackStageId: null,
				logEntries: streamer.snapshot().entries,
			};
		}

		const finalText =
			typeof promptRes === "string" && promptRes.trim()
				? promptRes
				: extractAssistantText(session, capturedOutput);

		// Text verdict fallback (fail OPEN): wrapped harnesses expose no
		// Fail_stage_skill tool, so a well-formed FAIL block WITH reason and
		// fix guidance fails the stage with that guidance for failback
		// routing. A reasonless FAIL (or malformed block) is NOT a failure —
		// KainBain never fails a stage without guidance to fix; the run
		// passes and the verdict stays visible for human review. The verdict
		// contract is agent-only: human/ci/deploy/merge stages never render
		// or are failed by a verdict, so their output is never parsed.
		const textVerdict = stageExpectsAgentVerdict(stage)
			? parseStageVerdict(finalText)
			: { verdict: null, reason: "", fix: "" };
		if (textVerdict.verdict === "FAIL") {
			if (textVerdict.reason && textVerdict.fix) {
				const rejectionReason = `[Agent Review Rejection] ${textVerdict.reason} Fix guidance: ${textVerdict.fix}`;
				return {
					output: finalText,
					content: finalText,
					summary: rejectionReason,
					modifiedFiles: Array.from(modifiedFiles),
					failed: true,
					failureReason: rejectionReason,
					failureKind: "rejected",
					harnessId: runHarnessId,
					fallbackStageId: null,
					logEntries: streamer.snapshot().entries,
				};
			}
			eventBridge.emitSystemLog?.(
				resolvedProjectId,
				`[WARN] Stage verdict FAIL ignored (fail-open): the verdict block has no usable reason/fix guidance, so the stage passes. A failure without guidance is never recorded — see the stage report for the full output.`,
				{
					projectId: resolvedProjectId,
					taskId,
					tag: "[WARN]",
					level: "warn",
				},
			);
		}

		// No verdict rendered (or a malformed block the parser ignored):
		// fail open. Stages default to passing — only the failure skill or
		// a well-formed FAIL block fails a stage.
		const summary =
			finalText.length > 300 ? `${finalText.slice(0, 300)}...` : finalText;

		return {
			output: finalText,
			content: finalText,
			summary,
			modifiedFiles: Array.from(modifiedFiles),
			failed: false,
			failureReason: null,
			failureKind: "none",
			harnessId: runHarnessId,
			// Agent-initiated failures never dictate the fallback stage; the
			// stage config's failback policy is authoritative.
			fallbackStageId: null,
			// Structured grouped log entries for this stage run (see
			// api/agent/logStream/agentLogStreamer.js) — the task store mirrors
			// them into task.logEntries.
			logEntries: streamer.snapshot().entries,
		};
	};
}
