import { runnerMatches } from "./runnerMatches.js";

/***
 * MARK: selectRunnerForImpromptu
 * @description Picks one capable Runner for an impromptu T0 job (ADR 0014):
 *   every registration runs through `runnerMatches` (active, fresh, protocol,
 *   harness, model, tier T0, disk, operator project scope, tool subset), then
 *   the impromptu-only gates: the operator `runsImpromptu` switch (off refuses
 *   loudly with the shared `JOB_TYPE_DISABLED` reason — the switch was a
 *   recorded preference until this channel existed), the optional
 *   pinned-runner override (only that Runner may serve), and the live-lease
 *   exclusion (a Runner holding a task lease never gets impromptu work — it
 *   only polls when idle anyway, but the server enforces it). Takes the
 *   lowest runnerId for a deterministic, testable choice, mirroring
 *   `selectRunnerForTask`.
 * @example selectRunnerForImpromptu([rec], { harness: 'pi' }) => { record: rec, reason: 'MATCH' }
 * @param {Array} records - Registry records.
 * @param {Object} job - Job requirements (`{ harness, model?, projectId?, pinnedRunnerId? }`).
 * @param {Object} [opts] - Match options (`{ now, staleAfterMs, minDiskHeadroomMb, busyRunnerIds }`).
 * @returns {Object} `{ record, reason }` or `{ record: null, misses }`.
 ***/
export const selectRunnerForImpromptu = (records = [], job = {}, opts = {}) => {
	const safeJob = job && typeof job === "object" ? job : {};
	const safeOpts = opts && typeof opts === "object" ? opts : {};
	const busy = new Set(Array.isArray(safeOpts.busyRunnerIds) ? safeOpts.busyRunnerIds : []);
	const misses = {};
	const capable = [];
	for (const record of Array.isArray(records) ? records : []) {
		if (!record || typeof record.runnerId !== "string") continue;
		if (safeJob.pinnedRunnerId && record.runnerId !== safeJob.pinnedRunnerId) {
			misses[record.runnerId] = "PIN_MISMATCH";
			continue;
		}
		if (busy.has(record.runnerId)) {
			misses[record.runnerId] = "BUSY_TASK_LEASE";
			continue;
		}
		const verdict = runnerMatches(
			record,
			{
				...(safeJob.harness ? { harness: safeJob.harness } : {}),
				...(safeJob.model ? { model: safeJob.model } : {}),
				tier: "T0",
				...(safeJob.projectId ? { projectId: safeJob.projectId } : {}),
			},
			{
				...(typeof safeOpts.now === "number" ? { now: safeOpts.now } : {}),
				...(typeof safeOpts.staleAfterMs === "number" ? { staleAfterMs: safeOpts.staleAfterMs } : {}),
				...(typeof safeOpts.minDiskHeadroomMb === "number"
					? { minDiskHeadroomMb: safeOpts.minDiskHeadroomMb }
					: {}),
				...(safeJob.projectId ? { projectId: safeJob.projectId } : {}),
			},
		);
		if (!verdict.ok) {
			misses[record.runnerId] = verdict.reason;
			continue;
		}
		const jobTypes = record.operatorConfig?.jobTypes;
		if (jobTypes && typeof jobTypes === "object" && jobTypes.runsImpromptu === false) {
			misses[record.runnerId] = "JOB_TYPE_DISABLED";
			continue;
		}
		capable.push(record);
	}
	if (capable.length === 0) return { record: null, misses };
	capable.sort((a, b) => (a.runnerId < b.runnerId ? -1 : a.runnerId > b.runnerId ? 1 : 0));
	return { record: capable[0], reason: "MATCH" };
};
