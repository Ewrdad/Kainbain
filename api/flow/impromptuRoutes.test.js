import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { registerImpromptuRoutes } from "./impromptuRoutes.js";
import { ImpromptuStore } from "./impromptuStore.js";

/***
 * MARK: impromptuRoutes tests
 * @description Verifies the runner-facing impromptu T0 endpoints (ADR 0014)
 *   against a scoped Fastify (never the shared app singleton): the poll
 *   matching matrix (capability, pin, busy, staleness, pause, version
 *   floor, disabled flag), progress forwarding + idempotency, idempotent
 *   completion, and credential auth rejections.
 ***/

const CREDENTIAL = "cred-r1";

function fleetRecord(over = {}) {
	return {
		runnerId: "r1",
		status: "active",
		lastSeenAt: new Date().toISOString(),
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
	};
}

function makeRegistry(records = [fleetRecord()]) {
	const byCredential = new Map([[CREDENTIAL, records[0]]]);
	return {
		staleAfterMs: 60_000,
		records: () => records,
		authenticate: (credential) => {
			const record = byCredential.get(credential);
			if (!record) {
				const err = new Error("Unknown or missing Runner credential.");
				err.statusCode = 401;
				err.code = "INVALID_CREDENTIAL";
				throw err;
			}
			if (record.status !== "active") {
				const err = new Error(`Runner ${record.runnerId} is ${record.status}.`);
				err.statusCode = 403;
				err.code = "RUNNER_NOT_ACTIVE";
				throw err;
			}
			return record;
		},
		isFresh: (record, now = Date.now()) => {
			const seen = Date.parse(record?.lastSeenAt || "");
			return Number.isFinite(seen) && now - seen <= 60_000;
		},
	};
}

async function buildApp({ records, holds = [], storeOpts = {}, routeDeps = {} } = {}) {
	const app = Fastify();
	const broadcast = vi.fn();
	const impromptuStore = new ImpromptuStore({
		queueMax: 10,
		jobTtlMs: 600_000,
		claimTtlMs: 300_000,
		...storeOpts,
	});
	const registry = makeRegistry(records);
	await app.register(registerImpromptuRoutes, {
		deps: {
			runnerRegistry: registry,
			claimStore: { liveHolds: () => holds },
			impromptuStore,
			impromptuEnabled: true,
			...routeDeps,
		},
	});
	await app.ready();
	return { app, impromptuStore, broadcast };
}

const authHeaders = { "x-runner-credential": CREDENTIAL };

describe("POST /runners/impromptu/poll", () => {
	let app;
	let impromptuStore;
	beforeEach(async () => {
		({ app, impromptuStore } = await buildApp());
	});

	it("answers NO_IMPROMPTU_WORK when the queue is empty", async () => {
		const res = await app.inject({ method: "POST", url: "/runners/impromptu/poll", headers: authHeaders });
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload)).toEqual({ assigned: false, code: "NO_IMPROMPTU_WORK" });
		await app.close();
	});

	it("assigns the oldest matching job with the wire shape", async () => {
		impromptuStore.enqueue({ projectId: "p1", prompt: "quiz me", harness: "pi", model: "m1", turnId: "t1" });
		const res = await app.inject({ method: "POST", url: "/runners/impromptu/poll", headers: authHeaders });
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(body.assigned).toBe(true);
		expect(body.job).toMatchObject({
			projectId: "p1",
			kind: "retrospective-chat",
			prompt: "quiz me",
			harness: "pi",
			model: "m1",
			turnId: "t1",
		});
		expect(typeof body.job.jobId).toBe("string");
		expect(typeof body.job.timeoutMs).toBe("number");
		await app.close();
	});

	it("skips jobs the poller cannot serve (harness, model, tier)", async () => {
		impromptuStore.enqueue({ projectId: "p1", prompt: "wrong harness", harness: "vibe" });
		const res = await app.inject({ method: "POST", url: "/runners/impromptu/poll", headers: authHeaders });
		expect(JSON.parse(res.payload)).toEqual({ assigned: false, code: "NO_IMPROMPTU_WORK" });
		await app.close();
	});

	it("delivers pinned jobs only to the pinned runner", async () => {
		impromptuStore.enqueue({ projectId: "p1", prompt: "pinned", harness: "pi", pinnedRunnerId: "r2" });
		const res = await app.inject({ method: "POST", url: "/runners/impromptu/poll", headers: authHeaders });
		expect(JSON.parse(res.payload)).toEqual({ assigned: false, code: "NO_IMPROMPTU_WORK" });
		await app.close();
	});

	it("refuses runners whose operator switched impromptu off", async () => {
		await app.close();
		({ app, impromptuStore } = await buildApp({
			records: [fleetRecord({ operatorConfig: { jobTypes: { runsImpromptu: false } } })],
		}));
		impromptuStore.enqueue({ projectId: "p1", prompt: "quiz me", harness: "pi" });
		const res = await app.inject({ method: "POST", url: "/runners/impromptu/poll", headers: authHeaders });
		expect(JSON.parse(res.payload)).toEqual({ assigned: false, code: "NO_IMPROMPTU_WORK" });
		await app.close();
	});

	it("never assigns a runner holding a live task lease", async () => {
		await app.close();
		({ app, impromptuStore } = await buildApp({ holds: [{ runnerId: "r1" }] }));
		impromptuStore.enqueue({ projectId: "p1", prompt: "quiz me", harness: "pi" });
		const res = await app.inject({ method: "POST", url: "/runners/impromptu/poll", headers: authHeaders });
		expect(JSON.parse(res.payload)).toEqual({ assigned: false, code: "NO_IMPROMPTU_WORK" });
		await app.close();
	});

	it("enforces the stale/paused/version gates like dispatch", async () => {
		await app.close();
		const staleAt = new Date(Date.now() - 61_000).toISOString();
		({ app } = await buildApp({ records: [fleetRecord({ lastSeenAt: staleAt })] }));
		const stale = await app.inject({ method: "POST", url: "/runners/impromptu/poll", headers: authHeaders });
		expect(stale.statusCode).toBe(409);
		expect(JSON.parse(stale.payload).code).toBe("STALE_RUNNER");
		await app.close();

		({ app } = await buildApp({ records: [fleetRecord({ paused: true })] }));
		const paused = await app.inject({ method: "POST", url: "/runners/impromptu/poll", headers: authHeaders });
		expect(paused.statusCode).toBe(409);
		expect(JSON.parse(paused.payload).code).toBe("RUNNER_PAUSED");
		await app.close();

		({ app } = await buildApp({
			records: [fleetRecord({ facts: { versions: { protocol: "v1", runner: "0.0.1" } } })],
			routeDeps: { minRunnerVersion: "9.9.9" },
		}));
		const old = await app.inject({ method: "POST", url: "/runners/impromptu/poll", headers: authHeaders });
		expect(old.statusCode).toBe(409);
		expect(JSON.parse(old.payload).code).toBe("RUNNER_VERSION_BELOW_MINIMUM");
		await app.close();
	});

	it("refuses polls while the channel is disabled", async () => {
		await app.close();
		({ app } = await buildApp({ routeDeps: { impromptuEnabled: false } }));
		const res = await app.inject({ method: "POST", url: "/runners/impromptu/poll", headers: authHeaders });
		expect(res.statusCode).toBe(409);
		expect(JSON.parse(res.payload).code).toBe("IMPROMPTU_DISABLED");
		await app.close();
	});

	it("rejects missing and unknown credentials like the other runner routes", async () => {
		const missing = await app.inject({ method: "POST", url: "/runners/impromptu/poll" });
		expect(missing.statusCode).toBe(401);
		expect(JSON.parse(missing.payload).code).toBe("INVALID_CREDENTIAL");
		const wrong = await app.inject({
			method: "POST",
			url: "/runners/impromptu/poll",
			headers: { "x-runner-credential": "nope" },
		});
		expect(wrong.statusCode).toBe(401);
		await app.close();
	});
});

describe("POST /runners/impromptu/:jobId/progress", () => {
	it("records deltas and forwards the tail to the store sink", async () => {
		const seen = [];
		const { app, impromptuStore } = await buildApp({
			storeOpts: { onProgress: (frame) => seen.push(frame) },
		});
		const job = impromptuStore.enqueue({ projectId: "p1", prompt: "q", harness: "pi", turnId: "t9" });
		void impromptuStore.waitFor(job.jobId).catch(() => {});
		impromptuStore.pollForRunner({ runnerId: "r1", matchJob: () => true });
		const res = await app.inject({
			method: "POST",
			url: `/runners/impromptu/${job.jobId}/progress`,
			headers: authHeaders,
			payload: { seq: 0, delta: "half " },
		});
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload)).toEqual({ ok: true });
		expect(seen).toEqual([{ jobId: job.jobId, projectId: "p1", turnId: "t9", tail: "half " }]);
		// Retried frames answer idempotent.
		const retry = await app.inject({
			method: "POST",
			url: `/runners/impromptu/${job.jobId}/progress`,
			headers: authHeaders,
			payload: { seq: 0, delta: "half " },
		});
		expect(JSON.parse(retry.payload)).toEqual({ ok: true, duplicate: true });
		expect(seen).toHaveLength(1);
		await app.close();
	});

	it("lands foreign and unknown progress stale, malformed frames 400", async () => {
		const { app, impromptuStore } = await buildApp({});
		const job = impromptuStore.enqueue({ projectId: "p1", prompt: "q", harness: "pi" });
		impromptuStore.pollForRunner({ runnerId: "r1", matchJob: () => true });
		const unknown = await app.inject({
			method: "POST",
			url: "/runners/impromptu/ghost/progress",
			headers: authHeaders,
			payload: { seq: 0, delta: "x" },
		});
		expect(unknown.statusCode).toBe(409);
		expect(JSON.parse(unknown.payload).code).toBe("STALE_IMPROMPTU");
		const badSeq = await app.inject({
			method: "POST",
			url: `/runners/impromptu/${job.jobId}/progress`,
			headers: authHeaders,
			payload: { seq: "zero", delta: "x" },
		});
		expect(badSeq.statusCode).toBe(400);
		expect(JSON.parse(badSeq.payload).code).toBe("INVALID_IMPROMPTU_ARGS");
		const unauthed = await app.inject({
			method: "POST",
			url: `/runners/impromptu/${job.jobId}/progress`,
			payload: { seq: 1, delta: "x" },
		});
		expect(unauthed.statusCode).toBe(401);
		await app.close();
	});
});

describe("POST /runners/impromptu/:jobId/complete", () => {
	it("settles the job and answers retried completions idempotent", async () => {
		const { app, impromptuStore } = await buildApp({});
		const job = impromptuStore.enqueue({ projectId: "p1", prompt: "q", harness: "pi" });
		const waiter = impromptuStore.waitFor(job.jobId);
		impromptuStore.pollForRunner({ runnerId: "r1", matchJob: () => true });
		const res = await app.inject({
			method: "POST",
			url: `/runners/impromptu/${job.jobId}/complete`,
			headers: authHeaders,
			payload: { outcome: "completed", output: "final answer" },
		});
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload)).toEqual({ ok: true });
		await expect(waiter).resolves.toEqual({ output: "final answer" });
		const retry = await app.inject({
			method: "POST",
			url: `/runners/impromptu/${job.jobId}/complete`,
			headers: authHeaders,
			payload: { outcome: "completed", output: "final answer" },
		});
		expect(JSON.parse(retry.payload)).toEqual({ ok: true, duplicate: true });
		await app.close();
	});

	it("reports runner failure to the waiter and validates the outcome", async () => {
		const { app, impromptuStore } = await buildApp({});
		const job = impromptuStore.enqueue({ projectId: "p1", prompt: "q", harness: "pi" });
		const failure = impromptuStore.waitFor(job.jobId).catch((err) => err);
		impromptuStore.pollForRunner({ runnerId: "r1", matchJob: () => true });
		const res = await app.inject({
			method: "POST",
			url: `/runners/impromptu/${job.jobId}/complete`,
			headers: authHeaders,
			payload: { outcome: "failed", error: "harness blew up" },
		});
		expect(res.statusCode).toBe(200);
		const err = await failure;
		expect(err.code).toBe("chat_prompt_failed");
		expect(err.message).toContain("harness blew up");
		await app.close();

		const second = await buildApp({});
		const job2 = second.impromptuStore.enqueue({ projectId: "p1", prompt: "q", harness: "pi" });
		second.impromptuStore.pollForRunner({ runnerId: "r1", matchJob: () => true });
		const bad = await second.app.inject({
			method: "POST",
			url: `/runners/impromptu/${job2.jobId}/complete`,
			headers: authHeaders,
			payload: { outcome: "maybe" },
		});
		expect(bad.statusCode).toBe(400);
		expect(JSON.parse(bad.payload).code).toBe("INVALID_IMPROMPTU_ARGS");
		const unauthed = await second.app.inject({
			method: "POST",
			url: `/runners/impromptu/${job2.jobId}/complete`,
			payload: { outcome: "completed", output: "x" },
		});
		expect(unauthed.statusCode).toBe(401);
		await second.app.close();
	});
});
