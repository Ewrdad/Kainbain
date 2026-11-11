import { config } from '../../config.js';

/***
 * MARK: CENTRAL_QUEUE_ORDER_OLDEST_FIRST
 * @description Default central-queue ordering mode: the oldest waiting task
 *   goes first, wherever it lives; furthest-along (as a percentage of its
 *   pipeline) is only a tiebreak. Chosen by the operator survey for task
 *   16d6fbd6 ("oldest waiting job first, wherever it is — well, furthest
 *   along as a percentage").
 * @example CENTRAL_QUEUE_ORDER_OLDEST_FIRST => "oldest-first"
 ***/
export const CENTRAL_QUEUE_ORDER_OLDEST_FIRST = 'oldest-first';

/***
 * MARK: CENTRAL_QUEUE_ORDER_FURTHEST_ALONG
 * @description Legacy ordering mode (pre-16d6fbd6 behaviour): highest
 *   absolute stage index first, then oldest. Selectable via
 *   KAINBAIN_CENTRAL_QUEUE_ORDER=furthest-along as the config-only rollback.
 * @example CENTRAL_QUEUE_ORDER_FURTHEST_ALONG => "furthest-along"
 ***/
export const CENTRAL_QUEUE_ORDER_FURTHEST_ALONG = 'furthest-along';

/***
 * MARK: DEFAULT_CENTRAL_QUEUE_MAX_WAIT_MS
 * @description Built-in starvation ceiling (15 min) used in oldest-first mode
 *   when KAINBAIN_DISPATCH_MAX_WAIT_MS is left at 0. It bounds the follow-on
 *   pre-emption and marks candidates "overdue"; in oldest-first mode the
 *   FIFO order itself already bounds the wait, so this is a safety net, not
 *   the primary mechanism.
 * @example DEFAULT_CENTRAL_QUEUE_MAX_WAIT_MS => 900000
 ***/
export const DEFAULT_CENTRAL_QUEUE_MAX_WAIT_MS = 15 * 60 * 1000;

/***
 * MARK: resolveCentralQueuePolicy
 * @description Resolves the one central-queue policy used by BOTH dispatch
 *   paths (embedded scheduler `findNextCandidateTask`, runner fleet
 *   `scanClaimableTasks`) and the queue display (`getScheduledQueue`), so all
 *   three can never disagree about "what runs next". Explicit opts win;
 *   otherwise the config knobs apply: `centralQueueOrder`
 *   (KAINBAIN_CENTRAL_QUEUE_ORDER, default oldest-first) and
 *   `dispatchMaxWaitMs` (KAINBAIN_DISPATCH_MAX_WAIT_MS, default 0). A zero
 *   configured ceiling means "use the built-in 15 min ceiling" in
 *   oldest-first mode and "off" in legacy furthest-along mode (exact legacy
 *   behaviour).
 * @param {Object} [opts]
 * @param {string} [opts.order] - "oldest-first" | "furthest-along" (overrides config).
 * @param {number} [opts.maxWaitMs] - Starvation ceiling in ms (overrides config; >0 wins, 0 falls back per mode).
 * @param {number} [opts.now] - Clock override in ms since epoch (tests).
 * @returns {{ order: string, maxWaitMs: number, now: number }}
 * @example resolveCentralQueuePolicy({ now: 1000 }) => { order: "oldest-first", maxWaitMs: 900000, now: 1000 }
 ***/
export function resolveCentralQueuePolicy(opts = {}) {
	const order =
		typeof opts.order === 'string' && opts.order.trim() !== ''
			? opts.order
			: config?.centralQueueOrder || CENTRAL_QUEUE_ORDER_OLDEST_FIRST;
	const configured =
		typeof opts.maxWaitMs === 'number' && Number.isFinite(opts.maxWaitMs)
			? opts.maxWaitMs
			: typeof config?.dispatchMaxWaitMs === 'number' &&
			    Number.isFinite(config.dispatchMaxWaitMs)
				? config.dispatchMaxWaitMs
				: 0;
	const maxWaitMs =
		configured > 0
			? configured
			: order === CENTRAL_QUEUE_ORDER_FURTHEST_ALONG
				? 0
				: DEFAULT_CENTRAL_QUEUE_MAX_WAIT_MS;
	const now =
		typeof opts.now === 'number' && Number.isFinite(opts.now) ? opts.now : Date.now();
	return { order, maxWaitMs, now };
}
