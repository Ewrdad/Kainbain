# GUIDE — Cause 4: preserved-diff baseline is frozen / empty / unresolvable after merge

**Status: REPLICABLE LOCALLY (SAFE) — largely already covered by existing
integration tests.** Only applies when the project opts in
(`project.preserveReviewDiffAfterMerge`, `isReviewDiffPreserved` in
`api/work/taskBranches.js:80`).

**Mechanism** (from `WIDE_NET_ANALYSIS.md` cause 4): with preservation on and
a valid `task.reviewBaseline` (`{baseSha, headSha, …}` recorded at merge time,
`api/flow/commandStages.js:97-155`), `buildTaskReview` routes to
`buildPreservedReview` (`api/reviewAssembly.js`), whose primary `files` come
from the **frozen** `baseline.baseSha...baseline.headSha` SHAs. Failure modes:

- Baseline SHAs don't resolve in the backend checkout (shallow clone, GC, or
  SHAs that only exist on the remote — interacts with cause 1, since runner
  commits may never be fetched locally) → `frozen = null` → falls back to the
  **live** diff with a `preserveNote`, or to `emptyReview` when the task
  branch is gone.
- Baseline captured with identical trees (e.g. merge commit whose diff vs
  base is empty) → frozen section is empty too.
- Task branch deleted post-merge → payload flips to the preserved/empty path.

Note: for the pictured MR the screenshot shows **no** "preserved diff" notice,
so `preserved` was false there — cause 4 does not explain that specific MR,
only post-merge MRs in opted-in projects.

## Existing coverage (run these — safe, temp repos)

`api/reviewAssembly.integration.test.js` already proves:

- empty live diff after merge when preservation is **off**;
- preserved payload stays populated when preservation is **on**;
- post-failback fix-ups render as `newSinceMerge`;
- shallow/GC fallback (unresolvable baseline SHAs → live diff + `preserveNote`);
- deleted-branch case (frozen baseline still renders);
- byte-identical default payload when the feature is off.

```bash
cd api && npx vitest run reviewAssembly.integration.test.js
```

## Gap to test (TDD example — paste into a code stage)

The one scenario not obviously covered: **baseline SHAs that exist only on
the remote** (cause 1 × cause 4 interaction) — backend never fetched, so the
frozen section silently falls back to the live diff, which is *also* empty
because the local task ref lags. Net: blank review with a `preserveNote` even
though `origin` has everything.

```js
it("cause 4 x cause 1: baseline SHAs remote-only (never fetched) + stale local ref -> empty files with preserveNote", async () => {
  // Build bare origin; backend clone; runner clone commits + pushes kb/task-1.
  // Record a reviewBaseline pointing at the runner's pushed SHAs (as the merge
  // stage would), but DON'T fetch in the backend clone.
  // Expect (current behaviour): review.files === [] and preserveNote set,
  // even though git diff origin/main...origin/kb/task-1 (after fetch) is non-empty.
  // TODO(fix): review path should resolve remote-available SHAs/refs.
});
```

## Prod check (permission required — see `PROD_VERIFICATION.md`)

For a post-merge blank MR in an opted-in project: confirm
`project.preserveReviewDiffAfterMerge` is on, read `task.reviewBaseline` from
`docs/tasks/<taskId>/task.md` frontmatter, and check
`git cat-file -e <baseSha>` / `git cat-file -e <headSha>` in `project.cwd`
(read-only) vs `git ls-remote origin`.
