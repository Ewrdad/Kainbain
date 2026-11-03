/***
 * MARK: effectiveRunnerModels
 * @description The model ids one Runner may serve: the operator-owned
 *   `availableModels` allowlist when set (System Settings › Runners ›
 *   Models — it replaces the advertised list so an under-reporting Runner
 *   can serve declared models), otherwise the Runner-advertised
 *   capabilities list. Single enforcement point shared by the dispatch
 *   gate below and the fleet model catalogue, so the two can never drift.
 * @example effectiveRunnerModels({ capabilities: { models: ['m1'] } }) => ['m1']
 * @param {Object} [record={}] - Runner record.
 * @returns {string[]} Effective model ids (possibly empty).
 ***/
export function effectiveRunnerModels(record = {}) {
	const override = record?.operatorConfig?.availableModels;
	if (Array.isArray(override)) return override;
	const caps = record?.capabilities && typeof record.capabilities === "object" ? record.capabilities : {};
	return Array.isArray(caps.models) ? caps.models : [];
}

/***
 * MARK: default effectiveRunnerModels
 * @description Default-export alias for `effectiveRunnerModels` so it can be imported either way.
 * @example effectiveRunnerModels({ capabilities: { models: ['m1'] } }) => ['m1']
 ***/
export default effectiveRunnerModels;
