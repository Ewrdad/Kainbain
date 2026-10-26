import { expect, test, describe, beforeEach, vi } from "vitest";
import { ClaimStore } from "./claimStore.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const tmpClaimState = () =>
	path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kb-claim-test-")), "claims.json");



/***
 * MARK: ClaimStore Unit Tests
 * @description Verifies the D1 fencing contract at store level: mutual
 *   exclusion (409 with holder), monotonic backend-issued epochs (never
 *   wall-clock), stale completions rejected, retried reports idempotent,
 *   expiry re-opens the task with a higher epoch, heartbeats renew.
 ***/
describe("ClaimStore", () => {
	let now;
	let claims;
	beforeEach(() => {
		now = 1_000_000;
		claims = new ClaimStore({ ttlMs: 60_000, now: () => now, stateFile: tmpClaimState() });
	});

	test("issues an epoch-1 claim with a stable execution ID", () => {
		const { executionId, epoch } = claims.claim("t1", "runner-a");
		expect(typeof executionId).toBe("string");
		expect(epoch).toBe(1);
		expect(claims.describe("t1")).toMatchObject({
			runnerId: "runner-a",
			executionId,
			epoch: 1,
		});
	});

	test("restart drops holds but keeps epochs and completions (Phase 4 gate)", () => {
		const file = tmpClaimState();
		const boot1 = new ClaimStore({ ttlMs: 60_000, now: () => now, stateFile: file });
		const first = boot1.claim("t1", "runner-a");
		const done = boot1.claim("t2", "runner-b");
		boot1.complete("t2", done.executionId, done.epoch);
		// Simulated restart: new store, same file. No holds survive (the
		// in-flight task re-queues as interrupted), but fencing does.
		const boot2 = new ClaimStore({ ttlMs: 60_000, now: () => now, stateFile: file });
		expect(boot2.describe("t1")).toBeNull();
		expect(boot2.describe("t2")).toBeNull();
		// The zombie's late completion is still stale, not a reopening.
		expect(() => boot2.complete("t1", first.executionId, first.epoch)).toThrowError(
			/Stale execution/,
		);
		// Re-claim fences HIGHER than any pre-restart epoch (R01).
		const second = boot2.claim("t1", "runner-c");
		expect(second.epoch).toBeGreaterThan(first.epoch);
		// Pre-restart completions stay idempotent no-ops, never re-applied.
		expect(boot2.complete("t2", done.executionId, done.epoch)).toMatchObject({
			accepted: true,
			duplicate: true,
		});
	});

	test("counts live holds fleet-wide and per project, expiry-aware", () => {
		claims.claim("t1", "runner-a", "p1");
		claims.claim("t2", "runner-b", "p1");
		claims.claim("t3", "runner-c", "p2");
		expect(claims.countLiveHolds()).toBe(3);
		expect(claims.countLiveHolds({ projectId: "p1" })).toBe(2);
		expect(claims.countLiveHolds({ projectId: "p2" })).toBe(1);
		expect(claims.countLiveHolds({ projectId: "nope" })).toBe(0);
		// Lazy expiry: lapsed holds stop counting with no sweeper.
		now += 60_001;
		expect(claims.countLiveHolds()).toBe(0);
		expect(claims.countLiveHolds({ projectId: "p1" })).toBe(0);
	});

	test("rejects a double claim with 409 and the holder", () => {
		claims.claim("t1", "runner-a");
		try {
			claims.claim("t1", "runner-b");
			expect.unreachable();
		} catch (err) {
			expect(err.statusCode).toBe(409);
			expect(err.code).toBe("CLAIM_CONFLICT");
			expect(err.holder).toMatchObject({ runnerId: "runner-a", epoch: 1 });
		}
	});

	test("accepts completion with the right epoch and rejects stale retries", () => {
		const first = claims.claim("t1", "runner-a");
		const done = claims.complete("t1", first.executionId, first.epoch);
		expect(done).toEqual({ accepted: true, duplicate: false });
		// Same execution reported again is an idempotent no-op.
		expect(claims.complete("t1", first.executionId, first.epoch)).toEqual({
			accepted: true,
			duplicate: true,
		});
		// A new claim moves the epoch. Re-reporting the accepted execution
		// stays an idempotent no-op even across claims (exactly-once
		// ingestion keyed by execution ID)...
		const second = claims.claim("t1", "runner-b");
		expect(second.epoch).toBe(2);
		expect(claims.complete("t1", first.executionId, first.epoch)).toEqual({
			accepted: true,
			duplicate: true,
		});
		// ...while a wrong epoch for the CURRENT execution is stale.
		try {
			claims.complete("t1", second.executionId, first.epoch);
			expect.unreachable();
		} catch (err) {
			expect(err.statusCode).toBe(409);
			expect(err.code).toBe("STALE_EPOCH");
		}
	});

	test("expiry re-opens the task with a higher epoch (zombie fencing)", () => {
		const first = claims.claim("t1", "runner-a");
		now += 60_001;
		const second = claims.claim("t1", "runner-b");
		expect(second.epoch).toBeGreaterThan(first.epoch);
		// The partitioned first holder's late completion is stale.
		try {
			claims.complete("t1", first.executionId, first.epoch);
			expect.unreachable();
		} catch (err) {
			expect(err.code).toBe("STALE_EPOCH");
		}
	});

	test("heartbeat renews the lease; unknown executions are stale", () => {
		const { executionId } = claims.claim("t1", "runner-a");
		now += 59_000;
		claims.heartbeat("t1", executionId);
		now += 59_000;
		// Renewed at t+59s, so still held at t+118s (ttl 60s each).
		try {
			claims.claim("t1", "runner-b");
			expect.unreachable();
		} catch (err) {
			expect(err.code).toBe("CLAIM_CONFLICT");
		}
		try {
			claims.heartbeat("t1", "no-such-execution");
			expect.unreachable();
		} catch (err) {
			expect(err.code).toBe("STALE_EPOCH");
		}
	});

	test("release frees the task without completing it", () => {
		const { executionId } = claims.claim("t1", "runner-a");
		expect(claims.release("t1", executionId)).toMatchObject({ released: true });
		expect(claims.describe("t1")).toBe(null);
		const next = claims.claim("t1", "runner-b");
		expect(next.epoch).toBe(2);
	});

	test("validates claim arguments", () => {
		for (const args of [[], ["", "r"], ["t", ""]]) {
			try {
				claims.claim(...args);
				expect.unreachable();
			} catch (err) {
				expect(err.statusCode).toBe(400);
				expect(err.code).toBe("INVALID_CLAIM_ARGS");
			}
		}
	});
});
