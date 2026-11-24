# Implementation Plan — Submit-Time Validation of Human Feedback Asset Refs

## Goal

Stop blind pipeline loops at the source. When a human submits review
feedback (or a rejection) whose markdown references `assets/*` files that
are not attached to the task — or submits image-only feedback with no
text — the submit must be blocked (or explicitly confirmed with the
missing filename named) and must offer recovery: attach the file inline
or convert to text-only feedback. Image-only feedback must carry a short
written description. The existing materialization + MISSING-ASSET warning
(task `b31cab50`) stays untouched as the backstop for legacy tasks with
dead refs. Follow "make change easy, then make the change": first build
one shared, well-tested validate-feedback helper reused by UI and API,
then wire it into every human-text submit path.

Note: this task's own prompt carries a MISSING-ASSET notice for
`assets/image.png` (screenshot unavailable). This plan is grounded in
source, not in the screenshot — which is itself a live demonstration of
the bug: the warning says we are blind but cannot recover the lost
information. Submit-time validation would have prevented this task from
entering the pipeline in that state.

## Context and Evidence

- Case study: task `cf4b6847-11eb-4d59-b39e-e31b31df1150` (per-pipeline
  base branch). Its 2026-11-20 Final review rejection reason was
  literally `![image.png](assets/image.png)`, the file never
  materialized, and
  [pr-review-20261120-183718.md](../cf4b6847-11eb-4d59-b39e-e31b31df1150/pr-review-20261120-183718.md)
  records agents working blind on the UI complaint ("There seems to be
  no way to edit this in the ui"). The MISSING-ASSET notice persisted
  into the retrospective stage.
- Prior art (downstream half, already shipped): task `b31cab50` —
  [IMPLEMENTATION_PLAN.md](../b31cab50-3ece-4678-a933-3192288fbefd/IMPLEMENTATION_PLAN.md).
  Delivered: shared grammar
  [shared/taskAssetRefs/](../../../shared/taskAssetRefs/index.js)
  (`extractAssetRefs`, `normalizeAssetSrc`), disk/branch resolution
  (`resolveAssetRef`, `findMissingAssetRefs`,
  `filterBranchBackedRefs`, `formatMissingAssetWarning`) in
  [taskAssets.js](../../../api/work/taskAssets.js), and the curate-time
  hook in [promptCuration.js](../../../api/promptCuration.js:1059-1097)
  plus the prompt-layout preview in
  [promptLayout.js](../../../api/routes/promptLayout.js:208). This
  ticket is the upstream half that work left open: nothing validates
  feedback at submit time.
- Human-text submit paths found in source (the inventory Step 0 must
  confirm is exhaustive):
  - Reject with feedback (board dialog):
    [FeedbackDialog.jsx](../../../frontend/src/components/FeedbackDialog.jsx:52-61)
    (`handleSubmit` only checks non-empty + not-uploading) →
    `rejectTaskWithFeedback` → `POST /tasks/:id/reject` in
    [taskFlowRoutes.js](../../../api/flow/taskFlowRoutes.js:545-594) →
    [rejectTask](../../../api/flow/taskControl.js:116-215), which
    appends feedback verbatim to the goal.
  - Fail Stage (review page modal):
    [TaskReviewPage.jsx](../../../frontend/src/components/tasks/TaskReviewPage.jsx:255-270)
    (`handleFail`, same minimal guard) → same reject API.
  - Pass guidance: `handlePass` in
    [TaskReviewPage.jsx](../../../frontend/src/components/tasks/TaskReviewPage.jsx:226-238)
    → `POST /tasks/:id/advance` (`guidance` joins the goal as
    `## Human Guidance`).
  - Follow-up / steer: `POST /tasks/:id/follow-up` (`prompt`) and
    `POST /tasks/:id/steer` (`guidance`/`goal`) in
    [taskFlowRoutes.js](../../../api/flow/taskFlowRoutes.js:291-394) →
    [followUpTask](../../../api/flow/taskControl.js:221-248) (appends
    `## Follow-up Guidance` to the goal).
  - Review comments / replies: `POST …/review/comments`,
    `PATCH …/review/comments/:id`,
    `POST …/review/comments/:id/replies` in
    [review.js](../../../api/routes/review.js) (body `minLength: 1`
    only; comments join the rejection report via
    `buildHumanRejectionContent`, so dangling refs in comments reach
    the retry prompt too). Composer UI:
    [ReviewCommentComposer.jsx](../../../frontend/src/components/review/ReviewCommentComposer.jsx).
  - Task create/edit goal text (goal editor + `TaskGoalSection.jsx`
    attach flow): the goal itself can carry a dangling ref from birth.
    Step 0 decides in-scope vs follow-up (recommendation: same helper,
    warn-only on create to avoid blocking task creation on
    eventual-consistency uploads).
- Upload/attach machinery already exists and is reused, not rebuilt:
  [taskImages.js](../../../api/routes/taskImages.js) (upload/list/serve/
  delete), [TaskImageAttach.jsx](../../../frontend/src/components/tasks/TaskImageAttach.jsx)
  (already embedded in both reject UIs), and markdown helpers
  (`appendImagesMarkdown`, `removeImageMarkdown`, `extractImageRefs`)
  in [taskImages.js](../../../frontend/src/services/taskImages.js).
- Verification tooling: `npm run test:unit` (primary gate =
  `test:api` + `test:frontend`), `npm run lint`, `npm run docs:check`;
  no long-lived dev servers (isolated headless runners, mock fixtures,
  `npm run capture:screenshot` if visual proof is needed).

## Survey Input (SURVEY.md) — Status and Assumptions

[SURVEY.md](./SURVEY.md) contains six questions across two rounds but no
recorded answers (`"answers": {}` in both rounds). The plan adopts the
Recommended option on every question; each is reversible at
implementation time, and if the owner answers before implementation,
their answers win.

| # | Survey question | Adopted answer | Where it lands in the plan |
|---|---|---|---|
| q1 | Dangling ref at send: block or warn-and-let-send? | Block until they attach the missing file or remove the mention | UI submit stays disabled + blocking dialog; API answers 422 naming the file. No send-anyway override (the legacy MISSING-ASSET backstop already covers old tasks, so a bypass would only mint new blind loops). The block-vs-confirm switch lives in one helper flag so it can be softened later as a small change. |
| q2 | Which boxes does the check cover? | Everywhere a person can write feedback (review comments + rejection reasons, …) | Reject (both UIs + API), pass guidance, follow-up, steer, review comments/replies. Task-create goal text: same helper, warn-only (see Step 0c). |
| q3 | Image-only feedback: require words or warn-and-allow? | Require a short written description before send | Submit blocked until prose exists outside image/link syntax; API 422 otherwise. |
| q4 | Which mentions does the check look at? | Only task attachments (`assets/` folder) | Detection = shared `extractAssetRefs` grammar only; absolute/protocol URLs and non-asset paths are ignored exactly as curation ignores them (no drift, no false blocks on external links). |
| q5 | What recovery do we offer at send time? | Attach the missing file right there, or send as words-only without the picture link | Blocking dialog has two actions: (a) attach inline via the existing `TaskImageAttach` uploader, then auto-resubmit; (b) strip the dangling refs (generalize `removeImageMarkdown`) and submit text-only. |
| q6 (optional) | How much writing for image-only? | Any short note explaining what the pictures show | Minimal bar: a small count of visible prose characters outside image/link markup, held in one named constant (proposed `MIN_FEEDBACK_PROSE_CHARS = 10`, tuned in review). Not an essay. |

Riskiest assumption is q1 (hard block vs confirm-to-send): a hard block
that false-positives (stale attachment list, branch-flap on the server)
would wedge human review. Mitigations are built into the design: the
client pre-check is advisory-instant but the server (disk + branch, same
two-tier rule as curation) is authoritative, and every block names the
file plus the recovery action, never a dead end.

## Success Criteria

- Acceptance (1): submitting feedback that references a non-attached
  `assets/*` file is blocked in the UI and rejected by the API (422),
  with the missing filename named in both. Covered by automated tests
  per entry point.
- Acceptance (2): image-only feedback (prose below the threshold after
  stripping image/link markup) cannot be submitted without a text
  description — blocked in the UI, 422 from the API. Covered by
  automated tests.
- Acceptance (3): existing tasks with dead references still get the
  MISSING-ASSET warning — the curate-time path is byte-identical for
  legacy tasks (existing `promptCuration` / `promptLayout` suites stay
  green; one new regression test pins it).
- No false blocks: drifted-but-servable refs (wrong case, spaces —
  `sanitizeImageName` parity, the same rule as `resolveAssetRef`) never
  block; external URLs never block; healthy submissions are
  byte-identical in behavior (no new latency beyond one cheap check,
  no prompt diff).
- Recovery works: from the blocked state the reviewer can attach the
  file inline and submit, or one-click convert to text-only and submit
  — both paths tested.
- Existing gates stay green: `npm run test:unit`, `npm run lint`,
  `npm run docs:check`.

## Approach

Two phases, in this order:

1. **Make change easy.** Research spikes first (reproduce both failure
   modes end-to-end; exhaustively inventory human-text entry points;
   settle the image-only definition and the block UX against the real
   dialogs), then build one small shared validation helper — parse refs
   (reuse), detect image-only (new), validate against present assets
   (new) — with unit tests proving each piece in isolation before any
   UI or route is touched.
2. **Make the change.** Wire the helper into the frontend submit paths
   (instant pre-check + blocking recovery dialog) and the API routes
   (authoritative 422), keeping the legacy warning path untouched; then
   verify end-to-end (including the legacy backstop) and document.

Key decisions:

- **One shared validation core, two enforcement shells.** The grammar
  (`extractAssetRefs`) and the new predicates (`isImageOnlyFeedback`,
  `findMissingRefsAgainst`) live in `shared/` so UI and API can never
  drift; the UI shell gives instant feedback + recovery actions, the
  API shell is authoritative (a non-UI client must not bypass the
  check). Server presence = disk OR task branch (reuse
  `resolveAssetRef` + `filterBranchBackedRefs`), so branch-flap can
  never hard-block a human.
- **Client pre-check is instant but never the final word.** The dialog
  checks the draft against the just-listed attachment names
  (`listTaskImages`, refreshed when the dialog opens); on submit the
  server re-validates and a 422 re-opens the recovery dialog with the
  server-named files. This closes the TOCTOU gap (attach deleted
  between list and submit, concurrent edit) without ever stranding the
  reviewer.
- **Recovery, not rejection.** Every block offers q5's two exits —
  attach-inline (existing uploader component, already mounted in both
  reject UIs) or strip-to-text-only (generalized
  `removeImageMarkdown`) — so the block is a speed bump with a ramp,
  never a wall.
- **Curation untouched.** No change to `promptCuration.js`,
  `taskAssets.js` resolution, or the warning format: acceptance (3) is
  proven by existing tests staying green plus one new legacy
  regression test, not by rework.

## Steps

### Step 0 — Reproduce and inventory (research; do first)

- 0a. Reproduce both failure modes end-to-end against the real code:
  (i) `POST /tasks/:id/reject` with
  `![image.png](assets/image.png)` and no bytes → today 200, feedback
  lands verbatim in the goal, next curated prompt carries a raw dangling
  ref (+ MISSING-ASSET warning); (ii) image-only feedback (only
  `![…](…)` lines, attached or not) → today 200 with zero prose.
  Capture before/after request + curated-prompt fixtures. Confirms the
  exact insertion points and gives Steps 4–5 their acceptance fixtures.
- 0b. Exhaust the human-text inventory: grep all routes that append
  human text to goal/feedback/failure context (`/reject`, `/advance`
  guidance, `/follow-up`, `/steer`, review comment/reply CRUD, task
  create/update goal, retrospective chat?) and all composers that call
  them (`FeedbackDialog`, `TaskReviewPage` fail + pass modals,
  `ReviewCommentComposer`, goal editor, glasses quick-review approve
  path). Record the final in-scope list; anything deferred (e.g.
  retrospective chat, agent-guide CLI surface) is named explicitly as a
  follow-up, not silently dropped. Blocks Steps 2–3.
- 0c. Settle the two definitions against real data: (i) image-only —
  sample historical rejection reasons / goals for image-markup shapes
  (angle destinations, titles, multi-image, mixed link+image) and fix
  the strip-rule + `MIN_FEEDBACK_PROSE_CHARS` corpus; (ii) task-create
  goal — confirm uploads land before/after goal save to decide
  warn-only vs block on create (default warn-only: creation must not
  wedge on eventual consistency).
- 0d. UX spike in the two reject dialogs (no behavior change yet):
  confirm where the blocking dialog + inline attach + strip-to-text-only
  actions mount (`TaskImageAttach` is already in both; check the pass
  modal and comment composer need it added), and confirm the 422 →
  reopen-dialog error contract. Sketches the Step 2 component diff.
- Depends on: nothing. Blocks: Steps 1–3.

### Step 1 — Make change easy: shared validation helper + unit tests

- Add one small shared module (e.g.
  `shared/feedbackValidation/` beside `shared/taskAssetRefs/`,
  following its one-function-per-file layout) implementing:
  - `isImageOnlyFeedback(markdown, { minProseChars })` — strips
    image/link markup (shared grammar + title/angle tolerance from
    the Step 0c corpus) and reports whether remaining visible prose
    meets the bar. Pure, sync, UI-safe (no fs).
  - `findMissingRefsAgainst(markdown, presentNames)` — refs from
    `extractAssetRefs` minus the present set, with
    `sanitizeImageName`-parity: a ref whose canonical form matches a
    present name counts as present (same rule as `resolveAssetRef`,
    so drifted-but-servable refs never block). Pure, sync.
  - `validateHumanFeedback(markdown, presentNames, opts)` — one
    decision returning `{ ok, missing[], imageOnly }` plus
    caller-ready messages naming every missing file; the single home
    of the q1 block-vs-confirm flag and the q6 prose constant.
  - Generalize `removeImageMarkdown` (or add
    `stripMissingRefs(markdown, missing[])`) so the text-only
    recovery removes exactly the dangling refs and leaves prose +
    healthy refs intact.
- Thin backend adapter in `api/work/` (e.g. `validateFeedbackAssets`)
  that builds `presentNames` from disk (`listTaskImages`) union the
  task branch (`filterBranchBackedRefs` semantics) and delegates the
  decision to the shared helper — the API shells stay one-liners.
- Unit tests alongside existing suites (`shared/` + `api/work/`
  style): Step 0c corpus (angle/title/multi-image/mixed), parity cases
  (drifted-but-present ⇒ ok; truly absent ⇒ named; external URL ⇒
  ignored), image-only boundary (empty/whitespace/markup-only below
  bar, short note above bar), strip-exactness (only dangling refs
  removed), empty-input no-ops.
- Prove the helper against the Step 0a fixtures in isolation before
  touching any dialog or route.
- Depends on: Step 0. Blocks: Steps 2–3.

### Step 2 — Make the change, UI shell: instant pre-check + recovery dialog (do early)

- Wire the shared helper into the in-scope composers from Step 0b
  (both reject UIs first — the case-study path — then pass guidance,
  follow-up/steer inputs, comment composer/replies):
  - Live pre-check against freshly listed attachment names: dangling
    refs and image-only state render inline (naming the files) as the
    draft changes; submit stays disabled while uploading (existing)
    and while invalid.
  - On submit attempt while invalid: blocking dialog per q1/q5 naming
    every missing file with the two recovery actions — attach inline
    (existing uploader; auto re-validate + submit on success) or
    convert to text-only (strip dangling refs, keep prose, submit) —
    plus cancel. Image-only blocks name the missing description and
    focus the composer.
  - Server 422 (Step 3) re-opens the same dialog with the
    server-authoritative file list, so a stale client list can never
    strand or falsely accuse.
- Frontend tests (vitest, mock fixtures — no dev servers): per dialog,
  dangling ref ⇒ blocked + names file; attach-inline ⇒ submits;
  strip-to-text-only ⇒ submits prose-only; image-only ⇒ blocked until
  a note is added; healthy draft ⇒ unchanged behavior; 422 ⇒ dialog
  re-opens with server names.
- Depends on: Steps 0–1. Blocks: Step 4.

### Step 3 — Make the change, API shell: authoritative 422 (do with Step 2)

- Add the one-line validation call to each in-scope route from Step
  0b (`/reject`, `/advance` guidance, `/follow-up`, `/steer`, review
  comment create/update/reply, + task goal create/update per the Step
  0c decision): on failure answer `422 { error, code, missing[],
  imageOnly }` naming every missing file — never a silent 400. Success
  paths are untouched (no prompt/store changes).
- Presence rule is disk OR task branch (Step 1 adapter), mirroring
  curation's two-tier check, so branch-flap between upload and submit
  cannot 422 a human.
- API tests per route: dangling ref ⇒ 422 naming `assets/<name>`;
  image-only ⇒ 422 with `imageOnly`; drifted-but-servable ⇒ 200;
  external-URL-only ⇒ 200; no refs ⇒ 200 byte-identical behavior.
- Depends on: Steps 0–1. Blocks: Step 4.

### Step 4 — Verify end-to-end, legacy backstop, and document

- Re-run the Step 0a reproductions: the same dangling-ref submit must
  now block in the UI and 422 from the API (naming the file), with
  both recovery exits landing a clean submit; the same image-only
  submit must block until prose is added. Assert mechanically per
  entry point: invalid ⇒ blocked/422, recovered ⇒ accepted.
- Legacy backstop check (acceptance 3): a pre-existing task with a
  dead ref (no resubmit — straight to curation) must still render the
  identical MISSING-ASSET warning; pin with one new regression test
  and confirm the existing `promptCuration` / `promptLayout` suites
  are green and byte-identical.
- Run gates: `npm run test:api`, `npm run test:frontend` (i.e.
  `npm run test:unit`), `npm run lint`, `npm run docs:check`. If a
  visual check of the blocking dialog is warranted, use
  `npm run capture:screenshot` (headless, isolated) — no long-lived
  servers.
- Update docs: extend [task-images.md](../../task-images.md) and
  [site-docs/task-images.md](../../../site-docs/task-images.md) with
  the submit-time behavior (what blocks, the 422 contract, the two
  recovery exits, the prose bar, and that legacy tasks keep the
  warning); note the shared helper as the single grammar/decision
  owner. If the owner answers SURVEY.md first, record the adopted
  answers here.
- Depends on: Steps 2–3.

## Validation Plan

| Check | Command / method | Expected evidence |
|---|---|---|
| Shared helper units (new) | `npm run test:api` + `npm run test:frontend` incl. new Step 1 tests | Step 0c corpus all classified; drifted-but-present ⇒ ok; external URLs ignored; strip removes only dangling refs |
| Image-only boundary (new) | Same | Markup-only/empty below bar ⇒ imageOnly; short note above bar ⇒ ok |
| UI block + recovery (new) | `npm run test:frontend` (dialog/composer suites) | Dangling ref ⇒ blocked naming file; attach-inline ⇒ submits; text-only ⇒ submits; image-only ⇒ blocked until note; 422 ⇒ dialog re-opens |
| API 422 per route (new) | `npm run test:api` (route suites) | Each in-scope route: dangling ⇒ 422 naming files; image-only ⇒ 422; healthy ⇒ 200 unchanged |
| Acceptance end-to-end | Step 4 reproduction script (Step 0a fixtures) | Per entry point: invalid blocked/422, recovered accepted — no silent third state |
| Legacy backstop (new regression) | `npm run test:api` (promptCuration suite) | Dead-ref legacy task still renders identical MISSING-ASSET warning |
| No-regression curation | Same suites, unmodified | Byte-identical prompts for healthy tasks (layout/baseline tests green) |
| Full unit gates | `npm run test:unit` | All pass |
| Lint | `npm run lint` | Clean |
| Docs gates | `npm run docs:check` | Clean; new behavior documented in both task-images docs |

Highest-risk validation: **false blocks in real review flow** — a stale
client attachment list or branch-flap 422ing a legitimate submit. The
design answers with server authority (disk OR branch) + 422-reopens-
dialog, and Step 4 must exercise exactly that race (delete/rename an
asset between dialog open and submit; curate while a sibling branch is
out) rather than only the happy path.

## Risks / Open Questions

- **Survey unanswered**: q1–q6 assumptions above stand until the owner
  answers; riskiest is q1 (hard block vs confirm-to-send) — kept to a
  single flag in the shared helper so softening it later is a small,
  localized change spanning UI + API consistently.
- **Everywhere-scope creep (q2)**: "everywhere a person can write
  feedback" is bounded by the Step 0b inventory; the likely deferrals
  (retrospective chat, CLI/agent-guide surfaces) must be named as
  follow-ups in the implementation report, with the API 422s already
  covering any client of the in-scope routes.
- **Task-create goal text**: uploads may land after the goal saves;
  default is warn-only on create (Step 0c confirms) so creation never
  wedges — a dangling ref minted here is still caught downstream by
  the untouched MISSING-ASSET backstop.
- **Non-goals**: changing upload limits/allowlist, backfilling or
  mutating stored text, base64-embedding bytes, and any change to the
  curate-time warning (format, placement, branch-flap rule) — the
  backstop is proven, not reworked.
- **Rollback**: UI shell reverts to today's guards (non-empty +
  not-uploading); API shell reverts by removing the validation call
  (422s vanish, 200s return). The legacy warning path is never
  touched, so rollback cannot strand old tasks.
