# Implementation Plan — Task images randomly not loading

## Goal

Fix the bug where images attached to tasks (`![alt](assets/<name>)`) render at first but show as broken after a short time or a page refresh, while keeping every attached image permanently visible to anyone who can view the task.

## Context and evidence (read this run)

- Storage model: images live beside `task.md` in `<projectRoot>/docs/tasks/<taskId>/assets/`, referenced from goal/description markdown with relative paths (`assets/foo.png`), never base64. Implemented in [api/work/taskAssets.js](/home/server/.kainbain/runner-work/kb-2b990c4f-1e24-47f6-9c64-8bd239b68c83/api/work/taskAssets.js): `sanitizeImageName` (lowercases, strips dirs), `dedupeImageName` (`foo.png` → `foo-2.png`), `writeTaskImage`, `listTaskImages`, `resolveTaskAssetFile`.
- Serving: [api/routes/taskImages.js](/home/server/.kainbain/runner-work/kb-2b990c4f-1e24-47f6-9c64-8bd239b68c83/api/routes/taskImages.js) (`GET /projects/:id/tasks/:taskId/images/:name`, binary-safe, `cache-control: private, max-age=60`). Guarded by `resolveTaskContext`: project must resolve, task must exist in `taskStore` cache **or** as `task.md` on disk. The upload handler itself contains a warning comment that asset writes can "cement a shadow directory when the docs link is missing" (`taskStore._repairDocsLinkAfterSwitch`).
- URL building: `resolveTaskImageUrl` in [frontend/src/services/taskImages.js](/home/server/.kainbain/runner-work/kb-2b990c4f-1e24-47f6-9c64-8bd239b68c83/frontend/src/services/taskImages.js) rewrites `assets/<name>` to the image endpoint, `encodeURIComponent`-ing the name.
- Rendering: [frontend/src/components/common/MarkdownViewer.jsx](/home/server/.kainbain/runner-work/kb-2b990c4f-1e24-47f6-9c64-8bd239b68c83/frontend/src/components/common/MarkdownViewer.jsx) (`MdImage`, `parseInlineMarkdown`) used by `TaskGoalSection`, `TaskReviewPage`, `SurveyTaskPanel`, `FailureMessage`, `ReportViewer`, `DocsView`. `MdImage` falls back to a "🖼️ name (image unavailable)" chip on error.
- Upload UI: [frontend/src/components/tasks/TaskImageAttach.jsx](/home/server/.kainbain/runner-work/kb-2b990c4f-1e24-47f6-9c64-8bd239b68c83/frontend/src/components/tasks/TaskImageAttach.jsx) with batch-append (`appendImagesMarkdown`, stale-closure-safe) in [frontend/src/components/tasks/TaskGoalSection.jsx](/home/server/.kainbain/runner-work/kb-2b990c4f-1e24-47f6-9c64-8bd239b68c83/frontend/src/components/tasks/TaskGoalSection.jsx).
- Survey: [docs/tasks/2b990c4f-1e24-47f6-9c64-8bd239b68c83/SURVEY.md](/home/server/.kainbain/runner-work/kb-2b990c4f-1e24-47f6-9c64-8bd239b68c83/docs/tasks/2b990c4f-1e24-47f6-9c64-8bd239b68c83/SURVEY.md) has **no answers** (`"answers": {}`). All user preferences below are assumptions to confirm, not facts.
- No authentication layer was found on the image endpoints (open local server), so auth-expiry is deprioritized; the failure smells like transient-404-latched-in-UI and/or serve-guard/save flakiness instead.

## Survey assumptions (SURVEY.md unanswered — confirm before/at implementation)

| # | Question | Assumed answer | Why |
|---|----------|----------------|-----|
| q1 | Where do broken images show? | Task detail goal/description (per screenshot `assets/18744.png`); verify lists/previews too | Screenshot shows the task body |
| q2 | What kind of images? | Uploaded/pasted PNG/JPG/GIF/WebP via `TaskImageAttach` | Only path the code supports (HEIC etc. rejected) |
| q3 | How long should images last? | **Forever** — once added, always loads | Matches storage model (files beside `task.md`) |
| q4 | Fallback when an image can't load? | Keep existing chip `🖼️ <name> (image unavailable)` **plus a retry control** | Existing `MdImage` behavior + actionable recovery |
| q5 | Who may see images? | Anyone who can view the task (no extra restriction) | Endpoints currently have no per-image ACL; adding one is out of scope |
| q6 | Pattern? | Breaks on refresh / after ~60 s (cache revalidation) | Matches `max-age=60` + transient-failure latch hypotheses |

Open question for the user: confirm q3–q5 assumptions; if images must be private, the serve endpoint needs an auth/ACL step (scope increase).

## Hypotheses (debug-first, in evidence order)

1. **H1 — Latched transient failure (frontend, prime suspect).** `MdImage` sets `failed=true` on the first `onError` and never resets it when `src` changes (no `useEffect` on `src`). Any transient 404/slow load permanently shows the chip/broken state until remount. `TaskImageAttach` thumbnails additionally hide failures (`visibility: hidden`) with no retry, so a flaky load looks "randomly gone".
2. **H2 — Serve-guard 404 (backend).** `resolveTaskContext` 404s when the task is in neither the `taskStore` cache nor on disk at the expected `task.md` path (rehydration race, project switch, docs-link/shadow-dir split noted in the code comment). With `max-age=60`, every refresh/revalidation re-hits the guard, turning a transient miss into a persistently broken image.
3. **H3 — Save path drops/rewrites refs.** Goal autosave / `TaskStore._saveTaskMarkdown` may normalize markdown and alter `assets/` refs (needs a read of the save path; not yet verified).
4. **H4 — Name mismatch.** `sanitizeImageName` lowercases and rewrites names; if any writer stores the raw filename in markdown instead of the returned `path`, refresh-time GETs 404. The upload flow uses the returned path (safe), but hand-edited refs and dedupe (`foo-2.png`) need a check.
5. **H5 — Encoding edge.** Screenshot-style names (spaces, parens) through `encodeURIComponent` vs the `assets\/[^/?#]+` capture regex and `sanitizeImageName` on serve — verify round-trip for `screenshot (1).png`-style names.
6. **H6 — Stale-closure ref loss on edit.** Mostly mitigated already (single `onUploadedBatch` fold + `latestTitleRef`), but verify that background `TASK_UPDATED` refreshes can't clobber refs mid-edit.

## Approach — make the change easy, then make the change

1. **Reproduce + instrument first** (no behavior change): deterministic repro, request logging on the image endpoints, and surfacing of load failures in the UI so the bug is observable instead of silent.
2. **Harden the seams** (refactor, no behavior change): single URL-builder, `MdImage` failure reset keyed on `src`, structured 404 reason codes from the serve endpoint.
3. **Fix the confirmed root cause(s)** in ranked order H1 → H2 → H3/H4/H5, one hypothesis per commit.
4. **Fallback UX + regression tests + docs** last.

## Steps

### Phase 0 — Reproduce and instrument (first, biggest research piece)

1. Write a throwaway repro script under `/tmp` (not committed): upload `18744.png`-style fixture → save goal with `![18744.png](assets/18744.png)` → `GET` the image endpoint → simulate refresh (second GET after cache expiry + taskStore rehydration) and record status codes. Goal: a red, deterministic repro before any fix.
2. Read the save path end-to-end: `TaskStore._saveTaskMarkdown`, `_repairDocsLinkAfterSwitch`, docs-link/shadow-dir handling, and goal autosave debounce in `TaskDetailOverlay*`. Record exactly what can move, rename, or drop `assets/` refs or files.
3. Add temporary observability (kept or kept-minimal): log `projectId/taskId/name/reason` on every image-endpoint 404/400 (which guard fired: project, task-existence, name validation, file missing), and log `onError` srcs in `MdImage` (dev-only console or a counter). No behavior change.

### Phase 1 — Confirm or kill each hypothesis

4. H1: render `MarkdownViewer` with a task image, force one failed load (offline/404 stub), then restore and assert the image recovers without remount. Expected now: stays broken (proves latch).
5. H2: restart/rehydrate the server (or clear the task cache) with images on disk and GET the image URL cold; try immediately after project switch with a missing docs link. Record which guard 404s.
6. H3: round-trip a goal containing `![18744.png](assets/18744.png)` through save → reload → compare markdown bytes; check for ref rewrites, drops, or case changes.
7. H4/H5: round-trip upload → markdown ref → GET for names with uppercase, spaces, parens (`My Screenshot (1).PNG` → expect `my-screenshot-1-.png`), and deduped `foo-2.png`; assert each GET is 200 with the right `Content-Type`.
8. Pick the fix order from this evidence; drop disproven hypotheses in the plan update note.

### Phase 2 — Easy-change refactors (no behavior change, separate commits)

9. `MdImage`: reset `failed` when `src` changes (`useEffect`/key), keeping the existing chip UI.
10. Serve endpoint: return distinct, non-breaking error codes/reasons per guard (project vs task vs name vs file) to make future diagnosis one log line; keep status codes stable.
11. Thumbnails: replace `visibility: hidden` on error with the same unavailable-chip + retry used by `MdImage` (do not change upload/delete behavior).

### Phase 3 — The fix (one hypothesis per commit, in confirmed order)

12. If H1 confirmed: latched-failure reset + bounded retry (e.g. retry once after short delay on error; always re-attempt on `src`/remount). Small, frontend-only.
13. If H2 confirmed: make serving resilient — prefer disk-truth for existence (task folder on disk, not cache), order docs-link repair **before** the existence check so no shadow-dir split, and consider a longer-lived `Cache-Control` (immutable + content hash or version query) so refreshes don't revalidate into transient states.
14. If H3 confirmed: fix the save path to preserve `assets/` refs byte-for-byte (and add a save round-trip regression test).
15. If H4/H5 confirmed: canonicalize on write (already done via returned `path`) and add a serve-side fallback (e.g. case-insensitive lookup) or a one-time repair that rewrites stale refs to existing files — prefer canonical-write + repair script over fuzzy serving.

### Phase 4 — Fallback UX + docs

16. Keep the `🖼️ <name> (image unavailable)` chip; add an explicit retry button and keep the filename visible (covers survey q4 assumption).
17. Backfill `SURVEY.md` answers once the user confirms q3–q5; document the image lifecycle (upload → `assets/` → serve → render) and the new retry/fallback behavior where the repo documents task images (`agentGuide`, user docs as applicable).

## Validation Plan

- Primary gate: `npm run test:unit` (`npm run test:api` + `npm run test:frontend`) — must be green. Run the full files touched, never narrowed to pass (`taskImages.test.js` both sides, `MarkdownViewer.test.js`, `TaskImageAttach.test.js`, `TaskGoalSection`/`TaskDetailOverlay` suites, new save round-trip tests).
- New regression tests (committed, alongside code): serve-cold-cache 200 test; save round-trip ref-preservation test; `MdImage` recovers-after-transient-failure test; upload→ref→GET-200 test for tricky filenames; dedupe (`foo-2.png`) link test.
- Flake check: `node scripts/repeat-tests.mjs` (or documented repeat invocation) for the new image tests, since the bug is intermittent.
- Visual check only via the headless path: `npm run capture:screenshot` for a task detail page containing `assets/18744.png` (broken-chip vs rendered-image assertion). No long-lived background servers; use isolated headless runners/existing fixtures per repo guidance.
- Static gates: `npm run lint:api`, `npm run lint:frontend`, `npm run docs:check` (JSDoc examples + doc links), and `npm run build` if serving/rendering signatures change.
- Manual: upload → refresh → wait >60 s → refresh → image still loads; delete/rename asset on disk → chip with filename + working retry appears (not a bare broken icon).

## Risks / Open Questions

- **Survey unanswered** (all six questions): proceeding on the assumptions table; q5 going the other way (restricted images) materially changes scope (auth/ACL on the serve endpoint). Confirm with the user at implementation start.
- **Root cause not yet proven**: phases 0–1 are research; if evidence contradicts H1/H2, fix order changes but phases 2–4 still apply. No implementation beyond instrumentation until a hypothesis is confirmed red-then-green.
- **Rollback**: each phase/step is a separate small commit; revert the fix commit(s) to restore prior behavior. No data migration — assets stay as files on disk; no action needed on failure.
- **Compatibility**: `assets/<name>` markdown refs and endpoint URLs stay stable; longer cache headers (if adopted) must not break fresh uploads (use versioned URLs or short cache on list + immutable on bytes).
- **Non-goals**: no new image formats (HEIC etc.), no external-URL proxying, no ACLs, no editor redesign, no unrelated task-markdown changes.
