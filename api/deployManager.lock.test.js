import { describe, it, expect, afterEach } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { DeployManager } from "./deployManager.js";

/**
 * MARK: DeployManager lock-probe tests
 * @description Verifies the non-blocking `isDeployLocked` probe against a
 *   real flock-held lock file in a throwaway deploy dir. Deliberately NOT
 *   mocked (unlike `deployManager.test.js`, which stubs `spawn`): the probe
 *   shells out to the real `flock` binary. Skipped where `flock` is absent
 *   (non-Linux hosts) — the probe itself fails open there by design.
 * @example run `npm run test --prefix api -- deployManager.lock`
 */
function hasFlock() {
	try {
		const probe = spawnSync("flock", ["--version"], { stdio: "ignore" });
		return !probe.error && probe.status === 0;
	} catch {
		return false;
	}
}

function killHolderTree(child) {
	// Kill the whole process group: `sleep` inherits the lock fd, so killing
	// only the `flock` parent leaves the lock held.
	try {
		if (child.pid) process.kill(-child.pid, "SIGKILL");
	} catch {
		// No group (or already gone); fall back to the single pid.
	}
	try {
		child.kill("SIGKILL");
	} catch {
		// Already exited; teardown continues.
	}
}

const holders = [];
afterEach(() => {
	for (const child of holders.splice(0)) killHolderTree(child);
});

const describeIfFlock = hasFlock() ? describe : describe.skip;

describeIfFlock("DeployManager.isDeployLocked", () => {
	function managerWithLock(held) {
		const deployDir = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-lock-"));
		const lockFile = path.join(deployDir, "deploy.lock");
		fs.writeFileSync(lockFile, "");
		if (held) {
			// A live foreign holder: `flock <file> sleep` keeps the lock for
			// the lifetime of the child process. Detached so teardown can
			// kill the whole process group: `sleep` inherits the lock fd, so
			// killing `flock` alone would leave the lock held.
			const holder = spawn("flock", [lockFile, "sleep", "30"], {
				stdio: "ignore",
				detached: true,
			});
			holders.push(holder);
		}
		const manager = new DeployManager({ deployDir });
		return { manager, lockFile };
	}

	function awaitHeld(lockFile, attempts = 50) {
		// The holder grabs the lock asynchronously after spawn; poll until a
		// non-blocking acquire fails (or give up — the test then fails
		// loudly instead of asserting a false negative).
		for (let i = 0; i < attempts; i++) {
			const probe = spawnSync("flock", ["-n", lockFile, "-c", "true"], {
				stdio: "ignore",
			});
			if (!probe.error && probe.status !== 0) return true;
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
		}
		return false;
	}

	it("reads false when no lock file exists", () => {
		const deployDir = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-lock-"));
		const manager = new DeployManager({ deployDir });
		expect(manager.isDeployLocked()).toBe(false);
	});

	it("reads false when the lock is free", () => {
		const { manager } = managerWithLock(false);
		expect(manager.isDeployLocked()).toBe(false);
	});

	it("reads true while a foreign process holds the lock, false after release", () => {
		const { manager, lockFile } = managerWithLock(true);
		expect(awaitHeld(lockFile)).toBe(true);
		expect(manager.isDeployLocked()).toBe(true);
		for (const child of holders.splice(0)) killHolderTree(child);
		// Signal delivery and lock release race the next probe: poll briefly.
		let released = false;
		for (let i = 0; i < 100 && !released; i++) {
			released = !manager.isDeployLocked();
			if (!released) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
		}
		expect(released).toBe(true);
	});
});
