import { expect, test, describe, beforeEach, vi } from "vitest";
import { ClaimStore } from "./claimStore.js";

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
		claims = new ClaimStore({ ttlMs: 60_000, now: () => now });
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
