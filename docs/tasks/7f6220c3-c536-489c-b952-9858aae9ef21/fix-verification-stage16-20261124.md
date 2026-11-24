# Fix verification — "Cant see settings in the Ui" (stage 16, 2026-11-24)

## Branch freshness (observed this attempt)
- `git fetch origin` → `git rev-list --left-right --count HEAD...origin/main` → `25  0` (25 ahead, 0 behind, no merge needed)
- `git merge-tree $(git merge-base HEAD origin/main) HEAD origin/main` → 0 lines (clean)
- `git ls-files -u` → 0 (no unmerged entries)
- `git status` on entry → only the stage16 source edits below (uncommitted on entry); stage15 fixes (expanded Advanced, landing summary, `z-[55]`, top-of-tab block, `kainbain` search keywords) intact

## Root cause (what stage15 still missed)
Stage15 proved the docs-repo fields visible in all three shipped surfaces — but three remaining surfaces still hid the setting from a fresh visitor, verified live against this branch with a scratch API+vite (Playwright, headless Chromium):
- **Create dialog had no local-path field at all** (`getByLabel('Docs Repo Local Path (optional)').count()` → 0). A user creating a NEW project could not see (or set) the docs checkout path; only the Adopt dialog offered it. The backend `POST /projects` already accepts `docsRepo.localPath`, so this was a pure frontend omission.
- **System Settings (the `S` key / System Menu popout) mentioned "docs repo" zero times** (`/docs repo/i.test(body)` → false). The docs-repo setting is per-project (Project Settings → Files & Repos), so a visitor who opens System Settings and hunts there leaves empty-handed.
- **One-click adopt ("Found on disk — adopt in one click") registered with no docs repo and no mention of one.** It bypasses the Adopt Existing… dialog — the only import path that offers the docs-repo option — with no hint that a private-docs import must go through the dialog instead.

## Fix (this stage)
- `frontend/src/components/layout/Header.jsx` + `frontend/src/components/layout/DocsRepoFields.jsx`: Create New Project now offers **Docs Repo Local Path** alongside the URL (same `showLocalPath` field as Adopt), with state, payload forwarding (`docsRepo: {url, localPath?}`), and reset on success. JSDoc updated (both dialogs, not adopt-only).
- `frontend/src/components/settings/SystemSettingsContent.jsx`: persistent pointer banner at the top of the scroll pane (visible on every System Settings tab) — "Looking for the Separate Docs Repository setting? It is per-project … open Project Settings → Files & Repos" — linking to `#/settings/files-repos`. Placed inside the scroll pane to preserve the shrink-0 layout invariant (header/tabbar/footer never shrink).
- `frontend/src/components/onboarding/OnboardingEmptyState.jsx`: one-click adopt list now notes "One-click adopt registers without a separate docs repo. To keep KainBain docs/state in a private repo instead, use Adopt Existing… above and set the docs repository there."
- `site-docs/separate-docs-repo.md`: guide updated to match (both dialogs offer URL + local path; one-click adopt has no docs repo; System Settings pointer).
- Tests: `Header.test.jsx` — Create shows local path by default + new forwarding test (`localPath: '/srv/kb/created'`); `OnboardingEmptyState.test.jsx` — hint asserts `Adopt Existing`; `SystemSettingsContent.test.jsx` — pointer visible on landing/Storage/About with correct `href`.

## Evidence (observed this attempt)
- Touched-area frontend tests: `Header` + `OnboardingEmptyState` + `SystemSettingsContent` — **89 passed** (3 files)
- FULL frontend suite: **5010 passed** (365 files, `npm test` incl. duplicate-identifier check; stage15 was 5008; +2 new tests)
- ESLint on changed files: 0 errors (2 pre-existing warnings in `Header.jsx`)
- FULL API suite: **7730 passed** (477 files; backend untouched)
- Repo gates: `check:one-function` PASS (887 files, 281 grandfathered); `check:binaries` OK; `check:proof-hygiene` OK (only recorded pre-existing baselines)
- Production bundle: `npm run build --prefix frontend` → 4.59 s green; `frontend/dist/assets/index-DzqXB4Mj.js` contains `Docs Repo Local Path (optional)`, `system-settings-docs-repo-pointer`, `onboarding-adopt-docs-hint`, `Separate Docs Repository` (gitignored — deploy rebuilds it)
- Live-DOM proofs from real scratch API+vite (Playwright, headless Chromium 1280×720, `/tmp/verify-stage16.mjs`): **5/5 visibility checks pass** — including the two probe FAILs from before the fix now passing:
  - Create dialog: URL visible, **local-path VISIBLE without click** (was count=0 pre-fix), inside viewport (y=564, scroll contract unchanged)
  - System Settings landing: **pointer visible** (was zero mentions pre-fix), link `href="#/settings/files-repos"`
  - Pre-fix vs post-fix probe (`/tmp/verify-stage16-probe.mjs`): `CREATE local-path present: 0→1`, `SYSSETTINGS mentions docs repo: false→true`
  - Files & Repos block still first-viewport at 1280×720 / 1024×600 / 800×600 (y=395–433, no scroll) — unchanged from stage15
- Not live-proved (unit-test evidence instead): Create submit payload (`Header.test.jsx` forwarding test, mocked `createProject`) — a live submit with a fake remote is expected to fail provisioning, so visibility proofs intentionally do not submit; onboarding hint (needs an on-disk adoptable checkout for live; unit test asserts it)

## Screenshots (scratch stack, this branch, post-fix)
- `stage16-proof-1-create-localpath.png` — Create dialog, Advanced open by default, `Docs Repository URL (optional)` + `Docs Repo Local Path (optional)` fully visible without click at 720p
- `stage16-proof-2-system-pointer.png` — System Settings (Runners landing): pointer banner under the tab bar — "Looking for the Separate Docs Repository setting? It is per-project … open Project Settings → Files & Repos"

## Where to find it after merge + deploy
1. **Create**: Project dropdown → **+ New Project** → *Advanced options: separate docs repo* (already open) → `Docs Repository URL (optional)` + `Docs Repo Local Path (optional)` (new this stage).
2. **Import**: Project dropdown → **+ Add Existing Project…** → same Advanced section → URL + local path. First-run one-click adopt (Found on disk) now notes that it registers without a docs repo and points to Adopt Existing… for a private-docs import.
3. **Existing project**: **Settings** → **Project Settings** (landing) → `Separate Docs Repository: On/Off` row → bright green `Configure in Files & Repos`; or directly **Files & Repos** → *Separate Docs Repository* first block; or search `separate docs repo` / `kainbain docs` / `stealth`. Opening **System Settings** (System Menu / `S`) shows the pointer banner routing to Project Settings → Files & Repos. Hard-refresh (`Ctrl/Cmd+Shift+R`) after deploy to drop the old bundle.
