import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	UPDATE_LOCK_FILE,
	acquireUpdateLock,
	bootstrapUpdateState,
	markUpdatePendingBoot,
	markUpdateSuccess,
	pruneOldReleases,
	readUpdateState,
	writeUpdateState,
} from "./updates/state.js";

const freshRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), "kb-updstate-"));

describe("readUpdateState / writeUpdateState", () => {
	it("starts idle and round-trips", () => {
		const root = freshRoot();
		assert.deepEqual(readUpdateState(root).status, "idle");
		writeUpdateState(root, { status: "pending-boot", to: "0.2.0", bootAttempts: 1 });
		const got = readUpdateState(root);
		assert.equal(got.status, "pending-boot");
		assert.equal(got.to, "0.2.0");
		fs.rmSync(root, { recursive: true, force: true });
	});
});

describe("acquireUpdateLock", () => {
	it("grants one holder and releases", () => {
		const root = freshRoot();
		const release = acquireUpdateLock(root);
		assert.ok(release, "first acquire wins");
		assert.equal(acquireUpdateLock(root), null, "second acquire loses");
		release();
		assert.ok(acquireUpdateLock(root), "re-acquire works after release")?.();
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("recovers a stale lock left by a dead process instead of bricking updates", () => {
		const root = freshRoot();
		// Dead pid (exceedingly unlikely to be alive) in the new format.
		fs.writeFileSync(
			path.join(root, UPDATE_LOCK_FILE),
			JSON.stringify({ pid: 2147483647, at: new Date().toISOString() }),
		);
		const release = acquireUpdateLock(root);
		assert.ok(release, "stale lock is stolen, not fatal");
		release();
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("recovers the legacy bare-pid lock format when its holder is gone", () => {
		const root = freshRoot();
		fs.writeFileSync(path.join(root, UPDATE_LOCK_FILE), "2147483647");
		const release = acquireUpdateLock(root);
		assert.ok(release, "legacy stale lock is stolen, not fatal");
		release();
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("keeps a live holder's lock (same-process contention still loses)", () => {
		const root = freshRoot();
		const release = acquireUpdateLock(root);
		assert.ok(release);
		// Our own pid is alive: a second overlapping updater must back off.
		assert.equal(acquireUpdateLock(root), null, "live lock is not stolen");
		release();
		fs.rmSync(root, { recursive: true, force: true });
	});
});

describe("pruneOldReleases", () => {
	const releaseTree = (root, versions) => {
		for (const version of versions) {
			fs.mkdirSync(path.join(root, "releases", version, "unpacked"), { recursive: true });
		}
	};

	it("keeps current + previous and drops older versions", () => {
		const root = freshRoot();
		releaseTree(root, ["0.1.0", "0.2.0", "0.3.0"]);
		fs.symlinkSync(path.join(root, "releases", "0.3.0", "unpacked"), path.join(root, "current"));
		fs.symlinkSync(path.join(root, "releases", "0.2.0", "unpacked"), path.join(root, "previous"));
		const kept = pruneOldReleases({ installRoot: root });
		assert.deepEqual([...kept].sort(), ["0.2.0", "0.3.0"]);
		assert.ok(!fs.existsSync(path.join(root, "releases", "0.1.0")));
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("keeps everything when no link resolves inside releases/ (fail-safe)", () => {
		const root = freshRoot();
		releaseTree(root, ["0.1.0"]);
		const kept = pruneOldReleases({ installRoot: root });
		assert.deepEqual(kept, ["0.1.0"]);
		assert.ok(fs.existsSync(path.join(root, "releases", "0.1.0")));
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("prunes superseded versions on markUpdateSuccess, keeps current + previous", () => {
		const root = freshRoot();
		releaseTree(root, ["0.0.9", "0.1.0", "0.2.0"]);
		fs.symlinkSync(path.join(root, "releases", "0.2.0", "unpacked"), path.join(root, "current"));
		fs.symlinkSync(path.join(root, "releases", "0.1.0", "unpacked"), path.join(root, "previous"));
		markUpdateSuccess({ installRoot: root, version: "0.2.0" });
		assert.equal(readUpdateState(root).status, "success");
		assert.ok(!fs.existsSync(path.join(root, "releases", "0.0.9")), "superseded 0.0.9 is pruned");
		assert.ok(fs.existsSync(path.join(root, "releases", "0.1.0")), "rollback target 0.1.0 is kept");
		assert.ok(fs.existsSync(path.join(root, "releases", "0.2.0")), "current 0.2.0 is kept");
		fs.rmSync(root, { recursive: true, force: true });
	});
});

describe("bootstrapUpdateState", () => {
	it("passes through when idle", () => {
		const root = freshRoot();
		const got = bootstrapUpdateState({ installRoot: root });
		assert.equal(got.action, "boot");
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("counts pending-boot attempts without rolling back early", () => {
		const root = freshRoot();
		fs.symlinkSync("/tmp/new-target", path.join(root, "current"));
		markUpdatePendingBoot({ installRoot: root, from: "/tmp/old", to: "0.2.0" });
		const first = bootstrapUpdateState({ installRoot: root });
		assert.equal(first.action, "boot");
		assert.equal(first.state.bootAttempts, 1);
		const second = bootstrapUpdateState({ installRoot: root });
		assert.equal(second.action, "boot");
		assert.equal(second.state.bootAttempts, 2);
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("rolls back to previous on the third crashed boot", () => {
		const root = freshRoot();
		const prevTarget = path.join(root, "releases", "0.1.0", "unpacked");
		const newTarget = path.join(root, "releases", "0.2.0", "unpacked");
		fs.mkdirSync(prevTarget, { recursive: true });
		fs.mkdirSync(newTarget, { recursive: true });
		fs.symlinkSync(newTarget, path.join(root, "current"));
		fs.symlinkSync(prevTarget, path.join(root, "previous"));
		markUpdatePendingBoot({ installRoot: root, from: "0.1.0", to: "0.2.0" });
		bootstrapUpdateState({ installRoot: root });
		bootstrapUpdateState({ installRoot: root });
		const rolled = bootstrapUpdateState({ installRoot: root });
		assert.equal(rolled.action, "rolled-back");
		assert.equal(rolled.state.status, "rolled-back");
		assert.equal(fs.readlinkSync(path.join(root, "current")), prevTarget);
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("marks success after a good boot", () => {
		const root = freshRoot();
		markUpdatePendingBoot({ installRoot: root, from: "0.1.0", to: "0.2.0" });
		markUpdateSuccess({ installRoot: root, version: "0.2.0" });
		assert.equal(readUpdateState(root).status, "success");
		fs.rmSync(root, { recursive: true, force: true });
	});
});
