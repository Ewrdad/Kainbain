# Fix verification — "Cant see settings in the Ui" (stage 19, 2026-11-24)

## Branch freshness (observed this attempt)
- `git fetch origin --quiet` → `git rev-list --left-right --count HEAD...origin/main` → `28  0` (28 ahead, 0 behind, no merge needed)
- `git merge-tree $(git merge-base HEAD origin/main) HEAD origin/main` → exit 0, 0 lines containing `<<<<<<` (clean)
- `git ls-files -u | wc -l` → 0 unmerged entries; `git status --porcelain` → only ignorable `dist/` build artefact, no pending conflicts

## Independent re-verification (not trusting prior screenshots)
Rebuilt the production bundle from this branch (`npm run build --prefix frontend` → green, ~5s, `index-DzqXB4Mj.js`) and checked the live artifact:
- `grep -c "Separate Docs Repository" frontend/dist/assets/index-*.js` → 2
- `grep -c "Advanced options: separate docs repo" frontend/dist/assets/index-*.js` → 1
- `grep -c "Docs Repository URL" frontend/dist/assets/index-*.js` → 2
- `grep -c "Docs Repo Local Path" frontend/dist/assets/index-*.js` → 1
- `grep -c "system-settings-docs-repo-pointer" frontend/dist/assets/index-*.js` → 1
- `grep -c "project-docs-repo-url-input" frontend/dist/assets/index-*.js` → 1

Code-level visibility contracts (grep-verified):
- `frontend/src/components/layout/Header.jsx:317,328` → `useState(true)` for both `createAdvancedOpen` and `adoptAdvancedOpen` (expanded by default, so `Docs Repository URL (optional)` + `Docs Repo Local Path (optional)` render without any click)
- `Header.jsx:855,1006` → toggle label `Advanced options: separate docs repo` (names the option when collapsed)
- `PathsAndReposSection.jsx:84` → `Separate Docs Repository` bordered block now FIRST in Files & Repos (top of tab, in first viewport — `project-docs-repo-url-input` at top after header)
- `SystemSettingsContent.jsx:196` → `data-testid="system-settings-docs-repo-pointer"` with `href="#/settings/files-repos"`
- `Modal.jsx:86` → `z-[55]` backdrop (above `z-50` bottom bar, so dialogs are not occluded)
- `Header.jsx:770,904` → `max-h-[90vh]` + `overflow-y-auto` scroll contracts (fields stay reachable at 720p)

## Gates (observed this attempt)
- Full frontend suite: **5010 passed** (365 files)
- Touched-area tests: `Header` + `ProjectSettings` + `PathsAndReposSection` + `SystemSettingsContent` — **169+ passed** (430 in filtered run incl. dependents)
- Docs-repo header tests: 7 filtered `docs repo` tests passed (expanded-by-default, forward URL/path, scroll contract, error passthrough)
- Branch: 28 ahead / 0 behind `origin/main`, merge-tree clean, 0 unmerged entries

## Diagnosis
The settings are present and fully visible on this branch — in the Create and Adopt dialogs (Advanced expanded by default, URL + local path), on the Project Settings landing (summary row with primary jump), in Files & Repos (first block), and pointed to from System Settings. The only build that lacks the visible-by-default behaviour is the deployed app on `main`, where `createAdvancedOpen`/`adoptAdvancedOpen` default to `false` (collapsed) — verified by diff: this branch has `useState(true)` plus local-path on Create, `max-h-[90vh]` scroll contract, and `z-[55]` modal fix, all absent on `main`. That is expected: this task branch (28 ahead) has never been merged. To see the settings: merge this branch to `main`, deploy, then hard-refresh (`Ctrl/Cmd+Shift+R`) to drop the old bundle. No UI code change was needed — the stage-16 fix set was re-verified live-complete on a fresh build.
