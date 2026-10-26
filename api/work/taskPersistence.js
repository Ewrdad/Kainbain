// Domain: The Work — markdown persistence, history, timeline, and reports sync.
import path from "node:path";
import fs from "node:fs";
import { backfillReliabilitySamples } from '../watch/reliabilityShared.js';
import { _formatFrontmatterValue, _parseFrontmatter } from "./taskFiles.js";
import { normalizeSurveyFileName } from "./taskSurvey.js";
import { _sanitizeTaskTitle } from "./taskIdentity.js";
import { computeStageDelta, getTaskDiffStat, getCommitRangeDiffStat } from "./taskDiffStat.js";
import { _atomicWriteFileSync } from "../house/index.js";
import { parseStoredRecords } from "./taskFiles.js";
import { reportCreatedAt } from "../../shared/reportTimestamp.js";
import {
	isAutoReportContent,
	parseLegacyProcessLogText,
} from "../watch/index.js";
import { resolveStageLabel } from "../flow/index.js";
import { sanitizeFailbackWarnings } from "../observability/alerts.js";
import { sanitizeSpuriousNoVerdictRejections } from "./remediateNoVerdictRejections.js";
import { ORPHANED_RUNNING_STATUSES } from "../flow/taskScheduler.js";
import {
	docsProjectFor,
	reportRelPath,
	resolveTaskDocsDir,
} from "../docsPath.js";

/***
 * MARK: docsProjectForStore
 * @description Best-effort project record lookup for per-project docs folder
 *   resolution (see `docsProjectFor` in `api/docsPath.js`).
 * @param {Object} taskStore - TaskStore instance (or compatible double).
 * @param {string} projectId
 * @returns {Object|null}
 ***/
export function docsProjectForStore(taskStore, projectId) {
	return docsProjectFor(taskStore, projectId);
}

/***
 * MARK: saveTaskMarkdown
 * @description Persists a task entity and its execution history to `<projectRoot>/docs/tasks/<taskId>/task.md`.
 * @param {Object} taskStore - TaskStore instance.
 * @param {string} projectCwd
 * @param {Object} task
 * @returns {void}
 ***/
export function saveTaskMarkdown(taskStore, projectCwd, task) {
	// Pre-revert migration: a task whose in-memory timeline still carries the
	// spurious no-verdict/no-change rejection (loaded before the fix, or from a
	// clobbered file) is healed on write, so the persisted file can never keep
	// the bogus failure. Idempotent and scoped to the exact diagnostic.
	sanitizeSpuriousNoVerdictRejections(task);
	const baseDir = taskStore._resolveProjectCwd(task.projectId, projectCwd);
	if (!baseDir) return;

	const taskDocsDir =
		resolveTaskDocsDir(
			baseDir,
			docsProjectForStore(taskStore, task.projectId),
			task.id,
		) || path.join(baseDir, "docs", "tasks", task.id);
	/* eslint-disable security/detect-non-literal-fs-filename */
	try {
		if (!fs.existsSync(taskDocsDir)) {
			fs.mkdirSync(taskDocsDir, { recursive: true });
		}
		const taskMdPath = path.join(taskDocsDir, "task.md");
		const frontmatter = [
			"---",
			`id: ${_formatFrontmatterValue(task.id)}`,
			`projectId: ${_formatFrontmatterValue(task.projectId)}`,
			`workflowId: ${_formatFrontmatterValue(task.workflowId || "wf-default")}`,
			...(task.branch ? [`branch: ${_formatFrontmatterValue(task.branch)}`] : []),
			`reviewBaseline: ${_formatFrontmatterValue(task.reviewBaseline ? JSON.stringify(task.reviewBaseline) : "")}`,
			`title: ${_formatFrontmatterValue(task.title)}`,
			`status: ${_formatFrontmatterValue(task.status)}`,
			`resumedAfterInterruption: ${_formatFrontmatterValue(task.resumedAfterInterruption === true)}`,
			`interruptedAt: ${_formatFrontmatterValue(task.interruptedAt || "")}`,
			`surveyPending: ${_formatFrontmatterValue(task.surveyPending === true)}`,
			...(task.surveyFile
				? [`surveyFile: ${_formatFrontmatterValue(normalizeSurveyFileName(task.surveyFile))}`]
				: []),
			`currentStageId: ${_formatFrontmatterValue(task.currentStageId || "")}`,
			`createdAt: ${_formatFrontmatterValue(task.createdAt)}`,
			`updatedAt: ${_formatFrontmatterValue(task.updatedAt)}`,
			`enteredStageAt: ${_formatFrontmatterValue(task.enteredStageAt || "")}`,
			`timeInStage: ${Number(task.timeInStage) || 0}`,
			`reportMetadata: ${_formatFrontmatterValue(JSON.stringify((task.reports || []).map(({ filename, stageName, stageId, duration, status, createdAt, durationStartedAt, harnessId, failureKind, aliasName, modelRef, targetIndex }) => ({ filename, stageName, stageId, duration, status, createdAt, durationStartedAt, harnessId, failureKind, aliasName, modelRef, targetIndex }))))}`,
			`reliabilitySamples: ${_formatFrontmatterValue(JSON.stringify(task.reliabilitySamples || []))}`,
			`timelineMetadata: ${_formatFrontmatterValue(JSON.stringify(task.timeline || []))}`,
			`autoIterationCount: ${Number(task.autoIterationCount) || 0}`,
			`failbackWarningsSent: ${_formatFrontmatterValue(JSON.stringify(sanitizeFailbackWarnings(task.failbackWarningsSent)))}`,
			`outputReport: ${_formatFrontmatterValue(task.outputReport || "")}`,
			`feedback: ${_formatFrontmatterValue(task.feedback || "")}`,
			`blockedBy: ${_formatFrontmatterValue(task.blockedBy && task.blockedBy.length > 0 ? JSON.stringify(task.blockedBy) : "[]")}`,
			...(task.deployBuildAtEntry !== undefined && task.deployBuildAtEntry !== null ? [`deployBuildAtEntry: ${Number(task.deployBuildAtEntry)}`] : []),
			...(task.preMergeMainSha ? [`preMergeMainSha: ${_formatFrontmatterValue(task.preMergeMainSha)}`] : []),
			...(task.mergeAttemptId ? [`mergeAttemptId: ${_formatFrontmatterValue(task.mergeAttemptId)}`] : []),
			...(task.deployAttemptId ? [`deployAttemptId: ${_formatFrontmatterValue(task.deployAttemptId)}`] : []),
			...(task.stallCount ? [`stallCount: ${Number(task.stallCount) || 0}`] : []),
			"---",
		].join("\n");

		const historyMarkdown = (task.history || [])
			.map((h) => `- ${h.timestamp}: ${h.action}`)
			.join("\n");

		const timelineMarkdown = (task.timeline || [])
			.map((t) => {
				const line = `- ${t.timestamp || ""}: ${t.stage} | ${t.status} | ${t.duration || "0m"}`;
				const diffStat = formatTimelineDiffStat(t);
				return diffStat ? `${line} | ${diffStat}` : line;
			})
			.join("\n");

		const bodySections = [
			frontmatter,
			"",
			"# Goal",
			task.goal || task.title || "Untitled task",
			"",
			"# History",
			historyMarkdown || "- (no history recorded)",
		];

		if (timelineMarkdown) {
			bodySections.push("", "# Timeline", timelineMarkdown);
		}

		// Structured log entries are the single persisted log storage path; the
		// rendered `# Process Logs` section is no longer written (legacy files
		// that carry one are still parsed back into entries on load).
		if (Array.isArray(task.logEntries) && task.logEntries.length > 0) {
			bodySections.push(
				"",
				"# Log Entries",
				"```json",
				JSON.stringify(task.logEntries),
				"```",
			);
		}

		_atomicWriteFileSync(taskMdPath, bodySections.join("\n"));
	} catch (err) {
		// Non-blocking filesystem fallback for test environments without real dirs
	}
	/* eslint-enable security/detect-non-literal-fs-filename */
}

/***
 * MARK: recordHistory
 * @description Records an audit history event on a task while preventing duplicate consecutive or identical timestamp entries.
 * @param {Object} task
 * @param {string} action
 * @param {string} [timestamp]
 * @returns {void}
 ***/
export function recordHistory(
	task,
	action,
	timestamp = new Date().toISOString(),
) {
	if (!task || !action) return;
	if (!Array.isArray(task.history)) {
		task.history = [];
	}
	const last = task.history[task.history.length - 1];
	if (
		last &&
		last.action === action &&
		Math.abs(new Date(last.timestamp || 0) - new Date(timestamp)) < 2000
	) {
		return;
	}
	task.history.push({ timestamp, action });
	if (task.history.length > 150) {
		task.history = [task.history[0], ...task.history.slice(-149)];
	}
}

/***
 * MARK: recordTimeline
 * @description Records a stage-transition timeline entry on a task (stage,
 * status, duration) so the Task Inspector's "Stage Transition Timeline" is
 * populated with real data rather than a single default row. Stored rows
 * follow the arrival-vs-outcome contract: arrival rows (Moved/Advanced)
 * record stage = destination with duration = time in the source stage, while
 * outcome rows (Failed/Completed) record stage = source with duration = time
 * in that same stage. Display honesty (no duplicated current-stage row) is
 * owned by buildDisplayTimeline, not by the writers.
 * @param {Object} task
 * @param {Object} entry
 * @param {string} entry.stage
 * @param {string} entry.status
 * @param {string} [entry.duration='0m']
 * @param {string} [entry.timestamp]
 * @returns {void}
 ***/
export function recordTimeline(
	task,
	{ stage, status, duration = "0m", timestamp, ...metadata },
) {
	if (!task || !stage) return;
	if (!Array.isArray(task.timeline)) {
		task.timeline = [];
	}
	const ts = timestamp || new Date().toISOString();
	task.timeline.push({ stage, status, duration, timestamp: ts, ...metadata });
}

/***
 * MARK: formatTimelineDiffStat
 * @description Renders a timeline entry's per-stage diff size as the optional
 *   4th markdown segment (`+N -M`). Returns an empty string when the entry
 *   carries no diff data, so legacy entries write exactly as before.
 * @example formatTimelineDiffStat({ additions: 12, deletions: 3 }) => '+12 -3'
 * @example formatTimelineDiffStat({ stage: 'Idea' }) => ''
 * @param {Object} [entry] - Timeline entry.
 * @returns {string} Diff segment, or '' when absent.
 ***/
export function formatTimelineDiffStat(entry) {
	if (
		!entry ||
		!Number.isInteger(entry.additions) ||
		!Number.isInteger(entry.deletions) ||
		entry.additions < 0 ||
		entry.deletions < 0
	) {
		return "";
	}
	return `+${entry.additions} -${entry.deletions}`;
}

/***
 * MARK: parseTimelineDiffStat
 * @description Reads the optional 4th timeline segment (`+N -M`) back into
 *   addition/deletion counts. Legacy 3-segment lines (undefined segment) and
 *   malformed segments resolve to null and are ignored by the caller.
 * @example parseTimelineDiffStat('+12 -3') => { additions: 12, deletions: 3 }
 * @example parseTimelineDiffStat(undefined) => null
 * @param {string} [segment] - Raw 4th `|` segment.
 * @returns {{ additions: number, deletions: number }|null} Counts, or null.
 ***/
export function parseTimelineDiffStat(segment) {
	if (typeof segment !== "string") return null;
	const match = segment.trim().match(/^\+(\d+)\s*-\s*(\d+)$/);
	if (!match) return null;
	return {
		additions: Number.parseInt(match[1], 10),
		deletions: Number.parseInt(match[2], 10),
	};
}

/***
 * MARK: _isTaskStillRegistered
 * @description Membership check for the deferred diff-stat re-save. Returns
 *   true when the store still holds this exact task object, false when the
 *   task was deleted (or replaced by a newer object under the same id), and
 *   null when the store exposes no membership API so liveness is unknowable.
 *   A false result must skip the re-save: saveTaskMarkdown recreates
 *   `docs/tasks/<id>/task.md`, which would resurrect a deleted task that
 *   scanTasks then re-imports. Unknown (null) preserves the old re-save
 *   behaviour for minimal stub stores.
 * @param {Object} [store] - TaskStore instance (or test stub).
 * @param {Object} [task] - The task entity the entry was recorded on.
 * @returns {boolean|null} Liveness, or null when unknowable.
 ***/
export function _isTaskStillRegistered(store, task) {
	if (!store || !task || task.id == null || task.projectId == null) {
		return null;
	}
	try {
		if (typeof store.getTask === "function") {
			return store.getTask(task.projectId, task.id) === task;
		}
		if (typeof store._getMap === "function") {
			const map = store._getMap(task.projectId);
			if (map && typeof map.get === "function") {
				return map.get(task.id) === task;
			}
		}
	} catch {
		return null;
	}
	return null;
}

/***
 * MARK: _entryBaseline
 * @description Reads a timeline entry's stage-entry cumulative baseline back
 *   into `{ additions, deletions }` shape for computeStageDelta. Entries
 *   recorded before per-stage badges existed carry no `baseAdditions` /
 *   `baseDeletions` fields at all (legacy): they resolve to null and their
 *   stored badge is never rewritten, so old rows render exactly as before.
 *   New entries whose baseline is still unknown (`null`, git failure) also
 *   resolve to null, meaning "no badge" rather than a zero badge.
 * @param {Object} [entry] - Timeline entry.
 * @returns {{ additions: number, deletions: number }|null} Baseline, or null.
 ***/
/***
 * MARK: _entryBoundary
 * @description Reads a timeline entry's explicit commit range back into
 *   start/end SHA strings. Returns nulls when either side is missing or
 *   invalid so callers can distinguish complete (both), partial (one), and
 *   legacy (none) boundary data. The canonical fields are
 *   `boundaryStartSha`/`boundaryEndSha`; `baseSha`/`headSha` are accepted as
 *   legacy aliases from early writers.
 * @example _entryBoundary({ boundaryStartSha: 'aaa', boundaryEndSha: 'bbb' }) => { start: 'aaa', end: 'bbb' }
 * @param {Object} [entry] - Timeline entry.
 * @returns {{ start: string|null, end: string|null }} Boundary SHAs.
 ***/
export function _entryBoundary(entry) {
	let start = null;
	let end = null;
	if (entry) {
		const startCandidates = ["boundaryStartSha", "baseSha"];
		const endCandidates = ["boundaryEndSha", "headSha"];
		for (const key of startCandidates) {
			const value = entry[key];
			if (typeof value === "string" && value.trim()) {
				start = value.trim();
				break;
			}
		}
		for (const key of endCandidates) {
			const value = entry[key];
			if (typeof value === "string" && value.trim()) {
				end = value.trim();
				break;
			}
		}
	}
	return { start, end };
}

export function _entryBaseline(entry) {
	if (!entry || entry.baseAdditions == null || entry.baseDeletions == null) {
		return null;
	}
	if (
		!Number.isInteger(entry.baseAdditions) ||
		!Number.isInteger(entry.baseDeletions) ||
		entry.baseAdditions < 0 ||
		entry.baseDeletions < 0
	) {
		return null;
	}
	return {
		additions: entry.baseAdditions,
		deletions: entry.baseDeletions,
	};
}

/***
 * MARK: _isClosingTimelineRow
 * @description Whether a timeline row closes its stage instead of opening the
 *   next one. A `Failed` row owns the failing stage's delta (the entry row
 *   keeps its opening `+0 -0`); every other status backfills the previous
 *   row, including `Completed`, whose own badge stays `+0 -0`.
 * @param {Object} [entry] - Timeline entry.
 * @returns {boolean} True for stage-closing `Failed` rows.
 ***/
function _isClosingTimelineRow(entry) {
	return entry?.status === "Failed";
}

// Per-task serialization of the deferred diff-stat backfill, so rapid
// transitions (enter → fail within milliseconds) measure and attribute in
// call order instead of racing git against each other. A WeakMap keeps the
// chain off the task object itself (tasks are broadcast/serialized).
const _diffStatQueues = new WeakMap();

function _enqueueDiffStatJob(task, job) {
	const tail = _diffStatQueues.get(task);
	const head = tail ? tail.catch(() => {}) : Promise.resolve();
	const next = head.then(job, job);
	_diffStatQueues.set(task, next);
	return next;
}

/***
 * MARK: recordTimelineWithDiffStat
 * @description Records a stage-transition timeline entry immediately, then
 *   best-effort attributes a per-stage `+N -M` badge once git answers. Stays
 *   synchronous for its callers (stage transitions, failure routing): the
 *   entry is always recorded, the badge data lands a moment later and the
 *   markdown is re-saved. The badge shows only the lines changed while that
 *   stage was active (current cumulative minus the previous row's baseline),
 *   so a no-op stage renders `+0 -0` while a genuinely unknown diff (git
 *   failure) renders no badge. Any git failure means "no badge", never a
 *   failed transition. Deferred backfills run in call order per task, so a
 *   rapid enter → fail sequence cannot misattribute baselines. When the task
 *   is deleted (or replaced) before git answers, the deferred re-save is
 *   skipped so the deleted task is never recreated on disk. When the entry
 *   carries an explicit commit range (`boundaryStartSha`/`boundaryEndSha`),
 *   the badge measures exactly that range via getCommitRangeDiffStat and is
 *   attributed directly to this row; partial boundary data resolves to no
 *   badge. Entries without boundary data keep the legacy cumulative
 *   baseline behaviour, and legacy rows are never rewritten. Returns the
 *   recorded entry.
 * @example recordTimelineWithDiffStat(store, task, { stage: 'Idea', status: 'Moved' }, '/repo') => entry
 * @param {Object} store - TaskStore instance (cwd resolution plus re-save).
 * @param {Object} task
 * @param {Object} entry
 * @param {string} [projectCwd]
 * @param {Object} [diffStatOpts] - Injected diff readers (tests).
 * @returns {Object|undefined} The recorded entry.
 ***/
export function recordTimelineWithDiffStat(
	store,
	task,
	entry,
	projectCwd,
	diffStatOpts = {},
) {
	const previous =
		task && Array.isArray(task.timeline) && task.timeline.length > 0
			? task.timeline[task.timeline.length - 1]
			: null;
	const closing = _isClosingTimelineRow(entry);
	recordTimeline(task, entry);
	const saved =
		task && Array.isArray(task.timeline)
			? task.timeline[task.timeline.length - 1]
			: null;
	if (!saved) return saved;
	// Mark the row as baseline-tracked up front: rows without these fields
	// are legacy rows whose stored badge must never be rewritten.
	// Canonicalise the legacy `baseSha`/`headSha` aliases onto the single
	// `boundaryStartSha`/`boundaryEndSha` fields used for range-based
	// attribution. The original keys are left in place for compatibility.
	const { start: canonicalStart, end: canonicalEnd } = _entryBoundary(saved);
	if (canonicalStart !== null) saved.boundaryStartSha = canonicalStart;
	if (canonicalEnd !== null) saved.boundaryEndSha = canonicalEnd;
	if (saved.baseAdditions === undefined) saved.baseAdditions = null;
	if (saved.baseDeletions === undefined) saved.baseDeletions = null;
	if (saved.boundaryStartSha === undefined) saved.boundaryStartSha = null;
	if (saved.boundaryEndSha === undefined) saved.boundaryEndSha = null;
	let cwd = null;
	try {
		cwd =
			store && typeof store._resolveProjectCwd === "function"
				? store._resolveProjectCwd(task.projectId, projectCwd)
				: projectCwd;
	} catch {
		cwd = null;
	}
	if (!cwd) return saved;
	_enqueueDiffStatJob(task, async () => {
		const { start: boundaryStart, end: boundaryEnd } = _entryBoundary(saved);
		const hasBoundaryStart = boundaryStart !== null;
		const hasBoundaryEnd = boundaryEnd !== null;
		// Partial boundary data is explicitly unknown: never guess a badge.
		// The entry keeps its opening state (no badge); only the markdown
		// re-save still runs so the canonicalised fields persist.
		if (hasBoundaryStart !== hasBoundaryEnd) {
			try {
				store?._saveTaskMarkdown?.(cwd, task);
			} catch {
				// Best-effort re-save.
			}
			return;
		}
		let stat = null;
		const rangeMode = hasBoundaryStart && hasBoundaryEnd;
		try {
			if (rangeMode) {
				stat = await getCommitRangeDiffStat(
					cwd,
					boundaryStart,
					boundaryEnd,
					diffStatOpts,
				);
			} else {
				stat = await getTaskDiffStat(cwd, task, diffStatOpts);
			}
		} catch {
			stat = null;
		}
		if (!Array.isArray(task.timeline) || !task.timeline.includes(saved)) {
			return;
		}
		if (_isTaskStillRegistered(store, task) === false) {
			return;
		}
		if (!stat) {
			// Unknown diff: no badge (stays distinguishable from `+0 -0`),
			// but inherit the last known baseline so a later stage can still
			// measure its own delta once git answers again.
			const inherited = _entryBaseline(previous);
			saved.baseAdditions = inherited ? inherited.additions : null;
			saved.baseDeletions = inherited ? inherited.deletions : null;
			return;
		}
		if (rangeMode) {
			// Explicit boundary: the range diff already measures this stage
			// alone. Direct attribution, no cumulative backfill. The shared
			// baseline update below records the measured totals.
			saved.additions = stat.additions;
			saved.deletions = stat.deletions;
		} else if (closing) {
			// Stage-closing row (Failed): it owns the failing stage's delta
			// measured from the entry row's baseline; the entry row keeps
			// its opening badge. An unmeasured entry baseline falls back to
			// zero, attributing everything observed so far to the open
			// stage (correct for branch-mode rows entered before the first
			// successful measurement).
			const delta = computeStageDelta(
				stat,
				_entryBaseline(previous) ?? { additions: 0, deletions: 0 },
			);
			if (delta) {
				saved.additions = delta.additions;
				saved.deletions = delta.deletions;
			}
		} else {
			// Stage-opening row. Closing rows (Failed/Completed) and legacy
			// rows are never rewritten.
			const previousTracked =
				previous &&
				task.timeline.includes(previous) &&
				!_isClosingTimelineRow(previous) &&
				previous.baseAdditions !== undefined;
			if (previousTracked) {
				const previousBaseline = _entryBaseline(previous);
				const delta = computeStageDelta(
					stat,
					previousBaseline ?? { additions: 0, deletions: 0 },
				);
				const previousHasBoundaryRange =
					_entryBoundary(previous).start !== null &&
					_entryBoundary(previous).end !== null;
				if (previousHasBoundaryRange) {
					saved.additions = 0;
					saved.deletions = 0;
				} else if (previous.additions === undefined && previousBaseline) {
					// The previous row's own measurement failed (unknown diff),
					// so it stays honestly badge-less. This newly opened row
					// absorbs the delta measured since the last known baseline
					// instead of backfilling the unknown row with a number its
					// own snapshot never observed.
					if (delta) {
						saved.additions = delta.additions;
						saved.deletions = delta.deletions;
					} else {
						saved.additions = 0;
						saved.deletions = 0;
					}
				} else {
					// Normal case: close out the previous stage's badge (from
					// zero when no baseline was ever observed), then open this
					// stage at `+0 -0` on a fresh baseline.
					if (delta) {
						previous.additions = delta.additions;
						previous.deletions = delta.deletions;
					}
					saved.additions = 0;
					saved.deletions = 0;
				}
			} else {
				saved.additions = 0;
				saved.deletions = 0;
			}
		}
		saved.baseAdditions = stat.additions;
		saved.baseDeletions = stat.deletions;
		try {
			store?._saveTaskMarkdown?.(cwd, task);
		} catch {
			// Best-effort re-save: the in-memory entry already carries the stat.
		}
	});
	return saved;
}

/***
 * MARK: syncTaskReports
 * @description Synchronizes and deduplicates markdown report files from disk for a task.
 * @param {Object} taskStore - TaskStore instance.
 * @param {string} projectId
 * @param {Object} task
 * @param {string} [projectCwd]
 * @returns {Array<Object>} Deduplicated reports list.
 ***/
export function syncTaskReports(taskStore, projectId, task, projectCwd) {
	if (!task || !task.id) return [];
	const reportsMap = new Map();

	// Populate from in-memory reports
	if (Array.isArray(task.reports)) {
		for (const r of task.reports) {
			const key = r.filename || r.name || (r.path ? path.basename(r.path) : null);
			if (key && !reportsMap.has(key)) {
				reportsMap.set(key, {
					...r,
					name: r.name || r.filename || key,
					filename: r.filename || r.name || key,
					timestamp: r.timestamp || r.createdAt || "",
				});
			}
		}
	}

	const baseDir = taskStore._resolveProjectCwd(projectId, projectCwd);
	if (baseDir) {
		const docsProject = docsProjectForStore(taskStore, projectId);
		const taskDocsDir =
			resolveTaskDocsDir(baseDir, docsProject, task.id) ||
			path.join(baseDir, "docs", "tasks", task.id);
		/* eslint-disable security/detect-non-literal-fs-filename */
		try {
			if (fs.existsSync(taskDocsDir)) {
				const files = fs.readdirSync(taskDocsDir);
				for (const file of files) {
					if (file.endsWith(".md") && file !== "task.md") {
						const relPath = reportRelPath(docsProject, task.id, file);
						const filePath = path.join(taskDocsDir, file);
						let content = "";
						try {
							content = fs.readFileSync(filePath, "utf8");
						} catch (e) {
							content = "";
						}
						const existing = reportsMap.get(file);
						const stageSlug = file.replace(/-\d{8}[-T]\d{6}Z?\.md$/, "");
						// Extract timestamp from filename if available (e.g. stage-20260824T120000Z.md)
						const tsMatch = file.match(/-(\d{8}[-T]\d{6}Z?)\.md$/);
						const extractedTs = tsMatch ? tsMatch[1] : "";
						reportsMap.set(file, {
							...existing,
							stageName: existing?.stageName || stageSlug || "stage",
							stageSlug,
							path: relPath,
							filename: file,
							name: existing?.name || file,
							content: content || existing?.content || "",
							auto: isAutoReportContent(content) || existing?.auto,
							timestamp:
								existing?.timestamp || extractedTs || existing?.createdAt || "",
							createdAt: reportCreatedAt({ ...existing, filename: file }),
						});
					}
				}
			}
		} catch (err) {
			// Ignore directory read errors
		}
		/* eslint-enable security/detect-non-literal-fs-filename */
	}

	task.reports = Array.from(reportsMap.values()).sort((a, b) => {
		const ta = String(a.timestamp || a.createdAt || "");
		const tb = String(b.timestamp || b.createdAt || "");
		return ta.localeCompare(tb);
	});
	return task.reports;
}

/***
 * MARK: parseTaskMarkdown
 * @description Parses `<projectRoot>/docs/tasks/<taskId>/task.md` into a task entity.
 * @param {Object} taskStore - TaskStore instance.
 * @param {string} content - File content of task.md.
 * @param {string} taskId
 * @param {string} projectId
 * @returns {Object}
 ***/
export function parseTaskMarkdown(taskStore, content, taskId, projectId) {
	const { data, content: body } = _parseFrontmatter(content);
	const now = new Date().toISOString();

	let goal = "";
	let history = [];
	let processLogs = "";

	// Parse body sections
	const goalMatch = body.match(
		/# Goal\r?\n([\s\S]*?)(?=(?:\r?\n# (?:History|Timeline|Process Logs)|\r?\n$|$))/,
	);
	if (goalMatch) {
		goal = goalMatch[1].trim();
	}

	const historyMatch = body.match(
		/# History\r?\n([\s\S]*?)(?=(?:\r?\n# (?:Timeline|Process Logs)|\r?\n$|$))/,
	);
	if (historyMatch) {
		const historyLines = historyMatch[1].split(/\r?\n/);
		const seen = new Set();
		for (const line of historyLines) {
			const trimmed = line.trim();
			if (trimmed.startsWith("- ")) {
				const item = trimmed.slice(2).trim();
				const firstColon = item.indexOf(": ");
				let ts = now;
				let action = item;
				if (firstColon !== -1) {
					ts = item.slice(0, firstColon).trim();
					action = item.slice(firstColon + 2).trim();
				}
				const dedupeKey = `${ts}:::${action}`;
				if (!seen.has(dedupeKey)) {
					seen.add(dedupeKey);
					history.push({ timestamp: ts, action });
				}
			}
		}
	}

	let timeline = [];
	const timelineMatch = body.match(
		/# Timeline\r?\n([\s\S]*?)(?=(?:\r?\n# (?:Process Logs|Log Entries)|\r?\n$|$))/,
	);
	if (timelineMatch) {
		const timelineLines = timelineMatch[1].split(/\r?\n/);
		for (const line of timelineLines) {
			const trimmed = line.trim();
			if (trimmed.startsWith("- ")) {
				const item = trimmed.slice(2).trim();
				const firstColon = item.indexOf(": ");
				let ts = now;
				let rest = item;
				if (firstColon !== -1) {
					ts = item.slice(0, firstColon).trim();
					rest = item.slice(firstColon + 2).trim();
				}
				const parts = rest.split("|").map((p) => p.trim());
				if (parts.length >= 2) {
					const entry = {
						stage: parts[0],
						status: parts[1],
						duration: parts[2] || "0m",
						timestamp: ts,
					};
					const diffStat = parseTimelineDiffStat(parts[3]);
					if (diffStat) {
						entry.additions = diffStat.additions;
						entry.deletions = diffStat.deletions;
					}
					timeline.push(entry);
				}
			}
		}
	}

	const persistedTimeline = parseStoredRecords(data.timelineMetadata);
	if (persistedTimeline.length > 0) timeline = persistedTimeline;

	const logsMatch = body.match(
		/# Process Logs\r?\n([\s\S]*?)(?=\r?\n# Log Entries\r?\n|$)/,
	);
	if (logsMatch) {
		processLogs = logsMatch[1].trim();
	}

	// Structured grouped log entries
	let logEntries = [];
	const logEntriesMatch = body.match(
		/# Log Entries\r?\n```json\r?\n([\s\S]*?)\r?\n```/,
	);
	if (logEntriesMatch) {
		try {
			const parsed = JSON.parse(logEntriesMatch[1]);
			if (Array.isArray(parsed)) logEntries = parsed;
		} catch {
			// Tolerate corrupt section
		}
	}

	// Legacy-only synthesis: files written before the structured-entries era
	// carry only a rendered `# Process Logs` section. Convert it to entries at
	// load so `logEntries` stays the single storage path; the rendered text is
	// never carried on the task or re-persisted.
	if (logEntries.length === 0 && processLogs) {
		logEntries = parseLegacyProcessLogText(processLogs);
	}

	const title = _sanitizeTaskTitle(
		data.title || goal.slice(0, 60) || "Untitled task",
	);
	const taskGoal = goal || title || "Untitled task";

	let blockedBy = [];
	if (data.blockedBy) {
		try {
			if (
				typeof data.blockedBy === "string" &&
				data.blockedBy.startsWith("[") &&
				data.blockedBy.endsWith("]")
			) {
				blockedBy = JSON.parse(data.blockedBy);
			} else if (typeof data.blockedBy === "string") {
				blockedBy = data.blockedBy
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean);
			}
		} catch (e) {
			blockedBy = [];
		}
	}

	// The live-running set is shared with the scheduler's orphan
	// reconciliation (ORPHANED_RUNNING_STATUSES) so both reads agree on
	// which disk statuses mean "interrupted by restart".
	const isInterruptedOnDisk =
		ORPHANED_RUNNING_STATUSES.has(data.status) ||
		data.status === "interrupted";

	const effectiveStatus = isInterruptedOnDisk
		? "interrupted"
		: data.status || "in_stage";

	if (
		isInterruptedOnDisk &&
		!history.some(
			(h) =>
				h.action?.toLowerCase().includes("interrupted") ||
				h.action?.toLowerCase().includes("recovered"),
		)
	) {
		let interruptedStages = [];
		if (
			taskStore?.projectStore &&
			typeof taskStore.projectStore.getProject === "function"
		) {
			const proj = taskStore.projectStore.getProject(projectId);
			if (proj) {
				interruptedStages =
					taskStore._resolveStagesForTask?.(proj, {
						workflowId: data.workflowId,
					}) || [];
			}
		}
		history.push({
			timestamp: now,
			action: `Execution recovered after server restart (interrupted at stage '${resolveStageLabel(data.currentStageId, interruptedStages)}')`,
		});
	}

	const autoIterationCount = Number(data.autoIterationCount) || 0;

	let reviewBaseline;
	if (typeof data.reviewBaseline === "string" && data.reviewBaseline.trim()) {
		try {
			const parsed = JSON.parse(data.reviewBaseline);
			if (
				parsed &&
				typeof parsed === "object" &&
				!Array.isArray(parsed) &&
				typeof parsed.baseSha === "string" &&
				parsed.baseSha.trim() &&
				typeof parsed.headSha === "string" &&
				parsed.headSha.trim()
			) {
				reviewBaseline = parsed;
			}
		} catch {
			// Tolerate corrupt section: no baseline, live diff applies.
		}
	}

	const task = {
		id: data.id || taskId,
		projectId: data.projectId || projectId,
		workflowId: data.workflowId || "wf-default",
		branch: data.branch || undefined,
		reviewBaseline,
		title,
		goal: taskGoal,
		body: taskGoal,
		prompt: "",
		currentStageId: data.currentStageId || null,
		status: effectiveStatus,
		wasInterrupted: Boolean(isInterruptedOnDisk),
		resumedAfterInterruption:
			String(data.resumedAfterInterruption || "").toLowerCase() === "true",
		interruptedAt: data.interruptedAt || null,
		surveyPending:
			String(data.surveyPending || "").toLowerCase() === "true",
		surveyFile:
			data.surveyFile ? normalizeSurveyFileName(data.surveyFile) : undefined,
		autoIterationCount,
		failbackWarningsSent: sanitizeFailbackWarnings(data.failbackWarningsSent),
		blockedBy: Array.isArray(blockedBy) ? blockedBy : [],
		reports: parseStoredRecords(data.reportMetadata),
		reliabilitySamples: parseStoredRecords(data.reliabilitySamples),
		createdAt: data.createdAt || now,
		updatedAt: data.updatedAt || now,
		enteredStageAt: data.enteredStageAt || undefined,
		timeInStage: Number(data.timeInStage) || 0,
		deployBuildAtEntry:
			data.deployBuildAtEntry !== undefined &&
			data.deployBuildAtEntry !== "" &&
			!Number.isNaN(Number(data.deployBuildAtEntry))
				? Number(data.deployBuildAtEntry)
				: undefined,
		preMergeMainSha: data.preMergeMainSha || undefined,
		mergeAttemptId: data.mergeAttemptId || undefined,
		deployAttemptId: data.deployAttemptId || undefined,
		stallCount: Number(data.stallCount) || 0,
		history:
			history.length > 0
				? history
				: [{ timestamp: now, action: "Rehydrated from disk" }],
		timeline,
		stats: {},
		outputReport: data.outputReport || "",
		logEntries,
		keywords: [],
		feedback: data.feedback || null,
	};

	// Backfill reliability samples from reports if not already present
	if (task.reports && task.reports.length > 0 && (!task.reliabilitySamples || task.reliabilitySamples.length === 0)) {
		backfillReliabilitySamples(task);
	}
	// Pre-revert migration: drop the spurious no-verdict/no-change rejections
	// recorded by the strict gate removed in b2806f3 so a clobbered task file
	// heals on load (and is re-persisted clean on the next save). Genuine
	// rejections are untouched.
	sanitizeSpuriousNoVerdictRejections(task);
	return task;
}
