/***
 * MARK: resolveCommandStageRuntime
 * @description Resolves the runtime kind and dispatch metadata for a
 *   command-based stage. Every command stage — including one whose command
 *   happens to run the deploy script — gets the ordinary CI runtime tuple
 *   (label, log tag, report title, `running_ci` status, CI timeout/stall
 *   budgets). Kept as the single derivation point so the runtime tuple can
 *   never drift between the dispatch and the timeout/stall resolvers.
 * @example resolveCommandStageRuntime({ type: 'ci', command: './deploy.sh --prod' }).kind => 'ci'
 * @example resolveCommandStageRuntime({ type: 'ci', command: 'npm test' }).kind => 'ci'
 * @param {Object} [stage]
 * @returns {{ kind: string, label: string, logTag: string, reportTitle: string, statusValue: string, defaultCommand: string }}
 ***/
export function resolveCommandStageRuntime(stage = {}) {
	void stage;
	return {
		kind: "ci",
		label: "CI",
		logTag: "CI/CMD",
		reportTitle: "CI Stage Report",
		statusValue: "running_ci",
		defaultCommand: "echo 'CI stage completed'",
	};
}
