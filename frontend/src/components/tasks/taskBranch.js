/***
 * MARK: getTaskBranchName
 * @description Returns a task's per-task branch name. Uses the persisted
 *   task.branch when present, otherwise derives 'kb/<taskId>' — mirroring
 *   the server-side resolveTaskBranch helper in api/work/taskBranches.js.
 * @example getTaskBranchName({ id: 'abc', branch: 'kb/abc' }) => 'kb/abc'
 * @param {Object} task - The task object (id and optional persisted branch).
 * @returns {string|null} The branch name, or null when no branch can be resolved.
 ***/
export function getTaskBranchName(task) {
  if (task?.branch && typeof task.branch === 'string') return task.branch;
  if (!task?.id) return null;
  return `kb/${task.id}`;
}

/***
 * MARK: buildCheckoutCommand
 * @description Builds a ready-to-paste git command that fetches and checks out
 *   a task branch. The fetch makes the paste work on machines or clones that
 *   do not have the ref yet.
 * @example buildCheckoutCommand('kb/abc') => 'git fetch origin && git checkout kb/abc'
 * @param {string} branch - The branch name to check out.
 * @returns {string|null} The checkout command, or null when branch is missing.
 ***/
export function buildCheckoutCommand(branch) {
  if (!branch || typeof branch !== 'string') return null;
  return `git fetch origin && git checkout ${branch}`;
}
