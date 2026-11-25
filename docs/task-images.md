# Task images & attachments lifecycle

How files attached to tasks — pictures plus every other allowed type (logs,
docs, archives, media) — are stored, referenced, resolved, served, and
cached — and how to diagnose and repair broken ones. Written for the
"images randomly not loading" fix (task `4e1a0424`); see the triage note at
`docs/tasks/4e1a0424-21fe-4b8f-a95f-223bd67abbdd/TRIAGE.md` for the field
evidence behind the transient handling below. Generalized to all
attachments by task `0a5cad0b`: the image path below is unchanged, and each
step notes the generalized sibling.

## Lifecycle

1. **Upload** (`POST /projects/:id/tasks/:taskId/images`, `api/routes/taskImages.js`;
   generalized sibling `POST .../attachments`, `api/routes/taskAttachments.js`).
   Multipart file (`image` field on the image endpoint, `file` field on the
   generalized one), extension allowlist (images: `png/jpg/jpeg/gif/webp`;
   attachments: those plus text/log/data, documents, archives, audio/video,
   and download-only web files — executables and scripts stay rejected),
   per-file size cap and per-task count cap. The stored name is
   `sanitizeAttachmentName` + `dedupeAttachmentName` (`api/work/taskAssets.js`;
   the `sanitizeImageName`/`dedupeImageName` wrappers delegate, so image
   naming is byte-identical): flat, lowercased, and never overwriting
   (`foo.png` → `foo-2.png`). A batch that finishes after the user switched
   tasks still lands in the origin task, but no reference is appended to the
   new draft (`TaskImageAttach.jsx` scope guard) — bytes stay with their task.
   Uploaded bytes are commit-assured on the task branch at ingest time
   (`api/work/commitTaskAssets.js`: `assets/` only, never `task.md`,
   best-effort) instead of waiting for the next stage auto-commit.
2. **Ingest & rewrite.** Task text that names a file outside the task folder
   (absolute path, `/tmp/...` path, worktree-relative path) is ingested on
   write: the goal create/update handlers, rejection feedback (`rejectTask`),
   routed failure text (`routeStageError`), and review comments/replies all
   run `ingestOutOfTaskRefs` — resolvable bytes are copied into `assets/`
   under a sanitized, deduped name and the text rewritten to the stored
   `assets/<name>` (`rewriteRefsToAssets`, idempotent), so a Runner on any
   box resolves the reference. Unresolvable refs keep their text and gain
   `MISSING-ASSET` coverage via the warning arm below.
3. **Reference.** Only a relative path is stored in markdown:
   `![name](assets/name)` for images, `[name](assets/name)` for every other
   attachment, appended at the end of the goal/feedback draft
   (`appendAttachmentsMarkdown`; images keep the exact `appendImageMarkdown`
   form). Never base64-embedded.
4. **Resolve** (`resolveTaskImageUrl` / `resolveTaskAttachmentUrl`,
   `frontend/src/services/taskImages.js`). `assets/<name>` (with optional
   `./`, `/`, or task-folder prefix, and an optional trailing quoted title)
   becomes `/projects/:id/tasks/:taskId/images/<name>` (image refs) or
   `.../attachments/<name>` (file links) on the API origin. Absolute URLs
   pass through; `javascript:`/`data:`/`vbscript:` pass through for
   `sanitizeUrl` to neutralise. Without `projectId`/`taskId` the src is
   returned as-is (legacy; only non-task surfaces render without context).
5. **Serve** (`GET .../images/:name`, `GET .../attachments/:name`). Exact
   stored bytes, allowlist Content-Type, `nosniff`, and the serving-matrix
   disposition — `inline` for viewable images, text-ish files, and PDF;
   `attachment` download for everything else (office docs, archives, media,
   and always html/svg, so user markup never renders in the app's origin).
   A canonicalisation fallback resolves stale refs (wrong case, spaces) to
   the on-disk asset whose sanitized name matches. Every error carries a
   structured `reason` (image routes: `unknown-project`, `invalid-task-id`,
   `task-not-found`, `path-traversal`, `invalid-image-name`,
   `image-not-found`; attachment routes: the matching `invalid-attachment-name`
   / `attachment-not-found` plus ingest codes like `attachment-too-large`)
   and `Cache-Control: no-store`.
6. **Cache.** Successes are `private, max-age=31536000, immutable` (stored
   names are write-once, so refreshes never revalidate into a transient
   miss). Errors are never cached.

## Client recovery

All image renderers (`MdImage`, `TaskImageThumb`, `FailureMessageImage`,
explorer `FilePreview`, survey illustrations) share `useImageRetry`
(`frontend/src/services/imageRetry.js`): up to three automatic reloads at
1.5s/3s/6s backoff, then a latched filename-visible chip with manual Retry
(which restarts the budget). A latched image also revalidates when the tab
becomes visible or the browser comes back online, and any new `src` resets
to a clean attempt. There is intentionally no endless polling: a still-dead
image after the budget is a real miss, not a flap. Non-image attachments
render as download chips (`TaskFileChip`, `FailureMessage` file strip,
viewer links) — plain anchors against the attachment endpoint, so the
browser's own download/retry behaviour applies and no retry seam is needed.

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
The whole arm is type-agnostic: images and non-image attachments share the
grammar, the warning block (image-only blocks keep the historical
visual-content wording; mixed blocks use the generic file wording), and
both delivery arms.

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
  `taskAssets` (`collectTaskAssetPayload`: images first for vision priority,
  then other attachments by name; per-file `taskAttachmentMaxBytes`, total
  `taskAttachmentMaxAttachBytes`), and the daemon writes entries the
  worktree lacks (`writeClaimTaskAssets`: flat allowlisted attachment names
  only, strict-base64 decodes, size-capped, never overwrites) before the
  first stage runs.

## Repairs

- **Dangling refs (bytes nowhere).** Unrepairable automatically; the chip shows
  the filename so the gap is actionable, and agent prompts carry the
  `MISSING-ASSET` warning above. Re-upload the file (heals the next run
  automatically) or drop the reference line.
- **Out-of-task refs on old tasks** (absolute/`/tmp`/worktree-relative paths
  from before ingest-and-rewrite). Run the backfill auditor dry first, then
  repair:
  `node scripts/audit-task-attachments.mjs` (read-only report:
  `surface → ref → expected path → recoverable?`),
  `node scripts/audit-task-attachments.mjs --apply` (ingests resolvable
  bytes, rewrites to `assets/<name>`, byte-backups first, best-effort branch
  commit). Dangling refs are left visible, never deleted, never
  cross-task-merged. Scope with `--task <id>` / `--root <dir>`.
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
`POST /tasks`. Their attachment bytes therefore follow a strict ordering:

1. `POST /tasks` with the goal's text-only draft (attachment refs omitted or
   left as placeholders).
2. For each picture, `POST /projects/:id/tasks/:taskId/images`; for each
   other file, `POST /projects/:id/tasks/:taskId/attachments` — and capture
   each returned stored `name`.
3. `PATCH /tasks/:taskId` with a `goal` whose `![alt](assets/<name>)` (images)
   or `[label](assets/<name>)` (files) refs use only those returned names.

Absolute `https://` URLs may be left untouched (they pass through resolution
and sanitization as before). Guessing a filename is unsafe:
`sanitizeAttachmentName` and `dedupeAttachmentName` may rewrite
(`foo.png` → `foo-2.png`) and the request will 404. (Goals that reference
out-of-task files directly are ingested-and-rewritten server-side at
create/update time, with the mapping reported in `ingestedAttachments` —
but the upload-then-patch ordering above stays the deterministic path.)
