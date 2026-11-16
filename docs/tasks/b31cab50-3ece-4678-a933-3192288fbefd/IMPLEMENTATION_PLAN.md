# Implementation Plan — Missing Task Assets: Copy or Warn

## Goal

Stop agents from silently planning around phantom screenshots. When a task
description references `assets/*` (or any attached file), the engine/runner
must, before the first stage runs, either (a) copy the attachment into the
workspace at the referenced relative path, or (b) if the attachment is
genuinely missing, replace the dead reference in the rendered prompt with an
explicit MISSING-ASSET warning naming the file — so agents fail fast instead
of guessing from source alone. Follow "make change easy, then make the
change": first build one shared, well-tested ref-parse/resolve/warn helper,
then wire it into prompt curation and runner delivery.

## Context and Evidence

- Case study: task `0d29c64c-34f5-4740-ba25-f4e6ef4f90b5` (settings-page
  overflow fix). Its
  [IMPLEMENTATION_PLAN.md](../0d29c64c-34f5-4740-ba25-f4e6ef4f90b5/IMPLEMENTATION_PLAN.md)
  records that `assets/image.png` was not present and the plan had to be
  grounded in source instead of the screenshot. Verified: that task's folder
  has **no `assets/` directory at all** — genuinely missing bytes (a dangling
  ref), not a delivery failure.
- Systemic, not one-off: the literal `assets/image.png` string appears across
  dozens of task docs (failure reports, plans, notes), so dangling refs recur.
- Storage truth ([task-images.md](../../task-images.md)): uploads land in
  `<projectRoot>/docs/tasks/<taskId>/assets/` via
  [taskImages.js](../../../api/routes/taskImages.js); goals carry only relative
  refs (`![alt](assets/<name>)`); serving canonicalises stale names
  (case/space drift) before 404ing.
- Prompt truth: [promptCuration.js](../../../api/promptCuration.js:847-869)
  builds `# Task Images` from **on-disk** assets only
  (`collectTaskImageRefs`), while the goal text keeps its raw refs. Nothing
  reconciles the two — a dangling ref in the goal renders unchallenged, and a
  healthy task with images gets no warning path at all.
- Local-runner delivery already exists:
  [syncTaskDocs](../../../runner/project.js:715-748) copies the whole task
  folder **including `assets/`** from the primary checkout into the per-task
  worktree before the harness runs. So arm (a) works for local runners when
  bytes exist on the backend — the gaps are (1) genuinely missing bytes (no
  warning anywhere), and (2) remote runners, where `syncTaskDocs` returns 0
  (no `primaryCwd`) and the worktree only has branch content.
- Backend owns prompt truth for runners:
  [curateRunnerPrompt](../../../api/flow/curateRunnerPrompt.js) curates at
  claim/dispatch time; the daemon only retargets the cwd prefix
  ([applyBackendPrompt](../../../runner/daemon.js:735)). So the warning must be
  computed backend-side at curate time to cover both embedded and runner paths.
- Ref grammar exists only on the frontend: `extractImageRefs` /
  `resolveTaskImageUrl` in
  [taskImages.js](../../../frontend/src/services/taskImages.js) (tolerates
  `./`, `/`, task-folder prefixes, trailing titles). The backend has **no**
  markdown-ref parser — one must be built (preferably shared, not duplicated).
- Verification tooling: `npm run test:unit` (primary gate; `test:api` +
  `test:frontend`), `npm run lint`, `npm run docs:check`; no long-lived dev
  servers per stage guidance.

## Survey Input (SURVEY.md) — Status and Assumptions

[SURVEY.md](./SURVEY.md) contains four questions but no recorded answers
(`"answers": {}`). The plan adopts these defaults, each reversible at
implementation time:

| # | Survey question | Assumed answer | Rationale |
|---|---|---|---|
| q1 | Missing picture: stop, warn-and-continue, or ask owner? | Warn-and-continue: render an explicit MISSING-ASSET warning naming the file, and keep working | Matches the task's fix clause (b); a hard stop before stage 1 would wedge the queue on every stale ref, and "ask and wait" needs a human-gate that does not exist |
| q2 | Pictures only, or any attached file? | Any `assets/<name>` ref is *detected* and warned on (extension-agnostic); byte delivery stays image-capped | Uploads today are images-only (extension allowlist), so detection is the general mechanism and delivery limits stay as-is; simplest safe option |
| q3 | Cover older tasks with broken links? | Yes automatically: the warning is computed at prompt-render time, so any old task that re-runs or re-opens gets it with zero migration | Unifies "yes" and "only on re-open" — no backfill job needed; stored goal text is never mutated |
| q4 | Name the exact file, or a general warning? | Name every exact missing file (one line per ref, plus the task-folder path where it was expected) | Required by the task acceptance clause; also makes re-upload actionable |

If the task owner answers SURVEY.md before implementation, the implementer
adopts those answers over the assumptions above. The riskiest is q1
(warn-and-continue vs hard stop) — implementation keeps the decision in one
place (the curate-time check) so flipping to a hard gate later is a small,
localised change.

## Success Criteria

- A task whose goal references `assets/image.png` (or any `assets/<name>`)
  either has a readable file at `docs/tasks/<taskId>/assets/<name>` in the
  agent's workspace, or its rendered stage prompt carries an explicit
  MISSING-ASSET warning naming that file. Both arms are covered by automated
  tests.
- The warning names every missing ref (exact filename + expected task-folder
  path) and appears prominently (before the agent can plan around the phantom
  — top of the rendered prompt / first section).
- Stored goal text is never mutated: the warning lives in the rendered prompt
  only, so re-uploading the file silently heals the next run with no cleanup.
- Tasks with no refs, and tasks whose refs all resolve, keep byte-identical
  prompts (no new sections, no churn in prompt baselines/layout tests).
- Name-drift refs (wrong case, spaces) that serving already canonicalises do
  NOT warn — the existence check reuses serve-side canonicalisation semantics.
- Existing gates stay green: `npm run test:unit`, `npm run lint`,
  `npm run docs:check`.

## Approach

Two phases, in this order:

1. **Make change easy.** Research spikes first (reproduce the dead ref
   end-to-end; map the remote-runner gap and claim-payload limits; inventory
   real ref-grammar variants in the wild), then build one small shared helper
   — parse goal refs, resolve each against the task assets dir (with
   canonicalisation), format the warning — with unit tests proving each piece
   in isolation.
2. **Make the change.** Wire the helper into backend prompt curation (warning
   arm, covers embedded + runner paths at once) and harden/extend the delivery
   arm (verify local `syncTaskDocs` asset delivery with a test; close the
   remote-runner gap per the spike's findings). Then verify end-to-end and
   document.

Key decisions:

- **Warn in the rendered prompt, never rewrite the goal.** Goal text is user
  data with branch/merge semantics; a computed warning is zero-migration,
  self-healing, and automatically covers old tasks (q3).
- **Compute backend-side at curate time.** Both the embedded path
  (`executeStage`) and the runner path (`curateRunnerPrompt`) flow through
  `PromptCurationEngine.curatePrompt`, so one hook covers every agent stage;
  the daemon needs no prompt logic.
- **One shared ref grammar.** Port/hoist the frontend's tolerant parsing
  (`./`, `/`, task-folder prefixes, trailing titles) into a shared module both
  sides use, so detection can never drift from what the viewer resolves.
- **Canonicalisation parity before warning.** A ref warns only when neither
  the literal name nor its sanitised/canonical form matches an on-disk asset —
  otherwise the fix would cry wolf on every drifted-but-servable ref.
- **Delivery arm is verify-then-extend.** Local delivery exists
  (`syncTaskDocs`); prove it with a test rather than rebuilding it. Only the
  remote-runner gap (if the spike confirms it) gets new machinery, reusing the
  existing completion-payload shipment pattern in reverse if feasible.

## Steps

### Step 0 — Reproduce and measure (research; do first)

- Reproduce the dead ref end-to-end: craft a task whose goal contains
  `![image.png](assets/image.png)` with no bytes on disk; curate a stage
  prompt and confirm (a) the raw ref renders unchallenged, (b) `# Task Images`
  is absent, (c) no warning exists. Capture the before-prompt as the fixture.
- Inventory real ref variants: grep `docs/tasks/*/task.md` (and goals in live
  tasks) for `assets/` refs; record prefix/title/case variants the parser must
  tolerate. This list is the parser's acceptance corpus.
- Map the remote-runner gap: confirm what a runner with no `primaryCwd`
  (remote mode) sees — `syncTaskDocs` returns 0; check what the claim payload
  currently ships (prompt string only?) and its size limits; measure a typical
  `assets/` payload size to size the fix (inline bytes vs fetch-on-demand).
- Depends on: nothing. Blocks: Steps 1–3.

### Step 1 — Make change easy: shared ref-parse/resolve/warn helper + unit tests

- Add one small shared module (e.g. beside `api/work/taskAssets.js`, or in
  `shared/` if the frontend is to adopt it) implementing:
  - `extractAssetRefs(markdown)` — all `assets/<name>` destinations from
    image/link markdown, tolerant of `./`, `/`, task-folder prefixes and
    trailing titles; ignores absolute/protocol URLs.
  - `resolveAssetRef(projectCwd, taskId, ref)` — literal match first, then
    serve-side canonicalisation (`sanitizeImageName` equality); returns
    present/missing without throwing on absent dirs.
  - `formatMissingAssetWarning(missing[])` — the explicit MISSING-ASSET block:
    one line per file with the exact ref and the expected
    `docs/tasks/<taskId>/assets/<name>` path, plus one line telling the agent
    to fail fast (do not guess at visual content; proceed from source and say
    the screenshot was unavailable).
- Unit tests alongside existing suites (`api/work/taskAssets.test.js` style):
  parser corpus from Step 0, canonicalisation parity cases (drifted-but-present
  ⇒ no warning), formatter output, empty-input no-ops.
- Prove the helper against the Step 0 fixture in isolation before touching
  curation or the runner.
- Depends on: Step 0. Blocks: Steps 2–3.

### Step 2 — Make the change, arm (b): warning in curated prompts (do early)

- Hook the Step 1 helper into `PromptCurationEngine.curatePrompt` (the single
  choke point both embedded and runner paths share): parse the goal (+ failure
  details / feedback text, which can also carry refs), resolve against the
  task assets dir, and when anything is missing, render the warning as a
  prominent early section (first section, before `# Task`, so the agent fails
  fast; wire through the prompt-layout token system so custom layouts can
  place it but it can never silently vanish for verdict-expecting stages —
  mirror the `{{testingGuidance}}` re-injection precedent).
- Guard byte-identical no-op: no refs or all-resolved ⇒ no section, no prompt
  diff. Confirm against prompt layout/baseline tests.
- Add curation tests: dangling ref ⇒ warning names the file; present asset ⇒
  no warning; drifted-but-servable ref ⇒ no warning; no refs ⇒ byte-identical.
- Depends on: Step 1. Blocks: Step 4.

### Step 3 — Make the change, arm (a): delivery into the workspace

- 3a. Local runners: add a regression test proving `syncTaskDocs` already
  copies `assets/` (including screenshots) into the worktree before the first
  stage; if the test finds a gap (filtering, ordering vs prompt render, count
  logging), fix it there — do not build a second copier. Add a log line with
  the synced asset count for observability.
- 3b. Remote runners (only if Step 0 confirms the gap): ship the task's
  `assets/` bytes (or the referenced subset, capped like vision dispatch)
  with the claim payload, and have the daemon write them to
  `docs/tasks/<taskId>/assets/` in the worktree before running; reuse existing
  size-cap and sanitisation helpers. If payload limits forbid inline bytes,
  specify the fetch-on-demand alternative from the spike instead — still
  before the first stage runs.
- 3c. Embedded path: confirm assets are readable (primary checkout) and that
  branch-checkout flapping (per [task-images.md](../../task-images.md)) cannot
  produce a false warning at curate time; if it can, curate against the task
  branch content or re-verify after checkout — document the choice.
- Depends on: Steps 0–1. Blocks: Step 4.

### Step 4 — Verify end-to-end and document

- Re-run the Step 0 reproduction: the same dangling-ref task must now either
  show the file in the workspace or carry the warning — assert the acceptance
  clause mechanically (file readable XOR warning present, per ref).
- Run gates: `npm run test:api`, `npm run test:frontend` (i.e.
  `npm run test:unit`), `npm run lint`, `npm run docs:check`.
- Update docs: extend [task-images.md](../../task-images.md) and
  [site-docs/task-images.md](../../../site-docs/task-images.md) with the new
  behaviour (copy-or-warn, warning text, self-healing on re-upload, remote
  runner note); note the shared helper as the single grammar owner.
- Depends on: Steps 2–3.

## Validation Plan

| Check | Command / method | Expected evidence |
|---|---|---|
| Parser unit tests (new) | `npm run test:api` incl. new Step 1 tests | Step 0 corpus all parsed; protocol/absolute URLs ignored |
| Resolver parity (new) | Same | Drifted-but-present ⇒ present; truly absent ⇒ missing; absent dir ⇒ missing, no throw |
| Warning format (new) | Same | Names every file + expected path; fail-fast instruction present |
| Curation: dangling ref | `npm run test:api` (promptCuration suite) | Warning section first; names `assets/image.png` |
| Curation: healthy task | Same | Byte-identical prompt (layout/baseline tests green) |
| Local delivery regression (new) | `npm run test` incl. runner `syncTaskDocs` test | `assets/` bytes land in worktree pre-stage |
| Remote delivery (new, if 3b) | Same | Claim payload → worktree `assets/` before first stage |
| Acceptance (both arms) | Step 4 reproduction script | Per ref: readable file XOR warning — no silent third state |
| Full unit gates | `npm run test:unit` | All pass |
| Lint | `npm run lint` | Clean |
| Docs gates | `npm run docs:check` | Clean; new behaviour documented in both task-images docs |

Highest-risk validation: the acceptance check on a **remote runner** — the
local path reuses proven machinery, but the claim-payload shipment (if needed)
is new wire format touching size caps and daemon write paths; if it fails,
fall back to the fetch-on-demand alternative from the Step 0 spike.

## Risks / Open Questions

- **Survey unanswered**: q1–q4 assumptions above stand until the owner answers;
  the riskiest is q1 (warn-and-continue vs hard stop) — kept to a single
  curate-time decision point so flipping it is a small change.
- **Warning placement vs custom layouts**: a project with a custom prompt
  layout could drop the new section; mitigate by mirroring the
  `{{testingGuidance}}` mandatory re-injection precedent for agent stages.
- **Branch-flap false warnings**: assets are tracked files and checkouts flap
  them (see [task-images.md](../../task-images.md)); Step 3c must ensure the
  curate-time check reads the right tree, or warnings will cry wolf.
- **Non-goals**: changing upload limits/allowlist, backfilling old tasks'
  stored text, a human re-upload gate (q1 option 3), and base64-embedding bytes
  into prompts (explicitly rejected: bloat + harness incompatibility).
- **Rollback**: warning arm is additive and gated on missing refs — revert the
  curation hook and prompts return to prior bytes; delivery arm reverts to
  current `syncTaskDocs` behaviour.
