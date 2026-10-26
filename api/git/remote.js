import { git } from "./exec.js";
import { _assertValidBranchName } from "./validation.js";


/***
 * MARK: hasRemote
 * @description Whether the repository has a remote with the given name
 *   (default 'origin'). Exit-code driven and never throws for a missing
 *   remote: a pure-local repository simply reports false so callers can skip
 *   push entirely.
 * @example await hasRemote('/repo') => true
 * @example await hasRemote('/local-only-repo') => false
 * @param {string} projectCwd - Working directory for the command.
 * @param {string} [name='origin'] - Remote name to look up.
 * @returns {Promise<boolean>}
 ***/
export async function hasRemote(projectCwd, name = "origin") {
	const remote =
		typeof name === "string" && name.trim() ? name.trim() : "origin";
	if (/^-/.test(remote) || /[\s\\'"`$]/.test(remote) || remote.length > 255) {
		return false;
	}
	try {
		await git(projectCwd, ["remote", "get-url", remote]);
		return true;
	} catch {
		return false;
	}
}


/***
 * MARK: pushBranchIfRemote
 * @description Pushes the given branch to the remote, but only when a remote
 *   exists. Pure-local repositories resolve { pushed: false, skipped:
 *   'no-remote' } with zero push spawned. The first push uses `git push -u`
 *   so the branch tracks the remote; later pushes are plain. Push failures
 *   (auth, network, unreachable remote) reject with a GitError so the caller
 *   can log a warning and continue — a failed push must never fail a stage
 *   whose work already passed.
 * @example await pushBranchIfRemote('/repo', 'kb/task-1') => { pushed: true, skipped: null }
 * @param {string} projectCwd - Working directory for the command.
 * @param {string} branch - Branch to push.
 * @param {Object} [opts]
 * @param {string} [opts.remote='origin'] - Remote name to push to.
 * @param {boolean} [opts.setUpstream] - Force or skip `-u`; defaults to auto-detect (first push sets upstream).
 * @param {number} [opts.timeout=120000] - Push command timeout in ms.
 * @returns {Promise<{pushed: boolean, skipped: string|null}>}
 ***/
export async function pushBranchIfRemote(projectCwd, branch, opts = {}) {
	_assertValidBranchName(branch, "push");
	const remote =
		typeof opts.remote === "string" && opts.remote.trim()
			? opts.remote.trim()
			: "origin";
	if (!(await hasRemote(projectCwd, remote))) {
		return { pushed: false, skipped: "no-remote" };
	}
	let setUpstream = opts.setUpstream;
	if (typeof setUpstream !== "boolean") {
		try {
			await git(projectCwd, [
				"rev-parse",
				"--abbrev-ref",
				"--symbolic-full-name",
				`${branch}@{upstream}`,
			]);
			setUpstream = false;
		} catch {
			setUpstream = true;
		}
	}
	const args = setUpstream
		? ["push", "-u", remote, branch]
		: ["push", remote, branch];
	await git(projectCwd, args, { timeout: opts.timeout || 120000 });
	return { pushed: true, skipped: null };
}


