# Fix verification — "Cant see settings in the Ui" (stage 12, 2026-11-24)

## Branch freshness (observed this attempt)
- `git fetch origin` then `git merge origin/main --no-ff` → clean merge (`aea75a21`), ort strategy, no conflicts
- `git rev-list --left-right --count HEAD...origin/main` → `21  0` (21 ahead, 0 behind)
- `git merge-tree $(git merge-base HEAD origin/main) HEAD origin/main | grep -c "<<<<<<<"` → 0
- `git ls-files -u` → 0 (no unmerged entries)
- Merge brought the kb/79c51992 resume-label fix (cleanSingleLineText, interruptedBy marker, resolver, taskFormatters) up to date; docs-repo pair-preservation and UI visibility preserved byte-identical.

## Root cause (re-confirmed)
The docs-repo setting exists on all four surfaces on this branch but is collapsed/generically named on `origin/main` and therefore invisible on any deployment built from main:
1. **Create/Adopt dialogs**: On `origin/main` both keep docs-repo under collapsed disclosure labelled bare "Advanced options" (`Header.jsx:312,320` `useState(false)`). On this branch both disclosures are **expanded by default** (`Header.jsx:316,327` `useState(true)`) with named toggle *"Advanced options: separate docs repo"* (`Header.jsx:849,997`) and scrollable dialogs (`max-h-[90vh]` pinned header + `flex-1 min-h-0 overflow-y-auto` form).
2. **Settings**: On `origin/main` the setting is a plain unbordered field deep in Files & Repos with no status, no landing-tab summary, and no search entries. On this branch Settings → Files & Repos carries a bordered *📚 Separate Docs Repository* block (heading + Enabled/Disabled status + URL + local-path, `PathsAndReposSection.jsx:204`), the landing Project tab carries `Separate Docs Repository: On/Off` row under Project Name with jump button (`ProjectBasicsSection.jsx:119`), and settings search covers `separate/docs/repo/private/stealth/remote` (`projectSettingsSearch.js:174`).

No further source change needed — the defect is deployment age. The setting becomes visible after merge + `deploy.sh --prod` rebuild + hard-refresh (`Ctrl/Cmd+Shift+R`).

## Evidence (observed)
- Frontend tests (touched area): `Header`, `ProjectSettings`, `PathsAndReposSection`, `ProjectBasicsSection`, `projectSettingsSearch` — **159 passed** (5 files)
- Production bundle: `npm run build --prefix frontend` → 4.50s green; `frontend/dist/assets/index-CG2TWbrA.js` contains `Advanced options: separate docs repo` ×2, `Separate Docs Repository URL` ×2, `max-h-[90vh]` ×4
- Live-DOM proofs from real scratch API+vite (Playwright, headless Chromium 1280×720, `/tmp/verify-stage12.mjs`): **12/12 pass** (API on :3499, vite on :5399, both stopped after capture)

## Screenshots (scratch stack, this branch)
- `stage12-proof-1-create-720.png` — Create dialog, Advanced open by default, toggle `aria-expanded=true`, `Docs Repository URL (optional)` at y=455 visible without click
- `stage12-proof-2-adopt-720.png` — Adopt dialog, URL + `Docs Repo Local Path (optional)` visible by default
- `stage12-proof-3-project-jump.png` — Project Settings landing tab: `Separate Docs Repository: Off` row + `Configure in Files & Repos` jump at y=439 (first viewport)
- `stage12-proof-4-settings-files-repos-720.png` — Files & Repos: `Separate Docs Repository` block (Disabled status + URL field)
- `stage12-proof-5-settings-search.png` — searching `separate docs repo` lists both entries (count=2)

## Where to find it after merge + deploy
1. **Create**: Project dropdown → **+ New Project** → *Advanced options: separate docs repo* (already open) → `Docs Repository URL (optional)`.
2. **Import**: Project dropdown → **+ Add Existing Project…** → same Advanced section → URL + `Docs Repo Local Path (optional)`. Dialogs scroll if window short.
3. **Existing project**: **Settings** → **Project Settings** (landing) → `Separate Docs Repository: On/Off` row under Project Name; **Files & Repos** → *Separate Docs Repository* block. Search `separate docs repo` jumps to fields. Hard-refresh after deploy.
