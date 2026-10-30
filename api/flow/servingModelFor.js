/***
 * MARK: servingModelFor
 * @description Returns the model a given assignment serves: null for CI / merge
 *   / integrate; otherwise the dispatch model or fallback.
 ***/
export function servingModelFor({ kind, model, fallbackModel } = {}) {
	const k = String(kind ?? "").trim().toLowerCase();
	if (k === "ci" || k === "merge" || k === "integrate" || k === "integration" || k === "command") {
		return null;
	}
	const clean = (value) =>
		typeof value === "string" && value.trim() ? value.trim() : null;
	const explicit = clean(model);
	if (explicit) return explicit;
	return clean(fallbackModel);
}
