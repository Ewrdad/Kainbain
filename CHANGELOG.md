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

### Added

- Stage+config attestation for compliance proof: every per-stage wrap-up commit and its stage-history entry now carry the same task+stage config hash (git trailers plus a durable prose token with the commit SHA), verifiable offline with `node scripts/verify-stage-attestation.mjs --repo <path> --task <id>` (see the Stage Attestation site-docs article); clean-tree stages attest with an explicit null commit, and entries predating the feature stay valid without hashes (task d20f0c83).

- API key system for agents and external services (off by default, separate `KAINBAIN_API_KEYS_ENABLED` switch): admin-managed keys with catalogue roles plus narrowing scopes, secret shown once and stored hashed, task mutations gated per key grant, every key action flagged by key name in task history and the audit log, and a per-key usage view — browser sessions and Runners work unchanged with the switch on or off (task ac988ba8).
- Docs article `h2` sections collapse and expand via their headers (chevron toggle, keyboard-operable, Expand all / Collapse all above the article), and headers render larger and bolder for scanning (task e3369ccb).
- Task detail pages and `GET /tasks/:id` now show where a task works (branch, workspace-isolation mode, worktree path) via the additive `workingLocation` field, and a new `Develop Alongside KainBain` site-docs article teaches the pause-edit-resume, separate-branch, and review-gate flows; dirty-tree guard errors now name the blocking paths plus the safe next step for hand edits (task 8dafdce1).
- Per-stage Runner allow/block list at the bottom of stage settings (`Off` / `Only these runners` / `All except these runners`): dispatch, direct claims, and merge leases refuse ineligible Runners loudly while unrestricted stages behave exactly as before (task a3753643).
- Runner model auto-detect for every supported harness (pi, muse, antigravity, vibe, plus honest-empty opencode/codex legs) with per-harness counts and the first leg warning in Settings › Runners next to Re-detect, driven by the existing refresh command (task 2cbe91b6).
- Runner harness auto-detect now probes beyond PATH — standard install dirs (`~/.local/bin`, `~/bin`), each harness's own install dir, `KAINBAIN_*_BIN` overrides, and pi via its `~/.pi/agent` `models.json` snapshot — matching the backend's `discoverHarnesses`, so hosts with an SDK-only pi install (e.g. server2, whose service PATH lacks `~/.pi/agent/bin`) now detect pi and advertise its models in the fleet picker (task 2cbe91b6).
- Runner model discovery fails loud instead of reporting silent zeros: empty pi/muse scans record classified `PI_MODELS_EMPTY` / `MUSE_MSP_*` reasons with fixes in Settings, and re-detection names detected-but-unconfigured harnesses (`harness auto-detect also sees: …`) so a stale harness pin can no longer hide models; new installs record `auto` so every boot re-detects (task 2cbe91b6).

### Changed

- Central queue across all pipelines/projects: both dispatch paths (embedded scheduler and runner fleet) and the queue display now sort through one shared seam in `oldest-first` mode by default — the oldest waiting task runs next wherever it lives, with furthest-along as a percentage of its own pipeline as tiebreak — so waiting work on a pipeline you are not viewing no longer starves behind late-stage work on the focused one; the follow-on pass can no longer pre-empt work waiting past the starvation ceiling (built-in 15 min, `KAINBAIN_DISPATCH_MAX_WAIT_MS`), `GET /tasks/queue` without `?projectId=` returns the all-projects queue instead of the UI-focused project, and the queue popup shows per-project waiting counts plus the current worker. Rollback: `KAINBAIN_CENTRAL_QUEUE_ORDER=furthest-along` (task 16d6fbd6).
- Task surfaces read easier: card titles render larger and semibold with the status as a chip (colour dot plus text label), details-tab banner text steps up to body size, and long audit logs preview behind a Show all disclosure (task e3369ccb).
- Runner model precedence stays pin-wins by default (pinned installs skip discovery and advertise exactly their pin across updates); `KAINBAIN_RUNNER_MODEL_DISCOVERY_WINS=1` opts in to survey-q4 discovery-wins, where a non-empty auto-detect result replaces the pin (task 2cbe91b6).
- Consolidated root-level markdown files into `docs/`: moved `CI_SCRIPTS.md`, `PORTABLE_DEPLOYMENT.md`, `agent-docs/`, and `research/phase0-branch-dry-run.md`; deleted 13 obsolete one-off summaries and superseded phase-2 plans (task fc3acfff).
- Merged the ALL / FAILED / HUMAN ONLY board pills into the unified search bar as `!` system filters (e.g. `auth #Dev !failed`): same dropdown, chips, and Any/All toggle as `#` tags; unknown `!tokens` stay as text; future native filters register via `frontend/src/components/workflow/systemFilters/` (task c213d3a9).

### Fixed

- Runner fleet cards stay named on every pipeline page: `GET /runners/monitor` now carries each assignment's own project/task/stage identity, the widget renders it even when the viewer looks at another pipeline, and "Open task" jumps to the job in its pipeline (task 350ca162).
- Bottom-bar queue number counts only tasks waiting to be picked up (never running, blocked, paused, failed, cancelled, or waiting-human tasks), and the queue popup lists exactly that same set in dispatch order (task 6d3c9317).
- Survey answers survive later Runner stages: Runner task-file shipments merge into the backend survey (new rounds land, saved answers are kept) instead of overwriting them with stale worktree copies; the question-me prompt also names the exact backend-resolved file for alias/extension-less configs (task fbcaef1d).
- Bottom (now-playing) bar on mobile is horizontally scrollable, so all runners are reachable instead of only the first (task a654a254).
- Pipeline releases published from the deploy tip worktree are synced back to the primary `dist/` and verified there; a stranded release now fails Publish loudly, and the Update stage verifies the installed commit against the last-publish pointer instead of reporting "already current" (task a654a254).
- Bottom (now-playing) bar stays live with no page refresh: runner boxes follow stage/task changes within one 5s fleet poll (all fleet surfaces share a single poller), and the queue chip refreshes within about a second of task activity with a 15s safety poll; background tabs pause polling and catch up on return (task ed00c209).

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
