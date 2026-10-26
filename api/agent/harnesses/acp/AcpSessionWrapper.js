import { createAcpEventMapper } from "./AcpEventMapper.js";

/**
 * MARK: AcpSessionWrapper
 * @description Generic ACP-backed HarnessSession (`api/agent/harnessContract.js`):
 *   one long-lived bidirectional agent session over the runtime's JSON-RPC
 *   connection, instead of one CLI spawn per turn. Vendor quirks arrive via
 *   injected callbacks — this file names no binary, no model slug, and no
 *   vendor error text:
 *
 *   - `createRuntime(hooks)` builds + starts the session runtime (the flavor
 *     adapter points it at its binary/argv/env and handshake payloads).
 *   - `permissionPolicy(method, params)` answers agent-initiated requests
 *     (permission gates): the flavor maps project settings to allow/deny.
 *   - `inspectAssistantText(text)` traps vendor-specific swallowed transport
 *     failures smuggled inside assistant deltas (e.g. mid-turn "model
 *     unreachable" prose that resolves as a clean turn end).
 *   - `applySessionModel(runtime, sessionId, model)` is the OPTIONAL
 *     model-application seam for agents that cannot take a model on the
 *     prompt params: when supplied, the pinned model is applied through the
 *     hook once after `session/new` (and re-applied after a `switchModel`),
 *     and the prompt params carry no model. Absent, the current behavior
 *     (model on `session/prompt`) is unchanged.
 *   - `onUsage(usage)` receives the live `usage_update` telemetry the agent
 *     streams mid-turn (token counters, cost, steps, context-window use) so
 *     every flavor gets live feedback logging for free.
 *
 *   REQUIRED contract: prompt, subscribe, getMessages, getLastAssistantText,
 *   isStreaming, abort, dispose. OPTIONAL Tier-2 surface: steer, followUp,
 *   getActiveModel, switchModel, listModels, resolveModelRef,
 *   getModelDiscoveryStatus.
 */

/***
 * MARK: defaultPermissionPolicy
 * @description Deny-safe fallback: with no flavor policy wired, every
 *   agent-initiated request is cancelled instead of hanging the turn.
 ***/
async function defaultPermissionPolicy() {
	return { outcome: { outcome: "cancelled" } };
}

/***
 * MARK: AcpSessionWrapper
 * @description One live ACP conversation. Construct via the flavor harness
 *   (which injects the runtime factory + policy); the engine only ever sees
 *   the HarnessSession surface.
 ***/
export class AcpSessionWrapper {
	constructor({
		createRuntime,
		catalog = null,
		harnessId = "acp",
		log,
		permissionPolicy,
		inspectAssistantText,
		applySessionModel,
		onUsage,
		initialModel = null,
		runLabel = "adhoc:chat",
	} = {}) {
		if (typeof createRuntime !== "function") {
			throw new Error("AcpSessionWrapper requires a createRuntime(hooks) factory");
		}
		this.createRuntime = createRuntime;
		this.catalog = catalog;
		this.harnessId = harnessId;
		this.log = typeof log === "function" ? log : null;
		this.permissionPolicy = typeof permissionPolicy === "function"
			? permissionPolicy
			: defaultPermissionPolicy;
		this.inspectAssistantText = typeof inspectAssistantText === "function"
			? inspectAssistantText
			: null;
		this.applySessionModel = typeof applySessionModel === "function" ? applySessionModel : null;
		this.onUsage = typeof onUsage === "function" ? onUsage : null;
		this.runLabel = runLabel;

		this.handlers = new Set();
		this.messages = [];
		this.disposed = false;
		this.streaming = false;
		this.selfAborted = false;
		this.runtime = null;
		this.runtimeStarting = null;
		this.lastAssistantText = "";
		this.activeModel = initialModel || null;
		this.pendingModel = initialModel || null;
		/** The session id the pinned model was last applied to (per-session
		 *  application: a restarted runtime gets the hook re-run). */
		this.appliedModelSession = null;
		this.lastUsage = null;
		this.mapper = createAcpEventMapper();
		this.turnCount = 0;
	}

	get harnessName() {
		return this.harnessId;
	}

	get isStreaming() {
		return this.streaming;
	}

	getMessages() {
		return this.messages;
	}

	getLastAssistantText() {
		return this.lastAssistantText;
	}

	/***
	 * MARK: subscribe
	 * @description Registers an event handler; returns its unsubscribe.
	 ***/
	subscribe(handler) {
		this.handlers.add(handler);
		return () => this.handlers.delete(handler);
	}

	deliver(event) {
		for (const handler of [...this.handlers]) {
			try {
				handler(event);
			} catch {
				// One bad subscriber never breaks the stream for the others.
			}
		}
	}

	/***
	 * MARK: ensureRuntime
	 * @description Lazily creates + starts the runtime once (concurrent
	 *   prompts share the single in-flight start instead of double-spawning).
	 ***/
	async ensureRuntime() {
		if (this.runtime) return this.runtime;
		if (!this.runtimeStarting) {
			this.runtimeStarting = (async () => {
				try {
					const runtime = await this.createRuntime({
						onNotification: (method, params) => this.handleNotification(method, params),
						onRequest: (method, params) => this.handleAgentRequest(method, params),
					});
					// Disposed while starting (stage cancelled): tear the fresh
					// runtime down instead of leaking an orphan agent process.
					if (this.disposed) {
						try {
							await runtime.dispose();
						} catch {
							// best-effort
						}
						throw new Error("ACP session was disposed during startup");
					}
					this.runtime = runtime;
					this.log?.(
						`ACP session start ${this.runLabel}: session=${runtime.sessionId || "unknown"} pid=${runtime.pid ?? "unknown"}`,
					);
					return runtime;
				} catch (error) {
					// Do NOT cache the rejection: a transient handshake failure
					// (network blip, agent not ready yet) must not poison the
					// long-lived session — the next prompt retries the start.
					this.runtimeStarting = null;
					throw error;
				}
			})();
		}
		return this.runtimeStarting;
	}

	/***
	 * MARK: handleNotification
	 * @description One agent `session/update` (or other) notification arrived
	 *   mid-turn: map it to normalized events and deliver. `usage_update`
	 *   rows are not events — they feed the log/telemetry hook instead — and
	 *   other non-update notifications are ignored (forward tolerance).
	 ***/
	handleNotification(method, params) {
		if (method !== "session/update") return;
		const usage = this.mapper.extractUsage(params?.update);
		if (usage) {
			this.lastUsage = usage;
			this.log?.(describeUsage(usage));
			try {
				this.onUsage?.(usage);
			} catch {
				// A telemetry consumer must never break the turn.
			}
			return;
		}
		for (const event of this.mapper.mapUpdate(params)) {
			if (event.type === "assistant_delta" && typeof event.delta === "string") {
				this.lastAssistantText += event.delta;
				this.chunkCallback?.(event.delta);
			}
			this.deliver(event);
		}
	}

	/***
	 * MARK: handleAgentRequest
	 * @description One agent-initiated request (permission gate) arrived
	 *   mid-turn: log it and answer through the flavor's permission policy.
	 ***/
	async handleAgentRequest(method, params) {
		this.log?.(`ACP permission requested (${method}): ${describePermissionTarget(params)}`);
		try {
			const decision = await this.permissionPolicy(method, params);
			this.log?.(`ACP permission resolved (${method}): ${describeDecision(decision)}`);
			return decision;
		} catch (error) {
			this.log?.(`ACP permission policy failed (${method}): ${error?.message || error} — cancelling`);
			return { outcome: { outcome: "cancelled" } };
		}
	}

	/***
	 * MARK: prompt
	 * @description Runs one agent turn over the live session: streams
	 *   normalized events to subscribers, resolves with the turn's final
	 *   assistant text ("" when the run failed before any output). Failure is
	 *   signalled via the run_error event, not a rejection, so engine
	 *   consumers keep one handling path.
	 ***/
	async prompt(text, { onChunk } = {}) {
		if (this.disposed) throw new Error("ACP session is disposed");
		if (this.streaming) throw new Error("ACP session is already running a prompt");
		let runtime;
		try {
			runtime = await this.ensureRuntime();
		} catch (error) {
			// Startup failure (missing binary, hung handshake, early exit):
			// the run_error event is the failure signal the engine consumes
			// (never a rejection), matching every other harness path.
			this.deliver({ type: "run_error", error: error?.message || String(error) });
			return "";
		}
		this.messages.push({ role: "user", content: text });
		this.streaming = true;
		this.selfAborted = false;
		this.lastAssistantText = "";
		this.chunkCallback = typeof onChunk === "function" ? onChunk : null;
		this.mapper.resetTurn();
		this.turnCount += 1;
		this.deliver({ type: "run_started", turn: this.turnCount, runLabel: this.runLabel });

		try {
			// Model pinning: when the flavor supplied an application hook
			// (agents that cannot take a model on the prompt), apply the
			// pinned model once per agent session and keep the prompt params
			// model-free; without the hook the model rides the prompt.
			if (this.applySessionModel && this.pendingModel) {
				if (this.appliedModelSession !== runtime.sessionId) {
					await this.applySessionModel(runtime, runtime.sessionId, this.pendingModel);
					this.appliedModelSession = runtime.sessionId;
					this.log?.(`ACP session model applied: ${this.pendingModel.id}`);
				}
			}
			const modelRef =
				this.pendingModel && !this.applySessionModel
					? { provider: this.pendingModel.provider, id: this.pendingModel.id }
					: undefined;
			const response = await runtime.prompt([{ type: "text", text }], { model: modelRef });
			if (this.selfAborted) {
				this.deliver({ type: "run_finished", status: "aborted", interrupted: true });
				return this.lastAssistantText;
			}
			// Vendor-smuggled transport failures read as clean turn ends on
			// the wire — trap them before reporting success.
			const trapped = this.inspectAssistantText?.(this.lastAssistantText);
			if (trapped) {
				this.deliver({ type: "run_error", error: trapped.error || trapped.message || String(trapped) });
				return this.lastAssistantText;
			}
			for (const event of this.mapper.mapPromptResult(response)) {
				this.deliver(event);
			}
			if (this.lastAssistantText) {
				this.messages.push({ role: "assistant", content: this.lastAssistantText });
			}
			return this.lastAssistantText;
		} catch (error) {
			if (this.selfAborted) {
				this.deliver({ type: "run_finished", status: "aborted", interrupted: true });
				return this.lastAssistantText;
			}
			this.deliver({ type: "run_error", error: error?.message || String(error) });
			return this.lastAssistantText;
		} finally {
			this.streaming = false;
			this.chunkCallback = null;
		}
	}

	/***
	 * MARK: steer
	 * @description Injects a course correction into the active turn without a
	 *   destructive interrupt (Tier-2 two-way surface). Records the guidance
	 *   in the conversation either way; without a live runtime there is
	 *   nothing to steer into, so it degrades to a queued note.
	 ***/
	async steer(text) {
		this.messages.push({ role: "user", content: text });
		if (this.runtime) {
			try {
				await this.runtime.steer(text);
			} catch (error) {
				this.log?.(`ACP steer was not accepted: ${error?.message || error}`);
			}
		} else {
			this.log?.("ACP steer queued (session not started yet)");
		}
		return { status: "steered" };
	}

	/***
	 * MARK: followUp
	 * @description Buffers a follow-up question as the next turn's context
	 *   (Tier-2 two-way surface).
	 ***/
	async followUp(text) {
		this.messages.push({ role: "user", content: text });
		if (this.runtime) {
			try {
				await this.runtime.steer(text);
			} catch (error) {
				this.log?.(`ACP follow-up was not accepted live: ${error?.message || error}`);
			}
		} else {
			this.log?.("ACP follow-up queued (session not started yet)");
		}
		return { status: "followed_up" };
	}

	/***
	 * MARK: abort
	 * @description Stops the current run at the process level (SIGTERM with
	 *   SIGKILL escalation). The interrupted turn settles as run_finished
	 *   (status "aborted") — an engine-initiated stop is never an agent error.
	 ***/
	async abort() {
		if (!this.runtime || !this.streaming) return { status: "idle" };
		this.selfAborted = true;
		try {
			await this.runtime.cancel();
		} catch {
			// Protocol-level cancel is best-effort; the process signal below
			// is the guarantee.
		}
		this.runtime.abort();
		return { status: "aborted" };
	}

	/***
	 * MARK: dispose
	 * @description Idempotent cleanup: closes the connection, kills the
	 *   agent process group, and clears subscribers.
	 ***/
	async dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.handlers.clear();
		this.runtimeStarting = null;
		if (this.runtime) {
			try {
				await this.runtime.dispose();
			} catch {
				// best-effort
			}
			this.runtime = null;
		}
	}

	async getActiveModel() {
		return this.activeModel;
	}

	/***
	 * MARK: listModels
	 * @description The flavor catalog's model list ([] when no catalog).
	 ***/
	async listModels(opts) {
		if (this.catalog && typeof this.catalog.listModels === "function") {
			return this.catalog.listModels(opts);
		}
		return [];
	}

	/***
	 * MARK: resolveModelRef
	 * @description Resolves a stored model reference against the flavor
	 *   catalog (null when unresolvable or catalog-less).
	 ***/
	async resolveModelRef(ref) {
		if (this.catalog && typeof this.catalog.resolveModelRef === "function") {
			return this.catalog.resolveModelRef(ref);
		}
		return null;
	}

	/***
	 * MARK: getModelDiscoveryStatus
	 * @description Forwards the catalog's discovery health so stage dispatch
	 *   can explain an unresolvable model instead of silently running the
	 *   session default.
	 ***/
	async getModelDiscoveryStatus() {
		if (this.catalog && typeof this.catalog.getModelDiscoveryStatus === "function") {
			return this.catalog.getModelDiscoveryStatus();
		}
		return { ok: true };
	}

	/***
	 * MARK: switchModel
	 * @description Pins the model for subsequent turns. Without an
	 *   `applySessionModel` hook the pin travels with the next
	 *   `session/prompt`; with one it is applied on the live session
	 *   immediately (a failed application never pins — the model would not
	 *   actually run). Unresolvable refs soft-fail with a logged warning
	 *   and return null — never a silent swap.
	 ***/
	async switchModel(ref) {
		const resolved = await this.resolveModelRef(ref);
		if (!resolved) {
			this.log?.(
				`[WARN] Requested model '${typeof ref === "string" ? ref : ref?.id}' could not be resolved; keeping the session model.`,
			);
			return null;
		}
		if (this.applySessionModel && this.runtime && this.runtime.sessionId) {
			try {
				await this.applySessionModel(this.runtime, this.runtime.sessionId, resolved);
				this.appliedModelSession = this.runtime.sessionId;
			} catch (error) {
				this.log?.(
					`[WARN] Requested model '${resolved.id}' was rejected by the agent session (${error?.message || error}); keeping the session model.`,
				);
				return null;
			}
		}
		this.pendingModel = resolved;
		this.activeModel = resolved;
		return resolved;
	}

	/***
	 * MARK: getLastUsage
	 * @description The most recent `usage_update` telemetry the agent
	 *   streamed (token counters, cost, steps, context-window use), or null
	 *   when the agent has not sent one — live feedback for the log/UI.
	 ***/
	getLastUsage() {
		return this.lastUsage;
	}
}

/***
 * MARK: describeUsage
 * @description One-line human summary of a usage_update row for the log:
 *   token counters, cost, steps, and context-window use. Fields the agent
 *   did not populate are skipped, so the line stays honest.
 * @param {Object} usage - The extracted usage record (see `extractUsage`).
 * @returns {string} The log line.
 ***/
function describeUsage(usage) {
	const parts = [];
	if (usage.totalTokens !== undefined) {
		parts.push(
			`tokens=${usage.promptTokens ?? "?"}/${usage.completionTokens ?? "?"}/${usage.totalTokens}`,
		);
		if (usage.cachedTokens !== undefined) parts.push(`cached=${usage.cachedTokens}`);
	}
	if (usage.steps !== undefined) parts.push(`steps=${usage.steps}`);
	if (usage.costUsd !== undefined) parts.push(`cost_usd=${usage.costUsd}`);
	if (usage.contextTokensUsed !== undefined || usage.contextWindowSize !== undefined) {
		parts.push(`context=${usage.contextTokensUsed ?? "?"}/${usage.contextWindowSize ?? "?"}`);
	}
	if (usage.tokensPerSecond !== undefined) parts.push(`tokens_per_second=${usage.tokensPerSecond}`);
	if (usage.lastTurnDuration !== undefined) parts.push(`last_turn_duration=${usage.lastTurnDuration}`);
	return `ACP usage update: ${parts.join(" ")}`;
}

/***
 * MARK: describePermissionTarget
 * @description One-line human summary of a permission request for the log.
 ***/
function describePermissionTarget(params) {
	const tool = params?.toolCall ?? params?.toolcall ?? null;
	const title = tool?.title || params?.title || "unknown tool";
	const id = tool?.toolCallId || params?.toolCallId || "";
	return `${title}${id ? ` (${id})` : ""}`;
}

/***
 * MARK: describeDecision
 * @description One-line human summary of a permission decision for the log.
 ***/
function describeDecision(decision) {
	const outcome = decision?.outcome;
	if (!outcome || typeof outcome !== "object") return String(decision);
	if (outcome.outcome === "selected") return `allowed (${outcome.optionId || "default"})`;
	return String(outcome.outcome || "unknown");
}
