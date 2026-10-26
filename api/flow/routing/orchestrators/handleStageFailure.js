import {
	isBranchModeEnabled,
} from "../../../work/index.js";
import {
	_appendProcessLog,
	generateStageReportContent,
} from "../../../watch/index.js";
import {
	emitAlert,
	maybeEmitFailbackWarning,
	resolveAlertSeverity,
} from "../../../observability/alerts.js";
import {
	isTerminalTaskStatus,
	stageElapsedSeconds,
} from "../../stagePolicy.js";
import {
	consumeStallHandled,
} from "../../stageHeartbeat.js";
import {
	isTripped,
} from "../../circuitBreaker.js";
import {
	recordCircuitFailure,
} from "../../circuitSensors.js";
import {
	buildTimelineAttribution,
} from "../../runAttribution.js";
import {
	beginAutoIteration,
	classificationMetaOf,
	excerptLog,
	fireStageErrorPush,
	gitDiagnosticsOf,
	resolveFailureProject,
	resolveStageErrorPushReason,
} from '../resolvers/index.js';
import { settleOperatorAbort } from './settleOperatorAbort.js';
import { deferForCircuitTrip } from './deferForCircuitTrip.js';
import { shouldSuppressProjectBlockerAlert } from './shouldSuppressProjectBlockerAlert.js';
import { parkedAlertStructuredFields } from './parkedAlertStructuredFields.js';
import { handleTransientFailure } from './handleTransientFailure.js';

/***
 * MARK: handleStageFailure
 * @description Handles stage execution failure: logs error, generates failure report, emits events, and routes to fallback stage.
 * @param {Object} taskStore - TaskStore instance.
 * @param {string} projectId
 * @param {string} taskId
 * @param {Object} stage
 * @param {Error|string} error
 * @param {Object} [opts]
 * @param {Array<Object>} [opts.stages]
 * @param {Object} [opts.bridge]
 * @param {string} [opts.projectCwd]
 * @param {string} [opts.fallbackStageId]
 * @param {boolean} [opts.skipFailback=false]
 * @param {boolean} [opts.compactionHint=false] - Context-overflow routing:
 *   fail back (never instant-park) so the next attempt can compact the
 *   prompt/history instead of retrying the identical overflowing context.
 * @param {Object} [opts.project] - Explicit project for budget resolution (else the store lookup).
 * @param {string} [opts.harnessId] - Harness that ran the failed stage (reliability attribution; recorded on the failure report when present).
 * @param {string} [opts.failureKind] - Runner outcome kind ("rejected" or "infrastructure"); recorded on the failure report and on task.lastError when known, so the task view can label deliberate rejections instead of generic failures.
 * @param {string} [opts.aliasName] - Model alias the failed run resolved through (per-alias reliability attribution).
 * @param {string} [opts.modelRef] - Concrete model the alias target dispatched.
 * @param {number} [opts.targetIndex] - Weighted-target index of the alias pick (informational).
 * @returns {Object} Failure result.
  * @example handleStageFailure(store, "p1", "t1", stage, err, {}) => { status: "parked", … }
 ***/
export function handleStageFailure(
	taskStore,
	projectId,
	taskId,
	stage,
	error,
	opts = {},
) {
	const {
		stages = [],
		bridge = taskStore.eventBridge,
		projectCwd,
		fallbackStageId,
		skipFailback = false,
		compactionHint = false,
		harnessId,
		failureKind,
		aliasName,
		modelRef,
		targetIndex,
	} = opts;
	const failureProject = resolveFailureProject(taskStore, projectId, opts);
	const task = taskStore.getTask(projectId, taskId);
	if (!task) return null;
	// WP6 watchdog de-duplication: the stall watchdog already terminated this
	// run and routed it through `handleTransientFailure` with `{ stall: true }`.
	// The terminated child settles with a non-zero exit and would otherwise
	// fail back immediately after the transient retry; suppress that duplicate
	// exactly once.
	if (consumeStallHandled(taskStore, taskId)) {
		return {
			task,
			stageType: stage?.type || "agent",
			status: "stalled",
			message:
				"Stage stall already handled by the watchdog; duplicate failure routing suppressed",
		};
	}
	// Single taxonomy, classified once per failure for auditability.
	const { classification, classificationMeta } = classificationMetaOf(error);
	// Context overflow never parks instantly: it fails back so the next
	// attempt compacts the prompt/history. An explicit compactionHint opts in
	// even when the caller parked unrecoverable errors by default.
	const compactionHintEffective =
		compactionHint === true || classification.signal === "context-overflow";
	const effectiveSkipFailback =
		compactionHint === true ? false : skipFailback;
	// A failure settling after the operator finished the task (complete,
	// fail/park, cancel) must not resurrect it via failback or auto-retry.
	if (isTerminalTaskStatus(task.status)) {
		return {
			task,
			stageType: stage?.type || "agent",
			status: task.status,
			message: `Task is already ${task.status}; failure ignored`,
		};
	}
	// A run aborted by pause settles here: the pause must stick, so neither
	// failback nor auto-retry may move the task back into the queue.
	if (String(task.status).toLowerCase() === "paused") {
		return {
			task,
			stageType: stage?.type || "agent",
			status: "paused",
			message: "Task is paused; failure does not fail back",
		};
	}
	// A run superseded by an operator move settles here: the move already
	// parked the task at its destination, so the orphaned run's outcome must
	// not be attributed to the new stage. Command stages surface the kill as
	// a plain non-zero exit (no operator-abort marker), which would otherwise
	// fail back with a spurious failureReason and auto-retry, undoing the
	// move (task 072e2cfa). Match on the recorded stage so only that orphaned
	// run is quieted; the marker is consumed either way so a later genuine
	// failure in the destination stage routes normally. An unknown failing
	// stage (null) is treated as the orphaned run: the operator's explicit
	// move sticks, and the task parks at its destination where a retry is
	// always available — failing safe toward operator intent, never toward
	// an automatic failback that would undo it.
	if (task.supersededStageId != null) {
		const superseded = String(task.supersededStageId);
		const failingId = stage?.id != null ? String(stage.id) : null;
		const currentId =
			task.currentStageId != null ? String(task.currentStageId) : null;
		delete task.supersededStageId;
		if (
			currentId !== superseded &&
			(failingId === null || failingId === superseded)
		) {
			return settleOperatorAbort(taskStore, projectId, taskId, stage, error, {
				bridge,
				projectCwd,
			});
		}
	}

	// An operator-initiated abort carries no actionable failure: settle
	// quietly without failback, retry, or budget, whatever the status.
	if (classification.kind === "operator-abort") {
		return settleOperatorAbort(taskStore, projectId, taskId, stage, error, {
			bridge,
			projectCwd,
		});
	}

	// Tier-5 gate: record the failure against the trip sensors first (this
	// call may itself trip the engine), then quiet-defer instead of failing
	// back, auto-retrying, or burning any budget while containment holds.
	recordCircuitFailure(taskStore, { taskId, error, failureKind });
	if (isTripped(taskStore)) {
		const deferral = deferForCircuitTrip(taskStore, projectId, taskId, stage, error, {
			bridge,
			projectCwd,
			failureKind,
		});
		if (deferral && !deferral.continueNormalHandling) return deferral;
	}

	// A task parked as interrupted by an engine stop keeps that state so
	// resume/retry starts clean: genuine failures are recorded for feedback
	// but never move the task or spend iteration budget by themselves.
	const wasInterrupted = String(task.status).toLowerCase() === "interrupted";

	const errorMsg =
		typeof error === "string"
			? error
			: error?.message || "Stage execution failed";
	const cwd = taskStore._resolveProjectCwd(projectId, projectCwd);
	const stageType = stage?.type || "agent";
	const stderrText = error?.stderr ? String(error.stderr).trim() : "";
	const stdoutText = error?.stdout ? String(error.stdout).trim() : "";
	task.failureReason = errorMsg;
	task.lastError = {
		message: errorMsg,
		stageId: stage?.id,
		stageName: stage?.name || stage?.id,
		stageType,
		stderr: stderrText,
		stdout: stdoutText,
		...(failureKind ? { failureKind } : {}),
		...(gitDiagnosticsOf(error) ? { gitDiagnostics: gitDiagnosticsOf(error) } : {}),
		classification: classificationMeta,
		...(compactionHintEffective ? { compactionHint: true } : {}),
		timestamp: new Date().toISOString(),
	};
	if (!Array.isArray(task.history)) {
		task.history = [];
	}
	task.history.push({
		timestamp: new Date().toISOString(),
		action: `Stage failed in '${stage?.name || stage?.id || "unknown"}': ${errorMsg}`,
	});
	_appendProcessLog(task, `[ERROR] ${errorMsg}`);
	taskStore._saveTaskMarkdown(cwd, task);

	const failureDuration = stageElapsedSeconds(task);
	// Timeline attribution for the failed run: the resolved harness/model/
	// alias this attempt dispatched through, straight from the routing opts
	// (never a second resolution). A failure with no attribution (command
	// stages, pre-contract runs) spreads nothing — the row stays blank by
	// omission, never placeholder-worded.
	const runAttribution = buildTimelineAttribution({
		harnessId,
		aliasName,
		modelRef,
		targetIndex,
	});
	taskStore._recordTimelineWithDiffStat(
		task,
		{
			stage: stage?.name || stage?.id || task.currentStageId,
			status: "Failed",
			duration: failureDuration === undefined ? "--" : `${failureDuration}s`,
			durationSeconds: failureDuration,
			durationStageId: stage?.id || task.currentStageId,
			durationStartedAt: task.enteredStageAt,
			timestamp: new Date().toISOString(),
			reason: errorMsg,
			stageId: stage?.id,
			stageName: stage?.name || stage?.id,
			classification: classificationMeta,
			...(compactionHintEffective ? { compactionHint: true } : {}),
			...(stderrText ? { stderr: excerptLog(stderrText) } : {}),
			...(stdoutText ? { stdout: excerptLog(stdoutText) } : {}),
			...(runAttribution || {}),
		},
		cwd,
		{ useBranches: isBranchModeEnabled(taskStore.projectStore, projectId) },
	);
	const failureReport = generateStageReportContent({
		task,
		stage,
		output: error?.stdout || errorMsg,
		summary: `Execution failed: ${errorMsg}`,
		status: "FAILED",
		duration: stageElapsedSeconds(task),
		error: errorMsg,
	});

	taskStore.saveStageReport(projectId, taskId, {
		stageName: stage?.name || stage?.id || "Stage",
		stageId: stage?.id,
		duration: stageElapsedSeconds(task),
		status: "FAILED",
		content: failureReport,
		projectCwd: cwd,
		harnessId,
		failureKind,
		aliasName,
		modelRef,
		targetIndex,
		// Failure traces keep the `-failure-` filename infix so they stay
		// distinguishable from opt-in success reports in the docs folder.
		failure: true,
	});

	// The user-facing error toast is NOT emitted here: at this point routing
	// does not know yet whether the failure auto-retries or fails back into
	// continued work. Toasting unconditionally pages the operator for
	// failures that recover on their own. The toast fires below, only when
	// the task actually parks without automatic recovery.
	bridge?.emitSystemLog?.(
		projectId,
		`[CLASSIFY] Stage '${stage?.name || stage?.id}' error on task #${task.id?.slice(0, 4)}: kind=${classificationMeta.kind} signal=${classificationMeta.signal} retryable=${classificationMeta.retryable}`,
		{ taskId, stageId: stage?.id, classification: classificationMeta },
	);
	bridge?.emitSystemLog?.(
		projectId,
		`[ERROR] Stage '${stage?.name || stage?.id}' failed on task #${task.id?.slice(0, 4)}: ${errorMsg}`,
		{ taskId, stageId: stage?.id, error: errorMsg, classification: classificationMeta },
	);

	bridge?.emitProcessEvent?.(projectId, "process:stderr", {
		taskId,
		chunk: errorMsg,
		projectName: projectId,
	});
	bridge?.emitProcessEvent?.(projectId, "process:exit", {
		taskId,
		stageId: stage?.id,
		exitCode: typeof error?.code === "number" ? error.code : 1,
		status: "failed",
		error: errorMsg,
		projectName: projectId,
	});

	if (!effectiveSkipFailback && !wasInterrupted) {
		const fallbackTarget =
			fallbackStageId || stage?.fallbackStageId || stage?.failback;
		bridge?.emitProcessEvent?.(projectId, "stage:failback", {
			taskId,
			fromStageId: stage?.id,
			targetStageId: fallbackTarget || task.currentStageId,
			error: errorMsg,
			projectName: projectId,
			classification: classificationMeta,
			...(compactionHintEffective ? { compactionHint: true } : {}),
		});

		taskStore.failbackStage(projectId, taskId, stages, fallbackTarget, bridge, cwd);

		task.failureReason = errorMsg;
		task.lastError = {
			message: errorMsg,
			stageId: stage?.id,
			stageName: stage?.name || stage?.id,
			stageType,
			stderr: stderrText,
			stdout: stdoutText,
			...(failureKind ? { failureKind } : {}),
			...(gitDiagnosticsOf(error) ? { gitDiagnostics: gitDiagnosticsOf(error) } : {}),
			classification: classificationMeta,
			...(compactionHintEffective ? { compactionHint: true } : {}),
			timestamp: new Date().toISOString(),
		};
	}

	const autoIteration =
		effectiveSkipFailback || wasInterrupted
			? null
			: beginAutoIteration(task, stage, errorMsg, failureProject);
	if (autoIteration) {
		// Early warning before the budget runs out: edge-triggered per
		// threshold, detached so a dead sink never slows the retry.
		void maybeEmitFailbackWarning(bridge, {
			projectId,
			task,
			stage,
			attempt: task.autoIterationCount,
			maxAttempts: autoIteration.maxAttempts,
			error: errorMsg,
		});
		taskStore._saveTaskMarkdown(cwd, task);
		const targetStage = stages.find(
			(s) =>
				String(s.id) === String(task.currentStageId) ||
				(s.name &&
					String(s.name).toLowerCase() ===
						String(task.currentStageId).toLowerCase()),
		);
		bridge?.emitProcessEvent?.(projectId, "stage:auto_retry", {
			taskId,
			fromStageId: stage?.id,
			targetStageId: task.currentStageId,
			targetStageName: targetStage?.name || task.currentStageId,
			attempt: task.autoIterationCount,
			maxAttempts: autoIteration.maxAttempts,
			error: errorMsg,
			projectName: projectId,
		});
		bridge?.emitSystemLog?.(
			projectId,
			`[AUTO] Stage '${stage?.name || stage?.id}' failed on task #${task.id?.slice(0, 4)}; auto-retrying at '${targetStage?.name || task.currentStageId}' (attempt ${task.autoIterationCount}/${autoIteration.maxAttempts}): ${errorMsg}`,
			{ taskId, stageId: stage?.id, error: errorMsg },
		);
		if (taskStore.schedulerRunning) {
			setTimeout(() => {
				taskStore.scheduleTick().catch(() => {});
			}, 2000);
		}
		return {
			task,
			stageType,
			status: "retrying",
			error: errorMsg,
			failureReason: errorMsg,
			autoIteration: true,
			attempt: task.autoIterationCount,
			maxAttempts: autoIteration.maxAttempts,
			exitCode: typeof error?.code === "number" ? error.code : 1,
		};
	}

	const parkedFrom = wasInterrupted ? "interrupted" : task.status;
	if (!wasInterrupted) {
		task.status = "failed";
	}
	taskStore._saveTaskMarkdown(cwd, task);

	// Human-intervention push: the task is parked and auto-recovery cannot
	// proceed (unrecoverable error, exhausted budget, or failback-skipped
	// land). Normal CI failures that fail back, deliberate rejections, and
	// human-checkpoint parks stay silent. Best-effort: never breaks routing.
	if (!wasInterrupted) {
		// User-facing error toast: the task parked without automatic
		// recovery, so this genuinely needs the operator. Skipped for
		// auto-retries and failback continuations (those recover on their
		// own and surface their own retry/failback events).
		bridge?.emitNotification?.(projectId, {
			type: "error",
			title: `Stage "${stage?.name || stage?.id}" Failed`,
			message: errorMsg,
			taskId,
			stageId: stage?.id,
		});
		const pushReason = resolveStageErrorPushReason({
			task,
			parkedFrom,
			stage,
			error,
			failureKind,
			failureProject,
			skipFailback: effectiveSkipFailback,
		});
		if (pushReason) {
			fireStageErrorPush(taskStore, {
				projectId,
				taskId,
				stage,
				error: errorMsg,
				reason: pushReason,
			});
		}
		// Outbound alert: an unscheduled park is `failed`/`critical`, never
		// confused with a scheduled `waiting_human` checkpoint. Detached so
		// an unreachable sink settles the task identically. The WP2
		// classification (already computed for the timeline) supplies the
		// precise signal, so the payload and the audit trail cannot disagree.
		const parkedKind = classificationMeta.kind;
		const parkedSeverity = resolveAlertSeverity("failed", parkedKind);
		// Project-blocker dedupe (C3): one red shared gate parks N tasks, but
		// only the FIRST park per gate@sha emits the project-level alert —
		// later parks record the same reason in history/timeline without
		// re-alerting. Best-effort and in-memory (a restart may re-alert
		// once); never breaks routing.
		let suppressParkedAlert = false;
		try {
			suppressParkedAlert = shouldSuppressProjectBlockerAlert(
				taskStore,
				error?.projectBlocker?.key,
				{ taskId, projectId },
			);
		} catch {
			suppressParkedAlert = false;
		}
		if (parkedSeverity && !suppressParkedAlert) {
			void emitAlert(bridge, {
				event: "task.failed",
				severity: parkedSeverity,
				projectId,
				taskId,
				stage: { id: stage?.id, name: stage?.name || stage?.id, type: stageType },
				kind: parkedKind,
				signal: classificationMeta.signal,
				message: errorMsg,
				excerpt: excerptLog(
					[errorMsg, stderrText, stdoutText].filter(Boolean).join("\n"),
				),
				attemptCounts: {
					transient: task.infraRetryCount || 0,
					autoIteration: task.autoIterationCount || 0,
				},
				...parkedAlertStructuredFields(task, error),
			});
		}
	}

	return {
		task,
		stageType,
		status: task.status,
		error: errorMsg,
		failureReason: errorMsg,
		exitCode: typeof error?.code === "number" ? error.code : 1,
	};
}
