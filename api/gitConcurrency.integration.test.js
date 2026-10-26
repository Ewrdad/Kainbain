import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
	gitAvailable,
	makeTmpBase,
	makeRepoTracker,
	initRepo,
	runGit,
} from "./test-helpers/tmpRepo.js";

const { git, checkoutBranch, currentBranch } = await import("./git.js");
const { createTask } = await import("./work/taskLifecycle.js");
const { taskBranchName, ensureTaskBranch } = await import("./work/taskBranches.js");

/***
 * MARK: concurrent branch-operation repro
 * @description Root-cause repro for the multi-task git pile-up (success
 *   criterion 1): task creation + approval branch work landing DURING a
 *   running stage used to overlap in time on the single shared checkout and
 *   collide on `.git/index.lock`. The guard is the per-repo mutex inside
 *   `git()`: createTask ISSUES the branch provisioning (fire-and-forget,
 *   exactly the incident's trigger shape) and those provisioning git ops
 *   serialize with the running stage's ops instead of colliding. Throwaway
 *   temp repo only; no background servers.
 ***/

function makeStore(projectCwd) {
	const maps = new Map();
	const store = {
		tasksByProject: maps,
		scannedProjects: new Set(),
		dedupeMap: new Map(),
		engineState: { status: "idle" },
		eventBridge: { broadcastGlobal: vi.fn() },
		projectStore: {
			getProject: vi.fn(() => ({ id: "p-1", stages: [] })),
		},
		_getMap: (pid) => {
			if (!maps.has(pid)) maps.set(pid, new Map());
			return maps.get(pid);
		},
		_resolveProjectCwd: () => projectCwd,
		_saveTaskMarkdown: vi.fn(),
		_isBranchModeEnabled: () => true,
		_resolveStagesForTask: (proj) => proj?.stages || [],
		// Real provisioning against the shared checkout — the same path the
		// approve route and pickups use — so the storm below genuinely races
		// it. Only the surrounding store plumbing is stubbed.
		ensureTaskBranch: vi.fn((task, cwd, opts) =>
			ensureTaskBranch(store, task, cwd, opts),
		),
	};
	return store;
}

describe.skipIf(!gitAvailable)("concurrent branch ops on one repo", () => {
	let base;
	const repos = makeRepoTracker();
	let repo;

	beforeAll(() => {
		base = makeTmpBase("kainbain-git-concurrency-");
		repo = repos.track(initRepo(path.join(base, "project")));
		runGit(repo, "branch", "kb/task-a");
		runGit(repo, "branch", "kb/task-b");
	});

	afterAll(() => {
		repos.cleanup();
		try {
			fs.rmSync(base, { recursive: true, force: true });
		} catch {
			// ignore
		}
	});

	it("task creation + approval-style branch work during a running stage: zero index.lock errors", async () => {
		const failures = [];
		const lockHits = [];
		const capture = async (label, fn) => {
			try {
				return await fn();
			} catch (err) {
				failures.push(`${label}: ${err?.message || err}`);
				const text = `${err?.message || ""}\n${err?.stderr || ""}\n${err?.stdout || ""}`;
				if (/index\.lock/i.test(text)) lockHits.push(label);
				return null;
			}
		};

		// The "running stage": sustained index-writing git ops, the way a
		// stage's checkout/commit sequence hammers the shared checkout.
		const stageWork = (async () => {
			for (let i = 0; i < 6; i += 1) {
				await capture(`stage/checkout-${i}`, () =>
					checkoutBranch(repo, i % 2 === 0 ? "kb/task-a" : "kb/task-b"),
				);
				await capture(`stage/status-${i}`, () => git(repo, ["status", "--porcelain"]));
			}
		})();

		// Concurrent task creation: createTask issues the branch provisioning
		// fire-and-forget (the exact 2026-10-05 pile-up trigger — provisioning
		// racing a running stage); the per-repo mutex inside `git()` is the
		// only guard, which is the invariant under test.
		const stores = [];
		const creations = Promise.all(
			["c1", "c2", "c3"].map((n) =>
				capture(`create/${n}`, async () => {
					const store = makeStore(repo);
					stores.push(store);
					const task = createTask(store, "p-1", { title: n, goal: n });
					expect(task.branch).toBe(taskBranchName(task.id));
					// Provisioning was issued during createTask (unawaited).
					expect(store.ensureTaskBranch).toHaveBeenCalledTimes(1);
					return task;
				}),
			),
		);

		// Concurrent approval-style branch work (checkouts, the
		// `ensureTaskBranchRef` approve-route shape).
		const approvals = Promise.all(
			["kb/task-a", "kb/task-b", "main"].map((branch, i) =>
				capture(`approve/${i}`, () => checkoutBranch(repo, branch)),
			),
		);

		const [, created] = await Promise.all([stageWork, creations, approvals]);

		// Settle the fire-and-forget provisioning promises: with the per-repo
		// mutex they finish cleanly even though they raced the stage storm.
		const settled = await Promise.allSettled(
			stores.map((s) => s.ensureTaskBranch.mock.results[0].value),
		);
		expect(settled.map((r) => r.status)).toEqual(["fulfilled", "fulfilled", "fulfilled"]);

		expect(failures).toEqual([]);
		expect(lockHits).toEqual([]);
		expect(created).toHaveLength(3);
		for (const s of stores) {
			// Every creation provisioned its own branch on the shared checkout.
			const provisioned = s.ensureTaskBranch.mock.results[0].value;
			await expect(provisioned).resolves.toMatchObject({ created: true });
		}
		// Provisioning may legitimately leave HEAD on any of the (now
		// created) task branches; the invariant under test is zero
		// collisions, not the final checkout position (each pickup re-ensures
		// idempotently).
		expect(await currentBranch(repo)).toMatch(/^(kb\/|main)/);
	});
});