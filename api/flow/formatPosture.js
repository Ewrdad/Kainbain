/***
 * MARK: formatPosture
 * @description Formats a Runner `posture` string, appending `:model` only when
 *   a real model is served.
 ***/
export function formatPosture({ tiers, harness, model } = {}) {
	const tierPart = Array.isArray(tiers) ? tiers.join("/") : String(tiers ?? "");
	const harnessPart = harness ? String(harness) : "";
	const cleanModel = typeof model === "string" && model.trim() ? model.trim() : null;
	const base = harnessPart ? `${tierPart}:${harnessPart}` : tierPart;
	return cleanModel ? `${base}:${cleanModel}` : base;
}
