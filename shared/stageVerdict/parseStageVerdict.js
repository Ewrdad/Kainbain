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
