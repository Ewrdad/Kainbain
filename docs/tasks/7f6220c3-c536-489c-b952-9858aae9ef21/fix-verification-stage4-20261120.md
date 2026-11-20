# Fix verification — "Cant see settings in the Ui" (stage 4, 2026-11-20)

## Root cause (confirmed by bundle forensics this attempt)

The instance the human checks (`http://192.168.1.206:3100`, bundle
`/assets/index-Ci5jdoJ7.js`, fetched live this attempt) runs a build from
before this branch's visibility fixes:

- It contains the bare label `Advanced options` ×2 (Create + Adopt) with the
  body rendered only under `k && (<div …>` — i.e. **closed by default**, no
  naming of the option — and **zero** occurrences of
  `Advanced options: separate docs repo` (grep count 0).
- It does contain the Settings → Files & Repos docs-repo input, but the
  Create/Import path — the one the task text calls "allowed from the
  default" — shows no trace of the setting until the user guesses to expand
  a generic "Advanced options".

Current branch source fixes all three defects (all verified in source this
attempt, not just by tests):

- `frontend/src/components/layout/Header.jsx:316,327` —
  `useState(true)` for both `createAdvancedOpen`/`adoptAdvancedOpen`:
  Advanced is **expanded by default**; the toggle is named
  "Advanced options: separate docs repo" (`Header.jsx:849,997`) so it stays
  findable even if collapsed.
- `Header.jsx:764,785,895,916` — dialog `max-h-[90vh]` + pinned header +
  scrolling form (the `SystemGuideModal` pattern): the docs field and the
  Create/Add buttons stay reachable on short viewports.
- `frontend/src/components/settings/PathsAndReposSection.jsx:202` — bordered
  "📚 Separate Docs Repository" block (heading + Enabled/Disabled status +
  URL + local-path fields) in Settings → Files & Repos; the Project tab
  carries the `Separate Docs Repository: On/Off` summary row with a
  "Manage in Files & Repos" jump (`ProjectBasicsSection.jsx:349`); the
  settings search index covers `separate/docs/repo/private/stealth/remote`
  (`projectSettingsSearch.js:174,181`).

No further source change was needed: the defect was deployment age, not
code. This stage therefore re-proves visibility from current source and
confirms the branch is merge-ready; the setting becomes visible in
`192.168.1.206:3100` when the engine merges this branch and runs
`deploy.sh --prod` (the backend host is a different machine,
`192.168.1.206` ≠ this runner's `192.168.1.172`, so there is no
in-worktree way to push it there).

## This attempt's evidence (all observed, not assumed)

- Frontend tests (touched area): `npx vitest run Header / ProjectSettings /
  PathsAndReposSection / ProjectBasicsSection / projectSettingsSearch` —
  **159/159 pass**.
- Fresh production bundle: `npx vite build` green (4.35s); the new
  `frontend/dist` bundle contains `Advanced options: separate docs repo`,
  `Separate Docs Repository URL`, `Docs Repo Local Path`,
  `Separate Docs Repository:`, `Configure in Files & Repos`, and
  `max-h-[90vh]` (each ≥1 file in `dist/assets/`). `frontend/dist` is
  gitignored — deploy rebuilds it.
- Live UI proof from THIS branch (vite dev serving branch source + stub API
  with a `docsRepo`-enabled project, headless Chromium @1280×720 —
  realistic laptop viewport, script at `/tmp/verify-docsrepo-ui.mjs`):
  **11/11 DOM assertions pass**, including "Create dialog renders the docs
  URL field without clicking the toggle" and "field inside the 720px
  viewport" (y=455).
- Screenshots (PNG magic + `file` verified, `check:binaries` and
  `check:proof-hygiene` green):
  - `stage4-proof-1-create-720.png` — Create dialog, Advanced open, docs
    URL field + explainer visible, buttons reachable.
  - `stage4-proof-2-adopt-720-scrolled.png` — Add Existing dialog,
    scrolled form (scroll=697 > client=553), URL + local-path fields.
  - `stage4-proof-3-settings-files-repos-720.png` — Files & Repos,
    "Enabled … demo-kainbain-docs.git" status + both fields.
  - `stage4-proof-4-settings-project-jump.png` — Project tab `ON` summary
    + jump lands on the Files & Repos fields.
  - `stage4-proof-5-settings-search.png` — search `stealth` → entry jump.
- Branch freshness (re-fetched `origin` this attempt): **0 behind / 8
  ahead** of `origin/main`; `git merge-tree --write-tree HEAD origin/main`
  exits 0 with **zero conflict markers**. Working tree carries only this
  report + the 5 proof screenshots (the `/tmp` script is not part of the
  deliverable).

## Where to find it after merge + deploy

1. Create: Project dropdown → **+ New Project** → *Advanced options:
   separate docs repo* (already open) → `Docs Repository URL (optional)`.
   Collapse it only if you want it out of the way.
2. Import: Project dropdown → **+ Add Existing Project…** → same Advanced
   section → URL + `Docs Repo Local Path (optional)`. Both dialogs scroll
   if the window is short.
3. Existing project: **Settings** tab → **Files & Repos** → *📚 Separate
   Docs Repository* block (status line + URL + local path). The **Project**
   tab shows the `Separate Docs Repository: On/Off` row with a jump
   button; typing `separate docs repo` (or `stealth`) in settings search
   goes straight to the fields.
