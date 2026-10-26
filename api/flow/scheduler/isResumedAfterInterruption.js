/***
 * MARK: isResumedAfterInterruption
 * @description Whether a task still carries the durable startup-recovery
 *   marker: `autoResumeTask` flipped it from `interrupted` back to
 *   `in_stage`, and no dispatch has consumed the priority yet. The marker
 *   (plus `interruptedAt`) is persisted in the task markdown frontmatter so
 *   it survives restarts — without it, a startup-resumed task is
 *   indistinguishable from fresh work and loses its Rule 0 priority.
 * @param {Object} task
 * @returns {boolean}
 * @example isResumedAfterInterruption({ status: "in_stage", resumedAfterInterruption: true }) => true
 ***/
export function isResumedAfterInterruption(task) {
	return (
		task?.status === "in_stage" && task?.resumedAfterInterruption === true
	);
}
