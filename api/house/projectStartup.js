// Domain: House Setup — prepare the saved projects and their work at startup.
import fs from "node:fs";
import { config } from "../config.js";

/***
 * MARK: projectsRootBootWarning
 * @description The boot diagnostic when none of the configured projects roots
 *   exist, or null when at least one does (a root that is present means
 *   discovery works). Docker refuses to boot via its entrypoint; native boots
 *   would otherwise serve an empty board silently, so the message names the
 *   configured value(s) and how to change them.
 * @example projectsRootBootWarning('/nope', () => false) => '[boot] projects root ...'
 * @example projectsRootBootWarning(['/nope', '/exists'], (p) => p === '/exists') => null
 * @param {string|Array<string>} roots - Configured `projectsRoot` plus any extra roots.
 * @param {Function} [exists] - Existence probe (tests inject; defaults to fs.existsSync).
 * @returns {string|null}
 ***/
export function projectsRootBootWarning(roots, exists = fs.existsSync) {
	const list = (Array.isArray(roots) ? roots : [roots]).filter(
		(root) => typeof root === "string" && root.trim(),
	);
	if (list.length === 0) return null;
	let anyPresent = false;
	for (const root of list) {
		try {
			if (exists(root) === true) {
				anyPresent = true;
				break;
			}
		} catch {
			// Treat an unreadable root as missing; another root may still exist.
		}
	}
	if (anyPresent) return null;
	const named =
		list.length === 1
			? `projects root '${list[0]}' does not exist`
			: `none of the configured projects roots exist (${list
					.map((root) => `'${root}'`)
					.join(", ")})`;
	return (
		`[boot] ${named} — no projects will be discovered. ` +
		`Set PROJECTS_ROOT (and optionally PROJECTS_ROOTS) to your projects directory and restart.`
	);
}

/***
 * MARK: shouldSeedSampleProjects
 * @description Whether boot provisions the sample "Project A"–"Project D"
 *   set: an explicit call-time override wins, otherwise the
 *   `KAINBAIN_SEED_SAMPLE_PROJECTS` config (off by default, so fresh
 *   machines boot with an empty board).
 * @example shouldSeedSampleProjects({}, {}) => false
 * @param {Object} [opts]
 * @param {boolean} [opts.seedSamples] - Explicit override (tests inject).
 * @returns {boolean}
 ***/
export function shouldSeedSampleProjects(opts = {}) {
	if (typeof opts.seedSamples === "boolean") return opts.seedSamples;
	return config?.seedSampleProjects === true;
}

/***
 * MARK: prepareProjects
 * @description Restores every project's saved tasks, seeding the sample
 *   projects first only when enabled (see `shouldSeedSampleProjects`).
 *   Projects already on disk always scan — disabling the seed never hides
 *   the live `project-a`…`d` set, which the frontend can hide via
 *   `hiddenProjectIds` instead.
 * @example prepareProjects(projectStore, taskStore)
 */
export function prepareProjects(projectStore, taskStore, opts = {}) {
	// Seed standard projects if they are not already present (opt-in).
	if (shouldSeedSampleProjects(opts)) {
		const existingProjectNames = new Set(
			projectStore.listProjects().map((p) => p.name),
		);
		if (!existingProjectNames.has("Project A")) {
			projectStore.createProject({
			name: "Project A",
			// Opt-in local samples are local-only by design (D11b class);
			// API-created projects still require a remote.
			allowLocalOnly: true,
		});
		}
		if (!existingProjectNames.has("Project B")) {
			projectStore.createProject({
			name: "Project B",
			// Opt-in local samples are local-only by design (D11b class);
			// API-created projects still require a remote.
			allowLocalOnly: true,
		});
		}
		if (!existingProjectNames.has("Project C")) {
			projectStore.createProject({
			name: "Project C",
			// Opt-in local samples are local-only by design (D11b class);
			// API-created projects still require a remote.
			allowLocalOnly: true,
		});
		}
		if (!existingProjectNames.has("Project D")) {
			projectStore.createProject({
			name: "Project D",
			// Opt-in local samples are local-only by design (D11b class);
			// API-created projects still require a remote.
			allowLocalOnly: true,
		});
		}
	}

	// Rehydrate existing tasks from disk for all projects.
	for (const project of projectStore.listProjects()) {
		// Verify the docs link first: a missing or dangling link self-heals
		// here, before the scan can cement a shadow directory by writing into
		// it (2026-10-02 incident: UI silently showed 1 of 134 tasks).
		if (typeof projectStore.ensureDocsLink === "function") {
			try {
				projectStore.ensureDocsLink(project);
			} catch {
				// Link verification must never break startup; the scan proceeds
				// against whatever docs/ currently resolves to.
			}
		}
		taskStore.scanTasks(project.id, project.cwd);
	}
}
