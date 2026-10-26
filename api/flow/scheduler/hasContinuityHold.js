/***
 * MARK: hasContinuityHold
 * @description Whether an interrupted task is held out of automatic resume by
 *   an implementation-specific continuity plugin (e.g. waiting for a
 *   detached run's durable result). The field is lifecycle semantics, not
 *   command semantics: generic code never sets it and never interprets what
 *   it waits for — a plugin sets it when it parks with reason and clears it
 *   when the task may resume. Total on untrusted input.
 * @param {Object} task
 * @returns {boolean}
 * @example hasContinuityHold({ continuityHold: 'attempt-1' }) => true
 ***/
export function hasContinuityHold(task) {
	try {
		if (!task || typeof task !== "object") return false;
		const hold = task.continuityHold;
		if (hold === true) return true;
		return typeof hold === "string" && hold.trim() !== "";
	} catch {
		return false;
	}
}
