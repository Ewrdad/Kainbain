# Fix verification — "Cant see settings in the Ui" (stage 10, 2026-11-24)

## Stage goal for this attempt

Explicit stage directive: *Make sure this task branch is up to date with main
and is without merge conflicts* — plus re-proof of the human correction
"Cant see settings in the Ui" against current source.

## Branch freshness (observed this attempt)

- `git fetch origin` — no new commits on `origin/main`.
- Merge-base `e85d88a3` == `origin/main` (`e85d88a3`), so HEAD contains main:
  **17 ahead / 0 behind** (`git rev-list --left-right --count HEAD...origin/main`).
- `git merge-tree $(git merge-base HEAD origin/main) HEAD origin/main` → zero
  `<<<<<<<` conflict markers.
- `git merge origin/main --no-edit` → `Already up to date.` (no-op).
- Working tree carries only this report + the 5 fresh `stage10-proof-*.png`
  screenshots (`frontend/dist/` is gitignored and rebuilt by deploy).

No merge was needed and no conflict exists — the branch is ready for the
engine's merge stage.

## Root cause (re-confirmed in source this attempt)

The docs-repo setting exists on this branch on all four surfaces but is
absent — or hidden — on `origin/main` and therefore on any deployment built
from main:

1. **Collapsed, generically named toggles.** On `origin/main`, both Create
   and Adopt dialogs keep the docs-repo option under a collapsed disclosure
   labelled bare "Advanced options" (`Header.jsx:312,320` — `useState(false)`,
   verified with `git show origin/main:.../Header.jsx`). A reviewer who never
   clicks the toggle never sees the `Docs Repository URL (optional)` field.
   On this branch both disclosures are **expanded by default**
   (`Header.jsx:316,327` — `useState(true)`) and the toggle is explicitly
   named *"Advanced options: separate docs repo"* (`Header.jsx:849,997`), so
   the named option is findable even when collapsed. The dialogs also scroll
   (`Header.jsx:764,895` — `max-h-[90vh]`, pinned header + scrolling form)
   so the field and submit button stay reachable on short viewports.
2. **Settings buried below the fold.** On `origin/main`, the full setting is
   a plain unbordered "Separate Docs Repository URL (optional)" label deep in
   Files & Repos with no status line, the Project landing tab has **no**
   summary row (`git show origin/main:.../ProjectBasicsSection.jsx` — 0
   matches for "Separate Docs"), and the settings search has **no** docs-repo
   entries (0 matches for "docs-repo"). On this branch Settings → Files &
   Repos carries a bordered *📚 Separate Docs Repository* block (heading +
   Enabled/Disabled status + URL + local-path fields,
   `PathsAndReposSection.jsx:204`), the landing Project tab carries a
   `Separate Docs Repository: On/Off` summary row directly under Project Name
   with a jump button (`ProjectBasicsSection.jsx:119,142`), and settings
   search covers `separate/docs/repo/private/stealth/remote`
   (`projectSettingsSearch.js:174,181`).

No further source change was needed: the defect is deployment age, not code.
The setting becomes visible wherever this branch is merged and `deploy.sh
--prod` rebuilds the frontend (a hard refresh `Ctrl/Cmd+Shift+R` drops the
old cached bundle). This stage proves the current branch carries the fix —
fresh tests, fresh bundle, and fresh live-DOM screenshots from a real scratch
API + vite stack on this branch.

## This attempt's evidence (all observed)

- Frontend tests (touched area, via `frontend/node_modules/.bin/vitest`):
  `Header / ProjectSettings / PathsAndReposSection / ProjectBasicsSection /
  projectSettingsSearch` — **218 passed** (11 files; the pattern also matched
  deep-link + related suites).
- Repo gates: `check:one-function` PASS (885 files, 281 grandfathered);
  `check:binaries` OK; `check:proof-hygiene` OK (only recorded pre-existing
  baseline violations in unrelated task folders).
- Fresh production bundle: `npm run build --prefix frontend` green (4.82s);
  `frontend/dist/assets/index-CmIipZ8T.js` contains
  `Advanced options: separate docs repo` ×2, `Separate Docs Repository URL`
  ×2, `Docs Repository Local Path` ×2, `Separate Docs Repository:` ×1,
  `Configure in Files` ×1, `max-h-[90vh]` ×4 (gitignored — deploy rebuilds).
- Live-DOM assertions from the scratch stack below (Playwright, headless
  Chromium 1280×720, script `/tmp/verify-stage10.mjs`): **12/12 pass**,
  including "create toggle aria-expanded=true by default (no click)",
  "create docs URL field inside 720px viewport (y=455)", "project tab jump
  lands on Files & Repos fields", and "search lists both docs entries".

## Live screenshots (scratch stack, this branch — all observed)

Scratch stack: real API on `:3399` (`PROJECTS_ROOT=/tmp/kb-7f62-stage10/
projects`, scheduler disabled, seeded Seed Project with no `docsRepo`) +
vite dev on `:5299` (`VITE_API_BASE` wired to `:3399`); both stopped after
capture (ports verified free). PNG magic `8950 4e47…` + `file` → `PNG image
data, 1280 x 720` verified for all five:

- `stage10-proof-1-create-720.png` — Create dialog, Advanced already open,
  `Docs Repository URL (optional)` field + explainer visible at y=455.
- `stage10-proof-2-adopt-720.png` — Import dialog, Advanced already open,
  URL + local-path fields visible by default.
- `stage10-proof-3-project-jump.png` — Settings → Project Settings (landing
  tab): `Separate Docs Repository: Off` row directly under Project Name
  with `Configure in Files & Repos` jump button at y=439, first viewport.
- `stage10-proof-4-settings-files-repos-720.png` — Files & Repos:
  *Separate Docs Repository* block (Disabled status + URL + local path).
- `stage10-proof-5-settings-search.png` — typing `separate docs repo` in
  settings search lists `Separate Docs Repository URL` + `Docs Repository
  Local Path`, both → Files & Repos.

## Where to find it after merge + deploy

1. Create: Project dropdown → **+ New Project** → *Advanced options:
   separate docs repo* (already open) → `Docs Repository URL (optional)`.
2. Import: Project dropdown → **+ Add Existing Project…** → same Advanced
   section → URL + `Docs Repo Local Path (optional)`. Dialogs scroll if
   the window is short.
3. Existing project: **Settings** tab → **Project Settings** (landing tab)
   → `Separate Docs Repository: On/Off` row directly under Project Name,
   with a jump button; **Files & Repos** → *Separate Docs Repository*
   block (status line + URL + local path). Typing `separate docs repo`
   (or `stealth`) in settings search goes straight to the fields.
   Hard-refresh (`Ctrl/Cmd+Shift+R`) after deploy to drop the old bundle.
