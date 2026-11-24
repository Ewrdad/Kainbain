# Fix verification — "Cant see settings in the Ui" (stage 15, 2026-11-24)

## Branch freshness (observed this attempt)
- `git fetch origin` → `git rev-list --left-right --count HEAD...origin/main` → `24  0` (24 ahead, 0 behind, no merge needed)
- `git merge-tree $(git merge-base HEAD origin/main) HEAD origin/main` → 0 lines (clean)
- `git ls-files -u` → 0 (no unmerged entries)
- `git status` → only the stage15 source edits below (uncommitted on entry); stage14 fixes (`z-[55]`, expanded Advanced, landing summary) intact

## Root cause (what stage14 still missed)
Stage14's 19/19 proofs checked DOM presence (`isVisible`), not initial-viewport
visibility, and its Files & Repos screenshot was taken *after* `scrollIntoView`.
On direct Files & Repos navigation the *Separate Docs Repository* block sat
halfway down the tab (after Working Directory / Notes / Docs Folder / KainBain
Folder / Centralised checkbox), so the human landed on Working Directory and
never found it. Two more findability gaps in the same view: settings search
matched nothing for the natural query "kainbain docs" (AND semantics, no
`kainbain` keyword on the docs-repo entries), and the landing-tab jump button
was muted grey that read as decoration.

## Fix (this stage)
- `frontend/src/components/settings/PathsAndReposSection.jsx`: moved the
  bordered *Separate Docs Repository* block to FIRST position in Files &
  Repos (before Working Directory), so direct tab navigation shows heading +
  URL + local-path inputs in the first viewport with no scrolling. No field,
  id, or behaviour changed — DOM order only.
- `frontend/src/components/settings/projectSettingsSearch.js`: added
  `kainbain` (plus `private`/`stealth` on the path entry) to the docs-repo
  search keywords, so "kainbain docs" / "kainbain" find the stealth setting.
- `frontend/src/components/settings/ProjectBasicsSection.jsx`: jump button
  promoted from muted (`bg-surface-deep` + muted text) to primary
  (`bg-primary` + bright text) so the landing row's call to action reads as
  a button.
- Tests: `PathsAndReposSection.test.jsx` new DOM-order test (docs inputs
  precede Working Directory); `projectSettingsSearch.test.js` extended with
  "kainbain docs" → docs-repo finding + "kainbain" → kainbain-dir still first.

## Evidence (observed this attempt)
- Touched-area frontend tests: `ProjectSettings` + `ProjectBasicsSection` +
  `PathsAndReposSection` + `projectSettingsSearch` + `Header` — **161 passed** (5 files; +1 order test vs stage14's 160)
- FULL frontend suite: **5008 passed** (365 files, `npm test` incl. duplicate-identifier check; stage14 was 5007)
- ESLint frontend: 0 errors (221 pre-existing warnings)
- Docs-repo backend untouched: 45/45 API (`docsRepo`, `docsRepoPointer`, `projects.docsRepo`, `docsRepoResolution`) + 16/16 runner (`project.docsRepo`) pass
- Repo gates: `check:one-function` PASS (887 files, 281 grandfathered); `check:binaries` OK; `check:proof-hygiene` OK (only recorded pre-existing baselines)
- Production bundle: `npm run build --prefix frontend` → 4.39 s green; `frontend/dist/assets/index-*.js` contains `Advanced options: separate docs repo`, `Separate Docs Repository`, `project-docs-repo-url-input` (gitignored — deploy rebuilds it)
- Live-DOM proofs from real scratch API+vite (Playwright, headless Chromium 1280×720 + 1024×600, `/tmp/verify-stage15.mjs`): **22/22 pass** — including NEW strict checks stage14 did not assert:
  - Files & Repos URL input at **y=395 inside the initial 720px viewport with NO scrollIntoView** (direct navigation), doc order docs-before-working-dir, status Disabled
  - Search "kainbain docs" → **count=2** (was empty pre-fix); "separate docs repo" → count=2
- Create/Adopt dialogs at 720px: toggle `aria-expanded=true` by default with no click, URL field at y=455 inside viewport, adopt local-path unoccluded (`elementFromPoint` = input). Small viewport 1024×600: toggle inside viewport, field reachable via form scroll (scroll contract unchanged).

## Screenshots (scratch stack, this branch, post-fix)
- `stage15-proof-1-create-720.png` — Create dialog, Advanced open by default, `Docs Repository URL (optional)` at y=455 visible without click
- `stage15-proof-2-adopt-720.png` — Adopt dialog: URL + `Docs Repo Local Path (optional)` fully visible above the bottom bar
- `stage15-proof-3-project-jump.png` — Project Settings landing: `Separate Docs Repository: Off` row + bright green `Configure in Files & Repos` jump at y=440 (first viewport)
- `stage15-proof-4-settings-files-repos-720.png` — **Direct Files & Repos navigation, NO scroll**: `Separate Docs Repository` block at top (heading + Disabled status + URL + local path), Working Directory below — the first viewport a human sees
- `stage15-proof-5-settings-search.png` — search `separate docs repo` lists both entries (count=2)
- `stage15-proof-6-create-600.png` — 1024×600: toggle + URL field in DOM without click, toggle `aria-expanded=true`
- `stage15-proof-7-create-600-scrolled.png` — 1024×600 scrolled reach

## Where to find it after merge + deploy
1. **Create**: Project dropdown → **+ New Project** → *Advanced options: separate docs repo* (already open) → `Docs Repository URL (optional)`.
2. **Import**: Project dropdown → **+ Add Existing Project…** → same Advanced section → URL + `Docs Repo Local Path (optional)`, fully visible at 720p. Dialogs scroll if window short.
3. **Existing project**: **Settings** → **Project Settings** (landing) → `Separate Docs Repository: On/Off` row under Project Name → click bright green `Configure in Files & Repos` — lands on the now-top block (scrolled + ringing); or directly **Files & Repos** → *Separate Docs Repository* is the first block (no scrolling); or search `separate docs repo` / `kainbain docs` / `stealth`. Hard-refresh (`Ctrl/Cmd+Shift+R`) after deploy to drop the old bundle.
