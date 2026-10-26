/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
	gitAvailable,
	makeTmpBase,
	makeRepoTracker,
	initRepo,
	runGit,
	plantIndexLock,
} from "./test-helpers/tmpRepo.js";

const {
	git,
	currentBranch,
	drainGitLockRecoveries,
	maybeRecoverStaleLock,
} = await import("./git.js");

/***
 * MARK: stale git-lock recovery repro
 * @description Root-cause repro for the poison-forever half of the pile-up:
 *   a crashed/killed git process orphans `.git/index.lock`, and from then on
 *   every index-writing git op (`checkout`, `add`, `commit`) fails
 *   identically — retrying the stage can never help. A lock with no live
 *   holder and an old mtime must be cleared with an audit entry and the
 *   operation retried; anything else (fresh lock, live holder) must fail
 *   loudly and leave the lock alone. Uses `checkout` because read-only ops
 *   such as `status` never take the index lock and succeed either way.
 ***/

function makeSwitchRepo(base, name, tracker) {
	const cwd = tracker.track(initRepo(path.join(base, name)));
	runGit(cwd, "branch", "other");
	return cwd;
}

describe.skipIf(!gitAvailable)("stale .git/index.lock recovery", () => {
	let base;
	const repos = makeRepoTracker();

	beforeAll(() => {
		base = makeTmpBase("kainbain-stale-lock-");
	});

	afterAll(() => {
		repos.cleanup();
		try {
			fs.rmSync(base, { recursive: true, force: true });
		} catch {
			// best-effort cleanup
		}
	});

	it("recovers a stale lock (no live holder) and retries the op", async () => {
		const cwd = makeSwitchRepo(base, "stale", repos);
		const lockPath = plantIndexLock(cwd, 120_000);
		expect(fs.existsSync(lockPath)).toBe(true);

		// The holder scan is machine-global by design (any live git anywhere
		// blocks recovery), so under parallel workers sibling suites' own
		// `git init` processes would read as holders and flake this test.
		// Stub the "no live holder" precondition; the meaningful assertions
		// below (lock removed, op retried, recovery journaled) still run
		// against the real filesystem and the real git binary.
		await git(cwd, ["checkout", "other"], {
			listLiveGitProcesses: async () => ({ holders: [], inconclusive: false }),
		});
		expect(await currentBranch(cwd)).toBe("other");

		// The orphan lock is gone and the recovery was journaled for audit.
		expect(fs.existsSync(lockPath)).toBe(false);
		const recoveries = await drainGitLockRecoveries(cwd);
		expect(recoveries).toHaveLength(1);
		expect(recoveries[0].lockPath).toBe(lockPath);
		expect(await drainGitLockRecoveries(cwd)).toHaveLength(0);
	});

	it("leaves a fresh lock alone and fails loudly", async () => {
		const cwd = makeSwitchRepo(base, "fresh", repos);
		const lockPath = plantIndexLock(cwd, 0);
		expect(fs.existsSync(lockPath)).toBe(true);

		await expect(git(cwd, ["checkout", "other"])).rejects.toThrow(
			/index\.lock/i,
		);

		// Fail closed: a lock that might belong to a live process is never
		// deleted, and nothing is journaled as recovered.
		expect(fs.existsSync(lockPath)).toBe(true);
		expect(await drainGitLockRecoveries(cwd)).toHaveLength(0);
	});

	it("refuses recovery when a live git process exists (never steal a lock)", async () => {
		const cwd = makeSwitchRepo(base, "liveholder", repos);
		const lockPath = plantIndexLock(cwd, 120_000);
		const liveScan = async () => ({
			holders: [{ pid: 424242, command: "git checkout" }],
			inconclusive: false,
		});

		const verdict = await maybeRecoverStaleLock(cwd, {
			listLiveGitProcesses: liveScan,
		});
		expect(verdict.recovered).toBe(false);
		expect(verdict.reason).toBe("live-holder");
		expect(fs.existsSync(lockPath)).toBe(true);
		expect(await drainGitLockRecoveries(cwd)).toHaveLength(0);
	});

	it("refuses recovery when the holder scan is inconclusive", async () => {
		const cwd = makeSwitchRepo(base, "unknownholder", repos);
		const lockPath = plantIndexLock(cwd, 120_000);

		const verdict = await maybeRecoverStaleLock(cwd, {
			listLiveGitProcesses: async () => ({ holders: [], inconclusive: true }),
		});
		expect(verdict.recovered).toBe(false);
		expect(verdict.reason).toBe("unknown-holder");
		expect(fs.existsSync(lockPath)).toBe(true);
	});

	it("reports no-lock-file without touching anything", async () => {
		const cwd = makeSwitchRepo(base, "nolock", repos);
		const verdict = await maybeRecoverStaleLock(cwd, {
			listLiveGitProcesses: async () => ({ holders: [], inconclusive: false }),
		});
		expect(verdict).toMatchObject({ recovered: false, reason: "no-lock-file" });
	});
});
