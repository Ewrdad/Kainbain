# Retrospective — task bae668cb-1f18-4034-8f10-d8fff31bfb8b

Stage: `retrospective` (stage-1794594754686), wf-default, project `kainbain`
(`0fd41821-d8a5-4e49-bc2e-28ce8c739a0a`). Date: 2026-11-17.

## What this ticket achieved

End state C (consolidation) shipped: the frontend hand mirror
(`DOC_SECTION_ORDER` / `DOC_SECTION_LABELS` in
`frontend/src/components/docs/docsSections.js`) is deleted; order/labels derive
at runtime from `GET /docs` (`{ sections, sectionLabels, docs }`, single source
`buildDocsIndex()` in `api/siteDocs.js`) via pure helpers `deriveSectionOrder` /
`resolveSectionLabel`. Content-derivation (end state D) was investigated and
proven unsafe with evidence (FINDING-derivation-vs-consolidation.md, Spikes A–C:
no `label:` frontmatter exists, per-article `order` makes section order unstable,
empty-section silent drop is indistinguishable from the guarded failure,
`KAINBAIN_SITE_DOCS` makes derived taxonomy per-deployment). Safety properties
held: retired ids resolve via `LEGACY_SECTION_ALIASES` + owner-facing warning;
the guardrail fails loudly naming alias-less retired ids (mutation probes in
VERIFICATION-20261117.md / CLEANUP-20261117.md); gates green (test:api 7308
passed, lint:api 0 errors, docs:check PASS). One rename touch-point (frontend
mirror + its pinned literals) deleted.

## Difficulties / failures found in this ticket's history

1. **False stage FAIL from a stale worktree.** The Quick review stage
   (`stage-1787914510327`) failed with "No structural change delivered" because
   it reviewed a local checkout (`223fb0ed`) 2 commits behind the pushed tip
   (`f4a7c2fb`) which already contained the implementation
   (quick-review-failure-20261117-001949.md; STANDARDS-REVIEW-20261117.md
   "Do not merge the stale base"; VERIFICATION-20261117.md calls the review
   stale). Cost: one full stage execution + fallback routing.
2. **Gate violation caught only in a later stage.** An intermediate commit put
   two top-level functions in `docsSections.js`; `check:one-function` FAILED on
   that HEAD and was fixed only in the Cleaning pass (CLEANUP-20261117.md).
   The gate is pure-node and could have run in the introducing stage.
3. **Full gates not re-runnable from runner worktrees.** Verified in this
   session: no root `node_modules`, no `api/node_modules`, `vitest` not on
   PATH. Review/docs-only stages could not re-run `test:api` / `lint:api` /
   `docs:check` and had to cite prior-stage counts (PR-REVIEW-20261117.md
   "Scope limit"; STANDARDS-REVIEW-20261117.md §4).
4. **`check:jsdoc-example` checks `@example` presence only**
   (`hasExampleTag` is a regex; `--strict` only ignores the baseline). A
   deliberately wrong `=>` example passed (VERIFICATION-20261117.md caveat), so
   edited docblocks are covered for presence only.
5. **Remaining tech debt:** a rename still edits `DOC_SECTIONS` +
   `SECTION_LABELS` as two literals in `api/siteDocs.js` (plus aliases, history,
   `DEPRECATIONS.md`, tripwire literals) — the next-cheapest consolidation.

## Follow-up tickets raised (dedupe-checked against all 62 existing tasks in the
project; none existed; each created with a deterministic idempotencyKey,
`execute:false`, targeting stage `1` = Idea of wf-default — never the currently
executing retrospective stage)

| Ticket id | Title | Stage |
|---|---|---|
| `7adca0b7-0199-425d-8460-4214fffb0d8a` | Guard review stages against stale worktrees: verify HEAD matches the pushed branch tip before any verdict | 1 |
| `6df95fc8-bb5c-4502-9052-fafe0b94c5ff` | Run the dependency-free repo gates (one-function, doc-links, jsdoc-example) in every agent stage's done-criteria | 1 |
| `44ee3404-7e6c-4134-90e7-df90e24beb4a` | Make full test/lint gates re-runnable from runner worktrees (shared node_modules or a runner verify endpoint) | 1 |
| `e4b63322-fd2b-4eaa-a7dd-b203bfef46c7` | Make check-jsdoc-example evaluate @example expressions instead of only checking tag presence | 1 |
| `ddd87c57-6393-4edc-b806-f4d87bf0496a` | Collapse DOC_SECTIONS + SECTION_LABELS into one section-definition record (next-cheapest site-docs rename touch-point) | 1 |

Each ticket's goal text is self-contained (states problem, evidence, fix,
acceptance criteria) and references this task
(`bae668cb-1f18-4034-8f10-d8fff31bfb8b`) plus the specific report files as the
case study. All five verified via `GET /tasks/<id>?projectId=...`: stage `1`,
workflow `wf-default`, status `waiting_human`. Total project tasks went 62 → 69,
exactly +5 (no duplicates).
