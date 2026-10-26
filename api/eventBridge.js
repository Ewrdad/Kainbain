import { EventEmitter } from "node:events";

/***
 * MARK: LEGACY_AGENT_EVENT_ALIASES
 * @description Canonicalizes legacy raw agent-event names (pi's original
 *   vocabulary) onto the engine's normalized agent-event vocabulary (see
 *   `api/agent/sessionEvents.js`). Direct callers that still speak the legacy
 *   names (tests, engine integrations) are routed through the exact same
 *   handling as normalized callers — the alias table is the ONLY place in the
 *   bridge that knows raw names.
 ***/
const LEGACY_AGENT_EVENT_ALIASES = Object.freeze(
	new Map([
		["agent_start", "run_started"],
		["turn_start", "run_started"],
		["message_update", "assistant_delta"],
		["message_start", "message_started"],
		["tool_execution_start", "tool_started"],
		["tool_execution_update", "tool_updated"],
		["tool_execution_end", "tool_finished"],
		["agent_end", "run_finished"],
		["agent_settled", "run_finished"],
		["turn_end", "run_finished"],
		["error", "run_error"],
		["agent_error", "run_error"],
	]),
);

/***
 * MARK: EventBridge
 * @description Manages the mapping between AgentSession events and the
 *   WebSocket messages sent to the frontend. Each session has a set of
 *   subscribed sockets; agent events are forwarded to all of them.
 ***/
export class EventBridge extends EventEmitter {
	constructor() {
		super();
		this.subscriptions = new Map(); // sessionId -> Set of sockets
		this.currentMessages = new Map(); // sessionId -> { id, content, isTyping } for the assistant message being streamed
		this._idCounter = 0;
	}

	/***
	 * MARK: subscribe
	 * @description Registers a socket so it receives events for the session.
	 * @example eventBridge.subscribe('proj-1', socket)
	 * @param {string} sessionId
	 * @param {Object} socket
	 ***/
	subscribe(sessionId, socket) {
		if (!this.subscriptions.has(sessionId)) {
			this.subscriptions.set(sessionId, new Set());
		}
		this.subscriptions.get(sessionId).add(socket);
	}

	/***
	 * MARK: unsubscribe
	 * @description Removes a socket; drops the session entry when empty.
	 * @example eventBridge.unsubscribe('proj-1', socket)
	 * @param {string} sessionId
	 * @param {Object} socket
	 ***/
	unsubscribe(sessionId, socket) {
		const sockets = this.subscriptions.get(sessionId);
		if (sockets) {
			sockets.delete(socket);
			if (sockets.size === 0) {
				this.subscriptions.delete(sessionId);
			}
		}
	}

	/***
	 * MARK: broadcast
	 * @description Sends a typed payload directly to every open socket subscribed to the session.
	 * @example eventBridge.broadcast('proj-1', 'PROCESS_STDOUT', { taskId: 't1', chunk: 'hello' })
	 * @param {string} sessionId
	 * @param {string} type
	 * @param {Object} payload
	 ***/
	broadcast(sessionId, type, payload) {
		const message = JSON.stringify({
			type,
			sessionId,
			payload,
			timestamp: new Date().toISOString(),
		});

		const sockets = this.subscriptions.get(sessionId);
		if (sockets) {
			for (const socket of sockets) {
				if (socket.readyState === 1) {
					// OPEN
					socket.send(message);
				}
			}
		}
	}

	/***
	 * MARK: broadcastGlobal
	 * @description Sends a typed payload to every open socket across all project subscriptions.
	 * @example eventBridge.broadcastGlobal('ENGINE_STATE', { status: 'running' })
	 * @param {string} type
	 * @param {Object} payload
	 ***/
	broadcastGlobal(type, payload) {
		const message = JSON.stringify({
			type,
			sessionId: payload?.projectId || null,
			payload,
			timestamp: new Date().toISOString(),
		});

		const seenSockets = new Set();
		for (const socketSet of this.subscriptions.values()) {
			for (const socket of socketSet) {
				if (socket.readyState === 1 && !seenSockets.has(socket)) {
					seenSockets.add(socket);
					socket.send(message);
				}
			}
		}
	}

	/***
	 * MARK: emitSystemLog
	 * @description Emits a structured [SYSTEM] log event to session subscribers and global listeners, filtering empty messages.
	 * @example eventBridge.emitSystemLog('proj-1', '[SYSTEM] Enqueued task #KB-1234 for stage \'Plan\'', { taskId: 't1' })
	 * @param {string} sessionId
	 * @param {string} message
	 * @param {Object} [payload]
	 ***/
	emitSystemLog(sessionId, message, payload = {}) {
		if (!message || !String(message).trim()) return;
		const cleanMessage = String(message).trim();
		this.emitProcessEvent(sessionId, "process:stdout", {
			...payload,
			chunk: cleanMessage,
			log: cleanMessage,
			system: true,
		});
	}

	/***
	 * MARK: emitNotification
	 * @description Emits a structured user-facing toast notification over WebSocket.
	 * @example eventBridge.emitNotification('proj-1', { type: 'error', title: 'Stage Failed', message: 'Model unreachable' })
	 * @param {string} sessionId
	 * @param {Object} notif
	 ***/
	emitNotification(sessionId, notif = {}) {
		if (!notif || (!notif.message && !notif.title)) return;
		this.broadcastGlobal("NOTIFICATION", {
			projectId: sessionId,
			...notif,
		});
	}

	/***
	 * MARK: extractContent
	 * @description Extracts the streamed text content from an agent event payload.
	 *   Handles the SDK's structured shapes: `message.content` blocks (text +
	 *   thinking), `assistantMessageEvent.delta`, and plain `delta`/`chunk`.
	 * @param {Object} payload - The raw agent event payload.
	 * @returns {string} The extracted text, or "" if none.
	 ***/
	extractContent(payload) {
		if (!payload) return "";

		// message.content is an array of content blocks (text / thinking /
		// toolCall). For message_update this holds the FULL accumulated text for
		// the streaming message, which the frontend replaces wholesale on each
		// update — so prefer it over the incremental delta to avoid the message
		// collapsing to only the last chunk.
		let blocks = null;
		if (Array.isArray(payload.content)) {
			blocks = payload.content;
		} else if (Array.isArray(payload.message?.content)) {
			blocks = payload.message.content;
		}
		if (blocks) {
			const joined = blocks
				.map((c) => {
					if (typeof c === "string") return c;
					if (c?.type === "text" && typeof c.text === "string") return c.text;
					if (c?.type === "thinking" && typeof c.thinking === "string") {
						return c.thinking;
					}
					return "";
				})
				.join("");
			if (joined) return joined;
		}

		// Fall back to the incremental delta when no full content blocks are
		// present (e.g. a bare delta-only event).
		const ame = payload.assistantMessageEvent;
		if (ame) {
			if (typeof ame.delta === "string" && ame.delta) return ame.delta;
			if (typeof ame.content === "string" && ame.content) return ame.content;
		}

		if (typeof payload.delta === "string" && payload.delta) return payload.delta;
		if (typeof payload.chunk === "string" && payload.chunk) return payload.chunk;
		if (typeof payload.content === "string" && payload.content)
			return payload.content;

		return "";
	}

	/***
	 * MARK: extractToolOutput
	 * @description Extracts the human-readable output from a tool execution
	 *   update/end event. Tool results are `{ content: [{ type: "text", text }] }`
	 *   blocks; partial updates stream `partialResult`.
	 * @param {Object} payload - The raw tool event payload.
	 * @returns {string} The extracted output, or "" if none.
	 ***/
	extractToolOutput(payload) {
		if (!payload) return "";

		if (typeof payload.partialResult === "string" && payload.partialResult) {
			return payload.partialResult;
		}

		const result = payload.result;
		if (typeof result === "string" && result) return result;
		if (result && typeof result === "object") {
			if (typeof result.content === "string" && result.content)
				return result.content;
			if (Array.isArray(result.content)) {
				return result.content
					.map((c) => {
						if (typeof c === "string") return c;
						if (c?.type === "text" && typeof c.text === "string") return c.text;
						return "";
					})
					.join("");
			}
			if (typeof result.text === "string" && result.text) return result.text;
		}

		return "";
	}

	/***
	 * MARK: handleAgentEvent
	 * @description Maps an agent event to a UI action and broadcasts it to every open socket subscribed to the session.
	 *   Accepts both the normalized agent-event vocabulary and the legacy raw
	 *   names (canonicalized via LEGACY_AGENT_EVENT_ALIASES) so all callers
	 *   share one handling path.
	 * @example await eventBridge.handleAgentEvent('proj-1', 'message_started', { id: 'm1' })
	 * @param {string} sessionId
	 * @param {string} eventName
	 * @param {Object} payload
	 ***/
	async handleAgentEvent(sessionId, eventName, payload) {
		const agentEvent = LEGACY_AGENT_EVENT_ALIASES.get(eventName) ?? eventName;

		if (
			payload?.chunk !== undefined &&
			(!payload.chunk || !String(payload.chunk).trim())
		) {
			return;
		}

		if (agentEvent === "tool_started") {
			const toolName =
				payload?.toolName || payload?.name || payload?.tool || "tool";
			const args = payload?.args || payload?.arguments || payload?.input;
			let argsStr = "";
			if (args) {
				argsStr = typeof args === "string" ? args : JSON.stringify(args);
			}
			const logMsg = argsStr
				? `[SYSTEM] Tool invocation: ${toolName} with arguments: ${argsStr}`
				: `[SYSTEM] Tool invocation: ${toolName}`;
			this.emitSystemLog(sessionId, logMsg, {
				projectId: payload?.projectId || sessionId,
				toolName,
			});
		}

		const uiAction = this.mapEventToUIAction(agentEvent);
		if (!uiAction) return;

		// The harness emits message_started for the user prompt too. Only surface
		// assistant messages in the activity console; skip user/toolResult ones.
		if (agentEvent === "message_started" && payload?.message?.role === "user") {
			return;
		}

		// ---- Stable identity -------------------------------------------------
		// The SDK streams a single assistant message across many message_update
		// events and a single tool call across tool_execution_update/end events.
		// The frontend keys updates by id, so every event in a stream MUST reuse
		// the same id or the updates are dropped (blank message / "Waiting for
		// output..." forever). We therefore derive a stable id per stream instead
		// of minting a fresh `msg-<now>` per event.
		let id;
		let isTyping = true;

		if (
			agentEvent === "message_started"
		) {
			// Honor an explicit id when the caller supplies one (tests / manual
			// invocations); otherwise mint a stable id for the stream.
			id = payload?.id || payload?.message?.id || this.nextId("msg");
			this.currentMessages.set(sessionId, { id, content: "" });
		} else if (agentEvent === "assistant_delta") {
			const cur = this.currentMessages.get(sessionId);
			id = cur?.id || payload?.id || payload?.message?.id || this.nextId("msg");
			if (!cur) this.currentMessages.set(sessionId, { id, content: "" });
		} else if (agentEvent === "run_finished") {
			const cur = this.currentMessages.get(sessionId);
			id = cur?.id || payload?.id || payload?.message?.id || this.nextId("msg");
			isTyping = false;
			this.currentMessages.delete(sessionId);
		} else if (agentEvent === "tool_started") {
			id = payload?.toolCallId || payload?.id || this.nextId("tool");
		} else if (
			agentEvent === "tool_updated" ||
			agentEvent === "tool_finished"
		) {
			id = payload?.toolCallId || payload?.id || this.nextId("tool");
		} else {
			id = payload?.id || payload?.message?.id || this.nextId("msg");
		}

		// ---- Content extraction ----------------------------------------------
		let content = "";
		let log = "";
		let finalOutput = "";
		if (agentEvent === "tool_updated") {
			log = this.extractToolOutput(payload);
		} else if (agentEvent === "tool_finished") {
			finalOutput = this.extractToolOutput(payload);
		} else {
			content = this.extractContent(payload);
		}

		const enrichedPayload = {
			...payload,
			id,
			content,
			log,
			finalOutput,
			isTyping,
			projectId: payload?.projectId || sessionId,
		};

		const message = JSON.stringify({
			type: uiAction,
			sessionId,
			payload: enrichedPayload,
			timestamp: new Date().toISOString(),
		});

		const sockets = this.subscriptions.get(sessionId);
		if (sockets) {
			for (const socket of sockets) {
				if (socket.readyState === 1) {
					// OPEN
					socket.send(message);
				}
			}
		}
	}

	/***
	 * MARK: emitProcessEvent
	 * @description Emits a structured process or stage transition event tagged with projectId and projectName to session subscribers and global listeners.
	 * @example await eventBridge.emitProcessEvent('proj-1', 'process:stdout', { taskId: 't1', chunk: 'log', projectName: 'Project A' })
	 * @param {string} sessionId
	 * @param {string} eventName
	 * @param {Object} payload
	 ***/
	async emitProcessEvent(sessionId, eventName, payload) {
		if (
			payload?.chunk !== undefined &&
			(!payload.chunk || !String(payload.chunk).trim())
		) {
			return;
		}

		const uiAction = this.mapEventToUIAction(eventName);
		if (!uiAction) return;

		const enrichedPayload = {
			...payload,
			projectId: payload?.projectId || sessionId,
			projectName: payload?.projectName || sessionId,
		};

		// Broadcast to all connected sockets across projects so activity is observable globally
		this.broadcastGlobal(uiAction, enrichedPayload);
	}

	/***
	 * MARK: mapEventToUIAction
	 * @description Translates a raw agent, process, or stage event name into the UI action string the frontend understands, or null for unknown events.
	 *   The normalized agent-event vocabulary is primary; legacy raw agent names
	 *   and engine-owned event spellings are retained as aliases so direct
	 *   callers keep working.
	 * @example eventBridge.mapEventToUIAction('process:stdout') => 'PROCESS_STDOUT'
	 * @example eventBridge.mapEventToUIAction('assistant_delta') => 'MSG_UPDATE'
	 * @param {string} eventName
	 * @returns {string|null}
	 ***/
	mapEventToUIAction(eventName) {
		// A Map avoids the object-injection lint warning while keeping the
		// lookup O(1) over a fixed set of known event names.
		const map = new Map([
			// Normalized agent-event vocabulary (primary)
			["message_started", "MSG_START"],
			["assistant_delta", "MSG_UPDATE"],
			["tool_started", "TOOL_START"],
			["tool_updated", "TOOL_UPDATE"],
			["tool_finished", "TOOL_END"],
			["run_finished", "AGENT_DONE"],
			// run_started / run_error have no UI action of their own (matching the
			// legacy behavior for agent_start/turn_start/error/agent_error).
			// Legacy agent-event spellings (raw pi names, direct callers)
			["message_start", "MSG_START"],
			["message_update", "MSG_UPDATE"],
			["text_delta", "MSG_UPDATE"],
			["thinking_delta", "MSG_UPDATE"],
			["tool_execution_start", "TOOL_START"],
			["tool_execution_update", "TOOL_UPDATE"],
			["tool_execution_end", "TOOL_END"],
			["agent_end", "AGENT_DONE"],
			["agent_settled", "AGENT_DONE"],
			["turn_end", "AGENT_DONE"],
			["streaming_update", "STREAMING_UPDATE"],
			// Discrete process streaming events
			["process:start", "PROCESS_START"],
			["process_start", "PROCESS_START"],
			["PROCESS_START", "PROCESS_START"],
			["process:stdout", "PROCESS_STDOUT"],
			["process_stdout", "PROCESS_STDOUT"],
			["PROCESS_STDOUT", "PROCESS_STDOUT"],
			["process:stderr", "PROCESS_STDERR"],
			["process_stderr", "PROCESS_STDERR"],
			["PROCESS_STDERR", "PROCESS_STDERR"],
			["process:exit", "PROCESS_EXIT"],
			["process_exit", "PROCESS_EXIT"],
			["PROCESS_EXIT", "PROCESS_EXIT"],
			// Stage transitions
			["stage:enter", "STAGE_ENTER"],
			["stage_enter", "STAGE_ENTER"],
			["STAGE_ENTER", "STAGE_ENTER"],
			["stage:checkpoint_wait", "STAGE_CHECKPOINT_WAIT"],
			["stage_checkpoint_wait", "STAGE_CHECKPOINT_WAIT"],
			["STAGE_CHECKPOINT_WAIT", "STAGE_CHECKPOINT_WAIT"],
			["stage:complete", "STAGE_COMPLETE"],
			["stage_complete", "STAGE_COMPLETE"],
			["STAGE_COMPLETE", "STAGE_COMPLETE"],
			["stage:failback", "STAGE_FAILBACK"],
			["stage_failback", "STAGE_FAILBACK"],
			["STAGE_FAILBACK", "STAGE_FAILBACK"],
			["process:error", "PROCESS_STDERR"],
			["process_error", "PROCESS_STDERR"],
			["notification", "NOTIFICATION"],
			["NOTIFICATION", "NOTIFICATION"],
			// Global engine state
			["engine_state", "ENGINE_STATE"],
			["ENGINE_STATE", "ENGINE_STATE"],
			["engine:state", "ENGINE_STATE"],
		]);
		return map.get(eventName) || null;
	}

	/***
	 * MARK: nextId
	 * @description Generates a monotonic per-process id for assistant messages and tool calls.
	 *   Monotonic (rather than Date.now()) so ids never collide when events arrive
	 *   within the same millisecond, which was causing updates to be dropped.
	 * @param {string} prefix
	 * @returns {string}
	 ***/
	nextId(prefix) {
		this._idCounter += 1;
		return `${prefix || "msg"}-${this._idCounter}-${Date.now()}`;
	}

	/***
	 * MARK: clearSession
	 * @description Removes every socket subscription for a session.
	 * @example eventBridge.clearSession('proj-1')
	 * @param {string} sessionId
	 ***/
	clearSession(sessionId) {
		const sockets = this.subscriptions.get(sessionId);
		if (sockets && typeof sockets.clear === "function") {
			sockets.clear();
		}
		this.subscriptions.delete(sessionId);
		this.currentMessages.delete(sessionId);
	}
}


export const eventBridge = new EventBridge();
