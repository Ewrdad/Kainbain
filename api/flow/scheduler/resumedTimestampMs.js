import { interruptionTimestampMs } from './interruptionTimestampMs.js';

/***
 * MARK: resumedTimestampMs
 * @description Millis for "oldest interruption first" ordering of
 *   startup-resumed tasks. Prefers the `interruptedAt` snapshot taken at
 *   resume time (the pre-flip `updatedAt`, which still orders by the
 *   original interruption) and falls back to `interruptionTimestampMs` so a
 *   missing or corrupt snapshot collapses to the epoch instead of NaN.
 * @param {Object} task
 * @returns {number}
 * @example resumedTimestampMs({ interruptedAt: "2026-09-24T10:00:00.000Z" }) => 1790244000000
 ***/
export function resumedTimestampMs(task) {
	if (task?.interruptedAt) {
		const parsed = new Date(task.interruptedAt).getTime();
		if (Number.isFinite(parsed)) return parsed;
	}
	return interruptionTimestampMs(task);
}
