# Fix verification — "Cant see settings in the Ui" (2026-11-20)

## Root cause

The branch code already shows the docs-repo option on all three surfaces
(Advanced expanded by default in Create/Import since e049da74, bordered
*Separate Docs Repository* block in Settings → Files & Repos, On/Off summary
row on the Project tab, settings-search entries). The deployed UI the human
checked runs a build that predates this branch (and this worktree's
`frontend/dist/` was stale: built 20:44, source changed 21:07), so the
setting was absent from that instance. No UI source change was needed —
this attempt rebuilt the bundle, re-proved visibility against this branch,
and confirmed the branch is merge-ready.

## What this attempt did

- Fresh production build: `npm run build --prefix frontend` green; the new
  `frontend/dist` bundle contains the settings (`Separate Docs Repository`
  ×3 occurrences). `frontend/dist` is gitignored — deploy/publish rebuilds
  it via the Dockerfile, so no dist commit is needed.
- Frontend tests for every touched area: 194/194 pass (Header,
  ProjectSettings, PathsAndReposSection, ProjectBasicsSection,
  projectSettingsSearch, serverErrorMessage, SkillsSection, useProjects).
- Live visibility proof from THIS branch: scratch vite dev server on
  :5299 (same-origin API base, minimal `/projects` fixture with a
  `docsRepo` URL), headless Chromium (Playwright) asserted each surface in
  the DOM and captured the five screenshots below. Scratch server stopped
  afterwards (port verified free).
- Branch state: up to date with `origin/main` (0 behind), `git merge-tree`
  shows zero conflict markers.

## Where to find it after merge + deploy

1. Create: Project dropdown → **+ New Project** → *Advanced options:
   separate docs repo* (already open) → `Docs Repository URL (optional)`.
2. Import: Project dropdown → **+ Add Existing Project…** → same Advanced
   section → URL + `Docs Repo Local Path (optional)`.
3. Existing project: **Settings** tab (⚙️) → **Files & Repos** →
   *📚 Separate Docs Repository* block (status line + URL + local path);
   the **Project** tab shows the `Separate Docs Repository: On/Off` row
   with a jump button; typing `separate docs repo` in the settings search
   goes straight to the fields.

## Proof (this attempt)

- `stage2-proof-1-settings-files-repos.png` — Settings → Files & Repos,
  *Enabled* status naming the fixture URL, URL + local-path fields.
- `stage2-proof-2-settings-project-tab.png` — Project tab, `Separate Docs
  Repository: On` + `MANAGE IN FILES & REPOS` jump.
- `stage2-proof-3-create-advanced.png` — Create New Project dialog,
  Advanced expanded, docs-repo URL field visible.
- `stage2-proof-4-adopt-advanced.png` — Add Existing Project dialog,
  Advanced expanded, URL + local-path fields visible.
- `stage2-proof-5-settings-search.png` — settings search for
  `separate docs repo` names the setting.

All five: PNG magic verified, `check:binaries` + `check:proof-hygiene`
green. (Previous attempt's `fix-verify-*.png` and the review's
`review-*.png` remain under this folder for history.)
