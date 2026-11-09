# Implementation Plan — Develop alongside KainBain (guide + enabling changes)

Source: the stage task text ("Develop a guide for how to develop alongside
kainbain": 1) make product changes so users can do that, 2) write a site-docs
guide) and `SURVEY.md` (grill-me questionnaire, round 1, 2026-11-09).
This document is the plan only — no code changes are made at this stage.

Related prior work:
- Task controls: `api/flow/taskControl.js` (`abortTask`, `rejectTask`),
  `api/taskStore.js` (`pauseTask`, `resumeTask`, `steerTask`),
  `api/flow/taskFlowRoutes.js` (`POST /tasks/:id/pause|resume|abort|steer`),
  `site-docs/api-reference.md` (endpoint table), `site-docs/pipeline-stages.md`
  (task statuses incl. `paused`, `waiting_human`).
- Human intervention points: `site-docs/review-gates.md` (approve / reject
  with feedback / re-route, comment carry-over into `# Human approval` /
  `# Human rejection` reports), `site-docs/editing-tasks.md` (goal drafts,
  last-writer-wins saves), `site-docs/submit-track-task.md` (order 40).
- Isolation model: `api/work/taskBranches.js` (branch mode `kb/<id>`),
  `api/git/branch.js`, `api/projectStore.js` (`workspaceIsolation:
  'quarantine' default | 'worktree' opt-in | 'off'`),
  `api/gitWorkspaceIsolation.integration.test.js`,
  `site-docs/adr/0006-git-workspace-isolation.md`,
  `site-docs/red-shared-gate.md` (worktree recommendation for shared checkouts).
- Git safety: `api/git/workingTreeStatus.js`, `api/git/staleLock.js`,
  `api/work/gitLock.js`, `site-docs/git-index-lock-runbook.md` (order 65),
  `docs/GitGuidance.md`, `docs/git-branch-support.md`.
- Site-docs authoring contract: `site-docs/README.md` (frontmatter, section,
  unique order, `#/docs/<slug>` cross-links, no secrets — served
  unauthenticated), `api/routes/docs.test.js`,
  `api/routes/docs.apiCoverage.test.js`, `scripts/check-doc-links.mjs`,
  `scripts/check-jsdoc-example.mjs`, `npm run docs:check`.

---

## 0. Survey status and proposed defaults (needs confirmation)

The grill-me survey (`SURVEY.md`) was generated but **not answered**
(`"answers": {}`). The cited idea file
(`idea-20261109-175922.md`) is also **absent** from the task directory (only
`SURVEY.md` is present) — the task statement text is therefore the
authoritative source, and the survey questions below are answered here as
*proposed defaults* for the implementer (or a human) to confirm before
building. If confirmed answers arrive later, they override this section.

| Survey question | Proposed default | Rationale |
|---|---|---|
| Q1 — What does "working alongside" mean? | **All three, ranked:** (a) pause/stop, edit, resume as the primary documented flow; (b) separate branch as the advanced flow; (c) same-files-while-running explicitly discouraged. | Pause/resume/abort endpoints already exist; same-file concurrent editing fights the single-queue engine and git guards, so the guide must steer users away from it. |
| Q2 — Kinds of hand-made changes to cover | **All four:** quick fixes, bigger features on a separate branch, settings/setup changes, project docs. | Each maps to a distinct safe flow (quick fix → pause+edit; feature → separate branch + merge; settings → engine-state vs repo-config split; docs → which docs tree is safe). |
| Q3 — Same-file conflict behaviour | **Warn so nothing gets lost, let the user choose (recommended).** | Matches existing review-gate philosophy ("nothing advances past you silently"). Never silent overwrite in either direction. |
| Q4 — Product changes besides the guide | **Minimal, research-gated:** (1) confirm pause/edit/resume actually round-trips cleanly and fix gaps; (2) make "where is the task working" (branch/worktree path) visible so devs know what to touch and what to avoid; (3) only if cheap: a dirty-worktree guard message that names the conflicting path. No new "wait button" UI widget unless research shows pause is insufficient. | Avoid building a parallel control surface when pause/resume/abort + steer already exist. |
| Q5 — Audience | **Both — simple steps first, technical detail after.** | Matches "If you are a developer you may want to tweak things" while keeping the guide usable from the UI alone. |
| Q6 — Length | **Medium — a few pages with examples.** One site-docs article plus short subsections; detailed walkthrough material goes in code-adjacent runbooks, not the article. | Site-docs rule: keep articles small and task-focused. |

Survey confirmation (received during implementation, 2026-11-09 —
`SURVEY.md` now carries answers): Q1 selects separate-branch as the primary
flow (guide reordered: Flow A separate branch, Flow B pause-edit-resume);
Q2 confirms all four change kinds; Q3 "smart merge / fail a merge stage" is
satisfied by the existing auto-abort merge + `GitMergeConflictError`
fail-the-stage behaviour, documented, no new machinery; Q4 "create branch
button" recorded as a follow-up (covered by task-branch ownership + `Copy
Checkout` + `workingLocation`); Q5/Q6 match the defaults.

Implications carried through the rest of the plan:
- The guide documents the separate-branch flow as primary (per confirmed
  Q1) with pause-edit-resume second; concurrent same-file editing is
  documented as unsupported with a stated reason, not a supported flow
  with merge magic.
- Product work is scoped to *enabling and de-risking* the documented flows,
  not to building concurrent-editing machinery (no merge UI, no file locking
  service, no new scheduler).
- If the survey is later answered differently (e.g. "my hand-made changes
  always win"), §4 and §5 must be re-scoped before implementation — the
  conflict-behaviour answer changes both code and guide.

---

## 1. Goals and non-goals

### 1.1 Goals (acceptance-criteria mapping)

| # | Criterion | Plan section |
|---|---|---|
| G1 | **A developer can safely make hand edits to a KainBain-managed project.** Pause/edit/resume round-trips cleanly; the developer knows which branch/worktree the task uses and which files are safe to touch. | §4 |
| G2 | **A site-docs guide exists that teaches the flows.** Covers quick fixes, separate-branch features, settings/setup changes, and docs edits, with simple steps first and technical detail after. Passes `npm run docs:check`. | §5 |
| G3 | **Nothing gets silently lost.** Concurrent same-file edits either warn or are structurally avoided (separate branch); no silent overwrite in either direction on the documented flows. | §4, §6 |
| G4 | **Change is verifiable.** Automated tests cover new/changed behaviour; a manual alongside-edit walkthrough procedure exists as the human gate. | §6, §7 |

### 1.2 Non-goals

- Real-time collaborative editing, merge UIs, or file-level locking services.
- A new scheduler, queue model, or execution mode (the single global execution
  queue stays as-is).
- A new "wait button" UI widget if the existing pause/resume controls suffice
  (research in R1 decides; default is no new widget).
- Rewriting existing guides (`submit-track-task`, `review-gates`,
  `existing-projects`, `git-index-lock-runbook`) — the new article links to
  them instead (site-docs no-stub rule).
- Bulk backfill of "where is it working" metadata for historical tasks.

---

## 2. Key domain definitions (settle early)

### 2.1 Where KainBain works (the thing the developer must understand)

- **Branch mode:** each task works on its own branch (`kb/<taskId>`), merged
  back per the pipeline. The developer's checkout of `main` is *not* where
  the agent writes — the guide must make this the first mental model.
- **`workspaceIsolation`:** `quarantine` (default), `worktree` (opt-in
  per-task `git worktree`), or `off` (shared checkout — highest conflict
  risk; `red-shared-gate.md` already recommends worktree for shared
  checkouts). The alongside story differs per mode; the guide covers all
  three with worktree as the recommended mode for hand-editing.
- **Runner checkouts:** with remote runners, the task may be executing
  out-of-process on another machine entirely (`steerStore` lease model) —
  "the files" may not even be on the developer's disk. The guide must say
  how to tell (task status, runner assignment) and what to do instead
  (steer, pause, or wait for a review gate).

### 2.2 Existing controls the guide builds on (do not duplicate)

- `POST /tasks/:id/pause` → status `paused`; `POST /tasks/:id/resume`;
  `POST /tasks/:id/abort` (resets engine to idle); `POST /tasks/:id/steer`
  (guidance to the live execution). Documented in `api-reference.md`;
  semantics in `api/taskStore.js` + `api/flow/taskControl.js`.
- Review gates: `waiting_human` checkpoints where approve/reject/re-route
  plus line comments already carry human input into the next stage
  (`review-gates.md`). For many "tweaks", the cheapest alongside flow is a
  review comment, not a file edit — the guide says so.
- Git guards: `workingTreeStatus.js` cleanliness checks, `gitLock.js`
  mutual exclusion, `staleLock.js` recovery, `git-index-lock-runbook.md`.

### 2.3 What "conflict" means here

Not a git merge conflict UI — the failure modes are: (a) developer edits a
file the running agent then overwrites (or vice versa); (b) developer edits
land on `main` while the task branch diverges, producing a painful merge;
(c) developer edits inside an active worktree trip the cleanliness guard and
wedge a stage. The plan treats (a) as prevented-by-pause, (b) as
prevented-by-branch-discipline, and (c) as surfaced-by-guard-message.

### 2.4 Terms

- **Hand edit:** any change the developer makes directly (editor, CLI, IDE),
  as opposed to agent-made changes.
- **Alongside flows:** the three documented flows — pause-edit-resume
  (primary), separate-branch feature (advanced), review-gate input (cheapest,
  already exists).
- **Task working location:** the branch (`kb/<id>`) and, where applicable,
  the worktree path the task's current stage is using.

---

## 3. "Make change easy, then make the change"

Before guide writing or feature work, land research and low-risk preparatory
edits so the real change is mechanical.

### Phase E0 — Research + refactoring (no behaviour change)

#### E0.1 — Research spike R1: control-surface truth (short, written up)

1. **Pause/edit/resume round-trip:** read `pauseTask`/`resumeTask` in
   `api/taskStore.js` (+ `kickIfRunnable`) and answer: does pausing a
   `running_agent` task stop the child process or just the scheduler? On
   resume, does the stage re-run from scratch (discarding partial work) or
   continue? What happens to a Runner-held lease (`steerStore`) across
   pause/resume? Record exact semantics — the guide's primary flow depends
   on them.
2. **"Where is it working" visibility:** audit what the API/UI already
   expose per task: branch name, worktree path, runner assignment, live vs
   queued. List the endpoints/fields (`GET /tasks/:id`, task object keys).
   Any gap found here becomes the §4.2 work item; if everything is already
   exposed, §4.2 shrinks to docs-only.
3. **Dirty-tree guard behaviour:** read `workingTreeStatus.js` +
   `workingTreeRecovery.js` and answer: if a developer hand-edits a file in
   the task's worktree mid-run, what does the engine do — fail the stage,
   stash, overwrite, or ignore? Capture the exact error string the operator
   sees today. This decides whether §4.3 needs code or only guide text.
4. **Branch-mode merge story:** read `taskBranches.js` + `api/git/merge.js`
   and answer: how does a task branch merge (squash/merge commit, whose
   tree wins), and what happens if `main` moved (developer's separate-branch
   feature merged first)? This bounds the "separate branch then combine"
   flow in the guide.

Write findings as `docs/research/develop-alongside-spike.md` (or an appendix
note in the task dir). No code.

#### E0.2 — Research spike R2: docs conventions + conflict inventory

1. **Site-docs contract:** re-read `site-docs/README.md` + `api/routes/docs.js`
   and confirm: required frontmatter, unique `order` within section (current
   `working-with` orders include 40, 45, 50, 52, 55, 60, 65, 66, 67, 70 —
   free slots near task workflows include 46–49), `#/docs/<slug>` link
   integrity checks, no-secrets rule. Pick the slug + order now (proposal:
   slug `develop-alongside`, section `working-with`, order `46`, adjacent
   to `submit-track-task` 40 / `task-dependencies` 45).
2. **Conflict inventory:** grep the engine for every place that assumes "only
   the agent writes" (cleanliness guards, snapshot/commit paths, report
   writers, state-file saves) and list them. Each entry is either "already
   safe under pause" (guide cites it) or "needs a guard message" (candidate
   for §4.3). Keep the list to the top ~10 load-bearing sites.
3. **Settings taxonomy:** separate *repo config* (safe to hand-edit with the
   task paused: pipeline files, project settings via UI) from *engine state*
   (never hand-edit: `.kainbain/` state folder, `sessions/`, `worktrees/`,
   `quarantine/`, task markdown state). Confirm against `existing-projects.md`
   and `projectStore.js`. The guide's settings section is built from this
   table.

#### E0.3 — Test-harness preparation (no behaviour change)

- Confirm the alongside walkthrough can be exercised headless: temp-repo +
  `app.inject` HTTP tests are the established pattern (see
  `api/reviewAssembly.integration.test.js`, `api/taskStore.test.js`
  "supports manual intervention: pauseTask, resumeTask, retryStage,
  abortTask"). No new harness should be needed — verify by locating the
  existing pause/resume test helpers and noting their file/line for reuse.
- If §4.2 adds a field to a task payload, add the assertion seam now (a
  test that reads the field and tolerates absence) so the later wiring is a
  pure fill-in. Keep `npm run test:unit` green throughout.

_Phase E0 must keep `npm run test:unit` green. Nothing a user sees changes._

---

## 4. The product changes (the change, now easy)

Scope is conditional on E0 findings. Default scope below assumes the common
case (pause exists and works; visibility is partial; guards exist but speak
git-ese). If E0 proves otherwise, re-scope before building.

### 4.1 Pause/edit/resume gap fixes (only what E0 proves broken)

- If R1 finds pause does not actually stop the child process, or resume
  loses partial work without telling the operator, fix that first — the
  guide's primary flow must not rest on a leaky pause. Expected touch
  points: `api/taskStore.js` (`pauseTask`/`resumeTask`), possibly
  `api/flow/taskControl.js` (`killTaskProcess`).
- If pause/resume already round-trips cleanly, this section is *verification
  only* (tests proving the round-trip — see §6.1) and no production code
  changes. Do not gold-plate.

### 4.2 "Where is it working" visibility (the main likely code change)

- Goal: a developer can answer "which branch/worktree/runner holds task X"
  from one place (task payload and/or task view) before deciding where to
  edit. Concretely: ensure the task detail response (and the UI inspector
  that renders it) shows the task branch (`kb/<id>`), the worktree path
  when `workspaceIsolation: worktree`, and the runner/holder when remote.
- Implementation notes: read-only, additive fields only — no new routes
  required if the task object can carry them; thread from `taskBranches.js`
  / worktree provisioning into the serialized task. If the UI inspector
  already renders some of these, extend it rather than adding a new panel.
- If E0/R1-2 finds all of this already exposed, this section collapses to
  guide text that points at the existing surface.

### 4.3 Conflict guard message (only if cheap; never silent overwrite)

- Goal: when a hand edit collides with engine expectations (dirty worktree
  at stage start, guard trip mid-run), the operator sees a message naming
  the conflicting path and the safe next step ("task T's worktree has
  hand edits at <path>; commit, stash, or move them, then retry"), instead
  of a raw git error.
- Constraint: message-only. No auto-stash, no auto-overwrite, no
  "mine always wins" flag in v1 — per §0/Q3 (warn, let the user choose),
  and per the guide's stance that concurrent same-file editing is
  unsupported. Any auto-resolution is an explicit follow-up, not this stage.
- If the current guard errors are already clear, this section is docs-only.

### 4.4 What is deliberately *not* changed

- No merge UI, no file locking, no new scheduler or execution mode.
- No new "wait/pause button" component if existing pause/resume suffices.
- No changes to the review-gate lifecycle (`approve`/`reject`/`re-route`)
  — the guide reuses it as-is.
- No changes to badge/diff/review payloads outside §4.2's additive fields.

---

## 5. The site-docs guide (second deliverable)

### 5.1 Article placement and contract

- New file `site-docs/develop-alongside.md` (proposed; confirm slug
  uniqueness at implementation time — no existing article uses it).
- Frontmatter: `title: Develop Alongside KainBain`, `section: working-with`,
  `order: 46` (free slot; verify no collision at build time — the integrity
  test fails on duplicate orders), `slug: develop-alongside`.
- Contract compliance (`site-docs/README.md`): all four frontmatter fields;
  small and task-focused; cross-links as `` `#/docs/<slug>` `` and only to
  indexed slugs; `bash`/`text` fences; leading/trailing `|` on tables; no
  raw HTML; **no secrets** (file is served unauthenticated).
- Seed claims from live sources (`api-reference.md` endpoints,
  `pipeline-stages.md` statuses, `taskStore.js` semantics) so content cannot
  rot; every behavioural claim must name its source endpoint or file.

### 5.2 Guide outline (simple steps first, technical detail after)

1. **The one mental model** (3 sentences + diagram-in-words): tasks work on
   their own branch/worktree, not in your checkout; the engine runs one
   task at a time; your safe moves are pause-then-edit, separate branch,
   or review-gate input.
2. **Flow A — Quick fix (pause, edit, resume).** UI steps + API equivalent
   (`POST /tasks/:id/pause`, edit, `POST /tasks/:id/resume`); what pause
   does to the running stage (per R1 findings); what to do if the task is
   on a remote runner (you cannot touch its files — steer or wait).
3. **Flow B — Bigger feature (separate branch).** Branch from `main`, build,
   merge back; how to avoid diverging from the task branch (merge order,
   who rebases); what to do when the task branch already touched your
   files (coordinate via review gate, not force-push).
4. **Flow C — Settings and setup.** The §E0.2 settings table: safe
   (pipeline files, project settings) vs never-touch (`.kainbain/` state,
   `sessions/`, `worktrees/`, `quarantine/`, task markdown); the stop-rename-
   restart flow for state-folder changes (link to `#/docs/existing-projects`
   rather than restating).
5. **Flow D — Project docs.** Which docs tree is safe (`docs/` project docs
   vs `docs/tasks/` task bookkeeping vs `site-docs/` product docs); note
   that task-dir churn is excluded from review diffs where applicable.
6. **What not to do** (short, explicit): editing files inside a running
   task's worktree; editing `.kainbain/` state by hand; force-pushing over
   `kb/*` branches. Each with the one-line reason and the safe alternative.
7. **When something collides** (technical detail): the guard message from
   §4.3, the git lock runbook link (`#/docs/git-index-lock-runbook`), and
   how to recover (commit/stash/move hand edits, then retry/resume).
8. **Related:** `#/docs/submit-track-task`, `#/docs/review-gates`,
   `#/docs/task-dependencies`, `#/docs/existing-projects`,
   `#/docs/git-index-lock-runbook`, `#/docs/pipeline-stages`.

### 5.3 Guide acceptance bar

- A developer who has never touched KainBain internals can perform Flow A
  from the guide alone (measured by the §6.4 walkthrough, not by assertion).
- Every endpoint named exists in `api-reference.md`; every cross-link
  resolves (integrity test); `npm run docs:check` passes.

---

## 6. Testing and quality gates

### 6.1 Unit tests (primary gate, `npm run test:unit`)

- **Pause/edit/resume round-trip** (extend `api/taskStore.test.js` near the
  existing "supports manual intervention" case): pause a runnable task,
  assert status `paused` and engine released; simulate a hand edit to the
  task branch fixture; resume; assert the stage re-runs or continues per
  R1 semantics and the hand edit survives. If §4.1 changed code, these
  tests pin the new behaviour; if not, they pin the verified behaviour.
- **§4.2 visibility fields** (new or extended task-serialization tests):
  task detail carries branch/worktree/holder fields; absent worktree
  (quarantine/off mode) serializes as explicit null, not missing key.
- **§4.3 guard message** (extend `workingTreeStatus` / stage-transition
  tests): dirty worktree at stage start surfaces the new message naming
  the path; assert no auto-stash/overwrite occurred (hand edit bytes still
  on disk).
- **No-concurrent-edit regression:** a test asserting the documented
  invariant — a hand edit to a *paused* task's branch is never clobbered
  by resume/retry (bytes compared before/after).

### 6.2 Integration tests (real temp repos, established pattern)

- Extend the temp-repo + `app.inject` pattern (as in
  `api/reviewAssembly.integration.test.js`): create a repo with branch
  mode on, run pause → hand-commit on the task branch → resume, and assert
  end state via git (`git log`, `git status --porcelain`) rather than only
  via the API payload.
- **No long-lived background server.** Integration tests use in-process
  temp dirs only, consistent with the Testing & Verification Guidance
  (headless, isolated, or mock fixtures).

### 6.3 Docs tests (existing gates, no new harness)

- `npm run docs:check` (frontmatter/order/link integrity via
  `api/routes/docs.*.test.js` + `check-doc-links.mjs` +
  `check-jsdoc-example.mjs`) must pass with the new article included.
- Specifically assert: new slug serves at `GET /docs/develop-alongside`
  with `text/markdown`; all `#/docs/<slug>` links in the new article
  resolve; no order collision in `working-with`.

### 6.4 Manual alongside walkthrough (human gate, mirrors survey Q6-style assurance)

```
Walkthrough: develop alongside a live task
1. Start a task with at least two agent stages on a scratch project.
2. While stage 1 runs, PAUSE the task (UI or POST /tasks/:id/pause).
3. Make a small hand edit to a file the task also touches; commit it on
   the task branch (per Flow A).
4. RESUME the task; let it run to the next review gate.
5. Confirm: hand edit present in the branch; stage completed; no guard
   wedged; review diff shows both agent and hand changes.
6. Separately: start a second task, hand-edit a file in its ACTIVE
   worktree without pausing, and confirm the §4.3 message names the path
   (or the guide's stated behaviour) — nothing silently lost.
7. Attach the git log/status excerpts to the stage report as evidence.
```

### 6.5 Commands to run before submitting

```
npm run test:unit          # primary gate — must be green
npm run test:api           # if run separately from test:unit
npm run test:frontend      # same (only if §4.2 touched the inspector)
npm run docs:check         # site-docs integrity — must be green
npm run lint               # no new lint violations
```

Do not spawn a long-lived preview server for visual checks — use existing
mock fixtures or the headless screenshot tool (`npm run capture:screenshot`)
if a visual before/after of the inspector change is desired.

---

## 7. Documentation plan

### 7.1 Docs to update during implementation (not after)

- **`docs/tasks/8dafdce1-a3ed-4086-a9cb-b382ecacc757/IMPLEMENTATION_PLAN.md`**
  (this file) — the plan itself.
- **`docs/research/develop-alongside-spike.md`** (new) — E0 findings
  (pause semantics, visibility audit, guard behaviour, merge story,
  conflict inventory, settings taxonomy).

### 7.2 Docs to update at implementation time

- **Product deliverable:** `site-docs/develop-alongside.md` (new, §5).
- **Code-adjacent docs:**
  - `api/taskStore.js` — `pauseTask`/`resumeTask` doc blocks state the
    verified hand-edit contract (what survives a pause/resume cycle).
  - `api/git/workingTreeStatus.js` — if §4.3 changed the message, document
    the hand-edit recovery path in the module header.
  - Task serialization site for §4.2 — document the new fields' meaning
    and null-vs-missing semantics.
- **Operator-facing docs:** one-line pointers from `submit-track-task.md`
  and `review-gates.md` "Related" sections to the new article (additive
  only; no restating — no-stub rule). `CHANGELOG.md` entry if the repo
  convention requires one for user-visible behaviour.
- **Runbook:** the §6.4 walkthrough saved as
  `docs/manual-testing/develop-alongside-walkthrough.md` so the next
  operator can re-run the human gate.

### 7.3 What the implementation stage's report should contain

- E0 spike note (pause semantics, visibility audit, guard behaviour).
- Files changed for §4.1–§4.3 (or "verification only, no code change" with
  the pinning tests linked, per section).
- Test evidence: `npm run test:unit` + `npm run docs:check` output
  snippets showing green.
- Walkthrough evidence: git log/status excerpts from §6.4 steps 5–6.
- Survey-confirmation record: which §0 defaults were confirmed vs changed,
  and by whom.

---

## 8. Implementation sequence (ordered, big pieces and research first)

Each step must keep `npm run test:unit` green before proceeding. Steps are
small enough to be one commit each.

| Order | Step | Touch points | Evidence this step is done |
|---|---|---|---|
| **R1** | **Research spike E0.1** (control-surface truth): pause/resume/steer semantics, visibility audit, dirty-tree guard behaviour, branch merge story. Write `docs/research/develop-alongside-spike.md`. No code. | Docs only | Spike note committed; §4 scope confirmed or re-scoped in writing. |
| **R2** | **Research spike E0.2** (docs contract + conflict inventory + settings taxonomy). Fix slug/order choice; list top ~10 "only-agent-writes" sites; build safe/never-touch settings table. No code. | Docs only | Inventory + taxonomy committed; guide outline (§5.2) validated against reality. |
| **R3** | **Test-harness preparation E0.3**: locate/reuse pause/resume + temp-repo helpers; add tolerant seams for §4.2 fields. No behaviour change. | Test files only | `npm run test:unit` green; seams in place. |
| **R4** | **§4.1 pause/edit/resume gaps** (or verification-only with pinning tests if no gap). | `api/taskStore.js`, `api/flow/taskControl.js` (if needed), tests | Round-trip tests green; hand edit survives pause/resume. |
| **R5** | **§4.2 visibility fields** (or docs-only if already exposed): branch/worktree/holder on task detail + inspector. | Task serialization, frontend inspector (if touched), tests | Field assertions green; one screenshot or payload excerpt in report. |
| **R6** | **§4.3 guard message** (or docs-only if current errors suffice). | `api/git/workingTreeStatus.js` (or guard site), tests | Guard test names the path; hand-edit bytes preserved. |
| **R7** | **Write `site-docs/develop-alongside.md`** per §5 (flows A–D, what-not-to-do, collision recovery, related links). | `site-docs/develop-alongside.md` | `npm run docs:check` green; article serves at `GET /docs/develop-alongside`. |
| **R8** | **Cross-link + code-adjacent docs** (§7.2): Related pointers, doc-block updates, CHANGELOG if conventional. | `submit-track-task.md`, `review-gates.md`, module headers | `npm run docs:check` still green; no link regressions. |
| **R9** | **Final verification pass** (§6.5 + §6.4): full gates plus the manual alongside walkthrough; save runbook + evidence to the stage report. | Repo-wide | `test:unit` + `docs:check` green; walkthrough excerpts attached; ready for review. |

Big research (R1–R2) comes before any wiring, per the stage instructions.
R4–R6 are the "make the change" product items (each allowed to collapse to
verification/docs-only on E0 evidence); R7 is the guide deliverable; R9 is
the combined "assure the change was implemented" gate (automated + manual
walkthrough).

---

## 9. Risks and mitigations specific to this change

| Risk | Why it matters | Mitigation |
|---|---|---|
| Survey unanswered — §0 defaults may not match what was wanted. | Building the wrong conflict behaviour (warn vs mine-wins) wastes the stage. | §0 defaults are explicit and flagged for confirmation; R1/R2 do not depend on them, so confirmation can land any time before R4. |
| Pause does not actually stop the agent (scheduler-only pause). | Flow A would rest on a lie; hand edits could still race the child process. | R1 measures exact pause semantics first; §4.1 fixes gaps before the guide is written. |
| Remote-runner tasks have no local files to edit. | A guide written for local checkouts would mislead runner users. | R1 audits the lease/holder model; Flow A documents the steer-or-wait alternative. |
| `workspaceIsolation: off` (shared checkout) cannot be made safe by docs alone. | Hand edits and agent writes share one tree; guards may wedge. | Guide recommends worktree mode for hand-editing and documents `off` as edit-only-when-idle; no new machinery for `off` in v1. |
| Guard message confused with git-index-lock runbook. | Two similar-sounding failure surfaces; operator follows the wrong runbook. | §4.3 message names the hand-edit path explicitly and links the alongside guide; runbook cross-links both ways. |
| Site-docs order collision or dangling `#/docs/` link. | Integrity test fails; `docs:check` gate red. | Verify order 46 is free at build time; run `npm run docs:check` in R7/R8, not just R9. |
| Secrets or host paths leak into the guide. | site-docs is served unauthenticated by design. | Examples use `/home/me/repos/...` placeholders only; review the article diff for paths/tokens before R9. |
| Long-lived preview server anti-pattern in verification. | Testing guidance forbids it. | Headless/in-process tests + `capture:screenshot` only; no `npm run dev` preview server. |

---

## 10. Open (intentionally undecided) items

1. **Survey confirmation** — all six §0 defaults await confirmation. If the
   survey is later answered, update §0 and re-scope §4/§5 before R4.
2. **Missing idea file** — `idea-20261109-175922.md` was listed as a prior
   report but is absent from the task directory. If it surfaces, reconcile
   it with this plan before R4.
3. **Slug/order final choice** — `develop-alongside` / `working-with` / 46
   is a proposal; confirm uniqueness at implementation time.
4. **§4.2 UI surface** — whether the inspector already shows branch/worktree
   (R1 decides); additive fields only, no new panel in v1.
5. **Auto-resolution follow-up** — any "mine always wins" / auto-stash
   behaviour is explicitly deferred past this stage.

No other open decisions; the rest is specified above.

---

## 11. Success evidence for this stage (KainBain gate)

This stage passes when:

- This plan exists at
  `docs/tasks/8dafdce1-a3ed-4086-a9cb-b382ecacc757/IMPLEMENTATION_PLAN.md`
  and contains sections 0–11 plus this §11.
- Plan accounts for the survey state (unanswered → explicit proposed
  defaults in §0) and the missing idea file (§10.2), with the task
  statement as the authoritative source.
- Plan orders big pieces and research first (R1/R2 spikes before wiring),
  per the stage instruction, and follows "make change easy then make the
  change" (E0 research + seams before §4 feature work).
- Plan includes a testing plan (`npm run test:unit` primary gate,
  integration via temp repos, no long-lived servers) and a documentation
  plan (§7: spike note, new site-docs article, cross-links, runbook).
- Plan covers both deliverables: enabling product changes (§4, research-
  gated, warn-don't-clobber) and the site-docs guide (§5, placed per the
  authoring contract with an outline and acceptance bar).
- No unrelated files changed.
