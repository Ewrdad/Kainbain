import { runnerMatches } from "./runnerMatches.js";

/***
 * MARK: selectRunnerForTask
 * @description Picks one capable Runner for a task: filters registrations
 *   through `runnerMatches`, then takes the lowest runnerId for a
 *   deterministic, testable choice. (D3 alias resolution landed in WP-3.2
 *   at the route layer, where each candidate resolves before matching;
 *   priority-tiered P1/P2 final ranking still pending — the hand-notes
 *   tier definitions are not repo-grounded, so no semantics are invented
 *   here; the per-runner miss map already returned lets that ranking
 *   replace only the final pick.)
 * @example selectRunnerForTask([rec], { harness: 'pi' }) => { record: rec, reason: 'MATCH' }
 * @param {Array} records - Registry records.
 * @param {Object} req - Task requirements.
 * @param {Object} [opts] - Match options (now, staleAfterMs, minDiskHeadroomMb).
 * @returns {Object} `{ record, reason }` or `{ record: null, misses }`.
 ***/
export function selectRunnerForTask(records = [], req = {}, opts = {}) {
	const misses = {};
	const capable = [];
	for (const record of Array.isArray(records) ? records : []) {
		if (!record || typeof record.runnerId !== "string") continue;
		const verdict = runnerMatches(record, req, opts);
		if (verdict.ok) {
			capable.push(record);
		} else {
			misses[record.runnerId] = verdict.reason;
		}
	}
	if (capable.length === 0) return { record: null, misses };
	capable.sort((a, b) => (a.runnerId < b.runnerId ? -1 : a.runnerId > b.runnerId ? 1 : 0));
	return { record: capable[0], reason: "MATCH" };
}
