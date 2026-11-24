import { expect, test, describe } from "vitest";
import { ClaimStore } from "../claimStore.js";
import { scanClaimableTasks } from "./scanClaimableTasks.js";
import { CAPACITY_REFUSAL_HIDE_MS } from "../scheduler/capacityRefusalHide.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const tmpClaimState = () =>
	path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kb-claim-test-")), "claims.json");



/***
 * MARK: scanClaimableTasks Tests
 * @description Verifies the dispatch scan mirrors scheduler candidacy
 *   (in_stage, staged, unblocked, unclaimed, model stages only), orders
 *   closest-to-completion then oldest, and honors a project allowlist.
 ***/
describe("scanClaimableTasks", () => {
	const project = (id, stages) => ({ id, name: id, cwd: "/tmp", stages });
	const agent = { id: "s1", name: "S1", type: "agent" };
	const human = { id: "h1", name: "H1", type: "human" };

	function deps(tasksByProject, claimStore = new ClaimStore({ stateFile: tmpClaimState() })) {
		const projects = Object.keys(tasksByProject).map((id) =>
			project(id, [{ ...agent }]),
		);
		return {
			projectStore: { listProjects: () => projects },
			taskStore: {
				listTasks: (projectId) => tasksByProject[projectId] || [],
				isTaskBlocked: () => ({ blocked: false }),
			},
			claimStore,
		};
	}
	const t = (id, over = {}) => ({
		id,
		status: "in_stage",
		currentStageId: "s1",
		updatedAt: new Date(1_000_000).toISOString(),
		...over,
	});

	test("returns unclaimed agent tasks with requirements", () => {
		const out = scanClaimableTasks(deps({ p1: [t("t1")] }));
		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({
			projectId: "p1",
			taskId: "t1",
			req: { harness: "pi", tier: "T1", alias: null, runnableType: true },
		});
	});

	test("skips claimed, blocked, non-model, and unstaged tasks", () => {
		const claimStore = new ClaimStore({ stateFile: tmpClaimState() });
		claimStore.claim("held", "runner-a");
		const out = scanClaimableTasks(
			{
				projectStore: {
					listProjects: () => [project("p1", [{ ...agent }, { ...human, id: "s2" }])],
				},
				taskStore: {
					listTasks: () => [
						t("held"),
						t("blocked"),
						t("human-task", { currentStageId: "s2", stages: undefined }),
						t("done", { status: "complete" }),
						t("fine", { stages: [{ ...agent }] }),
					],
					isTaskBlocked: (projectId, taskId) => ({
						blocked: taskId === "blocked",
					}),
				},
				claimStore,
			},
		);
		expect(out.map((c) => c.taskId)).toEqual(["fine"]);
	});

	test("orders closest-to-completion then oldest, and honors allowlists", () => {
		const stages = [
			{ id: "s1", type: "agent" },
			{ id: "s2", type: "agent" },
		];
		const old = t("old", { currentStageId: "s1", updatedAt: new Date(1_000).toISOString() });
		const newer = t("new", { currentStageId: "s1", updatedAt: new Date(2_000).toISOString() });
		const far = t("far", { currentStageId: "s2", updatedAt: new Date(500).toISOString() });
		// Same late stage as "far" but newer: distinguishes the two modes.
		const farNew = t("far-new", {
			currentStageId: "s2",
			updatedAt: new Date(1_500).toISOString(),
		});
		const d = {
			projectStore: { listProjects: () => [project("p1", stages), project("p2", stages)] },
			taskStore: {
				listTasks: (pid) =>
					pid === "p1" ? [old, newer, far, farNew] : [t("other")],
				isTaskBlocked: () => ({ blocked: false }),
			},
			claimStore: new ClaimStore({ stateFile: tmpClaimState() }),
		};
		// Default (oldest-first, task 16d6fbd6): oldest waiting first across
		// projects; stage index no longer outranks wait age.
		expect(scanClaimableTasks(d).map((c) => c.taskId)).toEqual([
			"far",
			"old",
			"far-new",
			"new",
			"other",
		]);
		// Legacy rollback mode: closest-to-completion (highest stage index)
		// first, then oldest — the pre-16d6fbd6 order.
		expect(
			scanClaimableTasks(d, { order: "furthest-along", maxWaitMs: 0 }).map((c) => c.taskId),
		).toEqual(["far", "far-new", "old", "new", "other"]);
		expect(
			scanClaimableTasks(d, { projectIds: ["p2"] }).map((c) => c.taskId),
		).toEqual(["other"]);
	});

	test("picks up tasks on the non-active pipeline with their own stage's requirements", () => {
		// Two pipelines with disjoint stage ids; the UI views "default"
		// while the waiting task sits on "audit". The scan must return it
		// with the audit stage's requirements — never the active pipeline's
		// first stage (a human intake here, which would wrongly exclude it).
		const auditStage = { id: "audit-1", name: "Audit", type: "agent", harness: "codex", model: "m2" };
		const projectStore = {
			listProjects: () => [
				{
					id: "p1",
					name: "p1",
					cwd: "/tmp",
					harness: "pi",
					defaultModel: "m1",
					activeWorkflowId: "wf-default",
					stages: [{ id: "s1", name: "Intake", type: "human" }],
					workflows: [
						{ id: "wf-default", stages: [{ id: "s1", name: "Intake", type: "human" }] },
						{ id: "wf-audit", stages: [auditStage] },
					],
				},
			],
		};
		const out = scanClaimableTasks({
			projectStore,
			taskStore: {
				listTasks: () => [t("audit-task", { workflowId: "wf-audit", currentStageId: "audit-1" })],
				isTaskBlocked: () => ({ blocked: false }),
			},
			claimStore: new ClaimStore({ stateFile: tmpClaimState() }),
		});
		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({
			projectId: "p1",
			taskId: "audit-task",
			req: { harness: "codex", model: "m2", runnableType: true, stageId: "audit-1" },
		});
	});

	test("active-pipeline tasks dispatch exactly as before (characterization)", () => {
		// Same two-pipeline fixture, task on the active pipeline: the fix
		// must not change what already worked.
		const projectStore = {
			listProjects: () => [
				{
					id: "p1",
					name: "p1",
					cwd: "/tmp",
					harness: "pi",
					defaultModel: "m1",
					activeWorkflowId: "wf-default",
					stages: [{ id: "s1", name: "Build", type: "agent" }],
					workflows: [
						{ id: "wf-default", stages: [{ id: "s1", name: "Build", type: "agent" }] },
						{ id: "wf-audit", stages: [{ id: "audit-1", name: "Audit", type: "agent" }] },
					],
				},
			],
		};
		const out = scanClaimableTasks({
			projectStore,
			taskStore: {
				listTasks: () => [t("active-task", { workflowId: "wf-default", currentStageId: "s1" })],
				isTaskBlocked: () => ({ blocked: false }),
			},
			claimStore: new ClaimStore({ stateFile: tmpClaimState() }),
		});
		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({
			taskId: "active-task",
			req: { harness: "pi", model: "m1", tier: "T1", runnableType: true, stageId: "s1" },
		});
	});

	test("over-waiting tasks jump ahead oldest-first (starvation guard)", () => {
		const stages = [
			{ id: "s1", type: "agent" },
			{ id: "s2", type: "agent" },
		];
		const d = {
			projectStore: { listProjects: () => [project("p1", stages)] },
			taskStore: {
				listTasks: () => [
					t("fresh-far", {
						currentStageId: "s2",
						enteredStageAt: new Date(9_000).toISOString(),
					}),
					t("starved", {
						currentStageId: "s1",
						enteredStageAt: new Date(1_000).toISOString(),
					}),
					t("starved-older", {
						currentStageId: "s1",
						enteredStageAt: new Date(500).toISOString(),
					}),
				],
				isTaskBlocked: () => ({ blocked: false }),
			},
			claimStore: new ClaimStore({ stateFile: tmpClaimState() }),
		};
		// Both wait past the 5s cap: oldest-first regardless of stage.
		expect(
			scanClaimableTasks(d, { maxWaitMs: 5_000, now: 10_000 }).map((c) => c.taskId),
		).toEqual(["starved-older", "starved", "fresh-far"]);
		// Default mode (oldest-first, task 16d6fbd6): the oldest waiting task
		// runs first no matter the stage index — starvation is bounded by
		// construction, however long the early-stage tasks have waited.
		expect(scanClaimableTasks(d, { maxWaitMs: 0, now: 10_000 }).map((c) => c.taskId)).toEqual([
			"starved-older",
			"starved",
			"fresh-far",
		]);
		expect(scanClaimableTasks(d, { now: 10_000 }).map((c) => c.taskId)).toEqual([
			"starved-older",
			"starved",
			"fresh-far",
		]);
		// Legacy rollback mode (KAINBAIN_CENTRAL_QUEUE_ORDER=furthest-along)
		// with the guard off: pure closest-to-completion order, as before.
		expect(
			scanClaimableTasks(d, { order: "furthest-along", maxWaitMs: 0, now: 10_000 }).map(
				(c) => c.taskId,
			),
		).toEqual(["fresh-far", "starved-older", "starved"]);
		// Legacy mode WITH a configured guard: over-waiting tasks jump ahead.
		expect(
			scanClaimableTasks(d, { order: "furthest-along", maxWaitMs: 5_000, now: 10_000 }).map(
				(c) => c.taskId,
			),
		).toEqual(["starved-older", "starved", "fresh-far"]);
	});
});

/***
 * MARK: scanClaimableTasks re-dispatch backoff + refusal hide (task 3b82f6ae)
 * @description Fleet-path half of S1: a task+stage inside its re-dispatch
 *   backoff window (3+ consecutive resumes, 30s doubling to 5min) is NOT
 *   offered to any runner until the delay elapses — otherwise the
 *   embedded-scheduler fix would be bypassed by an instant fleet re-claim.
 *   And a task is hidden from the runner that just capacity-refused it for
 *   ~2min (`opts.runnerId`), so the same still-full runner cannot re-claim
 *   within milliseconds; every other runner still sees it.
 ***/
describe("scanClaimableTasks backoff + refusing-runner hide (task 3b82f6ae)", () => {
	const NOW = Date.parse("2026-11-23T12:00:00.000Z");
	const iso = (ms) => new Date(ms).toISOString();
	const agent = { id: "s1", name: "S1", type: "agent" };
	const project = { id: "p1", name: "p1", cwd: "/tmp", stages: [{ ...agent }] };

	function deps(tasks) {
		return {
			projectStore: { listProjects: () => [project] },
			taskStore: {
				listTasks: () => tasks,
				isTaskBlocked: () => ({ blocked: false }),
			},
			claimStore: new ClaimStore({ stateFile: tmpClaimState() }),
		};
	}
	const t = (id, over = {}) => ({
		id,
		status: "in_stage",
		currentStageId: "s1",
		updatedAt: iso(NOW - 60_000),
		...over,
	});

	test("a backed-off in_stage task is not offered until the delay elapses", () => {
		const backedOff = t("t-backed-off", {
			consecutiveResumes: 3,
			consecutiveResumeStage: "s1",
			lastResumedAt: iso(NOW - 1_000), // 30s backoff, 29s remaining
		});
		expect(scanClaimableTasks(deps([backedOff]), { now: NOW }).map((c) => c.taskId)).toEqual([]);
		// A task below the streak threshold is never delayed.
		const early = t("t-early", {
			consecutiveResumes: 2,
			consecutiveResumeStage: "s1",
			lastResumedAt: iso(NOW - 1_000),
		});
		expect(scanClaimableTasks(deps([early]), { now: NOW }).map((c) => c.taskId)).toEqual(["t-early"]);
		// Once 30s have passed since the last resume, the task is offered again.
		expect(
			scanClaimableTasks(deps([{ ...backedOff, lastResumedAt: iso(NOW - 31_000) }]), { now: NOW }).map(
				(c) => c.taskId,
			),
		).toEqual(["t-backed-off"]);
		// Backoff applies with no injected clock too (wall clock path).
		expect(
			scanClaimableTasks(deps([t("t-now", {
				consecutiveResumes: 3,
				consecutiveResumeStage: "s1",
				lastResumedAt: iso(Date.now() - 1_000),
			})])).map((c) => c.taskId),
		).toEqual([]);
	});

	test("a task is hidden from the refusing runner for ~2min, visible to others", () => {
		const refused = t("t-refused", {
			lastCapacityRefusal: { runnerId: "r-full", at: iso(NOW - 1_000) },
		});
		// The still-full runner does not see it…
		expect(
			scanClaimableTasks(deps([refused]), { now: NOW, runnerId: "r-full" }).map((c) => c.taskId),
		).toEqual([]);
		// …every other runner (and a scan with no runner id) still does.
		expect(
			scanClaimableTasks(deps([refused]), { now: NOW, runnerId: "r-other" }).map((c) => c.taskId),
		).toEqual(["t-refused"]);
		expect(scanClaimableTasks(deps([refused]), { now: NOW }).map((c) => c.taskId)).toEqual([
			"t-refused",
		]);
		// After the hide window the refusing runner sees it again.
		expect(
			scanClaimableTasks(deps([refused]), {
				now: NOW + CAPACITY_REFUSAL_HIDE_MS + 1,
				runnerId: "r-full",
			}).map((c) => c.taskId),
		).toEqual(["t-refused"]);
	});

	test("backoff and hide compose: a backed-off task stays hidden from everyone until the delay", () => {
		const both = t("t-both", {
			consecutiveResumes: 4, // 60s backoff
			consecutiveResumeStage: "s1",
			lastResumedAt: iso(NOW - 1_000),
			lastCapacityRefusal: { runnerId: "r-full", at: iso(NOW - 500) },
		});
		expect(scanClaimableTasks(deps([both]), { now: NOW, runnerId: "r-full" })).toEqual([]);
		expect(scanClaimableTasks(deps([both]), { now: NOW, runnerId: "r-other" })).toEqual([]);
		expect(
			scanClaimableTasks(deps([{ ...both, lastResumedAt: iso(NOW - 61_000) }]), {
				now: NOW,
				runnerId: "r-other",
			}).map((c) => c.taskId),
		).toEqual(["t-both"]);
		// Hide window expired but backoff still running → still hidden from the refuser only.
		expect(
			scanClaimableTasks(deps([{ ...both, lastResumedAt: iso(NOW - 61_000) }]), {
				now: NOW + CAPACITY_REFUSAL_HIDE_MS + 1,
				runnerId: "r-full",
			}).map((c) => c.taskId),
		).toEqual(["t-both"]);
	});
});
