import { git } from "./exec.js";
import { _assertValidBranchName, isValidBranchName } from "./validation.js";
import { currentBranch, isMergeInProgress } from "./status.js";
import { ensureGitIdentity } from "./commit.js";
import { hasRemote } from "./remote.js";
import { GitError, GitMergeConflictError } from "./errors.js";

/***
 * MARK: isBranchMergedInto
 * @description Whether `branch` is fully merged into `base`
 *   (`git merge-base --is-ancestor branch base` exits 0). The merge stage
 *   uses it as ancestry evidence that a task branch already landed, so a
 *   re-entered merge stage never reports "no commits of its own" for work
 *   that is already on the main branch — even when the frozen
 *   `reviewBaseline` marker was lost (restart mid-merge, unpersisted write).
 *   Exit code 1 means "not an ancestor" (returns false); any other git
 *   failure (bad repo, bad ref) throws a GitError. Invalid names fail closed.
 * @example await isBranchMergedInto('/repo', 'main', 'kb/123') => true
 * @param {string} projectCwd
 * @param {string} base - Integration branch (usually the default branch).
 * @param {string} branch - Task branch to test for ancestry.
 * @returns {Promise<boolean>} True when `branch` is an ancestor of `base`.
 ***/
export async function isBranchMergedInto(projectCwd, base, branch) {
	if (!isValidBranchName(base) || !isValidBranchName(branch)) {
		throw new GitError("isBranchMergedInto requires valid branch names");
	}
	try {
		await git(projectCwd, ["merge-base", "--is-ancestor", branch, base]);
		return true;
	} catch (err) {
		if (err instanceof GitError && err.code === 1) return false;
		throw err;
	}
}


/***
 * MARK: abortMerge
 * @description Aborts an in-progress merge and restores the pre-merge state.
 *   Errors are swallowed when no merge is in progress (idempotent cleanup).
 * @example await abortMerge('/repo')
 * @param {string} projectCwd
 * @returns {Promise<void>}
 ***/
export async function abortMerge(projectCwd) {
	try {
		await git(projectCwd, ["merge", "--abort"]);
	} catch {
		if (await isMergeInProgress(projectCwd)) {
			throw new GitError(
				"Failed to abort in-progress merge (git merge --abort failed)",
			);
		}
	}
}


/***
 * MARK: MERGE_STRATEGY
 * @description The merge invocation every engine merge uses: a non-interactive
 *   `ort`-strategy merge that is always rolled back on conflict (unless the
 *   caller opts out), so Tier 3 failback agents know exactly what produced
 *   the conflicted state they must resolve.
 ***/
export const MERGE_STRATEGY = "merge --no-edit (auto-abort on conflict)";


/***
 * MARK: REGENERATED_SNAPSHOT_PATHS
 * @description Conflict paths the merge stage may resolve without a human:
 *   the engine's own live-state snapshots, which regenerate from store
 *   state on the next task activity. `docs/tasks/<id>/task.md` is rewritten
 *   by `_saveTaskMarkdown` after every stage event, and
 *   `docs/tasks/<id>/assets/` holds binary review attachments (screenshots).
 *   Both sides of a task-branch/main merge append to these files on every
 *   attempt, so they conflict structurally — never from a real disagreement.
 *   Anything outside this set (source code, configs, docs written as task
 *   deliverables) is a genuine conflict and must keep failing loudly.
 * ***/
const REGENERATED_SNAPSHOT_PATTERNS = [
	/^docs\/tasks\/[^/]+\/task\.md$/,
	/^docs\/tasks\/[^/]+\/assets\/.+$/,
];


/***
 * MARK: isRegeneratedSnapshotPath
 * @description Pure predicate: true when a merge-conflicted path is an
 *   engine-regenerated snapshot (see REGENERATED_SNAPSHOT_PATHS) that the
 *   merge stage may auto-resolve. Anchored patterns only — absolute paths,
 *   parent traversal, and option-looking entries never match.
 * @example isRegeneratedSnapshotPath('docs/tasks/abc/task.md') => true
 * @param {string} path - Repo-relative conflicted path from git.
 * @returns {boolean}
 ***/
export function isRegeneratedSnapshotPath(path) {
	if (typeof path !== "string" || path.length === 0) return false;
	return REGENERATED_SNAPSHOT_PATTERNS.some((re) => re.test(path));
}


/***
 * MARK: partitionMergeConflicts
 * @description Splits a merge's unmerged-path list into engine-regenerated
 *   snapshots (safe to auto-resolve) and blocking paths (genuine conflicts
 *   that must fail loudly). Pure — no git involved.
 * @example partitionMergeConflicts(['docs/tasks/a/task.md', 'src/x.js']) => { snapshots: ['docs/tasks/a/task.md'], blocking: ['src/x.js'] }
 * @param {Array<string>} [conflictedFiles] - Unmerged paths from git.
 * @returns {{snapshots: Array<string>, blocking: Array<string>}}
 ***/
export function partitionMergeConflicts(conflictedFiles) {
	const files = Array.isArray(conflictedFiles) ? conflictedFiles : [];
	const snapshots = [];
	const blocking = [];
	for (const file of files) {
		if (isRegeneratedSnapshotPath(file)) snapshots.push(file);
		else blocking.push(file);
	}
	return { snapshots, blocking };
}


/***
 * MARK: resolveConflictsWithIncoming
 * @description Resolves already-partitioned snapshot conflicts with the
 *   incoming (merged-in task branch) version via `git checkout --theirs`.
 *   Must run while the merge is still in progress (MERGE_HEAD present); the
 *   caller finalizes with a commit. Fails closed: any blocking path, an
 *   empty list, or a non-string entry throws GitError and resolves nothing.
 * @example await resolveConflictsWithIncoming('/repo', ['docs/tasks/a/task.md'])
 * @param {string} projectCwd
 * @param {Array<string>} files - Conflicted paths to resolve with theirs.
 * @returns {Promise<Array<string>>} The resolved paths.
 ***/
export async function resolveConflictsWithIncoming(projectCwd, files) {
	const { snapshots, blocking } = partitionMergeConflicts(files);
	if (!Array.isArray(files) || files.length === 0) {
		throw new GitError(
			"Refusing to auto-resolve merge conflicts: no conflicted files provided",
		);
	}
	if (blocking.length > 0) {
		throw new GitError(
			`Refusing to auto-resolve merge conflicts: genuine code conflicts require a human (${blocking.join(", ")})`,
		);
	}
	if (snapshots.length !== files.length) {
		throw new GitError(
			"Refusing to auto-resolve merge conflicts: unexpected path entries",
		);
	}
	await git(projectCwd, ["checkout", "--theirs", "--", ...snapshots]);
	return snapshots;
}


/***
 * MARK: syncBranchWithUpstream
 * @description "Always merge in the latest" for task branches: fetches the
 *   remote, then converges the local branch ref with its upstream tracking
 *   ref — merging `origin/<branch>` into the working tree when the branch
 *   is checked out (fast-forward, else a merge commit; conflicts abort back
 *   to the pre-merge tree), or fast-forwarding the ref in place when it is
 *   not checked out (compare-and-swap update, diverged refs are never
 *   forced). A missing local ref is created at the upstream tip. Never
 *   throws: every failure mode (no remote, fetch failure, no upstream,
 *   conflict, divergence) resolves to a warn-only `{ synced: false,
 *   skipped }` so callers treat this as best-effort freshness, not a gate.
 *   The task branch is never hard-reset — unlike the default branch, the
 *   remote does not own it; local stage work may legitimately be unpushed.
 * @example await syncBranchWithUpstream('/repo', 'kb/task-1') => { synced: true, before: 'abc', after: 'def', ... }
 * @param {string} projectCwd
 * @param {string} branch - Local branch to converge with its upstream.
 * @param {Object} [opts]
 * @param {string} [opts.remote='origin'] - Remote holding the upstream ref.
 * @param {number} [opts.timeout=60000] - Fetch command timeout in ms.
 * @returns {Promise<{synced: boolean, skipped: string|null, remote: string, branch: string, before: string|null, after: string|null, detail: string|null}>}
 ***/
export async function syncBranchWithUpstream(projectCwd, branch, opts = {}) {
	const remote =
		typeof opts.remote === "string" && opts.remote.trim()
			? opts.remote.trim()
			: "origin";
	const timeout = opts.timeout || 60000;
	const done = (partial = {}) => ({
		synced: false,
		skipped: null,
		remote,
		branch,
		before: null,
		after: null,
		detail: null,
		...partial,
	});
	if (!isValidBranchName(branch) || /^-/.test(remote) || remote.length > 255) {
		return done({ skipped: "invalid-branch" });
	}
	if (!(await hasRemote(projectCwd, remote).catch(() => false))) {
		return done({ skipped: "no-remote" });
	}
	try {
		await git(projectCwd, ["fetch", remote], { timeout });
	} catch (e) {
		return done({ skipped: "fetch-failed", detail: e?.message || String(e) });
	}
	const tracking = `${remote}/${branch}`;
	const readSha = async (args) => {
		try {
			const { stdout } = await git(projectCwd, args);
			return stdout.trim() || null;
		} catch {
			return null;
		}
	};
	const remoteSha = await readSha(["rev-parse", "--verify", tracking]);
	if (!remoteSha) return done({ skipped: "no-upstream" });
	const current = await currentBranch(projectCwd).catch(() => null);

	// Checked-out branch: merge the upstream in (fast-forward when clean,
	// merge commit otherwise). mergeBranch aborts on conflict, so a
	// 'conflict' outcome always leaves the tree exactly as it was.
	if (current === branch) {
		const before = await readSha(["rev-parse", "--verify", "HEAD"]);
		if (before === remoteSha) {
			return done({ synced: true, before, after: before, detail: "already up to date" });
		}
		try {
			await mergeBranch(projectCwd, tracking);
		} catch (e) {
			if (e instanceof GitMergeConflictError) {
				return done({ skipped: "conflict", before, after: before });
			}
			return done({ skipped: "merge-failed", before, after: before, detail: e?.message || String(e) });
		}
		const after = (await readSha(["rev-parse", "--verify", "HEAD"])) || remoteSha;
		return done({ synced: true, before, after, detail: `merged '${tracking}'` });
	}

	// Branch not checked out: converge the ref without touching the tree.
	const localSha = await readSha(["rev-parse", "--verify", branch]);
	if (!localSha) {
		try {
			await git(projectCwd, ["branch", branch, tracking]);
			return done({ synced: true, before: null, after: remoteSha, detail: `created from '${tracking}'` });
		} catch (e) {
			return done({ skipped: "create-failed", detail: e?.message || String(e) });
		}
	}
	if (localSha === remoteSha) {
		return done({ synced: true, before: localSha, after: localSha, detail: "already up to date" });
	}
	let ancestor = false;
	try {
		await git(projectCwd, ["merge-base", "--is-ancestor", localSha, remoteSha]);
		ancestor = true;
	} catch {
		ancestor = false;
	}
	if (!ancestor) {
		return done({ skipped: "diverged", before: localSha, after: remoteSha });
	}
	try {
		await git(projectCwd, ["update-ref", `refs/heads/${branch}`, remoteSha, localSha]);
		return done({ synced: true, before: localSha, after: remoteSha, detail: "fast-forwarded" });
	} catch (e) {
		return done({ skipped: "ref-update-failed", before: localSha, after: remoteSha, detail: e?.message || String(e) });
	}
}


/***
 * MARK: buildGitConflictDiagnostics
 * @description Builds the structured, machine-actionable conflict block that
 *   travels with every GitMergeConflictError into the Tier 3 failback prompt:
 *   the conflicting file list plus the source (task branch), target (main at
 *   merge attempt), and merge-base SHAs behind the configured strategy. The
 *   canonical human message is unchanged; this block is appended after it.
 * @example buildGitConflictDiagnostics({ taskBranch: 'kb/1', mainBranch: 'main', conflictedFiles: ['a.txt'] }).block => "Git conflict diagnostics: …"
 * @param {Object} [args]
 * @param {string} [args.taskBranch] - Branch that was merged (source).
 * @param {string} [args.mainBranch] - Branch merged into (target).
 * @param {string} [args.sourceSha] - Source HEAD at merge attempt.
 * @param {string} [args.targetSha] - Target HEAD at merge attempt.
 * @param {string} [args.baseSha] - Merge-base of source and target.
 * @param {string} [args.strategy] - Merge strategy detail.
 * @param {Array<string>} [args.conflictedFiles] - Conflicted paths.
 * @returns {{block: string, diagnostics: {taskBranch: string|null, mainBranch: string|null, sourceSha: string|null, targetSha: string|null, baseSha: string|null, strategy: string, conflictedFiles: Array<string>}}}
 ***/
export function buildGitConflictDiagnostics({
	taskBranch = null,
	mainBranch = null,
	sourceSha = null,
	targetSha = null,
	baseSha = null,
	strategy = MERGE_STRATEGY,
	conflictedFiles = [],
} = {}) {
	const files = Array.isArray(conflictedFiles) ? conflictedFiles : [];
	const diagnostics = {
		taskBranch: taskBranch || null,
		mainBranch: mainBranch || null,
		sourceSha: sourceSha || null,
		targetSha: targetSha || null,
		baseSha: baseSha || null,
		strategy: String(strategy || MERGE_STRATEGY),
		conflictedFiles: files,
	};
	const lines = [
		"Git conflict diagnostics:",
		`- Source branch: ${diagnostics.taskBranch || "unknown"}${diagnostics.sourceSha ? ` (${diagnostics.sourceSha})` : " (SHA unknown)"}`,
		`- Target branch: ${diagnostics.mainBranch || "unknown"}${diagnostics.targetSha ? ` (${diagnostics.targetSha})` : " (SHA unknown)"}`,
		`- Merge base: ${diagnostics.baseSha || "unknown"}`,
		`- Strategy: ${diagnostics.strategy}`,
		files.length > 0
			? `- Conflicting files:\n  - ${files.join("\n  - ")}`
			: "- Conflicting files: unknown (could not list unmerged paths)",
		"Resolve each listed file, then retry the merge stage — do not switch branches by hand; the engine owns the branch lifecycle.",
	];
	return { block: lines.join("\n"), diagnostics };
}


/***
 * MARK: mergeBranch
 * @description Merges the given branch into the CURRENT branch. On conflict the
 *   merge is aborted (unless opts.abortOnConflict === false) and a typed
 *   GitMergeConflictError is thrown with the canonical, human-facing message
 *   'Merge conflict: please resolve all merge conflicts with main' plus the
 *   conflicting file list AND the source/target/base SHAs and strategy
 *   detail (see buildGitConflictDiagnostics) so Tier 3 failback can resolve
 *   autonomously. Non-conflict failures (e.g. unknown branch) surface
 *   as plain GitError with git's own message.
 * @example const { stdout } = await mergeBranch('/repo', 'kb/task-1') // resolves on clean merge
 * @param {string} projectCwd
 * @param {string} branch - Branch to merge INTO the current branch.
 * @param {Object} [opts]
 * @param {boolean} [opts.abortOnConflict=true] - Roll back the conflicted merge.
 * @param {string} [opts.timeout=120000] - Merge command timeout in ms.
 * @returns {Promise<{stdout: string, stderr: string}>}
 ***/
export async function mergeBranch(projectCwd, branch, opts = {}) {
	_assertValidBranchName(branch, "merge");
	const abortOnConflict = opts.abortOnConflict !== false;

	// Guard: refuse to start a merge while a previous one is unresolved.
	if (await isMergeInProgress(projectCwd)) {
		await abortMerge(projectCwd);
	}

	// Merges mint commits too: provision a repo-local fallback identity first
	// so fresh machines (no global gitconfig) can merge.
	await ensureGitIdentity(projectCwd);

	// Capture the SHAs behind this attempt BEFORE merging (best-effort: a
	// failed read degrades to null, never to a failed merge).
	const readSha = async (args) => {
		try {
			const { stdout } = await git(projectCwd, args);
			return stdout.trim() || null;
		} catch {
			return null;
		}
	};
	const [sourceSha, targetSha, baseSha] = await Promise.all([
		readSha(["rev-parse", "--verify", branch]),
		readSha(["rev-parse", "--verify", "HEAD"]),
		readSha(["merge-base", "HEAD", branch]),
	]);

	let result;
	try {
		result = await git(projectCwd, ["merge", "--no-edit", branch], {
			timeout: opts.timeout || 120000,
		});
		return { stdout: result.stdout, stderr: result.stderr };
	} catch (e) {
		const conflicted =
			e instanceof GitMergeConflictError ||
			/CONFLICT|(Automatic merge failed|merge failed because)|unmerged files/i.test(
				`${e.message || ""}\n${e.stdout || ""}\n${e.stderr || ""}`,
			) ||
			(await isMergeInProgress(projectCwd));
		if (!conflicted) throw e;

		let conflictedFiles = [];
		try {
			const { stdout } = await git(projectCwd, [
				"diff",
				"--name-only",
				"--diff-filter=U",
			]);
			conflictedFiles = stdout
				.split("\n")
				.map((l) => l.trim())
				.filter(Boolean);
		} catch {
			// best effort
		}
		if (abortOnConflict) {
			try {
				await abortMerge(projectCwd);
			} catch {
				// Re-surface abort failures after the conflict error below.
			}
		}
		throw new GitMergeConflictError(
			"Merge conflict: please resolve all merge conflicts with main",
			{
				conflictedFiles,
				sourceSha,
				targetSha,
				baseSha,
				strategy: MERGE_STRATEGY,
				code: e.code,
				args: e.args,
				stdout: e.stdout,
				stderr: e.stderr,
			},
		);
	}
}


