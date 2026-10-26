import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { eventBridge } from "./eventBridge.js";
import { config } from "./config.js";
import {
	DEFAULT_HARNESS,
	getHarnessByName,
	hasHarness,
	resolveHarnessForProject,
} from "./agent/harnessRegistry.js";
import {
	ALIAS_HARNESS_ID,
	normalizeAliasName,
} from "../shared/modelAliases.js";
import { selectAliasTarget } from "./aliasSelector.js";
import { createReferenceMockSession } from "./agent/harnesses/mock/mockHarness.js";
import { resolveSessionsDir } from "./kainbainDir.js";

/***
 * MARK: SessionStore
 * @description Disk-backed, per-project session registry with TTL cleanup.
 *
 * The store owns the SESSION LIFECYCLE: the per-project registry, TTL sweep,
 * socket tracking, and session-directory policy. Session CREATION is delegated
 * to the configured agent harness (resolved per project via the harness
 * registry — `project.harness` → `config.defaultHarness` → "pi") so the store
 * never talks to a harness SDK directly. Each project owns a dedicated session
 * directory so that:
 *   - Conversation history survives server restarts (resumed by the harness
 *     from the persisted session list).
 *   - Sessions are fully isolated per project (own cwd + agentDir).
 *   - Idle sessions with no active WebSocket connections are disposed after a
 *     configurable TTL to prevent zombie processes.
 ***/

/** Registry key for the injected harness test seam (never a real harness id). */
const INJECTED_HARNESS_KEY = "__injected__";

/** `${projectId}:${aliasName}` keys already warned about, so a hot loop cannot spam logs. */
const warnedUnknownProjectAliases = new Set();

/***
 * MARK: warnUnknownProjectAlias
 * @description Emits the unresolvable-alias warning once per (project, alias
 *   name) pair: the alias NAME is named (never the virtual `"alias"` harness
 *   id) with the fallback harness and the Settings fix. Mirrors the
 *   unknown-harness warning channel (console.warn + a [SYSTEM] process-log
 *   line) and the dispatch-side wording in `api/agentRunner.js`.
 * @example warnUnknownProjectAlias(project, "ghost") // warns once, then stays quiet
 * @param {Object} [project] - The project entity.
 * @param {unknown} rawName - The alias name that failed to resolve (blank reads as "(blank)").
 * @param {string} [fallbackName] - The harness actually used.
 * @returns {void}
 ***/
function warnUnknownProjectAlias(
	project,
	rawName,
	fallbackName = DEFAULT_HARNESS,
) {
	const aliasName = normalizeAliasName(rawName) || "(blank)";
	const projectId = project?.id || "system";
	const dedupeKey = `${projectId}:${aliasName}`;
	if (warnedUnknownProjectAliases.has(dedupeKey)) return;
	warnedUnknownProjectAliases.add(dedupeKey);
	const projectLabel = project?.name
		? `${project.name} (${projectId})`
		: projectId;
	const message = `[SYSTEM] Unknown model alias "${aliasName}" for project ${projectLabel}; falling back to "${fallbackName}". Update the alias in Settings › Model Aliases.`;
	console.warn(message);
	eventBridge?.emitSystemLog?.(projectId, message);
}

const DEFAULT_TTL_MS = config.sessionTtlMs; // idle before disposal
const CLEANUP_INTERVAL_MS = config.sessionCleanupMs; // sweep interval

export class SessionStore {
	/***
	 * MARK: constructor
	 * @description Initializes the SessionStore with TTL configurations and optional mock creators.
	 * @example new SessionStore({ ttlMs: 60000 })
	 * @param {Object} [opts]
	 * @param {number} [opts.ttlMs] - Idle TTL before a session is disposed.
	 * @param {string} [opts.baseDir] - Override the base session directory.
	 * @param {Function} [opts.createSession] - Optional function that returns a session object (test seam; wins over the harness).
	 * @param {Object} [opts.harness] - Test seam: pins ONE harness for every project, bypassing the registry.
	 ***/
	constructor({ ttlMs = DEFAULT_TTL_MS, baseDir, createSession, harness } = {}) {
		this.sessions = new Map(); // projectId -> { session, lastActive, sockets:Set }
		this.ttlMs = ttlMs;
		this.baseDir = baseDir || null;
		this.createSession = createSession || null;
		this.harness = harness || null;
		// harness name -> ModelRuntime. Keyed per harness (not one global) so a
		// future harness's model caches never bleed into pi's runtime (or vice versa).
		this.modelRuntimes = new Map();
		this.cleanupTimer = null;
	}

	/***
	 * MARK: _resolveHarness
	 * @description Picks the harness for a run: the injected test harness
	 *   when one was pinned, otherwise the registry's per-run resolution
	 *   (explicit `harnessName` stage override → project.harness →
	 *   config.defaultHarness → "pi", with warning + fallback for unknown
	 *   names — an unknown stage override degrades to the project resolution).
	 * @example sessionStore._resolveHarness(project).harness
	 * @example sessionStore._resolveHarness(project, "custom").harness
	 * @param {Object} [project]
	 * @param {string} [harnessName] - Explicit per-stage override (blank = inherit).
	 * @param {Object} [opts]
	 * @param {boolean} [opts.peek] - Display-only read: reports the alias rotation's next harness without consuming a step.
	 * @returns {{name: string, harness: Object}} The resolved harness name and instance.
	 ***/
	_resolveHarness(project, harnessName, { peek } = {}) {
		if (this.harness) {
			// Injected harnesses are pinned store-wide (test seam): one instance,
			// one runtime key, independent of registered harness names.
			return { name: INJECTED_HARNESS_KEY, harness: this.harness };
		}
		// Project-level model alias: the project default lives on the virtual
		// `alias` harness, so resolve it to the alias's concrete harness here.
		// Per-stage alias refs (`harness: "alias"` + `model: "<name>"`) never
		// enter through this bare-override path — dispatch resolves them via
		// `resolveStageTarget` (api/agentRunner.js) and display reads via
		// `resolveDisplayHarness` (below), where the model name is in context.
		// A bare "alias" override arriving here has no name to resolve and
		// degrades through the registry's loud unknown-harness fallback.
		const override =
			typeof harnessName === "string" ? harnessName.trim() : "";
		const projectChoice =
			typeof project?.harness === "string" ? project.harness.trim() : "";
		if (!override && projectChoice === ALIAS_HARNESS_ID) {
			const picked = selectAliasTarget(project, project?.defaultModel, {
				isHarnessKnown: (name) => hasHarness(name),
				peek,
			});
			if (picked) {
				return {
					name: picked.harness,
					harness: getHarnessByName(picked.harness),
				};
			}
			// The project default names no resolvable alias (unknown/deleted
			// name, blank, or every target on an unknown harness): warn
			// naming the ALIAS — never the virtual harness id — and serve
			// the built-in default so the project still loads and runs.
			warnUnknownProjectAlias(project, project?.defaultModel);
			return {
				name: DEFAULT_HARNESS,
				harness: getHarnessByName(DEFAULT_HARNESS),
			};
		}
		return resolveHarnessForProject(project, { harnessName });
	}

	/***
	 * MARK: getHarness
	 * @description Returns the harness for a run (or for a project-agnostic
	 *   caller when no project is passed): the injected harness wins, otherwise
	 *   the registry resolves per run and memoizes one instance per harness name.
	 * @example sessionStore.getHarness(project).createSession(project)
	 * @example sessionStore.getHarness(project, stage?.harness).createSession(project)
	 * @param {Object} [project] - The project entity (its optional `harness` field drives the resolution).
	 * @param {string} [harnessName] - Explicit per-stage override (blank = inherit).
	 * @param {Object} [opts]
	 * @param {boolean} [opts.peek] - Display-only read: reports the alias rotation's next harness without consuming a step.
	 * @returns {Object} The AgentHarness.
	 ***/
	getHarness(project, harnessName, opts) {
		return this._resolveHarness(project, harnessName, opts).harness;
	}

	/***
	 * MARK: resolveDisplayTarget
	 * @description THE single entry for model-aware display reads (dashboards,
	 *   queue listings): resolves the FULL alias pick for a project + stage
	 *   pair — the display analogue of dispatch's `resolveStageTarget`
	 *   (`api/agentRunner.js`) — peeking at alias rotations without consuming
	 *   a step. Takes the whole stage (not just its harness id) so a
	 *   per-stage alias reference (`harness: "alias"` + `model: "<name>"`)
	 *   and an inherited project-default alias resolve to the alias's
	 *   concrete target (harness + model together, never two rotation steps
	 *   that could land on different targets).
	 *
	 *   `modelRef` is the effective stage-slot model and `projectModelRef`
	 *   the effective project-slot model for the existing configured-model
	 *   fallback chain, mirroring dispatch exactly: an alias NAME never
	 *   occupies either slot (a resolved alias substitutes its pick's model
	 *   and suppresses the project slot — dispatch never consults the
	 *   project default there; a missing alias clears its own slot and falls
	 *   back to the peek-resolved project-default target, or to nothing when
	 *   that is itself an unresolvable alias). Non-alias pairs pass both
	 *   slots through byte-identically. A blank pick model (self-managed
	 *   `none` harness) flows through as `""` so the `none` path reports
	 *   harness-managed with no invented model.
	 * @example sessionStore.resolveDisplayTarget(project, { harness: "alias", model: "small" }, { peek: true }).aliasName => "small"
	 * @param {Object} [project] - The project entity (`harness`, `defaultModel`, `modelAliases`).
	 * @param {Object} [stage] - The stage entity (`harness` override, `model` naming the alias when the override is `"alias"`).
	 * @param {Object} [opts]
	 * @param {boolean} [opts.peek] - Display-only read: reports the alias rotation's next target without consuming a step.
	 * @returns {{harnessName: string, harness: Object, modelRef: string|undefined, projectModelRef: string|undefined, aliasName: string|null, aliasMissing: string|null, targetIndex: number|null}} The resolved display target.
	 ***/
	resolveDisplayTarget(project, stage, { peek } = {}) {
		if (this.harness) {
			// Pinned test seam answers for every name (mirrors _resolveHarness).
			return {
				harnessName: INJECTED_HARNESS_KEY,
				harness: this.harness,
				modelRef: stage?.model,
				projectModelRef: project?.defaultModel,
				aliasName: null,
				aliasMissing: null,
				targetIndex: null,
			};
		}
		const isKnown = (name) => hasHarness(name);
		const stageHarness =
			typeof stage?.harness === "string" ? stage.harness.trim() : "";
		if (stageHarness === ALIAS_HARNESS_ID) {
			// Explicit per-stage alias reference: resolve it HERE, where the
			// model name is in context (the session layer never sees it).
			const aliasName = normalizeAliasName(stage?.model);
			const picked = selectAliasTarget(project, stage?.model, {
				isHarnessKnown: isKnown,
				peek,
			});
			if (picked) {
				return {
					harnessName: picked.harness,
					harness: getHarnessByName(picked.harness),
					modelRef: picked.model,
					projectModelRef: undefined,
					aliasName: picked.aliasName,
					aliasMissing: null,
					targetIndex: picked.targetIndex,
				};
			}
			// Unknown/deleted alias: show the project resolution instead
			// (still peeking — a display read never consumes a rotation) and
			// warn naming the alias (never the virtual harness id) with the
			// fallback actually shown. The alias name clears the stage slot;
			// the project slot carries the fallback actually used
			// (peek-resolved when the project default is itself an alias, so
			// an alias name never shows as a model).
			const fallback = this._resolveHarness(project, undefined, { peek });
			warnUnknownProjectAlias(project, stage?.model, fallback.name);
			const projectChoice =
				typeof project?.harness === "string" ? project.harness.trim() : "";
			const projectModelRef =
				projectChoice === ALIAS_HARNESS_ID
					? selectAliasTarget(project, project?.defaultModel, {
							isHarnessKnown: isKnown,
							peek,
						})?.model
					: project?.defaultModel;
			return {
				harnessName: fallback.name,
				harness: fallback.harness,
				modelRef: undefined,
				projectModelRef,
				aliasName: aliasName || null,
				aliasMissing: aliasName || "(blank)",
				targetIndex: null,
			};
		}
		const projectChoice =
			typeof project?.harness === "string" ? project.harness.trim() : "";
		if (!stageHarness && projectChoice === ALIAS_HARNESS_ID) {
			// Inherited project-default alias: resolve the alias's rotation
			// pick HERE (harness AND model together) so both halves of the
			// display serve the SAME weighted target instead of consuming
			// two rotation steps that could land on different targets. The
			// stage model is ignored here exactly as dispatch ignores it
			// (`resolveStageTarget`'s inherited branch serves the alias pick).
			const aliasName = normalizeAliasName(project?.defaultModel);
			const picked = selectAliasTarget(project, project?.defaultModel, {
				isHarnessKnown: isKnown,
				peek,
			});
			if (picked) {
				return {
					harnessName: picked.harness,
					harness: getHarnessByName(picked.harness),
					modelRef: picked.model,
					projectModelRef: undefined,
					aliasName: picked.aliasName,
					aliasMissing: null,
					targetIndex: picked.targetIndex,
				};
			}
			// The project default names no resolvable alias: warn naming the
			// ALIAS — never the virtual harness id — and serve the built-in
			// default with both model slots cleared, so the alias name never
			// shows as a model (mirrors `_resolveHarness`'s fallback).
			warnUnknownProjectAlias(project, project?.defaultModel);
			return {
				harnessName: DEFAULT_HARNESS,
				harness: getHarnessByName(DEFAULT_HARNESS),
				modelRef: undefined,
				projectModelRef: undefined,
				aliasName: aliasName || null,
				aliasMissing: aliasName || "(blank)",
				targetIndex: null,
			};
		}
		const resolved = this._resolveHarness(project, stage?.harness, { peek });
		return {
			harnessName: resolved.name,
			harness: resolved.harness,
			modelRef: stage?.model,
			projectModelRef: project?.defaultModel,
			aliasName: null,
			aliasMissing: null,
			targetIndex: null,
		};
	}

	/***
	 * MARK: resolveDisplayHarness
	 * @description Model-aware display read returning the harness half of
	 *   `resolveDisplayTarget` (dashboards, queue listings): resolves which
	 *   harness label a project + stage pair shows, peeking at alias
	 *   rotations without consuming a step. Callers needing the picked model
	 *   or the alias identity must prefer `resolveDisplayTarget`; callers
	 *   needing only the harness label keep working unchanged through this
	 *   delegating wrapper. Callers must prefer either over `_resolveHarness`
	 *   whenever the stage is in context — a bare `"alias"` override passed to
	 *   `_resolveHarness` has no name to resolve and degrades loudly.
	 * @example sessionStore.resolveDisplayHarness(project, stage, { peek: true }).name => "pi"
	 * @example sessionStore.resolveDisplayHarness(project, { harness: "alias", model: "small" }, { peek: true }).name => "pi"
	 * @param {Object} [project] - The project entity (`harness`, `defaultModel`, `modelAliases`).
	 * @param {Object} [stage] - The stage entity (`harness` override, `model` naming the alias when the override is `"alias"`).
	 * @param {Object} [opts]
	 * @param {boolean} [opts.peek] - Display-only read: reports the alias rotation's next harness without consuming a step.
	 * @returns {{name: string, harness: Object}} The resolved harness name and instance.
	 ***/
	resolveDisplayHarness(project, stage, { peek } = {}) {
		const target = this.resolveDisplayTarget(project, stage, { peek });
		return { name: target.harnessName, harness: target.harness };
	}

	/***
	 * MARK: _sessionKey
	 * @description Builds a composite session key when a task id is present to isolate concurrent or alternating tasks.
	 * @param {string} projectId
	 * @param {string} [taskId]
	 * @returns {string}
	 ***/
	_sessionKey(projectId, taskId) {
		return taskId ? `${projectId}:${taskId}` : projectId;
	}

	/***
	 * MARK: sessionDirFor
	 * @description Resolves the dedicated session directory for a project.
	 * @example sessionStore.sessionDirFor(project) => '/path/to/.kainbain/sessions'
	 * @param {Object} project
	 * @returns {string}
	 ***/
	sessionDirFor(project) {
		if (this.baseDir) {
			return path.join(this.baseDir, project.id);
		}
		const base = project.cwd || project.agentDir || process.cwd();
		return resolveSessionsDir(base, project) || path.join(base, ".kainbain", "sessions");
	}

	/***
	 * MARK: getOrCreate
	 * @description Retrieves or creates an AgentSession for the given project.
	 * @example await sessionStore.getOrCreate(project) => session
	 * @param {Object} project
	 * @param {Object} [meta]
	 * @returns {Promise<Object>} The AgentSession.
	 ***/
	async getOrCreate(project, { taskId, stageId } = {}) {
		const key = this._sessionKey(project.id, taskId);
		const existing = this.sessions.get(key) || this.sessions.get(project.id);
		if (existing) {
			existing.lastActive = Date.now();
			return existing.session;
		}
		const session = await this._create(project, { taskId, stageId });
		const entry = {
			session,
			lastActive: Date.now(),
			sockets: new Set(),
			unsubs: Array.isArray(session.__unsubs) ? session.__unsubs : [],
		};
		this.sessions.set(key, entry);
		this.sessions.set(project.id, entry);
		return session;
	}

	/***
	 * MARK: getModelRuntime
	 * @description Returns the model runtime for the project's resolved harness —
	 *   the single source of truth for which models stage sessions can resolve.
	 *   Runtimes are cached per harness name so each harness type owns its own
	 *   model cache; the project's harness choice decides which runtime is served.
	 * @example await sessionStore.getModelRuntime(project) => ModelRuntime
	 * @param {Object} [project] - The project entity (its optional `harness` field drives the resolution).
	 * @returns {Promise<Object>} The ModelRuntime for the resolved harness.
	 ***/
	async getModelRuntime(project) {
		const { name, harness } = this._resolveHarness(project);
		if (!this.modelRuntimes.has(name)) {
			// A harness without model control (e.g. the custom-command harness)
			// reports null instead of throwing: model routes treat that as "no
			// harness models" and serve their curated fallback list.
			const runtime =
				typeof harness.modelRuntime === "function"
					? await harness.modelRuntime()
					: null;
			this.modelRuntimes.set(name, runtime);
		}
		return this.modelRuntimes.get(name);
	}

	/***
	 * MARK: beginStageSession
	 * @description Starts a brand-new session for a stage execution (one fresh
	 *   session per stage) and makes it the active session for this task. The new
	 *  session's only context is the curated prompt for that stage — prior
	 *  stages contribute only their distilled report artifacts, never their
	 *  research history, preventing context rot and cross-stage bias.
	 *   If a previous session for this task is still active or streaming, it is cleanly aborted
	 *   and disposed so the fresh stage execution runs unpolluted without affecting other tasks.
	 *   The session runs on the stage's harness override when set
	 *   (`meta.harness`, i.e. `stage.harness`), otherwise the project harness —
	 *   so a visual-debugging stage can run antigravity while the rest of the
	 *   pipeline stays on pi.
	 * @example await sessionStore.beginStageSession(project, { taskId, stageId }) => session
	 * @example await sessionStore.beginStageSession(project, { taskId, stageId, harness: "custom" }) => session
	 * @param {Object} project - The project entity (cwd/agentDir).
	 * @param {Object} [meta] - Run metadata used for the session label.
	 * @param {string} [meta.taskId] - Task the stage belongs to.
	 * @param {string} [meta.stageId] - Stage being executed.
	 * @param {string} [meta.harness] - Per-stage harness override (blank = inherit the project harness).
	 * @param {string} [meta.model] - Dispatch-resolved model ref (the harness
	 *   half's companion): forwarded to `harness.createSession` so the harness
	 *   pins the dispatch target instead of re-resolving the project default
	 *   against its own catalog. Absent for non-dispatch callers.
	 * @returns {Promise<Object>} The fresh AgentSession.
	 ***/
	async beginStageSession(project, { taskId, stageId, harness, model } = {}) {
		const key = this._sessionKey(project.id, taskId);
		const existingTaskSession = this.sessions.get(key);
		const existingProjectSession = this.sessions.get(project.id);
		const sessionsToDispose = [];

		if (existingTaskSession) {
			sessionsToDispose.push(existingTaskSession);
		}
		if (
			existingProjectSession &&
			existingProjectSession !== existingTaskSession &&
			(!existingProjectSession.taskId || existingProjectSession.taskId === taskId)
		) {
			sessionsToDispose.push(existingProjectSession);
		}

		for (const entry of sessionsToDispose) {
			if (entry?.session) {
				try {
					if (typeof entry.session.abort === "function") {
						await entry.session.abort();
					}
				} catch (e) {
					// ignore abort errors
				}
				try {
					entry.session.dispose?.();
				} catch (e) {
					// ignore dispose errors
				}
			}
		}

		const preservedSockets =
			existingTaskSession?.sockets instanceof Set
				? new Set(existingTaskSession.sockets)
				: existingProjectSession?.sockets instanceof Set
					? new Set(existingProjectSession.sockets)
					: new Set();

		if (taskId) {
			await this.dispose(project.id, taskId);
			if (
				existingProjectSession &&
				(!existingProjectSession.taskId || existingProjectSession.taskId === taskId)
			) {
				this.sessions.delete(project.id);
			}
		} else {
			await this.dispose(project.id);
		}

		const session = await this._create(project, {
			taskId,
			stageId,
			harness,
			model,
		});
		for (const socket of preservedSockets) {
			eventBridge.subscribe(project.id, socket);
		}
		const entry = {
			session,
			taskId: taskId || null,
			stageId: stageId || null,
			lastActive: Date.now(),
			// Carry over live UI sockets so an open activity console keeps
			// receiving events from the new stage session without reconnecting.
			sockets: preservedSockets,
			unsubs: Array.isArray(session.__unsubs) ? session.__unsubs : [],
		};
		this.sessions.set(key, entry);
		this.sessions.set(project.id, entry);
		return session;
	}

	/***
	 * MARK: _create
	 * @description Creates or resumes an AgentSession instance via the run's
	 *   harness (the stage override when set, otherwise the project's
	 *   configured harness, resolved through the registry; existing live
	 *   sessions are unaffected until disposal — a harness change applies on
	 *   the next session creation), then wires its events into the event
	 *   bridge. Tests may inject a mock session creator instead.
	 * @example await sessionStore._create(project) => session
	 * @example await sessionStore._create(project, { taskId, stageId, harness: "custom" }) => session
	 * @param {Object} project
	 * @param {Object} [meta]
	 * @param {string} [meta.harness] - Per-stage harness override (blank = inherit).
	 * @param {string} [meta.model] - Dispatch-resolved model ref, forwarded to
	 *   `harness.createSession` (target hand-off); absent for non-dispatch
	 *   creators, which keep the harness's `resolveInitialModel` behavior.
	 * @returns {Promise<Object>}
	 ***/
	async _create(project, { taskId, stageId, harness, model } = {}) {
		let session;
		// Tests inject a mock session creator so no real model runtime is spun up.
		if (this.createSession) {
			session = await this.createSession(project, {
				taskId,
				stageId,
				harness,
				model,
			});
		} else {
			session = await this.getHarness(project, harness).createSession(project, {
				taskId,
				stageId,
				sessionDir: this.sessionDirFor(project),
				...(model !== undefined ? { model } : {}),
			});
		}

		const unsubs = [];
		// Subscribe the session to the event bridge.
		if (typeof session?.subscribe === "function") {
			const unsub = session.subscribe((event) => {
				if (event && event.type) {
					eventBridge.handleAgentEvent(project.id, event.type, event);
				}
			});
			if (typeof unsub === "function") {
				unsubs.push(unsub);
			}
		}
		if (typeof session?.on === "function") {
			const eventHandler = (eventName, payload) => {
				eventBridge.handleAgentEvent(project.id, eventName, payload);
			};
			const onUnsub = session.on("event", eventHandler);
			if (typeof onUnsub === "function") {
				unsubs.push(onUnsub);
			} else {
				unsubs.push(() => {
					if (typeof session.off === "function") {
						session.off("event", eventHandler);
					} else if (typeof session.removeListener === "function") {
						session.removeListener("event", eventHandler);
					}
				});
			}
		}

		if (session) {
			session.__unsubs = unsubs;
		}

		return session;
	}

	/***
	 * MARK: get
	 * @description Retrieves a live session without creating a new instance.
	 * @example sessionStore.get('proj-1') => session
	 * @param {string} projectId
	 * @param {string} [taskId]
	 * @returns {Object|undefined}
	 ***/
	get(projectId, taskId) {
		const key = this._sessionKey(projectId, taskId);
		return (
			this.sessions.get(key)?.session || this.sessions.get(projectId)?.session
		);
	}

	/***
	 * MARK: touch
	 * @description Marks a session as recently active (heartbeat).
	 * @example sessionStore.touch('proj-1')
	 * @param {string} projectId
	 ***/
	touch(projectId) {
		const entry = this.sessions.get(projectId);
		if (entry) entry.lastActive = Date.now();
	}

	/***
	 * MARK: subscribe
	 * @description Registers a WebSocket connection for a session to keep it alive.
	 * @example sessionStore.subscribe('proj-1', socket)
	 * @param {string} projectId
	 * @param {Object} socket
	 ***/
	subscribe(projectId, socket) {
		const entry = this.sessions.get(projectId);
		if (entry) {
			if (!entry.sockets) entry.sockets = new Set();
			entry.sockets.add(socket);
			entry.lastActive = Date.now();
		}
	}

	/***
	 * MARK: unsubscribe
	 * @description Unregisters a WebSocket connection from a session.
	 * @example sessionStore.unsubscribe('proj-1', socket)
	 * @param {string} projectId
	 * @param {Object} socket
	 ***/
	unsubscribe(projectId, socket) {
		const entry = this.sessions.get(projectId);
		if (entry && entry.sockets) {
			entry.sockets.delete(socket);
			entry.lastActive = Date.now();
		}
	}

	/***
	 * MARK: dispose
	 * @description Disposes a session, disconnecting events and removing registry entries.
	 * @example await sessionStore.dispose('proj-1')
	 * @param {string} projectId
	 * @param {string} [taskId]
	 ***/
	async dispose(projectId, taskId) {
		const keysToDispose = taskId
			? [this._sessionKey(projectId, taskId)]
			: [
					projectId,
					...Array.from(this.sessions.keys()).filter((k) =>
						k.startsWith(`${projectId}:`),
					),
				];

		for (const key of keysToDispose) {
			const entry = this.sessions.get(key);
			if (!entry) continue;
			try {
				if (typeof entry.session?.abort === "function") {
					await entry.session.abort();
				}
			} catch (e) {
				// ignore abort errors
			}
			if (Array.isArray(entry.unsubs)) {
				for (const unsub of entry.unsubs) {
					try {
						if (typeof unsub === "function") unsub();
					} catch (e) {
						// ignore unsubscribe errors
					}
				}
				entry.unsubs.length = 0;
			}
			try {
				entry.session?.dispose?.();
			} catch (e) {
				// ignore dispose errors
			}
			if (entry.sockets && typeof entry.sockets.clear === "function") {
				entry.sockets.clear();
			}
			entry.sockets = null;
			entry.session = null;
			this.sessions.delete(key);
		}
		if (!taskId) {
			eventBridge.clearSession(projectId);
		}
	}

	/***
	 * MARK: clearSession
	 * @description Disposes a session AND deletes its disk-backed history.
	 * @example await sessionStore.clearSession(project)
	 * @param {Object} project
	 ***/
	async clearSession(project) {
		await this.dispose(project.id);
		const sessionDir = this.sessionDirFor(project);
		try {
			fs.rmSync(sessionDir, { recursive: true, force: true });
		} catch (e) {
			// ignore cleanup errors
		}
	}

	/***
	 * MARK: startCleanup
	 * @description Starts the periodic TTL sweep disposing idle sessions with no open sockets.
	 *   Task-scoped entries are disposed via their project id so the project alias
	 *   entry is removed in the same sweep instead of being left as a stale
	 *   half-disposed entry that the next sweep tick would crash on.
	 * @example sessionStore.startCleanup()
	 ***/
	startCleanup() {
		if (this.cleanupTimer) return;
		this.cleanupTimer = setInterval(() => {
			const now = Date.now();
			for (const [key, entry] of this.sessions) {
				const idle = now - entry.lastActive;
				if (idle > this.ttlMs && (!entry.sockets || entry.sockets.size === 0)) {
					const projectId = key.includes(":") ? key.slice(0, key.indexOf(":")) : key;
					this.dispose(projectId);
				}
			}
		}, CLEANUP_INTERVAL_MS);
		if (this.cleanupTimer.unref) this.cleanupTimer.unref();
	}

	/***
	 * MARK: stopCleanup
	 * @description Stops the periodic TTL sweep timer.
	 * @example sessionStore.stopCleanup()
	 ***/
	stopCleanup() {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = null;
		}
	}

	/***
	 * MARK: getSessionStatus
	 * @description Inspects session status including memory state, socket connections, and disk storage metadata.
	 * @example await sessionStore.getSessionStatus(project) => { active: true, diskSessionExists: true, ... }
	 * @param {Object} project
	 * @returns {Promise<Object>}
	 ***/
	async getSessionStatus(project) {
		const entry = this.sessions.get(project.id);
		const sessionDir = this.sessionDirFor(project);
		let diskSessionExists = false;
		let sessionCount = 0;
		let latestSession = null;

		/* eslint-disable security/detect-non-literal-fs-filename */
		try {
			if (fs.existsSync(sessionDir)) {
				const files = fs.readdirSync(sessionDir);
				sessionCount = files.length;
				diskSessionExists = files.length > 0;
				if (diskSessionExists) {
					const stats = files.map((f) => {
						const fp = path.join(sessionDir, f);
						const st = fs.statSync(fp);
						return { name: f, path: fp, modified: st.mtimeMs };
					});
					stats.sort((a, b) => b.modified - a.modified);
					latestSession = stats[0] || null;
				}
			}
		} catch {
			// fallback if fs read fails
		}
		/* eslint-enable security/detect-non-literal-fs-filename */

		const messageCount = Array.isArray(entry?.session?.messages)
			? entry.session.messages.length
			: 0;

		return {
			projectId: project.id,
			active: Boolean(entry),
			isStreaming: entry?.session?.isStreaming === true,
			socketsCount: entry?.sockets ? entry.sockets.size : 0,
			lastActive: entry?.lastActive || null,
			messageCount,
			diskSessionExists,
			sessionCount,
			latestSession,
		};
	}

	/***
	 * MARK: readSessionHistoryFromDisk
	 * @description Lightweight reader that extracts messages and the entry tree
	 *   directly from persisted disk storage (.kainbain/sessions/) without
	 *   instantiating a live session, model runtime, tool extensions, or RPC
	 *   bindings. Delegates the persisted-format reading to the harness.
	 * @example await sessionStore.readSessionHistoryFromDisk(project) => { messages: [], tree: [] }
	 * @param {Object} project - The project entity (cwd/agentDir/id).
	 * @returns {Promise<{messages: Array, tree: Array}>} The messages and entry tree from disk.
	 ***/
	async readSessionHistoryFromDisk(project) {
		return this.getHarness(project).readHistoryFromDisk(
			project,
			this.sessionDirFor(project),
		);
	}

	/***
	 * MARK: getSessionHistory
	 * @description Returns session history (messages and tree) for a project.
	 *   If an active session is in memory, reads live state; otherwise reads
	 *   from disk without instantiating a model runtime or agent session.
	 * @example await sessionStore.getSessionHistory(project) => { messages: [], tree: [], isStreaming: boolean }
	 * @param {Object} project
	 * @returns {Promise<{messages: Array, tree: Array, isStreaming: boolean}>}
	 ***/
	async getSessionHistory(project) {
		const active = this.get(project.id);
		if (active) {
			const tree = active.sessionManager?.getEntries?.() || [];
			const messages = active.messages || [];
			return {
				messages,
				tree,
				isStreaming: active.isStreaming === true,
			};
		}
		const disk = await this.readSessionHistoryFromDisk(project);
		return {
			messages: disk.messages || [],
			tree: disk.tree || [],
			isStreaming: false,
		};
	}

	/***
	 * MARK: restoreSession
	 * @description Forces reload of a project's session from disk, replacing any stale in-memory instance.
	 * @example await sessionStore.restoreSession(project) => session
	 * @param {Object} project
	 * @returns {Promise<Object>}
	 ***/
	async restoreSession(project) {
		await this.dispose(project.id);
		return this.getOrCreate(project);
	}

	/***
	 * MARK: size
	 * @description Returns the number of currently active in-memory sessions.
	 * @example sessionStore.size => 1
	 * @returns {number}
	 ***/
	get size() {
		return this.sessions.size;
	}
}

/***
 * MARK: TEST ENV CONTRACT — NODE_ENV=test is required (pinned by vitest config)
 * @description The api test suite MUST run with NODE_ENV=test (e.g.
 *   `npm run test:api` or `NODE_ENV=test npx vitest run`). The
 *   mock-session seam below is keyed on it: under NODE_ENV=test the store
 *   uses `testSessionFactory` and a throwaway session dir under os.tmpdir();
 *   running the suite bare spins up REAL pi sessions through the resolved
 *   harness — they prompt real model runtimes and write session files into
 *   the real on-disk session directories, polluting live data and the
 *   shared working directory (this is what made the cold-history route
 *   test flake: stale files beat its pinned fixture because disk-history
 *   picks by in-file activity timestamps, not fs mtime).
 *
 *   The env value is PINNED, not defaulted: `api/vitest.config.js` sets
 *   `test.env.NODE_ENV = "test"` unconditionally (vitest's own default only
 *   fills an unset variable, so an inherited NODE_ENV=production used to
 *   silently disengage this seam). `api/testEnvGuard.test.js` fails loudly
 *   if the pin ever stops landing before this module is imported. Tests
 *   that truly prompt a session are additionally skipIf-gated on the env
 *   (see the TEST ENV CONTRACT references in the route suites) so bare,
 *   outside-vitest runs degrade to skips instead of live runtimes.
 *
 *   The mock lives in `api/agent/harnesses/mock/mockHarness.js` (ONE
 *   reference implementation, held to the same
 *   `runSessionContractTests` acceptance gate as the pi harness) and
 *   deliberately MIRRORS real-harness (pi) semantics rather than being more
 *   permissive: `sessionManager.appendMessage(message)` seeds real entry
 *   ids (child of the current leaf, advancing it), the leaf pointer is
 *   observable via `sessionManager.getLeafId()`, and
 *   `navigateTree`/`sessionManager.branch` throw `Entry <id> not found` for
 *   unknown ids and MOVE THE LEAF without appending entries — exactly like
 *   pi (session-manager.js branch()). navigateTree additionally mirrors
 *   pi's user-message "re-edit" flow (agent-session.js navigateTree):
 *   navigating to a user message positions the leaf at that entry's PARENT
 *   (null = root), any other entry becomes the leaf itself, and navigating
 *   to the current leaf is a no-op. Route tests can therefore exercise the
 *   same 404 `entry_not_found` mapping and seeded-id/leaf flows they show
 *   real sessions, in both modes.
 ***/

/***
 * MARK: testSessionFactory
 * @description Builds a lightweight mock session that records prompts instead of
 *   invoking a real model runtime. Delegates to the shared, contract-tested
 *   reference mock (`api/agent/harnesses/mock/mockHarness.js`) so the test
 *   seam and every other mock consumer share ONE implementation held to the
 *   same acceptance gate as the pi harness.
 * @example testSessionFactory(project) => { messages: [], prompt: async (goal) => ... }
 * @param {Object} _project
 * @returns {Object} A contract-conforming mock session.
 ***/
function testSessionFactory(_project) {
	return createReferenceMockSession();
}

/***
 * MARK: isTestSeamActive
 * @description Reports whether the shared sessionStore singleton runs on the
 *   mock session seam (NODE_ENV=test) instead of the real harness. The
 *   test-environment guard (`api/testEnvGuard.test.js`) asserts this so a
 *   disengaged seam fails loudly instead of silently reaching the real
 *   model runtime.
 * @example isTestSeamActive() => true (under NODE_ENV=test)
 * @returns {boolean} True when the mock session seam is engaged.
 ***/
export function isTestSeamActive() {
	return typeof sessionStore.createSession === "function";
}

/***
 * MARK: sessionStore
 * @description Shared singleton SessionStore instance. NO harness is built or
 *   injected here: the registry lazily resolves the configured harness per
 *   project (pi by default), so the singleton never touches a harness SDK.
 *   AgentRunner and eventBridge only ever see contract sessions.
 ***/
export const sessionStore = new SessionStore({
	baseDir:
		process.env.NODE_ENV === "test"
			? path.join(os.tmpdir(), "kainbain-sessions-test")
			: null,
	createSession: process.env.NODE_ENV === "test" ? testSessionFactory : null,
});
