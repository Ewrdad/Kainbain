// Domain: The Work — post-stage finalisation of a task branch.
import fs from "node:fs";
import {
	branchExists,
	checkoutBranch,
	commitAllIfNeeded,
	currentBranch,
	drainDirtyTreeRecoveries,
	drainGitLockRecoveries,
	formatDirtyTreeRecoveryNotice,
	formatGitLockRecoveryNotice,
	getWorkingTreeStatus,
	GitBranchMismatchError,
	isGitRepository,
	pushBranchIfRemote,
	returnToDefaultBranch,
	resolveSha,
} from "../git.js";
import { resolveDocsDirName } from "../docsPath.js";
import { resolveKainbainDirName } from "../kainbainDir.js";
import { resolveTaskBranch, syncMainToRemoteBestEffort } from "./taskBranches.js";
import { resolveTaskBaseBranch } from "./taskBaseBranch.js";
import { resolveTaskCwd } from "./taskWorkspace.js";
import { resolveAttestationStage } from "./resolveAttestationStage.js";
import { _appendProcessLog } from "../watch/index.js";
import {
	appendAttestationTrailers,
	attachAttestationToEntry,
	hashStageConfig,
} from "../../shared/stageAttestation.js";

/***
 * MARK: STAGE_COMMIT_BODY_MAX_CHARS
 * @description Maximum commit-body size for the curated prompt attached to a
 *   stage auto-commit. Curated prompts carry injected skill text (capped by
 *   `stageSkillsMaxChars`, 16 KB by default) plus task/stage sections, so real
 *   prompts are a few KB; 100 KB stays far below argv limits while bounding
 *   `git log` and push payloads. Oversized prompts are truncated with a
 *   `[truncated …]` marker rather than failing the commit.
 ***/
export const STAGE_COMMIT_BODY_MAX_CHARS = 100 * 1024;

/***
 * MARK: STAGE_COMMIT_GOAL_SUBJECT_CHARS
 * @description How much of the task goal's first line is appended to the
 *   commit subject (after an em dash) so `git log --oneline` stays scannable
 *   once the full curated prompt moves into the commit body.
 ***/
export const STAGE_COMMIT_GOAL_SUBJECT_CHARS = 100;

/***
 * MARK: buildStageCommitMessage
 * @description Builds the auto-commit message for a finished stage as a
 *   subject/body pair: a one-line human subject
 *   (`KainBain (task <id>): auto-commit work after stage '<stage>'`, extended
 *   with the task goal's first line when one exists) plus, when `task.prompt`
 *   holds this stage's curated prompt, the whole prompt verbatim as the body —
 *   so `git log` on a task branch reads as a changelog of what happened.
 *   Oversized prompts are truncated at STAGE_COMMIT_BODY_MAX_CHARS (code-point
 *   safe) with a `[truncated …]` marker. A missing, blank, or non-string
 *   prompt falls back to the legacy subject-only message (tasks predating
 *   prompt storage, command stages without curation, unit doubles).
 * @example buildStageCommitMessage({ id: 't1', goal: 'Fix login', prompt: '# Task\n…' }, 'Plan')
 *   => { subject: "KainBain (task t1): auto-commit work after stage 'Plan' — Fix login", body: '# Task\n…' }
 * @example buildStageCommitMessage({ id: 't1' }, 'Plan')
 *   => { subject: "KainBain (task t1): auto-commit work after stage 'Plan'", body: null }
 * @param {Object} task - The task entity (reads `id`, `goal`, `prompt`).
 * @param {string} [stageLabel] - Stage name; falls back to `"stage"`.
 * @returns {{subject: string, body: string|null}}
 ***/
export function buildStageCommitMessage(task, stageLabel) {
	const stage =
		typeof stageLabel === "string" && stageLabel.trim()
			? stageLabel
			: "stage";
	let subject = `KainBain (task ${task?.id}): auto-commit work after stage '${stage}'`;
	const goalFirstLine =
		typeof task?.goal === "string"
			? task.goal
					.split("\n")
					.map((line) => line.trim())
					.find((line) => line.length > 0)
			: null;
	if (goalFirstLine) {
		const clipped =
			goalFirstLine.length > STAGE_COMMIT_GOAL_SUBJECT_CHARS
				? `${[...goalFirstLine].slice(0, STAGE_COMMIT_GOAL_SUBJECT_CHARS - 3).join("")}...`
				: goalFirstLine;
		subject += ` — ${clipped}`;
	}
	const prompt = task?.prompt;
	if (typeof prompt !== "string" || !prompt.trim()) {
		return { subject, body: null };
	}
	if ([...prompt].length > STAGE_COMMIT_BODY_MAX_CHARS) {
		const clipped = [...prompt]
			.slice(0, STAGE_COMMIT_BODY_MAX_CHARS)
			.join("");
		return {
			subject,
			body: `${clipped}\n\n[truncated: curated prompt was ${[...prompt].length} chars, showing first ${STAGE_COMMIT_BODY_MAX_CHARS}]`,
		};
	}
	return { subject, body: prompt };
}

/***
 * MARK: finalizeTaskBranch
 * @description Completes the per-task branch lifecycle after a work stage
 *   (agent or CI/script completion — human approvals never finalise, see
 *   ensureTaskBranchRef): commits all changes on the task branch, pushes the
 *   task branch when a remote exists, then switches back to the task's
 *   pipeline base branch so no stage ends stranded on a task branch.
 *   Pure-local repositories skip the push silently; a failed push is a
 *   process-log warning and never fails the stage. Every step is attempted
 *   even when an earlier step failed, so a blocked return is reported loudly
 *   (`returnError`) instead of stranding the tree silently. Never throws for
 *   git failures — work-stage callers inspect `returnError` to decide whether
 *   the stage must fail loudly.
 *   The commit message is the whole curated prompt for the stage
 *   (see buildStageCommitMessage): subject line for `git log --oneline`, full
 *   prompt verbatim in the body. An explicit `opts.message` still wins
 *   (subject-only); without a prompt the legacy one-liner is used.
 *   Freshness: the agent path stores `task.prompt` at dispatch and finalizes
 *   on the same object; command stages have no curation, so their commits
 *   carry the task's latest curated prompt (or the legacy subject when none
 *   exists).
 *   Stage attestation: when the stage definition resolves (explicit
 *   `opts.stage`, else the task's current stage from the project), the
 *   task+stage config hash is appended to the commit body as git trailers
 *   (after truncation, so the proof survives; prompt-less stages attest with
 *   a trailer-only body) and the history entry gains the same hash plus the
 *   commit's full SHA — structured fields for live consumers and a durable
 *   prose token that survives `task.md` persistence. Clean-tree stages
 *   record their own entry with an explicit null commit; failed commits
 *   record the hash without a SHA. An explicit `opts.message` keeps its
 *   subject-only contract (no attestation), and an unresolvable stage
 *   degrades to the plain pre-feature entry — never a fake hash.
 * @example await finalizeTaskBranch(taskStore, task, '/repo', { stageName: 'Plan' })
 *   => { branch, committed, hash, configHash, commitError, pushed, pushSkipped, pushError, defaultBranch, switched, returnError }
 * @param {Object} taskStore - TaskStore instance.
 * @param {Object} task - The task entity (branch resolved from it).
 * @param {string} [projectCwd] - Project working directory.
 * @param {Object} [opts]
 * @param {Object} [opts.bridge] - Event bridge override.
 * @param {string} [opts.stageName] - Stage name for log/commit messages.
 * @param {Object} [opts.stage] - Stage definition the attestation hash covers (else resolved from the project).
 * @param {string} [opts.message] - Commit subject override (wins over the prompt-derived message, subject-only).
 * @returns {Promise<Object|null>} Summary object, or null when cwd cannot be resolved.
 ***/
export async function finalizeTaskBranch(
	taskStore,
	task,
	projectCwd,
	opts = {},
) {
	if (!task) return null;
	const cwd = taskStore._resolveProjectCwd(task.projectId, projectCwd);
	if (!cwd) return null;
	const bridge = opts.bridge || taskStore.eventBridge;
	const branch = resolveTaskBranch(task);
	const stageLabel = opts.stageName || opts.stageId || "stage";
	const requestedStartSha =
		typeof opts.startSha === "string" && opts.startSha.trim()
			? opts.startSha.trim()
			: (typeof task?.currentStageStartSha === "string" &&
				  task.currentStageStartSha.trim()
					? task.currentStageStartSha.trim()
					: null);
	const built = buildStageCommitMessage(task, stageLabel);
	const commitSubject = opts.message || built.subject;
	const commitBody = opts.message ? null : built.body;
	const taskShortId = String(task.id).slice(0, 4).toUpperCase();

	if (!Array.isArray(task.history)) {
		task.history = [];
	}
	const record = (action) => {
		const entry = { timestamp: new Date().toISOString(), action };
		task.history.push(entry);
		return entry;
	};
	const save = () => {
		try {
			taskStore._saveTaskMarkdown(cwd, task);
		} catch {
			// Persistence is best-effort here; the git state is authoritative.
		}
	};
	const systemLog = (message) => {
		bridge?.emitSystemLog?.(task.projectId, message, { taskId: task.id });
	};

	const summary = {
		branch,
		startSha: requestedStartSha,
		endSha: null,
		committed: false,
		hash: null,
		configHash: null,
		commitError: null,
		pushed: false,
		pushSkipped: null,
		pushError: null,
		defaultBranch: null,
		switched: false,
		returnError: null,
		worktreeDir: null,
	};

	// Worktree isolation: commit and push inside the task's isolated
	// worktree when one is provisioned; the return-to-default below always
	// stays on the primary checkout. Task metadata saves keep using `cwd`.
	let execCwd = cwd;
	try {
		const taskCwd = await resolveTaskCwd(taskStore, task, cwd);
		if (taskCwd && taskCwd !== cwd && fs.existsSync(taskCwd)) {
			execCwd = taskCwd;
			summary.worktreeDir = taskCwd;
		}
	} catch {
		execCwd = cwd;
	}

	let isRepo = false;
	try {
		isRepo = await isGitRepository(cwd);
	} catch {
		isRepo = false;
	}
	if (!isRepo) {
		const detail = `Skipped finalise after stage '${stageLabel}': not a git repository`;
		record(detail);
		_appendProcessLog(task, `[GIT] ${detail}`);
		save();
		return { ...summary, skipped: "no-git" };
	}

	// Step 1: commit all task work (a clean tree is a no-op). The body
	// carries the whole curated prompt verbatim when one is attached.
	// In worktree mode this commits inside the isolated worktree.
	let project = opts.project || null;
	if (
		!project &&
		task?.projectId &&
		typeof taskStore?.projectStore?.getProject === "function"
	) {
		try {
			project = taskStore.projectStore.getProject(task.projectId) || null;
		} catch {
			project = null;
		}
	}
	// Stage attestation: hash the task+stage config now so the wrap-up
	// commit and the history entry below carry the same proof. An explicit
	// opts.message keeps its subject-only contract (no attestation), and an
	// unresolvable stage degrades to the plain pre-feature entry — never a
	// fake hash. Only the hash is kept; the config itself is never logged.
	let attestation = null;
	if (!opts.message) {
		const attestedStage = resolveAttestationStage({
			stage: opts.stage,
			project,
			task,
		});
		const configHash = attestedStage
			? hashStageConfig({ task, stage: attestedStage })
			: null;
		if (configHash && typeof attestedStage?.id === "string") {
			attestation = {
				taskId: task.id,
				stageId: attestedStage.id,
				configHash,
			};
			summary.configHash = configHash;
		}
	}

	let commitEntry = null;
	try {
		// Branch affinity: stage output must only ever land on this task's own
		// branch. A concurrent task that moved the shared checkout turns this
		// into a warn-only skip below (never an alien commit).
		const commitOpts = { expectedBranch: branch };
		// Trailers append AFTER body truncation (see buildStageCommitMessage),
		// so the proof can never be truncated away; prompt-less stages attest
		// with a trailer-only body.
		const attestedBody = attestation
			? appendAttestationTrailers(commitBody, attestation)
			: commitBody;
		if (attestedBody) commitOpts.body = attestedBody;
		commitOpts.noCode = opts.noCode === true;
		commitOpts.project = project;
		const commitRes = await commitAllIfNeeded(
			execCwd,
			commitSubject,
			commitOpts,
		);
		summary.committed = commitRes?.committed === true;
		summary.hash = commitRes?.hash || null;
		if (summary.committed) {
			const detail = `Auto-committed task work on '${branch}' (${summary.hash || "no hash"}) after stage '${stageLabel}'`;
			commitEntry = record(detail);
			_appendProcessLog(task, `[GIT] ${detail}`);
			systemLog(
				`[GIT] Task #KB-${taskShortId}: auto-committed pending work on '${branch}' after stage '${stageLabel}'`,
			);
		} else if (attestation) {
			// Clean tree: compliance needs "stage ran, nothing to commit"
			// distinguishable from "no record", so the attestation gets its
			// own entry with an explicit null commit.
			commitEntry = record(
				`Stage '${stageLabel}' completed with a clean tree — nothing to commit`,
			);
		}
	} catch (commitErr) {
		summary.commitError = commitErr?.message || String(commitErr);
		const detail = `Warning: auto-commit after stage '${stageLabel}' failed (${summary.commitError})`;
		commitEntry = record(detail);
		_appendProcessLog(task, `[WARN] ${detail}`);
	}

	// Resolve the post-commit task-branch HEAD now, while the task branch is
	// still checked out: this becomes the explicit end boundary for the stage's
	// own commit range. A tree with no changes still reports the branch tip.
	try {
		summary.endSha = await resolveSha(execCwd, "HEAD");
	} catch {
		summary.endSha = summary.hash || null;
	}
	if (!summary.endSha && (task?.currentStageEndSha)) {
		summary.endSha = task.currentStageEndSha;
	}

	// The commit SHA is only known after the commit above (never predicted
	// before), so the history entry is attested here: structured fields for
	// live consumers plus the durable prose token. A stage that committed
	// names its full tip SHA; clean-tree and failed commits attest with an
	// explicit null instead of a fake SHA.
	if (attestation && commitEntry) {
		attachAttestationToEntry(commitEntry, {
			...attestation,
			commitSha: summary.committed ? summary.endSha || null : null,
		});
	}

	// Step 2: push the task branch when a remote exists (warn-only on failure).
	// In worktree mode the push runs from the worktree (same ref, same remote).
	try {
		const pushRes = await pushBranchIfRemote(execCwd, branch);
		summary.pushed = pushRes?.pushed === true;
		summary.pushSkipped = pushRes?.skipped || null;
		if (summary.pushed) {
			const detail = `Pushed task branch '${branch}' to remote after stage '${stageLabel}'`;
			record(detail);
			_appendProcessLog(task, `[GIT] ${detail}`);
			systemLog(
				`[GIT] Task #KB-${taskShortId}: pushed '${branch}' to remote`,
			);
		} else if (summary.pushSkipped === "no-remote") {
			const detail = `No remote configured — skipped push of '${branch}' after stage '${stageLabel}'`;
			record(detail);
			_appendProcessLog(task, `[GIT] ${detail}`);
		}
	} catch (pushErr) {
		summary.pushError = pushErr?.message || String(pushErr);
		const detail = `Warning: push of '${branch}' failed (${summary.pushError}) — stage still passes`;
		record(detail);
		_appendProcessLog(task, `[WARN] ${detail}`);
	}

	// Step 3: return to the pipeline base branch (always attempted, even
	// when commit or push failed, so the tree is never silently stranded).
	// The guard stays strict here (recovery: 'off'): a tree that is dirty
	// AFTER the commit step means the commit itself failed, and stashing
	// it away would strand work the merge stage never restores — refuse loudly.
	const { branch: returnBranch, source: returnSource } = await resolveTaskBaseBranch({
		task,
		projectStore: taskStore?.projectStore,
		projectId: task?.projectId,
		cwd,
	});
	try {
		const back = await returnToDefaultBranch(cwd, {
			recovery: "off",
			// The explicit target rides along only when a pipeline base is
			// actually configured: unconfigured tasks keep the historical
			// call shape (and the callee resolves the repo default itself).
			...(returnSource !== "repo" && returnBranch ? { targetBranch: returnBranch } : {}),
			// Same project hint the commit step above uses: a custom docs
			// folder must count as engine-owned on the return switch too,
			// or the strict guard refuses a tree holding only snapshots.
			...(project ? { project } : {}),
		});
		summary.defaultBranch = back?.branch || null;
		summary.switched = back?.switched === true;
		if (summary.switched) {
			const detail = `Returned to default branch '${summary.defaultBranch}' after stage '${stageLabel}'`;
			record(detail);
			_appendProcessLog(task, `[GIT] ${detail}`);
			systemLog(
				`[GIT] Task #KB-${taskShortId}: returned to '${summary.defaultBranch}' after stage '${stageLabel}'`,
			);
		} else {
			summary.defaultBranch = back?.branch || null;
		}
	} catch (returnErr) {
		summary.returnError = returnErr?.message || String(returnErr);
		const detail = `Could not return to the default branch after stage '${stageLabel}': ${summary.returnError}`;
		record(detail);
		_appendProcessLog(task, `[ERROR] ${detail}`);
	}

	// Source-of-truth sync once back on the base branch: the remote owns
	// it, so fetch and hard-reset it now while the task branch work is
	// safely committed and pushed above. Best-effort and warn-only — a
	// failed sync keeps local state for the next pickup's own sync.
	if (!summary.returnError) {
		try {
			await syncMainToRemoteBestEffort(
				taskStore,
				task,
				cwd,
				bridge,
				`finalise after stage '${stageLabel}'`,
				{ mainBranch: returnBranch },
			);
		} catch {
			// Audit is best-effort; finalise already succeeded.
		}
	}

	// Audit any stale lock the gated ops above auto-cleared, plus any
	// dirty-tree ladder run they triggered (drains key off the primary
	// repo, so worktree-mode entries are included via normalizeRepoKey).
	try {
		const recoveries = (await drainGitLockRecoveries(cwd)) || [];
		for (const entry of recoveries) {
			const detail = formatGitLockRecoveryNotice(entry);
			record(detail);
			_appendProcessLog(task, `[GIT] ${detail}`);
			systemLog(`[GIT] Task #KB-${taskShortId}: ${detail}`);
		}
		const ladderRuns = (await drainDirtyTreeRecoveries(cwd)) || [];
		for (const entry of ladderRuns) {
			const detail = formatDirtyTreeRecoveryNotice(entry);
			record(detail);
			_appendProcessLog(task, `[GIT] ${detail}`);
			systemLog(`[GIT] Task #KB-${taskShortId}: ${detail}`);
		}
	} catch {
		// Audit is best-effort; the git work above already succeeded.
	}

	// Persist the stage's explicit commit range on the in-memory task and row
	// boundary fields so timeline attribution can prefer it without guessing.
	// Latest wins: every successful stage overwrites the previous range so
	// `completeTask` can close out the FINAL stage's delta (not the first).
	task.currentStageEndSha = summary.endSha || task.currentStageEndSha || null;
	if (task.currentStageStartSha == null && summary.startSha) {
		task.currentStageStartSha = summary.startSha;
	}
	if (task.currentStageStartSha && summary.endSha) {
		task.currentStageBoundary = {
			start: task.currentStageStartSha,
			end: summary.endSha,
		};
	}
	save();
	return summary;
}

/***
 * MARK: _failedStageOwnPathPrefixes
 * @description The repo-relative prefixes that count as PROVABLY this task's
 *   own failed-stage output when a HEAD-contention recovery decides whether
 *   the dirty tree may be carried across a re-checkout: the task's own docs
 *   folder (`<docsDirName>/tasks/<taskId>/…` — stage reports and assets) plus
 *   the engine state dir (`<kainbainDirName>/…`, regenerated store state, not
 *   any task's work). Anything else dirty is treated as possibly a sibling
 *   task's work and fails closed. Pure, no I/O.
 *   Fails CLOSED without a task id: claiming the whole `<docsDirName>/tasks/`
 *   tree as "own" would let a sibling task's report dirt ride the recovery
 *   checkout, so an id-less task gets only the state dir.
 * @example _failedStageOwnPathPrefixes({ id: 't1' }, null) => ['docs/tasks/t1/', '.kainbain/']
 * @example _failedStageOwnPathPrefixes({ id: '' }, null) => ['.kainbain/']
 * @param {Object} task - Task entity (reads `id`).
 * @param {Object|null} [project] - Project record hint for custom dir names.
 * @returns {Array<string>}
 * @private
 ***/
function _failedStageOwnPathPrefixes(task, project) {
	const docsDir = resolveDocsDirName(project || {});
	const stateDir = resolveKainbainDirName(project || {});
	const taskId = String(task?.id || "").trim();
	if (!taskId) return [`${stateDir}/`];
	return [`${docsDir}/tasks/${taskId}/`, `${stateDir}/`];
}

/***
 * MARK: _isProvablyOwnFailedStagePath
 * @description Pure predicate: true when a repo-relative dirty path lives
 *   under one of the owning prefixes from _failedStageOwnPathPrefixes (the
 *   trailing-slash form or the bare parent dir both match). Normalises
 *   backslashes and git's quoting the same way the status parser consumers do.
 * @example _isProvablyOwnFailedStagePath('docs/tasks/t1/report.md', ['docs/tasks/t1/', '.kainbain/']) => true
 * @example _isProvablyOwnFailedStagePath('src/app.js', ['docs/tasks/t1/', '.kainbain/']) => false
 * @param {string} p - Repo-relative dirty path from git status.
 * @param {Array<string>} prefixes - Owning prefixes (trailing slash).
 * @returns {boolean}
 * @private
 ***/
function _isProvablyOwnFailedStagePath(p, prefixes) {
	const norm = String(p || "").replace(/\\/g, "/").replace(/["']/g, "");
	if (!norm) return false;
	return prefixes.some((prefix) => {
		const parent = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
		return norm === parent || norm.startsWith(prefix);
	});
}

/***
 * MARK: _recordTaskHistory
 * @description Appends one `{timestamp, action}` entry to the task's history
 *   log. Audit-only and never throws: a missing or broken history array must
 *   never block failure routing on the failed-stage path.
 * @example _recordTaskHistory({ history: [] }, 'Auto-committed partial work …')
 * @param {Object} task - Task entity (writes `history` when it is an array).
 * @param {string} action - Human-readable history line.
 * @private
 ***/
function _recordTaskHistory(task, action) {
	try {
		if (Array.isArray(task?.history)) {
			task.history.push({ timestamp: new Date().toISOString(), action });
		}
	} catch {
		// Audit-only; routing continues regardless.
	}
}

/***
 * MARK: _appendProcessLogSafely
 * @description Writes one line to the task's process log, never throwing:
 *   process-log failures are audit-only and must never block failure routing
 *   on the failed-stage path.
 * @example _appendProcessLogSafely(task, '[ERROR] failed-stage report …')
 * @param {Object} task - Task entity.
 * @param {string} line - Process-log line (including its [LEVEL] tag).
 * @private
 ***/
function _appendProcessLogSafely(task, line) {
	try {
		_appendProcessLog(task, line);
	} catch {
		// Audit-only; routing continues regardless.
	}
}

/***
 * MARK: _formatFailedStageCommitUnrecoverable
 * @description Builds the actionable, error-severity history entry used when a
 *   failed-stage report could NOT be committed and recovery was refused. It
 *   always names the stage, the owning (expected) branch, the branch HEAD is
 *   actually on, the uncommitted report path(s) of this task, the concrete
 *   reason recovery was refused, the manual remediation, and the explicit
 *   statement that no commit was made on ANY branch (acceptance: the dropped
 *   report surfaces as an actionable error instead of a quiet skip).
 * @example _formatFailedStageCommitUnrecoverable({ stageLabel: 'Dev', branch: 'kb/t1', actualBranch: 'kb/t2', reason: '…', reportPaths: ['docs/tasks/t1/report.md'], execCwd: '/repo' })
 *   => "Error: failed-stage report for 'Dev' could NOT be committed — … No commit was made on any branch."
 * @param {Object} args
 * @param {string} args.stageLabel
 * @param {string} args.branch - Owning (expected) branch.
 * @param {string|null} args.actualBranch - Branch HEAD is on now.
 * @param {string} args.reason - Why recovery was refused.
 * @param {Array<string>} args.reportPaths - This task's uncommitted report/asset paths.
 * @param {string} args.execCwd - Shared checkout path for the remediation command.
 * @returns {string}
 * @private
 ***/
function _formatFailedStageCommitUnrecoverable({
	stageLabel,
	branch,
	actualBranch,
	reason,
	reportPaths,
	execCwd,
}) {
	const paths =
		Array.isArray(reportPaths) && reportPaths.length > 0
			? `${reportPaths.slice(0, 10).join(", ")}${reportPaths.length > 10 ? ` (+${reportPaths.length - 10} more)` : ""}`
			: "the stage report file(s) under this task's docs folder";
	return (
		`Error: failed-stage report for '${stageLabel}' could NOT be committed — ${reason}. ` +
		`Expected branch: '${branch}'; HEAD is on '${actualBranch || "unknown"}'. ` +
		`Action: run 'git status' on the shared checkout ('${execCwd}'); commit or set aside any foreign changes; ` +
		`then re-run the stage or manually commit the report file(s) ${paths} onto '${branch}'. ` +
		`No commit was made on any branch.`
	);
}

/***
 * MARK: _recoverFailedStageCommitAfterHeadMove
 * @description HEAD-contention recovery for the failed-stage auto-commit: when
 *   `commitAllIfNeeded` refused with a GitBranchMismatchError because a
 *   concurrent task moved the shared checkout onto a sibling branch, this
 *   re-establishes the OWNING branch and retries the commit EXACTLY once.
 *   Every step fails closed — the `expectedBranch` guard is never weakened and
 *   no commit is ever made on a sibling branch:
 *     1. re-read state (HEAD, branch existence, full dirty paths);
 *     2. refuse (returning an unrecoverable detail) when the owning branch no
 *        longer exists, when HEAD already moved BACK to the owning branch
 *        (flapping HEAD — recorded, never papered over with a blind retry), or
 *        when the tree holds dirt outside this task's own report/asset paths
 *        (a sibling's work may be present);
 *     3. otherwise check out the owning branch strictly: `recovery: "off"`
 *        (never stash), never create, and `snapshotCommit: false` so no
 *        snapshot commit can land on the sibling branch that currently holds
 *        HEAD;
 *     4. re-verify after the switch (HEAD on the owning branch, no foreign
 *        dirt appeared mid-recovery);
 *     5. retry `commitAllIfNeeded` with the identical subject/opts once; any
 *        retry failure (including a second mismatch) is unrecoverable.
 *   Never throws — every failure becomes `{ unrecoverable: true, detail }` so
 *   `commitFailedStageWork` can record the actionable error entry and still
 *   return null without blocking failure routing.
 * @example await _recoverFailedStageCommitAfterHeadMove({ task, execCwd, branch, subject, stageLabel, commitOpts, mismatch })
 *   => { commitRes: { committed: true, hash }, note: 'Note: HEAD had moved …' } | { unrecoverable: true, detail }
 * @param {Object} args
 * @param {Object} args.task - Task entity (id, projectId).
 * @param {string} args.execCwd - Directory the failed commit ran in.
 * @param {string} args.branch - Owning branch to re-establish.
 * @param {string} args.subject - Identical commit subject for the retry.
 * @param {string} args.stageLabel - Stage name for the error entry.
 * @param {Object} args.commitOpts - `{ noCode, project }` for the retry.
 * @param {GitBranchMismatchError} args.mismatch - The original refusal.
 * @returns {Promise<{commitRes: Object, note: string}|{unrecoverable: boolean, detail: string}>}
 * @private
 ***/
async function _recoverFailedStageCommitAfterHeadMove({
	task,
	execCwd,
	branch,
	subject,
	stageLabel,
	commitOpts,
	mismatch,
}) {
	const project = commitOpts?.project || null;
	const ownPrefixes = _failedStageOwnPathPrefixes(task, project);
	const isOwn = (p) => _isProvablyOwnFailedStagePath(p, ownPrefixes);
	const reportPathsOf = (status) => (status?.dirtyPaths || []).filter(isOwn);
	const foreignPathsOf = (status) => (status?.dirtyPaths || []).filter((p) => !isOwn(p));
	const readState = async () => {
		const [nowBranch, exists, status] = await Promise.all([
			currentBranch(execCwd).catch(() => null),
			branchExists(execCwd, branch),
			// Full status with NO ignore prefixes: the recovery must see every
			// dirty path (including other tasks' docs/tasks/<id>/ reports) so
			// only provably-own dirt is carried across the re-checkout.
			getWorkingTreeStatus(execCwd, { ignorePaths: [] }).catch(() => null),
		]);
		return { nowBranch, exists, status };
	};
	const fail = (reason, state) => ({
		unrecoverable: true,
		detail: _formatFailedStageCommitUnrecoverable({
			stageLabel,
			branch,
			actualBranch: state?.nowBranch || mismatch?.actualBranch || null,
			reason,
			reportPaths: reportPathsOf(state?.status),
			execCwd,
		}),
	});

	const actualBranch =
		typeof mismatch?.actualBranch === "string" && mismatch.actualBranch
			? mismatch.actualBranch
			: await currentBranch(execCwd).catch(() => null);

	// Step 1–2: re-read and fail closed, in order. An unreadable status is
	// itself a fail-closed condition — "unknown dirt" is never treated as
	// "no foreign dirt".
	const state = await readState();
	if (!state.status) {
		return fail(
			`the working-tree status could not be read, so foreign dirt cannot be ruled out`,
			state,
		);
	}
	if (!state.exists) {
		return fail(
			`the owning branch '${branch}' no longer exists (deleted mid-flight), so there is no safe branch to commit onto`,
			state,
		);
	}
	if (state.nowBranch === branch) {
		return fail(
			`HEAD moved back to the owning branch '${branch}' while the mismatch was being handled (flapping HEAD); a blind auto-retry is refused so the race stays visible`,
			state,
		);
	}
	const foreign = foreignPathsOf(state.status);
	if (foreign.length > 0) {
		return fail(
			`HEAD is on sibling branch '${state.nowBranch || actualBranch || "unknown"}' (a concurrent task moved it) and the tree holds uncommitted work outside this task's own report/asset paths (${foreign.slice(0, 5).join(", ")}${foreign.length > 5 ? ` (+${foreign.length - 5} more)` : ""}), so an automatic checkout would risk mixing branches`,
			state,
		);
	}

	// Step 3: re-establish the owning branch, strictly. `recovery: "off"` —
	// a dirty tree here means something changed under us, so refuse loudly
	// instead of stashing. `snapshotCommit: false` — the commit-then-switch
	// backstop would snapshot-commit onto the sibling branch that currently
	// holds HEAD; the report must land only on the owning branch. The branch
	// was proven to exist above, so checkoutBranch never creates.
	try {
		await checkoutBranch(execCwd, branch, {
			recovery: "off",
			snapshotCommit: false,
			...(task?.id ? { taskId: task.id } : {}),
			...(project ? { project } : {}),
		});
	} catch (checkoutErr) {
		return fail(
			`re-establishing the owning branch '${branch}' was refused (${checkoutErr?.message || checkoutErr}); committing on '${state.nowBranch || actualBranch || "unknown"}' is never attempted`,
			state,
		);
	}

	// Step 4: post-switch re-verify — HEAD on the owning branch and no foreign
	// dirt appeared between the check and the switch.
	const after = await readState();
	if (!after.status) {
		return fail(
			`the working-tree status could not be re-read after the recovery checkout, so foreign dirt cannot be ruled out`,
			after,
		);
	}
	if (after.nowBranch !== branch) {
		return fail(
			`HEAD is on '${after.nowBranch || "unknown"}' after the recovery checkout (expected '${branch}'); the race is still live`,
			after,
		);
	}
	const afterForeign = foreignPathsOf(after.status);
	if (afterForeign.length > 0) {
		return fail(
			`the tree gained uncommitted work outside this task's own report/asset paths during the recovery checkout (${afterForeign.slice(0, 5).join(", ")}${afterForeign.length > 5 ? ` (+${afterForeign.length - 5} more)` : ""}); refusing to commit`,
			after,
		);
	}

	// Step 5: retry the commit exactly once, identical subject and opts.
	try {
		const commitRes = await commitAllIfNeeded(execCwd, subject, {
			expectedBranch: branch,
			noCode: commitOpts?.noCode === true,
			...(project ? { project } : {}),
		});
		return {
			commitRes,
			note: `Note: HEAD had moved to '${actualBranch || state.nowBranch || "unknown"}' (concurrent task); re-established '${branch}' and committed on retry`,
		};
	} catch (retryErr) {
		return fail(
			`the single retry after re-establishing '${branch}' failed (${retryErr?.message || retryErr})`,
			after,
		);
	}
}

/***
 * MARK: commitFailedStageWork
 * @description Best-effort auto-commit of partial work when a work stage
 *   fails, so the failed attempt's changes cannot be silently absorbed into
 *   a later stage's commit (the "wrong stage" badge). The commit lands on
 *   the task branch with a `... (failed)` message suffix, bounding the
 *   failed attempt's commit range: a retry then measures only its own work.
 *   Never throws and never blocks failure routing: when there is nothing
 *   to commit, git is unavailable, or the commit fails for a non-branch
 *   reason, it records a warning and returns null. Callers route the original
 *   failure unchanged.
 *   HEAD contention: when the branch-affinity guard refuses because a
 *   concurrent task moved the shared checkout onto a sibling branch
 *   (GitBranchMismatchError), the owning branch is re-established and the
 *   commit retried EXACTLY once (see
 *   _recoverFailedStageCommitAfterHeadMove). A successful retry records the
 *   usual success entry plus a short note that HEAD had moved. When recovery
 *   is not provably safe — owning branch deleted, flapping HEAD, or a dirty
 *   tree holding work outside this task's own report/asset paths — an
 *   error-severity history entry names both branches, the uncommitted report
 *   paths, and the manual remediation, and states that no commit was made on
 *   any branch. The `expectedBranch` guard itself is never weakened: no
 *   commit ever lands on a sibling task's branch. (The historical "re-run
 *   the stage" advice no longer applies on this path — a failed stage has no
 *   re-run coming.)
 * @example await commitFailedStageWork(store, task, '/repo', { stageName: 'Dev' })
 *   => { committed: true, hash: 'abc…' } | null
 * @param {Object} taskStore - TaskStore instance (cwd resolution, markdown save).
 * @param {Object} task - The task entity (branch resolved from it).
 * @param {string} [projectCwd] - Project working directory.
 * @param {Object} [opts]
 * @param {string} [opts.stageName] - Stage name for the commit message.
 * @returns {Promise<{committed: boolean, hash: string|null}|null>} Commit outcome, or null when skipped.
 ***/
export async function commitFailedStageWork(taskStore, task, projectCwd, opts = {}) {
	if (!taskStore || !task) return null;
	try {
		const cwd = taskStore._resolveProjectCwd(task.projectId, projectCwd);
		if (!cwd) return null;
		// Branch mode only: without a provisioned task branch the stage ran
		// on the shared checkout and there is no stage-owned range to bound.
		if (!task.branch || typeof task.branch !== "string" || !task.branch.trim()) {
			return null;
		}
		const branch = resolveTaskBranch(task);
		if (!branch) return null;
		// Worktree isolation: the stage ran inside the task's isolated
		// worktree when one is provisioned — commit where the files are.
		let execCwd = cwd;
		try {
			const taskCwd = await resolveTaskCwd(taskStore, task, cwd);
			if (taskCwd && taskCwd !== cwd && fs.existsSync(taskCwd)) {
				execCwd = taskCwd;
			}
		} catch {
			execCwd = cwd;
		}
		let isRepo = false;
		try {
			isRepo = await isGitRepository(execCwd);
		} catch {
			isRepo = false;
		}
		if (!isRepo) return null;
		const stageLabel = opts.stageName || opts.stageId || "stage";
		let project = opts.project || null;
		if (!project && task?.projectId && typeof taskStore?.projectStore?.getProject === "function") {
			try {
				project = taskStore.projectStore.getProject(task.projectId) || null;
			} catch {
				project = null;
			}
		}
		const built = buildStageCommitMessage(task, stageLabel);
		const subject = `${built.subject} ... (failed)`;
		let commitRes = null;
		let recoveryNote = null;
		try {
			commitRes = await commitAllIfNeeded(execCwd, subject, {
				expectedBranch: branch,
				noCode: opts.noCode === true,
				project,
			});
		} catch (commitErr) {
			const isBranchMismatch =
				commitErr instanceof GitBranchMismatchError ||
				commitErr?.name === "GitBranchMismatchError";
			if (!isBranchMismatch) {
				// Historical warn-only skip for every non-branch commit failure
				// (e.g. a hook rejection): no recovery is attempted.
				_recordTaskHistory(
					task,
					`Warning: failed-stage auto-commit after '${stageLabel}' skipped (${commitErr?.message || commitErr})`,
				);
				return null;
			}
			// HEAD contention: a concurrent task moved the shared checkout
			// onto a sibling branch. Re-establish the owning branch and
			// retry the commit exactly once — failing closed into an
			// actionable error entry when recovery is not provably safe.
			// The guard is never weakened: no commit lands on a sibling.
			let recovery = null;
			try {
				recovery = await _recoverFailedStageCommitAfterHeadMove({
					task,
					execCwd,
					branch,
					subject,
					stageLabel,
					commitOpts: { noCode: opts.noCode === true, project },
					mismatch: commitErr,
				});
			} catch {
				recovery = null;
			}
			if (recovery && recovery.commitRes) {
				commitRes = recovery.commitRes;
				recoveryNote = recovery.note || null;
			} else {
				const detail =
					recovery?.detail ||
					_formatFailedStageCommitUnrecoverable({
						stageLabel,
						branch,
						actualBranch: commitErr?.actualBranch || null,
						reason:
							"the HEAD-contention recovery failed unexpectedly before any retry",
						reportPaths: [],
						execCwd,
					});
				_recordTaskHistory(task, detail);
				_appendProcessLogSafely(task, `[ERROR] ${detail}`);
				return null;
			}
		}
		if (commitRes?.committed === true) {
			_recordTaskHistory(
				task,
				`Auto-committed partial work on '${branch}' (${commitRes?.hash || "no hash"}) after failed stage '${stageLabel}'`,
			);
			_appendProcessLogSafely(
				task,
				`[GIT] Auto-committed partial work on '${branch}' after failed stage '${stageLabel}'`,
			);
			// Bound the failed attempt's range: the retry starts after
			// this commit, so the failed stage keeps its own diff.
			try {
				task.currentStageEndSha = await resolveSha(execCwd, "HEAD");
			} catch {
				task.currentStageEndSha = commitRes?.hash || task.currentStageEndSha || null;
			}
			// HEAD-contention recovery succeeded: leave the short note so the
			// race that moved HEAD stays visible in the task history.
			if (recoveryNote) {
				_recordTaskHistory(task, recoveryNote);
				_appendProcessLogSafely(task, `[GIT] ${recoveryNote}`);
			}
			// File operations end pushed: publish the failed attempt's commit
			// now, so the retry (or a second writer after a restart) merges
			// the latest instead of re-conflicting on stale unpublished work.
			// Warn-only — routing below owns the failure either way.
			try {
				const pushRes = await pushBranchIfRemote(execCwd, branch);
				if (pushRes?.pushed === true) {
					_recordTaskHistory(
						task,
						`Pushed '${branch}' to remote after failed stage '${stageLabel}'`,
					);
					_appendProcessLogSafely(
						task,
						`[GIT] Pushed '${branch}' to remote after failed stage '${stageLabel}'`,
					);
				}
			} catch (pushErr) {
				_recordTaskHistory(
					task,
					`Warning: push of '${branch}' after failed stage '${stageLabel}' failed (${pushErr?.message || pushErr}) — retry still proceeds`,
				);
			}
		}
		return commitRes;
	} catch {
		return null;
	}
}
