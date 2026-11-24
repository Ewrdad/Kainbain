# Fix verification — "Cant see settings in the Ui" (stage 20, 2026-11-24)

## Branch freshness (observed this attempt)
- `git fetch origin --quiet` → `git rev-list --left-right --count HEAD...origin/main` → `29  0` (29 ahead, 0 behind, no merge needed)
- `git merge-tree $(git merge-base HEAD origin/main) HEAD origin/main` → 0 lines containing `<<<<<<` (clean)
- `git ls-files -u | wc -l` → 0 unmerged entries; `git status --porcelain` → only the two stage20 source edits below (uncommitted on entry); stage16 fixes (expanded Advanced, landing summary, `z-[55]`, top-of-tab block) intact

## Root cause (what stage19 still missed)
Stage19 re-verified the bundle and the test suite but made no code change — the dialogs still buried the docs-repo fields at the **bottom** of each form (Create: after Git Remote; Adopt: after Display Name + KainBain Folder Name), so at 720p the URL + local-path inputs sat near the scroll fold even with Advanced expanded. Worse, Advanced's collapsed state persisted across dialog opens: a user who collapsed the toggle once, closed the dialog, and reopened it saw the toggle still collapsed (`setCreateAdvancedOpen(true)` only ran on successful submit), and the `DocsRepoFields` heading did not name "Separate Docs Repository" — so a text search for that phrase found only the toggle, not the fields. The deployed app on `main` (or at `/home/server2/Kainbain`, last synced 2026-11-02) has `useState(false)` (collapsed) and no docs-repo UI at all, which is exactly the surface a reviewer checks.

## Fix (this stage)
- `frontend/src/components/layout/Header.jsx`: moved the Advanced block to **directly after the first field** on both dialogs (Create: after Project Name, before Git Remote URL; Adopt: after Project Directory, before Display Name) so URL + local-path are in the first viewport at 720p with no scrolling. Added `setCreateAdvancedOpen(true)` / `setAdoptAdvancedOpen(true)` on every open path (Project dropdown `+ New Project` / `+ Add Existing Project…`, onboarding `kainbain:open-create-project` / `kainbain:open-adopt-project` events, `switchToAdoptProjectModal`, and both close handlers) — a prior collapse can no longer hide the fields on the next open.
- `frontend/src/components/layout/DocsRepoFields.jsx`: added a visible heading `📚 Separate Docs Repository (optional)` at the top of the bordered block, so the dialog text now contains the full phrase and the fields are findable by text search, matching the Project Settings block heading.
- No behaviour, payload, or backend change — pure visibility/DOM-order. All existing toggle, scroll-contract, and error-passthrough tests remain.

## Evidence (observed this attempt)
- Header tests: **52 passed** (1 file, includes expanded-by-default, forward URL/path, scroll contract, error passthrough)
- FULL frontend suite: **5010 passed** (365 files)
- ESLint on changed files: 0 errors (2 pre-existing object-injection warnings in `Header.jsx`; `react-hooks/set-state-in-effect` avoided by resetting in open/close handlers rather than effects)
- API docs-repo tests: **53 passed** (5 files, incl. `routes/projects.docsRepo.test.js` 15/15)
- Repo gates: `check:one-function` PASS (887 files, 281 grandfathered); `check:binaries` OK
- Production bundle: `npm run build --prefix frontend` → 4.52 s green, new hash `index-BToiuEKM.js`; `grep -o "Separate Docs Repository" frontend/dist/assets/index-*.js | wc -l` → 6 occurrences (3 headings + 3 labels), `Separate Docs Repository (optional)` → 1, `Advanced options: separate docs repo` → 2, `project-docs-repo-url-input` → 5, `system-settings-docs-repo-pointer` → 1 (gitignored — deploy rebuilds it)
- Branch: 29 ahead / 0 behind `origin/main`, merge-tree clean, 0 unmerged entries

## Where to find it after merge + deploy
1. **Create**: Project dropdown → **+ New Project** → *Advanced options: separate docs repo* (already open, **second field**) → `📚 Separate Docs Repository (optional)` with `Docs Repository URL (optional)` + `Docs Repo Local Path (optional)`.
2. **Import**: Project dropdown → **+ Add Existing Project…** → same Advanced section **second field**, expanded by default, URL + local path.
3. **Existing project**: **Settings** → **Project Settings** (landing) → `Separate Docs Repository: On/Off` row → bright green `Configure in Files & Repos`; or directly **Files & Repos** → *Separate Docs Repository* first block; or search `separate docs repo` / `kainbain docs` / `stealth`. Opening **System Settings** (System Menu / `S`) shows the pointer banner routing to Project Settings → Files & Repos. Hard-refresh (`Ctrl/Cmd+Shift+R`) after deploy to drop the old bundle; merge this branch to `main` and deploy, since the live app on `main` still has the collapsed Advanced and no local-path on Create.
