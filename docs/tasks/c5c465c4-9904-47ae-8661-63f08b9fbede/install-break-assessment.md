# Install-break assessment — c5c465c4 (HEAD vs merge-base 36633a08)

**Verdict: No breakage — safe to update existing installs.**

## What was checked

Diff `36633a08..HEAD` (19 files, +1265/−116) reviewed; boot, build, and
the version endpoint exercised directly.

## Findings

- **No schema / data migration.** `api/config/schema.js` changes are doc
  strings only; defaults stay `""` for the three `latest*Version` knobs and
  the two `securityReport*` knobs. Existing `.env` files need no edit.
  No DB, file-format, or Dockerfile change ships in this diff.
- **Frontend `version.json` import is safe.** `frontend/src/version.js`
  now imports `../version.json` for `FRONTEND_API_VERSION` /
  `FRONTEND_REQUIRES_BACKEND_API`. `frontend/version.json`
  (`apiVersion 1.0.0`, `requires.backendApi >=1.0.0 <2.0.0`) exists at the
  base commit and at HEAD, so a `docker compose up --build` (which copies
  `frontend/` wholesale) and `./deploy.sh --prod` both contain the file.
  `npm run build --prefix frontend` was run on this tree — built in
  ~4.6s, no import error. The one-shot `muse.bash` import check
  (`node --input-type=module -e import './api/versionInfo.js'`) also
  succeeds; `semver` was already a runtime dep.
- **Asymmetric updates (the plan's core guarantee) hold in both windows.**
  - *New frontend vs old backend*: the new client sends
    `?frontendApiVersion=` and `?requiresBackendApi=` alongside `?uiVersion=`.
    An old backend without `GET /status/versions` returns 404; the new
    `VersionInfoSection.jsx` renders a targeted "backend is older than
    this UI — update backend" line with a link to `#/docs/update-backend`
    and a Retry button, never a crash loop.
  - *Old frontend vs new backend*: the old client sends only `?uiVersion=`.
    The new route treats missing contract params as `null` and returns
    `frontendApiVersion: null`, `requiresBackendApi: null`,
    `compatibility: { status: "unknown" }` — additive fields the old UI
    ignores. `api.getVersions(uiVersion)` keeps the single-arg signature
    (second arg optional), so old bundles keep working.
  - *Response-shape change is additive*: the `/status/versions` schema adds
    `frontendApiVersion`, `requiresBackendApi`, `compatibility` to each
    `apis[]` entry; `ui`, `backend`, `security`, `warnings`, `checkedAt`
    keep their shape. No consumer doing strict unknown-field rejection
    exists in `frontend/src/services/api.js` or the tests.
- **Semantic change unknown→up-to-date is intentional, not breaking.**
  `resolveLatestRelease` now reports `up-to-date` when a `KAINBAIN_LATEST_*`
  knob is unset/blank (the default install) instead of `unknown`. The old
  page showed "Unknown" for every row with no knobs configured; the new
  page shows "Up to date" with no banner. Boot and every other surface
  are unaffected — this is exactly the human-correction behavior
  (empty knobs = no newer release advertised).
- **Boot & endpoint robustness.** `readBackendVersion`,
  `readApiContract`, `readSecurityReport` all swallow missing-file / bad-JSON
  to `null`/`unknown` instead of throwing; `buildVersionInfo` never
  throws on off-contract inputs (normalized via `normalizeFrontendContract`
  / `normalizeSecuritySummary`, timestamp regenerated when mistyped). Live
  inject probes: minimal `{ uiVersion: '1.0.0' }` returns 200 with
  `up-to-date`/`unknown`/`unknown` rather than 500. 200–300-char query
  values are rejected with 400 by schema `maxLength`, not by a crash.

## Verification evidence (this run)

- `npm run test --prefix api -- versionInfo` — 44 passed.
- `npm run test --prefix frontend -- version` — 39 passed (incl.
  `version.test.js` now asserting the `frontend/version.json` lock).
- `npm run test --prefix api -- status.versions` — 7 passed (incl. the
  asymmetric compat verdicts).
- `npm run test --prefix frontend -- VersionInfoSection` — 30 passed.
- `npm run build --prefix frontend` — succeeded (4.34s, mermaid check OK).
- Direct `node -e` probe of `buildVersionInfo` — `r1 ui status up-to-date … api compat compatible`, no throw on minimal input.

## Risk remaining

None identified for install-to-install upgrades. The only behavior an
existing operator will notice is the About page flipping from "Unknown"
to "Up to date" when no `KAINBAIN_LATEST_*` knob is set, which is the
requested fix for the screenshot in the task.
