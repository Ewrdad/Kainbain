# Fix verification — "Cant see settings in the Ui" (stage 11, 2026-11-24)

## Branch freshness (observed this attempt)
- `git rev-list --left-right --count HEAD...origin/main` → `19  0` (19 ahead, 0 behind)
- `git merge-tree $(git merge-base HEAD origin/main) HEAD origin/main` → 0 conflict markers
- Merge commit `322aac0f` brought origin/main (683 task docs, 458 files) into this branch cleanly; no code overlap, no manual resolution needed
- `git ls-files -u` → 0 (no unmerged entries)

## Root cause (re-confirmed)
The docs-repo setting exists on this branch on all four surfaces but was absent/hidden on origin/main. After the merge this branch still carries:
1. **Expanded, named Advanced toggles** — `Header.jsx:316,327` `useState(true)`, `Header.jsx:849,997` "Advanced options: separate docs repo", scrollable dialogs `max-h-[90vh]` (`Header.jsx:764,895`), pinned header + scrolling form.
2. **Settings discoverability** — bordered *📚 Separate Docs Repository* block in Files & Repos (`PathsAndReposSection.jsx:204`, status + URL + local-path), `Separate Docs Repository: On/Off` row on Project landing tab (`ProjectBasicsSection.jsx:119,142`, with jump button), settings search `separate/docs/repo/private/stealth/remote` (`projectSettingsSearch.js:174,181`).

Merge was docs-only (683 task, no frontend/runner files overlapped) so UI and runner pair-preservation are byte-identical to prior stage proof.

## Evidence (observed this attempt)
- Frontend tests: `npm run test --prefix frontend` → **4994 passed (365 files)**
- Production bundle: `npm run build --prefix frontend` green (4.53s); `frontend/dist/assets/index-CmIipZ8T.js` contains:
  `Advanced options: separate docs repo` ×2, `Separate Docs Repository URL` ×2, `Docs Repository Local Path` ×2, `Separate Docs Repository:` ×1, `Configure in Files` ×1, `max-h-[90vh]` ×4, `separate docs repo` ×2
- Branch 0-behind/conflict-free vs origin/main verified via merge-tree (0 markers) and `ls-files -u` (0)

## Where to find it after merge+deploy
1. **Create**: Project dropdown → **+ New Project** → *Advanced options: separate docs repo* (already open) → `Docs Repository URL (optional)`.
2. **Import**: Project dropdown → **+ Add Existing Project…** → same Advanced section → URL + `Docs Repo Local Path (optional)`. Dialogs scroll if window short.
3. **Existing project**: **Settings** → **Project Settings** (landing) → `Separate Docs Repository: On/Off` row under Project Name with jump button; **Files & Repos** → *Separate Docs Repository* block (status + URL + local path). Search `separate docs repo` or `stealth` jumps to fields. Hard-refresh after deploy (`Ctrl/Cmd+Shift+R`) to drop old cached bundle; `deploy.sh --prod` rebuilds frontend/dist.

