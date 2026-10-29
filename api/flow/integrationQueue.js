// Domain: The Flow — serialized integration leases for Runner-run merges.
import { v4 as uuidv4 } from "uuid";

/***
 * MARK: IntegrationQueue
 * @description Backend-side mutual-exclusion ledger for target-branch
 *   integrations (Step 3 of the git-runner-coordination spike): one
 *   project + target branch, one leased integration at a time. The backend
 *   never checks out, merges, or pushes — it only queues merge requests,
 *   leases the head entry to one Runner (fenced by a monotonic per-scope
 *   epoch, never wall-clock), and records the Runner's terminal report.
 *   A merge only lands via the Runner's compare-and-swap push against the
 *   expected target SHA, so an expired lease re-queues safely: a zombie's
 *   late push is rejected by the remote, and its late report is stale by
 *   construction (same precedent as ClaimStore, D1).
 *   In-memory while the backend is the single writer (same durability
 *   story as ClaimStore/ExecutionLedger); a restart drops live leases and
 *   queued entries re-enter through the merge stage's normal retry.
 * @example const q = new IntegrationQueue(); q.enqueue({ projectId: 'p', targetBranch: 'main', taskId: 't', taskBranch: 'kb/t', expectedTaskSha: 'a', expectedTargetSha: 'b', mergeAttemptId: 'm1' })
 * @param {Object} [opts] - Options.
 * @param {number} [opts.ttlMs=300000] - Lease time-to-live per integration.
 * @param {Function} [opts.now] - Clock injection (tests control expiry).
 ***/
export class IntegrationQueue {
	constructor({ ttlMs = 300000, now = () => Date.now() } = {}) {
		this.ttlMs = ttlMs;
		this.now = now;
		// scopeKey -> { epochs, queue: [entry], lease: entry|null }
		this.scopes = new Map();
		// executionId -> terminal outcome (idempotent re-reports).
		this.settled = new Map();
		this.counters = {
			enqueued: 0,
			leased: 0,
			landed: 0,
			conflicts: 0,
			staleHeads: 0,
			expired: 0,
			staleRejected: 0,
			duplicateReports: 0,
		};
	}

	static scopeKey(projectId, targetBranch) {
		return `${String(projectId || "")}:${String(targetBranch || "")}`;
	}

	static _argError(message) {
		const err = new Error(message);
		err.statusCode = 400;
		err.code = "INVALID_INTEGRATION_ARGS";
		return err;
	}

	static _busy(scope, lease) {
		const err = new Error(
			`Integration for ${scope} is already leased (epoch ${lease.epoch}); the request stays queued.`,
		);
		err.statusCode = 409;
		err.code = "INTEGRATION_BUSY";
		err.holder = { runnerId: lease.runnerId, epoch: lease.epoch };
		return err;
	}

	static _stale(why) {
		const err = new Error(`Stale integration execution: ${why}.`);
		err.statusCode = 409;
		err.code = "STALE_EPOCH";
		return err;
	}

	_scope(projectId, targetBranch) {
		const key = IntegrationQueue.scopeKey(projectId, targetBranch);
		let scope = this.scopes.get(key);
		if (!scope) {
			scope = { epoch: 0, queue: [], lease: null };
			this.scopes.set(key, scope);
		}
		return { key, scope };
	}

	_reapLease(scope) {
		const lease = scope.lease;
		if (!lease) return null;
		if (lease.expiresAt > this.now()) return lease;
		// Expired: back to the head of the queue with the same attempt id
		// (idempotent — the merge never landed without a CAS push, and a
		// zombie's late push is rejected by the remote).
		scope.lease = null;
		lease.state = "queued";
		lease.runnerId = null;
		lease.executionId = null;
		scope.queue.unshift(lease);
		this.counters.expired += 1;
		return null;
	}

	/***
	 * MARK: enqueue
	 * @description Queues one merge request for a project + target branch.
	 *   Idempotent on `mergeAttemptId`: re-enqueueing the same attempt
	 *   returns the existing entry instead of queueing a duplicate merge.
	 * @example q.enqueue({ projectId: 'p', targetBranch: 'main', taskId: 't', taskBranch: 'kb/t', expectedTaskSha: 'a', expectedTargetSha: 'b', mergeAttemptId: 'm1' }) => { queued: true, position: 0 }
	 ***/
	enqueue({ projectId, targetBranch, taskId, taskBranch, expectedTaskSha, expectedTargetSha, mergeAttemptId }) {
		for (const field of [projectId, targetBranch, taskId, taskBranch, expectedTaskSha, expectedTargetSha, mergeAttemptId]) {
			if (!field || typeof field !== "string") {
				throw IntegrationQueue._argError("enqueue requires projectId, targetBranch, taskId, taskBranch, expectedTaskSha, expectedTargetSha, mergeAttemptId.");
			}
		}
		const { scope } = this._scope(projectId, targetBranch);
		this._reapLease(scope);
		const existing =
			scope.queue.find((e) => e.mergeAttemptId === mergeAttemptId) ||
			(scope.lease?.mergeAttemptId === mergeAttemptId ? scope.lease : null);
		if (existing) {
			return { queued: false, duplicate: true, position: scope.queue.indexOf(existing), state: existing.state };
		}
		const entry = {
			projectId,
			targetBranch,
			taskId,
			taskBranch,
			expectedTaskSha,
			expectedTargetSha,
			mergeAttemptId,
			state: "queued",
			runnerId: null,
			executionId: null,
			epoch: null,
			enqueuedAt: new Date().toISOString(),
			expiresAt: null,
		};
		scope.queue.push(entry);
		this.counters.enqueued += 1;
		return { queued: true, duplicate: false, position: scope.queue.length - 1, state: "queued" };
	}

	/***
	 * MARK: acquire
	 * @description Leases the head queued entry for a scope to one Runner.
	 *   Returns `{ leased: false }` when the queue is empty; throws
	 *   `INTEGRATION_BUSY` when a live lease is held (the request stays
	 *   queued — never lost, never double-leased).
	 * @example q.acquire({ projectId: 'p', targetBranch: 'main', runnerId: 'r1' }) => { leased: true, executionId, epoch, entry }
	 ***/
	acquire({ projectId, targetBranch, runnerId }) {
		if (!projectId || !targetBranch || !runnerId) {
			throw IntegrationQueue._argError("acquire requires projectId, targetBranch, runnerId.");
		}
		const { scope } = this._scope(projectId, targetBranch);
		const live = this._reapLease(scope);
		if (live) throw IntegrationQueue._busy(IntegrationQueue.scopeKey(projectId, targetBranch), live);
		const entry = scope.queue.shift();
		if (!entry) return { leased: false };
		scope.epoch += 1;
		entry.state = "leased";
		entry.runnerId = runnerId;
		entry.executionId = uuidv4();
		entry.epoch = scope.epoch;
		entry.expiresAt = this.now() + this.ttlMs;
		scope.lease = entry;
		this.counters.leased += 1;
		return {
			leased: true,
			executionId: entry.executionId,
			epoch: entry.epoch,
			entry: { ...entry },
		};
	}

	/***
	 * MARK: heartbeat
	 * @description Renews a live integration lease. A stale or unknown
	 *   execution throws `STALE_EPOCH` so a zombie stops being propped up.
	 * @example q.heartbeat({ executionId: 'e', epoch: 3 }) => { executionId: 'e', epoch: 3 }
	 ***/
	heartbeat({ projectId, targetBranch, executionId, epoch }) {
		const { scope } = this._scope(projectId, targetBranch);
		const lease = this._reapLease(scope);
		if (!lease || lease.executionId !== executionId || lease.epoch !== epoch) {
			this.counters.staleRejected += 1;
			throw IntegrationQueue._stale("unknown or superseded integration execution");
		}
		lease.expiresAt = this.now() + this.ttlMs;
		return { executionId, epoch: lease.epoch };
	}

	/***
	 * MARK: report
	 * @description Records a Runner's terminal integration report and
	 *   releases the lease. `outcome` is one of `landed | conflict |
	 *   stale-head | needs-sync | failed`. Re-reporting a settled
	 *   execution is a no-op (`duplicate: true`); a report for a
	 *   superseded execution throws `STALE_EPOCH`.
	 * @example q.report({ projectId: 'p', targetBranch: 'main', executionId: 'e', epoch: 1, outcome: 'landed', mergeSha: 'abc' }) => { accepted: true }
	 ***/
	report({ projectId, targetBranch, executionId, epoch, outcome, mergeSha = null, detail = null }) {
		const valid = ["landed", "conflict", "stale-head", "needs-sync", "failed"];
		if (!valid.includes(outcome)) {
			throw IntegrationQueue._argError(`report requires outcome one of ${valid.join(" | ")}.`);
		}
		if (this.settled.has(executionId)) {
			this.counters.duplicateReports += 1;
			return { accepted: true, duplicate: true };
		}
		const { scope } = this._scope(projectId, targetBranch);
		const lease = scope.lease;
		if (!lease || lease.executionId !== executionId || lease.epoch !== epoch) {
			this.counters.staleRejected += 1;
			throw IntegrationQueue._stale("unknown or superseded integration execution");
		}
		scope.lease = null;
		lease.state = outcome;
		this.settled.set(executionId, {
			projectId,
			targetBranch,
			taskId: lease.taskId,
			outcome,
			mergeSha,
			detail,
			at: new Date().toISOString(),
		});
		if (outcome === "landed") this.counters.landed += 1;
		if (outcome === "conflict") this.counters.conflicts += 1;
		if (outcome === "stale-head") this.counters.staleHeads += 1;
		return { accepted: true, duplicate: false, outcome };
	}

	/***
	 * MARK: describe
	 * @description Queue depth + live lease for one scope (Runner monitor,
	 *   Step 6 observability). Lazy expiry applies before reading.
	 * @example q.describe({ projectId: 'p', targetBranch: 'main' }) => { depth: 1, lease: null }
	 ***/
	describe({ projectId, targetBranch }) {
		const { scope } = this._scope(projectId, targetBranch);
		const lease = this._reapLease(scope);
		return {
			depth: scope.queue.length,
			lease: lease
				? {
						taskId: lease.taskId,
						runnerId: lease.runnerId,
						executionId: lease.executionId,
						epoch: lease.epoch,
						expiresAt: lease.expiresAt,
					}
				: null,
		};
	}

	snapshot() {
		return { ...this.counters };
	}
}
