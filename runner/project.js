import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
// The Runner bundle ships api/ next to runner/, so the backend's own asset
// guards are the single source of truth for which claim-shipped names may
// land in the worktree — the Runner must accept exactly what the backend
// would have stored (flat, sanitized, allowlisted image names).
import {
	isAllowedImageExt,
	sanitizeImageName,
} from "../api/work/taskAssets.js";
// WP2 signal: worktree evictions (§3.8 minimum). The import is cycle-free
// (productionSignals.js imports nothing) and recording never alters the
// eviction decision below.
import { recordWorktreeEviction } from "../api/watch/productionSignals.js";
// Shared commit/hook-failure contract: hook-output parsing and the
// transport envelope (same copy the backend executes).
import { buildGitFailureDetails, parseHookFailure } from "../shared/gitFailure.js";

const execFileAsync = promisify(execFile);

// Runner-side git defaults: never prompt for credentials (a hanging prompt
// wedged stages before the timeout existed), 60s per command.
export const RUNNER_GIT_TIMEOUT_MS = 60000;
export const RUNNER_GIT_LOCK_STALE_MS = 30000;
// Worktree fleet hygiene (e79b1d25 outage): at most WORKTREE_CAP foreign
// task workdirs live under the work root. A new task past the cap evicts
// the least-recently-used STALE workdir (no use within
// WORKTREE_EVICT_STALE_MS) instead of refusing — unpushed residue is parked
// on a kb-recovery/* branch first, never deleted. Tasks that completed (or
// vanished from the backend) are reaped right after their execution.
export const WORKTREE_CAP = 5;
export const WORKTREE_EVICT_STALE_MS = 30 * 60 * 1000;

/***
 * MARK: RunnerGitError
 * @description Structured Runner-side git failure. `code` is one of
 *   `git-timeout` (command exceeded its budget), `git-lock` (index.lock
 *   held by a live process or a fresh lock we must not steal),
 *   `git-hook-rejected` (a repo hook such as the pre-commit binary guard
 *   refused a commit/merge), or `git-failed` (anything git itself
 *   rejected, with git's message). Carries the argv and captured streams
 *   like the backend GitError, so the daemon can branch on `code`
 *   instead of parsing strings. `exitCode` is git's numeric exit status
 *   when known; `gitFailure` is the shared `GitFailureDetails` envelope
 *   for commit/merge failures (phase filled in by the caller that knows
 *   it — see `withGitFailurePhase`), so the daemon can report hook
 *   rejections as structured failed completions instead of crashing.
 * @example new RunnerGitError('git-lock', 'git status', { cwd: '/w' })
 ***/
export class RunnerGitError extends Error {
	constructor(code, message, { args = [], stdout = "", stderr = "", cwd = "", exitCode = null, gitFailure = null } = {}) {
		super(message);
		this.name = "RunnerGitError";
		this.code = code;
		this.args = args;
		this.stdout = stdout;
		this.stderr = stderr;
		this.cwd = cwd;
		this.exitCode = Number.isInteger(exitCode) ? exitCode : null;
		this.gitFailure = gitFailure && typeof gitFailure === "object" ? gitFailure : null;
	}
}

/***
 * MARK: withGitFailurePhase
 * @description Tags a RunnerGitError's structured `gitFailure` with the
 *   lifecycle phase that produced it (`worktree-setup`, `stage-commit`,
 *   `merge` — `recovery` is accepted for wire compatibility but has no
 *   producer since recovery snapshots bypass hooks) when the throw site
 *   knows more than the git layer did. A phase already set wins (the
 *   innermost site is the most precise); errors without a `gitFailure`
 *   pass through untouched.
 *   Returns the same error for `throw withGitFailurePhase({ error, phase })`.
 * @example throw withGitFailurePhase({ error: err, phase: 'stage-commit' })
 * @param {Object} [input] - Tagging context.
 * @param {*} input.error - Error to tag (usually RunnerGitError).
 * @param {string} input.phase - Lifecycle phase.
 * @returns {*} The same error, tagged in place when applicable.
 ***/
export function withGitFailurePhase({ error = null, phase = null } = {}) {
	if (error instanceof RunnerGitError && error.gitFailure && !error.gitFailure.phase) {
		error.gitFailure = buildGitFailureDetails({ ...error.gitFailure, phase });
	}
	return error;
}

// Per-workdir serialization: the Runner daemon is one process, and two
// assignments sharing a mirror or worktree (clone + refresh, commit +
// refresh) must not interleave inside one `.git` dir. Mirrors the backend
// `withRepoGitLock` contract without importing backend code (the Runner
// ships without the backend tree).
const workdirChains = new Map();

function chainFor(cwd) {
	const key = path.resolve(String(cwd || ""));
	const prior = workdirChains.get(key) || Promise.resolve();
	let release;
	const mine = new Promise((resolve) => {
		release = resolve;
	});
	workdirChains.set(key, prior.then(() => mine, () => mine));
	return prior.then(
		() => () => {
			release();
			if (workdirChains.get(key)) {
				// Leave tail cleanup to the next waiter; a resolved tail
				// holding the map entry costs nothing and avoids a race.
			}
		},
		() => () => {
			release();
		},
	);
}

/***
 * MARK: liveGitProcessRunning
 * @description Best-effort machine-wide check for any live `git` process
 *   (Linux /proc scan). Used before clearing a stale index.lock so the
 *   Runner never steals a lock the backend or a sibling Runner holds.
 *   Fail-closed: when the scan itself is unreadable, report a live holder.
 * @example await liveGitProcessRunning() => false
 * @returns {Promise<boolean>} True when a git process may be live.
 ***/
export async function liveGitProcessRunning() {
	try {
		const entries = fs.readdirSync("/proc");
		for (const entry of entries) {
			if (!/^\d+$/.test(entry)) continue;
			let cmdline;
			try {
				cmdline = fs.readFileSync(`/proc/${entry}/cmdline`, "utf8");
			} catch {
				continue;
			}
			const argv0 = cmdline.split("\0")[0] || "";
			const base = argv0.split("/").pop();
			if (base === "git" || base.startsWith("git-")) return true;
			if (String(process.pid) === entry) continue;
		}
		return false;
	} catch {
		return true;
	}
}

function gitDirFor(cwd) {
	try {
		const dotGit = path.join(cwd, ".git");
		const stat = fs.statSync(dotGit);
		if (stat.isFile()) {
			const content = fs.readFileSync(dotGit, "utf8");
			const match = content.match(/^gitdir:\s*(.+)$/m);
			if (match) return path.resolve(cwd, match[1].trim());
		}
		return dotGit;
	} catch {
		return null;
	}
}

/***
 * MARK: maybeRecoverWorkdirLock
 * @description Clears a provably-stale `<gitdir>/index.lock` inside the
 *   Runner's own workdir before running git (mirrors the backend stale-lock
 *   recovery, scoped to one workdir, never machine-wide). Recovers only
 *   when NO live git process exists anywhere AND the lock is older than
 *   RUNNER_GIT_LOCK_STALE_MS. Returns `{ recovered }`; throws
 *   RunnerGitError(`git-lock`) when a lock is present but not provably
 *   stale, so the caller fails loud instead of piling onto a live holder.
 * @example await maybeRecoverWorkdirLock('/w/kb-t1') => { recovered: false, lockPath: null }
 ***/
export async function maybeRecoverWorkdirLock(cwd) {
	const gitDir = gitDirFor(cwd);
	if (!gitDir) return { recovered: false, lockPath: null, reason: "no-gitdir" };
	const lockPath = path.join(gitDir, "index.lock");
	let stat;
	try {
		stat = fs.statSync(lockPath);
	} catch {
		return { recovered: false, lockPath: null, reason: "no-lock" };
	}
	const ageMs = Date.now() - stat.mtimeMs;
	if (await liveGitProcessRunning()) {
		throw new RunnerGitError("git-lock", `git index.lock is held (a live git process exists) — refusing to run in '${cwd}'`, { cwd });
	}
	if (ageMs < RUNNER_GIT_LOCK_STALE_MS) {
		throw new RunnerGitError("git-lock", `git index.lock is fresh (${Math.round(ageMs)}ms old) — refusing to steal an in-flight operation in '${cwd}'`, { cwd });
	}
	try {
		fs.unlinkSync(lockPath);
	} catch (err) {
		throw new RunnerGitError("git-lock", `stale git index.lock could not be cleared in '${cwd}': ${err?.message || err}`, { cwd });
	}
	return { recovered: true, lockPath, reason: "stale-cleared", ageMs };
}

function readGitSubcommand(args) {
	if (!Array.isArray(args)) return "";
	for (let i = 0; i < args.length; i += 1) {
		const token = args[i];
		// Global flags that consume the next argv slot (`git -c k=v …`).
		if (token === "-c" || token === "-C" || token === "--config") {
			i += 1;
			continue;
		}
		if (typeof token !== "string" || token.startsWith("-")) continue;
		return token;
	}
	return "";
}

function toRunnerGitError(args, cwd, err, stdout = "", stderr = "") {
	const killed = err?.killed || err?.signal === "SIGTERM";
	if (killed || /timed out|ETIMEDOUT/i.test(String(err?.message || "") + String(err?.code || ""))) {
		return new RunnerGitError("git-timeout", `git ${args.join(" ")} timed out in '${cwd}'`, { args, stdout, stderr, cwd });
	}
	if (/Unable to create '.*index\.lock'|index\.lock.*exists|Another git process/i.test(`${err?.message || ""}\n${stderr}\n${stdout}`)) {
		return new RunnerGitError("git-lock", `git ${args.join(" ")} hit index.lock contention in '${cwd}': ${(stderr || err?.message || "").trim()}`, { args, stdout, stderr, cwd });
	}
	const exitCode = typeof err?.code === "number" ? err.code : null;
	// Commit/merge failures carry structured hook detail: a hook rejection
	// (the pre-commit binary guard, a foreign hook) becomes the distinct
	// `git-hook-rejected` code, while hook-less commit failures keep
	// `git-failed` and gain the exit code plus the envelope. `merge --abort`
	// runs no hooks, so its failures stay plain. The envelope's phase is
	// filled in by the caller that knows it (see `withGitFailurePhase`).
	const subcommand = readGitSubcommand(args);
	const parsed =
		(subcommand === "commit" || subcommand === "merge") && !args.includes("--abort")
			? parseHookFailure({ command: `git ${args.join(" ")}`, exitCode, stdout, stderr })
			: null;
	const gitFailure = parsed
		? buildGitFailureDetails({ command: `git ${args.join(" ")}`, exitCode, ...parsed })
		: null;
	if (parsed?.kind === "hook-rejected") {
		const hook = gitFailure.hookName && gitFailure.hookName !== "unknown" ? `the ${gitFailure.hookName} hook` : "a git hook";
		return new RunnerGitError(
			"git-hook-rejected",
			`git ${args.join(" ")} rejected by ${hook} in '${cwd}': ${(stderr || err?.message || "").trim() || "no output"}`,
			{ args, stdout, stderr, cwd, exitCode, gitFailure },
		);
	}
	return new RunnerGitError("git-failed", `git ${args.join(" ")} failed in '${cwd}': ${(stderr || err?.message || "").trim() || "no output"}`, { args, stdout, stderr, cwd, exitCode, gitFailure });
}

/***
 * MARK: runGit
 * @description Hardened git runner for Runner-side project prep: argv only
 *   (no shell), per-workdir serialized, `GIT_TERMINAL_PROMPT=0` so missing
 *   credentials fail fast instead of hanging, a 60s budget per command, and
 *   stale `index.lock` recovery scoped to the workdir (live-holder and
 *   fresh-lock refusals throw `git-lock` instead of piling on). Throws
 *   RunnerGitError with a stable `code` (`git-timeout`/`git-lock`/
 *   `git-failed`) so the daemon branches on codes, not strings.
 * @example await runGit('/repo', ['rev-parse', 'HEAD']) => { stdout: 'abc...' }
 * @param {string} cwd - Repository to run in.
 * @param {string[]} args - Git arguments (no shell, no interpolation).
 * @param {Object} [opts]
 * @param {number} [opts.timeout] - Per-command budget in ms.
 * @returns {Promise<{stdout: string, stderr: string}>} Git output.
 ***/
export async function runGit(cwd, args, opts = {}) {
	if (typeof cwd !== "string" || !cwd.trim()) {
		throw new RunnerGitError("git-failed", "runGit requires a working directory", { args: args || [] });
	}
	if (!Array.isArray(args) || args.length === 0 || args.some((a) => typeof a !== "string")) {
		throw new RunnerGitError("git-failed", "runGit requires a non-empty string argument array", { args: [], cwd });
	}
	const timeout = typeof opts.timeout === "number" && opts.timeout > 0 ? opts.timeout : RUNNER_GIT_TIMEOUT_MS;
	const unlock = await chainFor(cwd);
	try {
		try {
			await maybeRecoverWorkdirLock(cwd);
		} catch (lockErr) {
			if (lockErr instanceof RunnerGitError) throw lockErr;
		}
		try {
			const { stdout, stderr } = await execFileAsync("git", args, {
				cwd,
				timeout,
				env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
			});
			return { stdout: String(stdout ?? "").replace(/\s+$/, ""), stderr: String(stderr ?? "").replace(/\s+$/, "") };
		} catch (err) {
			// One stale-lock retry: the op raced a crashed git that left
			// its lock behind. Recovery refusal (live/fresh lock) propagates.
			if (err?.code !== "git-lock" && /index\.lock/i.test(`${err?.message || ""}`)) {
				const recovery = await maybeRecoverWorkdirLock(cwd).catch(() => null);
				if (recovery?.recovered) {
					try {
						const { stdout, stderr } = await execFileAsync("git", args, {
							cwd,
							timeout,
							env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
						});
						return { stdout: String(stdout ?? "").replace(/\s+$/, ""), stderr: String(stderr ?? "").replace(/\s+$/, "") };
					} catch (retryErr) {
						throw toRunnerGitError(args, cwd, retryErr, retryErr?.stdout, retryErr?.stderr);
					}
				}
			}
			if (err instanceof RunnerGitError) throw err;
			throw toRunnerGitError(args, cwd, err, err?.stdout, err?.stderr);
		}
	} finally {
		unlock();
	}
}

export function slugForRepo(repoUrl) {
	const base = String(repoUrl).split("/").filter(Boolean).pop() || "repo";
	return base.replace(/\.git$/, "").replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 64) || "repo";
}

/***
 * MARK: docsWorkdirFor
 * @description The docs-repo worktree paired with a code worktree:
 *   `<workdir>-docs` (e.g. `/w/kb-<taskId>` → `/w/kb-<taskId>-docs`). Both
 *   carry the same `kb/<taskId>` branch in their own mirrors, so docs
 *   history tracks task history in the separate docs repo. Null when no
 *   code workdir is known.
 * @example docsWorkdirFor('/w/kb-t1') => '/w/kb-t1-docs'
 * @param {string} workdir - Code worktree path.
 * @returns {string|null}
 ***/
export function docsWorkdirFor(workdir) {
	if (!workdir || typeof workdir !== "string" || !workdir.trim()) return null;
	return `${workdir}-docs`;
}

/***
 * MARK: resolveRunnerDocsRepoUrl
 * @description The docs-repo remote URL carried on a project record (or a
 *   claim payload), or null when the project keeps docs in the main repo.
 *   The stored value is credential-redacted; like the main repo's URL the
 *   Runner relies on ambient credentials (same login as the main repo).
 *   Mirrors the backend's `docsRepoUrlFor` without importing backend code.
 * @example resolveRunnerDocsRepoUrl({ docsRepo: { url: 'https://h/kb.git' } }) => 'https://h/kb.git'
 * @param {*} project - Project record or claim payload.
 * @returns {string|null}
 ***/
export function resolveRunnerDocsRepoUrl(project) {
	const repo = project?.docsRepo;
	if (!repo || typeof repo !== "object" || Array.isArray(repo)) return null;
	const url = repo.url;
	if (typeof url !== "string") return null;
	const trimmed = url.trim();
	return trimmed || null;
}

/***
 * MARK: resolveRunnerKainbainHome
 * @description Runner-side mirror of the backend's `resolveKainbainHome`:
 *   the docs-repo checkout (`docsRepo.localPath`) when the project has one,
 *   else the primary checkout cwd. Used as the SOURCE of task-docs syncs on
 *   the backend host — with a docs repo the primary's docs live there, not
 *   under `<cwd>/docs`.
 * @example resolveRunnerKainbainHome('/repo', { docsRepo: { localPath: '/srv/kb' } }) => '/srv/kb'
 * @param {string} cwd - Primary checkout path.
 * @param {*} [project] - Project record.
 * @returns {string|null}
 ***/
export function resolveRunnerKainbainHome(cwd, project) {
	const repo = project?.docsRepo;
	if (repo && typeof repo === "object" && !Array.isArray(repo) && typeof repo.localPath === "string" && repo.localPath.trim()) {
		return path.resolve(repo.localPath.trim());
	}
	if (!cwd || typeof cwd !== "string" || !cwd.trim()) return null;
	return path.resolve(cwd);
}

/***
 * MARK: shouldSyncTaskDocs
 * @description Whether the primary→worktree task-docs copy should run: with
 *   a docs-repo project the task docs already live in the paired docs
 *   worktree (synced through git, not copied), so the copy is skipped.
 *   Legacy projects (no docs repo) always sync.
 * @example shouldSyncTaskDocs({ project: { docsRepo: { url: 'https://h/kb.git' } }, docsWorkdir: '/w/kb-t1-docs' }) => false
 * @param {Object} [opts]
 * @param {*} [opts.project] - Project record.
 * @param {string|null} [opts.docsWorkdir] - Paired docs worktree, when prepared.
 * @returns {boolean}
 ***/
export function shouldSyncTaskDocs({ project = null, docsWorkdir = null } = {}) {
	if (docsWorkdir) return false;
	return !resolveRunnerDocsRepoUrl(project);
}

/***
 * MARK: refreshMirror
 * @description Self-healing mirror refresh (G6, D14): fetches the origin
 *   and hard-resets the mirror checkout to its upstream so a diverged
 *   local master heals instead of failing pulls forever. Masters only —
 *   per-task worktrees (`kb-*`) are never touched here.
 * @example await refreshMirror('/work/mirrors/repo')
 * @param {string} repoDir - Mirror checkout directory.
 * @returns {Promise<void>}
 ***/
export async function refreshMirror(repoDir) {
	await runGit(repoDir, ["fetch", "origin"]);
	try {
		await runGit(repoDir, ["reset", "--hard", "@{u}"]);
	} catch {
		// No upstream configured (e.g. a detached or hand-made mirror):
		// fall back to the old fast-forward pull, which errors loudly
		// when there is truly nothing to update from.
		await runGit(repoDir, ["pull", "--ff-only"]);
	}
}

/***
 * MARK: listOrphanWorkdirs
 * @description Worktree dirs under the root that do not belong to the given
 *   task. The daemon surfaces these at boot instead of discarding them
 *   (reboot-safe startup, D14): unpushed work is never deleted by cleanup.
 * @example listOrphanWorkdirs('/work', 't1') => ['/work/kb-t0']
 * @param {string} workRoot - Runner work root.
 * @param {string} currentTaskId - Task id to exclude.
 * @returns {string[]} Absolute orphan workdir paths.
 ***/
export function listOrphanWorkdirs(workRoot, currentTaskId) {
	const keep = `kb-${currentTaskId}`;
	let entries = [];
	try {
		entries = fs.readdirSync(workRoot, { withFileTypes: true });
	} catch {
		return [];
	}
	const names = new Set(entries.map((e) => e.name));
	return entries
		.filter((e) => {
			if (!e.isDirectory() || !e.name.startsWith("kb-") || e.name === keep) return false;
			// A docs worktree (`kb-<id>-docs`) is part of its code worktree's
			// pair and counts as the same slot: it is only an orphan on its
			// own when the base `kb-<id>` is gone (or is the current task).
			if (e.name.endsWith("-docs")) {
				const base = e.name.slice(0, -"-docs".length);
				if (base === keep || names.has(base)) return false;
			}
			return true;
		})
		.map((e) => path.join(workRoot, e.name));
}

/***
 * MARK: touchWorkdir
 * @description Marks a task workdir as recently used (directory mtime). The
 *   daemon touches the workdir on every prepare/reuse and on every claim
 *   renewal tick, so the LRU eviction below can tell a live workdir from a
 *   stale orphan without reading file contents. Directory mtime only (no
 *   marker file — a marker would pollute `git status` inside the worktree).
 *   Best-effort: returns false instead of throwing.
 * @example touchWorkdir('/w/kb-t1') => true
 * @param {string} workdir - Task workdir path.
 * @returns {boolean} Whether the touch succeeded.
 ***/
export function touchWorkdir(workdir) {
	try {
		if (!workdir || !fs.existsSync(workdir)) return false;
		const now = new Date();
		fs.utimesSync(workdir, now, now);
		return true;
	} catch {
		return false;
	}
}

/***
 * MARK: workdirMtimeMs
 * @description Last-use timestamp of a task workdir (directory mtime, kept
 *   current by `touchWorkdir`). Unstatable paths read as 0 (oldest) so a
 *   half-removed workdir is reclaimed first, never protected.
 * @example workdirMtimeMs('/w/kb-t1') => 1793315019524
 * @param {string} dir - Workdir path.
 * @returns {number} mtime in ms, or 0 when unreadable.
 ***/
export function workdirMtimeMs(dir) {
	try {
		return fs.statSync(dir).mtimeMs || 0;
	} catch {
		return 0;
	}
}

/***
 * MARK: commitRecoverySnapshot
 * @description Commits the staged residue as one internal snapshot on a
 *   `kb-recovery/*` branch. Single home for the recovery-commit argv (the
 *   reuse path and the eviction path both call here): repo-local identity
 *   plus `--no-verify`, so the two paths cannot drift apart. Recovery
 *   snapshots are local forensic parking, never task output — a failing
 *   repo hook (binary guard, linters) must never block preserving unpushed
 *   work, so hooks are bypassed by design and the bypass is warn-logged
 *   with the recovery branch for discoverability.
 *   Fails safe, never loud, when there is nothing to park: a file can
 *   vanish between the caller's dirty check and `git add`, leaving an
 *   empty index — that resolves with a "nothing staged" warn instead of
 *   throwing, so a benign race cannot fail the eviction or reuse. Any
 *   other git rejection (not a repo, lock held, timeout) still throws
 *   RunnerGitError, and a blank workdir or message throws immediately —
 *   those are caller bugs, not missing work.
 * @example await commitRecoverySnapshot('/w/kb-t1', 'recovery: …', { recoveryBranch: 'kb-recovery/t1/…' })
 * @param {string} workdir - Workdir whose staged residue to commit.
 * @param {string} message - Snapshot commit message.
 * @param {Object} [opts] - `{ recoveryBranch, log }`.
 * @param {string|null} [opts.recoveryBranch] - Recovery branch named in the warn log.
 * @param {*} [opts.log] - Warn sink (`{ warn }`, defaults to console).
 * @returns {Promise<void>}
 ***/
export async function commitRecoverySnapshot(workdir, message, { recoveryBranch = null, log = console } = {}) {
	if (typeof workdir !== "string" || !workdir.trim()) {
		throw new Error("commitRecoverySnapshot needs a workdir path to commit in.");
	}
	if (typeof message !== "string" || !message.trim()) {
		throw new Error("commitRecoverySnapshot needs a non-empty snapshot message.");
	}
	const warn = typeof log?.warn === "function" ? log.warn.bind(log) : console.warn.bind(console);
	const where = recoveryBranch ? ` on ${recoveryBranch}` : "";
	try {
		await runGit(workdir, [
			"-c", "user.name=KainBain Runner",
			"-c", "user.email=kainbain-runner@local",
			"commit", "--no-verify", "-m", message,
		]);
	} catch (err) {
		// Benign race: the caller saw a dirty tree, but by commit time the
		// index held nothing stageable. Skipping keeps a nothing-to-park
		// moment from failing the eviction or reuse it was called from.
		const output = `${err?.message || ""}\n${err?.stderr || ""}\n${err?.stdout || ""}`;
		if (err?.code === "git-failed" && /nothing to commit/i.test(output)) {
			warn(`Recovery snapshot${where} skipped: nothing staged to park (${message})`);
			return;
		}
		throw err;
	}
	warn(`Recovery snapshot${where} bypassed git hooks (--no-verify): ${message}`);
}

/***
 * MARK: preserveEvictedWorkdir
 * @description Parks a workdir's unpushed residue on a `kb-recovery/*`
 *   branch before the workdir is removed: dirty files are committed (via
 *   `commitRecoverySnapshot`, shared with the reuse path) and unpushed
 *   commits already live on the branch, so `git worktree remove` afterwards
 *   loses nothing.
 *   The residue is committed on the CURRENT checkout and the recovery branch
 *   is pointed at that commit — never `git checkout` the recovery branch
 *   first: a dirty index makes that fail with "you need to resolve your
 *   current index first", which stranded the workdir, made every eviction
 *   fail, and tripped WORKTREE_CAP_REACHED in a loop. The task branch is
 *   reset back afterwards, so its tip is unchanged.
 *   Resolves to the recovery branch name, or null when the workdir was
 *   clean and fully pushed (nothing to preserve).
 * @example await preserveEvictedWorkdir('/w/kb-t1') => 'kb-recovery/t1/2026-…'
 * @param {string} workdir - Task workdir to inspect and park.
 * @returns {Promise<string|null>} Recovery branch, or null when clean.
 ***/
export async function preserveEvictedWorkdir(workdir) {
	const branch = await runGit(workdir, ["rev-parse", "--abbrev-ref", "HEAD"])
		.then((r) => r.stdout.trim())
		.catch(() => "");
	const slug = (branch.startsWith("kb/")
		? branch.slice("kb/".length)
		: path.basename(workdir).replace(/^kb-/, "") || "task"
	).replaceAll("/", "-");
	const dirty = (await runGit(workdir, ["status", "--porcelain"])).stdout.trim() !== "";
	let ahead = 0;
	if (branch && branch !== "HEAD") {
		try {
			const { stdout } = await runGit(workdir, ["rev-list", "--count", `origin/${branch}..${branch}`]);
			ahead = Number.parseInt(stdout.trim(), 10) || 0;
		} catch {
			ahead = 0;
		}
	}
	if (!dirty && ahead <= 0) return null;
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const recoveredTo = `kb-recovery/${slug}/${stamp}`;
	if (!dirty) {
		// Only unpushed commits to preserve: they already live on the branch,
		// so just name a recovery ref at the current tip.
		await runGit(workdir, ["branch", recoveredTo, branch || "HEAD"]);
		return recoveredTo;
	}
	const headBefore = (await runGit(workdir, ["rev-parse", "HEAD"])).stdout.trim();
	await runGit(workdir, ["add", "-A"]);
	await commitRecoverySnapshot(workdir, `recovery: unpushed work parked before eviction (${path.basename(workdir)})`, {
		recoveryBranch: recoveredTo,
	});
	// Recovery branch captures the residue commit; then put the task branch
	// back where it was (soft reset keeps the index/worktree untouched).
	await runGit(workdir, ["branch", recoveredTo]);
	if (branch && branch !== "HEAD" && headBefore) {
		await runGit(workdir, ["reset", "--soft", headBefore]).catch(() => {});
	}
	return recoveredTo;
}

/***
 * MARK: preserveWorkdirPairForRemoval
 * @description Parks unpushed residue for a task workdir AND its paired docs
 *   worktree (`<dir>-docs`) before pair-atomic removal (eviction/reap): each
 *   side gets its own `kb-recovery/*` branch in its own repo, so dropping a
 *   docs-repo task's slot never loses docs residue the code-side check cannot
 *   see. Legacy workdirs (no `-docs` twin) preserve exactly as before.
 * @example await preserveWorkdirPairForRemoval('/w/kb-t1') => { parkedTo: null, docsParkedTo: 'kb-recovery/t1/2026-…' }
 * @param {string} dir - Code task workdir.
 * @returns {Promise<{parkedTo: string|null, docsParkedTo: string|null}>} Recovery branches per side (null when clean).
 ***/
export async function preserveWorkdirPairForRemoval(dir) {
	const parkedTo = await preserveEvictedWorkdir(dir);
	let docsParkedTo = null;
	const docsTwin = docsWorkdirFor(dir);
	if (docsTwin && docsTwin !== dir && fs.existsSync(docsTwin)) {
		docsParkedTo = await preserveEvictedWorkdir(docsTwin);
	}
	return { parkedTo, docsParkedTo };
}

/***
 * MARK: removeTaskWorkdir
 * @description Removes one task workdir and its worktree registration. Finds
 *   the owning repo (the mode repo, the backend checkout, or any mirror
 *   under the work root) via `git worktree list` and removes through it so
 *   no stale admin entries remain; falls back to plain directory removal
 *   for hand-made dirs. Always prunes the owners afterwards. Total: never
 *   throws (returns whether the directory is gone).
 * @example await removeTaskWorkdir({ workRoot: '/w', dir: '/w/kb-t1' }) => true
 * @param {Object} opts
 * @param {string} opts.workRoot - Runner work root (scanned for mirrors).
 * @param {string} [opts.repoDir] - Mode repo dir (mirror or adopted path).
 * @param {string} [opts.localPath] - Backend checkout for worktree removal.
 * @param {string} opts.dir - Task workdir to remove.
 * @returns {Promise<boolean>} Whether the directory is gone.
 ***/
export async function removeTaskWorkdir({ workRoot, repoDir = null, localPath = null, dir } = {}) {
	try {
		if (!dir) return true;
		const owners = [];
		for (const candidate of [repoDir, localPath]) {
			if (candidate && fs.existsSync(path.join(candidate, ".git"))) owners.push(candidate);
		}
		try {
			const mirrors = path.join(workRoot, "mirrors");
			for (const entry of fs.readdirSync(mirrors, { withFileTypes: true })) {
				if (!entry.isDirectory()) continue;
				const full = path.join(mirrors, entry.name);
				if (fs.existsSync(path.join(full, ".git"))) owners.push(full);
			}
		} catch {
			// No mirrors dir — clone mode was never used here.
		}
		for (const owner of owners) {
			let list = "";
			try {
				list = (await runGit(owner, ["worktree", "list", "--porcelain"])).stdout;
			} catch {
				continue;
			}
			if (!list.split("\n").some((line) => line.trim() === `worktree ${dir}`)) continue;
			try {
				await runGit(owner, ["worktree", "remove", "--force", dir]);
			} catch {
				// Fall through to directory removal + prune below.
			}
			try {
				await runGit(owner, ["worktree", "prune"]);
			} catch {
				// Prune is hygiene; the removal is what matters.
			}
			break;
		}
		try {
			if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
		} catch {
			// A racing remover may own it; the exists check below decides.
		}
		// Pair-atomic removal: a docs-repo task's docs worktree
		// (`<dir>-docs`) goes away with its code worktree, never alone.
		const docsTwin = docsWorkdirFor(dir);
		if (docsTwin && docsTwin !== dir) {
			for (const owner of owners) {
				try {
					const list = (await runGit(owner, ["worktree", "list", "--porcelain"])).stdout;
					if (list.split("\n").some((line) => line.trim() === `worktree ${docsTwin}`)) {
						await runGit(owner, ["worktree", "remove", "--force", docsTwin]).catch(() => {});
						// Prune this owner too: the docs mirror usually differs
						// from the code repo, so its admin entries need their
						// own prune to avoid stale registrations.
						await runGit(owner, ["worktree", "prune"]).catch(() => {});
					}
				} catch {
					// Try the next owner.
				}
			}
			try {
				if (fs.existsSync(docsTwin)) fs.rmSync(docsTwin, { recursive: true, force: true });
			} catch {
				// Inert leftover; reaped later.
			}
		}
		return !fs.existsSync(dir);
	} catch {
		try {
			return !fs.existsSync(dir);
		} catch {
			return false;
		}
	}
}

function reportHookBlock({ logger = null, context = "", failure = null } = {}) {
	// Eviction-time preserve failures are swallowed by design (the next
	// candidate is tried instead) — but a structured failure rejecting
	// every candidate used to be invisible. Recovery snapshots bypass
	// repo hooks, so a hook rejection can no longer be the cause here;
	// this stays as the loud line for any other structured preserve
	// failure. One loud line keeps the degrade-to-cap behaviour while
	// naming the cause. Best-effort: logging must never break eviction.
	if (!logger || !failure?.gitFailure) return;
	try {
		const line = `${context}: ${failure.gitFailure.summary} — residue left in place, trying the next candidate.`;
		if (typeof logger.error === "function") logger.error(line);
		else if (typeof logger.log === "function") logger.log(line);
	} catch {
		// Logging must never break eviction.
	}
}

/***
 * MARK: evictOldestWorkdir
 * @description Frees one worktree slot past the cap by removing the
 *   least-recently-used STALE workdir (no touch within `staleMs`). Unpushed
 *   residue is parked on a `kb-recovery/*` branch first — the code worktree
 *   AND its paired docs worktree each (see `preserveWorkdirPairForRemoval`);
 *   workdirs touched recently are never evicted, so a live run on a sibling
 *   Runner is safe. Tries oldest-first and resolves null when nothing is
 *   evictable (all fresh, all removals failed) — the caller then reports
 *   WORKTREE_CAP_REACHED instead of deleting live work.
 * @example await evictOldestWorkdir({ workRoot: '/w' }) => { evicted: '/w/kb-old', parkedTo: null, docsParkedTo: null }
 * @param {Object} opts
 * @param {string} opts.workRoot - Runner work root.
 * @param {string} [opts.currentTaskId] - Never evicts this task's own workdir.
 * @param {number} [opts.staleMs] - Staleness threshold (default WORKTREE_EVICT_STALE_MS).
 * @param {string} [opts.repoDir] - Mode repo dir for worktree removal.
 * @param {string} [opts.localPath] - Backend checkout for worktree removal.
 * @param {Object} [opts.logger] - Logger for swallowed structured
 *   preserve failures (a candidate's failing preserve commit is logged
 *   loudly, then the next candidate is tried — never thrown).
 * @returns {Promise<{evicted: string, parkedTo: string|null, docsParkedTo: string|null}|null>} Eviction record, or null (`docsParkedTo` names the docs twin's recovery branch; null for legacy workdirs).
 ***/
export async function evictOldestWorkdir({ workRoot, currentTaskId = null, staleMs = WORKTREE_EVICT_STALE_MS, repoDir = null, localPath = null, logger = null } = {}) {
	const orphans = listOrphanWorkdirs(workRoot, currentTaskId);
	if (!orphans.length) return null;
	const now = Date.now();
	const aged = orphans
		.filter((dir) => fs.existsSync(dir))
		.map((dir) => ({ dir, mtime: workdirMtimeMs(dir) }))
		.filter((entry) => now - entry.mtime > staleMs)
		.sort((a, b) => a.mtime - b.mtime);
	for (const { dir } of aged) {
		try {
			const { parkedTo, docsParkedTo } = await preserveWorkdirPairForRemoval(dir);
			const gone = await removeTaskWorkdir({ workRoot, repoDir, localPath, dir });
			if (gone) {
				recordWorktreeEviction();
				return { evicted: dir, parkedTo, docsParkedTo };
			}
		} catch (err) {
			reportHookBlock({ logger, context: `Worktree eviction preserve failed for ${dir}`, failure: err });
			// Try the next-oldest candidate instead of failing the deploy.
		}
	}
	return null;
}

/***
 * MARK: reapTaskWorkdirIfTerminal
 * @description Removes a task's workdir once it can never run again: the
 *   backend reports the task `completed`, or the task is gone (404 — a true
 *   orphan). Anything else is kept for reuse or resume. Unpushed residue
 *   is parked on a `kb-recovery/*` branch first, like eviction. Total:
 *   never throws — resolves "reaped", "kept", "absent" (nothing there), or
 *   "skipped" (backend unreadable; an outage must never delete work).
 * @example await reapTaskWorkdirIfTerminal({ client, projectId: 'p', taskId: 't', workRoot: '/w' }) => 'kept'
 * @param {Object} opts
 * @param {Object} opts.client - Runner backend client (`getTask`, `getProject`).
 * @param {string} opts.projectId - Project id.
 * @param {string} opts.taskId - Task id.
 * @param {string} opts.workRoot - Runner work root.
 * @param {string} [opts.localPath] - Backend checkout (adopt-mode owner).
 * @param {Object} [opts.logger] - Logger for swallowed structured
 *   preserve failures (logged loudly, never thrown).
 * @returns {Promise<string>} "reaped"|"kept"|"absent"|"skipped".
 ***/
export async function reapTaskWorkdirIfTerminal({ client, projectId, taskId, workRoot, localPath = null, logger = null } = {}) {
	try {
		const dir = path.join(workRoot, `kb-${taskId}`);
		if (!fs.existsSync(dir)) return "absent";
		let task = null;
		let missing = false;
		try {
			task = await client.getTask(projectId, taskId);
		} catch (err) {
			if (err?.statusCode === 404) missing = true;
			else return "skipped";
		}
		if (!missing && String(task?.status || "").toLowerCase() !== "completed") return "kept";
		let ownerPath = localPath;
		if (!ownerPath) {
			try {
				const project = await client.getProject(projectId);
				ownerPath = project?.cwd || null;
			} catch {
				ownerPath = null;
			}
		}
		try {
			await preserveWorkdirPairForRemoval(dir);
		} catch (err) {
			reportHookBlock({ logger, context: `Workdir reap preserve failed for ${dir}`, failure: err });
			// Preservation is best-effort; removal still reclaims the slot.
		}
		const gone = await removeTaskWorkdir({ workRoot, localPath: ownerPath, dir });
		return gone ? "reaped" : "skipped";
	} catch {
		return "skipped";
	}
}

/***
 * MARK: reapTerminalOrphanWorkdirs
 * @description Fleet-wide sweep: reaps every orphan workdir whose task is
 *   terminal (backend says `completed`) or gone entirely, so finished tasks
 *   release their WORKTREE_CAP slots instead of wedging new claims for the
 *   full staleness window. The per-assignment reap only covers the task the
 *   Runner just ran; tasks finished by another Runner or across a restart
 *   were never reaped, which is what refilled the cap and turned every new
 *   claim into a WORKTREE_CAP_REACHED interrupt loop. Residue is parked on
 *   `kb-recovery/*` first, exactly like eviction. Total: never throws — a
 *   backend outage aborts the sweep and deletes nothing.
 * @example await reapTerminalOrphanWorkdirs({ client, workRoot: '/w' }) => ['/w/kb-t1']
 * @param {Object} opts
 * @param {Object} opts.client - Runner backend client (`listProjects`, `getTask`).
 * @param {string} opts.workRoot - Runner work root.
 * @param {Object} [opts.logger] - Logger for swallowed structured
 *   preserve failures (logged loudly, never thrown).
 * @returns {Promise<string[]>} Reaped workdir paths.
 ***/
export async function reapTerminalOrphanWorkdirs({ client, workRoot, logger = null } = {}) {
	const reaped = [];
	try {
		const orphans = listOrphanWorkdirs(workRoot, null);
		if (!orphans.length) return reaped;
		let projects = [];
		try {
			projects = await client.listProjects();
		} catch {
			return reaped; // backend unreadable: an outage must never delete work
		}
		if (!Array.isArray(projects)) return reaped;
		for (const dir of orphans) {
			try {
				const taskId = path.basename(dir).replace(/^kb-/, "");
				let found = false;
				let terminal = false;
				for (const project of projects) {
					try {
						const task = await client.getTask(project.id, taskId);
						if (task) {
							found = true;
							terminal = String(task?.status || "").toLowerCase() === "completed";
							break;
						}
					} catch (err) {
						if (err?.statusCode === 404) continue; // not in this project
						return reaped; // partial read: stop, an outage deletes nothing
					}
				}
				// Not found in any project = the task is gone: a true orphan.
				if (!found || terminal) {
					try {
						await preserveWorkdirPairForRemoval(dir);
					} catch (err) {
						reportHookBlock({ logger, context: `Workdir sweep preserve failed for ${dir}`, failure: err });
						// Preservation is best-effort; removal still reclaims the slot.
					}
					const gone = await removeTaskWorkdir({ workRoot, dir });
					if (gone) reaped.push(dir);
				}
			} catch {
				// One bad workdir must not abort the sweep.
			}
		}
		return reaped;
	} catch {
		return reaped;
	}
}

/***
 * MARK: refreshWorktreeToRemote
 * @description Re-syncs a reused per-task worktree to the remote branch:
 *   fetches the origin and checks out `branch` at `origin/branch` so
 *   a rerun never executes stale code left behind by a dead run. Nothing
 *   is ever discarded: a dirty tree or commits ahead of the remote are
 *   first parked on `kb-recovery/<task>/<timestamp>` (dirty files committed
 *   there via `commitRecoverySnapshot`, shared with the eviction path),
 *   and the recovery branch name is returned so the daemon can report it.
 *   When the remote branch does not
 *   exist yet (nothing pushed), the local branch is simply checked out
 *   as-is.
 * @example await refreshWorktreeToRemote('/w/kb-t1', 'kb/t1') => { recoveredTo: null }
 * @param {string} workdir - Task worktree directory.
 * @param {string} branch - Task branch (`kb/<taskId>`).
 * @returns {Promise<{recoveredTo: string|null}>} Recovery branch, if any.
 ***/
export async function refreshWorktreeToRemote(workdir, branch) {
	await runGit(workdir, ["fetch", "origin"]);
	let remoteRef = true;
	try {
		await runGit(workdir, ["rev-parse", "--verify", `origin/${branch}`]);
	} catch {
		remoteRef = false;
	}
	if (!remoteRef) {
		await runGit(workdir, ["checkout", "-f", branch]);
		return { recoveredTo: null };
	}
	// Preserve-then-reset: the old `checkout -f -B` silently dropped a dead
	// run's unpushed residue. Park it on a recovery branch first.
	const localTip = await runGit(workdir, ["rev-parse", "--verify", branch])
		.then((r) => r.stdout.trim())
		.catch(() => null);
	const dirty = (await runGit(workdir, ["status", "--porcelain"])).stdout.trim() !== "";
	let ahead = 0;
	if (localTip) {
		try {
			const { stdout } = await runGit(workdir, ["rev-list", "--count", `origin/${branch}..${branch}`]);
			ahead = Number.parseInt(stdout.trim(), 10) || 0;
		} catch {
			ahead = 0;
		}
	}
	let recoveredTo = null;
	if (localTip && (dirty || ahead > 0)) {
		// NOTE: must NOT nest under `kb/<task>` (`kb/t/recovery/...` is an
		// invalid ref while branch `kb/t` exists) — sibling namespace instead.
		const slug = branch.startsWith("kb/")
			? branch.slice("kb/".length)
			: branch.replaceAll("/", "-");
		const stamp = new Date().toISOString().replace(/[:.]/g, "-");
		recoveredTo = `kb-recovery/${slug}/${stamp}`;
		await runGit(workdir, ["branch", recoveredTo, branch]);
		if (dirty) {
			await runGit(workdir, ["checkout", recoveredTo]);
			await runGit(workdir, ["add", "-A"]);
			await commitRecoverySnapshot(workdir, `recovery: unpushed work from reused worktree (${branch})`, {
				recoveryBranch: recoveredTo,
			});
		}
	}
	await runGit(workdir, ["checkout", "-f", "-B", branch, `origin/${branch}`]);
	return { recoveredTo };
}


/***
 * MARK: resolveRunnerDocsDirName
 * @description The effective docs folder name for Runner-side transfer
 *   helpers: a valid custom name wins, anything else degrades to `docs`.
 *   Mirrors the backend's resolveDocsDirName without importing backend code
 *   (the Runner ships without the backend tree).
 * @param {*} value - String, project record, or `{ docsDirName }` object.
 * @returns {string} Safe bare folder name.
 * @example resolveRunnerDocsDirName({ docsDirName: 'notes' }) => 'notes'
 ***/
export function resolveRunnerDocsDirName(value) {
	let raw = value;
	if (raw && typeof raw === "object" && !Array.isArray(raw)) {
		raw = raw.docsDirName ?? raw.docsDir ?? null;
	}
	if (typeof raw !== "string") return "docs";
	const name = raw.trim();
	if (name.length === 0 || name.length > 64) return "docs";
	if (!/^[A-Za-z0-9._-]+$/.test(name)) return "docs";
	const lowered = name.toLowerCase();
	if (lowered === "." || lowered === ".." || lowered === ".kainbain" || lowered === ".git" || lowered === "node_modules") return "docs";
	return name;
}

/***
 * MARK: runnerTaskDocsRelPath
 * @description The task-docs folder relative to a Runner worktree root:
 *   `<docsDir>/tasks/<taskId>`, honouring the project's custom docs folder
 *   name (garbage degrades to `docs`, like `resolveRunnerDocsDirName`).
 *   The single source for the shape the daemon's `KAINBAIN_TASK_DOCS` env,
 *   the `commitAndPush` force-add, and `collectTaskFiles` all share — it
 *   resolves identically inside the code worktree and the paired docs
 *   worktree, so docs-repo projects need no second spelling.
 * @example runnerTaskDocsRelPath({ docsDirName: 'k-docs' }, 't1') => 'k-docs/tasks/t1'
 * @example runnerTaskDocsRelPath(null, 't1') => 'docs/tasks/t1'
 * @param {*} value - String, project record, or `{ docsDirName }` object.
 * @param {string} taskId - Task id.
 * @returns {string} Relative task-docs path.
 ***/
export function runnerTaskDocsRelPath(value, taskId) {
	return `${resolveRunnerDocsDirName(value)}/tasks/${taskId}`;
}

/***
 * MARK: syncTaskDocs
 * @description Copies the task's docs folder (`docs/tasks/<id>`, including
 *   `assets/` such as reference screenshots) from the primary checkout into
 *   the per-task worktree. Prompt inputs (idea files, images) are written to
 *   the live task folder — outside the task branch — so a fresh worktree
 *   would otherwise hide them from the agent (9010e2e0 hit exactly this:
 *   the brief's image was missing). Existing worktree files the agent
 *   created are kept; incoming files overwrite by name. The backend-owned
 *   `task.md` live snapshot is NEVER copied: it is store state, and copying
 *   it into the worktree is what produced the untracked-overwrite merge
 *   failures (a5228675) — the Runner commits it on the task branch while the
 *   backend holds an untracked copy on main.
 * @example await syncTaskDocs({ primaryCwd: '/repo', workdir: '/w/kb-t', taskId: 't1' }) => 3
 * @param {Object} opts - `{ primaryCwd, workdir, taskId, docsDirName, project, stats, primaryHome, destWorkdir }` (`docsDirName`/`project`/`stats` optional; a valid custom docs folder name wins; `stats` is filled with `{ assets }` when provided). `primaryHome` overrides the sync SOURCE root (with a docs repo the primary's docs live in its docs checkout — see `resolveRunnerKainbainHome`); `destWorkdir` overrides the copy DESTINATION (the paired docs worktree for docs-repo projects). Both default to today's behaviour.
 * @returns {Promise<number>} Number of files copied (0 when nothing to copy).
 ***/
export async function syncTaskDocs({ primaryCwd, primaryHome = null, workdir, destWorkdir = null, taskId, docsDirName = null, project = null, stats = null } = {}) {
	const tally = { assets: 0 };
	const finish = (copied) => {
		if (stats && typeof stats === "object") stats.assets = tally.assets;
		return copied;
	};
	const home = primaryHome || primaryCwd;
	if (!home || !workdir || !taskId) return finish(0);
	const resolvedDocsDirName = resolveRunnerDocsDirName(docsDirName ?? project);
	const src = path.join(home, resolvedDocsDirName, "tasks", taskId);
	const dest = path.join(destWorkdir || workdir, resolvedDocsDirName, "tasks", taskId);
	let entries;
	try {
		entries = fs.readdirSync(src, { withFileTypes: true });
	} catch {
		return finish(0);
	}
	if (!entries.length) return finish(0);
	fs.mkdirSync(dest, { recursive: true });
	let copied = 0;
	for (const entry of entries) {
		// task.md is backend-owned store state, never worktree content.
		if (entry.name === "task.md") continue;
		const from = path.join(src, entry.name);
		const to = path.join(dest, entry.name);
		try {
			const stat = fs.statSync(from);
			if (stat.isDirectory()) {
				fs.cpSync(from, to, { recursive: true });
				const walked = walkFiles(to);
				for (const f of walked) copied += 1;
				if (entry.name === "assets") tally.assets += walked.length;
			} else if (stat.isFile()) {
				fs.copyFileSync(from, to);
				copied += 1;
			}
		} catch {
			// Best-effort: one unreadable asset must not block the stage.
		}
	}
	return finish(copied);
}

/***
 * MARK: RUNNER_TASK_ASSET_MAX_BYTES
 * @description Largest single claim-shipped image the Runner writes into a
 *   worktree (10 MiB, mirroring the backend's `taskImageMaxBytes` upload
 *   cap): a corrupt or hostile payload entry past this size is skipped, so
 *   one bad entry can neither fill the disk nor wedge the stage.
 * @example RUNNER_TASK_ASSET_MAX_BYTES => 10485760
 ***/
export const RUNNER_TASK_ASSET_MAX_BYTES = 10 * 1024 * 1024;

/***
 * MARK: writeClaimTaskAssets
 * @description Writes claim-shipped task images (the backend's `taskAssets`
 *   payload entries, `{ name, contentBase64 }`) into the worktree's
 *   `docs/tasks/<id>/assets/` folder. This is the remote-Runner delivery
 *   arm: `syncTaskDocs` returns 0 with no local primary checkout, so the
 *   claim bytes are the only way the screenshots reach the worktree before
 *   the first stage runs. Defense in depth on top of the backend's
 *   sanitized shipment: flat allowlisted image names only (traversal and
 *   non-image entries are skipped), strict-base64 decodes, size-capped
 *   writes, and existing worktree files are never overwritten (a local
 *   sync or the agent wins). Never throws: every entry is best-effort.
 * @example await writeClaimTaskAssets({ workdir: '/w/kb-t', taskId: 't1', assets: [{ name: 'a.png', contentBase64: '...' }] }) => 1
 * @param {Object} opts - `{ workdir, taskId, assets, docsDirName, project, destWorkdir }` (`docsDirName`/`project` optional; a valid custom docs folder name wins; `destWorkdir` overrides the target worktree — the paired docs worktree for docs-repo projects).
 * @returns {Promise<number>} Number of files written.
 ***/
export async function writeClaimTaskAssets({ workdir, taskId, assets, docsDirName = null, project = null, destWorkdir = null } = {}) {
	if (!workdir || !taskId || !Array.isArray(assets) || assets.length === 0) return 0;
	const resolvedDocsDirName = resolveRunnerDocsDirName(docsDirName ?? project);
	const dir = path.join(destWorkdir || workdir, resolvedDocsDirName, "tasks", taskId, "assets");
	let written = 0;
	for (const entry of assets) {
		const name = typeof entry?.name === "string" ? entry.name : "";
		const encoded = typeof entry?.contentBase64 === "string" ? entry.contentBase64 : "";
		// Exactly what the backend would have stored: an already-sanitized
		// flat image name. Anything else (traversal, subdirs, non-images,
		// drifted case) is skipped rather than coerced.
		if (!name || sanitizeImageName(name) !== name || !isAllowedImageExt(name)) continue;
		if (!encoded) continue;
		// `Buffer.from` never throws on bad input — it silently drops
		// non-alphabet bytes, so without this guard a corrupt entry would
		// decode to garbage that then suppresses the MISSING-ASSET warning.
		if (!/^[A-Za-z0-9+/=\s]+$/.test(encoded)) continue;
		let buffer;
		try {
			buffer = Buffer.from(encoded, "base64");
		} catch {
			continue;
		}
		if (buffer.length === 0 || buffer.length > RUNNER_TASK_ASSET_MAX_BYTES) continue;
		try {
			const dest = path.join(dir, name);
			if (fs.existsSync(dest)) continue;
			fs.mkdirSync(dir, { recursive: true });
			fs.writeFileSync(dest, buffer);
			written += 1;
		} catch {
			// Best-effort: one unwritable asset must not block the stage.
		}
	}
	return written;
}

function walkFiles(dir) {
	const out = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walkFiles(full));
		else if (entry.isFile()) out.push(full);
	}
	return out;
}

/***
 * MARK: ensureRepoHooksPath
 * @description Best-effort activation of the repo's committed git hooks
 *   (`core.hooksPath=scripts/githooks` — the pre-commit binary guard that
 *   fails fast on a text-path-rewritten PNG) in a repo dir: the Runner
 *   mirror in clone mode or the adopted checkout. Linked worktrees share
 *   the repo's common config, so one set covers every kb-* worktree; a
 *   worktree whose branch predates scripts/githooks simply finds no hook
 *   file and runs none. A foreign hooksPath (another hook manager) is left
 *   untouched. Never throws: hook installation must not block task
 *   preparation — the `npm test` "Binary Guard" branch is the enforcement
 *   backstop.
 * @example await ensureRepoHooksPath('/w/mirrors/repo') => true
 * @param {string} repoDir - Repository to configure.
 * @returns {Promise<boolean>} True when the hooks path was newly set.
 ***/
export async function ensureRepoHooksPath(repoDir) {
	try {
		const current = await runGit(repoDir, ["config", "--get", "core.hooksPath"])
			.then((result) => result.stdout.trim())
			.catch(() => "");
		if (current) return false; // already ours, or foreign — either way, do not touch
		await runGit(repoDir, ["config", "core.hooksPath", "scripts/githooks"]);
		return true;
	} catch {
		return false;
	}
}

/***
 * MARK: prepareWorkdir
 * @description Project load per the transport matrix (MigrationPlan §4):
 *   remote-backed clones the origin into the Runner mirror dir and pulls,
 *   grandfathered local-only adopts the repo path (no clone-from-origin,
 *   `no-remote`). Both modes then open a per-task worktree `kb-<taskId>`
 *   on branch `kb/<taskId>` (reused when a previous run left it behind;
 *   a reused clone-mode worktree is fetched and force-reset to
 *   `origin/kb/<taskId>` first so reruns never execute stale leftovers).
 *   Past WORKTREE_CAP foreign workdirs the least-recently-used STALE
 *   workdir is evicted first (unpushed residue parked on `kb-recovery/*`,
 *   never deleted); only when nothing stale is evictable does it refuse
 *   with WORKTREE_CAP_REACHED so the refusal reports instead of crashing.
 * @example await prepareWorkdir({ repoUrl: 'https://...', workRoot: '/w', taskId: 't1' }) => { workdir: '/w/kb-t1', ... }
 * @returns {Promise<Object>} `{ workdir, branch, mode, reused, recoveredTo, baseSha, evicted, docsWorkdir, docsRecoveredTo, docsBaseSha }`: `recoveredTo` names the recovery branch when a reused worktree's unpushed residue was parked, `baseSha` is the `origin/<branch>` tip the worktree is based on (null when unpushed), `evicted` names the LRU workdir removed to free the slot (null when none). With a docs repo the `docs*` fields carry the paired docs worktree (`<workdir>-docs`, same `kb/<taskId>` branch in its own mirror/adopted checkout); they are all null for legacy projects.
 * @param {Object} opts - Options.
 * @param {string} [opts.repoUrl] - Origin to clone (remote-backed mode).
 * @param {string} [opts.localPath] - Repo path to adopt (local-only mode).
 * @param {string} [opts.docsRepoUrl] - Docs-repo origin to clone (paired docs worktree; synced `kb/<taskId>` branch).
 * @param {string} [opts.docsLocalPath] - Docs-repo path to adopt (adopt mode).
 * @param {string} opts.workRoot - Runner work root.
 * @param {string} opts.taskId - Task id.
 * @param {number} [opts.evictStaleMs] - Staleness threshold for LRU eviction (default WORKTREE_EVICT_STALE_MS).
 * @param {Object} [opts.logger] - Logger for swallowed eviction-time
 *   structured preserve failures (logged loudly, never thrown).
 * @returns {Promise<Object>} `{ workdir, branch, mode, reused }`.
 ***/
export async function prepareWorkdir({ repoUrl, localPath, workRoot, taskId, evictStaleMs = WORKTREE_EVICT_STALE_MS, docsRepoUrl = null, docsLocalPath = null, logger = null }) {
	if (!repoUrl && !localPath) {
		throw new Error("prepareWorkdir needs repoUrl (clone) or localPath (adopt).");
	}
	// Stealth guard (defense in depth — the backend 400s this at write time):
	// the docs repo URL must differ from the main repo URL, otherwise the
	// paired docs worktree would push `kb/<taskId>` docs branches to the
	// shared MAIN remote. Compared loosely (.git suffix / trailing slash
	// ignored) so spelling variants cannot sneak through.
	if (docsRepoUrl && repoUrl) {
		const normalize = (u) => String(u).trim().replace(/\.git$/i, "").replace(/\/+$/, "");
		if (normalize(docsRepoUrl) === normalize(repoUrl)) {
			throw new Error(
				`docsRepoUrl must differ from the main repoUrl ('${repoUrl}') — the same remote would receive KainBain docs branches`,
			);
		}
	}
	fs.mkdirSync(workRoot, { recursive: true });
	const branch = `kb/${taskId}`;
	const workdir = path.join(workRoot, `kb-${taskId}`);
	const orphans = listOrphanWorkdirs(workRoot, taskId);
	let evicted = null;
	if (orphans.length >= WORKTREE_CAP && !fs.existsSync(workdir)) {
		const outcome = await evictOldestWorkdir({
			workRoot,
			currentTaskId: taskId,
			staleMs: evictStaleMs,
			localPath: localPath || null,
			logger,
		});
		if (!outcome) {
			const err = new Error(
				`Worktree cap reached (~${WORKTREE_CAP}); refusing to add kb-${taskId} (every orphan was used recently, nothing stale to evict). Orphans: ${orphans.join(", ")}`,
			);
			err.code = "WORKTREE_CAP_REACHED";
			throw err;
		}
		evicted = outcome;
	}

	let repoDir;
	let mode;
	if (repoUrl) {
		mode = "clone";
		repoDir = path.join(workRoot, "mirrors", slugForRepo(repoUrl));
		if (!fs.existsSync(path.join(repoDir, ".git"))) {
			fs.mkdirSync(path.dirname(repoDir), { recursive: true });
			await runGit(workRoot, ["clone", repoUrl, repoDir]);
		} else {
			await refreshMirror(repoDir);
		}
	} else {
		mode = "adopt";
		repoDir = localPath;
	}

	// Activate the committed pre-commit binary guard for this repo and every
	// linked kb-* worktree (worktrees share the common config). Best-effort:
	// a failure here must never block task preparation.
	await ensureRepoHooksPath(repoDir);

	// Separate docs repo: the paired docs worktree mirrors the code worktree
	// one-for-one — own mirror (clone mode) or adopted docs checkout, same
	// `kb/<taskId>` branch — so task docs live in the docs repo on a synced
	// task branch. The pair counts as ONE worktree slot (listOrphanWorkdirs
	// hides the `-docs` twin) and is evicted/reaped atomically.
	const hasDocsRepo = Boolean(docsRepoUrl || docsLocalPath);
	const docsWorkdir = hasDocsRepo ? docsWorkdirFor(workdir) : null;
	let docsRepoDir = null;
	let docsMode = null;
	if (hasDocsRepo) {
		if (docsRepoUrl) {
			docsMode = "clone";
			let docsSlug = slugForRepo(docsRepoUrl);
			if (repoUrl && docsSlug === slugForRepo(repoUrl)) docsSlug = `${docsSlug}-docs`;
			docsRepoDir = path.join(workRoot, "mirrors", docsSlug);
			if (!fs.existsSync(path.join(docsRepoDir, ".git"))) {
				fs.mkdirSync(path.dirname(docsRepoDir), { recursive: true });
				await runGit(workRoot, ["clone", docsRepoUrl, docsRepoDir]);
			} else {
				await refreshMirror(docsRepoDir);
			}
		} else {
			docsMode = "adopt";
			docsRepoDir = docsLocalPath;
			// Fail loudly (not via a cryptic `git worktree add` error below)
			// when the adopted docs checkout is missing or not a repo — the
			// classic cause is a localPath-only docs repo dispatched to a
			// remote Runner, where the backend's path does not exist.
			if (!fs.existsSync(path.join(docsRepoDir, ".git"))) {
				throw new Error(
					`docsLocalPath '${docsRepoDir}' is not a git checkout on this Runner (no .git) — a docs repo without a URL can only run where its checkout exists; give the project a docsRepo.url so remote Runners can clone it`,
				);
			}
		}
		await ensureRepoHooksPath(docsRepoDir);
	}
	const ensureDocsWorktree = async () => {
		if (!docsWorkdir) return { docsRecoveredTo: null, docsBaseSha: null };
		if (fs.existsSync(docsWorkdir)) {
			let docsRecoveredTo = null;
			if (docsMode === "clone") {
				({ recoveredTo: docsRecoveredTo } = await refreshWorktreeToRemote(docsWorkdir, branch));
			}
			const docsBaseSha = await runGit(docsWorkdir, ["rev-parse", "--verify", `origin/${branch}`])
				.then((r) => r.stdout.trim())
				.catch(() => null);
			touchWorkdir(docsWorkdir);
			return { docsRecoveredTo, docsBaseSha };
		}
		try {
			await runGit(docsRepoDir, ["worktree", "add", docsWorkdir, "-b", branch]);
		} catch (err) {
			const msg = String(err?.stderr || err?.message || "");
			if (msg.includes("already exists") || msg.includes("already used")) {
				await runGit(docsRepoDir, ["worktree", "add", docsWorkdir, branch]);
			} else {
				throw err;
			}
		}
		const docsBaseSha = await runGit(docsWorkdir, ["rev-parse", "--verify", `origin/${branch}`])
			.then((r) => r.stdout.trim())
			.catch(() => null);
		touchWorkdir(docsWorkdir);
		return { docsRecoveredTo: null, docsBaseSha };
	};

	if (fs.existsSync(workdir)) {
		let recoveredTo = null;
		if (mode === "clone") {
			({ recoveredTo } = await refreshWorktreeToRemote(workdir, branch));
		}
		const baseSha = await runGit(workdir, ["rev-parse", "--verify", `origin/${branch}`])
			.then((r) => r.stdout.trim())
			.catch(() => null);
		const docs = await ensureDocsWorktree();
		touchWorkdir(workdir);
		return { workdir, branch, mode, reused: true, orphans, recoveredTo, baseSha, evicted, docsWorkdir, docsRepoDir, ...docs };
	}
	try {
		await runGit(repoDir, ["worktree", "add", workdir, "-b", branch]);
	} catch (err) {
		const msg = String(err?.stderr || err?.message || "");
		if (msg.includes("already exists") || msg.includes("already used")) {
			await runGit(repoDir, ["worktree", "add", workdir, branch]);
		} else {
			throw err;
		}
	}
	const baseSha = await runGit(workdir, ["rev-parse", "--verify", `origin/${branch}`])
		.then((r) => r.stdout.trim())
		.catch(() => null);
	const docs = await ensureDocsWorktree();
	touchWorkdir(workdir);
	return { workdir, branch, mode, reused: false, orphans, recoveredTo: null, baseSha, evicted, docsWorkdir, docsRepoDir, ...docs };
}

/***
 * MARK: prepareIntegrationWorkdir
 * @description Prepares an ephemeral worktree for one leased `integrate`
 *   job (Step 4): clones/refreshes the mirror, fetches, and verifies the
 *   remote refs still equal the backend's expected SHAs — a moved ref is a
 *   `stale-head` RunnerGitError (never a merge of stale state). The merge
 *   runs in a fresh `--detach`ed worktree at `expectedTargetSha`, never in
 *   a long-lived checkout, so nothing human or engine-owned can dirty it.
 *   The caller owns cleanup (`git worktree remove --force` + rm).
 * @example await prepareIntegrationWorkdir({ repoUrl: 'https://...', workRoot: '/w', taskBranch: 'kb/t', expectedTaskSha: 'a', targetBranch: 'main', expectedTargetSha: 'b' }) => { workdir: '/w/kb-integrate-x', mirrorDir: '/w/mirrors/repo' }
 * @param {Object} opts - Options.
 * @returns {Promise<Object>} `{ workdir, mirrorDir }`.
 ***/
export async function prepareIntegrationWorkdir({ repoUrl, workRoot, taskBranch, expectedTaskSha, targetBranch, expectedTargetSha }) {
	if (!repoUrl) {
		throw new RunnerGitError("git-failed", "prepareIntegrationWorkdir needs repoUrl: merges run against the origin, never a local-only path");
	}
	for (const [name, value] of [["taskBranch", taskBranch], ["expectedTaskSha", expectedTaskSha], ["targetBranch", targetBranch], ["expectedTargetSha", expectedTargetSha]]) {
		if (!value || typeof value !== "string") {
			throw new RunnerGitError("git-failed", `prepareIntegrationWorkdir needs ${name}`);
		}
	}
	fs.mkdirSync(workRoot, { recursive: true });
	const mirrorDir = path.join(workRoot, "mirrors", slugForRepo(repoUrl));
	if (!fs.existsSync(path.join(mirrorDir, ".git"))) {
		fs.mkdirSync(path.dirname(mirrorDir), { recursive: true });
		await runGit(workRoot, ["clone", repoUrl, mirrorDir]);
	} else {
		await refreshMirror(mirrorDir);
	}
	await runGit(mirrorDir, ["fetch", "origin"]);
	const readRef = async (ref) => {
		try {
			return (await runGit(mirrorDir, ["rev-parse", "--verify", ref])).stdout.trim() || null;
		} catch {
			return null;
		}
	};
	const actualTarget = await readRef(`origin/${targetBranch}`);
	if (actualTarget !== expectedTargetSha) {
		throw new RunnerGitError("stale-head", `target moved during integration lease: expected ${targetBranch} at ${expectedTargetSha}, origin has ${actualTarget || "nothing"} — re-queue with fresh SHAs`, { cwd: mirrorDir });
	}
	const actualTask = await readRef(`origin/${taskBranch}`);
	if (actualTask !== expectedTaskSha) {
		throw new RunnerGitError("stale-head", `task branch moved during integration lease: expected ${taskBranch} at ${expectedTaskSha}, origin has ${actualTask || "nothing"} — re-queue with fresh SHAs`, { cwd: mirrorDir });
	}
	const workdir = fs.mkdtempSync(path.join(workRoot, "kb-integrate-"));
	await runGit(mirrorDir, ["worktree", "add", "--detach", workdir, expectedTargetSha]);
	return { workdir, mirrorDir };
}

/***
 * MARK: removeIntegrationWorkdir
 * @description Best-effort cleanup for an ephemeral integration worktree:
 *   removes the worktree registration from the mirror, then the directory.
 *   Never throws — leftover worktrees are inert detached checkouts.
 * @example await removeIntegrationWorkdir('/w/mirrors/repo', '/w/kb-integrate-x')
 ***/
export async function removeIntegrationWorkdir(mirrorDir, workdir) {
	try {
		if (mirrorDir && workdir) await runGit(mirrorDir, ["worktree", "remove", "--force", workdir]);
	} catch {
		// Fall through to directory removal.
	}
	try {
		if (workdir) fs.rmSync(workdir, { recursive: true, force: true });
	} catch {
		// Inert leftovers are reaped by the operator, never fatal.
	}
}
