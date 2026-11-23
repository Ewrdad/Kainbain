# Fix verification — "Cant see settings in the Ui" (stage 8, 2026-11-23)

## Stage goal for this attempt

Explicit stage directive: *Make sure this task branch is up to date with main
and is without merge conflicts* — plus re-proof of the human correction
"Cant see settings in the Ui".

## Branch freshness (re-fetched this attempt)

- `git fetch origin` — picked up unrelated task branches; `origin/main`
  unchanged since the last merge.
- Merge-base equals `origin/main`, so `HEAD` contains `main`:
  `git rev-list --left-right --count HEAD...origin/main` → `14 0`
  (HEAD is 14 ahead, 0 behind `origin/main`).
- `git merge-tree $(git merge-base HEAD origin/main) HEAD origin/main` →
  exit 0, zero conflict markers.
- `git status` before the edit: clean. After the edit: one new file,
  this report. `frontend/dist/` is gitignored and rebuilt by deploy.

No merge was needed and no conflict exists — the branch is ready for the
engine's merge stage.

## Root cause (live-bundle forensics re-confirmed this attempt)

The instance the human checks (`http://192.168.1.206:3100`, build
`1.0.0-28aac94`, bundle `/assets/index-C7IOG_u6.js`) still serves a build
from `origin/main` **before** this branch's visibility fixes:

- Live bundle: bare `Advanced options` ×2 (collapsed by default —
  `useState(false)` in `origin/main`'s `Header.jsx`), 0 occurrences of
  `Advanced options: separate docs repo`, 0 of `Configure in Files`.
- Fresh branch bundle (`frontend/dist/assets/index-CmIipZ8T.js`, rebuilt
  this attempt, 4.46s green): `Advanced options: separate docs repo` ×2,
  `Separate Docs Repository` ×4, `Configure in Files` ×1 — same content
  hash as the prior stage (deterministic rebuild, no source drift).

The defect on the live instance is twofold, and both halves are fixed on
this branch: (1) the deployed build predates the merged feature entirely
in the visibility-relevant surfaces, and (2) even on `main`, the Create/
Adopt Advanced sections are collapsed and generically named, so a reviewer
who doesn't click the toggle never sees the docs-repo field. On this
branch both dialogs are **expanded by default** (`useState(true)`), the
toggle is explicitly named *"Advanced options: separate docs repo"*, and
the dialogs scroll (`max-h-[90vh]`, pinned header + scrolling form) so the
field and the submit button stay reachable on short viewports.

No further source change was needed — the surviving defect is deployment
age, not code. The setting becomes visible in `192.168.1.206:3100` when
the engine merges this branch and runs `deploy.sh --prod` (the backend
host differs from this runner, so there is no in-worktree way to push the
new bundle there from here).

## Branch source (re-verified this attempt by reading the files)

- `frontend/src/components/layout/Header.jsx` — `useState(true)` for both
  `createAdvancedOpen`/`adoptAdvancedOpen`; toggle named
  "Advanced options: separate docs repo"; `max-h-[90vh]` dialogs with
  pinned header + scrolling form. Submit handlers forward
  `docsRepo: { url }` (create) / `{ url, localPath? }` (adopt) and render
  server errors inline (`serverErrorMessage`).
- `frontend/src/components/layout/DocsRepoFields.jsx` — shared bordered
  "Docs Repository URL (optional)" (+ optional local path on adopt) with
  stealth-use explainer copy.
- `frontend/src/components/settings/PathsAndReposSection.jsx` — bordered
  "📚 Separate Docs Repository" block (Enabled/Disabled status, URL,
  local-path field) in Settings → Files & Repos.
- `frontend/src/components/settings/ProjectBasicsSection.jsx` —
  `Separate Docs Repository: On/Off` summary row directly under Project
  Name (landing tab, first viewport) with a jump button to Files & Repos.
- `frontend/src/components/settings/projectSettingsSearch.js` — search
  covers `separate/docs/repo/private/stealth/remote` and jumps to the
  fields.

## This attempt's evidence (all observed)

- Frontend tests (via `npm run test --prefix frontend`):
  `Header + PathsAndReposSection + ProjectBasicsSection +
  projectSettingsSearch` — **82 passed** (4 files);
  `ProjectSettings` — **77 passed** (1 file).
- API tests (via `npm test --prefix api`): `routes/projects.docsRepo` —
  **15 passed**.
- Runner tests (via `node --test runner/project.docsRepo.test.js`):
  **16 passed** (paired-worktree eviction/reap preservation).
- Fresh production bundle: `npm run build --prefix frontend` green
  (4.46s); `frontend/dist/assets/index-CmIipZ8T.js` contains the
  visibility strings above.
- Live bundle compared side-by-side this attempt (counts are occurrences
  in the minified single-line bundle):
  live `index-C7IOG_u6.js` — `Advanced options: separate docs repo` 0,
  `Configure in Files` 0, `Separate Docs Repository` 1;
  branch `index-CmIipZ8T.js` — `Advanced options: separate docs repo` 2,
  `Configure in Files` 1, `Separate Docs Repository` 4.

## Where to find it after merge + deploy

1. Create: Project dropdown → **+ New Project** → *Advanced options:
   separate docs repo* (already open) → `Docs Repository URL (optional)`.
2. Import: Project dropdown → **+ Add Existing Project…** → same Advanced
   section → URL + `Docs Repo Local Path (optional)`. Dialogs scroll if
   the window is short.
3. Existing project: **Settings** tab → **Project Settings** (landing tab)
   → `Separate Docs Repository: On/Off` row directly under Project Name,
   with a jump button; **Files & Repos** → *📚 Separate Docs Repository*
   block (status line + URL + local path). Typing `separate docs repo`
   (or `stealth`) in settings search goes straight to the fields.
   Hard-refresh (`Ctrl/Cmd+Shift+R`) after deploy to drop the old bundle.
