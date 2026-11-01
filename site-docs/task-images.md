---
title: Task Images
section: working-with
order: 35
slug: task-images
---

# Task Images

Tasks can carry images (screenshots, mockups, diagrams, failure photos). The
files live **inside the task's own folder** on the KainBain host, are referenced
by relative path in markdown, and render inline wherever task markdown is shown.

## Where images live

Every task owns an `assets/` subfolder:

```text
<projectRoot>/docs/tasks/<taskId>/
  task.md          ← the task record
  assets/          ← image files (png, jpg, jpeg, gif, webp)
    shot.png
    mockup-2.png
```

The folder moves with the task (per-task git branches carry it), is deleted
with the task, and never pollutes the report list — `scanTasks` and the report
sync ignore it.

## Attaching an image

1. Open the task and switch the **Task Goal & Markdown Description** to **Edit**.
2. Click **🖼 Attach image** (or paste images straight into the textarea).
   The picker allows selecting **multiple** photos at once — on mobile, choose
   several in the photo picker and each is uploaded.
3. Every upload lands in `assets/` with a sanitized, deduplicated name
   (`shot one.PNG` → `shot-one.png`, a second upload becomes `shot-one-2.png`)
   and each `![shot.png](assets/shot.png)` reference is appended at the end of
   the goal text, one per line, in selection order.

Existing assets show as thumbnails with a ✕ remove button. If one file in a
batch fails (e.g. over the size cap), the rest still upload and link — the
failure is shown per filename next to the picker. Non-image files are skipped
with an inline note instead of failing the batch; iPhone **HEIC/HEIF** photos
are not supported — switch the camera format or convert to JPEG/PNG first.

## Attaching images to a rejection

Both reject surfaces — the **Reject with Feedback** dialog (human-stage
reject) and the **Fail Stage** modal on the PR review page — offer the same
**🖼 Attach image** affordance (pasting a screenshot into the feedback box
works there too). Uploads land in the same `assets/` folder through the same
endpoint, and the `![name](assets/name)` reference is appended to the
rejection feedback. The reject API itself is unchanged (`{ feedback: string }`),
and the same limits apply (extensions, size, and per-task count caps — a task
already at its image cap can still reject with text-only feedback).

The rejection text (image refs included) travels with the failed-back task, so
the next attempt's prompt lists the screenshots in its `# Task Images`
section, and vision-capable harness+model pairs receive the bytes at dispatch.
Already-uploaded files stay as ordinary task assets if the dialog is closed
without rejecting — the same orphan policy as the goal editor.

## Referencing an image

Use standard markdown with the **relative** asset path:

```md
![screenshot of the bug](assets/shot.png)
```

Relative paths (not absolute ones) keep the reference valid across checkouts
and branch moves. The viewer rewrites `assets/<name>` to the binary-safe
`GET /projects/:id/tasks/:taskId/images/:name` endpoint — the UTF-8
`/files/content` endpoint stays text-only, so image bytes are never corrupted.

The same references work in task goals, stage reports, and review pages —
anywhere markdown is rendered with the task in context.

## Reliability: why images stay loaded across refreshes

Uploads never overwrite an existing image (a repeat upload dedupes to
`name-2.png`). Files can still change outside the app — a hand edit, a
restore from backup, a delete followed by a re-upload under the same name —
so serving never assumes the bytes behind a name are fixed:

- **Revalidated cache, never silently stale.** The serve endpoint answers
  `Cache-Control: private, no-cache` with an `ETag` built from the file's
  size and last-change time. A refresh asks the server to check that tag:
  an unchanged image answers a tiny `304` with no bytes, while a file that
  was replaced or deleted under the same name (a hand restore, or a delete
  followed by a re-upload) is served fresh — or reported missing — instead
  of showing a cached copy of bytes that no longer exist. A transient
  failure during that check is recovered by the viewer's automatic retry
  (below), so revalidation cannot latch a broken image either.
- **Disk is the source of truth.** A task counts as existing when its
  `task.md` is on disk, even if the server has not rehydrated the task into
  its in-memory cache yet (fresh boot, project switch) — a cold cache can
  no longer 404 a present image.
- **Docs link self-heals before serving.** If a branch switch removed the
  project's `docs` link, the serve path re-verifies and recreates it before
  checking anything, so images do not 404 into a "shadow directory".
- **Stale references canonicalize.** A reference whose name drifted from the
  stored file's sanitized name (wrong case, spaces, parens) resolves to the
  matching stored asset instead of 404ing.

If an image still cannot be fetched (e.g. the file was deleted by hand), the
viewer shows an inert `🖼️ <name> (image unavailable)` chip with a **Retry**
button instead of a broken-image icon; after one transient failure the image
also retries automatically once before settling on the chip. The upload
thumbnails behave the same way.

## How serving can fail

Every failure answers with a plain-language `error` plus a short `reason`
code, and the server logs the same code — one log line says which guard
fired:

| Reason | HTTP status | What it means |
| --- | --- | --- |
| `unknown-project` | 404 | The project id is not known to this server. |
| `invalid-task-id` | 400 | The task id would escape the tasks folder. |
| `task-not-found` | 404 | No task in the store and no `task.md` on disk. |
| `path-traversal` | 403 | The image name contains a path separator. |
| `invalid-image-name` | 400 | The name is empty or not a png/jpg/jpeg/gif/webp image. |
| `image-not-found` | 404 | The task exists but that image file does not (any more), or the name is a directory. |
| `image-read-failed` | 500 | The file exists but could not be read — check permissions on the host. |
| `image-write-failed` | 500 | An upload could not be stored — check disk space and permissions on the host. |

Nothing fails silently: a failed upload adds no markdown reference (the
file only becomes linked after the server confirms it was stored), a
failed listing leaves the goal text untouched, and a failed load shows
the filename chip with **Retry** rather than a broken-image icon or an
invisible gap.

## How agents see the images

Prompts are **file-reference-first** (never base64-embedded — most
harness/model pairs cannot consume embedded images, and bytes would bloat the
context and risk log truncation):

- **Every** agent stage prompt carries a `# Task Images` section listing the
  relative paths (capped, with an "(+N more…)" overflow note), so any agent
  with file tools can open the files itself.
- **Only** when the resolved harness AND model both advertise image input
  (harness `pi` + a model whose catalogue entry lists `image` in its `input`
  array, e.g. `gemma4:31b-cloud`) are the bytes also attached at dispatch.
  Unknown harnesses/models default to **no vision** and get the path mention
  only — the stage still succeeds either way.

## Limits and tuning

| Limit | Default | Environment variable |
| --- | --- | --- |
| Max bytes per image | 10 MB | `KAINBAIN_TASK_IMAGE_MAX_BYTES` |
| Max images per task | 20 | `KAINBAIN_TASK_IMAGE_MAX_PER_TASK` |
| Max image refs injected per prompt | 10 | `KAINBAIN_TASK_IMAGE_MAX_PROMPT_REFS` |
| Max bytes attached to one vision dispatch | 10 MB | `KAINBAIN_TASK_IMAGE_MAX_ATTACH_BYTES` |

Oversized uploads are rejected with HTTP 413; unsupported extensions (anything
beyond png/jpg/jpeg/gif/webp) with HTTP 400. Uploads and serving are guarded
against path traversal — filenames are sanitized to a flat, safe name before
anything touches disk.
