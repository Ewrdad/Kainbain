// Domain: The Flow — WP3 Tier-2 retry-policy tests (exponential backoff
// with jitter, wider retryable class, per-stage budget surfacing, retry
// timeline logging, 45s-flap recovery, exhaustion parking).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TaskStore } from "../taskStore.js";
import { config } from "../config.js";
import {
	computeRetryDelay,
	harnessBlipSignalFor,
	resolveMaxTransientRetries,
	resolveRetryable,
	resolveTransientBudget,
	transientRetryDefaults,
} from "./stageFailureRouting.js";

vi.mock("../git.js", () => ({
	isGitRepository: vi.fn(async () => true),
	hasCommits: vi.fn(async () => true),
	currentBranch: vi.fn(async () => "main"),
	defaultBranch: vi.fn(async () => "main"),
	branchExists: vi.fn(async () => true),
	ensureBranchCheckedOut: vi.fn(async () => ({ created: false, checkedOut: true, switched: false })),
	checkoutBranch: vi.fn(async () => ({ switched: true })),
	requireCleanWorkingTree: vi.fn(async () => {}),
	commitAllIfNeeded: vi.fn(async () => ({ committed: false, hash: null })),
	mergeBranch: vi.fn(async () => ({ stdout: "merged", stderr: "" })),
}));

const stages = [
	{ id: "build", name: "Build", type: "agent" },
	{ id: "verify", name: "Verify", type: "agent", fallbackStageId: "build" },
];

// Deterministic jitter source: () => 0.5 lands exactly on the nominal delay
// (signed draw 0), () => 0 lands on nominal - jitter, () => 1 on nominal + jitter.
const HALF = () => 0.5;
const NO_DELAY = { baseMs: 50, capMs: 200, jitterMs: 0, strategy: "exponential" };

describe("WP3: computeRetryDelay backoff sequences", () => {
	it("follows exponential doubling min(cap, base*2^(n-1)) without jitter", () => {
		const cfg = { baseMs: 2000, capMs: 60000, jitterMs: 0, strategy: "exponential" };
		expect([1, 2, 3, 4, 5].map((n) => computeRetryDelay(n, cfg, HALF))).toEqual([
			2000, 4000, 8000, 16000, 32000,
		]);
	});

	it("caps a single exponential sleep at capMs", () => {
		const cfg = { baseMs: 2000, capMs: 60000, jitterMs: 0, strategy: "exponential" };
		expect(computeRetryDelay(10, cfg, HALF)).toBe(60000);
		expect(computeRetryDelay(6, cfg, HALF)).toBe(60000);
	});

	it("reproduces the legacy linear timing exactly (2/4/6/8/10s)", () => {
		const legacy = { baseMs: 2000, capMs: 30000, jitterMs: 0, strategy: "linear" };
		expect([1, 2, 3, 4, 5].map((n) => computeRetryDelay(n, legacy, HALF))).toEqual([
			2000, 4000, 6000, 8000, 10000,
		]);
	});

	it("keeps jitter within [nominal-jitter, nominal+jitter] clamped to [0, cap]", () => {
		const cfg = { baseMs: 2000, capMs: 60000, jitterMs: 1000, strategy: "exponential" };
		// Attempt 3: nominal 8000.
		expect(computeRetryDelay(3, cfg, () => 0)).toBe(7000);
		expect(computeRetryDelay(3, cfg, () => 0.5)).toBe(8000);
		expect(computeRetryDelay(3, cfg, () => 1)).toBe(9000);
		for (let i = 0; i < 50; i++) {
			const actual = computeRetryDelay(3, cfg, Math.random);
			expect(actual).toBeGreaterThanOrEqual(7000);
			expect(actual).toBeLessThanOrEqual(9000);
		}
		// Jitter can never push past the cap or below zero.
		const capped = { baseMs: 59000, capMs: 60000, jitterMs: 5000, strategy: "exponential" };
		expect(computeRetryDelay(1, capped, () => 1)).toBe(60000);
		const tiny = { baseMs: 100, capMs: 60000, jitterMs: 5000, strategy: "exponential" };
		expect(computeRetryDelay(1, tiny, () => 0)).toBe(0);
	});

	it("clamps a misbehaving random source to the jitter bounds (fail-safe)", () => {
		const cfg = { baseMs: 2000, capMs: 60000, jitterMs: 1000, strategy: "exponential" };
		// Attempt 3: nominal 8000, so the legal band is [7000, 9000].
		expect(computeRetryDelay(3, cfg, () => -5)).toBe(7000);
		expect(computeRetryDelay(3, cfg, () => 99)).toBe(9000);
		expect(computeRetryDelay(3, cfg, () => Number.NaN)).toBe(8000);
		expect(computeRetryDelay(3, cfg, () => Infinity)).toBe(8000);
		expect(computeRetryDelay(3, cfg, "not-a-function")).toBeGreaterThanOrEqual(7000);
		expect(computeRetryDelay(3, cfg, "not-a-function")).toBeLessThanOrEqual(9000);
	});

	it("never throws or returns out-of-range delays for degenerate attempts", () => {
		const cfg = { baseMs: 2000, capMs: 60000, jitterMs: 1000, strategy: "exponential" };
		for (const attempt of [0, -3, Number.NaN, 1e12]) {
			const delay = computeRetryDelay(attempt, cfg, HALF);
			expect(Number.isFinite(delay)).toBe(true);
			expect(delay).toBeGreaterThanOrEqual(0);
			expect(delay).toBeLessThanOrEqual(60000);
		}
	});

	it("absorbs a 45s gateway flap inside the default budget (Bowtie Scenario 1 arithmetic)", () => {
		const cfg = {
			baseMs: transientRetryDefaults.baseMs,
			capMs: transientRetryDefaults.capMs,
			jitterMs: 0,
			strategy: "exponential",
		};
		const spacing = [1, 2, 3, 4, 5].reduce((sum, n) => sum + computeRetryDelay(n, cfg, HALF), 0);
		expect(spacing).toBeGreaterThanOrEqual(45000);
	});
});

describe("WP3: resolveRetryable retryable class", () => {
	it("retries transient infrastructure errors", () => {
		for (const msg of [
			"socket hang up",
			"HTTP 503 Service Unavailable",
			"connect ECONNREFUSED 127.0.0.1:11434",
			"fetch failed",
			"gateway timeout",
		]) {
			const decision = resolveRetryable(new Error(msg));
			expect(decision).toMatchObject({ retryable: true, kind: "transient" });
		}
	});

	it("retries designated harness blips that WP2 classifies as logical", () => {
		expect(
			resolveRetryable(new Error("pi harness output was malformed JSON: Unexpected token")),
		).toMatchObject({ retryable: true, signal: "harness-json-blip" });
		expect(
			resolveRetryable(new Error("ephemeral tool failure: tool execution failed with transient error")),
		).toMatchObject({ retryable: true, signal: "tool-execution-blip" });
		expect(
			resolveRetryable(new Error("harness runner crashed mid-stage")),
		).toMatchObject({ retryable: true, signal: "harness-crash-blip" });
		expect(harnessBlipSignalFor("ordinary test failure")).toBeNull();
	});

	it("never retries auth failures, quota exhaustion, or operator aborts", () => {
		for (const msg of [
			"401 unauthorized",
			"[Authentication Error] invalid api key",
			"403 forbidden",
			"429 rate limit exceeded",
			"quota exhausted for today",
			"session usage limit reached",
			"This operation was aborted",
		]) {
			expect(resolveRetryable(new Error(msg)).retryable).toBe(false);
		}
	});

	it("applies the deny-list first when a blip mentions quota wording", () => {
		const decision = resolveRetryable(
			new Error("harness output was malformed JSON; quota 429 exceeded"),
		);
		expect(decision.retryable).toBe(false);
	});

	it("does not retry ordinary logical failures", () => {
		expect(resolveRetryable(new Error("tests failed: exit code 1")).retryable).toBe(false);
		expect(resolveRetryable(new Error("review found a gap")).retryable).toBe(false);
	});
});

describe("WP3: per-stage budget override (stage > project > global)", () => {
	it("names the winning layer in the resolved budget source", () => {
		expect(resolveTransientBudget({ maxTransientRetries: 3 }, { maxTransientRetries: 1 })).toEqual({
			maxAttempts: 3,
			source: "stage",
		});
		expect(resolveTransientBudget({}, { maxTransientRetries: 1 })).toEqual({
			maxAttempts: 1,
			source: "project",
		});
		expect(resolveTransientBudget(undefined, {})).toEqual({
			maxAttempts: config.maxTransientRetries,
			source: "global",
		});
		expect(resolveTransientBudget({ maxTransientRetries: 0 }, {})).toEqual({
			maxAttempts: 0,
			source: "stage",
		});
	});

	it("fails safe on non-finite budgets: falls through instead of retrying forever", () => {
		// NaN/Infinity stage values are ignored (project wins); NaN/Infinity
		// project values are ignored (global wins). Without this, NaN made
		// `attempt > maxAttempts` false forever — unbounded retries.
		expect(
			resolveTransientBudget({ maxTransientRetries: Number.NaN }, { maxTransientRetries: 2 }),
		).toEqual({ maxAttempts: 2, source: "project" });
		expect(
			resolveTransientBudget({ maxTransientRetries: Infinity }, { maxTransientRetries: 2 }),
		).toEqual({ maxAttempts: 2, source: "project" });
		expect(resolveTransientBudget({}, { maxTransientRetries: Number.NaN })).toEqual({
			maxAttempts: config.maxTransientRetries,
			source: "global",
		});
		expect(resolveMaxTransientRetries({ maxTransientRetries: Number.NaN }, {})).toBe(
			config.maxTransientRetries,
		);
		expect(resolveMaxTransientRetries({ maxTransientRetries: Infinity }, {})).toBe(
			config.maxTransientRetries,
		);
	});
});

describe("WP3: retry timeline logging and budget surfacing", () => {
	let tempCwd;

	beforeEach(() => {
		tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kb-wp3-retry-test-"));
	});

	afterEach(() => {
		try {
			fs.rmSync(tempCwd, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	});

	function makeStore() {
		const pushes = [];
		const events = [];
		const store = new TaskStore({
			eventBridge: {
				emitProcessEvent: (projectId, type, payload) => events.push({ type, payload }),
				emitSystemLog: () => {},
				emitNotification: () => {},
			},
			projectStore: { getProject: () => ({ stages, cwd: tempCwd }) },
		});
		store.notifyStagePush = (payload) => {
			pushes.push(payload);
			return Promise.resolve({ delivered: 1 });
		};
		return { store, pushes, events };
	}

	function makeTask(store) {
		return store.createTask("p1", {
			goal: "wp3 retry timeline",
			stageId: "verify",
			projectCwd: tempCwd,
		});
	}

	it("logs attempt n/N, next delay, and matched signal on every retry", () => {
		const { store } = makeStore();
		const task = makeTask(store);
		const result = store.handleTransientFailure("p1", task.id, stages[1], new Error("socket hang up"), {
			projectCwd: tempCwd,
			retryDelay: { jitterMs: 0, strategy: "exponential" },
			retryRand: HALF,
		});
		expect(result.status).toBe("retrying");
		expect(result).toMatchObject({ attempt: 1, signal: expect.any(String), budgetSource: "global" });
		expect(typeof result.nextDelayMs).toBe("number");

		const historyAction = task.history.at(-1).action;
		expect(historyAction).toContain("attempt 1/");
		expect(historyAction).toContain(`next delay ${result.nextDelayMs}ms`);
		expect(historyAction).toContain(`signal ${result.signal}`);

		const retryEntry = task.timeline.find((entry) => entry.status === "Retrying");
		expect(retryEntry).toMatchObject({
			attempt: 1,
			nextDelayMs: result.nextDelayMs,
			signal: result.signal,
			budgetSource: "global",
		});
		expect(String(retryEntry.reason)).toContain("attempt 1/");
	});

	it("surfaces a per-stage budget override in the retry report line", () => {
		const { store } = makeStore();
		const task = makeTask(store);
		const stageOverride = { ...stages[1], maxTransientRetries: 2 };
		const result = store.handleTransientFailure("p1", task.id, stageOverride, new Error("HTTP 503 Service Unavailable"), {
			projectCwd: tempCwd,
			retryDelay: NO_DELAY,
			retryRand: HALF,
		});
		expect(result).toMatchObject({ attempt: 1, maxAttempts: 2, budgetSource: "stage" });
		expect(task.history.at(-1).action).toContain("stage.maxTransientRetries");
	});

	it("recovers from a 45s gateway flap without a human pager", () => {
		// Tier-5 containment is a separate tier: disable the circuit sensor
		// here so this test proves Tier-2 behavior in isolation (repeated
		// infra failures would otherwise trip the engine mid-flap).
		const wasEnabled = config.circuitBreakerEnabled;
		config.circuitBreakerEnabled = false;
		try {
			const { store, pushes } = makeStore();
			const task = makeTask(store);
			const flap = new Error("HTTP 503 Service Unavailable: gateway flap");
			// Five transient failures inside budget: every one stays in retry,
			// none parks, none pages.
			for (let n = 1; n <= 5; n++) {
				const result = store.handleTransientFailure("p1", task.id, stages[1], flap, {
					projectCwd: tempCwd,
					retryDelay: NO_DELAY,
					retryRand: HALF,
				});
				expect(result.status).toBe("retrying");
				expect(task.status).toBe("in_stage");
			}
			expect(pushes).toHaveLength(0);
			expect(task.timeline.filter((entry) => entry.status === "Retrying")).toHaveLength(5);
		} finally {
			config.circuitBreakerEnabled = wasEnabled;
		}
	});

	it("parks cleanly with the full ladder recorded once retries are exhausted", () => {
		const wasEnabled = config.circuitBreakerEnabled;
		config.circuitBreakerEnabled = false;
		try {
			const { store, pushes } = makeStore();
			const task = makeTask(store);
			const outage = new Error("socket hang up");
			for (let n = 1; n <= config.maxTransientRetries; n++) {
				const result = store.handleTransientFailure("p1", task.id, stages[1], outage, {
					projectCwd: tempCwd,
					retryDelay: NO_DELAY,
					retryRand: HALF,
				});
				expect(result.status).toBe("retrying");
			}
		const parked = store.handleTransientFailure("p1", task.id, stages[1], outage, {
			projectCwd: tempCwd,
			retryDelay: NO_DELAY,
			retryRand: HALF,
		});
		expect(parked.status).toBe("failed");
		expect(task.status).toBe("failed");
		expect(pushes).toHaveLength(1);
		expect(pushes[0].reason).toBe("transient_retries_exhausted");
		// Full ladder: one entry per spent attempt, each naming delay + signal.
		expect(Array.isArray(task.transientRetryLadder)).toBe(true);
		expect(task.transientRetryLadder).toHaveLength(config.maxTransientRetries);
		for (const entry of task.transientRetryLadder) {
			expect(entry).toMatchObject({
				delayMs: expect.any(Number),
				signal: expect.any(String),
			});
		}
		expect(task.lastError.retryLadder).toHaveLength(config.maxTransientRetries);
		expect(task.history.at(-1).action).toContain("Retry ladder:");
		} finally {
			config.circuitBreakerEnabled = wasEnabled;
		}
	});

	it("parks immediately on a zero budget without consuming retries or paging twice", () => {
		const wasEnabled = config.circuitBreakerEnabled;
		config.circuitBreakerEnabled = false;
		try {
			const { store, pushes } = makeStore();
			const task = makeTask(store);
			const parked = store.handleTransientFailure(
				"p1",
				task.id,
				{ ...stages[1], maxTransientRetries: 0 },
				new Error("socket hang up"),
				{ projectCwd: tempCwd, retryDelay: NO_DELAY, retryRand: HALF },
			);
			expect(parked.status).toBe("failed");
			expect(parked).toMatchObject({ maxAttempts: 0, budgetSource: "stage" });
			expect(task.transientRetryLadder).toHaveLength(0);
			expect(pushes).toHaveLength(1);
			expect(pushes[0].reason).toBe("transient_retries_exhausted");
		} finally {
			config.circuitBreakerEnabled = wasEnabled;
		}
	});

	it("retries a harness blip through the widened class and still pages on persistent outage", () => {
		const { store, pushes } = makeStore();
		const task = makeTask(store);
		const blip = new Error("pi harness output was malformed JSON: Unexpected token");
		const first = store.handleTransientFailure("p1", task.id, stages[1], blip, {
			projectCwd: tempCwd,
			retryDelay: NO_DELAY,
			retryRand: HALF,
		});
		expect(first.status).toBe("retrying");
		expect(first.signal).toBe("harness-json-blip");
		expect(pushes).toHaveLength(0);
	});
});
