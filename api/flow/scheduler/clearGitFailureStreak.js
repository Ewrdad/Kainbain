/***
 * MARK: clearGitFailureStreak
 * @description Drops a task's consecutive-git-failure streak (and with it
 *   any auto-dispatch parking): the single owner of the `gitFailureStreak`
 *   field, called on every success advance, every operator retry/resume/
 *   move, and every runner report that is not a deterministic git failure.
 *   Never throws; reports whether a streak was actually cleared so callers
 *   can audit the unpark.
 * @example clearGitFailureStreak({ gitFailureStreak: { count: 3 } }) => true
 * @example clearGitFailureStreak({}) => false
 * @param {Object} [task] - Task object, may carry `gitFailureStreak`.
 * @returns {boolean} True when a streak was present and cleared.
 ***/
export function clearGitFailureStreak(task) {
	if (!task || typeof task !== "object") return false;
	if (!("gitFailureStreak" in task)) return false;
	delete task.gitFailureStreak;
	return true;
}
