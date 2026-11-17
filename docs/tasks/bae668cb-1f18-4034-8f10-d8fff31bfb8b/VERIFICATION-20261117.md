# Verification notes — implementation re-check (2026-11-17)

The Quick-review failure claimed the branch held planning docs only. That
review was stale: `git diff main...HEAD --stat` shows the planned end-state-C
implementation already landed (commits `9559b9d1`, `9e725b9d`, `a6e9fc16`).
This stage re-verified every plan step on the current HEAD and re-ran the
Step-8 mutation probes independently. All evidence below was observed in this
session; the working tree is byte-identical to HEAD after the probes
(`git status --short` empty).

## What the diff deletes (touch-point count)

Baseline (main): a rename touches ~7 places across 8 files —
`DOC_SECTIONS`, `SECTION_LABELS`, `LEGACY_SECTION_ALIASES`,
`KNOWN_SECTION_HISTORY`, `DEPRECATIONS.md`, the frontend hand mirror
(`DOC_SECTION_ORDER` + `DOC_SECTION_LABELS` in
`frontend/src/components/docs/docsSections.js`), and exact-equality test
literals (`api/siteDocs.test.js`, `frontend/.../docsSections.test.js`,
`api/siteDocs.frontendParity.test.js`).

Final (this branch): `docsSections.js` exports only
`deriveSectionOrder(index, docs)` / `resolveSectionLabel(index, section)` —
pure functions of the `GET /docs` payload, no literals. `GET /docs` ships
`sectionLabels` from the new `buildDocsIndex()` single source
(`api/siteDocs.js`), and `DocsView.jsx` reads order/labels from the index.
Deleted touch-point: the frontend hand mirror (source + its pinned literals).

## Step-8 mutation probes (each reverted via `git checkout --` right after)

1. Removed `"working-with": "workflows",` from `LEGACY_SECTION_ALIASES` →
   6 failures in `api/siteDocs.test.js`, including the guardrail:
   `[siteDocs taxonomy guardrail] Retired section "working-with" is neither
   a current DOC_SECTIONS member nor a key of LEGACY_SECTION_ALIASES —
   articles using "section: working-with" would silently vanish from
   listDocs/getDoc. Fix: add LEGACY_SECTION_ALIASES['working-with'] =
   '<new-section>' plus a DEPRECATIONS.md entry; see the REQUIRED RENAME
   PROCEDURE on DOC_SECTIONS in api/siteDocs.js.`
2. Renamed `workflows` → `flows` in `DOC_SECTIONS`/`SECTION_LABELS` with no
   alias → guardrail failed naming `workflows` with the same fix text, plus
   the history-coverage and dangling-target (`working-with` → `workflows`)
   guardrails fired — defense in depth confirmed.
3. Valid rename `reference` → `runbooks` (new id + alias +
   `KNOWN_SECTION_HISTORY` entry + dated `DEPRECATIONS.md` entry + migrated
   all 10 `site-docs/*.md` frontmatter files + updated the 5 intentional
   backend tripwire literals in `api/siteDocs.test.js`,
   `api/routes/docs.test.js`, `api/siteDocs.deploy.test.js`,
   `api/routes/docs.apiCoverage.test.js`, and the alias-map `toEqual`):
   - `npm run test --prefix api -- siteDocs docs`: 14 files / 116 tests green.
   - `npm run docs:check`: 8 files / 61 tests green + doc-links + jsdoc PASS.
   - Frontend docs suites (`docsSections`, `DocsView`, `DocsNavigation`):
     36 tests green with zero frontend edits.
   - Rename diff file list: 17 files, **0 under `frontend/`** (proves the
     mirror touch-point is gone; full list in `/tmp/probe3-difflist.txt`
     scratch, session-only).
   - Legacy custom dir carrying `section: reference` indexed under
     `runbooks` with exactly one owner-facing warning:
     `[siteDocs] legacy.md uses retired section "reference"; resolved to
     "runbooks". Update frontmatter to "section: runbooks".`

## Gates (final tree, exit codes confirmed)

- `npm run test:api` → exit 0 — 449 files, 7306 passed, 3 skipped.
- `npm run lint:api` → exit 0 — 0 errors (559 pre-existing warnings).
- `npm run docs:check` → exit 0 — suites + doc-links + jsdoc-example PASS.
- `npm run test:frontend` → exit 0 — 353 files, 4795 passed.
- `npm run lint:frontend` → exit 0 — 0 errors (218 pre-existing warnings).

## Caveat (checked, not a blocker)

`scripts/check-jsdoc-example.mjs` enforces `@example` tag *presence* against
a grandfathered baseline — it does NOT evaluate `=>` example expressions
(proven: a deliberately wrong `DOC_SECTIONS => ['wrong']` example still
passed). So the Step-7 docblock rewrite is covered for presence only; its
accuracy rests on review, while the safety properties rest on the guardrail
and the probes above. The plan's "edited docblocks are covered" line
overstates this and should be read with that scope.
