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
