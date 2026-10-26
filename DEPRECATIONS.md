# DEPRECATIONS.md — deprecation & end-of-life inventory

Goal: zero deprecation warnings in the deploy/build log, no end-of-life or
deprecated dependency without a dated, documented exception, and gates so new
ones fail loudly instead of accumulating.

- Build gate: `frontend/scripts/check-no-deprecations.js` runs on every
  `npm run build --prefix frontend` (deploy.sh, Docker build, CI). Exceptions:
  `frontend/scripts/deprecation-allowlist.json` (currently empty).
- Audit gate: `scripts/check-dep-audit.mjs` fails on new high/critical
  `npm audit` findings; exceptions: `scripts/dep-audit-allowlist.json`.
- Health report: `npm run audit:deprecations` (outdated + audit + depcheck).
- Pre-change baselines (2026-10-05):
  `docs/tasks/b9885cf9-4201-4876-9613-b4f5fad63c47/baselines/`
  (`outdated-before.txt`, `*-audit-before.json`, `depcheck-before.txt`,
  `frontend-build-before.log`, `sbom-before.json`).

Severity: **build-flagged** (in the deploy log) · **EOL** (unsupported,
security-relevant) · **major-behind** (a newer major exists) · **unused**
(dead weight) · **hygiene** (version drift, config cruft).

## Spike outcomes (decide once, recorded here)

1. **Vite 8 + React plugin (Step 1).** Winner: (a) `@vitejs/plugin-react`
   4.x → 6.x — the three screenshot warnings are gone and the production build
   is clean. Rejected: (b) `@vitejs/plugin-react-oxc` 0.4.3 — its peer range
   is `vite ^6.3.0 || ^7.0.0`, incompatible with this repo's Vite 8.
2. **Node alignment (Step 3).** Decision: run **Node 24** everywhere
   (`.nvmrc`/`.node-version` already `24`; `Dockerfile` moved
   `node:22-alpine` → `node:24-alpine`); `engines` floor raised
   `>=20.11.0` → `^20.19.0 || >=22.12.0` to match Vite 8's own requirement
   (the strictest toolchain floor). No GitHub/lab CI config exists — the gate
   is `npm test` (`scripts/run-tests.mjs`), which needs no Node pin.
3. **`legacy-peer-deps` (Step 6).** KEPT, with an updated comment. Blocker:
   `eslint-plugin-jsx-a11y@6.10.2` (latest; peers `eslint ^3..^9`) and
   `eslint-plugin-react@7.37.5` (latest; peers `eslint <=9.7`) do not accept
   the installed ESLint 10 — no newer plugin exists. Downgrading ESLint would
   move the wrong way, so legacy peer resolution stays until the plugins ship
   ESLint 10 peer support.
4. **`pi-coding-agent` pin (Step 10).** Was KEPT at `0.86.0` as a deliberate
   security pin. Superseded 2026-10-25: upgraded to `1.2.0` (1.1.0 was the first pi release
   without an npm-shrinkwrap.json pinning its nested copies) so the
   `overrides` floors in `api/package.json` can move its nested
   brace-expansion / undici copies to the patched versions — see
   `api/dependencySecurityFloor.test.js` and rows 7 / 19.

## Inventory

| # | Item | Severity | Owner file(s) | Action | Status |
|---|------|----------|---------------|--------|--------|
| 1 | `esbuild` option deprecated (vite:react-babel) | build-flagged | `frontend/package.json` (+lock) | plugin-react 4→6 (done pre-stage; verified zero warnings) | done 2026-10-05 |
| 2 | `optimizeDeps.rollupOptions` deprecated | build-flagged | same | same | done 2026-10-05 |
| 3 | `recommend switching to @vitejs/plugin-react-oxc` | build-flagged | same | rejected (peers vite ≤7); plugin-react 6 is warning-free | done 2026-10-05 |
| 4 | vite 8.2.2 → 8.3.2 | EOL-adjacent (patch) | `frontend/package.json` | `npm update` | done 2026-10-05 (8.3.2 installed, gated build green) |
| 5 | fastify 5.12.3 → 5.12.5 (+ `@fastify/*` patches) | EOL (GHSA-4mh8-r7rc-xpvc) | `api/package.json` | `npm update` | done 2026-10-05 (5.12.5 installed, api suite green) |
| 6 | brace-expansion → 5.0.12 (frontend+api top level) | EOL (DoS set) | lockfiles | `npm update` | done 2026-10-05 (5.0.12 installed; nested pi copy stays — row 7) |
| 7 | brace-expansion 5.0.9 nested under pi shrinkwrap (api) | EOL | `api/package-lock.json` | cannot move; allowlisted #1240103/#1240107/#1240111 to 2027-01-05, revisit on pi 1.x | done 2026-10-25 (pi 1.2.0 drops the shrinkwrap; nested copy now 5.0.12 via overrides, allowlist entries removed) |
| 8 | braces → tailwindcss 4 (frontend) + depcheck chain (root) | EOL (#1240992) | `frontend/package.json`, root `package.json` | tailwind 3→4 dwarfs this task (config-into-CSS migration); allowlisted to 2027-01-05; root chain shares the advisory | deferred |
| 9 | autoprefixer/eslint/globals/postcss/prettier/eslint-plugin-security/uuid/@playwright/test patches | hygiene | all manifests | `npm update` + canary manifest align `^1.40.0` → `^1.62.1` | done 2026-10-05 (`npm outdated` clean except dated-deferred majors) |
| 10 | fast-uri moderate (api, transitive) | hygiene | `api/package-lock.json` | re-check after fastify 5.12.5; allowlist only if unmovable | done 2026-10-05 (gone: api audit shows 0 moderate) |
| 11 | eslint-plugin-react 15-rule flat-config filter | hygiene | `frontend/eslint.config.js` | retest; keep if still crashing (plugin targets eslint ≤9) | done 2026-10-05 (still crashes on ESLint 10.12.0; kept with dated comment) |
| 12 | eslint-plugin-n 17 → 18 | major-behind | `api/package.json` | attempt; keep if `lint:api` green | done 2026-10-05 (18.4.1, lint exit 0) |
| 13 | @testing-library/react 14 → 16 (+ jest-dom 6 → 7) | major-behind | `frontend/package.json` | attempt (peers allow React 18); keep if suite green | done 2026-10-05 (TLR 16.3.3 + jest-dom 7.0.1; direct `@testing-library/dom` pin added — jest-dom 7 peer, not auto-installed under legacy-peer-deps; 2185 frontend tests green) |
| 14 | jsdom 22 → 30 | major-behind | `frontend/package.json` | attempt; keep if suite green | done 2026-10-05 (30.1.2, frontend suite green) |
| 15 | vitest 4 → 5 (+ coverage-v8) | major-behind | `frontend,api/package.json` | attempt (peers vite 8 ✓, engines node ≥22.12 ✓); keep if suites green | done 2026-10-05 (5.0.3 both suites green: 3224 api + 2185 frontend) |
| 16 | React 18 → 19 | major-behind | `frontend/package.json` | DEFER: React 18 still supported; needs TLR 16 + app-code migration; dated exception to 2027-01-05 | deferred |
| 17 | react-router 7 → 8 | major-behind | `frontend/package.json` | DEFER: v7 supported; major with app-code migration; dated exception to 2027-01-05 | deferred |
| 18 | tailwindcss 3 → 4 | major-behind | `frontend/package.json`, `tailwind.config.js`, `postcss.config.cjs` | DEFER with #1240992 exception (row 8); needs codemod + visual regression | deferred |
| 19 | pi-coding-agent 0.86.0 → 1.0.2 | major-behind | `api/package.json` | DEFER: security pin (spike 4); revisit with SecObserve re-validation | done 2026-10-25 (upgraded to 1.2.0 for the SecObserve 2026-10-25 set: brace-expansion ≥ 5.0.12, undici ≥ 8.12.2, fast-uri ≥ 4.2.3/3.1.9, fastify ≥ 5.12.6; only the root export is used in-repo, and 1.2.0 is the first 1.x whose real SDK import works — 1.1.0 fails on a pi-codemode export) |
| 20 | Node drift (.nvmrc 24 vs Dockerfile 22 vs engines 20.11) | hygiene | `.nvmrc`, `.node-version`, `Dockerfile`, manifests, `tests/docker.test.mjs` | align to Node 24 + engines floor (spike 2) | done 2026-10-05 (`Dockerfile` → `node:24-alpine` both stages, `engines` → `^20.19.0 \|\| >=22.12.0` in all 4 manifests matching Vite 8, `.npmrc` blocker comment refreshed; no CI config exists) |
| 21 | vendored `opencode-ai-sdk-1.18.31.tgz` | hygiene | repo root, `api/package.json`, `Dockerfile`, `.dockerignore`, `FACTS.md` | refresh if a newer SDK is a drop-in (contract tests green), else justify | done 2026-10-05 (refreshed 1.18.31 → 1.18.34; 130/130 opencode harness tests green) |
| 22 | deprecated Node/React APIs in shipped src (`new Buffer`, `url.parse`, `substr`, `UNSAFE_*`, legacy lifecycles) | hygiene | n/a | regex scan 2026-10-05: none found | done 2026-10-05 |
| 23 | depcheck/knip unused deps | unused | all manifests | depcheck clean (api/frontend/root PASS pre-change); knip not installed — no action | done 2026-10-05 |
| 24 | monitor layout localStorage key `kainbain_observability_layout_v1` (type-keyed, one instance per type) | hygiene | `frontend/src/components/observability/ObservabilityDashboard.jsx` | superseded by instance-based `kainbain_observability_layout_v2`; v1 payloads migrate on load and the v1 key is removed after the first v2 write | done 2026-10-14 |
| 25 | command-derived deploy runtime in the generic pipeline (`running_deploy`, deploy entry markers, deploy lock deferral, deploy-gate failure diagnostics, `deployTimeoutMs`/`deployStallTimeoutMs`) | hygiene | `api/flow/*`, `api/config/schema.js`, `api/observability/alerts.js`, `api/projectStore.js`, `api/agentGuide.js`, `frontend/src/components/**`, `site-docs/pipeline-stages.md` | full removal: a deploy-command stage is an ordinary ci stage (same timeout/stall/status/heartbeat/failback); KainBain self-deploy continuity moved to `api/continuity/` behind `KAINBAIN_SELF_DEPLOY_CONTINUITY=1`; `type: deploy` remains a legacy alias folding to `ci`; persisted `deployTimeoutMs` still loads harmlessly but is ignored | done 2026-10-19 |

## Incidental fix (required for a green suite, 2026-10-05)

`api/agentRunner.js` `parseStageVerdict` now ignores verdict-looking lines
inside fenced code blocks. Every agent-stage prompt embeds the
`stage-verdict` skill, whose fenced examples end with a FAIL block — the
mock harness echoes the prompt, so the old parser read the example as a
real FAIL and `routes/tasks.test.js` ("restart exhausted attempt budgets")
failed on a pristine HEAD checkout too. The contract requires the real
block unfenced, so fenced matches are false positives by definition.
Covered by `api/agentRunner.test.js` ("ignores verdict blocks inside
fenced code blocks").

## Removed feature: `deploy` pipeline stage type + post-merge commands (2026-10-14)

The `deploy` stage type and composite "Merge and deploy" merge stages
(merge + post-merge command) are removed for observability: deploy
failures used to surface as "Post-merge command failed" on the merge
stage, mixed with genuine git failures. Now:

- A **deploy is a normal `ci` stage** whose command runs the deploy
  script (`./deploy.sh --prod`). The engine never branches on command
  text: a deploy-command stage is an ordinary `ci` stage with the same
  timeout, stall, status, heartbeat, and failback behaviour as any other
  `ci` stage. (The earlier command-derived deploy runtime — entry
  markers, `running_deploy`, restart reconciliation, deploy lock,
  deploy timeout — was removed on 2026-10-19; see entry 25 above.)
- A **merge stage is git-only** and never runs a command.
- **Migration** (idempotent, on every project load/save, in
  `api/projectStore.js` `normalizeStages` → `migrateMergeDeployStages`):
  a merge stage with a deploy command becomes a git-only merge stage
  (command stripped, "Merge and deploy" renamed to "Merge") plus a
  dedicated `Deploy` ci stage (`id: <mergeId>-deploy`, `failback:
  "previous"`) inserted immediately after it — in `project.stages` AND
  every `workflows[].stages[]` copy. Legacy `deploy`-typed stages
  normalize to `ci` with their command preserved. Stage ids are stable,
  so `failback` references and in-flight `currentStageId` keep
  resolving.
- **Dropped:** non-deploy post-merge commands on merge stages are
  removed by the migration without a replacement stage (deprecated
  ability; post-merge commands were deploy-by-convention and unused in
  this repo's configs).

## Retired storage key: `kainbain_observability_layout_v1` (2026-10-14)

The monitor view's widget layout moved from one entry per widget type to
per-instance entries (`kainbain_observability_layout_v2`), so the same widget
can be placed several times. The version-1 key is **read once** on load and
migrated by `normalizeLayout`
(`frontend/src/components/observability/widgetRegistry.js`), then removed
after the first successful version-2 write. Nothing else reads or writes it;
the key is no longer a supported surface and may be dropped once telemetry
shows no version-1 layouts remain.

## Removed feature: page-context "Desktop / Browser Notifications" (2026-10-15)

The Sound & Alerts tab's "Desktop / Browser Notifications" checkbox (bound
to the `enableDesktopNotifications` UI preference) and its "Request & Test"
button are removed, along with the service behind them
(`frontend/src/services/notifications.js`, which used the page-context
`new Notification()` API). Rationale: Android and iOS browsers do not support
`new Notification()` — it throws — so the flow consumed the browser
permission while being structurally unable to ever show a notification on
mobile, producing the exact "Allowed but not subscribed, nothing arrives"
state reported in task `a86d2783`. Web Push (General App Settings →
Notifications) is the single notification path; the Alerts tab now links
there instead.

- Persisted `enableDesktopNotifications` values in
  `kainbain_ui_preferences` are ignored (dropped on the next
  sanitize/import), not migrated: nothing consumes the key anymore.
- The `POST /push/subscription-status` route and the server-verified
  subscription status replace the dead permission-only signal; see
  `site-docs/push-notifications.md` ("Permission is not subscription").

## Behaviour changes: multi-project discovery & custom state folder (2026-10-16)

Two boot/discovery behaviour changes ship with the multi-project work (task
`5627cdf4`); both are additive for existing projects and recorded in the
README "Multiple projects & custom state folders" section:

- **No auto-create for bare directories.** A directory under a project root
  only becomes a project when it carries a KainBain config file
  (`<dir>/<kainbainDirName>/project.json`) or is explicitly created/adopted.
  Previously every stray directory was silently registered and persisted.
  Migration note: any pre-existing directory that was auto-created already
  has a `project.json` on disk, so nothing disappears; genuinely new
  directories must be created via the UI/API or adopted via
  `POST /projects/register`.
- **No unconditional sample seeding.** Boot no longer provisions
  "Project A"–"Project D" when missing; set `KAINBAIN_SEED_SAMPLE_PROJECTS=1`
  to restore the old behaviour. Projects already on disk (including the
  sample set) still scan — hide them with the project switcher's *Hide*
  action or remove the directories.
- **Custom state folder (new, opt-in).** `kainbainDirName` on a project
  (create/patch/register payloads, or Project Settings → KainBain Folder
  Name) relocates the *name* of the per-project state folder
  (`project.json`, `sessions/`, `worktrees/`, `quarantine/`, opencode
  transcripts). It never moves existing state: the preferred flow is to stop
  the API, rename the folder on disk, and restart (a self-describing config is
  adopted automatically). Changing the setting through the API/UI writes the
  new config and removes the superseded `project.json` so a restart can never
  revert the setting or split state across two folders — `sessions/`,
  `worktrees/`, and `quarantine/` stay in the old folder for a manual move. The
  default stays `.kainbain`, so existing projects are untouched. The docs link
  folder and the state folder can never be swapped onto each other's current
  name in a single change (rejected with 400) — rename one first, then the
  other. Stale-config cleanup only removes a superseded `project.json` that
  carries this project's own id (or, for id-less legacy configs, names this
  project's cwd); another project's config is never deleted.
- **Defaults intentionally unchanged.** `projectsRoot`/`notesSpaceRoot` keep
  their compiled-in homelab defaults because the live native deployment
  relies on them (no `PROJECTS_ROOT` in its environment). A native boot
  against a missing `projectsRoot` now logs a loud warning naming the
  configured value; Docker already refuses to boot via its entrypoint. When
  moving to a fresh machine, set `PROJECTS_ROOT` (and optionally
  `PROJECTS_ROOTS`, path-list separated) explicitly — see
  `PORTABLE_DEPLOYMENT.md` scenario D.

## Dated exceptions (all carry reason + expiry in the allowlist)

- Build warnings: none.
- Audit: `#1243084` happy-dom via frontend devDependency for Vitest testing
  only — expires 2027-01-05. The brace-expansion (#1240103/#1240107/#1240111)
  and undici (#1243077/#1243080/#1243112) exceptions were removed 2026-10-25
  when the underlying copies were patched (rows 7, 19).
- Majors: React 19, react-router 8, tailwindcss 4 — revisit by 2027-01-05 or
  when the current major goes EOL, whichever first. (pi-coding-agent 1.x
  landed 2026-10-25 at 1.2.0, row 19.)
