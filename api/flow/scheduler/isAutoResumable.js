import { isAutoResumableWithReason } from './isAutoResumableWithReason.js';

/***
 * MARK: isAutoResumable
 * @description Whether an `interrupted` task may be picked back up without a
 *   human resume. Agent/CI/script stages are safe to re-dispatch (each stage
 *   run starts a brand-new session and re-reads durable state, including a
 *   ci stage whose command runs the deploy script); merge stages qualify
 *   only with a rehydration marker (see `isAutoResumableWithReason`); human
 *   stages, paused stages, and blocked tasks never auto-resume past their
 *   checkpoint.
 * @param {Object} task
 * @param {Object} stage - Resolved current stage (may be null when unknown).
 * @param {Object} [opts]
 * @param {boolean} [opts.blocked] - Whether the task is currently blocked.
 * @returns {boolean}
 * @example isAutoResumable({ status: "interrupted" }, { type: "agent" }) => true
 ***/
export function isAutoResumable(task, stage, { blocked = false } = {}) {
	return isAutoResumableWithReason(task, stage, { blocked }).resumable;
}
