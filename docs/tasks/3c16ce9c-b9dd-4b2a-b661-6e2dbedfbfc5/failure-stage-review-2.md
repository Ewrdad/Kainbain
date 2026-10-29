# Stage Review Failure (2): Project Settings Tabs

Date: 2026-10-29. Branch: `kb/3c16ce9c-b9dd-4b2a-b661-6e2dbedfbfc5`. Reviewer ran tests fresh; did not touch live app.

## Verdict: FAIL — Files & Repos tab renders no settings

## Proof (ran in this session)

`npm run test:frontend -- ProjectSettings.test.jsx projectSettingsSearch.test.js projectSettingsTabs.test.js PathsAndReposSection.test.jsx`
→ 2 files failed, 22 tests failed / 63 passed (21 in ProjectSettings.test.jsx, 1 in PathsAndReposSection.test.jsx). Prior reports claiming 3869 passing / all-green (cleanup-stage-verification.md, PR_REVIEW_SUMMARY.md) do not match current HEAD.

## Root cause

Later split of "Files & Links" into "Files & Repos" (`files-repos`) + "Addresses" (`addresses`) was incomplete:

1. `frontend/src/components/settings/ProjectSettingsForm.jsx:648` still gates PathsAndReposSection on `activeFormSection === 'files'`, but `projectSettingsTabs.js:32` defines id `files-repos` and `PROJECT_FORM_SECTIONS` derives from it. So clicking Files & Repos shows only the Save footer — working dir, notes/docs folders, git repo, branch toggles unreachable in UI, and every `files-repos` search entry jumps to a tab where its elementId does not exist (test "every search index entry resolves to an element on its tab" fails).
2. Garbled rename in tests: `ProjectSettings.test.jsx:1182` (and others) click `getByText('Files Files & Links Repos')` — a double find/replace artifact; actual label is "Files & Repos".
3. `PathsAndReposSection.test.jsx` still expects "Application Link & Health" card inside PathsAndReposSection, but that moved to `AddressesSection.jsx`/`AppLinkSection`.
4. Addresses tab double-render: `ProjectSettings.jsx:250-289` mounts ProjectSettingsForm for `addresses` (sharesProjectForm=true) which renders no section + a Save footer, then `:299-306` also mounts AddressesSection (which saves independently via AppLinkSection). Extra misleading Save button; decide if form should not mount there or Addresses should live inside the form.
5. Docs drift: `site-docs/first-project.md:48,86` and `site-docs/review-gates.md:62` still describe 5-tab "Files & Links"; actual UI is 6 tabs (Project Settings, Aliases, Files & Repos, Addresses, Named Workflows, Skills). AGENTS-MAP not verified updated for AddressesSection.

## What does work (verified)

Aliases own tab, Addresses own tab, search input top-right (SettingsSearchInput), dirty-guard tests, projectSettingsSearch/projectSettingsTabs suites pass (11+3). Single-source tab config in projectSettingsTabs.js is a good, maintainable pattern — keep it.

## Fixes required

1. Change form gate `'files'` → `'files-repos'` (and fix stale JSDoc/example in projectSettingsTabs.js:78); audit all `'files'` literals.
2. Fix garbled "Files Files & Links Repos" strings in ProjectSettings.test.jsx; remove/update stale AppLink expectation in PathsAndReposSection.test.jsx.
3. Resolve Addresses double-render (don't mount empty form, or fold AddressesSection into form).
4. Update site-docs/first-project.md, review-gates.md, AGENTS-MAP.md to 6-tab structure.
5. Re-run: targeted suites above, full `npm run test:frontend`, `npm run lint:frontend`, docs/jsdoc checks; capture screenshot via `npm run capture:screenshot` (isolated, not live server) showing Files & Repos fields and Addresses tab.

No screenshot generated this stage: unit DOM already proves the tab is empty, and guidance forbids spawning long-lived servers against the live app.
