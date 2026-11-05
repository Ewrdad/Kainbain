import { config } from "../config.js";
import { resolveRunnerBootstrap } from "../flow/runnerBootstrap.js";
import { resolveOnboardingChecklist, taskHasRun } from "../onboardingChecklist.js";

/***
 * MARK: onboardingRoutes
 * @description First-run onboarding summary: one additive `GET /onboarding`
 *   read joining the Runner bootstrap story, project/task counts, the
 *   unadopted-checkout list, and the precomputed guided checklist — so
 *   the empty state and checklist UIs need no other fetches. Read-only.
 * @example app.register(onboardingRoutes, { deps })
 * @param {Object} app - Fastify app.
 * @param {Object} opts - Options.
 * @param {Object} opts.deps - `{ runnerRegistry, projectStore, taskStore }`.
 ***/
export default async function onboardingRoutes(app, { deps }) {
	const { runnerRegistry, projectStore, taskStore } = deps;

	/***
	 * MARK: Get Onboarding Summary
	 * Read-only join across the Runner registry, project store, and task
	 * store. Per-project task reads are individually guarded: one broken
	 * project never fails the whole summary.
	 ***/
	app.get("/onboarding", async () => {
		const runner = resolveRunnerBootstrap(runnerRegistry.list(), {
			staleAfterMs: runnerRegistry.staleAfterMs,
			expectedRunnerId: config.expectedRunnerId || null,
		});
		const projects = projectStore.listProjects();
		let taskCount = 0;
		let hasRun = false;
		for (const project of projects) {
			let tasks = [];
			try {
				tasks = taskStore.listTasks(project.id, project.cwd) || [];
			} catch {
				tasks = [];
			}
			taskCount += tasks.length;
			if (!hasRun && tasks.some((task) => taskHasRun(task))) hasRun = true;
		}
		let adoptable = [];
		try {
			adoptable = projectStore.discoverAdoptable({ cap: 10 });
		} catch {
			adoptable = [];
		}
		const { steps, complete } = resolveOnboardingChecklist({
			runner,
			projectCount: projects.length,
			taskCount,
			hasRun,
		});
		return {
			runner,
			projectCount: projects.length,
			taskCount,
			hasRun,
			adoptable,
			steps,
			complete,
		};
	});
}
