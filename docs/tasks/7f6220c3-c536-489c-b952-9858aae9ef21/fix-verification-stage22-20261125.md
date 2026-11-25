# Fix verification — "Cant see settings in the Ui" (stage 22, 2026-11-25)

## Branch freshness (observed this attempt)
- Entry state: `git rev-list --left-right --count HEAD...origin/main` → `31  9` (31 ahead, 9 behind — missing attachments fix `kb/0a5cad0b` merged to main at `5e55c38a`)
- Action: `git merge origin/main -m "Merge origin/main into kb/7f6220c3: bring attachments fix up to date; preserve docs-repo UI visibility (always-visible fields, not collapsed Advanced)"` → auto-merge clean (`api/flow/runnerRoutes.test.js`, `runner/daemon.js`, `runner/daemon.test.js`, `runner/project.js`); 65 files, 40633 insertions (attachments task), no conflicts
- Exit state: `git rev-list --left-right --count HEAD...origin/main` → `32  0` (32 ahead, 0 behind, up to date)
- `git merge-tree $(git merge-base HEAD origin/main) HEAD origin/main` → 0 lines containing `<<<<<<` (clean)
- `git ls-files -u | wc -l` → 0 unmerged entries; `git status --porcelain` → clean (merge commit `180c5043` is the only new commit; `frontend/dist/` is gitignored — deploy rebuilds it)
- `git branch -vv` → `kb/7f6220c3-c536-489c-b952-9858aae9ef21 180c5043 [origin/kb/7f6220c3: ahead 10]` (9 incoming + merge, no push needed for verification)

## Root cause (why reviewer still said "Cant see settings")
Two stacked causes, neither is a missing feature — the feature exists on both branches but is invisible on the deployed surface:

1. **Deployed bundle is stale.** The live app at `/home/server2/Kainbain` (checked this attempt: `main eb29aa70 [origin/main: behind 1184]`, `Header.jsx` grep for docs-repo → 0, no `frontend/dist/` bundle) predates the docs-repo feature entirely. A reviewer opening the live UI sees no docs-repo strings at all — matching "Cant see settings in the Ui" verbatim. Even `origin/main` (the deploy source) still has `createAdvancedOpen`/`adoptAdvancedOpen` = `useState(false)` (collapsed by default) and no `localPath` on Create, so a reviewer on a fresh deploy of `main` would see a collapsed "Advanced options" toggle and must click to reveal the URL field. This branch fixed that in stages 16–21 but the branch itself was 9 commits behind `origin/main`, so the fix had not been proven against the latest attachments changes.

2. **Branch was behind.** The attachments fix (`kb/0a5cad0b`, 9 commits) touched overlapping paths (`api/flow/runnerRoutes.*`, `runner/daemon.*`, `runner/project.*`, `api/projectStore.js`) — an unmerged branch risks silently dropping either the attachments work or the docs-repo visibility work at merge time. Proving a clean merge is the gate to deploy.

## Fix (this stage — sync + re-verification, no product code change)
- `git merge origin/main` (commit `180c5043`): brings the 9 attachments commits onto this task branch. The merge preserved all stage 16–21 visibility work because the attachments diff touches no frontend docs-repo files (`Header.jsx`, `PathsAndReposSection.jsx`, `ProjectBasicsSection.jsx`, `SystemSettingsContent.jsx` are untouched by the merge — verified via `git diff HEAD..origin/main --name-only` pre-merge and the merge's file list post-merge). The 4 auto-merged backend/runner files were confirmed conflict-free and their tests still pass (below).
- No new product files changed this stage. The verification is that the already-implemented visibility set survives the sync intact:

  - `frontend/src/components/layout/Header.jsx`: both Create and Adopt dialogs render `Advanced options: separate docs repo` heading + `<DocsRepoFields>` (URL + local path) unconditionally after the first field — no toggle, no `aria-expanded`, no collapse. `newProjDocsRepoPath` state + payload forwarding (`docsRepo: {url, localPath?}`) present on Create (grep-verified).
  - `frontend/src/components/settings/PathsAndReposSection.jsx`: `📚 Separate Docs Repository` bordered block is FIRST in Files & Repos (top of tab, first viewport) with URL + local-path inputs (`project-docs-repo-url-input` / `project-docs-repo-path-input` testids).
  - `frontend/src/components/settings/ProjectBasicsSection.jsx` + `ProjectSettingsForm.jsx`: landing Project tab renders the same editable URL + local path inline (shared draft with Files & Repos, `data-testid="docs-repo-summary-state"` + `Open Files & Repos` jump).
  - `frontend/src/components/settings/SystemSettingsContent.jsx`: prominent primary banner (`📚 Separate Docs Repository` + `Open Files & Repos` button) on every System Settings tab.
  - `frontend/src/components/settings/projectSettingsSearch.js`: search entries for `separate docs repo` / `kainbain docs` / `stealth` (keywords include `stealth`, `private`).
  - `frontend/src/components/onboarding/OnboardingEmptyState.jsx`: one-click adopt note points to Adopt Existing… for a private-docs import.

## Evidence (observed this attempt, post-merge)
- Focused FE tests: `Header` + `ProjectSettings` + `PathsAndReposSection` + `SystemSettingsContent` + `ProjectBasicsSection` → **178 passed** (5 files)
- FULL frontend suite: **5055 passed** (365 files; was 5010 pre-merge, +45 from merged attachments tests)
- API docs-repo: `routes/projects.docsRepo.test.js` → **15 passed** (create/register/PATCH/409-stealth-guard)
- Production bundle: `npm run build` in `frontend/` → `index-DBmYJWe3.js` 1.4 MB, 4.66 s green; `grep -o "Separate Docs"` → 7, `"Docs Repository"` → 11, `"project-docs-repo"` → 16, `"docs-repo-url"` → 11 (minified bundle splits some long strings; counts confirm UI is shipped)
- Branch: 32 ahead / 0 behind `origin/main`, merge-tree clean, 0 unmerged entries, working tree clean
- Live-deployment forensics: `/home/server2/Kainbain` is 1184 commits behind `origin/main` with 0 docs-repo strings in `Header.jsx` — explains the human feedback; fix is to merge this branch (now synced) and deploy (not a product-code gap)

## Where to find it after merge + deploy
1. **Create**: Project dropdown → **+ New Project** → second field `Advanced options: separate docs repo` → `📚 Separate Docs Repository (optional)` with `Docs Repository URL (optional)` + `Docs Repo Local Path (optional)` — no toggle, always visible, no click needed.
2. **Import**: Project dropdown → **+ Add Existing Project…** → same always-visible block directly after Project Directory.
3. **Existing project**: **Settings** (TabNavigator ⚙️) → **Project Settings** landing → bordered `📚 Separate Docs Repository On/Off` block with editable URL + local path inputs inline; or **Files & Repos** → same block at the top; or search `separate docs repo` / `kainbain docs` / `stealth`. Opening **System Settings** (System Menu / `S`) shows the primary `📚 Separate Docs Repository` banner with `Open Files & Repos` button on every tab. Hard-refresh (`Ctrl/Cmd+Shift+R`) after deploy to drop the old bundle; merge this branch to `main` and deploy, since the live app at `/home/server2/Kainbain` is 1184 commits stale and shows no docs-repo UI at all.
