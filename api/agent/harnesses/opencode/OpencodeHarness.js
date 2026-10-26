import fs from "node:fs";
import path from "node:path";
import { discoverHarnesses } from "../../harnessDiscovery.js";
import { parseJsonLinesText } from "../shared/harnessScaffold.js";
import { opencodeServerForProject, activeOpencodeServerUrl } from "./OpencodeServerManager.js";
import { OpencodeModelDiscovery } from "./OpencodeModelDiscovery.js";
import { OpencodeSessionWrapper } from "./OpencodeSessionWrapper.js";
import { eventBridge as sharedEventBridge } from "../../../eventBridge.js";
import { config } from "../../../config/index.js";
import { resolveKainbainDir } from "../../../kainbainDir.js";
import {
	classifiesForeignHarness,
	normalizeModelRef,
	parseModelKey,
} from "../../../../shared/modelKeys.js";

/**
 * MARK: OpencodeHarness
 * @description The OpenCode AgentHarness: the engine's single entry point for
 *   creating OpenCode-backed sessions, discovering models from the server, and
 *   reading persisted history. Everything OpenCode-specific — SDK client
 *   construction, server spawning, SSE consumption, per-directory isolation —
 *   lives behind this module (with its sibling files); the engine only ever
 *   sees the AgentHarness / HarnessSession contract.
 *
 *   The SDK is imported lazily (inside the calls that need it) so registering
 *   this harness never loads the OpenCode SDK for pi-only deployments.
 */

const WARN_TAG = "[WARN]";

/** Stable harness identity (registry id + model-key scope). */
const HARNESS_ID = "opencode";

/** `${projectId}:${ref}` keys already warned about, so hot loops cannot spam logs. */
const warnedInitialModels = new Set();

/***
 * MARK: foreignHarnessOf
 * @description Names the owning harness when a stored ref is a canonical
 *   3-part key scoped to ANOTHER harness — null otherwise. Only the
 *   canonical form classifies; legacy 2-part and bare refs are
 *   harness-agnostic by design.
 * @example foreignHarnessOf('pi::google::m') => 'pi'
 * @param {unknown} ref - Any stored model reference.
 * @returns {string|null} The foreign harness id, or null.
 ***/
function foreignHarnessOf(ref) {
	if (!classifiesForeignHarness(ref, HARNESS_ID)) return null;
	return parseModelKey(String(ref).trim())?.harness || null;
}

/***
 * MARK: OPENCODE_TRANSCRIPT_FILENAME
 * @description Basename of the durable OpenCode conversation log inside the
 *   project's state folder.
 * @example OPENCODE_TRANSCRIPT_FILENAME === "opencode_transcript.jsonl"
 ***/
export const OPENCODE_TRANSCRIPT_FILENAME = "opencode_transcript.jsonl";

/***
 * MARK: defaultTranscriptPathFor
 * @description The project's OpenCode transcript JSONL path — the durable
 *   conversation log (`<cwd>/<kainbainDirName>/opencode_transcript.jsonl`),
 *   honouring the project's custom state folder.
 * @example defaultTranscriptPathFor({ cwd: "/repo" }) => "/repo/.kainbain/opencode_transcript.jsonl"
 * @param {Object} project - The project entity (cwd, kainbainDirName).
 * @returns {string} The transcript path.
 ***/
function defaultTranscriptPathFor(project) {
	const base = project?.cwd || process.cwd();
	const dir =
		resolveKainbainDir(base, project) || path.join(base, ".kainbain");
	return path.join(dir, OPENCODE_TRANSCRIPT_FILENAME);
}

/***
 * MARK: warnProject
 * @description Surfaces a harness warning in the activity console (the same
 *   visible-warning contract the pi harness uses for model problems).
 ***/
function warnProject(projectId, message) {
	sharedEventBridge?.emitSystemLog?.(projectId, message, {
		projectId,
		tag: WARN_TAG,
		level: "warn",
	});
}

/***
 * MARK: readTranscript
 * @description Reads the persisted transcript JSONL into engine conversation
 *   entries; tolerant of truncation (last partial line) and garbage.
 * @example readTranscript("/repo/.kainbain/opencode_transcript.jsonl") => [{ role, content }]
 * @param {string} transcriptPath
 * @returns {Array<{id?: string, role: string, content: string}>} The messages ([] when no transcript).
 ***/
function readTranscript(transcriptPath) {
	/* eslint-disable security/detect-non-literal-fs-filename -- transcript paths are derived from the trusted project cwd, mirroring the pi harness's session-directory handling */
	try {
		if (!fs.existsSync(transcriptPath)) return [];
		const raw = fs.readFileSync(transcriptPath, "utf8");
		const messages = [];
		// Line splitting + corrupt-line tolerance are owned by the shared
		// scaffold; this function keeps only the transcript entry shape.
		for (const entry of parseJsonLinesText(raw)) {
			if (entry?.message?.role && typeof entry.message.content === "string") {
				messages.push({
					id: entry.message.id,
					role: entry.message.role,
					content: entry.message.content,
				});
			}
		}
		return messages;
	} catch {
		return [];
	}
	/* eslint-enable security/detect-non-literal-fs-filename */
}

/***
 * MARK: lastSessionIdFromTranscript
 * @description The OpenCode session id of the most recent transcript entry —
 *   used to warm-start (continue the same server-side session) on interactive
 *   session creation.
 ***/
function lastSessionIdFromTranscript(transcriptPath) {
	/* eslint-disable security/detect-non-literal-fs-filename -- transcript paths are derived from the trusted project cwd */
	try {
		if (!fs.existsSync(transcriptPath)) return null;
		const raw = fs.readFileSync(transcriptPath, "utf8").trim();
		const lastLine = raw.split("\n").filter(Boolean).at(-1);
		if (!lastLine) return null;
		return JSON.parse(lastLine)?.sessionId || null;
	} catch {
		return null;
	}
	/* eslint-enable security/detect-non-literal-fs-filename */
}

/***
 * MARK: loadSdkClient
 * @description Lazily builds the OpenCode SDK client pointed at the server,
 *   scoped to the project directory (`x-opencode-directory`) and carrying the
 *   optional bearer password. Errors throw (errors are data, not undefined).
 * @example const client = await loadSdkClient({ baseUrl, directory: cwd })
 * @param {Object} opts
 * @param {string} opts.baseUrl - Server base URL.
 * @param {string} [opts.directory] - Project directory for isolation.
 * @param {string} [opts.password] - OPENCODE_SERVER_PASSWORD bearer guard.
 * @returns {Promise<Object>} The OpenCode SDK client.
 ***/
async function loadSdkClient({ baseUrl, directory, password }) {
	const { createOpencodeClient } = await import("@opencode-ai/sdk");
	const headers = {};
	if (password) headers.authorization = `Bearer ${password}`;
	return createOpencodeClient({
		baseUrl,
		directory,
		headers,
		throwOnError: true,
	});
}

/***
 * MARK: resolveServerSessionId
 * @description Resolves the server-side session to prompt: an existing session
	*   id is verified against the server (warm start across restarts); anything
	*   missing is created fresh.
 * @example await resolveServerSessionId(client, { resumeSessionId: "ses-1", title }) => "ses-1"
 * @param {Object} client - The OpenCode SDK client.
 * @param {Object} opts
 * @param {string} [opts.resumeSessionId] - Candidate existing session id.
 * @param {string} [opts.title] - Title for a newly created session.
 * @param {string} [opts.directory] - Project directory for the create call.
 * @returns {Promise<string>} A live server session id.
 ***/
async function resolveServerSessionId(client, { resumeSessionId, title, directory }) {
	if (resumeSessionId) {
		try {
			const existing = await client.session.get({
				path: { id: resumeSessionId },
				query: directory ? { directory } : undefined,
			});
			if (existing?.data?.id || existing?.id) return resumeSessionId;
		} catch {
			// Session gone (server data cleared) — create a fresh one below.
		}
	}
	const created = await client.session.create({
		body: { title: title || "KainBain session" },
		query: directory ? { directory } : undefined,
	});
	const payload = created?.data ?? created;
	const id = payload?.id;
	if (!id) {
		throw new Error("OpenCode server returned no session id from POST /session");
	}
	return id;
}

/***
 * MARK: createOpencodeHarness
 * @description Builds the OpenCode AgentHarness.
 * @example const harness = createOpencodeHarness({ eventBridge });
 * @example const session = await harness.createSession(project, { taskId, stageId });
 * @param {Object} [deps]
 * @param {Object} [deps.eventBridge] - EventBridge singleton (injected for tests).
 * @param {string} [deps.baseUrl] - Connect to a running server (else OPENCODE_URL, else spawn).
 * @param {number} [deps.port] - Port for spawned servers (default OS-assigned).
 * @param {number} [deps.modelsCacheTtlMs] - Model discovery cache TTL.
 * @param {Function} [deps.createClient] - Test seam overriding loadSdkClient.
 * @param {Function} [deps.spawnServer] - Test seam forwarded to the server manager.
 * @returns {Object} The AgentHarness for opencode.
 ***/
export function createOpencodeHarness({
	eventBridge,
	baseUrl,
	port,
	modelsCacheTtlMs,
	createClient,
	spawnServer,
} = {}) {
	const harness = {
		/***
		 * MARK: id
		 * @description Stable harness identity, matching the /harnesses registry
		 *   entry and the model-listing cache slot key. Also the first segment of
		 *   every harness-scoped model key (`opencode::provider::id`) — same
		 *   convention as the pi/antigravity harnesses.
		 ***/
		id: "opencode",

		/***
		 * MARK: name
		 * @description The registry id of this harness.
		 ***/
		name: "opencode",

		/***
		 * MARK: modelSelection
		 * @description Programmatic model catalogue (the OpenCode server's
		 *   provider list): the UI renders a model dropdown for this harness.
		 *   Without a reachable server the list is empty and the routes serve
		 *   the curated fallback so the picker never renders empty.
		 ***/
		modelSelection: "list",
		reasoningLevels: null,

		/***
		 * MARK: serverManagerFor
		 * @description The live per-project server manager (one server per cwd).
		 ***/
		serverManagerFor(project) {
			const manager = opencodeServerForProject(project, { baseUrl, port, spawnServer });
			return manager;
		},

		/***
		 * MARK: modelDiscoveryFor
		 * @description The per-project model discovery bound to the project's
		 *   server manager (shared cache per manager instance).
		 ***/
		modelDiscoveryFor(project) {
			const manager = harness.serverManagerFor(project);
			if (!manager.__discovery) {
				manager.__discovery = new OpencodeModelDiscovery({
					baseUrl: null, // resolved per call so a respawned server is picked up
					password: manager.password,
					cacheTtlMs: modelsCacheTtlMs,
					fetchModels: async () => {
						const url = await manager.ensureRunning();
						const client = await (createClient || loadSdkClient)({
							baseUrl: url,
							directory: manager.cwd,
							password: manager.password,
						});
						const result = await client.config.providers();
						return result?.data ?? result;
					},
				});
			}
			return manager.__discovery;
		},

		/***
		 * MARK: resolveInitialModel
		 * @description Resolves the project's stored default model against the
		 *   harness's discovered models. Unresolvable references warn visibly
		 *   (same contract as the pi harness) instead of silently swapping.
		 * @example await harness.resolveInitialModel(project) => model|null
		 ***/
		async resolveInitialModel(project) {
			const discovery = harness.modelDiscoveryFor(project);
			const ref = project?.defaultModel;
			// Stored references may predate harness-scoped keys: normalize
			// legacy `provider::id` values to this harness's canonical form
			// before resolving (bare ids/sentinels pass through untouched).
			const resolved = await discovery.resolveModelRef(
				normalizeModelRef(ref, HARNESS_ID),
			);
			if (!resolved && ref) {
				// A canonical key naming a DIFFERENT harness is not this
				// harness's default at all — one INFO line (deduped), never
				// the scary WARN. Anything else keeps the loud warning with
				// the cross-harness hint (deduped per project + ref).
				const foreign = foreignHarnessOf(ref);
				const dedupeKey = `${project?.id || "system"}:${ref}`;
				if (!warnedInitialModels.has(dedupeKey)) {
					warnedInitialModels.add(dedupeKey);
					if (foreign) {
						sharedEventBridge?.emitSystemLog?.(
							project.id,
							`[INFO] Configured model '${ref}' is scoped to harness '${foreign}', not opencode; the server's default model will be used for project '${project.name || project.id}'. Scope it with a Model Alias to silence this.`,
							{ projectId: project.id, tag: "[INFO]", level: "info" },
						);
					} else {
						warnProject(
							project.id,
							`${WARN_TAG} Configured model '${ref}' could not be resolved against the OpenCode server's provider list for project '${project.name || project.id}'; the server's default model will be used. Update the project default model in Settings (this model may belong to another harness — check Model Aliases / the project harness).`,
						);
					}
				}
			}
			return resolved;
		},

		/***
		 * MARK: createSession
		 * @description Creates (or warm-starts) an OpenCode-backed session for a
		 *   project and returns it wrapped to the HarnessSession contract.
		 *   Stage executions (taskId/stageId) always start a FRESH server
		 *   session; interactive sessions continue the latest persisted
		 *   transcript session when the server still knows it.
		 * @example await harness.createSession(project, { taskId, stageId }) => session
		 * @param {Object} project - The project entity (id/cwd/defaultModel).
		 * @param {Object} [meta]
		 * @param {string} [meta.taskId] - Task the stage belongs to (forces fresh).
		 * @param {string} [meta.stageId] - Stage being executed (forces fresh).
		 * @param {string} [meta.model] - Dispatch-resolved model ref: pinned
		 *   for the session, skipping `resolveInitialModel` (target hand-off).
		 * @returns {Promise<Object>} The contract-conforming session.
		 ***/
		async createSession(project, { taskId, stageId, model } = {}) {
			const manager = harness.serverManagerFor(project);
			const serverUrl = await manager.ensureRunning();
			const client = await (createClient || loadSdkClient)({
				baseUrl: serverUrl,
				directory: manager.cwd,
				password: manager.password,
			});

			const discovery = harness.modelDiscoveryFor(project);
			// TARGET HAND-OFF: a dispatch-resolved `model` is pinned for the
			// session and `resolveInitialModel` is skipped entirely (the
			// project default belongs to another harness's catalog for
			// cross-harness runs). Unresolvable hand-offs warn once and fall
			// back to the server's default — never a silent swap.
			let initialModel;
			if (typeof model === "string" && model.trim()) {
				initialModel = await discovery.resolveModelRef(
					normalizeModelRef(model, HARNESS_ID),
				);
				if (!initialModel) {
					warnProject(
						project.id,
						`${WARN_TAG} Dispatch-resolved model '${model}' could not be resolved against the OpenCode server's provider list for project '${project.name || project.id}'; the server's default model will be used.`,
					);
				}
			} else {
				// Warm the discovery cache so model resolution and the classic
				// modelRuntime fallback have data even on first use.
				initialModel = await harness.resolveInitialModel(project);
			}

			const transcriptPath = defaultTranscriptPathFor(project);
			const isStageRun = Boolean(taskId || stageId);
			const resumeSessionId = isStageRun
				? null
				: lastSessionIdFromTranscript(transcriptPath);

			const sessionId = await resolveServerSessionId(client, {
				resumeSessionId,
				title: isStageRun
					? `KainBain stage ${stageId || ""} ${taskId || ""}`.trim()
					: `KainBain project ${project.name || project.id}`,
				directory: manager.cwd,
			});

			const wrapper = new OpencodeSessionWrapper({
				client,
				sessionId,
				cwd: manager.cwd,
				model: initialModel,
				discovery,
				transcriptPath,
				project,
				onError: (message) =>
					eventBridge?.emitSystemLog?.(project.id, `${WARN_TAG} ${message}`, {
						projectId: project.id,
						tag: WARN_TAG,
						level: "warn",
					}),
			});

			// Establish the SSE stream BEFORE handing the session out so no
			// prompt can race the event subscription.
			wrapper.startEventStream();
			await wrapper.eventStreamReady;

			// Warm start: interactive sessions show prior conversation.
			if (!isStageRun) {
				const history = readTranscript(transcriptPath);
				if (history.length > 0) {
					wrapper.messages = history;
				}
			}

			return wrapper;
		},

		/***
		 * MARK: listModels
		 * @description The harness's model list — ONLY from an already-running
		 *   server (never spawns): an empty list rather than a startup cost when
		 *   OpenCode is not in use on this machine.
		 * @example await harness.listModels() => [{ provider, id, name, … }]
		 * @param {Object} [opts]
		 * @param {string} [opts.baseUrl] - Server URL override (tests).
		 * @returns {Promise<Array<Object>>} The models ([] when no server).
		 ***/
		async listModels({ baseUrl } = {}) {
			const url = baseUrl || activeOpencodeServerUrl(null);
			if (!url) return [];
			const discovery = new OpencodeModelDiscovery({
				baseUrl: url,
				password: config.opencodeServerPassword || null,
			});
			return discovery.listModels();
		},

		/***
		 * MARK: resolveModelRef
		 * @description Resolves a stored model reference against the harness's
		 *   discovered models (null when no server is reachable).
		 ***/
		/***
		 * MARK: getModelDiscoveryStatus
		 * @description Reports the harness's model-discovery health (`{ ok:
		 *   true }` or `{ ok: false, error: { code, message, hint } }`) from
		 *   the shared discovery module (connect mode via OPENCODE_URL needs
		 *   no binary; otherwise the opencode binary must resolve) — the
		 *   same source the `/harnesses` availability badge reads, so the
		 *   two can never disagree. An explicit factory `baseUrl` counts as
		 *   connect mode. Optional contract method: routes consult it when
		 *   present and serve the error alongside an empty catalogue.
		 * @example harness.getModelDiscoveryStatus() => { ok: true }
		 * @returns {Object} The discovery status.
		 ***/
		getModelDiscoveryStatus() {
			if (typeof baseUrl === "string" && baseUrl.trim()) return { ok: true };
			const entry = discoverHarnesses().find((row) => row.id === "opencode");
			if (!entry || entry.available !== false) return { ok: true };
			return {
				ok: false,
				error: {
					code: "OPENCODE_UNAVAILABLE",
					message:
						"No OpenCode server is running and no opencode binary was found.",
					hint:
						entry.hint ||
						"Install opencode (https://opencode.ai) or set OPENCODE_URL to a running server (KAINBAIN_OPENCODE_BIN pins the binary).",
				},
			};
		},

		async resolveModelRef(target, { baseUrl } = {}) {
			const url = baseUrl || activeOpencodeServerUrl(null);
			if (!url) return null;
			const discovery = new OpencodeModelDiscovery({
				baseUrl: url,
				password: config.opencodeServerPassword || null,
			});
			return discovery.resolveModelRef(target);
		},

		/***
		 * MARK: readHistoryFromDisk
		 * @description Reads the persisted transcript without instantiating a
		 *   live session or server. OpenCode has no client-side entry tree, so
		 *   the tree is empty by design.
		 * @example await harness.readHistoryFromDisk(project) => { messages: [], tree: [] }
		 * @param {Object} project - The project entity (cwd).
		 * @returns {Promise<{messages: Array, tree: Array}>} The history.
		 ***/
		async readHistoryFromDisk(project) {
			return {
				messages: readTranscript(defaultTranscriptPathFor(project)),
				tree: [],
			};
		},
	};

	return harness;
}

/** Re-exports for engine callers that only need the pure transcript reader. */
export { readTranscript, defaultTranscriptPathFor };