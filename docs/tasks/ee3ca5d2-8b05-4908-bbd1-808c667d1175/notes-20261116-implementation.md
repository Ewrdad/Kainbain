# Implementation notes — section-rename guardrail (2026-11-16)

## Survey defaults (plan Phase 0, Step 1)
- `SURVEY.md` actually records answers: q1 = "Keep showing the old category
  until the owner updates the articles", q2 = Forever (recommended),
  q3 = Docs categories only (recommended).
- Implemented behavior follows the task acceptance criteria + plan §4:
  alias + owner-facing `console.warn`, aliases kept forever, docs-only scope.
  q1's recorded note conflicts with the task's explicit criterion
  ("Old-section frontmatter still indexes (aliased) with a recorded warning"),
  so the criterion won; q2/q3 match the recorded answers. No owner reachable
  in this run; recorded here as assumed.

## Red-team baseline (plan Step 2, scratch probe in /tmp, not committed)
- Current HEAD: `listDocs`/`getDoc` on a temp dir with `how-it-works` /
  `working-with` frontmatter resolve to `concepts` / `workflows` (non-null,
  indexed). Ad-hoc alias from the prior task works.
- Unknown sections still return null from `readDocFile` (the original
  silent-drop shape when no alias exists) — the exact boundary the guardrail
  now locks.

## Mutation probes (plan Step 8, all throwaway edits reverted)
- (a) Removed `LEGACY_SECTION_ALIASES['working-with']` → guardrail test
  fails: `[siteDocs taxonomy guardrail] Retired section "working-with" is
  neither a current DOC_SECTIONS member nor a key of
  LEGACY_SECTION_ALIASES ... Fix: add
  LEGACY_SECTION_ALIASES['working-with'] = '<new-section>' plus a
  DEPRECATIONS.md entry; see the REQUIRED RENAME PROCEDURE on DOC_SECTIONS
  in api/siteDocs.js.` (plus the pre-existing legacy tests red — silent
  drop reproduced).
- (b) Renamed `workflows` → `journeys` in `DOC_SECTIONS`/`SECTION_LABELS`
  without an alias → guardrail fails naming `"workflows"` with the same fix
  pointer; legacy-`working-with` articles drop from `listDocs` (missing slug)
  and `getDoc` returns null — the continuity-failure shape, now loud.
- (c) Valid rename `reference` → `handbook` with alias +
  `KNOWN_SECTION_HISTORY` update + `DEPRECATIONS.md` mention + frontend
  mirror + pinned id-list updates → all 4 siteDocs suites green (29/29).
  Note: the pre-existing exact-equality assertions (`DOC_SECTIONS`,
  `LEGACY_SECTION_ALIASES`, deploy layout, frontend order) pin the id lists,
  so a real rename updates those pinned lists too — expected, part of the
  procedure's step 1/5.

## Gates (final tree)
- `npm run test --prefix api`: 444 files, 7212 passed, 1 skipped.
- `npm run lint --prefix api`: 0 errors (only pre-existing warnings).
- `npm run docs:check`: 47 tests passed, doc-links + jsdoc-example PASS.
