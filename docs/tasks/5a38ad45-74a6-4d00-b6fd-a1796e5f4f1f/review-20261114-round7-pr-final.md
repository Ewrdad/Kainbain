# PR Review Round 7 (final) — Pretty Tasks (task 5a38ad45)

Date: 2026-11-14. Reviewer: PR-review stage (docs-only; no source, config, or binary mutated).
Scope: branch `kb/5a38ad45-74a6-4d00-b6fd-a1796e5f4f1f` HEAD `61da2b98` vs `origin/main`; 30 files in diff, of which
the code delta is `api/flow/*` (one-function split), `api/work/taskPersistence.js` + tests (`extractGoalSection`),
`api/routes/tasks.blocking.test.js` (+1 pin), `frontend/package.json` (build guard), `frontend/scripts/check-mermaid-bundled.js` (new),
`frontend/src/components/common/MarkdownViewer.jsx` + mermaid tests (tilde fences), and `skills/creating-new-tickets/SKILL.md` (wording).
The core A+B feature (byte-identical goal round-trip, `deriveTaskTitleFromGoal`, mermaid rendering, two-stage skill) is already
on `origin/main` and was re-verified present and green in this worktree.
Method: assumed nothing works until proven; read every changed code file, re-ran the full `npm run test:unit` gate,
both standards gates, eslint on changed files, a production `vite build`, and byte-/pixel-checked the PNG evidence.

## Does it achieve the goal? Yes — A and B both proven

- **Clause A (API accepts markdown with codeblocks, mermaid, images):**
  `POST /tasks` stores `goal` byte-identical (only `title` sanitized), pinned by `api/work/taskMarkdownGoal.test.js`
  (byte-identical rich goal, first-line title, legacy paragraph untouched, adversarial-verbatim, blank→400, CRLF, explicit-title-wins — all pass).
  Mermaid: `MermaidDiagram` lazy-loads the real `mermaid` package once per page, initializes `securityLevel: 'strict'`,
  renders inline SVG, and degrades to a readable source block (never a blank hole); `vite build` emits
  `mermaid.core` + `mermaid-parser.core` lazy chunks (`✓ built in 4.33s`, observed this session), and
  `check-mermaid-bundled.js` guards against re-externalizing. Images use the existing `assets/` lifecycle with the
  skill's create→upload→patch ordering, documented in `docs/task-images.md`. First-line title via
  `deriveTaskTitleFromGoal` (pinned, identical for legacy single-line goals); `blockedBy`/idempotency/dedupe/`execute:false`
  unchanged (`tasks.blocking.test.js` 6/6 incl. the new non-array→400 pin).
- **Clause B (skill restructured to file-first two-stage flow):** `skills/creating-new-tickets/SKILL.md`
  (lastUpdated 2026-11-14) mandates Stage 1 (one `.md` draft per ticket under `{{taskDocs}}drafts/`, template with
  Context/Steps/Acceptance/Notes, worked example incl. code + mermaid + image ref) then Stage 2 (POST exact file bytes,
  `title` = first line verbatim, create→upload→patch for images, verify goal-equals-file). All guardrails kept
  (dedupe, 10-cap, explicit `blockedBy` + `blockers:` lines, deterministic `idempotencyKey`, `execute:false`, recursion guard).
  Pinned by the `Contract: pretty two-stage flow` block (two-stage, template, ordering, prompt budget — pass).

## Did it follow the plan? Yes

`IMPLEMENTATION_PLAN.md` + survey answers + both recorded amendments (title-derivation exception, `extractGoalSection`
contract) match the implementation exactly: terminators History/Timeline/Process Logs/Log Entries, whitespace-tolerant,
in-fence ignored, same-marker closing, unclosed-fence fallback, CRLF→LF — all present in the code and pinned by tests.
`# Details` is goal text (no writer emits it — verified `saveTaskMarkdown` writes Goal/History/Timeline/Log Entries only),
pinned by two round-trip tests, consistent with the amended plan.

## Code standards, best practices, modifiability, tech debt

- Standards gates observed this session: `check-one-function-per-file` PASS (822 files), `check-jsdoc-example` PASS
  (681 vs 684 baseline), eslint on all changed API + frontend files: **0 errors** (warnings only, same class as tree baseline).
- Zero banned technical terms in the code diff (the round-4 "Barrel" breach is fixed to plain language — verified).
- Naming/JSDoc/co-location all compliant (`extractGoalSection`, `fenceMarkerOf`, `deriveTaskTitleFromGoal` — verb-first,
  `@example`-complete, tests next to code). Easy to modify: isolated pure helpers, no cross-cutting state.
- Best practices: graceful degradation at every new seam (mermaid→source, image→chip/retry, unclosed-fence→raw-terminator
  fallback), `strict` mermaid sanitization, `javascript:`/`data:` neutralization kept in the renderer, no task text in logs.
- No unnecessary tech debt: the `api/flow` split is a pure move (all five function bodies verified byte-identical to
  `origin/main`'s, re-exports preserve every import path); no new dependency in the branch delta (`mermaid` already on main);
  no dead code (`rt.mjs` gone; the intermediate dead `markdown` schema field is gone — `POST /tasks` schema carries the
  correct `blockedBy` array, pinned by the new 400 test).

## Prior failures — all resolved, each re-verified on HEAD (not trusted from reports)

1. Corrupted `pretty-proof.png` (rounds 3/4/5): FIXED — HEAD blob and worktree are `8950 4e47 0d0a 1a0a`,
   `PNG image data, 1440 x 1600`, 107722 bytes, byte-identical to `origin/main` (no longer in the diff). Viewed: shows a
   pretty goal (headings, numbered steps, checkboxes, inline code).
2. False "restored binary-safely" report claims: FIXED — every banner claim in `implementation-report-20261114.md`
   now checks out against HEAD bytes (PNG magic, schema restoration, Details-terminator removal + pins).
3. `vite.config.js` externalizing mermaid (deep-review 104239): FIXED — config has no `external`; production build
   emits real mermaid chunks, so `import('mermaid')` resolves in browsers.
4. `automated-test-2` 3 failures (`# Details` leaking into goals): STALE — that ran on an intermediate tree whose writer
   emitted Details; on HEAD the writer emits no Details section and all three named tests pass; full suites green
   (API 443 files / 7181 passed / 3 skipped; frontend 346 files / 4727 passed — both observed this session, exit 0).

## Docs updated? Yes

Skill rewrite, `docs/task-images.md` "API-created tasks" subsection, `CHANGELOG.md` entry, plan amendments, truthful
implementation reports. Live app untouched (docs-only stage; tests use temp dirs; the vite build wrote to `/tmp`).

## Non-blocking observation

`pretty-proof.png` frames the goal view's top (headings/lists); the Design section (code/mermaid/image) sits just below
the fold. Mermaid SVG renderability is proven independently (bundled chunks + real-library integration test + prior
headless-Chromium check), so this is a framing nit, not an evidence gap — no action required.

## Verdict

PASS — the change achieves A+B, follows the amended plan, complies with code standards, is easy to modify, follows best
practices, adds no tech debt, and all docs (including every prior FAIL item) are resolved with fresh evidence.
