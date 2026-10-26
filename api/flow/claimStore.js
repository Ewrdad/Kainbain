import { v4 as uuidv4 } from "uuid";

/***
 * MARK: ClaimStore
 * @description Backend-side mutual-exclusion ledger for task claims (D1,
 *   ADR 0009 lifecycle step 3). One task, one holder: `claim` issues a
 *   monotonically increasing backend-side fencing token (epoch — never
 *   wall-clock, so clock skew between hosts cannot reorder the lock) plus a
 *   stable execution ID. Completion and push acceptance check the epoch;
 *   a retried report with a known execution ID is a no-op, never a
 *   duplicate stage. Expiry is lazy (checked on access, not by a sweeper):
 *   an expired hold may be re-claimed with a higher epoch, which is what
 *   makes a partitioned zombie's late completion stale by construction.
 *   In-memory for Phase 2 (the backend is still the single writer); the
 *   durability story (surviving a backend restart) is Phase 4 per the
 *   risk-retirement matrix — until then a restart drops holds and
 *   in-flight work re-queues as interrupted.
 * @example const claims = new ClaimStore(); claims.claim('t1', 'runner-a')
 * @param {Object} [opts] - Options.
 * @param {number} [opts.ttlMs=300000] - Lease time-to-live per claim.
 * @param {Function} [opts.now] - Clock injection (tests control expiry).
 ***/
export class ClaimStore {
	constructor({ ttlMs = 300000, now = () => Date.now() } = {}) {
		this.ttlMs = ttlMs;
		this.now = now;
		this.holds = new Map();
		this.epochs = new Map();
		this.completed = new Set();
	}

	_holding(taskId) {
		const hold = this.holds.get(taskId);
		if (!hold) return null;
		if (hold.expiresAt <= this.now()) {
			this.holds.delete(taskId);
			return null;
		}
		return hold;
	}

	_nextEpoch(taskId) {
		const epoch = (this.epochs.get(taskId) || 0) + 1;
		this.epochs.set(taskId, epoch);
		return epoch;
	}

	static _argError(message) {
		const err = new Error(message);
		err.statusCode = 400;
		err.code = "INVALID_CLAIM_ARGS";
		return err;
	}

	static _conflict(taskId, hold) {
		const err = new Error(
			`Task ${taskId} is already claimed (epoch ${hold.epoch}); wait for release, expiry, or completion.`,
		);
		err.statusCode = 409;
		err.code = "CLAIM_CONFLICT";
		err.holder = { runnerId: hold.runnerId, epoch: hold.epoch };
		return err;
	}

	static _stale(taskId, why) {
		const err = new Error(`Stale execution for task ${taskId}: ${why}.`);
		err.statusCode = 409;
		err.code = "STALE_EPOCH";
		return err;
	}

	claim(taskId, runnerId, projectId = null) {
		if (!taskId || typeof taskId !== "string") {
			throw ClaimStore._argError("claim requires a taskId.");
		}
		if (!runnerId || typeof runnerId !== "string") {
			throw ClaimStore._argError("claim requires a runnerId.");
		}
		const hold = this._holding(taskId);
		if (hold) throw ClaimStore._conflict(taskId, hold);
		const epoch = this._nextEpoch(taskId);
		const executionId = uuidv4();
		this.holds.set(taskId, {
			executionId,
			epoch,
			runnerId,
			projectId: typeof projectId === "string" ? projectId : null,
			expiresAt: this.now() + this.ttlMs,
		});
		return { executionId, epoch };
	}

	/***
	 * MARK: countLiveHolds
	 * @description Counts unexpired holds (D8 burn control, WP-3.3): expiry
	 *   is lazy, so counting sweeps exactly like access does — a dead
	 *   Runner's hold stops counting the moment its TTL lapses.
	 * @example claims.countLiveHolds({ projectId: 'p1' }) => 2
	 * @param {Object} [opts] - Options.
	 * @param {string} [opts.projectId] - Restrict the count to one project.
	 * @returns {number} Live hold count.
	 ***/
	countLiveHolds({ projectId } = {}) {
		let count = 0;
		for (const taskId of [...this.holds.keys()]) {
			const hold = this._holding(taskId);
			if (!hold) continue;
			if (projectId !== undefined && hold.projectId !== projectId) continue;
			count += 1;
		}
		return count;
	}

	heartbeat(taskId, executionId) {
		const hold = this._holding(taskId);
		if (!hold || hold.executionId !== executionId) {
			throw ClaimStore._stale(taskId, "unknown or superseded execution");
		}
		hold.expiresAt = this.now() + this.ttlMs;
		return { executionId, epoch: hold.epoch };
	}

	complete(taskId, executionId, epoch) {
		if (this.completed.has(executionId)) {
			return { accepted: true, duplicate: true };
		}
		const hold = this._holding(taskId);
		if (!hold || hold.executionId !== executionId || hold.epoch !== epoch) {
			throw ClaimStore._stale(taskId, "epoch or execution mismatch");
		}
		this.holds.delete(taskId);
		this.completed.add(executionId);
		return { accepted: true, duplicate: false };
	}

	release(taskId, executionId) {
		const hold = this._holding(taskId);
		if (!hold || hold.executionId !== executionId) {
			throw ClaimStore._stale(taskId, "unknown or superseded execution");
		}
		this.holds.delete(taskId);
		return { released: true, epoch: hold.epoch };
	}

	describe(taskId) {
		const hold = this._holding(taskId);
		if (!hold) return null;
		return {
			runnerId: hold.runnerId,
			executionId: hold.executionId,
			epoch: hold.epoch,
		};
	}

	invalidate(taskId) {
		return this.holds.delete(taskId);
	}
}
