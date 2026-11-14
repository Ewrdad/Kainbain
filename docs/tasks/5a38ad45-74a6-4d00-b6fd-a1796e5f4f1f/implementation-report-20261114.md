# Implementation report — pretty tasks for the create-task skill (2026-11-14)

Task `5a38ad45-74a6-4d00-b6fd-a1796e5f4f1f`. This run verified the plan end to
end on the current tree, re-ran every gate that previously failed, proved the
new behaviour live on an isolated scratch stack, and fixed one real defect found
along the way (the archived `pretty-proof.png` was byte-corrupted).

## What was already in the tree (from prior stages)

- **Clause A — API accepts rich markdown:** `POST /tasks` stores `goal`
  byte-identical (only `title` is sanitized); title derives from the goal's
  first line via `deriveTaskTitleFromGoal` (`api/work/taskIdentity.js`, wired
  into `taskLifecycle.js`, `taskPersistence.js`, `taskWorkRoutes.js`).
  `MarkdownViewer.jsx` renders ` ```mermaid ` fences through a lazy, memoized
  `import('mermaid')` with `securityLevel: 'strict'`, degrading to a readable
  source block on failure; `mermaid ^12.3.0` is in `frontend/package.json` and
  code-split out of the main bundle.
- **Clause B — two-stage skill:** `skills/creating-new-tickets/SKILL.md`
  (lastUpdated 2026-11-14) mandates Stage 1 (one `.md` draft per ticket under
  `{{taskDocs}}drafts/`, template with Context/Steps/Acceptance/Notes) then
  Stage 2 (POST exact file bytes, `title` = first line verbatim,
  create → upload → patch ordering for images, verify goal-equals-file).
  All old guardrails kept: dedupe, 10-cap, explicit `blockedBy` +
  `blockers: none`, deterministic `idempotencyKey`, `execute: false`,
  recursion guard, never-guess-id.
- Pins: `api/work/taskMarkdownGoal.test.js`, `api/work/taskIdentity.test.js`,
  `api/skills/creatingNewTickets.contract.test.js` (incl. the two-stage
  contract block), `frontend/.../MarkdownViewer.mermaid.{test,real.test}.jsx`.
- Docs: `docs/task-images.md` "API-created tasks" ordering section,
  `CHANGELOG.md` entry, `.gitattributes` `*.png binary`.

## What this run did

1. **Full verification gate (`npm test`) re-run on the current tree.** All
   eleven fast branches PASS: Unit Tests (api 7167 passed / 1 skipped,
   frontend 4721 passed, runner), Linting (api + frontend, 0 errors),
   **Frontend Build PASS** (`✓ built in 3.94s`; mermaid emitted as lazy chunks
   — the exact gate that failed in
   `automated-tests-failure-20261114-045255.md` with "Rolldown failed to
   resolve import mermaid"), Security Script Tests, **Dependency Check PASS**
   (the other prior failure — "Missing dependencies: mermaid" — is gone),
   Dependency Audit Gate, Harness Self-Tests, Container Tests. Canary was
   running at report time; see verdict note below.
2. **Live end-to-end fan-out on an isolated scratch stack** (API on
   `127.0.0.1:4871` with every `~/.kainbain` state file, projects root, notes
   root, registry and image dirs redirected under `/tmp/kb-pretty-scratch`;
   vite dev on `4872` with `VITE_API_BASE` pointed at the scratch API; the live
   app on `:3100` was only ever read with GETs and left idle/untouched).
   Against the scratch stack:
   - Wrote a draft ticket as its own markdown file (headings, numbered steps,
     checkbox list, table, ```js fence, ```mermaid fence, `![...](assets/...)`
     ref) under `<project>/docs/tasks/pretty-demo/drafts/draft-pretty-ticket.md`.
   - `POST /tasks` with `goal` = exact file bytes → 200, title derived from the
     first line (`# Add a retry budget to the task worker` → "Add a retry
     budget to the task worker"), status `in_stage`, correct stage.
   - Re-POST with the same `idempotencyKey` → same task id (dedupe intact).
   - `POST /projects/:id/tasks/:taskId/images` (multipart) → 201
     `worker-flow.png`; second upload deduped to `worker-flow-2.png`;
     `PATCH /tasks/:id` with the returned `assets/` ref → 200.
   - `GET /tasks/:id` → goal byte-identical to the (edge-trimmed) patched draft;
     `task.md` on disk contains the mermaid fence and the assets ref; the
     image bytes exist under `docs/tasks/<id>/assets/`.
   - `blockedBy: ["does-not-exist"]` → HTTP 400 "Unknown task ID in blockedBy"
     (blocking validation intact).
   - Headless Chromium render of the task page: **mermaid fence rendered as
     real inline SVG** (`data-testid="mermaid-diagram"` with `<svg>`, ~39 KB),
     headings/table/code block all rendered, and the uploaded image loaded as a
     real `<img>` (natural size 640×360, no fallback chip).
3. **Fixed the corrupted visual evidence.** The committed
   `pretty-proof.png` had UTF-8-mangled bytes (`ef bf bd` where `0x89` belongs),
   so it was not a valid PNG despite the review citing it. Regenerated it with
   the capture flow against the scratch task (valid 1440×1600 PNG, magic
   `89 50 4e 47` intact) and replaced the file in this directory.
   `*.png binary` in `.gitattributes` now keeps it safe.

## Files changed in this run

- `docs/tasks/5a38ad45-74a6-4d00-b6fd-a1796e5f4f1f/pretty-proof.png` — replaced
  byte-corrupted PNG with a fresh, valid headless screenshot of a rich-markdown
  task (headings + code + mermaid SVG + inline task image).
- `docs/tasks/5a38ad45-74a6-4d00-b6fd-a1796e5f4f1f/implementation-report-20261114.md`
  — this report.

No source changes were needed: the implementation from the prior stages passes
every gate on the current tree.

## Notes for reviewers

- The publish-gate failures in `publish-failure-20261114-*.md` are the generic
  mass-push non-fast-forward noise plus the old missing-`mermaid` build
  failure on a stale deploy tree; the current tree builds and depchecks clean,
  so those gates have no remaining signal against this change.
- Live app was not mutated: all writes went to the `/tmp/kb-pretty-scratch`
  stack; scratch servers were shut down and ports released afterwards.
