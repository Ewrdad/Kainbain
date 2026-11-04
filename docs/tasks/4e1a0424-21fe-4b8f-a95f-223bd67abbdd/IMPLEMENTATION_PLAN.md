## Goal

Fix task images (`![alt](assets/<name>)`, e.g. `assets/18744.png`) randomly not loading in the UI after a short time or a page refresh, so every image stays attached to and reliably renders on its own task.

## Context (grounded in the repo)

- Upload/storage: `api/work/taskAssets.js` (`sanitizeImageName`, `dedupeImageName`, `writeTaskImage`) stores bytes in `docs/tasks/<taskId>/assets/`; markdown carries only a relative `assets/<name>` reference.
- Serving: `GET /projects/:id/tasks/:taskId/images/:name` in `api/routes/taskImages.js` returns exact bytes with `private, max-age=31536000, immutable` (a comment notes an earlier `max-age=60` caused revalidation misses).
- Resolution: `resolveTaskImageUrl` in `frontend/src/services/taskImages.js` rewrites `assets/<name>` to the endpoint; without `projectId`/`taskId` it returns the src **as-is** (legacy pass-through).
- Renderers: `MdImage` in `frontend/src/components/common/MarkdownViewer.jsx` (one auto-retry, then latched "image unavailable" chip), `TaskImageThumb` in `frontend/src/components/tasks/TaskImageAttach.jsx` (latches on first error until manual Retry), plus `FailureMessage.jsx` and explorer `FilePreview.jsx`.
- Survey: `SURVEY.md` exists but is **unanswered** (`"answers": {}`). The plan proceeds on the survey's recommended default for q5 (repair already-broken images AND stop recurrence) and records the rest as assumptions/open questions below.

## Success Criteria

1. An image attached to a task renders on first view, after waiting (no interaction), and after a page refresh — in every surface that shows task images (task detail/goal, board/card preview if applicable, description markdown, explorer preview, failure messages).
2. A transient load failure self-recovers without user action or a refresh (no permanently latched broken state while bytes exist server-side).
3. Already-broken references that still have bytes on disk render again (repair path), or are reported as genuinely missing with the filename visible.
4. No regression: `npm run test:unit` green, existing image suites (`api/routes/taskImages.test.js`, `api/work/taskAssets.test.js`, `frontend/src/services/taskImages.test.js`, `MarkdownViewer.test.jsx`) still pass, plus new regression tests for the fixed cause.
5. Docs updated so the image lifecycle (upload → reference → resolve → serve → cache) and the repair procedure are described in one place.

## Approach

Follow "make change easy, then make the change": phases 1–2 reproduce and isolate the fault with instrumentation and characterisation tests before any behaviour change; phase 3 builds the seams (single resolution/failure path, observable failures); phase 4 makes the minimal fix; phase 5 repairs legacy refs and documents. Big/research items come first because the report is intermittent ("randomly", "after time or refresh"), which means guessing a fix without a reproduction is the highest-risk move.

## Steps

### Phase 1 — Reproduce and triage (research, first)

1. Build a reproduction matrix, headless only (per stage guidance: isolated headless runners, existing fixtures, `npm run capture:screenshot`; no long-lived background servers):
   - Surfaces: goal/description markdown, attach-strip thumbnails, board/card preview, explorer preview, failure message.
   - Triggers: cold load, refresh, idle wait (~2–5 min), second tab, upload-then-immediate-view.
2. For each failing case capture the exact evidence triple: the `<img src>` actually rendered, the HTTP status/body from the image endpoint, and whether the bytes exist on disk (`docs/tasks/<taskId>/assets/<name>`).
3. Classify each failure into one bucket before fixing anything:
   - (a) wrong URL rendered (missing task context → bare `assets/...` resolved against page URL; wrong `API_BASE`; encoded-name mismatch);
   - (b) right URL, server 4xx/5xx (missing bytes, traversal/name rejection, task-context resolution, read error);
   - (c) right URL, server 200, browser still shows broken (cache/heuristic-404, React latched `failed` state, lazy-load + remount interplay).
4. Output: a triage note (append to the task folder) mapping each repro to bucket (a)/(b)/(c) with the evidence triple. Stop and re-plan if a repro falls outside these buckets.

### Phase 2 — Isolate the leading hypotheses (research, ordered by fit to "random + time/refresh")

5. Missing-context audit: grep every `<MarkdownViewer`, `MdImage`, thumbnail, and board/card image usage; list which ones omit `projectId`/`taskId` (or receive them late/async). A context that arrives after first render explains "shows then disappears" and "refresh breaks it" via remounts with different props.
6. Failure-latch audit: trace `MdImage` (single 1500 ms auto-retry, then latched) and `TaskImageThumb` (latched until manual Retry). Check whether a transient miss (slow first byte, cold server, concurrent upload) permanently hides an image until refresh — and whether refresh then re-triggers the same transient miss, looking "random".
7. Cache audit: verify what is cached and for how long — `immutable` on 200s (stale bytes after delete + re-upload of the same name? `dedupeImageName` should prevent overwrite — prove it), and heuristic caching of 404/500 error responses (error paths set no `Cache-Control`; confirm browsers/proxies do not retain them).
8. Name round-trip audit: upload names with spaces, caps, unicode, parens, numeric names like `18744.png`, and duplicates; confirm the stored filename, the markdown `path`, `resolveTaskImageUrl` output, and the serve-side canonicalisation fallback all agree. Record any mismatch (e.g. legacy refs the fallback cannot resolve).
9. Context/identity audit: confirm images stay task-scoped — custom `docsDirName`, URL-encoded taskIds, and task rename/move must not orphan `assets/` or resolve to a sibling task's folder (this is the survey q6 concern: "still shown to the relevant tasks").

### Phase 3 — Make the change easy (seams + observability, no behaviour change)

10. Add a single observable failure path: failed image loads log (dev console + a counter/attribute testable headless) the resolved URL, task context present/absent, and HTTP status where obtainable — so the fix and regressions are provable without eyeballing.
11. Add characterisation tests that pin current behaviour for each bucket-(a)/(b)/(c) repro found in phase 1 (failing tests that describe the bug, passing tests that describe correct behaviour). Put API tests beside `api/routes/taskImages.test.js`, resolution tests beside `frontend/src/services/taskImages.test.js`, render tests beside `MarkdownViewer.test.jsx`.
12. If phase 2 shows context arriving late in any renderer, introduce one shared hook/selector that supplies stable `{ apiBase, projectId, taskId }` image context (or explicit "no context" state) so all renderers consume the same source instead of ad-hoc props.

### Phase 4 — Make the change (minimal fix for the proven cause)

13. Fix only what phases 1–2 proved, in bucket order:
    - (a) wrong URL: thread task context into the renderers missing it (or render an explicit "image needs task context" state instead of a silently broken relative URL); normalise `API_BASE` usage so deploy/prod origins resolve.
    - (b) server error: fix the endpoint/guard involved (name canonicalisation, task resolution, read path); ensure error responses carry `Cache-Control: no-store` so a transient 404/500 can never be cached into a "randomly broken" state.
    - (c) client latch/cache: make retry robust (bounded retries with backoff and revalidation on visibility/refresh rather than a single latched attempt); bust genuinely stale `immutable` entries only where bytes can change (prefer content-based invalidation over dropping `immutable` globally).
14. Keep the security contract intact: `sanitizeImageName` + `isAllowedImageExt` on write/serve, `sanitizeUrl` as the single XSS neutraliser, traversal tests still passing.
15. Re-run the full phase-1 matrix headless: every previously failing case must now pass, and every previously passing case must be unchanged.

### Phase 5 — Repair already-broken images + docs (survey q5 default: both)

16. Repair: for tasks whose markdown references `assets/<name>` but whose bytes exist under a nearby canonical name (case/space/dedupe drift), backfill by the least invasive means the codebase supports (serve-side canonicalisation already exists — extend or document its limits; only add a one-shot backfill script if refs exist that serving cannot resolve). Genuinely missing bytes stay as the visible "image unavailable" chip with the filename, never a silent hole.
17. Documentation: update or add one doc covering the image lifecycle (upload → sanitise/dedupe → markdown ref → resolve → serve → cache headers), the repair procedure, and how to read the new failure observability. Link it from the task folder report.
18. Final gates: `npm run test:unit` (primary gate), plus `npm run lint` and `npm run build` for touched packages; headless screenshot spot-check of one previously failing surface via `npm run capture:screenshot`.

## Validation Plan

- Primary gate: `npm run test:unit` green on the branch (runs API + frontend suites).
- Regression evidence per bucket: new tests in the existing suites proving (a) every task-image renderer resolves through task context, (b) error responses are `no-store` and canonicalisation mismatches resolve, (c) transient failures recover and identical-URL reloads revalidate.
- Headless visual check: `npm run capture:screenshot` on one previously failing surface before/after (no long-lived servers; isolated runner only).
- Manual matrix (only what headless cannot prove): attach → wait → refresh across the phase-1 surface list; confirm filename-visible chips for genuinely missing bytes.
- Highest-risk validation: the phase-1 reproduction matrix itself — if the "random" failure cannot be reproduced headless, do not proceed to phase 4 on a guess; instead ship only phases 3+5 observability/repair and report the gap.

## Risks / Open Questions

- SURVEY.md is unanswered, so these are assumptions, not facts: images affected are task-attached images only (q4); the failure symptom and timing are as reported, pattern TBD by phase 1 (q1–q3); repair + prevention both wanted (q5, survey-recommended); images must stay attached to their own task and visible to task viewers (q6). If the user answers the survey, re-check phases 2 and 5 against it.
- Intermittent faults may need production-like conditions (real browser cache, slow disk, concurrent runners) that headless repro cannot fully replicate — mitigated by the observability seam in phase 3, which makes field failures classifiable after shipping.
- Non-goals: new image formats (HEIC/SVG stay rejected per current allowlist), image editing/resizing, permissions-model changes, unrelated MarkdownViewer features.

## Sources

None — all findings are from workspace inspection (no external claims made).
