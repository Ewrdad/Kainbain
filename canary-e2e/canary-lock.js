// Host-wide canary mutex: exactly one suite may provision the fixed canary
// scratch stack (API :3399, vite :5299) at a time.
//
// Background: every task's CI gate runs the canary suite, and every suite
// start reclaims the fixed scratch ports by killing whatever verifies as a
// scratch occupant (see canary-preflight.mjs / drainScratchPorts in
// playwright.config.js). A LIVE stack from a concurrent task verifies as a
// scratch occupant, so overlapping suites kept killing each other's servers
// and every task failed its CI stage (2026-11-03: no task passing for a day).
// This lock serializes suite entry across checkouts, runners, and entry
// points (gate branch, deploy.sh gate, manual runs): whoever holds it owns
// the scratch ports, and any occupant found while holding it is definitionally
// stale (previous holder crashed) and safe to reclaim.
//
// The lock is acquired at Playwright config load (main process only —
// workers share nothing and must never wait on it) and released in
// global-teardown.js. A crashed holder is detected by PID liveness plus a
// max-age backstop, so a killed run blocks the next one for seconds, not
// forever. Fail-closed by design: when the lock cannot be acquired the suite
// errors loudly instead of joining a mutual kill.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

/***
 * MARK: LOCK_FILENAME
 * @description Lock file name inside the lock directory.
 * @example LOCK_FILENAME => "canary.lock"
 ***/
const LOCK_FILENAME = "canary.lock";

/***
 * MARK: DEFAULT_MAX_WAIT_MS
 * @description How long a suite waits for a live holder before giving up
 *   (30 min): covers one full holder run (25 min branch ceiling) plus
 *   startup slack. Longer queues fail fast with the holder's PID instead of
 *   strangling the CI stage budget (wait + run must fit inside it).
 * @example DEFAULT_MAX_WAIT_MS => 1800000
 ***/
const DEFAULT_MAX_WAIT_MS = 30 * 60 * 1000;

/***
 * MARK: DEFAULT_POLL_MS
 * @description Cadence of lock re-attempts while waiting (5s).
 * @example DEFAULT_POLL_MS => 5000
 ***/
const DEFAULT_POLL_MS = 5000;

/***
 * MARK: DEFAULT_MAX_AGE_MS
 * @description Backstop: a lock older than this is stale even if its PID
 *   looks alive (PID reuse). 60 min is far above any healthy run, so it can
 *   only fire on a freak PID collision — PID liveness is the real detector.
 * @example DEFAULT_MAX_AGE_MS => 3600000
 ***/
const DEFAULT_MAX_AGE_MS = 60 * 60 * 1000;

/***
 * MARK: lockFilePath
 * @description Absolute lock path. Shared across every checkout on the host
 *   by default (~/.kainbain); override with KAINBAIN_CANARY_LOCK_DIR when
 *   the home directory is not shared (multi-user hosts need a common dir).
 * @example lockFilePath({ KAINBAIN_CANARY_LOCK_DIR: "/tmp/x" }) => "/tmp/x/canary.lock"
 * @param {Object} [env] - Env-like object, defaults to process.env.
 * @returns {string} Absolute path of the lock file.
 ***/
function lockFilePath(env = process.env) {
	const dir = env.KAINBAIN_CANARY_LOCK_DIR || path.join(os.homedir(), ".kainbain");
	return path.join(dir, LOCK_FILENAME);
}

/***
 * MARK: pidAlive
 * @description Whether a PID currently exists (signal 0 probe). Same-user
 *   only: a foreign user's holder reads as dead, so multi-user hosts must
 *   share one lock dir AND run suites as one user (or per-user dirs).
 * @example pidAlive(process.pid) => true
 * @param {number} pid - Process id to probe.
 * @param {Function} [killFn] - Signal seam, defaults to process.kill.
 * @returns {boolean} True when the process exists.
 ***/
function pidAlive(pid, killFn = process.kill) {
	try {
		killFn(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/***
 * MARK: readHolder
 * @description Reads and validates the lock holder record. Corrupt or
 *   unreadable content returns null (treated as stale, never as held).
 * @example readHolder("/nope") => null
 * @param {string} lockPath - Absolute lock file path.
 * @param {Function} [readFileFn] - Read seam, defaults to fs.readFileSync.
 * @returns {{pid:number,startedAt:number}|null} Holder record or null.
 ***/
function readHolder(lockPath, readFileFn = fs.readFileSync) {
	try {
		const data = JSON.parse(readFileFn(lockPath, "utf8"));
		if (data && Number.isInteger(data.pid) && data.pid > 0) return data;
		return null;
	} catch {
		return null;
	}
}

/***
 * MARK: holderIsStale
 * @description Whether a holder record no longer blocks acquisition: no
 *   record, older than maxAgeMs, or its PID is gone (crashed run).
 * @example holderIsStale(null, Date.now(), 1000) => true
 * @param {{pid:number,startedAt:number}|null} holder - Record from readHolder.
 * @param {number} nowMs - Current time in ms.
 * @param {number} maxAgeMs - Stale age backstop.
 * @param {Function} [pidAliveFn] - Liveness seam, defaults to pidAlive.
 * @returns {boolean} True when acquisition may proceed past this holder.
 ***/
function holderIsStale(holder, nowMs, maxAgeMs, pidAliveFn = pidAlive) {
	if (!holder) return true;
	if (nowMs - holder.startedAt > maxAgeMs) return true;
	return !pidAliveFn(holder.pid);
}

/***
 * MARK: sleepSync
 * @description Blocking sleep for the config-load wait loop (CJS config
 *   cannot await). Spawns one short-lived Node per poll — ~50ms overhead on
 *   a 5s cadence — instead of assuming a `sleep` binary exists (Windows).
 * @example sleepSync(10) blocks ~10ms
 * @param {number} ms - Milliseconds to block.
 * @param {Function} [execFileFn] - Exec seam, defaults to execFileSync.
 ***/
function sleepSync(ms, execFileFn = null) {
	const exec = execFileFn || require("node:child_process").execFileSync;
	try {
		exec(process.execPath, ["--eval", `setTimeout(() => {}, ${Number(ms) || 0})`], {
			stdio: "ignore",
			windowsHide: true,
		});
	} catch {
		// A failed sleep must never break acquisition — just poll again.
	}
}

/***
 * MARK: acquireCanaryLock
 * @description Blocks until this process owns the host-wide canary lock,
 *   then returns. Creation is atomic (O_EXCL): exactly one waiter wins each
 *   opening. A stale holder (dead PID, ancient lock, corrupt file) is
 *   removed and retried, never waited on. Throws after timeoutMs with the
 *   holder's PID so the operator knows who to look for.
 * @example acquireCanaryLock({ env: { KAINBAIN_CANARY_LOCK_DIR: "/tmp/x" } }) => { lockPath: "/tmp/x/canary.lock", waitedMs: 0 }
 * @param {Object} [opts]
 * @param {Object} [opts.env] - Env-like object, defaults to process.env.
 * @param {number} [opts.timeoutMs] - Give-up budget, defaults to
 *   KAINBAIN_CANARY_LOCK_TIMEOUT_MS or 45 min.
 * @param {number} [opts.pollMs] - Re-attempt cadence, defaults to 5s.
 * @param {number} [opts.maxAgeMs] - Stale age backstop, defaults to 60 min.
 * @param {Function} [opts.sleepFn] - Blocking-sleep seam, defaults to sleepSync.
 * @param {Function} [opts.logFn] - Progress sink (called at most every
 *   minute while waiting), defaults to a console line.
 * @returns {{lockPath:string,waitedMs:number}} Lock path and time waited.
 ***/
function acquireCanaryLock({
	env = process.env,
	timeoutMs = Number(env.KAINBAIN_CANARY_LOCK_TIMEOUT_MS) || DEFAULT_MAX_WAIT_MS,
	pollMs = DEFAULT_POLL_MS,
	maxAgeMs = DEFAULT_MAX_AGE_MS,
	sleepFn = sleepSync,
	logFn = (line) => console.log(line),
} = {}) {
	const lockPath = lockFilePath(env);
	fs.mkdirSync(path.dirname(lockPath), { recursive: true });
	const waitStart = Date.now();
	let lastLogAt = 0;
	for (;;) {
		try {
			fs.writeFileSync(
				lockPath,
				`${JSON.stringify({ pid: process.pid, startedAt: Date.now() })}\n`,
				{ flag: "wx" },
			);
			return { lockPath, waitedMs: Date.now() - waitStart };
		} catch (error) {
			if (error && error.code !== "EEXIST") throw error;
		}
		const holder = readHolder(lockPath);
		if (holderIsStale(holder, Date.now(), maxAgeMs)) {
			try {
				fs.rmSync(lockPath, { force: true });
			} catch {
				// Lost a removal race with a fellow waiter — just retry.
			}
			continue;
		}
		const waitedMs = Date.now() - waitStart;
		if (waitedMs >= timeoutMs) {
			throw new Error(
				`canary-e2e: scratch-stack lock held by pid ${holder.pid} ` +
					`(since ${new Date(holder.startedAt).toISOString()}, lock ${lockPath}); ` +
					`gave up after ${Math.round(waitedMs / 1000)}s. ` +
					`Another canary suite is running — wait for it or, if that pid is dead, ` +
					`delete the lock file and re-run.`,
			);
		}
		if (Date.now() - lastLogAt >= 60 * 1000) {
			lastLogAt = Date.now();
			logFn(
				`canary-e2e: waiting for the scratch-stack lock (held by pid ${holder.pid})...`,
			);
		}
		sleepFn(pollMs);
	}
}

/***
 * MARK: releaseCanaryLock
 * @description Releases the lock, but only when this process is the holder
 *   (a worker or stranger must never drop another run's lock). Missing or
 *   foreign lock reads as "nothing released", never a throw.
 * @example releaseCanaryLock({ env: { KAINBAIN_CANARY_LOCK_DIR: "/tmp/x" } }) => false
 * @param {Object} [opts]
 * @param {Object} [opts.env] - Env-like object, defaults to process.env.
 * @returns {boolean} True when this process released its own lock.
 ***/
function releaseCanaryLock({ env = process.env } = {}) {
	const lockPath = lockFilePath(env);
	const holder = readHolder(lockPath);
	if (!holder || holder.pid !== process.pid) return false;
	try {
		fs.rmSync(lockPath, { force: true });
		return true;
	} catch {
		return false;
	}
}

module.exports = {
	LOCK_FILENAME,
	DEFAULT_MAX_WAIT_MS,
	DEFAULT_POLL_MS,
	DEFAULT_MAX_AGE_MS,
	lockFilePath,
	pidAlive,
	readHolder,
	holderIsStale,
	sleepSync,
	acquireCanaryLock,
	releaseCanaryLock,
};
