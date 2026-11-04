# Triage note — task images randomly not loading (2026-11-04)

Plan: `IMPLEMENTATION_PLAN.md` phases 1–2. Method: headless only — `app.inject`
suites, jsdom component tests, `git` forensics on `docs/tasks/`, no live servers.
Lifecycle doc: `docs/task-images.md`.

## Reproduction matrix (phase 1)

Surfaces checked: goal/description markdown (`TaskGoalSection` preview,
`TaskReviewPage` goal, `SurveyTaskPanel`), attach-strip thumbnails
(`TaskImageAttach`), explorer markdown/file preview (`FilePreview`), failure
messages (`FailureMessage`), survey illustrations (`SurveyPage`). Task
board/cards render no images (`TaskCard.jsx` has no `<img>`), so that row is N/A.

| # | Surface + trigger | `<img src>` rendered | Endpoint status | Bytes on disk | Bucket |
|---|---|---|---|---|---|
| 1 | Goal markdown, cold load, ref without bytes (22 task.md refs, e.g. `assets/18742.png`) | `/projects/:id/tasks/:taskId/images/18742.png` (correct shape) | 404 `image-not-found` | absent (disk + all git refs) | (b) |
| 2 | Goal markdown, any load, branch-stranded ref (`b15f4ec4/assets/18743.png`, `dc5ba91d/assets/18741.png`) | correct shape | 404 on main/other checkouts, 200 on own task branch | on own `kb/<id>` tip only | (b) |
| 3 | Any surface during branch checkout / restart / slow first byte | correct shape | transient 404/500, then 200 | present again | (c) |
| 4 | Same as 3, after the transient ends | correct shape | 200 | present | (c) — UI stays latched on the chip until manual Retry/refresh |
| 5 | Upload on task A, switch to task B mid-upload | ref appended to B's draft | 404 for B (`image-not-found`), orphan bytes in A | bytes in A only | (b) write-side |
| 6 | Non-task surfaces (docs/settings/skills viewers) | bare `assets/...` (legacy pass-through, no task context) | n/a (no task image refs there) | n/a | (a) audited, no fix |

No repro fell outside buckets (a)/(b)/(c). No re-plan needed.

## Field evidence (phase 1, step 2)

- `docs/tasks/*/task.md` audit (37 image refs): 13 OK on disk, 2 on own task
  branch only (`git cat-file -e kb/<id>:…` HIT, 52850 + 245003 bytes), 22
  nowhere in any reachable ref. Zero case/space/dedupe-drift candidates, so the
  serve-side canonicalisation fallback already covers everything it can.
- Same filename referenced by many tasks (`18850.png` in 6 tasks, `18851.png`
  in 5, `image.png` missing in 4) — the cross-task ref/byte mismatch signature.
- `git log --all --diff-filter=A -- '*18744.png'` / `'*18850.png'`: bytes never
  committed anywhere reachable. `18743.png`/`18741.png` were committed to their
  task branches by runner/auto-commit and never merged to main.

## Root causes (phase 2)

- **B-write (recurrence): cross-task upload race.** `TaskImageAttach` reports
  `{name, path}` with no task scope; `TaskGoalSection.insertImagesMarkdown`
  appends to `latestTitleRef` (the CURRENT draft). An upload started on A that
  completes after a switch to B lands B's goal with a ref whose bytes live in
  A. Proven by inspection (`TaskImageAttach.jsx`, `TaskGoalSection.jsx`).
- **B-serve (random/flap): branch checkouts move tracked bytes.** Worktree
  isolation is opt-in (`taskBranches.isWorktreeIsolationEnabled`, default
  shared checkout); the engine checks out task branches in the project cwd on
  stage pickup, and image assets are tracked files. Whatever branch is checked
  out decides which tasks' images 404 — matches "random + after time/refresh".
  Structural git-level fix is out of scope (live-ops risk); phase 4 makes the
  client survive the flap instead of latching.
- **C-latch (permanent chip):** `MdImage` auto-retries once then latches;
  `TaskImageThumb`/`FailureMessageImage` latch until manual Retry;
  `FilePreview` image errors latch with NO retry; `SurveyPage` illustrations
  are bare `<img>` with no fallback at all. Any transient from B-serve becomes
  permanent within the session.
- **C-cache:** image-endpoint error responses (404/400/403/500) set no
  `Cache-Control`, so intermediaries may pin a transient 404.
- **A-context (audited, no change):** every task-image renderer passes
  `projectId`/`taskId`; late context self-heals via src-keyed remounts
  (`MdImage` key includes src; thumbs keyed by parent/url). Legacy bare-`assets`
  pass-through retained for non-task surfaces only.

## Repair verdict (phase 5 input)

- On-disk drift backfill: nothing to do (0 candidates; canonicalisation covers it).
- Branch-stranded bytes (2 refs): recoverable with
  `git show kb/<taskId>:docs/tasks/<taskId>/assets/<name>` — documented manual
  procedure only. NO automatic backfill script: materialising files into the
  live tree would be committed to the wrong branch by the next auto-commit and
  removed again by the next checkout; the flap is structural.
- Bytes-nowhere refs (23 distinct): unrepairable; honest filename-visible chips
  (already rendered) + lifecycle doc.

## Decision

Proceed to phases 3–4 on the proven causes above (no guess-fix): `no-store` on
image errors, bounded-retry + visibility/online revalidation seam shared by all
renderers with failure observability, cross-task upload scoping, SurveyPage +
FilePreview fallbacks. Then phase 5 docs + gates.
