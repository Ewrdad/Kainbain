# Stage report: settings-tabs verification & E2E repair

**Date:** 2026-10-28
**Branch:** `kb/3c16ce9c-b9dd-4b2a-b661-6e2dbedfbfc5`

## State on arrival

The feature itself (Aliases + Files & Links tabs, settings search, dirty guard,
extracted section components, unit tests, docs, AGENTS-MAP) was already
implemented and committed by earlier stages. This stage verified it end-to-end
and found the canary E2E suite had **not** been updated for the new tab layout.

## What this stage fixed

### 1. Canary E2E specs updated for the tab split (3 files)

- `canary-e2e/tests/functional.spec.js` — "settings tab renders per-project
  configuration" expected Working Directory / Notes / Docs folder /
  Centralised docs on the default tab. Those moved to **Files & Links**.
  Rewritten as "…across its tabs": asserts Project-tab basics, switches to
  Files & Links for the path fields, switches to Aliases for the alias table,
  and checks the Save button renders on every tab.
- `canary-e2e/tests/accessibility.spec.js` — "settings model-aliases
  reliability cards" scanned `model-aliases-section` on the default tab; the
  section now lives on the **Aliases** tab. Added the tab click.
- `canary-e2e/tests/reasoning-levels-browser.spec.js` — alias steps
  (`+ Add alias`, reload + `model-alias-toggle-0`) now click the **Aliases**
  tab first (project-tab switches keep unsaved edits, so no dirty-guard
  interference).

### 2. Real a11y bug found by the canary axe scan and fixed

The extracted section components use `h3` subtitles, but the `h2` tab title
only rendered on the Project tab. On the Aliases and Files & Links tabs the
first heading was an `h3` — an axe `heading-order` violation ("settings
model-aliases reliability cards have no axe violations" failed on exactly
this).

Fix in `frontend/src/components/settings/ProjectSettings.jsx`: every
project-related tab now renders its own `h2` tab title —
⚙️ Project Configuration / 🏷️ Model Aliases / 📁 Files & Links.

Regression test added in `ProjectSettings.test.jsx`:
"each project-related tab renders an h2 tab title above its h3 sections".

## Verification

- `npm run test:frontend` — **285 files / 3844 tests pass** (incl. 58 in
  `ProjectSettings.test.jsx`, 28 across the new section/search test files).
- `npm run test:api` — **351 files / 5817 tests pass** (1 skipped, pre-existing).
- `npm run lint:frontend` — 0 errors (177 pre-existing warnings).
- `npm run docs:check`, `check:jsdoc-example`, `check:one-function` — PASS.
- Canary E2E (Playwright, self-provisioned scratch stack):
  - Settings-related specs: functional (6), accessibility (25),
    reasoning-levels (1), settings round-trip (2) — **all pass**, including
    the axe scan of the Aliases tab after the heading fix.
  - Full suite: **132/135 pass**. The 3 failures (`task-editing` round-trip,
    2 `visual/dashboard` tests) are task-creation visibility timeouts under
    full-suite parallel load — **all pass in isolation** (11/11) and are
    unrelated to settings. An earlier full-run attempt also showed
    `ERR_CONNECTION_REFUSED` failures (scratch vite died mid-run); every one
    of those specs passes in a fresh run (workflow 5, task-logs 3, websocket 1,
    visual 15).
- Search-index integrity: all 26 `SETTINGS_SEARCH_INDEX` elementIds verified
  to resolve to real DOM ids in the section components (covered by the unit
  test "every search index entry resolves to an element on its tab").

## Not changed (deliberately)

- No live-app interference: canary runs use the dedicated scratch ports
  (:3399/:5299), never the live :3100/:5173 stack.
- `ProjectSettingsForm.jsx` stays the single state owner (716 lines, above
  the plan's aspirational <400 target — the remaining bulk is state,
  validation, and the save handler; further extraction was judged riskier
  than the benefit).
