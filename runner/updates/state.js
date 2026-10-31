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

// Lock so two updater invocations (heartbeat + idle) never overlap. Returns
// a release function, or null when another updater holds the lock.
export const acquireUpdateLock = (installRoot) => {
	fs.mkdirSync(installRoot, { recursive: true });
	const lockPath = path.join(installRoot, UPDATE_LOCK_FILE);
	let fd = null;
	try {
		fd = fs.openSync(lockPath, "wx");
		fs.writeFileSync(fd, String(process.pid));
	} catch {
		return null;
	}
	let released = false;
	return () => {
		if (released) return;
		released = true;
		try { fs.closeSync(fd); } catch { /* already closed */ }
		try { fs.rmSync(lockPath, { force: true }); } catch { /* best effort */ }
	};
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

// Called after the first successful heartbeat on the new version: the
// release boots, so GC may drop everything except current + previous.
export const markUpdateSuccess = ({ installRoot, version }) => {
	writeUpdateState(installRoot, { status: "success", version, bootAttempts: 0 });
};
