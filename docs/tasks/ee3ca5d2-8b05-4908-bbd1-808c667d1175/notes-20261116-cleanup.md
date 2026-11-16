# Cleanup notes — section-rename guardrail hardening (2026-11-16)

## What the cleanup changed (vs the implementation stage)

- `api/siteDocs.js`
  - New pure export `resolveSectionName({ rawSectionName })`: current ids pass
    through, retired ids resolve via `LEGACY_SECTION_ALIASES` (own-property
    lookup, so `__proto__`/`toString`/etc. can never mis-resolve), everything
    else resolves to null. No logging; `readDocFile` owns all warnings.
  - `KNOWN_SECTION_HISTORY` moved from the test file into the module next to
    the taxonomy (single source of truth). The taxonomy guardrail now asserts
    against the imported list; `readDocFile` also uses it at runtime to tell a
    retired id missing its alias (upgrade break — loud warning naming the id
    and the fix) apart from a plain typo.
  - `readDocFile`/`listDocs`/`getDoc`: section-caused skips are never silent
    (aliased-retired, unaliased-retired, unknown, missing section all warn
    naming the file). Non-ENOENT filesystem failures warn via the shared
    `warnUnlessFileMissing` helper; ENOENT stays silent (normal miss/empty
    signal); missing-title/invalid-slug behavior unchanged. No signature
    changes, no new imports (the deploy test copies this file solo).
  - `DOC_SECTIONS` docblock procedure updated (history now lives in this file).
  - Descriptive identifiers throughout per KB Code Standards.
- `api/siteDocs.test.js`: helpers hoisted above use, shared
  `captureOwnerWarnings` helper (warn-shape assertions + clean suite output),
  exact warning counts, new `resolveSectionName` unit suite, new loud-skip
  suite, two extra guardrail assertions (alias keys in history, history
  hygiene), guarded `DEPRECATIONS.md` read with a clear failure message.
- `DEPRECATIONS.md`: coverage bullet now names the guardrail + loud-skip
  behavior. No new taxonomy entry (no rename shipped here).

## Isolation bug found by the mutation probe (fixed)

The runtime-bypass test temporarily deletes an alias entry. Its first version
restored with a plain assignment in `finally`, which recreates a deleted key
as an own-property with value `undefined` — on a tree where the alias was
already removed this masked the guardrail failure and failed a different
assertion instead. The probe caught it (guardrail unexpectedly green); the
test now restores exactly the pre-probe shape (re-delete when the key did
not exist). Re-ran probe: guardrail fails naming the retired id.

## Probe evidence (all throwaway edits reverted; `git status` clean apart
## from the three intended files)

- (a) Alias entry removed → guardrail fails:
  `[siteDocs taxonomy guardrail] Retired section "working-with" is neither a
  current DOC_SECTIONS member nor a key of LEGACY_SECTION_ALIASES ...` plus
  the 5 regression tests red.
- (b) `workflows` → `journeys` without alias → guardrail fails naming
  `"workflows"` (plus dangling-alias-target and history-coverage failures).
- (c) Valid rename `reference` → `handbook` (alias + history + deprecation
  note + frontend mirror + pinned-list updates) → 4 siteDocs suites 39/39.

## Gates (final tree)

- `npm run test --prefix api -- siteDocs`: 4 files, 39 passed, no stderr noise.
- `npm run test --prefix api` (full): 444 files passed, 7220 passed, 3 skipped
  (skips are pre-existing environment-conditional skips in unrelated suites).
- `npm run lint --prefix api`: 0 errors; touched files carry only the 2
  pre-existing warnings (frontmatter regex + meta sink).
- `npm run docs:check`: 8 files / 57 tests passed, doc-links + jsdoc-example PASS.
- `check-one-function-per-file`: PASS (no new files added).

## Operational continuity

- Behavior change is warnings-only: index/article shapes, routes, and the
  frontend mirror are untouched. Valid content (incl. the shipped `site-docs/`
  dir) emits zero new warnings; custom `KAINBAIN_SITE_DOCS` dirs keep indexing
  retired sections via the forever aliases. No migration, transfer, or deploy
  steps needed.
