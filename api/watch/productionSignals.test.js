// Domain: Watching the Work — WP2 signal unit tests on synthetic stores.
// No app imports: productionSignals.js is dependency-free, so these run
// without isolated roots (the global setup backstop still applies).
import { describe, it, expect, beforeEach } from "vitest";
import {
	CLAIM_EXCLUDED_REASONS,
	FENCING_REASONS,
	claimSuccessRate,
	freshProductionSignals,
	percentile,
	recordClaimAttempt,
	recordClaimConflict,
	recordClaimError,
	recordClaimExcluded,
	recordClaimSuccess,
	recordDispatchLatency,
	recordDispatchMiss,
	recordFencing,
	recordFleetCapExhausted,
	recordProjectClaim,
	recordProjectCompletion,
	recordSkillSizeCapOmission,
	recordWorktreeEviction,
	resetProcessSignals,
	signalsFor,
	summarizeProductionSignals,
} from "./productionSignals.js";

beforeEach(() => {
	resetProcessSignals();
});

describe("percentile", () => {
	it("returns null when empty", () => {
		expect(percentile([], 50)).toBeNull();
	});

	it("computes exact p50/p95/p99 with interpolation", () => {
		const samples = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
		expect(percentile(samples, 50)).toBe(55);
		expect(percentile(samples, 95)).toBeCloseTo(95.5, 5);
		expect(percentile(samples, 99)).toBeCloseTo(99.1, 5);
	});

	it("reads {t, ms} timestamped samples", () => {
		expect(percentile([{ t: 1, ms: 4 }, { t: 2, ms: 8 }], 50)).toBe(6);
	});
});

describe("dispatch latency", () => {
	it("stays null until the first sample, then tracks p50/p95/p99", () => {
		const signals = freshProductionSignals();
		let summary = summarizeProductionSignals(signals);
		expect(summary.dispatchLatency).toMatchObject({
			count: 0,
			p50Ms: null,
			p95Ms: null,
			p99Ms: null,
		});
		for (const ms of [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
			recordDispatchLatency(signals, ms, { now: 1000 });
		}
		summary = summarizeProductionSignals(signals);
		expect(summary.dispatchLatency.count).toBe(10);
		expect(summary.dispatchLatency.p50Ms).toBe(55);
		expect(summary.dispatchLatency.p95Ms).toBeCloseTo(95.5, 5);
		expect(summary.dispatchLatency.p99Ms).toBeCloseTo(99.1, 5);
	});

	it("slices samples to the load window", () => {
		const signals = freshProductionSignals();
		recordDispatchLatency(signals, 1000, { now: 1000 });
		recordDispatchLatency(signals, 10, { now: 9000 });
		recordDispatchLatency(signals, 20, { now: 9500 });
		const summary = summarizeProductionSignals(signals, { windowMs: 1000, now: 9500 });
		expect(summary.dispatchLatency.count).toBe(2);
		expect(summary.dispatchLatency.p50Ms).toBe(15);
	});

	it("ignores non-finite and negative samples", () => {
		const signals = freshProductionSignals();
		recordDispatchLatency(signals, NaN, { now: 1 });
		recordDispatchLatency(signals, -5, { now: 1 });
		expect(summarizeProductionSignals(signals).dispatchLatency.count).toBe(0);
	});
});

describe("per-project throughput and fairness wait", () => {
	it("diverges per project under a scripted burst and starves neither", () => {
		const signals = freshProductionSignals();
		for (let i = 0; i < 8; i++) {
			recordProjectClaim(signals, "proj-alpha", { waitMs: 100 + i, now: 1000 });
		}
		for (let i = 0; i < 2; i++) {
			recordProjectClaim(signals, "proj-beta", { waitMs: 400 + i, now: 1000 });
		}
		recordProjectCompletion(signals, "proj-alpha");
		const summary = summarizeProductionSignals(signals);
		expect(summary.perProject["proj-alpha"].claimed).toBe(8);
		expect(summary.perProject["proj-beta"].claimed).toBe(2);
		expect(summary.perProject["proj-beta"].wait.count).toBe(2);
		expect(summary.perProject["proj-alpha"].wait.avgMs).toBeCloseTo(103.5, 5);
		expect(summary.perProject["proj-alpha"].completed).toBe(1);
		expect(summary.perProject["proj-beta"].completed).toBe(0);
		expect(summary.fleetCompletedExecutions).toBe(1);
	});

	it("overlays state-derived completed counts while keeping fleet events visible", () => {
		const signals = freshProductionSignals();
		recordProjectClaim(signals, "proj-alpha", { now: 1 });
		recordProjectCompletion(signals, "proj-alpha");
		const summary = summarizeProductionSignals(signals, {
			completedByProject: { "proj-alpha": 5, "proj-beta": 2 },
		});
		expect(summary.perProject["proj-alpha"].completed).toBe(5);
		expect(summary.perProject["proj-alpha"].completedEvents).toBe(1);
		expect(summary.perProject["proj-beta"].completed).toBe(2);
		expect(summary.fleetCompletedExecutions).toBe(1);
	});

	it("carries projectId labels for every recorded project", () => {
		const signals = freshProductionSignals();
		recordProjectClaim(signals, "proj-alpha", { waitMs: 5, now: 1 });
		recordProjectClaim(signals, "proj-beta", { waitMs: 7, now: 1 });
		expect(Object.keys(summarizeProductionSignals(signals).perProject).sort()).toEqual([
			"proj-alpha",
			"proj-beta",
		]);
	});
});

describe("claim success rate", () => {
	it("is null until the first decided attempt", () => {
		expect(claimSuccessRate(freshProductionSignals()).rate).toBeNull();
	});

	it("counts non-conflict claims over decided attempts only", () => {
		const signals = freshProductionSignals();
		for (let i = 0; i < 8; i++) {
			recordClaimAttempt(signals);
			recordClaimSuccess(signals);
		}
		recordClaimAttempt(signals);
		recordClaimConflict(signals);
		recordClaimAttempt(signals);
		recordClaimError(signals);
		const rate = claimSuccessRate(signals);
		expect(rate).toMatchObject({
			attempts: 10,
			successes: 8,
			conflicts: 1,
			errors: 1,
		});
		expect(rate.rate).toBeCloseTo(80, 5);
	});

	it("excludes operator pauses and version refusals from the denominator", () => {
		const signals = freshProductionSignals();
		recordClaimAttempt(signals);
		recordClaimSuccess(signals);
		for (const reason of CLAIM_EXCLUDED_REASONS) {
			expect(recordClaimExcluded(signals, reason)).toBe(true);
		}
		const rate = claimSuccessRate(signals);
		expect(rate.excludedTotal).toBe(CLAIM_EXCLUDED_REASONS.length);
		expect(rate.rate).toBe(100);
	});

	it("ignores unknown exclusion reasons", () => {
		const signals = freshProductionSignals();
		expect(recordClaimExcluded(signals, "NOPE")).toBe(false);
		expect(claimSuccessRate(signals).excludedTotal).toBe(0);
	});
});

describe("scope/fencing rejection breakdown", () => {
	it("counts PROJECT_SCOPE, STALE_EPOCH, and CLAIM_CONFLICT separately", () => {
		const signals = freshProductionSignals();
		recordFencing(signals, "PROJECT_SCOPE");
		recordFencing(signals, "PROJECT_SCOPE");
		recordFencing(signals, "STALE_EPOCH");
		recordClaimConflict(signals);
		const { fencing } = summarizeProductionSignals(signals);
		expect(fencing).toMatchObject({
			PROJECT_SCOPE: 2,
			STALE_EPOCH: 1,
			CLAIM_CONFLICT: 1,
		});
		expect(claimSuccessRate(signals).conflicts).toBe(1);
	});

	it("ignores non-fencing reasons", () => {
		const signals = freshProductionSignals();
		expect(recordFencing(signals, "NO_HARNESS")).toBe(false);
		expect(summarizeProductionSignals(signals).fencing).toMatchObject(
			Object.fromEntries(FENCING_REASONS.map((r) => [r, 0])),
		);
	});

	it("mirrors dispatch misses and per-project busy skips", () => {
		const signals = freshProductionSignals();
		recordDispatchMiss(signals, "PROJECT_SCOPE", { projectId: "proj-alpha" });
		recordDispatchMiss(signals, "PROJECT_BUSY", { projectId: "proj-alpha" });
		recordDispatchMiss(signals, "PROJECT_BUSY", { projectId: "proj-alpha" });
		recordDispatchMiss(signals, "NO_HARNESS", { projectId: "proj-beta" });
		const summary = summarizeProductionSignals(signals);
		expect(summary.missTotals).toMatchObject({
			PROJECT_SCOPE: 1,
			PROJECT_BUSY: 2,
			NO_HARNESS: 1,
		});
		expect(summary.fencing.PROJECT_SCOPE).toBe(1);
		expect(summary.projectBusy).toEqual({ "proj-alpha": 2 });
	});
});

describe("fleet cap and storeless §3.8 remainder", () => {
	it("counts fleet-cap backoff as an exclusion, never a success-rate debit", () => {
		const signals = freshProductionSignals();
		recordClaimAttempt(signals);
		recordClaimSuccess(signals);
		recordFleetCapExhausted(signals);
		const summary = summarizeProductionSignals(signals);
		expect(summary.fleetCapExhausted).toBe(1);
		expect(summary.claim.excluded.FLEET_CONCURRENCY_EXHAUSTED).toBe(1);
		expect(summary.claim.rate).toBe(100);
	});

	it("counts worktree evictions and skill size-cap omissions", () => {
		const signals = freshProductionSignals();
		recordWorktreeEviction();
		recordWorktreeEviction();
		recordSkillSizeCapOmission(undefined, 3);
		const summary = summarizeProductionSignals(signals);
		expect(summary.worktreeEvictions).toBe(2);
		expect(summary.skillSizeCapOmissions).toBe(3);
	});
});

describe("signalsFor", () => {
	it("lazy-attaches to a store and passes signals through", () => {
		const store = {};
		const attached = signalsFor(store);
		expect(store.productionSignals).toBe(attached);
		expect(signalsFor(store)).toBe(attached);
		expect(signalsFor(attached)).toBe(attached);
	});

	it("returns a detached zeroed store for unusable input", () => {
		const summary = summarizeProductionSignals(undefined);
		expect(summary.claim.rate).toBeNull();
		expect(summary.fencing).toMatchObject({
			PROJECT_SCOPE: 0,
			STALE_EPOCH: 0,
			CLAIM_CONFLICT: 0,
		});
	});
});
