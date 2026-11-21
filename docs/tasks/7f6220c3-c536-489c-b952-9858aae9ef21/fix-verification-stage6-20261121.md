# Fix verification — "Cant see settings in the Ui" (stage 6, 2026-11-21)

## Stage goal for this attempt

Explicit stage directive: *Make sure this task branch is up to date with main
and is without merge conflicts* — plus re-proof of the human correction
"Cant see settings in the Ui".

## Branch freshness (this attempt)

- Start of attempt: `HEAD` 10 ahead / 32 behind `origin/main`
  (`git rev-list --left-right --count HEAD...origin/main` → `10 32`,
  merge-base `6e1f85a1`).
- `git fetch origin` picked up `7ac148ce` (task `1cae113f` git/hook-failure
  surfacing + task `db49d6c6` recovery bypass) — 32 commits behind is the
  `git merge-tree --write-tree HEAD origin/main` conflict in
  `runner/daemon.js` + `runner/project.js` (both sides edited recovery,
  eviction and daemon log regions).
- `git merge origin/main --no-ff` → 2 conflicting files. Resolved by union
  (details below), staged the 5 refreshed `stage4-proof-*.png` screenshots
  separately, and committed as `25d043cf`.
- After the merge commit: `HEAD` **11 ahead / 0 behind** `origin/main`
  (`7ac148ce` is now the merge-base), `git merge-tree --write-tree HEAD
  origin/main` → single tree `5c36b74b…`, exit 0, zero conflict markers.
- Working tree carries only this report + the 5 refreshed
  `stage4-proof-*.png` screenshots; `frontend/dist/` is gitignored and
  rebuilt by deploy.

## Conflict resolution (union, no feature dropped)

- `runner/daemon.js` — import: `runnerTaskDocsRelPath` (docs-repo, HEAD) +
  `withGitFailurePhase` (git-failure, main) in one import line. Workdir log:
  `assignmentBranch = branch` (main's commit-failure report needs the
  branch) plus the `evicted.docsParkedTo` segment (HEAD's docs-twin log).
  Everything else auto-merged clean: HEAD's docs-aware CI
  (`runnerDocsHome`/`separateRunnerDocsHome`/`ciTaskDocs`/`runnerTaskDocsRelPath`)
  and `collectTaskFiles(..., { docsWorkdir })` sit alongside main's
  `gitPhase`/`sendLogs` hoists, deterministic-failure branch
  (`isDeterministicGitFailure`/`buildGitFailureDetails`/`redactSecretsText`)
  and dispatch containment.
- `runner/project.js` — `evictOldestWorkdir` JSDoc keeps `@param logger`
  (main) and the `docsParkedTo` return (HEAD). `reapTaskWorkdirIfTerminal`
  and `reapTerminalOrphanWorkdirs` use `preserveWorkdirPairForRemoval`
  (HEAD: parks the code worktree AND its `<dir>-docs` twin) instead of
  `preserveEvictedWorkdir` alone, and keep main's `reportHookBlock({ logger,
  ... })` catch so a structured preserve failure stays loud. Post-merge the
  file contains both `commitRecoverySnapshot` (main: `--no-verify`
  recovery snapshots, `toRunnerGitError` hook parsing, `withGitFailurePhase`)
  and HEAD's `runnerTaskDocsRelPath` + `preserveWorkdirPairForRemoval` +
  `docsWorkdirFor` pair handling. `node --check` clean on both files.

## Root cause (bundle forensics re-confirmed this attempt)

The instance the human checks still runs a build that predates this branch's
visibility fixes (see stage 5 forensics: live bundle `index-Ci5jdoJ7.js`
has 0 occurrences of `Advanced options: separate docs repo`). No UI source
change was needed — this branch already shows the option on all three
surfaces since `e049da74`. The setting becomes visible when the engine
merges this branch and runs `deploy.sh --prod`.

Branch source (re-verified this attempt, not just by tests):

- `frontend/src/components/layout/Header.jsx` — `useState(true)` for both
  `createAdvancedOpen`/`adoptAdvancedOpen` (expanded by default); toggle
  named "Advanced options: separate docs repo" so it stays findable even if
  collapsed; dialogs capped at `max-h-[90vh]` with pinned header + scrolling
  form so the field and the Create/Add buttons stay reachable on short
  viewports.
- `frontend/src/components/settings/PathsAndReposSection.jsx` — bordered
  "📚 Separate Docs Repository" block (heading + Enabled/Disabled status +
  URL + local-path fields) in Settings → Files & Repos; the Project tab
  carries the `Separate Docs Repository: On/Off` summary row with a
  "Manage in Files & Repos" jump (`ProjectBasicsSection.jsx`); settings
  search covers `separate/docs/repo/private/stealth/remote`
  (`projectSettingsSearch.js`).

## This attempt's evidence (all observed)

- Frontend tests (touched area, via `npm run test --prefix frontend`):
  `Header + PathsAndReposSection + ProjectSettings` 3 files — **150 passed**;
  `Header + PathsAndReposSection + ProjectBasicsSection +
  projectSettingsSearch` — **82 passed** (earlier run). API:
  `routes/projects.docsRepo.test.js` — **15 passed**. Runner:
  `project.docsRepo + daemon` — **184 passed**; `project + gitOps +
  client` — **96 passed** (no failures).
- Repo gates: `check:binaries` OK (5 binaries), `check:proof-hygiene` OK
  (only pre-existing baseline violations), `check:one-function`
  PASS (881 files).
- Fresh production bundle: `npm run build --prefix frontend` green (4.56s);
  `frontend/dist/assets/index-CmxIySwW.js` contains
  `Advanced options: separate docs repo` ×2, `Separate Docs Repository` ×4,
  `Docs Repository URL` ×3, `Docs Repo Local Path` ×1, `max-h-[90vh]` ×1
  (gitignored — deploy rebuilds it).
- Live UI proof from THIS branch (vite dev serving branch source + stub API
  with a `docsRepo`-enabled project, headless Chromium @1280×720, script at
  `/tmp/verify-docsrepo-ui.mjs`): **11/11 DOM assertions pass**, including
  "Create dialog renders the docs URL field without clicking the toggle" and
  the Files & Repos status line naming `demo-kainbain-docs.git`.
- Screenshots refreshed this attempt (PNG magic `8950 4e47 0d0a 1a0a`):
  - `stage4-proof-1-create-720.png` — Create dialog, Advanced open, docs
    URL field visible.
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
   old bundle.
