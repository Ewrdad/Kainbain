import { encodeAcpFrame } from "./AcpStreamTransport.js";

/**
 * MARK: AcpClientConnection
 * @description Generic bidirectional JSON-RPC 2.0 connection over an ACP
 *   stdio transport. The transport (how lines move) is injected — this module
 *   owns ONLY the protocol state machine, so it is unit-testable with an
 *   in-memory line pair and reusable by every future ACP harness:
 *
 *   - Outgoing requests (`request(method, params)`) get numeric ids, resolve
 *     with the agent's `response.result`, and reject on `response.error`,
 *     on a per-request timeout, or when the connection closes.
 *   - Incoming agent requests (`{ id, method, params }`, e.g. permission
 *     gates) are answered through the injected `onRequest` handler; a
 *     throwing/missing handler answers with a JSON-RPC Method-not-found error
 *     instead of hanging the agent's turn.
 *   - Incoming agent notifications (`{ method, params }`, no id — e.g.
 *     streaming updates) fan out to `onNotification`.
 *   - Malformed frames are ignored (counted); a frame that is neither a
 *     response nor a request/notification is ignored the same way a noisy
 *     stdout line is — the session must not die over one bad line.
 */

/** JSON-RPC error code sent when no `onRequest` handler answers an agent request. */
export const ACP_METHOD_NOT_FOUND = -32601;

/** `error.code` carried by rejections raised by this module (timeouts, close). */
export const ACP_TIMEOUT_CODE = "ACP_TIMEOUT";
export const ACP_CLOSED_CODE = "ACP_CONNECTION_CLOSED";

/***
 * MARK: AcpClientConnection
 * @description One JSON-RPC 2.0 conversation. Construct with the line-level
 *   transport plus the two inbound callbacks; feed inbound stdout lines to
 *   `handleLine`.
 * @example const conn = new AcpClientConnection({ sendLine: (l) => child.stdin.write(l) });
 * @example await conn.request("initialize", { protocolVersion: 1 });
 ***/
export class AcpClientConnection {
	constructor({ sendLine, onNotification, onRequest } = {}) {
		if (typeof sendLine !== "function") {
			throw new Error("AcpClientConnection requires a sendLine(line) function");
		}
		this.sendLine = sendLine;
		this.onNotification = typeof onNotification === "function" ? onNotification : null;
		this.onRequest = typeof onRequest === "function" ? onRequest : null;
		this.nextId = 1;
		this.pending = new Map(); // id -> { resolve, reject, timer, method }
		this.closed = false;
		this.counters = { sent: 0, received: 0, ignored: 0 };
	}

	/** In-flight request count — for tests and diagnostics. */
	pendingCount() {
		return this.pending.size;
	}

	/***
	 * MARK: request
	 * @description Sends one JSON-RPC request and resolves with the agent's
	 *   `response.result`. Rejects with an `ACP_TIMEOUT`-coded error after
	 *   `timeoutMs` (0 = no timeout), or with an `ACP_CONNECTION_CLOSED`
	 *   error when `close()` runs first.
	 ***/
	request(method, params, { timeoutMs = 0 } = {}) {
		if (this.closed) {
			return Promise.reject(closedError(`request "${method}" on a closed ACP connection`));
		}
		// eslint-disable-next-line security/detect-object-injection -- numeric id key on a Map, not an object
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			let timer = null;
			if (timeoutMs > 0) {
				timer = setTimeout(() => {
					if (!this.pending.has(id)) return;
					this.pending.delete(id);
					reject(timeoutError(`ACP request "${method}" timed out after ${timeoutMs}ms`));
				}, timeoutMs);
				if (timer.unref) timer.unref();
			}
			this.pending.set(id, { resolve, reject, timer, method });
			try {
				this.sendLine(encodeAcpFrame({ jsonrpc: "2.0", id, method, params: params ?? {} }));
				this.counters.sent += 1;
			} catch (error) {
				this.pending.delete(id);
				if (timer) clearTimeout(timer);
				reject(error);
			}
		});
	}

	/***
	 * MARK: notify
	 * @description Sends one JSON-RPC notification (no id, no response).
	 ***/
	notify(method, params) {
		if (this.closed) return;
		this.sendLine(encodeAcpFrame({ jsonrpc: "2.0", method, params: params ?? {} }));
		this.counters.sent += 1;
	}

	/***
	 * MARK: handleLine
	 * @description Routes one parsed inbound frame: a response settles its
	 *   pending request; an incoming request is answered via `onRequest`; a
	 *   notification fans out to `onNotification`. Anything else is counted
	 *   and ignored.
	 * @param {Object} frame - One parsed JSON-RPC frame.
	 ***/
	handleLine(frame) {
		if (!frame || typeof frame !== "object" || Array.isArray(frame)) return;
		this.counters.received += 1;
		if (isResponse(frame)) {
			this.settleResponse(frame);
			return;
		}
		if (typeof frame.method === "string") {
			if (frame.id !== undefined && frame.id !== null) {
				this.answerIncomingRequest(frame);
			} else {
				this.deliverNotification(frame);
			}
			return;
		}
		this.counters.ignored += 1;
	}

	/***
	 * MARK: close
	 * @description Marks the connection closed and rejects every pending
	 *   request with an `ACP_CONNECTION_CLOSED`-coded error (a dead agent
	 *   must never leave a turn hanging). Idempotent.
	 ***/
	close(reason) {
		if (this.closed) return;
		this.closed = true;
		const pending = [...this.pending.values()];
		this.pending.clear();
		for (const { reject, timer } of pending) {
			if (timer) clearTimeout(timer);
			reject(closedError(reason || "ACP connection closed"));
		}
	}

	settleResponse(frame) {
		// eslint-disable-next-line security/detect-object-injection -- numeric id key on a Map, not an object
		const entry = this.pending.get(frame.id);
		if (!entry) {
			// Late response for an already-timed-out request — ignore.
			this.counters.ignored += 1;
			return;
		}
		this.pending.delete(frame.id);
		if (entry.timer) clearTimeout(entry.timer);
		if (frame.error !== undefined && frame.error !== null) {
			const message =
				typeof frame.error?.message === "string"
					? frame.error.message
					: `ACP request "${entry.method}" failed`;
			const error = new Error(message);
			error.code = frame.error?.code ?? "ACP_REQUEST_FAILED";
			error.data = frame.error?.data;
			entry.reject(error);
			return;
		}
		entry.resolve(frame.result);
	}

	async answerIncomingRequest(frame) {
		let response;
		try {
			const handler = this.onRequest;
			if (!handler) throw methodNotFoundError(frame.method);
			response = await handler(frame.method, frame.params ?? {});
		} catch (error) {
			response = {
				error: {
					code: error?.code ?? ACP_METHOD_NOT_FOUND,
					message: error?.message || `No handler for ACP method "${frame.method}"`,
				},
			};
		}
		if (this.closed) return;
		try {
			if (response && typeof response === "object" && ("result" in response || "error" in response)) {
				this.sendLine(encodeAcpFrame({ jsonrpc: "2.0", id: frame.id, ...response }));
			} else {
				this.sendLine(encodeAcpFrame({ jsonrpc: "2.0", id: frame.id, result: response ?? null }));
			}
			this.counters.sent += 1;
		} catch {
			// Transport already gone — the agent is dying; nothing to answer on.
		}
	}

	deliverNotification(frame) {
		try {
			this.onNotification?.(frame.method, frame.params ?? {});
		} catch {
			// One bad subscriber never breaks the stream for the others.
		}
	}
}

/***
 * MARK: isResponse
 * @description Whether a frame is a JSON-RPC response (carries an id plus a
 *   result or an error arm) rather than a request/notification.
 ***/
function isResponse(frame) {
	if (frame.id === undefined || frame.id === null) return false;
	return frame.result !== undefined || frame.error !== undefined;
}

function timeoutError(message) {
	const error = new Error(message);
	error.code = ACP_TIMEOUT_CODE;
	return error;
}

function closedError(message) {
	const error = new Error(String(message || "ACP connection closed"));
	error.code = ACP_CLOSED_CODE;
	return error;
}

function methodNotFoundError(method) {
	const error = new Error(`No handler for ACP method "${method}"`);
	error.code = ACP_METHOD_NOT_FOUND;
	return error;
}
