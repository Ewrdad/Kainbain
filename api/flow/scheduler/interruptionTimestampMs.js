/***
 * MARK: interruptionTimestampMs
 * @description Millis for "oldest interruption first" ordering. Garbage or
 *   missing timestamps collapse to 0 (the epoch) instead of NaN so a corrupt
 *   date can never poison the sort and starve every other task.
 * @param {Object} task
 * @returns {number}
 * @example interruptionTimestampMs({ updatedAt: "2026-09-24T10:00:00.000Z" }) => 1790244000000
 ***/
export function interruptionTimestampMs(task) {
	const parsed = new Date(
		task?.updatedAt || task?.enteredStageAt || 0,
	).getTime();
	return Number.isFinite(parsed) ? parsed : 0;
}
