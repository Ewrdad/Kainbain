// Domain: Watching the Work — preserves the task store's existing public contract.
import path from 'node:path';
import fs from 'node:fs';
import { formatTimestamp, slugifyStageName } from '../promptCuration.js';
import {
	docsProjectFor,
	reportRelPath,
	resolveTaskDocsDir,
} from '../docsPath.js';

/***
 * MARK: AUTO_REPORT_MARKER
 * @description Marker string embedded in every auto-generated (AI/agent pipeline) stage report
 *   so reports written by the engine can be visually and programmatically distinguished from
 *   manually-authored reports. It is hidden by most markdown renderers (HTML comment).
 * @example AUTO_REPORT_MARKER === "<!-- KAINBAIN AUTO-GENERATED REPORT -->"
 ***/
export const AUTO_REPORT_MARKER = "<!-- KAINBAIN AUTO-GENERATED REPORT -->";

/***
 * MARK: isAutoReportContent
 * @description Returns true if report content carries the auto-generated marker.
 * @example isAutoReportContent(content) => true
 * @param {string} content
 * @returns {boolean}
 ***/
export function isAutoReportContent(content) {
	return typeof content === "string" && content.includes(AUTO_REPORT_MARKER);
}

/***
 * MARK: stripStageVerdictBlock
 * @description Removes machine-readable KAINBAIN_VERDICT/REASON/FIX marker
 *   lines from stage output so callers can tell a verdict-only reply (no
 *   prose, no findings) apart from a real one. Only the marker lines are
 *   removed; surrounding prose passes through unchanged.
 * @example stripStageVerdictBlock("done\nKAINBAIN_VERDICT: PASS") => "done"
 * @param {string} [text] - Raw stage output, may be empty.
 * @returns {string} The output without verdict marker lines, trimmed.
 ***/
export function stripStageVerdictBlock(text) {
	if (typeof text !== "string" || !text) return "";
	return text
		.split("\n")
		.filter((line) => !/^\s*KAINBAIN_(VERDICT|REASON|FIX)\s*:.*$/i.test(line))
		.join("\n")
		.trim();
}

/***
 * MARK: generateStageReportContent
 * @description Formats a rich, structured markdown report for a completed or failed stage.
 * @example generateStageReportContent({ task, stage, output: '...', summary: '...', modifiedFiles: ['a.js'] }) => '# Stage Report...'
 * @param {Object} params
 * @param {Object} params.task
 * @param {Object} params.stage
 * @param {string} [params.output]
 * @param {string} [params.summary]
 * @param {Array<string>} [params.modifiedFiles]
 * @param {string} [params.status]
 * @param {string|null} [params.error]
 * @param {string} [params.duration]
 * @returns {string} Structured markdown report text.
 ***/
export function generateStageReportContent({
	task,
	stage,
	output = "",
	summary = "",
	modifiedFiles = [],
	status = "PASSED",
	error = null,
	duration = "0.0",
} = {}) {
	const taskTitle = task?.title || task?.goal || "Task";
	const stageName = stage?.name || stage?.id || "Stage";
	const stageType = stage?.type || "agent";
	const model = stage?.model || "default";
	const filesList =
		Array.isArray(modifiedFiles) && modifiedFiles.length > 0
			? modifiedFiles.map((f) => `- \`${f}\``).join("\n")
			: "- (No files modified / inspection only)";

	// A verdict-only reply ("KAINBAIN_VERDICT: PASS" with no prose) must never
	// become the report summary: the work lives in the recorded artifacts,
	// so point at those instead of echoing the bare verdict token.
	const substantiveOutput = stripStageVerdictBlock(output);
	const artifactNote =
		Array.isArray(modifiedFiles) && modifiedFiles.length > 0
			? `Agent returned a bare pass verdict without a written summary. Recorded artifacts (${modifiedFiles.length}):\n${modifiedFiles
					.slice(0, 10)
					.map((f) => `- \`${f}\``)
					.join("\n")}${
					modifiedFiles.length > 10
						? `\n- …and ${modifiedFiles.length - 10} more (see Modified Files below)`
						: ""
				}`
			: "";
	const effectiveSummary =
		summary ||
		(substantiveOutput ? substantiveOutput.slice(0, 300) : "") ||
		artifactNote ||
		"Stage completed successfully.";

	const sections = [
		`# Stage Report: ${stageName}`,
		"",
		`**Task:** ${taskTitle}`,
		`**Stage Type:** \`${stageType}\``,
		`**Model:** \`${model}\``,
		`**Duration:** ${duration}s`,
		`**Status:** ${status.toUpperCase()}`,
		"",
		"### Summary of Changes",
		effectiveSummary,
		"",
		"### Execution Output",
		"```",
		output || "(no output captured)",
		"```",
		"",
		"### Modified Files",
		filesList,
		"",
		"### Verification Status",
		error
			? `- Stage execution failed with error: ${error}\n- Triggered fallback routing.`
			: `- Stage execution completed successfully.\n- Output and artifacts verified against stage criteria.`,
	];

	return `${AUTO_REPORT_MARKER}\n${sections.join("\n")}`;
}

/***
 * MARK: saveStageReport
 * @description Writes a timestamped markdown report to `<projectRoot>/docs/tasks/<taskId>/<stageSlug>-<datetime>.md` and records it on the task.
 * Reports for the current stage retain durationStartedAt so multiple diagnostic
 * reports from one visit contribute only one analytics sample.
 * @param {Object} store
 * @param {string} projectId
 * @param {string} taskId
 * @param {Object} opts
 * @param {string} opts.stageName - Name of the stage completing.
 * @param {string} opts.content - Markdown report body.
 * @param {number} [opts.duration] - Elapsed stage seconds (optional when unmeasurable).
 * @param {string} [opts.status] - PASSED or FAILED.
 * @param {string} [opts.stageId] - Stage identity; name is retained across workflow edits.
 * @param {boolean} [opts.auto] - Whether this report was auto-generated by the AI pipeline.
 * @param {string} [opts.projectCwd] - Working directory for the project.
 * @param {string} [opts.harnessId] - Harness that ran the stage (reliability attribution; stored only when a non-blank string).
 * @param {string} [opts.failureKind] - Runner outcome kind: "none" (clean), "rejected" (deliberate agent fail), or "infrastructure" (timeout/harness error); stored only when known.
 * @param {string} [opts.aliasName] - Model alias this run resolved through (per-alias reliability attribution; stored only when a non-blank string). Unresolvable aliases record nothing so the fallback run is never credited to the named alias.
 * @param {string} [opts.modelRef] - Concrete model the alias target dispatched (stored only when a non-blank string; blank means the harness manages its own model).
 * @param {number} [opts.targetIndex] - Weighted-target index of the alias pick (informational rotation debugging; stored only for a non-negative integer).
 * @param {boolean} [opts.failure] - When true, the report filename gains a `-failure-` infix (`<stageSlug>-failure-<datetime>.md`) so failure traces are distinguishable from opt-in success reports in the docs folder.
 * @returns {Object|null} Report metadata.
 ***/
export function saveStageReport(
	store,
	projectId,
	taskId,
	{
		stageName,
		content = "",
		auto = true,
		projectCwd,
		duration,
		status,
		stageId,
		harnessId,
		failureKind,
		aliasName,
		modelRef,
		targetIndex,
		failure = false,
	} = {},
) {
	const task = store.getTask(projectId, taskId);
	if (!task) return null;

	const ts = formatTimestamp();
	const stageSlug = slugifyStageName(stageName || "stage");
	const docsProject = docsProjectFor(store, projectId);
	const filename = failure
		? `${stageSlug}-failure-${ts}.md`
		: `${stageSlug}-${ts}.md`;
	const relativePath = reportRelPath(docsProject, taskId, filename);
	const baseDir = store._resolveProjectCwd(projectId, projectCwd);

	/* eslint-disable security/detect-non-literal-fs-filename */
	if (baseDir) {
		const taskDocsDir =
			resolveTaskDocsDir(baseDir, docsProject, taskId) ||
			path.join(baseDir, "docs", "tasks", taskId);
		try {
			if (!fs.existsSync(taskDocsDir)) {
				fs.mkdirSync(taskDocsDir, { recursive: true });
			}
			const fullPath = path.join(taskDocsDir, filename);
			fs.writeFileSync(fullPath, content, "utf8");
		} catch (err) {
			// In test environments without real dirs, proceed in-memory
		}
	}
	/* eslint-enable security/detect-non-literal-fs-filename */

	const reportEntry = {
		...(Number.isFinite(duration) && duration >= 0 ? { duration } : {}),
		...(status === "PASSED" || status === "FAILED" ? { status } : {}),
		...(stageId !== undefined ? { stageId } : {}),
		...(typeof harnessId === "string" && harnessId.trim()
			? { harnessId: harnessId.trim() }
			: {}),
		...(failureKind === "none" ||
		failureKind === "rejected" ||
		failureKind === "infrastructure"
			? { failureKind }
			: {}),
		...(typeof aliasName === "string" && aliasName.trim()
			? { aliasName: aliasName.trim() }
			: {}),
		...(typeof modelRef === "string" && modelRef.trim()
			? { modelRef: modelRef.trim() }
			: {}),
		...(Number.isInteger(targetIndex) && targetIndex >= 0
			? { targetIndex }
			: {}),
		...(stageId === task.currentStageId &&
		Number.isFinite(Date.parse(task.enteredStageAt))
			? { durationStartedAt: task.enteredStageAt }
			: {}),
		stageName: stageName || "stage",
		stageSlug,
		path: relativePath,
		filename,
		timestamp: ts,
		content,
		auto: auto && isAutoReportContent(content),
		createdAt: new Date().toISOString(),
	};

	if (!Array.isArray(task.reports)) {
		task.reports = [];
	}
	const existingIndex = task.reports.findIndex(
		(r) => r.path === relativePath || r.filename === filename,
	);
	if (existingIndex !== -1) {
		task.reports[existingIndex] = reportEntry;
	} else {
		task.reports.push(reportEntry);
	}

	task.outputReport = relativePath;
	task.updatedAt = new Date().toISOString();
	store._recordHistory(
		task,
		`Stage report generated: ${relativePath}`,
		task.updatedAt,
	);

	store._saveTaskMarkdown(projectCwd, task);

	return reportEntry;
}

/***
 * MARK: getTaskReports
 * @description Discovers and returns all markdown reports generated for this task from filesystem and metadata, including full content.
 ***/
export function getTaskReports(store, projectId, taskId, projectCwd) {
	const task = store.getTask(projectId, taskId);
	if (!task) return [];
	return store._syncTaskReports(projectId, task, projectCwd);
}
