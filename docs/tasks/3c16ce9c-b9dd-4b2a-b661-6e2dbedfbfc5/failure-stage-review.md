# Stage Review Failure: Project Settings Tabs

**Date:** 2026-10-29
**Branch:** `kb/3c16ce9c-b9dd-4b2a-b661-6e2dbedfbfc5`
**Stage:** PR Review (Stage Verdict)

## Verdict: FAIL

The implementation has critical bugs that cause 30 test failures across 4 test files,
deviates from the implementation plan, and leaves dead code behind.

---

## Critical Bugs

### 1. Duplicate 'aliases' entry in PROJECT_SETTINGS_TABS

**File:** `frontend/src/components/settings/ProjectSettings.jsx` (lines 30-44)

The `PROJECT_SETTINGS_TABS` array contains TWO identical entries for `id: 'aliases'`:

```js
export const PROJECT_SETTINGS_TABS = [
  { id: 'project', ... },
  { id: 'aliases', label: 'Aliases', ... },   // ← first
  { id: 'aliases', label: 'Aliases', ... },   // ← DUPLICATE
  { id: 'links', label: 'App Links', ... },   // ← extra, not in plan
  { id: 'files', label: 'Files & Repos', ... },
  { id: 'workflows', ... },
  { id: 'skills', ... },
];
```

This causes:
- React warning: "Encountered two children with the same key, `aliases`"
- `getByText('Aliases')` finds 2 elements → 27 test failures in `ProjectSettings.test.jsx`
- Two "Aliases" tabs rendered in the UI

### 2. Tab label mismatch: "Files & Repos" vs "Files & Links"

**File:** `frontend/src/components/settings/ProjectSettings.jsx` (line 52)

The tab is labeled `"Files & Repos"` but:
- Tests use `getByText('Files & Links')` → fails with "Unable to find an element"
- Canary E2E uses `getByRole("tab", { name: /Files & Links/i })` → would fail
- Docs (`site-docs/first-project.md`) say "Files & Links"
- Search index uses `tabLabel: 'Files & Links'`

### 3. Extra 'links' tab ("App Links") not in the plan

**Files:** `frontend/src/components/settings/ProjectSettings.jsx`, `ProjectSettingsForm.jsx`, `LinksSection.jsx`, `projectSettingsSearch.js`

The implementation plan specified 5 tabs: Project, Aliases, **Files & Links** (containing paths, repos, AND app link), Named Workflows, Skills.

Instead, the implementation created 7 tab entries (with the duplicate) including a separate **"App Links"** tab (`id: 'links'`) with its own `LinksSection` component. This:
- Deviates from the approved plan
- Breaks the search index test (`projectSettingsSearch.test.js` expects `['project', 'aliases', 'files']` but gets `['project', 'aliases', 'files', 'links']`)
- Is not mentioned in docs
- Creates a duplicate of the existing `AppLinkSection` component (see dead code below)

### 4. Search index inconsistency

**File:** `frontend/src/components/settings/projectSettingsSearch.js`

The search index has entries with `tab: 'links'` and `tabLabel: 'Files & Links'` (for files entries). These are inconsistent with the actual tab structure.

---

## Test Failures (30 total)

| File | Failures | Root Cause |
|------|----------|------------|
| `ProjectSettings.test.jsx` | 27 | Duplicate 'aliases' key, "Files & Repos" vs "Files & Links" label, extra 'links' tab in allowlist |
| `App.test.jsx` | 1 | Looks for "Files & Links" text, finds "Files & Repos" |
| `PathsAndReposSection.test.jsx` | 1 | Expects "Application Link & Health" card, but it was moved to separate LinksSection |
| `projectSettingsSearch.test.js` | 1 | Search index includes 'links' tab, test expects only `['project', 'aliases', 'files']` |

---

## Code Quality Issues

### Dead Code
- `frontend/src/components/settings/AppLinkSection.jsx` — unused (replaced by `LinksSection.jsx`)
- `frontend/src/components/settings/AppLinkSection.test.jsx` — tests dead code

### Stale Test
- `PathsAndReposSection.test.jsx` line 110-114: expects "Application Link & Health" card inside `PathsAndReposSection`, but the component no longer renders it (moved to `LinksSection`)

### Documentation Gaps
- `AGENTS-MAP.md` line 44: doesn't mention `LinksSection` in the ProjectSettings entry
- `site-docs/first-project.md` line 86: describes 5 tabs but doesn't mention "App Links" tab; uses "Files & Links" label
- `docs/tasks/.../PR_REVIEW_SUMMARY.md`: falsely claims "All tests pass" (62 tests passed) — actually 27 of 62 fail

---

## Plan Deviations

| Plan | Actual | Status |
|------|--------|--------|
| 5 tabs: Project, Aliases, Files & Links, Named Workflows, Skills | 7 entries (dup aliases + extra App Links + Files & Repos) | ❌ |
| App link inside Files & Links tab | Separate "App Links" tab | ❌ |
| Tab label "Files & Links" | Tab label "Files & Repos" | ❌ |
| `PROJECT_SETTINGS_SECTIONS = ['project', 'aliases', 'files', 'workflows', 'skills']` | `['project', 'aliases', 'aliases', 'links', 'files', 'workflows', 'skills']` | ❌ |

---

## Required Fixes

1. **Remove the duplicate 'aliases' entry** from `PROJECT_SETTINGS_TABS` in `ProjectSettings.jsx`
2. **Decide on the 'links' tab**: either (a) remove it and move `LinksSection` content back into `PathsAndReposSection` (per plan), or (b) update the plan, tests, docs, and search index to include it. Option (a) is recommended since it matches the approved plan.
3. **Fix the tab label**: change "Files & Repos" to "Files & Links" (or update all tests/docs/canary to match)
4. **Update `projectSettingsSearch.js`**: remove 'links' tab entries if removing the tab, or update the test to include 'links'
5. **Update `PathsAndReposSection.test.jsx`**: remove the "Application Link & Health" test if the card moved out, or add it back to the component
6. **Delete dead code**: `AppLinkSection.jsx` and `AppLinkSection.test.jsx`
7. **Update `AGENTS-MAP.md`** to reflect actual components
8. **Update `site-docs/first-project.md`** to match actual tab structure
9. **Update `App.test.jsx`** if needed after label fix
10. **Run full test suite** and verify 0 failures before re-submitting

---

## Verification Commands

```bash
npm run test:frontend -- ProjectSettings.test.jsx
npm run test:frontend -- App.test.jsx
npm run test:frontend -- PathsAndReposSection.test.jsx
npm run test:frontend -- projectSettingsSearch.test.js
npm run test:frontend   # full suite
npm run lint:frontend
```
