import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runImpromptuJob } from "./impromptu.js";

function stubClient(overrides = {}) {
	const calls = { progress: [], complete: [], getProject: 0 };
	return {
		calls,
		client: {
			async getProject(projectId) {
				calls.getProject += 1;
				return { id: projectId, cwd: "/tmp/kb-impromptu-proj" };
			},
			async impromptuPoll() {
				throw new Error("not under test");
			},
			async impromptuProgress({ jobId, seq, delta }) {
				calls.progress.push({ jobId, seq, delta });
				return { ok: true };
			},
			async impromptuComplete(args) {
				calls.complete.push(args);
				return { ok: true };
			},
			...overrides,
		},
	};
}

function stubSession(overrides = {}) {
	const seen = { metas: [], prompts: [], disposed: 0 };
	let subscriber = null;
	return {
		seen,
		session: {
			async prompt(text, { onChunk } = {}) {
				seen.prompts.push(text);
				// A dual-emitting harness: the same text arrives through
				// BOTH channels during the prompt (subscribe first, like pi).
				subscriber?.({ type: "assistant_delta", delta: "hel" });
				onChunk?.("hel");
				subscriber?.({ type: "assistant_delta", delta: "lo" });
				onChunk?.("lo");
				return "hello";
			},
			subscribe(handler) {
				subscriber = handler;
				return () => {
					subscriber = null;
				};
			},
			async getLastAssistantText() {
				return "hello";
			},
			async dispose() {
				seen.disposed += 1;
			},
			...overrides,
		},
	};
}

function stubHarness(session, seenMetas) {
	return {
		async createSession(project, meta) {
			seenMetas.push({ project, meta });
			return session;
		},
	};
}

const baseJob = (overrides = {}) => ({
	jobId: "job-1",
	projectId: "p1",
	kind: "retrospective-chat",
	prompt: "why did t1 fail?",
	harness: "mock",
	model: null,
	timeoutMs: 60000,
	turnId: "t1",
	...overrides,
});

test("runImpromptuJob module is importable", () => {
	assert.equal(typeof runImpromptuJob, "function");
});

test("completes a read-only job and streams first-stream deltas with seqs", async () => {
	const { client, calls } = stubClient();
	const { session } = stubSession();
	const seenMetas = [];
	const config = { workRoot: fs.mkdtempSync(path.join(os.tmpdir(), "kb-imp-")), harnessId: "mock" };
	try {
		const out = await runImpromptuJob({
			config,
			client,
			logger: { log: () => {}, warn: () => {} },
			harnesses: { mock: stubHarness(session, seenMetas) },
			job: baseJob(),
		});
		assert.deepEqual(out, { jobId: "job-1", outcome: "completed" });
		// Read-only posture, no worktree/git: the session carries the
		// impromptu markers plus readOnly, never a task lease.
		assert.equal(seenMetas.length, 1);
		assert.equal(seenMetas[0].meta.taskId, "impromptu");
		assert.equal(seenMetas[0].meta.stageId, "job-1");
		assert.equal(seenMetas[0].meta.readOnly, true);
		assert.equal(seenMetas[0].project.id, "p1");
		// Prompt text is the backend-compiled prompt, verbatim.
		assert.equal(calls.complete.length, 1);
		assert.equal(calls.complete[0].outcome, "completed");
		assert.equal(calls.complete[0].output, "hello");
		// First-stream-wins: subscribe ("hel", "lo") arrived first, so the
		// duplicate onChunk emission is suppressed, never double-counted.
		assert.deepEqual(
			calls.progress.map((p) => p.delta),
			["hel", "lo"],
		);
		assert.deepEqual(
			calls.progress.map((p) => p.seq),
			[0, 1],
		);
	} finally {
		fs.rmSync(config.workRoot, { recursive: true, force: true });
	}
});

test("falls back to the streamed tail when the settle value is empty", async () => {
	const { client, calls } = stubClient();
	const { session } = stubSession({
		async prompt(text, { onChunk } = {}) {
			onChunk?.("streamed");
			return "";
		},
		async getLastAssistantText() {
			return "";
		},
	});
	const seenMetas = [];
	await runImpromptuJob({
		config: { workRoot: fs.mkdtempSync(path.join(os.tmpdir(), "kb-imp-")), harnessId: "mock" },
		client,
		logger: { log: () => {}, warn: () => {} },
		harnesses: { mock: stubHarness(session, seenMetas) },
		job: baseJob(),
	});
	assert.equal(calls.complete[0].outcome, "completed");
	assert.equal(calls.complete[0].output, "streamed");
});

test("reports failure and returns (never throws) when the model fails", async () => {
	const { client, calls } = stubClient();
	const { session } = stubSession({
		async prompt(text, { onChunk } = {}) {
			onChunk?.("before the boom");
			throw new Error("Model exploded");
		},
	});
	const seenMetas = [];
	const out = await runImpromptuJob({
		config: { workRoot: fs.mkdtempSync(path.join(os.tmpdir(), "kb-imp-")), harnessId: "mock" },
		client,
		logger: { log: () => {}, warn: () => {} },
		harnesses: { mock: stubHarness(session, seenMetas) },
		job: baseJob(),
	});
	assert.deepEqual(out, { jobId: "job-1", outcome: "failed" });
	assert.equal(calls.complete.length, 1);
	assert.equal(calls.complete[0].outcome, "failed");
	assert.match(calls.complete[0].error, /Model exploded/);
});

test("reports failure and returns when session creation fails", async () => {
	const { client, calls } = stubClient();
	const out = await runImpromptuJob({
		config: { workRoot: fs.mkdtempSync(path.join(os.tmpdir(), "kb-imp-")), harnessId: "mock" },
		client,
		logger: { log: () => {}, warn: () => {} },
		harnesses: {
			mock: {
				async createSession() {
					throw new Error("no session");
				},
			},
		},
		job: baseJob(),
	});
	assert.deepEqual(out, { jobId: "job-1", outcome: "failed" });
	assert.equal(calls.complete[0].outcome, "failed");
});

test("serves with the fallback harness and fails loud with none loaded", async () => {
	const warnings = [];
	const logger = { log: () => {}, warn: (m) => warnings.push(m) };
	const { session } = stubSession();
	const { client, calls } = stubClient();
	const seenMetas = [];
	const out = await runImpromptuJob({
		config: { workRoot: fs.mkdtempSync(path.join(os.tmpdir(), "kb-imp-")), harnessId: "mock" },
		client,
		logger,
		harnesses: { mock: stubHarness(session, seenMetas) },
		job: baseJob({ harness: "nope" }),
	});
	assert.equal(out.outcome, "completed");
	assert.match(warnings.join("\n"), /not loaded/);

	const noHarness = stubClient();
	const failed = await runImpromptuJob({
		config: { workRoot: fs.mkdtempSync(path.join(os.tmpdir(), "kb-imp-")) },
		client: noHarness.client,
		logger,
		harnesses: {},
		job: baseJob(),
	});
	assert.deepEqual(failed, { jobId: "job-1", outcome: "failed" });
	assert.equal(noHarness.calls.complete[0].outcome, "failed");
	assert.match(noHarness.calls.complete[0].error, /No harness available/);
	assert.equal(calls.complete.length, 1);
});

test("skips jobs with no prompt without completing", async () => {
	const { client, calls } = stubClient();
	const out = await runImpromptuJob({
		config: { workRoot: "runner-work" },
		client,
		logger: { log: () => {}, warn: () => {} },
		harnesses: {},
		job: { jobId: "job-9", prompt: "" },
	});
	assert.deepEqual(out, { jobId: "job-9", outcome: "skipped" });
	assert.equal(calls.complete.length, 0);
});

test("bounds a hung model by the job timeout and reports failure", async () => {
	const { client, calls } = stubClient();
	const { session } = stubSession({
		async prompt() {
			await new Promise((resolve) => setTimeout(resolve, 5000));
			return "too late";
		},
		subscribe() {
			return () => {};
		},
	});
	const seenMetas = [];
	const started = Date.now();
	const out = await runImpromptuJob({
		config: { workRoot: fs.mkdtempSync(path.join(os.tmpdir(), "kb-imp-")), harnessId: "mock" },
		client,
		logger: { log: () => {}, warn: () => {} },
		harnesses: { mock: stubHarness(session, seenMetas) },
		job: baseJob({ timeoutMs: 30 }),
	});
	assert.equal(out.outcome, "failed");
	assert.equal(calls.complete[0].outcome, "failed");
	assert.ok(Date.now() - started < 4000, "the hung prompt was bounded by the timeout");
});

test("removes the per-job scratch dir afterwards so turns never leak disk", async () => {
	const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kb-imp-"));
	const { client } = stubClient();
	const { session } = stubSession();
	const seenMetas = [];
	try {
		await runImpromptuJob({
			config: { workRoot, harnessId: "mock" },
			client,
			logger: { log: () => {}, warn: () => {} },
			harnesses: { mock: stubHarness(session, seenMetas) },
			job: baseJob(),
		});
		assert.equal(fs.existsSync(path.join(workRoot, "impromptu-job-1")), false);
	} finally {
		fs.rmSync(workRoot, { recursive: true, force: true });
	}
});

test("passes the requested model through to the session", async () => {
	const { client } = stubClient();
	const { session } = stubSession();
	const seenMetas = [];
	await runImpromptuJob({
		config: { workRoot: fs.mkdtempSync(path.join(os.tmpdir(), "kb-imp-")), harnessId: "mock" },
		client,
		logger: { log: () => {}, warn: () => {} },
		harnesses: { mock: stubHarness(session, seenMetas) },
		job: baseJob({ model: "m1" }),
	});
	assert.equal(seenMetas[0].meta.model, "m1");
});
