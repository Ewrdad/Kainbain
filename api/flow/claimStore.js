import { v4 as uuidv4 } from "uuid";
import { config } from "../config.js";
import { loadStateFile } from "./loadStateFile.js";
import { resolveStatePath } from "./resolveStatePath.js";
import { saveStateFile } from "./saveStateFile.js";

const CLAIM_STATE_VERSION = 1;
const MAX_COMPLETED_KEPT = 10000;

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
/***
 * MARK: resolveClaimStatePath
 * @description Resolves the durable lease-state file: explicit wins, then
 *   the schema path (env `KAINBAIN_CLAIM_STATE_FILE`), then the
 *   conventional `~/.kainbain/engine/claims.json`. Persists fencing
 *   epochs + completed execution IDs only — live holds are deliberately
 *   NOT restored (a restart re-queues in-flight work as interrupted per
 *   the Phase 4 gate; restoring holds would let a dead Runner's lease
 *   block re-dispatch until TTL).
 * @example resolveClaimStatePath('/tmp/c.json') => '/tmp/c.json'
 * @param {string} [explicit] - Explicit path (tests).
 * @returns {string} Resolved path.
 ***/
export function resolveClaimStatePath(explicit) {
	if (typeof explicit === "string") return explicit || null;
	const configured = config?.claimStateFile;
	if (typeof configured === "string" && !configured.trim()) return null;
	return resolveStatePath(null, configured, "claims.json");
}

/***
 * MARK: ClaimStore
 * @description Backend-side mutual-exclusion ledger (D1); epochs and
 *   completed execution IDs persist across restarts (WP-4.1), live
 *   holds stay memory-only. See the module block above for the full
 *   fencing contract.
 * @example const claims = new ClaimStore()
 * @example claims.claim('t1', 'runner-a') => { executionId: '…', epoch: 1 }
 ***/
export class ClaimStore {
	constructor({ ttlMs = 300000, now = () => Date.now(), stateFile = null } = {}) {
		this.ttlMs = ttlMs;
		this.now = now;
		this.holds = new Map();
		this.epochs = new Map();
		this.completed = new Set();
		this.stateFile = resolveClaimStatePath(stateFile);
		this._loadState();
		// Holds are memory-only by design (see resolveClaimStatePath): a
		// restart drops them so in-flight work re-queues as interrupted.
	}

	_loadState() {
		if (!this.stateFile) return;
		const raw = loadStateFile(this.stateFile, (v) => v);
		const epochs = raw && typeof raw === "object" ? raw.epochs : null;
		if (epochs && typeof epochs === "object") {
			for (const [taskId, epoch] of Object.entries(epochs)) {
				if (typeof taskId === "string" && Number.isInteger(epoch) && epoch > 0) {
					this.epochs.set(taskId, epoch);
				}
			}
		}
		const completed = raw && typeof raw === "object" ? raw.completed : null;
		if (Array.isArray(completed)) {
			for (const id of completed.slice(-MAX_COMPLETED_KEPT)) {
				if (typeof id === "string" && id) this.completed.add(id);
			}
		}
	}

	_persist() {
		if (!this.stateFile) return;
		saveStateFile(this.stateFile, {
			version: CLAIM_STATE_VERSION,
			epochs: Object.fromEntries(this.epochs),
			completed: [...this.completed].slice(-MAX_COMPLETED_KEPT),
		});
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
			startedAt: new Date().toISOString(),
		});
		this._persist();
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
		this._persist();
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
			startedAt: hold.startedAt ?? null,
		};
	}

	/***
	 * MARK: liveHolds
	 * @description Lists every unexpired hold with its owner, project, and
	 *   fencing token (D5 steering pull + multi-Runner monitor, WP-3.4).
	 *   Lazy expiry applies: lapsed holds are swept, never listed.
	 * @example claims.liveHolds() => [{ taskId: 't', runnerId: 'r', … }]
	 * @returns {Array} Live hold rows.
	 ***/
	liveHolds() {
		const out = [];
		for (const taskId of [...this.holds.keys()]) {
			const hold = this._holding(taskId);
			if (!hold) continue;
			out.push({
				taskId,
				runnerId: hold.runnerId,
				projectId: hold.projectId,
				executionId: hold.executionId,
				epoch: hold.epoch,
				startedAt: hold.startedAt ?? null,
			});
		}
		return out;
	}

	invalidate(taskId) {
		return this.holds.delete(taskId);
	}
}
