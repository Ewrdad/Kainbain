# Research notes — R1–R5 (Phase 0)

Decision gate answers (survey unanswered; q2/q4 pinned by task text):

- q1 scope: **everywhere** — task description, failure/rejection text, failure
  reports, and review comments. One shared helper
  (`ingestOutOfTaskRefs` in `api/work/taskAssets.js`) makes comments cheap.
- q2 types: **any file type** behind an explicit allowlist + caps (pinned).
- q3 backfill: **opt-in auditor script** (dry-run default, `--apply` repairs
  only resolvable refs; dangling refs left visible, never deleted).
- q4 refs: **rewrite to `assets/<name>` at ingest** (pinned), idempotent.
- q5 size: **limit + clear message** (413/400 with reason codes, UI names
  the file and the limit).

## R1 — entry-point inventory

| surface | write path | path shapes today | fix |
|---|---|---|---|
| goal editor | `PATCH /tasks/:id` goal, `POST /tasks` goal (`api/work/taskWorkRoutes.js`) | `assets/` (via upload), absolute/`/tmp`/relative (pasted), URLs | ingest+rewrite hook in both handlers; upload endpoints unchanged + new `/attachments` sibling |
| picker/paste upload | `TaskImageAttach.jsx` → `POST .../images` (+ new `.../attachments`) | File objects | broaden picker to allowed attachments; images keep `/images`, rest → `/attachments` |
| rejection feedback | `FeedbackDialog.jsx` → `POST /tasks/:id/reject` → `rejectTask` (`api/flow/taskControl.js`) | `assets/` + pasted paths | ingest+rewrite `cleanFeedback` inside `rejectTask` (has `projectCwd`) |
| agent/CI failure | `applyRunnerReport` → `routeStageError` → `handleStageFailure` (`api/flow/routing/orchestrators/`) | `assets/`, worktree paths (remote box, NOT backend-resolvable), backend paths | best-effort backend ingest for backend-resolvable paths; remote-worktree bytes are a documented limit (runner ships text only) |
| review comments | `POST .../review/comments` (`api/routes/review.js` → reviewStore) | same as goal | ingest+rewrite comment body at write |
| survey content | `api/imageGen/surveyImages.js` via `writeTaskImage` | generated images | no change (delegation keeps it working) |
| prompt curation | `api/promptCuration.js` `missingAssets` | `assets/` refs | automatic: generalized `findMissingAssetRefs` covers non-images |

Resolution bases for out-of-task refs (backend): absolute path as-is;
relative paths resolved against (1) the task folder, (2) project cwd —
first readable regular file wins; symlinks rejected; must stay inside
project cwd or the OS temp dir.

## R2 — failure provenance

Rejection: `FeedbackDialog` draft → `rejectTask` persists feedback into
report content + goal appendix + `failureReason`/`lastError`. Hook inside
`rejectTask` covers all four copies at once.
Agent/CI: text-only completion payload → `handleStageFailure` renders the
report. Runner worktree files never reach the backend (no binary channel),
so backend ingest heals only backend-resolvable paths; the runner-side
ingest (copy + rewrite before reporting + ride `commitAndPush`) is
recorded as a follow-up, not this stage.

## R3 — remote-delivery sizing

Claim payload keeps its current budget shape: per-file cap + total cap,
defaults unchanged (10 MiB / 10 MiB) via chained config refs
(`taskAttachmentMaxBytes` → `taskImageMaxBytes`, etc.). Entries sorted
images-first (vision priority), then by name; deterministic. No latency
change: same total bytes at most. Runner `writeClaimTaskAssets` accepts
the generalized name class with identical discipline (flat, sanitized,
strict base64, size-capped, never overwrite). `syncTaskDocs` already
copies the whole task folder (non-images included) — regression test
only.

## R4 — commit strategy

Hybrid (c): ingest-time **scoped** commit of the `assets/` dir only
(`git add -- <assetsRel>`, never `task.md`, never `-A`) when the project
checkout is a git repo currently on the task branch (`kb/<taskId>` or the
persisted `task.branch`); otherwise leave bytes for the existing
auto-commit sweep. Best-effort: ingest succeeds even if the commit fails
(upload must not 500 on git contention); failures log a warning. All git
goes through `api/git` `git()` (already repo-lock serialized), with the
`expectedBranch` fail-closed guard. Upload endpoints (`/images` +
`/attachments`) and text-ingest hooks all route through the one helper.

## R5 — security + serving

- Flat sanitized names, dedupe-never-overwrite, traversal collapse: kept.
- Extension allowlist (~40): images + text/log/data + pdf/office +
  archives + audio/video + html/svg (download-only). No executables, no
  bare `.js`/`.sh`.
- Serving matrix (`attachmentServeHeaders`): images → `inline` + immutable
  cache (unchanged); text-ish + pdf → `inline`; everything else incl.
  html/svg → `Content-Disposition: attachment`. `nosniff` always; errors
  `no-store` + reason codes.
- Declared MIME is advisory only; the extension picks Content-Type.
- Claim shipment: strict-base64 + per-file cap re-checked runner-side.
