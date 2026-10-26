/***
 * MARK: fireStageErrorPush
 * @description Best-effort human-intervention push hook. Invokes the
 *   store-owned `notifyStagePush` seam (wired by TaskStore to the push
 *   service) without awaiting it; a missing seam or any failure is swallowed
 *   so failure routing can never break because notifications did.
 * @example fireStageErrorPush(store, { projectId: "p1", taskId: "t1", reason: "parked" }) => (push attempted, never throws)
 * @param {Object} taskStore - TaskStore instance.
 * @param {Object} payload - `{ projectId, taskId, stage, error, reason }`.
 ***/
export function fireStageErrorPush(taskStore, payload) {
	try {
		const maybe = taskStore?.notifyStagePush?.(payload);
		if (maybe && typeof maybe.catch === "function") maybe.catch(() => {});
	} catch {
		// Push must never break failure routing.
	}
}
