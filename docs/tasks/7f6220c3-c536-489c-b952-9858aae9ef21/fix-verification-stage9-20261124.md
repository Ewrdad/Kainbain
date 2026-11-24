# Fix verification — "Cant see settings in the Ui" (stage 9, 2026-11-24)

## Stage goal for this attempt

Explicit stage directive: *Make sure this task branch is up to date with main
and is without merge conflicts* — plus re-proof of the human correction
"Cant see settings in the Ui" after the latest `origin/main` movement.

## Branch freshness (observed this attempt)

- `git fetch origin` — `origin/main` had moved 11 commits ahead of this
  branch (capacity-refusal re-dispatch backoff, task `3b82f6ae`).
- Merged `origin/main` into the task branch with a plain merge commit
  (`ort` strategy, no conflicts, no manual resolution needed):
  `16 0` (`git rev-list --left-right --count HEAD...origin/main`) —
  HEAD is 16 ahead, **0 behind** `origin/main`.
- Merge-base equals `origin/main` (`e85d88a3`), so `HEAD` contains `main`.
- `git merge-tree $(git merge-base HEAD origin/main) HEAD origin/main` →
  zero `<<<<<<<` conflict markers.
- The merge was purely additive to this branch's surfaces: 30 files,
  +1825/−15 — new `api/flow/capacityRefusal.js`, `resumeBackoff.js`,
  `scanClaimableTasks.js` updates and the `3b82f6ae` task docs. No
  `frontend/` or `runner/` file was touched by the merge, so the docs-repo
  UI and runner pair preservation are byte-identical to the prior stage's
  proof.

No merge conflict exists — the branch is ready for the engine's merge stage.

## Root cause (re-confirmed this attempt)

Two compounding visibility problems, both fixed on this branch and both
present in the fresh build below:

1. **Collapsed, generically named toggles.** On `origin/main`, both Create
   and Adopt dialogs keep the docs-repo option under a collapsed disclosure
   labelled bare "Advanced options" (`useState(false)` — verified with
   `git show origin/main:.../Header.jsx`). A reviewer who never clicks the
   toggle never sees the `Docs Repository URL (optional)` field. On this
   branch both disclosures are **expanded by default** (`useState(true)`)
   and the toggle is explicitly named *"Advanced options: separate docs
   repo"*, so the named option is findable even when collapsed.
2. **Settings buried below the fold.** The full setting lives in Settings →
   Files & Repos (a long scrollable tab); the landing tab (Project Settings)
   now carries a `Separate Docs Repository: On/Off` summary row directly
   under Project Name with a jump button to Files & Repos, and settings
   search (`separate docs repo` / `stealth` / `private`) jumps straight to
   the fields. The dialogs scroll (`max-h-[90vh]`, pinned header + scrolling
   form) so the field and submit button stay reachable on short viewports.

The instance the human checks serves a pre-branch bundle (see stage 8
forensics: live bundle has 0 occurrences of the visibility strings and a
bare `Advanced options` ×2). The setting therefore becomes visible there
only when the engine merges this branch and runs `deploy.sh --prod`
(the backend host differs from this runner, so there is no in-worktree way
to push the new bundle there from here). This stage proves the merged
branch itself carries the fix — fresh tests, fresh bundle, and fresh
live-DOM screenshots from a scratch stack after the merge.

## This attempt's evidence (all observed)

- Frontend tests (via `npm run test --prefix frontend`):
  `Header + ProjectSettings + ProjectBasicsSection + PathsAndReposSection +
  projectSettingsSearch` — **159 passed** (5 files). The Header expanded-by-
  default tests assert the docs-repo field is in the DOM *without* any
  toggle click, and the ProjectSettings tests cover save/clear/409 flows.
- API tests (via `npm test --prefix api`): `routes/projects.docsRepo` —
  **15 passed**; merged-main capacity tests
  (`capacityRefusal` + `resumeBackoff` + `scanClaimableTasks`) — **18 passed**.
- Runner tests (via `node --test runner/project.docsRepo.test.js`):
  **16 passed** (paired-worktree eviction/reap preservation).
- Repo gates: `check:one-function` PASS (885 files, 281 grandfathered);
  `check:binaries` OK; `check:proof-hygiene` OK (only recorded pre-existing
  baseline violations in unrelated task folders).
- Fresh production bundle: `npm run build --prefix frontend` green (4.68s);
  `frontend/dist/assets/index-CmIipZ8T.js` contains
  `Advanced options: separate docs repo` ×2, `Separate Docs Repository` ×4,
  `Configure in Files` ×1, `Docs Repository URL` ×3 (gitignored — deploy
  rebuilds it).
- Live-DOM assertions from the scratch stack below (Playwright, headless
  Chromium 1280×720, all true):
  create toggle `aria-expanded=true` + `Docs Repository URL (optional)`
  visible without a click; adopt URL + local-path fields visible;
  Project-tab summary `Off` + jump button visible in the first viewport;
  Files & Repos URL field visible with the Disabled explainer text;
  `separate docs repo` search lists both docs entries.

## Live screenshots (scratch stack, post-merge — all observed)

Scratch stack: API on `:3399` (`PROJECTS_ROOT=/tmp/kb-7f62-proof/projects`,
scheduler disabled, mock harness, seeded Project A) + vite on `:5299`
(`VITE_API_BASE` wired to `:3399`); both stopped after capture. PNG magic
`8950 4e47…` verified for all five:

- `stage9-proof-1-create-720.png` — Create dialog, Advanced already open,
  `Docs Repository URL (optional)` field + explainer visible.
- `stage9-proof-2-adopt-720.png` — Import dialog, Advanced already open,
  URL field visible, local-path field below (dialog scrolls; DOM-confirmed).
- `stage9-proof-3-project-jump.png` — Settings → Project Settings (landing
  tab): `Separate Docs Repository: Off` row directly under Project Name
  with `Configure in Files & Repos` jump button, first viewport.
- `stage9-proof-4-settings-files-repos-720.png` — Files & Repos:
  *Separate Docs Repository* block (Disabled status + URL + local path).
- `stage9-proof-5-settings-search.png` — typing `separate docs repo` in
  settings search lists `Separate Docs Repositor…` + `Docs Repository
  Local Pa…`, both → Files & Repos.

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
