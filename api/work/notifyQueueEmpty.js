/***
 * MARK: notifyQueueEmpty
 * @description Push seam for the scheduler's active→idle transition. Lazy-
 *   imports the push singleton so callers never gain a load-time dependency
 *   on push state, crypto, or disk, and swallows every failure so a
 *   notification problem can never break scheduling. Never returns a value;
 *   the caller does not need the push result.
 * @param {Object} [opts] - Forwarded to the push service (humanPendingCount).
 * @example await notifyQueueEmpty({ humanPendingCount: 1 })
 ***/
export async function notifyQueueEmpty(opts = {}) {
	try {
		const { getPushService } = await import('../push/index.js');
		await getPushService().notifyQueueEmpty(opts);
	} catch {
		// Push must never break the scheduler.
	}
}
