import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Runner-side git defaults: never prompt for credentials (a hanging prompt
// wedged stages before the timeout existed), 60s per command.
export const RUNNER_GIT_TIMEOUT_MS = 60000;
export const RUNNER_GIT_LOCK_STALE_MS = 30000;

/***
 * MARK: RunnerGitError
 * @description Structured Runner-side git failure. `code` is one of
 *   `git-timeout` (command exceeded its budget), `git-lock` (index.lock
 *   held by a live process or a fresh lock we must not steal), or
 *   `git-failed` (anything git itself rejected, with git's message).
 *   Carries the argv and captured streams like the backend GitError, so
 *   the daemon can branch on `code` instead of parsing strings.
 * @example new RunnerGitError('git-lock', 'git status', { cwd: '/w' })
 ***/
export class RunnerGitError extends Error {
	constructor(code, message, { args = [], stdout = "", stderr = "", cwd = "" } = {}) {
		super(message);
		this.name = "RunnerGitError";
		this.code = code;
		this.args = args;
		this.stdout = stdout;
		this.stderr = stderr;
		this.cwd = cwd;
	}
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

function toRunnerGitError(args, cwd, err, stdout = "", stderr = "") {
	const killed = err?.killed || err?.signal === "SIGTERM";
	if (killed || /timed out|ETIMEDOUT/i.test(String(err?.message || "") + String(err?.code || ""))) {
		return new RunnerGitError("git-timeout", `git ${args.join(" ")} timed out in '${cwd}'`, { args, stdout, stderr, cwd });
	}
	if (/Unable to create '.*index\.lock'|index\.lock.*exists|Another git process/i.test(`${err?.message || ""}\n${stderr}\n${stdout}`)) {
		return new RunnerGitError("git-lock", `git ${args.join(" ")} hit index.lock contention in '${cwd}': ${(stderr || err?.message || "").trim()}`, { args, stdout, stderr, cwd });
	}
	return new RunnerGitError("git-failed", `git ${args.join(" ")} failed in '${cwd}': ${(stderr || err?.message || "").trim() || "no output"}`, { args, stdout, stderr, cwd });
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

function slugForRepo(repoUrl) {
	const base = String(repoUrl).split("/").filter(Boolean).pop() || "repo";
	return base.replace(/\.git$/, "").replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 64) || "repo";
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
	return entries
		.filter((e) => e.isDirectory() && e.name.startsWith("kb-") && e.name !== keep)
		.map((e) => path.join(workRoot, e.name));
}

/***
 * MARK: refreshWorktreeToRemote
 * @description Re-syncs a reused per-task worktree to the remote branch:
 *   fetches the origin and checks out `branch` at `origin/branch` so
 *   a rerun never executes stale code left behind by a dead run. Nothing
 *   is ever discarded: a dirty tree or commits ahead of the remote are
 *   first parked on `kb-recovery/<task>/<timestamp>` (dirty files committed
 *   there with a repo-local identity), and the recovery branch name is
 *   returned so the daemon can report it. When the remote branch does not
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
			await runGit(workdir, [
				"-c", "user.name=KainBain Runner",
				"-c", "user.email=kainbain-runner@local",
				"commit", "-m", `recovery: unpushed work from reused worktree (${branch})`,
			]);
		}
	}
	await runGit(workdir, ["checkout", "-f", "-B", branch, `origin/${branch}`]);
	return { recoveredTo };
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
 * @param {Object} opts - `{ primaryCwd, workdir, taskId }`.
 * @returns {Promise<number>} Number of files copied (0 when nothing to copy).
 ***/
export async function syncTaskDocs({ primaryCwd, workdir, taskId } = {}) {
	if (!primaryCwd || !workdir || !taskId) return 0;
	const src = path.join(primaryCwd, "docs", "tasks", taskId);
	const dest = path.join(workdir, "docs", "tasks", taskId);
	let entries;
	try {
		entries = fs.readdirSync(src, { withFileTypes: true });
	} catch {
		return 0;
	}
	if (!entries.length) return 0;
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
				for (const f of walkFiles(to)) copied += 1;
			} else if (stat.isFile()) {
				fs.copyFileSync(from, to);
				copied += 1;
			}
		} catch {
			// Best-effort: one unreadable asset must not block the stage.
		}
	}
	return copied;
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
 * MARK: prepareWorkdir
 * @description Project load per the transport matrix (MigrationPlan §4):
 *   remote-backed clones the origin into the Runner mirror dir and pulls,
 *   grandfathered local-only adopts the repo path (no clone-from-origin,
 *   `no-remote`). Both modes then open a per-task worktree `kb-<taskId>`
 *   on branch `kb/<taskId>` (reused when a previous run left it behind;
 *   a reused clone-mode worktree is fetched and force-reset to
 *   `origin/kb/<taskId>` first so reruns never execute stale leftovers).
 *   Refuses when ~5 foreign worktrees already exist (D14 cap) and names
 *   the orphans instead of deleting them.
 * @example await prepareWorkdir({ repoUrl: 'https://...', workRoot: '/w', taskId: 't1' }) => { workdir: '/w/kb-t1', ... }
 * @returns {Promise<Object>} `{ workdir, branch, mode, reused, recoveredTo, baseSha }`: `recoveredTo` names the recovery branch when a reused worktree's unpushed residue was parked, `baseSha` is the `origin/<branch>` tip the worktree is based on (null when unpushed).
 * @param {Object} opts - Options.
 * @param {string} [opts.repoUrl] - Origin to clone (remote-backed mode).
 * @param {string} [opts.localPath] - Repo path to adopt (local-only mode).
 * @param {string} opts.workRoot - Runner work root.
 * @param {string} opts.taskId - Task id.
 * @returns {Promise<Object>} `{ workdir, branch, mode, reused }`.
 ***/
export async function prepareWorkdir({ repoUrl, localPath, workRoot, taskId }) {
	if (!repoUrl && !localPath) {
		throw new Error("prepareWorkdir needs repoUrl (clone) or localPath (adopt).");
	}
	fs.mkdirSync(workRoot, { recursive: true });
	const branch = `kb/${taskId}`;
	const workdir = path.join(workRoot, `kb-${taskId}`);
	const orphans = listOrphanWorkdirs(workRoot, taskId);
	if (orphans.length >= 5 && !fs.existsSync(workdir)) {
		const err = new Error(
			`Worktree cap reached (~5); refusing to add kb-${taskId}. Orphans: ${orphans.join(", ")}`,
		);
		err.code = "WORKTREE_CAP_REACHED";
		throw err;
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

	if (fs.existsSync(workdir)) {
		let recoveredTo = null;
		if (mode === "clone") {
			({ recoveredTo } = await refreshWorktreeToRemote(workdir, branch));
		}
		const baseSha = await runGit(workdir, ["rev-parse", "--verify", `origin/${branch}`])
			.then((r) => r.stdout.trim())
			.catch(() => null);
		return { workdir, branch, mode, reused: true, orphans, recoveredTo, baseSha };
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
	return { workdir, branch, mode, reused: false, orphans, recoveredTo: null, baseSha };
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
