import { expect, test, describe } from "vitest";
import { ClaimStore } from "../claimStore.js";
import { scanClaimableTasks } from "./scanClaimableTasks.js";

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

	function deps(tasksByProject, claimStore = new ClaimStore()) {
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
		const claimStore = new ClaimStore();
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
		const d = {
			projectStore: { listProjects: () => [project("p1", stages), project("p2", stages)] },
			taskStore: {
				listTasks: (pid) => (pid === "p1" ? [old, newer, far] : [t("other")]),
				isTaskBlocked: () => ({ blocked: false }),
			},
			claimStore: new ClaimStore(),
		};
		expect(scanClaimableTasks(d).map((c) => c.taskId)).toEqual(["far", "old", "new", "other"]);
		expect(
			scanClaimableTasks(d, { projectIds: ["p2"] }).map((c) => c.taskId),
		).toEqual(["other"]);
	});
});
