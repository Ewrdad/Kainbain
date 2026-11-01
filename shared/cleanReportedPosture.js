/***
 * MARK: cleanReportedPosture
 * @description Cleans a posture string exactly as it arrives from a
 *   Runner, so Runners older than the served-model fix cannot leak the
 *   fake model segment into the stored history during a mixed-version
 *   rollout. New Runners already omit the model segment for non-LLM
 *   stages (see `formatPosture`), but the backend must not trust that:
 *   it is the last place the string is stored.
 *
 *   Rules:
 *   1. A non-string, blank, or whitespace-only posture is absent (`null`).
 *   2. A trailing `:default` segment (any letter case) is dropped, and
 *      repeated if a hand-built Runner stacked it. The `"default"`
 *      sentinel means "harness-managed, no pinned model", never a model
 *      that ran, so it must never be stored as one.
 *   3. A posture that is only `"default"`, or becomes empty after
 *      cleaning, is absent (`null`).
 *   4. Every other segment is kept verbatim: model ids may contain
 *      single `:` characters, so nothing is re-parsed or re-joined.
 * @example cleanReportedPosture('T0:pi:default') => 'T0:pi'
 * @example cleanReportedPosture('T0:pi:kimi-k3:cloud') => 'T0:pi:kimi-k3:cloud'
 * @example cleanReportedPosture('default') => null
 * @example cleanReportedPosture('  ') => null
 * @example cleanReportedPosture(42) => null
 * @param {unknown} posture - Posture exactly as reported on the wire.
 * @returns {string|null} The cleaned posture, or `null` when absent.
 ***/
export function cleanReportedPosture(posture) {
	if (typeof posture !== "string") return null;
	let cleanedPosture = posture.trim();
	if (!cleanedPosture) return null;
	if (cleanedPosture.toLowerCase() === "default") return null;
	while (/:default$/i.test(cleanedPosture)) {
		cleanedPosture = cleanedPosture.slice(0, cleanedPosture.length - ":default".length);
	}
	cleanedPosture = cleanedPosture.replace(/:+$/, "").trim();
	return cleanedPosture || null;
}
