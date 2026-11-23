import { resumeBackoffMs } from './resumeBackoff.js';

/***
 * MARK: resumeBackoffRemainingMs
 * @description How much of a task+stage's resume backoff is still left at
 *   `nowMs` (task 3b82f6ae): `resumeBackoffMs` minus the time elapsed since
 *   the task was last offered (`lastResumedAt` from the auto-resume flip,
 *   else the interruption/entry timestamps), floored at 0. 0 means the
 *   task may be re-dispatched now. The reference timestamp collapses to 0
 *   (the epoch) on garbage input — same policy as
 *   `interruptionTimestampMs` — which makes elapsed huge and the remaining
 *   delay 0, so a corrupt date can never park a task forever. Clock is
 *   injected, never read here, so tests pin exact boundaries.
 * @param {Object} task - Task carrying the resume-streak fields.
 * @param {string|null} stageId - Stage the candidate would resume into.
 * @param {number} [nowMs=Date.now()] - Clock in ms since epoch (tests inject).
 * @returns {number} Remaining backoff in ms (0 = dispatchable now).
 * @example resumeBackoffRemainingMs({ consecutiveResumes: 3, consecutiveResumeStage: "s1", lastResumedAt: "2026-09-24T10:00:00.000Z" }, "s1", Date.parse("2026-09-24T10:00:10.000Z")) => 20000
 * @example resumeBackoffRemainingMs({ consecutiveResumes: 3, consecutiveResumeStage: "s1", lastResumedAt: "2026-09-24T10:00:00.000Z" }, "s1", Date.parse("2026-09-24T10:01:00.000Z")) => 0
 ***/
export function resumeBackoffRemainingMs(task, stageId, nowMs = Date.now()) {
	const backoff = resumeBackoffMs(task, stageId);
	if (backoff <= 0) return 0;
	const now = Number.isFinite(nowMs) ? nowMs : Date.now();
	const raw =
		task?.lastResumedAt ||
		task?.interruptedAt ||
		task?.updatedAt ||
		task?.enteredStageAt ||
		0;
	const parsed = new Date(raw).getTime();
	const refMs = Number.isFinite(parsed) ? parsed : 0;
	return Math.max(0, backoff - (now - refMs));
}
