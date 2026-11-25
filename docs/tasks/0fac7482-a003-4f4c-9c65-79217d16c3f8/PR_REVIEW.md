# PR Review — Remove `[Paused]` from the UI tab title

Task: `0fac7482-a003-4f4c-9c65-79217d16c3f8` · Reviewer: stage review (docs-only) · 2026-11-24

## Verdict: PASS — suitable to integrate

## What was reviewed

- Diff `main...HEAD`: `frontend/src/a11y/useDocumentTitle.js`,
  `frontend/src/components/App.jsx`, `frontend/index.html`,
  both test files, `CHANGELOG.md`, `docs/manual-testing/05-ui-board-and-views.md`.
- Prior reports: `IMPLEMENTATION_PLAN.md`, `STANDARDS_REVIEW.md`, `SURVEY.md`
  (survey still unanswered, `answers: {}` — plan defaults apply).

## Checklist

- **Achieves the goal:** yes. `titleForView` builds `Kainbain - <project> - <page>`
  with no status computation; `App.jsx` no longer passes `computeRunning` to it;
  `index.html` shell title is prefix-free. Verified zero `[Paused]`/`[Running]`
  hits in `frontend/src` and `frontend/index.html`.
- **Followed the plan:** yes. Single builder + single caller inventory confirmed;
  backward-compat signature kept (`computeRunning` accepted-but-ignored,
  documented deprecated); JSDoc `@example`s rewritten; `App.jsx` WCAG comment
  updated; `computeRunning` flag, `p` shortcut, and `toggleCompute` preserved
  (verified in `App.jsx` lines 35, 116–118, 131); badges/pills untouched
  (per-stage states in `NowPlayingBar`, not the tab prefix).
- **Standards / best practices / tech debt:** no new files, helpers, deps, or
  abstractions; `titleForView` stays pure. The small fail-safe hardening
  (trimmed view, numeric task keys shown, object task keys fall back to generic
  labels, `useDocumentTitle` falls back to `Kainbain`) goes slightly beyond the
  minimal deletion but is fully tested, JSDoc-documented, and behavior-identical
  for all real inputs. No new debt.
- **Docs:** JSDoc + `App.jsx` comment updated; manual-testing note corrected;
  `CHANGELOG.md` entry added. `frontend/src/a11y/README.md` §3 names no prefix
  format — correctly untouched. E2E title assertions are prefix-agnostic
  (`/Kainbain/`) — no update needed.
- **Survey default (remove both prefixes):** accepted. The brief calls the signal
  "not useful or relevant"; keeping `[Running]` alone would preserve the same
  misleading single-global-state implication the task rejects.

## Evidence (re-run by reviewer, not copied)

- Focused: `npm run test --prefix frontend -- src/a11y/useDocumentTitle.test.jsx
  src/components/App.test.jsx` — 39 passed (2 files).
- Full: `npm run test:unit` — 364 files, 4997 tests, all passed.
- `npm run lint:frontend` — 0 errors, 221 warnings; touched files
  (`useDocumentTitle.js`, `App.jsx`) produce zero warnings.
- `npm run docs:check` — PASS (`jsdoc-@example`: 679 missing vs 680 baseline).
- Toggle decoupling is proven, not just reworded: the rewritten `App.test.jsx`
  test asserts `api.computeStart` fired on `p` and the title stayed
  `Kainbain - Project A - Orchestrator`.

## Note

No screenshot taken: the change is a title-string deletion fully pinned by jsdom
tests (boot, view tracking, toggle-unchanged); a headed screenshot would add no
signal and the stage guidance discourages spawning servers.
