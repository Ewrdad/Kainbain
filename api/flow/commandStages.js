// Domain: The Flow — command-based pipeline stages ('ci', plus the git-only 'merge' stage).
import { config } from "../config.js";
import { _appendProcessLog } from "../watch/index.js";
import { resolveStageTimeout, stageElapsedSeconds } from "./stagePolicy.js";
import { recordStageHeartbeat, clearStageHeartbeat, consumeStallKill } from "./stageHeartbeat.js";
import {
	resolveCommandHeartbeatIntervalMs,
	startStageHeartbeatTicker,
} from "./commandLiveness.js";
import { failureLogExcerptLimit, excerptLog } from "./stageFailureRouting.js";
import { emitStageLifecycle } from "./stageLifecycle.js";
import {
	GitError,
	GitMergeConflictError,
	branchExists,
	buildGitConflictDiagnostics,
	commitAllIfNeeded,
	countBehindCommits,
	countUniqueCommits,
	currentBranch,
	defaultBranch,
	drainDirtyTreeRecoveries,
	drainGitLockRecoveries,
	formatDirtyTreeRecoveryNotice,
	formatGitLockRecoveryNotice,
	hasCommits,
	isBranchMergedInto,
	isGitRepository,
	isValidBranchName,
	checkoutBranch,
	mergeBranch,
	pushBranchIfRemote,
	requireCleanWorkingTree,
	withCheckedOutBranch,
} from "../git.js";
import { resolveSha } from "../reviewDiff.js";
import { resolveTaskBranch } from "../work/taskBranches.js";
import { commitFailedStageWork } from "../work/taskFinalize.js";

/***
 * MARK: safeResolveSha
 * @description Resolves a ref to a SHA without ever throwing: a missing
 *   mock, an unknown ref, or a git failure resolves to null. The plain
 *   `resolveSha(...).catch(() => null)` pattern only handles async
 *   rejections — a synchronously-throwing `resolveSha` (e.g. an
 *   incompletely-mocked module) would escape the `.catch` and fail the
 *   stage with a resolver error instead of the real outcome.
 * @example await safeResolveSha('/repo', 'main') => 'abc123...' | null
 * @param {string} cwd - Project working directory.
 * @param {string} ref - Ref to resolve.
 * @returns {Promise<string|null>} Full SHA or null.
 ***/
async function safeResolveSha(cwd, ref) {
	try {
		return await resolveSha(cwd, ref);
	} catch {
		return null;
	}
}
import { getCommitRangeDiffStat } from "../work/taskDiffStat.js";
import {
	interpolatePromptKeywords,
	buildInterpolationContext,
	resolveStageCustomKeywords,
} from "../promptCuration.js";

/***
 * MARK: STALE_BRANCH_WARNING_COMMITS
 * @description Task branches this many commits behind the default branch
 *   earn a warning-only divergence note in history and logs (C6): gates run
 *   against the merged tree, so a stale base can fail for reasons unrelated
 *   to the task. Warning-only by decision — promotion to an active refresh
 *   needs an explicit decision (see the implementation plan's open question).
 ***/
export const STALE_BRANCH_WARNING_COMMITS = 10;
import {
	shouldResetReviewBaseline,
	isValidReviewBaseline,
} from "../work/taskBranches.js";
import { resolveShell, buildStageEnv, isWindows } from "../utils/platform.js";

/***
 * MARK: recordReviewBaseline
 * @description Freezes the SHAs behind a successful merge on the task as
 *   `task.reviewBaseline = { baseSha, headSha, mainSha, mergedAt, stageId }`
 *   so the PR review can still show the merged change after `main...kb/<id>`
 *   goes empty. The `mergedAt` + `stageId` pair doubles as the landed-merge
 *   marker that `isMergeLanded` reads: the merge stage uses it to re-enter
 *   idempotently and to enforce the no-rewind rule (a landed merge is never
 *   failed back to an earlier stage). Data-only (no new ref/branch/tag):
 *   immutable SHAs cannot drift as later work lands. Overwrites per merge by
 *   default; keeps the first baseline when the project disabled
 *   `resetReviewBaselineOnMerge` (cumulative view). Never throws: an
 *   unresolvable SHA simply leaves the task untouched and the review falls
 *   back to the live diff.
 ***/
export async function recordReviewBaseline(
	store,
	{
		projectId,
		taskId,
		task,
		cwd,
		branch,
		mainBranch,
		preMergeMainSha,
		stageId,
	} = {},
) {
	try {
		if (!task || !cwd || !branch || !mainBranch) return null;
		const project = lookupProject(store, projectId);
		const existing = isValidReviewBaseline(task.reviewBaseline)
			? task.reviewBaseline
			: null;
		// Keep-first mode: the first baseline stands and later passes
		// accumulate in the review's `newSinceMerge` section instead.
		if (existing && !shouldResetReviewBaseline(project)) return existing;
		const [headSha, mainSha] = await Promise.all([
			safeResolveSha(cwd, branch),
			preMergeMainSha || safeResolveSha(cwd, mainBranch),
		]);
		if (!headSha || !mainSha) return existing;
		const mergedAt = new Date().toISOString();
		const baseline = {
			baseSha: mainSha,
			headSha,
			mainSha,
			mergedAt,
			stageId: stageId || null,
		};
		task.reviewBaseline = baseline;
		if (Array.isArray(task.history)) {
			task.history.push({
				timestamp: mergedAt,
				action: `Recorded PR-review baseline for '${branch}' at merge into '${mainBranch}'`,
			});
		}
		// Persist through updateTask (the same path every other task field
		// uses, including the markdown round-trip); fall back to a direct
		// save for minimal stub stores.
		if (typeof store.updateTask === "function" && task.id) {
			store.updateTask(projectId, taskId, { reviewBaseline: baseline }, cwd);
		} else {
			store._saveTaskMarkdown(cwd, task);
		}
		return baseline;
	} catch {
		return null;
	}
}

/***
 * MARK: isMergeLanded
 * @description Whether the task's merge already landed: the frozen PR-review
 *   baseline carries `mergedAt` once a merge succeeds. An optional `stageId`
 *   match guards against stale baselines recorded by an earlier merge stage.
 *   The baseline stores SHAs (not branch names), so "already merged" for the
 *   current branch pair is decided by the caller via `countUniqueCommits`.
 * @example isMergeLanded({ reviewBaseline: { mergedAt: '…', stageId: 'merge-1' } }, { stageId: 'merge-1' }) => true
 * @param {Object} [task] - Task entity, may carry `reviewBaseline`.
 * @param {Object} [opts]
 * @param {string} [opts.stageId] - Current merge stage id; a baseline from a
 *   different stage id resolves to false.
 * @returns {boolean} True only when a landed-merge marker exists.
 ***/
export function isMergeLanded(task, { stageId } = {}) {
	const baseline = task?.reviewBaseline;
	if (!baseline || typeof baseline !== "object" || Array.isArray(baseline)) {
		return false;
	}
	if (typeof baseline.mergedAt !== "string" || !baseline.mergedAt.trim()) {
		return false;
	}
	if (
		stageId != null &&
		baseline.stageId != null &&
		String(baseline.stageId) !== String(stageId)
	) {
		return false;
	}
	return true;
}

/***
 * MARK: lastStillRunningLine
 * @description Finds the most recent gate progress line ("⏳ still running: …")
 *   in a command's buffered output, so a stall report can say which branches
 *   were still running when the watchdog killed the stage. Returns the line
 *   trimmed, or "" when the output carries no progress line.
 * @example lastStillRunningLine("⏳ still running: Canary Tests 4m31s\n") => "⏳ still running: Canary Tests 4m31s"
 * @param {string} output - The stage command's buffered stdout.
 * @returns {string}
 ***/
function lastStillRunningLine(output) {
	if (!output) return "";
	const lines = output.split("\n");
	for (let i = lines.length - 1; i >= 0; i -= 1) {
		if (lines[i].includes("still running:")) return lines[i].trim();
	}
	return "";
}

/***
 * MARK: resolveCommandExecutionCwd
 * @description Resolves the working directory for a command stage.
 *   kind 'ci'|'script' -> task worktree when enabled, else primary cwd.
 *   other kinds -> primary cwd.
 * @param {Object} store
 * @param {Object} opts
 * @param {string} opts.kind
 * @param {Object} opts.task
 * @param {string} opts.cwd
 * @returns {Promise<string>}
 ***/
export async function resolveCommandExecutionCwd(store, { kind, task, cwd } = {}) {
	const resolved =
		kind === "ci" || kind === "script"
			? await resolveTaskExecutionCwd(store, task, cwd)
			: null;
	return resolved || cwd || process.cwd();
}

/***
 * MARK: resolveCiBranchPlan
 * @description Pure policy for a command stage's branch execution mode,
 *   shared by the stage runner and tests. Reads the normalized
 *   `stage.runOnBranch` /
 *   `stage.customBranch` fields only (normalizeStage migrates any legacy
 *   spellings before a stage reaches the runner) and resolves them against
 *   the actual repository. Fails loud and early — a misconfigured stage must
 *   never silently fall back to the task branch.
 *   'task'    -> { mode: 'task', branch: null } (existing behaviour)
 *   'primary' -> { mode: 'primary', branch: await defaultBranch(cwd) }
 *   'custom'  -> { mode: 'custom', branch: stage.customBranch }
 * @example await resolveCiBranchPlan({ stage, cwd }) => { mode: 'task', branch: null }
 * @param {Object} opts
 * @param {Object} opts.stage - Normalized stage object.
 * @param {string} opts.cwd - Primary project checkout.
 * @returns {Promise<{mode: 'task'|'primary'|'custom', branch: string|null}>}
 * @throws {GitError} Non-git project, unresolvable primary branch, or a custom
 *   branch that is blank, not a valid git branch name, or does not exist
 *   locally. No git state is mutated before the throw.
 ***/
export async function resolveCiBranchPlan({ stage, cwd } = {}) {
	const rawMode = stage?.runOnBranch;
	const mode = typeof rawMode === "string" ? rawMode.trim().toLowerCase() : "task";
	const stageLabel = stage?.name || stage?.id || "unnamed";

	if (mode === "primary") {
		if (!(await isGitRepository(cwd))) {
			throw new GitError(
				`Cannot run CI stage '${stageLabel}' on the primary branch: '${cwd}' is not a git repository.`,
			);
		}
		const branch = await defaultBranch(cwd);
		if (!branch) {
			throw new GitError(
				`Could not resolve the primary branch for CI stage '${stageLabel}' in '${cwd}'.`,
			);
		}
		return { mode: "primary", branch };
	}

	if (mode === "custom") {
		if (!(await isGitRepository(cwd))) {
			throw new GitError(
				`Cannot run CI stage '${stageLabel}' on a custom branch: '${cwd}' is not a git repository.`,
			);
		}
		const customBranch =
			typeof stage?.customBranch === "string" ? stage.customBranch.trim() : "";
		if (!customBranch || !isValidBranchName(customBranch)) {
			throw new GitError(
				`Invalid custom branch '${customBranch || "(blank)"}' for CI stage '${stageLabel}' — set a valid git branch name.`,
			);
		}
		if (!(await branchExists(cwd, customBranch))) {
			throw new GitError(
				`Custom branch '${customBranch}' does not exist locally in this project — create it or pick another branch.`,
			);
		}
		return { mode: "custom", branch: customBranch };
	}

	// Absent or unknown mode: existing task-branch behaviour (fail-open here is
	// deliberate — an unknown value in an old project.json must not break the
	// pipeline, and normalizeStage has already coerced what it could).
	return { mode: "task", branch: null };
}

/***
 * MARK: finalizePassedCommandStage
 * @description Finalizes a passed command or merge stage: resets transient error/retry fields,
 *   consumes single-attempt markers by kind, appends a history pass entry, persists task markdown,
 *   saves the stage report (if reportContent is provided), advances the stage, and returns
 *   the canonical stage-passed result tuple.
 * @param {Object} store
 * @param {string} projectId
 * @param {string} taskId
 * @param {Object} stage
 * @param {Object} [opts]
 * @returns {Promise<Object>}
 ***/
export async function finalizePassedCommandStage(
	store,
	projectId,
	taskId,
	stage,
	{
		stages = [],
		cwd,
		bridge = store.eventBridge,
		kind = "ci",
		label = "CI",
		stdout = "",
		stderr = "",
		reportContent = null,
		historyAction = null,
	} = {},
) {
	const task = store.getTask(projectId, taskId);
	if (!task) return null;

	const useBranches = !!store._isBranchModeEnabled?.(projectId);
	const capturesStageBoundary = kind === "ci" || kind === "script";
	// Human-checkpoint snapshot (plan §2.3): the tip recorded at checkpoint
	// entry bounds this stage's range even if the tip moved since. Adopt it
	// when no start was captured yet, then always consume it so a stale
	// snapshot can never leak into a later stage.
	if (useBranches && capturesStageBoundary) {
		if (
			!task.currentStageStartSha &&
			typeof task.humanCheckpointStartSha === "string" &&
			task.humanCheckpointStartSha.trim()
		) {
			task.currentStageStartSha = task.humanCheckpointStartSha.trim();
		}
		task.humanCheckpointStartSha = null;
	}
	if (useBranches && capturesStageBoundary && !task.currentStageStartSha) {
		try {
			task.currentStageStartSha = await resolveSha(cwd, resolveTaskBranch(task));
		} catch {
			task.currentStageStartSha = task.currentStageStartSha || null;
		}
	}
	task.currentStageEndSha = task.currentStageEndSha || null;

	if (reportContent) {
		store.saveStageReport(projectId, taskId, {
			stageName: stage.name || stage.id,
			stageId: stage.id,
			duration: stageElapsedSeconds(task),
			status: "PASSED",
			content: reportContent,
			projectCwd: cwd,
		});
	}

	task.status = "in_stage";
	task.failureReason = null;
	task.lastError = null;
	task.infraRetryCount = 0;

	// The rehydration marker is single-attempt. Consume it on pass so a
	// later interruption at a DIFFERENT stage can never mistake this
	// attempt's marker for its own. `reviewBaseline.mergedAt` (the no-rewind
	// landed marker) is deliberately untouched.
	if (kind === "merge") {
		// `delete` (not `= undefined`): an explicit-undefined key still
		// serialises into frontmatter noise and would read as "marker
		// present but empty" to any future presence check. `delete` also
		// keeps `hasRehydrationMarkers` honest for later stages.
		delete task.mergeAttemptId;
		delete task.preMergeMainSha;
	}
	task.history.push({
		timestamp: new Date().toISOString(),
		action: historyAction || `${label} stage passed (exit code 0)`,
	});
	store._saveTaskMarkdown(cwd, task);
	store.advanceStage(projectId, taskId, stages, bridge, cwd);
	return {
		task: store.getTask(projectId, taskId) || task,
		stageType: kind,
		status: "passed",
		exitCode: 0,
		stdout,
		stderr,
	};
}

/***
 * MARK: buildCommandKeywordContext
 * @description Builds the keyword context for one command-stage run: the
 *   same shared builder the agent prompt engine uses, pointed at this
 *   task/stage/project, plus the stage's skill custom keywords. Never
 *   throws — a failing skill lookup degrades to no custom keywords so
 *   interpolation can never block stage execution.
 * @example buildCommandKeywordContext({ task: { id: 't1' }, projectCwd: '/repo' }).task.id => 't1'
 * @param {Object} [args]
 * @param {Object} [args.task] - Task entity (reports, goal).
 * @param {Object} [args.stage] - Stage entity (name, skills).
 * @param {Object|null} [args.project] - Project record, if known.
 * @param {string|null} [args.projectCwd] - Primary project checkout (owns the task record).
 * @returns {Object} Context object for `interpolatePromptKeywords`.
 ***/
export function buildCommandKeywordContext(
	args = {},
) {
	const safeArgs = args && typeof args === "object" && !Array.isArray(args) ? args : {};
	const task =
		safeArgs.task && typeof safeArgs.task === "object" && !Array.isArray(safeArgs.task)
			? safeArgs.task
			: {};
	const stage =
		safeArgs.stage && typeof safeArgs.stage === "object" && !Array.isArray(safeArgs.stage)
			? safeArgs.stage
			: {};
	const project =
		safeArgs.project && typeof safeArgs.project === "object" && !Array.isArray(safeArgs.project)
			? safeArgs.project
			: null;
	const projectCwd = safeArgs.projectCwd ?? null;

	const context = buildInterpolationContext({
		task,
		stage,
		project: project || undefined,
		projectCwd: projectCwd || undefined,
	});
	let customKeywords = null;
	try {
		customKeywords = resolveStageCustomKeywords(
			stage,
			context.projectCwd || null,
		);
	} catch {
		customKeywords = null;
	}
	if (customKeywords) {
		context.customKeywords = customKeywords;
	}
	return context;
}

/***
 * MARK: expandStageCommand
 * @description Expands `{{...}}` keyword tokens in a configured stage
 *   command using the run's keyword context. Pure string interpolation:
 *   unknown tokens stay literal so misconfiguration fails visible in logs,
 *   and any interpolation error falls back to the raw command (fail-open —
 *   the command still executes).
 * @example expandStageCommand('test -f "{{taskDocs}}plan.md"', { task: { id: 't1' }, projectCwd: '/repo' }) => 'test -f "/repo/docs/tasks/t1/plan.md"'
 * @param {*} rawCommand - Configured command (`stage.command || stage.script || defaultCommand`).
 * @param {Object} [keywordContext] - Context from `buildCommandKeywordContext`.
 * @returns {*} The expanded command, or the input unchanged.
 ***/
export function expandStageCommand(rawCommand, keywordContext = {}) {
	if (!rawCommand || typeof rawCommand !== "string") return rawCommand;
	const context =
		keywordContext && typeof keywordContext === "object" && !Array.isArray(keywordContext)
			? keywordContext
			: {};
	try {
		return interpolatePromptKeywords(rawCommand, context);
	} catch {
		return rawCommand;
	}
}

/***
 * MARK: buildCommandStageEnv
 * @description Execution environment for a command-stage child process:
 *   the sanitized base from `buildStageEnv` plus one `KAINBAIN_*` variable
 *   per keyword, resolved from the SAME context as command interpolation so
 *   env values and expanded commands can never disagree. Scripts that need
 *   values with spaces/shell metacharacters should read the env vars
 *   instead of relying on interpolated quoting.
 * @example buildCommandStageEnv('/repo', 't1', { task: { id: 't1' } }).KAINBAIN_TASK_ID => 't1'
 * @param {string} execCwd - Directory the command executes in.
 * @param {string} taskId - Task id.
 * @param {Object} [keywordContext] - Context from `buildCommandKeywordContext`.
 * @returns {Object} Environment object for the spawned child.
 ***/
export function buildCommandStageEnv(execCwd, taskId, keywordContext = {}) {
	const env = buildStageEnv(execCwd, taskId);
	const context =
		keywordContext && typeof keywordContext === "object" && !Array.isArray(keywordContext)
			? keywordContext
			: {};
	try {
		const valueOf = (template) =>
			interpolatePromptKeywords(template, context);
		env.KAINBAIN_PROJECT = valueOf("{{project}}");
		env.KAINBAIN_PROJECT_ROOT = valueOf("{{projectRoot}}");
		env.KAINBAIN_TASK_ID = valueOf("{{taskId}}");
		env.KAINBAIN_TASK_DOCS = valueOf("{{taskDocs}}");
		env.KAINBAIN_STAGE_NAME = valueOf("{{stageName}}");
		env.KAINBAIN_TASK_GOAL = valueOf("{{taskGoal}}");
		env.KAINBAIN_TASK_REPO = valueOf("{{taskRepo}}");
		env.KAINBAIN_REPORTS = valueOf("{{previousReports}}");
		env.KAINBAIN_LATEST_REPORT = valueOf("{{latestReportPath}}");
	} catch {
		// Env injection is advisory: the base sanitized env above still stands.
	}
	return env;
}

/***
 * MARK: runCommandStage
 * @description Shared execution engine for bash-command stages. Command
 *   stages honour stage.runOnBranch with a uniform contract ('task' default
 *   | 'primary' | 'custom'): primary/custom run the command in the primary
 *   checkout guarded onto the resolved branch and restore the default
 *   branch afterwards (see withCheckedOutBranch), and deliberately skip
 *   task-branch finalize — a verification run must never commit or push
 *   onto the primary/custom branch. 'task' (also the default for an unset
 *   value) runs the command from the task's execution directory — the
 *   task's isolated worktree when one is provisioned, the primary checkout
 *   otherwise.
 ***/
export async function runCommandStage(
	store,
	projectId,
	taskId,
	stage,
	{
		stages = [],
		cwd,
		bridge = store.eventBridge,
		projectName,
		execRunner,
		kind,
		label,
		logTag,
		reportTitle,
		statusValue,
		defaultCommand,
		failureOpts = null,
	} = {},
) {
	const task = store.getTask(projectId, taskId);
	if (!task) return null;
	const stageType = String(stage.type || kind).toLowerCase();
	// The authored template. Keyword tokens (`{{taskDocs}}`, `{{projectRoot}}`,
	// `{{latestReportPath:<slug>}}`, …) are expanded into `command` below;
	// the continuity plugin's deploy operation key deliberately keeps this
	// raw form — it is an idempotency hint, not execution identity.
	const rawCommand = stage.command || stage.script || defaultCommand || "";
	const commandProject = lookupProject(store, projectId) || undefined;
	const timeout = resolveStageTimeout(stage, kind || stageType, config, commandProject);
	// Worktree isolation: work-stage shell commands execute inside the
	// task's isolated worktree when one is provisioned, and every metadata
	// write below keeps using `cwd` (the primary owns the record).
	// runOnBranch then redirects: 'primary'/'custom' detach onto that branch
	// below via withCheckedOutBranch.
	let execCwd = await resolveCommandExecutionCwd(store, { kind, task, cwd });
	let ciBranchPlan = { mode: "task", branch: null };
	let ciBranchSha = null;

	const useBranches = !!store._isBranchModeEnabled?.(projectId);
	const capturesStageBoundary = kind === "ci" || kind === "script";
	if (useBranches && capturesStageBoundary) {
		task.currentStageStartSha = null;
		task.currentStageEndSha = null;
		if (
			typeof task.humanCheckpointStartSha === "string" &&
			task.humanCheckpointStartSha.trim()
		) {
			task.currentStageStartSha = task.humanCheckpointStartSha.trim();
		} else {
			task.currentStageStartSha = await safeResolveSha(
				cwd,
				resolveTaskBranch(task),
			);
		}
		task.humanCheckpointStartSha = null;
	}

	if (kind === "ci" || kind === "script") {
		try {
			ciBranchPlan = await resolveCiBranchPlan({ stage, cwd });
		} catch (planError) {
			return store.handleStageFailure(projectId, taskId, stage, planError, {
				stages,
				bridge,
				projectCwd: cwd,
				...(failureOpts || {}),
			});
		}
		if (ciBranchPlan.mode === "primary" || ciBranchPlan.mode === "custom") {
			execCwd = cwd || process.cwd();
			try {
				ciBranchSha = await resolveSha(cwd, ciBranchPlan.branch);
			} catch {
				ciBranchSha = null;
			}
		}
	}

	// Keyword interpolation runs on the primary checkout's record view
	// (`cwd` owns task markdown and reports; the worktree `execCwd` is only
	// where the shell runs). Fail-open: interpolation never blocks execution —
	// on any resolution error the configured command runs unchanged and the
	// tokens stay literal in the logs so the failure is obvious.
	let keywordContext = {};
	let command = rawCommand;
	try {
		keywordContext = buildCommandKeywordContext({
			task,
			stage,
			project: commandProject || null,
			projectCwd: cwd || execCwd || null,
		});
		command = expandStageCommand(rawCommand, keywordContext);
	} catch (err) {
		keywordContext = {};
		command = rawCommand;
		_appendProcessLog(
			task,
			`[${logTag}] Keyword expansion skipped (${err?.message || err}); running configured command unchanged`,
		);
	}
	const commandExpanded =
		typeof rawCommand === "string" && command !== rawCommand;

	store.updateTask(projectId, taskId, { status: statusValue }, cwd);
	task.history.push({
		timestamp: new Date().toISOString(),
		action: `Running ${label} command: ${command}`,
	});
	if (commandExpanded) {
		_appendProcessLog(task, `[${logTag}] Configured ${label} command: ${rawCommand}`);
	}
	_appendProcessLog(task, `[${logTag}] Starting ${label} command: ${command}`);
	if (ciBranchPlan.mode === "primary" || ciBranchPlan.mode === "custom") {
		_appendProcessLog(
			task,
			`[${logTag}] Running on ${ciBranchPlan.mode} branch '${ciBranchPlan.branch}' (detached from task branch)`,
		);
	}
	store._saveTaskMarkdown(cwd, task);

	// Generic lifecycle seam: every command stage announces entry the same
	// way, whether its command runs the deploy script or not. Installed
	// continuity plugins may record entry markers and contribute child
	// environment here; with no plugins this is a no-op. Never throws.
	let lifecycleEnv = {};
	try {
		const lifecycle = await emitStageLifecycle("stage:enter", {
			store,
			projectId,
			taskId,
			stage,
			kind,
			cwd: execCwd,
		});
		if (lifecycle && typeof lifecycle.env === "object") {
			lifecycleEnv = lifecycle.env;
		}
	} catch {
		lifecycleEnv = {};
	}

	bridge?.emitProcessEvent?.(projectId, "stage:enter", {
		taskId,
		stageId: stage.id,
		stageName: stage.name,
		stageType: kind,
		projectName,
	});
	bridge?.emitProcessEvent?.(projectId, "process:start", {
		taskId,
		stageId: stage.id,
		stageName: stage.name,
		stageType: kind,
		command,
		cwd: execCwd,
		projectName,
		branch: ciBranchPlan.branch,
		runOnBranch: ciBranchPlan.mode,
	});

	let stdout = "";
	let stderr = "";
	let exitCode = 0;
	let error = null;

	recordStageHeartbeat(store, taskId, { stageId: stage.id, kind });

	// Silence is not death: while a command-stage child runs, a keep-alive
	// ticker refreshes the stage heartbeat on an interval so a legitimately
	// quiet command (a long test gate, an install, a docker build) can never
	// be declared stalled by output silence alone. The hard `timeout` above
	// and the gate's per-branch timeouts remain the wedge guards.
	const liveness =
		kind === "ci" || kind === "script"
			? startStageHeartbeatTicker(store, taskId, {
					stageId: stage.id,
					kind,
					intervalMs: resolveCommandHeartbeatIntervalMs(stage, config),
				})
			: { stop() {} };

	const executeCommand = async () => {
		if (execRunner) {
			const onStdout = (chunk) => {
				recordStageHeartbeat(store, taskId, { stageId: stage.id, kind });
				stdout += chunk;
				bridge?.emitProcessEvent?.(projectId, "process:stdout", {
					taskId,
					chunk,
					projectName,
				});
			};
			const onStderr = (chunk) => {
				recordStageHeartbeat(store, taskId, { stageId: stage.id, kind });
				stderr += chunk;
				bridge?.emitProcessEvent?.(projectId, "process:stderr", {
					taskId,
					chunk,
					projectName,
				});
			};
			const sanitizedEnv = buildCommandStageEnv(execCwd, taskId, keywordContext);
			const result = await execRunner(command, {
				cwd: execCwd,
				timeout,
				onStdout,
				onStderr,
				env: sanitizedEnv,
			});
			if (result.stdout && !stdout) {
				stdout = result.stdout;
				bridge?.emitProcessEvent?.(projectId, "process:stdout", {
					taskId,
					chunk: stdout,
					projectName,
				});
			}
			if (result.stderr && !stderr) {
				stderr = result.stderr;
				bridge?.emitProcessEvent?.(projectId, "process:stderr", {
					taskId,
					chunk: stderr,
					projectName,
				});
			}
			exitCode = result.exitCode ?? 0;
			clearStageHeartbeat(store, taskId);
		} else {
			const { spawn } = await import("node:child_process");
			const onWindows = isWindows();
			const shell = resolveShell();
			const sanitizedEnv = buildCommandStageEnv(execCwd, taskId, keywordContext);
			const child = spawn(shell.file, [...shell.argsPrefix, command], {
				cwd: execCwd,
				detached: !onWindows,
				windowsHide: onWindows ? true : undefined,
				// Lifecycle-contributed environment (continuity plugins only;
				// empty for generic projects). The seam already filters to
				// non-empty string values; spreading cannot pollute the
				// prototype and keeps the base environment intact otherwise.
				env: {
					...sanitizedEnv,
					...(lifecycleEnv && typeof lifecycleEnv === "object" ? lifecycleEnv : {}),
				},
			});
			store._registerChild(taskId, child);
			child.stdout?.on("data", (d) => {
				recordStageHeartbeat(store, taskId, { stageId: stage.id, kind });
				const chunk = d.toString();
				stdout += chunk;
				bridge?.emitProcessEvent?.(projectId, "process:stdout", {
					taskId,
					chunk,
					projectName,
				});
			});
			child.stderr?.on("data", (d) => {
				recordStageHeartbeat(store, taskId, { stageId: stage.id, kind });
				const chunk = d.toString();
				stderr += chunk;
				bridge?.emitProcessEvent?.(projectId, "process:stderr", {
					taskId,
					chunk,
					projectName,
				});
			});
			let timedOut = false;
			const timer = setTimeout(() => {
				timedOut = true;
				store.killTaskProcess(taskId);
			}, timeout);
			if (timer.unref) timer.unref();
			await new Promise((resolve) => {
				let done = false;
				child.on("error", (err) => {
					if (!done) {
						done = true;
						error = err;
						exitCode = typeof err.code === "number" ? err.code : 1;
						resolve();
					}
				});
				child.on("close", (code, signal) => {
					if (!done) {
						done = true;
						if (typeof code === "number") {
							exitCode = code;
						} else if (signal) {
							exitCode = 1;
						} else {
							exitCode = 0;
						}
						resolve();
					}
				});
			});
			clearTimeout(timer);
			store._unregisterChild(taskId);
			clearStageHeartbeat(store, taskId);

			if (timedOut) {
				error = new Error(`${label} stage timed out after ${timeout}ms`);
				exitCode = 1;
			}
		}
	};

	try {
		if ((ciBranchPlan.mode === "primary" || ciBranchPlan.mode === "custom") && ciBranchPlan.branch) {
			await withCheckedOutBranch(cwd, ciBranchPlan.branch, executeCommand, {
				taskId,
				context: `CI stage '${stage.name || stage.id}' execution on '${ciBranchPlan.branch}'`,
			});
			const defBranch = await defaultBranch(cwd).catch(() => null);
			if (defBranch) {
				_appendProcessLog(task, `[GIT] Returned to '${defBranch}' after CI stage '${stage.name || stage.id}'`);
			}
		} else {
			await executeCommand();
		}
	} catch (err) {
		clearStageHeartbeat(store, taskId);
		error = err;
		exitCode = typeof err.code === "number" ? err.code : 1;
	} finally {
		// The keep-alive dies with the child on every exit path (success,
		// non-zero exit, spawn error, timeout kill, thrown runner) and always
		// BEFORE any terminal task update below — a ticker outliving its stage
		// could resurrect a finished stage's heartbeat.
		liveness.stop();
	}

	// A watchdog stall kill is the one failure that is not a command failure:
	// surface the stall context (if fresh and this stage's) as an explicit
	// banner so the report can never masquerade as an ordinary test failure.
	const stallKill = consumeStallKill(task, { stageId: stage.id });

	_appendProcessLog(
		task,
		`[${logTag}] Process exited with code ${exitCode}${error ? ` (${error.message})` : ""}`,
	);
	if (stdout) _appendProcessLog(task, `[STDOUT]\n${stdout}`);
	if (stderr) _appendProcessLog(task, `[STDERR]\n${stderr}`);

	bridge?.emitProcessEvent?.(projectId, "process:exit", {
		taskId,
		stageId: stage.id,
		stageName: stage.name,
		stageType: kind,
		exitCode,
		error: error ? error.message : null,
		projectName,
	});

	const passed = exitCode === 0 && !error;
	const reportLines = [
		`# ${reportTitle}: ${stage.name || stage.id}`,
		...(commandExpanded
			? [
					`**Command (configured):** \`${rawCommand}\``,
					`**Command (expanded):** \`${command}\``,
				]
			: [`**Command:** \`${command}\``]),
	];
	if (ciBranchPlan.mode !== "task" && ciBranchPlan.branch) {
		reportLines.push(
			`**Branch:** ${ciBranchPlan.branch} (${ciBranchPlan.mode})${ciBranchSha ? ` @ ${ciBranchSha}` : ""}`,
		);
	}
	reportLines.push(
		`**Exit Code:** ${exitCode}${stallKill ? " (synthetic — the process was terminated by the stall watchdog, no command exit occurred)" : ""}`,
		`**Status:** ${passed ? "PASSED" : "FAILED"}`,
		"",
	);
	if (stallKill) {
		const lastProgress = lastStillRunningLine(stdout);
		reportLines.push(
			`> ⚠️ Killed by the stall watchdog: no output for ${stallKill.silenceMs}ms (threshold ${stallKill.thresholdMs}ms; stage timeout ${stallKill.stageTimeoutMs ?? "n/a"}ms). The command was terminated while it was still running — this is not a test failure verdict.`,
			...(lastProgress
				? [`> Last progress from the gate: \`${lastProgress}\``]
				: []),
			"",
		);
	}
	if (stdout) {
		reportLines.push("### Output", "```", stdout, "```", "");
	}
	if (stderr) {
		reportLines.push("### Errors", "```", stderr, "```", "");
	}
	if (error) {
		reportLines.push(`**Error:** ${error.message}`, "");
	}

	store.saveStageReport(projectId, taskId, {
		stageName: stage.name || stage.id,
		stageId: stage.id,
		duration: stageElapsedSeconds(task),
		status: exitCode === 0 ? "PASSED" : "FAILED",
		content: reportLines.join("\n"),
		projectCwd: cwd,
	});

	if (passed) {
		// CI work stages own the full task-branch lifecycle: commit the
		// command's output, push when a remote exists, return to the default
		// branch.
		if (
			kind === "ci" &&
			ciBranchPlan.mode === "task" &&
			typeof store._isBranchModeEnabled === "function" &&
			store._isBranchModeEnabled(projectId)
		) {
			const finalSummary = await store.finalizeTaskBranch(task, cwd, {
				bridge,
				stageName: stage.name || stage.id,
				startSha: task.currentStageStartSha,
			});
			const boundaryStart =
				task.currentStageStartSha || finalSummary?.startSha || null;
			const boundaryEnd = finalSummary?.endSha || null;
			if (boundaryStart && boundaryEnd) {
				task.currentStageStartSha = boundaryStart;
				task.currentStageEndSha = boundaryEnd;
				const stageLabel = stage.name || stage.id;
				const rows = task.timeline.filter(
					(r) => String(r?.stage ?? "") === String(stageLabel),
				);
				let targetRow = rows.length ? rows[rows.length - 1] : null;
				if (!targetRow) {
					store._recordTimeline(task, {
						stage: stageLabel,
						status: "Advanced",
						duration: "--",
						timestamp: new Date().toISOString(),
					});
					targetRow =
						task.timeline && task.timeline.length
							? task.timeline[task.timeline.length - 1]
							: null;
				}
				if (targetRow) {
					targetRow.boundaryStartSha = boundaryStart;
					targetRow.boundaryEndSha = boundaryEnd;
					try {
						const stat = await getCommitRangeDiffStat(cwd, boundaryStart, boundaryEnd);
						if (stat) {
							targetRow.additions = stat.additions;
							targetRow.deletions = stat.deletions;
							targetRow.baseAdditions = stat.additions;
							targetRow.baseDeletions = stat.deletions;
						}
					} catch {
						// Range stays persisted for deferred attribution.
					}
				}
			}
			task.currentStageStartSha = null;
			task.currentStageEndSha = null;
			if (finalSummary?.commitError) {
				const commitError = new Error(
					`Auto-commit after ${label} stage '${stage.name || stage.id}' failed: ${finalSummary.commitError}`,
				);
				return store.handleStageFailure(projectId, taskId, stage, commitError, {
					stages,
					bridge,
					projectCwd: cwd,
				});
			}
			if (finalSummary?.returnError) {
				const returnError = new Error(
					`Could not return to the default branch after ${label} stage '${stage.name || stage.id}': ${finalSummary.returnError}`,
				);
				return store.handleStageFailure(projectId, taskId, stage, returnError, {
					stages,
					bridge,
					projectCwd: cwd,
				});
			}
		} else if (kind === "ci" && ciBranchPlan.mode !== "task") {
			_appendProcessLog(
				task,
				`[GIT] ${label} ran on '${ciBranchPlan.branch}' — task-branch finalize skipped`,
			);
		}
		return await finalizePassedCommandStage(store, projectId, taskId, stage, {
			stages,
			cwd,
			bridge,
			kind,
			label,
			stdout,
			stderr,
		});
	}

	let stageError =
		error ||
		new Error(stderr || `${label} command failed with exit code ${exitCode}`);

	if (typeof exitCode === "number" && stageError.exitCode === undefined) {
		stageError.exitCode = exitCode;
	}
	if (stdout && !stageError.stdout) stageError.stdout = stdout;
	if (stderr && !stageError.stderr) stageError.stderr = stderr;
	// Failure-path absorption guard (plan §2.2): bound the failed command's
	// partial work before failback routing so the next stage measures only
	// its own range. Never throws; routing below sees the original error.
	try {
		await commitFailedStageWork(store, task, cwd, {
			stageName: stage?.name || stage?.id,
		});
	} catch {
		// Best-effort: failure routing continues regardless.
	}
	return store.handleStageFailure(projectId, taskId, stage, stageError, {
		stages,
		bridge,
		projectCwd: cwd,
		...(failureOpts || {}),
	});
}

/***
 * MARK: resolveTaskExecutionCwd
 * @description Resolves the directory a work-stage command executes in: the
 *   task's isolated worktree when `workspaceIsolation: 'worktree'` is set
 *   and the worktree exists (provisioned at pickup), otherwise the primary
 *   checkout. Never throws and never provisions — a missing worktree simply
 *   falls back to the primary checkout so stages keep running.
 * @example await resolveTaskExecutionCwd(store, task, '/repo') => '/repo'
 * @param {Object} store - Task store (carries `.projectStore`).
 * @param {Object} task - Task entity.
 * @param {string} cwd - Primary project checkout.
 * @returns {Promise<string|null>} Execution directory (or null).
 ***/
export async function resolveTaskExecutionCwd(store, task, cwd) {
	try {
		const project = store?.projectStore?.getProject?.(task?.projectId);
		if (project?.workspaceIsolation !== "worktree") return cwd || null;
		const { resolveTaskCwd } = await import("../work/taskWorkspace.js");
		const taskCwd = await resolveTaskCwd(store, task, cwd);
		if (!taskCwd || taskCwd === cwd) return cwd || null;
		const { existsSync } = await import("node:fs");
		return existsSync(taskCwd) ? taskCwd : cwd || null;
	} catch {
		return cwd || null;
	}
}

/***
 * MARK: lookupProject
 * @description Exception-tolerant project lookup shared by the stage
 *   helpers. Project metadata is advisory only (timeout overrides, custom
 *   docs-link ignore lists), so a throwing project store must never fail a
 *   stage run itself.
 * @example lookupProject(store, 'proj-1') => project|null
 * @param {Object} store - Task store that may carry a `projectStore`.
 * @param {string} projectId - Project id to resolve.
 * @returns {Object|null} The project or `null` (advisory lookups only).
 ***/
function lookupProject(store, projectId) {
	try {
		return store?.projectStore?.getProject
			? store.projectStore.getProject(projectId)
			: null;
	} catch {
		return null;
	}
}

/***
 * MARK: resolveMergeLandedEvidence
 * @description Decides, before any checkout/commit/measurement, whether the
 *   merge already landed on a previous run. Evidence is the frozen
 *   `reviewBaseline.mergedAt` marker for this stage id, the pruned-branch
 *   form of it (marker present but the task branch is gone — nothing left
 *   to integrate), OR git ancestry proving the branch HEAD already sits on
 *   the main branch (marker lost to a restart mid-merge or an outside
 *   merge). A failed ancestry read stays fail-closed (`ancestryLanded:
 *   false`): without marker or proof, an empty branch still refuses.
 *   Only the ancestry read is exception-tolerant (fail-closed to
 *   `ancestryLanded: false`); branch-listing and marker failures propagate
 *   to the caller exactly as before.
 * @example await resolveMergeLandedEvidence(store, { task, stage, cwd, branch, mainBranch })
 *   => { landedMarker: false, ancestryLanded: true, landed: true, branchPrunedSinceMerge: false }
 * @param {Object} _store - Reserved for signature stability (currently unused;
 *   the evidence is derived from the task markers and git only).
 * @param {Object} args
 * @param {Object} args.task
 * @param {Object} args.stage
 * @param {string} args.cwd
 * @param {string} args.branch - Task branch name.
 * @param {string} args.mainBranch - Integration branch name.
 * @returns {Promise<{landedMarker: boolean, ancestryLanded: boolean, landed: boolean, branchPrunedSinceMerge: boolean}>}
 ***/
export async function resolveMergeLandedEvidence(
	_store,
	{ task, stage, cwd, branch, mainBranch } = {},
) {
	const landedMarker = isMergeLanded(task, { stageId: stage?.id });
	// A task branch pruned after its merge landed (manual `git branch -d`
	// housekeeping or a later cleanup pass) still counts as landed: there
	// is nothing left to integrate, so the stage finishes on main —
	// recreating nothing and failing back to nothing.
	if (!(await branchExists(cwd, branch))) {
		if (!landedMarker) {
			throw new GitError(
				`Task branch '${branch}' does not exist — there is no task work to merge. Re-run the preceding work stages first.`,
			);
		}
		return {
			landedMarker,
			ancestryLanded: false,
			landed: true,
			branchPrunedSinceMerge: true,
		};
	}
	// Ancestry evidence: the branch HEAD may already sit on the main
	// branch (merged by a previous run whose `reviewBaseline` marker was
	// lost — restart mid-merge, unpersisted write — or merged outside
	// the stage). Ancestry plus zero unique commits is the same landed
	// state as the frozen marker: the stage re-enters idempotently and
	// never refuses already-merged work as "no commits of its own"
	// (the ghost-task rewind to "In Progress"). A failed ancestry read
	// stays fail-closed: without marker or proof, empty still refuses.
	let ancestryLanded = false;
	if (!landedMarker) {
		try {
			ancestryLanded = await isBranchMergedInto(cwd, mainBranch, branch);
		} catch {
			ancestryLanded = false;
		}
	}
	return {
		landedMarker,
		ancestryLanded,
		landed: landedMarker || ancestryLanded,
		branchPrunedSinceMerge: false,
	};
}

/***
 * MARK: lastWorkStageOutcome
 * @description Best-effort one-liner for the ghost-task diagnostic: the most
 *   recent history action that is not about the merge stage itself (the last
 *   thing a work stage actually did). Never throws; degrades to a plain
 *   "no recorded outcome" note when history is empty.
 * @param {Object} [task] - Task entity with an optional history array.
 * @returns {string} Human one-liner for the diagnostic block.
 ***/
export function lastWorkStageOutcome(task) {
	const history = Array.isArray(task?.history) ? task.history : [];
	for (let i = history.length - 1; i >= 0; i -= 1) {
		const action = history[i]?.action;
		if (typeof action === "string" && action.trim() && !/merg/i.test(action)) {
			return action.trim().slice(0, 500);
		}
	}
	const last = history.length > 0 ? history[history.length - 1]?.action : null;
	if (typeof last === "string" && last.trim()) return last.trim().slice(0, 500);
	return "no recorded work-stage outcome";
}

/***
 * MARK: buildGhostTaskDiagnostic
 * @description Builds the structured ghost-task (zero unique commits) block
 *   for the Tier 3 failback prompt: names the empty branch, the integration
 *   branch, the landed-evidence state that was checked, and the last
 *   work-stage outcome — everything an agent needs to go produce work and
 *   retry, without ever attempting the doomed merge.
 * @example buildGhostTaskDiagnostic({ branch: 'kb/1', mainBranch: 'main', task }) => { message, diagnostics }
 * @param {Object} [args]
 * @param {string} [args.branch] - Empty task branch.
 * @param {string} [args.mainBranch] - Integration branch.
 * @param {Object} [args.task] - Task entity (history read for the last work-stage outcome).
 * @returns {{message: string, diagnostics: {kind: string, branch: string|null, mainBranch: string|null, uniqueCommits: number, landedEvidence: string, lastWorkStageOutcome: string}}}
 ***/
export function buildGhostTaskDiagnostic({ branch = null, mainBranch = null, task = null } = {}) {
	const outcome = lastWorkStageOutcome(task);
	const diagnostics = {
		kind: "ghost-task",
		branch: branch || null,
		mainBranch: mainBranch || null,
		uniqueCommits: 0,
		landedEvidence: "none (no reviewBaseline marker for this stage and branch is not an ancestor of main)",
		lastWorkStageOutcome: outcome,
	};
	const message =
		`Task branch '${branch}' has no commits of its own — there is no task work to merge (ghost task). ` +
		`Re-run the preceding work stages first.\n` +
		`Ghost-task diagnostics:\n` +
		`- Task branch: ${branch || "unknown"} (0 unique commits vs '${mainBranch || "unknown"}')\n` +
		`- Landed evidence: ${diagnostics.landedEvidence}\n` +
		`- Last work-stage outcome: ${outcome}\n` +
		`Produce task commits on '${branch || "the task branch"}' in the work stages, then retry the merge stage.`;
	return { message, diagnostics };
}

/***
 * MARK: mergeTaskBranchIntoMain
 * @description The git-merge half of the merge stage: verifies the project
 *   can merge, integrates the task branch into the default main branch, and
 *   freezes the PR-review baseline. Returns `{ mainBranch }`
 *   when the stage should continue to the publish step, or
 *   `{ handled: true, result }` when the stage already settled through
 *   `handleStageFailure` (merge conflict or a landed-reentry guard).
 *
 *   Failure domains (the no-rewind rule): a merge that never landed fails
 *   back exactly like any other stage (missing branch, dirty tree, empty
 *   branch, merge conflict). Once the merge HAS landed — the frozen
 *   `reviewBaseline.mergedAt` marker for this stage id, OR git ancestry
 *   proving the branch HEAD is already on the main branch — the stage is
 *   re-entered idempotently and every later failure parks the task `failed`
 *   on the merge stage (`skipFailback`) instead of rewinding merged work:
 *     - zero unique commits: skip the duplicate git merge;
 *     - pruned task branch: nothing to recreate, finish on main;
 *     - failing unique-commit read: ambiguous state, park with a clear
 *       reason — never rewind, never silently skip (unmerged work must stay
 *       visible as a failed retry, not a quiet pretend-pass).
 ***/
async function mergeTaskBranchIntoMain(
	store,
	{ projectId, taskId, task, stage, stages, cwd, bridge, branch },
) {
	const taskShortId = String(task.id).slice(0, 4).toUpperCase();
	// Main branch ref: resolved by this phase and consumed by the
	// post-merge publish step, so it must be returned on success.
	let mainBranch = null;
	// True once the landed re-entry path is taken (the merge already landed
	// on a previous run). Every failure after that must park the task on the
	// merge stage (skipFailback) instead of rewinding past merged work.
	let landedReentry = false;
	// Entry-time landed evidence (frozen marker OR git ancestry), decided
	// before any checkout/commit/measurement. Unlike `landedReentry` (the
	// skip-the-duplicate-merge decision, taken after the commit count so
	// genuinely new work still fresh-merges), this routes failures: any
	// failure once landed evidence exists — dirty-tree switch, ambiguous
	// count, main checkout — parks with skipFailback instead of rewinding.
	// Declared outside `try` so the `catch` can read it.
	let landedEvidence = false;
	try {
		if (!cwd || !(await isGitRepository(cwd))) {
			throw new GitError(
				"Project directory is not a git repository — a merge stage requires git. Enable branch support for this project or remove this stage.",
			);
		}
		if (!(await hasCommits(cwd))) {
			throw new GitError(
				"Repository has no commits — create an initial commit on the main branch before using a merge stage.",
			);
		}
		mainBranch = await defaultBranch(cwd);
		// Landed evidence (frozen marker OR git ancestry) is decided
		// IMMEDIATELY upon entry (before any checkout, commit, or
		// measurement) so the `catch` below can route every later failure
		// to skipFailback. The skip-the-duplicate-merge decision itself
		// (`landedReentry`) still waits for the commit count, so genuinely
		// new work on top of an older landed merge fresh-merges normally.
		const { landed, branchPrunedSinceMerge } = await resolveMergeLandedEvidence(store, {
			task,
			stage,
			cwd,
			branch,
			mainBranch,
		});
		landedEvidence = landed;
		if (branchPrunedSinceMerge) {
			landedReentry = true;
		}

		const branchBefore = await currentBranch(cwd);
		if (branchBefore !== branch) {
			// The project's custom docs link name (if any) must stay ignored
			// here, exactly like the `docs/tasks/` default — otherwise task
			// writes under e.g. `kainbain-docs/tasks/` would read as dirty
			// and block the switch. Missing store/project degrades to the
			// default ignore list (docsProjectFor-style tolerance).
			const mergeProject = lookupProject(store, projectId);
			// The merge stage refuses a dirty tree LOUDLY (recovery: 'off'):
			// the recovery ladder only runs on work-stage pickup, and here a
			// stray edit may be the operator's uncommitted review work —
			// stashing it would silently drop it from the merge the operator
			// asked for. Failing back keeps the work visible and recoverable.
			await requireCleanWorkingTree(cwd, {
				context: landed
					? `switching to '${mainBranch}' to finish an already-landed merge`
					: `switching to task branch '${branch}' before merge`,
				recovery: "off",
				...(mergeProject ? { project: mergeProject } : {}),
			});
			// Recreate nothing on a landed re-entry: the merge exists on main,
			// so a recreated task branch would only re-point an empty ref.
			if (!landedReentry) {
				await store.ensureTaskBranch(task, cwd, { bridge });
			}
		}

		// Auto-commit, then measure: fresh uncommitted work on the task branch
		// must count toward the merge decision, so the unique-commit check runs
		// after the auto-commit (and only while there is a branch to measure).
		if (!landedReentry) {
			const commitResult = await commitAllIfNeeded(
				cwd,
				`KainBain (task ${task.id}): commit task work before merge into main`,
				// Affinity guard: the shared checkout must still be on the task
				// branch. A concurrent task that moved HEAD here fails the merge
				// stage loudly instead of landing this task's files on a sibling
				// branch (the 2026-10-12 branch-bleed incident).
				{ expectedBranch: branch },
			);
			if (commitResult.committed) {
				_appendProcessLog(
					task,
					`[GIT] Auto-committed uncommitted task work on '${branch}' before merge (${commitResult.hash || "no hash"})`,
				);
				store._saveTaskMarkdown(cwd, task);
				bridge?.emitSystemLog?.(
					projectId,
					`[GIT] Task #KB-${taskShortId}: auto-committed pending work on '${branch}' before merge`,
					{ taskId },
				);
			}

			// Landed evidence (frozen marker or ancestry proof) plus zero
			// unique commits means this exact merge already landed: the
			// merge stage is being re-run (retry, resume after restart, or
			// failback from a later stage). With no landed evidence at all,
			// zero unique commits still means the work stages produced
			// nothing and the empty merge is refused.
			let uniqueCommits;
			try {
				uniqueCommits = await countUniqueCommits(cwd, mainBranch, branch);
			} catch (countError) {
				if (!landed) throw countError;
				// The marker says the merge landed, but the unique-commit read is
				// broken. Ambiguous state: never rewind past a landed merge, and
				// never silently skip either — park the task `failed` on the
				// merge stage with a clear reason so a manual retry re-measures
				// with a healthy git. (A quiet pretend-pass here could complete
				// the task with unmerged work.)
				landedReentry = true;
				throw new GitError(
					`Merge of '${branch}' into '${mainBranch}' already landed on a previous run, but the unique-commit check failed (${countError.message}) — retry the merge stage to re-measure with a healthy git; a landed merge is never rewound.`,
				);
			}
			if (uniqueCommits === 0 && !landed) {
				// Ghost-task fast path: the doomed merge is never attempted.
				// The structured diagnostic (empty branch, integration
				// branch, landed-evidence state, last work-stage outcome)
				// travels on the error into the Tier 3 failback prompt.
				const ghost = buildGhostTaskDiagnostic({ branch, mainBranch, task });
				const ghostError = new GitError(ghost.message);
				ghostError.gitDiagnostics = ghost.diagnostics;
				throw ghostError;
			}
			if (landed && uniqueCommits === 0) {
				// The duplicate merge is skipped; failure routing was
				// already armed by `landedEvidence` upon entry.
				landedReentry = true;
			}
		}

		// Stale-base signal (C6, warning-only): a task branch far behind the
		// default branch runs later verification stages against mostly-unseen
		// code, so a gate failure may have nothing to do with the task. The
		// divergence is reported, never acted on — promotion to an active
		// refresh needs an explicit decision. A failed read is "no signal",
		// never a merge failure.
		try {
			const behind =
				typeof countBehindCommits === "function"
					? await countBehindCommits(cwd, mainBranch, branch)
					: 0;
			if (Number.isInteger(behind) && behind >= STALE_BRANCH_WARNING_COMMITS) {
				const staleNote =
					`Task branch '${branch}' is ${behind} commits behind '${mainBranch}' — ` +
					`verification stages after the merge run against mostly-unseen code, so a failure may be unrelated to this task. ` +
					`Consider rebasing the task branch before retrying.`;
				task.history.push({
					timestamp: new Date().toISOString(),
					action: `Stale base warning: ${staleNote}`,
				});
				_appendProcessLog(task, `[WARN] ${staleNote}`);
				store._saveTaskMarkdown(cwd, task);
			}
		} catch {
			// No signal: proceed with the merge exactly as before.
		}

		recordStageHeartbeat(store, taskId, { stageId: stage.id, kind: "merge" });
		// Same strictness as the guard above: the tree was just verified clean
		// (or the commit step above cleaned it), so a dirty tree here means the
		// commit failed — refuse instead of stashing the work out of the merge.
		const checkoutResult = await checkoutBranch(cwd, mainBranch, {
			recovery: "off",
		});
		if (checkoutResult.switched) {
			_appendProcessLog(task, `[GIT] Switched to '${mainBranch}' for merge`);
			store._saveTaskMarkdown(cwd, task);
		}

		if (landedReentry) {
			const prunedNote = branchPrunedSinceMerge
				? ` — task branch '${branch}' has been pruned`
				: "";
			_appendProcessLog(
				task,
				`[MERGE] Merge of '${branch}' into '${mainBranch}' already landed${prunedNote} — skipping git merge`,
			);
			task.history.push({
				timestamp: new Date().toISOString(),
				action: `Merge of task branch '${branch}' into '${mainBranch}' already landed — skipped duplicate merge${branchPrunedSinceMerge ? " (task branch pruned)" : ""}`,
			});
			store._saveTaskMarkdown(cwd, task);
			return { mainBranch };
		}

		recordStageHeartbeat(store, taskId, { stageId: stage.id, kind: "merge" });
		// Pre-merge default-branch HEAD: the frozen `baseSha` for the
		// PR-review baseline (after the merge this ref has moved).
		const preMergeMainSha = await safeResolveSha(cwd, mainBranch);
		const mergeAttemptId = `merge-${taskId.slice(0, 8)}-${Date.now()}`;
		store.updateTask(
			projectId,
			taskId,
			{
				...(preMergeMainSha ? { preMergeMainSha } : {}),
				mergeAttemptId,
			},
			cwd,
		);
		task.preMergeMainSha = preMergeMainSha || task.preMergeMainSha;
		task.mergeAttemptId = mergeAttemptId;
		store._saveTaskMarkdown(cwd, task);

		try {
			recordStageHeartbeat(store, taskId, { stageId: stage.id, kind: "merge" });
			await mergeBranch(cwd, branch);
		} catch (e) {
			if (e instanceof GitMergeConflictError) {
				// Structured Tier 3 payload: file list + source/target SHAs
				// + strategy travel both as fields and as a rendered block in
				// the message (the prompt surface reads failureReason first).
				const { block, diagnostics } = buildGitConflictDiagnostics({
					taskBranch: branch,
					mainBranch,
					sourceSha: e.sourceSha,
					targetSha: e.targetSha,
					baseSha: e.baseSha,
					strategy: e.strategy,
					conflictedFiles: e.conflictedFiles,
				});
				const conflictError = new Error(`${e.message}\n${block}`);
				conflictError.conflictedFiles = e.conflictedFiles;
				conflictError.taskBranch = branch;
				conflictError.mainBranch = mainBranch;
				conflictError.sourceSha = e.sourceSha || null;
				conflictError.targetSha = e.targetSha || null;
				conflictError.baseSha = e.baseSha || null;
				conflictError.strategy = e.strategy || null;
				conflictError.gitDiagnostics = { kind: "merge-conflict", ...diagnostics };
				conflictError.stdout = e.stdout;
				conflictError.stderr = e.stderr;
				return {
					handled: true,
					result: store.handleStageFailure(projectId, taskId, stage, conflictError, {
						stages,
						bridge,
						projectCwd: cwd,
					}),
				};
			}
			throw e;
		}

		_appendProcessLog(
			task,
			`[MERGE] Merged '${branch}' into '${mainBranch}' successfully`,
		);

		// Audit any stale lock the gated merge ops above auto-cleared, plus
		// any dirty-tree ladder run the pre-merge guard triggered.
		try {
			const mergeRecoveries = (await drainGitLockRecoveries(cwd)) || [];
			for (const entry of mergeRecoveries) {
				const detail = formatGitLockRecoveryNotice(entry);
				task.history.push({
					timestamp: new Date().toISOString(),
					action: detail,
				});
				_appendProcessLog(task, `[GIT] ${detail}`);
			}
			const ladderRuns = (await drainDirtyTreeRecoveries(cwd)) || [];
			for (const entry of ladderRuns) {
				const detail = formatDirtyTreeRecoveryNotice(entry);
				task.history.push({
					timestamp: new Date().toISOString(),
					action: detail,
				});
				_appendProcessLog(task, `[GIT] ${detail}`);
			}
			if (mergeRecoveries.length > 0 || ladderRuns.length > 0)
				store._saveTaskMarkdown(cwd, task);
		} catch {
			// Audit is best-effort; the merge above already succeeded.
		}

		task.history.push({
			timestamp: new Date().toISOString(),
			action: `Merged task branch '${branch}' into '${mainBranch}'`,
		});
		store._saveTaskMarkdown(cwd, task);
		// Freeze the SHAs behind this merge for PR-review preservation
		// (data-only; the review payload decides whether to show them).
		// Best-effort: a baseline failure must never fail the merge itself.
		try {
			await recordReviewBaseline(store, {
				projectId,
				taskId,
				task,
				cwd,
				branch,
				mainBranch,
				preMergeMainSha,
				stageId: stage.id,
			});
		} catch {
			// Baseline capture is advisory; the merge already succeeded.
		}
		bridge?.emitSystemLog?.(
			projectId,
			`[GIT] Task #KB-${taskShortId}: merged '${branch}' into '${mainBranch}'`,
			{ taskId },
		);
		return { mainBranch };
	} catch (e) {
		const result = store.handleStageFailure(projectId, taskId, stage, e, {
			stages,
			bridge,
			projectCwd: cwd,
			// A landed merge never rewinds: once landed evidence exists
			// (entry decision) or the re-entry path is taken, any failure
			// (dirty-tree switch, clean tree, ambiguous commit count,
			// main checkout) parks the task `failed` on the merge stage.
			...((landedReentry || landedEvidence) ? { skipFailback: true } : {}),
		});
		return { handled: true, result };
	}
}

/***
 * MARK: executeMergeStage
 * @description Integrates the task branch into the default main branch —
 *   git operations ONLY. The stage owns one explicit failure domain: the git
 *   merge (mergeTaskBranchIntoMain). A merge that never landed fails back
 *   exactly like any other stage (missing branch, dirty tree, empty branch,
 *   merge conflict). Once a merge HAS landed it is never rewound — re-entering
 *   is idempotent (landed evidence: the frozen reviewBaseline marker or git
 *   ancestry — plus zero unique commits skips the duplicate git merge), a
 *   task branch pruned after the merge finishes the same way without
 *   recreating it, and any later failure in the landed state parks the task
 *   `failed` on the merge stage (skipFailback) for a manual retry.
 *   After a landed merge the stage auto-commits on the integrated default
 *   branch (warn-only), pushes it when a remote exists (warn-only), records
 *   the review baseline, and advances. No post-merge command is ever
 *   executed: a following command stage runs its own command, so git
 *   failures and command failures can never mix again.
 * @example await executeMergeStage(store, { projectId, taskId, stage, cwd }) => { status: "passed" }
 * @param {Object} store
 * @param {Object} [args]
 * @param {string} [args.projectId]
 * @param {string} [args.taskId]
 * @param {Object} [args.stage]
 * @param {Array} [args.stages]
 * @param {string} [args.cwd]
 * @param {Object} [args.bridge]
 * @param {string} [args.projectName]
 * @returns {Promise<Object|null>} Stage result tuple ({ task, stageType, status }).
 ***/
export async function executeMergeStage(
	store,
	{
		projectId,
		taskId,
		stage,
		stages = [],
		cwd,
		bridge = store.eventBridge,
		projectName,
	} = {},
) {
	const task = store.getTask(projectId, taskId);
	if (!task) return null;
	const branch = store.resolveTaskBranch(task);
	const taskShortId = String(task.id).slice(0, 4).toUpperCase();

	recordStageHeartbeat(store, taskId, { stageId: stage.id, kind: "merge" });

	store.updateTask(projectId, taskId, { status: "running_merge" }, cwd);
	task.history.push({
		timestamp: new Date().toISOString(),
		action: `Running merge stage: integrating '${branch}' into the main branch`,
	});
	_appendProcessLog(
		task,
		`[MERGE] Starting merge of '${branch}' into the main branch`,
	);
	store._saveTaskMarkdown(cwd, task);

	bridge?.emitProcessEvent?.(projectId, "stage:enter", {
		taskId,
		stageId: stage.id,
		stageName: stage.name,
		stageType: "merge",
		projectName,
	});

	const mergePhase = await mergeTaskBranchIntoMain(store, {
		projectId,
		taskId,
		task,
		stage,
		stages,
		cwd,
		bridge,
		branch,
	});
	if (mergePhase.handled) return mergePhase.result;
	const { mainBranch } = mergePhase;

	// Auto-commit any straggler output on the integrated default branch.
	// Affinity-guarded: a concurrent task that moved the shared checkout
	// must never receive this commit. A mismatch is a warn-only skip —
	// the merge already landed, so it cannot fail the stage.
	try {
		await commitAllIfNeeded(
			cwd,
			`KainBain (task ${task.id}): auto-commit post-merge output on '${mainBranch}'`,
			{ expectedBranch: mainBranch },
		);
	} catch (commitError) {
		const detail = `Warning: post-merge auto-commit on '${mainBranch}' skipped (${
			commitError?.message || commitError
		}) — merge still passes`;
		task.history.push({
			timestamp: new Date().toISOString(),
			action: detail,
		});
		_appendProcessLog(task, `[WARN] ${detail}`);
		store._saveTaskMarkdown(cwd, task);
	}
	// Publish the integrated default branch when a remote exists. A
	// failed push stays a warning: the merge itself already passed.
	try {
		const pushRes = await pushBranchIfRemote(cwd, mainBranch);
		if (pushRes?.pushed) {
			const detail = `Pushed '${mainBranch}' to remote after merge`;
			task.history.push({
				timestamp: new Date().toISOString(),
				action: detail,
			});
			_appendProcessLog(task, `[GIT] ${detail}`);
			bridge?.emitSystemLog?.(
				projectId,
				`[GIT] Task #KB-${taskShortId}: pushed '${mainBranch}' to remote after merge`,
				{ taskId },
			);
		} else if (pushRes?.skipped === "no-remote") {
			_appendProcessLog(
				task,
				`[GIT] No remote configured — skipped push of '${mainBranch}' after merge`,
			);
		}
		store._saveTaskMarkdown(cwd, task);
	} catch (pushError) {
		const detail = `Warning: push of '${mainBranch}' after merge failed (${pushError?.message || pushError}) — merge still passes`;
		task.history.push({
			timestamp: new Date().toISOString(),
			action: detail,
		});
		_appendProcessLog(task, `[WARN] ${detail}`);
		store._saveTaskMarkdown(cwd, task);
	}

	// The merge-stage report is command-less by design: branches, landed
	// baseline, and nothing else — a merge stage never runs a command.
	const reportContent = [
		`# Merge Stage Report: ${stage.name || stage.id}`,
		`**Task branch:** ${branch}`,
		`**Main branch:** ${mainBranch}`,
		`**Status:** PASSED`,
		`**Landed at:** ${task.reviewBaseline?.mergedAt || new Date().toISOString()}`,
	].join("\n");

	return await finalizePassedCommandStage(store, projectId, taskId, stage, {
		stages,
		cwd,
		bridge,
		kind: "merge",
		label: "Merge",
		reportContent,
		historyAction: `Merge stage passed: '${branch}' integrated into '${mainBranch}'`,
	});
}
