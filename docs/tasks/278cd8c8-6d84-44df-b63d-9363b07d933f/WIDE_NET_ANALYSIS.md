# Wide-Net Analysis — "PR view blank for all MRs" (task 278cd8c8-6d84-44df-b63d-9363b07d933f)

Investigatory only — no fixes proposed. Sources: the bug-report screenshot
(`assets/image.png`), `SURVEY.md` (round 1 answers), and a read-through of the
review pipeline: `api/routes/review.js` → `api/reviewAssembly.js` →
`api/reviewDiff.js` / `api/git/*`, plus `frontend/src/context/useReview.js` and
`frontend/src/components/tasks/TaskReviewPage.jsx`.

## What the screenshot actually shows (key evidence)

The review page for task `64fb8fbb-a1b6-4004-9986-90662cfc4498` renders a
successfully loaded payload, not an error:

- Header: `kb/64fb8fbb-… → main`, **`↑0 ↓0`** (ahead/behind both zero), an
  `UNCOMMITTED CHANGES ELSEWHERE` badge (so the shared worktree is on another
  branch and dirty — `data.uncommittedChanges === true`).
- FILES CHANGED tab: `"Nothing to review yet — the agent has not modified any files."`
  — this is the **default** empty-state text in `TaskReviewPage.jsx`, meaning
  the API returned `files: []`, `reason: null`, and `filteredTaskFilesCount: 0`
  (the "N task file(s) hidden" hint would otherwise render). REPORTS (5) has
  content, so `hasReports` is true and the tabs render.
- Survey corroboration: q1 "All MRs / every task I open"; q2 commits/edits seen
  "elsewhere (git log / Files & Repo / **upstream**)"; q10 "Reload still blank"
  (not transient → server-side payload, not a WS/render glitch); q9 "Multiple
  projects"; q8 reports contain only stage docs.

So the bug is: **`buildTaskReview` returns an empty `files` array with
`aheadBy: 0` even though commits for the task branch exist (at least on the
remote).** The diff itself is coming up empty, not just the rendering.

Verified locally on this very repo: `git diff --name-status main...HEAD` on
branch `kb/278cd8c8-…` shows only `docs/tasks/278cd8c8-…/SURVEY.md` and
`assets/image.png` — i.e. a docs-only task produces an empty Files Changed by
construction (see cause 3).

## Possible cause 1 — Review diff reads LOCAL refs only and never fetches, while agent stages run on remote Runners (server2) that push to origin

**Mechanism.** `GET /projects/:p/tasks/:t/review` → `buildTaskReview(deps,
project.cwd, …)` (`api/routes/review.js:185`) computes the diff inside the
backend's primary checkout `project.cwd` using local refs only:
`branchExists` = `git rev-parse --verify refs/heads/<branch>`
(`api/git/status.js:68-76`), `resolveSha` = local `rev-parse`, and
`diffFiles`/`revCount` run `git diff`/`rev-list` on `base...head` local refs
(`api/reviewDiff.js`). Nothing in `reviewAssembly.js` or `routes/review.js`
ever runs `git fetch`. Meanwhile agent stages are dispatched to Runners
(`api/flow/execution/executeStage.js:242` — `runnerExecutionOnly` →
"Runner execution only"); the Runner executes in its own per-task workdir
mirror and pushes `branch:branch` to origin (`runner/gitOps.js`
`commitAndPush`; `runner/project.js` `refreshWorktreeToRemote` =
`checkout -f -B <branch> origin/<branch>`). The kainbain-task-analysis skill
states the same: "Agent stages run on Runners … in a per-task worktree". This
repo's own history shows runner-produced commits ("Runner server2-alpha stage
output"). At a human checkpoint the backend calls `ensureTaskBranchRef`
(`api/flow/execution/executeStage.js:400`), which is create-only and creates a
missing ref **from the pipeline base tip** (`api/work/taskBranches.js:621+`) —
so the local `kb/<task>` ref can exist yet point at the base tip, giving
`main...kb/<task>` = empty diff, `↑0 ↓0`, exactly the screenshot, while the real
commits sit on `origin/kb/<task>` (survey q2: seen "upstream").

**Pros.**
- Matches every visible symptom: blank files, `↑0 ↓0`, default
  "Nothing to review yet" text (`reason: null`, `filteredTaskFilesCount: 0`),
  "UNCOMMITTED CHANGES ELSEWHERE", reload-still-blank (q10), all MRs across
  multiple projects (q1, q9) — any project whose stages ran on a remote runner.
- Code-verified: the review path has no fetch; the merge path explicitly does
  (`api/flow/runnerRoutes.js:219` `git fetch --prune origin` in
  `prepareIntegrationAttempt`), showing the authors fetch where remote truth
  matters but not in the review path.
- Survey q2's "upstream" wording points at remote-only visibility of commits.

**Cons.**
- In single-machine/embedded execution the backend itself commits on the local
  task branch, so the local ref would carry the commits and this cause would
  not fire; the survey doesn't confirm every affected project uses remote
  runners.
- If some other backend path (task list sync, checkpoint entry) updates the
  local task-branch ref from origin, the symptom would be intermittent rather
  than "all MRs" — not observed.

**References.** `api/reviewAssembly.js` (`buildTaskReview`, `resolveReviewBase`,
no fetch), `api/git/status.js:68` (`branchExists` local-only), `api/reviewDiff.js`,
`api/routes/review.js:185`, `api/flow/execution/executeStage.js:229-251,400`,
`api/work/taskBranches.js:621` (`ensureTaskBranchRef` creates ref from base tip),
`runner/gitOps.js` (`commitAndPush`), `runner/project.js` (`refreshWorktreeToRemote`),
`api/flow/runnerRoutes.js:183-225` (merge path fetches), `docs/git-runner-coordination-spike.md`,
`skills/kainbain-task-analysis/SKILL.md` §1, SURVEY.md q1/q2/q9/q10, screenshot header.

## Possible cause 2 — Pipeline base branch ("destination") mismatch in `resolveReviewBase`

**Mechanism.** The review diffs the task branch against the task's *effective
base*: pinned `task.baseBranch` → pipeline `workflow.baseBranch` → repo default
(`api/work/taskBaseBranch.js` `resolveTaskBaseBranch`; used in
`api/reviewAssembly.js` `resolveReviewBase`). The diff is three-dot
(`base...head`, merge-base semantics). If the pipeline's destination/base
branch already contains the task's commits — e.g. the task was merged into that
feature base, the base was fast-forwarded over the task branch, or the pinned
base equals a branch the runner merged into — then `base...head` is empty and
`rev-list --left-right --count` reports `0 0`, producing the identical blank
payload. Additionally, if the configured base does not exist as a **local**
ref in the backend checkout, `resolveReviewBase` silently falls back to the
repo default (`branchExists(preferred)` fails → defaultBranch), so the header
base and the actual diff base can diverge from what the pipeline intends. The
bug report itself floats "different pipeline destinations".

**Pros.**
- Directly matches the "0 ahead / 0 behind + empty diff" signature whenever the
  base ref has absorbed head; explains per-pipeline/per-MR variance (q9
  "Multiple pipelines in one project") and blank reviews after merge/preserve
  cycles (q5).
- `docs/git-branch-support.md` documents that "review/diff views compare the
  task branch against" the pipeline base, and `api/work/pipelineBaseBranch.integration.test.js`
  exists precisely because this resolution is subtle.

**Cons.**
- The screenshot header shows `→ main`, and q3 is "I don't know" — no evidence
  yet that any affected pipeline has a non-default base; with base == main this
  cause reduces to "local main already contains head", which overlaps cause 1
  (stale local refs) rather than standing alone.
- A misconfigured base would usually still show *some* diff (task-vs-feature),
  not a guaranteed empty one.

**References.** `api/reviewAssembly.js` `resolveReviewBase`; `api/work/taskBaseBranch.js`
(`resolveTaskBaseBranch`, `ensureBaseBranchExists`); `docs/git-branch-support.md`
§"Per-Pipeline Base Branch"; `api/work/pipelineBaseBranch.integration.test.js`;
SURVEY.md q3/q5/q9; bug-report text ("different pipeline destinations?").

## Possible cause 3 — `filterTaskFiles` strips every `docs/tasks/` change, so docs-only tasks render a blank Files Changed by design

**Mechanism.** `buildTaskReview` pipes the raw diff through `filterTaskFiles`
(`api/reviewAssembly.js`), which drops any row whose path is inside
`<docsDirName>/tasks/` (`api/docsPath.js:255` `docsTasksIgnorePath`,
`api/work/isTaskFilePath.js`). Stage reports, surveys, plans, task.md and
assets all live there. The UI then shows the empty state because
`hasReviewFiles` is false (`TaskReviewPage.jsx` ~line 121). Verified live:
on this task's own branch, `git diff --name-status main...HEAD` lists only
`docs/tasks/278cd8c8-…/SURVEY.md` and `…/assets/image.png`, so the review
payload for this very MR has `files: []`. The "N task file(s) hidden" hint only
appears when `filteredTaskFilesCount > 0`.

**Pros.**
- Fully explains blank Files Changed for docs-only/no-code stages (q5: "Agent
  ran a docs-only stage"; q8: "Reports only contain stage docs") — for those
  MRs the blank view is intended behaviour, with the content in REPORTS (5).
- Confirmed by direct git inspection of the current branch.

**Cons.**
- Does NOT explain the screenshot's exact text: the screenshot shows the
  generic "Nothing to review yet" (i.e. `filteredTaskFilesCount === 0`), not
  the "task files are shown in Reports" hint — so for the pictured MR the
  underlying diff was empty even before filtering, meaning causes 1/2/4 are
  needed for that case.
- Doesn't explain blank MRs where the agent edited real code files (q2/q5
  "code-editing stage … exited successfully" + commits seen elsewhere).

**References.** `api/reviewAssembly.js` `filterTaskFiles`; `api/docsPath.js:248-257`;
`api/work/isTaskFilePath.js`; `frontend/src/components/tasks/TaskReviewPage.jsx`
(`hasReviewFiles`, empty-state block ~lines 437-475); `api/work/taskDiffStat.js`
(same filter for badges); SURVEY.md q5/q8; `git diff --name-status main...HEAD` output.

## Possible cause 4 — Preserved-diff baseline path returns a frozen empty diff (or falls back oddly) after merge

**Mechanism.** When `project.preserveReviewDiffAfterMerge` is on and the task
has a valid `reviewBaseline` (`{baseSha, headSha, …}` recorded at merge time,
`api/flow/commandStages.js:97-155`), `buildTaskReview` routes to
`buildPreservedReview`, whose primary `files` come from the frozen
`baseline.baseSha...baseline.headSha` SHAs — not from the live branch. If those
SHAs don't resolve in the backend checkout (shallow clone, GC, or SHAs that only
exist on the remote because runner commits were never fetched locally), the
frozen load throws, `frozen = null`, and it falls back to the live diff with a
`preserveNote` — or, when the task branch itself is gone, to `emptyReview`.
If the baseline was captured such that base and head have identical trees
(e.g. merge commit whose diff vs base is empty), the frozen section is empty
too. The task branch being deleted post-merge also flips the payload to the
preserved/empty path.

**Pros.**
- Explains blank reviews specifically after "merged or preserved, then re-opened"
  (q5 option) and after history rewrites; interacts with cause 1 because the
  baseline SHAs are recorded from remote state at merge time.
- Code path is explicit and failure-tolerant (`api/reviewAssembly.js`
  `buildPreservedReview`).

**Cons.**
- Opt-in per project (`isReviewDiffPreserved`, `api/work/taskBranches.js:80`),
  and q9 says multiple projects are affected — they'd all need the flag on.
- The screenshot shows no "preserved diff" notice, so for the pictured MR
  `preserved` was false; this cause doesn't apply to that MR as-rendered.

**References.** `api/reviewAssembly.js` `buildPreservedReview`;
`api/work/taskBranches.js` `isReviewDiffPreserved` / `isValidReviewBaseline`;
`api/flow/commandStages.js:97-180` (baseline recording); SURVEY.md q5.

## Possible cause 5 — Frontend payload consumption / project scoping in `useReview` + `TaskReviewPage`

**Mechanism.** The page fetches `GET /projects/{activeProjectId}/tasks/{taskId}/review?projectId=…`
(`frontend/src/services/watch/index.js` `getTaskReview`; `useReview.js`
auto-load effect) and renders the Files tab only when
`data.files.length > 0 || data.newSinceMerge?.files.length > 0`
(`TaskReviewPage.jsx` `hasReviewFiles`). The project used for the request is
derived from `activeProjectId`, not from `task.projectId`
(`TaskReviewPage.jsx` `project` useMemo), so a review opened while a different
project is active would query/guard the wrong project (`resolveAndGuardProject`
in `api/routes/review.js`).

**Pros.**
- Would produce an all-MRs-blank symptom if the review request is consistently
  made with a mismatched project (guard rejects or returns an empty/other
  project's payload); would also explain q10 (reload still blank).

**Cons.**
- The screenshot shows a fully rendered, correct payload for the right task
  (right branch name, REPORTS (5), uncommitted badge, stage chip) — the fetch
  succeeded and returned `files: []`. So the frontend is faithfully rendering a
  server-side empty diff; a frontend cause is not supported by the evidence.
- q10's "Review payload / API returns files but UI still empty" was NOT
  selected in the survey.

**References.** `frontend/src/context/useReview.js`; `frontend/src/services/watch/index.js:16`;
`frontend/src/components/tasks/TaskReviewPage.jsx` (`project` useMemo,
`hasReviewFiles`, empty state); `api/routes/review.js` `resolveReviewContext`;
SURVEY.md q10.

## Summary table

| # | Candidate cause | Explains screenshot exactly? | Explains docs-only MRs? | Key evidence |
|---|---|---|---|---|
| 1 | Local-ref-only diff, no fetch, remote-runner commits only on origin | Yes (↑0 ↓0, blank, reason null) | No | `reviewAssembly.js` no-fetch vs `runnerRoutes.js:219` fetch; `ensureTaskBranchRef` ref-from-base; q2 "upstream"; q10 |
| 2 | Pipeline base/destination branch mismatch (three-dot diff empty) | Only if base absorbed head | No | `resolveReviewBase`, `taskBaseBranch.js`, git-branch-support.md; q3/q9 unknown |
| 3 | `docs/tasks/` filter empties the Files tab for docs-only tasks | No (hint text would differ) | Yes | `filterTaskFiles`, live `git diff main...HEAD` on this branch; q5/q8 |
| 4 | Preserved baseline frozen-diff empty / unresolvable SHAs | Only post-merge with flag on | No | `buildPreservedReview`, `commandStages.js:97`; q5 |
| 5 | Frontend project scoping / payload gating | No (payload rendered fine) | No | screenshot shows loaded payload; q10 |

Most likely primary driver per the evidence: **cause 1** (server-side empty
diff from local refs that don't include the runner-pushed commits), with
**cause 3** explaining the docs-only subset and **cause 2** a possible
contributor on pipelines with custom base branches.
