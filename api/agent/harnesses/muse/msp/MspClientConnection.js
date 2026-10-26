import { generateUuidV7 } from "./uuidv7.js";

/**
 * MARK: MspClientConnection
 * @description The purpose-built Muse Session Protocol (MSP) JSON-RPC 2.0
 *   connection over stdio. Built directly on the probe-verified wire facts —
 *   NOT a shim over the generic ACP core (MSP is not ACP: different methods,
 *   lifecycle, view cursors, and UUIDv7 idempotency handles):
 *
 *   - Outgoing requests carry a client-chosen numeric `id` AND a UUIDv7
 *     `commandId` inside `params` (GOTCHA-2: the host rejects a v4 UUID).
 *     Queries that are not commands (`initialize`, `model/list`) skip the
 *     command id — the schema marks those "a query, not a command".
 *   - `request()` resolves with the host's `result` and rejects on
 *     `error`, a per-request timeout, or when the connection closes (a dead
 *     host must never leave a turn hanging).
 *   - Incoming server→client REQUESTS (`approval/request`,
 *     `userInput/request`) are answered through the injected `onRequest`
 *     hook; a throwing/missing handler answers with a method-not-found error
 *     so the host's turn can still proceed.
 *   - Incoming NOTIFICATIONS fan out to `onNotification`; unknown frames are
 *     counted and ignored (one bad line never kills the session).
 */

/** JSON-RPC error code sent when no `onRequest` handler answers a host request. */
export const MSP_METHOD_NOT_FOUND = -32601;

/** `error.code` carried by rejections raised by this module. */
export const MSP_TIMEOUT_CODE = "MSP_TIMEOUT";
export const MSP_CLOSED_CODE = "MSP_CONNECTION_CLOSED";

/***
 * MARK: MspClientConnection
 * @description One MSP JSON-RPC conversation.
 * @example const conn = new MspClientConnection({ sendLine: (l) => child.stdin.write(l) });
 * @example await conn.request("session/start", { workspaceRoot: "/repo" }, { command: true });
 ***/
export class MspClientConnection {
	constructor({ sendLine, onNotification, onRequest } = {}) {
		if (typeof sendLine !== "function") {
			throw new Error("MspClientConnection requires a sendLine(line) function");
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
	 * @description Sends one MSP request and resolves with the host's
	 *   `result`. `opts.command` adds a fresh UUIDv7 `commandId` to the params
	 *   (mutually exclusive with a params-supplied one). Rejects with an
	 *   `MSP_TIMEOUT`-coded error after `timeoutMs` (0 = no timeout) or with
	 *   an `MSP_CONNECTION_CLOSED` error when `close()` runs first.
	 * @param {string} method - MSP method name (e.g. "turn/start").
	 * @param {Object} [params] - Method params.
	 * @param {Object} [opts]
	 * @param {boolean} [opts.command] - Attach a UUIDv7 commandId to params.
	 * @param {number} [opts.timeoutMs] - Per-request timeout (0 = none).
	 * @returns {Promise<Object>} The host's result object.
	 ***/
	request(method, params, { command = false, timeoutMs = 0 } = {}) {
		if (this.closed) {
			return Promise.reject(closedError(`request "${method}" on a closed MSP connection`));
		}
		const id = this.nextId++;
		const finalParams = { ...(params || {}) };
		if (command && !finalParams.commandId) {
			finalParams.commandId = generateUuidV7();
		}
		return new Promise((resolve, reject) => {
			let timer = null;
			if (timeoutMs > 0) {
				timer = setTimeout(() => {
					if (!this.pending.has(id)) return;
					this.pending.delete(id);
					reject(timeoutError(`MSP request "${method}" timed out after ${timeoutMs}ms`));
				}, timeoutMs);
				if (timer.unref) timer.unref();
			}
			this.pending.set(id, { resolve, reject, timer, method });
			try {
				this.sendLine(encodeMspFrame({ jsonrpc: "2.0", id, method, params: finalParams }));
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
	 * @description Sends one MSP notification (no id, never answered). The
	 *   `initialized` handshake step is exactly this.
	 ***/
	notify(method, params) {
		if (this.closed) return;
		try {
			this.sendLine(encodeMspFrame({ jsonrpc: "2.0", method, params: params || {} }));
			this.counters.sent += 1;
		} catch {
			// Transport already gone — the host is dying; a notification
			// needs no reply, so drop it silently.
		}
	}

	/***
	 * MARK: handleLine
	 * @description Routes one parsed inbound frame: a response settles its
	 *   pending request; an incoming request is answered via `onRequest`; a
	 *   notification fans out to `onNotification`. Anything else is counted
	 *   and ignored.
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
	 *   request with an `MSP_CONNECTION_CLOSED`-coded error. Idempotent.
	 ***/
	close(reason) {
		if (this.closed) return;
		this.closed = true;
		const pending = [...this.pending.values()];
		this.pending.clear();
		for (const { reject, timer } of pending) {
			if (timer) clearTimeout(timer);
			reject(closedError(reason || "MSP connection closed"));
		}
	}

	settleResponse(frame) {
		const entry = this.pending.get(frame.id);
		if (!entry) {
			// Late response for an already-timed-out request — ignore.
			this.counters.ignored += 1;
			return;
		}
		this.pending.delete(frame.id);
		if (entry.timer) clearTimeout(entry.timer);
		if (frame.error !== undefined && frame.error !== null) {
			const error = new Error(
				typeof frame.error?.message === "string"
					? frame.error.message
					: `MSP request "${entry.method}" failed`,
			);
			error.code = frame.error?.code ?? "MSP_REQUEST_FAILED";
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
			response = await handler(frame.method, frame.params || {});
		} catch (error) {
			response = {
				error: {
					code: error?.code ?? MSP_METHOD_NOT_FOUND,
					message: error?.message || `No handler for MSP method "${frame.method}"`,
				},
			};
		}
		if (this.closed) return;
		try {
			if (
				response &&
				typeof response === "object" &&
				("result" in response || "error" in response)
			) {
				this.sendLine(encodeMspFrame({ jsonrpc: "2.0", id: frame.id, ...response }));
			} else {
				this.sendLine(
					encodeMspFrame({ jsonrpc: "2.0", id: frame.id, result: response ?? null }),
				);
			}
			this.counters.sent += 1;
		} catch {
			// Transport already gone — the host is dying; nothing to answer on.
		}
	}

	deliverNotification(frame) {
		try {
			this.onNotification?.(frame.method, frame.params || {});
		} catch {
			// One bad subscriber never breaks the stream for the others.
		}
	}
}

/***
 * MARK: encodeMspFrame
 * @description Serializes one MSP frame to a single NDJSON line (JSON-RPC
 *   2.0). The schema requires params to be omitted entirely when empty and
 *   never `null`, so an empty param object is dropped.
 * @example encodeMspFrame({ jsonrpc: "2.0", method: "initialized" }) => '{"jsonrpc":"2.0","method":"initialized"}\n'
 ***/
export function encodeMspFrame(frame) {
	const payload = { ...frame };
	if (
		payload.params &&
		typeof payload.params === "object" &&
		Object.keys(payload.params).length === 0
	) {
		delete payload.params;
	}
	return `${JSON.stringify(payload)}\n`;
}

/***
 * MARK: createMspFrameParser
 * @description Incremental NDJSON parser for host stdout: splits chunk→line,
 *   ignores blank/noise lines, yields parsed JSON objects, and enforces a
 *   single-line byte cap (1 MiB, the shared scaffold's default) — an oversized
 *   line is discarded INCREMENTALLY the moment the cap trips, so a
 *   pathological stream is never fully buffered (backpressure parity with the
 *   exec parser). Re-exported by the runtime so framing is testable without a
 *   binary.
 ***/
export function createMspFrameParser({
	onNoise,
	maxLineBytes = 1024 * 1024,
} = {}) {
	let buffer = "";
	let bufferBytes = 0;
	let overLimit = false;
	const counters = { lines: 0, frames: 0, noise: 0, droppedOversized: 0 };
	return {
		push(chunk) {
			const frames = [];
			if (typeof chunk !== "string" || chunk.length === 0) return frames;
			let text = overLimit ? chunk : buffer + chunk;
			buffer = "";
			let start = 0;
			let newlineIndex;
			while ((newlineIndex = text.indexOf("\n", start)) !== -1) {
				const line = text.slice(start, newlineIndex).replace(/\r$/, "").trim();
				start = newlineIndex + 1;
				bufferBytes = 0;
				if (overLimit) {
					// The oversized line's terminator arrived: the line was already
					// discarded incrementally when the cap tripped; framing stays
					// in sync.
					overLimit = false;
					counters.droppedOversized += 1;
					continue;
				}
				if (!line) continue;
				counters.lines += 1;
				let parsed;
				try {
					parsed = JSON.parse(line);
				} catch {
					counters.noise += 1;
					onNoise?.(line);
					continue;
				}
				if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
					counters.frames += 1;
					frames.push(parsed);
				} else {
					counters.noise += 1;
					onNoise?.(line);
				}
			}
			const tail = text.slice(start);
			if (tail.length > 0 && !overLimit) {
				bufferBytes = Buffer.byteLength(tail, "utf8");
				if (bufferBytes > maxLineBytes) {
					// Drop the moment the cap trips — never buffer an oversized
					// line. Counted when its terminator arrives (matching the
					// shared scaffold's framing contract); reported as noise now
					// so a pathological host is visible, not just silent.
					overLimit = true;
					bufferBytes = 0;
					onNoise?.(`<oversized line dropped: >${maxLineBytes} bytes>`);
				} else {
					buffer = tail;
				}
			}
			return frames;
		},
		flush() {
			const frames = [];
			const line = overLimit ? "" : buffer.replace(/\r$/, "").trim();
			buffer = "";
			bufferBytes = 0;
			const wasOverLimit = overLimit;
			overLimit = false;
			if (wasOverLimit) {
				counters.droppedOversized += 1;
				return frames;
			}
			if (!line) return frames;
			counters.lines += 1;
			try {
				const parsed = JSON.parse(line);
				if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
					counters.frames += 1;
					frames.push(parsed);
					return frames;
				}
			} catch {
				// fall through to the noise count below
			}
			counters.noise += 1;
			onNoise?.(line);
			return frames;
		},
		stats() {
			return { ...counters };
		},
	};
}

function isResponse(frame) {
	if (frame.id === undefined || frame.id === null) return false;
	return frame.result !== undefined || frame.error !== undefined;
}

function timeoutError(message) {
	const error = new Error(message);
	error.code = MSP_TIMEOUT_CODE;
	return error;
}

function closedError(message) {
	const error = new Error(String(message || "MSP connection closed"));
	error.code = MSP_CLOSED_CODE;
	return error;
}

function methodNotFoundError(method) {
	const error = new Error(`No handler for MSP method "${method}"`);
	error.code = MSP_METHOD_NOT_FOUND;
	return error;
}
