// Domain: The Work — post-stage finalisation of a task branch.
import fs from "node:fs";
import {
	commitAllIfNeeded,
	drainDirtyTreeRecoveries,
	drainGitLockRecoveries,
	formatDirtyTreeRecoveryNotice,
	formatGitLockRecoveryNotice,
	isGitRepository,
	pushBranchIfRemote,
	returnToDefaultBranch,
	resolveSha,
} from "../git.js";
import { resolveTaskBranch, syncMainToRemoteBestEffort } from "./taskBranches.js";
import { resolveTaskCwd } from "./taskWorkspace.js";
import { _appendProcessLog } from "../watch/index.js";

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
 *   task branch when a remote exists, then switches back to the default
 *   branch so no stage ends stranded on a task branch.
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
 * @example await finalizeTaskBranch(taskStore, task, '/repo', { stageName: 'Plan' })
 *   => { branch, committed, hash, commitError, pushed, pushSkipped, pushError, defaultBranch, switched, returnError }
 * @param {Object} taskStore - TaskStore instance.
 * @param {Object} task - The task entity (branch resolved from it).
 * @param {string} [projectCwd] - Project working directory.
 * @param {Object} [opts]
 * @param {Object} [opts.bridge] - Event bridge override.
 * @param {string} [opts.stageName] - Stage name for log/commit messages.
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
		task.history.push({ timestamp: new Date().toISOString(), action });
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
	try {
		// Branch affinity: stage output must only ever land on this task's own
		// branch. A concurrent task that moved the shared checkout turns this
		// into a warn-only skip below (never an alien commit).
		const commitOpts = { expectedBranch: branch };
		if (commitBody) commitOpts.body = commitBody;
		const commitRes = await commitAllIfNeeded(
			execCwd,
			commitSubject,
			commitOpts,
		);
		summary.committed = commitRes?.committed === true;
		summary.hash = commitRes?.hash || null;
		if (summary.committed) {
			const detail = `Auto-committed task work on '${branch}' (${summary.hash || "no hash"}) after stage '${stageLabel}'`;
			record(detail);
			_appendProcessLog(task, `[GIT] ${detail}`);
			systemLog(
				`[GIT] Task #KB-${taskShortId}: auto-committed pending work on '${branch}' after stage '${stageLabel}'`,
			);
		}
	} catch (commitErr) {
		summary.commitError = commitErr?.message || String(commitErr);
		const detail = `Warning: auto-commit after stage '${stageLabel}' failed (${summary.commitError})`;
		record(detail);
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

	// Step 3: return to the default branch (always attempted, even when
	// commit or push failed, so the tree is never silently stranded). The
	// guard stays strict here (recovery: 'off'): a tree that is dirty AFTER
	// the commit step means the commit itself failed, and stashing it away
	// would strand work the merge stage never restores — refuse loudly.
	try {
		const back = await returnToDefaultBranch(cwd, { recovery: "off" });
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

	// Source-of-truth sync once back on the default branch: the remote owns
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
 * MARK: commitFailedStageWork
 * @description Best-effort auto-commit of partial work when a work stage
 *   fails, so the failed attempt's changes cannot be silently absorbed into
 *   a later stage's commit (the "wrong stage" badge). The commit lands on
 *   the task branch with a `... (failed)` message suffix, bounding the
 *   failed attempt's commit range: a retry then measures only its own work.
 *   Never throws and never blocks failure routing: when there is nothing
 *   to commit, git is unavailable, or the tree is on an unexpected branch,
 *   it records a warning and returns null. Callers route the original
 *   failure unchanged.
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
		const built = buildStageCommitMessage(task, stageLabel);
		const subject = `${built.subject} ... (failed)`;
		let commitRes = null;
		try {
			commitRes =
				typeof commitAllIfNeeded === "function"
					? await commitAllIfNeeded(execCwd, subject, { expectedBranch: branch })
					: { committed: false, hash: null };
		} catch (commitErr) {
			try {
				if (Array.isArray(task.history)) {
					task.history.push({
						timestamp: new Date().toISOString(),
						action: `Warning: failed-stage auto-commit after '${stageLabel}' skipped (${commitErr?.message || commitErr})`,
					});
				}
			} catch {
				// History is audit-only; routing continues regardless.
			}
			return null;
		}
		if (commitRes?.committed === true) {
			try {
				if (Array.isArray(task.history)) {
					task.history.push({
						timestamp: new Date().toISOString(),
						action: `Auto-committed partial work on '${branch}' (${commitRes?.hash || "no hash"}) after failed stage '${stageLabel}'`,
					});
				}
				_appendProcessLog(
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
			} catch {
				// Audit writes never block failure routing.
			}
			// File operations end pushed: publish the failed attempt's commit
			// now, so the retry (or a second writer after a restart) merges
			// the latest instead of re-conflicting on stale unpublished work.
			// Warn-only — routing below owns the failure either way.
			try {
				const pushRes = await pushBranchIfRemote(execCwd, branch);
				if (pushRes?.pushed === true) {
					try {
						if (Array.isArray(task.history)) {
							task.history.push({
								timestamp: new Date().toISOString(),
								action: `Pushed '${branch}' to remote after failed stage '${stageLabel}'`,
							});
						}
					} catch {
						// Audit writes never block failure routing.
					}
					_appendProcessLog(
						task,
						`[GIT] Pushed '${branch}' to remote after failed stage '${stageLabel}'`,
					);
				}
			} catch (pushErr) {
				try {
					if (Array.isArray(task.history)) {
						task.history.push({
							timestamp: new Date().toISOString(),
							action: `Warning: push of '${branch}' after failed stage '${stageLabel}' failed (${pushErr?.message || pushErr}) — retry still proceeds`,
						});
					}
				} catch {
					// Audit writes never block failure routing.
				}
			}
		}
		return commitRes;
	} catch {
		return null;
	}
}
