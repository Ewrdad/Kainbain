// Domain: Watching The Work — per-harness reliability aggregation.

import {
	RECENT_RELIABILITY_WINDOW_RUNS,
	bucketReliabilityRuns,
	isKnownReliabilityFailureKind,
	reliabilityReportTime,
} from "./reliabilityShared.js";

// Re-exported so existing callers/tests keep one import site for the window.
export { RECENT_RELIABILITY_WINDOW_RUNS };

/***
 * MARK: computeHarnessReliability
 * @description Aggregates per-harness reliability across every project from
 *   recorded reliability SAMPLES — one per agent stage run, written at
 *   the dispatch site regardless of the report opt-in (reports stay
 *   opt-in; samples never are) — falling back to attributed stage reports
 *   only for pre-feature tasks with no samples yet (same query-time scan
 *   pattern as computeObservabilityMetrics). Buckets follow the runner's outcome
 *   taxonomy: "none" counts as success, "infrastructure" (timeouts, harness
 *   and model errors) counts as failure, and "rejected" (deliberate agent
 *   stage-fails) is excluded from numerator and denominator (see
 *   bucketReliabilityRuns). Reports without a harness id or with an unknown
 *   kind (pre-feature history, scripted stages, strict-mode refusals) are
 *   ignored rather than misclassified. Recorded ids unknown to the registry
 *   are still reported under their recorded id — never dropped silently.
 * @example computeHarnessReliability(taskStore) => [{ harnessId: "pi", runs: 3, successes: 2, infraFailures: 1, … }]
 * @param {Object} taskStore - TaskStore instance.
 * @param {Object} [opts]
 * @param {number} [opts.recentWindowRuns] - Recent-window size (defaults to RECENT_RELIABILITY_WINDOW_RUNS).
 * @returns {Array<Object>} One entry per harness with attributed runs, sorted by harness id.
 ***/
export function computeHarnessReliability(
	taskStore,
	{ recentWindowRuns = RECENT_RELIABILITY_WINDOW_RUNS } = {},
) {
	const projects =
		taskStore?.projectStore &&
		typeof taskStore.projectStore.listProjects === "function"
			? taskStore.projectStore.listProjects()
			: [];

	const attributedByHarness = new Map();

	for (const project of projects) {
		const tasks = taskStore.listTasks(project.id, project.cwd);
		for (const task of tasks) {
			if (Array.isArray(task?.reliabilitySamples) && task.reliabilitySamples.length > 0) {
				for (const sample of task.reliabilitySamples) {
					const harnessId =
						typeof sample?.harnessId === "string" ? sample.harnessId.trim() : "";
					if (!harnessId) continue;
					if (!isKnownReliabilityFailureKind(sample?.failureKind)) continue;
					if (!attributedByHarness.has(harnessId)) {
						attributedByHarness.set(harnessId, []);
					}
					attributedByHarness.get(harnessId).push({
						failureKind: sample.failureKind,
						at: sample.at || reliabilityReportTime(sample),
						atRaw:
							typeof sample?.createdAt === "string"
								? sample.createdAt
								: typeof sample?.atRaw === "string"
									? sample.atRaw
									: null,
					});
				}
			} else if (Array.isArray(task?.reports)) {
				// Fall back to reports for historical data (tasks with no samples yet)
				for (const report of task.reports) {
					const harnessId =
						typeof report?.harnessId === "string"
							? report.harnessId.trim()
							: "";
					if (!harnessId) continue;
					if (!isKnownReliabilityFailureKind(report?.failureKind)) continue;
					if (!attributedByHarness.has(harnessId)) {
						attributedByHarness.set(harnessId, []);
					}
					attributedByHarness.get(harnessId).push({
						failureKind: report.failureKind,
						at: reliabilityReportTime(report),
						atRaw:
							typeof report?.createdAt === "string" ? report.createdAt : null,
					});
				}
			}
		}
	}

	const reliability = [];
	for (const [harnessId, runs] of attributedByHarness) {
		reliability.push({
			harnessId,
			...bucketReliabilityRuns(runs, { recentWindowRuns }),
		});
	}
	reliability.sort((a, b) => a.harnessId.localeCompare(b.harnessId));
	return reliability;
}
