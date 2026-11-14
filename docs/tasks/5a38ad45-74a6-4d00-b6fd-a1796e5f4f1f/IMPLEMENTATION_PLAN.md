# Implementation Plan — Pretty tasks for the create-task skill

- Task: `5a38ad45-74a6-4d00-b6fd-a1796e5f4f1f` ("make sure the create tasks skill is able to create pretty tasks")
- Stage: plan (docs-only; no source changes in this stage)
- Date: 2026-11-14
- Inputs: task brief (clauses A + B), `SURVEY.md` and `idea-20261113-231825.md` in this folder
- Principle: **make the change easy, then make the change** — characterization tests,
  shared fixtures, and research spikes land before any behaviour change.

## Goal

Tasks created through the create-task skill stop being single ugly paragraphs and
become readable markdown documents, while every existing behaviour (first-line
title, `blockedBy`/blocking, idempotency, dedupe, recursion guard) keeps working
exactly as today.

Two deliverables, per the brief:

- **A) API accepts nice-looking markdown tasks** — a `goal` containing headings,
  lists, tables, fenced code blocks, mermaid diagrams, and image references must
  survive creation end-to-end and render prettily wherever tasks render.
- **B) Skill restructured to a two-stage flow** — the skill recommends writing each
  ticket as its own markdown file in its task directory first, then sending that
  file's content across via the API, so agents produce documentation-shaped output
  instead of a paragraph.

## Success criteria

1. `POST /tasks` with a rich-markdown `goal` (headings, code fence, mermaid fence,
   `![name](assets/name)` ref) round-trips byte-identical through create → `GET`
   → `task.md` → UI render.
2. Code blocks, mermaid diagrams, and task images visibly render (not raw text) in
   the task goal view; verified headless, no long-lived servers.
3. The rewritten skill's worked flow is: draft one `.md` file per ticket in the
   task directory → send each file → verify; contract tests pin the new flow and
   all old pins still hold.
4. Old plain-paragraph tasks render and behave exactly as before (no migration,
   no format requirement).
5. `npm run test:unit` (api + frontend) is green; the skill contract suite pins
   both the preserved behaviours and the new two-stage flow.

## Current-state findings (verified this run)

- The "create kainbain task" skill is `skills/creating-new-tickets/SKILL.md`. It
  currently mandates `# <title>` + **one-paragraph** description and states "no
  filesystem or shell work is required" — the direct cause of paragraph-shaped
  tickets. Its invariants are pinned by
  `api/skills/creatingNewTickets.contract.test.js` (blockedBy recipe, never-guess,
  `blockers: none`, `# <title>`, first line, same-project, HTTP 400,
  failed/cancelled, `formatTaskTitleFirstLine`, `Untitled Task`, recursion guard,
  16k prompt budget).
- Creation path: `POST /tasks` in `api/work/taskWorkRoutes.js` (~L259-315) takes
  `goal: { type: "string" }` with **no markdown handling, no length cap, and no
  goal sanitization** (only `title` goes through `_sanitizeTaskTitle` in
  `api/work/taskIdentity.js`). `createTask` in `api/work/taskLifecycle.js`
  (~L204+) stores the goal verbatim and persists it to
  `<projectRoot>/docs/tasks/<taskId>/task.md` via `_saveTaskMarkdown`. A goal
  update path also exists (`taskWorkRoutes.js` ~L433-435). So clause A is mostly
  **prove-and-harden** on the API side, not a rewrite.
- Rendering is a hand-rolled `MarkdownViewer.jsx`
  (`frontend/src/components/common/`) with code blocks (highlight + copy) and
  task-image resolution already built. **No mermaid support exists anywhere in
  `frontend/`** — mermaid rendering is the one genuinely new capability and the
  biggest unknown (library choice, bundle size, CSP).
- Images already have a full lifecycle (`docs/task-images.md`): upload via
  `POST /projects/:id/tasks/:taskId/images` (`api/routes/taskImages.js`), stored
  under `docs/tasks/<taskId>/assets/`, referenced as `![name](assets/name)`,
  resolved by `resolveTaskImageUrl`. The gap for skill-created tasks is ordering:
  the task id does not exist until after `POST /tasks`, so image bytes can only
  be attached **after** creation (create → upload → patch goal with refs).
- Title derivation chain to re-verify in Phase 0: skill text cites
  `formatTaskTitleFirstLine`, but that symbol currently appears only in the
  contract test — the real logic lives in `_sanitizeTaskTitle` plus the UI
  formatters (`frontend/src/components/tasks/taskFormatters.js`). The plan must
  not break whichever derivation is live.

## Survey record (SURVEY.md) and plan assumptions

`SURVEY.md` in this folder contains 6 grill questions. **Update (2026-11-14):
the survey HAS since been answered** — the answers select "Full neat document
with pictures or diagrams" (q1, with a note that at minimum tasks should use
newlines/headings/spacing, plus bullets/diagrams/screenshots for credit),
all four feature options (q2), agent-uploads-picture-inline (q3), "Always
write the file first, then send it" (q4), "Yes, but small tweaks are allowed"
(q5), and "old tasks must keep working" (q6). The assumptions below remain
accurate under those answers (each maps 1:1 to a question); where an answer
is stricter than the assumption it confirms the strict reading (notably q4:
Stage 1 drafting is mandatory, never skipped).

| # | Question | Assumption adopted |
|---|----------|-------------------|
| q1 | What does "pretty" look like? | Baseline: short title + headings + bullet steps; full documents with pictures/diagrams supported but not required. |
| q2 | Which features must tasks support? | All four: code blocks, simple (mermaid) diagrams, pictures/image links, headings/lists/tables. Matches brief clause A. |
| q3 | How should pictures work? | Agent uploads the picture, then references it so it shows inline (existing `assets/` lifecycle); absolute URLs keep passing through as today. |
| q4 | How strict is the write-file-first flow? | Always write the file first, then send it (the brief's explicit ask). |
| q5 | Keep first-line title + blocking exactly? | Yes, exactly as now — zero behaviour change to title derivation or `blockedBy` validation. |
| q6 | Old plain tasks keep working? | Yes, untouched. The goal stays an opaque string; pretty is additive. |

## Approach: make the change easy, then make the change

1. **Easy first (Phases 0–2):** restore ground truth, add characterization tests
   proving what survives today, build one shared rich-markdown fixture set, and
   run the three research spikes (mermaid, image ordering, draft-file location).
   No behaviour changes; everything stays green throughout.
2. **The change (Phases 3–4):** harden the API round-trip, add mermaid rendering,
   rewrite the skill to the two-stage flow, extend (never loosen) the contract
   tests.
3. **Assurance (Phase 5):** full unit suites, headless render proof, docs updates.

Big and uncertain work (spikes, fixtures, characterization) is deliberately
front-loaded so Phase 3+ is mechanical.

## Steps

### Phase 0 — Ground truth (no behaviour change)

1. Confirm this folder holds `SURVEY.md` + `idea-20261113-231825.md` (restored
   from the survey stage's commit; the checkout did not include them) and record
   the unanswered-survey assumptions from the table above.
2. Map the live title-derivation chain end to end: `POST /tasks` title default
   (`taskGoal.slice(0, 60)`), `_sanitizeTaskTitle`, `taskFormatters.js`, task
   cards / queue rows / Now Playing / detail pages, and the `# Goal` section of
   `task.md`. Write down which component owns the first-line rule today so Phase
   3–4 can prove it is untouched. (The skill's `formatTaskTitleFirstLine` name
   does not match any implementation symbol — reconcile or correct the wording.)
3. Inventory every goal renderer (goal section, cards, reports, prompt curation,
   runner prompts) and note which go through `MarkdownViewer` vs raw text, so
   "renders prettily" has an explicit surface list.

### Phase 1 — Research spikes (biggest unknowns first)

4. **Spike 1 — mermaid rendering.** Decide: (a) add a mermaid library to
   `MarkdownViewer` for ` ```mermaid ` fences; (b) server-side pre-render to SVG
   at upload/render time; or (c) ship fences as styled code blocks now with
   rendering as a named follow-up. Evaluate bundle size, CSP, offline/headless
   testability, and failure mode (a broken diagram must degrade to readable
   source, never a blank hole — mirror the `useImageRetry` latch philosophy in
   `docs/task-images.md`). Time-box; record the decision + rejected alternatives.
5. **Spike 2 — image ordering for API-created tasks.** Prove the
   create → upload → patch-goal sequence against the real routes (`POST /tasks`,
   `POST /projects/:id/tasks/:taskId/images`, goal update at
   `taskWorkRoutes.js` ~L433), including auth scopes and the per-task count cap
   in `api/routes/taskImages.js`. Decide the skill's exact recipe: where the
   agent stages bytes before upload, and that refs are appended only after a
   successful upload (never guessed filenames).
6. **Spike 3 — draft-file location and skill variables.** Decide where "its task
   directory" is for the drafting agent (current task's `docs/tasks/<id>/`
   folder, e.g. a `drafts/` subfolder, vs project cwd), whether the running task
   id/cwd is injectable into skill text (check `skillInjection.js` keywords
   alongside `{{targetProject}}`/`{{kbApiBase}}`), filename convention
   (`draft-<slug>.md`, one file per ticket), and hygiene fit (`docs/
   TASK_DIRECTORY_HYGIENE.md` allows adding files; drafts must be additive and
   clearly named so they are never mistaken for engine artifacts).

### Phase 2 — Make the change easy (scaffolding, still no behaviour change)

7. Add one shared rich-markdown **fixture set** (title + headings + bullets +
   table + fenced code + mermaid fence + `assets/` image ref + absolute-URL
   image) consumed by API, frontend, and skill tests, so all three layers assert
   against the same document.
8. Add **characterization tests** proving today's round-trip: rich goal through
   `POST /tasks` → `GET /tasks/:id` → `task.md` bytes → `MarkdownViewer` output.
   These must pass unmodified before AND after the change (except the mermaid
   assertion, which documents current behaviour and flips with Spike 1's
   decision).
9. Verify limits through the stack for long goals: Fastify body limit, response
   schemas (`goal: string`, `additionalProperties: true`), `task.md` write path,
   and UI truncation points. Fix or document any cap that would clip a
   document-shaped goal; add a long-goal test at the agreed ceiling.

### Phase 3 — Make the change, API + rendering (clause A)

10. Harden `POST /tasks` for markdown goals: keep the goal byte-identical
    (no stripping, collapsing, or re-wrapping — only `title` is sanitized, as
    today), keep `goal || title` fallback, and return the stored goal so the
    skill's verify step can diff it. Add round-trip tests per fixture element,
    including adversarial input (unclosed fence, `javascript:` URL — must still
    be neutralized by `sanitizeUrl`).
11. Implement Spike 1's mermaid decision in the renderer(s) from step 3, with
    graceful degradation and headless coverage (see Validation). Code blocks and
    images should need no code change — prove that with fixture tests instead.
12. Re-run the Phase 0 title/blocking map as regression proof: first-line title
    derivation, `blockedBy` 400s (self-block, unknown id, cycle),
    failed/cancelled blockers staying blocked, idempotency dedupe — all green
    and unmodified.

### Phase 4 — Make the change, skill rewrite (clause B)

13. Rewrite `skills/creating-new-tickets/SKILL.md` to the two-stage flow, keeping
    every existing section that is not the creation recipe:
    - **Stage 1 — draft:** for each finding, write one markdown file in the
      Spike-3 location following a template (`# <title>`, Context, Steps,
      Acceptance criteria, Examples/diagrams/images as needed, Blockers). Tiny
      tickets still get a file (per q4 assumption); the template scales down to
      title + one section.
    - **Stage 2 — send:** `POST /tasks` with `goal` = exact file content and
      `title` = file's first line (verbatim match, as today); then, only if the
      draft references local images, upload each via the images endpoint and
      patch the goal with the returned `assets/` refs; then run the existing
      verify step (re-GET, confirm stage/blockers/first line) plus a
      goal-diff-against-file check.
    - Keep verbatim in force: dedupe (§2), 10-ticket cap, deterministic
      `idempotencyKey`, `execute: false` default, recursion guard, explicit
      `blockedBy: [...]` or `[]` with `blockers: …` report lines, never-guess-id.
    - Flip the "no filesystem work required" line to require Stage 1, and bump
      `lastUpdated`.
14. Extend `api/skills/creatingNewTickets.contract.test.js` with pins for the new
    flow (draft-file step, template headings, goal-equals-file rule,
    upload-then-reference ordering) while keeping ALL existing pins passing —
    the file is the executable proof that old behaviour survived. Stay inside
    the direct-mode prompt budget the suite enforces; if the rewrite overflows,
    trim prose before touching pins.

### Phase 5 — Assurance and rollout

15. Run the full Validation Plan below; fix fallout in the phase that owns it.
16. Update docs (see Documentation plan), then do a live end-to-end fan-out in a
    scratch project: run the rewritten skill against 2–3 findings (one with a
    code block, one with a diagram, one with an image), confirm pretty rendering
    in the UI and `blockers:` lines in the stage report, and confirm an old
    paragraph task beside them is unchanged.
17. Rollout is additive and needs no migration: API + renderer changes are
    backward-compatible (goal stays an opaque string), and the skill ships on its
    normal path. Rollback = revert the skill text (old tickets unaffected) and,
    if needed, the renderer addition (goals degrade to pre-change rendering).

## Validation plan (how we prove the change landed)

Primary gate: the repo's own suites. No long-lived background servers anywhere;
visual proof uses isolated headless runners, existing mock fixtures, and
`npm run capture:screenshot`.

1. `npm run test:unit` (api vitest + frontend vitest incl.
   `check:duplicate-identifiers`) — must be green at every phase boundary, not
   just at the end.
2. API round-trip tests (new, fixture-driven): rich goal → `POST /tasks` →
   `GET /tasks/:id` → `task.md` bytes, asserting byte-identical goal, first-line
   title intact, and `blockedBy`/idempotency behaviours from
   `api/routes/tasks.blocking.test.js` still green.
3. Renderer tests (new/updated `MarkdownViewer.*` suites): code fence, mermaid
   fence (per Spike 1 decision — rendered SVG or styled fallback, plus broken-
   diagram degradation), `assets/` image with task context (paired with the
   `reason` codes in `docs/task-images.md`), absolute-URL image, `javascript:`/
   `data:` neutralization, and `data-task-image-state` assertions for missing
   assets. Old paragraph goals must render pixel-comparable to before.
4. Skill contract suite (`creatingNewTickets.contract.test.js` + `pocCreatingNewTickets`
   coverage): all pre-existing pins green plus the new two-stage pins; prompt
   budget assertion green.
5. Headless visual proof: `npm run capture:screenshot` (or the existing headless
   runner) over a fixture task showing headings, code, mermaid, and an inline
   image; human eyeball check that it is "pretty", archived as the change's
   before/after evidence.
6. Live scratch fan-out (step 16) as the final black-box check, including the
   `blockers:` audit lines in the stage report.

## Documentation plan

- `skills/creating-new-tickets/SKILL.md` — the rewrite itself, with the draft
  template inline and `lastUpdated` bumped.
- `docs/task-images.md` — add a short "API-created tasks" subsection pointing at
  the create → upload → patch ordering (no lifecycle change).
- `docs/tasks/<new-task-id>/` implementation report + the before/after
  screenshots from Validation 5, so the next reader can see what "pretty" means.
- `CHANGELOG.md` entry only if renderer/API behaviour visibly changes for
  existing users (mermaid rendering counts; skill-text-only does not).

## Risks

- Mermaid library cost (bundle/CSP/offline) forces fallback option (c) —
  mitigated by spiking first and making graceful degradation the acceptance bar.
- Skill prompt-budget overflow from the longer two-stage text — mitigated by the
  existing budget assertion failing fast in Phase 4, with prose trimming (not
  pin removal) as the fix.
- Agents skipping Stage 1 drafting — mitigated by making the verify step compare
  goal bytes against the draft file, so skipping is detectable in review.
- Survey never answered — mitigated by the assumptions table above; any late
  answer maps to a bounded step (q1/q2 → template + fixtures, q3 → Spike 2
  recipe, q4 → Stage 1 strictness line).

## Non-goals

- No change to `blockedBy` validation, idempotency, dedupe,
  caps, `execute` default, or recursion guard.
- **Approved exception — title derivation (2026-11-14, per survey q5 "small
  tweaks are allowed"):** `goal.slice(0, 60)` was replaced by
  `deriveTaskTitleFromGoal` (`api/work/taskIdentity.js`: goal's FIRST line
  only, capped at the same 60 chars, CRLF/CR-safe). Identical for every
  legacy single-line goal; only multi-line markdown goals change (they now
  take the `# title` line instead of a mid-document slice that leaked body
  text and raw newlines into card titles). Pinned by
  `api/work/taskIdentity.test.js` and `api/work/taskMarkdownGoal.test.js`.
- **Approved exception — fence-aware goal parsing (2026-11-14, amendment
  after review round 3):** `parseTaskMarkdown` re-reads the goal via
  `extractGoalSection` (`api/work/taskPersistence.js`) instead of the old
  regex, so a rich-markdown goal whose code fence contains `# History`-like
  example text round-trips byte-identically (clause A). Contract:
  - Terminators: `# History`, `# Timeline`, `# Process Logs`, `# Log Entries`
    (`# Log Entries` is new; whitespace around the heading is ignored, so an
    indented terminator now also ends the goal — the old regex required
    column zero).
  - Terminators inside a ` ``` ` / `~~~` fence are ignored; a fence closes
    only on the marker character that opened it.
  - Unclosed fence: falls back to the first terminator regardless of fences
    (same as the old regex), so an unbalanced fence never swallows History.
  - CRLF/CR goals normalize to LF on re-read. The `# History` section parser
    is unchanged (still regex-based).
  - Pinned by the `extractGoalSection fence-aware extraction` and
    `task goal containing section-like headings round-trips` suites in
    `api/work/taskPersistence.test.js`.
- No migration or re-formatting of existing tasks.
- No new image storage backend (branch-checkout flapping stays covered by the
  existing retry seam, per `docs/task-images.md`).
- No WYSIWYG editing or goal-format versioning (`goalFormat` fields, MIME types).

## Open questions

- None blocking: every survey question has a recorded assumption above. The one
  item to confirm with a human before Phase 3 is the Spike 1 mermaid decision,
  since it is the only new dependency-shaped choice.
