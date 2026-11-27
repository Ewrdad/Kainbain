# GUIDE — Cause 2: pipeline base / destination branch mismatch in `resolveReviewBase`

**Status: REPLICABLE LOCALLY (SAFE).** Two sub-cases, both reproducible in
temp repos; one is already covered by an existing integration test.

**Mechanism** (from `WIDE_NET_ANALYSIS.md` cause 2): the review diffs the task
branch against the task's *effective base* — pinned `task.baseBranch` →
pipeline `workflow.baseBranch` → repo default
(`api/work/taskBaseBranch.js` `resolveTaskBaseBranch`, used by
`resolveReviewBase` in `api/reviewAssembly.js`). The diff is **three-dot**
(`base...head`, merge-base semantics, `api/reviewDiff.js`).

- **2a. Base absorbed head.** If the pipeline destination already contains the
  task's commits (task merged into the feature base, base fast-forwarded over
  the task branch), `base...head` is empty and `rev-list --left-right --count`
  reports ahead 0 → blank Files Changed even though commits exist.
- **2b. Preferred base missing locally.** `resolveReviewBase` checks
  `branchExists(cwd, preferred)` — a **local** `refs/heads/<base>` check. If
  the custom base exists only on the remote (or was never ensured locally),
  the resolver **silently falls back to the repo default**, so the header base
  and the actual diff base diverge from the pipeline's intent.
  Note `ensureBaseBranchExists` (`api/work/taskBaseBranch.js:105`) *does*
  `git fetch origin` and adopt `origin/<base>` — but only when it creates the
  base; `resolveReviewBase` itself never fetches.

## Repro 2a (executed, captured) — base absorbs head

```bash
# continuing the cause-1 temp repo, in the backend clone after fetch:
git checkout main && git merge --no-ff origin/kb/task-1 -m "merge feature"
git diff --name-status main...origin/kb/task-1        # EMPTY -> blank review
git rev-list --left-right --count main...origin/kb/task-1   # 1  0 (behind 1, ahead 0)
```

Captured output:

```text
merged origin/kb/task-1 into main
--- git diff --name-status main...origin/kb/task-1 (base absorbed head)
(empty = blank review)
--- rev-list --left-right --count main...origin/kb/task-1
1	0
```

Already covered by an existing test:
`api/reviewAssembly.integration.test.js` → *"shows an empty live diff after
merge when preservation is off"* asserts `review.files` has length 0 after
merging the task branch into `main` with preservation off. Run it:

```bash
cd api && npx vitest run reviewAssembly.integration.test.js -t "empty live diff after merge"
```

## Repro 2b (executed, captured) — preferred base missing locally → silent fallback

With a pipeline whose `baseBranch` is e.g. `feature/x` that has **no local
`refs/heads/feature/x`** in the backend checkout:

```text
git branch -a
  kb/docs-only
  kb/task-1
* main
  remotes/origin/HEAD -> origin/main
  remotes/origin/kb/task-1
  remotes/origin/main
preferred base 'feature/x' has no local refs/heads/feature/x
-> branchExists=false -> diff base silently becomes 'main'
```

`resolveReviewBase` (`api/reviewAssembly.js`) returns the repo default in
that case; the review header can then show a base that is not the pipeline's
destination.

## TDD test examples (paste into a code stage, e.g. extend `api/reviewAssembly.integration.test.js`)

```js
it("cause 2a: task merged into its pipeline base -> three-dot diff is empty (documents the blank-review case)", async () => {
  // dir/project/task from the existing beforeEach (initRepo + kb/task-1 branch)
  commitFile(dir, "kb/task-1", "feature.txt", "new\n", "add feature");
  // pipeline base "feature/x" absorbs the task branch:
  git(dir, "checkout", "-b", "feature/x", "main");
  git(dir, "merge", "--no-ff", "kb/task-1", "-m", "absorb task");
  project.baseBranch = undefined; // pipeline-level base simulated via task pin:
  task.baseBranch = "feature/x";
  const review = await buildTaskReview(makeDeps(project, task), dir, "proj-1", "task-1");
  expect(review.baseBranch).toBe("feature/x");
  expect(review.files).toHaveLength(0);   // blank even though commits exist
  expect(review.aheadBy).toBe(0);
});

it("cause 2b: preferred base with no LOCAL ref falls back to repo default (documents the silent fallback)", async () => {
  commitFile(dir, "kb/task-1", "feature.txt", "new\n", "add feature");
  // remote-only base: create feature/x on a second clone and push, never locally
  git(dir, "checkout", "-b", "feature/x", "main");
  git(dir, "push", "origin", "feature/x"); // assume origin configured in fixture
  git(dir, "branch", "-D", "feature/x");    // local ref gone, origin/feature/x remains
  git(dir, "checkout", "kb/task-1");
  task.baseBranch = "feature/x";
  const base = await resolveReviewBase(dir, "kb/task-1", { baseBranch: "feature/x" });
  expect(base).toBe("main"); // silent fallback — flag for review: should this surface a warning?
});
```

## Prod check (permission required — see `PROD_VERIFICATION.md`)

For an affected MR, read the task's effective base via the API/store
(`task.baseBranch`, else `workflow.baseBranch` for the task's pipeline) and
compare `git ls-remote origin refs/heads/<base>` against the local
`refs/heads/<base>` in `project.cwd`. A missing/diverged local base, or a base
that already contains the task branch, confirms cause 2 for that MR.
