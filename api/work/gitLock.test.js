import { describe, it, expect } from "vitest";

const {
	withRepoGitLock,
	normalizeRepoKey,
	getGitLockStats,
} = await import("./gitLock.js");

/***
 * MARK: per-repo git mutex tests
 * @description The single serialization gate behind every engine git op:
 *   same-repo work strictly serializes, different repos proceed in
 *   parallel, and the lock always releases (even on throw) so one failure
 *   can never wedge later git work.
 ***/

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("withRepoGitLock", () => {
	it("serializes concurrent work on the same repository", async () => {
		const order = [];
		const slow = async (name) => {
			order.push(`${name}:enter`);
			await sleep(25);
			order.push(`${name}:exit`);
			return name;
		};
		const [a, b] = await Promise.all([
			withRepoGitLock("gate-test-same-repo", () => slow("a")),
			withRepoGitLock("gate-test-same-repo", () => slow("b")),
		]);
		expect(new Set([a, b])).toEqual(new Set(["a", "b"]));
		// Strictly serial: the second body starts only after the first ends.
		expect(order[1]).toMatch(/:exit$/);
		expect(order[2]).toMatch(/:enter$/);
		expect(order).toHaveLength(4);
	});

	it("lets different repositories proceed in parallel", async () => {
		let inFlight = 0;
		let maxInFlight = 0;
		const probe = async () => {
			inFlight += 1;
			maxInFlight = Math.max(maxInFlight, inFlight);
			await sleep(25);
			inFlight -= 1;
		};
		await Promise.all([
			withRepoGitLock("gate-test-repo-parallel-a", probe),
			withRepoGitLock("gate-test-repo-parallel-b", probe),
		]);
		expect(maxInFlight).toBe(2);
	});

	it("releases the lock when the body throws", async () => {
		await expect(
			withRepoGitLock("gate-test-repo-throw", async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
		// The next acquisition must not wedge behind the failed one.
		await expect(
			withRepoGitLock("gate-test-repo-throw", async () => "recovered"),
		).resolves.toBe("recovered");
	});

	it("counts waits when demand actually contends", async () => {
		const key = "gate-test-repo-contention-probe";
		const normalizedKey = await normalizeRepoKey(key);
		const before = getGitLockStats().repos[normalizedKey];
		const waitsBefore = before?.waits || 0;
		let releaseGate;
		const gateHold = new Promise((resolve) => {
			releaseGate = resolve;
		});
		let gateStarted;
		const gateReady = new Promise((resolve) => {
			gateStarted = resolve;
		});
		const gate = withRepoGitLock(key, async () => {
			gateStarted();
			await gateHold;
		});
		await gateReady;
		const second = withRepoGitLock(key, async () => "second");
		for (let i = 0; i < 100; i++) {
			if ((getGitLockStats().repos[normalizedKey]?.waits || 0) > waitsBefore) break;
			await sleep(10);
		}
		releaseGate();
		await Promise.all([gate, second]);
		const after = getGitLockStats().repos[normalizedKey];
		expect(after.waits).toBeGreaterThan(waitsBefore);
		expect(after.acquisitions).toBeGreaterThanOrEqual(2);
	});
});
