/***
 * MARK: displayModelForInit
 * @description The model half of the session-init line for one peeked
 *   display target: a resolved alias shows its PICK's model (never the alias
 *   name — a blank pick reads "default" for harness-managed), an
 *   unresolvable alias shows the fallback actually used, and non-alias
 *   stages show the stage model (falling back to the project default, which
 *   is what a blank stage runs on). A null target keeps the legacy
 *   `stage.model || "default"` wording byte-identical.
 * @example displayModelForInit({ modelRef: "gemini-x", aliasName: "w" }, { model: "w" }) => "gemini-x"
 * @param {Object|null} peekedTarget - The peeked display target (or null).
 * @param {Object} stage - Stage entity (`model`).
 * @returns {string} The model label for the init line (never blank).
 ***/
export function displayModelForInit(peekedTarget, stage) {
	const pick = (v) => (typeof v === "string" && v.trim() ? v : null);
	const stageModel = pick(stage?.model);
	if (!peekedTarget) return stageModel || "default";
	// A resolved alias never shows its NAME as a model: the pick's model
	// wins (blank pick = harness-managed → "default").
	if (peekedTarget.aliasName && !peekedTarget.aliasMissing) {
		return pick(peekedTarget.modelRef) || "default";
	}
	return (
		pick(peekedTarget.modelRef) ??
		pick(peekedTarget.projectModelRef) ??
		stageModel ??
		"default"
	);
}
