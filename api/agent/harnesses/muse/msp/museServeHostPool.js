/**
 * MARK: museServeHostPool
 * @description One `muse serve` MSP host shared per project workspace
 *   (the OpencodeServerManager pattern; spike open question O-1 default):
 *   KainBain sessions on the same project reuse one warm host, each holding
 *   its OWN MSP session on that host. The pool owns reference counting and an
 *   idle TTL, so an unused host is disposed after `idleTtlMs` instead of
 *   pinning ~120 MB forever. A host that DIES is evicted (never killed
 *   again) and the next acquire spawns a fresh one — sessions then reconnect
 *   with `session/resume`.
 */

/***
 * MARK: createMuseServeHostPool
 * @description Builds the per-project host pool.
 * @example const pool = createMuseServeHostPool({ startHost: async (key) => runtime });
 * @example const lease = await pool.acquire("/repo"); lease.runtime; lease.release();
 * @param {Object} opts
 * @param {Function} opts.startHost - async (key) => started MspSessionRuntime (must expose `.child`).
 * @param {number} [opts.idleTtlMs] - Idle TTL before disposal (0 = never).
 * @param {Function} [opts.log] - Diagnostic logger.
 * @param {Function} [opts.setTimer] - setTimeout override (tests).
 * @param {Function} [opts.clearTimer] - clearTimeout override (tests).
 * @returns {Object} { acquire, invalidate, size, disposeAll }.
 ***/
export function createMuseServeHostPool({
	startHost,
	idleTtlMs = 300000,
	log,
	setTimer = setTimeout,
	clearTimer = clearTimeout,
} = {}) {
	if (typeof startHost !== "function") {
		throw new Error("createMuseServeHostPool requires a startHost(key) function");
	}
	const entries = new Map();

	function disposeEntry(entry) {
		entry.disposed = true;
		if (entry.idleTimer) {
			clearTimer(entry.idleTimer);
			entry.idleTimer = null;
		}
		const runtime = entry.runtime;
		entry.runtime = null;
		runtime?.dispose?.().catch(() => {});
	}

	function scheduleDisposal(entry) {
		if (entry.disposed || entry.refs > 0) return;
		if (!idleTtlMs || idleTtlMs <= 0) {
			// No pooling (tests / shutdown): dispose the moment it is unused.
			entries.delete(entry.key);
			disposeEntry(entry);
			return;
		}
		if (entry.idleTimer) clearTimer(entry.idleTimer);
		entry.idleTimer = setTimer(() => {
			entry.idleTimer = null;
			if (entry.refs > 0 || entry.disposed) return;
			log?.(`idle TTL reached; disposing the shared host for '${entry.key}'`);
			entries.delete(entry.key);
			disposeEntry(entry);
		}, idleTtlMs);
		if (entry.idleTimer?.unref) entry.idleTimer.unref();
	}

	function markDead(entry) {
		if (entry.dead) return;
		entry.dead = true;
		if (entries.get(entry.key) === entry) entries.delete(entry.key);
		for (const listener of [...entry.deathListeners]) {
			try {
				listener();
			} catch {
				// one bad listener never breaks the others
			}
		}
		entry.deathListeners.clear();
	}

	async function createEntry(key) {
		const entry = {
			key,
			runtime: null,
			starting: null,
			refs: 0,
			disposed: false,
			dead: false,
			idleTimer: null,
			deathListeners: new Set(),
		};
		entries.set(key, entry);
		entry.starting = (async () => {
			const runtime = await startHost(key);
			entry.runtime = runtime;
			entry.starting = null;
			runtime?.child?.once?.("close", () => markDead(entry));
			return runtime;
		})().catch((error) => {
			entry.starting = null;
			if (entries.get(key) === entry) entries.delete(key);
			throw error;
		});
		return entry;
	}

	/***
	 * MARK: acquire
	 * @description Acquires a lease on the shared host for `key`, spawning it
	 *   on first use. The returned lease exposes `runtime` (the STARTED host)
	 *   and `release()` (idempotent). `onHostDeath` listeners fire if the
	 *   shared host exits while the lease is held.
	 ***/
	async function acquire(key, { onHostDeath } = {}) {
		let entry = entries.get(key);
		if (!entry || entry.dead) entry = await createEntry(key);
		entry.refs += 1;
		if (entry.idleTimer) {
			clearTimer(entry.idleTimer);
			entry.idleTimer = null;
		}
		if (typeof onHostDeath === "function") entry.deathListeners.add(onHostDeath);
		let released = false;
		const runtime = await (entry.starting || Promise.resolve(entry.runtime));
		return {
			key,
			runtime,
			release: () => {
				if (released) return;
				released = true;
				if (typeof onHostDeath === "function") entry.deathListeners.delete(onHostDeath);
				entry.refs = Math.max(0, entry.refs - 1);
				if (entry.refs === 0) scheduleDisposal(entry);
			},
		};
	}

	/***
	 * MARK: invalidate
	 * @description Evicts a host from the pool so the next acquire spawns a
	 *   fresh one. Used after a host death (already gone — nothing to kill)
	 *   and after a session gives up reconnecting to a wedged host. The entry
	 *   keeps its refcount: leases still held by other sessions release
	 *   normally, and the host is reaped by the idle TTL once unused — an
	 *   evicted-but-alive host is never killed out from under its holders.
	 ***/
	function invalidate(key) {
		const entry = entries.get(key);
		if (!entry) return;
		entries.delete(key);
		entry.dead = true;
		if (entry.idleTimer) {
			clearTimer(entry.idleTimer);
			entry.idleTimer = null;
		}
	}

	/***
	 * MARK: disposeAll
	 * @description Disposes every pooled host (test teardown / shutdown).
	 *   Marks each entry disposed and clears its idle timer first, so a
	 *   pending TTL sweep can never double-dispose or fire late.
	 ***/
	async function disposeAll() {
		const all = [...entries.values()];
		entries.clear();
		for (const entry of all) {
			entry.disposed = true;
			if (entry.idleTimer) {
				clearTimer(entry.idleTimer);
				entry.idleTimer = null;
			}
		}
		await Promise.all(all.map((entry) => entry.runtime?.dispose?.().catch(() => {})));
	}

	return {
		acquire,
		invalidate,
		disposeAll,
		size: () => entries.size,
	};
}
