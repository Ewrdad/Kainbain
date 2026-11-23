# Stage review — alias screen redo (PR-review stage)

Date: 2026-11-20. Scope: branch `kb/158394ab-3b43-4813-b94a-32d772a79972` vs `main`.
Method: treated the change as guilty until proven working — read the full diff,
ran the repo's own tests and gates, and rendered the REAL components headlessly
with fixture data (long provider-prefixed refs, 2-target split, error row) at
1440px and 390px, measuring clipping (`scrollWidth` vs `clientWidth`) per chip.

## Verdict inputs

- Goal achieved: YES. The collapsed row is now a two-line layout (header +
  full-width wrapping chips); the section widened `max-w-2xl` → `max-w-4xl`
  (measured 896px at 1440px viewport, was capped at 672px); every model ref is
  fully present in the DOM (`title` + sr-only) with provider badges; zero
  clipped chips/containers at 1440px AND 390px (probe output below).
- Plan followed: YES for Steps 0–5 and 7. Step 6 screenshots were missing from
  the change, so this review produced them (see `assets/alias-desktop-after.png`,
  `assets/alias-mobile-after.png`) rather than failing for evidence alone.
- Standards: YES — `check:one-function` PASS, `check:jsdoc-example` PASS,
  `lint:frontend` 0 errors, `check:deps:frontend` PASS, settings
  duplicate-identifier check PASS. All new modules carry `MARK:` + description
  + runnable `@example` JSDoc.
- Modifiability: YES — one-function-per-file seams (`splitModelRefProvider`,
  `aliasTargetSummary`, `AliasTargetChip`, `AliasCollapsedRow`); shared toggle/
  delete buttons extracted so collapsed/expanded headers cannot drift.
- Best practices: YES, with one non-blocking nit (below).
- Tech debt: NONE added (net reduction via the button extraction).
- Docs: N/A correctly — no `site-docs/` page describes the collapsed layout
  (`faq.md` / `agent-execution.md` mentions stay accurate); `CHANGELOG.md`
  convention says ordinary PRs must NOT touch it; in-app helper copy still
  matches behaviour. Task docs (plan, design note, survey) are present.

## Test evidence (observed in this session)

- Focused: `npm run test:frontend -- ModelAliasesSection SettingsCards.overflow
  AliasCollapsedRow AliasTargetChip aliasTargetSummary splitModelRefProvider
  TruncatedText useCollapsibleRows` → 9 files, 170 tests, all pass.
- Full: `npm run test:frontend` → 362 files pass, exit 0. (`npm ci --prefix
  frontend` was needed first; lockfiles untouched, tree otherwise clean.)
- Note: `formatAliasSummary` was reimplemented on top of `aliasTargetSummary`;
  semantics verified identical by code reading (label/percent/`none`-harness
  fallbacks match the old inline logic branch-for-branch) and covered by the
  updated overflow + section tests.

## Visual evidence (headless chromium, real components + repo tailwind)

- Desktop 1440px: `bodyScrollWidth == bodyClientWidth` (no page overflow);
  all 7 chips and all 6 summary containers `clipped=false`, including the
  ~150-char ref chip (876px, wraps inside the chip); `sectionWidth=896`.
- Mobile 390px: all chips/containers `clipped=false`; chips stack full-width
  under the header (survey q4 option 1); error badge fully readable on its
  own line (q6).
- Screenshots inspected pixel-by-pixel: full model names visible next to
  provider badges (`50% Muse [GOOGLE] gemini-3-pro-preview`, etc.); the
  before-shot scenario (`assets/image.png`) no longer truncates mid-name.
- Harness was a short-lived scratch vite server on 127.0.0.1:4173 with local
  fixture props (no backend, no live data); stopped after capture. Nothing
  outside `./docs` was modified by this review.

## Non-blocking nit for a follow-up (not a fail reason)

- `AliasTargetChip.test.jsx` — "shows the reasoning level as a muted suffix
  when present" uses the 3-segment ref `google::m1::high`, which the shared
  grammar (`shared/modelKeys.js` `splitReasoning`) reads as
  harness/provider/id with NO reasoning level — real `::level` suffixes only
  exist on 4-segment refs. The assertion passes via the chip's sr-only full
  ref rather than the muted-suffix span, so it does not lock the suffix
  branch as named. Suggest switching that case to a 4-segment ref
  (e.g. `pi::google::m1::high`) and asserting the muted `::high` span
  directly. Behaviour itself follows the grammar correctly.
