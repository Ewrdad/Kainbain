# Implementation Plan — Version information page in global settings

Task: `c5c465c4-9904-47ae-8661-63f08b9fbede`
Stage: plan (docs-only). No code was changed to produce this plan.

## Goal

Add an information page to global settings (the System Settings screen at
`/system-settings`) that shows, in one place:

1. Current UI (frontend) version and backend version, plus API versions.
2. The latest security report result for the running build.
3. A warning when a newer version is available.
4. Links to step-by-step update guides in the site docs for each version.

## Success criteria

- A new "About" / "Versions" section exists in System Settings, reachable from
  the settings tab bar and by direct URL (`/system-settings/about` or similar).
- The page shows UI version, backend version, and API version(s) for the
  actually running build (not hardcoded strings that can drift).
- The page shows a security summary for the running build plus a link to the
  full report.
- When a newer version exists, the page shows a visible warning; when
  up-to-date or when the check cannot run, it shows an honest state (never a
  fake "up to date").
- Each version row links to a site-docs update guide; all new docs pass the
  existing docs gates (`docs:check`, siteDocs suites).
- `npm run test:unit` passes, including new unit/integration tests for the
  endpoint and the page; lint passes.

## Grounding — what exists today (verified in repo)

- **Global settings = System Settings.** Route `/system-settings` and
  `/system-settings/:section` render `SystemSettingsPage`
  (`frontend/src/routes.jsx`). Tabs come from the single source of truth
  `SETTINGS_TABS` in `frontend/src/components/settings/settingsTabs.js`;
  `SystemSettingsContent.jsx` renders per-tab content. A new tab + section
  component is the established extension pattern.
- **Backend/API version source exists.** `api/version.json` holds
  `{ component, apiVersion, accepts }`, and `api/routes/status.js` already
  loads it ("the only API-version source") for the status/health surface.
  `api/package.json` and `frontend/package.json` are both `1.0.0`.
- **Version-compat logic exists.** `api/flow/runnerVersionCompat.js` handles
  runner/backend compatibility — reuse its comparison helpers rather than
  writing new semver logic.
- **Security scans exist but are external.** `Security_scans.sh` runs Trivy +
  Semgrep and publishes to SecObserve (`https://api.security.home/api`). There
  is no in-repo per-build report artifact today — this is the biggest unknown
  and gets the first research spike (Phase 0).
- **Site docs have strict gates.** Articles live in `site-docs/*.md` with
  frontmatter (`title`, `section`, `order`), served by `api/siteDocs.js` via
  `routes/docs.js`. New/changed articles must satisfy `siteDocs.integrity`,
  `siteDocs.frontendParity`, `docs.apiCoverage` tests, `check-doc-links.mjs`,
  and `npm run docs:check`. Update guides must be written to these rules from
  the start.
- **Verification tooling.** Primary gate is `npm run test:unit`; visual checks
  must use headless runners or `npm run capture:screenshot` (no long-lived
  background servers).

## Survey decisions (SURVEY.md — currently unanswered)

The grill survey (`SURVEY.md`, round 1) asked six questions and has **no
answers recorded** (`"answers": {}`). The plan therefore treats each as an
open product decision with a recommended default so implementation is never
blocked. If answers arrive before implementation, they override the defaults.

| # | Survey question | Recommended default | Rationale |
|---|---|---|---|
| q1 | Page contents | All six items (UI, server, connection versions, safety check, newer-version warning, update links) | Matches the task text exactly |
| q2 | Which API versions | Main screen↔server link first; list external-service contracts only if a registry already exists (do not build a new registry in this change) | Simplest sensible scope; avoids inventing a tracking system |
| q3 | Security report display | Summary plus link to full report | Survey's own recommended option; keeps page scannable |
| q4 | Newer-version check timing | Check each time the page is opened, with a manual "Check for updates" button as well | No background polling infrastructure to build; honest loading/error states |
| q5 | Who can see it | Everyone who can open global settings | Version info is operational, not secret; avoids new permission plumbing |
| q6 | Update link behaviour | Open the full step-by-step guide in site docs | Task text explicitly asks for guide links; avoids duplicating content on the page |

If the survey is answered differently, only Phase 3 (UI) and Phase 4 (docs)
change shape; Phases 0–2 are unaffected.

## Approach — make the change easy, then make the change

The change is easy when three things are true: (1) every version number has
**one** source of truth reachable at runtime, (2) the "is a newer version
available" question is answered by **one** backend function with honest
unknown-states, and (3) the security-report question is answered by **one**
artifact or API the backend can read. Today only (part of) (1) exists. So:

- **Phases 0–2 make the change easy** (research spikes first, then backend
  sources + one aggregation endpoint). No UI work until the endpoint returns
  real data.
- **Phases 3–4 make the change** (settings section UI + site-docs update
  guides).
- **Phase 5 assures the change** (tests, docs gates, acceptance checks).

Big/research-heavy work is deliberately front-loaded; later phases are small
and mechanical once the foundations land.

## Steps

### Phase 0 — Research spikes (do first; time-box each to ~0.5 day)

1. **R1 — Security report source.** Determine how the backend can obtain "the
   latest security report for this build": query SecObserve API? read a
   CI/upload artifact? a file the deploy writes? Record: endpoint or path,
   auth, retention keyed by what (commit SHA? version? date?), and what
   "no report for this build" looks like. **Outcome:** a short decision note
   (append to this task folder) naming the source or declaring it unavailable.
   If unavailable, the page shows "No security report recorded for this
   build" + link to run/scan docs — never a fabricated pass.
2. **R2 — Newer-version source of truth.** Determine what "newer version
   available" compares against: git tags? npm registry? a release feed? the
   deploy system's known-good version? Also decide per-component (UI,
   backend, runner) or single product version. Record caching, offline, and
   failure behaviour. **Outcome:** decision note + chosen comparison input.
3. **R3 — API-version inventory (answers q2).** Enumerate every API contract
   the system actually versions today (`version.json` accepts-map, runner
   compat ranges, WebSocket/event versions, external services). **Outcome:**
   the exact list the page will render; anything without a source is cut from
   scope, not guessed.

Gate: do not start Phase 1 until R1–R3 notes exist. If R1 finds no
machine-readable report source, proceed with the honest-empty state and note
"automated report ingestion" as follow-up work.

### Phase 1 — Single sources of truth (make the change easy, part 1)

4. **Expose the UI version at runtime.** Bake the frontend version into the
   build (e.g. from `frontend/package.json` via the existing build config) so
   the running app can report it; add a unit test asserting the baked value
   matches `package.json`.
5. **Confirm the backend version source.** Backend version should come from
   one place (`api/version.json` extended with a backend/product version, or
   `api/package.json` — pick one, document it, and make every consumer use
   it). Add a unit test asserting the served version equals that source.
6. **Reuse semver comparison.** Put "is newer available" comparison logic next
   to the existing `runnerVersionCompat.js` helpers (extend, don't duplicate);
   unit-test edge cases (prerelease, missing, malformed, equal).

### Phase 2 — One aggregation endpoint (make the change easy, part 2)

7. **Add `GET /status/versions` (or extend the existing status route).**
   Response shape (field names illustrative):
   `ui: { installed, latest, updateUrl }`,
   `backend: { installed, latest, updateUrl }`,
   `apis: [{ name, installed, latest, updateUrl }]`,
   `security: { status, checkedAt, summary, reportUrl } | { status: "unknown" }`,
   `checkedAt`, `warnings: []`.
   Every "latest" lookup failure must yield an explicit `unknown` state, never
   a silent "up to date".
8. **Wire the three sources** (Phase 1 versions, R1 security source, R2
   latest-version source) behind small, individually unit-testable functions;
   add API integration tests for: happy path, latest-check unreachable,
   no security report for build, and malformed upstream data.
9. **Access control per q5 default:** same visibility as System Settings
   itself (no new permission layer). If the survey later restricts it, add the
   guard here (backend enforcement, not just UI hiding).

Gate: the endpoint returns real data for the running build (verified with an
integration test + one manual `curl` against a dev instance) before any UI
work starts.

### Phase 3 — Settings information page (make the change, part 1)

10. **Add the tab.** Register the new section in `SETTINGS_TABS`
    (`settingsTabs.js`) with `showFooterReset: false` (read-only page, same
    as UI/Notifications), following the file's single-source-of-truth
    convention; update `settingsTabs.test.js` expectations.
11. **Build the section component** (e.g.
    `components/settings/VersionInfoSection.jsx`), rendered by
    `SystemSettingsContent` for the new tab id: version table (installed /
    latest / status per row), warning banner when any `latest > installed`,
    security summary card + full-report link, "Check for updates" button that
    re-fetches, and per-row "How to update" links into site docs. States to
    implement: loading, loaded, check-failed (honest retry), unknown-latest.
12. **Deep-link + navigation.** Confirm `/system-settings/<new-id>` resolves
    (route already supports `:section`) and the tab bar highlights; add to
    `routes.test.jsx` / tab-bar coverage as the existing suites require.

### Phase 4 — Site-docs update guides (make the change, part 2)

13. **Write one update guide per version row** (UI, backend, each listed API /
    component) under `site-docs/` with correct frontmatter (`section:
    workflows` or `reference`, unique `order`), each containing: how to tell
    you need the update, step-by-step update, verify-it-worked check, and
    rollback pointer. Link the page's `updateUrl`s at these slugs.
14. **Run the docs gates**: `npm run test --prefix api -- siteDocs`,
    `docs.apiCoverage`, and root `npm run docs:check` (includes
    `check-doc-links.mjs`); fix frontmatter/links until green. These suites
    are the acceptance test for this phase.

### Phase 5 — Assure the change (testing + documentation plan)

15. **Unit tests** (colocated, existing Vitest setup): version-source tests
    (Phase 1), comparison edge cases, endpoint shape tests, tab-registration
    tests, component render tests for each state (up-to-date, update
    available, unknown, check-failed, no-report).
16. **Integration tests**: endpoint happy path + each failure mode against
    stubbed upstreams; settings-page render fetching the endpoint (mock
    fixtures, no live network).
17. **Full gates**: `npm run test:unit`, `npm run lint`, `npm run docs:check`,
    plus the repo's proof/hygiene scripts if touched areas require them
    (`check:proof-hygiene`). All green on the branch before review.
18. **Visual check (headless only)**: `npm run capture:screenshot` of the new
    section in "update available" and "up to date" states; attach/verify
    screenshots show the banner, versions, security card, and guide links.
    No long-lived background servers.
19. **Documentation updates**: the new site-docs guides (Phase 4); a
    CHANGELOG.md entry; short operator note if R1/R2 introduce new env vars
    or config (with `.env.example` update).
20. **Acceptance walkthrough** against Success Criteria: open the page, confirm
    versions match the running build, force an "update available" state
    (stubbed latest), force offline latest-check (honest unknown), confirm
    each link lands on the right guide, confirm no-report builds show the
    honest empty state.

## Risks and mitigations

- **No machine-readable security report (R1 fails).** Mitigation: ship the
  honest "no report recorded" state; file automated ingestion as follow-up.
  The page must never imply a scan passed when none is recorded.
- **No authoritative "latest version" feed (R2 fails).** Mitigation: same
  honest-unknown pattern; manual "Check for updates" button still valuable.
- **Survey answers arrive late and contradict defaults.** Mitigation: defaults
  chosen so only Phases 3–4 reshape (q2/q3/q4/q6) or one guard is added (q5);
  Phases 0–2 are decision-proof.
- **Docs-gate churn.** Mitigation: write guides to the `siteDocs.js`
  frontmatter contract from the first draft and run `docs:check` early, not
  at the end.
- **Scope creep (full update automation, new API registry).** Non-goals for
  this change: one-click updates, background polling daemons, a new API
  contract registry, new permission roles. The page informs and links; it
  does not perform updates.

## Open questions

1. Survey q1–q6 are unanswered — confirm the recommended defaults (table
   above) or provide answers before Phase 3.
2. R1–R3 outcomes (unknown until the spikes run) — see Phase 0.
3. Exact tab id/label ("About" vs "Versions" vs "System info") — cosmetic;
   decide in Phase 3, default "About".
