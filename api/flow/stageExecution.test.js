/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { TaskStore } from "../taskStore.js";
import { currentBranch } from "../git.js";
import {
	clearAlertSinks,
	registerAlertSink,
	validateAlertPayload,
} from "../observability/alerts.js";
import { resolveCommandStageRuntime } from "./stageExecution.js";
import {
	resolveDeployOperationKey,
	resolveMergeDeployOperationKey,
} from "../continuity/deployMarkers.js";

/***
 * MARK: Stage execution branch lifecycle tests
 * @description Proves the pickup/finalise contract at the executeStage level
 *   against real repositories in throwaway temp directories: an agent stage
 *   ends committed and back on the default branch, while a human stage only
 *   creates its task-branch ref (no checkout, commit, or push) and waits.
 ***/

function git(cwd, ...args) {
	return execFileSync("git", args, {
		cwd,
		stdio: ["ignore", "pipe", "pipe"],
	}).toString();
}

function initRepo(dir, branch = "master") {
	fs.mkdirSync(dir, { recursive: true });
	git(dir, "init", "-b", branch);
	git(dir, "config", "user.email", "kainbain-test@example.com");
	git(dir, "config", "user.name", "KainBain Test");
	fs.writeFileSync(path.join(dir, "README.md"), "# init\n");
	git(dir, "add", "-A");
	git(dir, "commit", "-m", "init");
}

const tempDirs = [];
afterEach(() => {
	clearAlertSinks();
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		try {
			fs.rmSync(dir, { recursive: true, force: true });
		} catch {
			// ignore teardown errors
		}
	}
});

function makeStore(stages) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-stage-"));
	tempDirs.push(dir);
	initRepo(dir);
	const project = { id: "p1", name: "P1", cwd: dir, useBranches: false };
	const projectStore = { getProject: () => project };
	const store = new TaskStore({ eventBridge: {}, projectStore });
	return { store, dir, project };
}

describe("executeStage branch lifecycle", () => {
	it("agent success commits work and returns to the default branch", async () => {
		const stages = [{ id: "a1", name: "Work", type: "agent", prompt: "Do work" }];
		const { store, dir, project } = makeStore(stages);
		const task = store.createTask("p1", {
			goal: "agent lifecycle",
			stageId: "a1",
			projectCwd: dir,
		});
		project.useBranches = true;
		task.branch = `kb/${task.id}`;

		const result = await store.executeStage("p1", task.id, {
			stages,
			projectCwd: dir,
			agentRunner: async (prompt, { cwd }) => {
				expect(String(prompt)).toContain("Git Context");
				fs.writeFileSync(path.join(cwd, "agent-work.txt"), "agent did work\n");
				return "agent finished";
			},
		});

		expect(result.status).toBe("passed");
		expect(await currentBranch(dir)).toBe("master");
		expect(git(dir, "show", `${task.branch}:agent-work.txt`).trim()).toBe(
			"agent did work",
		);
		const done = store.getTask("p1", task.id);
		expect(done.status).toBe("completed");
	});

	it("human pickup creates the branch ref without checking out and waits", async () => {
		const stages = [{ id: "h1", name: "Gate", type: "human" }];
		const { store, dir, project } = makeStore(stages);
		const task = store.createTask("p1", {
			goal: "human lifecycle",
			stageId: "h1",
			projectCwd: dir,
		});
		project.useBranches = true;
		task.branch = `kb/${task.id}`;
		expect(await currentBranch(dir)).toBe("master");
		// Operator live work on a dirty tree must survive the checkpoint.
		fs.writeFileSync(path.join(dir, "live-work.txt"), "operator live work\n");
		const statusBefore = git(dir, "status", "--porcelain");
		const masterTip = git(dir, "rev-parse", "master").trim();

		const result = await store.executeStage("p1", task.id, {
			stages,
			projectCwd: dir,
			agentRunner: async () => "unused",
		});

		expect(result.status).toBe("waiting_human");
		// Ref created from the default tip, but the tree never moved.
		expect(await currentBranch(dir)).toBe("master");
		expect(git(dir, "status", "--porcelain")).toBe(statusBefore);
		expect(git(dir, "rev-parse", task.branch).trim()).toBe(masterTip);
		const waiting = store.getTask("p1", task.id);
		expect(waiting.status).toBe("waiting_human");
		expect((waiting.logEntries || []).map((e) => e.text).join("\n")).toContain(
			"without checkout",
		);
	});

	it("routes run-loop human checkpoints through the alert seam", async () => {
		clearAlertSinks();
		const stages = [{ id: "h1", name: "Gate", type: "human" }];
		const { store, dir } = makeStore(stages);
		const task = store.createTask("p1", {
			goal: "checkpoint alert",
			stageId: "h1",
			projectCwd: dir,
		});
		const uiEvents = [];
		const bridge = {
			emitProcessEvent: (projectId, event, payload) => {
				uiEvents.push({ projectId, event, payload });
			},
			broadcastGlobal: () => {},
		};
		const seen = [];
		const stop = registerAlertSink({
			name: "capture",
			send: async (payload) => {
				seen.push(payload);
				return { delivered: true, attempts: 1, lastError: null };
			},
		});
		try {
			const result = await store.executeStage("p1", task.id, {
				stages,
				projectCwd: dir,
				agentRunner: async () => "unused",
				eventBridge: bridge,
			});
			expect(result.status).toBe("waiting_human");
			// Both dashboard events still fire, in order.
			expect(uiEvents.map((entry) => entry.event)).toEqual([
				"stage:enter",
				"stage:checkpoint_wait",
			]);
			// The external sink sees the scheduled checkpoint as info,
			// never as a critical unscheduled page.
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(seen).toHaveLength(1);
			expect(seen[0]).toMatchObject({
				event: "task.checkpoint_wait",
				severity: "info",
			});
			expect(validateAlertPayload(seen[0])).toEqual([]);
		} finally {
			stop();
			clearAlertSinks();
		}
	});

	it("agent stages still work with branch support off (no branch ops)", async () => {
		const stages = [{ id: "a1", name: "Work", type: "agent", prompt: "Do work" }];
		const { store, dir } = makeStore(stages);
		const task = store.createTask("p1", {
			goal: "single branch agent",
			stageId: "a1",
			projectCwd: dir,
		});

		const result = await store.executeStage("p1", task.id, {
			stages,
			projectCwd: dir,
			agentRunner: async () => "agent finished",
		});

		expect(result.status).toBe("passed");
		expect(await currentBranch(dir)).toBe("master");
	});

	it("legacy 'review' stages park as human checkpoints (agent never runs)", async () => {		const stages = [{ id: "r1", name: "Review", type: "review" }];
		const { store, dir } = makeStore(stages);
		const task = store.createTask("p1", {
			goal: "legacy review checkpoint",
			stageId: "r1",
			projectCwd: dir,
		});
		let agentRan = false;

		const result = await store.executeStage("p1", task.id, {
			stages,
			projectCwd: dir,
			agentRunner: async () => {
				agentRan = true;
				return "should never run";
			},
		});

		// Legacy review is a human checkpoint: it parks and never enters the
		// agent verdict path, so it can never record an agent rejection.
		expect(result.status).toBe("waiting_human");
		expect(result.stageType).toBe("human");
		expect(agentRan).toBe(false);
		const waiting = store.getTask("p1", task.id);
		expect(waiting.status).toBe("waiting_human");
		expect(waiting.lastError).toBeFalsy();
	});

	it("a CI stage is decided by its exit code, never by a verdict", async () => {
		const stages = [
			{ id: "c1", name: "Tests", type: "ci", command: "npm test" },
			{ id: "h1", name: "Gate", type: "human" },
		];
		const { store, dir } = makeStore(stages);
		const task = store.createTask("p1", {
			goal: "ci exit code",
			stageId: "c1",
			projectCwd: dir,
		});
		let agentRan = false;

		const result = await store.executeStage("p1", task.id, {
			stages,
			projectCwd: dir,
			agentRunner: async () => {
				agentRan = true;
				return "KAINBAIN_VERDICT: FAIL\nKAINBAIN_REASON: x\nKAINBAIN_FIX: y";
			},
			execRunner: async () => ({ exitCode: 0, stdout: "ok", stderr: "" }),
		});

		// The command exit code decides; no agent runs and no verdict block in
		// the stage output can change the outcome.
		expect(agentRan).toBe(false);
		expect(result.status).toBe("passed");
		const after = store.getTask("p1", task.id);
		expect(
			(after.history || []).some((h) =>
				/CI stage passed \(exit code 0\)/.test(h.action || ""),
			),
		).toBe(true);
	});

	it("a stale duplicate superseded onto a legacy 'review' stage parks the engine as a human checkpoint", async () => {
		const stages = [
			{ id: "a1", name: "Work", type: "agent", prompt: "Do work" },
			{ id: "r1", name: "Review", type: "review" },
		];
		const { store, dir } = makeStore(stages);
		const task = store.createTask("p1", {
			goal: "superseded onto legacy review",
			stageId: "a1",
			projectCwd: dir,
		});

		// Hold the execution queue so the dispatch below resolves stage=a1
		// but its action runs only after the task has moved to r1.
		let releaseGate;
		const gate = new Promise((resolve) => {
			releaseGate = resolve;
		});
		const gateJob = store.executionQueue.enqueue(() => gate);
		const runPromise = store.executeStage("p1", task.id, {
			stages,
			projectCwd: dir,
			agentRunner: async () => "should never run",
		});
		store.getTask("p1", task.id).currentStageId = "r1";
		releaseGate();
		await gateJob;
		const result = await runPromise;

		// The stale executor bows out, and the engine parks as a human
		// checkpoint (normalized "human", never the raw "review" label).
		expect(result.status).toBe("superseded");
		expect(store.engineState.status).toBe("checkpoint");
		expect(store.engineState.activeStageId).toBe("r1");
		expect(store.engineState.activeStageType).toBe("human");
	});
});

describe("deploy as a ci stage (ordinary ci runtime)", () => {
	// A stage whose command runs the deploy script is an ordinary ci stage:
	// same ci status, timeout/stall budgets, heartbeat, and failback — with
	// no plugin installed no entry markers are stamped and nothing branches
	// on the command text.
	const deployCiStages = [
		{ id: "d1", name: "Deploy", type: "ci", command: "./deploy.sh --prod" },
		{ id: "h1", name: "Gate", type: "human" },
	];

	it("runs a deploy-command stage as ordinary CI and advances on pass", async () => {
		const { store, dir } = makeStore(deployCiStages);
		const task = store.createTask("p1", {
			goal: "deploy as ci",
			stageId: "d1",
			projectCwd: dir,
		});
		const updateSpy = vi.spyOn(store, "updateTask");
		let ranCommand = "";

		const result = await store.executeStage("p1", task.id, {
			stages: deployCiStages,
			projectCwd: dir,
			execRunner: async (command) => {
				ranCommand = command;
				return { exitCode: 0, stdout: "deployed", stderr: "" };
			},
		});

		expect(result.status).toBe("passed");
		expect(result.stageType).toBe("ci");
		expect(ranCommand).toBe("./deploy.sh --prod");
		// Entry uses the ordinary ci status; no deploy markers are stamped
		// without the continuity plugin.
		const entryUpdate = updateSpy.mock.calls
			.map((call) => call[2])
			.find((update) => update?.status === "running_ci");
		expect(entryUpdate).toBeDefined();
		const after = store.getTask("p1", task.id);
		expect(after.deployAttemptId).toBeUndefined();
		expect(after.deployBuildAtEntry).toBeUndefined();
		expect(after.deployOperationKey).toBeUndefined();
		expect(after.currentStageId).toBe("h1");
		const historyText = (after.history || []).map((h) => h.action).join("\n");
		expect(historyText).toContain("CI stage passed");
	});

	it("provisions a task branch for a deploy-command ci stage like any other CI (branch mode)", async () => {
		const { store, dir, project } = makeStore(deployCiStages);
		project.useBranches = true;
		const task = store.createTask("p1", {
			goal: "no branch for deploy",
			stageId: "d1",
			projectCwd: dir,
		});
		const ensureSpy = vi.spyOn(store, "ensureTaskBranch").mockResolvedValue({});

		await store.executeStage("p1", task.id, {
			stages: deployCiStages,
			projectCwd: dir,
			execRunner: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
		});

		// A deploy-command stage is ordinary CI: branch provisioning applies
		// exactly as for any other command stage.
		expect(ensureSpy).toHaveBeenCalled();
	});

	it("fails a failing deploy-command stage like ordinary CI (no fallback configured)", async () => {
		const { store, dir } = makeStore(deployCiStages);
		const task = store.createTask("p1", {
			goal: "failing deploy",
			stageId: "d1",
			projectCwd: dir,
		});

		const result = await store.executeStage("p1", task.id, {
			stages: deployCiStages,
			projectCwd: dir,
			execRunner: async () => ({
				exitCode: 1,
				stdout: "",
				stderr: "gate exploded",
			}),
		});

		expect(result.status).toMatch(/failed|retrying/);
		const after = store.getTask("p1", task.id);
		// Ordinary CI failure semantics: the reason carries the command
		// output, there is no deploy-specific wording, and with no fallback
		// configured the task parks failed on its own stage.
		const reason = String(after.failureReason || after.lastError?.message || "");
		expect(reason).toContain("gate exploded");
		expect(reason).not.toContain("Deploy command");
		expect(reason).not.toContain("merge");
		expect(after.currentStageId).toBe("d1");
	});

	it("routes a failing deploy-command stage to its configured fallback like ordinary CI", async () => {
		// Core contract: a deploy script is an ordinary ci stage, so on
		// failure it falls back to its fallback stage where an agent can
		// fix it — no deploy gate or project-blocker detour.
		const stagesWithFallback = [
			{
				id: "d1",
				name: "Deploy",
				type: "ci",
				command: "./deploy.sh --prod",
				fallbackStageId: "fix",
			},
			{ id: "fix", name: "Fix", type: "agent", prompt: "Fix the deploy" },
		];
		const { store, dir } = makeStore(stagesWithFallback);
		const task = store.createTask("p1", {
			goal: "failing deploy with fallback",
			stageId: "d1",
			projectCwd: dir,
		});

		const result = await store.executeStage("p1", task.id, {
			stages: stagesWithFallback,
			projectCwd: dir,
			execRunner: async () => ({
				exitCode: 1,
				stdout: "",
				stderr: "deploy exploded",
			}),
		});

		expect(result.status).toBe("retrying");
		const after = store.getTask("p1", task.id);
		expect(after.currentStageId).toBe("fix");
		const reason = String(after.failureReason || after.lastError?.message || "");
		expect(reason).toContain("deploy exploded");
		expect(reason).not.toContain("Deploy command");
	});

	it("stamps no operation key without the continuity plugin", async () => {
		// Entry markers and the operation key are continuity-owned: the
		// generic engine never writes them. Plugin coverage lives in the
		// continuity suite (recordContinuityStageEntry).
		const { store, dir } = makeStore(deployCiStages);
		const task = store.createTask("p1", {
			goal: "deploy after merge",
			stageId: "d1",
			projectCwd: dir,
		});
		const baseSha = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0";
		store.updateTask(
			"p1",
			task.id,
			{ reviewBaseline: { mainSha: baseSha, mergedAt: new Date().toISOString() } },
			dir,
		);
		const updateSpy = vi.spyOn(store, "updateTask");

		await store.executeStage("p1", task.id, {
			stages: deployCiStages,
			projectCwd: dir,
			execRunner: async () => ({ exitCode: 0, stdout: "deployed", stderr: "" }),
		});

		for (const call of updateSpy.mock.calls) {
			expect(call[2]).not.toHaveProperty("deployOperationKey");
			expect(call[2]).not.toHaveProperty("deployAttemptId");
			expect(call[2]).not.toHaveProperty("deployBuildAtEntry");
		}
	});

	it("still gives an agent stage its task branch when a stray command mentions deploy.sh", async () => {
		// Regression: an agent stage can carry a leftover `command` field
		// (a workflow edit). It is not a command stage, so it must be
		// dispatched as an agent and still get its task branch — the deploy
		// runtime skip applies to `ci` stages only.
		const strayStages = [
			{ id: "a1", name: "Ticket", type: "agent", prompt: "Do work", command: "./deploy.sh --prod" },
		];
		const { store, dir, project } = makeStore(strayStages);
		const task = store.createTask("p1", {
			goal: "stray deploy command on agent",
			stageId: "a1",
			projectCwd: dir,
		});
		project.useBranches = true;
		const ensureSpy = vi.spyOn(store, "ensureTaskBranch");

		const result = await store.executeStage("p1", task.id, {
			stages: strayStages,
			projectCwd: dir,
			agentRunner: async () => "agent finished",
		});

		expect(result.status).toBe("passed");
		expect(ensureSpy).toHaveBeenCalled();
		const after = store.getTask("p1", task.id);
		const historyText = (after.history || []).map((h) => h.action).join("\n");
		expect(historyText).toContain("(agent)");
	});
});

describe("resolveCommandStageRuntime (every command stage is ci)", () => {
	const ciTuple = {
		kind: "ci",
		label: "CI",
		logTag: "CI/CMD",
		reportTitle: "CI Stage Report",
		statusValue: "running_ci",
		defaultCommand: "echo 'CI stage completed'",
	};

	it.each([
		["deploy command", { type: "ci", command: "./deploy.sh --prod" }],
		["bash-deployed command", { type: "ci", command: "bash ./deploy.sh --prod" }],
		["legacy raw deploy type without a command", { type: "deploy" }],
		["plain ci command", { type: "ci", command: "npm test" }],
		["ci stage without a command", { type: "ci" }],
		["merge stage", { type: "merge" }],
		["missing stage", null],
	])("resolves the ci tuple for %s", (_label, stage) => {
		expect(resolveCommandStageRuntime(stage)).toEqual(ciTuple);
	});
});

describe("resolveMergeDeployOperationKey (stable per operation, C5)", () => {
	it("reproduces the pre-fix loop scenario: two re-dispatches, one operation", () => {
		// The stall→retry loop minted a fresh attempt id per dispatch, so the
		// retry could not adopt the still-running deploy and started a second
		// full deploy. The operation key is stable across both dispatches, so
		// the retry joins the recorded attempt instead of duplicating it.
		const first = resolveDeployOperationKey(
			{},
			{
				taskId: "967e81c3",
				mainBranch: "main",
				preMergeMainSha: "abc123",
				command: "./deploy.sh --prod",
			},
		);
		// Re-dispatch reuses the recorded key even though the attempt id is new.
		expect(resolveDeployOperationKey({ deployOperationKey: first }, {})).toBe(first);
		// A genuine retry after fresh work (new base SHA) is a NEW operation.
		const genuine = resolveMergeDeployOperationKey({
			taskId: "967e81c3",
			mainBranch: "main",
			preMergeMainSha: "def456",
			command: "./deploy.sh --prod",
		});
		expect(genuine).not.toBe(first);
	});
});
