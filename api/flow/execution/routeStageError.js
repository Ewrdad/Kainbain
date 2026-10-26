import {
	classifyStageError,
} from '../../work/index.js';
import {
	resolveRetryable,
} from '../stageFailureRouting.js';
import {
	GitMergeConflictError,
} from '../../git.js';
import {
	commitFailedStageWork,
} from '../../work/taskFinalize.js';
import { withCompactionHint } from './withCompactionHint.js';

/***
 * MARK: routeStageError
 * @description THE single error-classification site for stage execution
 *   (WP2): every agent failure, branch-provisioning failure, and
 *   child-process exception in this module funnels through exactly one
 *   `classifyStageError` call, so Tier 2 (same-stage retry) vs Tier 3
 *   (failback) vs Tier 4 (park for human intervention) routing can never
 *   depend on call-site check order again. Network errors (ECONNREFUSED,
 *   ENOTFOUND, fetch failed) always retry; operator aborts settle quietly
 *   with zero budget consumed; context-window overflow fails back WITH
 *   prompt/history compaction hints instead of parking instantly; permanent
 *   auth/quota halts park without failback; logical failures fail back as
 *   actionable feedback for an earlier stage.
 * @example routeStageError(store, "p", "t", stage, new Error("503 boom"), {}) => (same-stage retry result)
 * @param {Object} store - TaskStore (handleTransientFailure/handleStageFailure/settleOperatorAbort).
 * @param {string} projectId
 * @param {string} taskId
 * @param {Object} stage
 * @param {Error|string|Object} error - The failure (agent result object when available).
 * @param {Object} [opts]
 * @param {Array<Object>} [opts.stages]
 * @param {Object} [opts.bridge]
 * @param {string} [opts.projectCwd]
 * @param {Object} [opts.runOutcome] - Runner attribution (`harnessId`, `failureKind`, alias fields) forwarded to failure routing.
 * @param {Error|string|Object} [opts.classifyAs] - Classification source when
 *   it differs from the routed error (the agent-failure path classifies the
 *   full runner result — carrying `failureKind` — but routes the derived
 *   agent Error so stored failure messages stay byte-identical).
 * @returns {Object} Failure routing result.
 ***/
export async function routeStageError(
	store,
	projectId,
	taskId,
	stage,
	error,
	{ stages = [], bridge, projectCwd, runOutcome = {}, classifyAs } = {},
) {
	// classifyStageError never throws (fail-safe to logical/unknown), so
	// routing below always has a classification to switch on.
	const classification = classifyStageError(classifyAs ?? error);
	const stageLabel = stage?.name || stage?.id || "unknown";
	try {
		bridge?.emitSystemLog?.(
			projectId,
			`[CLASSIFY] Stage '${stageLabel}' error: kind=${classification.kind} signal=${classification.signal} retryable=${classification.retryable}`,
			{
				taskId,
				stageId: stage?.id,
				classification: {
					kind: classification.kind,
					signal: classification.signal,
					retryable: classification.retryable,
				},
			},
		);
	} catch {
		// Decision logging is audit-only: a broken bridge must never change
		// Tier 2 vs Tier 3 vs Tier 4 routing.
	}
	if (classification.kind === "operator-abort") {
		return store.settleOperatorAbort(projectId, taskId, stage, error, {
			bridge,
			projectCwd,
		});
	}
	// Failure-path absorption guard (plan §2.2): best-effort auto-commit
	// of the failed attempt's partial work on the task branch BEFORE any
	// transient retry or failback routing, so the failed attempt owns its
	// own commit range and the next stage measures only its own work.
	// Merge-conflict trees are left untouched for the operator, and the
	// helper itself never throws — routing below always sees the original
	// failure unchanged.
	try {
		const failedTask = store.getTask(projectId, taskId);
		const isConflict =
			error instanceof GitMergeConflictError ||
			error?.name === "GitMergeConflictError";
		if (failedTask && !isConflict) {
			await commitFailedStageWork(store, failedTask, projectCwd, {
				stageName: stage?.name || stage?.id,
			});
		}
	} catch {
		// Best-effort: failure routing continues regardless.
	}
	// WP3 retryable class: WP2 `transient` infrastructure errors plus the
	// narrow harness-blip allowlist (malformed harness JSON, ephemeral
	// tool-execution errors). Deny-listed errors (auth, quota, operator
	// aborts) stay on the failback/park path via resolveRetryable.
	const retryable = resolveRetryable(classifyAs ?? error);
	if (retryable.retryable) {
		// A retryable classification means the attempt failed for
		// infrastructure or harness-blip reasons, so the attempt report
		// carries the `infrastructure` outcome kind unless the runner
		// already named one (the agent-result path forwards its own
		// `failureKind`). The thrown path passes only `harnessId`, so this
		// is what keeps a thrown timeout/connectivity blow-up counted
		// against the alias target instead of vanishing from the
		// reliability rate.
		return store.handleTransientFailure(projectId, taskId, stage, error, {
			bridge,
			projectCwd,
			...runOutcome,
			...(runOutcome.failureKind ? {} : { failureKind: "infrastructure" }),
		});
	}
	if (classification.signal === "context-overflow") {
		return store.handleStageFailure(
			projectId,
			taskId,
			stage,
			withCompactionHint(error),
			{
				stages,
				bridge,
				projectCwd,
				skipFailback: false,
				compactionHint: true,
				...runOutcome,
			},
		);
	}
	if (classification.kind === "unrecoverable") {
		return store.handleStageFailure(projectId, taskId, stage, error, {
			stages,
			bridge,
			projectCwd,
			skipFailback: true,
			...runOutcome,
		});
	}
	return store.handleStageFailure(projectId, taskId, stage, error, {
		stages,
		bridge,
		projectCwd,
		...runOutcome,
	});
}
