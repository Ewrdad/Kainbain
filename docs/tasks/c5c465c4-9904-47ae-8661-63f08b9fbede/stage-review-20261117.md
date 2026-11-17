# Stage review — Version information page in global settings (c5c465c4)

Stage: PR-review-equivalent (docs-only). Branch `kb/c5c465c4-9904-47ae-8661-63f08b9fbede`
at HEAD `c423bf90`. This review re-verified everything from scratch against the
current tree because the two earlier reviews (`pr-review-20261117.md`,
`code-standards-review-20261117.md`) describe the superseded honest-unknown
default; the human correction (all rows showing Unknown) has since been fixed
by reporting `up-to-date` when no newer release is advertised.

Verdict: PASS. Evidence below; every claim was observed in this stage.

## 1. Does it achieve the goal?

Yes — all four task elements plus the human correction, each verified live:

- **Information page in global settings.** `about` tab in `SETTINGS_TABS`
  (`frontend/src/components/settings/settingsTabs.js`), rendered by
  `SystemSettingsContent.jsx` as `VersionInfoSection`, reachable at
  `#/system-settings/about` via the existing `:section` route. Confirmed in a
  real headless browser (branch build, same-origin, throwaway loopback stub):
  tab bar shows ABOUT highlighted; page renders rows, banner, security card.
- **UI + backend + API versions from the running build.** UI from
  `frontend/package.json` via `frontend/src/version.js` (`UI_VERSION`, sent as
  `?uiVersion=` — observed in the stub request log); backend from
  `api/package.json` via `readBackendVersion`; API contract from
  `api/version.json` via `readApiContract`; aggregated by `buildVersionInfo`,
  served by `GET /status/versions` (`api/routes/status.js`). Real-route probe
  returned installed 1.0.0/1.0.0/1.0.0 with the real accepts map.
- **Human correction 1 — no more all-Unknown.** `resolveLatestRelease` reports
  `up-to-date` (latest echoes installed) when a `KAINBAIN_LATEST_*` knob is
  unset/blank — the default install — instead of `unknown`. Real-route probe
  with no knobs: all three rows `up-to-date`, `warnings: []`. Screenshot
  `review-about-uptodate-no-report.png` shows the default state with zero
  Unknown rows. Malformed knobs and missing installed versions still yield
  honest `unknown` (probed + unit-tested), never a fake up-to-date.
- **Human correction 2 — API tied to backend/frontend, major-rule compat.**
  The UI reports its contract (`FRONTEND_API_VERSION` +
  `FRONTEND_REQUIRES_BACKEND_API` from `frontend/version.json`) as
  `?frontendApiVersion=` + `?requiresBackendApi=` (observed in stub log); the
  backend judges the live pair in `checkApiCompatibility` (each declared range
  must contain the other side's version; with no verifiable range, same API
  major = compatible). Probed: same-major pair → `compatible` mentioning
  "API major 1"; split major → `incompatible` naming both versions; old UI
  sending no contract → `unknown`, no crash. Both screenshots show the
  "UI speaks API … · requires backend API …" tie-in line plus the verdict.
  This is exactly the asymmetric-update / partial-redeploy rule requested.
- **Latest security report for the build.** `readSecurityReport` loads the
  operator JSON file (`KAINBAIN_SECURITY_REPORT_PATH`, fallback
  `KAINBAIN_SECURITY_REPORT_URL`); env-wired probe returned `pass` +
  `checkedAt` + `summary` + `reportUrl`. UI renders summary + "Open the full
  report"; unconfigured builds render "No security report recorded for this
  build" — never a fabricated pass. Both states browser-verified.
- **Warning when a newer version exists.** `compareRelease` (semver gt on
  `coerceRunnerVersion`-normalized input) yields `update-available`; endpoint
  `warnings` name each outdated component; UI shows a `role="alert"` banner.
  Env-wired probe (`KAINBAIN_LATEST_UI_VERSION=1.2.0`,
  `KAINBAIN_LATEST_BACKEND_VERSION=v2.0.0`) returned both warnings with
  v-prefix coerced. Browser-verified: "A newer version is available. UI
  update available: 1.0.0 → 1.2.0".
- **Update-guide links in site docs.** `VERSION_UPDATE_GUIDES` points each row
  at `#/docs/update-ui|update-backend|update-api`; the three
  `site-docs/update-*.md` guides exist with valid frontmatter and pass
  `docs:check`. Per-row "How to update …" links browser-verified.
  `isSafeVersionLink` refuses `javascript:`/protocol-relative/data URLs
  (unit-tested), so a hostile report file cannot arm a link.

## 2. Did it follow the plan? (IMPLEMENTATION_PLAN.md)

Yes, with three deviations, all acceptable:

- Unknown→up-to-date default contradicts the plan's "honest unknown" wording,
  but the plan assumed a release feed while the implementation uses operator
  knobs — with knobs, "unset" genuinely means "nothing newer known", so
  up-to-date is the honest state. The change was explicitly requested by the
  human correction and is documented in `CHANGELOG.md`, the config schema
  docs, the guides, and `install-break-assessment.md`.
- Phase-0 R1–R3 decision notes were never appended to the task folder; the
  decisions live in JSDoc, `.env.example`, schema docs, and guides instead.
  No information is lost.
- Survey q5's free-text note suggested dedicated view-roles; the selected
  answer ("Everyone who can open global settings") is what was built, matching
  the plan default and the sibling `/status/*` routes (no `requireRole`,
  versions/warnings/report-link only — nothing secret). Roles remain a product
  follow-up, not a defect.

## 3. Code standards

- `npm run docs:check` — PASS (61 tests; 74 doc files link-checked;
  jsdoc-@example PASS, 679 missing vs 680 grandfathered).
- `npm run check:one-function` — PASS (839 files, 281 grandfathered).
- `npm run lint:api` / `lint:frontend` — 0 errors; all touched feature files
  lint clean individually (exit 0, no output).
- `npm run check:binaries` — PASS; `check:proof-hygiene` — only pre-existing
  baseline items from another task.
- Style matches the repo: pure labelled-input helpers in `api/versionInfo.js`
  with injectable `readFile`/`apiDir`, thin route pass-through with a
  documented `deps.versions` test seam, `normalizeRelease` reusing
  `coerceRunnerVersion` instead of new semver logic, prototype-key screening,
  local React state, co-located black-box tests, MARK/@description/@example on
  every new export.

## 4. Easy to modify later / tech debt

Single sources of truth throughout (`SETTINGS_TABS`,
`VERSION_UPDATE_GUIDES`, config schema + `.env.example` in sync,
`api/package.json` + `api/version.json` + `frontend/package.json` +
`frontend/version.json`). Adding a component row = one guide slug + one entry.
Both asymmetric-deploy windows hold (new-UI-vs-old-backend renders a targeted
404 hint with backend-guide link — unit-tested; old-UI-vs-new-backend gets
null contract fields — probed). Remaining debt is the documented, plan-blessed
follow-up: manual security-report ingestion and operator-maintained latest
knobs. No new abstractions, polling, or permission layers.

## 5. Docs updated

`site-docs/update-ui.md`, `update-backend.md`, `update-api.md` (the API guide
documents the tie-in + major rule and forbids hand-editing contracts);
`site-docs/api-reference.md` endpoint row; `api/agentGuide.js` entry;
`CHANGELOG.md` entry covering the compat verdict and the up-to-date default;
`.env.example` entries for all five knobs. All covered by the passing
`docs:check`.

## 6. Verification evidence (commands run in this stage)

- `npm run test:unit` — exit 0: api 454 files / 7460 passed / 3 skipped,
  frontend 357 files / 4859 passed.
- Focused: api `versionInfo + status.versions` 51 passed; frontend
  `VersionInfoSection + SystemSettingsContent + settingsTabs + version +
  api.surface` 75 passed.
- Real-route Fastify `inject` probes (real disk + real config): default
  up-to-date + compatible; update-available + security fixture via env knobs;
  old-frontend unknown-compat; split-major incompatible; v-prefix coercion.
- `VITE_API_BASE= VITE_WS_URL= npm run build --prefix frontend` — built in
  ~4.4s (also proves the version.json import is safe).
- Headless browser (branch build, throwaway stub on 127.0.0.1:3199/3200,
  killed afterwards; live :3100 untouched): stub logs prove the UI calls
  same-origin `/status/versions?uiVersion=…&frontendApiVersion=…&
  requiresBackendApi=…`. Captured `review-about-update-available.png`
  (banner + rows + tie-in + compat + security pass + guide links) and
  `review-about-uptodate-no-report.png` (no banner, all Up to date, honest
  no-report state). Both PNG-magic-verified and pixel-inspected. The stale
  `review-about-unknown-no-report.png` (superseded all-Unknown default) was
  removed.

## 7. Notes for later (non-blocking)

- Automating security-report ingestion (CI/deploy writes the JSON, or a
  SecObserve read) and replacing operator latest-knobs with a release feed
  remain the documented follow-ups; both degrade honestly today.
- If the survey q5 roles note should bind, add backend `requireRole`
  enforcement on `/status/versions` as a follow-up.
