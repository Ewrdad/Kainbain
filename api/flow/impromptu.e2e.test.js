import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import retrospectiveRoutes from "../routes/retrospective.js";
import { registerImpromptuRoutes } from "./impromptuRoutes.js";
import {
	ImpromptuStore,
	createChatProgressForwarder,
	createImpromptuDispatcher,
} from "./impromptuStore.js";

/***
 * MARK: impromptu e2e tests
 * @description End-to-end wire-protocol test for the impromptu T0 channel
 *   (ADR 0014) against one scoped Fastify: the REAL `POST /retrospective/chat`
 *   route, the REAL `createImpromptuDispatcher`, the REAL `ImpromptuStore`,
 *   and the REAL runner-facing `registerImpromptuRoutes` — with a fake Runner
 *   that polls/progresses/completes over HTTP inject exactly like
 *   `runner/daemon.js` + `runner/client.js` do. Pins the contract: one chat
 *   turn = one queued job = one claim = streamed progress fanned out as
 *   `CHAT_PROGRESS` = one settled HTTP 200 (or a coded 503/502).
 * @example npx vitest run flow/impromptu.e2e.test.js
 ***/

const CREDENTIALS = { r1: "cred-r1", r2: "cred-r2" };

function fleetRecord(runnerId, over = {}) {
	return {
		runnerId,
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

function makeRegistry(records) {
	const byCredential = new Map(
		Object.entries(CREDENTIALS).map(([runnerId, cred]) => [
			cred,
			records.find((r) => r.runnerId === runnerId) || null,
		]),
	);
	return {
		staleAfterMs: 60_000,
		records: () => records,
		authenticate: (credential) => {
			const record = byCredential.get(String(credential || "").trim());
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

const project = { id: "proj-1", name: "Fixture", cwd: "/tmp/kb-impromptu-e2e-fixture" };

const sampleTask = {
	id: "task-1",
	title: "Add pagination",
	status: "failed",
	stage: "Implement",
	stageId: "implement",
	workflowId: "wf-default",
	failureReason: "Tests failed",
	lastError: { message: "boom" },
	createdAt: "2026-09-20T10:00:00.000Z",
	updatedAt: "2026-09-20T12:00:00.000Z",
	history: [{ stage: "Implement", status: "FAILED", timestamp: "2026-09-20T12:00:00.000Z" }],
	reports: [{ path: "r1.md", stageId: "implement", stageName: "Implement", status: "FAILED" }],
};

async function buildStack({ records = [fleetRecord("r1"), fleetRecord("r2")], holds = [] } = {}) {
	const app = Fastify();
	const broadcast = vi.fn();
	const eventBridge = { broadcast };
	const impromptuStore = new ImpromptuStore({
		queueMax: 10,
		jobTtlMs: 600_000,
		claimTtlMs: 300_000,
		onProgress: createChatProgressForwarder({ eventBridge }),
	});
	const runnerRegistry = makeRegistry(records);
	const claimStore = { liveHolds: () => holds };
	const impromptuDispatcher = createImpromptuDispatcher({
		impromptuStore,
		runnerRegistry,
		claimStore,
		enabled: true,
		staleAfterMs: 60_000,
	});
	await app.register(registerImpromptuRoutes, {
		deps: { runnerRegistry, claimStore, impromptuStore, impromptuEnabled: true, minRunnerVersion: "0.0.0" },
	});
	await app.register(retrospectiveRoutes, {
		deps: {
			projectStore: { getProject: (id) => (id === project.id ? project : null) },
			taskStore: { getTask: (projectId, taskId) => (taskId === "task-1" ? sampleTask : null) },
			workflowRegistry: { list: () => [] },
			resolveAndGuardProject: (requestedId, reply) => requestedId || "proj-1",
			resolveHarness: () => ({ name: "pi", harness: { modelSelection: "list" } }),
			impromptuDispatcher,
		},
	});
	await app.ready();
	return { app, impromptuStore, broadcast, runnerRegistry };
}

const headersFor = (runnerId) => ({ "x-runner-credential": CREDENTIALS[runnerId] });

const poll = (app, runnerId) =>
	app.inject({ method: "POST", url: "/runners/impromptu/poll", headers: headersFor(runnerId) });

// The chat handler enqueues before it parks, but inject dispatches on a
// later tick — poll until the queued job shows up (bounded).
async function pollUntilAssigned(app, runnerId, attempts = 50) {
	for (let i = 0; i < attempts; i += 1) {
		const res = await poll(app, runnerId);
		const body = JSON.parse(res.payload);
		if (body.assigned) return body.job;
		await new Promise((r) => setTimeout(r, 10));
	}
	throw new Error(`runner ${runnerId} never got assigned a job`);
}

const chat = (app, payload) =>
	app.inject({ method: "POST", url: "/retrospective/chat", payload });

describe("impromptu channel end-to-end (chat route → store → runner routes)", () => {
	it("serves one chat turn through a polling runner with live progress and a 200 settle", async () => {
		const { app, broadcast } = await buildStack();
		const turn = chat(app, {
			projectId: "proj-1",
			messages: [{ role: "user", content: "Why did task-1 fail?" }],
			taskIds: ["task-1"],
			turnId: "turn-e2e-1",
		});

		const job = await pollUntilAssigned(app, "r1");
		expect(job).toMatchObject({
			projectId: "proj-1",
			kind: "retrospective-chat",
			harness: "pi",
			turnId: "turn-e2e-1",
		});
		// The compiled prompt carries the task context, the transcript, and
		// the T0 read-only framing.
		expect(job.prompt).toContain("Add pagination");
		expect(job.prompt).toContain("Why did task-1 fail?");
		expect(job.prompt).toContain("T0 read-only");

		// Claim fencing: a second runner polling the same queue gets nothing.
		const second = await poll(app, "r2");
		expect(JSON.parse(second.payload)).toEqual({ assigned: false, code: "NO_IMPROMPTU_WORK" });

		// Progress fans out as the chat working card's CHAT_PROGRESS frame.
		const prog = await app.inject({
			method: "POST",
			url: `/runners/impromptu/${job.jobId}/progress`,
			headers: headersFor("r1"),
			payload: { seq: 0, delta: "Task task-1 failed because… " },
		});
		expect(prog.statusCode).toBe(200);
		expect(broadcast).toHaveBeenCalledWith("proj-1", "CHAT_PROGRESS", {
			turnId: "turn-e2e-1",
			tail: "Task task-1 failed because… ",
			projectId: "proj-1",
		});

		const done = await app.inject({
			method: "POST",
			url: `/runners/impromptu/${job.jobId}/complete`,
			headers: headersFor("r1"),
			payload: {
				outcome: "completed",
				output: "Task task-1 failed at Implement (tests failed).\n```json\n[{\"title\":\"Fix tests\",\"goal\":\"Make the Implement stage green.\"}]\n```",
			},
		});
		expect(done.statusCode).toBe(200);

		const res = await turn;
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(body.reply).toContain("Task task-1 failed at Implement");
		expect(body.suggestions).toEqual([{ title: "Fix tests", goal: "Make the Implement stage green." }]);
		expect(body.harness).toBe("pi");
		expect(body.contextTaskIds).toEqual(["task-1"]);
		expect(body.unknownTaskIds).toEqual([]);
		expect(body.contextTruncated).toBe(false);
		expect(typeof body.contextChars).toBe("number");
		expect(typeof body.output).toBe("string");
		await app.close();
	});

	it("fails fast 503 no_runner_available when no runner is registered", async () => {
		const { app } = await buildStack({ records: [] });
		const res = await chat(app, {
			projectId: "proj-1",
			messages: [{ role: "user", content: "hi" }],
		});
		expect(res.statusCode).toBe(503);
		expect(JSON.parse(res.payload).code).toBe("no_runner_available");
		await app.close();
	});

	it("fails fast 503 runner_unavailable for a pinned runner that cannot serve", async () => {
		const { app } = await buildStack();
		const res = await chat(app, {
			projectId: "proj-1",
			messages: [{ role: "user", content: "hi" }],
			runnerId: "ghost",
		});
		expect(res.statusCode).toBe(503);
		expect(JSON.parse(res.payload).code).toBe("runner_unavailable");
		await app.close();
	});

	it("delivers a pinned turn only to the pinned runner", async () => {
		const { app } = await buildStack();
		const turn = chat(app, {
			projectId: "proj-1",
			messages: [{ role: "user", content: "hi" }],
			runnerId: "r2",
		});
		// r1 polls first and must NOT receive the pinned job.
		const r1First = await poll(app, "r1");
		expect(JSON.parse(r1First.payload)).toEqual({ assigned: false, code: "NO_IMPROMPTU_WORK" });
		const job = await pollUntilAssigned(app, "r2");
		await app.inject({
			method: "POST",
			url: `/runners/impromptu/${job.jobId}/complete`,
			headers: headersFor("r2"),
			payload: { outcome: "completed", output: "pinned answer" },
		});
		const res = await turn;
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload).reply).toBe("pinned answer");
		await app.close();
	});

	it("maps a runner failure to 502 chat_prompt_failed with the streamed partial output", async () => {
		const { app } = await buildStack();
		const turn = chat(app, {
			projectId: "proj-1",
			messages: [{ role: "user", content: "hi" }],
			turnId: "turn-e2e-fail",
		});
		const job = await pollUntilAssigned(app, "r1");
		await app.inject({
			method: "POST",
			url: `/runners/impromptu/${job.jobId}/progress`,
			headers: headersFor("r1"),
			payload: { seq: 0, delta: "partial thoughts…" },
		});
		await app.inject({
			method: "POST",
			url: `/runners/impromptu/${job.jobId}/complete`,
			headers: headersFor("r1"),
			payload: { outcome: "failed", error: "model exploded" },
		});
		const res = await turn;
		expect(res.statusCode).toBe(502);
		const body = JSON.parse(res.payload);
		expect(body.code).toBe("chat_prompt_failed");
		expect(body.error).toContain("model exploded");
		expect(body.output).toContain("partial thoughts…");
		await app.close();
	});
});
