import { generateStageReportContent } from "../../watch/index.js";
import { redactSecretsText } from "../../../shared/redactSecrets.js";
import { recordReliabilitySample } from "../../watch/reliabilityShared.js";
import { stageWantsReport } from "../../promptCuration.js";
import { stageElapsedSeconds } from "../stagePolicy.js";
import { resolveStagesForTask } from "../stageResolution.js";
import { normalizeStageType } from "../../projectStore.js";
import { ALIAS_HARNESS_ID } from "../../../shared/modelAliases.js";
import { routeStageError } from "./routeStageError.js";
import { parkTaskForSurvey } from "./parkTaskForSurvey.js";

/***
 * MARK: applyRunnerReport
 * @description Engine-owned finish for a Runner-reported stage (remote
 *   dispatch integration, ADR 0009 step 6). The Runner owns git
 *   (clone/worktree/commit/push — transport row 1/2, D2: the backend never
 *   touches remotes for Runner work); the backend owns everything else,
 *   composing the SAME standalone transitions as the embedded path:
 *   formal report save (opt-in stages), reliability sample, question-me
 *   survey park (shared with executeStage — a remote run can never skip
 *   the human survey), failure routing via routeStageError, and
 *   advanceStage plus the scheduler follow-on kick. Call only after the
 *   lease fence accepted the execution (complete-execution does that).
 * @example await applyRunnerReport({ store, projectStore, projectId: 'p', taskId: 't', outcome: { status: 'passed', output: '...' } }) => { advanced: true, ... }
 * @param {Object} args - Context.
 * @param {Object} args.store - Task store.
 * @param {Object} args.projectStore - Project store.
 * @param {string} args.projectId - Project id.
 * @param {string} args.taskId - Task id.
 * @param {Object} args.outcome - Runner outcome.
 * @param {string} args.outcome.status - `passed` or `failed`.
 * @param {string} [args.outcome.output] - Final assistant text.
 * @param {string} [args.outcome.summary] - Run summary.
 * @param {Array} [args.outcome.modifiedFiles] - Modified files.
 * @param {string} [args.outcome.harnessId] - Harness that ran.
 * @param {string|null} [args.outcome.modelRef] - Served model the Runner
 *   reported (already normalized: null for CI/merge/harness-managed).
 *   Falls back to the dispatch-time `currentRunAttribution`, then to the
 *   stage slot, so the persisted report names the model that actually ran.
 * @param {string} [args.outcome.failureKind] - Failure taxonomy kind.
 * @param {string} [args.outcome.failureReason] - Failure message.
 * @param {string} [args.outcome.duration] - Run duration seconds.
 * @param {string} [args.outcome.runnerId] - Reporting Runner.
 * @returns {Promise<Object>} `{ advanced, status, ... }`.
 ***/
export async function applyRunnerReport({
	store,
	projectStore,
	projectId,
	taskId,
	outcome,
}) {
	const task = store.getTask(projectId, taskId);
	if (!task) {
		const err = new Error(`Task ${taskId} not found`);
		err.statusCode = 404;
		err.code = "TASK_NOT_FOUND";
		throw err;
	}
	const project = projectStore?.getProject?.(projectId);
	// The runner's completion payload (final assistant text, summaries) is
	// committed to the repository via stage reports and task markdown — the
	// same guarantee as the live log path: redact before persistence.
	// Structured log entries ingested live are already redacted at creation.
	const redactedOutput = redactSecretsText(outcome.output || "");
	const redactedSummary = redactSecretsText(outcome.summary || "");
	const stages = resolveStagesForTask(project, task);
	const stage =
		stages.find(
			(s) =>
				String(s.id) === String(task.currentStageId) ||
				(s.name &&
					String(s.name).toLowerCase() ===
						String(task.currentStageId).toLowerCase()),
		) ||
		stages[0] || { id: "stage", name: "Stage", type: "agent" };
	const stageType = normalizeStageType(stage.type);
	const bridge = store.eventBridge;
	const cwd = project?.cwd;
	const via = outcome.runnerId ? `via Runner ${outcome.runnerId}` : "via Runner";
	const duration = outcome.duration || "0.0";
	// The served model for the persisted report: the Runner's explicit report
	// wins, then the dispatch-time stamp (what the Runner was matched on),
	// then the stage slot. Blank/"default" values are absent, never worded —
	// scripted stages record no model at all.
	const dispatchAttribution =
		task.currentRunAttribution &&
		String(task.currentRunAttribution.stageId) === String(task.currentStageId)
			? task.currentRunAttribution
			: null;
	const cleanRef = (value) =>
		typeof value === "string" && value.trim() && value.trim().toLowerCase() !== "default"
			? value.trim()
			: null;
	// The stage slot is a last-resort fallback only: on an alias-harness
	// stage `stage.model` is the ALIAS NAME, not a model, so it must never be
	// recorded as the run's modelRef.
	const stageHarnessIsAlias =
		String(stage.harness ?? project?.harness ?? "") === ALIAS_HARNESS_ID;
	const reportModelRef =
		cleanRef(outcome.modelRef) ??
		cleanRef(dispatchAttribution?.modelRef) ??
		(stageHarnessIsAlias ? null : cleanRef(stage.model));
	const reportAliasName = cleanRef(dispatchAttribution?.aliasName);
	const reportTargetIndex = Number.isInteger(dispatchAttribution?.targetIndex)
		? dispatchAttribution.targetIndex
		: null;

	if (outcome.status === "failed") {
		const err = new Error(outcome.failureReason || "Stage failed on the Runner");
		// The runner's completion payload carries the tail of the run output
		// (runner/daemon.js caps it). Keep it on the error so the failure
		// report renders the actual failing output instead of only the
		// reason — thin "exit code 1" reports hid every branch result
		// (task b5716327). handleStageFailure already renders error.stdout
		// into the report, lastError, and timeline excerpt.
		if (redactedOutput) err.stdout = redactedOutput;
		return routeStageError(
			store,
			projectId,
			taskId,
			stage,
			err,
			{
				stages,
				bridge,
				projectCwd: cwd,
				runOutcome: {
					harnessId: outcome.harnessId,
					// The served model/alias names the failed run on its
					// timeline row too (blank for scripted stages).
					modelRef: reportModelRef,
					aliasName: reportAliasName,
					targetIndex: reportTargetIndex,
					failureKind: outcome.failureKind,
				},
				classifyAs: {
					failureKind: outcome.failureKind,
					failureReason: outcome.failureReason,
				},
			},
		);
	}

	const at = Date.now();
	recordReliabilitySample(store, projectId, taskId, {
		harnessId: outcome.harnessId || "unknown",
		failureKind: "none",
		at,
		atRaw: new Date(at).toISOString(),
		stageId: stage.id,
	});
	bridge?.emitSystemLog?.(
		projectId,
		`[SYSTEM] Stage '${stage.name || stage.id}' completed in ${duration}s (${via})`,
		{ taskId, stageId: stage.id, duration },
	);

	if (stageWantsReport(stage)) {
		const reportContent = generateStageReportContent({
			task,
			stage,
			output: redactedOutput,
			summary: redactedSummary,
			modifiedFiles: outcome.modifiedFiles || [],
			status: "PASSED",
			duration,
		});
		store.saveStageReport(projectId, taskId, {
			stageName: stage.name || stage.id,
			stageId: stage.id,
			duration: stageElapsedSeconds(task),
			status: "PASSED",
			content: reportContent,
			projectCwd: cwd,
			harnessId: outcome.harnessId,
			failureKind: outcome.failureKind || "none",
			// The served model/alias the run actually used (Runner-reported,
			// else the dispatch stamp) — absent for scripted stages, so their
			// reports and cards never name a model.
			modelRef: reportModelRef,
			aliasName: reportAliasName,
			targetIndex: reportTargetIndex,
		});
	}

	task.history.push({
		timestamp: new Date().toISOString(),
		action: `Agent stage completed: ${stage.name || stage.id} (${via})`,
	});
	store._saveTaskMarkdown(cwd, task);

	const surveyPark = parkTaskForSurvey({
		store,
		projectId,
		taskId,
		task,
		stage,
		projectObj: project,
		cwd,
		bridge,
		stageType,
		finalOutput: redactedOutput,
		streamedOutput: redactedOutput,
		summary: redactedSummary,
		modifiedFiles: outcome.modifiedFiles || [],
		duration,
		via,
	});
	if (surveyPark.parked) return { advanced: false, ...surveyPark.response };

	task.surveyPending = false;
	task.infraRetryCount = 0;
	store.advanceStage(projectId, taskId, stages, bridge, cwd);

	store.lastCompletedTask = { projectId, taskId, timestamp: Date.now() };
	if (store.schedulerRunning) {
		setTimeout(() => {
			store.scheduleTick().catch(() => {});
		}, 50);
	}

	return {
		advanced: true,
		task,
		stageType,
		status: "passed",
		output: redactedOutput,
		summary: redactedSummary,
		modifiedFiles: outcome.modifiedFiles || [],
		// The served model that actually ran (Runner-reported > dispatch
		// stamp > stage slot), not just the configured slot.
		model: reportModelRef,
		duration,
	};
}
