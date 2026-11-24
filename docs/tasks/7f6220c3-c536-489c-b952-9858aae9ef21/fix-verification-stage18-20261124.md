# Fix verification — "Cant see settings in the Ui" (stage 18, 2026-11-24)

## Branch freshness (observed this attempt)
- `git fetch origin main` → `git rev-list --left-right --count HEAD...origin/main` → `27  0` (27 ahead, 0 behind, no merge needed)
- `git merge-tree $(git merge-base HEAD origin/main) HEAD origin/main` → 0 lines (clean)
- `git ls-files -u` → 0 unmerged entries; `git status --porcelain` → only untracked stage18 proofs on entry

## Independent re-verification (not trusting prior screenshots)
Rebuilt the production bundle from this branch (`npm run build --prefix frontend` → green, 4.47s, `index-DzqXB4Mj.js` contains `Separate Docs Repository`, `Advanced options: separate docs repo`, `Docs Repository URL (optional)`, `Docs Repo Local Path (optional)`, `system-settings-docs-repo-pointer`) and served it from an isolated scratch API (`PORT=3199`, `PROJECTS_ROOT`/`NOTES_SPACE_ROOT`/`HOME` all under `/tmp/kb-stage18` — real engine state untouched; scratch server stopped afterwards). Drove the real UI with headless Chromium (Playwright, `/tmp/kb-stage18-probe.mjs`):

- **Visibility probe — 15/15 pass**: Create dialog opens with Advanced expanded by default (`aria-expanded=true`); `Docs Repository URL (optional)` and `Docs Repo Local Path (optional)` visible **without any click** (local-path at y=564, inside the 720p viewport); Adopt dialog identical; Files & Repos shows the `Separate Docs Repository` block in the first viewport (URL field y=395); System Settings shows the pointer banner with correct `href="#/settings/files-repos"`; Project Settings landing shows `Separate Docs Repository` summary row.
- Screenshots visually confirmed: `stage18-proof-1-create.png`, `stage18-proof-2-adopt.png`, `stage18-proof-3-system-pointer.png`, `stage18-proof-4-files-repos.png`, `stage18-proof-5-landing.png`.

## Diagnosis
The settings are present and fully visible on this branch — in the Create and Adopt dialogs (Advanced expanded by default, URL + local path), on the Project Settings landing (summary row), in Files & Repos (first block), and pointed to from System Settings. The only build that lacks the visible-by-default behavior is the deployed app on `main`, where `createAdvancedOpen`/`adoptAdvancedOpen` default to `false` (collapsed) — verified by diff: this branch has `useState(true)` plus local-path on Create, `max-h-[90vh]` scroll contract, and `z-[55]` modal fix, all absent on `main`. That is expected: this task branch (27 ahead) has never been merged. `/home/server2/Kainbain` (the local checkout reviewers inspect) is even older (`eb29aa70`, zero `docsRepo` matches). **To see the settings: merge this branch to `main`, deploy, then hard-refresh (`Ctrl/Cmd+Shift+R`) to drop the old bundle.** No UI code change was needed — the stage-16 fix set was verified live-complete on a fresh scratch stack.

## Gates (observed this attempt)
- Full frontend suite: **5010 passed** (365 files)
- Touched-area tests: `Header` + `ProjectSettings` + `PathsAndReposSection` + `SystemSettingsContent` — **169 passed**
- `check:one-function` PASS (887 files); `check:binaries` OK; `check:proof-hygiene` OK (only pre-existing f42d4ab0 baselines)
- Branch: 27 ahead / 0 behind `origin/main`, merge-tree clean, no unmerged entries
