/***
 * MARK: isRunnerDispatchFallbackDue
 * @description Whether a runner-deferred task has waited past the embedded
 *   fallback ceiling and should run in-process instead of staying queued
 *   for a busy or incapable fleet. Returns false when the fallback is
 *   disabled (configuredMs <= 0) or the task has no usable enteredAt.
 *   Used by the `executeStage` defer gate so runner-only mode cannot
 *   starve tasks that no active runner can claim in time — the backend
 *   must be the safety net behind the fleet (task 16d6fbd6).
 * @param {Object} task - Task record (enteredStageAt / updatedAt).
 * @param {number} configuredMs - Fallback ceiling in ms (from config).
 * @param {number} [now] - Clock in ms since epoch (tests).
 * @returns {boolean} True when fallback is due.
 * @example isRunnerDispatchFallbackDue({ enteredStageAt: '2026-11-10T00:00:00Z' }, 90000, Date.now()) => true
 ***/
export function isRunnerDispatchFallbackDue(task, configuredMs, now = Date.now()) {
	if (typeof configuredMs !== "number" || !Number.isFinite(configuredMs) || configuredMs <= 0) return false;
	const ts = task?.enteredStageAt || task?.updatedAt || null;
	if (!ts) return false;
	const enteredMs = new Date(ts).getTime();
	if (!Number.isFinite(enteredMs)) return false;
	return now - enteredMs >= configuredMs;
}
