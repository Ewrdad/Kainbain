# Fix verification — "Cant see settings in the Ui" (stage 21, 2026-11-24)

## Branch freshness (observed this attempt)
- `git fetch origin --quiet` → `git rev-list --left-right --count HEAD...origin/main` → `30  0` (30 ahead, 0 behind, no merge needed)
- `git merge-tree $(git merge-base HEAD origin/main) HEAD origin/main` → 0 lines containing `<<<<<<` (clean)
- `git ls-files -u | wc -l` → 0 unmerged entries; `git status --porcelain` → only the 8 stage21 source/test edits below (dist/ is gitignored — deploy rebuilds it)

## Root cause
Stage20 moved the Advanced block to directly after the first field and expanded it by default, but the block remained behind a collapsible toggle button (`Advanced options` with `aria-expanded` gating). A collapsed disclosure hides `Docs Repository URL (optional)` + `Docs Repo Local Path (optional)` entirely from the DOM, so text search for those labels finds nothing and a single collapse hides the setting for the rest of that dialog session. On the Project Settings landing (Project tab) the same problem persisted differently: only a summary row (`Separate Docs Repository: Off` + `Configure in Files & Repos` button) was rendered — the actual URL/path inputs lived only in Files & Repos, requiring a second navigation. System Settings carried only a low-contrast muted pointer (`text-text-muted` on `bg-surface-container-high`) that System-Settings visitors easily missed.

## Fix (this stage)
- `frontend/src/components/layout/Header.jsx`: removed the dismissible disclosure entirely. Both dialogs now render a static heading `Advanced options: separate docs repo` followed unconditionally by `<DocsRepoFields>` (URL + local path) directly after the first field (Project Name / Project Directory) — no button, no `aria-expanded`, no collapse state to hide. Removed `createAdvancedOpen`/`adoptAdvancedOpen` state and all reset setters; opening a dialog always shows the fields without a click. Heading text is unchanged and findable.
- `frontend/src/components/settings/ProjectBasicsSection.jsx` + `ProjectSettingsForm.jsx`: landing Project tab now renders the editable `Separate Docs Repository URL (optional)` + `Docs Repository Local Path (optional)` inputs inline below the summary, sharing the same `touch()` draft as Files & Repos (editing on either tab stays in sync through the one mounted `ProjectSettingsForm`). Summary row keeps `data-testid="docs-repo-summary-state"` and the jump button (now `Open Files & Repos`) still switches + highlights.
- `frontend/src/components/settings/SystemSettingsContent.jsx`: muted `<p>` pointer replaced with a prominent primary banner (`border-primary/60 bg-primary/10`, 📚 icon, bold `Separate Docs Repository` heading, `Open Files & Repos` primary button) visible on every System Settings tab; `data-testid` and `href="#/settings/files-repos"` unchanged.

## Evidence (observed this attempt)
- Header + ProjectSettings + ProjectBasics + SystemSettingsContent tests: **168 passed** (4 files)
- FULL frontend suite: **5010 passed** (365 files)
- Production bundle: `npx vite build` in `frontend/` → `index-CtBfNnNZ.js` 1.4 MB, 4.59 s green; `grep -o "Separate Docs Repository"` → 7, `Advanced options: separate docs repo` → 2, `Docs Repository URL` → 4, `project-docs-repo-url-input` → 8, `system-settings-docs-repo-pointer` → 1
- Branch: 30 ahead / 0 behind `origin/main`, merge-tree clean, 0 unmerged entries
- `check:one-function` PASS (887 files, 281 grandfathered)

## Where to find it after merge + deploy
1. **Create**: Project dropdown → **+ New Project** → second field `Advanced options: separate docs repo` heading → `📚 Separate Docs Repository (optional)` with `Docs Repository URL (optional)` + `Docs Repo Local Path (optional)` — no toggle, always visible.
2. **Import**: Project dropdown → **+ Add Existing Project…** → same always-visible block directly after Project Directory.
3. **Existing project**: **Settings** (TabNavigator ⚙️) → **Project Settings** landing → bordered `📚 Separate Docs Repository On/Off` block with editable URL + local path inputs inline; or **Files & Repos** → same block at the top; or search `separate docs repo` / `kainbain docs` / `stealth`. Opening **System Settings** (System Menu / `S`) shows the primary `📚 Separate Docs Repository` banner with `Open Files & Repos` button on every tab. Hard-refresh (`Ctrl/Cmd+Shift+R`) after deploy to drop the old bundle.
