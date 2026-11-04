/***
 * MARK: DEMO_SEED_PROJECT_NAME
 * @description Display name of the install-time demo project (`seedDemoProject`).
 * @example DEMO_SEED_PROJECT_NAME => 'Welcome Tour'
 ***/
export const DEMO_SEED_PROJECT_NAME = "Welcome Tour";

/***
 * MARK: DEMO_SEED_STAGES
 * @description Minimal starter pipeline for the demo project: one agent
 *   stage plus a human review, mirroring the DEFAULT_STAGES entry shape.
 * @example DEMO_SEED_STAGES.map((s) => s.type) => ['agent', 'human']
 ***/
export const DEMO_SEED_STAGES = [
	{
		id: "1",
		name: "First Task",
		type: "agent",
		prompt: "Do the first small task for this demo project.",
		paused: false,
		failback: "start",
	},
	{
		id: "2",
		name: "Human Review",
		type: "human",
		prompt: "Review the agent's work.",
		paused: false,
		failback: "previous",
	},
];

/***
 * MARK: seedDemoProject
 * @description Install-time demo seed (KAINBAIN_SEED_DEMO): creates one
 *   local-only "Welcome Tour" project (agent stage + human review) when
 *   the store holds zero projects, so a fresh install opens on a board
 *   that demonstrates value instead of an empty directory. Uses the
 *   internal local-only creation path (same as adoption) — the HTTP
 *   route still always enforces D11. Never throws: any failure yields
 *   null and the install simply has no projects.
 * @example seedDemoProject(projectStore) => { id: '…', name: 'Welcome Tour' } or null
 * @param {Object} projectStore - ProjectStore instance.
 * @returns {Object|null} The seeded project, or null when skipped/failed.
 ***/
export const seedDemoProject = (projectStore) => {
	try {
		if (!projectStore || typeof projectStore.listProjects !== "function") return null;
		if (projectStore.listProjects().length > 0) return null;
		return projectStore.createProject({
			name: DEMO_SEED_PROJECT_NAME,
			stages: DEMO_SEED_STAGES.map((stage) => ({ ...stage })),
			allowLocalOnly: true,
		});
	} catch {
		return null;
	}
};
