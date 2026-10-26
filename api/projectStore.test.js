/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
	ProjectStore,
	DEFAULT_STAGES,
	DEFAULT_DEPLOY_COMMAND,
	detectGitRemote,
	resolveDefaultGitRemote,
	slugifyProjectName,
	normalizeStage,
	normalizeStages,
	normalizeStageSkills,
	normalizeStageTags,
	migrateMergeDeployStages,
} from "./projectStore.js";

/**
 * MARK: ProjectStore unit tests
 * @description Verifies filesystem-backed project management, directory creation,
 * SilverBullet docs symlinks, .kainbain/project.json persistence, and stage navigation.
 */

describe("ProjectStore", () => {
	let store;
	let tempProjectsDir;
	let tempNotesDir;

	beforeEach(() => {
		tempProjectsDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "kainbain-test-projects-"),
		);
		tempNotesDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "kainbain-test-notes-"),
		);
		store = new ProjectStore({
			projectsRoot: tempProjectsDir,
			notesRoot: tempNotesDir,
			autoScan: false,
		});
	});

	afterEach(() => {
		try {
			fs.rmSync(tempProjectsDir, { recursive: true, force: true });
			fs.rmSync(tempNotesDir, { recursive: true, force: true });
		} catch (e) {
			// ignore cleanup errors
		}
	});

	it("slugifies project names correctly", () => {
		expect(slugifyProjectName("My Project 123")).toBe("my-project-123");
		expect(slugifyProjectName("Test / Slash & Symbols")).toBe(
			"test-slash-symbols",
		);
		expect(slugifyProjectName("")).toBe("untitled-project");
	});

	it("creates a project with directory, notes space, docs symlink, git repo, .gitignore, and project.json", () => {
		const project = store.createProject({
			name: "Alpha Service",
			defaultModel: "claude-3-7-sonnet",
			accentColor: "#38bdf8",
		});
		expect(project.name).toBe("Alpha Service");
		expect(project.slug).toBe("alpha-service");
		// No remote template configured: no fabricated host, no origin remote.
		expect(project.gitUrl).toBeNull();
		expect(project.gitRepo).toBeNull();
		expect(project.hasUpstreamRepo).toBe(false);
		expect(project.repoUrl).toBeNull();
		expect(() => {
			execFileSync("git", ["config", "--get", "remote.origin.url"], {
				cwd: project.cwd,
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			});
		}).toThrow();
		expect(project.defaultModel).toBe("claude-3-7-sonnet");
		expect(project.accentColor).toBe("#38bdf8");
		expect(project.stages).toHaveLength(DEFAULT_STAGES.length);
		expect(project.stages.some((s) => s.type === "agent")).toBe(true);
		expect(project.stages.some((s) => s.type === "human")).toBe(true);
		expect(project.stages[project.stages.length - 1].type).toBe("ci");
		expect(project.stages[project.stages.length - 1].command).toBe("./deploy.sh --prod");
		expect(project.currentStageId).toBeNull();

		// Check directories exist on filesystem
		expect(fs.existsSync(project.cwd)).toBe(true);
		expect(fs.existsSync(project.notesPath)).toBe(true);

		// Check docs symlink exists
		const docsPath = path.join(project.cwd, "docs");
		expect(fs.existsSync(docsPath)).toBe(true);
		const lstat = fs.lstatSync(docsPath);
		expect(lstat.isSymbolicLink() || lstat.isDirectory()).toBe(true);

		// Check .git directory exists
		const gitPath = path.join(project.cwd, ".git");
		expect(fs.existsSync(gitPath)).toBe(true);

		// Check .gitignore exists and contains expected ignore patterns
		const gitignorePath = path.join(project.cwd, ".gitignore");
		expect(fs.existsSync(gitignorePath)).toBe(true);
		const gitignoreContent = fs.readFileSync(gitignorePath, "utf8");
		expect(gitignoreContent).toContain(".kainbain/sessions");
		expect(gitignoreContent).toContain("node_modules");
		expect(gitignoreContent).toContain(".env");

		// Check .kainbain/project.json exists
		const configFile = path.join(project.cwd, ".kainbain", "project.json");
		expect(fs.existsSync(configFile)).toBe(true);
		const saved = JSON.parse(fs.readFileSync(configFile, "utf8"));
		expect(saved.id).toBe(project.id);
		expect(saved.name).toBe("Alpha Service");
		expect(saved.gitUrl).toBeNull();
		expect(saved.defaultModel).toBe("claude-3-7-sonnet");
		expect(saved.accentColor).toBe("#38bdf8");
	});

	it("scans and discovers existing project directories", () => {
		// A bare directory without a config file is ignored — only
		// directories carrying a project.json become projects.
		const proj1Dir = path.join(tempProjectsDir, "existing-app");
		fs.mkdirSync(proj1Dir, { recursive: true });

		const proj2Dir = path.join(tempProjectsDir, "configured-app");
		fs.mkdirSync(path.join(proj2Dir, ".kainbain"), { recursive: true });
		fs.writeFileSync(
			path.join(proj2Dir, ".kainbain", "project.json"),
			JSON.stringify({
				id: "custom-id-99",
				name: "Configured App",
				slug: "configured-app",
				stages: [{ id: "s1", name: "Custom Stage", type: "ci" }],
			}),
		);

		const scanned = store.scanProjects();
		expect(scanned.length).toBe(1);
		expect(scanned.find((p) => p.name === "existing-app")).toBeUndefined();

		const discovered2 = scanned.find((p) => p.name === "Configured App");
		expect(discovered2).toBeDefined();
		expect(discovered2.id).toBe("custom-id-99");
		expect(discovered2.stages[0].name).toBe("Custom Stage");
	});

	it("throws error when creating a project without a valid name", () => {
		expect(() => store.createProject({ name: "" })).toThrow(
			"Project name is required",
		);
		expect(() => store.createProject({})).toThrow("Project name is required");
	});

	it("sets the first created project as active and supports activation", () => {
		const p1 = store.createProject({ name: "Proj A" });
		const p2 = store.createProject({ name: "Proj B" });
		expect(store.getActiveProject().id).toBe(p1.id);
		store.setActiveProject(p2.id);
		expect(store.getActiveProject().id).toBe(p2.id);
	});

	it("rejects a project update that repoints cwd at the projects root", () => {
		const p = store.createProject({ name: "Root Guard" });
		let thrown = null;
		try {
			store.updateProject(p.id, { cwd: tempProjectsDir });
		} catch (err) {
			thrown = err;
		}
		expect(thrown).not.toBeNull();
		expect(thrown.statusCode).toBe(400);
		expect(thrown.message).toContain("not the projects root");
		// In-memory project untouched, and no project.json written to the root.
		expect(store.getProject(p.id).cwd).toBe(p.cwd);
		expect(
			fs.existsSync(path.join(tempProjectsDir, ".kainbain", "project.json")),
		).toBe(false);
	});

	it("rejects a project update with a blank name or a missing cwd", () => {
		const p = store.createProject({ name: "Name Guard" });
		expect(() => store.updateProject(p.id, { name: "   " })).toThrow(
			"Project name must not be blank",
		);
		expect(() => store.updateProject(p.id, { cwd: "   " })).toThrow(
			"Project working directory must not be blank",
		);
		expect(() =>
			store.updateProject(p.id, {
				cwd: path.join(tempProjectsDir, "does-not-exist"),
			}),
		).toThrow("does not exist or is not a directory");
		expect(store.getProject(p.id).name).toBe("Name Guard");
		expect(store.getProject(p.id).cwd).toBe(p.cwd);
	});

	it("ignores identity fields (id) and unchanged cwd on update", () => {
		const p = store.createProject({ name: "Identity Guard" });
		const updated = store.updateProject(p.id, {
			id: "some-other-id",
			cwd: `${p.cwd}/`,
			name: "  Trimmed Name  ",
		});
		expect(updated.id).toBe(p.id);
		expect(store.getProject(p.id).id).toBe(p.id);
		expect(updated.cwd).toBe(p.cwd);
		expect(updated.name).toBe("Trimmed Name");
	});

	it("refuses to create a project inside the projects root itself", () => {
		expect(() =>
			store.createProject({ name: "Root Child", cwd: tempProjectsDir }),
		).toThrow("not the projects root");
	});

	it("refuses to persist a project whose cwd is the projects root", () => {
		const p = store.createProject({ name: "Save Guard" });
		store._saveProjectFile({ ...p, cwd: tempProjectsDir });
		expect(
			fs.existsSync(path.join(tempProjectsDir, ".kainbain", "project.json")),
		).toBe(false);
	});

	it("updates project and workflow stages and persists to project.json", () => {
		const p = store.createProject({ name: "Original" });
		store.updateProject(p.id, { name: "Renamed Project" });
		expect(store.getProject(p.id).name).toBe("Renamed Project");

		const newStages = [{ id: "x", name: "Specification", type: "agent" }];
		store.updateStages(p.id, newStages);
		expect(store.getStages(p.id)).toEqual(newStages);

		// Verify file on disk
		const configFile = path.join(p.cwd, ".kainbain", "project.json");
		const diskData = JSON.parse(fs.readFileSync(configFile, "utf8"));
		expect(diskData.name).toBe("Renamed Project");
		expect(diskData.stages[0].name).toBe("Specification");
	});

	describe("normalizeStageSkills (stage skills data model)", () => {
		it("returns undefined for absent/null skills (legacy no-op)", () => {
			expect(normalizeStageSkills(undefined)).toBeUndefined();
			expect(normalizeStageSkills(null)).toBeUndefined();
		});

		it("coerces only authoritative fields and passes unknown fields through", () => {
			const [skill] = normalizeStageSkills([
				{
					name: "  creating-new-tickets  ",
					mode: "OPTION",
					config: { targetStage: "Intake" },
					customFlag: "kept",
				},
			]);
			expect(skill.name).toBe("creating-new-tickets");
			expect(skill.mode).toBe("option");
			expect(skill.config).toEqual({ targetStage: "Intake" });
			expect(skill.customFlag).toBe("kept");
		});

		it("defaults invalid modes to direct and drops nameless entries", () => {
			const skills = normalizeStageSkills([
				{ name: "a", mode: "garbage" },
				{ mode: "direct" },
				null,
				"not-an-object",
			]);
			expect(skills).toEqual([{ name: "a", mode: "direct" }]);
		});

		it("normalizes non-array skills to an empty list and clamps bad config", () => {
			expect(normalizeStageSkills("nope")).toEqual([]);
			expect(normalizeStageSkills([{ name: "a", config: "not-object" }])).toEqual([
				{ name: "a", config: {} },
			]);
		});

		it("keeps legacy stages byte-identical through normalizeStage (no skills key)", () => {
			const p = store.createProject({ name: "Skills Legacy" });
			const stages = store.getStages(p.id);
			expect(stages.some((s) => "skills" in s)).toBe(false);
			store.updateStages(p.id, DEFAULT_STAGES.map((s) => ({ ...s })));
			expect(store.getStages(p.id).some((s) => "skills" in s)).toBe(false);
		});

		it("round-trips stage.skills through updateStages + _saveProjectFile", () => {
			const p = store.createProject({ name: "Skills Roundtrip" });
			const stages = store
				.getStages(p.id)
				.map((s, i) =>
					i === 0
						? {
								...s,
								skills: [
									{
										name: "creating-new-tickets",
										mode: "option",
										config: { targetStage: "Intake" },
									},
								],
							}
						: s,
				);
			store.updateStages(p.id, stages);

			// In-memory
			expect(store.getStages(p.id)[0].skills).toEqual([
				{
					name: "creating-new-tickets",
					mode: "option",
					config: { targetStage: "Intake" },
				},
			]);

			// On disk
			const diskData = JSON.parse(
				fs.readFileSync(path.join(p.cwd, ".kainbain", "project.json"), "utf8"),
			);
			expect(diskData.stages[0].skills[0].name).toBe("creating-new-tickets");

			// And reload from disk
			const reloaded = store._loadProjectFile(p.cwd);
			const reloadedStage = reloaded.workflows[0].stages[0];
			expect(reloadedStage.skills[0].mode).toBe("option");
			expect(reloadedStage.skills[0].config.targetStage).toBe("Intake");
		});
	});

	describe("normalizeStageTags (stage tag data model)", () => {
		it("returns undefined for absent/null tags (legacy no-op)", () => {
			expect(normalizeStageTags(undefined)).toBeUndefined();
			expect(normalizeStageTags(null)).toBeUndefined();
		});

		it("trims inner whitespace, drops empties and over-long values", () => {
			const tags = normalizeStageTags([
				"   front   end   ",
				"   ",
				"",
				"a".repeat(25), // exceeds STAGE_TAG_MAX_LENGTH (24)
				"valid-tag",
			]);
			expect(tags).toEqual(["front end", "valid-tag"]);
		});

		it("deduplicates case-insensitively preserving first casing", () => {
			const tags = normalizeStageTags(["PO", "po", "Po", "Dev", "DEV"]);
			expect(tags).toEqual(["PO", "Dev"]);
		});

		it("drops tags containing commas (comma is the share-link list separator)", () => {
			expect(normalizeStageTags(["a,b", "PO"])).toEqual(["PO"]);
		});

		it("coerces comma-separated strings to normalized tag arrays", () => {
			expect(normalizeStageTags("PO, Dev, QA, Dev")).toEqual(["PO", "Dev", "QA"]);
			expect(normalizeStageTags("")).toEqual([]);
		});

		it("caps normalized tags at STAGE_TAG_MAX_COUNT (12)", () => {
			const input = Array.from({ length: 20 }, (_, i) => `tag-${i}`);
			const tags = normalizeStageTags(input);
			expect(tags).toHaveLength(12);
			expect(tags[0]).toBe("tag-0");
			expect(tags[11]).toBe("tag-11");
		});

		it("keeps legacy stages byte-identical through normalizeStage (no tags key)", () => {
			const p = store.createProject({ name: "Tags Legacy" });
			const stages = store.getStages(p.id);
			expect(stages.some((s) => "tags" in s)).toBe(false);
			store.updateStages(p.id, DEFAULT_STAGES.map((s) => ({ ...s })));
			expect(store.getStages(p.id).some((s) => "tags" in s)).toBe(false);
		});

		it("round-trips stage.tags through updateStages + _saveProjectFile + reload", () => {
			const p = store.createProject({ name: "Tags Roundtrip" });
			const stages = store
				.getStages(p.id)
				.map((s, i) =>
					i === 0
						? {
								...s,
								tags: ["PO", "frontend", "spec"],
							}
						: s,
				);
			store.updateStages(p.id, stages);

			// In-memory
			expect(store.getStages(p.id)[0].tags).toEqual(["PO", "frontend", "spec"]);

			// On disk
			const diskData = JSON.parse(
				fs.readFileSync(path.join(p.cwd, ".kainbain", "project.json"), "utf8"),
			);
			expect(diskData.stages[0].tags).toEqual(["PO", "frontend", "spec"]);

			// And reload from disk
			const reloaded = store._loadProjectFile(p.cwd);
			const reloadedStage = reloaded.workflows[0].stages[0];
			expect(reloadedStage.tags).toEqual(["PO", "frontend", "spec"]);
		});
	});

	it("persists useBranches (per-task branch support) as an opt-in project flag", () => {
		// Default OFF for backwards compatibility.
		const plain = store.createProject({ name: "Single Branch" });
		expect(plain.useBranches).toBe(false);

		// Opt-in via createProject.
		const branched = store.createProject({ name: "Branched", useBranches: true });
		expect(branched.useBranches).toBe(true);

		// Survives a scan/reload from disk.
		const reloaded = store.scanProjects();
		expect(reloaded.find((p) => p.name === "Branched").useBranches).toBe(true);
		expect(reloaded.find((p) => p.name === "Single Branch").useBranches).toBe(false);

		// Toggleable via updateProject (PATCH /projects/:id body passes through).
		const updated = store.updateProject(branched.id, { useBranches: false });
		expect(updated.useBranches).toBe(false);
		expect(store.scanProjects().find((p) => p.id === branched.id).useBranches).toBe(
			false,
		);
	});

	it("persists the review-diff preservation flags with current behaviour as default", () => {
		// Defaults: preservation off, reset-on-each-merge on — existing
		// projects behave exactly as today (empty diff after merge).
		const plain = store.createProject({ name: "Plain Review" });
		expect(plain.preserveReviewDiffAfterMerge).toBe(false);
		expect(plain.resetReviewBaselineOnMerge).toBe(true);

		// Opt-in via createProject.
		const preserved = store.createProject({
			name: "Preserved Review",
			preserveReviewDiffAfterMerge: true,
			resetReviewBaselineOnMerge: false,
		});
		expect(preserved.preserveReviewDiffAfterMerge).toBe(true);
		expect(preserved.resetReviewBaselineOnMerge).toBe(false);

		// Survives a scan/reload from disk.
		const reloaded = store.scanProjects();
		expect(
			reloaded.find((p) => p.name === "Preserved Review")
				.preserveReviewDiffAfterMerge,
		).toBe(true);
		expect(
			reloaded.find((p) => p.name === "Preserved Review")
				.resetReviewBaselineOnMerge,
		).toBe(false);
		expect(
			reloaded.find((p) => p.name === "Plain Review")
				.preserveReviewDiffAfterMerge,
		).toBe(false);
		expect(
			reloaded.find((p) => p.name === "Plain Review")
				.resetReviewBaselineOnMerge,
		).toBe(true);

		// Toggleable via updateProject (PATCH /projects/:id body passes through).
		const updated = store.updateProject(preserved.id, {
			preserveReviewDiffAfterMerge: false,
			resetReviewBaselineOnMerge: true,
		});
		expect(updated.preserveReviewDiffAfterMerge).toBe(false);
		expect(updated.resetReviewBaselineOnMerge).toBe(true);
		expect(
			store.scanProjects().find((p) => p.id === preserved.id)
				.preserveReviewDiffAfterMerge,
		).toBe(false);
		expect(
			store.scanProjects().find((p) => p.id === preserved.id)
				.resetReviewBaselineOnMerge,
		).toBe(true);
	});

	it("persists an explicit harness choice and round-trips it from disk", () => {
		const project = store.createProject({ name: "Harness Picked", harness: "pi" });
		expect(project.harness).toBe("pi");

		// Survives a scan/reload from disk (savedData.harness restored when present).
		const reloaded = store.scanProjects();
		expect(reloaded.find((p) => p.name === "Harness Picked").harness).toBe("pi");

		// Updateable via updateProject (PATCH /projects/:id body passes through).
		const changed = store.updateProject(project.id, { harness: "next-harness" });
		expect(changed.harness).toBe("next-harness");
		expect(store.scanProjects().find((p) => p.id === project.id).harness).toBe(
			"next-harness",
		);

		// And clearable back to "follow the configured default".
		const cleared = store.updateProject(project.id, { harness: "" });
		expect(cleared.harness).toBeUndefined();
		expect(
			store.scanProjects().find((p) => p.id === project.id).harness,
		).toBeUndefined();
	});

	it("leaves harness undefined (not a resolved default) when the project never chose one", () => {
		const plain = store.createProject({ name: "No Harness" });
		// Deliberately NOT defaulted to "pi": undefined means the resolution falls
		// through to config.defaultHarness at session time, so config changes
		// still apply to projects that never chose explicitly.
		expect(plain.harness).toBeUndefined();

		const reloaded = store.scanProjects().find((p) => p.name === "No Harness");
		expect(reloaded.harness).toBeUndefined();

		// The persisted file must not contain a resolved harness either.
		const saved = JSON.parse(
			fs.readFileSync(path.join(plain.cwd, ".kainbain", "project.json"), "utf8"),
		);
		expect(saved).not.toHaveProperty("harness");
	});

	it("persists explicit retry and timeout settings and round-trips them from disk", () => {
		const project = store.createProject({
			name: "Budgeted",
			maxAutoIterations: 3,
			maxTransientRetries: 2,
			autoIterationEnabled: false,
			agentTimeoutMs: 111111,
			ciTimeoutMs: 22222,
			deployTimeoutMs: 333333,
			mergeTimeoutMs: 444444,
		});
		expect(project.maxAutoIterations).toBe(3);
		expect(project.maxTransientRetries).toBe(2);
		expect(project.autoIterationEnabled).toBe(false);
		expect(project.agentTimeoutMs).toBe(111111);
		expect(project.ciTimeoutMs).toBe(22222);
		expect(project.deployTimeoutMs).toBe(333333);
		expect(project.mergeTimeoutMs).toBe(444444);

		// Survives a scan/reload from disk.
		const reloaded = store.scanProjects().find((p) => p.name === "Budgeted");
		expect(reloaded.maxAutoIterations).toBe(3);
		expect(reloaded.maxTransientRetries).toBe(2);
		expect(reloaded.autoIterationEnabled).toBe(false);
		expect(reloaded.agentTimeoutMs).toBe(111111);

		// Updateable via updateProject (PATCH /projects/:id body passes through).
		const changed = store.updateProject(project.id, {
			maxAutoIterations: 5,
			autoIterationEnabled: true,
			ciTimeoutMs: 99999,
		});
		expect(changed.maxAutoIterations).toBe(5);
		expect(changed.autoIterationEnabled).toBe(true);
		expect(changed.ciTimeoutMs).toBe(99999);
		const rescanned = store.scanProjects().find((p) => p.id === project.id);
		expect(rescanned.maxAutoIterations).toBe(5);
		expect(rescanned.autoIterationEnabled).toBe(true);

		// And clearable back to "follow the global default".
		const cleared = store.updateProject(project.id, {
			maxAutoIterations: null,
			maxTransientRetries: "",
			autoIterationEnabled: null,
			agentTimeoutMs: null,
		});
		expect(cleared.maxAutoIterations).toBeUndefined();
		expect(cleared.maxTransientRetries).toBeUndefined();
		expect(cleared.autoIterationEnabled).toBeUndefined();
		expect(cleared.agentTimeoutMs).toBeUndefined();
		const recleared = store.scanProjects().find((p) => p.id === project.id);
		expect(recleared.maxAutoIterations).toBeUndefined();
		expect(recleared.autoIterationEnabled).toBeUndefined();
	});

	it("leaves retry settings undefined (not resolved defaults) when the project never chose them", () => {
		const plain = store.createProject({ name: "No Budgets" });
		expect(plain.maxAutoIterations).toBeUndefined();
		expect(plain.maxTransientRetries).toBeUndefined();
		expect(plain.autoIterationEnabled).toBeUndefined();
		expect(plain.agentTimeoutMs).toBeUndefined();
		expect(plain.ciTimeoutMs).toBeUndefined();
		expect(plain.deployTimeoutMs).toBeUndefined();
		expect(plain.mergeTimeoutMs).toBeUndefined();

		const reloaded = store.scanProjects().find((p) => p.name === "No Budgets");
		expect(reloaded.maxAutoIterations).toBeUndefined();
		expect(reloaded.autoIterationEnabled).toBeUndefined();

		// The persisted file must not contain resolved retry settings either.
		const saved = JSON.parse(
			fs.readFileSync(path.join(plain.cwd, ".kainbain", "project.json"), "utf8"),
		);
		expect(saved).not.toHaveProperty("maxAutoIterations");
		expect(saved).not.toHaveProperty("maxTransientRetries");
		expect(saved).not.toHaveProperty("autoIterationEnabled");
		expect(saved).not.toHaveProperty("agentTimeoutMs");
	});

	it("normalizes invalid retry settings instead of persisting garbage", () => {
		const project = store.createProject({
			name: "Messy Budgets",
			maxAutoIterations: 2.9,
			maxTransientRetries: -4,
			autoIterationEnabled: "no",
			agentTimeoutMs: 0,
			ciTimeoutMs: -500,
			deployTimeoutMs: "soon",
		});
		// Fractional counts floor; negative counts clamp to 0 (disabled).
		expect(project.maxAutoIterations).toBe(2);
		expect(project.maxTransientRetries).toBe(0);
		// Non-boolean flags and non-positive timeouts fall through to the default.
		expect(project.autoIterationEnabled).toBeUndefined();
		expect(project.agentTimeoutMs).toBeUndefined();
		expect(project.ciTimeoutMs).toBeUndefined();
		expect(project.deployTimeoutMs).toBeUndefined();

		const updated = store.updateProject(project.id, {
			maxAutoIterations: "many",
			mergeTimeoutMs: 123.9,
		});
		expect(updated.maxAutoIterations).toBeUndefined();
		expect(updated.mergeTimeoutMs).toBe(123);
	});

	it("loads projects with hand-edited retry garbage without throwing", () => {
		const project = store.createProject({ name: "Hand Edited" });
		const configFile = path.join(project.cwd, ".kainbain", "project.json");
		const saved = JSON.parse(fs.readFileSync(configFile, "utf8"));
		saved.maxAutoIterations = "lots";
		saved.autoIterationEnabled = "yes please";
		saved.agentTimeoutMs = -100;
		saved.ciTimeoutMs = 60000;
		fs.writeFileSync(configFile, JSON.stringify(saved, null, 2));

		const reloaded = store.scanProjects().find((p) => p.name === "Hand Edited");
		expect(reloaded).toBeTruthy();
		expect(reloaded.maxAutoIterations).toBeUndefined();
		expect(reloaded.autoIterationEnabled).toBeUndefined();
		expect(reloaded.agentTimeoutMs).toBeUndefined();
		expect(reloaded.ciTimeoutMs).toBe(60000);
	});

	it("loads projects whose saved harness is unknown without throwing", () => {
		const project = store.createProject({ name: "Stale Harness" });
		const configFile = path.join(project.cwd, ".kainbain", "project.json");
		const saved = JSON.parse(fs.readFileSync(configFile, "utf8"));
		saved.harness = "long-gone-harness";
		fs.writeFileSync(configFile, JSON.stringify(saved, null, 2));

		const reloaded = store.scanProjects().find((p) => p.name === "Stale Harness");
		expect(reloaded).toBeTruthy();
		expect(reloaded.harness).toBe("long-gone-harness");
	});

	it("persists the custom harness command line and round-trips it from disk", () => {
		const project = store.createProject({
			name: "Custom Command",
			harness: "custom",
			harnessCommand: "claude -p",
		});
		expect(project.harnessCommand).toBe("claude -p");

		// Survives a scan/reload from disk.
		const reloaded = store.scanProjects();
		expect(reloaded.find((p) => p.name === "Custom Command").harnessCommand).toBe(
			"claude -p",
		);

		// Updateable via updateProject (PATCH /projects/:id body passes through).
		const changed = store.updateProject(project.id, {
			harnessCommand: "muse exec --yolo",
		});
		expect(changed.harnessCommand).toBe("muse exec --yolo");
		expect(
			store.scanProjects().find((p) => p.id === project.id).harnessCommand,
		).toBe("muse exec --yolo");

		// Whitespace-only values normalize to undefined (key dropped on disk).
		const cleared = store.updateProject(project.id, { harnessCommand: "   " });
		expect(cleared.harnessCommand).toBeUndefined();
		expect(
			store.scanProjects().find((p) => p.id === project.id).harnessCommand,
		).toBeUndefined();
	});

	it("leaves harnessCommand undefined when the project never set one", () => {
		const plain = store.createProject({ name: "No Custom Command" });
		expect(plain.harnessCommand).toBeUndefined();

		const reloaded = store
			.scanProjects()
			.find((p) => p.name === "No Custom Command");
		expect(reloaded.harnessCommand).toBeUndefined();

		// The persisted file must not contain an empty command either.
		const saved = JSON.parse(
			fs.readFileSync(path.join(plain.cwd, ".kainbain", "project.json"), "utf8"),
		);
		expect(saved).not.toHaveProperty("harnessCommand");
	});

	it("supports stage jumping and skipping", () => {
		const p = store.createProject({ name: "Nav Test" });
		store.jumpToStage(p.id, p.stages[2].id);
		expect(store.getProject(p.id).currentStageId).toBe(p.stages[2].id);

		store.skipStage(p.id);
		expect(store.getProject(p.id).currentStageId).toBe(p.stages[3].id);
	});

	it("deletes a project", () => {
		const p = store.createProject({ name: "To Delete" });
		expect(store.deleteProject(p.id)).toBe(true);
		expect(store.getProject(p.id)).toBeUndefined();
	});

	it("normalizes legacy stage types: review -> human, script -> ci, custom -> agent", () => {
		const project = store.createProject({
			name: "Legacy Pipeline",
			stages: [
				{ id: "s1", name: "Review Spec", type: "review" },
				{ id: "s2", name: "Run Build", type: "script" },
				{ id: "s3", name: "Custom Bot", type: "custom" },
				{ id: "s4", name: "Agent Task", type: "agent" },
				{ id: "s5", name: "Human Gate", type: "human" },
				{ id: "s6", name: "CI Verify", type: "ci" },
				{ id: "s7", name: "Deploy App", type: "deploy" },
			],
		});

		expect(project.stages[0].type).toBe("human");
		expect(project.stages[1].type).toBe("ci");
		expect(project.stages[2].type).toBe("agent");
		expect(project.stages[3].type).toBe("agent");
		expect(project.stages[4].type).toBe("human");
		expect(project.stages[5].type).toBe("ci");
		// Legacy `deploy` stages fold into `ci` (the deploy pipeline type was
		// removed — a deploy is a ci stage whose command runs deploy.sh).
		expect(project.stages[6].type).toBe("ci");
	});

	it("normalizes a legacy deploy stage into ordinary ci without stamping a deploy command", () => {
		// Legacy deploy type folds into ci with no special runtime. Stamping the
		// default deploy command onto a bare deploy stage is no longer done;
		// an explicit command is required if the stage should run deploy.sh.
		const bare = normalizeStage({ id: "s1", name: "Ship", type: "deploy" });
		expect(bare.type).toBe("ci");
		expect(bare.command).toBeUndefined();
		// A `script` alias (which also folds to `ci`) keeps the CI default and
		// gains no deploy command.
		const script = normalizeStage({ id: "s2", name: "Build", type: "script" });
		expect(script.type).toBe("ci");
		expect(script.command).toBeUndefined();
		// An explicit command on a deploy stage is kept verbatim (as an ordinary
		// CI command).
		const explicit = normalizeStage({
			id: "s3",
			name: "Ship",
			type: "deploy",
			command: "bash ./deploy.sh --prod --fast",
		});
		expect(explicit.command).toBe("bash ./deploy.sh --prod --fast");
		// A `script`-field-only deploy stage is preserved too.
		const scripted = normalizeStage({
			id: "s4",
			name: "Ship",
			type: "deploy",
			script: "./deploy.sh --rollback",
		});
		expect(scripted.command).toBeUndefined();
		expect(scripted.script).toBe("./deploy.sh --rollback");
	});

	it("recognizes the 'merge' stage type (new authoritative type)", () => {
		const project = store.createProject({
			name: "Merge Pipeline",
			stages: [
				{ id: "s1", name: "Ship Work", type: "merge" },
				{ id: "s2", name: "MERGE Case", type: "MERGE" },
				{ id: "s3", name: "Not A Merge", type: "mergey" },
			],
		});

		expect(project.stages[0].type).toBe("merge");
		expect(project.stages[1].type).toBe("merge");
		// Unknown types still fall back to agent.
		expect(project.stages[2].type).toBe("agent");
		// The merge type survives a save/load round-trip.
		const reloaded = store.scanProjects();
		const mergedProject = reloaded.find((p) => p.name === "Merge Pipeline");
		expect(mergedProject.stages[0].type).toBe("merge");
	});

	it("migrates composite merge-and-deploy stages into a git-only merge + a deploy ci stage", () => {
		const migrated = normalizeStages([
			{ id: "5", name: "In Progress", type: "agent" },
			{ id: "m-1", name: "Merge and deploy", type: "merge", command: "./deploy.sh --prod", failback: "5" },
			{ id: "fr", name: "Final review", type: "human", failback: "m-1" },
		]);

		expect(migrated).toHaveLength(4);
		// The merge stage is git-only: command stripped, name no longer
		// advertises a deploy, every other field (failback refs) intact.
		expect(migrated[1]).toEqual({ id: "m-1", name: "Merge", type: "merge", failback: "5" });
		// The deploy command moved verbatim into a dedicated ci stage directly
		// after the merge stage.
		expect(migrated[2]).toEqual({
			id: "m-1-deploy",
			name: "Deploy",
			type: "ci",
			command: "./deploy.sh --prod",
			paused: false,
			failback: "previous",
		});
		// Same-order guarantee: later stages keep their position and ids, so
		// failback references and currentStageId still resolve.
		expect(migrated[3]).toEqual({ id: "fr", name: "Final review", type: "human", failback: "m-1" });

		// Idempotent: re-normalizing the migrated list changes nothing.
		expect(normalizeStages(migrated)).toEqual(migrated);
	});

	it("drops a non-deploy post-merge command from a merge stage without inserting a stage", () => {
		const migrated = migrateMergeDeployStages([
			{ id: "m-1", name: "Merge", type: "merge", command: "echo unrelated" },
		]);
		expect(migrated).toHaveLength(1);
		expect(migrated[0]).toEqual({ id: "m-1", name: "Merge", type: "merge" });
		// Idempotent on re-run.
		expect(migrateMergeDeployStages(migrated)).toEqual(migrated);
	});

	it("migrates the composite stage inside every workflow copy, not just the root stages", () => {
		const legacyDir = path.join(tempProjectsDir, "legacy-composite-project");
		fs.mkdirSync(path.join(legacyDir, ".kainbain"), { recursive: true });
		fs.writeFileSync(
			path.join(legacyDir, ".kainbain", "project.json"),
			JSON.stringify({
				id: "legacy-composite-1",
				name: "Legacy Composite App",
				slug: "legacy-composite-app",
				stages: [
					{ id: "5", name: "In Progress", type: "agent" },
					{
						id: "stage-m",
						name: "Merge and deploy",
						type: "merge",
						command: "./deploy.sh --prod",
						failback: "5",
					},
				],
				workflows: [
					{
						id: "wf-default",
						name: "Feature Pipeline",
						isDefault: true,
						stages: [
							{ id: "5", name: "In Progress", type: "agent" },
							{
								id: "stage-m",
								name: "Merge and deploy",
								type: "merge",
								command: "./deploy.sh --prod",
								failback: "5",
							},
						],
					},
				],
			}),
		);

		const loaded = store._loadProjectFile(legacyDir);
		// The root stages list migrated...
		expect(loaded.stages.map((s) => s.id)).toEqual(["5", "stage-m", "stage-m-deploy"]);
		// ...AND the workflow copy (workflows embed full stage objects).
		const wfStages = loaded.workflows[0].stages;
		expect(wfStages.map((s) => s.id)).toEqual(["5", "stage-m", "stage-m-deploy"]);
		const [mergeStage, deployStage] = wfStages.slice(1);
		expect(mergeStage).toEqual({ id: "stage-m", name: "Merge", type: "merge", failback: "5" });
		expect(deployStage).toEqual({
			id: "stage-m-deploy",
			name: "Deploy",
			type: "ci",
			command: "./deploy.sh --prod",
			paused: false,
			failback: "previous",
		});
	});

	it("transparently migrates legacy stage types when loading from disk", () => {
		const legacyDir = path.join(tempProjectsDir, "legacy-disk-project");
		fs.mkdirSync(path.join(legacyDir, ".kainbain"), { recursive: true });
		fs.writeFileSync(
			path.join(legacyDir, ".kainbain", "project.json"),
			JSON.stringify({
				id: "legacy-proj-123",
				name: "Legacy Disk App",
				slug: "legacy-disk-app",
				stages: [
					{ id: "1", name: "Legacy Review", type: "review" },
					{ id: "2", name: "Legacy Script", type: "script" },
					{ id: "3", name: "Legacy Custom", type: "custom" },
				],
			}),
		);

		const loaded = store._loadProjectFile(legacyDir);
		expect(loaded.stages[0].type).toBe("human");
		expect(loaded.stages[1].type).toBe("ci");
		expect(loaded.stages[2].type).toBe("agent");

		const scanned = store.scanProjects();
		const legacyProj = scanned.find((p) => p.id === "legacy-proj-123");
		expect(legacyProj).toBeDefined();
		expect(legacyProj.stages[0].type).toBe("human");
		expect(legacyProj.stages[1].type).toBe("ci");
		expect(legacyProj.stages[2].type).toBe("agent");
	});

	it("supports multiple named workflows per project (create, switch, update, delete)", () => {
		const project = store.createProject({ name: "Multi Pipeline Project" });
		expect(project.workflows).toBeDefined();
		expect(project.workflows.length).toBe(1);
		expect(project.workflows[0].isDefault).toBe(true);
		expect(project.activeWorkflowId).toBe(project.workflows[0].id);

		// 1. Create a secondary workflow
		const hotfixWf = store.createWorkflow(project.id, {
			name: "Hotfix Pipeline",
			stages: [
				{ id: "hf-1", name: "Patch", type: "agent", prompt: "Fix issue" },
				{ id: "hf-2", name: "Verify", type: "ci", command: "npm test" },
			],
		});
		expect(hotfixWf.id).toContain("wf-hotfix-pipeline");
		expect(hotfixWf.stages.length).toBe(2);

		const allWorkflows = store.getWorkflows(project.id);
		expect(allWorkflows.length).toBe(2);

		// 2. Switch active workflow
		const switchResult = store.switchWorkflow(project.id, hotfixWf.id);
		expect(switchResult.activeWorkflowId).toBe(hotfixWf.id);
		expect(store.getProject(project.id).activeWorkflowId).toBe(hotfixWf.id);
		expect(store.getProject(project.id).stages.length).toBe(2);
		expect(store.getProject(project.id).stages[0].name).toBe("Patch");

		// 3. Update workflow details
		const updated = store.updateWorkflow(project.id, hotfixWf.id, {
			name: "Critical Hotfix Pipeline",
			stages: [
				{ id: "hf-1", name: "Fast Patch", type: "agent" },
				{ id: "hf-2", name: "Verify", type: "ci" },
				{ id: "hf-3", name: "Signoff", type: "human" },
			],
		});
		expect(updated.name).toBe("Critical Hotfix Pipeline");
		expect(store.getProject(project.id).stages.length).toBe(3);

		// 4. Guard against deleting the only workflow
		const pSingle = store.createProject({ name: "Single WF" });
		expect(() =>
			store.deleteWorkflow(pSingle.id, pSingle.workflows[0].id),
		).toThrow("Cannot delete the only workflow");

		// 5. Delete workflow when multiple exist
		expect(store.deleteWorkflow(project.id, hotfixWf.id)).toBe(true);
		expect(store.getWorkflows(project.id).length).toBe(1);
		// Active workflow should have switched back to default
		expect(store.getProject(project.id).activeWorkflowId).toBe(
			allWorkflows[0].id,
		);
		expect(store.getProject(project.id).stages.length).toBe(
			DEFAULT_STAGES.length,
		);
	});

	it("migrates legacy projects with root stages into a default named workflow on load", () => {
		const legacyDir = path.join(tempProjectsDir, "legacy-no-workflows");
		fs.mkdirSync(path.join(legacyDir, ".kainbain"), { recursive: true });
		fs.writeFileSync(
			path.join(legacyDir, ".kainbain", "project.json"),
			JSON.stringify({
				id: "legacy-no-wf-1",
				name: "Legacy No WF App",
				slug: "legacy-no-wf-app",
				stages: [
					{ id: "1", name: "Stage 1", type: "agent" },
					{ id: "2", name: "Stage 2", type: "human" },
				],
			}),
		);

		const loaded = store._loadProjectFile(legacyDir);
		expect(loaded.workflows).toBeDefined();
		expect(loaded.workflows.length).toBe(1);
		expect(loaded.workflows[0].name).toBe("Feature Pipeline");
		expect(loaded.workflows[0].isDefault).toBe(true);
		expect(loaded.workflows[0].stages.length).toBe(2);
		expect(loaded.activeWorkflowId).toBe(loaded.workflows[0].id);
	});

	it("detects upstream git repo when remote origin is configured (#32)", () => {
		const project = store.createProject({
			name: "Remote Detection App",
			hasUpstreamRepo: true,
			repoUrl: "https://git.example.com/team/remote-detection-app.git",
		});

		expect(project.hasUpstreamRepo).toBe(true);
		expect(project.repoUrl).toBe(
			"https://git.example.com/team/remote-detection-app.git",
		);

		const projectWithoutRemote = store.createProject({
			name: "No Remote App",
			hasUpstreamRepo: false,
		});
		expect(projectWithoutRemote.hasUpstreamRepo).toBe(false);
	});

	describe("resolveDefaultGitRemote", () => {
		const OLD_TEMPLATE = process.env.KAINBAIN_GIT_REMOTE_TEMPLATE;

		beforeEach(() => {
			delete process.env.KAINBAIN_GIT_REMOTE_TEMPLATE;
		});

		afterEach(() => {
			if (OLD_TEMPLATE === undefined)
				delete process.env.KAINBAIN_GIT_REMOTE_TEMPLATE;
			else process.env.KAINBAIN_GIT_REMOTE_TEMPLATE = OLD_TEMPLATE;
		});

		it("returns null when the template is unset or blank (no remote)", () => {
			expect(resolveDefaultGitRemote("my-app")).toBeNull();
			process.env.KAINBAIN_GIT_REMOTE_TEMPLATE = "   ";
			expect(resolveDefaultGitRemote("my-app")).toBeNull();
		});

		it("expands ${SLUG} and ${NAME} placeholders", () => {
			process.env.KAINBAIN_GIT_REMOTE_TEMPLATE =
				"https://git.example.com/team/${SLUG}.git";
			expect(
				resolveDefaultGitRemote("my-app", { name: "My App" }),
			).toBe("https://git.example.com/team/my-app.git");
			process.env.KAINBAIN_GIT_REMOTE_TEMPLATE =
				"https://git.example.com/${NAME}/${SLUG}.git";
			expect(
				resolveDefaultGitRemote("my-app", { name: "My App" }),
			).toBe("https://git.example.com/My App/my-app.git");
		});

		it("expands ${USER} from the environment", () => {
			process.env.KAINBAIN_GIT_REMOTE_TEMPLATE =
				"https://git.example.com/${USER}/${SLUG}.git";
			const user = (process.env.USER || process.env.USERNAME || "").trim();
			expect(resolveDefaultGitRemote("my-app")).toBe(
				`https://git.example.com/${user}/my-app.git`,
			);
		});
	});

	describe("template-driven git remote", () => {
		const OLD_TEMPLATE = process.env.KAINBAIN_GIT_REMOTE_TEMPLATE;

		beforeEach(() => {
			delete process.env.KAINBAIN_GIT_REMOTE_TEMPLATE;
		});

		afterEach(() => {
			if (OLD_TEMPLATE === undefined)
				delete process.env.KAINBAIN_GIT_REMOTE_TEMPLATE;
			else process.env.KAINBAIN_GIT_REMOTE_TEMPLATE = OLD_TEMPLATE;
		});

		it("sets origin to the expanded template URL on createProject", () => {
			process.env.KAINBAIN_GIT_REMOTE_TEMPLATE =
				"https://git.example.com/${USER}/${SLUG}.git";
			const project = store.createProject({ name: "Templated App" });
			const user = (process.env.USER || process.env.USERNAME || "").trim();
			const expected = `https://git.example.com/${user}/templated-app.git`;
			expect(project.gitUrl).toBe(expected);
			expect(project.gitRepo).toBe(expected);
			const origin = execFileSync(
				"git",
				["config", "--get", "remote.origin.url"],
				{ cwd: project.cwd, encoding: "utf8" },
			).trim();
			expect(origin).toBe(expected);
		});

		it("prefers an explicit gitUrl over the template", () => {
			process.env.KAINBAIN_GIT_REMOTE_TEMPLATE =
				"https://git.example.com/team/${SLUG}.git";
			const project = store.createProject({
				name: "Explicit Remote App",
				gitUrl: "https://other.example.com/explicit.git",
			});
			expect(project.gitUrl).toBe("https://other.example.com/explicit.git");
		});

		it("resolves a blank gitUrl update to null (in-memory and on disk)", () => {
			const project = store.createProject({
				name: "Blank Remote App",
				gitUrl: "https://other.example.com/explicit.git",
			});
			expect(project.gitUrl).toBe("https://other.example.com/explicit.git");
			const updated = store.updateProject(project.id, {
				gitUrl: "",
				gitRepo: "",
			});
			expect(updated.gitUrl).toBeNull();
			expect(updated.gitRepo).toBeNull();
			const saved = JSON.parse(
				fs.readFileSync(
					path.join(project.cwd, ".kainbain", "project.json"),
					"utf8",
				),
			);
			expect(saved.gitUrl).toBeNull();
		});
	});

	describe("credential redaction (audit K-1)", () => {
		const TOKEN = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

		it("redacts tokens from the git-derived repoUrl but keeps git working", () => {
			const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-redact-"));
			try {
				execFileSync("git", ["init"], { cwd: dir, stdio: "ignore" });
				execFileSync(
					"git",
					[
						"remote",
						"add",
						"origin",
						`https://${TOKEN}@git.example.com/team/r.git`,
					],
					{ cwd: dir, stdio: "ignore" },
				);
				const detection = detectGitRemote(dir);
				expect(detection.hasUpstreamRepo).toBe(true);
				expect(detection.repoUrl).toBe(
					"https://git.example.com/team/r.git",
				);
				expect(detection.repoUrl).not.toContain(TOKEN);
				// The live remote still carries the token so git auth keeps working.
				const live = execFileSync(
					"git",
					["config", "--get", "remote.origin.url"],
					{ cwd: dir, encoding: "utf8" },
				).trim();
				expect(live).toContain(TOKEN);
			} finally {
				fs.rmSync(dir, { recursive: true, force: true });
			}
		});

		it("never persists a token-bearing URL to project.json", () => {
			const project = store.createProject({
				name: "Token Remote App",
				gitUrl: `https://${TOKEN}@git.example.com/team/r.git`,
			});
			expect(project.gitUrl).not.toContain(TOKEN);
			expect(project.repoUrl ?? "").not.toContain(TOKEN);
			const saved = fs.readFileSync(
				path.join(project.cwd, ".kainbain", "project.json"),
				"utf8",
			);
			expect(saved).not.toContain(TOKEN);
			expect(saved).toContain("https://git.example.com/team/r.git");
			// ...while the live origin keeps the token for git operations.
			const live = execFileSync(
				"git",
				["config", "--get", "remote.origin.url"],
				{ cwd: project.cwd, encoding: "utf8" },
			).trim();
			expect(live).toContain(TOKEN);
		});

		it("redacts token-bearing URLs on updateProject", () => {
			const project = store.createProject({ name: "Update Redact App" });
			const updated = store.updateProject(project.id, {
				gitUrl: `https://${TOKEN}@git.example.com/team/r.git`,
			});
			expect(updated.gitUrl).not.toContain(TOKEN);
			expect(updated.gitRepo).not.toContain(TOKEN);
			const saved = fs.readFileSync(
				path.join(project.cwd, ".kainbain", "project.json"),
				"utf8",
			);
			expect(saved).not.toContain(TOKEN);
		});
	});

	it("normalizes the per-stage harness override (trim, blank clears, unknown kept for session-time warning)", () => {
		expect(normalizeStage({ id: "1", harness: "  custom  " }).harness).toBe("custom");
		expect(normalizeStage({ id: "1", harness: "antigravity" }).harness).toBe("antigravity");
		expect(normalizeStage({ id: "1", harness: "" }).harness).toBeUndefined();
		expect(normalizeStage({ id: "1", harness: "   " }).harness).toBeUndefined();
		expect(normalizeStage({ id: "1", harness: 42 }).harness).toBeUndefined();
		// Absent stays absent (legacy stages round-trip byte-identically).
		expect("harness" in normalizeStage({ id: "1", type: "agent" })).toBe(false);
		// Unknown ids are NOT rejected here — resolution warns + degrades later.
		expect(normalizeStage({ id: "1", harness: "bogus" }).harness).toBe("bogus");
	});

	it("persists the custom harness command (model flags bake into the command)", () => {
		const project = store.createProject({
			name: "Custom Harness App",
			harness: "custom",
			harnessCommand: "claude -p",
		});
		expect(project.harness).toBe("custom");
		expect(project.harnessCommand).toBe("claude -p");

		const raw = JSON.parse(
			fs.readFileSync(
				path.join(project.cwd, ".kainbain", "project.json"),
				"utf8",
			),
		);
		expect(raw.harnessCommand).toBe("claude -p");

		// Without a flag override the command round-trips verbatim.
		store.updateProject(project.id, { harnessCommand: "claude --model sonnet -p" });
		expect(store.getProject(project.id).harnessCommand).toBe("claude --model sonnet -p");
	});
});


/***
 * MARK: normalizeStage CI run-on-branch fields
 * @description Pins the additive ci branch-mode data model: valid modes are
 *   preserved (trimmed, lower-cased), unknown values coerce to the safe
 *   'task' default, absent keys stay absent so legacy stages round-trip
 *   byte-identically, and the legacy executionBranch/customExecutionBranch
 *   spellings converge on the canonical names (never re-saved).
 ***/
describe("normalizeStage run-on-branch (ci stage data model)", () => {
	it("preserves valid runOnBranch modes and trims/lower-cases them", () => {
		expect(normalizeStage({ id: "1", name: "CI", type: "ci", runOnBranch: "primary" }).runOnBranch).toBe("primary");
		expect(normalizeStage({ id: "1", name: "CI", type: "ci", runOnBranch: "  CUSTOM " }).runOnBranch).toBe("custom");
		expect(normalizeStage({ id: "1", name: "CI", type: "ci", runOnBranch: "task" }).runOnBranch).toBe("task");
	});

	it("coerces unknown or non-string values to the safe 'task' default", () => {
		expect(normalizeStage({ id: "1", name: "CI", type: "ci", runOnBranch: "banana" }).runOnBranch).toBe("task");
		expect(normalizeStage({ id: "1", name: "CI", type: "ci", runOnBranch: 42 }).runOnBranch).toBe("task");
		expect(normalizeStage({ id: "1", name: "CI", type: "ci", runOnBranch: "" }).runOnBranch).toBe("task");
	});

	it("maps the legacy 'main' spelling to 'primary'", () => {
		expect(normalizeStage({ id: "1", name: "CI", type: "ci", runOnBranch: "main" }).runOnBranch).toBe("primary");
	});

	it("keeps absent fields absent (legacy stages round-trip byte-identically)", () => {
		const legacy = { id: "1", name: "CI", type: "ci", command: "npm test" };
		const normalized = normalizeStage({ ...legacy });
		expect("runOnBranch" in normalized).toBe(false);
		expect("customBranch" in normalized).toBe(false);
	});

	it("trims customBranch and clears a blank value", () => {
		expect(
			normalizeStage({ id: "1", name: "CI", type: "ci", runOnBranch: "custom", customBranch: "  release/next " }).customBranch,
		).toBe("release/next");
		expect(normalizeStage({ id: "1", name: "CI", type: "ci", customBranch: "   " }).customBranch).toBeUndefined();
	});

	it("migrates legacy executionBranch/customExecutionBranch spellings and drops the legacy keys", () => {
		const normalized = normalizeStage({
			id: "1",
			name: "CI",
			type: "ci",
			executionBranch: "main",
			customExecutionBranch: "release/next",
		});
		expect(normalized.runOnBranch).toBe("primary");
		expect(normalized.customBranch).toBe("release/next");
		expect("executionBranch" in normalized).toBe(false);
		expect("customExecutionBranch" in normalized).toBe(false);
	});

	it("round-trips runOnBranch/customBranch through updateStages + save + reload", () => {
		const projectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-test-projects-"));
		const notesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-test-notes-"));
		const store2 = new ProjectStore({
			projectsRoot,
			notesRoot,
			autoScan: false,
		});
		const project = store2.createProject({ name: "CI Branch Roundtrip" });
		const ciStage = {
			id: "ci-1",
			name: "Verify on main",
			type: "ci",
			command: "npm test",
			runOnBranch: "primary",
		};
		store2.updateStages(project.id, [ciStage]);

		const [saved] = store2.getStages(project.id);
		expect(saved.runOnBranch).toBe("primary");

		const projectFile = path.join(project.cwd, ".kainbain", "project.json");
		const onDisk = JSON.parse(fs.readFileSync(projectFile, "utf8"));
		const diskStage = onDisk.workflows[0].stages.find((s) => s.id === "ci-1");
		expect(diskStage.runOnBranch).toBe("primary");

		// And reload from disk (the migration path an old project.json takes).
		const reloaded = store2._loadProjectFile(project.cwd);
		const reloadedStage = reloaded.workflows[0].stages.find((s) => s.id === "ci-1");
		expect(reloadedStage.runOnBranch).toBe("primary");

		fs.rmSync(projectsRoot, { recursive: true, force: true });
		fs.rmSync(notesRoot, { recursive: true, force: true });
	});
});
