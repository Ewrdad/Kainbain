import { describe, it, expect, vi } from "vitest";
import {
	ImpromptuStore,
	CHAT_OUTPUT_TAIL_MAX_CHARS,
	CHAT_OUTPUT_TRUNCATED_MARKER,
	createChatProgressForwarder,
	createImpromptuDispatcher,
	normalizeTimeoutMs,
	truncateOutputTail,
} from "./impromptuStore.js";

/***
 * MARK: ImpromptuStore tests
 * @description Verifies the impromptu T0 queue (ADR 0014): enqueue caps,
 *   oldest-first claim-fenced polls, progress tails with idempotent seqs,
 *   first-writer-wins completion, stale-claim requeue, TTL/ceiling waiter
 *   bounds, the dispatcher seam (fail-fast selection + coded errors), and
 *   the CHAT_PROGRESS forwarder throttle.
 ***/

function makeStore(over = {}) {
	let at = over.at ?? 1_000_000;
	const store = new ImpromptuStore({
		queueMax: 10,
		jobTtlMs: 600_000,
		claimTtlMs: 300_000,
		now: () => at,
		newJobId: (() => {
			let n = 0;
			return () => `job-${(n += 1)}`;
		})(),
		...over.opts,
	});
	return { store, advance: (ms) => (at += ms), clock: () => at };
}

describe("ImpromptuStore enqueue", () => {
	it("parks jobs with normalized defaults", () => {
		const { store } = makeStore();
		const job = store.enqueue({ projectId: "p1", prompt: "hello?", harness: "pi" });
		expect(job.jobId).toBe("job-1");
		expect(job.status).toBe("queued");
		expect(job.kind).toBe("retrospective-chat");
		expect(job.model).toBe(null);
		expect(job.turnId).toBe(null);
		expect(job.pinnedRunnerId).toBe(null);
		expect(store.get("job-1")).toBe(job);
		expect(store.get("ghost")).toBe(null);
	});

	it("rejects prompt-less jobs and fails fast past the cap", () => {
		const { store } = makeStore({ opts: { queueMax: 1 } });
		expect(() => store.enqueue({ projectId: "p1" })).toThrowError(
			expect.objectContaining({ code: "INVALID_IMPROMPTU_ARGS", statusCode: 400 }),
		);
		store.enqueue({ projectId: "p1", prompt: "one" });
		expect(() => store.enqueue({ projectId: "p1", prompt: "two" })).toThrowError(
			expect.objectContaining({ code: "impromptu_queue_full", statusCode: 429 }),
		);
	});
});

describe("ImpromptuStore pollForRunner", () => {
	it("assigns the oldest matching job with a wire-shaped payload", () => {
		const { store } = makeStore();
		store.enqueue({ projectId: "p1", prompt: "first", harness: "pi" });
		store.enqueue({ projectId: "p1", prompt: "second", harness: "pi" });
		const assigned = store.pollForRunner({ runnerId: "r1", matchJob: () => true });
		expect(assigned.prompt).toBe("first");
		expect(assigned).toEqual({
			jobId: "job-1",
			projectId: "p1",
			kind: "retrospective-chat",
			prompt: "first",
			harness: "pi",
			model: null,
			timeoutMs: 600_000,
			turnId: null,
		});
		expect(store.get("job-1").status).toBe("claimed");
		expect(store.get("job-1").claim.runnerId).toBe("r1");
	});

	it("skips jobs the runner cannot serve and returns null when nothing matches", () => {
		const { store } = makeStore();
		store.enqueue({ projectId: "p1", prompt: "pi job", harness: "pi" });
		store.enqueue({ projectId: "p1", prompt: "vibe job", harness: "vibe" });
		const assigned = store.pollForRunner({
			runnerId: "r1",
			matchJob: (job) => job.harness === "vibe",
		});
		expect(assigned.prompt).toBe("vibe job");
		expect(
			store.pollForRunner({ runnerId: "r1", matchJob: (job) => job.harness === "muse" }),
		).toBe(null);
		expect(store.pollForRunner({ runnerId: "r1" })).toBe(null);
	});

	it("claim-fences: two runners polling, one job, exactly one assignment", () => {
		const { store } = makeStore();
		store.enqueue({ projectId: "p1", prompt: "once", harness: "pi" });
		expect(
			store.pollForRunner({ runnerId: "r1", matchJob: () => true }).jobId,
		).toBe("job-1");
		expect(store.pollForRunner({ runnerId: "r2", matchJob: () => true })).toBe(null);
	});

	it("delivers pinned jobs only to the pinned runner", () => {
		const { store } = makeStore();
		store.enqueue({ projectId: "p1", prompt: "pinned", harness: "pi", pinnedRunnerId: "r2" });
		expect(store.pollForRunner({ runnerId: "r1", matchJob: () => true })).toBe(null);
		const assigned = store.pollForRunner({ runnerId: "r2", matchJob: () => true });
		expect(assigned.jobId).toBe("job-1");
	});
});

describe("ImpromptuStore progress", () => {
	it("appends deltas, refreshes the claim, and forwards the tail", async () => {
		const seen = [];
		const { store, advance } = makeStore({
			opts: { onProgress: (frame) => seen.push(frame) },
		});
		const job = store.enqueue({ projectId: "p1", prompt: "q", turnId: "t1" });
		const waiter = store.waitFor(job.jobId);
		void waiter.catch(() => {});
		store.pollForRunner({ runnerId: "r1", matchJob: () => true });
		const firstExpiry = store.get(job.jobId).claim.expiresAt;
		advance(60_000);
		const receipt = store.progress({ jobId: job.jobId, runnerId: "r1", seq: 0, delta: "hel" });
		expect(receipt).toEqual({ tail: "hel" });
		store.progress({ jobId: job.jobId, runnerId: "r1", seq: 1, delta: "lo" });
		expect(store.get(job.jobId).outputSoFar).toBe("hello");
		// The streaming runner proved liveness: its claim moved forward.
		expect(store.get(job.jobId).claim.expiresAt).toBeGreaterThan(firstExpiry);
		expect(seen).toEqual([
			{ jobId: job.jobId, projectId: "p1", turnId: "t1", tail: "hel" },
			{ jobId: job.jobId, projectId: "p1", turnId: "t1", tail: "hello" },
		]);
		store.complete({ jobId: job.jobId, runnerId: "r1", outcome: "completed", output: "hello" });
		await expect(waiter).resolves.toEqual({ output: "hello" });
	});

	it("answers duplicate seqs idempotent without appending or forwarding", () => {
		const forward = vi.fn();
		const { store } = makeStore({ opts: { onProgress: forward } });
		const job = store.enqueue({ projectId: "p1", prompt: "q" });
		store.pollForRunner({ runnerId: "r1", matchJob: () => true });
		store.progress({ jobId: job.jobId, runnerId: "r1", seq: 0, delta: "a" });
		const receipt = store.progress({ jobId: job.jobId, runnerId: "r1", seq: 0, delta: "a" });
		expect(receipt).toEqual({ duplicate: true, tail: "a" });
		expect(store.get(job.jobId).outputSoFar).toBe("a");
		expect(forward).toHaveBeenCalledTimes(1);
	});

	it("rejects foreign runners, unclaimed jobs, and malformed frames", () => {
		const { store } = makeStore();
		const job = store.enqueue({ projectId: "p1", prompt: "q" });
		store.pollForRunner({ runnerId: "r1", matchJob: () => true });
		expect(() =>
			store.progress({ jobId: job.jobId, runnerId: "r2", seq: 0, delta: "x" }),
		).toThrowError(expect.objectContaining({ code: "STALE_IMPROMPTU", statusCode: 409 }));
		expect(() =>
			store.progress({ jobId: "ghost", runnerId: "r1", seq: 0, delta: "x" }),
		).toThrowError(expect.objectContaining({ code: "STALE_IMPROMPTU" }));
		const queued = store.enqueue({ projectId: "p1", prompt: "waiting" });
		expect(() =>
			store.progress({ jobId: queued.jobId, runnerId: "r1", seq: 0, delta: "x" }),
		).toThrowError(expect.objectContaining({ code: "STALE_IMPROMPTU" }));
		expect(() =>
			store.progress({ jobId: job.jobId, runnerId: "r1", seq: -1, delta: "x" }),
		).toThrowError(expect.objectContaining({ code: "INVALID_IMPROMPTU_ARGS", statusCode: 400 }));
		expect(() =>
			store.progress({ jobId: job.jobId, runnerId: "r1", seq: 1, delta: 42 }),
		).toThrowError(expect.objectContaining({ code: "INVALID_IMPROMPTU_ARGS" }));
	});

	it("never lets a throwing sink fail the job", () => {
		const { store } = makeStore({
			opts: {
				onProgress: () => {
					throw new Error("socket gone");
				},
			},
		});
		const job = store.enqueue({ projectId: "p1", prompt: "q" });
		store.pollForRunner({ runnerId: "r1", matchJob: () => true });
		expect(
			store.progress({ jobId: job.jobId, runnerId: "r1", seq: 0, delta: "ok" }),
		).toEqual({ tail: "ok" });
	});
});

describe("ImpromptuStore complete", () => {
	it("resolves the waiter with the runner text and counts the completion", async () => {
		const { store } = makeStore();
		const job = store.enqueue({ projectId: "p1", prompt: "q" });
		const waiter = store.waitFor(job.jobId);
		store.pollForRunner({ runnerId: "r1", matchJob: () => true });
		expect(
			store.complete({ jobId: job.jobId, runnerId: "r1", outcome: "completed", output: "done!" }),
		).toEqual({ duplicate: false });
		await expect(waiter).resolves.toEqual({ output: "done!" });
		expect(store.get(job.jobId)).toBe(null);
		expect(store.snapshot()).toEqual({ queued: 0, claimed: 0, completed: 1, failed: 0 });
	});

	it("rejects the waiter chat_prompt_failed with the streamed tail as partial output", async () => {
		const { store } = makeStore();
		const job = store.enqueue({ projectId: "p1", prompt: "q" });
		const waiter = store.waitFor(job.jobId);
		const failure = waiter.catch((err) => err);
		store.pollForRunner({ runnerId: "r1", matchJob: () => true });
		store.progress({ jobId: job.jobId, runnerId: "r1", seq: 0, delta: "before the boom" });
		expect(
			store.complete({ jobId: job.jobId, runnerId: "r1", outcome: "failed", error: "Model exploded" }),
		).toEqual({ duplicate: false });
		const err = await failure;
		expect(err.code).toBe("chat_prompt_failed");
		expect(err.statusCode).toBe(502);
		expect(err.message).toContain("Model exploded");
		expect(err.partialOutput).toBe("before the boom");
		expect(store.snapshot().failed).toBe(1);
	});

	it("treats retried completions as no-op successes", () => {
		const { store } = makeStore();
		const job = store.enqueue({ projectId: "p1", prompt: "q" });
		void store.waitFor(job.jobId).catch(() => {});
		store.pollForRunner({ runnerId: "r1", matchJob: () => true });
		store.complete({ jobId: job.jobId, runnerId: "r1", outcome: "completed", output: "hi" });
		expect(
			store.complete({ jobId: job.jobId, runnerId: "r1", outcome: "completed", output: "hi" }),
		).toEqual({ duplicate: true });
		expect(store.snapshot().completed).toBe(1);
	});

	it("lands second-writer and unknown completions stale, bad outcomes 400", () => {
		const { store } = makeStore();
		const job = store.enqueue({ projectId: "p1", prompt: "q" });
		store.pollForRunner({ runnerId: "r1", matchJob: () => true });
		expect(() =>
			store.complete({ jobId: job.jobId, runnerId: "r2", outcome: "completed", output: "x" }),
		).toThrowError(expect.objectContaining({ code: "STALE_IMPROMPTU", statusCode: 409 }));
		expect(() =>
			store.complete({ jobId: "ghost", runnerId: "r1", outcome: "completed", output: "x" }),
		).toThrowError(expect.objectContaining({ code: "STALE_IMPROMPTU" }));
		expect(() =>
			store.complete({ jobId: job.jobId, runnerId: "r1", outcome: "maybe", output: "x" }),
		).toThrowError(expect.objectContaining({ code: "INVALID_IMPROMPTU_ARGS", statusCode: 400 }));
	});
});

describe("ImpromptuStore waitFor bounds", () => {
	it("rejects chat_prompt_timeout under the opt-in ceiling, with partial output", async () => {
		const { store } = makeStore();
		const job = store.enqueue({ projectId: "p1", prompt: "q" });
		const failure = store.waitFor(job.jobId, { timeoutMs: 20 }).catch((err) => err);
		store.pollForRunner({ runnerId: "r1", matchJob: () => true });
		store.progress({ jobId: job.jobId, runnerId: "r1", seq: 0, delta: "warming up…" });
		const err = await failure;
		expect(err.code).toBe("chat_prompt_timeout");
		expect(err.statusCode).toBe(504);
		expect(err.partialOutput).toBe("warming up…");
		expect(store.get(job.jobId)).toBe(null);
		// The runner's late completion lands as a recorded no-op, not a 409.
		expect(
			store.complete({ jobId: job.jobId, runnerId: "r1", outcome: "completed", output: "late" }),
		).toEqual({ duplicate: true });
	});

	it("never times out without the ceiling: the waiter outlives any timer", async () => {
		const { store } = makeStore();
		const job = store.enqueue({ projectId: "p1", prompt: "q" });
		let settled = false;
		const waiter = store.waitFor(job.jobId).then(
			(value) => {
				settled = true;
				return value;
			},
			(err) => {
				settled = true;
				throw err;
			},
		);
		await new Promise((resolve) => setTimeout(resolve, 40));
		expect(settled).toBe(false);
		store.pollForRunner({ runnerId: "r1", matchJob: () => true });
		store.complete({ jobId: job.jobId, runnerId: "r1", outcome: "completed", output: "late answer" });
		await expect(waiter).resolves.toEqual({ output: "late answer" });
	});

	it("fails the waiter when the job TTL lapses with no answer", async () => {
		const { store } = makeStore({ opts: { jobTtlMs: 20 } });
		const job = store.enqueue({ projectId: "p1", prompt: "q" });
		const failure = store.waitFor(job.jobId).catch((err) => err);
		const err = await failure;
		expect(err.code).toBe("chat_prompt_failed");
		expect(err.statusCode).toBe(502);
		expect(err.partialOutput).toBe("");
		expect(store.get(job.jobId)).toBe(null);
	});

	it("rejects double waits and unknown jobs", async () => {
		const { store } = makeStore();
		const job = store.enqueue({ projectId: "p1", prompt: "q" });
		void store.waitFor(job.jobId).catch(() => {});
		await expect(store.waitFor(job.jobId)).rejects.toMatchObject({ code: "STALE_IMPROMPTU" });
		await expect(store.waitFor("ghost")).rejects.toMatchObject({ code: "STALE_IMPROMPTU" });
		store.pollForRunner({ runnerId: "r1", matchJob: () => true });
		store.complete({ jobId: job.jobId, runnerId: "r1", outcome: "completed", output: "hi" });
	});
});

describe("ImpromptuStore expireStale", () => {
	it("requeues stale claims for another runner while the waiter stays parked", async () => {
		const { store, advance } = makeStore();
		const job = store.enqueue({ projectId: "p1", prompt: "q" });
		const waiter = store.waitFor(job.jobId);
		store.pollForRunner({ runnerId: "r1", matchJob: () => true });
		advance(300_001);
		expect(store.expireStale()).toEqual({ requeued: 1, expired: 0 });
		expect(store.get(job.jobId).status).toBe("queued");
		// Another idle runner picks the job up; the original turn resolves.
		const reassigned = store.pollForRunner({ runnerId: "r2", matchJob: () => true });
		expect(reassigned.jobId).toBe(job.jobId);
		store.complete({ jobId: job.jobId, runnerId: "r2", outcome: "completed", output: "rescued" });
		await expect(waiter).resolves.toEqual({ output: "rescued" });
	});

	it("fails waiters past the job TTL and reports counts", async () => {
		const { store, advance } = makeStore();
		const job = store.enqueue({ projectId: "p1", prompt: "q" });
		const failure = store.waitFor(job.jobId).catch((err) => err);
		advance(600_001);
		expect(store.expireStale()).toEqual({ requeued: 0, expired: 1 });
		const err = await failure;
		expect(err.code).toBe("chat_prompt_failed");
		expect(store.get(job.jobId)).toBe(null);
		expect(store.snapshot()).toEqual({ queued: 0, claimed: 0, completed: 0, failed: 1 });
	});
});

describe("createImpromptuDispatcher", () => {
	const at = 1_000_000;
	const fleetRecord = (over = {}) => ({
		runnerId: "r1",
		status: "active",
		lastSeenAt: new Date(at).toISOString(),
		facts: { versions: { protocol: "v1" } },
		capabilities: {
			harnesses: [{ id: "pi", version: "1.2.3" }],
			models: ["m1"],
			tiers: ["T0", "T1"],
			runnable: true,
			diskHeadroomMb: 512,
			versions: { protocol: "v1" },
		},
		...over,
	});
	const makeDispatcher = ({ records = [fleetRecord()], holds = [], storeOver = {}, dispatchOver = {} } = {}) => {
		const { store } = makeStore({ at, opts: storeOver });
		const dispatch = createImpromptuDispatcher({
			impromptuStore: store,
			runnerRegistry: { records: () => records },
			claimStore: { liveHolds: () => holds },
			staleAfterMs: 60_000,
			now: () => at,
			...dispatchOver,
		});
		return { store, dispatch };
	};

	it("dispatches to a capable runner and resolves the runner answer", async () => {
		const { store, dispatch } = makeDispatcher();
		const pending = dispatch({ projectId: "p1", prompt: "why did t1 fail?", harness: "pi", turnId: "t1" });
		const assigned = store.pollForRunner({ runnerId: "r1", matchJob: () => true });
		expect(assigned.prompt).toBe("why did t1 fail?");
		expect(assigned.turnId).toBe("t1");
		store.progress({ jobId: assigned.jobId, runnerId: "r1", seq: 0, delta: "looking… " });
		store.complete({ jobId: assigned.jobId, runnerId: "r1", outcome: "completed", output: "looking… t1 failed on tests." });
		await expect(pending).resolves.toEqual({
			reply: "looking… t1 failed on tests.",
			output: "looking… t1 failed on tests.",
			harness: "pi",
			model: null,
		});
	});

	it("fails fast 503 no_runner_available with loud miss reasons", async () => {
		const { dispatch } = makeDispatcher({ records: [] });
		const err = await dispatch({ projectId: "p1", prompt: "hi", harness: "pi" }).catch((e) => e);
		expect(err.code).toBe("no_runner_available");
		expect(err.statusCode).toBe(503);
		expect(err.message).toContain("no runners registered");

		const stale = makeDispatcher({
			records: [fleetRecord({ lastSeenAt: new Date(at - 61_000).toISOString() })],
		});
		const err2 = await stale.dispatch({ projectId: "p1", prompt: "hi", harness: "pi" }).catch((e) => e);
		expect(err2.code).toBe("no_runner_available");
		expect(err2.message).toContain("r1=STALE_HEARTBEAT");
	});

	it("pins the advanced override and fails fast 503 runner_unavailable", async () => {
		const { store, dispatch } = makeDispatcher({
			records: [fleetRecord({ runnerId: "r1" }), fleetRecord({ runnerId: "r2" })],
		});
		const pending = dispatch({ projectId: "p1", prompt: "hi", harness: "pi", runnerId: "r2" });
		// The job waits for r2 only.
		expect(store.pollForRunner({ runnerId: "r1", matchJob: () => true })).toBe(null);
		const assigned = store.pollForRunner({ runnerId: "r2", matchJob: () => true });
		store.complete({ jobId: assigned.jobId, runnerId: "r2", outcome: "completed", output: "pinned!" });
		await expect(pending).resolves.toMatchObject({ reply: "pinned!" });

		const ghost = makeDispatcher();
		const err = await ghost
			.dispatch({ projectId: "p1", prompt: "hi", harness: "pi", runnerId: "ghost" })
			.catch((e) => e);
		expect(err.code).toBe("runner_unavailable");
		expect(err.statusCode).toBe(503);
	});

	it("skips busy and opted-out runners at selection time", async () => {
		const busy = makeDispatcher({ holds: [{ runnerId: "r1" }] });
		const err = await busy.dispatch({ projectId: "p1", prompt: "hi", harness: "pi" }).catch((e) => e);
		expect(err.code).toBe("no_runner_available");
		expect(err.message).toContain("r1=BUSY_TASK_LEASE");

		const optedOut = makeDispatcher({
			records: [fleetRecord({ operatorConfig: { jobTypes: { runsImpromptu: false } } })],
		});
		const err2 = await optedOut.dispatch({ projectId: "p1", prompt: "hi", harness: "pi" }).catch((e) => e);
		expect(err2.code).toBe("no_runner_available");
		expect(err2.message).toContain("r1=JOB_TYPE_DISABLED");
	});

	it("refuses work while disabled and past the queue cap", async () => {
		const { dispatch } = makeDispatcher({ dispatchOver: { enabled: false } });
		const err = await dispatch({ projectId: "p1", prompt: "hi", harness: "pi" }).catch((e) => e);
		expect(err.code).toBe("impromptu_disabled");
		expect(err.statusCode).toBe(503);

		const full = makeDispatcher({ storeOver: { queueMax: 1 } });
		const pending = full.dispatch({ projectId: "p1", prompt: "first", harness: "pi" });
		const capped = await full.dispatch({ projectId: "p1", prompt: "second", harness: "pi" }).catch((e) => e);
		expect(capped.code).toBe("impromptu_queue_full");
		expect(capped.statusCode).toBe(429);
		const assigned = full.store.pollForRunner({ runnerId: "r1", matchJob: () => true });
		full.store.complete({ jobId: assigned.jobId, runnerId: "r1", outcome: "completed", output: "one" });
		await expect(pending).resolves.toMatchObject({ reply: "one" });
	});

	it("propagates runner failure and the opt-in timeout with partial output", async () => {
		const { store, dispatch } = makeDispatcher();
		const pending = dispatch({ projectId: "p1", prompt: "hi", harness: "pi" });
		const assigned = store.pollForRunner({ runnerId: "r1", matchJob: () => true });
		store.progress({ jobId: assigned.jobId, runnerId: "r1", seq: 0, delta: "partial…" });
		store.complete({ jobId: assigned.jobId, runnerId: "r1", outcome: "failed", error: "boom" });
		const err = await pending.catch((e) => e);
		expect(err.code).toBe("chat_prompt_failed");
		expect(err.partialOutput).toBe("partial…");

		const { dispatch: slow } = makeDispatcher();
		const timed = await slow({ projectId: "p1", prompt: "hi", harness: "pi", timeoutMs: 20 }).catch(
			(e) => e,
		);
		expect(timed.code).toBe("chat_prompt_timeout");
		expect(timed.partialOutput).toBe("");
	});
});

describe("createChatProgressForwarder", () => {
	it("broadcasts CHAT_PROGRESS frames throttled per turn", () => {
		let at = 1_000_000;
		const broadcast = vi.fn();
		const forward = createChatProgressForwarder({
			eventBridge: { broadcast },
			now: () => at,
		});
		forward({ projectId: "p1", turnId: "t1", tail: "a" });
		forward({ projectId: "p1", turnId: "t1", tail: "ab" });
		expect(broadcast).toHaveBeenCalledTimes(1);
		at += 500;
		forward({ projectId: "p1", turnId: "t1", tail: "abc" });
		expect(broadcast).toHaveBeenCalledTimes(2);
		// Another turn has its own throttle budget.
		forward({ projectId: "p1", turnId: "t2", tail: "z" });
		expect(broadcast).toHaveBeenCalledTimes(3);
		expect(broadcast).toHaveBeenCalledWith(
			"p1",
			"CHAT_PROGRESS",
			expect.objectContaining({ turnId: "t1", tail: "abc" }),
		);
	});

	it("skips turns without a turnId and survives a throwing bridge", () => {
		const broadcast = vi.fn();
		const forward = createChatProgressForwarder({ eventBridge: { broadcast } });
		forward({ projectId: "p1", turnId: null, tail: "x" });
		expect(broadcast).not.toHaveBeenCalled();
		const missing = createChatProgressForwarder({});
		expect(() => missing({ projectId: "p1", turnId: "t1", tail: "x" })).not.toThrow();
		const throwing = createChatProgressForwarder({
			eventBridge: {
				broadcast: () => {
					throw new Error("socket gone");
				},
			},
		});
		expect(() => throwing({ projectId: "p1", turnId: "t1", tail: "x" })).not.toThrow();
	});
});

describe("normalizeTimeoutMs", () => {
	it("passes finite positive ceilings through", () => {
		expect(normalizeTimeoutMs(1000)).toBe(1000);
		expect(normalizeTimeoutMs(0.5)).toBe(0.5);
	});

	it("disables the documented opt-outs", () => {
		expect(normalizeTimeoutMs(0)).toBe(0);
		expect(normalizeTimeoutMs(null)).toBe(0);
		expect(normalizeTimeoutMs(undefined)).toBe(0);
	});

	it("degrades degenerate inputs to disabled instead of false-firing", () => {
		// NaN/negative/Infinity/non-numbers must never arm an instant
		// timeout: the turn runs until the Runner settles it (fail-safe).
		expect(normalizeTimeoutMs(Number.NaN)).toBe(0);
		expect(normalizeTimeoutMs(-1)).toBe(0);
		expect(normalizeTimeoutMs(Number.POSITIVE_INFINITY)).toBe(0);
		expect(normalizeTimeoutMs("1000")).toBe(0);
		expect(normalizeTimeoutMs({})).toBe(0);
	});
});

describe("truncateOutputTail", () => {
	it("passes short text through and bounds long text behind the marker", () => {
		expect(truncateOutputTail("short")).toBe("short");
		expect(truncateOutputTail("")).toBe("");
		expect(truncateOutputTail(null)).toBe("");
		const long = "a".repeat(100);
		const bounded = truncateOutputTail(long, 20);
		expect(bounded.length).toBeLessThanOrEqual(20);
		expect(bounded.startsWith(`${CHAT_OUTPUT_TRUNCATED_MARKER}\n`)).toBe(true);
		expect(bounded.endsWith("a".repeat(5))).toBe(true);
		// Degenerate cap (no room for the marker): the raw tail wins, bound kept.
		expect(truncateOutputTail("abcdef", 4)).toBe("cdef");
	});

	it("keeps the production tail cap at 2000 chars", () => {
		expect(CHAT_OUTPUT_TAIL_MAX_CHARS).toBe(2000);
	});
});

describe("ImpromptuStore shutdown", () => {
	it("fails parked waiters loudly and drops the queue for restarts", async () => {
		const { store } = makeStore();
		const first = store.enqueue({ projectId: "p1", prompt: "one" });
		const second = store.enqueue({ projectId: "p1", prompt: "two" });
		const firstFailure = store.waitFor(first.jobId).catch((err) => err);
		const secondFailure = store.waitFor(second.jobId).catch((err) => err);
		store.pollForRunner({ runnerId: "r1", matchJob: () => true });
		store.progress({ jobId: first.jobId, runnerId: "r1", seq: 0, delta: "partial…" });
		expect(store.shutdown("restarting")).toEqual({ failed: 2 });
		const firstErr = await firstFailure;
		const secondErr = await secondFailure;
		for (const err of [firstErr, secondErr]) {
			expect(err.code).toBe("chat_prompt_failed");
			expect(err.statusCode).toBe(502);
			expect(err.message).toContain("restarting");
		}
		expect(firstErr.partialOutput).toBe("partial…");
		expect(secondErr.partialOutput).toBe("");
		expect(store.get(first.jobId)).toBe(null);
		expect(store.snapshot()).toMatchObject({ queued: 0, claimed: 0, failed: 2 });
		// A retried Runner completion after the drop is a recorded no-op.
		expect(
			store.complete({ jobId: first.jobId, runnerId: "r1", outcome: "completed", output: "late" }),
		).toEqual({ duplicate: true });
	});

	it("is a no-op on an empty queue", () => {
		const { store } = makeStore();
		expect(store.shutdown()).toEqual({ failed: 0 });
	});
});
