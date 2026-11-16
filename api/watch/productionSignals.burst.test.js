// Domain: Watching the Work — WP2 synthetic burst integration test.
// Proves every §3.8 minimum signal moves under a scripted scenario on
// ephemeral temp-dir fixtures (proj-alpha / proj-beta): burst throughput
// diverges per project without starving the quiet project, a busy project
// is skipped per-project while the other still claims, a forced conflict
// moves only the conflict counter, and the full exposition carries every
// signal with projectId labels. No live projects are touched (see the
// contamination guard at the bottom).
import { tempProjectsRoot, tempNotesRoot } from "../isolatedTestRoots.js";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ClaimStore } from "../flow/claimStore.js";
import { ExecutionLedger } from "../flow/executionLedger.js";
import { scanClaimableTasks } from "../flow/dispatch/scanClaimableTasks.js";
import { getScheduledQueue } from "../flow/scheduler/getScheduledQueue.js";
import { operatorConfigVerdict } from "../flow/dispatch/operatorConfigVerdict.js";
import { buildSkillsPromptSections } from "../skills/skillInjection.js";
import { evictOldestWorkdir } from "../../runner/project.js";
import { computeObservabilityMetrics } from "./observabilityMetrics.js";
import {
	recordClaimAttempt,
	recordClaimConflict,
	recordClaimExcluded,
	recordClaimSuccess,
	recordDispatchLatency,
	recordDispatchMiss,
	recordFencing,
	recordProjectClaim,
	resetProcessSignals,
	summarizeProductionSignals,
} from "./productionSignals.js";

const NOW = Date.parse("2026-11-16T12:00:00.000Z");
const PROJECT_A = "proj-alpha";
const PROJECT_B = "proj-beta";

const burstRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kb-wp2-burst-"));
const alphaDir = path.join(burstRoot, PROJECT_A);
const betaDir = path.join(burstRoot, PROJECT_B);
const claimStateDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-wp2-claims-"));
const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kb-wp2-work-"));

function stage(id) {
	return { id, name: `Stage ${id}`, type: "agent" };
}

const alphaProject = { id: PROJECT_A, name: "Alpha", cwd: alphaDir, stages: [stage("a1")] };
const betaProject = { id: PROJECT_B, name: "Beta", cwd: betaDir, stages: [stage("b1")] };

// Burst: alpha dumps six tasks waiting minutes; beta has two waiting seconds.
// One alpha task is already terminal (state-derived completed ground truth).
function burstTask(id, projectId, waitedMs, status = "in_stage") {
	const at = new Date(NOW - waitedMs).toISOString();
	return {
		id,
		projectId,
		title: `Task ${id}`,
		goal: `Goal ${id}`,
		status,
		currentStageId: projectId === PROJECT_A ? "a1" : "b1",
		blockedBy: [],
		enteredStageAt: at,
		updatedAt: at,
		timeInStage: Math.round(waitedMs / 1000),
		reports: [],
	};
}

const alphaTasks = [
	burstTask("a-1", PROJECT_A, 6 * 60_000),
	burstTask("a-2", PROJECT_A, 5 * 60_000),
	burstTask("a-3", PROJECT_A, 4 * 60_000),
	burstTask("a-4", PROJECT_A, 3 * 60_000),
	burstTask("a-5", PROJECT_A, 2 * 60_000),
	burstTask("a-6", PROJECT_A, 1 * 60_000),
	burstTask("a-done", PROJECT_A, 10 * 60_000, "completed"),
];
const betaTasks = [
	burstTask("b-1", PROJECT_B, 45_000),
	burstTask("b-2", PROJECT_B, 30_000),
	burstTask("b-done", PROJECT_B, 9 * 60_000, "completed"),
];

const ledger = new ExecutionLedger();

const store = {
	circuitState: { tripped: false },
	activeProjectId: PROJECT_A,
	lastCompletedTask: null,
	projectStore: {
		listProjects: () => [alphaProject, betaProject],
		getProject: (id) => (id === PROJECT_A ? alphaProject : betaProject),
	},
	listTasks: (projectId) => (projectId === PROJECT_A ? alphaTasks : betaTasks),
	getTask: (projectId, taskId) =>
		(projectId === PROJECT_A ? alphaTasks : betaTasks).find((t) => t.id === taskId) || null,
	isTaskBlocked: () => ({ blocked: false, blockers: [], hasCycle: false }),
	claimStore: new ClaimStore({ stateFile: path.join(claimStateDir, "phase1.json") }),
	getEngineState: () => ({ status: "idle", activeTaskId: null, activeProjectId: null }),
	getTaskReports: () => [],
	_resolveStagesForTask: (project) => project.stages,
	getScheduledQueue: (filterProjectId) => getScheduledQueue(store, filterProjectId, { now: NOW }),
	executionQueue: { isRunning: false, size: 0, highQueue: [], normalQueue: [] },
	schedulerRunning: false,
	schedulerStats: {},
	executionLedger: ledger,
	sessionStore: {},
};

function scanDeps() {
	return { projectStore: store.projectStore, taskStore: store, claimStore: store.claimStore };
}

// Live-tree contamination guard: nothing outside the temp roots may change.
const LIVE = {
	projectsDir: path.join(os.homedir(), "projects"),
	registryFile: path.join(os.homedir(), ".kainbain", "projects.json"),
	engineDir: path.join(os.homedir(), ".kainbain", "engine"),
};

function snapshotLive() {
	const snap = {};
	for (const [key, p] of Object.entries(LIVE)) {
		try {
			const st = fs.statSync(p);
			if (st.isDirectory()) {
				snap[key] = fs.readdirSync(p).sort();
			} else {
				snap[key] = { mtimeMs: st.mtimeMs, size: st.size };
			}
		} catch {
			snap[key] = null;
		}
	}
	return snap;
}

let liveBefore;

beforeAll(() => {
	resetProcessSignals();
	for (const dir of [alphaDir, betaDir]) fs.mkdirSync(dir, { recursive: true });
	expect(process.env.PROJECTS_ROOT.startsWith(os.tmpdir())).toBe(true);
	expect(tempProjectsRoot.startsWith(os.tmpdir())).toBe(true);
	liveBefore = snapshotLive();
});

afterAll(() => {
	expect(snapshotLive()).toEqual(liveBefore);
	for (const dir of [burstRoot, claimStateDir, workRoot, tempProjectsRoot, tempNotesRoot]) {
		try {
			fs.rmSync(dir, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	}
});

describe("WP2 synthetic burst (proj-alpha / proj-beta)", () => {
	it("moves every §3.8 minimum signal in one burst run", async () => {
		// --- Phase 1: burst throughput diverges per project. ---
		const scanStarted = Date.now();
		const candidates = scanClaimableTasks(scanDeps(), { now: NOW });
		recordDispatchLatency(store, Date.now() - scanStarted, { now: NOW });
		for (const ms of [4, 8, 15, 16, 23, 42]) {
			recordDispatchLatency(store, ms, { now: NOW });
		}
		expect(candidates).toHaveLength(8);
		for (const cand of candidates) {
			recordClaimAttempt(store);
			const { taskId } = cand;
			const hold = store.claimStore.claim(taskId, "runner-burst", cand.projectId);
			expect(hold.epoch).toBe(1);
			recordClaimSuccess(store);
			recordProjectClaim(store, cand.projectId, {
				waitMs: NOW - cand.enteredStageAt,
				now: NOW,
			});
		}
		let summary = summarizeProductionSignals(store, { now: NOW });
		expect(summary.perProject[PROJECT_A].claimed).toBe(6);
		expect(summary.perProject[PROJECT_B].claimed).toBe(2);
		expect(summary.perProject[PROJECT_A].wait.count).toBe(6);
		expect(summary.perProject[PROJECT_A].wait.avgMs).toBeGreaterThan(
			summary.perProject[PROJECT_B].wait.avgMs,
		);

		// --- Forced conflict: only the conflict counter moves. ---
		const claimedBefore = summary.perProject[PROJECT_A].claimed;
		recordClaimAttempt(store);
		expect(() => store.claimStore.claim("a-1", "runner-rival", PROJECT_A)).toThrow(
			expect.objectContaining({ code: "CLAIM_CONFLICT" }),
		);
		recordClaimConflict(store);
		summary = summarizeProductionSignals(store, { now: NOW });
		expect(summary.fencing.CLAIM_CONFLICT).toBe(1);
		expect(summary.perProject[PROJECT_A].claimed).toBe(claimedBefore);
		expect(summary.claim.attempts).toBe(9);
		expect(summary.claim.successes).toBe(8);

		// --- Scope refusal: PROJECT_SCOPE fencing evidence. ---
		const verdict = operatorConfigVerdict(
			{ runnerId: "r-scoped", operatorConfig: { projectScope: [PROJECT_A] } },
			{ kind: "agent" },
			{ projectId: PROJECT_B },
		);
		expect(verdict).toEqual({ ok: false, reason: "PROJECT_SCOPE" });
		recordDispatchMiss(store, verdict.reason, { projectId: PROJECT_B });

		// --- Stale epoch: the ledger fence rejects and counts. ---
		expect(() =>
			ledger.recordProgress({
				claimStore: store.claimStore,
				taskStore: store,
				projectId: PROJECT_A,
				taskId: "a-2",
				runnerId: "runner-zombie",
				executionId: "no-such-execution",
				epoch: 999,
				stageId: "a1",
				event: "started",
			}),
		).toThrow(expect.objectContaining({ code: "STALE_EPOCH" }));
		recordFencing(store, "STALE_EPOCH");
		expect(ledger.counters.staleRejected).toBe(1);

		// --- Intentional skips never debit the success rate. ---
		recordClaimExcluded(store, "RUNNER_PAUSED");
		recordClaimExcluded(store, "BELOW_MINIMUM_VERSION");

		// --- Skill size-cap omission through the real builder. ---
		const bigBody = "B".repeat(600);
		const skillsOut = buildSkillsPromptSections({
			skills: [{ name: "fits" }, { name: "too-big" }],
			interpolationContext: {},
			maxChars: 700,
			loadSkill: (name) => ({
				name,
				description: `${name} skill`,
				source: "global",
				path: `/skills/${name}/SKILL.md`,
				body: `# ${name}\n${bigBody}`,
				config: {},
				keywords: {},
				invalid: false,
			}),
		});
		expect(skillsOut.omitted.map((o) => o.reason)).toContain("size cap");

		// --- Worktree eviction through the real evictor (git fixture). ---
		const staleOrphan = path.join(workRoot, "kb-stale-task");
		fs.mkdirSync(staleOrphan, { recursive: true });
		fs.writeFileSync(path.join(staleOrphan, "note.txt"), "stale work");
		const { execFileSync } = await import("node:child_process");
		execFileSync("git", ["init", "-q"], { cwd: staleOrphan });
		execFileSync("git", ["add", "-A"], { cwd: staleOrphan });
		execFileSync(
			"git",
			["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "seed"],
			{ cwd: staleOrphan },
		);
		const ancient = new Date(Date.now() - 24 * 3600_000);
		fs.utimesSync(staleOrphan, ancient, ancient);
		const evicted = await evictOldestWorkdir({ workRoot, staleMs: 0 });
		expect(evicted).not.toBeNull();

		// --- Phase 2: a busy project must not starve the other. ---
		store.claimStore = new ClaimStore({
			stateFile: path.join(claimStateDir, "phase2.json"),
		});
		const projectCap = 2;
		store.claimStore.claim("a-1", "runner-other", PROJECT_A);
		store.claimStore.claim("a-2", "runner-other", PROJECT_A);
		const rescan = scanClaimableTasks(scanDeps(), { now: NOW });
		let busySkips = 0;
		let betaClaims = 0;
		for (const cand of rescan) {
			if (
				cand.projectId === PROJECT_A &&
				store.claimStore.countLiveHolds({ projectId: PROJECT_A }) >= projectCap
			) {
				recordDispatchMiss(store, "PROJECT_BUSY", { projectId: PROJECT_A });
				busySkips += 1;
				continue;
			}
			recordClaimAttempt(store);
			store.claimStore.claim(cand.taskId, "runner-burst", cand.projectId);
			recordClaimSuccess(store);
			recordProjectClaim(store, cand.projectId, {
				waitMs: NOW - cand.enteredStageAt,
				now: NOW,
			});
			if (cand.projectId === PROJECT_B) betaClaims += 1;
		}
		expect(busySkips).toBeGreaterThan(0);
		expect(betaClaims).toBe(2);

		// --- Exposition: every signal observable with projectId labels. ---
		const metrics = await computeObservabilityMetrics(store, undefined, {
			windowMs: 3600_000,
			now: NOW,
		});
		const signals = metrics.productionSignals;
		expect(signals.dispatchLatency.count).toBeGreaterThanOrEqual(7);
		expect(signals.dispatchLatency.p50Ms).toEqual(expect.any(Number));
		expect(signals.dispatchLatency.p95Ms).toEqual(expect.any(Number));
		expect(signals.dispatchLatency.p99Ms).toEqual(expect.any(Number));
		expect(Object.keys(signals.perProject).sort()).toEqual([PROJECT_A, PROJECT_B]);
		expect(signals.perProject[PROJECT_A].claimed).toBeGreaterThan(
			signals.perProject[PROJECT_B].claimed,
		);
		expect(signals.perProject[PROJECT_B].wait.count).toBeGreaterThan(0);
		expect(signals.perProject[PROJECT_A].completed).toBe(1);
		expect(signals.perProject[PROJECT_B].completed).toBe(1);
		expect(signals.claim.rate).toBeLessThan(100);
		expect(signals.claim.excluded.RUNNER_PAUSED).toBe(1);
		expect(signals.claim.excluded.BELOW_MINIMUM_VERSION).toBe(1);
		expect(signals.fencing).toMatchObject({
			PROJECT_SCOPE: 1,
			STALE_EPOCH: 1,
			CLAIM_CONFLICT: 1,
		});
		expect(signals.projectBusy[PROJECT_A]).toBe(busySkips);
		expect(signals.worktreeEvictions).toBe(1);
		expect(signals.skillSizeCapOmissions).toBeGreaterThanOrEqual(1);
		expect(metrics.ledgerStaleRejected).toBe(1);
		expect(metrics.queueDepthByProject[PROJECT_A]).toEqual(
			expect.any(Number),
		);
		expect(
			Object.values(metrics.queueDepthByProject).reduce((a, b) => a + b, 0),
		).toBe(metrics.stats.queueDepth);
	});
});
