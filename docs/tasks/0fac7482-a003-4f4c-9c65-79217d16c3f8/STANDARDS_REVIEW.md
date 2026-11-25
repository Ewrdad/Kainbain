# Standards Review — Remove `[Paused]` from the UI tab title

Task: `0fac7482-a003-4f4c-9c65-79217d16c3f8`, branch vs `main`.
Standards: `docs/KB Code Standards.md`.
Scope reviewed: `frontend/src/a11y/useDocumentTitle.js`, `frontend/src/components/App.jsx`, `frontend/index.html`, `frontend/src/a11y/useDocumentTitle.test.jsx`, `frontend/src/components/App.test.jsx`, `CHANGELOG.md`, `docs/manual-testing/05-ui-board-and-views.md`.

## Verdict: Compliant — PASS

All checks run in this review passed; no standards violation found that warrants failing the stage.

## Evidence

- `npm run test --prefix frontend -- src/a11y/useDocumentTitle.test.jsx src/components/App.test.jsx` — 39 passed (2 files).
- `npm run lint:frontend` — 0 errors (221 pre-existing warnings, none in the touched files' new lines).
- `npm run docs:check` — 61 tests passed; doc links OK; `check-jsdoc-example` PASS (679 missing vs 680 baseline — no new missing `@example`).
- `npm run check:one-function` — PASS; `npm run check:proof-hygiene` — only pre-existing baselined entries.
- Straggler grep: no `[Paused]`/`[Running]` or `Running] Kainbain`/`Paused] Kainbain` in shipped source (`frontend/src`, `frontend/index.html`).
- `titleForView` has one shipped caller (`App.jsx`); `computeRunning` removed from `App.jsx` destructuring and title call, still consumed by `KainBainContext`/`NowPlayingBar`/`Header` as intended.

## Per-principle findings

- **User understandable**: long descriptive names (`titleInputIsOptionsObject`, `rawTaskKey`, `cleanedTaskKey`, `safeTitle`); plain-English JSDoc stating why (no prefix so the tab never implies a single global state; fail-safe reasons); no design-pattern language; labelled `{ taskKey, projectName }` options at the call site; every export carries `MARK:` directly above `export` with `@example` tags (3 examples on `titleForView`).
- **Functional**: no classes/currying; `titleForView` is pure (same input → same title); minimum data (engine flag no longer passed to the title builder); single responsibility (build title / apply title). Pre-existing non-verb names (`titleForView`) were intentionally preserved for backward compatibility — renaming would break the legacy positional API the tests pin, so this is not a new violation.
- **Co-location**: tests sit next to the source (`useDocumentTitle.test.jsx` beside `useDocumentTitle.js`); no new helpers or files; no over-abstraction.
- **Tested over trusted**: typing is not assumed — trimming, non-string/non-number fallbacks to generic task labels, malformed-options tolerance, and `useDocumentTitle`'s `Kainbain` fallback are each proven by unit tests; the `App.test.jsx` toggle test presses `p`, asserts `api.computeStart` fired, then asserts the title is unchanged (integration reflects real use).
- **Fast iteration**: change is scoped to the tab title only; badges/pills and the `computeRunning` flag/toggle are untouched; legacy positional-arg backward compatibility kept (documented as ignored/deprecated).

## Notes (not violations)

- Keeping `computeRunning` as an accepted-but-ignored key is deliberate backward-compat tolerance, documented in the JSDoc — it does not mislead and protects deep imports.
- The added fail-safe cleaning goes slightly beyond the minimal one-line prefix removal, but it directly implements the standards' "allow it to fail safe" principle and is covered test-first.
