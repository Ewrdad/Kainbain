/**
 * MARK: AcpStreamTransport
 * @description Generic newline-delimited JSON (NDJSON) framing for the Agent
 *   Client Protocol (JSON-RPC 2.0 over stdio). This module owns ONLY bytes and
 *   lines: splitting stdout chunks into complete lines, JSON-parsing each
 *   line, and serializing outbound frames. It names no vendor, no binary, and
 *   no harness — any future ACP harness adapter imports it unchanged.
 *
 *   Semantics (mirroring the shared scaffold's framing contract so behavior
 *   stays familiar):
 *   - `\r\n` line endings, blank lines, and non-JSON noise lines are skipped
 *     (counted, never thrown on) — agent stderr that leaks into stdout must
 *     not break the session.
 *   - A single-line byte cap trips INCREMENTALLY on the partial line, so a
 *     pathological stream is never fully buffered.
 *   - `flush()` collects a final unterminated line when the stream ends.
 *
 *   UTF-8 note: feed this parser DECODED strings (via StringDecoder at the
 *   spawn site, as AcpSessionRuntime does) so a multi-byte character split
 *   across chunk boundaries never corrupts a frame.
 */

/** Default single-line cap: a frame larger than 1 MiB is dropped. */
export const DEFAULT_ACP_MAX_LINE_BYTES = 1024 * 1024;

/***
 * MARK: encodeAcpFrame
 * @description Serializes one JSON-RPC frame to its newline-terminated wire form.
 * @example encodeAcpFrame({ jsonrpc: "2.0", id: 1, method: "initialize" }) => '{"jsonrpc":"2.0",...}\n'
 * @param {Object} frame - The JSON-RPC object to send.
 * @returns {string} The wire line (object + "\n").
 ***/
export function encodeAcpFrame(frame) {
	return `${JSON.stringify(frame)}\n`;
}

/***
 * MARK: createAcpFrameParser
 * @description Builds an incremental NDJSON frame parser for an ACP agent's
 *   stdout stream. Feed decoded stdout chunks to `push` (returns the frames
 *   completed by that chunk); call `flush` when the stream ends to collect a
 *   final unterminated line. Pure (no I/O, no clock) so framing is
 *   unit-testable without a real subprocess.
 * @example const parser = createAcpFrameParser(); parser.push('{"jsonrpc":"2.0"}\n') => [{ jsonrpc: "2.0" }]
 * @param {Object} [opts]
 * @param {number} [opts.maxLineBytes] - Single-line byte cap (default 1 MiB).
 * @returns {Object} The parser: { push(chunk), flush(), stats() }.
 ***/
export function createAcpFrameParser({ maxLineBytes = DEFAULT_ACP_MAX_LINE_BYTES } = {}) {
	let buffer = ""; // retained partial line (never grows past the cap)
	let bufferBytes = 0; // accumulated UTF-8 byte length of the partial line
	let bufferOverLimit = false; // current line already exceeded the cap
	const counters = {
		lines: 0,
		frames: 0,
		skippedNoise: 0,
		droppedOversized: 0,
	};

	function parseLine(rawLine) {
		const line = rawLine.replace(/\r$/, "").trim();
		counters.lines += 1;
		if (!line) return null;

		if (Buffer.byteLength(line, "utf8") > maxLineBytes) {
			counters.droppedOversized += 1;
			return null;
		}

		let frame;
		try {
			frame = JSON.parse(line);
		} catch {
			// Diagnostic noise that leaked into stdout — skip silently.
			counters.skippedNoise += 1;
			return null;
		}
		if (!frame || typeof frame !== "object" || Array.isArray(frame)) {
			counters.skippedNoise += 1;
			return null;
		}
		counters.frames += 1;
		return frame;
	}

	return {
		push(chunk) {
			const frames = [];
			if (typeof chunk !== "string" || chunk.length === 0) return frames;
			const hadPending = buffer.length > 0;
			const text = hadPending ? buffer + chunk : chunk;
			buffer = "";
			let start = 0;
			let newlineIndex;
			while ((newlineIndex = text.indexOf("\n", start)) !== -1) {
				const line = text.slice(start, newlineIndex);
				start = newlineIndex + 1;
				if (bufferOverLimit) {
					// The oversized line's terminator arrived: drop it (already
					// discarded incrementally); framing stays in sync.
					bufferOverLimit = false;
					bufferBytes = 0;
					counters.droppedOversized += 1;
					continue;
				}
				bufferBytes = 0;
				const parsed = parseLine(line);
				if (parsed) frames.push(parsed);
			}
			const tail = text.slice(start);
			if (tail.length > 0) {
				if (bufferOverLimit) {
					// Keep discarding the oversized line's tail until its newline.
					return frames;
				}
				bufferBytes =
					hadPending && start === 0
						? bufferBytes + Buffer.byteLength(chunk, "utf8")
						: Buffer.byteLength(tail, "utf8");
				if (bufferBytes > maxLineBytes) {
					// Drop the moment the cap trips — never accumulate an
					// oversized line.
					bufferOverLimit = true;
					bufferBytes = 0;
					return frames;
				}
				buffer = tail;
			}
			return frames;
		},

		flush() {
			const frames = [];
			if (!bufferOverLimit && buffer.trim().length > 0) {
				const parsed = parseLine(buffer);
				if (parsed) frames.push(parsed);
			}
			buffer = "";
			bufferBytes = 0;
			bufferOverLimit = false;
			return frames;
		},

		stats() {
			return { ...counters };
		},
	};
}
