# Code-standards review — Version information page (c5c465c4)

Stage: review (docs-only). Scope: branch `kb/c5c465c4-9904-47ae-8661-63f08b9fbede`
compared to `main` (there is no `master` branch in this checkout; merge-base
`df30a4733a324c60b7aa6affa383a91b48d07960`). 5 commits, 27 files,
1986 insertions, 4 deletions. Standards source: `docs/KB Code Standards.md`
plus the enforced elaboration in `docs/agent-docs/KB-Code-Standards.md`
§Documentation/Jsdoc (MARK/@description/@example gate, one-function-per-file).

Verdict: PASS — every enforced gate passes, all new unit/integration tests
are co-located and black-box, JSDoc explains why, and the task goal is
met (UI/backend/API versions, security report, newer-version warning,
per-row site-docs update guides). Minor advisories below are non-blocking
and match sibling precedent.

## Task-goal check (for context, not a standards gate)

- Global-settings information page: new `about` tab in
  `frontend/src/components/settings/settingsTabs.js`, rendered by
  `frontend/src/components/settings/SystemSettingsContent.jsx` as
  `VersionInfoSection` (`frontend/src/components/settings/VersionInfoSection.jsx`),
  reachable at `/system-settings/about` via the existing `:section` route.
- Versions shown from single sources of truth, not hardcoded strings:
  UI from `frontend/package.json` via `frontend/src/version.js`
  (`UI_VERSION`), backend from `api/package.json` via
  `readBackendVersion`, API contract from `api/version.json` via
  `readApiContract` — all in the new `api/versionInfo.js`, aggregated by
  `buildVersionInfo` and served by `GET /status/versions` in
  `api/routes/status.js`. Tests pin each source against the real disk
  (`api/versionInfo.test.js`, `api/routes/status.versions.test.js`,
  `frontend/src/version.test.js`).
- Latest security report for the build: `readSecurityReport` loads the
  operator JSON file (`KAINBAIN_SECURITY_REPORT_PATH`, default empty) as
  `{status: pass|fail|warn, checkedAt, summary, reportUrl?}` plus the
  `KAINBAIN_SECURITY_REPORT_URL` fallback; anything else yields
  `{status: 'unknown'}` and the UI shows "No security report recorded
  for this build" — never a fabricated pass. Summary + full-report link
  are rendered when a safe URL exists.
- Warning when newer available: `compareRelease` (semver gt, reusing
  `coerceRunnerVersion` from `api/flow/runnerVersionCompat.js` as
  `normalizeRelease`) yields `update-available | up-to-date | unknown`;
  `warnings` names each outdated component and the UI shows a
  `role="alert"` banner. Latest knobs (`KAINBAIN_LATEST_*_VERSION`,
  default empty) collapse to honest `unknown`, never fake "up to date".
  Loading, check-failed/retry, and manual "Check for updates" states exist.
- Update-guide links: `VERSION_UPDATE_GUIDES` is the one source for
  `#/docs/update-ui`, `#/docs/update-backend`, `#/docs/update-api`;
  each row links "How to update ..." (gated by `isSafeVersionLink`, which
  refuses `javascript:`/protocol-relative/data URLs). Three new
  `site-docs/update-*.md` guides (how-to-tell, step-by-step, verify,
  rollback) plus `site-docs/api-reference.md` and `api/agentGuide.js`
  entries and a `CHANGELOG.md` line.

## Standards checklist

### User-understandable over technical language — PASS

- Exported names are descriptive verbs/nouns: `buildVersionInfo`,
  `readBackendVersion`, `readApiContract`, `readAcceptsMap`,
  `readSecurityReport`, `normalizeRelease`, `compareRelease`,
  `labelVersionStatus`, `isSafeVersionLink`, `describeAcceptsMap`,
  `UI_VERSION`, `VersionInfoSection`, `getVersions`. Checks match the
  UI language in the survey ("screen", "server", "connection" rendered as
  UI/Backend/screen-to-server API).
- Every new export carries MARK + @description + @example directly above
  the export (only whitespace between `*/` and `export`), per the gate.
  Examples are runnable or wire-shape examples matching sibling style
  (e.g. `normalizeRelease('v1.2.3') => '1.2.3'`,
  `isSafeVersionLink('javascript:alert(1)') => false`).
- JSDoc explains why, not just what: honest-unknown rationale
  (versionInfo header, `compareRelease`, `readSecurityReport`),
  hostile-`version.json` prototype screening (`readAcceptsMap`),
  `javascript:` smuggling rationale (`isSafeVersionLink`), uiVersion cap
  rationale (`api/routes/status.js`), test-seam rationale (route comment),
  UI-version source rationale (`frontend/src/version.js`).
- Config docs (`.env.example`, `api/config/schema.js`) are plain English
  and state the empty-default meaning; site-docs guides use plain
  language ("the screens you click", "the background part that runs tasks").
- No new classes; no currying; no design-pattern names introduced beyond
  one pre-existing-vocabulary comment (see Advisories).

### Functional over object-oriented — PASS

- All new backend helpers are pure functions of labelled inputs
  (`readBackendVersion`, `readApiContract`, `readSecurityReport`,
  `buildVersionInfo` take `{...}` objects); filesystem/env access stays in
  the route layer (`api/routes/status.js`) and in defaulted parameters
  (`readFile`, `apiDir`) so tests inject stubs without touching disk or
  the global config. Callers pass only what each call needs.
- Each function has a single responsibility (one version source, one
  comparison, one report load, one aggregation). React state in
  `VersionInfoSection` is clearly defined local state
  (info/loading/loadError + cancelled flag); no shared mutable module state.
- Reuse over duplication: `normalizeRelease` re-exports
  `coerceRunnerVersion` instead of writing new semver coercion.

### Co-location over abstraction — PASS

- Unit tests sit next to the source: `api/versionInfo.test.js`,
  `api/routes/status.versions.test.js`, `frontend/src/version.test.js`,
  `frontend/src/components/settings/VersionInfoSection.test.jsx`.
  Modified tests updated in place (`config.test.js`,
  `settingsTabs.test.js`, `SystemSettingsContent.test.jsx`,
  `api.surface.test.js`).
- New code is searchable along the call stack: route →
  `api/versionInfo.js`; settings content → settings folder section;
  API client method in `frontend/src/services/api.js` beside its siblings;
  tab registration in the existing `SETTINGS_TABS` single source.
  Section-local helpers (`labelVersionStatus`, `isSafeVersionLink`,
  `describeAcceptsMap`) live in the component file that uses them.
- No unnecessary abstraction layer: the only alias is `normalizeRelease`
  (documented why + tested); no new helper folder or barrel.

### Tested over trusted — PASS

- Tests were run, not assumed (see Evidence). Coverage is at the lowest
  useful level: unit (version sources, comparison edges incl.
  prerelease/build/padded, malformed/unknown collapse, prototype-key
  screening, security-file contract), API integration via Fastify inject
  with stubbed `deps.versions` (happy, unknown, malformed, 400, real-disk
  wiring), component states (loading, banner, up-to-date, unknown,
  no-report, fail, hostile-URL refusal, malformed payload, retry/refetch).
  No log-based assertions; no live network/AI agent.
- Typing is treated as unproven: every reader guards typeof/shape and
  degrades to unknown/null/{} rather than crashing (endpoint answers 200
  with honest states, never 500, for malformed upstream data).

### Fast iteration / one-function-per-file — PASS

- `check:one-function` passes: new files have at most one top-level
  `function` declaration (`VersionInfoSection.jsx` has exactly one;
  `versionInfo.js` and `version.js` have none — helpers are arrow
  constants, which the gate explicitly allows).

## Evidence (commands run in this review stage)

- `npm run check:jsdoc-example` — PASS (680 missing, baseline grandfathered; no new export added to baseline).
- `npm run check:one-function` — PASS (836 files scanned, 281 grandfathered).
- `npm run docs:check` — PASS (57 tests across siteDocs/agentGuide/envCoverage/docs.apiCoverage; check-doc-links: 74 doc files OK; jsdoc PASS).
- `npm run test --prefix api -- versionInfo status.versions config.test` — PASS (6 files, 137 tests, incl. versionInfo 22 + status.versions 5 + config 83).
- `npm run test --prefix frontend -- VersionInfoSection SystemSettingsContent settingsTabs version api.surface` — PASS (7 files, 57 tests, incl. VersionInfoSection + SystemSettingsContent 28).
- `npm run lint:api` / `npm run lint:frontend` — PASS, 0 errors (only pre-existing security warnings).
- `npm run check:proof-hygiene` and `npm run check:binaries` — PASS (pre-existing baseline items only).

## Advisories (non-blocking, match sibling precedent)

1. Positional params on small helpers (`compareRelease(installed, latest)`,
   `labelVersionStatus(status)`, `isSafeVersionLink(href)`,
   `describeAcceptsMap(accepts)`, `readAcceptsMap(accepts)`) vs the
   labelled-pattern principle. Multi-arg backend functions do use labels;
   single-arg positional helpers match siblings (`searchSettings(query)`,
   `runnerDisplayName(runner)`, `resolveSelectedId(visible, prevId)`).
   No change required to pass.
2. Short locals (`have`/`want`, `http`, `info`, `raw`, `ui`/`api` row
   objects) are tightly scoped and readable in context; siblings use
   similarly short locals (`file`, `parsed`). Longer names would add
   noise, not clarity, at these scopes.
3. One route comment uses "test seam" / "global config singleton"
   (`api/routes/status.js`). That vocabulary appears 60+ times in the
   existing codebase (`sessionStore`, `runnerRegistry`, `auth/service`,
   etc.), so it is the de-facto common language profile despite the
   standards aspiration. Rewording is optional future polish.
4. Backend JSDoc blocks omit @param/@returns (frontend blocks include
   them); the enforced gate requires only MARK/@description/@example and
   sibling backend JSDoc style varies the same way.

None of the above fails an enforced gate or contradicts a sibling
convention, so the stage passes.
