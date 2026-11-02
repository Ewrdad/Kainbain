# PR Review Summary: Fix the searchbox on mobile

## Task Overview
Fix the mobile layout of the unified task search box after the stage-tag system was merged into it. On phones the search bar overflowed the right edge and its tag controls made the top toolbar wrap/crush awkwardly. Presentation-only: no search parsing, tag matching, URL-encoding, or localStorage semantics change.

## Deep Review Failure Analysis (resolved)

The deep review failure (2026-10-20-191456) identified the root cause:
- **Problem**: With tags present at 375px, the search block was not width-bounded. 6 tags rendered the bar 759px wide on a 351px line, leaving the text input (x=378) and clear button (x=734) off-viewport and untappable.
- **Root Cause**: The InfoTooltip trigger container (the actual flex item of the toolbar's left group) had no `min-w-0`, so with tags present the block sized to max-content.

## Changes Implemented

### UnifiedSearchBar.jsx

Responsive layout contract (unchanged by the cleaning pass):

1. **Root container**: `relative flex flex-wrap items-center gap-1.5 min-w-0 w-full` — width-bounded end to end.
2. **Search shell**: single-line, `min-w-0 w-full lg:w-auto lg:flex-1 ... overflow-hidden` — `w-full` below lg fills the mobile/tablet line; at lg+ the shell flexes so the Any/All toggle still sits beside it (desktop contract); `overflow-hidden` plus the shrinkable chip strip keeps 6+ tags from pushing the input/clear out.
3. **Chip strip**: bounded horizontal scroller (`min-w-0 shrink overflow-x-auto`, inner `flex-nowrap`) — sizes to content when chips fit, shrinks+scrolls when they don't, at every breakpoint.
4. **Input**: guaranteed slot — `w-[100px] flex-none` on phones (never evicted by the scrolling strip), `sm:flex-1 sm:min-w-[80px]` on desktop; `text-base` on mobile avoids iOS input zoom, `sm:text-xs` restores dense desktop styling.
5. **Clear button / chip removal**: `min-w/min-h` 28px/20px tap targets, `shrink-0`.
6. **Dropdown options**: `min-h-[44px]` on phones, `sm:min-h-0` on desktop.
7. **Any/All toggle**: `hidden md:flex` — DOM retained for a11y/keyboard tests, visually hidden on phones (default `any`).

Cleaning-pass hardening (behavior-preserving, each covered by tests):

8. **Pure helpers extracted** to `unifiedSearchBarUtils.js` (total functions, colocated unit tests): `getTagLabel`, `normalizeTagOptions`, `normalizeSearchValue`, `dedupeTagLabels`, `scheduleAfterPaint`, `draftTokenSpan`, `isCommittableDraft`, `buildDisplayText`.
9. **Fail-safe prop normalization**: a non-string/null `value` degrades to a safe query string; a non-array `tagOptions` degrades to "no options" (dropdown never opens); a non-function `onChange` is never called; the Any/All toggle is not rendered without a function callback.
10. **Case-variant duplicate options deduped** (`Dev` + `dev`), so the suggestion list can never produce duplicate React keys.
11. **Per-instance DOM ids via `useId`**: two mounted bars never share `aria-controls`/`aria-activedescendant`/listbox/option ids (re-usable component).
12. **Any/All toggle extracted** as a dumb presentational `TagFilterModeToggle`; failure contract documented in the module JSDoc.

### CanvasToolbar.jsx

1. **Left group**: `flex flex-wrap items-center gap-2 sm:gap-3 min-w-0 w-full sm:w-auto` — wraps predictably on phones.
2. **Search wrapper**: `w-full sm:w-64 lg:w-96 min-w-0` — fluid full-width on phones, fixed from sm up.
3. **InfoTooltip trigger** (the actual flex item): `w-full sm:w-auto min-w-0 basis-full sm:basis-auto order-last sm:order-none` — `min-w-0` closes the width-bounding chain end to end; `basis-full order-last` gives the search its own row on phones; `sm:` restores desktop order.
4. **Workflow selector name**: `truncate max-w-[120px] sm:max-w-[140px]` — shrinks on phones instead of forcing the row wide.

## Verification Against Criteria

### Does it achieve the goal?
Yes — at 375px with 6 tags the bar stays width-bounded: the chip strip scrolls internally, the input and clear button remain inside the viewport and tappable (asserted by bounding-box e2e at 375px, and by class-contract unit tests at every breakpoint).

### Did it follow the plan?
Yes — all Implementation Plan steps are implemented; non-goals respected (no parser/URL/semantics changes; responsive hiding is CSS-only with DOM retained).

### Does it comply with code standards?
Yes — JSDoc with `MARK:`/`@description`/`@example` on every function per KB Code Standards; pure logic separated from component state; colocated unit tests; black-box component tests.

### Is it easy to modify later?
Yes — presentation classes carry contract comments; state/draft logic is unchanged and pinned by 49 component tests; pure helpers are independently unit-tested (23 tests).

### Have previous failure reviews been resolved?
Yes — the deep-review root cause (unbounded InfoTooltip trigger) is fixed and pinned by `CanvasToolbar.tagFilter.test.jsx` ("the whole search width chain is bounded so tags cannot evict the input") and by the 375px/6-tag canary e2e.

### Does it regress any functionality?
No — full gate `npm run test` PASSES end to end (exit 0): fast gate (api tests, frontend tests, api+frontend lint, frontend build, security scripts, dependency audit, harness self-tests, container tests) all green, and the serial canary phase green (519s), including `header-responsive` 1280px and the 6-tag mobile search-bar e2e. Frontend suite 3553/3553; lint 0 errors; orchestrator axe clean. The one canary failure seen in an earlier gate run (`header-responsive` 1280px, another task's header test) was reproduced as a load/font-settling flake: it passes in isolation and in a full-spec run on this branch, and this diff never touches the global header.

## Test Coverage

- `unifiedSearchBarUtils.test.js` (new, 23 tests): total-function edge cases for every helper (null/undefined/non-string inputs, caret boundaries, dedupe, display-text assembly).
- `UnifiedSearchBar.test.jsx` (49 tests): chips/dropdown/keyboard/clear/toggle behavior, browser-typing regression tests, responsive class contracts, fail-safe props (null value/options, non-function callbacks), case-variant dedupe, two-instance id uniqueness, long-tag truncation.
- `CanvasToolbar.tagFilter.test.jsx` (9 tests): integration incl. the bounded width chain and mobile strip.
- `WorkflowCanvas.test.jsx`: canvas-level responsive assertions with a seeded two-tag query.
- `canary-e2e/tests/mobile-responsive.spec.js`: 6 tags at 375px — bar width-bounded, input/clear inside viewport, no horizontal page overflow.

## Operational continuity

Presentation-only change: no API, schema, URL (`?tags=…` hydration unchanged), or localStorage contract changes — no migration. The running deployment serves `frontend/dist` from disk; the verified build replaces the old bundle on the next request without a restart, and the previous bundle remains reproducible from the parent commit if a rollback were ever needed.
