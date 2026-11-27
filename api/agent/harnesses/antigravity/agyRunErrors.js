/**
 * MARK: agyRunErrors
 * @description The exec-transport run-failure taxonomy for the antigravity
 *   harness: every headless `agy` run that fails OUTSIDE the stream protocol
 *   (the child never starts, the engine watchdog fires, or the child dies
 *   without a `result` line) is sorted into a stable
 *   `{ code, message, hint }` — the same shape `classifyAgyModelsFailure`
 *   and `classifyAgyAcpStartupFailure` already use for discovery and ACP
 *   startup — so the process log, the run_error event, and the reliability
 *   buckets can name the cause plus the fix instead of an ad hoc string.
 *   Pure functions only (no spawns, no clock), so the mapping is
 *   unit-testable without a real subprocess.
 */

/***
 * MARK: formatAgyRunError
 * @description Renders one classified run failure as the single string the
 *   engine's `run_error` event carries (`error` stays a string for the
 *   consumers that match on it): the message plus the stable code and the
 *   fix hint, so a log line alone is actionable.
 * @example formatAgyRunError({ code: "AGY_BIN_MISSING", message: "not found", hint: "install it" }) => "not found [AGY_BIN_MISSING] install it"
 * @param {Object} classified - `{ code, message, hint }` from a classifier below.
 * @returns {string} The single-string rendering.
 ***/
export function formatAgyRunError(classified) {
	if (typeof classified === "string") {
		const text = classified.trim();
		return text ? `${text} [AGY_RUN_FAILED]` : "agy run failed [AGY_RUN_FAILED]";
	}
	const code = classified?.code || "AGY_RUN_FAILED";
	const message = classified?.message || "agy run failed";
	const hint = classified?.hint ? ` ${classified.hint}` : "";
	return `${message} [${code}]${hint}`;
}

/***
 * MARK: classifyAgySpawnError
 * @description Sorts a spawn-time failure (the child process never started)
 *   into a stable error: ENOENT means the binary is missing (install fix),
 *   anything else is a spawn-shape problem (permissions, bad path) that must
 *   never misreport as a missing install.
 * @example classifyAgySpawnError(new Error("spawn agy ENOENT"), { bin: "agy" }).code => "AGY_BIN_MISSING"
 * @param {Error|string} error - The spawn rejection.
 * @param {Object} [opts]
 * @param {string} [opts.bin] - The binary path attempted (named in the message).
 * @returns {{code: string, message: string, hint: string}} The classified error.
 ***/
export function classifyAgySpawnError(error, { bin } = {}) {
	const detail = error?.message || String(error ?? "unknown error");
	const errCode = error?.code || "";
	const binary = bin || "agy";
	const message = `Failed to start agy CLI '${binary}': ${detail.trim().slice(-300)}`;
	if (errCode === "ENOENT" || /ENOENT/i.test(detail)) {
		return {
			code: "AGY_BIN_MISSING",
			message,
			hint: "Install the Antigravity CLI and ensure it is on PATH or in ~/.local/bin, or set KAINBAIN_AGY_BIN to its absolute path.",
		};
	}
	return {
		code: "AGY_SPAWN_FAILED",
		message,
		hint: `The binary exists but could not be started — check execute permissions on '${binary}' and that KAINBAIN_AGY_BIN points at an executable file.`,
	};
}

/***
 * MARK: classifyAgyRunTimeout
 * @description Builds the classified error for a run killed by the
 *   ENGINE-side watchdog (the scaffold `onTimeout` — the only timeout that
 *   fires inside the exec transport, since a hung CLI never prints its own
 *   `--print-timeout` line). The message names BOTH ceilings — the watchdog
 *   milliseconds that tripped and the CLI `--print-timeout` it backs — so a
 *   hang no longer reads as a bare crash and the operator knows which knob
 *   to raise.
 * @example classifyAgyRunTimeout({ printTimeout: "10m", watchdogMs: 600000 }).code => "AGY_RUN_TIMEOUT"
 * @param {Object} [opts]
 * @param {string} [opts.printTimeout] - The CLI `--print-timeout` value the run was given.
 * @param {number} [opts.watchdogMs] - The engine watchdog milliseconds that tripped.
 * @returns {{code: string, message: string, hint: string}} The classified error.
 ***/
export function classifyAgyRunTimeout({ printTimeout, watchdogMs } = {}) {
	return {
		code: "AGY_RUN_TIMEOUT",
		message:
			`agy run timed out after ${printTimeout || "the configured ceiling"} ` +
			`(engine watchdog ${watchdogMs ?? "?"}ms tripped before the CLI's own --print-timeout ceiling)`,
		hint: "Raise KAINBAIN_AGY_PRINT_TIMEOUT for long runs (the engine watchdog derives from it), or check the network when a fast prompt hangs.",
	};
}

/***
 * MARK: classifyAgyEmptyRun
 * @description Builds the classified error for an agy run that reported
 *   SUCCESS yet did no work: an empty `response`, no accumulated assistant
 *   deltas, and zero tool events. A spawned-but-idle run is an engine-level
 *   failure (silent skips hide broken stages), never a pass — the code
 *   `AGY_EMPTY_RUN` tells the verdict to fail the stage with the fix hint.
 * @example classifyAgyEmptyRun().code => "AGY_EMPTY_RUN"
 * @returns {{code: string, message: string, hint: string}} The classified error.
 ***/
export function classifyAgyEmptyRun() {
	return {
		code: "AGY_EMPTY_RUN",
		message:
			"agy exited SUCCESS with an empty response and no tool calls — the run did no work",
		hint: "Check auth/model/quota (run `agy models` by hand), then re-run the stage; if a real prompt returns nothing, the CLI install may be broken.",
	};
}

/** `finished_reason` values naming a ceiling/timeout rather than a completion. */
const PARTIAL_FINISH_REASONS = new Set([
	"print_timeout",
	"timeout",
	"deadline_exceeded",
	"max_turns",
	"max_tokens",
	"context_exceeded",
	"cancelled",
	"canceled",
]);

/***
 * MARK: isAgyPartialResult
 * @description Whether a `result` payload is a PARTIAL run wearing a SUCCESS
 *   status: the CLI hit a ceiling (`finished_reason: "print_timeout"` et al)
 *   but still reported SUCCESS. Partial output is not a completed run — the
 *   caller must report it as a run_error (timeout classification), never as
 *   `run_finished`. Pure (no spawns, no clock), unit-testable.
 * @example isAgyPartialResult({ status: "SUCCESS", finished_reason: "print_timeout" }) => true
 * @example isAgyPartialResult({ status: "SUCCESS", response: "done" }) => false
 * @param {Object} [payload] - The parsed `result` payload.
 * @returns {boolean} True when the row is a partial run masquerading as SUCCESS.
 ***/
export function isAgyPartialResult(payload) {
	if (!payload || typeof payload !== "object") return false;
	if (payload.status !== "SUCCESS") return false;
	const reason = payload.finished_reason ?? payload.finishedReason;
	if (typeof reason !== "string" || !reason.trim()) return false;
	return PARTIAL_FINISH_REASONS.has(reason.trim().toLowerCase());
}

/***
 * MARK: classifyAgyPartialTimeout
 * @description Builds the classified error for a PARTIAL run wearing a
 *   SUCCESS status (`isAgyPartialResult`): the CLI hit a ceiling
 *   (`finished_reason: "print_timeout"` et al) but still reported SUCCESS.
 *   Ceiling-hit output is not a completed run — it reports under the
 *   existing `AGY_RUN_TIMEOUT` code so reliability buckets agree with the
 *   watchdog path, with the finished_reason named so the operator knows
 *   which ceiling tripped.
 * @example classifyAgyPartialTimeout({ finished_reason: "print_timeout" }).code => "AGY_RUN_TIMEOUT"
 * @param {Object} [payload] - The parsed `result` payload.
 * @returns {{code: string, message: string, hint: string}} The classified error.
 ***/
export function classifyAgyPartialTimeout(payload) {
	const reason = payload?.finished_reason ?? payload?.finishedReason ?? "unknown ceiling";
	return {
		code: "AGY_RUN_TIMEOUT",
		message: `agy reported SUCCESS but the run was partial (finished_reason: ${String(reason).trim() || "unknown ceiling"}) — the response is incomplete`,
		hint: "Raise KAINBAIN_AGY_PRINT_TIMEOUT for long runs (the engine watchdog derives from it), or simplify the prompt so it fits the ceiling.",
	};
}

/** Stderr shapes that mean the CLI never authenticated (not a crash). */
const AUTH_PATTERN =
	/authenticat|auth login|not logged in|login required|unauthorized|unauthorised|unauthenticated|invalid credential|expired credential|missing credential|api[ -]?key/i;

/***
 * MARK: classifyAgyCrashExit
 * @description Sorts a child that died WITHOUT a `result` line (crash, kill,
 *   auth failure) into a stable error from the exit code plus the stderr
 *   tail: an auth-shaped tail is `AGY_AUTH_REQUIRED` (never a plain crash),
 *   anything else is `AGY_CRASHED`. The message keeps the
 *   "exited with code/signal … without a result" prefix plus the tail, so existing
 *   log matchers keep working.
 * @example classifyAgyCrashExit({ code: 1, stderrTail: "boom" }).code => "AGY_CRASHED"
 * @param {Object} [opts]
 * @param {number|string|null} [opts.code] - The child exit code (null/unknown when the close reason is missing).
 * @param {string|null} [opts.signal] - The terminating signal (e.g. "SIGKILL", "SIGSEGV") when killed by signal.
 * @param {string} [opts.stderrTail] - The captured stderr tail (may be "").
 * @returns {{code: string, message: string, hint: string}} The classified error.
 ***/
export function classifyAgyCrashExit({ code, signal, stderrTail = "" } = {}) {
	const tail = String(stderrTail || "").trim().slice(-400);
	const exitDesc = signal ? `signal ${signal}` : `code ${code ?? "unknown"}`;
	const message =
		`agy exited with ${exitDesc} without a result` + (tail ? `: ${tail}` : "");
	if (AUTH_PATTERN.test(tail)) {
		return {
			code: "AGY_AUTH_REQUIRED",
			message,
			hint: "Run `agy auth login` in a terminal, then retry the stage.",
		};
	}
	return {
		code: "AGY_CRASHED",
		message,
		hint: "The CLI died before reporting a result — re-run the stage; if it repeats, run the same prompt with the agy CLI by hand to see the crash.",
	};
}
