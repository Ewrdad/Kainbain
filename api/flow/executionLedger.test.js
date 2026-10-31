import { expect, test, describe, beforeEach } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ClaimStore } from "./claimStore.js";
import { ExecutionLedger, MAX_RUNNER_INTERRUPTS } from "./executionLedger.js";
const tmpClaimState = () =>
	path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kb-claim-test-")), "claims.json");



/***
 * MARK: ExecutionLedger Unit Tests
 * @description Verifies the wire receiving side: lease-first fencing on
 *   every call, per-execution progress dedupe, sequenced log ingest with
 *   gap markers, idempotent completion with SHA presence states,
 *   reconciler divergence counting, and interruption.
 ***/

function stores() {
	const claimStore = new ClaimStore({ stateFile: tmpClaimState() });
	const task = {
		id: "t1",
		status: "in_stage",
		currentStageId: "s1",
		history: [],
	};
	const taskStore = {
		getTask: () => task,
	};
	const projectStore = { getProject: () => ({ cwd: null }) };
	return { claimStore, taskStore, projectStore, task: { ref: task } };
}

function claimed(ctx, runnerId = "r1") {
	const { executionId, epoch } = ctx.claimStore.claim("t1", runnerId);
	return { executionId, epoch };
}

function gitRepoWithCommit() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-ledger-"));
	execSync("git init -q . && git config user.email t@t.t && git config user.name t", { cwd: dir });
	fs.writeFileSync(path.join(dir, "f.txt"), "x");
	execSync("git add . && git commit -qm init", { cwd: dir });
	const sha = execSync("git rev-parse HEAD", { cwd: dir }).toString().trim();
	return { dir, sha };
}

describe("ExecutionLedger", () => {
	let ctx;
	let ledger;
	beforeEach(() => {
		ctx = stores();
		ledger = new ExecutionLedger();
	});

	test("records progress once; retried reports are no-ops", () => {
		const { executionId, epoch } = claimed(ctx);
		const base = {
			claimStore: ctx.claimStore,
			taskStore: ctx.taskStore,
			projectId: "p1",
			taskId: "t1",
			runnerId: "r1",
			executionId,
			epoch,
			stageId: "s1",
			event: "started",
		};
		expect(ledger.recordProgress(base)).toEqual({ recorded: true, duplicate: false });
		expect(ledger.recordProgress(base)).toEqual({ recorded: true, duplicate: true });
		expect(ledger.snapshot().progressRecorded).toBe(1);
		expect(ledger.snapshot().progressDuplicates).toBe(1);
		expect(ctx.taskStore.getTask().history).toHaveLength(1);
		expect(ledger.stageFor(executionId)).toBe("s1");
		expect(ledger.stageFor("unknown-exec")).toBeNull();
	});

	test("stores the reported stage prompt and drops it on completion", async () => {
		const ctx = stores();
		const ledger = new ExecutionLedger();
		const { executionId, epoch } = claimed(ctx);
		const base = {
			claimStore: ctx.claimStore,
			taskStore: ctx.taskStore,
			projectId: "p1",
			taskId: "t1",
			runnerId: "r1",
			executionId,
			epoch,
			stageId: "s1",
		};
		expect(ledger.promptFor(executionId)).toBeNull();
		ledger.recordProgress({ ...base, event: "started" });
		expect(ledger.promptFor(executionId)).toBeNull();
		expect(ledger.servingFor(executionId)).toBeNull();
		ledger.recordProgress({
			...base,
			event: "prompted",
			prompt: "# Do the thing",
			harness: "pi",
			model: "muse-spark",
		});
		expect(ledger.promptFor(executionId)).toBe("# Do the thing");
		expect(ledger.servingFor(executionId)).toEqual({ harness: "pi", model: "muse-spark" });
		const { dir, sha } = gitRepoWithCommit();
		await ledger.completeExecution({
			...base,
			projectStore: { getProject: () => ({ cwd: dir }) },
			sha,
			branch: "kb/t1",
			posture: "T1:pi:model",
			outcome: { status: "passed" },
		});
		expect(ledger.promptFor(executionId)).toBeNull();
		expect(ledger.servingFor(executionId)).toBeNull();
	});

	test("prompted with harness but null model stores model: null (CI contract), never a fake model", () => {
		const { executionId, epoch } = claimed(ctx);
		const base = {
			claimStore: ctx.claimStore,
			taskStore: ctx.taskStore,
			projectId: "p1",
			taskId: "t1",
			runnerId: "r1",
			executionId,
			epoch,
			stageId: "s1",
		};
		// CI stage: the Runner omits `model` on the wire, so it arrives undefined.
		ledger.recordProgress({ ...base, stageId: "s1", event: "prompted", prompt: "npm test", harness: "pi" });
		expect(ledger.servingFor(executionId)).toEqual({ harness: "pi", model: null });
		// Blank/whitespace harness AND model: no serving entry at all (progress
		// keys include stageId, so each call here is a distinct report).
		ledger.recordProgress({ ...base, stageId: "s2", event: "prompted", harness: "  ", model: "   " });
		expect(ledger.servingFor(executionId)).toEqual({ harness: "pi", model: null }); // unchanged: blank report did not overwrite
		// Non-prompted events never set the serving entry, even with a model attached.
		ledger.recordProgress({ ...base, stageId: "s3", event: "finished", harness: "pi", model: "m" });
		expect(ledger.servingFor(executionId)).toEqual({ harness: "pi", model: null });
		// A real agent-stage model is stored trimmed.
		ledger.recordProgress({ ...base, stageId: "s4", event: "prompted", harness: "pi", model: "  kimi-k3:cloud  " });
		expect(ledger.servingFor(executionId)).toEqual({ harness: "pi", model: "kimi-k3:cloud" });
		// The monitor JSON keeps model null (not "default"/""), so the UI hides the pill.
		ledger.recordProgress({ ...base, stageId: "s5", event: "prompted", harness: "pi", model: null });
		expect(JSON.parse(JSON.stringify(ledger.servingFor(executionId))).model).toBeNull();
		// Pre-fix Runners send the literal "default" sentinel: ingest drops
		// it to null (harness pill stays) so old Runners degrade gracefully.
		ledger.recordProgress({ ...base, stageId: "s6", event: "prompted", harness: "pi", model: "default" });
		expect(ledger.servingFor(executionId)).toEqual({ harness: "pi", model: null });
		// A sentinel-only report carries no information and overwrites nothing.
		ledger.recordProgress({ ...base, stageId: "s7", event: "prompted", model: "  Default " });
		expect(ledger.servingFor(executionId)).toEqual({ harness: "pi", model: null });
	});

	test("rejects progress on a stale epoch before touching state", () => {
		claimed(ctx);
		try {
			ledger.recordProgress({
				claimStore: ctx.claimStore,
				taskStore: ctx.taskStore,
				projectId: "p1",
				taskId: "t1",
				runnerId: "r1",
				executionId: "wrong",
				epoch: 99,
				stageId: "s1",
				event: "started",
			});
			expect.unreachable();
		} catch (err) {
			expect(err.statusCode).toBe(409);
			expect(err.code).toBe("STALE_EPOCH");
		}
		expect(ledger.snapshot().staleRejected).toBe(1);
		expect(ctx.taskStore.getTask().history).toHaveLength(0);
	});

	test("ingests ordered frames, dedupes retries, marks gaps", () => {
		const { executionId, epoch } = claimed(ctx);
		const base = {
			claimStore: ctx.claimStore,
			taskStore: ctx.taskStore,
			projectId: "p1",
			taskId: "t1",
			runnerId: "r1",
			executionId,
			epoch,
		};
		expect(ledger.ingestLogs({ ...base, seq: 0, bytes: "hello" })).toMatchObject({ accepted: true, duplicate: false });
		expect(ledger.ingestLogs({ ...base, seq: 0, bytes: "hello" })).toMatchObject({ accepted: true, duplicate: true });
		expect(ledger.ingestLogs({ ...base, seq: 3, bytes: "late" })).toMatchObject({ accepted: true, duplicate: false });
		const snap = ledger.snapshot();
		expect(snap.logFrames).toBe(2);
		expect(snap.logGaps).toBe(1);
		expect(snap.logDuplicates).toBe(1);
	});

	test("ingests structured event batches as canonical records", () => {
		const { executionId, epoch } = claimed(ctx);
		const base = {
			claimStore: ctx.claimStore,
			taskStore: ctx.taskStore,
			projectId: "p1",
			taskId: "t1",
			runnerId: "r1",
			executionId,
			epoch,
		};
		const receipt = ledger.ingestLogEvents({
			...base,
			seq: 0,
			events: [
				{ type: "tool_started", toolName: "bash", toolCallId: "c1", args: { command: "ls" } },
				{ type: "tool_finished", toolName: "bash", toolCallId: "c1", result: "ok", durationMs: 212 },
			],
		});
		expect(receipt).toMatchObject({ accepted: true, duplicate: false, seq: 0 });
		expect(receipt.entryCount).toBeGreaterThan(0);
		const entries = ctx.taskStore.getTask().logEntries;
		const call = entries.find((e) => e.text.startsWith("[TOOL]"));
		expect(call).toBeDefined();
		expect(call.text).toContain("ls");
		expect(call.tool.args).toEqual({ command: "ls" });
		expect(call.meta).toMatchObject({
			source: "runner-structured",
			runnerId: "r1",
			executionId,
			seq: 0,
		});
		const result = entries.find((e) => e.text.startsWith("[RESULT]"));
		expect(result).toBeDefined();
		expect(result.text).toContain("(212ms)");
		expect(result.meta.durationMs).toBe(212);
		expect(ledger.snapshot().logEventBatches).toBe(1);
	});

	test("structured ingest dedupes retries and marks gaps like text frames", () => {
		const { executionId, epoch } = claimed(ctx);
		const base = {
			claimStore: ctx.claimStore,
			taskStore: ctx.taskStore,
			projectId: "p1",
			taskId: "t1",
			runnerId: "r1",
			executionId,
			epoch,
		};
		const batch = [{ type: "harness_log", text: "hello" }];
		expect(ledger.ingestLogEvents({ ...base, seq: 0, events: batch })).toMatchObject({
			accepted: true,
			duplicate: false,
		});
		expect(ledger.ingestLogEvents({ ...base, seq: 0, events: batch })).toMatchObject({
			accepted: true,
			duplicate: true,
		});
		expect(ledger.ingestLogEvents({ ...base, seq: 2, events: batch })).toMatchObject({
			accepted: true,
			duplicate: false,
		});
		const snap = ledger.snapshot();
		expect(snap.logEventBatches).toBe(2);
		expect(snap.logEventGaps).toBe(1);
		expect(snap.logEventDuplicates).toBe(1);
		const entries = ctx.taskStore.getTask().logEntries;
		expect(
			entries.some((e) => e.text.includes("frames 1–1 missing")),
		).toBe(true);
	});

	test("structured ingest rejects bad batches before touching state", () => {
		const { executionId, epoch } = claimed(ctx);
		const base = {
			claimStore: ctx.claimStore,
			taskStore: ctx.taskStore,
			projectId: "p1",
			taskId: "t1",
			runnerId: "r1",
			executionId,
			epoch,
		};
		for (const bad of [
			{ seq: 0, events: [] },
			{ seq: 0, events: new Array(201).fill({ type: "harness_log", text: "x" }) },
			{ seq: -1, events: [{ type: "harness_log", text: "x" }] },
			{ seq: 0, events: "nope" },
			{ seq: 0, events: [{ nope: true }] },
		]) {
			try {
				ledger.ingestLogEvents({ ...base, ...bad });
				expect.unreachable();
			} catch (err) {
				expect(err.statusCode).toBe(400);
				expect(err.code).toBe("INVALID_LOG_EVENTS_ARGS");
			}
		}
		expect(ctx.taskStore.getTask().logEntries ?? []).toHaveLength(0);
		try {
			ledger.ingestLogEvents({
				...base,
				executionId: "wrong",
				epoch: 99,
				seq: 0,
				events: [{ type: "harness_log", text: "x" }],
			});
			expect.unreachable();
		} catch (err) {
			expect(err.statusCode).toBe(409);
		}
	});

	test("an invalid batch with a seq gap is rejected without writing a gap marker", () => {
		const { executionId, epoch } = claimed(ctx);
		const base = {
			claimStore: ctx.claimStore,
			taskStore: ctx.taskStore,
			projectId: "p1",
			taskId: "t1",
			runnerId: "r1",
			executionId,
			epoch,
		};
		// seq 3 arrives first: a gap exists, but the batch carries no usable
		// events — the 400 must come before any task mutation (no spurious
		// "frames missing" marker), and the seq cursor must stay at 0 so a
		// corrected batch at seq 0 is not mistaken for a gap either.
		try {
			ledger.ingestLogEvents({ ...base, seq: 3, events: [{ nope: true }] });
			expect.unreachable();
		} catch (err) {
			expect(err.statusCode).toBe(400);
			expect(err.code).toBe("INVALID_LOG_EVENTS_ARGS");
		}
		expect(ctx.taskStore.getTask().logEntries ?? []).toHaveLength(0);
		const snap = ledger.snapshot();
		expect(snap.logEventBatches).toBe(0);
		expect(snap.logEventGaps).toBe(0);
		// A valid batch at seq 0 is still accepted cleanly afterwards.
		expect(
			ledger.ingestLogEvents({ ...base, seq: 0, events: [{ type: "harness_log", text: "ok" }] }),
		).toMatchObject({ accepted: true, duplicate: false });
		expect(ledger.snapshot().logEventGaps).toBe(0);
		const entries = ctx.taskStore.getTask().logEntries;
		expect(entries.some((e) => e.text.includes("missing"))).toBe(false);
		expect(entries.some((e) => e.text.includes("ok"))).toBe(true);
	});

	test("structured ingest never stores secrets or unserializable values", () => {
		const { executionId, epoch } = claimed(ctx);
		const base = {
			claimStore: ctx.claimStore,
			taskStore: ctx.taskStore,
			projectId: "p1",
			taskId: "t1",
			runnerId: "r1",
			executionId,
			epoch,
		};
		ledger.ingestLogEvents({
			...base,
			seq: 0,
			events: [
				{ type: "tool_started", toolName: "bash", toolCallId: "c9", args: { apiKey: "supersecretvalue" } },
				{ type: "tool_finished", toolName: "bash", toolCallId: "c9", result: "email alice@example.com" },
			],
		});
		const stored = JSON.stringify(ctx.taskStore.getTask().logEntries);
		expect(stored).not.toContain("supersecretvalue");
		expect(stored).not.toContain("alice@example.com");
		// An unserializable batch member is dropped, the usable one lands.
		const circular = { type: "harness_log", text: "loop" };
		circular.self = circular;
		const receipt = ledger.ingestLogEvents({
			...base,
			seq: 1,
			events: [circular, { type: "harness_log", text: "kept" }],
		});
		expect(receipt).toMatchObject({ accepted: true, duplicate: false });
		expect(ledger.snapshot().logEventsDropped).toBe(1);
		const entries = ctx.taskStore.getTask().logEntries;
		expect(entries.some((e) => e.text.includes("kept"))).toBe(true);
	});

	test("a full run ingested as batches reads back as complete history", async () => {
		const { renderLogEntriesText } = await import("../watch/processLogs.js");
		const { executionId, epoch } = claimed(ctx);
		const base = {
			claimStore: ctx.claimStore,
			taskStore: ctx.taskStore,
			projectId: "p1",
			taskId: "t1",
			runnerId: "r1",
			executionId,
			epoch,
		};
		const batches = [
			[{ type: "run_started" }],
			[{ type: "message_started", message: { role: "assistant" } }],
			[
				{
					type: "assistant_delta",
					assistantMessageEvent: { type: "text_delta", delta: "working on it" },
				},
			],
			[{ type: "assistant_delta", assistantMessageEvent: { type: "text_end" } }],
			[{ type: "reasoning_delta", delta: "considering edge cases" }],
			[
				{
					type: "tool_started",
					toolName: "bash",
					toolCallId: "c-full",
					args: { command: "npm test" },
				},
			],
			[
				{
					type: "tool_finished",
					toolName: "bash",
					toolCallId: "c-full",
					result: "148 passed",
					durationMs: 1250,
				},
			],
			[{ type: "usage_updated", usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } }],
			[{ type: "permission_requested", method: "bash", target: "npm test" }],
			[{ type: "plan_updated", steps: [{ title: "run tests" }] }],
			[{ type: "session_meta", model: "probe" }],
			[{ type: "harness_log", text: "[PROBE] settle note" }],
		];
		let seq = 0;
		for (const events of batches) {
			const receipt = ledger.ingestLogEvents({ ...base, seq: seq++, events });
			expect(receipt).toMatchObject({ accepted: true, duplicate: false });
		}
		const entries = ctx.taskStore.getTask().logEntries;
		// History carries every survey-required detail class: status text,
		// actions (tool call + args), full results, timings, usage, plans.
		const text = renderLogEntriesText(entries);
		expect(text).toContain("working on it");
		expect(text).toContain("[TOOL]");
		expect(text).toContain("npm test");
		expect(text).toContain("[RESULT]");
		expect(text).toContain("148 passed");
		expect(text).toContain("(1.3s)");
		// Telemetry lives on its own feed (never in the narrative render),
		// selectable in the UI exactly like the embedded path.
		expect(renderLogEntriesText(entries, { feed: "telemetry" })).toContain("[USAGE]");
		expect(text).toContain("[PERM]");
		expect(text).toContain("[PLAN]");
		const kinds = new Set(entries.map((e) => e.kind));
		for (const kind of ["assistant", "thinking", "tool", "telemetry", "permission", "plan", "system"]) {
			expect(kinds, `history missing kind '${kind}'`).toContain(kind);
		}
		// Telemetry and raw lanes never leak into the narrative render.
		expect(text).not.toContain("[RAW]");
	});

	test("structured processors are dropped on completion", async () => {
		const { executionId, epoch } = claimed(ctx);
		const base = {
			claimStore: ctx.claimStore,
			taskStore: ctx.taskStore,
			projectId: "p1",
			taskId: "t1",
			runnerId: "r1",
			executionId,
			epoch,
		};
		ledger.ingestLogEvents({ ...base, seq: 0, events: [{ type: "harness_log", text: "hi" }] });
		expect(ledger.logProcessors.has(executionId)).toBe(true);
		await ledger.completeExecution({
			...base,
			projectStore: ctx.projectStore,
		});
		expect(ledger.logProcessors.has(executionId)).toBe(false);
		expect(ledger.logEventNextSeq.has(executionId)).toBe(false);
	});

	test("completes once, releases the lease, stays idempotent", async () => {
		const { executionId, epoch } = claimed(ctx);
		const base = {
			claimStore: ctx.claimStore,
			taskStore: ctx.taskStore,
			projectStore: ctx.projectStore,
			projectId: "p1",
			taskId: "t1",
			runnerId: "r1",
			executionId,
			epoch,
		};
		const first = await ledger.completeExecution(base);
		expect(first).toMatchObject({ accepted: true, duplicate: false });
		expect(ctx.claimStore.describe("t1")).toBeNull();
		const second = await ledger.completeExecution(base);
		expect(second).toEqual({ accepted: true, duplicate: true });
		expect(ledger.snapshot().completions).toBe(1);
		expect(ledger.snapshot().completionDuplicates).toBe(1);
	});

	test("completing with a superseded epoch is stale", async () => {
		const first = claimed(ctx, "r1");
		ctx.claimStore.invalidate("t1");
		claimed(ctx, "r2");
		try {
			await ledger.completeExecution({
				claimStore: ctx.claimStore,
				taskStore: ctx.taskStore,
				projectStore: ctx.projectStore,
				projectId: "p1",
				taskId: "t1",
				runnerId: "r1",
				executionId: first.executionId,
				epoch: first.epoch,
			});
			expect.unreachable();
		} catch (err) {
			expect(err.statusCode).toBe(409);
			expect(err.code).toBe("STALE_EPOCH");
		}
	});

	test("verifies SHA presence in the backend-visible repo", async () => {
		const { dir, sha } = gitRepoWithCommit();
		try {
			const local = {
				getProject: () => ({ cwd: dir, hasUpstreamRepo: false }),
			};
			const { executionId, epoch } = claimed(ctx);
			const ok = await ledger.completeExecution({
				claimStore: ctx.claimStore,
				taskStore: ctx.taskStore,
				projectStore: local,
				projectId: "p1",
				taskId: "t1",
				runnerId: "r1",
				executionId,
				epoch,
				sha,
				branch: "kb/t1",
			});
			expect(ok.shaState).toBe("present");

			ctx.claimStore.invalidate("t1");
			const next = ctx.claimStore.claim("t1", "r1");
			const bad = await ledger.completeExecution({
				claimStore: ctx.claimStore,
				taskStore: ctx.taskStore,
				projectStore: local,
				projectId: "p1",
				taskId: "t1",
				runnerId: "r1",
				executionId: next.executionId,
				epoch: next.epoch,
				sha: "0123456789abcdef0123456789abcdef01234567",
			});
			expect(bad.shaState).toBe("unverifiable");
			expect(ledger.snapshot().unverifiedSha).toBe(1);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	test("defers remote SHA verification to a Runner with a fresh fetch", async () => {
		const remote = {
			getProject: () => ({ cwd: "/repo", hasUpstreamRepo: true }),
		};
		const first = claimed(ctx);
		const sha = "a".repeat(40);
		const out = await ledger.completeExecution({
			claimStore: ctx.claimStore,
			taskStore: ctx.taskStore,
			projectStore: remote,
			projectId: "p1",
			taskId: "t1",
			runnerId: "r1",
			executionId: first.executionId,
			epoch: first.epoch,
			sha,
			branch: "kb/t1",
		});
		expect(out.shaState).toBe("unverified-remote");
		expect(ctx.taskStore.getTask().pendingPushVerification).toMatchObject({
			sha,
			verified: false,
		});
		// Stale executions cannot confirm: the lease was released.
		expect(() =>
			ledger.noteRemoteVerification({
				claimStore: ctx.claimStore,
				taskStore: ctx.taskStore,
				projectId: "p1",
				taskId: "t1",
				runnerId: "r1",
				executionId: first.executionId,
				epoch: first.epoch,
				sha,
				present: true,
			}),
		).toThrowError(expect.objectContaining({ code: "STALE_EPOCH" }));
		// The next lease holder confirms against its fresh fetch.
		const next = ctx.claimStore.claim("t1", "r2");
		const confirmed = ledger.noteRemoteVerification({
			claimStore: ctx.claimStore,
			taskStore: ctx.taskStore,
			projectId: "p1",
			taskId: "t1",
			runnerId: "r2",
			executionId: next.executionId,
			epoch: next.epoch,
			sha,
			present: true,
		});
		expect(confirmed).toEqual({ verified: true });
		expect(ctx.taskStore.getTask().pendingPushVerification).toMatchObject({
			sha,
			verified: true,
			verifiedBy: "r2",
		});
		expect(ledger.snapshot().verifiedSha).toBe(1);
	});

	test("counts divergence when the task moved past the reported stage", async () => {
		const { executionId, epoch } = claimed(ctx);
		ledger.recordProgress({
			claimStore: ctx.claimStore,
			taskStore: ctx.taskStore,
			projectId: "p1",
			taskId: "t1",
			runnerId: "r1",
			executionId,
			epoch,
			stageId: "s1",
			event: "finished",
		});
		ctx.taskStore.getTask().currentStageId = "s2";
		const out = await ledger.completeExecution({
			claimStore: ctx.claimStore,
			taskStore: ctx.taskStore,
			projectStore: ctx.projectStore,
			projectId: "p1",
			taskId: "t1",
			runnerId: "r1",
			executionId,
			epoch,
		});
		expect(out.accepted).toBe(true);
		expect(ledger.snapshot().divergences).toBe(1);
	});

	test("interrupts: drops the lease and parks the task", () => {
		const { executionId } = claimed(ctx);
		const out = ledger.interruptExecution({
			claimStore: ctx.claimStore,
			taskStore: ctx.taskStore,
			projectId: "p1",
			taskId: "t1",
			runnerId: "r1",
			executionId,
		});
		expect(out).toEqual({ interrupted: true, interruptCount: 1, escalated: false });
		expect(ctx.taskStore.getTask().status).toBe("interrupted");
		expect(ctx.claimStore.describe("t1")).toBeNull();
		expect(ledger.snapshot().interrupts).toBe(1);
	});

	test("interrupts: records the runner-supplied reason in task history", () => {
		const { executionId } = claimed(ctx);
		const out = ledger.interruptExecution({
			claimStore: ctx.claimStore,
			taskStore: ctx.taskStore,
			projectId: "p1",
			taskId: "t1",
			runnerId: "r1",
			executionId,
			reason: "Runner workdir unavailable: Worktree cap reached (~5)",
		});
		expect(out).toEqual({ interrupted: true, interruptCount: 1, escalated: false });
		const actions = ctx.taskStore.getTask().history.map((h) => String(h.action));
		expect(actions.some((a) => a.includes("lease dropped"))).toBe(true);
		expect(
			actions.some((a) => a.includes("Reason: Runner workdir unavailable: Worktree cap reached")),
		).toBe(true);
	});

	test("interrupts: escalates past the consecutive bound on the same stage", () => {
		const interruptOnce = () => {
			const { executionId } = claimed(ctx);
			return ledger.interruptExecution({
				claimStore: ctx.claimStore,
				taskStore: ctx.taskStore,
				projectId: "p1",
				taskId: "t1",
				runnerId: "r1",
				executionId,
			});
		};
		let out;
		for (let i = 0; i < MAX_RUNNER_INTERRUPTS - 1; i++) {
			out = interruptOnce();
			expect(out.escalated).toBe(false);
		}
		out = interruptOnce();
		expect(out).toEqual({
			interrupted: true,
			interruptCount: MAX_RUNNER_INTERRUPTS,
			escalated: true,
		});
		expect(ledger.snapshot().interruptEscalations).toBe(1);
		expect(
			ctx.taskStore
				.getTask()
				.history.some((h) => String(h.action).includes("escalated")),
		).toBe(true);
		// The task still re-queues as interrupted — escalation is
		// visibility, not a lifecycle change.
		expect(ctx.taskStore.getTask().status).toBe("interrupted");
	});

	test("interrupts: a stage change restarts the consecutive count", () => {
		for (let i = 0; i < MAX_RUNNER_INTERRUPTS - 1; i++) {
			const { executionId } = claimed(ctx);
			ledger.interruptExecution({
				claimStore: ctx.claimStore,
				taskStore: ctx.taskStore,
				projectId: "p1",
				taskId: "t1",
				runnerId: "r1",
				executionId,
			});
		}
		ctx.taskStore.getTask().currentStageId = "s2";
		const { executionId } = claimed(ctx);
		const out = ledger.interruptExecution({
			claimStore: ctx.claimStore,
			taskStore: ctx.taskStore,
			projectId: "p1",
			taskId: "t1",
			runnerId: "r1",
			executionId,
		});
		expect(out).toEqual({ interrupted: true, interruptCount: 1, escalated: false });
		expect(ledger.snapshot().interruptEscalations).toBe(0);
	});

	test("interrupt refuses terminal tasks", () => {
		claimed(ctx);
		ctx.taskStore.getTask().status = "complete";
		try {
			ledger.interruptExecution({
				claimStore: ctx.claimStore,
				taskStore: ctx.taskStore,
				projectId: "p1",
				taskId: "t1",
				runnerId: "r1",
			});
			expect.unreachable();
		} catch (err) {
			expect(err.statusCode).toBe(409);
			expect(err.code).toBe("NOTHING_TO_INTERRUPT");
		}
	});
});
