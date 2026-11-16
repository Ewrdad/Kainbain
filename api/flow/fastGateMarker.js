// Domain: The Flow — fast-gate verdict marker shared with the test gate.

/***
 * MARK: FAST_GATE_MARKER
 * @description Opens the verdict banner's first line
 *   (`KAINBAIN_FAST_GATE_RESULT ok=… failedBranches="…" canary=…
 *   verdict="…"`) printed by the test gate (scripts/run-tests.mjs via
 *   scripts/lib/fast-gate-verdict.mjs) right after its fast phase resolves.
 *   The engine scans live command-stage chunks for this token so an early
 *   fast-gate failure is visible in history while a long serial phase still
 *   runs. Mirrored in scripts/lib/fast-gate-verdict.mjs; the cross-checked
 *   harness test fails when the two spellings disagree.
 * @example FAST_GATE_MARKER => "KAINBAIN_FAST_GATE_RESULT"
 ***/
export const FAST_GATE_MARKER = "KAINBAIN_FAST_GATE_RESULT";

/***
 * MARK: extractFastGateResult
 * @description Finds the gate's verdict marker line in a text window (one
 *   live output chunk plus a short rolling tail, so a line split across two
 *   chunks still matches) and parses its `key=value` pairs. Returns the
 *   first marker line's verdict, or null when the window carries no
 *   complete marker line. Pure and total: malformed values degrade to
 *   safe defaults, never a throw — a marker the gate misprinted must not
 *   break the stage that scans for it.
 * @example extractFastGateResult('KAINBAIN_FAST_GATE_RESULT ok=false failedBranches="Linting (api)" canary=ran verdict="/tmp/v/verdict.json"') => { ok: false, … }
 * @param {*} text - Text window to scan (a chunk plus rolling tail).
 * @returns {Object|null} { ok, failedBranches, canary, verdictPath, markerLine }, or null.
 ***/
export function extractFastGateResult(text) {
	try {
		if (typeof text !== "string" || !text.includes(FAST_GATE_MARKER)) return null;
		const markerLine = text
			.split("\n")
			.find((line) => line.includes(FAST_GATE_MARKER));
		if (!markerLine) return null;
		// Quote-aware tokenizing (one literal pattern, never a dynamic
		// RegExp): each pair is `key="…"` (backslash-escaped) or a bare
		// `key=token`, so a branch name containing `ok=` or `canary=` inside
		// the quoted value can never be misread as a pair of its own.
		const fields = new Map();
		const pairPattern = /(\S+?)=("(?:[^"\\]|\\.)*"|\S+)/g;
		let pair = pairPattern.exec(markerLine);
		while (pair !== null) {
			const [, key, raw] = pair;
			fields.set(
				key,
				raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2
					? raw.slice(1, -1).replace(/\\(.)/g, "$1")
					: raw,
			);
			pair = pairPattern.exec(markerLine);
		}
		const readField = (key) => {
			const value = fields.get(key);
			return typeof value === "string" ? value : "";
		};
		const failedRaw = readField("failedBranches");
		const canaryRaw = readField("canary");
		const verdictRaw = readField("verdict");
		return {
			ok: readField("ok") === "true",
			failedBranches:
				failedRaw.length > 0
					? failedRaw.split(";").filter((name) => name.length > 0)
					: [],
			canary: canaryRaw.length > 0 ? canaryRaw : "pending",
			verdictPath: verdictRaw.length > 0 ? verdictRaw : null,
			markerLine,
		};
	} catch {
		return null;
	}
}
