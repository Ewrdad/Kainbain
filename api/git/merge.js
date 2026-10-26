import { git } from "./exec.js";
import { _assertValidBranchName, isValidBranchName } from "./validation.js";
import { isMergeInProgress } from "./status.js";
import { ensureGitIdentity } from "./commit.js";
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


