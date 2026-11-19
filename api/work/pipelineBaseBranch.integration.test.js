/* eslint-disable security/detect-non-literal-fs-filename */
// Domain: The Work — acceptance proof for per-pipeline base branches.
// Real git in throwaway temp repos (never the KainBain repo itself):
// a pipeline pointed at a feature branch creates task branches off that
// feature, merges back into it, finalizes onto it, runs primary CI on it,
// and reviews against it — while `main` stays untouched and re-pointing
// the pipeline only affects subsequently created tasks.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
	gitAvailable,
	makeTmpBase,
	makeRepoTracker,
	initRepo,
	runGit,
} from "../test-helpers/tmpRepo.js";

const { TaskStore } = await import("../taskStore.js");
const { executeMergeStage, resolveCiBranchPlan } = await import("../flow/commandStages.js");
const { finalizeTaskBranch } = await import("./taskFinalize.js");
const { buildTaskReview } = await import("../reviewAssembly.js");
const { currentBranch } = await import("../git.js");

const STAGES = [
	{ id: "work-1", name: "Work", type: "agent" },
	{ id: "merge-1", name: "Merge", type: "merge" },
];
const MERGE_STAGE = STAGES[1];

function makeProject(repoDir, workflows, projectOverrides = {}) {
	const project = {
		id: "p1",
		name: "P1",
		cwd: repoDir,
		useBranches: true,
		workflows,
		stages: workflows[0].stages,
		activeWorkflowId: workflows[0].id,
		...projectOverrides,
	};
	const projectStore = {
		getProject: () => project,
		getWorkflow: (pid, wid) => workflows.find((w) => w.id === wid) || null,
	};
	const store = new TaskStore({ eventBridge: null, projectStore });
	// Isolate the merge/pass plumbing from scheduler advancement: these
	// tests prove git state, not stage routing.
	store.advanceStage = () => ({ status: "passed" });
	// Capture every branch-provisioning promise (including the unawaited
	// one createTask kicks off) so tests can drain background git work
	// deterministically instead of sleeping.
	const provisions = [];
	const rawEnsure = store.ensureTaskBranch.bind(store);
	store.ensureTaskBranch = (...args) => {
		const settled = rawEnsure(...args);
		provisions.push(settled.catch(() => null));
		return settled;
	};
	const drainProvisioning = async () => {
		for (;;) {
			const pending = provisions.splice(0);
			if (pending.length === 0) return;
			await Promise.all(pending);
		}
	};
	return { store, project, projectStore, drainProvisioning };
}

function featureRepo(base, name) {
	const dir = initRepo(path.join(base, name), { initialBranch: "main" });
	const mainTip = runGit(dir, "rev-parse", "main").trim();
	runGit(dir, "checkout", "-b", "feature/big-thing");
	fs.writeFileSync(path.join(dir, "feature.txt"), "feature work\n");
	runGit(dir, "add", "-A");
	runGit(dir, "commit", "-m", "feature base commit");
	const featureTip = runGit(dir, "rev-parse", "feature/big-thing").trim();
	runGit(dir, "checkout", "main");
	return { dir, mainTip, featureTip };
}

function featureWorkflows() {
	return [
		{ id: "wf-feature", name: "Feature Track", isDefault: true, stages: STAGES, baseBranch: "feature/big-thing" },
		{ id: "wf-main", name: "Main Track", isDefault: false, stages: STAGES },
	];
}



describe.skipIf(!gitAvailable)("per-pipeline base branch acceptance (real git)", () => {
	let base;
	let repos;

	beforeAll(() => {
		base = makeTmpBase("kainbain-pipeline-base-");
		repos = makeRepoTracker();
	});

	afterAll(() => {
		repos.cleanup();
		try {
			fs.rmSync(base, { recursive: true, force: true });
		} catch {
			// best-effort cleanup
		}
	});

	it("pins the pipeline base at creation and branches off it instead of main", async () => {
		const { dir, mainTip, featureTip } = featureRepo(base, "create-off-base");
		repos.track(dir);
		const { store, drainProvisioning } = makeProject(dir, featureWorkflows());

		const task = store.createTask("p1", {
			title: "Feature work",
			goal: "Feature work",
			workflowId: "wf-feature",
			projectCwd: dir,
		});
		expect(task.baseBranch).toBe("feature/big-thing");
		await drainProvisioning();
		expect(task.branchProvisionError).toBeUndefined();

		const taskTip = runGit(dir, "rev-parse", task.branch).trim();
		expect(taskTip).toBe(featureTip);
		expect(taskTip).not.toBe(mainTip);
		expect(task.history.some((h) => String(h.action).includes("from 'feature/big-thing'"))).toBe(true);

		// A task on the unconfigured pipeline still starts at the main tip.
		const plain = store.createTask("p1", {
			title: "Main work",
			goal: "Main work",
			workflowId: "wf-main",
			projectCwd: dir,
		});
		expect(plain).not.toHaveProperty("baseBranch");
		await drainProvisioning();
		expect(plain.branchProvisionError).toBeUndefined();
		expect(runGit(dir, "rev-parse", plain.branch).trim()).toBe(mainTip);
	});

	it("auto-creates a missing pipeline base from the repo default", async () => {
		const dir = initRepo(path.join(base, "auto-create-base"), { initialBranch: "main" });
		repos.track(dir);
		const mainTip = runGit(dir, "rev-parse", "main").trim();
		const { store, drainProvisioning } = makeProject(dir, [
			{ id: "wf-fresh", name: "Fresh Track", isDefault: true, stages: STAGES, baseBranch: "feature/fresh" },
		]);

		const task = store.createTask("p1", {
			title: "Fresh work",
			goal: "Fresh work",
			workflowId: "wf-fresh",
			projectCwd: dir,
		});
		await drainProvisioning();
		expect(task.branchProvisionError).toBeUndefined();

		expect(runGit(dir, "rev-parse", "feature/fresh").trim()).toBe(mainTip);
		expect(runGit(dir, "rev-parse", task.branch).trim()).toBe(mainTip);
		expect(
			task.history.some((h) =>
				String(h.action).includes("Created base branch 'feature/fresh' from 'main'"),
			),
		).toBe(true);
	});

	it("merges back into the pipeline base and leaves main untouched", async () => {
		const { dir, mainTip } = featureRepo(base, "merge-into-base");
		repos.track(dir);
		const { store, drainProvisioning } = makeProject(dir, featureWorkflows());

		const task = store.createTask("p1", {
			title: "Feature work",
			goal: "Feature work",
			workflowId: "wf-feature",
			projectCwd: dir,
		});
		await drainProvisioning();
		expect(task.branchProvisionError).toBeUndefined();

		// Task work lands on the task branch.
		await store.ensureTaskBranch(task, dir);
		fs.writeFileSync(path.join(dir, "task-work.txt"), "task did this\n");
		runGit(dir, "add", "-A");
		runGit(dir, "commit", "-m", "task work");

		task.currentStageId = "merge-1";
		const result = await executeMergeStage(store, {
			projectId: "p1",
			taskId: task.id,
			stage: MERGE_STAGE,
			stages: STAGES,
			cwd: dir,
			bridge: null,
		});
		expect(result.status).toBe("passed");

		// The feature branch carries the work; main does not.
		expect(runGit(dir, "show", "feature/big-thing:task-work.txt")).toContain("task did this");
		expect(() => runGit(dir, "show", "main:task-work.txt")).toThrow();
		expect(runGit(dir, "rev-parse", "main").trim()).toBe(mainTip);
		// The landed task branch was pruned by squash cleanup.
		expect(runGit(dir, "branch", "--list", task.branch).trim()).toBe("");
		// The baseline froze the feature-branch merge.
		expect(task.reviewBaseline).toMatchObject({ headSha: expect.any(String) });
	});

	it("merges sequential tasks into the same base without conflicts", async () => {
		const { dir } = featureRepo(base, "sequential-merges");
		repos.track(dir);
		const { store, drainProvisioning } = makeProject(dir, featureWorkflows());

		for (const name of ["one", "two"]) {
			const task = store.createTask("p1", {
				title: `Work ${name}`,
				goal: `Work ${name}`,
				workflowId: "wf-feature",
				projectCwd: dir,
			});
			await drainProvisioning();
			expect(task.branchProvisionError).toBeUndefined();
			await store.ensureTaskBranch(task, dir);
			fs.writeFileSync(path.join(dir, `work-${name}.txt`), `${name}\n`);
			runGit(dir, "add", "-A");
			runGit(dir, "commit", "-m", `task work ${name}`);
			task.currentStageId = "merge-1";
			const result = await executeMergeStage(store, {
				projectId: "p1",
				taskId: task.id,
				stage: MERGE_STAGE,
				stages: STAGES,
				cwd: dir,
				bridge: null,
			});
			expect(result.status).toBe("passed");
		}

		expect(runGit(dir, "show", "feature/big-thing:work-one.txt")).toContain("one");
		expect(runGit(dir, "show", "feature/big-thing:work-two.txt")).toContain("two");
		expect(() => runGit(dir, "show", "main:work-one.txt")).toThrow();
	});

	it("finalize returns to the pipeline base after a stage", async () => {
		const { dir } = featureRepo(base, "finalize-to-base");
		repos.track(dir);
		const { store, drainProvisioning } = makeProject(dir, featureWorkflows());

		const task = store.createTask("p1", {
			title: "Feature work",
			goal: "Feature work",
			workflowId: "wf-feature",
			projectCwd: dir,
		});
		await drainProvisioning();
		expect(task.branchProvisionError).toBeUndefined();
		await store.ensureTaskBranch(task, dir);
		fs.writeFileSync(path.join(dir, "staged.txt"), "staged\n");

		const summary = await finalizeTaskBranch(store, task, dir, { stageName: "Work" });
		expect(summary.returnError).toBeNull();
		expect(await currentBranch(dir)).toBe("feature/big-thing");
		expect(
			task.history.some((h) =>
				String(h.action).includes("Returned to default branch 'feature/big-thing'"),
			),
		).toBe(true);
	});

	it("CI primary mode resolves the pipeline base; custom mode is unchanged", async () => {
		const { dir } = featureRepo(base, "ci-primary-base");
		repos.track(dir);
		const { projectStore } = makeProject(dir, featureWorkflows());
		const task = { id: "t-ci", projectId: "p1", workflowId: "wf-feature", baseBranch: "feature/big-thing" };

		const primary = await resolveCiBranchPlan({
			stage: { name: "Verify", runOnBranch: "primary" },
			cwd: dir,
			task,
			projectStore,
			projectId: "p1",
		});
		expect(primary).toEqual({ mode: "primary", branch: "feature/big-thing" });

		// Live pipeline lookup (legacy task without a snapshot) resolves too.
		const live = await resolveCiBranchPlan({
			stage: { name: "Verify", runOnBranch: "primary" },
			cwd: dir,
			task: { id: "t-legacy", projectId: "p1", workflowId: "wf-feature" },
			projectStore,
			projectId: "p1",
		});
		expect(live).toEqual({ mode: "primary", branch: "feature/big-thing" });

		// Unconfigured pipelines still resolve the repo default.
		const plain = await resolveCiBranchPlan({
			stage: { name: "Verify", runOnBranch: "primary" },
			cwd: dir,
			task: { id: "t-plain", projectId: "p1", workflowId: "wf-main" },
			projectStore,
			projectId: "p1",
		});
		expect(plain).toEqual({ mode: "primary", branch: "main" });

		// Custom mode never consults the pipeline base.
		runGit(dir, "branch", "release/next");
		const custom = await resolveCiBranchPlan({
			stage: { name: "Verify", runOnBranch: "custom", customBranch: "release/next" },
			cwd: dir,
			task,
			projectStore,
			projectId: "p1",
		});
		expect(custom).toEqual({ mode: "custom", branch: "release/next" });
	});

	it("review diffs the task against the pipeline base, not main", async () => {
		const { dir } = featureRepo(base, "review-vs-base");
		repos.track(dir);
		const { store, projectStore, drainProvisioning } = makeProject(dir, featureWorkflows());

		const task = store.createTask("p1", {
			title: "Feature work",
			goal: "Feature work",
			workflowId: "wf-feature",
			projectCwd: dir,
		});
		await drainProvisioning();
		expect(task.branchProvisionError).toBeUndefined();
		await store.ensureTaskBranch(task, dir);
		fs.writeFileSync(path.join(dir, "task-only.txt"), "task\n");
		runGit(dir, "add", "-A");
		runGit(dir, "commit", "-m", "task work");

		const review = await buildTaskReview({ projectStore, taskStore: store }, dir, "p1", task.id);
		expect(review.baseBranch).toBe("feature/big-thing");
		const paths = review.files.map((f) => f.path);
		// The task's own file shows; the feature branch's own delta from
		// main (feature.txt) must NOT read as the task's change.
		expect(paths).toContain("task-only.txt");
		expect(paths).not.toContain("feature.txt");
	});

	it("re-pointing the pipeline only affects subsequently created tasks", async () => {
		const { dir } = featureRepo(base, "repoint-safety");
		repos.track(dir);
		runGit(dir, "checkout", "-b", "feature/next");
		runGit(dir, "checkout", "main");
		const workflows = featureWorkflows();
		const { store, drainProvisioning } = makeProject(dir, workflows);

		const old = store.createTask("p1", {
			title: "Old work",
			goal: "Old work",
			workflowId: "wf-feature",
			projectCwd: dir,
		});
		expect(old.baseBranch).toBe("feature/big-thing");
		await drainProvisioning();
		await store.ensureTaskBranch(old, dir);
		fs.writeFileSync(path.join(dir, "old-work.txt"), "old\n");
		runGit(dir, "add", "-A");
		runGit(dir, "commit", "-m", "old work");

		// Re-point the pipeline mid-flight (as PATCH /workflows would).
		workflows.find((w) => w.id === "wf-feature").baseBranch = "feature/next";

		const fresh = store.createTask("p1", {
			title: "New work",
			goal: "New work",
			workflowId: "wf-feature",
			projectCwd: dir,
		});
		expect(fresh.baseBranch).toBe("feature/next");
		await drainProvisioning();
		expect(fresh.branchProvisionError).toBeUndefined();
		expect(runGit(dir, "rev-parse", fresh.branch).trim()).toBe(
			runGit(dir, "rev-parse", "feature/next").trim(),
		);

		// The in-flight task still merges into its pinned base.
		old.currentStageId = "merge-1";
		const result = await executeMergeStage(store, {
			projectId: "p1",
			taskId: old.id,
			stage: MERGE_STAGE,
			stages: STAGES,
			cwd: dir,
			bridge: null,
		});
		expect(result.status).toBe("passed");
		expect(runGit(dir, "show", "feature/big-thing:old-work.txt")).toContain("old");
		expect(() => runGit(dir, "show", "feature/next:old-work.txt")).toThrow();
	});

	it("provisions worktree-isolated tasks from the pipeline base", async () => {
		const { dir, featureTip } = featureRepo(base, "worktree-from-base");
		repos.track(dir);
		const { store, drainProvisioning } = makeProject(dir, featureWorkflows(), {
			workspaceIsolation: "worktree",
		});

		const task = store.createTask("p1", {
			title: "Isolated work",
			goal: "Isolated work",
			workflowId: "wf-feature",
			projectCwd: dir,
		});
		await drainProvisioning();
		expect(task.branchProvisionError).toBeUndefined();

		expect(runGit(dir, "rev-parse", task.branch).trim()).toBe(featureTip);
		expect(
			task.history.some((h) =>
				String(h.action).includes(`(from 'feature/big-thing')`),
			),
		).toBe(true);
	});
});
