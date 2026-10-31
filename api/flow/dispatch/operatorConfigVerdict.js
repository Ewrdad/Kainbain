/***
 * MARK: operatorConfigVerdict
 * @description Decides whether the operator-owned Runner configuration
 *   (System Settings › Runners: project scope, job-type switches, and the
 *   available-tools subset) allows one Runner to take one piece of work.
 *   This is the single enforcement point for those settings: the dispatch
 *   scan (`runnerMatches`), the direct single-assignment claim route, and
 *   the direct integration (merge) lease route all ask here, so a setting
 *   cannot be bypassed by claiming work through a different route.
 *   An unset or malformed config fails open to the legacy behaviour
 *   (serves everything), so older state files and unconfigured Runners
 *   keep working. Reads stay defensive (never throw on legacy shapes)
 *   because this runs on hot claim paths. `runsImpromptu` is intentionally
 *   not matched here: impromptu work (live steers, ADR 0011) rides the
 *   heartbeat pull channel of the Runner already holding the lease, and
 *   withholding it would strand the steer with no fallback. That switch
 *   stays a recorded preference until such a fallback exists.
 * @example operatorConfigVerdict({ operatorConfig: { projectScope: ['p1'] } }, { kind: 'agent' }, { projectId: 'p2' }) => { ok: false, reason: 'PROJECT_SCOPE' }
 * @param {Object} [record={}] - Runner record, possibly with `operatorConfig`.
 * @param {Object} [req={}] - Work requirements (`{ kind, harness, projectId }`).
 * @param {Object} [opts={}] - `{ projectId }` (the candidate's project, needed
 *   for the project-scope check; a scoped Runner with no project id on the
 *   candidate misses loudly instead of guessing).
 * @returns {Object} `{ ok, reason }` — reason is `MATCH` when allowed.
 ***/
export const operatorConfigVerdict = (record = {}, req = {}, opts = {}) => {
	const safeRecord = record && typeof record === "object" ? record : {};
	const safeReq = req && typeof req === "object" ? req : {};
	const safeOpts = opts && typeof opts === "object" ? opts : {};
	const operatorConfig =
		safeRecord.operatorConfig && typeof safeRecord.operatorConfig === "object"
			? safeRecord.operatorConfig
			: null;
	if (!operatorConfig) return { ok: true, reason: "MATCH" };

	const scope = Array.isArray(operatorConfig.projectScope)
		? operatorConfig.projectScope
		: null;
	if (scope) {
		const projectId =
			typeof safeOpts.projectId === "string" && safeOpts.projectId
				? safeOpts.projectId
				: typeof safeReq.projectId === "string" && safeReq.projectId
					? safeReq.projectId
					: null;
		if (!projectId || !scope.includes(projectId)) {
			return { ok: false, reason: "PROJECT_SCOPE" };
		}
	}

	const jobTypes =
		operatorConfig.jobTypes && typeof operatorConfig.jobTypes === "object"
			? operatorConfig.jobTypes
			: null;
	if (jobTypes) {
		const kind = typeof safeReq.kind === "string" ? safeReq.kind : null;
		if (kind === "ci" && jobTypes.runsCi === false) {
			return { ok: false, reason: "JOB_TYPE_DISABLED" };
		}
		if (kind === "merge" && jobTypes.runsMerges === false) {
			return { ok: false, reason: "JOB_TYPE_DISABLED" };
		}
	}

	if (safeReq.harness) {
		const tools = Array.isArray(operatorConfig.availableTools)
			? operatorConfig.availableTools
			: null;
		if (tools && !tools.includes(safeReq.harness)) {
			return { ok: false, reason: "TOOL_DISABLED" };
		}
	}

	return { ok: true, reason: "MATCH" };
};
