/***
 * MARK: retrospectiveChat helper
 * @description Pure-ish execution helper for running a single retrospective
 *   prompt turn against an ephemeral harness session. By default the turn
 *   runs with no timeout — it settles when the model answers (pass an
 *   explicit positive `timeoutMs` to opt back into a ceiling, e.g. in
 *   tests or for operators via `KAINBAIN_CHAT_PROMPT_TIMEOUT_MS`).
 *   Disposal stays owned by the calling route's finally block.
 * @example runChatTurn({ session, promptText, timeoutMs }) => { replyText, output }
 ***/

import { resolveChatReplyText } from "./retrospective.js";

/** Character ceiling for the captured assistant-output tail (see runChatTurn). */
export const CHAT_OUTPUT_TAIL_MAX_CHARS = 2000;

/** Front-truncation marker for the output tail (same idiom as context truncation). */
export const CHAT_OUTPUT_TRUNCATED_MARKER = "[…truncated…]";

/***
 * MARK: normalizeTimeoutMs
 * @description Reduces any `timeoutMs` input to an armable ceiling or `0`
 *   (disabled): only a finite number `> 0` arms the server timer. Every
 *   other input — `0`/nullish (the documented opt-out), `NaN`, negative,
 *   `Infinity`, or a non-number — degrades to disabled so a malformed
 *   ceiling can never false-fire an instant `chat_prompt_timeout`; the turn
 *   runs until the model settles instead (fail-safe). Mirrors
 *   `normalizeTimeoutMs` in `frontend/src/services/client/request.js` — the
 *   two packages cannot import each other, so the timeout tests on both
 *   sides pin the shared rule.
 * @example normalizeTimeoutMs(1000) => 1000
 * @example normalizeTimeoutMs(0) => 0
 * @example normalizeTimeoutMs(NaN) => 0
 * @param {unknown} timeoutMs - The raw ceiling input.
 * @returns {number} The armable ceiling, or `0` for disabled.
 ***/
export function normalizeTimeoutMs(timeoutMs) {
	if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs)) return 0;
	if (timeoutMs <= 0) return 0;
	return timeoutMs;
}

/***
 * MARK: truncateOutputTail
 * @description Bounds captured assistant output to a readable tail: text at
 *   or under the cap passes through; longer text keeps its most recent
 *   `maxChars` worth behind the front-truncation marker.
 * @example truncateOutputTail("short") => "short"
 * @example truncateOutputTail("a".repeat(100), 20) => "[…truncated…]\naaaaaa" (marker + tail)
 * @param {string} text - The captured output.
 * @param {number} [maxChars=CHAT_OUTPUT_TAIL_MAX_CHARS] - Total ceiling incl. marker.
 * @returns {string} The bounded tail ("" for non-string input; never longer
 *   than maxChars — when the cap leaves no room for the marker, the raw tail
 *   wins over the marker).
 ***/
export function truncateOutputTail(text, maxChars = CHAT_OUTPUT_TAIL_MAX_CHARS) {
	if (typeof text !== "string" || !text) return "";
	if (text.length <= maxChars) return text;
	const tailLen = maxChars - CHAT_OUTPUT_TRUNCATED_MARKER.length - 1;
	if (tailLen <= 0) return text.slice(-maxChars);
	return `${CHAT_OUTPUT_TRUNCATED_MARKER}\n${text.slice(-tailLen)}`;
}

/***
 * MARK: runChatTurn
 * @description Executes session.prompt(promptText), raced against timeoutMs
 *   only when a positive ceiling is passed. `timeoutMs: 0`/nullish (the
 *   default) disables the race entirely: the turn runs until the model
 *   settles, and is ended early only by the caller disposing the session.
 *   Resolves the assistant reply text plus a bounded tail of the assistant
 *   output observed during the turn (`output`, "" when nothing streamed).
 *   Normalizes errors:
 *   - Timeout (opt-in ceiling only) -> Error with code "chat_prompt_timeout"
 *   - session.prompt throw -> Error with code "chat_prompt_failed"
 *   Both coded errors carry `partialOutput` (bounded tail, "" when nothing
 *   arrived) so the route can show what arrived before the failure.
 *
 *   Capture sources, in preference order (per-harness spike: every harness
 *   supports `prompt(text, { onChunk })`, but several ALSO re-emit the same
 *   deltas through `subscribe`, so the two streams are collected separately
 *   and the onChunk buffer wins — never concatenated, never double-counted):
 *   1. `onChunk` deltas (primary; every harness forwards assistant text here),
 *   2. `subscribe` `assistant_delta` events (fallback when onChunk yields nothing),
 *   3. `getLastAssistantText()` at settle time (last resort on timeout/failure).
 * @param {Object} args
 * @param {Object} args.session - The ephemeral harness session.
 * @param {string} args.promptText - The compiled prompt.
 * @param {number} [args.timeoutMs=0] - Opt-in server-side prompt ceiling
 *   in ms. `0`/nullish (the default, mirroring a disabled
 *   `chatPromptTimeoutMs` in `api/config.js`) disables the race: the turn
 *   runs until the model settles. Degenerate inputs (`NaN`, negatives,
 *   `Infinity`, non-numbers) also disable via `normalizeTimeoutMs`.
 * @param {Function} [args.onProgress] - Optional
 *   `(delta: string, source: "chunk" | "subscribed") => void` sink for
 *   assistant streaming deltas as they arrive. Both streams report (the
 *   default pi harness delivers through `subscribe`), tagged so the caller
 *   can keep the same winner rule as the tail finalizer instead of
 *   double-counting harnesses that emit through both.
 * @returns {Promise<{ replyText: string, output: string }>}
 ***/
export async function runChatTurn({ session, promptText, timeoutMs = 0, onProgress }) {
	// Fail-safe ceiling: only a finite positive number arms the server
	// timer — anything else runs until the model settles (or the caller
	// disposes the session) instead of false-firing an instant timeout.
	const ceilingMs = normalizeTimeoutMs(timeoutMs);
	const timeoutArmed = ceilingMs > 0;
	let timer = null;
	const timeoutPromise = timeoutArmed
		? new Promise((_, reject) => {
				timer = setTimeout(() => {
					const err = new Error(`Chat prompt timed out after ${ceilingMs}ms`);
					err.code = "chat_prompt_timeout";
					reject(err);
				}, ceilingMs);
			})
		: null;
	if (timer && typeof timer.unref === "function") timer.unref();

	// Dual buffers (never concatenated): most harnesses emit the same delta
	// through BOTH onChunk and subscribe — chunkText wins when non-empty.
	// Each buffer is capped live, with an overflow flag so the final tail
	// still carries the truncation marker when leading chars were dropped.
	let chunkText = "";
	let chunkOverflowed = false;
	let subscribedText = "";
	let subscribedOverflowed = false;
	const reportDelta = (delta, source) => {
		if (typeof delta !== "string" || !delta) return;
		if (typeof onProgress === "function") {
			try {
				onProgress(delta, source);
			} catch {
				// A progress sink must never fail the turn.
			}
		}
	};
	const handleChunk = (delta) => {
		if (typeof delta !== "string" || !delta) return;
		const combined = `${chunkText}${delta}`;
		if (combined.length > CHAT_OUTPUT_TAIL_MAX_CHARS) chunkOverflowed = true;
		chunkText = combined.slice(-CHAT_OUTPUT_TAIL_MAX_CHARS);
		reportDelta(delta, "chunk");
	};
	let unsubscribe = null;
	if (session && typeof session.subscribe === "function") {
		try {
			unsubscribe = session.subscribe((event) => {
				if (event?.type === "assistant_delta" && typeof event.delta === "string") {
					const combined = `${subscribedText}${event.delta}`;
					if (combined.length > CHAT_OUTPUT_TAIL_MAX_CHARS) subscribedOverflowed = true;
					subscribedText = combined.slice(-CHAT_OUTPUT_TAIL_MAX_CHARS);
					reportDelta(event.delta, "subscribed");
				}
			});
		} catch {
			unsubscribe = null;
		}
	}
	/** Bounds one live-capped buffer, forcing the marker when chars were dropped. */
	const finalizeTail = (text, overflowed) => {
		const bounded = truncateOutputTail(text);
		if (overflowed && bounded && !bounded.startsWith(CHAT_OUTPUT_TRUNCATED_MARKER)) {
			const tailLen = Math.max(
				0,
				CHAT_OUTPUT_TAIL_MAX_CHARS - CHAT_OUTPUT_TRUNCATED_MARKER.length - 1,
			);
			return `${CHAT_OUTPUT_TRUNCATED_MARKER}\n${bounded.slice(-tailLen)}`;
		}
		return bounded;
	};
	/** The winning streamed buffer (onChunk first, subscribe fallback). */
	const streamedTail = () =>
		chunkText
			? finalizeTail(chunkText, chunkOverflowed)
			: finalizeTail(subscribedText, subscribedOverflowed);
	const releaseSubscription = () => {
		if (typeof unsubscribe === "function") {
			try {
				unsubscribe();
			} catch {
				// Unsubscribe is best-effort.
			}
			unsubscribe = null;
		}
	};

	/** Best-effort partial text observable right now (timeout/failure path). */
	const readPartialOutput = async () => {
		const streamed = streamedTail();
		if (streamed) return streamed;
		try {
			if (session && typeof session.getLastAssistantText === "function") {
				const text = await session.getLastAssistantText();
				if (typeof text === "string" && text) return truncateOutputTail(text);
			}
		} catch {
			// Fall through to the empty tail.
		}
		return "";
	};

	try {
		const promptPromise = session.prompt(promptText, { onChunk: handleChunk });
		const result = timeoutArmed
			? await Promise.race([promptPromise, timeoutPromise])
			: await promptPromise;
		clearTimeout(timer);
		releaseSubscription();
		const replyText = await resolveChatReplyText(session, result);
		return { replyText, output: streamedTail() };
	} catch (err) {
		clearTimeout(timer);
		releaseSubscription();
		const partialOutput = await readPartialOutput();
		if (err?.code === "chat_prompt_timeout") {
			err.partialOutput = partialOutput;
			throw err;
		}
		const wrappedErr = new Error(`Chat prompt failed: ${err?.message || String(err)}`);
		wrappedErr.code = "chat_prompt_failed";
		wrappedErr.cause = err;
		wrappedErr.partialOutput = partialOutput;
		throw wrappedErr;
	}
}
