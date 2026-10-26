import {
	config,
} from "../../../config.js";
import {
	_appendProcessLog,
} from "../../../watch/index.js";
import {
	circuitSnapshot,
	isCanaryTask,
	recordCanaryFailure,
	resetEngine,
} from "../../circuitBreaker.js";
import {
	isInfraLikeFailure,
} from "../../circuitSensors.js";

/***
 * MARK: deferForCircuitTrip
 * @description Tier-5 quiet deferral: a stage failure that lands while the
 *   engine is tripped must NOT fail the task, fail back, auto-retry, or
 *   consume any transient/auto-iteration budget. The task keeps its status
 *   (`in_stage` stays; a `running_*` in-flight task returns to `in_stage`),
 *   no `failureReason`/`lastError` is written (so the next attempt's prompt
 *   is not poisoned), and history + process log carry the audit note.
 *
 *   The half-open canary is the one exception: its failure is the probe
 *   result, so it re-trips with escalated backoff (or, when
 *   `KAINBAIN_CIRCUIT_PROBE_FAILURE_RETRIPS=0` and the failure is purely
 *   logical, lifts the trip and signals the caller to continue normal
 *   failure handling).
 * @example deferForCircuitTrip(store, "p1", "t1", stage, err, {}) => { deferred: "tripped" }
 * @param {Object} taskStore
 * @param {string} projectId
 * @param {string} taskId
 * @param {Object} stage
 * @param {*} error
 * @param {Object} [opts]
 * @param {Object} [opts.bridge]
 * @param {string} [opts.projectCwd]
 * @param {string} [opts.failureKind]
 * @returns {Object|null} `{ continueNormalHandling: true }` when the caller should proceed normally.
 ***/
export function deferForCircuitTrip(
	taskStore,
	projectId,
	taskId,
	stage,
	error,
	{ bridge = taskStore.eventBridge, projectCwd, failureKind } = {},
) {
	const task = taskStore.getTask(projectId, taskId);
	if (!task) return null;
	const stageLabel = stage?.name || stage?.id || "unknown";
	const canary = isCanaryTask(taskStore, taskId);

	// Half-open probe outcome. A logical (non-infrastructure) canary failure
	// proves the shared infrastructure is back, so when the operator opted
	// out of conservative re-trips the containment lifts and this failure is
	// handled normally.
	if (
		canary &&
		config.circuitProbeFailureRetrips === false &&
		!isInfraLikeFailure(error, { failureKind })
	) {
		resetEngine(taskStore, {
			reason:
				"half-open canary failed on a logical error; shared infrastructure considered healthy",
			source: "auto:probe",
		});
		return { continueNormalHandling: true };
	}

	const snapshot = circuitSnapshot(taskStore);
	const cwd = taskStore._resolveProjectCwd(projectId, projectCwd);

	// Quiet settle: a run left in a running_* state with no live execution
	// behind it returns to the pre-dispatch state; claimed states
	// (interrupted/paused/in_stage) are preserved exactly.
	if (String(task.status || "").startsWith("running_")) {
		task.status = "in_stage";
		task.wasInterrupted = false;
	}
	task.autoRetrying = false;
	if (!Array.isArray(task.history)) {
		task.history = [];
	}
	task.history.push({
		timestamp: new Date().toISOString(),
		action: `Stage '${stageLabel}' deferred by engine circuit trip (${snapshot.source || "manual"}) — task not failed, retry budgets preserved`,
	});
	_appendProcessLog(
		task,
		`[CIRCUIT] Stage '${stageLabel}' deferred by engine trip — no retry budget consumed. Reason: ${snapshot.reason || "systemic failure"}`,
	);
	taskStore._saveTaskMarkdown(cwd, task);
	bridge?.emitSystemLog?.(
		projectId,
		`[CIRCUIT] Stage '${stageLabel}' on task #${task.id?.slice(0, 4)} deferred by engine trip; budgets preserved, task stays ${task.status}`,
		{ taskId, stageId: stage?.id },
	);

	if (canary) {
		recordCanaryFailure(taskStore, {
			reason: snapshot.reason || "half-open canary probe failed",
			source: "auto:probe",
		});
	}

	return {
		task,
		stageType: stage?.type || "agent",
		status: task.status,
		message: "Dispatch deferred by engine circuit trip",
		deferred: "tripped",
		circuit: circuitSnapshot(taskStore),
		exitCode: typeof error?.code === "number" ? error.code : 1,
	};
}
