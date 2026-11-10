# PR review canary — post-merge accuracy

1. Pick an in-flight branch-mode task whose branch has both code and task-dir churn:
   `git diff --numstat --find-renames main...kb/<id> | grep docs/tasks`
2. Open its PR review page — note file list and counts (screenshot A).
3. Merge the task (or let the merge stage land), then re-open the same review page.
4. Confirm:
   - Files Changed still shows the merged code diff (not empty).
   - No docs/tasks/... rows appear anywhere (merged block or New since merge).
   - Reports tab still shows stage reports.
   - File count matches `git diff --numstat --find-renames <baseSha>...<headSha> | grep -v docs/tasks | wc -l`.
   - When filtering consumed task files, empty state shows "No reviewable code changes; task files are shown in Reports." and `filteredTaskFilesCount` > 0.
5. If preserveReviewDiffAfterMerge enabled: fail-back, land a fix (one code file), re-merge — review shows latest pass only (not a union) and New since merge correct.
6. Attach screenshots A/B and git counts to the stage report.
