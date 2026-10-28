# Implementation Plan: Break Project Settings into More Tabs

**Task:** Split the monolithic Project Settings page into focused tabs — Aliases gets its own tab (like Skills), a new Files & Links tab groups paths/repos/app-link, and a settings search box lands top-right.

**Survey basis:** `SURVEY.md` — all five questions answered with the recommended options:
- Q1: New Aliases tab + new Files & Links tab
- Q2: Files & Links holds project folders, app link & health, git address, branch/review-diff options
- Q3: Main Project Settings tab keeps basics only (name, model, look & colour, retry/timeout)
- Q4: Search jumps to and highlights the matching setting
- Q5: Warn before switching tabs with unsaved edits

---

## Target Tab Structure

| Tab | Icon | Content |
|-----|------|---------|
| **Project** | 📂 | Active project selector, project name, AI harness + default model, accent colour, hide/archive toggle, Retry & Timeouts |
| **Aliases** | 🏷️ | Model Aliases table (moved from the old long page) |
| **Files & Links** | 📁 | Working directory, notes symlink, docs folder name, KainBain folder name, centralised docs toggle, git repo URL, branch options (use branches, preserve review diff, reset baseline), App Link & Health |
| **Named Workflows** | 🔀 | (unchanged) |
| **Skills** | 🧩 | (unchanged) |

The tab bar gains a **search input** on the right side that jumps to and highlights matching settings across all tabs.

---

## Guiding Principle: Make Change Easy, Then Make the Change

The current `ProjectSettingsForm.jsx` (~1166 lines) owns ~30 `useState` hooks and one `handleSave` that persists everything. Rather than lifting all state up to `ProjectSettings.jsx` (a massive, risky refactor), we keep `ProjectSettingsForm` as the single state owner and pass the active sub-tab as a prop. The form stays mounted across project-related tabs so edits survive tab switches.

---

## Phase 1: Extract Section Components (Refactor, No Behaviour Change)

**Goal:** Break `ProjectSettingsForm.jsx` into smaller, focused sub-components without changing any behaviour. Each extraction is a pure JSX move — state and handlers stay in the parent.

### Step 1.1: Extract `RetryTimeoutsSection` component
- **File:** `frontend/src/components/settings/RetryTimeoutsSection.jsx` (new)
- **What moves:** The entire "Retry & Timeouts" `<div className="border-t ...">` block from `ProjectSettingsForm.jsx` (lines ~980–1080).
- **Props:** All retry state values + setters + `retryErrors` + `validationError` (filtered to retry-prefixed errors).
- **Exports:** `RetryTimeoutsSection` + re-export `RetryNumberField` and `parseRetrySettings` from the barrel.
- **JSDoc:** `@example <RetryTimeoutsSection maxAutoIterations={...} onChange={...} errors={...} />`
- **Test:** `RetryTimeoutsSection.test.jsx` — renders prefilled values, calls setters on change, shows inline errors.

### Step 1.2: Extract `PathsAndReposSection` component
- **File:** `frontend/src/components/settings/PathsAndReposSection.jsx` (new)
- **What moves:** The "Multi-Location Paths & Repositories" `<div>` block (working dir, notes dir, docs folder, kainbain folder, centralised docs, git repo, use branches, preserve review diff, reset baseline) + the "Application Link & Health" block (`AppLinkSection` wrapper).
- **Props:** `cwd`, `setCwd`, `notesDir`, `setNotesDir`, `docsDirName`, `setDocsDirName`, `kainbainDirName`, `setKainbainDirName`, `centralizedDocs`, `setCentralizedDocs`, `gitRepo`, `setGitRepo`, `useBranches`, `setUseBranches`, `preserveReviewDiff`, `setPreserveReviewDiff`, `resetReviewBaseline`, `setResetReviewBaseline`, `project`, `projectId`, `updateProjectInState`.
- **Note:** `AppLinkSection` already saves independently — it stays as-is inside this section.
- **JSDoc:** `@example <PathsAndReposSection cwd={...} setCwd={...} project={...} />`
- **Test:** `PathsAndReposSection.test.jsx` — renders all fields prefilled, calls setters, renders `AppLinkSection`.

### Step 1.3: Extract `ProjectBasicsSection` component
- **File:** `frontend/src/components/settings/ProjectBasicsSection.jsx` (new)
- **What moves:** The "Project Details" `<div>` block (project name, harness/model selector, custom harness command, accent colour, hide/archive toggle).
- **Props:** All the relevant state + setters + `models`, `harnesses`, `labeledHarnesses`, `effectiveHarnessId`, `isCustomHarness`, `showDefaultModelMismatch`, `showHarnessGuidance`, `guidanceHints`, `dismissedMismatch`, `setDismissedMismatch`, `validationError`, `setValidationError`, `isHarnessDisabled`, `refresh`, `refreshing`, `handleHarnessChange`, `handleAccentChange`, `hiddenProjectIds`, `toggleHideProject`.
- **JSDoc:** `@example <ProjectBasicsSection projectName={...} setProjectName={...} models={...} />`
- **Test:** `ProjectBasicsSection.test.jsx` — renders name input, model selector, accent picker, hide toggle.

### Step 1.4: Update `ProjectSettingsForm.jsx` to compose the extracted sections
- Replace the moved JSX blocks with `<ProjectBasicsSection ... />`, `<RetryTimeoutsSection ... />` (shown on the Project tab), `<PathsAndReposSection ... />` (shown on the Files & Links tab), and `<ModelAliasesSection ... />` (shown on the Aliases tab).
- The save button footer stays in `ProjectSettingsForm` and renders on every project-related tab.
- **Verification:** Run `npm run test:frontend -- ProjectSettings.test.jsx` — all existing tests must pass unchanged.

---

## Phase 2: Add New Tabs to `ProjectSettings.jsx`

**Goal:** Add "Aliases" and "Files & Links" as top-level tabs alongside the existing three.

### Step 2.1: Update `PROJECT_SETTINGS_SECTIONS` allowlist
- **File:** `frontend/src/components/settings/ProjectSettings.jsx`
- Change: `export const PROJECT_SETTINGS_SECTIONS = ['project', 'workflows', 'skills'];`
  → `export const PROJECT_SETTINGS_SECTIONS = ['project', 'aliases', 'files', 'workflows', 'skills'];`
- **Test update:** `ProjectSettings.test.jsx` — the test `section allowlist keeps UI Customization out of project settings` asserts `toEqual(['project', 'workflows', 'skills'])`. Update to the new array.

### Step 2.2: Add tab buttons for Aliases and Files & Links
- **File:** `frontend/src/components/settings/ProjectSettings.jsx`
- Add two new `<button>` elements in the tab bar between "Project Settings" and "Named Workflows":
  - **Aliases** — icon `🏷️`, label "Aliases"
  - **Files & Links** — icon `📁`, label "Files & Links"
- Use the same styling pattern as the existing tab buttons.

### Step 2.3: Render `ProjectSettingsForm` with a `section` prop for project-related tabs
- **File:** `frontend/src/components/settings/ProjectSettings.jsx`
- Change the render logic: instead of only rendering `ProjectSettingsForm` when `effectiveSection === 'project'`, render it for `'project'`, `'aliases'`, and `'files'`.
- Pass `section={effectiveSection}` to `ProjectSettingsForm`.
- Keep `key={activeProjectId}` so the form remounts on project switch (fresh state per project).
- **Important:** The form stays mounted across these three tabs — React keeps state alive because the component identity doesn't change (only the `section` prop changes).

### Step 2.4: Update `ProjectSettingsForm` to render sections conditionally
- **File:** `frontend/src/components/settings/ProjectSettingsForm.jsx`
- Accept a new prop: `section` (one of `'project'`, `'aliases'`, `'files'`).
- Render logic:
  - `section === 'project'` → `<ProjectBasicsSection />` + `<RetryTimeoutsSection />`
  - `section === 'aliases'` → `<ModelAliasesSection />` (already exists)
  - `section === 'files'` → `<PathsAndReposSection />`
- The save button footer renders on all three tabs (aliases edits are part of the same save payload).

### Step 2.5: Update `ProjectSettings.test.jsx` for new tabs
- Update the allowlist test (Step 2.1).
- Add test: "renders Aliases tab and switches to it" — click the Aliases tab button, verify the aliases section renders.
- Add test: "renders Files & Links tab and switches to it" — click the Files & Links tab button, verify paths/repos/app-link render.
- Add test: "form state persists across project-tab switches" — edit the project name on the Project tab, switch to Aliases, switch back, verify the edit is still there.
- Update the test `does not offer UI Customization in project settings` to also check for the new tab labels.

---

## Phase 3: Settings Search (Top Right)

**Goal:** A search input in the tab bar's right side that jumps to and highlights the matching setting.

### Step 3.1: Create `projectSettingsSearch.js` — the search index
- **File:** `frontend/src/components/settings/projectSettingsSearch.js` (new)
- **Purpose:** Single source of truth mapping search terms to settings locations.
- **Structure:** An array of entries: `{ id, tab, section, label, keywords, elementId }`.
  - Each entry describes one searchable setting (e.g. "Project Name" → tab `project`, elementId `project-name-input`).
  - Cover all settings across the three project-related tabs (~25 entries).
- **Exports:**
  - `SETTINGS_SEARCH_INDEX` — the static index array.
  - `searchSettings(query)` — returns matching entries (case-insensitive substring match on `label` + `keywords`).
  - `findBestMatch(query)` — returns the single best match (for jump-on-Enter).
- **JSDoc:** `@example searchSettings('git') => [{ id: 'git-repo', tab: 'files', ... }]`
- **Test:** `projectSettingsSearch.test.js` — search by label, by keyword, empty query returns nothing, no match returns empty.

### Step 3.2: Create `SettingsSearchInput` component
- **File:** `frontend/src/components/settings/SettingsSearchInput.jsx` (new)
- **Props:** `onSelect(entry)` — called when the user picks a search result.
- **Behaviour:**
  - Text input with placeholder "Search settings…".
  - Dropdown showing up to 8 matching entries (label + tab name).
  - Keyboard: `↑`/`↓` to navigate, `Enter` to jump, `Escape` to close.
  - Click outside closes the dropdown.
- **JSDoc:** `@example <SettingsSearchInput onSelect={(e) => jumpTo(e)} />`
- **Test:** `SettingsSearchInput.test.jsx` — type query, results appear, keyboard navigation, Enter selects, Escape closes.

### Step 3.3: Wire search into `ProjectSettings.jsx`
- **File:** `frontend/src/components/settings/ProjectSettings.jsx`
- Add `<SettingsSearchInput />` to the right side of the tab bar (flex row: tabs on left, search on right).
- `onSelect` handler:
  1. Switch to the entry's tab (`setSettingsSection(entry.tab)`).
  2. After render, scroll the target element into view (`document.getElementById(entry.elementId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })`).
  3. Add a temporary highlight class (e.g. `ring-2 ring-primary` for 2 seconds) to the target element.
- **Test:** Add to `ProjectSettings.test.jsx` — type "git" in search, select result, verify Files & Links tab is active and git input is visible.

---

## Phase 4: Unsaved-Changes Warning on Tab Switch

**Goal:** When the user has unsaved edits and tries to switch to a non-project tab (Workflows or Skills), show a confirmation dialog.

### Step 4.1: Track dirty state in `ProjectSettingsForm`
- **File:** `frontend/src/components/settings/ProjectSettingsForm.jsx`
- Add a `isDirty` derived value: true when any state differs from the project's stored values (or simpler: a `dirtyRef` that's set to `true` on any `set*` call and reset to `false` after save).
- Expose `isDirty` via a callback prop: `onDirtyChange(isDirty)`.

### Step 4.2: Guard tab switches in `ProjectSettings.jsx`
- **File:** `frontend/src/components/settings/ProjectSettings.jsx`
- Add state: `const [formDirty, setFormDirty] = useState(false)`.
- Wrap `setSettingsSection` in a guard function `handleSectionChange(nextSection)`:
  - If `formDirty` and the current section is project-related (`project`/`aliases`/`files`) and the next section is NOT project-related (`workflows`/`skills`):
    - `window.confirm("You have unsaved changes. Switch tabs anyway?")` — if cancelled, do nothing.
  - Otherwise, switch normally.
  - Also: switching between project-related tabs (`project` ↔ `aliases` ↔ `files`) never warns (edits are preserved because the form stays mounted).
- Pass `onDirtyChange={setFormDirty}` to `ProjectSettingsForm`.
- **Test:** Add to `ProjectSettings.test.jsx` — edit a field, click "Named Workflows", verify `window.confirm` is called; mock `confirm` to return false, verify tab doesn't switch.

---

## Phase 5: Testing & Verification

### Unit Tests (must pass before merge)
| File | What it covers |
|------|---------------|
| `RetryTimeoutsSection.test.jsx` | Extracted retry section renders + calls setters |
| `PathsAndReposSection.test.jsx` | Extracted paths section renders + calls setters |
| `ProjectBasicsSection.test.jsx` | Extracted basics section renders + calls setters |
| `projectSettingsSearch.test.js` | Search index, searchSettings, findBestMatch |
| `SettingsSearchInput.test.jsx` | Search input rendering, keyboard nav, selection |
| `ProjectSettings.test.jsx` (updated) | New tabs render, tab switching, state persistence, dirty guard, search integration, updated allowlist |

### Existing Tests to Update
- `ProjectSettings.test.jsx`:
  - `section allowlist keeps UI Customization out of project settings` — update expected array.
  - `does not offer UI Customization in project settings` — add assertions for new tab labels.
  - All tests that query elements by text (e.g. `screen.getByText('Multi-Location Paths & Repositories')`) need to first switch to the correct tab.

### Test Commands
```bash
# From repo root:
npm run test:frontend -- ProjectSettings.test.jsx          # Project settings tests
npm run test:frontend -- RetryTimeoutsSection.test.jsx     # New section tests
npm run test:frontend -- PathsAndReposSection.test.jsx     # New section tests
npm run test:frontend -- ProjectBasicsSection.test.jsx     # New section tests
npm run test:frontend -- projectSettingsSearch.test.js     # Search index tests
npm run test:frontend -- SettingsSearchInput.test.jsx      # Search input tests
npm run test:unit                                           # Full unit suite (api + frontend)
npm run lint:frontend                                       # Lint
```

### Visual Verification
```bash
npm run capture:screenshot                                  # Headless screenshot of the settings page
```
Verify: 5 tabs render, search box is top-right, each tab shows the right content.

### Canary E2E
- `npm run test:canary` — must pass (no runtime errors on the settings page).

---

## Phase 6: Documentation

### Update in-app docs (`site-docs/`)
- Find the settings-related doc article and update the tab descriptions to mention Aliases and Files & Links tabs.
- Add a note about the settings search box.

### Update `AGENTS-MAP.md`
- The `ProjectSettings.jsx` entry in the god-files table mentions sections: update to list the new section components (`ProjectBasicsSection`, `RetryTimeoutsSection`, `PathsAndReposSection`, `SettingsSearchInput`).

### JSDoc for all new exports
- Every new file's exports need `@example` tags (enforced by `npm run check:jsdoc-example`).
- One function per file for new source files (enforced by `npm run check:one-function`).

---

## Phase 7: Rollout & Cleanup

### Step 7.1: Verify no regressions
- Run full test suite: `npm run test:unit`
- Run lint: `npm run lint`
- Run docs check: `npm run docs:check`

### Step 7.2: Clean up
- Remove any now-unused imports from `ProjectSettingsForm.jsx` (the extracted JSX no longer needs `AppLinkSection`, `ModelAliasesSection`, `RetryNumberField`, etc. directly — they move to the section components).
- Verify `ProjectSettingsForm.jsx` is significantly smaller (target: under 400 lines, mostly state + save handler).

### Step 7.3: Commit
- Single commit with message: "Project Settings: split into Aliases + Files & Links tabs, add settings search"
- The commit should include all new files, modified files, and test updates.

---

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `frontend/src/components/settings/ProjectSettings.jsx` | Modify | Add tabs, search input, dirty guard |
| `frontend/src/components/settings/ProjectSettingsForm.jsx` | Modify | Accept `section` prop, compose extracted sections, expose dirty state |
| `frontend/src/components/settings/ProjectBasicsSection.jsx` | **New** | Project name, harness/model, accent, hide toggle |
| `frontend/src/components/settings/RetryTimeoutsSection.jsx` | **New** | Retry & timeout fields |
| `frontend/src/components/settings/PathsAndReposSection.jsx` | **New** | Paths, repos, app link, branch options |
| `frontend/src/components/settings/SettingsSearchInput.jsx` | **New** | Search input with dropdown |
| `frontend/src/components/settings/projectSettingsSearch.js` | **New** | Search index + search functions |
| `frontend/src/components/settings/ProjectSettings.test.jsx` | Modify | Update existing + add new tab/search/dirty tests |
| `frontend/src/components/settings/ProjectBasicsSection.test.jsx` | **New** | Tests for basics section |
| `frontend/src/components/settings/RetryTimeoutsSection.test.jsx` | **New** | Tests for retry section |
| `frontend/src/components/settings/PathsAndReposSection.test.jsx` | **New** | Tests for paths section |
| `frontend/src/components/settings/SettingsSearchInput.test.jsx` | **New** | Tests for search input |
| `frontend/src/components/settings/projectSettingsSearch.test.js` | **New** | Tests for search index |
| `AGENTS-MAP.md` | Modify | Update god-file entry for ProjectSettings |
| `site-docs/<settings-article>.md` | Modify | Update tab descriptions |

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| State loss when switching tabs | Form stays mounted across project-related tabs; only Workflows/Skills unmount it (with dirty guard) |
| Existing tests break | Phase 1 is a pure refactor — run existing tests after each extraction step |
| Search index drifts from actual settings | Index is manually maintained; add a test that asserts every index entry's `elementId` exists in the DOM when its tab is active |
| `AppLinkSection` saves independently | It already does — no change needed; it just moves into `PathsAndReposSection` |
| Alias dirty-field save semantics | Unchanged — `modelAliasesTouched` flag stays in `ProjectSettingsForm` |
| Optimistic concurrency (409) | Unchanged — save handler stays in `ProjectSettingsForm` |

---

## Open Questions (resolved by survey)

1. ~~Should aliases and files/links be separate tabs or one combined tab?~~ → Separate (Q1 recommended).
2. ~~What stays on the main Project tab?~~ → Basics + retry/timeouts (Q3 recommended).
3. ~~How does search work?~~ → Jump to + highlight (Q4 recommended).
4. ~~What happens to unsaved edits on tab switch?~~ → Warn before leaving project tabs (Q5 recommended).
