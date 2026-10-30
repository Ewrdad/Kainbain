/***
 * MARK: servingModelFor
 * @description Single source of truth for "what model does this assignment
 *   serve?" Used by the Runner's progress report, posture string, and the
 *   harness call so these three can never drift. CI / merge / integrate
 *   stages use no LLM and report null (never the Runner's configured
 *   default, never the literal "default").
 * @example servingModelFor({ kind: 'agent', model: 'kimi-k3:cloud', fallbackModel: 'x' }) => 'kimi-k3:cloud'
 * @example servingModelFor({ kind: 'ci', model: 'anything' }) => null
 * @param {Object} [opts]
 * @returns {string|null}
 ***/
export function servingModelFor({ kind, model, fallbackModel } = {}) {
	const k = String(kind ?? "")
		.trim()
		.toLowerCase();
	if (k === "ci" || k === "merge" || k === "integrate" || k === "integration" || k === "command") {
		return null;
	}
	const clean = (value) =>
		typeof value === "string" && value.trim() ? value.trim() : null;
	const explicit = clean(model);
	if (explicit) return explicit;
	return clean(fallbackModel);
}

/***
 * MARK: formatPosture
 * @description Formats the Runner's `posture` string. The model segment is
 *   present only when a real model is served; CI / merge / integrate stages
 *   therefore omit the trailing model segment (never the Runner default,
 *   never "default").
 * @example formatPosture({ tiers: ['T0'], harness: 'pi', model: 'm' }) => 'T0:pi:m'
 * @example formatPosture({ tiers: ['T0'], harness: 'pi', model: null }) => 'T0:pi'
 * @param {Object} [opts]
 * @returns {string}
 ***/
export function formatPosture({ tiers, harness, model } = {}) {
	const tierPart = Array.isArray(tiers) ? tiers.join("/") : String(tiers ?? "");
	const harnessPart = harness ? String(harness) : "";
	const cleanModel = typeof model === "string" && model.trim() ? model.trim() : null;
	const base = harnessPart ? `${tierPart}:${harnessPart}` : tierPart;
	return cleanModel ? `${base}:${cleanModel}` : base;
}
