/***
 * MARK: admin commit patterns
 * @description Why each pattern is automation noise rather than shipped work:
 *   `KainBain:` subjects are engine auto-commits (pending-work snapshots,
 *   converge/merge-latest syncs); `kb/<uuid>` subjects are per-stage runner
 *   output commits; every listed merge shape only syncs branches (task work
 *   lands on the default branch as squash commits with their own subjects,
 *   so dropping the sync merge never hides the work itself). A merge that
 *   carries real review wording (for example `Merge main: keep the
 *   model-reporting fix`) matches none of these and is kept.
 ***/
const KAINBAIN_PREFIX = "KainBain:";
const RUNNER_OUTPUT_SUBJECT = /^kb\/[0-9a-f-]{8,}/i;
const REMOTE_TRACKING_MERGE = /^merge remote-tracking branch\b/i;
const LOCAL_BRANCH_MERGE = /^merge\s+branch\b.*\binto\s+kb\/[0-9a-f-]{8,}/i;
const ORIGIN_MERGE = /^merge\s+origin\//i;
const MERGE_INTO_TASK_BRANCH = /\binto\s+kb\/[0-9a-f-]{8,}/i;

/***
 * MARK: isAdminCommitSubject
 * @description Decides whether a commit subject is automation noise that the
 *   changelog should hide: engine auto-commits, runner stage-output commits,
 *   and branch-sync merges. Anything else — human task work, squash-merge
 *   subjects, real merges with review wording — is kept. Unknown shapes
 *   (non-strings, blank lines) count as noise so a malformed subject can
 *   never slip an unreadable row into the dialog.
 * @example isAdminCommitSubject('KainBain: auto-commit pending work') => true
 * @example isAdminCommitSubject("Merge branch 'main' into kb/2b990c4f-2026") => true
 * @example isAdminCommitSubject('Merge origin/main into kb/2b990c4f-2026') => true
 * @example isAdminCommitSubject("Merge remote-tracking branch 'origin/main' into kb/aa-2026") => true
 * @example isAdminCommitSubject('Merge main: keep the model-reporting fix') => false
 * @example isAdminCommitSubject('Harden runner log transport') => false
 * @param {string} subject - The commit subject line.
 * @returns {boolean} True when the commit is automation noise to hide.
 ***/
export function isAdminCommitSubject(subject) {
	if (typeof subject !== "string") return true;
	const line = subject.trim();
	if (line.length === 0) return true;
	if (line.startsWith(KAINBAIN_PREFIX)) return true;
	if (RUNNER_OUTPUT_SUBJECT.test(line)) return true;
	if (REMOTE_TRACKING_MERGE.test(line)) return true;
	if (LOCAL_BRANCH_MERGE.test(line)) return true;
	if (ORIGIN_MERGE.test(line)) return true;
	if (MERGE_INTO_TASK_BRANCH.test(line)) return true;
	return false;
}
