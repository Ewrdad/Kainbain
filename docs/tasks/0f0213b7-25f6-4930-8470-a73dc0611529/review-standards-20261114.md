# Standards review — dependency-manifest guardrail branch vs main

Reviewed `main...HEAD` (17 files) against `docs/KB Code Standards.md`.
Evidence re-run on this checkout: `node --test` (83 pass), `npm run lint`
(0 errors), `npm run check:deps:frontend` (pass, 732 files), `check:one-function`
pass, `check:jsdoc-example` pass, `docs:check` pass.

## 1. User understandable over technical language — PASS

- Long descriptive names throughout (`packageDirectoryPath`, `violationsList`,
  `sourceFilePaths`, `declaredDependencies`, `searchableText`, `codeMask`).
- No `factory` / `barrel` or design-pattern terminology. `PATTERN` appears only
  as regex variable names (e.g. `DYNAMIC_IMPORT_PATTERN`), which is regex
  vocabulary, not a design-pattern reference.
- Plain-English JSDoc on every exported function explains *why* (case-study
  header, `NON_PACKAGE_SPECIFIERS` rationale, `collectSourceFiles` exclusions,
  throw-instead-of-guess rationale, `run-tests.mjs` preflight comment).
- Labelled-object pattern used for all gate entry points:
  `checkPackageDirectory({ packageDirectoryPath })`,
  `formatUndeclaredReport({ violationsList, … })`,
  `findUndeclaredImports({ packageDirectoryPath })`, and callers pick fields
  before invocation (`scripts/run-tests.mjs`).
- Every function carries an `@example` (only non-exported internals without
  one would be a gap; here `maskCommentsAndStrings`, `listDependencyNames`,
  and `findViolationsInFiles` all have `@example` too).

## 2. Functional over object-oriented — PASS

- Zero `class` declarations; plain exported functions only.
- Pure core (`extractImportSpecifiers`, `mapSpecifierToPackageName`,
  `formatUndeclaredReport`, `resolvePackageDirectory`) does no I/O. I/O is
  confined to clearly verb-named collectors/readers (`collectSourceFiles`,
  `readDeclaredDependencies`) that document `@throws`.
- `let` is used only for single scan/loop state (`mode`, `index`, `entries`);
  everything else is `const`.
- All 11 functions are verb-named and single-responsibility. The one internal
  helper (`collectMatches`) deduplicates five regex-exec loops — the
  standards' own regex-abstraction exception covers it.

## 3. Co-location over abstraction — PASS (with precedent note)

- Check script lives at `frontend/scripts/check-imports-declared.js`, next to
  its siblings `check-react-imports.js`, `check-mermaid-bundled.js`,
  `check-no-deprecations.js`. Its test lives at
  `tests/check-imports-declared.test.mjs`, following the exact precedent of
  `tests/deprecation-gate.test.mjs` (for `check-no-deprecations.js`) and
  `tests/check-duplicate-settings.test.mjs`. Strictly the standards prefer a
  test next to its file, but `frontend/scripts/` has no co-located tests and
  the gate suites are centralised under `tests/`; the branch follows repo
  convention, which is the searchable intent.
- Helpers (`collectMatches`, `childEnv`) are only taken where they remove real
  repetition.

## 4. Tested over trusted — PASS

- 41 new unit/scanner/mapping tests plus fixture fail/pass, CLI exit-code,
  and contract tests pinning gate ordering (check first in `build`, before
  `runParallel(fast)`). Lowest-level unit tests dominate; no e2e needed.
- Fail-safe by design: missing/unparseable manifest throws, unreadable file
  throws naming the file, zero-files scan throws (no vacuous pass), CLI misuse
  throws with usage. Failures name file + package + same-commit fix and exit 1
  without stack traces in the gate.

## 5. Fast iteration over long planning — PASS

- Stdlib-only, ~0.5s on the clean tree, no new dependencies, no lockfile diff.
  Read-only scanner; safe to run in the build/preflight slot.
- `IMPLEMENTATION_PLAN.md` phased the work (recon → unwired scripts →
  baseline → wiring → fixture proof → docs).

## Non-blocking observations (not standards failures)

- `tests/install-runner-wrapper.test.mjs` adds a `KAINBAIN_RUNNER_INSTALL_ROOT`
  hermeticity fix plus a decoy test. It is scope expansion beyond the ticket's
  three criteria, but it is test-only (no installer behavior change), minimal,
  and explains its why in comments. Future branches should land such fixes
  separately, but it does not violate the standards text.
- `frontend/scripts/` is outside the WP-8 gate scope (`api/`, `shared/`,
  `frontend/src/` only), so the 8 exported functions here do not breach any
  written standard; siblings with many exports set the precedent.
- Lint shows 0 errors; new files carry only the same
  `detect-non-literal-fs-filename` warnings their sibling check scripts
  already emit.
