/***
 * MARK: notifyStagePush
 * @description Push seam for human-intervention stage failures. Same lazy,
 *   never-throw contract as `notifyQueueEmpty`; a missing or failing push
 *   service cannot break failure routing.
 * @param {Object} [payload] - `{ projectId, taskId, stage, error, reason }`.
 * @example await notifyStagePush({ projectId: "p1", taskId: "t1", reason: "unrecoverable" })
 ***/
export async function notifyStagePush(payload = {}) {
	try {
		const { getPushService } = await import('../push/index.js');
		await getPushService().notifyStageError(payload);
	} catch {
		// Push must never break failure routing.
	}
}
