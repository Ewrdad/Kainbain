// Domain: The Flow — the order stages run in.
/***
 * MARK: ExecutionQueue
 * @description Priority execution queue that serializes asynchronous jobs (e.g. agent stages).
 * Supports 'high' and 'normal' priority levels. High priority jobs execute next after
 * the active job finishes without interrupting or corrupting the running job.
 *
 * Settle guarantee: a never-settling job can never park the queue forever.
 * Every in-flight entry carries a timeout (`activeTimeoutMs` default,
 * overridable per entry); on expiry the entry is force-settled with an
 * `EQUEUE_TIMEOUT` rejection and the drain advances. `settleActive` is the
 * single manual escape hatch for the same latch (scheduler wedge recovery,
 * operator abort). Either way the late-settling job's eventual
 * resolve/reject is dropped, never double-routed — callers that need
 * failure routing for the occupant must route it themselves at settle time
 * (see `recoverWedgedQueueEntry` in `stageHeartbeat.js`).
 * @example const queue = new ExecutionQueue(); await queue.enqueue(jobFn, { priority: 'high' });
 ***/
export const EQUEUE_TIMEOUT_CODE = "EQUEUE_TIMEOUT";

export class ExecutionQueue {
	constructor(options = null) {
		this.active = false;
		this.highQueue = [];
		this.normalQueue = [];
		this.onIdle = null;
		if (typeof options === "number") {
			this.activeTimeoutMs = options > 0 ? options : 0;
		} else if (options && typeof options === "object") {
			this.activeTimeoutMs = Number(options.activeTimeoutMs ?? options.timeoutMs ?? 0);
			if (!Number.isFinite(this.activeTimeoutMs) || this.activeTimeoutMs < 0) this.activeTimeoutMs = 0;
		} else {
			this.activeTimeoutMs = 0;
		}
		// Settle-guarantee state for the in-flight entry.
		this._currentItem = null;
		this._currentSettled = false;
		this._activeTimer = null;
		this._activeStartedAt = null;
	}

	/***
	 * MARK: enqueue
	 * @description Enqueues an asynchronous task function with 'high' or 'normal' priority.
	 * @example await queue.enqueue(async () => doWork(), { priority: 'high' });
	 * @param {Function} fn - Async job to execute.
	 * @param {Object} [opts]
	 * @param {string} [opts.priority='normal'] - 'high' | 'normal'
	 * @param {string} [opts.projectId] - Optional project tag used to cancel only that project's queued jobs.
	 * @param {string} [opts.taskId] - Optional owning task id, used by wedge recovery to route the occupant.
	 * @param {number} [opts.timeoutMs] - Optional per-entry settle-guarantee budget (ms); falls back to the queue default. `0`/missing disables.
	 * @returns {Promise<*>} Result of fn().
	 ***/
	enqueue(fn, { priority = "normal", projectId = null, taskId = null, timeoutMs = null } = {}) {
		return new Promise((resolve, reject) => {
			const item = { fn, resolve, reject, projectId, taskId, timeoutMs };
			if (priority === "high") {
				this.highQueue.push(item);
			} else {
				this.normalQueue.push(item);
			}
			this._drain();
		});
	}

	/***
	 * MARK: _drain
	 * @description Processes queued tasks sequentially, taking from highQueue before normalQueue.
	 * @example queue._drain()
	 * @private
	 ***/
	async _drain() {
		if (this.active) return;
		const next =
			this.highQueue.length > 0
				? this.highQueue.shift()
				: this.normalQueue.shift();
		if (!next) {
			if (typeof this.onIdle === "function") {
				try {
					this.onIdle();
				} catch (e) {
					// Ignore onIdle callback errors
				}
			}
			return;
		}

		this.active = true;
		this._currentItem = next;
		this._currentSettled = false;
		this._activeStartedAt = Date.now();

		const requestedTimeout =
			typeof next.timeoutMs === "number" && Number.isFinite(next.timeoutMs)
				? next.timeoutMs
				: this.activeTimeoutMs;
		const timeoutMs = requestedTimeout > 0 ? requestedTimeout : 0;

		if (timeoutMs > 0) {
			this._activeTimer = setTimeout(() => {
				this._settleLocked(
					next,
					Object.assign(
						new Error(`ExecutionQueue active entry timed out after ${timeoutMs}ms`),
						{ code: EQUEUE_TIMEOUT_CODE },
					),
				);
			}, timeoutMs);
			if (this._activeTimer && typeof this._activeTimer.unref === "function") {
				this._activeTimer.unref();
			}
		}

		try {
			const result = await next.fn();
			if (this._currentSettled) return;
			this._currentSettled = true;
			if (this._activeTimer) {
				clearTimeout(this._activeTimer);
				this._activeTimer = null;
			}
			next.resolve(result);
		} catch (err) {
			if (this._currentSettled) return;
			this._currentSettled = true;
			if (this._activeTimer) {
				clearTimeout(this._activeTimer);
				this._activeTimer = null;
			}
			next.reject(err);
		} finally {
			if (this._currentItem === next) {
				if (this._activeTimer) {
					clearTimeout(this._activeTimer);
					this._activeTimer = null;
				}
				this.active = false;
				this._currentItem = null;
				this._activeStartedAt = null;
				this._drain();
			}
		}
	}

	/***
	 * MARK: _settleLocked
	 * @description Single settle path for the in-flight entry: marks it
	 *   settled, releases the `active` latch, rejects its promise, and
	 *   re-drives `_drain`. Idempotent per entry — a late-settling job, a
	 *   timeout, and a manual `settleActive` race safely; only the first
	 *   wins and the losers are dropped without a second drain.
	 * @param {Object} item - The entry that must still be in flight.
	 * @param {Error} reason - Rejection reason for the entry promise.
	 * @returns {boolean} Whether this call settled the entry.
	 * @private
	 ***/
	_settleLocked(item, reason) {
		if (!item || this._currentItem !== item || this._currentSettled) return false;
		this._currentSettled = true;
		this.active = false;
		this._currentItem = null;
		this._activeStartedAt = null;
		if (this._activeTimer) {
			clearTimeout(this._activeTimer);
			this._activeTimer = null;
		}
		try {
			item.reject(reason instanceof Error ? reason : new Error(String(reason)));
		} catch {
			// Already settled promises are immutable.
		}
		this._drain();
		return true;
	}

	/***
	 * MARK: settleActive
	 * @description Force-settles the in-flight entry (rejecting its promise) so a
	 *   never-settling job can never park the queue forever. Re-drives `_drain`.
	 *   The canonical (and only) manual escape hatch: scheduler wedge
	 *   recovery and operator abort both funnel through here. Returns false
	 *   when there is nothing in flight — including when the entry already
	 *   settled (timeout or natural completion won the race).
	 * @param {Error|string} [error] - Rejection reason for the entry promise.
	 * @returns {boolean} Whether an active entry was settled.
	 ***/
	settleActive(error) {
		const item = this._currentItem;
		if (!item || this._currentSettled) return false;
		return this._settleLocked(
			item,
			error instanceof Error
				? error
				: new Error(String(error || "ExecutionQueue active entry force-settled")),
		);
	}

	/***
	 * MARK: size
	 * @description Returns total number of pending jobs in queue.
	 * @example queue.size => 2
	 * @returns {number}
	 ***/
	get size() {
		return this.highQueue.length + this.normalQueue.length;
	}

	/***
	 * MARK: isRunning
	 * @description Returns whether a job is currently executing.
	 * @example queue.isRunning => true
	 * @returns {boolean}
	 ***/
	get isRunning() {
		return this.active;
	}

	get activeEntry() {
		return this._currentItem;
	}

	get activeStartedAt() {
		return this._activeStartedAt;
	}

	/***
	 * MARK: activeAgeMs
	 * @description Wall-clock age of the in-flight entry in ms, or 0 when the
	 *   queue is idle. Corrupt timestamps collapse to 0 (unknown age) rather
	 *   than NaN so age comparisons fail closed — an unknown age never
	 *   trips the wedge watchdog by itself.
	 * @example queue.activeAgeMs => 900123
	 * @returns {number}
	 ***/
	get activeAgeMs() {
		if (!this.active || typeof this._activeStartedAt !== "number") return 0;
		const age = Date.now() - this._activeStartedAt;
		return Number.isFinite(age) && age >= 0 ? age : 0;
	}

	/***
	 * MARK: clear
	 * @description Clears pending queued jobs. When a projectId is given, only
	 *   that project's queued (not yet running) jobs are cancelled; otherwise the
	 *   entire queue is cleared. A running job is never interrupted.
	 * @example queue.clear('proj-1')
	 * @param {string} [projectId]
	 * @returns {void}
	 ***/
	clear(projectId) {
		const filter = (list) =>
			projectId ? list.filter((item) => item.projectId !== projectId) : [];
		if (projectId) {
			this.highQueue = filter(this.highQueue);
			this.normalQueue = filter(this.normalQueue);
		} else {
			this.highQueue = [];
			this.normalQueue = [];
		}
	}
}
