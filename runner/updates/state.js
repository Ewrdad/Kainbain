import fs from "node:fs";
import path from "node:path";

/***
 * MARK: updateState
 * @description Durable update-state bookkeeping for the runner self-update
 *   channel (Option A, ADR 0012). State lives beside the install root
 *   (update-state.json): pending-version markers, boot-attempt counters for
 *   failed-boot rollback, and an O_EXCL lock so heartbeat + idle paths can
 *   never run two updaters at once.
 * @example readUpdateState('/opt/runner') => { status: 'idle', ... }
 ***/
export const UPDATE_STATE_FILE = "update-state.json";
export const UPDATE_LOCK_FILE = "update.lock";
export const MAX_BOOT_ATTEMPTS = 3;

export const defaultInstallRoot = ({ workRoot } = {}) => {
	const base = String(workRoot || process.env.KAINBAIN_RUNNER_WORK_ROOT || "runner-work");
	return path.resolve(base, "..", "runner-install");
};

export const readUpdateState = (installRoot) => {
	try {
		const raw = fs.readFileSync(path.join(installRoot, UPDATE_STATE_FILE), "utf8");
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === "object") return parsed;
	} catch {
		// Absent or unreadable: idle, never fatal.
	}
	return { status: "idle", bootAttempts: 0 };
};

export const writeUpdateState = (installRoot, state) => {
	fs.mkdirSync(installRoot, { recursive: true });
	const tmp = path.join(installRoot, `${UPDATE_STATE_FILE}.tmp`);
	fs.writeFileSync(tmp, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }));
	fs.renameSync(tmp, path.join(installRoot, UPDATE_STATE_FILE));
};

// A lock left behind by a crashed updater must not brick every future
// update (the old O_EXCL file persisted forever). A contender is stale
// when its pid is gone, or when its timestamp is older than this — either
// way the new holder removes it and retries once.
export const STALE_UPDATE_LOCK_MS = 2 * 60 * 60 * 1000;

// Lock timestamps are epoch millis. Older writers stored an ISO string;
// Date.parse keeps those locks time-recoverable too, and anything
// unparseable degrades to pid-only recovery (never a brick).
const readLockTime = (at) => {
	if (typeof at === "number" && Number.isFinite(at)) return at;
	const asNumber = Number(at);
	if (Number.isFinite(asNumber) && asNumber > 0) return asNumber;
	const asDate = Date.parse(String(at || ""));
	return Number.isFinite(asDate) ? asDate : 0;
};

const readLockOwner = (lockPath, fsImpl = fs) => {
	let raw = null;
	try {
		raw = fsImpl.readFileSync(lockPath, "utf8");
	} catch {
		return null;
	}
	try {
		const parsed = JSON.parse(String(raw));
		if (parsed && typeof parsed === "object") return { pid: Number(parsed.pid) || null, at: readLockTime(parsed.at) };
	} catch {
		// Legacy format: the file held a bare pid string.
	}
	const pid = Number(String(raw || "").trim());
	return { pid: Number.isFinite(pid) && pid > 0 ? pid : null, at: 0 };
};

const lockOwnerAlive = (pid) => {
	if (!pid || !Number.isFinite(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		// Only EPERM proves a live holder (exists, but not ours to
		// signal). ESRCH, EINVAL, out-of-range pids — anything else —
		// means the owner is gone, so the lock is stale and recyclable.
		return err?.code === "EPERM";
	}
};

// Lock so two updater invocations (heartbeat + idle) never overlap. Returns
// a release function, or null when another updater holds the lock. A stale
// lock (crashed holder) is removed and retried once, so one crash can
// never brick the update channel — the worst case is a single skipped check.
export const acquireUpdateLock = (installRoot, { now = Date.now(), fsImpl = fs } = {}) => {
	fsImpl.mkdirSync(installRoot, { recursive: true });
	const lockPath = path.join(installRoot, UPDATE_LOCK_FILE);
	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			const fd = fsImpl.openSync(lockPath, "wx");
			fsImpl.writeFileSync(fd, JSON.stringify({ pid: process.pid, at: now }));
			let released = false;
			return () => {
				if (released) return;
				released = true;
				try { fsImpl.closeSync(fd); } catch { /* already closed */ }
				try { fsImpl.rmSync(lockPath, { force: true }); } catch { /* best effort */ }
			};
		} catch {
			// Contended: only steal it when the holder is provably stale.
			const owner = readLockOwner(lockPath, fsImpl);
			const stale = !lockOwnerAlive(owner?.pid) || (owner?.at > 0 && now - owner.at > STALE_UPDATE_LOCK_MS);
			if (!stale) return null;
			try { fsImpl.rmSync(lockPath, { force: true }); } catch { return null; }
		}
	}
	return null;
};

// Startup gate: called by main.js before the daemon boots. A fresh update
// flips state to pending-boot; only a successful heartbeat (markBooted)
// clears it. Three crashed boots in a row flip current/previous back and
// report rolled-back so the fleet never bricks on a bad release.
export const bootstrapUpdateState = ({ installRoot, readlink = (p) => fs.readlinkSync(p), fsImpl = fs } = {}) => {
	const state = readUpdateState(installRoot);
	if (state.status !== "pending-boot") return { action: "boot", state };
	const attempts = Number(state.bootAttempts || 0) + 1;
	if (attempts >= MAX_BOOT_ATTEMPTS) {
		try {
			const currentTarget = readlink(path.join(installRoot, "current"));
			const previousTarget = readlink(path.join(installRoot, "previous"));
			if (previousTarget && previousTarget !== currentTarget) {
				const tmp = path.join(installRoot, "current.tmp");
				try { fsImpl.rmSync(tmp, { force: true }); } catch { /* ignore */ }
				fsImpl.symlinkSync(previousTarget, tmp);
				fsImpl.renameSync(tmp, path.join(installRoot, "current"));
			}
		} catch {
			// Rollback best-effort: a missing previous link keeps the new
			// version in place and reports instead of crashing boot.
		}
		const rolled = { ...state, status: "rolled-back", bootAttempts: attempts };
		writeUpdateState(installRoot, rolled);
		return { action: "rolled-back", state: rolled };
	}
	const pending = { ...state, status: "pending-boot", bootAttempts: attempts };
	writeUpdateState(installRoot, pending);
	return { action: "boot", state: pending };
};

export const markUpdatePendingBoot = ({ installRoot, from, to }) => {
	writeUpdateState(installRoot, { status: "pending-boot", from, to, bootAttempts: 0 });
};

// Drops every `releases/<v>` directory except the ones `current` and
// `previous` point at, so routine monthly releases cannot grow the disk
// without bound. Best-effort and never throws: pruning must never fail a
// boot. Returns the kept version names.
export const pruneOldReleases = ({ installRoot, fsImpl = fs } = {}) => {
	const releasesDir = path.join(installRoot, "releases");
	let entries = [];
	try {
		entries = fsImpl.readdirSync(releasesDir);
	} catch {
		return [];
	}
	const live = new Set();
	for (const link of ["current", "previous"]) {
		let target = null;
		try {
			target = fsImpl.readlinkSync(path.join(installRoot, link));
		} catch {
			continue;
		}
		const abs = path.resolve(installRoot, String(target));
		const rel = path.relative(releasesDir, abs);
		if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) live.add(rel.split(path.sep)[0]);
	}
	// Fail-safe: when neither link resolves inside releases/ (fresh
	// install, dangling links, hand-made trees), keep everything rather
	// than garbage-collecting the only copies on disk.
	if (live.size === 0) return [...entries];
	const kept = [];
	for (const entry of entries) {
		if (live.has(entry)) {
			kept.push(entry);
			continue;
		}
		try {
			fsImpl.rmSync(path.join(releasesDir, entry), { recursive: true, force: true });
		} catch {
			// Best effort: a leftover dir is wasted disk, not a failed boot.
		}
	}
	return kept;
};

// Called after the first successful heartbeat on the new version: the
// release boots, so GC may drop everything except current + previous.
export const markUpdateSuccess = ({ installRoot, version }) => {
	writeUpdateState(installRoot, { status: "success", version, bootAttempts: 0 });
	pruneOldReleases({ installRoot });
};
