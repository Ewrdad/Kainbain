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
   `sanitizeImageName` + `dedupeImageName` (`api/work/taskAssets.js`): flat,
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

## Repairs

- **Dangling refs (bytes nowhere).** Unrepairable automatically; the chip shows
  the filename so the gap is actionable. Re-upload the picture or drop the
  reference line.
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
