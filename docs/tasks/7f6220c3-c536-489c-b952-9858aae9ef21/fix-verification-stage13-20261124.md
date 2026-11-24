# Fix verification — "Cant see settings in the Ui" (stage 13, 2026-11-24)

## Branch freshness (observed this attempt)
- `git fetch origin` → `git rev-list --left-right --count HEAD...origin/main` → `22  0` (22 ahead, 0 behind, no merge needed)
- `git merge-tree $(git merge-base HEAD origin/main) HEAD origin/main | grep -c "<<<<<<<"` → 0
- `git ls-files -u` → 0 (no unmerged entries)

## Root cause (new defect found this stage, on top of stage12's visibility work)
Surfaces reviewed against live scratch API+vite (Playwright, headless Chromium, 1280×720):
- Create dialog: docs-repo URL field fully visible, no click (aria-expanded=true) ✓
- Settings → Project landing: `Separate Docs Repository: Off` + jump ✓; Files & Repos bordered block ✓; search finds both entries ✓
- **Import (Add Existing Project) dialog: the "Docs Repo Local Path" input was occluded.** Measured: dialog `max-h-[90vh]` (648px at 720p) ends at y=684; the fixed bottom bar (`NowPlayingBar.jsx:353`, `fixed bottom-0 h-[72px] z-50`) occupies y=648–720. The `Modal` backdrop is also `z-50` (`Modal.jsx:83`), so DOM order let the bar paint over the dialog's bottom 36px — exactly where the import dialog's last settings field sits.

## Fix
`Modal.jsx`: backdrop `z-50` → `z-[55]` (strictly above the bottom bar at z-50, below in-modal tooltips at z-60), with a short comment. One token; every modal benefits, none regresses (full suite green). No dialog height or layout change; the scroll contract is untouched.
`Modal.test.jsx`: new test asserting the backdrop carries `z-[55]`.

## Evidence (observed)
- Frontend tests touched area: Modal, Header, ProjectSettings, PathsAndReposSection, ProjectBasicsSection, projectSettingsSearch, serverErrorMessage — **167 passed** (7 files)
- FULL frontend suite: **5006 passed** (365 files, `npm test` incl. duplicate-identifier check)
- ESLint on both changed files: clean
- Production bundle: `npm run build` → 4.43s green; `frontend/dist/assets/index-BTknK9Iy.js` contains `Advanced options: separate docs repo` ×2, `z-[55]` ×1
- Live-DOM proofs from real scratch API+vite (Playwright, headless Chromium 1280×720 + 1024×600, `/tmp/verify-stage13.mjs`): **18/18 pass**, including the new occlusion assertion (import local-path input is topmost at its own center; `elementFromPoint` returns the input, not the footer)

## Screenshots (scratch stack, this branch, post-fix)
- `stage13-proof-1-create-720.png` — Create dialog, Advanced open by default, `Docs Repository URL (optional)` visible without click
- `stage13-proof-2-adopt-720.png` — Adopt dialog: URL + `Docs Repo Local Path (optional)` inputs both fully visible above the bottom bar (was occluded pre-fix)
- `stage13-proof-3-project-jump.png` — Project Settings landing: `Separate Docs Repository: Off` + `Configure in Files & Repos` jump in first viewport
- `stage13-proof-4-settings-files-repos-720.png` — Files & Repos `Separate Docs Repository` block (Disabled status + URL + local path)
- `stage13-proof-5-settings-search.png` — search `separate docs repo` lists both entries (count=2)
- `stage13-proof-6-create-600.png` — 1024×600: toggle + URL field visible without click
- `stage13-proof-7-create-600-scrolled.png` — 1024×600 scrolled reach

## Where to find it after merge + deploy
1. **Create**: Project dropdown → **+ New Project** → *Advanced options: separate docs repo* (already open) → `Docs Repository URL (optional)`.
2. **Import**: Project dropdown → **+ Add Existing Project…** → same Advanced section → URL + `Docs Repo Local Path (optional)`, fully visible at 720p. Dialogs scroll if window short.
3. **Existing project**: **Settings** → **Project Settings** (landing) → `Separate Docs Repository: On/Off` row under Project Name; **Files & Repos** → *Separate Docs Repository* block. Search `separate docs repo` jumps to fields. Hard-refresh (`Ctrl/Cmd+Shift+R`) after deploy.
