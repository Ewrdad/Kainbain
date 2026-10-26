// Domain: Watching The Work — shared stage-run reliability bucketing and
// sample-first architecture.
//
// Reliability is RUN-driven, not report-driven: every agent stage run records
// exactly one reliability sample (success, infrastructure failure, or agent
// rejection) at the dispatch site, regardless of whether a stage report file
// is written (success reports are opt-in via `stage.report`). Aggregations
// read `task.reliabilitySamples` first and fall back to `task.reports` only
// for pre-feature history (backfilled into samples on task load).
//
// Reliability Sample Schema:
// {
//   harnessId: string,              // Attributed harness id ("vibe", "antigravity", etc.)
//   failureKind: string,            // Outcome kind: "none" (success), "infrastructure" (failure), "rejected" (excluded from the rate)
//   at: number,                     // Epoch millis of the run (dedup key half)
//   atRaw?: string,                 // ISO timestamp of the run (report `createdAt` when backfilled)
//   stageId?: string,               // Stage identifier (dedup key half)
//   aliasName?: string,             // Model alias name (when the run resolved via alias)
//   modelRef?: string,              // Concrete model reference dispatched
//   targetIndex?: number,           // Index of the alias target pick
// }
//
// Deduplication: (stageId, at) — one sample per dispatch. The dispatch site is
// the only sample writer (transient/failure handlers still write REPORTS),
// so a retry ladder of N attempts yields exactly N samples.
/***
 * MARK: RECENT_RELIABILITY_WINDOW_RUNS
 * @description How many of a harness's or alias target's latest attributed
 *   runs feed the `recent` figures, so one bad day long ago cannot
 *   permanently stain a target. All-time figures ship alongside regardless.
 * @example RECENT_RELIABILITY_WINDOW_RUNS === 10
 ***/
export const RECENT_RELIABILITY_WINDOW_RUNS = 10;

/***
 * MARK: reliabilitySuccessPercent
 * @description Turns a success count into a one-decimal-place percentage, or
 *   null when there are no counted runs (an honest "no data", never 0%).
 * @example reliabilitySuccessPercent(2, 3) => 66.7
 * @param {number} successes - Clean runs in the bucket.
 * @param {number} runs - Counted runs in the bucket.
 * @returns {number|null} Percentage, or null when runs is zero.
 ***/
export function reliabilitySuccessPercent(successes, runs) {
	if (!Number.isFinite(runs) || runs <= 0) return null;
	return Number(((successes / runs) * 100).toFixed(1));
}

/***
 * MARK: isKnownReliabilityFailureKind
 * @description Whether a recorded `failureKind` participates in reliability:
 *   "none" (clean), "infrastructure" (timeouts, harness/model errors) and
 *   "rejected" (deliberate agent stage-fails — recorded but excluded from the
 *   rate). Unknown/absent kinds (pre-feature history, scripted stages) are
 *   ignored rather than misclassified.
 * @example isKnownReliabilityFailureKind("infrastructure") => true
 * @param {unknown} failureKind - Recorded outcome kind.
 * @returns {boolean} True when the kind is part of the taxonomy.
 ***/
export function isKnownReliabilityFailureKind(failureKind) {
	return (
		failureKind === "none" ||
		failureKind === "infrastructure" ||
		failureKind === "rejected"
	);
}

/***
 * MARK: reliabilityReportTime
 * @description Sort key for one report entry: its creation timestamp as epoch
 *   millis, with unparseable stamps sorting as oldest (never NaN).
 * @example reliabilityReportTime({ createdAt: "2026-10-01T10:00:00.000Z" }) => 1759312800000
 * @param {Object} [report] - Stage-report entry.
 * @returns {number} Epoch millis, or 0 when the stamp is missing.
 ***/
export function reliabilityReportTime(report) {
    const parsed = Date.parse(report?.createdAt || "");
    return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * MARK: recordReliabilitySample
 * @description Records one reliability sample for a stage run onto the task
 *   entity. The dispatch site calls this exactly once per run outcome
 *   (success, agent failure, thrown error), independent of the report-file
 *   opt-in. Samples without a harness id or with an unknown outcome kind are
 *   ignored (unattributed runs stay excluded, never misclassified), and a
 *   duplicate (stageId, at) key is dropped — one dispatch, one sample.
 * @example recordReliabilitySample(taskStore, "p1", "t1", { harnessId: "vibe", failureKind: "none", at: 1760000000000, stageId: "s1" })
 * @param {Object} taskStore - TaskStore instance.
 * @param {string} projectId - The project id.
 * @param {string} taskId - The task id.
 * @param {Object} sample - Sample to record.
 * @param {string} sample.harnessId - The attributed harness id.
 * @param {string} sample.failureKind - The outcome kind ("none", "infrastructure", "rejected").
 * @param {number} sample.at - The run's epoch-millis timestamp (dedup key).
 * @param {string} [sample.atRaw] - The run's ISO timestamp (surfaced as `lastRunAt`).
 * @param {string} [sample.stageId] - The stage id (dedup key).
 * @param {string} [sample.aliasName] - The alias name (if applicable).
 * @param {string} [sample.modelRef] - The model reference (if applicable).
 * @param {number} [sample.targetIndex] - The alias target index (if applicable).
 */
export function recordReliabilitySample(taskStore, projectId, taskId, sample) {
	if (!taskStore || typeof taskStore.getTask !== "function" || !sample) return;
	const task = taskStore.getTask(projectId, taskId);
	if (!task) return;

	const harnessId = typeof sample.harnessId === "string" ? sample.harnessId.trim() : "";
	if (!harnessId) return;
	if (!isKnownReliabilityFailureKind(sample.failureKind)) return;

	if (!Array.isArray(task.reliabilitySamples)) {
		task.reliabilitySamples = [];
	}

	const stageId = typeof sample.stageId === "string" ? sample.stageId : "";
	const at = Number.isFinite(sample.at) ? sample.at : Date.now();
	const deduplicationKey = reliabilitySampleKey({ stageId, at });
	const exists = task.reliabilitySamples.some(
		(recorded) => reliabilitySampleKey(recorded) === deduplicationKey,
	);
	if (exists) return;

	const entry = {
		harnessId,
		failureKind: sample.failureKind,
		at,
		...(stageId ? { stageId } : {}),
		...(typeof sample.atRaw === "string" && sample.atRaw.trim()
			? { atRaw: sample.atRaw }
			: {}),
		...(typeof sample.aliasName === "string" && sample.aliasName.trim()
			? { aliasName: sample.aliasName.trim() }
			: {}),
		...(typeof sample.modelRef === "string" && sample.modelRef.trim()
			? { modelRef: sample.modelRef.trim() }
			: {}),
		...(Number.isInteger(sample.targetIndex) && sample.targetIndex >= 0
			? { targetIndex: sample.targetIndex }
			: {}),
	};

	task.reliabilitySamples.push(entry);
}

/***
 * MARK: reliabilitySampleKey
 * @description Deduplication key for one reliability sample: (stageId, at).
 *   `at` falls back to the parsed `atRaw`/`createdAt` ISO stamp for
 *   backfilled samples, so re-running the backfill can never duplicate a
 *   report as a second sample.
 * @example reliabilitySampleKey({ stageId: "s1", at: 1760000000000 }) => "s1-1760000000000"
 * @param {Object} sample - Reliability sample (or report-shaped source).
 * @returns {string} Deduplication key.
 ***/
export function reliabilitySampleKey(sample) {
	const stageId = typeof sample?.stageId === "string" ? sample.stageId : "";
	const at = Number.isFinite(sample?.at)
		? sample.at
		: reliabilityReportTime({ createdAt: sample?.createdAt || sample?.atRaw });
	return `${stageId}-${at}`;
}

/**
 * MARK: backfillReliabilitySamples
 * @description Converts existing attributed reports into reliability samples.
 *   This ensures historical data is preserved when transitioning to sample-driven reliability.
 * @example backfillReliabilitySamples(task)
 * @param {Object} task - Task object.
 */
export function backfillReliabilitySamples(task) {
	if (!task || !Array.isArray(task.reports)) return;

	if (!Array.isArray(task.reliabilitySamples)) {
		task.reliabilitySamples = [];
	}

	const existingKeys = new Set(
		task.reliabilitySamples.map((s) => reliabilitySampleKey(s)),
	);

	for (const report of task.reports) {
		const harnessId = typeof report?.harnessId === "string" ? report.harnessId.trim() : "";
		if (!harnessId) continue;
		if (!isKnownReliabilityFailureKind(report?.failureKind)) continue;

		const deduplicationKey = reliabilitySampleKey({
			stageId: report.stageId,
			at: reliabilityReportTime(report),
			createdAt: report.createdAt,
		});
		if (existingKeys.has(deduplicationKey)) continue;

		// Same shape as live dispatch-site samples (`atRaw`, no nulls)
		// so every reader sees one schema regardless of sample origin.
		const sample = {
			harnessId,
			failureKind: report.failureKind,
			at: reliabilityReportTime(report),
			...(typeof report?.createdAt === "string" && report.createdAt
				? { atRaw: report.createdAt }
				: {}),
			...(typeof report?.stageId === "string" ? { stageId: report.stageId } : {}),
			...(typeof report?.aliasName === "string" && report.aliasName.trim()
				? { aliasName: report.aliasName.trim() }
				: {}),
			...(typeof report?.modelRef === "string" && report.modelRef.trim()
				? { modelRef: report.modelRef.trim() }
				: {}),
			...(Number.isInteger(report?.targetIndex) && report.targetIndex >= 0
				? { targetIndex: report.targetIndex }
				: {}),
		};

		task.reliabilitySamples.push(sample);
		existingKeys.add(deduplicationKey);
	}
}

/***
 * MARK: bucketReliabilityRuns
 * @description THE single reliability tally used by every view (global
 *   harness reliability and per-alias target reliability alike): counts clean
 *   runs as successes, infrastructure runs as failures, excludes deliberate
 *   agent rejections from numerator and denominator, and reports the same
 *   figures over the latest `recentWindowRuns` attributed runs. A bucket
 *   with no counted runs reports `successRate: null` — an honest "no data",
 *   never a fake 0%.
 * @example bucketReliabilityRuns([{ failureKind: "none", at: 2, atRaw: "…" }]) => { runs: 1, successes: 1, successRate: 100, … }
 * @param {Array<Object>} runs - Attributed runs (`{ failureKind, at, atRaw }`).
 * @param {Object} [opts]
 * @param {number} [opts.recentWindowRuns] - Recent-window size (defaults to RECENT_RELIABILITY_WINDOW_RUNS).
 * @returns {Object} Reliability bucket (`runs`, `successes`, `infraFailures`, `excludedRejected`, `successRate`, `lastRunAt`, `recent`).
 ***/
export function bucketReliabilityRuns(
	runs,
	{ recentWindowRuns = RECENT_RELIABILITY_WINDOW_RUNS } = {},
) {
	const list = Array.isArray(runs) ? runs : [];
	// Fail-safe window: a non-finite, negative, or fractional override can
	// only come from a caller bug — fall back to the shared default (or
	// clamp to a sane integer) rather than silently reporting an empty or
	// NaN-sized recent window.
	const windowSize = Number.isFinite(recentWindowRuns)
		? Math.max(0, Math.floor(recentWindowRuns))
		: RECENT_RELIABILITY_WINDOW_RUNS;
	const successes = list.filter((run) => run.failureKind === "none").length;
	const infraFailures = list.filter(
		(run) => run.failureKind === "infrastructure",
	).length;
	const excludedRejected = list.filter(
		(run) => run.failureKind === "rejected",
	).length;
	const counted = successes + infraFailures;
	const latestFirst = [...list].sort((a, b) => b.at - a.at);
	const recentRuns = latestFirst.slice(0, windowSize);
	const recentSuccesses = recentRuns.filter(
		(run) => run.failureKind === "none",
	).length;
	const recentInfraFailures = recentRuns.filter(
		(run) => run.failureKind === "infrastructure",
	).length;
	const recentExcludedRejected = recentRuns.filter(
		(run) => run.failureKind === "rejected",
	).length;
	const recentCounted = recentSuccesses + recentInfraFailures;
	return {
		runs: counted,
		successes,
		infraFailures,
		excludedRejected,
		successRate: reliabilitySuccessPercent(successes, counted),
		lastRunAt: latestFirst.length > 0 ? latestFirst[0].atRaw : null,
		recent: {
			runs: recentCounted,
			successes: recentSuccesses,
			infraFailures: recentInfraFailures,
			excludedRejected: recentExcludedRejected,
			successRate: reliabilitySuccessPercent(recentSuccesses, recentCounted),
		},
	};
}
