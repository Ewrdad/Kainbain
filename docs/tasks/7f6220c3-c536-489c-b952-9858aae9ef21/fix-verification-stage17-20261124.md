# Fix verification — "Cant see settings in the Ui" (stage 17, 2026-11-24)

## Branch freshness (observed this attempt)
- `git fetch origin` → `git rev-list --left-right --count HEAD...origin/main` → `26  0` (26 ahead, 0 behind, no merge needed)
- `git merge-tree $(git merge-base HEAD origin/main) HEAD origin/main` → empty (clean)
- `git ls-files -u` → 0 unmerged entries; `git status --porcelain` → clean on entry

## Independent re-verification (not trusting prior screenshots)
Rebuilt the production bundle from this branch (`VITE_API_BASE= VITE_WS_URL= npm run build --prefix frontend` → green, 4.43 s, new hash `index-Bb_DJbAw.js`) and served it from an isolated scratch API (`PORT=3199`, `PROJECTS_ROOT`/`NOTES_SPACE_ROOT`/`KAINBAIN_PROJECTS_REGISTRY_FILE`/`HOME` all under `/tmp/kbverify*` — real engine state untouched; nothing was running on :3100, and the scratch server was stopped afterwards). Drove the real UI with headless Chromium (Playwright 1.64, `/tmp/kbverify/probe.mjs`, `/tmp/kbverify/e2e.mjs` — kept outside the repo):

- **Visibility probe — 18/18 pass**: Create dialog opens with Advanced expanded by default (`aria-expanded=true`); `Docs Repository URL (optional)` and `Docs Repo Local Path (optional)` visible **without any click** (local-path at y=564, inside the 720p viewport); Adopt dialog identical; Project Settings landing shows `SEPARATE DOCS REPOSITORY: OFF`; Files & Repos shows the `Separate Docs Repository` block in the first viewport (URL field y=395); System Settings shows the pointer banner; 800x600 viewport still reaches both fields.
- **End-to-end probe — 8/8 pass**: adopted a real git checkout via the Add Existing Project dialog with the docs-repo URL set to a local bare repo. Backend created the project with `docsRepo: {branchMode: "synced", url, localPath}`; the adjacent checkout `<project>-kainbain-docs` was provisioned with its remote pointing at the docs repo; the main repo contains **no** `.kainbain/` or `docs/tasks` traces; Files & Repos then shows `Enabled` with URL + local path prefilled; the landing summary shows `On`.
- Screenshots visually confirmed by reading the pixels (not just DOM asserts): `stage17-proof-1-create.png`, `stage17-proof-2-adopt.png`, `stage17-proof-3-files-repos.png`, `stage17-proof-4-landing.png`.

## Diagnosis
The settings are present and fully visible on this branch — in the Create and Adopt dialogs (Advanced expanded by default, URL + local path), on the Project Settings landing (summary row), in Files & Repos (first block), and pointed to from System Settings. The only build that lacks them is the deployed app on `main`, where `docsRepo` does not exist at all (verified: zero `docsRepo` matches in `/home/server2/Kainbain/frontend/src`). That is expected: this task branch (26 ahead) has never been merged. **To see the settings: merge this branch to `main`, deploy, then hard-refresh (`Ctrl/Cmd+Shift+R`) to drop the old bundle.** No UI code change was needed — the stage-16 fix set was verified live-complete.

## Gates (observed this attempt)
- Full frontend suite: **5010 passed** (365 files)
- `check:one-function` PASS (887 files); `check:proof-hygiene` OK (only pre-existing f42d4ab0 baselines)
- Branch: 26 ahead / 0 behind `origin/main`, merge-tree clean, no unmerged entries
