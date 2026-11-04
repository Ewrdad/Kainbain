# Implementation Plan — PR review: exclude task files from Files Changed and verify post-merge accuracy

Source: `docs/tasks/0c4d4149-b055-4314-8f36-2a50a85e1259/idea-20261104-174109.md` (human-approved idea) and `SURVEY.md` (grill-me questionnaire, round 1, 2026-11-04).
This document is the plan only — no code changes are made at this stage.

Related prior work:
- PR review stack: `api/reviewDiff.js` (git diff primitives), `api/reviewAssembly.js` (payload assembly + preserved-baseline logic), `api/routes/review.js` (review API + comment validation), `frontend/src/components/tasks/TaskReviewPage.jsx` (Files Changed / Reports / Conversation tabs).
- Post-merge preservation: `api/work/taskBranches.js` (`preserveReviewDiffAfterMerge`, `reviewBaseline`), `api/flow/commandStages.js` (`recordReviewBaseline` → `isMergeLanded`), `api/reviewAssembly.integration.test.js` (real-repo preservation matrix).
- Task storage: `api/docsPath.js` (`resolveDocsDirName`, `resolveTasksDir`, `resolveTaskDocsDir`, `docsTasksIgnorePath`), `api/work/taskDiffStat.js` (badge totals), `frontend/src/components/review/FileDiffList.jsx`.

---

## 0. Survey decisions applied (authoritative for implementation)

The grill-me survey refined the task statement into six locked decisions. Where the short task description was ambiguous, the survey takes precedence.

| Survey question | Answer (authoritative) | What it means for the plan |
|---|---|---|
| Q1 — Which KainBain-created files to exclude? | **Everything under `docs/tasks/<id>/`** (plus the task state file `task.md` — redundant but confirms intent). The option selected was "Everything under `docs/tasks/<id>/` (recommended)" together with "Task state file". | Scope is the *directory prefix*, not an enumerated filename list. No allow-listing of "maybe keep this one .md". See §2 for prefix definition. |
| Q2 — How to exclude? | **Hide them completely from Files Changed (recommended).** | No count badge, no toggle, no "N task files hidden" hint in v1. The Files Changed list simply does not contain task-dir rows. This is the simplest and least-error-prone interpretation. |
| Q3 — Where do excluded task files remain visible? | **Only in the existing Reports tab (recommended).** | Task files are already surfaced as stage reports where applicable. No new "task files" section in the review view. If a file is only visible as a diff row today, it will have no diff representation — that is intentional. |
| Q4 — When to exclude? | **Always exclude them from Files Changed (recommended).** | Pre-merge *and* post-merge/frozen reviews. Not "only after merge". The filter must be active on every review assembly path, not gated on `preserved` or `reviewBaseline` presence. |
| Q5 — Which post-merge risk matters most? | **The merged change disappears or becomes empty.** | The primary correctness risk for the second fix is the live `main...kb/<id>` diff going empty after merge with no compensating preserved payload. Tests must assert non-empty preserved content, not just "doesn't crash". |
| Q6 — How to verify? | **Automated tests plus a manual canary review after merge (recommended).** | Both automated coverage (unit + integration) *and* a human canary review of a real merged task are required before shipping. Neither alone satisfies the stage. |

Implications carried through the rest of the plan:
- No toggle/count UI in v1.
- No new "task files elsewhere" view — Reports tab already covers the legitimate visibility need.
- Exclusion is unconditional on the review type (live vs preserved vs fallback).
- Post-merge accuracy work must defend specifically against the "empty after merge" failure.

---

## 1. Goals and non-goals

### 1.1 Goals (acceptance-criteria mapping)

| # | Criterion | Plan section |
|---|---|---|
| G1 | **Task files excluded from PR review history.** `docs/tasks/<id>/` (respecting per-project `docsDirName`) no longer appears in the Files Changed view, regardless of review mode (live, preserved, newSinceMerge). Reports tab remains the sole review surface for task-dir content. | §3, §4 |
| G2 | **PR reviews accurate including after a merge.** The merged change stays visible post-merge (not empty), does not show stale files, and file counts/totals match what shipped. Covers both the live and preserved-baseline paths, the shallow/GC fallback, and the deleted-branch case. | §5 |
| G3 | **Change is verifiable.** Automated tests demonstrate the filter and the post-merge correctness; a documented canary-review procedure exists; docs explain the behaviour change. | §6, §7 |

### 1.2 Non-goals

- Filtering anything *outside* the task directory (e.g. `.kainbain/`, `frontend/`). The gitignore already marks `.kainbain/` separately, but it does not appear in the task-branch diff in practice because it is untracked and ignored.
- A user-facing toggle or "hidden files" count — explicitly rejected by survey Q2.
- A new tab or attachments view for task files — rejected by survey Q3 (Reports tab only).
- "Only after merge" scoping — rejected by survey Q4.
- Bulk historical rewrite of already-merged tasks' persisted baselines. The fix applies to future merges; existing baselines that already contain task-file rows will naturally age out (or can be regenerated by re-merging where needed — document this).

---

## 2. Key domain definitions (precise scope, settle early)

### 2.1 What "task files" means in code

"Task files" are **all paths whose repo-relative path starts with the project's task-directory prefix**:

```
docsTasksPrefix(project) = `${resolveDocsDirName(project)}/tasks/`
```

- Default: `docs/tasks/` (`docs` is `DEFAULT_DOCS_DIR_NAME`).
- Custom: e.g. `k-docs/tasks/` when `project.docsDirName === 'k-docs'`.

This is the same value returned by `docsTasksIgnorePath(project)` today (with trailing slash). The filter must respect the custom prefix — hard-coding `docs/tasks/` would silently break on renamed-docs projects. The project object is available everywhere the review payload is built (see `api/docsPath.js` and `api/reviewAssembly.js:buildTaskReview` which already receives `project`).

**Not task files:** `docs/` outside `docs/tasks/` (project docs), `frontend/`, backend code, config. Only the `tasks/` subtree.

### 2.2 Where the path is already normalised

- `api/reviewDiff.js:diffFiles` returns `path` as repo-relative posix (git's own output). No leading `./`.
- `api/reviewAssembly.js:loadDiffSection` preserves those paths into `review.files[].path`.
- Reports have their own discovery path (`taskStore.getTaskReports`) and are never part of the diff file list — they are a separate `review.reports[]` array. Confusing the two would be a bug.

### 2.3 Two diff sections to filter

`reviewAssembly.js` can produce up to two filtered sections:

- **Primary `files`/`commits`**: live diff (`baseBranch...taskBranch`) *or* frozen `baseSha...headSha` baseline when preserved.
- **`newSinceMerge.files`/`newSinceMerge.commits`**: the live diff since the frozen merge (fix-up work), when `preserved && live has content`.

Both sections must be filtered. Filtering only one would leave task files visible either in the merged-change block or the "New since merge" block.

---

## 3. "Make change easy, then make the change"

Before feature work, land low-risk preparatory edits so the real change is mechanical and reviewable as a pure filter.

### Phase E0 — Research + refactoring (no behaviour change)

#### E0.1 — Research spike (short, written up as notes in this plan's appendix or a `docs/research/` note)

1. **Confirm custom `docsDirName` coverage**: audit all call sites that construct or compare task-directory paths. Today `docsTasksIgnorePath` exists but is not used in review code — confirm no hard-coded `docs/tasks/` strings exist in the review path (grep shows none in `api/reviewAssembly.js`, `api/reviewDiff.js`, `api/routes/review.js`, `api/work/taskDiffStat.js`, `frontend/src/components/review/`). Record findings.
2. **Confirm task-file proportion hypothesis**: sample a handful of recent task branches (`git diff --numstat --find-renames main...kb/<id>`) and note what fraction of rows are task-dir vs real work. This validates the user's "mostly shows task file changes and not the bulk of the actual work" claim and gives a before/after headline for the PR description.
3. **Post-merge accuracy audit**: re-read `api/reviewAssembly.integration.test.js` and `api/flow/mergeReviewBaseline.test.js` to list every preserved-baseline edge case already covered (empty live diff, `newSinceMerge` split, reset vs cumulative baseline, shallow/GC fallback, deleted branch, byte-identical default payload). Anything in this list is *not* new work — it is the baseline to protect.
4. **Badge totals coupling**: trace `api/work/taskDiffStat.js` — `getTaskDiffStat` (live cumulative badge) and `getCommitRangeDiffStat` (per-stage attribution in `commandStages.js:finalizePassedCommandStage`). Decide whether badge totals should also exclude task files, or explicitly document that they keep their current scope (badges disagreeing with Files Changed is worse than badges changing). The plan's default is: **keep badges in scope for now** — badge logic is cumulative and `getCommitRangeDiffStat` already uses a different measurement (commit range, not branch diff). Changing it in the same patch would conflate two measurements. Call it out as a follow-up decision, not part of this stage.

#### E0.2 — Extract the task-file predicate (pure helper, no behaviour change yet)

Create a single pure helper, e.g. `api/work/isTaskFilePath.js` (or alongside `docsPath.js` if preferred by ownership):

```js
// Returns true when repoRelativePath is inside <docsDirName>/tasks/
export function isTaskFilePath(repoRelativePath, docsTasksPrefix)
// and optionally:
// export function docsTasksPrefixFor(project) => docsTasksIgnorePath(project)
```

- Pure, no I/O, no git.
- Handles leading `./`, trailing slashes, posix normalisation — even though today's diff output never carries `./`, defence here costs nothing and future-proofs against a report-path style regression.
- Respects custom `docsDirName` via the passed prefix — does not read `project` itself, so it is trivially unit-testable.

Add `api/work/isTaskFilePath.test.js` (or `api/docsPath.test.js` extension) with cases:

- `docs/tasks/<id>/task.md` → true
- `docs/tasks/<id>/assets/image.png` → true
- `k-docs/tasks/<id>/plan.md` with custom prefix `k-docs/tasks/` → true, but `docs/tasks/...` with same prefix → false
- `docs/other.md`, `src/app.js`, `frontend/...`, `api/...` → false
- `./docs/tasks/<id>/report.md` (leading dot-slash variant) → true
- `docs/tasks` (exact dir without trailing slash, not a real diff row but defensively) → true/false — pick one and document it; either is fine as long as it is tested.

This helper ships with tests green and **is not yet called** anywhere. That is the "make change easy" commit: reviewers can approve the predicate in isolation.

#### E0.3 — Widen the review-assembly seams for injection (still no behaviour change)

Add filter injection plumbing so both unit and integration tests can observe the filtering without touching the filesystem:

- In `api/reviewAssembly.js`, thread an optional `filterFilesFn` (or `{ excludeTaskFiles: true }`) through `buildTaskReview` → `buildPreservedReview` → `loadDiffSection`. Alternatively, add a single `filterTaskFiles(files, docsTasksPrefix)` call *after* `loadDiffSection` returns — this is simpler and keeps the git layer ignorant of task semantics. The second shape is recommended: git primitives (`api/reviewDiff.js`) stay agnostic; only the assembly layer knows what a task file is.
- In `api/work/taskDiffStat.js`, leave `getTaskDiffStat` alone (per E0.1 decision). If the follow-up is later taken, the same predicate will be reused there — but not in this stage.

No file list is actually filtered yet. Tests that inject a filter proving the seam works can be added now (e.g. a test that drops a synthetic file from the list and asserts it disappears from the payload). This validates wiring before wiring it to the real predicate.

_Phase E0 must keep `npm run test:unit` green. Nothing a user sees has changed._

---

## 4. The filter fix (the change, now easy)

### 4.1 Backend — `api/reviewAssembly.js`

This is the only place that needs to change for G1. The change is small because E0 did the hard work.

1. Import `docsTasksIgnorePath` (or the new `docsTasksPrefixFor` helper) and `isTaskFilePath`.
2. In `buildTaskReview`, after `loadDiffSection` produces `live` and inside `buildPreservedReview` after `frozen`, filter:

   ```js
   const prefix = docsTasksIgnorePath(project); // "docs/tasks/" or "k-docs/tasks/"
   const withoutTaskFiles = (files) => files.filter(f => !isTaskFilePath(f.path, prefix)
                                                      && !isTaskFilePath(f.oldPath, prefix));
   ```

   Apply to:
   - `frozen.files` (the preserved primary payload) before it becomes `review.files`.
   - `live.files` when it becomes `review.newSinceMerge.files` (the fix-up section).
   - `live.files` in the non-preserved (plain live) return path before it becomes `review.files`.

   Filtering `oldPath` as well handles renames where the task file was the source path (rare but worth covering — one-line addition).

3. **Counts/commits semantics**: `loadDiffSection` also returns `commits` and `behindBy/aheadBy`. Task-file exclusion deliberately does **not** affect commits or ahead/behind — a commit that touched only task files still counts as a commit (git history is not rewritten by a view filter). File-level `additions`/`deletions` totals on remaining rows stay as git reported; no recomputation needed. Document this decision so a future "why does the file count not match `git log --stat`?" question has an answer.

4. **Preserve-note path unchanged**: when `frozen` is null (shallow/GC) the fallback to `live` already exists. The filter applies identically there — filtered live rows with a `preserveNote` is the correct outcome.

### 4.2 Comment validation — `api/routes/review.js`

`routes/review.js` validates incoming comment `filePath` against `review.files` + `newSinceMerge.files` + existing comments + report paths. After filtering, a task-dir path will **no longer be in `review.files`**, so a client that tries to comment on a task-file line would get 400 "Unknown filePath". This is correct: the filtered file has no diff view to anchor a line comment to, and task-dir feedback belongs in report comments or direct report-line comments instead.

No code change required here — the validation automatically tightens with the filtered payload — but **add a test** asserting that posting a line comment anchored to a task-dir path now 400s (or, if the comment already existed, it remains resolvable/deletable via the existing-thread allowance already in the code).

### 4.3 Frontend — `frontend/src/components/tasks/TaskReviewPage.jsx`

No filter change in the frontend: it renders whatever the API returns. That is the point — the filtering is authoritative on the server, so the UI cannot desync.

Optional polish (only if trivial): when the filtered result is `files.length === 0` but the unfiltered git diff was non-empty, the existing empty-state message "Nothing to review yet — the agent has not modified any files." is misleading. A small backend-provided hint — `filteredTaskFilesCount` or a `filterNote` string — would let the UI say "No reviewable code changes; task files are shown in Reports." The plan recommends **adding a lightweight hint field** to the review payload (e.g. `filteredTaskFilesCount: number`) so the existing empty-state branch can render a more honest message. This is one field, no toggle, consistent with survey Q2's "hide completely". Keep the frontend change to one conditional if the hint is present.

If that hint is deferred, the fallback is the current empty-state copy — still better than showing task noise, so it is not a blocker.

### 4.4 What is deliberately *not* changed

- `api/reviewDiff.js:diffFiles` — git primitives do not know what a task file is. Teaching them would make every call site pay for a concept only the review view cares about.
- `api/work/taskDiffStat.js` badge helpers — per E0.1, badges keep current scope this pass. If the team later decides badges should also exclude task files, the same `isTaskFilePath` helper will be reused there in a follow-up.
- `api/git/workingTreeStatus.js` ignores — already ignores `docs/tasks/` for dirty-tree checks. No change.

### 4.5 Verification of the filter itself (before proceeding)

Run the filter through a targeted manual check:

```bash
# pick any in-flight branch with heavy task-dir churn
git diff --numstat --find-renames main...kb/<id> | cut -f3 | sort
# count with and without filtering:
git diff --numstat --find-renames main...kb/<id> | grep -c "^[0-9]"      # total
git diff --numstat --find-renames main...kb/<id> | grep -c "docs/tasks" # task-dir
```

The difference is the expected before/after for that review. Keep the numbers for the stage report.

---

## 5. Double-check PR reviews are accurate after a merge (G2)

"Double-check accurate including after a merge" is not a single filter — it is a correctness invariant with several sub-cases. Most of them are already implemented; the work here is to **prove** them, add any missing measurement, and document the operational check.

### 5.1 What already exists (do not re-implement blindly)

- **Frozen baseline capture**: `api/flow/commandStages.js:recordReviewBaseline` freezes `{ baseSha, headSha, mainSha, mergedAt, stageId }` at merge success, so `main...kb/<id>` going empty does not empty the review.
- **Preserved rendering**: `api/reviewAssembly.js:buildPreservedReview` uses `baseSha...headSha` as the primary payload when `project.preserveReviewDiffAfterMerge === true`, with a separate `newSinceMerge` live section for fail-back fix-ups.
- **Empty live diff after merge when preservation is off**: `api/reviewAssembly.integration.test.js` already asserts `files.length === 0` without preservation — this is the current behaviour for legacy projects and is intentionally *not* changed (opt-in preservation).
- **Shallow/GC fallback**: when `frozen` SHAs are unresolvable, the review falls back to live diff with a `preserveNote`.
- **Deleted-branch case**: frozen baseline still renders when the task branch was deleted post-merge (`api/reviewAssembly.integration.test.js` "still renders the baseline when the task branch was deleted post-merge").

### 5.2 What the double-check must validate (explicit checklist)

Each item below is a test assertion or a canary-review checklist item. The plan requires all of them to pass before "PR reviews are accurate" can be claimed.

#### A. The merged change does not disappear or become empty (survey Q5's top risk)

- **Automated**: extend `api/reviewAssembly.integration.test.js` (or a new `api/prReviewPostMerge.integration.test.js`) with a dedicated "task files excluded, preserved payload still non-empty" case:
  1. Create a temp repo, commit a real code file (`src/app.js`) on `kb/task-1` *and* a task-dir file (`docs/tasks/task-1/task.md`).
  2. Merge `kb/task-1` into `main` and freeze a baseline.
  3. Assert the review API returns:
     - `preserved === true`
     - `files` contains `src/app.js` and **does not contain** any `docs/tasks/...` row
     - `files.length > 0` (not empty)
     - `preserveNote` is absent (happy path)
  4. Repeat with only a task-dir change on the branch — filtered result should be empty but with the correct empty-state reason (not a crash, not "missing").

- **Canary** (human): merge one real task whose branch has both code and task-dir churn, then open its review page. Confirm Files Changed shows code diffs, Reports tab shows stage reports, and nothing task-dir appears in the diff. Screenshot for the stage report.

#### B. The review does not show old or stale files

- **Automated**: fail-back → fix → re-merge story already has coverage ("shows only the latest pass after re-merge with a reset baseline" when `resetReviewBaselineOnMerge !== false`). Add the task-dir variant:
  - Second pass adds only a task-dir file — filtered preserved payload should be unchanged (or empty if first pass had only code + second pass only task-dir), and `newSinceMerge` should not leak unfiltered task-dir rows.

- **Canary**: fail-back one preserved task, land a fix, re-merge — review should show the latest pass only, not a union of stale + new.

#### C. Merged work and later fix-up work are in separate sections (not silently merged)

- Already asserted: `newSinceMerge.files` holds only the live delta and the primary `files` holds the frozen baseline. Add filtered variant: when fix-up work is *only* task-dir churn, `newSinceMerge.files` should be empty (all fix-up rows filtered) and `newSinceMerge` may be null or carry empty commits — never contain task-dir rows.

#### D. File counts/totals match what shipped

- The file list after filtering should be byte-identical to `git diff --numstat --find-renames baseSha...headSha` after removing task-dir rows. Add an integration assertion: snapshot the raw `diffFiles(projectCwd, baseSha, headSha)` rows, run `isTaskFilePath` filtering, and compare to `review.files`. Any divergence is a bug (e.g. missing custom-prefix handling).

- **Canary**: for the canary task, count `git diff --numstat baseSha...headSha | grep -v docs/tasks | wc -l` and confirm the review's file count matches.

#### E. Shallow / deleted-branch / unresolvable-SHA fallbacks still behave

- Existing tests for deleted branch and fallback live diff already exist. Extend each with the task-dir filtering assertion: deleted branch + frozen baseline that contained a task-dir row should still render without that row; fallback live diff with only task-dir rows should go empty, not throw.

### 5.3 What to change in code to satisfy the checklist (likely very little)

If the integration suite in §5.2 passes on the first run against the filtered assembly, no further production code is needed for G2 — the double-check was a verification pass, not a feature. If any assertion fails, the fix is one of:

- The task-dir prefix was not threaded into `buildPreservedReview`'s `loadDiffSection` calls (fix: thread `docsTasksPrefix` into both frozen and live paths).
- The fallback/live path filtered the wrong section (fix: filter both sections uniformly).
- Custom `docsDirName` was not respected in the preserved path (fix: use `docsTasksIgnorePath(project)` in both assembly branches).

None of these change the preservation lifecycle itself (`recordReviewBaseline`, `isMergeLanded`, `isValidReviewBaseline`) — they only affect which git rows are surfaced.

### 5.4 Operational "after a merge" canary procedure (document as a runbook snippet)

Add to `docs/` or to the stage report a reproducible canary checklist an operator can run post-deploy:

```
Canary: PR review stays accurate after merge
1. Pick an in-flight branch-mode task whose branch has both code and task-dir churn
   (confirm with: git diff --numstat --find-renames main...kb/<id> | grep docs/tasks).
2. Open its PR review page — note file list and counts (screenshot A).
3. Merge the task (or let the merge stage land), then re-open the same review page.
4. Confirm:
   - Files Changed still shows the merged code diff (not empty).
   - No docs/tasks/... rows appear anywhere (merged block or New since merge).
   - Reports tab still shows stage reports.
   - File count matches `git diff --numstat --find-renames <baseSha>...<headSha> | grep -v docs/tasks | wc -l`.
5. If the project has preserveReviewDiffAfterMerge enabled:
   - Fail-back the task, land a fix (one code file), re-merge.
   - Confirm review shows the latest pass only (not a union) and New since merge is correct.
6. Attach screenshots A/B and the git counts to the stage report as evidence.
```

This is the survey Q6 "manual canary review after merge" gate operationalised.

---

## 6. Testing and quality gates

### 6.1 Unit tests (primary gate, `npm run test:unit`)

New tests:

- **`api/work/isTaskFilePath.test.js`** (or `api/docsPath.test.js` addition) — pure predicate matrix (see §3 E0.2). Targets: 15–20 cases, including custom prefix, leading `./`, rename `oldPath`, binary rows, non-task paths. No git, no filesystem.

- **`api/reviewAssembly.test.js` — filtered assertions** (extend existing mock-based suite):
  - Live (non-preserved) review: given `diffState.files` that includes a `docs/tasks/t1/task.md` row, the returned `files` omits it.
  - Preserved review: given a `frozen` baseline whose files include task-dir rows + a `live` section whose files include task-dir rows, *both* `review.files` and `review.newSinceMerge.files` are filtered.
  - Custom `docsDirName`: project with `docsDirName: 'k-docs'` — `k-docs/tasks/...` filtered, `docs/tasks/...` (now a non-task path) not filtered.
  - All-task-files branch: filtered result is empty with the correct empty-state `reason` (not a throw, not a missing `files` array).

- **`api/routes/review.test.js` (if exists) or `api/reviewStore.test.js` extension** — comment on filtered path now 400s; existing comment on filtered path still resolvable/deletable.

- **`api/work/taskDiffStat.test.js` — no change expected this pass**, but add a skipped/todo test marking the open badge-scope question so follow-up work has a landing spot: `it.todo("badges exclude task files when the review does")`.

### 6.2 Integration tests (real temp repos, already the pattern for preservation)

- **`api/reviewAssembly.integration.test.js` — extended**: the full G2 checklist from §5.2 (A–E) as real-repo cases against `buildTaskReview` directly, not only via HTTP. Uses `fs.mkdtempSync` + `execFileSync('git', ...)` as the existing file does.

- **No long-lived background server.** Integration tests use in-process temp dirs only, consistent with the Testing & Verification Guidance (headless, isolated, or mock fixtures). The only E2E-style check is the manual canary — not an automated Playwright canary in this stage.

### 6.3 Frontend tests

- **`frontend/src/components/tasks/TaskReviewPage.test.jsx` — extended**:
  - Given a mock review payload whose `files` array has no task-dir entries but would have had them pre-change, the Files Changed view renders only code rows.
  - Given a fully-filtered (empty) file list, the empty-state copy renders (or, if the `filteredTaskFilesCount` hint was added, the task-aware copy renders).
  - Reports tab still renders reports (no regression — task files visible there).

- Existing `canary-e2e/tests/pr-review.spec.js` continues to pass — it does not rely on task-dir rows in the diff.

### 6.4 Commands to run before submitting

```
npm run test:unit         # primary gate — must be green
npm run test:api           # if run separately from test:unit
npm run test:frontend      # same
npm run lint               # no new lint violations
npm run lint:api && npm run lint:frontend  # if split
node scripts/check-one-function-per-file.mjs  # only if new one-function-per-file modules were added
```

Do not spawn a long-lived preview server for visual checks — use the existing headless screenshot tool (`npm run capture:screenshot`) if a visual before/after is desired, or attach the canary screenshots from the real merge canary.

---

## 7. Documentation plan

### 7.1 Docs to update during implementation (not after)

- **`docs/tasks/0c4d4149-b055-4314-8f36-2a50a85e1259/IMPLEMENTATION_PLAN.md`** (this file) — the plan itself.

### 7.2 Docs to update at implementation time

- **Code-adjacent docs**:
  - `api/docsPath.js` — if the new predicate lives alongside `docsTasksIgnorePath`, extend the module's doc block with the filtering contract.
  - `api/reviewAssembly.js` — update `MARK: loadDiffSection` / `MARK: buildTaskReview` doc blocks to state that task-dir rows are filtered and where the prefix comes from.
  - `api/work/isTaskFilePath.js` — self-documenting header with examples (already required by the one-function-per-file rule).

- **Operator-facing docs**:
  - `docs/KB Architecture.md` or `docs/ProjectStatus.md` (whichever documents the PR review feature) — add one sentence: "Files Changed excludes `docs/tasks/` (shown in Reports) and respects per-project `docsDirName`."
  - If a user-facing changelog or "What's new" surface exists in the app, add a one-line entry: "PR reviews no longer list task bookkeeping files (`docs/tasks/`) — use Reports for those."

- **Runbook / canary procedure**:
  - Add the §5.4 canary checklist to `docs/manual-testing/` or to the stage's own report template so the *next* operator performing a canary review knows what to check. Even a short markdown file `docs/manual-testing/pr-review-canary.md` (10–15 lines) satisfies "a plan to assure the change was implemented" beyond tests.

### 7.3 What this stage's report should contain (so the next stage has evidence)

- Before/after file counts for a sampled real branch (git numstat with and without filtering).
- Link to or copy of the new predicate + assembly filter (files changed).
- Test evidence: `npm run test:unit` output snippet or CI URL showing unit + integration green.
- Canary review evidence: screenshots or a written attestation from the post-merge canary (per Q6 — both automated + manual gates required).
- Note the open badge-scope question and its deferred status, so it is not mistaken for forgotten work.

---

## 8. Implementation sequence (ordered, big pieces and research first)

Each step must keep `npm run test:unit` green before proceeding to the next. Steps are small enough to be one commit each.

| Order | Step | Touch points | Evidence this step is done |
|---|---|---|---|
| **R1** | **Research spike** (§3 E0.1): confirm custom `docsDirName` coverage, measure task-file proportion on 2–3 real branches, re-read existing preservation tests and list what is already covered. Write findings as a short note (appendix here or `docs/research/pr-review-task-filter-spike.md`). No code. | Docs only | Note committed; proportion numbers captured for the PR description. |
| **R2** | **Extract `isTaskFilePath` predicate + pure tests** (§3 E0.2). Pure helper, no call sites yet, fully tested in isolation. | `api/work/isTaskFilePath.js`, `api/work/isTaskFilePath.test.js` (or `api/docsPath*`) | `npm run test:unit` green, new file passes lint + one-function-per-file checks. |
| **R3** | **Widen review-assembly seams for injection** (§3 E0.3): thread `docsTasksPrefix` / `filterFiles` through `buildTaskReview` → `buildPreservedReview` → `loadDiffSection` (or add post-`loadDiffSection` filter seam — recommended simpler shape: filter after load, thread only the prefix). Add one wiring test proving an injected synthetic filter can remove a file. No production filtering yet. | `api/reviewAssembly.js`, `api/reviewAssembly.test.js` (mock seam) | Seam test green, existing behaviour unchanged. |
| **R4** | **Wire the real filter in `api/reviewAssembly.js`** (§4.1): import `docsTasksIgnorePath` + `isTaskFilePath`, filter `frozen.files`, `live.files` (both preserved and non-preserved paths), handle `oldPath`. Counts/commits unaffected. | `api/reviewAssembly.js` | Unit tests green; new filtered-assembly tests that were todo now pass. |
| **R5** | **Unit tests for the filtered review** (§6.1): live, preserved, preserved+newSinceMerge, custom `docsDirName`, all-task-files → empty, comment validation 400 on filtered path. | `api/reviewAssembly.test.js`, `api/routes/review.test.js` (or existing route test file) | `npm run test:unit` green with the new assertions. |
| **R6** | **Integration tests for post-merge accuracy** (§6.2, §5.2 A–E): real temp repos asserting non-empty preserved payload without task-dir rows, fail-back → fix → re-merge with filtering, shallow/GC fallback, deleted branch, file-count agreement with raw git. | `api/reviewAssembly.integration.test.js` (or new `api/prReviewPostMerge.integration.test.js`) | Integration suite green. This is the "double-check accurate after merge" proof. |
| **R7** | **Frontend: empty-state polish + Reports-tab regression coverage** (§4.3, §6.3). Optionally add `filteredTaskFilesCount`/`filterNote` to the payload and the empty-state conditional; otherwise just cover the rendering with tests. | `api/reviewAssembly.js` (hint field, if opted in), `frontend/src/components/tasks/TaskReviewPage.jsx`, `frontend/src/components/tasks/TaskReviewPage.test.jsx` | Frontend tests green; no visual regression in `canary-e2e/tests/pr-review.spec.js`. |
| **R8** | **Docs + canary runbook** (§7.2, §5.4): update code-adjacent doc blocks, operator docs, and add the canary checklist. | `api/reviewAssembly.js` header, `docs/` pages, `docs/manual-testing/pr-review-canary.md` (new) | Docs mention the filter; runbook exists. |
| **R9** | **Final verification pass** (§6.4): run `npm run test:unit`, lint, one-function checks, and perform one real canary review (merge a real task branch with code + task-dir churn and confirm the post-merge review). Collect before/after counts + screenshots for the stage report. | Repo-wide | Canary evidence + test output attached to the stage report; ready for review. |

Big research (R1–R2) comes before any wiring, per the stage instructions. Steps R4 (the filter) and R6 (post-merge accuracy proofs) are the two core fixes from the task statement; R5/R6 together satisfy "double check that PR reviews are accurate including for after a merge." R9 is the combined "assure the change was implemented" gate (automated + manual canary per survey Q6).

---

## 9. Risks and mitigations specific to this change

| Risk | Why it matters | Mitigation |
|---|---|---|
| Hard-coded `docs/tasks/` misses custom `docsDirName` projects. | Those projects would silently retain task-dir rows in reviews — the fix would appear to work in default-named repos only. | Derive the prefix from `resolveDocsDirName(project)` / `docsTasksIgnorePath(project)` in every filter site (exactly one source). Integration test includes a custom-prefix variant. |
| Filtering the wrong section (e.g. only live, not frozen, or only primary but not `newSinceMerge`). | Post-merge reviews render two independent file lists. Filtering one leaves task files visible in the other — a partial fix that is hard to notice in unit tests but obvious to users. | Unit tests cover all three assembly paths explicitly (live, preserved primary, preserved newSinceMerge). No filtering lives in `reviewDiff.js` — only in assembly, where both sections are visible. |
| Comment threads anchored to a file that is now filtered. | Existing review comments on a task-dir file could become unresolvable if the "existing threads stay valid" allowance in `routes/review.js` is broken. | Route code already allows comments whose `filePath` matches an existing thread (`sidecar.comments`) or a report path. Verify with a test that deleting or replying to a pre-filter comment still works after the filter lands. |
| Frontmatter task-dir churn masquerading as code (e.g. `docs/tasks/<id>/task.md` edited by the engine each stage). | This is the most common task file change today — it would be the single largest contributor to "PR review mostly shows task file changes." Confirm this hypothesis in R1 so the plan's narrative matches reality. | R1 measurement; the filter handles it since the predicate is prefix-based, not filename-specific. No special casing needed. |
| Badge totals diverge from Files Changed after filtering. | If badges sum task-dir additions/deletions but Files Changed hides them, the count headline and the list disagree — a new confusion replacing the old one. | Explicitly defer badge-scope change this pass (see §3 E0.1 / §7.3 report note). Keep the badge's current measurement so disagreement is documented as known and intentional for now. Follow-up ticket if needed. |
| Post-merge empty review misdiagnosed as "still filtered". | After filtering, a branch that *only* changed task files legitimately has 0 reviewable files — this must read as "no reviewable changes" (expected), not "preservation broke" (bug). | Test case §5.2 A covers this. Preserve-note and deleted-branch cases also tested under filtering. The two empty states (filtered-empty vs unborn-repo/missing-branch empty) have distinct reasons. |
| Long-lived preview server anti-pattern in verification. | The Testing & Verification Guidance forbids long-lived background servers for visual checks. | Use `npm run test:unit` / mock fixtures / headless screenshot tool or the real canary merge's screenshots — no `npm run dev` preview server. |

---

## 10. Open (intentionally undecided) items

1. **Badge totals scope** — whether `api/work/taskDiffStat.js:getTaskDiffStat` and `api/work/taskDiffStat.js:getCommitRangeDiffStat` should also exclude task-dir rows. Deferred this pass (see §3 E0.1); defaults to "leave as is" unless the canary exposes a confusing badge/File Changed mismatch, in which case the predicate reuse makes the follow-up one-line.

2. **`filteredTaskFilesCount` hint in the review payload** — low-risk polish (one integer + one conditional in the empty state). Recommended but not required for stage pass. If time is tight, skip and keep the current empty-state copy.

No other open decisions; the rest is specified above.

---

## 11. Success evidence for this stage (KainBain gate)

This stage passes when:

- This plan exists at `docs/tasks/0c4d4149-b055-4314-8f36-2a50a85e1259/IMPLEMENTATION_PLAN.md` and contains sections 0–10 plus this §11.
- Plan reflects all six survey answers (everything under `docs/tasks/<id>`, hide completely, Reports tab only, always, merged-emptiness as top risk, automated + canary verification).
- Plan orders big pieces and research first (R1/R2 before wiring) per the stage instruction, includes a testing plan (`npm run test:unit` primary gate + no long-lived servers) and a documentation plan, and explicitly addresses post-merge accuracy with a checklist covering the five sub-cases (empty after merge, stale files, section mixing, file counts, shallow/deleted fallbacks).
- Plan follows "make change easy then make the change" (E0 predicate + seam widening before E1 feature wiring).
- No unrelated files changed.

KAINBAIN_VERDICT: PASS
