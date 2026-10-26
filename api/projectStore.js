import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { v4 as uuidv4 } from "uuid";
import { config } from "./config.js";
import {
	aliasTargetsSignature,
	applyAliasRename,
	normalizeModelAliases,
} from "../shared/modelAliases.js";
import {
	normalizeNetworkHost,
	resolveAppUrl,
	validateAppUrl,
} from "../shared/appUrl.js";
import { normalizeStageTags } from "../shared/stageTags.js";
 import { sanitizeAliasTargetModels } from "./aliasTargets.js";
import { redactCredentials } from "./git.js";
import { readRegistry, registerProjectPath } from "./projectRegistry.js";
import {
	assertValidDocsDirNameForWrite,
	isCentralizedDocsEnabled,
	normalizeDocsSettings,
	resolveDocsDirName,
} from "./docsPath.js";
import {
	assertValidKainbainDirNameForWrite,
	isValidKainbainDirName,
	normalizeKainbainDirSettings,
	resolveKainbainDir,
	resolveKainbainDirName,
	resolveProjectConfigPath,
} from "./kainbainDir.js";


// Moved pure helpers (WP-3). Public helpers are imported from the domain barrel
// `./project/index.js` and re-exported to preserve the public surface.
// Private/internal helpers stay unexported to prevent internal leakage.
import { warnLegacyNoneHarnessModel } from "./project/aliasRenames.js";
import { _isKainbainConfig, _findProjectConfigFile } from "./project/projectConfigDiscovery.js";
import * as project from "./project/index.js";

// Alias the project namespace for cleaner usage within the class
const {
	inferAliasRenames,
	DEPLOY_COMMAND_PATTERN,
	isDeployCommand,
	DEFAULT_DEPLOY_COMMAND,
	DEFAULT_STAGES,
	normalizeStageType,
	normalizeStageSkills,
	normalizeStage,
	migrateMergeDeployStages,
	normalizeStages,
	RETRY_SETTING_KEYS,
	normalizeRetryCount,
	normalizeTimeoutMs,
	normalizeRetryEnabled,
	normalizeProjectRetrySettings,
	APP_STATUS_VALUES,
	normalizeAppStatus,
	DEFAULT_WORKFLOW_ID,
	DEFAULT_WORKFLOW_NAME,
	createDefaultWorkflow,
	normalizeWorkflow,
	normalizeWorkflows,
	slugifyProjectName,
	resolveDefaultGitRemote,
	detectGitRemote,
} = project;

// Role: barrel + ProjectStore — re-exports moved pure helpers and defines
// the ProjectStore class (filesystem-backed project instances).
// Re-export all project utilities from the barrel index.
export * from "./project/index.js";
export { normalizeStageTags } from "../shared/stageTags.js";

export const DEFAULT_ACCENT_COLOR = config.defaultAccentColor;
export const DEFAULT_MODEL = config.defaultModel;
export const DEFAULT_AGENT_DIR = config.piAgentDir;


/***
 * MARK: ProjectStore
 * @description Manages filesystem-backed projects with support for multiple named workflows,
 * git repos, SilverBullet documentation symlinks, and persistence in `<projectRoot>/.kainbain/project.json`.
 ***/
const DEFAULT_PROJECTS_ROOT = config.projectsRoot;
const DEFAULT_NOTES_ROOT = config.notesSpaceRoot;

export class ProjectStore {
	/***
	 * MARK: constructor
	 * @description Initializes the ProjectStore with configured roots and auto-scans for projects.
	 * @example new ProjectStore({ projectsRoot: '/tmp/projects' })
	 * @param {Object} [opts]
	 * @param {string} [opts.projectsRoot] - Primary directory containing project folders.
	 * @param {Array<string>} [opts.projectsRoots] - Extra directories scanned the same way (defaults to config.projectsRoots).
	 * @param {string} [opts.notesRoot] - SilverBullet space directory for project documentation.
	 * @param {string} [opts.registryFile] - Adopted-projects registry path (defaults to config.projectsRegistryFile).
	 * @param {boolean} [opts.autoScan=true] - Whether to scan the roots on initialization.
	 ***/
	constructor({
		projectsRoot = DEFAULT_PROJECTS_ROOT,
		projectsRoots = null,
		notesRoot = DEFAULT_NOTES_ROOT,
		registryFile = null,
		autoScan = true,
	} = {}) {
		this.projectsRoot = path.resolve(projectsRoot);
		this.extraRoots = Array.isArray(projectsRoots)
			? projectsRoots
			: (config.projectsRoots || []);
		this.notesRoot = path.resolve(notesRoot);
		this.registryFile =
			typeof registryFile === "string" && registryFile.trim()
				? path.resolve(registryFile.trim())
				: null;
		this.projects = new Map();
		this.activeProjectId = null;

		if (autoScan) {
			this.scanProjects();
		}
	}

	/***
	 * MARK: _registryOverrides
	 * @description Registry-file overrides for this store: an explicitly
	 *   injected `registryFile` (tests) wins, otherwise the shared default
	 *   path applies.
	 * @example projectStore._registryOverrides() => { registryFile: '/tmp/r.json' }
	 * @returns {Object}
	 ***/
	_registryOverrides() {
		return this.registryFile ? { registryFile: this.registryFile } : {};
	}

	/***
	 * MARK: _scanRoots
	 * @description Every directory scanned for projects: the primary root,
	 *   the configured extra roots, and the registry roots — deduped,
	 *   in that priority order.
	 * @example projectStore._scanRoots() => ['~/projects']
	 * @returns {Array<string>}
	 ***/
	_scanRoots() {
		const seen = new Set();
		const roots = [];
		const configured = Array.isArray(config.projectsRoots)
			? config.projectsRoots
			: [];
		for (const raw of [
			this.projectsRoot,
			...this.extraRoots,
			...configured,
			...readRegistry(this._registryOverrides()).roots,
		]) {
			if (typeof raw !== "string" || !raw.trim()) continue;
			const resolved = path.resolve(raw.trim());
			if (seen.has(resolved)) continue;
			seen.add(resolved);
			roots.push(resolved);
		}
		return roots;
	}

	/***
	 * MARK: _isScanRoot
	 * @description Whether a directory is one of the scan roots (the primary
	 *   root, configured extra roots, or registry roots). A project's cwd
	 *   must never be a scan root itself.
	 * @example projectStore._isScanRoot('~/projects') => true
	 * @param {string} dirPath
	 * @returns {boolean}
	 ***/
	_isScanRoot(dirPath) {
		if (!dirPath || typeof dirPath !== "string") return false;
		try {
			const resolved = path.resolve(dirPath);
			return this._scanRoots().some((root) => resolved === root);
		} catch {
			return false;
		}
	}

	/***
	 * MARK: _atomicWriteFileSync
	 * @description Writes file content atomically via a temporary file and rename to prevent corrupted / truncated files.
	 * @param {string} filePath
	 * @param {string} content
	 * @returns {void}
	 ***/
	_atomicWriteFileSync(filePath, content) {
		const dir = path.dirname(filePath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
		fs.writeFileSync(tempPath, content, "utf8");
		fs.renameSync(tempPath, filePath);
	}

	/***
	 * MARK: _saveProjectFile
	 * @description Writes project metadata, multiple named workflows, and active stages to <projectRoot>/.kainbain/project.json.
	 * @example projectStore._saveProjectFile(project)
	 * @param {Object} project
	 * @returns {void}
	 ***/
	_saveProjectFile(project) {
		if (!project || !project.cwd) return;
		// Fail closed: a project pointed at a scan root itself must
		// never be persisted there — that write would land in
		// `<projectsRoot>/.kainbain/project.json`, invisible to the scanner
		// and shadowing the project's real file.
		if (this._isScanRoot(project.cwd)) {
			console.error(
				`[projectStore] refusing to save ${project.id || project.slug || "?"}: cwd is the projects root ('${project.cwd}')`,
			);
			return;
		}
		try {
			/* eslint-disable security/detect-non-literal-fs-filename */
			const kainbainDir = resolveKainbainDir(project.cwd, project);
			if (!fs.existsSync(kainbainDir)) {
				fs.mkdirSync(kainbainDir, { recursive: true });
			}
			const configFile = path.join(kainbainDir, "project.json");
			const resolvedGitUrl = redactCredentials(
				project.gitUrl ||
					project.gitRepo ||
					resolveDefaultGitRemote(project.slug, { name: project.name }),
			);
			const resolvedNotes = project.notesPath || project.notesDir;

			const normalizedWorkflows = normalizeWorkflows(
				project.workflows,
				project.stages,
			);
			const activeWorkflowId =
				project.activeWorkflowId ||
				normalizedWorkflows.find((w) => w.isDefault)?.id ||
				normalizedWorkflows[0]?.id ||
				DEFAULT_WORKFLOW_ID;

			const activeWorkflow =
				normalizedWorkflows.find((w) => w.id === activeWorkflowId) ||
				normalizedWorkflows[0];

			const gitDetection = detectGitRemote(project.cwd);
			const hasUpstreamRepo =
				typeof project.hasUpstreamRepo === "boolean"
					? project.hasUpstreamRepo
					: gitDetection.hasUpstreamRepo;
			const repoUrl = redactCredentials(
				project.repoUrl ||
					gitDetection.repoUrl ||
					(hasUpstreamRepo ? resolvedGitUrl : null),
			);

			// Write the resolved URLs back onto the live object so the in-memory
			// project (and API responses) always matches what is persisted:
			// blank inputs degrade to the template default (or null), never "".
			project.gitUrl = resolvedGitUrl;
			project.gitRepo = resolvedGitUrl;
			project.hasUpstreamRepo = hasUpstreamRepo;
			project.repoUrl = repoUrl;
			// Same write-back for the "Go to App" link: the live object keeps
			// the normalized record (undefined when there is no safe link).
			project.appStatus = normalizeAppStatus(project.appStatus);

			const data = {
				id: project.id,
				name: project.name,
				slug: project.slug,
				cwd: project.cwd,
				agentDir: project.agentDir,
				notesPath: resolvedNotes,
				notesDir: resolvedNotes,
				gitUrl: resolvedGitUrl,
				gitRepo: resolvedGitUrl,
				hasUpstreamRepo,
				repoUrl,
				// Per-task branch support (kb/<taskId> branches + merge stage).
				// Default off: existing projects must opt in explicitly.
				useBranches: project.useBranches === true,
				// Preserve the PR-review diff across merge + deploy passes so
				// the final human review still shows the merged change.
				// Default off: existing projects keep empty-after-merge.
				preserveReviewDiffAfterMerge:
					project.preserveReviewDiffAfterMerge === true,
				// Reset the preserved baseline on each successful merge, so
				// after fail-back → fix → re-merge the review shows only the
				// latest pass. Default on; turning it off keeps a cumulative
				// view instead.
				resetReviewBaselineOnMerge:
					project.resetReviewBaselineOnMerge !== false,
				workspaceIsolation:
					project.workspaceIsolation === "worktree"
						? "worktree"
						: project.workspaceIsolation === "off"
							? "off"
							: "quarantine",
				dirtyTreeRecovery:
					project.dirtyTreeRecovery === "off" ? "off" : "ladder",
				defaultModel: project.defaultModel || DEFAULT_MODEL,
				// Per-project retry/timeout overrides: normalized on write,
				// persisted only when explicitly set (undefined keys are
				// dropped by JSON, so override-free projects keep their
				// existing file shape).
				...normalizeProjectRetrySettings(project),
				// Docs link settings: persisted only when custom/opted-out
				// (undefined keys are dropped by JSON, so default and legacy
				// projects keep their existing file shape).
				...normalizeDocsSettings(project),
				// State folder setting: persisted only when custom
				// (undefined keys are dropped by JSON, so default and legacy
				// projects keep their existing file shape).
				...normalizeKainbainDirSettings(project),
				// Per-project model aliases (`[{ name, harness, model }]`, each
				// a harness + model binding referenced as harness "alias" +
				// model <name>): normalized on write, persisted only when
				// non-empty (undefined keys are dropped by JSON, so alias-free
				// projects keep their existing file shape).
				modelAliases: normalizeModelAliases(project.modelAliases).length
					? normalizeModelAliases(project.modelAliases)
					: undefined,
				// Per-project harness choice: persisted ONLY when the project chose
				// one explicitly, so config.defaultHarness changes still apply to
				// projects that never did (undefined keys are dropped by JSON).
				harness: project.harness || undefined,
				// Free-text command line for the "custom" harness (same
				// explicit-choice-only persistence rule as `harness`).
				harnessCommand: project.harnessCommand || undefined,
				accentColor: project.accentColor || DEFAULT_ACCENT_COLOR,
				activeWorkflowId,
				workflows: normalizedWorkflows,
				stages: normalizeStages(activeWorkflow?.stages || project.stages),
				// "Go to App" link: persisted only when set (undefined keys are
				// dropped by JSON, so link-free projects keep their file shape).
				appStatus: project.appStatus,
				currentStageId: project.currentStageId,
				createdAt: project.createdAt,
				updatedAt: new Date().toISOString(),
			};
			this._atomicWriteFileSync(configFile, JSON.stringify(data, null, 2));
			/* eslint-enable security/detect-non-literal-fs-filename */
		} catch (err) {
			// Non-blocking write error fallback (e.g. read-only fs) — but
			// never silent: a swallowed write looks exactly like "aliases
			// reset between browsers" (200 with nothing reaching disk).
			console.error(`[projectStore] failed to save ${project.cwd}:`, err);
		}
	}

	/***
	 * MARK: _loadProjectFile
	 * @description Loads project metadata from <projectRoot>/.kainbain/project.json and migrates legacy stages into workflows.
	 * @example projectStore._loadProjectFile('/path/to/project') => { id: '...', name: '...' }
	 * @param {string} projectDir
	 * @returns {Object|null}
	 ***/
	_loadProjectFile(projectDir) {
		try {
			/* eslint-disable security/detect-non-literal-fs-filename */
			const configFile = _findProjectConfigFile(projectDir);
			if (configFile && fs.existsSync(configFile)) {
				const content = fs.readFileSync(configFile, "utf8");
				const parsed = JSON.parse(content);
				// Self-describing folders: a config discovered under a
				// non-default folder name (e.g. an operator-moved `.kb`)
				// without a persisted setting adopts that name, so the next
				// save writes back to the same folder instead of splitting
				// state across two folders.
				if (parsed && parsed.kainbainDirName === undefined) {
					const discoveredName = path.basename(path.dirname(configFile));
					if (
						discoveredName !== ".kainbain" &&
						isValidKainbainDirName(discoveredName, parsed)
					) {
						parsed.kainbainDirName = discoveredName;
					}
				}
				if (parsed) {
					// Alias lists hand-edited into project.json normalize on
					// load (garbage degrades to fewer aliases, never a
					// broken project); absent stays absent. Targets pairing
					// a `none` harness with a model (saved before the API
					// refusal existed) blank the model with one warning —
					// old projects keep loading and the next save persists
					// the clean row.
					if (parsed.modelAliases !== undefined) {
						const clean = normalizeModelAliases(parsed.modelAliases);
						const { aliases, dropped } = sanitizeAliasTargetModels(clean);
						for (const drop of dropped) {
							warnLegacyNoneHarnessModel(projectDir, drop);
						}
						parsed.modelAliases = aliases.length ? aliases : undefined;
					}
					// Same for hand-edited retry/timeout overrides: garbage
					// degrades to "follow the default", never a broken project.
					Object.assign(parsed, normalizeProjectRetrySettings(parsed));
					// Same for hand-edited docs link settings: an invalid
					// folder name degrades to the `docs` default and a
					// non-false opt-out degrades to centralised docs, never a
					// broken project; absent stays absent (legacy files load
					// exactly as today).
					Object.assign(parsed, normalizeDocsSettings(parsed));
					// Same for a hand-edited state folder name: an invalid or
					// colliding name degrades to the `.kainbain` default,
					// never a broken project; absent stays absent (legacy
					// files load exactly as today).
					Object.assign(parsed, normalizeKainbainDirSettings(parsed));
					// Same for a hand-edited "Go to App" link: garbage degrades
					// to no link, never a broken project.
					if (parsed.appStatus !== undefined) {
						parsed.appStatus = normalizeAppStatus(parsed.appStatus);
					}
					if (parsed.gitRepo && !parsed.gitUrl) {
						parsed.gitUrl = parsed.gitRepo;
					}
					if (parsed.notesDir && !parsed.notesPath) {
						parsed.notesPath = parsed.notesDir;
					}
					parsed.workflows = normalizeWorkflows(parsed.workflows, parsed.stages);
					const activeId =
						parsed.activeWorkflowId &&
						parsed.workflows.some((w) => w.id === parsed.activeWorkflowId)
							? parsed.activeWorkflowId
							: parsed.workflows.find((w) => w.isDefault)?.id ||
								parsed.workflows[0]?.id ||
								DEFAULT_WORKFLOW_ID;

					parsed.activeWorkflowId = activeId;
					const activeWf =
						parsed.workflows.find((w) => w.id === activeId) || parsed.workflows[0];
					parsed.stages = normalizeStages(activeWf?.stages || parsed.stages);
				}
				return parsed;
			}
			/* eslint-enable security/detect-non-literal-fs-filename */
		} catch (err) {
			return null;
		}
		return null;
	}

	/***
	 * MARK: scanProjects
	 * @description Scans every configured root (primary, extras, registry
	 *   roots) one level deep plus explicitly registered project directories,
	 *   and discovers all project folders carrying a config file. Directories
	 *   without a config file are ignored — never auto-created. Results
	 *   dedupe by resolved cwd.
	 * @example projectStore.scanProjects() => [{ id: '...', name: 'kainbain' }]
	 * @returns {Array<Object>}
	 ***/
	scanProjects() {
		/* eslint-disable security/detect-non-literal-fs-filename */
		// Dedupes directories adopted during THIS scan only: a rescan
		// always re-reads the config file so hand edits (or another
		// process) refresh the in-memory record, reusing the existing id.
		const seenCwds = new Set();
		const adopt = (projectDir, fallbackName) => {
			let resolved = null;
			try {
				resolved = path.resolve(projectDir);
			} catch {
				return;
			}
			if (!resolved || seenCwds.has(resolved)) return;
			seenCwds.add(resolved);
			const savedData = this._loadProjectFile(resolved);
			// A directory only becomes a project when it carries a config
			// file (or is created/registered explicitly): stray directories
			// never pollute the board.
			if (!savedData) return;
			const project = this._buildScannedProject(
				resolved,
				savedData,
				fallbackName,
			);
			if (!project) return;
			// Dedupe by the project's own cwd too: a config may name a
			// different directory than the one it was found in (a moved
			// checkout), and two roots must never yield two records for it.
			const projectCwd = path.resolve(project.cwd || resolved);
			if (projectCwd !== resolved) {
				if (seenCwds.has(projectCwd)) return;
				seenCwds.add(projectCwd);
			}
			this.projects.set(project.id, project);
		};

		for (const root of this._scanRoots()) {
			if (!fs.existsSync(root)) continue;
			try {
				const entries = fs.readdirSync(root, { withFileTypes: true });
				for (const entry of entries) {
					if (
						!entry.isDirectory() ||
						entry.name.startsWith(".") ||
						entry.name === "node_modules"
					) {
						continue;
					}
					adopt(path.join(root, entry.name), entry.name);
				}
			} catch {
				// Directory read error fallback: other roots still scan.
			}
		}

		// Explicitly adopted projects living outside every root.
		for (const registered of readRegistry(this._registryOverrides()).projects) {
			let stat = null;
			try {
				stat = fs.statSync(registered);
			} catch {
				stat = null;
			}
			if (!stat || !stat.isDirectory()) continue;
			adopt(registered, path.basename(registered));
		}
		/* eslint-enable security/detect-non-literal-fs-filename */

		if (!this.activeProjectId && this.projects.size > 0) {
			this.activeProjectId = Array.from(this.projects.keys())[0];
		}

		return Array.from(this.projects.values());
	}

	/***
	 * MARK: _buildScannedProject
	 * @description Builds the in-memory project record for one scanned
	 *   directory from its saved config file. Returns null when the
	 *   directory carries no config (the caller skips it — never
	 *   auto-created).
	 * @example projectStore._buildScannedProject('/repo', savedData, 'repo')
	 * @param {string} projectDir - Resolved project directory.
	 * @param {Object} savedData - Parsed config file content.
	 * @param {string} fallbackName - Directory basename for name/slug fallback.
	 * @returns {Object|null} The project record, or null when `savedData` is absent.
	 ***/
	_buildScannedProject(projectDir, savedData, fallbackName) {
		const existingProject = Array.from(this.projects.values()).find(
			(p) => path.resolve(String(p.cwd || "")) === path.resolve(projectDir),
		);
		if (!savedData) return null;
		const id = savedData.id || existingProject?.id || uuidv4();
		const slug = savedData.slug || slugifyProjectName(fallbackName);
		const resolvedGitUrl = redactCredentials(
			savedData.gitUrl ||
				savedData.gitRepo ||
				resolveDefaultGitRemote(slug, { name: savedData.name }),
		);
		const resolvedNotes =
			savedData.notesPath ||
			savedData.notesDir ||
			path.join(this.notesRoot, fallbackName);

		const workflows = normalizeWorkflows(
			savedData.workflows,
			savedData.stages,
		);
		const activeWorkflowId =
			savedData.activeWorkflowId &&
			workflows.some((w) => w.id === savedData.activeWorkflowId)
				? savedData.activeWorkflowId
				: workflows.find((w) => w.isDefault)?.id ||
					workflows[0]?.id ||
					DEFAULT_WORKFLOW_ID;

		const activeWf =
			workflows.find((w) => w.id === activeWorkflowId) || workflows[0];

		const gitDetection = detectGitRemote(savedData.cwd || projectDir);
		const hasUpstreamRepo =
			typeof savedData.hasUpstreamRepo === "boolean"
				? savedData.hasUpstreamRepo
				: gitDetection.hasUpstreamRepo;
		const repoUrl = redactCredentials(
			savedData.repoUrl ||
				gitDetection.repoUrl ||
				(hasUpstreamRepo ? resolvedGitUrl : null),
		);

		// Docs link + state folder settings: restored from disk on
		// every scan so a backend restart never drops them from
		// the in-memory record (absent stays absent — legacy
		// files load exactly as today).
		const restoredLinkSettings = {};
		for (const [key, value] of Object.entries({
			...normalizeDocsSettings(savedData),
			...normalizeKainbainDirSettings(savedData),
		})) {
			if (value !== undefined) restoredLinkSettings[key] = value;
		}
		const project = {
			id,
			name: savedData.name || fallbackName,
			slug,
			cwd: savedData.cwd || projectDir,
			...restoredLinkSettings,
			agentDir:
				savedData.agentDir && !savedData.agentDir.startsWith("/tmp/pi-agent-dir")
					? savedData.agentDir
					: process.env.NODE_ENV === "test"
						? `/tmp/pi-agent-dir-${id}`
						: DEFAULT_AGENT_DIR,
			notesPath: resolvedNotes,
			notesDir: resolvedNotes,
			gitUrl: resolvedGitUrl,
			gitRepo: resolvedGitUrl,
			hasUpstreamRepo,
			repoUrl,
			useBranches: savedData.useBranches === true,
			preserveReviewDiffAfterMerge:
				savedData.preserveReviewDiffAfterMerge === true,
			resetReviewBaselineOnMerge:
				savedData.resetReviewBaselineOnMerge !== false,
			workspaceIsolation:
				savedData.workspaceIsolation === "worktree"
					? "worktree"
					: savedData.workspaceIsolation === "off"
						? "off"
						: "quarantine",
			dirtyTreeRecovery:
				savedData.dirtyTreeRecovery === "off" ? "off" : "ladder",
			defaultModel: savedData.defaultModel || DEFAULT_MODEL,
			// Retry/timeout overrides restored only when saved —
			// no defaults injected on load (see RETRY_SETTING_KEYS).
			...normalizeProjectRetrySettings(savedData),
			// Per-project model aliases: restored from disk on every
			// scan so a backend restart never drops them from the
			// list/detail views (empty ⇒ undefined, same file shape
			// as a project that never had aliases).
			modelAliases: normalizeModelAliases(savedData.modelAliases).length
				? normalizeModelAliases(savedData.modelAliases)
				: undefined,
			// Harness is restored only when saved — no default is injected on
			// load so projects without an explicit choice keep following the
			// configured default (config.defaultHarness → "pi").
			harness: savedData.harness || undefined,
			// Same explicit-choice-only rule for the custom command line.
			harnessCommand: savedData.harnessCommand || undefined,
			// "Go to App" link: restored from disk on every scan so a
			// backend restart never drops it from the views.
			appStatus: normalizeAppStatus(savedData.appStatus),
			accentColor: savedData.accentColor || DEFAULT_ACCENT_COLOR,
			activeWorkflowId,
			workflows,
			stages: normalizeStages(activeWf?.stages || savedData.stages),
			currentStageId: savedData.currentStageId || null,
			createdAt: savedData.createdAt || new Date().toISOString(),
			updatedAt: savedData.updatedAt || new Date().toISOString(),
		};
		return project;
	}

	/***
	 * MARK: createProject
	 * @description Creates a new filesystem-backed project with Git repo, .gitignore, Forgejo remote, SilverBullet docs symlink, and workflows.
	 * @example projectStore.createProject({ name: 'My Project' })
	 * @param {Object} [opts]
	 * @param {string} opts.name - Display name of the project.
	 * @param {string} [opts.cwd] - Custom working directory (defaults to projectsRoot/<slug>).
	 * @param {string} [opts.agentDir] - Agent working directory for the project.
	 * @param {string} [opts.notesPath] - Custom SilverBullet notes space directory.
	 * @param {string} [opts.notesDir] - Alias for notesPath.
	 * @param {string} [opts.gitUrl] - Git remote repository URL (falls back to `KAINBAIN_GIT_REMOTE_TEMPLATE`, or no remote when unset).
	 * @param {string} [opts.gitRepo] - Alias for gitUrl.
	 * @param {boolean} [opts.useBranches] - Opt in to per-task branch support (kb/<taskId> branches). Default off.
 * @param {boolean} [opts.preserveReviewDiffAfterMerge] - Keep the PR-review diff visible after merge + deploy. Default off.
 * @param {boolean} [opts.resetReviewBaselineOnMerge] - Overwrite the preserved review baseline on each merge. Default on.
 * @param {string} [opts.workspaceIsolation] - Task workspace mode: 'quarantine' (default), 'worktree' (opt-in per-task git worktrees), or 'off'.
 * @param {string} [opts.dirtyTreeRecovery] - Dirty-tree recovery: 'ladder' (default, sweep, stash, report) or 'off'.
	 * @param {string} [opts.defaultModel] - Default AI model for the project.
	 * @param {number} [opts.maxAutoIterations] - Failback-and-retry budget for this project (0 disables); omit to follow the default.
	 * @param {number} [opts.maxTransientRetries] - Same-stage transient-retry budget (0 disables); omit to follow the default.
	 * @param {boolean} [opts.autoIterationEnabled] - False disables auto-iteration for this project; omit to follow the default.
	 * @param {number} [opts.agentTimeoutMs] - Agent/review stage wall-clock timeout in ms; omit to follow the default.
	 * @param {number} [opts.ciTimeoutMs] - CI/script stage wall-clock timeout in ms; omit to follow the default.
	 * @param {number} [opts.deployTimeoutMs] - Deprecated, ignored (a deploy command follows `ciTimeoutMs`); accepted so old configs load.
	 * @param {number} [opts.mergeTimeoutMs] - Merge stage wall-clock timeout in ms; omit to follow the default.
	 * @param {Array} [opts.modelAliases] - Per-project model aliases ([{ name, harness, model }]; normalized on write).
	 * @param {string} [opts.harness] - Agent harness id for the project (e.g. "pi"); omit to follow the configured default.
	 * @param {string} [opts.harnessCommand] - Free-text command line for the "custom" harness (e.g. `claude -p`); the curated prompt is appended as the final argument.
	 * @param {Object} [opts.appStatus] - Initial "Go to App" link ({ url, networkHost, status, healthEndpoint }); normalized on write.
	 * @param {string} [opts.accentColor] - Accent theme color hex for the project.
	 * @param {string} [opts.docsDirName] - Custom docs link-folder name (default "docs"); blank clears to the default.
	 * @param {boolean} [opts.centralizedDocs] - False opts out of centralised docs (plain local directory, no symlink). Default true.
	 * @param {string} [opts.kainbainDirName] - Custom state-folder name (default ".kainbain"); blank clears to the default.
	 * @param {Array}  [opts.stages] - Custom workflow stages (defaults to DEFAULT_STAGES).
	 * @param {Array}  [opts.workflows] - Custom workflows array.
	 * @param {string} [opts.activeWorkflowId] - ID of active workflow.
	 * @returns {Object} The created project.
	 ***/
	createProject({
		name,
		cwd,
		agentDir,
		notesPath,
		notesDir: notesDirOpt,
		docsDirName: docsDirNameOpt,
		centralizedDocs: centralizedDocsOpt,
		kainbainDirName: kainbainDirNameOpt,
		gitUrl,
		gitRepo: gitRepoOpt,
		defaultModel,
		maxAutoIterations,
		maxTransientRetries,
		autoIterationEnabled,
		agentTimeoutMs,
		ciTimeoutMs,
		deployTimeoutMs,
		mergeTimeoutMs,
		modelAliases,
		harness,
		harnessCommand,
		accentColor,
		stages,
		workflows,
		activeWorkflowId,
		hasUpstreamRepo: hasUpstreamRepoOpt,
		repoUrl: repoUrlOpt,
		useBranches: useBranchesOpt,
		preserveReviewDiffAfterMerge: preserveReviewDiffAfterMergeOpt,
		resetReviewBaselineOnMerge: resetReviewBaselineOnMergeOpt,
		workspaceIsolation: workspaceIsolationOpt,
		dirtyTreeRecovery: dirtyTreeRecoveryOpt,
		appStatus,
	} = {}) {
		if (!name || typeof name !== "string" || !name.trim()) {
			throw new Error("Project name is required");
		}

		const cleanName = name.trim();
		const slug = slugifyProjectName(cleanName);
		const id = uuidv4();

		const projectDir = cwd
			? path.resolve(cwd)
			: path.join(this.projectsRoot, slug);
		if (this._isScanRoot(projectDir)) {
			throw new Error(
				`Project working directory must be the project's own directory, not the projects root ('${projectDir}')`,
			);
		}
		const resolvedNotesInput = notesPath || notesDirOpt;
		const notesDir = resolvedNotesInput
			? path.resolve(resolvedNotesInput)
			: path.join(this.notesRoot, cleanName);

		// Docs linkage: strict on write (invalid names throw 400, project
		// unchanged); blank clears to the default. Opt-out persists as an
		// explicit `false`, everything else follows centralised docs.
		const docsDirName = assertValidDocsDirNameForWrite(docsDirNameOpt);
		const centralizedDocs = centralizedDocsOpt === false ? false : undefined;
		const docsLinkName = docsDirName || "docs";
		// State folder: strict on write (invalid names throw 400, project
		// unchanged); blank clears to the default. Validated against the
		// effective docs name so the two folders can never collide.
		const kainbainDirName = assertValidKainbainDirNameForWrite(
			kainbainDirNameOpt,
			{ docsDirName: docsLinkName },
		);
		if (
			docsLinkName.toLowerCase() ===
			resolveKainbainDirName({ kainbainDirName }).toLowerCase()
		) {
			const err = new Error(
				`docsDirName '${docsLinkName}' collides with the state folder '${resolveKainbainDirName({ kainbainDirName })}' — pick different names`,
			);
			err.statusCode = 400;
			err.code = "INVALID_DOCS_DIR_NAME";
			throw err;
		}
		const kainbainLinkName = kainbainDirName || ".kainbain";

		/* eslint-disable security/detect-non-literal-fs-filename */
		// 1. Create project directory
		if (!fs.existsSync(projectDir)) {
			fs.mkdirSync(projectDir, { recursive: true });
		}

		// 2. Create SilverBullet notes space directory (skipped when the
		// project opts out of centralised docs: the notes space is never
		// created or touched in that mode).
		if (centralizedDocs !== false && !fs.existsSync(notesDir)) {
			fs.mkdirSync(notesDir, { recursive: true });
		}

		// 3. Create symbolic link: <projectRoot>/<docsDirName> -> notes space
		// directory — or a plain local directory when opted out.
		const docsLink = path.join(projectDir, docsLinkName);
		try {
			let linkExists = false;
			try {
				const stat = fs.lstatSync(docsLink);
				linkExists = stat.isSymbolicLink() || stat.isDirectory();
			} catch (e) {
				linkExists = false;
			}

			if (!linkExists) {
				if (centralizedDocs === false) {
					fs.mkdirSync(docsLink, { recursive: true });
				} else {
					fs.symlinkSync(notesDir, docsLink, "dir");
				}
			}
		} catch (symlinkErr) {
			// Non-blocking symlink creation failure
		}

		// 4. Create the state directory (default `.kainbain`, custom when set)
		const kainbainDir = path.join(projectDir, kainbainLinkName);
		if (!fs.existsSync(kainbainDir)) {
			fs.mkdirSync(kainbainDir, { recursive: true });
		}

		// 5. Initialize Git repository
		try {
			const gitDir = path.join(projectDir, ".git");
			if (!fs.existsSync(gitDir)) {
				execFileSync("git", ["init"], { cwd: projectDir, stdio: "ignore" });
			}
		} catch (gitErr) {
			// Non-blocking git init failure (e.g. git binary not available)
		}

		// 6. Create standard .gitignore
		try {
			const gitignorePath = path.join(projectDir, ".gitignore");
			if (!fs.existsSync(gitignorePath)) {
				const gitignoreContent = [
					`${kainbainLinkName}/sessions`,
					"node_modules",
					".env",
					"*.log",
					"",
				].join("\n");
				fs.writeFileSync(gitignorePath, gitignoreContent, "utf8");
			}
		} catch (ignoreErr) {
			// Non-blocking gitignore creation failure
		}

		// 7. Configure Git remote (explicit URL or template; none when unconfigured)
		const configuredRemote =
			gitUrl ||
			gitRepoOpt ||
			resolveDefaultGitRemote(slug, { name: cleanName });
		if (configuredRemote) {
			try {
				execFileSync("git", ["remote", "add", "origin", configuredRemote], {
					cwd: projectDir,
					stdio: "ignore",
				});
			} catch (remoteErr) {
				// Non-blocking git remote add failure (e.g. origin already exists or offline)
			}
		}
		/* eslint-enable security/detect-non-literal-fs-filename */
		// The persisted/returned URL is credential-redacted; git keeps using
		// the live remote from .git/config (see detectGitRemote).
		const resolvedGitUrl = configuredRemote
			? redactCredentials(configuredRemote)
			: null;

		const normalizedWorkflows = normalizeWorkflows(workflows, stages);
		const resolvedActiveWorkflowId =
			activeWorkflowId &&
			normalizedWorkflows.some((w) => w.id === activeWorkflowId)
				? activeWorkflowId
				: normalizedWorkflows.find((w) => w.isDefault)?.id ||
					normalizedWorkflows[0]?.id ||
					DEFAULT_WORKFLOW_ID;

		const activeWorkflow =
			normalizedWorkflows.find((w) => w.id === resolvedActiveWorkflowId) ||
			normalizedWorkflows[0];

		const gitDetection = detectGitRemote(projectDir);
		const hasUpstreamRepo =
			typeof hasUpstreamRepoOpt === "boolean"
				? hasUpstreamRepoOpt
				: gitDetection.hasUpstreamRepo;
		const repoUrl = redactCredentials(
			repoUrlOpt ||
				gitDetection.repoUrl ||
				(hasUpstreamRepo ? resolvedGitUrl : null),
		);

		const project = {
			id,
			name: cleanName,
			slug,
			cwd: projectDir,
			// State folder — persisted only when custom (undefined keys are
			// dropped by JSON, so default projects keep their existing file shape).
			...(kainbainDirName ? { kainbainDirName } : {}),
			agentDir:
				agentDir ||
				(process.env.NODE_ENV === "test"
					? `/tmp/pi-agent-dir-${id}`
					: DEFAULT_AGENT_DIR),
			notesPath: notesDir,
			notesDir,
			gitUrl: resolvedGitUrl,
			gitRepo: resolvedGitUrl,
			hasUpstreamRepo,
			repoUrl,
			// Docs link folder — persisted only when custom (undefined keys are
			// dropped by JSON, so default projects keep their existing file shape).
			...(docsDirName ? { docsDirName } : {}),
			// Centralised-docs opt-out — persisted only when opted out, so
			// legacy and default projects load unchanged (absent means enabled).
			...(centralizedDocs === false ? { centralizedDocs: false } : {}),
			// Per-task branch support — opt-in, default off (backwards compatible).
			useBranches: useBranchesOpt === true,
			workspaceIsolation:
				workspaceIsolationOpt === "worktree"
					? "worktree"
					: workspaceIsolationOpt === "off"
						? "off"
						: "quarantine",
			dirtyTreeRecovery:
				dirtyTreeRecoveryOpt === "off" ? "off" : "ladder",
			// Preserved review diff — opt-in, default off (backwards compatible).
			preserveReviewDiffAfterMerge: preserveReviewDiffAfterMergeOpt === true,
			// Baseline reset per merge — default on (backwards compatible).
			resetReviewBaselineOnMerge: resetReviewBaselineOnMergeOpt !== false,
			defaultModel: defaultModel || DEFAULT_MODEL,
			// Retry/timeout overrides (normalized; unset ⇒ undefined so
			// override-free projects keep their existing file shape).
			...normalizeProjectRetrySettings({
				maxAutoIterations,
				maxTransientRetries,
				autoIterationEnabled,
				agentTimeoutMs,
				ciTimeoutMs,
				deployTimeoutMs,
				mergeTimeoutMs,
			}),
			// Per-project model aliases (normalized; empty ⇒ undefined so
			// alias-free projects keep their existing file shape).
			modelAliases: normalizeModelAliases(modelAliases).length
				? normalizeModelAliases(modelAliases)
				: undefined,
			// Explicit choice only (undefined ⇒ resolved at session time from
			// config.defaultHarness → "pi"; mirrors the defaultModel fallback shape
			// but deliberately NOT resolved to a persisted default).
			harness: harness || undefined,
			// Free-text command line for the "custom" harness; meaningful only
			// when the project selected it (persisted only when set).
			harnessCommand: harnessCommand || undefined,
			// "Go to App" link (normalized; garbage degrades to no link).
			appStatus: normalizeAppStatus(appStatus),
			accentColor: accentColor || DEFAULT_ACCENT_COLOR,
			activeWorkflowId: resolvedActiveWorkflowId,
			workflows: normalizedWorkflows,
			stages: normalizeStages(activeWorkflow?.stages || stages),
			currentStageId: null,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		this._saveProjectFile(project);
		this.projects.set(id, project);

		if (!this.activeProjectId) {
			this.activeProjectId = id;
		}

		return project;
	}

	/***
	 * MARK: registerProject
	 * @description Adopts an existing repository directory as a managed
	 *   project: validates the path, reuses the saved config when one
	 *   exists (custom state folder included), otherwise provisions one via
	 *   the normal create path. The directory is recorded in the registry
	 *   file when it lives outside every scan root, so a restart
	 *   re-discovers it. Idempotent: re-registering a known cwd returns
	 *   the existing project without touching disk.
	 * @example projectStore.registerProject({ path: '/repo' }) => { id: '...', name: 'repo' }
	 * @param {Object} [opts]
	 * @param {string} opts.path - Existing project directory to adopt.
	 * @param {string} [opts.name] - Display name (defaults to the directory basename).
	 * @param {string} [opts.kainbainDirName] - Custom state-folder name for provisioning.
	 * @returns {Object} The adopted project.
	 ***/
	registerProject({ path: dirPath, name, kainbainDirName } = {}) {
		const resolved =
			typeof dirPath === "string" && dirPath.trim()
				? path.resolve(dirPath.trim())
				: null;
		if (!resolved) {
			const err = new Error("Project path is required");
			err.statusCode = 400;
			err.code = "INVALID_PROJECT_PATH";
			throw err;
		}
		if (this._isScanRoot(resolved)) {
			const err = new Error(
				`Project path must be the project's own directory, not the projects root ('${resolved}')`,
			);
			err.statusCode = 400;
			err.code = "INVALID_PROJECT_PATH";
			throw err;
		}
		let stat = null;
		try {
			/* eslint-disable-next-line security/detect-non-literal-fs-filename */
			stat = fs.statSync(resolved);
		} catch {
			stat = null;
		}
		if (!stat || !stat.isDirectory()) {
			const err = new Error(
				`Project path '${dirPath}' does not exist or is not a directory`,
			);
			err.statusCode = 400;
			err.code = "INVALID_PROJECT_PATH";
			throw err;
		}
		const known = Array.from(this.projects.values()).find(
			(p) => path.resolve(String(p.cwd || "")) === resolved,
		);
		if (known) return known;
		const savedData = this._loadProjectFile(resolved);
		if (savedData) {
			const project = this._buildScannedProject(
				resolved,
				savedData,
				path.basename(resolved),
			);
			this.projects.set(project.id, project);
			if (!this.activeProjectId) this.activeProjectId = project.id;
			this._rememberRegisteredPath(resolved);
			return project;
		}
		const project = this.createProject({
			name:
				typeof name === "string" && name.trim()
					? name.trim()
					: path.basename(resolved),
			cwd: resolved,
			kainbainDirName,
		});
		this._rememberRegisteredPath(resolved);
		return project;
	}

	/***
	 * MARK: _rememberRegisteredPath
	 * @description Records an adopted directory in the registry file when it
	 *   lives outside every scan root (in-root projects are re-discovered
	 *   by the scan itself). Never throws: registry persistence must never
	 *   fail an adoption.
	 * @example projectStore._rememberRegisteredPath('/repo')
	 * @param {string} resolvedDir - Resolved project directory.
	 * @returns {void}
	 ***/
	_rememberRegisteredPath(resolvedDir) {
		try {
			const insideRoot = this._scanRoots().some(
				(root) =>
					resolvedDir === root || resolvedDir.startsWith(`${root}${path.sep}`),
			);
			if (!insideRoot) {
				registerProjectPath(resolvedDir, this._registryOverrides());
			}
		} catch {
			// Registry persistence is best-effort; the project is adopted.
		}
	}

	/***
	 * MARK: getProject
	 * @description Retrieves a project by its unique identifier.
	 * @example projectStore.getProject('proj-1') => { id: 'proj-1', name: 'Project A' }
	 * @param {string} id
	 * @returns {Object|undefined}
	 ***/
	getProject(id) {
		return this.projects.get(id);
	}

	/***
	 * MARK: listProjects
	 * @description Lists all projects currently managed in the store.
	 * @example projectStore.listProjects() => [{ id: 'proj-1', name: 'Project A' }]
	 * @returns {Array<Object>}
	 ***/
	listProjects() {
		return Array.from(this.projects.values());
	}

	/***
	 * MARK: ensureDocsLink
	 * @description Verifies the `<cwd>/docs` symlink that resolves a project's
	 *   task storage into its notes space, repairing it only when the repair
	 *   cannot lose data. Created after the 2026-10-02 incident in which the
	 *   tracked `docs` symlink was removed from git: the engine then recreated
	 *   `docs/` as a real directory holding a single task, so the UI silently
	 *   showed 1 of 134 tasks until an operator restored the link by hand.
	 *   Called once per project at startup (see `prepareProjects`) so a
	 *   missing or dangling link self-heals on the next boot instead of
	 *   degrading into a shadow directory.
	 *   Repair policy: a missing link is recreated and a broken (dangling)
	 *   link is repointed, because nothing readable exists beneath either. A
	 *   missing project notes directory is recreated when the notes space
	 *   root itself exists (same policy as provisioning; heals cleanups that
	 *   removed the paired note while the project stayed registered). A
	 *   real directory, a link into a different existing space, or an absent
	 *   notes space root is reported and left untouched — the shadow case in
	 *   particular may hold newer writes that need an operator merge first.
	 * @example projectStore.ensureDocsLink(project) => { state: 'ok', repaired: false, ... }
	 * @param {Object} project
	 * @returns {{state: string, repaired: boolean, docsLink: string|null, notesDir: string|null}}
	 *   `state` is one of 'ok', 'repaired', 'repaired-broken-link',
	 *   'broken-link', 'link-missing', 'shadowed', 'local-dir',
	 *   'foreign-link', 'notes-missing', 'no-cwd', 'opted-out', 'unexpected'.
	 *   A project with a custom `docsDirName` verifies its own link name;
	 *   a project with `centralizedDocs: false` reports 'opted-out' and
	 *   never creates, repairs, or otherwise touches the notes space.
	 ***/
	ensureDocsLink(project) {
		/* eslint-disable security/detect-non-literal-fs-filename */
		const cwd = project?.cwd;
		if (!cwd || typeof cwd !== "string") {
			return { state: "no-cwd", repaired: false, docsLink: null, notesDir: null };
		}
		const docsLink = path.join(cwd, resolveDocsDirName(project));
		const label = project?.name || project?.id || cwd;
		const untouched = (state, notesDir = null) => ({
			state,
			repaired: false,
			docsLink,
			notesDir,
		});

		// Opt-out: task storage is a plain local directory. Verification is
		// a no-op — no symlink is created or repaired and the notes space is
		// never created or touched.
		if (!isCentralizedDocsEnabled(project)) {
			const configuredNotes =
				typeof project?.notesPath === "string" && project.notesPath
					? project.notesPath
					: typeof project?.notesDir === "string" && project.notesDir
						? project.notesDir
						: null;
			return untouched("opted-out", configuredNotes);
		}

		// Resolve the notes space, tolerating the historical case mismatch
		// (`Personal/KainBain` vs `Personal/kainbain`, peer review F-7).
		let notesDir = project?.notesPath || project?.notesDir || null;
		if (typeof notesDir !== "string" || !notesDir) {
			return untouched("notes-missing");
		}
		if (!fs.existsSync(notesDir)) {
			let match = null;
			try {
				const wanted = path.basename(notesDir).toLowerCase();
				for (const entry of fs.readdirSync(path.dirname(notesDir))) {
					if (entry.toLowerCase() === wanted) {
						match = path.join(path.dirname(notesDir), entry);
						break;
					}
				}
			} catch {
				match = null;
			}
			if (match) {
				console.warn(
					`[projectStore] notes space for '${label}' differs in case ` +
						`(configured '${notesDir}', on disk '${match}') — using the on-disk path`,
				);
				notesDir = match;
			} else if (fs.existsSync(path.dirname(notesDir))) {
				// The notes space root exists but this project's directory
				// was removed from under it (e.g. a notes-store cleanup
				// deleted the paired note while the project stayed
				// registered): recreate the empty directory — the same
				// policy createProject applies at provisioning — and fall
				// through to link verification so a dangling `<cwd>/docs`
				// heals instead of stranding every later write behind a
				// 500 (task image uploads) or a silently dropped save.
				// Nothing readable exists to lose: the directory is absent.
				try {
					fs.mkdirSync(notesDir, { recursive: true });
					console.warn(
						`[projectStore] recreated missing notes directory for '${label}': ` +
							`'${notesDir}'`,
					);
				} catch (err) {
					console.error(
						`[projectStore] failed to recreate notes directory for '${label}':`,
						err?.message || err,
					);
					return untouched("notes-missing");
				}
			} else {
				// Fresh clones intentionally have no notes space (WP-2 owns the
				// local backend); staying silent here keeps first boot clean.
				// A missing space root is never created here — that decision
				// belongs to project provisioning, not link verification.
				return untouched("notes-missing");
			}
		}

		// Rename follow-through: the link folder moved away from the `docs`
		// default (setting change or hand-edited project.json). A stale
		// `docs` symlink still pointing at this project's own notes space is
		// removed so two entries never serve the same space; a real
		// directory is the operator's own folder and is never touched.
		if (resolveDocsDirName(project) !== "docs") {
			const staleDefault = path.join(cwd, "docs");
			try {
				const staleStat = fs.lstatSync(staleDefault);
				if (staleStat.isSymbolicLink()) {
					let staleTarget = null;
					try {
						staleTarget = path.resolve(
							path.dirname(staleDefault),
							fs.readlinkSync(staleDefault),
						);
					} catch {
						staleTarget = null;
					}
					let same = false;
					if (staleTarget) {
						try {
							same =
								fs.realpathSync(staleTarget) === fs.realpathSync(notesDir);
						} catch {
							same = false;
						}
					}
					if (same) {
						fs.unlinkSync(staleDefault);
						console.warn(
							`[projectStore] removed stale default docs symlink for '${label}' ` +
								`after rename to '${resolveDocsDirName(project)}'`,
						);
					}
				}
			} catch {
				// Absent or unreadable: nothing stale to clean.
			}
		}

		let linkStat = null;
		try {
			linkStat = fs.lstatSync(docsLink);
		} catch {
			linkStat = null;
		}

		// Missing link: safe to recreate — nothing exists to lose.
		if (!linkStat) {
			try {
				fs.symlinkSync(notesDir, docsLink, "dir");
				console.warn(
					`[projectStore] recreated missing docs symlink for '${label}': ` +
						`'${docsLink}' -> '${notesDir}'`,
				);
				return { state: "repaired", repaired: true, docsLink, notesDir };
			} catch (err) {
				console.error(
					`[projectStore] failed to recreate docs symlink for '${label}':`,
					err?.message || err,
				);
				return untouched("link-missing", notesDir);
			}
		}

		if (linkStat.isSymbolicLink()) {
			let targetAbs = null;
			try {
				targetAbs = path.resolve(
					path.dirname(docsLink),
					fs.readlinkSync(docsLink),
				);
			} catch {
				targetAbs = null;
			}
			if (targetAbs && fs.existsSync(targetAbs)) {
				let same = false;
				try {
					same = fs.realpathSync(targetAbs) === fs.realpathSync(notesDir);
				} catch {
					same = false;
				}
				if (same) {
					return { state: "ok", repaired: false, docsLink, notesDir };
				}
				console.warn(
					`[projectStore] docs symlink for '${label}' points at '${targetAbs}' ` +
						`instead of the configured notes space '${notesDir}' — leaving it untouched`,
				);
				return untouched("foreign-link", notesDir);
			}
			// Broken link: nothing is readable beneath it, so repointing is safe.
			try {
				fs.unlinkSync(docsLink);
				fs.symlinkSync(notesDir, docsLink, "dir");
				console.warn(
					`[projectStore] repointed dangling docs symlink for '${label}': ` +
						`'${docsLink}' -> '${notesDir}'`,
				);
				return {
					state: "repaired-broken-link",
					repaired: true,
					docsLink,
					notesDir,
				};
			} catch (err) {
				console.error(
					`[projectStore] failed to repoint dangling docs symlink for '${label}':`,
					err?.message || err,
				);
				return untouched("broken-link", notesDir);
			}
		}

		if (linkStat.isDirectory()) {
			// A real directory is either the future WP-2 local backend or a
			// shadow directory hiding a populated notes space (the 2026-10-02
			// failure mode). Only the latter is an error, and it needs an
			// operator merge — never an automatic delete.
			let notesHasTasks = false;
			try {
				notesHasTasks =
					fs.readdirSync(path.join(notesDir, "tasks"), {
						withFileTypes: true,
					}).length > 0;
			} catch {
				notesHasTasks = false;
			}
			if (notesHasTasks) {
				console.error(
					`[projectStore] '${docsLink}' is a real directory shadowing the notes space ` +
						`'${notesDir}' — task lists read the shadow copy, so most tasks are hidden. ` +
						`Merge any newer files from the shadow '${resolveDocsDirName(project)}/tasks/' into the notes space, ` +
						`then replace '${docsLink}' with a symlink to '${notesDir}'.`,
				);
				return untouched("shadowed", notesDir);
			}
			return { state: "local-dir", repaired: false, docsLink, notesDir };
		}

		console.warn(
			`[projectStore] '${docsLink}' is neither a symlink nor a directory — leaving it untouched`,
		);
		return untouched("unexpected", notesDir);
		/* eslint-enable security/detect-non-literal-fs-filename */
	}

	/***
	 * MARK: updateProject
	 * @description Updates the properties of an existing project and persists changes.
	 * @example projectStore.updateProject('proj-1', { name: 'Renamed' }) => { id: 'proj-1', name: 'Renamed' }
	 * @param {string} id
	 * @param {Object} updates
	 * @returns {Object|null} The updated project, or null if not found.
	 ***/
	updateProject(id, updates, { expectedUpdatedAt } = {}) {
		const project = this.projects.get(id);
		if (!project) return null;
		// Server-owned identity is immutable: the PATCH body passes through
		// untouched, so a stale client (e.g. a settings form mounted before
		// the project loaded) must never be able to repoint or rename a
		// project into corruption. Seen in prod: cwd overwritten with the
		// projects root, which orphaned the real project.json and broke
		// every branch operation with "'...' is not a git repository".
		delete updates.id;
		if (updates.name !== undefined) {
			if (typeof updates.name !== "string" || !updates.name.trim()) {
				const err = new Error("Project name must not be blank");
				err.statusCode = 400;
				err.code = "INVALID_PROJECT_NAME";
				throw err;
			}
			updates.name = updates.name.trim();
		}
		if (updates.cwd !== undefined) {
			const resolved =
				typeof updates.cwd === "string" && updates.cwd.trim()
					? path.resolve(updates.cwd.trim())
					: null;
			const current = project.cwd ? path.resolve(project.cwd) : null;
			if (resolved === current) {
				// Unchanged (modulo trailing slashes): not an update.
				delete updates.cwd;
			} else {
				if (!resolved) {
					const err = new Error("Project working directory must not be blank");
					err.statusCode = 400;
					err.code = "INVALID_PROJECT_CWD";
					throw err;
				}
				if (this._isScanRoot(resolved)) {
					const err = new Error(
						`Project working directory must be the project's own directory, not the projects root ('${resolved}')`,
					);
					err.statusCode = 400;
					err.code = "INVALID_PROJECT_CWD";
					throw err;
				}
				let stat = null;
				try {
					/* eslint-disable-next-line security/detect-non-literal-fs-filename */
					stat = fs.statSync(resolved);
				} catch {
					stat = null;
				}
				if (!stat || !stat.isDirectory()) {
					const err = new Error(
						`Project working directory '${updates.cwd}' does not exist or is not a directory`,
					);
					err.statusCode = 400;
					err.code = "INVALID_PROJECT_CWD";
					throw err;
				}
				updates.cwd = resolved;
			}
		}
		if (
			expectedUpdatedAt &&
			project.updatedAt &&
			expectedUpdatedAt !== project.updatedAt
		) {
			const err = new Error("Conflict: project was modified concurrently");
			err.statusCode = 409;
			err.code = "CONCURRENCY_CONFLICT";
			throw err;
		}
		// The optimistic-concurrency token travels in the PATCH body (or the
		// If-Match header — see routes/projects.js) alongside the updates; it
		// is consumed via the `expectedUpdatedAt` option, never persisted.
		delete updates.expectedUpdatedAt;
		if (updates.notesDir && !updates.notesPath)
			updates.notesPath = updates.notesDir;
		if (updates.notesPath && !updates.notesDir)
			updates.notesDir = updates.notesPath;
		if (updates.gitRepo && !updates.gitUrl) updates.gitUrl = updates.gitRepo;
		if (updates.gitUrl && !updates.gitRepo) updates.gitRepo = updates.gitUrl;
		// Token-bearing URLs must never persist or echo back via the API
		// (audit K-1); git keeps using the live remote from .git/config.
		if (updates.gitUrl) updates.gitUrl = redactCredentials(updates.gitUrl);
		if (updates.gitRepo) updates.gitRepo = redactCredentials(updates.gitRepo);
		if (updates.repoUrl) updates.repoUrl = redactCredentials(updates.repoUrl);
		// Normalize the harness choice: an empty/whitespace value means "follow
		// the configured default" (undefined), keeping the in-memory project in
		// sync with what persistence will (not) write.
		if (updates.harness !== undefined) {
			updates.harness =
				typeof updates.harness === "string" && updates.harness.trim()
					? updates.harness.trim()
					: undefined;
		}
		// Normalize the custom command line the same way: an empty/whitespace
		// value clears it (undefined), so persistence drops the key entirely.
		if (updates.harnessCommand !== undefined) {
			updates.harnessCommand =
				typeof updates.harnessCommand === "string" && updates.harnessCommand.trim()
					? updates.harnessCommand.trim()
					: undefined;
		}
		// Normalize a full-record "Go to App" replacement the tolerant way
		// (garbage degrades to no link). Partial updates go through
		// updateAppStatus instead, so PATCH callers can send just { status }.
		if (updates.appStatus !== undefined) {
			updates.appStatus = normalizeAppStatus(updates.appStatus);
		}
		// Normalize incoming retry/timeout overrides (floor counts,
		// drop garbage to undefined); an explicit null/"" clears the
		// override back to "follow the default", like the harness.
		Object.assign(updates, normalizeProjectRetrySettings(updates));
		// Normalize workspace isolation + dirty-tree recovery the same
		// tolerant way (garbage degrades to the default, never persists
		// raw); absent keys are untouched so legacy records load unchanged.
		if (updates.workspaceIsolation !== undefined) {
			updates.workspaceIsolation =
				updates.workspaceIsolation === "worktree"
					? "worktree"
					: updates.workspaceIsolation === "off"
						? "off"
						: "quarantine";
		}
		if (updates.dirtyTreeRecovery !== undefined) {
			updates.dirtyTreeRecovery =
				updates.dirtyTreeRecovery === "off" ? "off" : "ladder";
		}
		// Docs link settings: strict on write — an invalid folder name
		// throws 400 and leaves the project unchanged; a blank name clears
		// back to the `docs` default; absent keys are untouched (legacy
		// project.json files load exactly as today).
		// Capture "touched" flags before normalization: a blank value
		// normalizes to `undefined`, so the post-save guards must key off the
		// incoming payload, not the normalized field.
		const docsDirTouched = updates.docsDirName !== undefined;
		const centralizedDocsTouched = updates.centralizedDocs !== undefined;
		const kainbainDirTouched = updates.kainbainDirName !== undefined;
		const docsNameFrom = resolveDocsDirName(project);
		const docsCentralizedFrom = isCentralizedDocsEnabled(project);
		const kainbainNameFrom = resolveKainbainDirName(project);
		let docsNameTo = docsNameFrom;
		let docsCentralizedTo = docsCentralizedFrom;
		let kainbainNameTo = kainbainNameFrom;
		if (docsDirTouched) {
			updates.docsDirName = assertValidDocsDirNameForWrite(
				updates.docsDirName,
			);
			docsNameTo = updates.docsDirName || "docs";
		}
		// State folder: strict on write — an invalid name throws 400 and
		// leaves the project unchanged; a blank name clears back to the
		// `.kainbain` default; absent keys are untouched. Changing the name
		// does NOT move existing state (the operator moves the folder and
		// restarts — see the settings UI warning).
		if (kainbainDirTouched) {
			updates.kainbainDirName = assertValidKainbainDirNameForWrite(
				updates.kainbainDirName,
				{ docsDirName: docsNameTo },
			);
			kainbainNameTo = updates.kainbainDirName || ".kainbain";
		}
		// Collision guard (both directions): the docs link folder and the
		// state folder must never share a name. Thrown before the record is
		// touched, so the project is unchanged on conflict.
		if (
			(docsDirTouched || kainbainDirTouched) &&
			docsNameTo.toLowerCase() === kainbainNameTo.toLowerCase()
		) {
			const err = new Error(
				`docsDirName '${docsNameTo}' collides with the state folder '${kainbainNameTo}' — pick different names`,
			);
			err.statusCode = 400;
			err.code = "INVALID_KAINBAIN_DIR_NAME";
			throw err;
		}
		// Crossing guard: when BOTH names change in one update, neither may
		// land on the other's CURRENT folder. A swap (docs takes the state
		// folder's name while the state folder takes the docs name) would
		// write the state config into the docs folder and strand the old
		// sessions/task docs — the final names differ, so the collision
		// guard above cannot see it. One-sided crossings are already
		// rejected (the untouched side keeps its name, so the collision
		// guard fires). Thrown before the record is touched.
		if (
			kainbainNameTo.toLowerCase() !== kainbainNameFrom.toLowerCase() &&
			docsNameTo.toLowerCase() === kainbainNameFrom.toLowerCase()
		) {
			const err = new Error(
				`docsDirName '${docsNameTo}' would move the docs link into the current state folder — rename the state folder first, then retry`,
			);
			err.statusCode = 400;
			err.code = "INVALID_DOCS_DIR_NAME";
			throw err;
		}
		if (
			docsNameTo.toLowerCase() !== docsNameFrom.toLowerCase() &&
			kainbainNameTo.toLowerCase() === docsNameFrom.toLowerCase()
		) {
			const err = new Error(
				`kainbainDirName '${kainbainNameTo}' would move the state folder into the current docs folder — rename the docs folder first, then retry`,
			);
			err.statusCode = 400;
			err.code = "INVALID_KAINBAIN_DIR_NAME";
			throw err;
		}
		if (updates.centralizedDocs !== undefined) {
			Object.assign(
				updates,
				normalizeDocsSettings({ centralizedDocs: updates.centralizedDocs }),
			);
			docsCentralizedTo = updates.centralizedDocs !== false;
		}
		// Rename guard: a real (non-symlink) entry already sitting at the new
		// link name is never deleted or adopted — the operator merges by
		// hand first. Thrown before the record is touched, so the project
		// is unchanged on conflict.
		if (docsCentralizedTo && docsNameTo !== docsNameFrom) {
			const renameCwd =
				typeof updates.cwd === "string" && updates.cwd
					? updates.cwd
					: project.cwd;
			const newLink = renameCwd ? path.join(renameCwd, docsNameTo) : null;
			let newStat = null;
			try {
				/* eslint-disable-next-line security/detect-non-literal-fs-filename */
				newStat = newLink ? fs.lstatSync(newLink) : null;
			} catch {
				newStat = null;
			}
			if (newStat && !newStat.isSymbolicLink()) {
				const err = new Error(
					`docsDirName '${docsNameTo}' is blocked: '${newLink}' already exists — merge it by hand, then retry the rename`,
				);
				err.statusCode = 409;
				err.code = "DOCS_LINK_SHADOWED";
				throw err;
			}
		}
		// Normalize an incoming alias list (trim, drop invalids, dedupe);
		// an empty result clears the list (undefined), like the harness.
		// Inferred renames migrate referencing default/stage fields BEFORE
		// the save below, so a rename can never orphan stages in between.
		let aliasRenames = [];
		if (updates.modelAliases !== undefined) {
			const incoming = normalizeModelAliases(updates.modelAliases);
			aliasRenames = inferAliasRenames(
				normalizeModelAliases(project.modelAliases),
				incoming,
			);
			updates.modelAliases = incoming.length ? incoming : undefined;
		}
		Object.assign(project, updates, { updatedAt: new Date().toISOString() });
		for (const { from, to } of aliasRenames) {
			applyAliasRename(project, from, to);
		}
		this._saveProjectFile(project);
		// A state-folder change must not leave a second (stale) config behind:
		// remove the superseded one so a restart cannot re-adopt it and revert
		// the setting. Sessions/worktrees stay on disk; the operator moves them.
		if (kainbainDirTouched && kainbainNameTo !== kainbainNameFrom) {
			this._discardStaleStateConfig(project, kainbainNameFrom);
		}
		// The saved record leads: when a docs setting actually changed,
		// migrate the on-disk link entry to match it. Never throws —
		// verification reports whatever remains for an operator to
		// reconcile. Unrelated updates never touch the filesystem.
		if (docsDirTouched || centralizedDocsTouched) {
			try {
				this._migrateDocsLink(project, {
					fromName: docsNameFrom,
					toName: docsNameTo,
					toCentralized: docsCentralizedTo,
				});
			} catch {
				// Link migration is best-effort; the record is already saved.
			}
		}
		return project;
	}

	/***
	 * MARK: _migrateDocsLink
	 * @description Moves the on-disk docs entry after a settings change so it
	 *   matches the saved record. Rename: removes the old link entry only
	 *   when it is a symlink into this project's own notes space, then
	 *   verifies (creating) the new link — a real directory anywhere is
	 *   never deleted or adopted. Opt-out: leaves every existing entry
	 *   alone (a healthy old symlink keeps serving until the operator
	 *   removes it) and ensures a plain local directory only when nothing
	 *   exists yet; the notes space is never touched.
	 * @example projectStore._migrateDocsLink(project, { fromName: 'docs', toName: 'k-docs', toCentralized: true })
	 * @param {Object} project - The saved project record.
	 * @param {Object} opts
	 * @param {string} opts.fromName - Previous effective link-folder name.
	 * @param {string} opts.toName - New effective link-folder name.
	 * @param {boolean} opts.toCentralized - New centralised-docs mode.
	 * @returns {void}
	 ***/
	_migrateDocsLink(
		project,
		{ fromName, toName, toCentralized } = {},
	) {
		/* eslint-disable security/detect-non-literal-fs-filename */
		const cwd = project?.cwd;
		if (!cwd || typeof cwd !== "string") return;
		const notesDir = project?.notesPath || project?.notesDir || null;
		if (toCentralized) {
			if (toName !== fromName) {
				const oldLink = path.join(cwd, fromName);
				try {
					if (fs.lstatSync(oldLink).isSymbolicLink() && notesDir) {
						let target = null;
						try {
							target = path.resolve(
								path.dirname(oldLink),
								fs.readlinkSync(oldLink),
							);
						} catch {
							target = null;
						}
						let same = false;
						try {
							same =
								!!target && fs.realpathSync(target) === fs.realpathSync(notesDir);
						} catch {
							same = false;
						}
						if (same) fs.unlinkSync(oldLink);
					}
				} catch {
					// Absent old entry: nothing to remove.
				}
			}
			this.ensureDocsLink(project);
		} else {
			const localDir = path.join(cwd, toName);
			try {
				fs.lstatSync(localDir);
			} catch {
				try {
					fs.mkdirSync(localDir, { recursive: true });
				} catch {
					// Best-effort local directory; saves create parents on demand.
				}
			}
		}
		/* eslint-enable security/detect-non-literal-fs-filename */
	}

	/***
	 * MARK: _discardStaleStateConfig
	 * @description Removes the superseded `project.json` from a project's
	 *   previous state folder after `kainbainDirName` changed, so a restart can
	 *   never re-adopt the stale record and silently revert the setting (or
	 *   split state across two folders). Only the config file is removed, and
	 *   only when the new config was written successfully and the old file is
	 *   this project's own config (its id matches, or — for id-less legacy
	 *   configs — it names this project's cwd); another project's config is
	 *   never deleted. Sessions, worktrees, and quarantine stay on disk for
	 *   the operator to move. Never throws.
	 * @example projectStore._discardStaleStateConfig(project, '.kainbain')
	 * @param {Object} project - The saved project record (post-update).
	 * @param {string} previousName - The previous effective state folder name.
	 * @returns {boolean} True when a stale config file was removed.
	 ***/
	_discardStaleStateConfig(project, previousName) {
		const cwd = project?.cwd;
		// Defense in depth: the previous name must be a bare folder name —
		// never a path fragment (callers pass the resolver output, which is
		// always valid, but this method must stay safe for future callers).
		if (!cwd || !previousName || !isValidKainbainDirName(previousName)) {
			return false;
		}
		try {
			/* eslint-disable security/detect-non-literal-fs-filename */
			const newConfig = resolveProjectConfigPath(cwd, project);
			if (!newConfig || !fs.existsSync(newConfig)) return false;
			const oldConfig = path.join(
				path.resolve(cwd),
				previousName,
				"project.json",
			);
			if (path.resolve(oldConfig) === path.resolve(newConfig)) return false;
			if (!fs.existsSync(oldConfig)) return false;
			const parsed = JSON.parse(fs.readFileSync(oldConfig, "utf8"));
			// Ownership: a config carrying an id must match THIS project's id
			// (a different project's config is never deleted, even when it
			// names the same cwd — two projects must never share a state
			// folder); the cwd match only adopts id-less legacy configs.
			const parsedId = typeof parsed?.id === "string" ? parsed.id : null;
			const ownsIt = parsedId
				? !!project.id && parsedId === project.id
				: typeof parsed?.cwd === "string" &&
					path.resolve(parsed.cwd) === path.resolve(cwd);
			if (!ownsIt) return false;
			fs.unlinkSync(oldConfig);
			/* eslint-enable security/detect-non-literal-fs-filename */
			console.warn(
				`[projectStore] state folder changed to '${resolveKainbainDirName(project)}'; removed the stale config '${oldConfig}'. ` +
					`Move any sessions/worktrees from '${path.join(cwd, previousName)}' by hand, then restart.`,
			);
			return true;
		} catch (err) {
			console.warn(
				`[projectStore] could not remove the stale state config after the state folder changed: ${err?.message || err}`,
			);
			return false;
		}
	}

	/***
	 * MARK: updateAppStatus
	 * @description Merges a partial "Go to App" update (`{ url, networkHost,
	 *   status, healthEndpoint }`) into the project's stored link and persists
	 *   it. Strict where the API needs clear errors: a malformed url, an
	 *   unknown status, or a malformed networkHost throws a 400. Clearing is
	 *   explicit: `url: null` (or blank) removes the link entirely, and
	 *   `networkHost: null` (or blank) drops just the override. Stamps
	 *   `lastUpdated` on every accepted write.
	 * @example projectStore.updateAppStatus('proj-1', { url: 'http://localhost:5173', networkHost: 'home.home' }) => { id: 'proj-1', appStatus: { url: 'http://localhost:5173', ... } }
	 * @param {string} id
	 * @param {Object} [patch]
	 * @returns {Object|null} The updated project, or null if not found.
	 ***/
	updateAppStatus(id, patch = {}) {
		const project = this.projects.get(id);
		if (!project) return null;
		const input =
			patch && typeof patch === "object" && !Array.isArray(patch) ? patch : {};
		const badRequest = (message) => {
			const err = new Error(message);
			err.statusCode = 400;
			err.code = "INVALID_APP_STATUS";
			return err;
		};
		// Clearing the link: an explicit null/blank url removes the record.
		if ("url" in input) {
			const raw = input.url;
			if (raw === null || (typeof raw === "string" && !raw.trim())) {
				project.appStatus = undefined;
				project.updatedAt = new Date().toISOString();
				this._saveProjectFile(project);
				return project;
			}
			if (!validateAppUrl(raw)) {
				throw badRequest("appStatus.url must be an absolute http(s) URL");
			}
		}
		if (
			"status" in input &&
			input.status !== undefined &&
			!APP_STATUS_VALUES.includes(input.status)
		) {
			throw badRequest(
				`appStatus.status must be one of: ${APP_STATUS_VALUES.join(", ")}`,
			);
		}
		if (
			"networkHost" in input &&
			input.networkHost !== undefined &&
			input.networkHost !== null &&
			(typeof input.networkHost !== "string" || input.networkHost.trim()) &&
			!normalizeNetworkHost(input.networkHost)
		) {
			throw badRequest(
				"appStatus.networkHost must be a bare LAN hostname or IP, optionally with :port",
			);
		}
		if (
			"healthEndpoint" in input &&
			input.healthEndpoint !== undefined &&
			input.healthEndpoint !== null &&
			typeof input.healthEndpoint !== "string"
		) {
			throw badRequest("appStatus.healthEndpoint must be a path string");
		}
		const merged = {
			...(project.appStatus || {}),
			...input,
			lastUpdated: new Date().toISOString(),
		};
		// Blank override/endpoint clears just that field (not the whole link).
		if (
			merged.networkHost === null ||
			(typeof merged.networkHost === "string" && !merged.networkHost.trim())
		) {
			delete merged.networkHost;
		}
		if (
			merged.healthEndpoint === null ||
			(typeof merged.healthEndpoint === "string" &&
				!merged.healthEndpoint.trim())
		) {
			delete merged.healthEndpoint;
		}
		const normalized = normalizeAppStatus(merged);
		if (!normalized) {
			throw badRequest("appStatus.url must be an absolute http(s) URL");
		}
		project.appStatus = normalized;
		project.updatedAt = new Date().toISOString();
		this._saveProjectFile(project);
		return project;
	}

	/***
	 * MARK: recordAppHealth
	 * @description Records one health-probe outcome on the project's "Go to
	 *   App" link (`isHealthy` + `lastHealthCheck`) and persists it. No-op
	 *   (null) when the project is unknown or carries no link.
	 * @example projectStore.recordAppHealth('proj-1', { isHealthy: true }) => { id: 'proj-1', appStatus: { isHealthy: true, ... } }
	 * @param {string} id
	 * @param {Object} [outcome]
	 * @param {boolean} [outcome.isHealthy]
	 * @param {string} [outcome.checkedAt]
	 * @returns {Object|null} The updated project, or null if not found.
	 ***/
	recordAppHealth(id, { isHealthy, checkedAt } = {}) {
		const project = this.projects.get(id);
		if (!project || !project.appStatus) return null;
		project.appStatus = normalizeAppStatus({
			...project.appStatus,
			isHealthy: isHealthy === true,
			lastHealthCheck:
				typeof checkedAt === "string" && checkedAt
					? checkedAt
					: new Date().toISOString(),
		});
		project.updatedAt = new Date().toISOString();
		this._saveProjectFile(project);
		return project;
	}

	/***
	 * MARK: deleteProject
	 * @description Deletes a project from the store.
	 * @example projectStore.deleteProject('proj-1') => true
	 * @param {string} id
	 * @returns {boolean}
	 ***/
	deleteProject(id) {
		const deleted = this.projects.delete(id);
		if (this.activeProjectId === id) {
			const remaining = Array.from(this.projects.keys());
			this.activeProjectId = remaining.length > 0 ? remaining[0] : null;
		}
		return deleted;
	}

	/***
	 * MARK: setActiveProject
	 * @description Sets the currently active project for the workspace.
	 * @example projectStore.setActiveProject('proj-1') => true
	 * @param {string} id
	 * @returns {boolean} True if the project exists and was activated.
	 ***/
	setActiveProject(id) {
		if (!this.projects.has(id)) return false;
		this.activeProjectId = id;
		return true;
	}

	/***
	 * MARK: getActiveProject
	 * @description Gets the currently active project object.
	 * @example projectStore.getActiveProject() => { id: 'proj-1', name: 'Project A' }
	 * @returns {Object|undefined}
	 ***/
	getActiveProject() {
		return this.projects.get(this.activeProjectId);
	}

	/***
	 * MARK: getWorkflows
	 * @description Retrieves all named workflows for a given project.
	 * @example projectStore.getWorkflows('proj-1') => [{ id: 'wf-default', name: 'Feature Pipeline', isDefault: true, stages: [...] }]
	 * @param {string} projectId
	 * @returns {Array<Object>|null}
	 ***/
	getWorkflows(projectId) {
		const project = this.projects.get(projectId);
		if (!project) return null;
		if (!Array.isArray(project.workflows) || project.workflows.length === 0) {
			project.workflows = normalizeWorkflows(project.workflows, project.stages);
			project.activeWorkflowId =
				project.activeWorkflowId || project.workflows[0].id;
		}
		return project.workflows;
	}

	/***
	 * MARK: getWorkflow
	 * @description Retrieves a specific named workflow by id for a given project.
	 * @example projectStore.getWorkflow('proj-1', 'wf-bugfix') => { id: 'wf-bugfix', name: 'Hotfix Pipeline' }
	 * @param {string} projectId
	 * @param {string} workflowId
	 * @returns {Object|null}
	 ***/
	getWorkflow(projectId, workflowId) {
		const workflows = this.getWorkflows(projectId);
		if (!workflows) return null;
		return workflows.find((w) => w.id === workflowId) || null;
	}

	/***
	 * MARK: getActiveWorkflow
	 * @description Retrieves the currently active workflow for a project.
	 * @example projectStore.getActiveWorkflow('proj-1') => { id: 'wf-default', name: 'Feature Pipeline' }
	 * @param {string} projectId
	 * @returns {Object|null}
	 ***/
	getActiveWorkflow(projectId) {
		const project = this.projects.get(projectId);
		if (!project) return null;
		const workflows = this.getWorkflows(projectId);
		return (
			workflows.find((w) => w.id === project.activeWorkflowId) ||
			workflows.find((w) => w.isDefault) ||
			workflows[0] ||
			null
		);
	}

	/***
	 * MARK: createWorkflow
	 * @description Creates and registers a new named workflow for a project.
	 * @example projectStore.createWorkflow('proj-1', { name: 'Hotfix Pipeline', stages: [...] }) => { id: 'wf-hotfix', name: 'Hotfix Pipeline' }
	 * @param {string} projectId
	 * @param {Object} workflowData
	 * @param {string} workflowData.name - Display name of the workflow.
	 * @param {Array<Object>} [workflowData.stages] - Custom stages for the workflow.
	 * @param {boolean} [workflowData.isDefault=false] - Whether this workflow is the project default.
	 * @returns {Object|null} The created workflow entity.
	 ***/
	createWorkflow(projectId, { name, stages, isDefault = false } = {}) {
		const project = this.projects.get(projectId);
		if (!project) return null;

		const cleanName =
			name && typeof name === "string" && name.trim()
				? name.trim()
				: "New Workflow";
		const id = `wf-${slugifyProjectName(cleanName)}-${uuidv4().slice(0, 6)}`;

		if (!Array.isArray(project.workflows)) {
			project.workflows = normalizeWorkflows(project.workflows, project.stages);
		}

		if (isDefault) {
			for (const wf of project.workflows) {
				wf.isDefault = false;
			}
		}

		const newWorkflow = {
			id,
			name: cleanName,
			isDefault: Boolean(isDefault),
			stages: normalizeStages(
				Array.isArray(stages) && stages.length > 0
					? stages
					: DEFAULT_STAGES.map((s) => ({ ...s })),
			),
		};

		project.workflows.push(newWorkflow);
		this._saveProjectFile(project);
		return newWorkflow;
	}

	/***
	 * MARK: switchWorkflow
	 * @description Switches the active workflow for a project and updates its active stage pipeline.
	 * @example projectStore.switchWorkflow('proj-1', 'wf-bugfix') => { status: 'switched', activeWorkflowId: 'wf-bugfix' }
	 * @param {string} projectId
	 * @param {string} workflowId
	 * @returns {Object|null}
	 ***/
	switchWorkflow(projectId, workflowId) {
		const project = this.projects.get(projectId);
		if (!project) return null;

		const target = this.getWorkflow(projectId, workflowId);
		if (!target) return null;

		project.activeWorkflowId = target.id;
		project.stages = normalizeStages(target.stages);
		if (
			project.currentStageId &&
			!project.stages.some((s) => s.id === project.currentStageId)
		) {
			project.currentStageId = project.stages[0]?.id || null;
		}

		this._saveProjectFile(project);
		return {
			status: "switched",
			activeWorkflowId: target.id,
			workflow: target,
			stages: project.stages,
		};
	}

	/***
	 * MARK: updateWorkflow
	 * @description Updates an existing named workflow (name, stages, isDefault) and persists changes.
	 * @example projectStore.updateWorkflow('proj-1', 'wf-1', { name: 'Renamed Pipeline' }) => { id: 'wf-1', name: 'Renamed Pipeline' }
	 * @param {string} projectId
	 * @param {string} workflowId
	 * @param {Object} updates
	 * @returns {Object|null}
	 ***/
	updateWorkflow(projectId, workflowId, updates = {}) {
		const project = this.projects.get(projectId);
		if (!project) return null;

		const target = this.getWorkflow(projectId, workflowId);
		if (!target) return null;

		if (typeof updates.name === "string" && updates.name.trim()) {
			target.name = updates.name.trim();
		}

		if (Array.isArray(updates.stages)) {
			target.stages = normalizeStages(updates.stages);
		}

		if (updates.isDefault === true) {
			for (const wf of project.workflows) {
				wf.isDefault = wf.id === target.id;
			}
			target.isDefault = true;
		}

		// If modifying the currently active workflow, sync project.stages
		if (project.activeWorkflowId === target.id) {
			project.stages = target.stages;
		}

		this._saveProjectFile(project);
		return target;
	}

	/***
	 * MARK: deleteWorkflow
	 * @description Removes a named workflow from a project. Cannot delete the only workflow.
	 * @example projectStore.deleteWorkflow('proj-1', 'wf-bugfix') => true
	 * @param {string} projectId
	 * @param {string} workflowId
	 * @returns {boolean}
	 ***/
	deleteWorkflow(projectId, workflowId) {
		const project = this.projects.get(projectId);
		if (!project) return false;

		const workflows = this.getWorkflows(projectId);
		if (!workflows || workflows.length <= 1) {
			throw new Error("Cannot delete the only workflow in a project");
		}

		const index = workflows.findIndex((w) => w.id === workflowId);
		if (index === -1) return false;

		const [deletedWf] = workflows.splice(index, 1);

		// If the deleted workflow was active, switch to default or first remaining
		if (project.activeWorkflowId === deletedWf.id) {
			const fallbackWf = workflows.find((w) => w.isDefault) || workflows[0];
			project.activeWorkflowId = fallbackWf.id;
			project.stages = normalizeStages(fallbackWf.stages);
			if (
				project.currentStageId &&
				!project.stages.some((s) => s.id === project.currentStageId)
			) {
				project.currentStageId = project.stages[0]?.id || null;
			}
		}

		// Ensure at least one remaining workflow isDefault
		if (!workflows.some((w) => w.isDefault)) {
			workflows[0].isDefault = true;
		}

		this._saveProjectFile(project);
		return true;
	}

	/***
	 * MARK: getStages
	 * @description Retrieves the workflow stages configured for a given project.
	 * @example projectStore.getStages('proj-1') => [{ id: '1', name: 'Idea' }]
	 * @param {string} id
	 * @returns {Array<Object>|null}
	 ***/
	getStages(id) {
		const project = this.projects.get(id);
		return project ? project.stages : null;
	}

	/***
	 * MARK: updateStages
	 * @description Replaces the workflow stage pipeline for a project's active workflow and persists changes.
	 * @example projectStore.updateStages('proj-1', [{ id: '1', name: 'Spec' }])
	 * @param {string} id
	 * @param {Array<Object>} stages
	 * @returns {Array<Object>|null}
	 ***/
	updateStages(id, stages, { expectedUpdatedAt } = {}) {
		const project = this.projects.get(id);
		if (!project) return null;
		if (
			expectedUpdatedAt &&
			project.updatedAt &&
			expectedUpdatedAt !== project.updatedAt
		) {
			const err = new Error(
				"Conflict: workflow stages were modified concurrently",
			);
			err.statusCode = 409;
			err.code = "CONCURRENCY_CONFLICT";
			throw err;
		}
		project.stages = normalizeStages(stages);
		project.updatedAt = new Date().toISOString();

		// Sync with active workflow object
		if (Array.isArray(project.workflows)) {
			const activeWf = project.workflows.find(
				(w) => w.id === project.activeWorkflowId,
			);
			if (activeWf) {
				activeWf.stages = project.stages;
			}
		}

		this._saveProjectFile(project);
		return project.stages;
	}

	/***
	 * MARK: jumpToStage
	 * @description Jumps the project's current stage pointer to any stage (non-linear failback).
	 * @example projectStore.jumpToStage('proj-1', '3') => { id: 'proj-1', currentStageId: '3' }
	 * @param {string} id
	 * @param {string} stageId
	 * @returns {Object|null} The project, or null if the stage does not exist.
	 ***/
	jumpToStage(id, stageId) {
		const project = this.projects.get(id);
		if (!project) return null;
		if (!project.stages.some((s) => s.id === stageId)) return null;
		project.currentStageId = stageId;
		this._saveProjectFile(project);
		return project;
	}

	/***
	 * MARK: skipStage
	 * @description Skips the current stage by advancing to the next stage in the pipeline.
	 * @example projectStore.skipStage('proj-1') => { id: 'proj-1', currentStageId: '2' }
	 * @param {string} id
	 * @returns {Object|null} The project, or null if not found.
	 ***/
	skipStage(id) {
		const project = this.projects.get(id);
		if (!project) return null;
		const index = project.stages.findIndex(
			(s) => s.id === project.currentStageId,
		);
		if (index !== -1 && index < project.stages.length - 1) {
			project.currentStageId = project.stages[index + 1].id;
			this._saveProjectFile(project);
		} else if (index === -1 && project.stages.length > 1) {
			project.currentStageId = project.stages[1].id;
			this._saveProjectFile(project);
		}
		return project;
	}
}
