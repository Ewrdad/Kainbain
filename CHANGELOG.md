# Changelog

All notable changes to KainBain are recorded here in **curated** form. The
per-commit baked history that backs the in-app **Changelog** dialog is generated
by `scripts/generate-changelog.mjs` and served through `GET /deploy/changelog`
(`frontend/src/components/layout/ChangelogModal.jsx`); it remains the exhaustive
source of truth. This file intentionally lists only high-impact changes.

## Update discipline

- Entries are curated **only at release time**, from the `Unreleased` section
  below, when a version tag/deploy is cut. Ordinary PRs are not required to touch
  this file (WP-10, task `8e61e197-cf8a-475e-b330-8cd7fa5a7e30`).
- Keep entries to one line each, grouped under `Added` / `Changed` / `Fixed` /
  `Removed` / `Security`. Reference the PR or task id in parentheses when
  helpful. Do not copy auto-generated commit subjects verbatim.
- After a release, rename the `## [Unreleased]` content to `## [x.y.z] -
  YYYY-MM-DD`.

## [Unreleased]

### Fixed

- Task retry state is now first-class (`retryState`, `nextRetryAt`) so tasks no longer appear stuck in RETRYING: scheduled retries show attempt x/y with a countdown, exhausted retries park as FAILED, and orphaned retries recover on restart (task 8815d13d).

### Changed

- Merged the ALL / FAILED / HUMAN ONLY board pills into the unified search bar as `!` system filters (e.g. `auth #Dev !failed`): same dropdown, chips, and Any/All toggle as `#` tags; unknown `!tokens` stay as text; future native filters register via `frontend/src/components/workflow/systemFilters/` (task c213d3a9).

## [1.0.0] - 2026-10-23

### Added

- `AGENTS-MAP.md` one-page orientation and barrel documentation.
- In-app changelog dialog backed by baked git history (`scripts/generate-changelog.mjs`).
- Site docs and machine-checked doc-link coverage (`npm run docs:check`).
- Three automated quality gates: core-module coverage, one-function-per-file for
  new files, JSDoc `@example` completeness (`api/vitest.config.js`,
  `scripts/check-one-function-per-file.mjs`, `scripts/check-jsdoc-example.mjs`).
- Task directory hygiene decision recorded in `docs/TASK_DIRECTORY_HYGIENE.md`.

### Changed

- Split `api/taskStore.js` into subject modules under `api/work/`, `api/flow/`,
  `api/watch/`, `api/house/` (facade retained).
- Split `api/projectStore.js` normalizers into `api/project/` (WP-3, facade retained).
- Split git operations into command families under `api/git/` (WP-4, barrel retained).
- Refactored flow execution/routing/scheduling into `api/flow/execution/`,
  `api/flow/routing/`, `api/flow/scheduler/` (WP-5, barrels retained).
- Extracted workflow canvas hooks into `frontend/src/components/workflow/hooks/` (WP-6).
- Moved log formatting seams into `shared/toolLogFormat/` (WP-7, barrel retained).
- Split the API client into domain clients under `frontend/src/services/`.
- Fastify route registrars extracted into `api/routes/` (thin facades).
- Documented reviewer roles per domain in `docs/ARCHITECTURE_DOMAINS.md` and `AGENTS-MAP.md`.

### Fixed

- Process-log and stage-report rendering across the unified log viewer.
- Mobile search box usability.
- Harness reliability and model-discovery edge cases.
- Deploy and CI gate stability (port draining, web-server boot timeouts).

### Notes

- Root curated history seeded from `scripts/generate-changelog.mjs --limit 30`
  on 2026-10-23; exhaustive per-commit history is available via the in-app
  Changelog dialog and `GET /deploy/changelog`.
- `CHANGELOG.md` is human-curated prose for readers of the repository.
  `ChangelogModal.jsx` continues to fetch `$PROD_DIR/changelog.json` via
  `GET /deploy/changelog` and render the baked commit list. The two channels are
  intentionally not wired together: do not make the modal parse this file, and
  do not block deploys on changelog curation.
