import {
	config,
} from "../../../config.js";
import {
	_appendProcessLog,
} from "../../../watch/index.js";
import {
	emitAlert,
	resolveAlertSeverity,
	resolveErrorClassification,
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
	classificationMetaOf,
	computeRetryDelay,
	excerptLog,
	fireStageErrorPush,
	resolveFailureProject,
	resolveRetryable,
	resolveTransientBudget,
} from '../resolvers/index.js';
import { settleOperatorAbort } from './settleOperatorAbort.js';
import { deferForCircuitTrip } from './deferForCircuitTrip.js';
import { handleStageFailure } from './handleStageFailure.js';
import { recordTransientAttemptReport } from './recordTransientAttemptReport.js';

/***
 * MARK: handleTransientFailure
 * @description Handles transient infrastructure failures by retrying the SAME stage instead of failback routing.
 * @param {Object} taskStore - TaskStore instance.
 * @param {string} projectId
 * @param {string} taskId
 * @param {Object} stage
 * @param {Error|string} error
 * @param {Object} [opts]
 * @param {Object} [opts.bridge]
 * @param {string} [opts.projectCwd]
 * @param {string} [opts.harnessId] - Harness that ran the failed attempt (reliability attribution; a FAILED report is recorded only when present with the infrastructure kind).
 * @param {string} [opts.failureKind] - Runner outcome kind (must be "infrastructure" for the attempt report).
 * @param {string} [opts.aliasName] - Model alias the failed attempt resolved through (per-alias reliability attribution).
 * @param {string} [opts.modelRef] - Concrete model the alias target dispatched.
 * @param {number} [opts.targetIndex] - Weighted-target index of the alias pick (informational).
 * @param {Object} [opts.retryDelay] - Per-call delay overrides (`baseMs`, `capMs`, `jitterMs`, `strategy`; WP10 fault-injection seam).
 * @param {Function} [opts.retryRand] - Injectable uniform [0,1) source for jitter (deterministic tests; default `Math.random`).
 * @returns {Object} Retry or parked-failure result.
  * @example handleTransientFailure(store, "p1", "t1", stage, err, {}) => { status: "in_stage", … }
 ***/
export function handleTransientFailure(
	taskStore,
	projectId,
	taskId,
	stage,
	error,
	opts = {},
) {
	const {
		bridge = taskStore.eventBridge,
		projectCwd,
		harnessId,
		failureKind,
		aliasName,
		modelRef,
		targetIndex,
		retryDelay,
		retryRand,
	} = opts;
	const failureProject = resolveFailureProject(taskStore, projectId, opts);
	const task = taskStore.getTask(projectId, taskId);
	if (!task) return null;
	// WP6 watchdog de-duplication: see `handleStageFailure`. The watchdog's own
	// routing runs BEFORE the marker is set, so this only suppresses the
	// duplicate emitted by the terminated in-flight run.
	if (consumeStallHandled(taskStore, taskId)) {
		return {
			task,
			stageType: stage?.type || "agent",
			status: task.status,
			message:
				"Stage stall already handled by the watchdog; duplicate transient routing suppressed",
		};
	}
	const { classification, classificationMeta } = classificationMetaOf(error);
	// A transient error settling after the task finished must not flip it
	// back to in_stage for another retry.
	if (isTerminalTaskStatus(task.status)) {
		return {
			task,
			stageType: stage?.type || "agent",
			status: task.status,
			message: `Task is already ${task.status}; transient failure ignored`,
		};
	}
	// Same for a paused task: no retry flip, no budget consumed.
	if (String(task.status).toLowerCase() === "paused") {
		return {
			task,
			stageType: stage?.type || "agent",
			status: "paused",
			message: "Task is paused; transient failure does not retry",
		};
	}

	// An operator-initiated abort carries no actionable failure: settle
	// quietly without retry or budget, whatever the status.
	if (classification.kind === "operator-abort") {
		return settleOperatorAbort(taskStore, projectId, taskId, stage, error, {
			bridge,
			projectCwd,
		});
	}

	// Tier-5 gate: record the infrastructure failure against the trip sensors
	// (this call may itself trip the engine), then quiet-defer instead of
	// incrementing `infraRetryCount` or flipping the task back to `in_stage`.
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
	// resume/retry starts clean: record the failure for feedback but never
	// flip it back to in_stage or spend retry budget by itself.
	if (String(task.status).toLowerCase() === "interrupted") {
		const interruptedMsg =
			typeof error === "string" ? error : error?.message || "Transient infrastructure failure";
		const interruptedCwd = taskStore._resolveProjectCwd(projectId, projectCwd);
		task.failureReason = interruptedMsg;
		task.lastError = {
			message: interruptedMsg,
			stageId: stage?.id,
			stageName: stage?.name || stage?.id,
			stageType: stage?.type || "agent",
			classification: classificationMeta,
			timestamp: new Date().toISOString(),
		};
		task.autoRetrying = false;
		if (!Array.isArray(task.history)) {
			task.history = [];
		}
		task.history.push({
			timestamp: new Date().toISOString(),
			action: `Transient infrastructure error in '${stage?.name || stage?.id || "unknown"}' while interrupted: ${interruptedMsg} — awaiting resume/retry`,
		});
		taskStore._saveTaskMarkdown(interruptedCwd, task);
		return {
			task,
			stageType: stage?.type || "agent",
			status: "interrupted",
			message: "Task is interrupted; transient failure does not retry",
		};
	}

	const errorMsg =
		typeof error === "string"
			? error
			: error?.message || "Transient infrastructure failure";
	const cwd = taskStore._resolveProjectCwd(projectId, projectCwd);
	const stageType = stage?.type || "agent";
	const stageLabel = stage?.name || stage?.id || "unknown";
	const { maxAttempts, source: budgetSource } = resolveTransientBudget(stage, failureProject);
	task.infraRetryCount = (task.infraRetryCount || 0) + 1;
	const attempt = task.infraRetryCount;
	// WP3 retryable signal: the WP2 signal when infrastructure-classified,
	// otherwise the matched harness-blip signal (deny-listed errors never
	// reach this handler via resolveRetryable, but resolve it anyway so the
	// ladder always names what was matched).
	const retrySignal = resolveRetryable(error).signal || classificationMeta.signal;
	const budgetNote = `budget ${maxAttempts} from ${budgetSource === "stage" ? "stage.maxTransientRetries" : budgetSource === "project" ? "project.maxTransientRetries" : "global config"}`;
	if (!Array.isArray(task.transientRetryLadder)) {
		task.transientRetryLadder = [];
	}

	if (attempt > maxAttempts) {
		const ladderLines = task.transientRetryLadder.map(
			(entry) => `attempt ${entry.attempt}/${maxAttempts}: ${entry.delayMs}ms [${entry.signal}] ${entry.error}`,
		);
		const ladderText = ladderLines.length > 0 ? ` Retry ladder: ${ladderLines.join(" | ")}.` : "";
		task.failureReason = errorMsg;
		task.lastError = {
			message: errorMsg,
			stageId: stage?.id,
			stageName: stage?.name || stage?.id,
			stageType,
			classification: classificationMeta,
			transientBudget: { maxAttempts, source: budgetSource },
			retryLadder: [...task.transientRetryLadder],
			timestamp: new Date().toISOString(),
		};
		task.status = "failed";
		task.autoRetrying = false;
		if (!Array.isArray(task.history)) {
			task.history = [];
		}
		task.history.push({
			timestamp: new Date().toISOString(),
			action: `Stage '${stageLabel}' parked after ${maxAttempts} transient-failure retries (${budgetNote}): ${errorMsg}.${ladderText}`,
		});
		_appendProcessLog(
			task,
			`[ERROR] Stage '${stageLabel}' still unreachable after ${maxAttempts} retries (${budgetNote}); parked for human intervention. Last error: ${errorMsg}.${ladderText}`,
		);
		taskStore._recordTimelineWithDiffStat?.(
			task,
			{
				stage: stage?.name || stage?.id || task.currentStageId,
				status: "Failed",
				duration: stageElapsedSeconds(task) === undefined ? "--" : `${stageElapsedSeconds(task)}s`,
				timestamp: new Date().toISOString(),
				reason: `Transient retries exhausted (${attempt - 1}/${maxAttempts}, ${budgetNote}): ${errorMsg}.${ladderText}`,
				stageId: stage?.id,
				stageName: stage?.name || stage?.id,
				classification: classificationMeta,
				signal: retrySignal,
				maxAttempts,
				budgetSource,
				retryLadder: [...task.transientRetryLadder],
				...(buildTimelineAttribution({
					harnessId,
					aliasName,
					modelRef,
					targetIndex,
				}) || {}),
			},
			cwd,
		);
		recordTransientAttemptReport(
			taskStore,
			projectId,
			taskId,
			stage,
			errorMsg,
			`Transient infrastructure error persisted after ${maxAttempts} retries (${budgetNote}): ${errorMsg}.${ladderText}`,
			cwd,
			harnessId,
			failureKind,
			{ aliasName, modelRef, targetIndex },
		);
		taskStore._saveTaskMarkdown(cwd, task);
		// Transient budget exhausted: the stage is parked and cannot
		// auto-recover — this always needs a human. Best-effort hook.
		fireStageErrorPush(taskStore, {
			projectId,
			taskId,
			stage,
			error: errorMsg,
			reason: "transient_retries_exhausted",
		});
		// Outbound alert: persistent infrastructure exhaustion parks the task
		// for a human (`failed`/`critical`). Detached: a dead sink parks
		// the task exactly the same way. The kind is classified (not
		// hardcoded) so an operator abort that reaches this path settles
		// quietly instead of paging.
		const exhausted = resolveErrorClassification(error);
		const exhaustedSeverity = resolveAlertSeverity("failed", exhausted.kind);
		if (exhaustedSeverity) {
			void emitAlert(bridge, {
				event: "task.failed",
				severity: exhaustedSeverity,
				projectId,
				taskId,
				stage: { id: stage?.id, name: stage?.name || stage?.id, type: stageType },
				kind: exhausted.kind,
				signal: exhausted.signal,
				message: errorMsg,
				excerpt: excerptLog(errorMsg),
				attemptCounts: { attempt, maxAttempts },
			});
		}
		bridge?.emitNotification?.(projectId, {
			type: "error",
			title: `Stage "${stageLabel}" Unreachable`,
			message: `Gave up after ${maxAttempts} retries: ${errorMsg}`,
			taskId,
			stageId: stage?.id,
		});
		bridge?.emitSystemLog?.(
			projectId,
			`[ERROR] Stage '${stageLabel}' failed on task #${task.id?.slice(0, 4)} with a persistent infrastructure error after ${maxAttempts} retries; parked: ${errorMsg}`,
			{ taskId, stageId: stage?.id, error: errorMsg },
		);
		bridge?.emitProcessEvent?.(projectId, "process:exit", {
			taskId,
			stageId: stage?.id,
			exitCode: typeof error?.code === "number" ? error.code : 1,
			status: "failed",
			error: errorMsg,
			projectName: projectId,
		});
		return {
			task,
			stageType,
			status: "failed",
			error: errorMsg,
			failureReason: errorMsg,
			retrySameStage: true,
			attempt,
			maxAttempts,
			budgetSource,
			signal: retrySignal,
			retryLadder: [...task.transientRetryLadder],
			exitCode: typeof error?.code === "number" ? error.code : 1,
		};
	}

	const nextDelayMs = computeRetryDelay(attempt, retryDelay, retryRand);
	task.transientRetryLadder.push({
		attempt,
		delayMs: nextDelayMs,
		signal: retrySignal,
		error: errorMsg,
		timestamp: new Date().toISOString(),
	});
	task.failureReason = null;
	task.lastError = null;
	task.status = "in_stage";
	task.autoRetrying = true;
	if (!Array.isArray(task.history)) {
		task.history = [];
	}
	task.history.push({
		timestamp: new Date().toISOString(),
		action: `Transient infrastructure error in '${stageLabel}' (attempt ${attempt}/${maxAttempts}, ${budgetNote}, next delay ${nextDelayMs}ms, signal ${retrySignal}): ${errorMsg} — retrying same stage`,
	});
	_appendProcessLog(
		task,
		`[WARN] Transient infrastructure error in stage '${stageLabel}' (attempt ${attempt}/${maxAttempts}, ${budgetNote}, next delay ${nextDelayMs}ms, signal ${retrySignal}): ${errorMsg} — retrying same stage`,
	);
	taskStore._recordTimelineWithDiffStat?.(
		task,
		{
			stage: stage?.name || stage?.id || task.currentStageId,
			status: "Retrying",
			duration: stageElapsedSeconds(task) === undefined ? "--" : `${stageElapsedSeconds(task)}s`,
			timestamp: new Date().toISOString(),
			reason: `Transient error (attempt ${attempt}/${maxAttempts}, ${budgetNote}, next delay ${nextDelayMs}ms, signal ${retrySignal}): ${errorMsg} — retrying same stage`,
			stageId: stage?.id,
			stageName: stage?.name || stage?.id,
			classification: classificationMeta,
			signal: retrySignal,
			attempt,
			maxAttempts,
			nextDelayMs,
			budgetSource,
			...(buildTimelineAttribution({
				harnessId,
				aliasName,
				modelRef,
				targetIndex,
			}) || {}),
		},
		cwd,
	);
	recordTransientAttemptReport(
		taskStore,
		projectId,
		taskId,
		stage,
		errorMsg,
		`Transient infrastructure error (attempt ${attempt}/${maxAttempts}, ${budgetNote}, next delay ${nextDelayMs}ms, signal ${retrySignal}): ${errorMsg} — retrying same stage`,
		cwd,
		harnessId,
		failureKind,
		{ aliasName, modelRef, targetIndex },
	);
	taskStore._saveTaskMarkdown(cwd, task);
	bridge?.emitProcessEvent?.(projectId, "stage:retry", {
		taskId,
		stageId: stage?.id,
		stageName: stage?.name || stage?.id,
		sameStage: true,
		transient: true,
		attempt,
		maxAttempts,
		nextDelayMs,
		signal: retrySignal,
		budgetSource,
		error: errorMsg,
		projectName: projectId,
		classification: classificationMeta,
	});
	bridge?.emitSystemLog?.(
		projectId,
		`[RETRY] Stage '${stageLabel}' hit a transient infrastructure error on task #${task.id?.slice(0, 4)}; retrying same stage (attempt ${attempt}/${maxAttempts}, ${budgetNote}, next delay ${nextDelayMs}ms, signal ${retrySignal}): ${errorMsg}`,
		{ taskId, stageId: stage?.id, error: errorMsg, classification: classificationMeta, nextDelayMs, signal: retrySignal, budgetSource },
	);
	if (taskStore.schedulerRunning) {
		setTimeout(() => {
			taskStore.scheduleTick().catch(() => {});
		}, nextDelayMs);
	}
	return {
		task,
		stageType,
		status: "retrying",
		error: errorMsg,
		failureReason: errorMsg,
		autoIteration: true,
		retrySameStage: true,
		attempt,
		maxAttempts,
		nextDelayMs,
		budgetSource,
		signal: retrySignal,
		exitCode: typeof error?.code === "number" ? error.code : 1,
	};
}
