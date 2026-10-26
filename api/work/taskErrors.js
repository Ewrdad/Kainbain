// Domain: The Work — deciding what a task failure means.
/***
 * MARK: classifyStageError
 * @description Single error taxonomy for stage failures (WP2). Classifies any
 *   stage error into exactly one kind with a stable signal name, so routing
 *   never depends on which call site checks first.
 *
 *   Precedence (first match wins):
 *   1. `operator-abort` — scheduled human intervention (pause/stop/supersede/
 *      restart). Settles quietly: zero retry budget, zero auto-iteration
 *      budget, never counted as an unscheduled failure.
 *   2. `transient` / `git-lock` — git index-lock contention, retried in place.
 *   3. `unrecoverable` / `context-overflow` — provider context-window
 *      overflow (raw provider phrasing or the quota/context bucket with
 *      context wording). Routes to failback WITH prompt/history compaction
 *      hints, never instant Tier-4 parking.
 *   4. `transient` — infrastructure worth retrying in the same stage
 *      (dropped model connections, provider 502/503/504, timeouts, DNS/socket
 *      blips). Network errors (ECONNREFUSED, ENOTFOUND, fetch failed) live
 *      ONLY here — they are never unrecoverable.
 *   5. `unrecoverable` — permanent auth/quota halts (401/403, invalid keys,
 *      rate-limit/quota exhaustion, already-processing).
 *   6. `logical` — everything else (review rejections, test/command
 *      failures, unknown errors): failback as actionable feedback.
 *
 *   Fail safe: exotic carriers (throwing getters, revoked Proxies) and
 *   nullish inputs never throw — they classify as `logical/unknown`.
 *   Text is collected from message fields plus Node `code`, numeric
 *   status fields, AggregateError `errors`, and the `cause` chain.
 * @example classifyStageError("connect ECONNREFUSED 127.0.0.1:11434") => { kind: 'transient', signal: 'connection-refused', retryable: true, action: 'retry' }
 * @example classifyStageError("This operation was aborted") => { kind: 'operator-abort', signal: 'operator-abort', retryable: false, action: 'settle-quietly' }
 * @example classifyStageError("maximum context length exceeded: 32768 tokens") => { kind: 'unrecoverable', signal: 'context-overflow', retryable: false, action: 'failback-compact' }
 * @param {string|Error|Object} error - Message, Error, or agent result object.
 * @returns {{ kind: 'operator-abort'|'transient'|'unrecoverable'|'logical', signal: string, retryable: boolean, action: 'settle-quietly'|'retry'|'failback-compact'|'failback'|'park' }}
 ***/
/***
 * MARK: safeRead
 * @description Reads one property without ever throwing: Proxy getters,
 *   revoked objects, and exotic carriers must not break classification —
 *   the classifier fails safe to `logical/unknown`, never throws.
 * @param {*} holder - Object (or primitive) to read from.
 * @param {string} key - Property name.
 * @returns {*} The property value, or undefined when unreadable.
 ***/
function safeRead(holder, key) {
	try {
		if (holder === null || holder === undefined) return undefined;
		if (typeof holder !== "object" && typeof holder !== "function") {
			return undefined;
		}
		/* eslint-disable-next-line security/detect-object-injection -- key comes from fixed field lists at every call site */
		return holder[key];
	} catch {
		return undefined;
	}
}

function pushText(parts, seen, value, depth, skipKeys) {
	if (typeof value === "string") {
		if (value) parts.push(value);
		return;
	}
	if (typeof value === "number" && Number.isFinite(value)) {
		parts.push(String(value));
	}
	if (value && typeof value === "object" && depth < 5 && !seen.has(value)) {
		seen.add(value);
		collectFromObject(parts, seen, value, depth + 1, skipKeys);
	}
}

/***
 * MARK: collectFromObject
 * @description Collects matchable text from one error carrier level: message
 *   fields, Node-style `code` (ECONNREFUSED etc.), numeric status fields,
 *   the first levels of an AggregateError `errors` array, and one `cause`
 *   step (recursed with cycle protection and a depth cap).
 * @param {Array<string>} parts - Accumulator.
 * @param {Set} seen - Cycle guard across the carrier graph.
 * @param {Object} error - Carrier level to read.
 * @param {number} depth - Current cause-chain depth.
 ***/
/***
 * MARK: LOG_BLOB_KEYS
 * @description Carrier fields holding captured child stdio / whole command
 *   output rather than the failure's own message. The operator-abort text
 *   match must ignore these: passing-test console noise (frontend fetch
 *   AbortErrors, "The operation was aborted" DOMExceptions in CI logs) would
 *   otherwise misroute a real command failure into the budget-free quiet
 *   settle — which the scheduler re-dispatches forever. Genuine aborts still
 *   match via the error name, message, failureReason, and cause chain.
 * @example LOG_BLOB_KEYS.has("stderr") => true
 ***/
const LOG_BLOB_KEYS = new Set(["output", "content", "stderr", "stdout"]);

function collectFromObject(parts, seen, error, depth, skipKeys) {
	for (const key of [
		"message",
		"failureReason",
		"reason",
		"output",
		"content",
		"stderr",
		"stdout",
		"code",
		"status",
		"statusCode",
	]) {
		if (skipKeys?.has(key)) continue;
		const value = safeRead(error, key);
		if (typeof value === "string" || typeof value === "number") {
			pushText(parts, seen, value, depth, skipKeys);
		}
	}
	const errors = safeRead(error, "errors");
	if (Array.isArray(errors)) {
		for (const entry of errors.slice(0, 5)) {
			pushText(parts, seen, entry, depth, skipKeys);
		}
	}
	pushText(parts, seen, safeRead(error, "cause"), depth, skipKeys);
}

function collectErrorText(error, skipKeys) {
	const parts = [];
	try {
		if (typeof error === "string") {
			if (error) parts.push(error);
			return parts.join("\n");
		}
		if (error && typeof error === "object") {
			collectFromObject(parts, new Set([error]), error, 0, skipKeys);
			return parts.join("\n");
		}
		if (error !== undefined && error !== null) {
			parts.push(String(error));
		}
	} catch {
		// Fail safe: return whatever text survived; an empty string routes
		// to `logical/unknown` below instead of throwing at the call site.
	}
	return parts.join("\n");
}

function errorName(error) {
	const name = safeRead(error, "name");
	return typeof name === "string" ? name : null;
}

function isAbortText(str) {
	if (/econnaborted/i.test(str)) return false;
	if (/connection aborted/i.test(str)) return false;
	return /\boperation was aborted\b/i.test(str);
}

/***
 * MARK: isContextOverflowText
 * @description True for provider context-window overflow: raw provider
 *   phrasing ("context length exceeded", "maximum context length",
 *   "context_window_exceeded", "max tokens", "prompt is too long") or the
 *   `[Model Quota/Context Error]` bucket carrying context wording.
 * @param {string} str - Combined error text.
 * @returns {boolean}
 ***/
function isContextOverflowText(str) {
	if (!str) return false;
	if (
		/context[_\s-]*length|maximum context|context[_\s-]*window|context exhausted/i.test(
			str,
		)
	) {
		return true;
	}
	if (/context\b.{0,24}?\btoo\s+(long|large|big)/i.test(str)) return true;
	if (
		/max(imum)?\s+tokens|prompt is too long|input (is )?too long|conversation too long/i.test(
			str,
		)
	) {
		return true;
	}
	if (/too many tokens|tokens exceed|token limit/i.test(str)) return true;
	return false;
}

function isAuthText(str) {
	return (
		/\[Authentication Error\]/i.test(str) ||
		/\b401\b|\b403\b|unauthorized|invalid api key|forbidden/i.test(str)
	);
}

function isQuotaText(str) {
	return (
		/rate limit|\b429\b|quota|session usage limit/i.test(str) ||
		/\[Model Quota\/Context Error\]/i.test(str)
	);
}

/***
 * MARK: TRANSIENT_SIGNALS
 * @description THE single ordered table of retryable-infrastructure
 *   signatures (first match wins). The gate and the signal name read the
 *   same table, so they can never drift apart again: adding a pattern here
 *   adds both its detection and its audit signal in one place. Network
 *   errors (ECONNREFUSED, ENOTFOUND, fetch failed) appear ONLY here —
 *   never in the unrecoverable matchers below.
 ***/
const TRANSIENT_SIGNALS = [
	{ re: /\[Model Connection Error\]/i, signal: "model-connection-error" },
	{ re: /\[Timeout Error\]/i, signal: "timeout" },
	// Narrow on the watchdog's own wording (never a bare `stalled`, which
	// could appear in arbitrary tool output and misclassify a real failure
	// as retryable infrastructure noise).
	{ re: /stage marked stalled|stall detected/i, signal: "stalled" },
	{ re: /\b50[234]\b/, signal: "server-error-5xx" },
	{
		re: /bad gateway|service unavailable|gateway timeout|internal server error/i,
		signal: "server-error-5xx",
	},
	{ re: /ECONNREFUSED|connection refused/i, signal: "connection-refused" },
	{ re: /ENOTFOUND|EAI_AGAIN|getaddrinfo|dns/i, signal: "dns-not-found" },
	{ re: /ETIMEDOUT|timed out|timeout/i, signal: "timeout" },
	{
		re: /ECONNRESET|EPIPE|ENETUNREACH|ECONNABORTED/i,
		signal: "connection-reset",
	},
	{
		re: /socket hang up|connection (?:reset|closed|aborted)|network (?:error|failure|unreachable|reset|timeout)/i,
		signal: "network-blip",
	},
	{
		re: /fetch failed|temporarily unavailable|server overloaded|connection (?:error|timed out)/i,
		signal: "network-blip",
	},
];

function transientSignalFor(str) {
	for (const { re, signal } of TRANSIENT_SIGNALS) {
		try {
			if (re.test(str)) return signal;
		} catch {
			// A poisoned String object must not break classification.
		}
	}
	return null;
}

export function classifyStageError(error) {
	try {
		return classifyStageErrorInner(error);
	} catch {
		// Fail safe: an exotic carrier (throwing Proxy, revoked object) must
		// surface as actionable logical feedback, never crash the router.
		return {
			kind: "logical",
			signal: "unknown",
			retryable: false,
			action: "failback",
		};
	}
}

function classifyStageErrorInner(error) {
	const name = errorName(error);
	if (name && /aborterror/i.test(name)) {
		return {
			kind: "operator-abort",
			signal: "operator-abort",
			retryable: false,
			action: "settle-quietly",
		};
	}
	const str = collectErrorText(error);
	// The abort text match ignores captured log blobs: CI stderr/stdout
	// routinely contains "The operation was aborted" from passing tests'
	// own fetch handling, which must never read as an operator abort of
	// this run (that misroutes a real failure into the budget-free quiet
	// settle, which the scheduler re-dispatches forever). Genuine aborts
	// still match via name, message, failureReason, and cause.
	const abortStr = collectErrorText(error, LOG_BLOB_KEYS);
	if (abortStr && isAbortText(abortStr)) {
		return {
			kind: "operator-abort",
			signal: "operator-abort",
			retryable: false,
			action: "settle-quietly",
		};
	}
	if (isGitLockError(error)) {
		return {
			kind: "transient",
			signal: "git-lock",
			retryable: true,
			action: "retry",
		};
	}
	if (str && isContextOverflowText(str)) {
		return {
			kind: "unrecoverable",
			signal: "context-overflow",
			retryable: false,
			action: "failback-compact",
		};
	}
	const transientStr = str || "";
	// Gate and signal read the same TRANSIENT_SIGNALS table: one invocation
	// decides both, so detection and the audit signal cannot disagree.
	const transientSignal = transientSignalFor(transientStr);
	if (transientSignal !== null) {
		return {
			kind: "transient",
			signal: transientSignal,
			retryable: true,
			action: "retry",
		};
	}
	if (
		error &&
		typeof error === "object" &&
		!(error instanceof Error) &&
		safeRead(error, "failureKind") === "infrastructure"
	) {
		// Tagged infrastructure with no specific signature: retryable, unless
		// the text already resolved above (abort/context) or pins it as a
		// permanent auth/quota halt or logical rejection below.
		if (!isAuthText(transientStr) && !isQuotaText(transientStr)) {
			return {
				kind: "transient",
				signal: "infrastructure-kind",
				retryable: true,
				action: "retry",
			};
		}
	}
	if (/Agent is already processing/i.test(transientStr)) {
		return {
			kind: "unrecoverable",
			signal: "agent-already-processing",
			retryable: false,
			action: "park",
		};
	}
	if (isAuthText(transientStr)) {
		return {
			kind: "unrecoverable",
			signal: "auth-rejection",
			retryable: false,
			action: "park",
		};
	}
	if (isQuotaText(transientStr)) {
		return {
			kind: "unrecoverable",
			signal: "quota-exhaustion",
			retryable: false,
			action: "park",
		};
	}
	if (/\[Agent Review Rejection\]/i.test(transientStr)) {
		return {
			kind: "logical",
			signal: "agent-rejection",
			retryable: false,
			action: "failback",
		};
	}
	if (/test.*fail|fail.*test|assertion/i.test(transientStr)) {
		return {
			kind: "logical",
			signal: "test-failure",
			retryable: false,
			action: "failback",
		};
	}
	if (/exit code|\bCI\b.*fail|command .*fail|lint/i.test(transientStr)) {
		return {
			kind: "logical",
			signal: "command-error",
			retryable: false,
			action: "failback",
		};
	}
	return {
		kind: "logical",
		signal: "unknown",
		retryable: false,
		action: "failback",
	};
}

/***
 * MARK: isUnrecoverableError
 * @description Returns true for permanent halts (auth rejections, quota
 *   exhaustion, context overflow, already-processing). Thin delegate over
 *   `classifyStageError`: network errors (ECONNREFUSED, ENOTFOUND,
 *   fetch failed, `[Model Connection Error]`) are TRANSIENT, never
 *   unrecoverable — the overlap that used to park retryable blips is gone.
 * @param {string|Error|Object} error
 * @returns {boolean}
 ***/
export function isUnrecoverableError(error) {
	try {
		return classifyStageError(error).kind === "unrecoverable";
	} catch {
		return false;
	}
}

/***
 * MARK: isOperatorAbortError
 * @description Returns true for operator-initiated run aborts: pausing/stopping
 *   the engine, aborting a task, superseding a stale duplicate dispatch, or a
 *   deploy restart tearing down the live session. These surface as AbortErrors
 *   ("This operation was aborted") and carry no actionable failure — they must
 *   settle quietly (no failback, no same-stage retry, no budget consumed).
 *   Genuine connection aborts (ECONNABORTED, "connection aborted") are NOT
 *   operator aborts and stay transient.
 *   Thin delegate over `classifyStageError` (single taxonomy).
 * @example isOperatorAbortError("This operation was aborted") => true
 * @example isOperatorAbortError("socket hang up") => false
 * @param {string|Error|Object} error - Message, Error, or agent result object.
 * @returns {boolean}
 ***/
export function isOperatorAbortError(error) {
	if (!error) return false;
	try {
		return classifyStageError(error).kind === "operator-abort";
	} catch {
		return false;
	}
}

/***
 * MARK: isGitLockError
 * @description Returns true for git index-lock contention: another git
 *   process holding `.git/index.lock` (concurrent branch operation) or an
 *   orphaned lock from a crashed/killed git. Matches the error text, stdout,
 *   and stderr so GitError carriers are recognised however they arrive.
 *   Lock contention is never actionable per-stage feedback — it is
 *   infrastructure to retry, not a review finding to fail back.
 * @example isGitLockError("fatal: Unable to create '/r/.git/index.lock': File exists.") => true
 * @example isGitLockError("all good") => false
 * @param {string|Error|Object} error - Message, Error, or carrier with message/stdout/stderr.
 * @returns {boolean}
 ***/
export function isGitLockError(error) {
	try {
		const parts = [];
		if (typeof error === "string") {
			parts.push(error);
		} else if (error && typeof error === "object") {
			for (const key of ["message", "stderr", "stdout", "failureReason"]) {
				const value = safeRead(error, key);
				if (typeof value === "string" && value) parts.push(value);
			}
			if (parts.length === 0) parts.push(String(error || ""));
		} else {
			parts.push(String(error || ""));
		}
		const str = parts.join("\n");
		return (
			/index\.lock/i.test(str) ||
			/Another git process seems to be running/i.test(str) ||
			/Unable to create '.*\.lock': File exists/i.test(str)
		);
	} catch {
		// Fail safe: an unreadable carrier is never lock contention.
		return false;
	}
}

/***
 * MARK: isTransientInfrastructureError
 * @description Returns true for infrastructure failures that are worth retrying
 *   IN THE SAME stage (dropped model connections, provider 502/503/504,
 *   timeouts, DNS/socket blips). These carry no actionable feedback for an
 *   earlier stage, so they must never trigger failback routing — a review
 *   stage that loses its model connection is re-run, not sent back to the
 *   implementation stage with '503 Internal server error' as review feedback.
 *   Thin delegate over `classifyStageError` (single taxonomy): operator
 *   aborts are never transient (they settle quietly instead of burning retry
 *   budget), and quota/auth/context-overflow errors are never transient.
 * @param {string|Error|Object} error - Message, Error, or agent result object
 *   carrying `failureKind: 'infrastructure'`.
 * @returns {boolean}
 ***/
export function isTransientInfrastructureError(error) {
	try {
		return classifyStageError(error).kind === "transient";
	} catch {
		return false;
	}
}
