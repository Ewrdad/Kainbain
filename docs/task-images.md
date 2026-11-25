# Task images lifecycle

How pictures attached to tasks are stored, referenced, resolved, served, and
cached — and how to diagnose and repair broken ones. Written for the
"images randomly not loading" fix (task `4e1a0424`); see the triage note at
`docs/tasks/4e1a0424-21fe-4b8f-a95f-223bd67abbdd/TRIAGE.md` for the field
evidence behind the transient handling below.

## Lifecycle

1. **Upload** (`POST /projects/:id/tasks/:taskId/images`, `api/routes/taskImages.js`).
   Multipart `image` file, extension allowlist (`png/jpg/jpeg/gif/webp`),
   per-file size cap and per-task count cap. The stored name is
   `sanitizeImageName` + `dedupeImageName` (`sanitizeImageName` lives in
   `shared/taskAssetRefs/` and is re-exported by `api/work/taskAssets.js`): flat,
   lowercased, and never overwriting (`foo.png` → `foo-2.png`). A batch that
   finishes after the user switched tasks still lands in the origin task, but
   no reference is appended to the new draft (`TaskImageAttach.jsx` scope
   guard) — bytes stay with their task.
2. **Reference.** Only a relative path is stored in markdown:
   `![name](assets/name)`, appended at the end of the goal/feedback draft
   (`appendImageMarkdown`). Never base64-embedded.
3. **Resolve** (`resolveTaskImageUrl`, `frontend/src/services/taskImages.js`).
   `assets/<name>` (with optional `./`, `/`, or task-folder prefix, and an
   optional trailing quoted title) becomes
   `/projects/:id/tasks/:taskId/images/<name>` on the API origin. Absolute
   URLs pass through; `javascript:`/`data:`/`vbscript:` pass through for
   `sanitizeUrl` to neutralise. Without `projectId`/`taskId` the src is
   returned as-is (legacy; only non-task surfaces render without context).
4. **Serve** (`GET .../images/:name`). Exact stored bytes, correct
   Content-Type, `inline` disposition, `nosniff`. A canonicalisation fallback
   resolves stale refs (wrong case, spaces) to the on-disk asset whose
   sanitized name matches. Every error carries a structured `reason`
   (`unknown-project`, `invalid-task-id`, `task-not-found`, `path-traversal`,
   `invalid-image-name`, `image-not-found`) and `Cache-Control: no-store`.
5. **Cache.** Successes are `private, max-age=31536000, immutable` (stored
   names are write-once, so refreshes never revalidate into a transient
   miss). Errors are never cached.

## Client recovery

All renderers (`MdImage`, `TaskImageThumb`, `FailureMessageImage`, explorer
`FilePreview`, survey illustrations) share `useImageRetry`
(`frontend/src/services/imageRetry.js`): up to three automatic reloads at
1.5s/3s/6s backoff, then a latched filename-visible chip with manual Retry
(which restarts the budget). A latched image also revalidates when the tab
becomes visible or the browser comes back online, and any new `src` resets
to a clean attempt. There is intentionally no endless polling: a still-dead
image after the budget is a real miss, not a flap.

## Failure observability

Every failed load is reported through `reportImageFailure`: dev-console
warning plus the headless record from `getImageFailureStats()` —
`{ src, component, attempt, hasTaskContext }` (`resetImageFailureStats()`
isolates tests). HTTP status is unobtainable from `<img onError>` by design;
pair the client record with the API's `reason` codes. Failed chips carry
`data-task-image-state="unavailable"` for headless/e2e assertions.

Classify a broken image as: (a) wrong URL — `hasTaskContext: false` on a task
surface, or a src that never reached the endpoint shape; (b) right URL, 4xx —
check the endpoint's `reason` and whether bytes exist at
`docs/tasks/<taskId>/assets/<name>`; (c) right URL, 200, still broken —
stale `immutable` entry (delete + re-upload under the same name) or a latched
renderer from before this fix.

## Why images flap: branch checkouts

Worktree isolation is opt-in; by default the engine checks out task branches
in the shared project checkout on stage pickup, and image assets are tracked
files. Whatever branch is checked out decides which tasks' images exist on
disk at that moment, so a task's images can 404 while another branch is out
and recover on return — the "random + after time/refresh" shape. The client
retry seam above is what makes those flaps self-heal instead of latching.
Structural alternatives (per-branch serving, branch-independent asset store,
default worktree isolation) are deliberately out of scope here.

## Agent delivery: copy-or-warn

A task whose goal (or failure/feedback text) references `assets/<name>`
either has the readable file in the agent's workspace, or its rendered
stage prompt opens with an explicit `MISSING-ASSET` warning naming the
file — agents fail fast instead of silently planning around a phantom
screenshot (task `b31cab50`; case study `0d29c64c`, whose settings-page
plan had to be grounded in source because `assets/image.png` was absent).

- **Shared grammar.** `shared/taskAssetRefs/` (`normalizeAssetSrc`,
  `extractAssetRefs`) is the single owner of the `assets/<name>`
  destination grammar: `./`, `/`, and task-folder prefixes tolerated,
  `<...>` destinations unwrapped, trailing quoted titles stripped,
  absolute/protocol URLs ignored. Backend curation and the frontend
  viewer (`resolveTaskImageUrl`) both resolve through it, so detection
  can never drift from what the viewer shows.
- **Warning arm (backend, curate time).** `PromptCurationEngine.curatePrompt`
  — the choke point both the embedded path and `curateRunnerPrompt` share —
  resolves every ref against the task assets dir
  (`api/work/taskAssets.js`: `findMissingAssetRefs`,
  `formatMissingAssetWarning`) and renders `# Missing Task Assets` as the
  first prompt section (`{{missingAssets}}` layout token, auto-prepended
  for verdict stages when a custom layout omits it). Detection is
  extension-agnostic; a ref warns only when neither the literal name nor
  its serve-side canonical form matches an on-disk asset, so
  drifted-but-servable refs stay silent. Stored goal text is never
  mutated — re-uploading the file heals the next run with no cleanup —
  and ref-free or fully-resolved tasks keep byte-identical prompts.
- **Branch-flap second look.** Assets are tracked files, so whatever branch
  is checked out at curate time decides what is on disk. Before warning,
  curation drops refs whose bytes ride the task's own branch
  (`filterBranchBackedRefs`, one `git ls-tree`, best-effort): the agent's
  worktree is on that branch and has them. Anything git cannot answer
  keeps its warning.
- **Delivery arm, local Runners.** `syncTaskDocs` (`runner/project.js`)
  already mirrors the task folder including `assets/` into the per-task
  worktree before the first stage runs; the daemon log now reports the
  synced asset count alongside the file total.
- **Delivery arm, remote Runners.** Claims and dispatch leases ship
  `taskAssets` (`collectTaskAssetPayload`: images only, sorted, per-file
  `taskImageMaxBytes`, total `taskImageMaxAttachBytes`), and the daemon
  writes entries the worktree lacks (`writeClaimTaskAssets`: flat
  allowlisted names only, size-capped, never overwrites) before the first
  stage runs.

## Submit-time validation: feedback cannot mint blind loops

The copy-or-warn backstop above only tells downstream agents they are blind;
it cannot recover the lost information (case study: task `cf4b6847`'s Final
review rejection was literally `![image.png](assets/image.png)` with no bytes
attached, and agents worked blind on the UI complaint through the
retrospective). Human feedback is therefore validated at submit time, so a
dangling ref can never enter the pipeline from a review box again.

- **Shared single owner.** `shared/feedbackValidation/` holds the whole
  decision — `extractAssetRefs` grammar for detection, `isImageOnlyFeedback`
  for the image-only rule, `findMissingRefsAgainst` for presence,
  `validateHumanFeedback` for the verdict, `stripAssetRefs` for text-only
  recovery — so the UI pre-check and the API shell can never drift. The
  `strict: false` flag is the single block-vs-confirm switch if the policy
  is ever softened. The filename canonicalisation it matches against
  (`sanitizeImageName`, `isAllowedImageExt`, `IMAGE_EXTENSIONS`) lives in
  `shared/taskAssetRefs/` and is re-exported by `api/work/taskAssets.js`,
  so submit-time classification is identical to upload validation and the
  serve route's canonical fallback.
- **UI shell: instant pre-check + blocking recovery dialog.** Every composer
  that submits human text (board reject dialog, review-page fail modal, pass
  guidance, follow-up/steer intervention box, review comment composer and
  replies) pre-checks the draft against a freshly listed attachment set and
  renders dangling refs inline, naming the files. A submit attempt while
  invalid opens the blocking `FeedbackValidationDialog` (never a silent
  disable) with two recovery exits: attach the missing file inline (the send
  resumes automatically once the draft checks out) or send words-only (only
  the dangling refs strip; prose and healthy refs stay byte-identical).
- **API shell: authoritative 422.** The same routes refuse invalid text with
  `422 { error, code: 'FEEDBACK_VALIDATION_FAILED', missing[], imageOnly }`,
  naming every missing file — no client, UI or API, can bypass the check.
  Presence is disk OR the task branch (the same two-tier rule curation warns
  by, via `validateFeedbackForTask`), so branch-flap between upload and
  submit can never refuse a human. A 422 re-opens the UI dialog with the
  server-authoritative file list, closing the list-then-submit race.
- **Image-only rule.** Feedback that carries images but fewer than
  `MIN_FEEDBACK_PROSE_CHARS` (10) visible prose characters outside image/link
  markup is refused until a short written description is added — a note
  explaining what the pictures show, not an essay. Plain-text feedback,
  however short, is never measured against this bar.
- **What is not blocked.** External/absolute URLs are ignored exactly as
  curation ignores them; drifted-but-servable refs (wrong case, spaces)
  never block; healthy submissions are byte-identical. Task creation stays
  warn-only (`feedbackWarnings` on the response): uploads land after the
  task exists, so creation must never wedge on eventual consistency.
- **Legacy backstop retained.** Pre-existing tasks with dead refs are never
  re-validated on read — they still render the identical `# Missing Task
  Assets` warning at curate time, proven by the legacy regression test and
  the untouched `promptCuration` / `promptLayout` suites.
- **Rollout and rollback.** No migration and no stored-format change: the
  check runs on submit and leaves stored text untouched. API clients should
  match `code: 'FEEDBACK_VALIDATION_FAILED'` on a 422 and surface `error`
  (which names every missing file) rather than retrying. A browser holding a
  pre-deploy bundle keeps working: its submits are still guarded by the
  server, failures arrive as the usual error toast with the draft kept open
  (reject/fail paths), and a refresh loads the recovery dialog. Rollback is a
  plain revert — the 422s vanish, the curate-time warning keeps covering old
  and new dead refs alike.

## Repairs

- **Dangling refs (bytes nowhere).** Unrepairable automatically; the chip shows
  the filename so the gap is actionable, and agent prompts carry the
  `MISSING-ASSET` warning above. Re-upload the picture (heals the next run
  automatically) or drop the reference line.
- **Branch-stranded bytes** (ref 404s on main but bytes sit on the task's own
  branch — check with
  `git cat-file -e kb/<taskId>:docs/tasks/<taskId>/assets/<name>`). Recover
  with `git show kb/<taskId>:docs/tasks/<taskId>/assets/<name> > <file>` and
  merge the owning branch; do not hand-copy files into the live tree (the next
  auto-commit/checkout would misplace them again).
- **Cross-task orphans** (bytes in task A, ref in task B — pre-fix uploads
  that finished after a task switch). Never auto-merge across tasks; move the
  bytes or the reference by hand after confirming ownership.
- **Case/space drift** needs no repair: serve-side canonicalisation already
  resolves it (proven: zero remaining on-disk drift candidates at fix time).

## API-created tasks (create-task skill)

Tickets created through the create-task skill have no task id until after
`POST /tasks`. Their image bytes therefore follow a strict ordering:

1. `POST /tasks` with the goal's text-only draft (image refs omitted or left
   as placeholders).
2. For each picture, `POST /projects/:id/tasks/:taskId/images` and capture the
   returned stored `name`.
3. `PATCH /tasks/:taskId` with a `goal` whose `![alt](assets/<name>)` refs
   use only those returned names.

Absolute `https://` URLs may be left untouched (they pass through resolution
and sanitization as before). Guessing a filename is unsafe: `sanitizeImageName`
and `dedupeImageName` may rewrite (`foo.png` → `foo-2.png`) and the request
will 404.
