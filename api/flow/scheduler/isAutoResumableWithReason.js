import {
	normalizeStageType,
} from '../../projectStore.js';
import { hasContinuityHold } from './hasContinuityHold.js';
import { hasRehydrationMarkers } from './hasRehydrationMarkers.js';

/**
 * MARK: isAutoResumableWithReason
 * @description Reasoned form of the Rule 0 auto-resume policy. Agent/CI/
 *   script stages are safe to re-dispatch — including a ci stage whose
 *   command happens to run the deploy script, which is an ordinary ci
 *   stage; merge stages qualify ONLY when a rehydration marker proves the
 *   attempt is resumable-or-reconcilable (see `hasRehydrationMarkers`) —
 *   otherwise the exclusion reason names the missing evidence. Every
 *   exclusion carries its reason so startup recovery can record WHY a task
 *   stayed parked instead of leaving a silent `interrupted`.
 * @param {Object} task
 * @param {Object} stage - Resolved current stage (may be null when unknown).
 * @param {Object} [opts]
 * @param {boolean} [opts.blocked] - Whether the task is currently blocked.
 * @param {boolean} [opts.tripped] - Whether the engine circuit breaker is tripped.
 * @returns {{ resumable: boolean, reason: string }}
 * @example isAutoResumableWithReason({ status: "interrupted" }, { type: "agent" }) => { resumable: true, reason: "automated-stage" }
 ***/
export function isAutoResumableWithReason(task, stage, { blocked = false, tripped = false } = {}) {
	if (!task || typeof task !== "object") {
		return { resumable: false, reason: "unknown-task" };
	}
	if (task.status === "waiting_human") {
		return { resumable: false, reason: "waiting-human" };
	}
	if (task.status === "paused") {
		return { resumable: false, reason: "task-paused" };
	}
	if (task.status !== "interrupted") {
		return { resumable: false, reason: "not-interrupted" };
	}
	if (blocked) return { resumable: false, reason: "blocked" };
	if (tripped) return { resumable: false, reason: "engine-tripped" };
	if (hasContinuityHold(task)) return { resumable: false, reason: "continuity-hold" };
	if (!stage) return { resumable: false, reason: "unknown-stage" };
	if (stage?.paused === true) return { resumable: false, reason: "stage-paused" };
	// Normalized: legacy `script` reads as `ci`, `review` as `human`.
	const stageType = normalizeStageType(stage?.type);
	if (stageType === "agent" || stageType === "ci") {
		return { resumable: true, reason: "automated-stage" };
	}
	if (stageType === "human") {
		return { resumable: false, reason: "human-stage" };
	}
	if (stageType === "merge") {
		if (hasRehydrationMarkers(task)) {
			return { resumable: true, reason: `rehydratable-${stageType}` };
		}
		return { resumable: false, reason: "no-rehydration-markers" };
	}
	return { resumable: false, reason: "unsupported-stage-type" };
}
