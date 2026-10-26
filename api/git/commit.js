import { git } from "./exec.js";
import { currentBranch, hasCommits, isGitRepository } from "./status.js";
import { getWorkingTreeStatus, isWorkingTreeClean } from "./workingTreeStatus.js";
import { GitBranchMismatchError } from "./errors.js";

/***
 * MARK: DEFAULT_GIT_AUTHOR_NAME
 * @description Repo-local fallback git identity provisioned by
 *   `ensureGitIdentity` when the machine has no configured author. Overridable
 *   via `KAINBAIN_GIT_AUTHOR_NAME` / `KAINBAIN_GIT_AUTHOR_EMAIL`.
 ***/
export const DEFAULT_GIT_AUTHOR_NAME = "KainBain Agent";
export const DEFAULT_GIT_AUTHOR_EMAIL = "kainbain@local";


/***
 * MARK: ensureGitIdentity
 * @description Guarantees `git commit` (and merge commits) can succeed on a
 *   fresh machine with no global `~/.gitconfig`: reads the effective
 *   `user.name`/`user.email`, and writes any missing half as a REPO-LOCAL
 *   (`--local`) fallback so the user's global identity is never touched.
 *   Fresh KainBain projects otherwise fail every engine commit (peer review
 *   F-1). No-op outside a git repository.
 * @example await ensureGitIdentity('/repo') => { provisioned: true, name: 'KainBain Agent', email: 'kainbain@local' }
 * @param {string} projectCwd
 * @returns {Promise<{provisioned: boolean, name: string|null, email: string|null}>}
 ***/
export async function ensureGitIdentity(projectCwd) {
	if (!(await isGitRepository(projectCwd))) {
		return { provisioned: false, name: null, email: null };
	}
	const readConfig = async (key) => {
		try {
			const { stdout } = await git(projectCwd, ["config", key]);
			return stdout.trim();
		} catch {
			return "";
		}
	};
	const existingName = await readConfig("user.name");
	const existingEmail = await readConfig("user.email");
	const fallbackName =
		(process.env.KAINBAIN_GIT_AUTHOR_NAME || "").trim() ||
		DEFAULT_GIT_AUTHOR_NAME;
	const fallbackEmail =
		(process.env.KAINBAIN_GIT_AUTHOR_EMAIL || "").trim() ||
		DEFAULT_GIT_AUTHOR_EMAIL;
	let provisioned = false;
	if (!existingName) {
		await git(projectCwd, ["config", "--local", "user.name", fallbackName]);
		provisioned = true;
	}
	if (!existingEmail) {
		await git(projectCwd, ["config", "--local", "user.email", fallbackEmail]);
		provisioned = true;
	}
	return {
		provisioned,
		name: existingName || fallbackName,
		email: existingEmail || fallbackEmail,
	};
}


/***
 * MARK: commitAllIfNeeded
 * @description Reliability fallback for the merge stage: KainBain agents work
 *   on files directly and are not guaranteed to commit, so the merge stage
 *   first commits any uncommitted changes (git add -A + git commit) on the
 *   branch that is currently checked out. Without this a merge would silently
 *   merge nothing. Respects .gitignore; a failure to commit is only treated as
 *   fatal when the tree is still dirty afterwards.
 *   When `opts.body` is a non-empty string the commit is written body-safe as
 *   `git commit --cleanup=verbatim -m <subject> -m <body>`: the subject stays
 *   scannable in `git log --oneline` while the body (e.g. a whole curated
 *   stage prompt, including `#`-leading headings, quotes, and unicode) is
 *   preserved byte-for-byte. Without a body the legacy single-`-m` path is
 *   used unchanged.
 * @example await commitAllIfNeeded(cwd, 'kb/task-1') => { committed: true, hash: 'abc' }
 * @example await commitAllIfNeeded(cwd, 'subject', { body: 'full prompt…' }) => { committed: true, hash: 'abc' }
 * @param {string} projectCwd
 * @param {string} [message='KainBain: commit task work before merge'] - Commit subject when committing.
 * @param {Object} [opts]
 * @param {string} [opts.body] - Optional commit body, committed verbatim after a blank line.
 * @param {string} [opts.expectedBranch] - Branch affinity guard: when set,
 *   the commit is refused with a GitBranchMismatchError unless the working
 *   tree is checked out on exactly this branch. Opt-in so interactive and
 *   legacy callers keep the historical permissive behaviour.
 * @returns {Promise<{committed: boolean, hash: string|null}>}
 * @throws {GitBranchMismatchError} When `opts.expectedBranch` is set and the
 *   tree is on a different branch (the caller's files must not be committed
 *   onto a sibling task's branch).
 ***/
export async function commitAllIfNeeded(projectCwd, message, opts = {}) {
	if (!(await isGitRepository(projectCwd)))
		return { committed: false, hash: null };
	if (!(await hasCommits(projectCwd))) return { committed: false, hash: null };

	// Branch affinity guard (opt-in): never stage/commit when a concurrent
	// task has moved the shared checkout off the branch this caller owns.
	// A failed branch read is treated as a mismatch (fail closed) so an
	// unreadable HEAD can never silently accept an alien commit.
	if (opts.expectedBranch) {
		const actualBranch = await currentBranch(projectCwd).catch(() => null);
		if (actualBranch !== opts.expectedBranch) {
			throw new GitBranchMismatchError(
				`Refusing to commit on the wrong branch: expected '${opts.expectedBranch}' but the working tree is on '${actualBranch || "unknown"}'. ` +
					`A concurrent task likely moved HEAD; re-run the stage so it can re-establish its branch.`,
				{ expectedBranch: opts.expectedBranch, actualBranch },
			);
		}
	}

	const { clean } = await getWorkingTreeStatus(projectCwd, { ignorePaths: [] });
	if (clean) return { committed: false, hash: null };
	// Fresh machines have no git identity: provision a repo-local fallback
	// before committing so the engine commit below cannot fail for that.
	await ensureGitIdentity(projectCwd);
	await git(projectCwd, ["add", "-A"]);
	const subject = message || "KainBain: commit task work before merge";
	const body =
		opts && typeof opts.body === "string" && opts.body.length > 0
			? opts.body
			: null;
	try {
		await git(
			projectCwd,
			body
				? ["commit", "--cleanup=verbatim", "-m", subject, "-m", body]
				: ["commit", "-m", subject],
		);
	} catch (e) {
		// 'nothing to commit' after add means everything was gitignored — fine.
		const stillDirty = !(await isWorkingTreeClean(projectCwd, {
			ignorePaths: [],
		}));
		if (stillDirty) throw e;
		return { committed: false, hash: null };
	}
	let hash = null;
	try {
		const { stdout } = await git(projectCwd, ["rev-parse", "--short", "HEAD"]);
		hash = stdout;
	} catch {
		// cosmetic only
	}
	return { committed: true, hash };
}


