# Implementation Plan — Always save attachments to the task folder

## Goal

Every file attached to a task — from the task description/goal editor, from a
failure/rejection feedback flow, and (per scope decision) from comments — is
ingested into that task's own folder (`docs/tasks/<taskId>/assets/`), stored
under a safe deterministic name, committed on the task branch, and referenced
from task text only by its new task-relative path, so a Runner on any box
(local or remote) can resolve the reference. Works for images and for any
other attached file type.

## Success Criteria

- Attaching a file through any in-scope surface lands bytes in that task's
  `assets/` folder under a sanitized, deduped name; the task text references
  only the new `assets/<name>` path (no absolute paths, no `/tmp`, no
  out-of-task relative paths, no stale names).
- A Runner claiming the task on a different box (no shared filesystem) has the
  referenced bytes in its worktree's task folder before the first stage runs,
  for images and non-image attachments alike.
- Existing image behaviour is preserved: upload/list/serve/delete, thumbnail
  strips, failure-message thumbnails, `MISSING-ASSET` warnings, survey images,
  and the branch-flap handling in `docs/task-images.md` keep working.
- Oversized/unsupported attachments fail with a clear, actionable message;
  nothing silently drops and nothing silently embeds base64 in markdown.
- `npm run test:unit` passes; new behaviour is covered by unit/integration
  tests; docs (`docs/task-images.md`, `site-docs/task-images.md`) describe the
  generalized attachment lifecycle.

## Context — what exists today (verified in-repo)

- **Image assets live beside `task.md`.** `api/work/taskAssets.js` owns
  `taskAssetDir`, `sanitizeImageName`, `dedupeImageName`, `listTaskImages`,
  `writeTaskImage`, `deleteTaskImage`, `resolveAssetRef`,
  `findMissingAssetRefs`, `filterBranchBackedRefs`, `formatMissingAssetWarning`,
  `collectTaskAssetPayload`. Storage: `<cwd>/docs/tasks/<taskId>/assets/`;
  markdown refs are relative (`![alt](assets/<name>)`).
- **Upload/list/serve/delete API.** `api/routes/taskImages.js` (`POST|GET|
  GET :name|DELETE /projects/:id/tasks/:taskId/images[/:name]`) enforces an
  image-only extension allowlist (`png/jpg/jpeg/gif/webp`), a declared
  `image/*` MIME check, per-file cap (`taskImageMaxBytes`, default 10 MiB) and
  per-task count cap (`taskImageMaxPerTask`, default 20) from
  `api/config/schema.js`, plus traversal-safe resolution and a canonical-name
  serve fallback.
- **Shared ref grammar.** `shared/taskAssetRefs/` (`normalizeAssetSrc`,
  `extractAssetRefs`) is the single owner of the `assets/<name>` destination
  grammar; backend curation and the frontend viewer both resolve through it.
- **Frontend attach surfaces.** `TaskImageAttach.jsx` (picker + paste-to-upload,
  scope guard against cross-task batches) is used by the goal editor and by
  `FeedbackDialog.jsx` (rejection feedback appends `![name](assets/name)` via
  `appendImagesMarkdown` in `frontend/src/services/taskImages.js`). Failure
  text renders thumbnails via `FailureMessage.jsx` +
  `FailureMessageImage.jsx` (only `assets/` refs with full task context).
- **Agent delivery, local Runners.** `syncTaskDocs` in `runner/project.js`
  mirrors the task folder including `assets/` into the per-task worktree
  (never copies backend-owned `task.md`); daemon log reports the synced asset
  count.
- **Agent delivery, remote Runners.** `taskAssetsFor` in
  `api/flow/runnerRoutes.js` ships `collectTaskAssetPayload` (images only,
  per-file `taskImageMaxBytes`, total `taskImageMaxAttachBytes`); the daemon
  writes entries the worktree lacks via `writeClaimTaskAssets` (flat
  allowlisted image names only, strict base64, size-capped, never overwrites).
- **Copy-or-warn curation.** `PromptCurationEngine.curatePrompt` resolves every
  `assets/<name>` ref (`findMissingAssetRefs`) and prepends
  `# Missing Task Assets` (`{{missingAssets}}`) when bytes are absent on disk
  and on the task branch (`filterBranchBackedRefs`, one `git ls-tree`).
- **Commits.** Stage work auto-commits on the task branch (`api/work/
  taskFinalize.js`: `commitFailedStageWork`, finalize auto-commit;
  `runner/gitOps.js commitAndPush` on the Runner side; lifecycle proved in
  `api/flow/stageLifecycle.integration.test.js`). Uploaded assets are tracked
  files, so branch checkouts decide what is on disk (the documented flap
  shape; client retry + `MISSING-ASSET` second look mitigate it).
- **Survey images** (`api/imageGen/surveyImages.js`) also write into the same
  `assets/` folder via `writeTaskImage`/`deleteTaskImage` — any rename of
  those helpers must keep this caller working.

### Gap analysis (why this task exists)

1. **Images-only.** Every layer allowlists image extensions/MIME: non-image
   attachments (logs, docs, zips, video) have no ingest path, no serving path,
   and are excluded from the remote claim payload and from
   `writeClaimTaskAssets`.
2. **No ingest-and-rewrite for pasted/typed references.** Anything that enters
   task/failure text as a non-`assets/` path (absolute path, `/tmp/…`,
   worktree-relative path, agent-written file elsewhere in the repo) is never
   copied into `assets/`, never renamed, and never rewritten — the remote
   Runner then references a path that exists only on the origin box.
3. **Failure-path attachments are the sharpest case.** Rejection feedback goes
   through `TaskImageAttach` (covered for images), but agent/CI failure
   reports can name files the agent wrote outside the task folder; those bytes
   never ride the claim payload and may not even ride the task branch.
4. **Commit timing.** Uploads land as untracked files beside `task.md`; they
   become branch content only when a later auto-commit sweeps them. A Runner on
   another box that relies on git (rather than `syncTaskDocs`/claim bytes)
   can observe the ref before the bytes exist on the branch.

## Survey input (`SURVEY.md`) — factored in

`SURVEY.md` (round 1, generated 2026-11-25) asks five questions; **`answers`
is currently empty**, and the referenced `idea-20261125-123059.md` is not
present in the task folder. The plan therefore treats all five as open
decisions with task-text-pinned defaults where the task statement already
decides them:

| # | Question | Task-text pin | Recommended default | Plan handling |
|---|----------|---------------|---------------------|---------------|
| q1 | Scope: everywhere (description + failures + comments) vs description+failures vs description only | Task names "the task or in a failure" | **Description + failure reports first; comments as a follow-up slice** (keeps the first change reviewable; comments reuse the same ingest helper) | Phase 2 is sliced so comments can be enabled by configuration without rework; decision gate before Phase 2 confirms scope |
| q2 | Any file type vs pictures only | **Pinned: any file type** ("images or any other file references") | Any file type behind an explicit allowlist + size caps | Phase 2 generalizes the allowlist; research spike R1 sizes the security review |
| q3 | Fix old tasks' attachments too vs new-only | Unpinned | **New attachments first; backfill as an explicit opt-in Phase 3** (best-effort, local-path refs are often unrecoverable) | Phase 3 is a separate, skippable work unit with its own validation |
| q4 | Auto-update links to the new copy vs leave old links | **Pinned: update references** ("References in the task should be updated") | Rewrite refs to the new `assets/<name>` at ingest time | Core Phase 2 behaviour; idempotent rewriter with tests |
| q5 | Save huge files anyway vs size limit + clear message | Unpinned | **Size limit + clear message** (consistent with existing 413s and the 10 MiB remote payload caps) | Research spike R1 proposes limits; UX copy covered in tests |

**Decision gate:** confirm q1 scope, q3 backfill yes/no, and q5 limits before
Phase 2 starts. q2 and q4 are already decided by the task statement and are
not re-asked.

## Approach — make change easy, then make the change

The image-only pipeline is load-bearing (upload, serve, curation warnings,
local + remote delivery, survey generation). Generalizing it in place without
preparation risks breaking every surface at once. So:

1. **Research spikes first** (Phase 0) — resolve the biggest unknowns
   (attachment entry-point inventory, failure-path provenance, remote-delivery
   sizing, commit strategy, security surface of generic files) before any
   production edit.
2. **Make change easy** (Phase 1) — pure refactors behind the existing API:
   generalize `taskAssets` helpers from image-only to attachment-capable while
   keeping image behaviour byte-identical, extract one ingest + one
   ref-rewrite helper, and add fixture/test seams. No behaviour change; the
   existing suite must pass untouched.
3. **Make the change** (Phase 2) — enable ingest-and-rewrite per surface,
   generic serving, remote shipment of non-images, and commit assurance, one
   slice at a time.
4. **Backfill + docs + rollout** (Phases 3–4) — optional migration, then
   documentation and rollout/rollback.

## Steps

### Phase 0 — Research spikes (do first; biggest unknowns earliest)

- **R1. Attachment entry-point + type inventory (largest).** Grep and
  enumerate every path by which a file reference can enter task text:
  goal editor + `TaskImageAttach`, `FeedbackDialog`, agent-authored goal
  edits, CI/agent failure reports (`handleStageFailure`,
  `applyRunnerReport`, `curateRunnerPrompt` inputs), comments (identify the
  exact store/route), survey content. For each: what path shapes occur today
  (absolute, `/tmp`, worktree-relative, repo-relative, `assets/`, URL)? Which
  file types occur in the wild (sample recent task folders)? Output: a table
  `surface → path shapes → types → current bytes location`, plus the proposed
  generic allowlist (extensions + MIME sniffing vs declared MIME) and size
  limits (per-file, per-task-count, per-payload-total) for the q5 decision.
- **R2. Failure-attachment provenance.** Trace one real failing task end to
  end: where does the failing stage's report live, what file paths can the
  agent/CI put in it, which of those survive to `failureReason`/failure
  report/`history`, and which are visible to the next Runner on another box
  today. Confirm whether failure attachments need ingest at report-write time
  (backend) vs at Runner wrap-up time (Runner side) vs both. Output: sequence
  note naming the exact functions/files to hook.
- **R3. Remote-delivery sizing.** Measure: current claim payload sizes in the
  wild; what happens to claim/lease latency if non-image bytes ride along;
  whether `taskImageMaxAttachBytes` needs a sibling cap (e.g.
  `taskAttachmentMaxAttachBytes`) or a shared budget; largest sane per-file
  cap for non-images. Check `runner/project.js` constants
  (`RUNNER_TASK_ASSET_MAX_BYTES`) and the strict-base64/size guards that must
  be generalized. Output: cap proposal + payload budget rule.
- **R4. Commit strategy.** Decide exactly when ingested bytes become branch
  content: (a) rely on existing stage auto-commits (simplest; leaves a window
  where ref exists but bytes are untracked), (b) commit the `assets/` dir at
  ingest time on the task branch (closes the window; needs care on main-branch
  contexts and concurrent uploads), or (c) hybrid (ingest-time commit only
  when on a task branch, else auto-commit sweep). Verify against
  `commitAllIfNeeded` (never stages live `task.md`), the pre-commit binary
  guard (`scripts/githooks`, `ensureRepoHooksPath`), and worktree-isolation
  vs shared-checkout modes. Output: one chosen strategy with the exact commit
  call sites.
- **R5. Security + serving review.** Generic files change the serving threat
  model: content-sniffing (`nosniff` already set — keep), `Content-Disposition`
  (inline vs attachment per type; never render user HTML/SVG inline),
  extension/MIME spoofing, zip-bomb/decompression limits, executable uploads,
  and traversal/overwrite rules (keep: flat sanitized names, dedupe-never-
  overwrite). Output: serving header matrix per type class + validation rules
  for the generalized writer.

Exit criteria for Phase 0: the q1/q3/q5 decision gate is answered; R1–R5 notes
land in the task folder; Phase 2 slices are confirmed or adjusted.

### Phase 1 — Make change easy (refactors; no behaviour change)

- **1.1 Generalize `api/work/taskAssets.js` internals.** Introduce
  attachment-capable primitives alongside the image ones (e.g.
  `sanitizeAttachmentName`, `isAllowedAttachmentExt`,
  `attachmentMediaType`, `listTaskAttachments`, `writeTaskAttachment`,
  `deleteTaskAttachment`) with the image functions delegating to them;
  image-only call sites keep identical behaviour (same names, same caps,
  same errors). Add unit tests proving delegation equivalence
  (`api/work/taskAssets.test.js`).
- **1.2 Extract ingest + rewrite helpers (pure, tested).** New small modules:
  `ingestAttachment({ cwd, taskId, sourceBytes|sourcePath, originalName }) →
  { name, relPath }` (sanitize → dedupe → write, caps enforced, never
  overwrites) and `rewriteRefsToAssets(markdown, mapping)` (replaces only the
  exact matched destinations, idempotent, leaves absolute URLs with unknown
  provenance flagged rather than rewritten). Cover with unit tests including
  traversal names, dupes, empty input, and non-asset URLs.
- **1.3 Extend the shared grammar carefully.** `shared/taskAssetRefs/` already
  detects `assets/<name>` extension-agnostically for links and images — verify
  it needs no change for non-image link refs (`[log](assets/out.log)`); if the
  frontend needs non-image rendering (download chips vs thumbnails), add a
  pure classifier (`isViewableImageRef` vs `isDownloadableAssetRef`) in
  `frontend/src/services/taskImages.js` with tests. No UI change yet.
- **1.4 Test seams + fixtures.** Add temp-task-folder fixtures (happy path,
  traversal names, dupe names, oversized file, missing ref, non-image ref)
  shared by API and Runner tests; add a fake-claim round-trip harness
  (collect → write → resolve) for Phase 2 delivery tests.

Phase 1 validation: full `npm run test:unit` green with zero behaviour
change; new helpers at 100% branch coverage on their own tests.

### Phase 2 — Make the change (behaviour; sliced)

- **2.1 Task-description ingest + rewrite.** On task create/update paths that
  accept goal text with attachments: ingest each attached/out-of-task file
  into `assets/`, rewrite its reference to the stored name, then persist.
  Keep the existing direct-upload endpoint working (it already stores +
  returns the canonical name; the editor keeps appending `![name](path)`).
  Errors (oversize, disallowed type) return structured 4xx with the same
  `reason`-code style as `taskImages.js` and a UI message naming the file and
  the limit.
- **2.2 Failure/feedback ingest + rewrite.** Hook the failure-report and
  rejection-feedback write paths identified in R2: any file the report text
  references that is resolvable on the writing box is ingested into the
  task's `assets/` and the report/`failureReason` text rewritten to the new
  name. Unresolvable refs (other box's local path, already-gone `/tmp`) keep
  their text and gain `MISSING-ASSET` coverage via the existing
  `findMissingAssetRefs`/`formatMissingAssetWarning` path (extended to the
  generalized asset set).
- **2.3 Generic serving + listing.** Extend `GET …/images…` (or add a sibling
  `…/attachments…` route reusing the same guards) to serve non-image assets
  with the R5 header matrix; extend listing to include non-images (images
  keep their shape; new entries add a `kind`/download hint). Frontend:
  download chips/links for non-images wherever thumbnails appear today
  (task strip, `FailureMessage` strip, explorer preview); images render
  exactly as before.
- **2.4 Remote-Runner delivery for all attachments.** Generalize
  `collectTaskAssetPayload` (budget per R3), `taskAssetsFor`, and
  `writeClaimTaskAssets` beyond images (same flat-name, strict-decode,
  size-cap, never-overwrite discipline). `syncTaskDocs` already copies the
  whole task folder for local Runners — verify non-image assets flow and add
  a regression test asserting `stats.assets` counts them.
- **2.5 Commit assurance (per R4).** Implement the chosen commit strategy so an
  ingested attachment is on the task branch promptly (not stranded untracked);
  keep `task.md` uncommitted, keep the binary-guard hooks passing, and log the
  commit linkage (task history entry naming the ingested files).
- **2.6 (Optional slice) Comments.** If the q1 gate includes comments, route
  comment attachments through the same `ingestAttachment` + rewriter. If
  deferred, leave the helper in place and record the follow-up.

Each 2.x slice ships with its own tests (see Validation Plan) and can land
independently in the order 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6.

### Phase 3 — Backfill for old tasks (only if q3 = yes)

- **3.1 Dry-run auditor.** A script/command that scans task folders for
  non-`assets/` refs and `assets/` refs with missing bytes, reporting
  `surface → ref → expected path → recoverable?` without writing.
- **3.2 Best-effort repair.** For refs whose bytes are still resolvable
  (same-box absolute/relative paths, on-branch bytes per
  `filterBranchBackedRefs`, sibling-task orphans with confirmed ownership):
  ingest + rewrite + commit. Dangling refs (bytes nowhere) are left in place
  with `MISSING-ASSET`/chip visibility — never auto-deleted, never
  cross-task-merged. Per the existing Repairs doctrine: no hand-copies into
  the live tree; recover branch-stranded bytes via `git show`.
- **3.3 Report.** Per-task before/after note in the task folder; summary of
  repaired vs still-dangling refs.

### Phase 4 — Documentation, rollout, cleanup

- Update `docs/task-images.md` (rename or add an attachments section covering
  the generalized lifecycle, caps, header matrix, and repair runbook) and
  `site-docs/task-images.md` (+ `site-docs/` index if needed); update the
  create-task skill ordering note for non-image attachments.
- Add/refresh config docs for any new keys (schema `doc` strings +
  `docs:check` coverage), following the existing `taskImage*` pattern.
- Rollout: feature-flag or per-surface enablement if the R-studies recommend
  it; rollback = disable ingest (uploads keep working; refs stay as typed).
  No data migration on rollback — ingested files are ordinary tracked assets.

## Validation Plan

- **Primary gate:** `npm run test:unit` (== `test:api` + `test:frontend`)
  green on every slice; `npm run docs:check` green after doc updates; existing
  suites (`api/work/taskAssets.test.js`, `api/routes/taskImages.test.js`,
  `frontend/src/services/taskImages.test.js`, `TaskImageAttach.test.jsx`,
  `FailureMessage.test.jsx`, `runner/project.test.js`, `runner/daemon.test.js`,
  `stageLifecycle.integration.test.js`) must pass unmodified through Phase 1.
- **New unit tests:** sanitize/dedupe/write/list/delete equivalence (images
  vs generic); ingest helper (traversal, dupes, caps, empty, non-buffer);
  ref rewriter (exact-match replacement, idempotence, URL passthrough);
  grammar classifier for non-image link refs; serving header matrix per type.
- **New integration tests:** end-to-end attach → ingest → rewrite → serve for
  (a) goal text, (b) rejection feedback, (c) failure report; remote-claim
  round trip (collect → write → resolve) for a mixed image + log + doc
  fixture with per-file and total caps enforced; commit-assurance test
  (bytes on task branch after ingest, `task.md` untouched); backfill dry-run
  vs apply on a fixture task.
- **Negative tests:** oversized file → 413 + message naming file + limit;
  disallowed type → 400 + reason code; traversal filename → collapsed safe
  name; duplicate name → `-2` suffix, original untouched; corrupt base64
  claim entry → skipped, warning kept; missing bytes → `MISSING-ASSET` block
  present, prompt otherwise byte-identical when healthy.
- **Headless/UI checks (no long-lived servers):** existing mock fixtures +
  `npm run capture:screenshot` for the attach strip, feedback dialog, and
  failure-message thumbnail/download strip; assert
  `data-task-image-state="unavailable"` behaviour is unchanged for genuinely
  missing files.
- **Manual verification:** attach an image + a log to a task, fail a stage
  with a referenced file, claim on a second box (or simulated no-primary
  checkout), and confirm every reference resolves from the task folder.

## Risks / Open Questions

- **Survey unanswered.** q1 scope, q3 backfill, q5 limits need the decision
  gate before Phase 2; q2/q4 are pinned by the task statement. If the gate
  answers differently (e.g. new-only, description-only), Phase 2/3 slices
  shrink without redesign.
- **Claim payload bloat.** Shipping arbitrary files to remote Runners can
  inflate claims; R3 sizes the budget and the per-type caps before enabling.
- **Serving user files safely.** R5 must sign off the header matrix (never
  inline-render attacker-controlled HTML/SVG) before 2.3 lands.
- **Commit contention.** Ingest-time commits on a shared checkout can collide
  with stage checkouts/auto-commits; R4 picks the strategy (hybrid default)
  and 2.5 proves it with a concurrency test.
- **Unrecoverable history.** Old refs to gone `/tmp` paths cannot be healed;
  Phase 3 explicitly leaves them visible rather than deleting them.

## Non-goals

- Changing the image UX (thumbnails, retry budget, `immutable` caching) beyond
  adding non-image download affordances.
- Per-branch serving, a branch-independent asset store, or default worktree
  isolation (already deliberately out of scope in `docs/task-images.md`).
- External-URL mirroring (absolute `https://` refs keep passing through).
