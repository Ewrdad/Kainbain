// Domain: Watching The Work — reliability sample recording/backfill tests.
import { describe, it, expect } from "vitest";
import {
	bucketReliabilityRuns,
	recordReliabilitySample,
	backfillReliabilitySamples,
	reliabilitySampleKey,
	isKnownReliabilityFailureKind,
} from "./reliabilityShared.js";

/***
 * MARK: sampleStore
 * @description Minimal store double: one in-memory task behind `getTask`.
 * @example sampleStore([{ reliabilitySamples: […] }]) => store
 * @param {Array<Object>} [tasks] - Task shells.
 * @returns {Object} Store double for recordReliabilitySample.
 ***/
function sampleStore(tasks = [{ id: "t1", reliabilitySamples: [] }]) {
	return {
		getTask: (projectId, taskId) =>
			tasks.find((t) => t.id === taskId) || null,
	};
}

function sample(overrides = {}) {
	return {
		harnessId: "vibe",
		failureKind: "none",
		at: 1760000000000,
		stageId: "s1",
		...overrides,
	};
}

describe("Watching The Work: reliability sample recording", () => {
	it("records a sample onto the task entity", () => {
		const task = { id: "t1" };
		const store = sampleStore([task]);

		recordReliabilitySample(store, "p1", "t1", sample());

		expect(task.reliabilitySamples).toHaveLength(1);
		expect(task.reliabilitySamples[0]).toMatchObject({
			harnessId: "vibe",
			failureKind: "none",
			at: 1760000000000,
			stageId: "s1",
		});
	});

	it("initialises the samples array on a task that has none", () => {
		const task = { id: "t1" };
		const store = sampleStore([task]);

		recordReliabilitySample(store, "p1", "t1", sample());

		expect(Array.isArray(task.reliabilitySamples)).toBe(true);
	});

	it("drops samples without a harness id (unattributed stays excluded)", () => {
		const task = { id: "t1", reliabilitySamples: [] };
		const store = sampleStore([task]);

		recordReliabilitySample(store, "p1", "t1", sample({ harnessId: "  " }));
		recordReliabilitySample(store, "p1", "t1", sample({ harnessId: null }));

		expect(task.reliabilitySamples).toHaveLength(0);
	});

	it("drops samples with an unknown failure kind", () => {
		const task = { id: "t1", reliabilitySamples: [] };
		const store = sampleStore([task]);

		recordReliabilitySample(store, "p1", "t1", sample({ failureKind: "exploded" }));
		recordReliabilitySample(store, "p1", "t1", sample({ failureKind: undefined }));

		expect(task.reliabilitySamples).toHaveLength(0);
	});

	it("keeps all three known outcome kinds", () => {
		const task = { id: "t1", reliabilitySamples: [] };
		const store = sampleStore([task]);

		const kinds = ["none", "infrastructure", "rejected"];
		kinds.forEach((failureKind, index) => {
			recordReliabilitySample(store, "p1", "t1", sample({ failureKind, at: 1760000000000 + index }));
		});

		expect(task.reliabilitySamples.map((s) => s.failureKind)).toEqual(kinds);
	});

	it("deduplicates by (stageId, at): one dispatch, one sample", () => {
		const task = { id: "t1", reliabilitySamples: [] };
		const store = sampleStore([task]);

		recordReliabilitySample(store, "p1", "t1", sample());
		recordReliabilitySample(store, "p1", "t1", sample());

		expect(task.reliabilitySamples).toHaveLength(1);
	});

	it("records repeated runs of the same stage at different times", () => {
		const task = { id: "t1" };
		const store = sampleStore([task]);

		// The frozen-run-count bug: every dispatch of a stage must count,
		// so the dedup key must include the run timestamp, never collapse
		// a whole stage's history into one sample.
		recordReliabilitySample(store, "p1", "t1", sample({ at: 1760000000000 }));
		recordReliabilitySample(store, "p1", "t1", sample({ at: 1760000000001 }));
		recordReliabilitySample(store, "p1", "t1", sample({ at: 1760000000002 }));

		expect(task.reliabilitySamples).toHaveLength(3);
	});

	it("carries alias attribution and atRaw through to the stored sample", () => {
		const task = { id: "t1" };
		const store = sampleStore([task]);

		recordReliabilitySample(store, "p1", "t1", {
			harnessId: "antigravity",
			failureKind: "infrastructure",
			at: 1760000000000,
			atRaw: "2026-10-09T10:13:20.000Z",
			stageId: "s1",
			aliasName: "worker",
			modelRef: "gemini-3.8-flash-low",
			targetIndex: 0,
		});

		expect(task.reliabilitySamples[0]).toMatchObject({
			aliasName: "worker",
			modelRef: "gemini-3.8-flash-low",
			targetIndex: 0,
			atRaw: "2026-10-09T10:13:20.000Z",
		});
	});

	it("is a no-op for a missing task or store", () => {
		expect(() => recordReliabilitySample(null, "p1", "t1", sample())).not.toThrow();
		expect(() =>
			recordReliabilitySample(sampleStore(), "p1", "ghost", sample()),
		).not.toThrow();
	});
});

describe("Watching The Work: reliability sample backfill", () => {
	it("converts attributed reports into samples", () => {
		const task = {
			reports: [
				{
					harnessId: "vibe",
					failureKind: "none",
					stageId: "s1",
					createdAt: "2026-10-01T10:00:00.000Z",
				},
				{
					harnessId: "vibe",
					failureKind: "infrastructure",
					stageId: "s1",
					createdAt: "2026-10-01T11:00:00.000Z",
				},
				{ harnessId: "vibe", stageId: "s1", createdAt: "2026-10-01T12:00:00.000Z" },
				{
					harnessId: "  ",
					failureKind: "none",
					stageId: "s1",
					createdAt: "2026-10-01T13:00:00.000Z",
				},
				{
					harnessId: "vibe",
					failureKind: "legacy-kind",
					stageId: "s1",
					createdAt: "2026-10-01T14:00:00.000Z",
				},
			],
		};

		backfillReliabilitySamples(task);

		expect(task.reliabilitySamples).toHaveLength(2);
		expect(task.reliabilitySamples[0]).toMatchObject({
			harnessId: "vibe",
			failureKind: "none",
			stageId: "s1",
			atRaw: "2026-10-01T10:00:00.000Z",
		});
		// Backfilled samples share the live schema: `atRaw`, never nulls.
		expect(task.reliabilitySamples[0]).not.toHaveProperty("createdAt");
		expect(task.reliabilitySamples[0]).not.toHaveProperty("aliasName");
		expect(task.reliabilitySamples[1]).toMatchObject({
			harnessId: "vibe",
			failureKind: "infrastructure",
		});
	});

	it("is idempotent: re-running the backfill adds nothing", () => {
		const task = {
			reports: [
				{
					harnessId: "vibe",
					failureKind: "none",
					stageId: "s1",
					createdAt: "2026-10-01T10:00:00.000Z",
				},
			],
		};

		backfillReliabilitySamples(task);
		const first = task.reliabilitySamples.length;
		backfillReliabilitySamples(task);

		expect(task.reliabilitySamples).toHaveLength(first);
	});

	it("does not duplicate a report whose sample is already recorded", () => {
		const task = {
			reliabilitySamples: [
				{
					harnessId: "vibe",
					failureKind: "none",
					stageId: "s1",
					at: Date.parse("2026-10-01T10:00:00.000Z"),
				},
			],
			reports: [
				{
					harnessId: "vibe",
					failureKind: "none",
					stageId: "s1",
					createdAt: "2026-10-01T10:00:00.000Z",
				},
			],
		};

		backfillReliabilitySamples(task);

		expect(task.reliabilitySamples).toHaveLength(1);
	});
});

describe("Watching The Work: reliability sample key", () => {
	it("keys by stage id and run time", () => {
		expect(reliabilitySampleKey({ stageId: "s1", at: 5 })).toBe("s1-5");
		expect(reliabilitySampleKey({ stageId: "s1", at: 6 })).not.toBe("s1-5");
		expect(reliabilitySampleKey({ at: 6 })).toBe("-6");
	});

	it("falls back to the parsed createdAt/atRaw stamp for backfilled samples", () => {
		expect(
			reliabilitySampleKey({ stageId: "s1", createdAt: "2026-10-01T10:00:00.000Z" }),
		).toBe(`s1-${Date.parse("2026-10-01T10:00:00.000Z")}`);
	});
});

describe("Watching The Work: reliability bucketing from samples", () => {
	it("counts 4 successes and 1 infra failure as 5 runs at 80%", () => {
		const bucket = bucketReliabilityRuns([
			{ failureKind: "none", at: 1, atRaw: "a" },
			{ failureKind: "none", at: 2, atRaw: "b" },
			{ failureKind: "none", at: 3, atRaw: "c" },
			{ failureKind: "none", at: 4, atRaw: "d" },
			{ failureKind: "infrastructure", at: 5, atRaw: "e" },
		]);

		expect(bucket).toMatchObject({
			runs: 5,
			successes: 4,
			infraFailures: 1,
			excludedRejected: 0,
			successRate: 80,
			lastRunAt: "e",
		});
	});

	it("excludes rejected runs from numerator and denominator", () => {
		const bucket = bucketReliabilityRuns([
			{ failureKind: "none", at: 1 },
			{ failureKind: "rejected", at: 2 },
		]);

		expect(bucket).toMatchObject({
			runs: 1,
			successes: 1,
			excludedRejected: 1,
			successRate: 100,
		});
	});

	it("distinguishes temporary failure blips and recoveries from structural issues with the 10-run window", () => {
		// Recovery scenario: 10 old failures, followed by 10 clean runs.
		// All-time is mediocre (50%), but recent is 100% healthy.
		const recoveredRuns = [];
		for (let i = 1; i <= 20; i += 1) {
			recoveredRuns.push({
				failureKind: i <= 10 ? "infrastructure" : "none",
				at: i * 1000,
			});
		}
		const recovered = bucketReliabilityRuns(recoveredRuns);
		expect(recovered.runs).toBe(20);
		expect(recovered.successRate).toBe(50);
		expect(recovered.recent.runs).toBe(10);
		expect(recovered.recent.successRate).toBe(100);

		// Temporary blip: 10 clean runs, followed by 2 recent failures (12 total).
		// All-time remains solid (10/12 = 83.3%), but recent has dropped (8/10 = 80%).
		const blipRuns = [];
		for (let i = 1; i <= 12; i += 1) {
			blipRuns.push({
				failureKind: i <= 10 ? "none" : "infrastructure",
				at: i * 1000,
			});
		}
		const blip = bucketReliabilityRuns(blipRuns);
		expect(blip.runs).toBe(12);
		expect(blip.successRate).toBe(83.3);
		expect(blip.recent.runs).toBe(10);
		expect(blip.recent.successRate).toBe(80);

		// Structural issue: continuous failures across all runs.
		const structuralRuns = [];
		for (let i = 1; i <= 12; i += 1) {
			structuralRuns.push({
				failureKind: "infrastructure",
				at: i * 1000,
			});
		}
		const structural = bucketReliabilityRuns(structuralRuns);
		expect(structural.runs).toBe(12);
		expect(structural.successRate).toBe(0);
		expect(structural.recent.runs).toBe(10);
		expect(structural.recent.successRate).toBe(0);
	});
});
