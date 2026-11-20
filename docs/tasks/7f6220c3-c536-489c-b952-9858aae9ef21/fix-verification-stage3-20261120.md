# Fix verification — "Cant see settings in the Ui" (stage 3, 2026-11-20)

## Root cause (this attempt)

The setting already existed on all surfaces (Create/Import Advanced expanded
by default, Settings → Files & Repos bordered block, Project-tab summary row,
settings search). The reported invisibility had a concrete defect behind it:
neither the **Create New Project** nor the **Add Existing Project** dialog
capped its height or scrolled. Both were `flex flex-col overflow-hidden` with
no `max-h` and a plain non-scrolling `<form>`. With Advanced expanded by
default, the Create dialog is ~640px tall and the Adopt dialog ~750px: on
everyday shorter viewports (laptop ~700px, smaller windows, mobile) the dialog
is taller than the window and its bottom — exactly the docs-repo field and the
Create/Add Project buttons — is clipped with no way to reach it. The stage-2
proof shots passed only because they used a tall 1440x900 viewport.

## Fix

Followed the repo modal convention (`SystemGuideModal`, `UiPreferencesModal`):
dialog `max-h-[90vh]`, header `shrink-0` (pinned), form
`flex-1 min-h-0 overflow-y-auto`. Two files changed:

- `frontend/src/components/layout/Header.jsx` — both dialogs (Create + Adopt).
- `frontend/src/components/layout/Header.test.jsx` — 2 new scroll-contract
  tests (dialog caps at `max-h-[90vh]`, form scrolls, docs fields present).

## Evidence

- Tests: touched-area 159/159; full frontend suite 4976/4976 (364 files);
  `check:duplicate-identifiers` OK; ESLint 0 errors on both files; frontend
  production build green (bundle contains `max-h-[90vh]`).
- Live proof from this branch (scratch vite on :5173 + stubbed `:3100`
  `/projects` Demo fixture, headless Chromium; servers stopped afterwards):
  - `stage3-proof-1-create-720.png` — Create @1280x720: full dialog visible,
    dialog 595.5px tall, no scroll needed.
  - `stage3-proof-2-adopt-720-scrolled.png` — Adopt @720: dialog capped 648px,
    form scrollable (697 > 553), scrolled to show docs URL + local path +
    buttons.
  - `stage3-proof-3-create-600-scrolled.png` — Create @600: capped 540px,
    scrollable (501 > 445), scrolled to docs field + buttons.
  - `stage3-proof-4-settings-files-repos-720.png` — Settings → Files & Repos
    @720: *Separate Docs Repository* block (Enabled) + URL field in view.
  - All four: `8950 4e47 0d0a 1a0a` magic + `PNG image data` via `file`;
    `npm run check:binaries` and `npm run check:proof-hygiene` green.

## Branch state (verified fresh this attempt)

- `git fetch origin`: merge-base `6e1f85a1` == `origin/main` → HEAD contains
  main, **0 behind / 7 ahead**; `git merge-tree --write-tree HEAD origin/main`
  clean (single tree, exit 0, no conflict markers). No merge/push performed
  here — the engine owns the branch lifecycle (`docs/agent-docs/GitGuidance.md`);
  working tree carries only this attempt's Header fix, its tests, and the 4
  proof screenshots above.

## Where to find it after deploy

1. Create: Project dropdown → **+ New Project** → *Advanced options: separate
   docs repo* (already open) → `Docs Repository URL (optional)`; the dialog
   scrolls if your window is short.
2. Import: Project dropdown → **+ Add Existing Project…** → same Advanced
   section → URL + `Docs Repo Local Path (optional)`.
3. Existing project: **Settings** tab → **Files & Repos** → *Separate Docs
   Repository* block; the **Project** tab shows the `On/Off` row with a
   jump button; search `separate docs repo` jumps straight to the fields.
