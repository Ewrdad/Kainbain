# PR Review Round 8 (final, docs-only) — Pretty Tasks (task 5a38ad45)

Date: 2026-11-14. Reviewer: PR-review stage (docs-only; only files under `./docs/`
touched by this stage). Scope: worktree HEAD `c1e0562` on branch
`kb/5a38ad45-74a6-4d00-b6fd-a1796e5f4f1f`, read against all prior reports in this
folder. Method: assumed nothing works until proven — re-read the changed code,
re-ran the full test suites and gates in this session, and ran an independent
end-to-end script (scratchpad, temp dirs only) through the real
`createTask` → `saveTaskMarkdown` → `task.md` → `parseTaskMarkdown` path. No
live app was touched; no long-lived servers; the frontend build wrote to `/tmp`.

## Does it achieve the goal? Yes — both clauses proven, not just claimed

- **Clause A (API accepts pretty markdown):** `POST /tasks`
  (`api/work/taskWorkRoutes.js`, `resolveTaskContext`) passes `goal` through
  byte-identical on create (only `title` is sanitized; blank goal → 400). My
  independent script created a task whose goal contains headings, a `js` fence,
  a `mermaid` fence, a fence that quotes a fake `# History`, and
  `assets/` + absolute image refs: `goal byte-identical at create: true`,
  `task.md` contains the mermaid fence and image refs, and the reloaded goal
  equals the original (the only delta is the pre-existing edge-trim on disk
  re-read — the old regex did `goalMatch[1].trim()` too, verified against
  `28d91e0~1`; the skill text already documents this). Rendering:
  `MarkdownViewer.jsx` handles code blocks, `sanitizeUrl` (blocks
  `javascript:`/`data:`/`vbscript:`), `MdImage` with task-asset resolution, and
  ` ```mermaid ` fences via `MermaidDiagram` (lazy `import('mermaid')` shared
  promise, `securityLevel: 'strict'`, source-block fallback on failure).
  `mermaid@12.3.0` is installed; `check-mermaid-bundled.js` prints OK; production
  `vite build` (to `/tmp`) exits 0 in 3.75s and emits `mermaid.core` /
  `mermaid-parser.core` as lazy chunks, so diagrams render and stay out of the
  main bundle.
- **Clause B (two-stage skill):** `skills/creating-new-tickets/SKILL.md`
  (lastUpdated 2026-11-14) mandates Stage 1 — one `.md` draft per ticket under
  `{{taskDocs}}drafts/` with a Context/Steps/Acceptance/Notes template and a
  worked example containing code, mermaid, and an image ref — then Stage 2:
  `POST /tasks` with `goal` = exact file bytes and `title` = first line verbatim,
  create → upload → patch for images, and a verify step (goal-equals-file).
  `{{taskDocs}}` is a real keyword (`api/promptCuration.js` L115+). Pinned by the
  `Contract: pretty two-stage flow` block in
  `api/skills/creatingNewTickets.contract.test.js` (passed this session).
- **Preserved behaviour:** first-line title via `deriveTaskTitleFromGoal`
  (`api/work/taskIdentity.js`, CRLF/CR-safe, 60-char cap — identical for legacy
  single-line goals; my script: `# Fix the retry loop\n...` → title
  `Fix the retry loop`, legacy paragraph unchanged). Blocking intact:
  `tasks.blocking.test.js` 6/6 passed; my script got
  `Unknown task ID in blockedBy: ...` for both an unknown id and a self-block.
  Idempotency/dedupe/`execute:false`/10-cap/recursion guard are all still in the
  skill and pinned by contract tests.

## Did it follow the plan? Yes

`IMPLEMENTATION_PLAN.md` with its two recorded amendments (title-derivation
exception; fence-aware `extractGoalSection` contract) matches the code:
terminators `# History|# Timeline|# Process Logs|# Log Entries`,
whitespace-tolerant, in-fence terminators ignored, same-marker fence closing,
unclosed-fence fallback, CRLF→LF — all present in `api/work/taskPersistence.js`
and pinned by `taskPersistence.test.js` (passed).

## Code standards / best practices / tech debt / modifiability

- Gates re-run this session: `check-one-function-per-file` PASS (822 files),
  `check-jsdoc-example` PASS (680 = baseline 680), `check-doc-links` PASS
  (71 doc files), eslint on all touched API files and `MarkdownViewer.jsx`:
  **0 errors** (warnings only, same class as tree baseline).
- New logic is isolated pure helpers (`deriveTaskTitleFromGoal`,
  `extractGoalSection`, `fenceMarkerOf`, `loadMermaid`) with tests next to the
  code — easy to modify. Graceful degradation at every new seam (mermaid →
  source block, image → retry/chip, unclosed fence → raw terminator). No new
  tech debt; the branch's `deploy.sh`/`publish.sh` stale-dependency bootstrap
  exists because of this feature (warm worktrees missed `mermaid`) and is
  covered by `tests/publish.test.mjs` — ran it this session: **8 pass / 0 fail**.

## Tests run this session (all green, exit 0)

- Full API suite: **443 files / 7186 passed / 1 skipped** (137.8s).
- Full frontend suite: **346 files / 4727 passed** (35s), incl.
  `MarkdownViewer.mermaid.*` (40 tests across the 3 MarkdownViewer files).
- Targeted: `taskMarkdownGoal`, `taskIdentity`, `taskPersistence`,
  `taskLifecycle`, `tasks.blocking`, `creatingNewTickets.contract` — 146 passed.
- `agentGuide.apiCoverage` + `docs.apiCoverage` — 4 passed (note: they only pin
  real→doc direction, which is why the doc bug below slipped through).
- `node --test tests/publish.test.mjs` — 8 passed.
- `vite build` to `/tmp/kb-fe-build` — exit 0, mermaid lazy chunks emitted.
- Independent e2e script (scratchpad): byte-identical create, task.md contents,
  disk re-read, first-line title, legacy goal, unknown/self blocker 400s.

## Defects found by this review — both docs-only, both FIXED in this stage

1. **`docs/Agent Integration Skill.md` documented a non-existent API.** It told
   agents to pass a `content` field on `POST /tasks` and to upload markdown via
   `POST /tasks/:id/attach`. Neither exists (no `content` in the create schema
   or any handler; the only `/tasks/*` routes are `/tasks`, `/tasks/:id`,
   `/tasks/preview`, `/tasks/queue`, `/tasks/:id/logs`, `/tasks/:id/survey`,
   `/tasks/:id/reports`; images go through
   `POST /projects/:id/tasks/:taskId/images` + `PATCH /tasks/:id`). An agent
   following that doc would silently drop its markdown (`content` is ignored by
   the schema) and 404 on `attach` — producing exactly the ugly paragraph tasks
   this task exists to eliminate. **Fixed:** rewrote the "Creating a task"
   section to document the real contract (`goal` verbatim markdown, first-line
   title, `blockedBy`, `idempotencyKey`) and the real two-stage flow
   (draft file under `docs/tasks/<task-id>/drafts/` → POST exact bytes →
   create/upload/patch for images). Verified no `attach`/`content` references
   remain anywhere in the repo outside node_modules; doc-link and apiCoverage
   checks re-run green after the edit.
2. **`pretty-proof.png` was corrupted again on this branch.** HEAD blob is
   191679 bytes starting `ef bf bd 50 4e 47` (U+FFFD + "PNG" — a text-mode write
   mangled the `89 50 4e 47` magic; `file` reports "data"). At `61da2b9` (what
   round 7 reviewed) and on `main` it is a valid 107722-byte PNG
   (`8950 4e47 0d0a 1a0a`, 1440x1600). A later "Runner local-alpha stage output"
   commit (`bf3375b`/`f648a40`) re-corrupted it — the same failure mode rounds
   3–5 reported. **Fixed:** restored the valid blob from `61da2b9` into the
   worktree; now `PNG image data, 1440 x 1600`, 107722 bytes, magic verified.

## Minor observations (non-blocking)

- `taskWorkRoutes.js` PATCH handler has the two `updates.goal`/`updates.body`
  lines over-indented by one tab (branch delta) — cosmetic only, valid JS,
  behaviour (PATCH trims edge whitespace) is tested.
- Disk re-read of a goal trims edge whitespace (pre-existing since the old
  regex); the skill's verify step already accounts for it.

## Verdict

The change achieves A + B, follows the amended plan, passes all standards
gates, adds no tech debt, and every prior FAIL item is resolved with fresh
evidence from this session. The two defects this review found were confined to
`./docs/` and have been fixed in this stage. Suitable to integrate.

KAINBAIN_VERDICT: PASS
