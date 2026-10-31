import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	acquireUpdateLock,
	bootstrapUpdateState,
	markUpdatePendingBoot,
	markUpdateSuccess,
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
