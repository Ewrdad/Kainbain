import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
	STALE_GIT_LOCK_AGE_MS,
	maybeRecoverStaleLock,
	_withLockCheckSuffix,
	drainGitLockRecoveries,
	formatGitLockRecoveryNotice,
} from "./staleLock.js";
import { GitError } from "./errors.js";

/***
 * MARK: git stale-lock unit tests
 * @description Direct tests for the `api/git/staleLock.js` fail-closed
 *   recovery ladder: lock age gating, machine-wide holder scans, journal
 *   audit trails, and error suffixes. Uses throwaway os.tmpdir() checkouts;
 *   no real git is ever invoked.
 ***/

/* eslint-disable security/detect-non-literal-fs-filename -- throwaway os.tmpdir() dirs only; no real git ever runs */
function plantLock(cwd, { ageMs = 120_000 } = {}) {
	fs.mkdirSync(path.join(cwd, ".git"), { recursive: true });
	const lockPath = path.join(cwd, ".git", "index.lock");
	fs.writeFileSync(lockPath, "");
	const stamp = new Date(Date.now() - ageMs);
	fs.utimesSync(lockPath, stamp, stamp);
	return lockPath;
}

const clearScan = async () => ({ holders: [], inconclusive: false });

describe("maybeRecoverStaleLock", () => {
	let cwd;
	beforeEach(() => {
		cwd = fs.mkdtempSync(path.join(os.tmpdir(), "kb-git-stalelock-"));
	});
	it("reports no-git-dir when the checkout has no .git", async () => {
		const res = await maybeRecoverStaleLock(cwd, {
			listLiveGitProcesses: clearScan,
		});
		expect(res.recovered).toBe(false);
		expect(res.reason).toBe("no-git-dir");
	});

	it("reports no-lock-file when no index.lock exists", async () => {
		fs.mkdirSync(path.join(cwd, ".git"), { recursive: true });
		const res = await maybeRecoverStaleLock(cwd, {
			listLiveGitProcesses: clearScan,
		});
		expect(res.recovered).toBe(false);
		expect(res.reason).toBe("no-lock-file");
	});

	it("resolves a linked-worktree .git file to its gitdir", async () => {
		const target = path.join(cwd, "real-gitdir");
		fs.mkdirSync(target, { recursive: true });
		fs.writeFileSync(path.join(cwd, ".git"), `gitdir: ${target}\n`);
		const lockPath = path.join(target, "index.lock");
		fs.writeFileSync(lockPath, "");
		const stamp = new Date(Date.now() - 120_000);
		fs.utimesSync(lockPath, stamp, stamp);
		const res = await maybeRecoverStaleLock(cwd, {
			listLiveGitProcesses: clearScan,
		});
		expect(res.recovered).toBe(true);
		expect(res.lockPath).toBe(lockPath);
		expect(fs.existsSync(lockPath)).toBe(false);
		await drainGitLockRecoveries(cwd);
	});

	it("recovers a provably stale lock and journals the recovery", async () => {
		const lockPath = plantLock(cwd);
		const res = await maybeRecoverStaleLock(cwd, {
			listLiveGitProcesses: clearScan,
		});
		expect(res.recovered).toBe(true);
		expect(res.reason).toBe("stale-recovered");
		expect(res.lockPath).toBe(lockPath);
		expect(fs.existsSync(lockPath)).toBe(false);
		const entries = await drainGitLockRecoveries(cwd);
		expect(entries).toHaveLength(1);
		expect(entries[0].lockPath).toBe(lockPath);
		expect(entries[0].verificationBasis).toContain("holder scan clear");
		// Drained: a second drain finds nothing.
		expect(await drainGitLockRecoveries(cwd)).toHaveLength(0);
	});

	it("leaves a fresh lock in place (may belong to a just-spawned process)", async () => {
		const lockPath = plantLock(cwd, { ageMs: 1000 });
		const res = await maybeRecoverStaleLock(cwd, {
			listLiveGitProcesses: clearScan,
		});
		expect(res.recovered).toBe(false);
		expect(res.reason).toBe("fresh-lock");
		expect(fs.existsSync(lockPath)).toBe(true);
		expect(await drainGitLockRecoveries(cwd)).toHaveLength(0);
	});

	it("leaves the lock in place when a live holder exists", async () => {
		const lockPath = plantLock(cwd);
		const res = await maybeRecoverStaleLock(cwd, {
			listLiveGitProcesses: async () => ({
				holders: [{ pid: 424242, command: "git checkout" }],
				inconclusive: false,
			}),
		});
		expect(res.recovered).toBe(false);
		expect(res.reason).toBe("live-holder");
		expect(fs.existsSync(lockPath)).toBe(true);
	});

	it("leaves the lock in place when the holder scan is inconclusive", async () => {
		const lockPath = plantLock(cwd);
		const res = await maybeRecoverStaleLock(cwd, {
			listLiveGitProcesses: async () => ({ holders: [], inconclusive: true }),
		});
		expect(res.recovered).toBe(false);
		expect(res.reason).toBe("unknown-holder");
		expect(fs.existsSync(lockPath)).toBe(true);
	});
});

describe("_withLockCheckSuffix", () => {
	it("names the live holder in the augmented error", () => {
		const err = new GitError("fatal: Unable to create index.lock", { code: 128 });
		const out = _withLockCheckSuffix(err, {
			reason: "live-holder",
			holders: [{ pid: 1, command: "git checkout" }],
		});
		expect(out).toBeInstanceOf(GitError);
		expect(out.message).toContain("live git process");
		expect(out.code).toBe(128);
	});

	it("explains fresh-lock and unknown-holder refusals", () => {
		const err = new GitError("fatal: lock", { code: 128 });
		expect(_withLockCheckSuffix(err, { reason: "fresh-lock" }).message).toContain(
			"fresh",
		);
		expect(
			_withLockCheckSuffix(err, { reason: "unknown-holder" }).message,
		).toContain("inconclusive");
	});

	it("falls back to a generic suffix for unrecognized reasons", () => {
		const err = new GitError("fatal: lock", { code: 128 });
		expect(
			_withLockCheckSuffix(err, { reason: "no-lock-file" }).message,
		).toContain("no recoverable stale lock");
	});
});

describe("formatGitLockRecoveryNotice", () => {
	it("renders a one-line audit entry with the verification basis", () => {
		const line = formatGitLockRecoveryNotice({
			lockPath: "/r/.git/index.lock",
			ageMs: 87_000,
			verificationBasis: "holder scan clear",
		});
		expect(line).toContain("/r/.git/index.lock");
		expect(line).toContain("87s");
		expect(line).toContain("holder scan clear");
	});

	it("tolerates a bare entry", () => {
		expect(formatGitLockRecoveryNotice({})).toContain(".git/index.lock");
	});
});

describe("STALE_GIT_LOCK_AGE_MS", () => {
	it("is a 30s threshold", () => {
		expect(STALE_GIT_LOCK_AGE_MS).toBe(30_000);
	});
});
/* eslint-enable security/detect-non-literal-fs-filename */
