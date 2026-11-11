import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { git } from "./exec.js";
import { resolveDocsDirName } from "../docsPath.js";
import { resolveKainbainDirName } from "../kainbainDir.js";
import { currentBranch, hasCommits, isGitRepository } from "./status.js";
import {
	getWorkingTreeStatus,
	isWorkingTreeClean,
	_resolveIgnorePaths,
	_parsePorcelainEntries,
} from "./workingTreeStatus.js";
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
 *   Live task snapshots (`docs/tasks/<id>/task.md`) are never staged:
 *   snapshot-only dirt is a no-op, and any staged snapshots are reset before
 *   the commit (Step 5 — recording a snapshot deletion is how a merge once
 *   dropped tasks from the board).
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

	// No-code enforcement: if enabled, erase any changes outside the docs
	// directory before staging, so code edits cannot leak into the commit.
	// Stage only the docs directory afterwards as a second line of defence,
	// so a failed erase can never sneak non-doc paths into the commit.
	const isNoCodeStage = opts?.noCode === true;
	let noCodeDocsDir = null;
	if (isNoCodeStage) {
		let projectHint = {};
		if (opts.project && typeof opts.project === "object") {
			projectHint = opts.project;
		} else if (opts.docsDirName) {
			projectHint = { docsDirName: opts.docsDirName };
		}
		noCodeDocsDir = resolveDocsDirName(projectHint);
		await discardChangesOutsideDocs(projectCwd, noCodeDocsDir);
	}

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

	const status = await getWorkingTreeStatus(projectCwd, { ignorePaths: [] });
	if (status.clean) return { committed: false, hash: null };
	const normalizeSnapshotPath = (raw) => String(raw).replace(/\\/g, "/").replace(/["']/g, "");
	// Live task snapshots are backend store state, never branch content
	// (Step 5): a tree holding ONLY snapshot dirt has no stage work to
	// commit — the snapshot path owns it. Committing here is exactly how
	// recorded snapshot deletions reached main and dropped tasks from the
	// board (2026-11-03: 10 tasks lost through a merge).
	const onlySnapshots = (status.dirtyPaths || []).every((raw) =>
		isLiveTaskSnapshotPath(normalizeSnapshotPath(raw), opts),
	);
	if (onlySnapshots) return { committed: false, hash: null };
	// Fresh machines have no git identity: provision a repo-local fallback
	// before committing so the engine commit below cannot fail for that.
	await ensureGitIdentity(projectCwd);
	if (noCodeDocsDir) {
		await git(projectCwd, ["add", "-A", "--", noCodeDocsDir]);
	} else {
		await git(projectCwd, ["add", "-A"]);
	}
	// Unstage any live snapshots `add -A` just swept in: their
	// modifications — and especially worktree deletions — must never land
	// in an engine commit. The worktree files are left alone; the engine
	// regenerates and owns them.
	try {
		const { stdout } = await git(projectCwd, ["diff", "--cached", "--name-only", "-z"]);
		const stagedSnapshots = String(stdout || "")
			.split("\0")
			.map((entry) => entry.trim())
			.filter((entry) => entry && isLiveTaskSnapshotPath(normalizeSnapshotPath(entry), opts));
		if (stagedSnapshots.length > 0) {
			await git(projectCwd, ["reset", "-q", "--", ...stagedSnapshots]);
		}
	} catch {
		// Best-effort: the commit below owns real failures. If the unstage
		// failed the snapshots stay staged — no worse than before this guard.
	}
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


/***
 * MARK: isLiveTaskSnapshotPath
 * @description Pure predicate: true when a repo-relative path is a live
 *   task snapshot (`task.md` under a task-docs prefix such as
 *   `docs/tasks/<id>/`). Live snapshots are store state regenerated on
 *   every save — they must never be staged or merged (Step 5). Stage
 *   reports (`docs/tasks/<id>/report-*.md`) and review assets are
 *   deliverables and return false.
 * @example isLiveTaskSnapshotPath('docs/tasks/abc/task.md') => true
 * @example isLiveTaskSnapshotPath('docs/tasks/abc/report.md') => false
 * @param {string} path - Repo-relative path from git.
 * @param {Object} [opts] - Same prefix hints as the clean-tree guard.
 * @returns {boolean}
 ***/
export function isLiveTaskSnapshotPath(p, opts = {}) {
	if (typeof p !== "string" || p.length === 0) return false;
	const norm = String(p).replace(/\\/g, "/").replace(/["']/g, "");
	if (path.basename(norm) !== "task.md") return false;
	const prefixes = _resolveIgnorePaths(opts);
	return prefixes.some((prefix) => {
		const normPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
		return norm.startsWith(normPrefix);
	});
}

/***
 * MARK: untrackLiveTaskSnapshots
 * @description One-time-per-checkout migration (Step 5): removes tracked
 *   live snapshots (`docs/tasks/<id>/task.md`) from the index WITHOUT
 *   touching the worktree file. Tracked snapshots are the dual-ownership
 *   residue — the backend rewrites them on main while old task branches
 *   carry committed copies, which is what produced the untracked-overwrite
 *   and snapshot-conflict merge failures. After untracking, the guard
 *   ignores them, switches no longer trip on them, and no branch can carry
 *   them again (commitEngineSnapshots never stages them). Best-effort:
 *   returns the untracked paths, or `[]` when there is nothing to do.
 * @example await untrackLiveTaskSnapshots('/repo') => { untracked: ['docs/tasks/t/task.md'] }
 * @param {string} projectCwd - Working directory for the command.
 * @param {Object} [opts] - Same prefix hints as the clean-tree guard.
 * @returns {Promise<{untracked: Array<string>}>}
 ***/
export async function untrackLiveTaskSnapshots(projectCwd, opts = {}) {
	if (!(await isGitRepository(projectCwd))) return { untracked: [] };
	if (!(await hasCommits(projectCwd))) return { untracked: [] };
	let files;
	try {
		const { stdout } = await git(projectCwd, ["ls-files", "-z"]);
		files = stdout.split("\0").map((s) => s.trim()).filter(Boolean);
	} catch {
		return { untracked: [] };
	}
	// Scope the migration to files with snapshot dirt RIGHT NOW. Untracking
	// a clean tracked copy would stage a deletion with no corresponding
	// snapshot commit in the same call — the staged deletion is left behind
	// and blocks the very switch the caller is preparing ("untracked files
	// would be removed"). Clean copies migrate lazily on their next dirt.
	let dirty = [];
	try {
		({ dirtyPaths: dirty } = await getWorkingTreeStatus(projectCwd, { ignorePaths: [] }));
	} catch {
		return { untracked: [] };
	}
	const dirtySet = new Set(
		(dirty || []).map((raw) => String(raw).replace(/\\/g, "/").replace(/["']/g, "")),
	);
	const live = files.filter((f) => isLiveTaskSnapshotPath(f, opts) && dirtySet.has(f));
	if (live.length === 0) return { untracked: [] };
	try {
		await git(projectCwd, ["rm", "--cached", "-q", "--", ...live]);
	} catch {
		return { untracked: [] };
	}
	return { untracked: live };
}

/***
 * MARK: commitEngineSnapshots
 * @description Commits ONLY the engine's own snapshot dirt (the guard-ignored
 *   report/asset paths plus the state dir) so a branch switch never
 *   trips on the engine's just-written bookkeeping. Live task snapshots
 *   (`docs/tasks/<id>/task.md`) are untracked, never staged (Step 5) —
 *   a just-untracked deletion rides along in the same snapshot commit.
 *   Real work — operator edits, task deliverables, anything outside the
 *   ignore prefixes — is never staged: the clean-tree guard still refuses
 *   loudly on it after this runs. Staged real changes stay staged (the
 *   commit is pathspec-limited to snapshot paths). No-op when no snapshot
 *   dirt exists. Opt-in branch affinity via `opts.expectedBranch`, same
 *   fail-closed contract as commitAllIfNeeded.
 * @example await commitEngineSnapshots('/repo', 'pre-switch snapshots') => { committed: true, hash: 'abc' }
 * @param {string} projectCwd
 * @param {string} [message='KainBain: commit engine snapshots'] - Commit subject.
 * @param {Object} [opts]
 * @param {string} [opts.expectedBranch] - Branch affinity guard (fail closed).
 * @param {Object} [opts.project] - Project record hint for custom docs/state dir names.
 * @param {Array<string>} [opts.ignorePaths] - Explicit ignore prefixes (overrides the resolved defaults).
 * @returns {Promise<{committed: boolean, hash: string|null}>}
 * @throws {GitBranchMismatchError} When `opts.expectedBranch` is set and mismatched.
 ***/
export async function commitEngineSnapshots(projectCwd, message, opts = {}) {
	if (!(await isGitRepository(projectCwd)))
		return { committed: false, hash: null };
	if (!(await hasCommits(projectCwd))) return { committed: false, hash: null };

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

	// Full status (no ignores), then keep only the guard-ignored snapshot
	// paths using the exact prefix semantics the guard itself applies.
	const { dirtyPaths } = await getWorkingTreeStatus(projectCwd, {
		ignorePaths: [],
	});
	const prefixes = _resolveIgnorePaths(opts);
	const snapshotPaths = dirtyPaths.filter((raw) => {
		const p = String(raw).replace(/\\/g, "/").replace(/["']/g, "");
		return prefixes.some((prefix) => {
			const normPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
			return p === prefix || p.startsWith(normPrefix);
		});
	});
	// Nothing engine-owned to do: return BEFORE untracking. Untracking
	// stages a deletion in the real index, so it must only ever run when
	// a snapshot commit follows in the same call — otherwise the staged
	// deletion is left behind and blocks the pending switch with
	// "untracked files would be removed".
	if (snapshotPaths.length === 0) return { committed: false, hash: null };

	// Live task snapshots are store state, never branch content: untrack
	// them (worktree files preserved) and never stage them — only the
	// remaining report/asset snapshots are committable (Step 5). A
	// just-untracked snapshot leaves a staged deletion that would block
	// the very switch this commit prepares, so the deletion rides along
	// in the same snapshot commit.
	let untracked = [];
	try {
		({ untracked } = await untrackLiveTaskSnapshots(projectCwd, opts));
	} catch {
		// Best-effort: the staging below owns real failures.
	}
	const committable = snapshotPaths.filter((raw) => !isLiveTaskSnapshotPath(raw, opts));
	const normalized = new Set(
		snapshotPaths.map((raw) => String(raw).replace(/\\/g, "/").replace(/["']/g, "")),
	);
	const stagedRemovals = untracked.filter((u) => normalized.has(u));
	const commitPaths = [...committable, ...stagedRemovals];
	if (commitPaths.length === 0) return { committed: false, hash: null };

	await ensureGitIdentity(projectCwd);
	const subject = message || "KainBain: commit engine snapshots";
	try {
		// The snapshot commit is built in a scratch index: porcelain
		// `commit -- <path>` implies --include and would re-add the
		// untracked-again snapshot's worktree file, defeating the untrack;
		// and a full-index commit would sweep unrelated staged operator
		// work into the snapshot commit. The scratch index holds exactly
		// the snapshot additions plus the untrack deletions, and HEAD moves
		// forward compare-and-swap (a concurrent commit fails loud instead
		// of being overwritten).
		const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-snap-idx-"));
		try {
			const scratchEnv = { env: { GIT_INDEX_FILE: path.join(scratchDir, "index") } };
			await git(projectCwd, ["read-tree", "HEAD"], scratchEnv);
			if (committable.length > 0) {
				await git(projectCwd, ["add", "--", ...committable], scratchEnv);
			}
			if (stagedRemovals.length > 0) {
				await git(projectCwd, ["rm", "--cached", "-q", "--", ...stagedRemovals], scratchEnv);
			}
			const tree = (await git(projectCwd, ["write-tree"], scratchEnv)).stdout;
			const parent = (await git(projectCwd, ["rev-parse", "HEAD"])).stdout;
			const newSha = (await git(projectCwd, ["commit-tree", tree, "-p", parent, "-m", subject])).stdout;
			await git(projectCwd, ["update-ref", "HEAD", newSha, parent]);
			// Re-point the real index at the new HEAD for exactly these
			// paths (worktree untouched): the scratch commit bypassed the
			// real index, which still stages the pre-commit state and
			// would read as phantom dirt / block the pending switch.
			await git(projectCwd, ["reset", "-q", "HEAD", "--", ...commitPaths]);
		} finally {
			fs.rmSync(scratchDir, { recursive: true, force: true });
		}
	} catch (e) {
		// 'nothing to commit' after add means the dirt vanished mid-flight
		// (concurrent commit) — fine. Anything still dirty is a real failure.
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



/***
 * MARK: isDocPath
 * @description Pure predicate: true when a repo-relative path lives under the
 *   project's docs directory (any depth). Used by no-code stages to decide
 *   which changes survive.
 * @example isDocPath('docs/tasks/t/plan.md', 'docs') => true
 * @example isDocPath('src/index.js', 'docs') => false
 * @param {string} relativePath
 * @param {string} [docsDirName='docs']
 * @returns {boolean}
 ***/
export function isDocPath(relativePath, docsDirName) {
	if (typeof relativePath !== "string" || !relativePath) return false;
	const name =
		typeof docsDirName === "string" && docsDirName.trim()
			? docsDirName.trim()
			: resolveDocsDirName({});
	const norm = String(relativePath)
		.replace(/\\/g, "/")
		.replace(/["']/g, "")
		.replace(/^(?:\.\/)+/, "")
		.replace(/^\/+/, "");
	const trimmed = norm.replace(/\/$/, "");
	return trimmed === name || trimmed.startsWith(`${name}/`);
}

/***
 * MARK: discardChangesOutsideDocs
 * @description Best-effort erase of every working-tree change outside the
 *   project's docs directory: tracked modifications are reset/restored,
 *   staged paths are unstaged, and untracked files/directories are removed.
 *   Paths under the docs directory (and the docs directory itself) are left
 *   untouched so documentation work survives. Never throws.
 * @example await discardChangesOutsideDocs('/repo', 'docs') => { discarded: ['src/index.js'] }
 * @param {string} projectCwd
 * @param {string} [docsDirName='docs']
 * @param {Object} [opts]
 * @returns {Promise<{discarded: Array<string>}>}
 ***/
export async function discardChangesOutsideDocs(projectCwd, docsDirName, opts = {}) {
	const discarded = [];
	try {
		if (!(await isGitRepository(projectCwd))) return { discarded };
		const { stdout } = await git(projectCwd, ["status", "--porcelain", "-uall"]);
		const entries = _parsePorcelainEntries(stdout);
		let dirName = null;
		if (typeof docsDirName === "string" && docsDirName.trim()) {
			dirName = docsDirName.trim();
		} else {
			const projectHint =
				opts && typeof opts.project === "object" ? opts.project : {};
			dirName = resolveDocsDirName(projectHint);
		}
		const nonDoc = [];
		const tracked = [];
		const untracked = [];
		for (const entry of entries) {
			const p = String(entry.path || "")
				.replace(/\\/g, "/")
				.replace(/["']/g, "");
			if (!p || isDocPath(p, dirName)) continue;
			// Never erase engine state (.kainbain/...) even under no-code.
			const kainbainDirName = resolveKainbainDirName(
				opts && typeof opts === "object" ? opts.project || {} : {},
			);
			if (p === kainbainDirName || p.startsWith(`${kainbainDirName}/`)) continue;
			if (!nonDoc.includes(p)) nonDoc.push(p);
			if (!discarded.includes(p)) discarded.push(p);
			if ((entry.status || "").trim() === "??") {
				if (!untracked.includes(p)) untracked.push(p);
			} else {
				if (!tracked.includes(p)) tracked.push(p);
			}
		}
		if (nonDoc.length === 0) return { discarded };

		// Unstage any staged/known non-doc paths first (best-effort). Only
		// call reset on tracked paths — untracked pathspecs make the whole
		// command fail and would leave tracked changes in place.
		if (tracked.length > 0) {
			try {
				await git(projectCwd, ["reset", "-q", "HEAD", "--", ...tracked]);
			} catch {
				// Best-effort.
			}
			// Restore tracked changes.
			try {
				await git(projectCwd, ["checkout", "--", ...tracked]);
			} catch {
				// Best-effort.
			}
		}
		// Remove untracked (and formerly staged-turned-untracked) non-doc
		// paths. Clean only; tracked modified files remain protected by
		// checkout above.
		try {
			await git(projectCwd, ["clean", "-fd", "--", ...nonDoc]);
		} catch {
			// Best-effort.
		}
	} catch {
		// Erase semantics are best-effort; never block commit.
	}
	return { discarded };
}
