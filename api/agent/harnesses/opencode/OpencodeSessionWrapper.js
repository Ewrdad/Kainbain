import fs from "node:fs";
import path from "node:path";
import { translateOpencodeEvent, isNormalizedAgentEvent } from "./opencodeSessionEvents.js";
import { modelKey } from "../../../models.js";
import { resolveKainbainDir } from "../../../kainbainDir.js";

/**
 * MARK: OpencodeSessionWrapper
 * @description Wraps one OpenCode server session so it satisfies the engine's
 *   HarnessSession contract (`api/agent/harnessContract.js`):
 *
 *     - `subscribe` delivers NORMALIZED agent events only — raw OpenCode SSE
 *       events are translated by `opencodeSessionEvents.translateOpencodeEvent`
 *       and filtered to this session before any handler sees them,
 *     - `prompt` sends one message turn (POST /session/:id/message) and
 *       resolves when the turn completes, streaming deltas meanwhile,
 *     - model control is per-message: `switchModel` stores the model and every
 *       prompt passes `providerID/modelID` in the message body,
 *     - `steer`/`followUp` enqueue an async message turn (prompt_async),
 *     - every conversation turn is appended to the project's transcript JSONL
 *       so history survives server restarts (read back via the harness's
 *       `readHistoryFromDisk`).
 *
 *   Unsupported engine capabilities (compact, contextUsage, tree) are simply
 *   absent — the engine guards each optional member with a typeof check.
 */

const IDLE_SIGNAL_TIMEOUT_MS = 2000;

/***
 * MARK: messageToConversationEntry
 * @description Converts one OpenCode message (`{ info, parts }` from
 *   GET /session/:id/message) into the engine's conversation entry:
 *   `{ id, role, content }` where content is the flattened text of the
 *   message's text parts (assistant reasoning/tool parts stay attached as
 *   `parts` for audit/debug consumers).
 * @param {Object} raw - `{ info, parts }` from the OpenCode API.
 * @returns {Object} The engine conversation entry.
 ***/
function messageToConversationEntry(raw) {
	const info = raw?.info || raw || {};
	const parts = Array.isArray(raw?.parts) ? raw.parts : [];
	const content = parts
		.filter((p) => p?.type === "text" && typeof p.text === "string")
		.map((p) => p.text)
		.join("");
	return { id: info.id, role: info.role, content, parts };
}

export class OpencodeSessionWrapper {
	/***
	 * MARK: constructor
	 * @param {Object} opts
	 * @param {Object} opts.client - The OpenCode SDK client (directory-scoped).
	 * @param {string} opts.sessionId - The OpenCode server session id.
	 * @param {string} [opts.cwd] - Project directory (transcript location).
	 * @param {Object|null} [opts.model] - Initial model `{ provider, id }`.
	 * @param {Object} [opts.discovery] - The harness's model discovery.
	 * @param {string} [opts.transcriptPath] - Transcript JSONL path (defaults <cwd>/<kainbainDirName>/opencode_transcript.jsonl).
	 * @param {Object} [opts.project] - Project record carrying `kainbainDirName` (used only when `transcriptPath` is omitted).
	 * @param {Function} [opts.eventStream] - Test seam overriding the SDK SSE subscription.
	 * @param {Function} [opts.onError] - Called with (message) for non-fatal errors.
	 * @param {number} [opts.idleSignalTimeoutMs] - Max wait for the session.idle signal in prompt (default 2000).
	 ***/
	constructor({
		client,
		sessionId,
		cwd,
		model = null,
		discovery = null,
		transcriptPath,
		project = null,
		eventStream,
		onError,
		idleSignalTimeoutMs,
	}) {
		this.client = client;
		this.harnessId = "opencode";
		this.harnessName = "opencode";
		this.sessionId = sessionId;
		this.cwd = cwd || process.cwd();
		this.discovery = discovery;
		this.onError = onError || (() => {});
		this.transcriptPath =
			transcriptPath ||
			path.join(
				resolveKainbainDir(this.cwd, project) ||
					path.join(this.cwd, ".kainbain"),
				"opencode_transcript.jsonl",
			);

		this.handlers = new Set();
		this.messages = [];
		this.isStreaming = false;
		this.disposed = false;
		this.activeModel = model ? { provider: model.provider, id: model.id } : null;
		this.pendingMessageModel = model ? this.toServerModel(model) : null;

		this.eventSignalController = new AbortController();
		this.eventStreamReady = null;
		this.eventStreamFactory = eventStream || defaultEventStreamFactory;
		this.idleSignalTimeoutMs = idleSignalTimeoutMs ?? IDLE_SIGNAL_TIMEOUT_MS;
		this.idleSignalCount = 0;
		this.errorSignalCount = 0;
	}

	/***
	 * MARK: toServerModel
	 * @description Normalizes any engine model reference into the OpenCode
	 *   per-message shape `{ providerID, modelID }`.
	 * @example wrapper.toServerModel({ provider: "anthropic", id: "claude" }) => { providerID: "anthropic", modelID: "claude" }
	 * @param {Object|string} ref - `{provider, id}`, `{providerID, modelID}`, or `provider::id`.
	 * @returns {Object|null} The server model reference, or null.
	 ***/
	toServerModel(ref) {
		if (!ref) return null;
		if (typeof ref === "object") {
			const providerID = ref.providerID || ref.provider;
			const modelID = ref.modelID || ref.id;
			if (providerID && modelID) return { providerID, modelID };
			return null;
		}
		const key = String(ref);
		const sep = key.indexOf("::");
		if (sep > 0) {
			return { providerID: key.slice(0, sep), modelID: key.slice(sep + 2) };
		}
		return null;
	}

	/***
	 * MARK: startEventStream
	 * @description Establishes the SSE subscription (awaited by the harness
	 *   BEFORE the session is handed out, so no prompt can race the stream)
	 *   and pumps translated, session-scoped events to subscribers. The ready
	 *   promise resolves when the subscription is ESTABLISHED — the pump itself
	 *   keeps running in the background until dispose.
	 ***/
	startEventStream() {
		if (this.eventStreamReady) return this.eventStreamReady;
		const controller = this.eventSignalController;
		this.eventStreamReady = new Promise((resolve, reject) => {
			this.eventStreamFactory({
				client: this.client,
				signal: controller.signal,
				onEvent: (rawEvent) => this.handleRawEvent(rawEvent),
				onReady: resolve,
				onError: reject,
			});
		});
		return this.eventStreamReady;
	}

	/***
	 * MARK: handleRawEvent
	 * @description One raw OpenCode SSE event arrived: translate it, keep only
	 *   events for THIS session (plus session-less ones like busy→run_started
	 *   which carry the sessionID when present), then dispatch to subscribers.
	 * @param {Object} rawEvent - `{ type, properties }` from the SSE stream.
	 ***/
	handleRawEvent(rawEvent) {
		if (this.disposed) return;
		const eventSessionId = rawEvent?.properties?.sessionID;
		if (eventSessionId && eventSessionId !== this.sessionId) return;

		if (rawEvent?.type === "session.idle") this.idleSignalCount += 1;
		if (rawEvent?.type === "session.error") this.errorSignalCount += 1;

		const normalized = translateOpencodeEvent(rawEvent);
		if (!normalized) return;

		if (!isNormalizedAgentEvent(normalized.type)) {
			// Defensive: translation must never emit a raw name. Drop, loudly.
			this.onError(`Non-normalized event attempted to cross the harness boundary: ${normalized.type}`);
			return;
		}
		this.dispatch(normalized);
	}

	/***
	 * MARK: dispatch
	 * @description Delivers one normalized event to every subscriber.
	 ***/
	dispatch(event) {
		for (const handler of [...this.handlers]) {
			try {
				handler(event);
			} catch {
				// One bad subscriber never breaks the stream for the others.
			}
		}
	}

	/***
	 * MARK: subscribe
	 * @description Registers an event handler; returns its unsubscribe.
	 * @example const unsub = session.subscribe((e) => console.log(e.type))
	 * @param {Function} handler
	 * @returns {Function} Unsubscribe.
	 ***/
	subscribe(handler) {
		this.handlers.add(handler);
		return () => this.handlers.delete(handler);
	}

	/***
	 * MARK: waitForIdleSignal
	 * @description Best-effort ordering guarantee for prompt(): the POST
	 *   response is authoritative for turn completion, but subscribers should
	 *   have seen the run's events (assistant deltas, run_finished) before
	 *   prompt resolves. Waits until the session's idle/error signal fired
	 *   since `sinceCount`, polling briefly — the mock server and the real
	 *   server both emit session.idle right after the final message update.
	 * @param {number} sinceCount - idleSignalCount captured at prompt start.
	 ***/
	async waitForIdleSignal(sinceCount) {
		const deadline = Date.now() + this.idleSignalTimeoutMs;
		while (
			this.idleSignalCount <= sinceCount &&
			this.errorSignalCount <= sinceCount &&
			Date.now() < deadline
		) {
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
	}

	/***
	 * MARK: appendTranscript
	 * @description Appends one conversation entry to the project transcript
	 *   JSONL (durable across restarts; read back by readHistoryFromDisk).
	 ***/
	appendTranscript(entry) {
		try {
			/* eslint-disable security/detect-non-literal-fs-filename -- the path is derived from the trusted project cwd, mirroring the pi harness's session-directory handling */
			fs.mkdirSync(path.dirname(this.transcriptPath), { recursive: true });
			fs.appendFileSync(
				this.transcriptPath,
				`${JSON.stringify({
					ts: new Date().toISOString(),
					sessionId: this.sessionId,
					message: { id: entry.id, role: entry.role, content: entry.content },
				})}\n`,
			);
			/* eslint-enable security/detect-non-literal-fs-filename */
		} catch (error) {
			this.onError(`Transcript write failed: ${error?.message || error}`);
		}
	}

	/***
	 * MARK: refreshMessagesFromServer
	 * @description Replaces the local conversation with the server's
	 *   authoritative message list (GET /session/:id/message). Falls back to
	 *   the accumulated local view when the fetch fails.
	 ***/
	async refreshMessagesFromServer() {
		try {
			const result = await this.client.session.messages({
				path: { id: this.sessionId },
			});
			const raw = Array.isArray(result?.data) ? result.data : result;
			if (Array.isArray(raw)) {
				this.messages = raw.map(messageToConversationEntry);
			}
		} catch (error) {
			this.onError(`Message refresh failed: ${error?.message || error}`);
		}
	}

	/***
	 * MARK: prompt
	 * @description Runs one agent turn: POSTs the user message (with the
	 *   active per-message model), streams the translated SSE events to
	 *   subscribers, waits for the run to settle, refreshes the conversation
	 *   from the server, persists both turns to the transcript, and resolves
	 *   to the assistant's reply text.
	 * @example await session.prompt("Plan the work") => "Here is the plan…"
	 * @param {string} text - The user prompt.
	 * @param {Object} [opts]
	 * @param {Function} [opts.onChunk] - Optional chunk callback (log entries).
	 * @returns {Promise<string>} The assistant reply text.
	 ***/
	async prompt(text, { onChunk } = {}) {
		if (this.disposed) throw new Error("Session is disposed");
		const idleBefore = this.idleSignalCount;
		const errorCountBefore = this.errorSignalCount;
		this.isStreaming = true;

		// Forward this turn's assistant text deltas to the optional onChunk
		// callback (the engine's log streamer consumes both paths; pi's prompt
		// offers the same convenience for non-subscriber callers).
		const forwardDeltas =
			typeof onChunk === "function"
				? (event) => {
						if (event.type === "assistant_delta" && typeof event.delta === "string") {
							onChunk(event.delta);
						}
					}
				: null;
		if (forwardDeltas) this.handlers.add(forwardDeltas);

		const body = {
			parts: [{ type: "text", text }],
		};
		if (this.pendingMessageModel) {
			body.model = this.pendingMessageModel;
		}

		try {
			// The user turn lands in the transcript immediately (audit trail even
			// when the turn fails); the assistant turn is appended on completion.
			this.appendTranscript({ role: "user", content: text });
			await this.client.session.prompt({
				path: { id: this.sessionId },
				body,
			});
			// Let the streamed events (deltas, run_finished) land before resolving.
			await this.waitForIdleSignal(Math.max(idleBefore, errorCountBefore));

			await this.refreshMessagesFromServer();
			const assistant = this.messages
				.filter((m) => m.role === "assistant")
				.at(-1);
			const reply = assistant?.content || "";
			if (reply) {
				this.appendTranscript({ id: assistant.id, role: "assistant", content: reply });
			}
			return reply;
		} catch (error) {
			const failure = {
				type: "run_error",
				error: { message: error?.message || String(error) },
			};
			this.dispatch(failure);
			throw error;
		} finally {
			if (forwardDeltas) this.handlers.delete(forwardDeltas);
			this.isStreaming = false;
			// The model override is STICKY (switchModel semantics): every later
			// turn keeps using it until switchModel changes or clears it.
		}
	}

	/***
	 * MARK: steer / followUp
	 * @description Mid-run guidance and follow-up questions. OpenCode has no
	 *   in-flight steering API, so both record the guidance immediately and
	 *   dispatch an async message turn (prompt_async) — the assistant's
	 *   response arrives via the normal event stream.
	 * @example await session.steer("Focus on the API layer")
	 ***/
	async steer(text) {
		this.messages.push({ id: `local-${Date.now()}`, role: "user", content: text });
		this.appendTranscript({ role: "user", content: text });
		await this.sendAsyncTurn(text);
		return { status: "steered" };
	}
	async followUp(text) {
		this.messages.push({ id: `local-${Date.now()}`, role: "user", content: text });
		this.appendTranscript({ role: "user", content: text });
		await this.sendAsyncTurn(text);
		return { status: "followed_up" };
	}

	/***
	 * MARK: sendAsyncTurn
	 * @description Sends a user message via the async prompt endpoint (start
	 *   if needed, return immediately).
	 ***/
	async sendAsyncTurn(text) {
		const body = { parts: [{ type: "text", text }] };
		if (this.pendingMessageModel) body.model = this.pendingMessageModel;
		await this.client.session.promptAsync({
			path: { id: this.sessionId },
			body,
		});
	}

	/***
	 * MARK: abort
	 * @description Stops the current run (POST /session/:id/abort).
	 ***/
	async abort() {
		try {
			await this.client.session.abort({ path: { id: this.sessionId } });
		} catch (error) {
			this.onError(`Abort failed: ${error?.message || error}`);
		}
		this.isStreaming = false;
		return { status: "aborted" };
	}

	/***
	 * MARK: dispose
	 * @description Stops the event stream and drops subscribers. Idempotent;
	 *   the server-side session survives (history lives on the server and in
	 *   the transcript JSONL).
	 ***/
	async dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.eventSignalController.abort();
		this.handlers.clear();
	}

	/***
	 * MARK: getMessages
	 * @description The conversation so far, engine shape (`{role, content}`).
	 ***/
	getMessages() {
		return this.messages;
	}

	/***
	 * MARK: getLastAssistantText
	 * @description The latest assistant text ("" when none yet).
	 ***/
	getLastAssistantText() {
		const assistant = this.messages
			.filter((m) => m.role === "assistant")
			.at(-1);
		return assistant?.content ?? "";
	}

	/***
	 * MARK: getActiveModel
	 * @description The engine-shaped active model (`{provider, id}`) — the
	 *   per-message override when set, else null (the server picks its default).
	 ***/
	async getActiveModel() {
		return this.activeModel;
	}

	/***
	 * MARK: switchModel
	 * @description Selects the model for the NEXT message turns (OpenCode
	 *   models are per-message, `providerID/modelID` in the message body).
	 *   Unresolvable references return null (engine warns visibly) instead of
	 *   silently changing the model.
	 * @example await session.switchModel({ provider: "openai", id: "gpt-5" })
	 * @param {Object|string} ref - Engine model reference.
	 * @returns {Promise<Object|null>} The new active model, or null.
	 ***/
	async switchModel(ref) {
		const serverModel = this.toServerModel(ref);
		if (!serverModel) return null;
		// Unresolvable references never silently change the model (the engine
		// warns visibly instead) — validate against the discovered list when a
		// discovery source is wired.
		if (this.discovery) {
			const resolved = await this.discovery.resolveModelRef(serverModel);
			if (!resolved) return null;
		}
		this.pendingMessageModel = serverModel;
		this.activeModel = { provider: serverModel.providerID, id: serverModel.modelID };
		return this.activeModel;
	}

	/***
	 * MARK: listModels
	 * @description The harness's discovered model list (engine shape, keyed).
	 ***/
	async listModels() {
		return (await this.discovery?.listModels()) || [];
	}

	/***
	 * MARK: resolveModelRef
	 * @description Resolves a stored reference against the discovered models.
	 ***/
	async resolveModelRef(ref) {
		return (await this.discovery?.resolveModelRef(ref)) || null;
	}

	/***
	 * MARK: modelRuntime
	 * @description The classic model-runtime shape some engine call sites
	 *   still read as a fallback (`getAvailableSnapshot`, sync `getModel`,
	 *   sync `getModels`) backed by the discovery cache.
	 ***/
	get modelRuntime() {
		const discovery = this.discovery;
		return {
			getAvailableSnapshot: async () => (await discovery?.listModels()) || [],
			getModel: (provider, id) =>
				(discovery?.cachedModels || []).find(
					(m) => m.provider === provider && m.id === id,
				) || null,
			getModels: () => discovery?.cachedModels || [],
		};
	}
}

/***
 * MARK: defaultEventStreamFactory
 * @description The production event stream: the SDK's SSE client against the
 *   session's server (GET /event, directory-scoped via the client's directory
 *   header). Calls `onReady` once the subscription is established (the stream
 *   itself runs until abort), `onError` when it cannot be established, and
 *   surfaces mid-stream failures as session.error events so consumers see the
 *   connection died instead of hanging. Never rejects after onReady.
 ***/
function defaultEventStreamFactory({ client, onEvent, signal, onReady, onError }) {
	void (async () => {
		let result;
		try {
			result = await client.event.subscribe({ throwOnError: true });
		} catch (error) {
			onError?.(error);
			return;
		}
		onReady?.();
		try {
			for await (const event of result.stream) {
				if (signal?.aborted) break;
				onEvent(event);
			}
		} catch (error) {
			if (!signal?.aborted) {
				onEvent({
					type: "session.error",
					properties: {
						error: { name: "SseStreamError", message: String(error?.message || error) },
					},
				});
			}
		}
	})();
}

/** Model key helper re-exported for the harness's transcript bookkeeping. */
export { modelKey };