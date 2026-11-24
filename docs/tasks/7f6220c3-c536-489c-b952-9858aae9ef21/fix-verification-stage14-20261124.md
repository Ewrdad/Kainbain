# Fix verification — "Cant see settings in the Ui" (stage 14, 2026-11-24)

## Branch freshness (observed this attempt)
- `git fetch origin` → `git rev-list --left-right --count HEAD...origin/main` → `23  0` (23 ahead, 0 behind, no merge needed)
- `git merge-tree $(git merge-base HEAD origin/main) HEAD origin/main` → 0 lines (clean)
- `git ls-files -u` → 0 (no unmerged entries)
- `git status` → clean on entry; `Modal.jsx` pre-stage13 fix (`z-[55]`) intact, `origin/main` still `z-50` (verified via `git show`)

## Root cause (re-confirmed + new gap fixed this stage)
The docs-repo setting lives on all four surfaces on this branch but stays invisible on any deployment built from `origin/main`:
1. **Collapsed, generically named toggles (create/import):** `origin/main` keeps both dialogs collapsed behind bare "Advanced options" (`Header.jsx:312,320 useState(false)`). On this branch both are **expanded by default** (`useState(true)`) and named *"Advanced options: separate docs repo"* with scrollable dialogs (`max-h-[90vh]` + pinned header + `flex-1 min-h-0 overflow-y-auto` form).
2. **Occlusion (stage13):** `Modal` backdrop `z-50` tied with the fixed bottom bar (`NowPlayingBar.jsx:353 z-50 h-[72px]`) — DOM order hid the import dialog's last field. This branch raises the backdrop to `z-[55]` (above bar, below `z-60` tooltips).
3. **Deep position + jump landing (fixed this stage):** Settings → Files & Repos puts *Separate Docs Repository* halfway down the tab (after Working Dir / Notes / Docs Folder / KainBain Folder / Centralised checkbox) — easy to miss without scrolling. The Project-tab landing row advertises it (`Separate Docs Repository: Off` + `Configure in Files & Repos` jump in first viewport) but the jump only switched the tab, landing at the top. **Fix this stage: the landing jump now switches to Files & Repos AND scrolls+rings `project-docs-repo-url-input`** (same highlight as a search jump: `ring-2` after 80 ms, cleared after 2100 ms). Search (`separate docs repo` → 2 entries) already did this; the button now matches.

No further layout move — the bounded block in Files & Repos + landing summary + search + expanded dialogs + unoccluded modal together make the setting findable from any entry point.

## Fix (this stage)
- `frontend/src/components/settings/ProjectSettings.jsx`: new `handleJumpToDocsRepo` (`files-repos` + highlight `project-docs-repo-url-input`, suppressed when the unsaved-edits guard blocks); passed as `onJumpToDocsRepo` to the form.
- `frontend/src/components/settings/ProjectSettingsForm.jsx`: accepts `onJumpToDocsRepo` (preferred) and falls back to `onRequestSection('files-repos')`, so existing callers/tests are unaffected.
- `frontend/src/components/settings/ProjectSettings.test.jsx`: new test asserting the landing jump rings the URL field (`ring-2`); all existing jump tests unchanged.

## Evidence (observed this attempt)
- Touched-area frontend tests: `ProjectSettings` + `ProjectBasicsSection` + `PathsAndReposSection` + `projectSettingsSearch` + `Header` — **160 passed** (5 files; +1 new highlight test vs stage13's 159)
- FULL frontend suite: **5007 passed** (365 files, `npm test` incl. duplicate-identifier check; stage13 was 5006)
- ESLint on both changed source files: clean (exit 0)
- Repo gates: `check:one-function` PASS (887 files, 281 grandfathered); `check:binaries` OK; `check:proof-hygiene` OK (only recorded pre-existing baselines)
- Production bundle: `npm run build --prefix frontend` → 4.71 s green; `frontend/dist/assets/index-DU94fBGN.js` contains `Advanced options: separate docs repo` ×2, `Separate Docs Repository` ×4, `project-docs-repo-url-input` ×5, `z-[55]` ×1, `Configure in Files` ×1 (gitignored — deploy rebuilds it)
- Live-DOM proofs from real scratch API+vite (Playwright, headless Chromium 1280×720 + 1024×600, `/tmp/verify-stage14.mjs`): **19/19 pass**

## Screenshots (scratch stack, this branch, post-fix)
- `stage14-proof-1-create-720.png` — Create dialog, Advanced open by default, `Docs Repository URL (optional)` at y=455 visible without click
- `stage14-proof-2-adopt-720.png` — Adopt dialog: URL + `Docs Repo Local Path (optional)` fully visible above the bottom bar (`elementFromPoint` = input, not footer)
- `stage14-proof-3-project-jump.png` — Project Settings landing: `Separate Docs Repository: Off` row + `Configure in Files & Repos` jump at y=439 (first viewport)
- `stage14-proof-4-settings-files-repos-720.png` — Files & Repos: `Separate Docs Repository` block (Disabled status + URL field, scrolled into view)
- `stage14-proof-5-settings-search.png` — search `separate docs repo` lists both entries (count=2)
- `stage14-proof-6-create-600.png` — 1024×600: toggle + URL field in DOM without click, toggle `aria-expanded=true`
- `stage14-proof-7-create-600-scrolled.png` — 1024×600 scrolled reach

## Where to find it after merge + deploy
1. **Create**: Project dropdown → **+ New Project** → *Advanced options: separate docs repo* (already open) → `Docs Repository URL (optional)`.
2. **Import**: Project dropdown → **+ Add Existing Project…** → same Advanced section → URL + `Docs Repo Local Path (optional)`, fully visible at 720p. Dialogs scroll if window short.
3. **Existing project**: **Settings** → **Project Settings** (landing) → `Separate Docs Repository: On/Off` row under Project Name → click `Configure in Files & Repos` — lands scrolled to and ringing the URL field; or **Files & Repos** → *Separate Docs Repository* block; or search `separate docs repo` / `stealth`. Hard-refresh (`Ctrl/Cmd+Shift+R`) after deploy to drop the old bundle.
