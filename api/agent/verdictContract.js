/***
 * MARK: verdictContract
 * @description Api-side door to the agent stage-verdict contract
 *   (`parseStageVerdict`, `stageExpectsAgentVerdict`,
 *   `decideAgentStageVerdict`) plus the configurable tool-loop guard. The
 *   verdict parser, guard, and decision live in shared/stageVerdict/ — the
 *   single source of truth the Runner imports too — and are re-exported
 *   here so every existing api/ import keeps working. Stages default to
 *   passing (fail-open): only an explicit `fail_stage` call or a well-formed
 *   FAIL block with reason and fix guidance fails a stage — a reasonless
 *   FAIL, a malformed block, prose verdicts, and runs with no verdict at all
 *   pass open. The verdict contract is AGENT-ONLY: human, ci, deploy, and
 *   merge stages never render, require, or are failed by a verdict (see
 *   `stageExpectsAgentVerdict`).
 ***/
// The verdict parser, guard, and decision live in shared/stageVerdict/ (the
// Runner imports them from there); re-exported here so every existing api/
// import keeps working byte-identically.
export {
	decideAgentStageVerdict,
	parseStageVerdict,
	stageExpectsAgentVerdict,
} from "../../shared/stageVerdict.js";

/***
 * MARK: DEFAULT_TOOL_LOOP_STRIKES
 * @description Out-of-the-box consecutive tool failures before the loop
 *   guard aborts the stage. Mirrors the `toolLoopStrikes` config default so
 *   unit-test rigs without config behave identically.
 ***/
export const DEFAULT_TOOL_LOOP_STRIKES = 3;

/***
 * MARK: resolveToolLoopStrikes
 * @description Resolves the tool-loop trip threshold: explicit stage/project
 *   overrides win, then the global `toolLoopStrikes` config, then the
 *   built-in default. WP4 ships global-only tuning (WP9 owns per-stage /
 *   per-project calibration); the override seam already exists here.
 * @example resolveToolLoopStrikes({ cfg: { toolLoopStrikes: 5 } }) => 5
 * @param {Object} [opts]
 * @param {Object} [opts.stage] - Stage entity (opts.toolLoopStrikes override).
 * @param {Object} [opts.project] - Project entity (override).
 * @param {Object} [opts.cfg] - Config object (global toolLoopStrikes).
 * @returns {number} Positive strike threshold.
 ***/
export function resolveToolLoopStrikes({ stage, project, cfg } = {}) {
	for (const candidate of [
		stage?.toolLoopStrikes,
		project?.toolLoopStrikes,
		cfg?.toolLoopStrikes,
	]) {
		const n = typeof candidate === "string" ? Number(candidate) : candidate;
		if (typeof n === "number" && Number.isFinite(n) && n >= 1) {
			return Math.floor(n);
		}
	}
	return DEFAULT_TOOL_LOOP_STRIKES;
}

/***
 * MARK: checkToolLoopGuard
 * @description Pure trip predicate for the tool-loop guard.
 * @example checkToolLoopGuard(3, 3) => true
 * @param {number} consecutiveCount - Consecutive tool failures so far.
 * @param {number} threshold - Trip threshold (see resolveToolLoopStrikes).
 * @returns {boolean} True when the guard must trip.
 ***/
export function checkToolLoopGuard(consecutiveCount, threshold) {
	const strikes = Math.floor(Number(threshold));
	if (!Number.isFinite(strikes) || strikes < 1) {
		return consecutiveCount >= DEFAULT_TOOL_LOOP_STRIKES;
	}
	return consecutiveCount >= strikes;
}

/***
 * MARK: truncateExcerpt
 * @description Truncates a diagnostic excerpt to a char budget.
 * @example truncateExcerpt("abcdef", 4) => "abcd"
 * @param {string} value - Raw text.
 * @param {number} [maxChars=500] - Char budget.
 * @returns {string} Trimmed excerpt.
 ***/
export function truncateExcerpt(value, maxChars = 500) {
	const text = typeof value === "string" ? value : String(value ?? "");
	const budget =
		typeof maxChars === "number" && maxChars > 0
			? Math.floor(maxChars)
			: 500;
	const trimmed = text.trim();
	if (trimmed.length <= budget) return trimmed;
	return trimmed.slice(0, budget);
}

/***
 * MARK: formatLoopDiagnostic
 * @description Builds the loop-guard failback diagnostic, including the
 *   failing tool-call payload/error excerpt (HAZOP "LESS retries than
 *   needed" — operators see WHICH call looped, not just a count).
 * @example formatLoopDiagnostic({ toolName: "bash", consecutiveCount: 3, errorExcerpt: "boom" }) => "Repeated tool failure loop detected (bash failed 3 consecutive times). Last failure: bash: boom"
 * @param {Object} [opts]
 * @param {string} [opts.toolName] - Failing tool name.
 * @param {number} [opts.consecutiveCount] - Consecutive failure count at trip.
 * @param {string} [opts.argsExcerpt] - Truncated tool-call arguments.
 * @param {string} [opts.errorExcerpt] - Truncated tool error output.
 * @returns {string} Diagnostic message.
 ***/
export function formatLoopDiagnostic({
	toolName,
	consecutiveCount,
	argsExcerpt,
	errorExcerpt,
} = {}) {
	const name =
		typeof toolName === "string" && toolName.trim() ? toolName.trim() : "tool";
	const count =
		typeof consecutiveCount === "number" && consecutiveCount >= 1
			? Math.floor(consecutiveCount)
			: DEFAULT_TOOL_LOOP_STRIKES;
	const args = truncateExcerpt(argsExcerpt || "", 500);
	const err = truncateExcerpt(errorExcerpt || "Tool execution error", 500);
	const payload = args ? `${name}(${args}): ${err}` : `${name}: ${err}`;
	return (
		`Repeated tool failure loop detected (${name} failed ${count} ` +
		`consecutive time${count === 1 ? "" : "s"}). Last failure: ${payload}`
	);
}

// `parseStageVerdict` lives in shared/stageVerdict/ (re-exported at the top
// of this file).
