# RESPONSE — "PR view is blank for all MRs" (task 278cd8c8-6d84-44df-b63d-9363b07d933f)

**Stage:** docs-only analysis. This file proposes follow-up solutions for review
by another agent and a human before anything is created in prod. No code was
changed in this stage.

**Inputs:** bug screenshot (`assets/image.png`), `SURVEY.md` (round-1 answers),
`WIDE_NET_ANALYSIS.md` (5 candidate causes), `GUIDE-cause1..5-*.md`,
`REPLICATION_GUIDES.md`, `PROD_VERIFICATION.md`, plus a fresh read of the
review pipeline in this repo (all file:line references below were re-verified
against the code in this branch).

---

## 1. What the bug is (confirmed reading of the evidence)

The review page renders a **successfully loaded but server-side empty**
payload, not an error and not a render bug:

- Screenshot shows `kb/64fb8fbb-… → main`, **`↑0 ↓0`**, an
  `UNCOMMITTED CHANGES ELSEWHERE` badge, REPORTS (5) populated, and the FILES
  CHANGED tab showing the **default** empty-state text
  `"Nothing to review yet — the agent has not modified any files."`
  (`frontend/src/components/tasks/TaskReviewPage.jsx:442` — the
  `filteredTaskFilesCount === 0` variant at `:438-446`).
- That means `GET /projects/:p/tasks/:t/review` returned 200 with
  `files: []`, `reason: null`, `filteredTaskFilesCount: 0`, `aheadBy: 0`,
  `behindBy: 0`. Survey q10 ("Reload still blank") and the unselected
  "API returns files but UI still empty" option corroborate: **the diff is
  computed empty on the server**.

### Root-cause ranking (from WIDE_NET_ANALYSIS, re-verified in code)

| Rank | Cause | Verdict | Key code evidence (re-verified) |
|---|---|---|---|
| **1 (primary)** | Review diff reads **local refs only and never fetches**; agent stages run on Runners (default `runnerExecutionOnly`, `api/flow/execution/executeStage.js:227-251`) and push to `origin`, so the local `kb/<task>` ref can sit at the base tip while the real commits are on `origin/kb/<task>` | **Primary driver of the screenshot signature** | `grep` for fetch in `api/reviewAssembly.js`, `api/routes/review.js:172-200`, `api/reviewDiff.js`, `api/git/status.js` → none. `branchExists` = local `git rev-parse --verify refs/heads/<branch>` (`api/git/status.js:68-71`). `buildTaskReview` resolves head via local `resolveSha` and diffs local refs (`api/reviewAssembly.js:300,447-465`). Human-checkpoint `ensureTaskBranchRef` is **create-only from the pipeline base tip** and never syncs an existing ref (`api/work/taskBranches.js:651-780`); only the work-pickup path `ensureTaskBranch` calls `syncTaskBranchToRemoteBestEffort` (`:604`). Runner pushes `branch:branch` to origin (`runner/gitOps.js` `commitAndPush`) from a worktree based on `origin/<branch>` (`runner/project.js:900` `refreshWorktreeToRemote`). The merge path does fetch (`syncBranchWithUpstream`, `api/git/merge.js:193` does `git fetch` + compare-and-swap fast-forward of the local ref when not checked out) — the review path has no equivalent. |
| 2 | Pipeline **base/destination** branch mismatch: three-dot diff empty because base absorbed head (2a), or `resolveReviewBase` **silently falls back to the repo default** when the preferred base has no *local* ref (2b) — this is the "different pipeline destinations" hypothesis | Plausible contributor, esp. on custom-base pipelines | `resolveReviewBase` (`api/reviewAssembly.js:90-112`) checks `branchExists` (local-only) and falls through to `defaultBranch` with no warning. Base resolution order pinned `task.baseBranch` → `workflow.baseBranch` → repo default (`api/work/taskBaseBranch.js` `resolveTaskBaseBranch`). `ensureBaseBranchExists` (`api/work/taskBaseBranch.js:92`) *does* fetch/adopt `origin/<base>` when creating, but `resolveReviewBase` itself never fetches. |
| 3 | `filterTaskFiles` strips `docs/tasks/**`, so **docs-only/no-code stages render a blank Files Changed by design** | Real but secondary — explains only the docs-only subset (survey q5/q8), and produces the *hidden-count hint*, not the screenshot's default text | `filterTaskFiles` (`api/reviewAssembly.js:154-170`), `docsTasksIgnorePath` (`api/docsPath.js`), `isTaskFilePath` (`api/work/isTaskFilePath.js`); UI hint at `TaskReviewPage.jsx:440-446`. Verified live: `git diff --name-status main...HEAD` on this very branch lists only `docs/tasks/…` paths. |
| 4 | Preserved-diff baseline frozen/empty/unresolvable after merge (opt-in `preserveReviewDiffAfterMerge`) | Only post-merge MRs in opted-in projects; the screenshot shows no preserve notice, so not the pictured MR | `buildPreservedReview` (`api/reviewAssembly.js:172`), baseline recorded at `api/flow/commandStages.js`, `isReviewDiffPreserved`/`isValidReviewBaseline` (`api/work/taskBranches.js`). Interacts with cause 1: baseline SHAs that exist only on the remote won't resolve locally because nothing fetches. |
| 5 | Frontend payload scoping in `useReview`/`TaskReviewPage` | **Ruled out by the screenshot** (payload rendered fine, `files: []` came from the server; q10's UI-blank option not selected). Keep only as a fallback if S0 ever shows a populated payload with a blank UI. | `TaskReviewPage.jsx:118` `hasReviewFiles`, `frontend/src/services/watch/index.js` `getTaskReview`, `useReview.js`. |

---

## 2. How to confirm the bug

### 2a. Safe local confirmation (no prod, no agents — already executed once; re-runnable)

The git-mechanics repro in `GUIDE-cause1-stale-local-refs-no-fetch.md` was
executed on this machine and produced the exact screenshot signature:

- temp bare `origin.git` + `backend` clone + `runner` clone;
- backend creates local `kb/task-1` at the base tip (what
  `ensureTaskBranchRef` does — create-only);
- runner commits `src.js` and pushes `kb/task-1` (what the Runner's
  `commitAndPush` does);
- backend (no fetch, like the review path): `git diff main...kb/task-1` →
  **empty**, `git rev-list --left-right --count main...kb/task-1` → **`0 0`**,
  while `git ls-remote origin refs/heads/kb/task-1` shows the agent commit;
- after `git fetch origin`: `git diff main...origin/kb/task-1` → `A src.js`,
  counts `0 1`.

Re-run any time with `mktemp -d` repos only (commands in
`GUIDE-cause1-*.md` / `GUIDE-cause2-*.md`); nothing outside `/tmp` is touched.
The vitest TDD examples in the guides (`api/reviewAssembly.staleRefs.integration.test.js`
pattern, built on the temp-repo helpers of
`api/reviewAssembly.integration.test.js`) demonstrate the bug at the
`buildTaskReview` level: with a stale local ref, `review.files` is `[]`,
`aheadBy` 0, while `ls-remote` diverges.

### 2b. Read-only prod confirmation (PERMISSION REQUIRED — do not run without explicit user approval)

Full command set in `PROD_VERIFICATION.md`. Summary decision tree for one
blank-review MR (`PID`, `TID`, project `cwd` from `.kainbain/project.json`):

```text
1. curl "$KB_API/projects/$PID/tasks/$TID/review?projectId=$PID" | jq '{files, aheadBy, behindBy, reason, filteredTaskFilesCount, preserved, preserveNote}'
2. cd "$PROJECT_CWD"
   local  = git rev-parse refs/heads/kb/<TID-branch>          # read-only
   remote = git ls-remote origin refs/heads/kb/<TID-branch>    # read-only, no local mutation
3. Interpret:
   files:[] + aheadBy:0 + filteredTaskFilesCount:0
     ├─ local != remote                → CAUSE 1 confirmed (stale local ref, no fetch)
     ├─ local == remote, base contains head (merge-base --is-contains in a throwaway clone) → CAUSE 2a
     └─ pipeline base missing locally (resolveReviewBase silent fallback)                    → CAUSE 2b
   files:[] + filteredTaskFilesCount>0  → CAUSE 3 (docs-only, by design)
   preserved:true/preserveNote + unresolvable baseline SHAs (git cat-file -e) → CAUSE 4 (× cause 1 if SHAs remote-only)
   files:[...] but UI blank             → CAUSE 5 (frontend) — only then
```

Also confirm the stage ran on a Runner (not embedded): task history /
`task.md` `# History` shows `deferred: "runner-dispatch"`
(`api/flow/execution/executeStage.js:242-251`); sessions live in the Runner's
per-task worktree, not in `<cwd>/.kainbain/sessions/`. Service logs
(`docker compose logs backend | grep review`) should show the review GETs
returning 200 — consistent with an empty payload, not a crash.

**Do not** run `git fetch` inside the prod `project.cwd`, create tasks,
dispatch stages, or approve/merge. The one end-to-end scenario (real agent
stage on a scratch/staging project) is `PROD_VERIFICATION.md` §5 and needs
explicit permission.

---

## 3. Follow-up solutions

All items are independent work units unless a dependency is stated. S0 is a
**verification gate** (blocks prod rollout decisions, not code writing).
S1 and S4 touch the same file (`api/reviewAssembly.js`) and must be sequenced.

### S0 — Confirm which causes fire on real affected MRs (verification gate)

- **Goal:** run the §2b read-only checks on 2–3 blank-review MRs across the
  affected projects; record per-MR: payload shape, local vs `ls-remote` task
  ref, effective base (`task.baseBranch` / workflow `baseBranch` / repo
  default), local vs remote base ref, preserve flag + baseline SHA
  resolvability.
- **Files:** none (uses `PROD_VERIFICATION.md`). **Permission:** required,
  read-only only.
- **Done when:** the §2b decision tree maps each sampled MR to a cause, and
  the result is appended to `PROD_VERIFICATION.md` (or a new
  `PROD_VERIFICATION_RESULTS.md` in this folder). Expected outcome per the
  evidence: cause 1 on runner-executed MRs; cause 3 on docs-only MRs; cause
  2b/2a if any pipeline has a custom destination.
- **Parallel:** yes — pure investigation, no code. **Blocks:** prod rollout of
  S1/S2 (confirm scope first), but not their implementation.

### S1 — Make the review path remote-aware (fixes cause 1; primary fix)

- **Goal:** `buildTaskReview` must see Runner-pushed commits that exist only
  on `origin`.
- **Files:** `api/reviewAssembly.js` (`buildTaskReview`, ~`:447-465` where
  `baseSha`/`headSha` are resolved and `loadDiffSection` runs), optionally
  `api/routes/review.js:185` as the call-site seam. Reuse existing machinery —
  do not invent a new fetch: `syncBranchWithUpstream` (`api/git/merge.js:193`)
  already does `git fetch origin` + compare-and-swap fast-forward of the local
  ref when the branch is **not** checked out, and never throws.
- **Design constraint (important for review):** the shared worktree may be on
  another task's branch (the screenshot's `UNCOMMITTED CHANGES ELSEWHERE`
  badge) and the D2 snapshot-commit logic must stay local-only. Therefore the
  preferred fix is **read-only w.r.t. local refs and the working tree**:
  best-effort `git fetch origin` (updates remote-tracking refs only), then
  resolve `head = origin/<taskBranch>` and use it as the diff head whenever it
  is ahead of (or diverged from) the local `refs/heads/<taskBranch>`; keep the
  local ref for `headSha` anchoring or record both. Only if that is rejected,
  the alternative is calling `syncTaskBranchToRemoteBestEffort` from the
  human-checkpoint entry (`api/flow/execution/executeStage.js:400` →
  `ensureTaskBranchRef`), mirroring what `ensureTaskBranch` already does at
  `:604` — but note that mutates the local ref, so the review route should
  still not assume it ran.
- **Tests (TDD first):** the example in `GUIDE-cause1-stale-local-refs-no-fetch.md`
  → new `api/reviewAssembly.staleRefs.integration.test.js`: bare origin +
  backend clone + runner clone; assert that after the fix
  `review.files` contains `src.js` and `aheadBy === 1` even though the local
  ref is at the base tip. Run existing `api/reviewAssembly.integration.test.js`
  to catch regressions (esp. the D2 snapshot and preserved-diff tests).
- **Confirm fixed:** (local) the new integration test passes and the
  pre-fix assertion (`files: []`, `aheadBy: 0`) now fails; (prod, read-only
  before/after with permission) the §2b payload for an affected MR shows
  `files` populated and `aheadBy > 0` while `ls-remote` is unchanged.
- **Parallel:** yes with S2, S3, S5. **Blocks:** S4 (same file — sequence after
  S1) and the prod rollout decision (wait for S0).

### S2 — Fix base/destination resolution in the review path (fixes cause 2; the "different pipeline destinations" hypothesis)

- **Goal:** the review must diff against the pipeline's *intended*
  destination branch, fetched, and must not silently swap bases.
- **Files:** `api/reviewAssembly.js` `resolveReviewBase` (`:90-112`);
  `api/work/taskBaseBranch.js` (`resolveTaskBaseBranch`, `ensureBaseBranchExists`).
- **Change:** (2b) when the preferred base has no *local* ref, try
  `origin/<base>` after a best-effort fetch (mirroring `ensureBaseBranchExists`
  adoption at `api/work/taskBaseBranch.js:145-160`) instead of silently falling
  back to the repo default; if still missing, keep the fallback but add a
  payload field (e.g. `baseFallback: true` + `intendedBase`) so the UI/log can
  surface it. (2a) when the resolved base already contains the head
  (`merge-base --is-contains`), the three-dot diff is legitimately empty — add
  an explicit `reason` (e.g. "task branch is already contained in the base
  branch '<base>'") so the UI shows a real explanation instead of "Nothing to
  review yet". Also ensure the **base** ref is fresh: fetch + consider
  `origin/<base>` when it is ahead of the local base ref.
- **Tests:** extend `api/reviewAssembly.integration.test.js` with the 2a/2b
  cases from `GUIDE-cause2-base-branch-mismatch.md` (temp-repo; the 2a case is
  partly covered by the existing "empty live diff after merge" test — run
  `cd api && npx vitest run reviewAssembly.integration.test.js`).
- **Confirm fixed:** new tests pass; prod §2b §3 checks show the header base
  equals the pipeline destination and no silent fallback occurs for MRs whose
  base exists on origin.
- **Parallel:** yes with S1 (different functions, but note both touch
  `reviewAssembly.js` — coordinate so S1 lands first or merge carefully), S3, S5.

### S3 — Surface hidden task files for docs-only MRs (cause 3; UX-only, by-design blank)

- **Goal:** docs-only / no-code stages should not *look* like the agent did
  nothing.
- **Files:** `frontend/src/components/tasks/TaskReviewPage.jsx` (empty-state
  block `:434-482`); payload already carries `filteredTaskFilesCount` and
  REPORTS.
- **Change:** when `filteredTaskFilesCount > 0`, make the hint prominent
  (e.g. "N task file(s) hidden from this view — see REPORTS") and/or add a
  "show task files" toggle that renders the filtered rows. No API change.
- **Tests:** frontend vitest (`npm run test --prefix frontend -- TaskReviewPage`)
  with a mocked payload where `files: []`, `filteredTaskFilesCount: 2`,
  `reports` populated → assert the hint renders and the default "Nothing to
  review yet" text does not.
- **Confirm fixed:** on this very branch (whose diff is only
  `docs/tasks/278cd8c8-…/` files) the review page shows the hidden-count hint
  instead of the bare empty state.
- **Parallel:** fully independent (frontend only).

### S4 — Harden the preserved-diff baseline path (cause 4; depends on S1)

- **Goal:** post-merge preserved reviews must not go blank when baseline SHAs
  exist only on the remote, and must say why when they fall back.
- **Files:** `api/reviewAssembly.js` `buildPreservedReview` (`:172-286`) —
  **same file as S1: implement after S1 lands.**
- **Change:** before declaring `frozen = null`, attempt the same best-effort
  fetch as S1 so remote-only baseline SHAs resolve; keep the live-diff
  fallback with `preserveNote`, and add the note text for the
  unresolvable-SHA case. Existing coverage in
  `api/reviewAssembly.integration.test.js` (shallow/GC fallback, deleted
  branch, `newSinceMerge`) must keep passing.
- **Tests:** add the cause-4 × cause-1 case from `GUIDE-cause4-preserved-baseline.md`
  (baseline SHAs remote-only + stale local ref).
- **Confirm fixed:** new test passes; prod §2b §4 (`git cat-file -e` on
  baseline SHAs) shows resolution after the S1 fetch.
- **Parallel:** only after S1 (blocking order: S1 → S4).

### S5 — Frontend payload sanity test (cause 5; fallback only — currently ruled out)

- **Goal:** prove the UI renders files whenever the payload has them, so a
  future "payload populated but UI blank" report is instantly classifiable.
- **Files:** new `frontend/src/components/tasks/TaskReviewPage.payload.integration.test.jsx`
  (example in `GUIDE-cause5-frontend-scoping.md`); no production frontend change
  unless S0 ever shows a populated payload with a blank UI.
- **Confirm:** test passes; the §2b API check is the discriminator
  (`files: []` → server causes 1/2/4; `files: [...]` → cause 5).
- **Parallel:** yes, independent.

---

## 4. Blocking order / parallelism summary

```text
S0 (prod read-only confirmation, PERMISSION REQUIRED) ── gates prod rollout only
S1 (review path remote-aware; api/reviewAssembly.js) ──┐
S2 (base/destination resolution; reviewAssembly.js + taskBaseBranch.js) ─┼─ can be
S3 (frontend hidden-task-files hint; TaskReviewPage.jsx) ────────────────┤  coded in
S5 (frontend payload test; new test file) ───────────────────────────────┘  parallel
S4 (preserved baseline hardening; api/reviewAssembly.js) — AFTER S1 (same file)
```

- **Recommended sequence:** S0 first (with permission) to size the blast
  radius → S1 + S2 + S3 + S5 in parallel code stages → S4 after S1 → prod
  verification per §2b on the same MRs sampled in S0 (payload must flip from
  `files: [] / aheadBy: 0` to populated, with `ls-remote` unchanged).
- **Safety notes for prod rollout:** any fetch in the backend checkout mutates
  remote-tracking refs (and S1's preferred design additionally reads
  `origin/<branch>` without moving local refs). `syncBranchWithUpstream`
  never touches the working tree when the task branch is not checked out, and
  never force-updates diverged refs — reuse it rather than hand-rolling
  fetch/update-ref. Keep the D2 snapshot-commit path local-only. No fix here
  requires agent invocation; the end-to-end repro stays permission-gated
  (`PROD_VERIFICATION.md` §5).

## 5. Assumptions and open questions

- Assumed agent stages execute on remote Runners by default
  (`config.runnerExecutionOnly !== false`, `executeStage.js:242`); S0 should
  confirm per project via task history `deferred: "runner-dispatch"`. If some
  affected project runs embedded, its blank MRs need a different look — but
  the screenshot's `↑0 ↓0` + `UNCOMMITTED CHANGES ELSEWHERE` still fits cause 1
  (create-only local ref at base tip) or cause 2.
- Survey q3 was "I don't know" on custom bases — S0/S2 settle whether cause 2
  fires on any real pipeline ("different pipeline destinations").
- Cause 3 is intended behaviour for docs-only stages; S3 is a UX improvement,
  not a correctness fix.
- Cause 5 is ruled out by current evidence; S5 is insurance only.
