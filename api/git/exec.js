import { spawn } from "node:child_process";
import { withRepoGitLock } from "../work/gitLock.js";
import { isGitLockError } from "../work/taskErrors.js";
import { maybeRecoverStaleLock, _withLockCheckSuffix } from "./staleLock.js";
import { GitError } from "./errors.js";
const MAX_CAPTURE_BYTES = 1024 * 1024; // 1 MB per stream, defensive cap.

/***
 * MARK: git
 * @description Runs a git command in the given working directory using an argv
 *   array (never a shell string). Resolves { stdout, stderr, code } on exit 0
 *   and rejects with a GitError otherwise. Streams are capped defensively and
 *   the child receives an explicit timeout so a wedged git process cannot hang
 *   a stage forever.
 * @example const { stdout } = await git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
 * @param {string} projectCwd - Working directory for the command.
 * @param {string[]} args - Argument array (e.g. ["status", "--porcelain"]).
 * @param {Object} [opts]
 * @param {number} [opts.timeout=60000] - Hard timeout in milliseconds.
 * @param {Function} [opts.listLiveGitProcesses] - Holder-scan override for the
 *   stale-lock check (tests only: the holder scan is machine-global, so an
 *   integration test asserting recovery must stub "no live holder" to stay
 *   deterministic under parallel workers spawning their own git processes).
 *   Production callers omit it and always get the real machine-wide scan.
 * @param {Object} [opts.env] - Extra environment for the child (merged over
 *   process.env), e.g. `{ GIT_INDEX_FILE: tmp }` for scratch-index plumbing.
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 ***/
export function git(
	projectCwd,
	args,
	{ timeout = 60000, listLiveGitProcesses, env } = {},
) {
	if (typeof projectCwd !== "string" || !projectCwd.trim()) {
		return Promise.reject(new GitError("git requires a working directory"));
	}
	if (!Array.isArray(args) || args.length === 0) {
		return Promise.reject(
			new GitError("git requires a non-empty argument array"),
		);
	}
	if (args.some((a) => typeof a !== "string")) {
		return Promise.reject(
			new GitError("git arguments must all be strings (no shell interpolation)"),
		);
	}
	// Single serialization gate: every engine git process — reads and
	// writes — runs under the per-repository mutex, so concurrent branch
	// operations (task creation, approvals, running stages) can never
	// overlap in time and collide on `.git/index.lock`. Reads are included
	// deliberately: `status` refreshes the index on dirty trees, the cost
	// is one fast local op, and the engine runs one task at a time anyway.
	return withRepoGitLock(projectCwd, async () => {
		try {
			return await _spawnGit(projectCwd, args, { timeout, env });
		} catch (err) {
			if (!isGitLockError(err)) throw err;
			const recoveryOpts = {};
			if (listLiveGitProcesses) {
				recoveryOpts.listLiveGitProcesses = listLiveGitProcesses;
			}
			const recovery = await maybeRecoverStaleLock(projectCwd, recoveryOpts).catch(() => ({
				recovered: false,
				reason: "assess-failed",
			}));
			if (!recovery.recovered) {
				throw _withLockCheckSuffix(err, recovery);
			}
			try {
				return await _spawnGit(projectCwd, args, { timeout, env });
			} catch (retryErr) {
				// The retry ran on a cleared lock and still failed: keep the
				// recovery evidence on the error so failure routing and logs
				// show the lock was cleared, not the cause.
				if (retryErr && typeof retryErr === "object") {
					retryErr.gitLockRecovery = {
						lockPath: recovery.lockPath,
						ageMs: recovery.ageMs,
					};
				}
				throw retryErr;
			}
		}
	});
}

/***
 * MARK: _spawnGit
 * @description Low-level git child-process runner behind `git()`: spawns
 *   `git` with an argv array, caps captured output at MAX_CAPTURE_BYTES per
 *   stream, enforces a hard timeout (SIGKILL on expiry), and resolves or
 *   rejects with a typed GitError. Never called directly by engine code —
 *   always go through `git()` so the per-repo lock gate applies.
 * @private
 * @param {string} projectCwd - Working directory for the command.
 * @param {string[]} args - Argument array for the git binary.
 * @param {Object} [opts]
 * @param {number} [opts.timeout=60000] - Hard timeout in milliseconds.
 * @param {Object} [opts.env] - Extra environment merged over process.env.
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 ***/
function _spawnGit(projectCwd, args, { timeout = 60000, env } = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn("git", args, {
			cwd: projectCwd,
			env: env ? { ...process.env, ...env } : process.env,
		});
		let stdout = "";
		let stderr = "";
		let settled = false;
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			try {
				child.kill("SIGKILL");
			} catch {
				// already gone
			}
			// Kill-path hygiene: a SIGKILLed git can orphan `.git/index.lock`,
			// but ownership is unknowable here, so no eager deletion. The next
			// gated op re-assesses the lock via maybeRecoverStaleLock (age +
			// live-holder check) and recovers only provably stale locks.
			reject(
				new GitError(`git ${args.join(" ")} timed out after ${timeout}ms`, {
					args,
					stdout,
					stderr,
				}),
			);
		}, timeout);
		if (timer.unref) timer.unref();

		child.stdout?.on("data", (d) => {
			if (stdout.length < MAX_CAPTURE_BYTES) stdout += d.toString();
		});
		child.stderr?.on("data", (d) => {
			if (stderr.length < MAX_CAPTURE_BYTES) stderr += d.toString();
		});
		child.on("error", (err) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			reject(
				new GitError(`Failed to start git: ${err.message} (is git installed?)`, {
					args,
					stderr: err.message,
				}),
			);
		});
		child.on("close", (code, signal) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			// Trim trailing whitespace/newlines only: stripping LEADING whitespace
			// would corrupt `git status --porcelain` v1 output, where the first
			// entry's status column (e.g. ' M') is significant.
			if (code === 0) {
				resolve({
					stdout: stdout.replace(/\s+$/, ""),
					stderr: stderr.replace(/\s+$/, ""),
					code,
				});
			} else {
				reject(
					new GitError(
						`git ${args.join(" ")} failed (exit ${code ?? signal ?? "unknown"}): ${stderr.trim() || stdout.trim() || "no output"}`,
						{ code, args, stdout, stderr },
					),
				);
			}
		});
	});
}


