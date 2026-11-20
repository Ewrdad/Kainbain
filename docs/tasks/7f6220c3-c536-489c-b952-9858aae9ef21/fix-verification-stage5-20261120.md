# Fix verification — "Cant see settings in the Ui" (stage 5, 2026-11-20)

## Stage goal for this attempt

Explicit stage directive: *Make sure this task branch is up to date with main
and is without merge conflicts* — plus re-proof of the human correction
"Cant see settings in the Ui".

## Branch freshness (re-fetched this attempt)

- `git fetch origin` — no new commits on `origin/main`.
- Merge-base `6e1f85a1` == `origin/main` → HEAD contains main: **0 behind /
  9 ahead** of `origin/main` (`git rev-list --left-right --count HEAD...origin/main`
  → `9 0`).
- `git merge-tree --write-tree HEAD origin/main` → exit 0, single tree
  `a640b72d…`, zero conflict markers.
- `git merge origin/main --no-edit` → `Already up to date.` (no-op).
- Working tree carries only this report + the 5 refreshed `stage4-proof-*.png`
  screenshots (the `/tmp/verify-docsrepo-ui.mjs` script is not part of the
  deliverable; `frontend/dist/` is gitignored and rebuilt by deploy).

No merge was needed and no conflict exists — the branch is ready for the
engine's merge stage.

## Root cause (bundle forensics re-confirmed this attempt)

The instance the human checks (`http://192.168.1.206:3100`, bundle
`/assets/index-Ci5jdoJ7.js`, build `1.0.0-28aac94` at `2026-11-20T20:40:14Z`)
still runs a build from before this branch's visibility fixes:

- Live bundle: bare `Advanced options` ×2 (closed by default), **0**
  occurrences of `Advanced options: separate docs repo`, `max-h-[90vh]` ×1.
- Fresh branch bundle (`frontend/dist/assets/index-C1fQtlV7.js`, built this
  attempt, 4.46s green): `Advanced options: separate docs repo` ×2,
  `Separate Docs Repository URL` / `Docs Repo Local Path` /
  `Separate Docs Repository:` / `Configure in Files & Repos` / `max-h-[90vh]`
  each ≥1. The `28aac94` commit is an ancestor of both HEAD (`f4cdd843`)
  and `origin/main` (`6e1f85a1`) — live is old on both axes, not just the
  docs-repo axis.

Branch source fixes all three visibility defects (verified in source, not just
by tests):

- `frontend/src/components/layout/Header.jsx` — `useState(true)` for both
  `createAdvancedOpen`/`adoptAdvancedOpen` (expanded by default); toggle named
  "Advanced options: separate docs repo" so it stays findable even if
  collapsed; dialogs capped at `max-h-[90vh]` with pinned header + scrolling
  form (`SystemGuideModal` pattern) so the field and the Create/Add buttons
  stay reachable on short viewports.
- `frontend/src/components/settings/PathsAndReposSection.jsx` — bordered
  "📚 Separate Docs Repository" block (heading + Enabled/Disabled status +
  URL + local-path fields) in Settings → Files & Repos; the Project tab
  carries the `Separate Docs Repository: On/Off` summary row with a
  "Manage in Files & Repos" jump (`ProjectBasicsSection.jsx`); settings
  search covers `separate/docs/repo/private/stealth/remote`
  (`projectSettingsSearch.js`).

No further source change was needed: the defect is deployment age, not code.
The setting becomes visible in `192.168.1.206:3100` when the engine merges
this branch and runs `deploy.sh --prod` (the backend host `192.168.1.206` ≠
this runner `192.168.1.172`, so there is no in-worktree way to push it there).
This stage therefore re-proves visibility from current source and confirms
merge-readiness.

## This attempt's evidence (all observed)

- Frontend tests (touched area, run via `frontend/node_modules/.bin/vitest`):
  `Header / PathsAndReposSection / ProjectBasicsSection / ProjectSettings /
  projectSettingsSearch` — **159/159 pass** (5 files).
- Repo gates: `check:one-function` PASS (868 files), `check:binaries` OK,
  `check:proof-hygiene` OK (only pre-existing baseline violations).
- Fresh production bundle: `npm run build --prefix frontend` green (4.46s);
  `frontend/dist` contains the six visibility strings above.
- Live UI proof from THIS branch (vite dev serving branch source + stub API
  with a `docsRepo`-enabled project, headless Chromium @1280×720, script at
  `/tmp/verify-docsrepo-ui.mjs`): **11/11 DOM assertions pass**, including
  "Create dialog renders the docs URL field without clicking the toggle" and
  the Files & Repos status line naming `demo-kainbain-docs.git`.
- Screenshots refreshed this attempt (PNG magic `8950 4e47 0d0a 1a0a` +
  `file` → `PNG image data, 1280 x 720`):
  - `stage4-proof-1-create-720.png` — Create dialog, Advanced open, docs
    URL field + explainer visible.
  - `stage4-proof-2-adopt-720-scrolled.png` — Add Existing dialog,
    scrolled form, URL + local-path fields.
  - `stage4-proof-3-settings-files-repos-720.png` — Files & Repos,
    "Enabled … demo-kainbain-docs.git" + both fields.
  - `stage4-proof-4-settings-project-jump.png` — Project tab `ON` + jump.
  - `stage4-proof-5-settings-search.png` — search `stealth` → entry jump.

## Where to find it after merge + deploy

1. Create: Project dropdown → **+ New Project** → *Advanced options:
   separate docs repo* (already open) → `Docs Repository URL (optional)`.
2. Import: Project dropdown → **+ Add Existing Project…** → same Advanced
   section → URL + `Docs Repo Local Path (optional)`. Dialogs scroll if the
   window is short.
3. Existing project: **Settings** tab → **Files & Repos** → *📚 Separate
   Docs Repository* block (status line + URL + local path). The **Project**
   tab shows the `Separate Docs Repository: On/Off` row with a jump button;
   typing `separate docs repo` (or `stealth`) in settings search goes straight
   to the fields. Hard-refresh (`Ctrl/Cmd+Shift+R`) after deploy to drop the
   old `index-Ci5jdoJ7.js` bundle.
