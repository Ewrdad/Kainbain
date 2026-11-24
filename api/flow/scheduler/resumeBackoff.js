/***
 * MARK: RESUME_BACKOFF_THRESHOLD
 * @description Consecutive resumes of the same task+stage after which
 *   re-dispatch slows down (task 3b82f6ae, survey q2): the first resumes
 *   stay instant (one-off hiccups recover immediately), from this many
 *   consecutive resumes on the re-offer waits. Applies to ALL repeatedly
 *   resumed tasks, not just capacity refusals (survey q3), so reason-less
 *   interrupts from older runners are covered too.
 * @example RESUME_BACKOFF_THRESHOLD => 3
 ***/
export const RESUME_BACKOFF_THRESHOLD = 3;

/***
 * MARK: RESUME_BACKOFF_BASE_MS
 * @description First backoff delay once a task+stage reaches
 *   RESUME_BACKOFF_THRESHOLD consecutive resumes (task 3b82f6ae): 30s,
 *   doubling per further resume.
 * @example RESUME_BACKOFF_BASE_MS => 30000
 ***/
export const RESUME_BACKOFF_BASE_MS = 30_000;

/***
 * MARK: RESUME_BACKOFF_MAX_MS
 * @description Cap on the exponential resume backoff (task 3b82f6ae): 5
 *   minutes, so a repeatedly interrupted task is never starved forever —
 *   just slowed enough that a still-full runner cannot re-claim it within
 *   milliseconds.
 * @example RESUME_BACKOFF_MAX_MS => 300000
 ***/
export const RESUME_BACKOFF_MAX_MS = 5 * 60_000;

/***
 * MARK: resumeBackoffMs
 * @description Total re-dispatch delay for a task+stage given its
 *   consecutive-resume streak (task 3b82f6ae): 0 below
 *   RESUME_BACKOFF_THRESHOLD (or when the streak belongs to a different
 *   stage), else `RESUME_BACKOFF_BASE_MS * 2^(n - threshold)` capped at
 *   RESUME_BACKOFF_MAX_MS — 30s at 3 resumes, 60s at 4, …, 5min cap. Pure:
 *   no clock reads here; callers inject `now` via
 *   `resumeBackoffRemainingMs`.
 * @param {Object} task - Task carrying `consecutiveResumes` / `consecutiveResumeStage`.
 * @param {string|null} stageId - Stage the candidate would resume into.
 * @returns {number} Delay in ms (0 = no backoff).
 * @example resumeBackoffMs({ consecutiveResumes: 2, consecutiveResumeStage: "s1" }, "s1") => 0
 * @example resumeBackoffMs({ consecutiveResumes: 3, consecutiveResumeStage: "s1" }, "s1") => 30000
 * @example resumeBackoffMs({ consecutiveResumes: 10, consecutiveResumeStage: "s1" }, "s1") => 300000
 * @example resumeBackoffMs({ consecutiveResumes: 9, consecutiveResumeStage: "s1" }, "s2") => 0
 ***/
export function resumeBackoffMs(task, stageId) {
	const n = Number.isInteger(task?.consecutiveResumes) ? task.consecutiveResumes : 0;
	if (n < RESUME_BACKOFF_THRESHOLD) return 0;
	const streakStage = task?.consecutiveResumeStage ?? null;
	if (streakStage !== stageId) return 0;
	const steps = n - RESUME_BACKOFF_THRESHOLD;
	return Math.min(RESUME_BACKOFF_BASE_MS * 2 ** steps, RESUME_BACKOFF_MAX_MS);
}
