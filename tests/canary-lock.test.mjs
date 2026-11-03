import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
	LOCK_FILENAME,
	DEFAULT_MAX_WAIT_MS,
	lockFilePath,
	pidAlive,
	readHolder,
	holderIsStale,
	acquireCanaryLock,
	releaseCanaryLock,
} = require("../canary-e2e/canary-lock.js");

/***
 * MARK: canary-lock tests
 * @description Hermetic tests for the host-wide canary mutex
 *   (canary-e2e/canary-lock.js). Every test points the lock at a fresh mkdtemp
 *   dir via KAINBAIN_CANARY_LOCK_DIR, so no real suite lock is ever touched.
 *   The only live PIDs used are the test process itself (alive) and a
 *   reaped `true` child (dead).
 * @example run `node --test tests/canary-lock.test.mjs`
 ***/

function isolatedEnv() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-canary-lock-"));
	return { env: { KAINBAIN_CANARY_LOCK_DIR: dir }, dir };
}

function cleanup(dir) {
	fs.rmSync(dir, { recursive: true, force: true });
}

// A deterministically dead PID: spawn `true`, wait for exit, keep its pid.
function deadPid() {
	const child = spawnSync("true", { stdio: "ignore" });
	assert.equal(typeof child.pid, "number");
	assert.equal(pidAlive(child.pid), false);
	return child.pid;
}

const silentLog = () => {};

describe("lockFilePath", () => {
	it("honours KAINBAIN_CANARY_LOCK_DIR", () => {
		assert.equal(lockFilePath({ KAINBAIN_CANARY_LOCK_DIR: "/tmp/x" }), path.join("/tmp/x", LOCK_FILENAME));
	});

	it("defaults under the home directory", () => {
		assert.equal(lockFilePath({}), path.join(os.homedir(), ".kainbain", LOCK_FILENAME));
	});
});

describe("pidAlive", () => {
	it("sees this process as alive and a reaped child as dead", () => {
		assert.equal(pidAlive(process.pid), true);
		assert.equal(pidAlive(deadPid()), false);
	});
});

describe("readHolder", () => {
	it("returns null for a missing or corrupt lock", () => {
		const { env, dir } = isolatedEnv();
		try {
			assert.equal(readHolder(lockFilePath(env)), null);
			fs.writeFileSync(lockFilePath(env), "not-json\n");
			assert.equal(readHolder(lockFilePath(env)), null);
		} finally {
			cleanup(dir);
		}
	});

	it("returns the holder record for a valid lock", () => {
		const { env, dir } = isolatedEnv();
		try {
			fs.writeFileSync(lockFilePath(env), JSON.stringify({ pid: 4242, startedAt: 1700000000000 }));
			assert.deepEqual(readHolder(lockFilePath(env)), { pid: 4242, startedAt: 1700000000000 });
		} finally {
			cleanup(dir);
		}
	});
});

describe("holderIsStale", () => {
	it("is stale without a record, past max age, or with a dead pid", () => {
		const now = Date.now();
		assert.equal(holderIsStale(null, now, 1000), true);
		assert.equal(holderIsStale({ pid: process.pid, startedAt: now - 2000 }, now, 1000), true);
		assert.equal(holderIsStale({ pid: deadPid(), startedAt: now }, now, 60 * 60 * 1000), true);
	});

	it("is live for a fresh record owned by a running process", () => {
		assert.equal(
			holderIsStale({ pid: process.pid, startedAt: Date.now() }, Date.now(), 60 * 60 * 1000),
			false,
		);
	});
});

describe("acquireCanaryLock / releaseCanaryLock", () => {
	it("acquires, records our pid, and releases", () => {
		const { env, dir } = isolatedEnv();
		try {
			const acquired = acquireCanaryLock({ env, logFn: silentLog });
			assert.equal(acquired.lockPath, lockFilePath(env));
			assert.deepEqual(readHolder(lockFilePath(env)).pid, process.pid);
			assert.equal(releaseCanaryLock({ env }), true);
			assert.equal(fs.existsSync(lockFilePath(env)), false);
			assert.equal(releaseCanaryLock({ env }), false);
		} finally {
			cleanup(dir);
		}
	});

	it("refuses to release a foreign holder's lock", () => {
		const { env, dir } = isolatedEnv();
		try {
			fs.mkdirSync(path.dirname(lockFilePath(env)), { recursive: true });
			fs.writeFileSync(lockFilePath(env), JSON.stringify({ pid: deadPid() + 100000, startedAt: Date.now() }));
			assert.equal(releaseCanaryLock({ env }), false);
			assert.equal(fs.existsSync(lockFilePath(env)), true);
		} finally {
			cleanup(dir);
		}
	});

	it("a live holder makes a second acquire fail fast with the holder pid", () => {
		const { env, dir } = isolatedEnv();
		try {
			acquireCanaryLock({ env, logFn: silentLog });
			assert.throws(
				() =>
					acquireCanaryLock({
						env,
						timeoutMs: 60,
						pollMs: 5,
						sleepFn: () => {},
						logFn: silentLog,
					}),
				/error/i,
			);
			try {
				acquireCanaryLock({
					env,
					timeoutMs: 60,
					pollMs: 5,
					sleepFn: () => {},
					logFn: silentLog,
				});
				assert.fail("expected the lock wait to time out");
			} catch (error) {
				assert.match(error.message, new RegExp(`pid ${process.pid}`));
			}
		} finally {
			releaseCanaryLock({ env });
			cleanup(dir);
		}
	});

	it("takes over a stale (dead pid) lock instead of waiting", () => {
		const { env, dir } = isolatedEnv();
		try {
			fs.mkdirSync(path.dirname(lockFilePath(env)), { recursive: true });
			fs.writeFileSync(lockFilePath(env), JSON.stringify({ pid: deadPid(), startedAt: Date.now() }));
			const acquired = acquireCanaryLock({ env, timeoutMs: 60, pollMs: 5, logFn: silentLog });
			assert.equal(acquired.waitedMs < DEFAULT_MAX_WAIT_MS, true);
			assert.deepEqual(readHolder(lockFilePath(env)).pid, process.pid);
		} finally {
			releaseCanaryLock({ env });
			cleanup(dir);
		}
	});

	it("treats a corrupt lock file as stale and proceeds", () => {
		const { env, dir } = isolatedEnv();
		try {
			fs.mkdirSync(path.dirname(lockFilePath(env)), { recursive: true });
			fs.writeFileSync(lockFilePath(env), "garbage}\n");
			acquireCanaryLock({ env, timeoutMs: 1000, pollMs: 5, logFn: silentLog });
			assert.deepEqual(readHolder(lockFilePath(env)).pid, process.pid);
		} finally {
			releaseCanaryLock({ env });
			cleanup(dir);
		}
	});
});
