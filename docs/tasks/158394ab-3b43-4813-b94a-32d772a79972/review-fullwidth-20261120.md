# Stage review — alias full-width follow-up (PR-review stage)

Date: 2026-11-20. Scope: branch `kb/158394ab-3b43-4813-b94a-32d772a79972` vs `main`
(two commits: full-width section root, reasoning-test fix, kept-model wrap).
Method: guilty-until-proven-working — read the full diff, re-ran the repo's own
tests and gates, audited the width chain from app shell to chips, and inspected
the after-screenshots pixel-by-pixel. No servers started; nothing outside
`./docs` modified.

## Verdict inputs

- Goal achieved: YES. Section root is now `w-full min-w-0` (was `max-w-4xl` on
  `main`, `max-w-2xl` originally). Parent chain audited with no cap anywhere on
  the alias path: `App.jsx` main (`flex-1`, no max-w) → settings `section`
  (`flex-1`, no max-w) → tabpanel div (no class) → form wrapper
  (`border-t ...`, no max-w) → alias section (`w-full min-w-0`). The only
  `max-w-2xl` in `ProjectSettings.jsx:259` sits inside the `project`-tab-only
  conditional, so it cannot squeeze the aliases tab. Human correction ("make
  the most of the full width") is satisfied and locked by test.
- Plan followed: YES with one documented, human-directed deviation — plan Step 2
  defaulted to `max-w-4xl`, but the human rejection demanded full width and
  `DESIGN-NOTE.md` records the no-cap decision with rationale. Steps 0–1 and
  3–7 otherwise followed (seams, redesign, contract-test rewrite, screenshots,
  docs/a11y assessment).
- Standards: YES — `lint:frontend` 0 errors (alias files individually clean),
  `check:jsdoc-example` PASS, `check:one-function` PASS,
  `check:deps:frontend` PASS, duplicate-settings PASS. New modules keep
  `MARK:` + `@description` + runnable `@example` JSDoc.
- Modifiability: YES — one-function-per-file seams (`splitModelRefProvider`,
  `aliasTargetSummary`, `AliasTargetChip`, `AliasCollapsedRow`), shared grammar
  reuse (`parseModelKey`/`splitReasoning`), pure helpers with unit tests.
- Best practices: YES — full stored ref in DOM + sr-only (not title-only),
  fail-safe props, historic test ids preserved, frontend-only change.
- Tech debt: NONE added. The prior review's nit (reasoning-suffix test passing
  via sr-only text on a 3-segment ref) is fixed: 4-segment ref asserting the
  muted `::high` span plus a negative 3-segment case. Kept-model note edge case
  (`none` harness) now wraps via `break-all`, locked by a new overflow test.
- Docs: N/A correctly — no `site-docs/` page describes the collapsed layout
  (faq/agent-execution/submit-track-task mentions stay accurate), CHANGELOG
  convention says ordinary PRs must NOT touch it, in-app copy still matches.
  `check-doc-links` PASS (75 files).

## Test evidence (observed in this session)

- Focused: `npm run test:frontend -- ModelAliasesSection SettingsCards.overflow
  AliasCollapsedRow AliasTargetChip aliasTargetSummary splitModelRefProvider
  TruncatedText useCollapsibleRows` → 9 files, 173 tests, all pass.
- Full: `npm run test:frontend` → 362 files, 4936 tests, all pass, exit 0.
- `truncate` audit: the only remaining `truncate` on the alias screen is the
  alias *name* in the collapsed header (short by design, full text in `title`);
  no model ref is ellipsized.
- Not re-run: `npm run test:api` and the api-vitest leg of `npm run docs:check`
  (`api/node_modules` absent in this environment — pre-existing gap, unrelated
  to this frontend-only change; the doc-links and jsdoc legs pass standalone).

## Visual evidence (inspected in this session)

- `assets/alias-desktop-fullwidth.png` (PNG magic `89504e47` verified,
  1440x900): section spans the full panel; `gemini-3-pro-preview`,
  `claude-sonnet-4-5`, and a very long `quarterly-release-router-mmm…` ref all
  fully visible next to provider badges; error badge on its own readable line.
- `assets/alias-mobile-fullwidth.png` (390x853): chips stack full-width under
  the header, the long ref wraps inside its chip, error badge wraps — no
  clipping, no page overflow.
- Note: captures are mock-harness renders of the real components with repo
  tailwind (same method as the prior accepted review), corroborated by the new
  class assertions and the parent-chain audit above.
