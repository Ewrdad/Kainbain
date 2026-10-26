/***
 * MARK: verdictContract
 * @description Single source of truth for the agent stage-verdict parser and
 *   the configurable tool-loop guard. Stages default to passing (fail-open):
 *   only an explicit `fail_stage` call or a well-formed FAIL block with
 *   reason and fix guidance fails a stage — a reasonless FAIL, a malformed
 *   block, prose verdicts, and runs with no verdict at all pass open. The
 *   runner and the tests import from here so the verdict parsing stays
 *   identical everywhere. The verdict contract is AGENT-ONLY: human, ci,
 *   deploy, and merge stages never render, require, or are failed by a
 *   verdict (see `stageExpectsAgentVerdict`).
 ***/
import { normalizeStageType } from "../projectStore.js";

/***
 * MARK: stageExpectsAgentVerdict
 * @description The single predicate for "this stage is an agent stage that
 *   may render a verdict". Only the normalized `agent` type qualifies;
 *   human, ci, deploy, and merge stages return false. Legacy types are
 *   normalized first (`review` -> human, `script` -> ci, unknown/empty ->
 *   agent), so this guard can never disagree with `normalizeStageType` and
 *   a legacy `review`/`script` stage can never be treated as agent-like by a
 *   verdict gate. This is what keeps the verdict/changes check off human and
 *   CI stages.
 * @example stageExpectsAgentVerdict({ type: "agent" }) => true
 * @example stageExpectsAgentVerdict({ type: "human" }) => false
 * @example stageExpectsAgentVerdict({ type: "review" }) => false
 * @example stageExpectsAgentVerdict({ type: "script" }) => false
 * @example stageExpectsAgentVerdict({}) => true
 * @param {Object} [stage] - Stage entity (any object carrying `type`).
 * @returns {boolean} True only for normalized agent stages.
 ***/
export function stageExpectsAgentVerdict(stage) {
	return normalizeStageType(stage?.type) === "agent";
}

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

/***
 * MARK: parseStageVerdict
 * @description Parses the machine-readable stage-verdict block (see the
 *   `stage-verdict` skill) from an agent's final output. This is the fail
 *   path for wrapped harnesses (muse, antigravity, custom, opencode) that
 *   expose no Fail_stage_skill tool: pure text works everywhere. The LAST
 *   well-formed verdict block wins, so a mid-run reconsideration can
 *   supersede an earlier one. Fenced code blocks are documentation, not
 *   signals: the skill itself shows its FAIL example inside ```text fences,
 *   and the contract requires the real block unfenced — so fenced lines
 *   never start, extend, or supersede a verdict. A malformed VERDICT line
 *   (anything but PASS|FAIL) voids only the block under construction — it
 *   NEVER clears a prior well-formed verdict, so trailing garbage cannot
 *   downgrade an earlier FAIL. Whether a parsed FAIL fails the stage is
 *   decided by the runner (fail-open: only FAIL with reason and fix fails).
 * @example parseStageVerdict("done\nKAINBAIN_VERDICT: FAIL\nKAINBAIN_REASON: red\nKAINBAIN_FIX: blue") => { verdict: "FAIL", reason: "red", fix: "blue" }
 * @example parseStageVerdict("```text\nKAINBAIN_VERDICT: FAIL\n```") => { verdict: null, reason: "", fix: "" }
 * @example parseStageVerdict("KAINBAIN_VERDICT: FAIL\nKAINBAIN_VERDICT: MAYBE") => { verdict: "FAIL", reason: "", fix: "" }
 * @param {string} text - The agent's final output text.
 * @returns {{verdict: "PASS"|"FAIL"|null, reason: string, fix: string}} The parsed verdict (null when no well-formed block).
 ***/
export function parseStageVerdict(text) {
	const empty = { verdict: null, reason: "", fix: "" };
	if (typeof text !== "string" || !text) return empty;
	let found = null;
	let current = null;
	let section = null;
	let openFence = null;
	for (const rawLine of text.split("\n")) {
		const line = rawLine.trim();
		const fenceRun = line.match(/^(`{3,}|~{3,})/)?.[1];
		if (fenceRun) {
			if (!openFence) {
				openFence = { char: fenceRun[0], length: fenceRun.length };
			} else if (fenceRun[0] === openFence.char && fenceRun.length >= openFence.length) {
				openFence = null;
			}
			continue;
		}
		if (openFence) continue;
		const marker = line.match(/^KAINBAIN_(VERDICT|REASON|FIX)\s*:(.*)$/i);
		if (marker) {
			const key = marker[1].toUpperCase();
			const value = (marker[2] || "").trim();
			if (key === "VERDICT") {
				const verdict = value.split(/\s+/)[0]?.toUpperCase();
				if (verdict === "PASS" || verdict === "FAIL") {
					current = { verdict, reason: "", fix: "" };
					found = current;
					section = null;
				} else {
					// Malformed verdict: not a signal at all. Void the block
					// under construction but keep the last well-formed one —
					// trailing garbage must never downgrade an earlier FAIL.
					current = null;
					section = null;
				}
			} else if (current && key === "REASON") {
				section = "reason";
				if (value) current.reason += `${value}\n`;
			} else if (current && key === "FIX") {
				section = "fix";
				if (value) current.fix += `${value}\n`;
			}
			continue;
		}
		if (current && section && line) {
			// eslint-disable-next-line security/detect-object-injection -- section is only ever the "reason"|"fix" literal set above
			current[section] += `${line}\n`;
		}
	}
	if (!found) return empty;
	return {
		verdict: found.verdict,
		reason: found.reason.trim(),
		fix: found.fix.trim(),
	};
}
