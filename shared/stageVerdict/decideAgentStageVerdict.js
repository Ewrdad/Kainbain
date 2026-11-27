import { formatSessionErrorReason } from "./formatSessionErrorReason.js";
import { parseStageVerdict } from "./parseStageVerdict.js";
import { stageExpectsAgentVerdict } from "./stageExpectsAgentVerdict.js";

/***
 * MARK: decideAgentStageVerdict
 * @description THE single pass/fail decision for an agent stage's
 *   failure signals, shared verbatim by the embedded path
 *   (`api/agentRunner.js`), the Runner daemon (`runner/daemon.js`), and the
 *   backend double-check (`api/flow/execution/applyRunnerReport.js`) so the
 *   paths cannot drift again. Precedence is the embedded order, first match
 *   wins: an explicit `fail_stage` tool call > a latched harness
 *   `sessionError` (a `run_error` the session emitted) > a well-formed FAIL
 *   text block with reason AND fix guidance > pass. A reasonless FAIL, a malformed
 *   block, prose verdicts, and runs with no verdict at all pass open
 *   (fail-open: KainBain never fails a stage without guidance to fix); an
 *   ignored FAIL returns its warning text in `failOpenWarning` so the caller
 *   can warn-log it. The text verdict is agent-only: non-agent stages never
 *   parse their output. The `failStageRequest` signal wins unconditionally,
 *   exactly as the embedded path latches it — callers only capture that
 *   event on agent paths. Reason strings are byte-identical to the embedded
 *   path (including the shared fallback below) so failure reports,
 *   timeline rows, and push-suppression (`failureKind: "rejected"`, which
 *   callers set alongside) behave identically everywhere. A whitespace-only
 *   reason is no reason: it falls back to the shared default rather than
 *   printing a blank rejection.
 * @example decideAgentStageVerdict({ stage: { type: "agent" }, output: "ok", failStageRequest: { reason: "red" } }).failed => true
 * @example decideAgentStageVerdict({ stage: { type: "agent" }, output: "KAINBAIN_VERDICT: FAIL\nKAINBAIN_REASON: red\nKAINBAIN_FIX: blue" }).failureReason => "[Agent Review Rejection] red Fix guidance: blue"
 * @example decideAgentStageVerdict({ stage: { type: "agent" }, output: "KAINBAIN_VERDICT: FAIL" }).failed => false
 * @example decideAgentStageVerdict({ stage: { type: "human" }, output: "KAINBAIN_VERDICT: FAIL\nKAINBAIN_REASON: red\nKAINBAIN_FIX: blue" }).failed => false
 * @param {Object} [opts]
 * @param {Object} [opts.stage] - Stage entity (any object carrying `type`).
 * @param {string} [opts.output] - The agent's final output text.
 * @param {Object|string|null} [opts.failStageRequest] - The latched
 *   `fail_stage` tool call (`{ reason }`, or the bare reason string); null
 *   when the agent never called the tool.
 * @param {Object|string|null} [opts.sessionError] - The latched harness
 *   `run_error` (`{ error, code, hint }`, or the bare error string); null
 *   when the session reported no engine-level failure. A present
 *   sessionError fails agent stages BELOW an explicit `fail_stage` call
 *   (deliberate agent decisions still win) and ABOVE the fail-open text
 *   verdict (an engine failure is not a verdict — a PASS block or empty
 *   output alongside it still fails). Agent-stage-gated like the text
 *   verdict: non-agent stages have no session to fail them. Callers that
 *   pass no sessionError (the embedded path, the backend double-check)
 *   behave byte-identically to before.
 * @returns {{failed: boolean, failureReason: string|null, failOpenWarning: string|null}} The decision.
 ***/
export function decideAgentStageVerdict({ stage, output, failStageRequest, sessionError = null } = {}) {
	// An explicit fail_stage decision wins over any coincidental text
	// verdict — even a PASS block: the agent actively decided the stage
	// should fail, so this is review feedback, not a blip.
	if (failStageRequest) {
		const rawReason =
			typeof failStageRequest === "string"
				? failStageRequest
				: failStageRequest?.reason;
		const reasonText =
			typeof rawReason === "string" ? rawReason.trim() : rawReason;
		// The fallback is the embedded path's long-standing default
		// (api/agentRunner.js latches the same string), so a reasonless
		// tool call reads identically wherever the stage ran.
		const reason = reasonText || "Stage failure reported by agent review";
		return {
			failed: true,
			failureReason: `[Agent Review Rejection] ${reason}`,
			failOpenWarning: null,
		};
	}
	// A latched harness run_error fails the stage even when the final text
	// says PASS (or is empty): the engine — not the agent — reported that
	// the run itself broke (missing binary, auth, crash, timeout, empty
	// run), so there is no agent verdict to honour. Fail-closed, with the
	// harness code + fix hint in the reason so the failure is actionable.
	if (sessionError && stageExpectsAgentVerdict(stage)) {
		return {
			failed: true,
			failureReason: formatSessionErrorReason(sessionError),
			failOpenWarning: null,
		};
	}
	// Text verdict fallback (fail OPEN): only a well-formed FAIL block WITH
	// reason and fix guidance fails the stage. The verdict contract is
	// agent-only: human/ci/deploy/merge stages never render or are failed
	// by a verdict, so their output is never parsed.
	const textVerdict = stageExpectsAgentVerdict(stage)
		? parseStageVerdict(output)
		: { verdict: null, reason: "", fix: "" };
	if (textVerdict.verdict === "FAIL") {
		if (textVerdict.reason && textVerdict.fix) {
			return {
				failed: true,
				failureReason: `[Agent Review Rejection] ${textVerdict.reason} Fix guidance: ${textVerdict.fix}`,
				failOpenWarning: null,
			};
		}
		return {
			failed: false,
			failureReason: null,
			failOpenWarning:
				"[WARN] Stage verdict FAIL ignored (fail-open): the verdict block has no usable reason/fix guidance, so the stage passes. A failure without guidance is never recorded — see the stage report for the full output.",
		};
	}
	return { failed: false, failureReason: null, failOpenWarning: null };
}
