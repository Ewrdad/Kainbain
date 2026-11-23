# Fix verification — "Cant see settings in the Ui" (stage 7, 2026-11-23)

## Stage goal for this attempt

Explicit stage directive: *Make sure this task branch is up to date with main
and is without merge conflicts* — plus re-proof of the human correction
"Cant see settings in the Ui".

## Branch freshness (observed this attempt)

- `git fetch origin` — no new commits on `origin/main` beyond the last merge.
- Merge-base equals `origin/main`, so `HEAD` contains `main`:
  `git rev-list --left-right --count HEAD...origin/main` → `13 0`
  (HEAD is 13 ahead, 0 behind `origin/main`).
- `git merge-tree $(git merge-base HEAD origin/main) HEAD origin/main` →
  exit 0, single tree, zero `<<<<<<<` conflict markers.
- `git status` before the edit: clean. After the edit: one modified file,
  `frontend/src/components/settings/ProjectBasicsSection.jsx`
  (37 insertions, 33 deletions — the moved summary row, no other logic touched).
- `frontend/dist/` is gitignored and rebuilt by deploy; the rebuilt bundle
  hash changed this attempt (`index-CmIipZ8T.js`) because the moved row is
  part of the build.

No merge was needed and no conflict exists — the branch is ready for the
engine's merge stage.

## Change this attempt (visibility on the landing tab)

The branch already showed the separate-docs-repo option on all three
surfaces since `e049da74` (Create/Import Advanced expanded by default, the
bordered "Separate Docs Repository" block in Settings → Files & Repos, the
Project-tab summary row, and settings search). The reviewer still reports
not seeing it, and the landing-tab row sat at the *bottom* of
`ProjectBasicsSection` — after the Project Name field, the harness/model
picker, the accent picker, and the hide toggle — so a reviewer landing on
Settings → Project Settings (the default tab) had to scroll past four
sections before the `Separate Docs Repository: On/Off` row appeared.

This attempt moves that row to directly under the Project Name input, so it
occupies the first viewport of the landing tab without scrolling. The move
is a pure relocation inside `ProjectBasicsSection.jsx`:

- Same `data-testid="docs-repo-summary-state"`, `id="project-docs-repo-jump"`,
  On/Off derivation from `docsRepoUrl`, and jump callback
  (`onJumpToFilesRepos` → `files-repos` tab via `ProjectSettingsForm`).
- Same copy ("Configure in Files & Repos" when off, "Manage in Files & Repos"
  when on, the linked URL when on) — no text or behaviour change.
- No other component touched. `Header.jsx`, `PathsAndReposSection.jsx`,
  `ProjectSettingsForm.jsx`, `projectSettingsSearch.js`, API, and runner
  are unchanged from the prior stage's proof.

## This attempt's evidence (all observed)

- Frontend tests (via `npm run test --prefix frontend`):
  `ProjectBasicsSection + PathsAndReposSection + projectSettingsSearch` —
  **31 passed** (3 files); `Header + ProjectSettings + ProjectBasicsSection`
  rerun — **137 passed** (3 files, including the jump-to-Files & Repos and
  the moved-row summary tests).
- API tests (via `npm test --prefix api`): `routes/projects.docsRepo` (15)
  + `projectStore.docsLink` + `docsRepoResolution` — **38 passed** (3 files).
- Runner tests (via `node --test runner/project.docsRepo.test.js`):
  **16 passed** (paired-worktree eviction/reap preservation, per the gate's
  explicit file list in `scripts/run-tests.mjs`).
- Repo gates: `check:one-function` PASS (881 files, 281 grandfathered);
  `check:binaries` OK; `check:proof-hygiene` OK (only the 11 recorded
  pre-existing baseline violations in unrelated task folders).
- Frontend lint on the touched file: 0 errors (221 warnings repo-wide,
  pre-existing; none in `ProjectBasicsSection.jsx`).
- Fresh production bundle: `npm run build --prefix frontend` green (4.74s);
  `frontend/dist/assets/index-CmIipZ8T.js` contains
  `Advanced options: separate docs repo` ×2, `Separate Docs Repository` ×4,
  `Configure in Files & Repos` ×1 (gitignored — deploy rebuilds it).
- No new screenshots taken this attempt; the five framed proofs from the
  prior stage (`stage4-proof-*.png`, PNG magic `8950 4e47 0d0a 1a0a`) remain
  the visual record. The moved row does not change any photographed surface
  except Project-tab ordering (the same `On/Off` row, now adjacent to
  Project Name).

## Root cause (re-confirmed)

The setting is present in branch source and in the freshly built bundle.
The instance the human checks still serves a pre-branch bundle (stage 5
forensics: live `index-Ci5jdoJ7.js` has 0 occurrences of
`Advanced options: separate docs repo`). No source defect remains on the
branch — the option becomes visible in the human's instance when the engine
merges this branch and runs `deploy.sh --prod` (the backend host differs
from this runner, so there is no in-worktree way to push the new bundle
there from here). This stage therefore both sharpens landing-tab
visibility (row at the top, not below the fold) and re-confirms
merge-readiness.

## Where to find it after merge + deploy

1. Create: Project dropdown → **+ New Project** → *Advanced options:
   separate docs repo* (already open) → `Docs Repository URL (optional)`.
2. Import: Project dropdown → **+ Add Existing Project…** → same Advanced
   section → URL + `Docs Repo Local Path (optional)`. Dialogs scroll if the
   window is short.
3. Existing project: **Settings** tab → **Project Settings** (landing tab)
   → `Separate Docs Repository: On/Off` row directly under Project Name,
   with a jump button; **Files & Repos** → *Separate Docs Repository*
   block (status line + URL + local path). Typing `separate docs repo`
   (or `stealth`) in settings search goes straight to the fields.
   Hard-refresh (`Ctrl/Cmd+Shift+R`) after deploy to drop the old bundle.
