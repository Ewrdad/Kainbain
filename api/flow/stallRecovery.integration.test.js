/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import {
	gitAvailable,
	makeTmpBase,
	makeRepoTracker,
	initRepo,
	runGit,
} from "../test-helpers/tmpRepo.js";

const { ProjectStore } = await import("../projectStore.js");
const { TaskStore } = await import("../taskStore.js");
const { recordStageHeartbeat } = await import("./stageHeartbeat.js");

/***
 * MARK: stall-recovery integration test
 * @description WP6 end-to-end proof against a real TaskStore in throwaway
 *   temp repos (no servers, no ports):
 *     - kill -9 mid-agent resumes and carries Resumed timeline evidence;
 *     - kill mid-merge WITH a landed marker resumes without rewinding or
 *       duplicating the merge (the git-only merge stage re-runs no command);
 *     - kill mid-merge WITHOUT a landed marker (but with preMergeMainSha)
 *       resumes and the merge itself re-runs idempotently;
 *     - a heartbeat-silent CI child is killed by the watchdog and routed to
 *       the transient ladder;
 *     - an interrupted deploy-command CI stage auto-resumes like any other
 *       ci stage (no deploy-specific reconcile in the generic path);
 *     - the generic engine does not inject deploy attempt env vars.
 ***/
describe.skipIf(!gitAvailable)("WP6 stall and resume recovery", () => {
	let base;
	const repos = makeRepoTracker();
	let repo;
	let projectStore;
	const projectId = "stall-recovery-proj";
	// One fresh repo per test (not one per file): task markdown and merge
	// commits from an earlier test — including a test that timed out
	// mid-flight and left an `interrupted` task behind — must never leak
	// into a later test's scanTasks/performStartupRecovery. Recovery asserts
	// an exact single-task autoResumed, so any residue fails the NEXT test
	// instead of the test that actually hung (gate cascade, 2026-10-15).
	let repoSerial = 0;

	const agentRunner = async (prompt, { cwd }) => {
		fs.writeFileSync(path.join(cwd, "agent.txt"), "agent work\n");
		return "agent done";
	};
	const mergeRunner = async (command, { cwd } = {}) => {
		fs.writeFileSync(path.join(cwd || repo, "post-merge.txt"), "post-merge ok\n");
		return { exitCode: 0, stdout: "post-merge ok", stderr: "" };
	};

	function freshStore(stages, { useBranches = true } = {}) {
		const store = new TaskStore({ projectStore, eventBridge: null });
		projectStore.projects.set(projectId, {
			id: projectId,
			name: "Stall Recovery Project",
			cwd: repo,
			useBranches,
			stages,
		});
		return store;
	}

	async function waitFor(taskStore, taskId, { timeoutMs = 20000 } = {}) {
		const started = Date.now();
		for (;;) {
			const current = taskStore.getTask(projectId, taskId);
			if (current?.status === "completed") return current;
			if (Date.now() - started > timeoutMs) {
				throw new Error(
					`timed out waiting for ${taskId} (status: ${current?.status})`,
				);
			}
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
	}

	beforeAll(() => {
		base = makeTmpBase("kainbain-stall-recovery-");
		projectStore = new ProjectStore({
			projectsRoot: path.join(base, "projects-root"),
			notesRoot: path.join(base, "notes-root"),
			autoScan: false,
		});
	});

	beforeEach(() => {
		repoSerial += 1;
		repo = repos.track(initRepo(path.join(base, `project-${repoSerial}`)));
		fs.writeFileSync(path.join(repo, ".gitignore"), "docs/tasks/\n.kainbain/\n");
		runGit(repo, "add", "-A");
		runGit(repo, "commit", "-m", "ignore engine artifacts");
	});

	afterAll(() => {
		repos.cleanup();
		try {
			fs.rmSync(base, { recursive: true, force: true });
		} catch {
			// ignore
		}
	});

	it("kill -9 mid-agent resumes and records Resumed timeline evidence", async () => {
		const stages = [{ id: "build", name: "Build", type: "agent", prompt: "Do the work" }];
		const bootOne = freshStore(stages);
		const created = bootOne.createTask(projectId, {
			title: "Kill -9 victim",
			goal: "Prove kill -9 recovery with evidence",
			stageId: "build",
			projectCwd: repo,
		});
		const stranded = bootOne.getTask(projectId, created.id);
		stranded.status = "running_agent";
		bootOne._saveTaskMarkdown(repo, stranded);
		bootOne.stopScheduler();

		const bootTwo = freshStore(stages);
		bootTwo.scanTasks(projectId, repo);
		expect(bootTwo.getTask(projectId, created.id).status).toBe("interrupted");

		const recovery = await bootTwo.performStartupRecovery({ agentRunner });
		try {
			expect(recovery.autoResumed).toEqual([{ projectId, taskId: created.id }]);
			const finished = await waitFor(bootTwo, created.id);
			expect(finished.status).toBe("completed");
			const resumedEntry = (finished.timeline || []).find((e) => e.status === "Resumed");
			expect(resumedEntry).toBeDefined();
			expect(resumedEntry).toMatchObject({
				verdict: expect.any(String),
				markers: expect.any(Array),
			});
			expect(
				finished.history.some((h) =>
					String(h.action || "").includes("Auto-resumed after server restart"),
				),
			).toBe(true);
		} finally {
			bootTwo.stopScheduler();
		}
	});

	it("kill mid-merge WITH landed marker resumes without rewinding the merge", async () => {
		// The stage carries a legacy post-merge command: the merge stage is
		// git-only now, so the command is ignored (normalizeStages migrates
		// configs to a separate deploy CI stage — see projectStore tests).
		const stages = [{ id: "merge", name: "Integrate", type: "merge", command: "echo post-merge" }];
		const bootOne = freshStore(stages);
		const created = bootOne.createTask(projectId, {
			title: "Landed merge victim",
			goal: "Prove landed merge recovery",
			stageId: "merge",
			projectCwd: repo,
		});
		const victim = bootOne.getTask(projectId, created.id);
		await bootOne.ensureTaskBranch(victim, repo);
		const branch = victim.branch;
		// Commit work on the task branch, then land it on main — the crash
		// hits AFTER the git merge landed.
		runGit(repo, "checkout", branch);
		fs.writeFileSync(path.join(repo, "work.txt"), "task work\n");
		runGit(repo, "add", "work.txt");
		runGit(repo, "commit", "-m", "task work commit");
		const branchHead = runGit(repo, "rev-parse", "HEAD").trim();
		runGit(repo, "checkout", "main");
		const preMergeMainSha = runGit(repo, "rev-parse", "HEAD").trim();
		runGit(repo, "merge", "--no-ff", branch, "-m", "merge task branch");
		const mainAfterMerge = runGit(repo, "rev-parse", "HEAD").trim();

		const landed = bootOne.getTask(projectId, created.id);
		landed.reviewBaseline = {
			baseSha: preMergeMainSha,
			headSha: branchHead,
			mainSha: mainAfterMerge,
			mergedAt: new Date().toISOString(),
			stageId: "merge",
		};
		landed.preMergeMainSha = preMergeMainSha;
		landed.mergeAttemptId = `merge-${created.id.slice(0, 8)}-1`;
		landed.status = "interrupted";
		landed.wasInterrupted = true;
		bootOne._saveTaskMarkdown(repo, landed);
		bootOne.stopScheduler();

		const bootTwo = freshStore(stages);
		bootTwo.scanTasks(projectId, repo);
		const recovery = await bootTwo.performStartupRecovery({ disabled: true, agentRunner });
		try {
			expect(recovery.autoResumed).toEqual([{ projectId, taskId: created.id }]);
			expect(bootTwo.getTask(projectId, created.id).status).toBe("in_stage");

			const result = await bootTwo.executeStage(projectId, created.id, {
				stages,
				projectCwd: repo,
				execRunner: mergeRunner,
			});
			expect(result.status).toBe("passed");
			// WP6 markers are single-attempt: consumed on pass so a later
			// interruption at another stage can never inherit them.
			const afterPass = bootTwo.getTask(projectId, created.id);
			expect(afterPass.mergeAttemptId).toBeUndefined();
			expect(afterPass.preMergeMainSha).toBeUndefined();
			// No duplicate merge: the merge commit and the task work commit
			// each appear exactly once (main legitimately advances only by
			// the engine's post-merge-output auto-commit).
			const mainLog = runGit(repo, "log", "--oneline", "main");
			expect(mainLog.split("\n").filter((l) => l.includes("merge task branch"))).toHaveLength(1);
			expect(mainLog.split("\n").filter((l) => l.includes("task work commit"))).toHaveLength(1);
			// The merge stage is git-only: no command ran, so no post-merge
			// artifact exists.
			expect(fs.existsSync(path.join(repo, "post-merge.txt"))).toBe(false);
			const resumedEntry = (bootTwo.getTask(projectId, created.id).timeline || []).find(
				(e) => e.status === "Resumed",
			);
			expect(resumedEntry).toBeDefined();
		} finally {
			bootTwo.stopScheduler();
		}
	});

	it("kill mid-merge WITHOUT landed marker resumes and the merge re-runs", async () => {
		const stages = [{ id: "merge", name: "Integrate", type: "merge", command: "echo post-merge" }];
		const bootOne = freshStore(stages);
		const created = bootOne.createTask(projectId, {
			title: "Unlanded merge victim",
			goal: "Prove unlanded merge recovery",
			stageId: "merge",
			projectCwd: repo,
		});
		const victim = bootOne.getTask(projectId, created.id);
		await bootOne.ensureTaskBranch(victim, repo);
		const branch = victim.branch;
		// Commit work on the task branch; the crash hits BEFORE any merge.
		runGit(repo, "checkout", branch);
		const marker = `unlanded-work-${created.id.slice(0, 8)}`;
		fs.writeFileSync(path.join(repo, "work2.txt"), "task work 2\n");
		runGit(repo, "add", "work2.txt");
		runGit(repo, "commit", "-m", marker);
		runGit(repo, "checkout", "main");

		const stranded = bootOne.getTask(projectId, created.id);
		stranded.preMergeMainSha = runGit(repo, "rev-parse", "HEAD").trim();
		stranded.mergeAttemptId = `merge-${created.id.slice(0, 8)}-2`;
		stranded.status = "interrupted";
		stranded.wasInterrupted = true;
		bootOne._saveTaskMarkdown(repo, stranded);
		bootOne.stopScheduler();

		const bootTwo = freshStore(stages);
		bootTwo.scanTasks(projectId, repo);
		const recovery = await bootTwo.performStartupRecovery({ disabled: true, agentRunner });
		try {
			expect(recovery.autoResumed).toEqual([{ projectId, taskId: created.id }]);
			const result = await bootTwo.executeStage(projectId, created.id, {
				stages,
				projectCwd: repo,
				execRunner: mergeRunner,
			});
			expect(result.status).toBe("passed");
			// The merge itself ran: main now carries the task commit.
			expect(runGit(repo, "log", "--oneline", "main")).toContain(marker);
		} finally {
			bootTwo.stopScheduler();
		}
	});

	it("watchdog stall on an in-flight CI run routes exactly one recovery (no failback)", async () => {
		const stages = [{ id: "ci", name: "Verify", type: "ci", command: "sleep 30" }];
		const store = freshStore(stages, { useBranches: false });
		const created = store.createTask(projectId, {
			title: "Hung CI in flight",
			goal: "Prove single recovery from a real in-flight stall",
			stageId: "ci",
			projectCwd: repo,
		});
		store.setEngineState({
			status: "running",
			activeTaskId: created.id,
			activeProjectId: projectId,
		});

		// Dispatch the real spawn path, then let the child register + heartbeat.
		const runPromise = store.executeStage(projectId, created.id, {
			stages,
			projectCwd: repo,
		});
		const registered = await (async () => {
			const started = Date.now();
			while (!store._activeChildren.has(created.id)) {
				if (Date.now() - started > 5000) return false;
				await new Promise((resolve) => setTimeout(resolve, 25));
			}
			return true;
		})();
		expect(registered).toBe(true);

		const { watchdogTick } = await import("./stageHeartbeat.js");
		const outcome = watchdogTick(store, {
			// Logical future time so the fresh entry heartbeat is already silent.
			now: Date.now() + 30 * 60 * 1000,
			cfg: { ciStallTimeoutMs: 50 },
		});
		expect(outcome).toMatchObject({ status: "retrying" });

		// The terminated in-flight run settles and must NOT route a second,
		// conflicting failure (failback) on top of the transient retry.
		const result = await runPromise;
		expect(result.status).toBe("stalled");
		const after = store.getTask(projectId, created.id);
		expect(after.status).toBe("in_stage");
		expect(after.infraRetryCount).toBe(1);
		expect(after.autoIterationCount ?? 0).toBe(0);
		expect(after.failureReason ?? null).toBeNull();
		const actions = after.history.map((h) => h.action).join(" || ");
		expect(actions).toContain("retrying same stage");
		expect(actions).not.toContain("Failed back");
		expect(actions).not.toContain("Stage failed in");
		store.stopScheduler();
	});

	it("stalled CI child is killed by the watchdog and routed to retry", async () => {
		const stages = [{ id: "ci", name: "Verify", type: "ci", command: "sleep 30" }];
		const store = freshStore(stages);
		const created = store.createTask(projectId, {
			title: "Hung CI",
			goal: "Prove stall recovery",
			stageId: "ci",
			projectCwd: repo,
		});
		const hung = store.getTask(projectId, created.id);
		hung.status = "running_ci";
		store._saveTaskMarkdown(repo, hung);
		store.setEngineState({
			status: "running",
			activeTaskId: created.id,
			activeProjectId: projectId,
		});

		const child = spawn("sleep", ["30"], { stdio: "ignore", detached: true });
		store._registerChild(created.id, child);
		recordStageHeartbeat(store, created.id, {
			stageId: "ci",
			kind: "ci",
			timestamp: Date.now() - 60_000,
		});
		const transientSpy = vi.fn(() => ({ status: "in_stage" }));
		const realTransient = store.handleTransientFailure;
		store.handleTransientFailure = transientSpy;
		try {
			const { watchdogTick } = await import("./stageHeartbeat.js");
			const outcome = watchdogTick(store, { now: Date.now(), cfg: { ciStallTimeoutMs: 50 } });
			expect(transientSpy).toHaveBeenCalledTimes(1);
			expect(transientSpy).toHaveBeenCalledWith(
				projectId,
				created.id,
				expect.objectContaining({ id: "ci" }),
				expect.objectContaining({ code: "ESTALL", stall: true }),
				expect.objectContaining({ stall: true }),
			);
			expect(outcome).toEqual({ status: "in_stage" });
			// The hung child is actually dead.
			await new Promise((resolve) => setTimeout(resolve, 500));
			expect(child.signalCode ?? child.exitCode).not.toBeNull();
			const after = store.getTask(projectId, created.id);
			expect(after.stallCount).toBe(1);
			expect(
				(after.timeline || []).some((e) => e.status === "Stalled"),
			).toBe(true);
			expect(store.schedulerStats.stallRecoveries).toBe(1);
		} finally {
			store.handleTransientFailure = realTransient;
			try {
				child.kill("SIGKILL");
			} catch {
				// Already reaped by the watchdog.
			}
			store.stopScheduler();
		}
	});

	it("a silent-but-alive CI child is NOT stalled while its keep-alive runs (incident shape)", async () => {
		// The compressed incident: a real CI stage whose command produces zero
		// output for far longer than a (shortened) silence threshold. The
		// keep-alive ticker (stage override 200ms) must keep the stage provably
		// alive: no stall, no kill, the stage completes.
		const stages = [
			{
				id: "ci",
				name: "Verify",
				type: "ci",
				command: "sleep 2",
				heartbeatIntervalMs: 200,
				timeout: 60000,
			},
		];
		const store = freshStore(stages, { useBranches: false });
		const created = store.createTask(projectId, {
			title: "Quiet CI",
			goal: "Prove a silent healthy CI stage survives the watchdog",
			stageId: "ci",
			projectCwd: repo,
		});
		store.setEngineState({
			status: "running",
			activeTaskId: created.id,
			activeProjectId: projectId,
		});

		const runPromise = store.executeStage(projectId, created.id, {
			stages,
			projectCwd: repo,
		});
		const registered = await (async () => {
			const started = Date.now();
			while (!store._activeChildren.has(created.id)) {
				if (Date.now() - started > 5000) return false;
				await new Promise((resolve) => setTimeout(resolve, 25));
			}
			return true;
		})();
		expect(registered).toBe(true);

		try {
			const { watchdogTick } = await import("./stageHeartbeat.js");
			// A threshold (3s) far below the child's quiet window (2s+spawn)
			// but far above the keep-alive cadence (200ms): without the
			// ticker this is a guaranteed false stall; with it, never.
			const outcome = watchdogTick(store, {
				now: Date.now(),
				cfg: { ciStallTimeoutMs: 3000 },
			});
			expect(outcome).toBeNull();
			const mid = store.getTask(projectId, created.id);
			expect((mid.timeline || []).some((e) => e.status === "Stalled")).toBe(false);

			const finished = await waitFor(store, created.id);
			expect(finished.status).toBe("completed");
			expect((finished.timeline || []).some((e) => e.status === "Stalled")).toBe(false);
			expect(
				(finished.history || []).some((h) => String(h.action).includes("Stage marked stalled")),
			).toBe(false);
		} finally {
			store.stopScheduler();
		}
	});

	it("the same silent child with the keep-alive opted out IS still stalled (control)", async () => {
		// Proves the guard was not deleted: with the stage-level keep-alive
		// disabled (heartbeatIntervalMs: 0) a genuinely silent child past the
		// threshold is killed and routed to the transient ladder.
		const stages = [
			{
				id: "ci",
				name: "Verify",
				type: "ci",
				command: "sleep 10",
				heartbeatIntervalMs: 0,
				timeout: 60000,
			},
		];
		const store = freshStore(stages, { useBranches: false });
		const created = store.createTask(projectId, {
			title: "Quiet CI, no keep-alive",
			goal: "Prove the silence watchdog still catches a silent stage",
			stageId: "ci",
			projectCwd: repo,
		});
		store.setEngineState({
			status: "running",
			activeTaskId: created.id,
			activeProjectId: projectId,
		});

		const runPromise = store.executeStage(projectId, created.id, {
			stages,
			projectCwd: repo,
		});
		const registered = await (async () => {
			const started = Date.now();
			while (!store._activeChildren.has(created.id)) {
				if (Date.now() - started > 5000) return false;
				await new Promise((resolve) => setTimeout(resolve, 25));
			}
			return true;
		})();
		expect(registered).toBe(true);

		try {
			// Real wait past the shortened 1000ms threshold: with no
			// keep-alive the entry heartbeat stays the only beat.
			await new Promise((resolve) => setTimeout(resolve, 1500));
			const { watchdogTick } = await import("./stageHeartbeat.js");
			const outcome = watchdogTick(store, {
				now: Date.now(),
				cfg: { ciStallTimeoutMs: 1000 },
			});
			expect(outcome).toBeDefined();
			const after = store.getTask(projectId, created.id);
			expect((after.timeline || []).some((e) => e.status === "Stalled")).toBe(true);
			// The stall context is on the task for the report writer.
			expect(after.stallKill).toMatchObject({ stageId: "ci", thresholdMs: 1000 });
			const result = await runPromise;
			expect(result.status).toBe("stalled");
		} finally {
			store.stopScheduler();
		}
	});

	it("an interrupted deploy-command CI stage auto-resumes (no deploy-specific reconcile)", async () => {
		// A ci stage whose command runs the deploy script is an ordinary ci
		// stage: startup recovery auto-resumes it like any other ci stage.
		// No continuity plugin is registered, so `deploys` is empty and the
		// generic engine never inspects last-result.json for command dispatch.
		const stages = [{ id: "deploy", name: "Deploy", type: "ci", command: "./deploy.sh --prod" }];
		const store = freshStore(stages);
		const created = store.createTask(projectId, {
			title: "Deploy-command CI resume",
			goal: "Prove an interrupted deploy-command ci stage auto-resumes",
			stageId: "deploy",
			projectCwd: repo,
		});
		const parked = store.getTask(projectId, created.id);
		parked.status = "interrupted";
		parked.wasInterrupted = true;
		parked.enteredStageAt = "2026-09-24T10:00:00.000Z";
		store._saveTaskMarkdown(repo, parked);
		// A deploy manager with a stale result is present but irrelevant:
		// generic recovery never consults it for a ci stage.
		store.deployManager = {
			readJson: () => ({
				status: "success",
				startedAt: "2026-09-24T09:00:00.000Z",
				finishedAt: "2026-09-24T09:01:00.000Z",
				buildNumber: 1,
				message: "previous attempt",
			}),
		};
		const advanceSpy = vi.spyOn(store, "advanceStage");
		try {
			const recovery = await store.performStartupRecovery({ disabled: true, agentRunner });
			// No plugins: nothing deploy-specific reconciles.
			expect(recovery.deploys).toEqual([]);
			// The ci stage is auto-resumed (ordinary CI behaviour).
			expect(recovery.autoResumed).toEqual([
				{ projectId, taskId: created.id },
			]);
			expect(store.getTask(projectId, created.id).status).toBe("in_stage");
			expect(advanceSpy).not.toHaveBeenCalled();
		} finally {
			advanceSpy.mockRestore();
			store.stopScheduler();
		}
	});

	it("does not inject deploy attempt ids into the command environment (generic path)", async () => {
		// Generic command execution never sets KAINBAIN_DEPLOY_ATTEMPT_ID or
		// KAINBAIN_DEPLOY_OPERATION_KEY. Those belong to the implementation-
		// specific continuity plugin (api/continuity/), which contributes
		// them through the stage-lifecycle seam when (and only when) the
		// self-deploy flag is set. This test pins the generic contract.
		const stages = [
			{
				id: "deploy",
				name: "Deploy",
				type: "ci",
				command:
					'printf \'%s|%s\' "${KAINBAIN_DEPLOY_ATTEMPT_ID:-}" "${KAINBAIN_DEPLOY_OPERATION_KEY:-}" > attempt-id.txt',
			},
		];
		const store = freshStore(stages, { useBranches: false });
		const created = store.createTask(projectId, {
			title: "Deploy env",
			goal: "Prove generic path does not inject deploy attempt env vars",
			stageId: "deploy",
			projectCwd: repo,
		});
		const result = await store.executeStage(projectId, created.id, {
			stages,
			projectCwd: repo,
		});
		expect(result.status).toBe("passed");
		const written = fs.readFileSync(path.join(repo, "attempt-id.txt"), "utf8");
		// Both vars are empty: the generic engine does not set them.
		expect(written).toBe("|");
		store.stopScheduler();
	});
});
