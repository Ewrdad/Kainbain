// Domain: Watching The Work — per-alias (model + harness target) reliability.

import {
	RECENT_RELIABILITY_WINDOW_RUNS,
	bucketReliabilityRuns,
	isKnownReliabilityFailureKind,
	reliabilityReportTime,
} from "./reliabilityShared.js";

/** NUL keeps the harness/model halves of a target key from colliding. */
const TARGET_KEY_SEPARATOR = "\u0000";

/***
 * MARK: computeAliasReliability
 * @description Aggregates reliability for one project's model aliases so the
 *   alias settings can show, per alias and per model+harness target, how
 *   often runs hit a non-chosen failure (loop-guard trips, connectivity
 *   errors, timeouts, model errors). Stats are SAMPLE-DRIVEN: recorded
 *   reliability samples (one per agent stage run, written at dispatch
 *   regardless of the report opt-in) come first, with attributed reports
 *   as the pre-feature fallback for tasks without samples. Buckets follow
 *   the same runner outcome
 *   taxonomy as the global harness view: "none" = success, "infrastructure" =
 *   failure, "rejected" (deliberate agent stage-fails) excluded from
 *   numerator and denominator. Stats are scoped by construction: only the
 *   requested project's task reports are scanned, so no other project's runs
 *   or alias can leak in. Reports without an alias name or harness id (pre-
 *   feature history, scripted stages, human rejections) are ignored, and a
 *   run through an unresolvable alias (which fell back to the project
 *   default) records no alias attribution — it is never credited to the
 *   named alias. Aliases are keyed by name, so renaming an alias orphans its
 *   previous history (documented; aliases carry no ids).
 * @example computeAliasReliability(taskStore, "p1") => [{ aliasName: "small", targets: [{ harness: "pi", model: "google::m", runs: 3, … }], … }]
 * @param {Object} taskStore - TaskStore instance.
 * @param {string} projectId - The project whose aliases are in scope.
 * @param {Object} [opts]
 * @param {number} [opts.recentWindowRuns] - Recent-window size (defaults to RECENT_RELIABILITY_WINDOW_RUNS).
 * @returns {Array<Object>|null} One entry per attributed alias (sorted by name), or null when the project is unknown.
 ***/
export function computeAliasReliability(
	taskStore,
	projectId,
	{ recentWindowRuns = RECENT_RELIABILITY_WINDOW_RUNS } = {},
) {
	const projects =
		taskStore?.projectStore &&
		typeof taskStore.projectStore.listProjects === "function"
			? taskStore.projectStore.listProjects()
			: [];
	const project = projects.find((candidate) => candidate?.id === projectId);
	if (!project) return null;

	const attributedByAlias = new Map();
	const tasks = taskStore.listTasks(project.id, project.cwd);
	for (const task of tasks) {
		if (Array.isArray(task?.reliabilitySamples) && task.reliabilitySamples.length > 0) {
			for (const sample of task.reliabilitySamples) {
				const aliasName = typeof sample?.aliasName === "string" ? sample.aliasName.trim() : "";
				const harnessId = typeof sample?.harnessId === "string" ? sample.harnessId.trim() : "";
				if (!aliasName || !harnessId) continue;
				if (!isKnownReliabilityFailureKind(sample?.failureKind)) continue;
				const modelRef = typeof sample?.modelRef === "string" ? sample.modelRef.trim() : "";
				const run = {
					failureKind: sample.failureKind,
					at: sample.at || reliabilityReportTime(sample),
					atRaw:
						typeof sample?.createdAt === "string"
							? sample.createdAt
							: typeof sample?.atRaw === "string"
								? sample.atRaw
								: null,
				};
				if (!attributedByAlias.has(aliasName)) {
					attributedByAlias.set(aliasName, new Map());
				}
				const targets = attributedByAlias.get(aliasName);
				const targetKey = `${harnessId}${TARGET_KEY_SEPARATOR}${modelRef}`;
				if (!targets.has(targetKey)) {
					targets.set(targetKey, { harness: harnessId, model: modelRef, runs: [] });
				}
				targets.get(targetKey).runs.push(run);
			}
		} else if (Array.isArray(task?.reports)) {
			// Fall back to reports for historical data (tasks with no samples yet)
			for (const report of task.reports) {
				const aliasName =
					typeof report?.aliasName === "string" ? report.aliasName.trim() : "";
				const harnessId =
					typeof report?.harnessId === "string" ? report.harnessId.trim() : "";
				if (!aliasName || !harnessId) continue;
				if (!isKnownReliabilityFailureKind(report?.failureKind)) continue;
				const modelRef =
					typeof report?.modelRef === "string" ? report.modelRef.trim() : "";
				const run = {
					failureKind: report.failureKind,
					at: reliabilityReportTime(report),
					atRaw:
						typeof report?.createdAt === "string" ? report.createdAt : null,
				};
				if (!attributedByAlias.has(aliasName)) {
					attributedByAlias.set(aliasName, new Map());
				}
				const targets = attributedByAlias.get(aliasName);
				const targetKey = `${harnessId}${TARGET_KEY_SEPARATOR}${modelRef}`;
				if (!targets.has(targetKey)) {
					targets.set(targetKey, { harness: harnessId, model: modelRef, runs: [] });
				}
				targets.get(targetKey).runs.push(run);
			}
		}
	}

	const aliases = [];
	for (const [aliasName, targets] of attributedByAlias) {
		const allRuns = [];
		const targetEntries = [];
		for (const bucket of targets.values()) {
			allRuns.push(...bucket.runs);
			targetEntries.push({
				harness: bucket.harness,
				model: bucket.model,
				...bucketReliabilityRuns(bucket.runs, { recentWindowRuns }),
			});
		}
		targetEntries.sort((a, b) =>
			`${a.harness}${TARGET_KEY_SEPARATOR}${a.model}`.localeCompare(
				`${b.harness}${TARGET_KEY_SEPARATOR}${b.model}`,
			),
		);
		aliases.push({
			aliasName,
			...bucketReliabilityRuns(allRuns, { recentWindowRuns }),
			targets: targetEntries,
		});
	}
	aliases.sort((a, b) => a.aliasName.localeCompare(b.aliasName));
	return aliases;
}
