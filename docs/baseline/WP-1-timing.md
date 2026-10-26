# WP-1 Baseline — Slowest-suite timing (API top 10, frontend top 5)

Commit: `d2f1e7690740774fb62520405a9644e1d3eab4122f7fd2a2083c4f64015dc0f1` — tree state: only additive WP-1 files.
Generated: `2026-10-22` Node: `v26.4.0` (engines: `^20.19.0 || >=22.12.0`).

## Method (why this is honest without a 2-hour sweep)

Per-suite standalone ranking for all 292 API + 261 frontend files via
`test:repeat` at `--runs 1` would cost ~90 minutes of serial vitest startups
on this host, dominated by per-process startup floor rather than test time.
Instead:

1. **Full-enumeration ranking** from one hermetic full-suite run per side with
   an added JSON reporter (test selection and env pins unchanged):
   `npx vitest run --reporter=default --reporter=json --outputFile=<tmp>`.
   Per-file duration = `endTime - startTime` from the JSON report.
   API full run: 82.69s wall. Frontend full run: 28.45s wall.
2. **Tail confirmation with the existing `test:repeat` tooling** at `--runs 3`
   for exactly the reported suites (top 10 API, top 5 frontend), run
   sequentially and standalone. Every reported wall time below is the
   repeat-tool `wallSecs`; the in-suite duration is shown for reference.
3. Raw repeat records: ephemeral JSONL under the OS temp dir (tool default);
   the tables below are the committed record.

Timeout budgets: API `testTimeout`/`hookTimeout` = 120s (`api/vitest.config.js`);
frontend = 60s (`frontend/vitest.config.js`). A hit would surface as FAIL with
a timeout signature — **no suite hit its budget (all PASS, max 11s)**.

## Slowest 10 API suites (repeat-tool, standalone, --runs 3, all 3/3 PASS)

| Rank | Suite | Standalone wall (3 runs) | In-suite duration | Timeout hit (120s) | Pyramid level / push-down note |
|---:|---|---|---:|:---:|---|
| 1 | `api/flow/humanGitSafety.contract.test.js` | 11 / 11 / 11s | 10.83s | N | Contract (git safety audit) — integration-level by nature; candidate only if budget tightens |
| 2 | `api/flow/stallRecovery.integration.test.js` | 7 / 7 / 8s | 7.56s | N | Integration (recovery paths) — advisory candidate |
| 3 | `api/routes/review.test.js` | 5 / 5 / 5s | 6.39s | N | Contract/API (route) — already at the right level |
| 4 | `api/git.integration.test.js` | 3 / 3 / 3s | 5.78s | N | Integration (real git) — advisory candidate |
| 5 | `api/work/taskFinalize.test.js` | 4 / 4 / 4s | 4.92s | N | Unit/integration mix — no action |
| 6 | `api/harnessResolution.api.test.js` | 6 / 6 / 6s | 4.85s | N | Contract (harness resolution) — already at the right level |
| 7 | `api/agent/harnesses/muse/msp/museMspSession.contract.test.js` | 5 / 5 / 5s | 4.47s | N | Contract (MSP transport) — already at the right level |
| 8 | `api/gitWorkspaceIsolation.integration.test.js` | 4 / 4 / 4s | 4.41s | N | Integration (workspace isolation) — advisory candidate |
| 9 | `api/agent/harnesses/shared/harnessScaffold.test.js` | 4 / 4 / 4s | 3.82s | N | Unit/integration mix — no action |
| 10 | `api/agent/harnesses/mock/mockHarness.registration.test.js` | 5 / 5 / 5s | 3.52s | N | Unit/integration mix — no action |

Next slowest (outside top 10, from JSON ranking, not repeat-confirmed):
`api/flow/stageExecution.test.js` (3.08s), `api/work/taskBranches.test.js` (2.81s),
`api/reviewAssembly.integration.test.js` (2.78s).

## Slowest 5 frontend suites (repeat-tool, standalone, --runs 3, all 3/3 PASS)

| Rank | Suite | Standalone wall (3 runs) | In-suite duration | Timeout hit (60s) | Pyramid level / push-down note |
|---:|---|---|---:|:---:|---|
| 1 | `frontend/src/components/tasks/TaskDetailOverlay.test.jsx` | 4 / 5 / 5s | 4.72s | N | Component (DOM render) — unit-level, no action |
| 2 | `frontend/src/components/tasks/TaskDetailPage.test.jsx` | 4 / 4 / 4s | 4.01s | N | Component (DOM render) — unit-level, no action |
| 3 | `frontend/src/components/observability/ObservabilityDashboard.test.jsx` | 3 / 3 / 3s | 2.71s | N | Component (render cascade) — unit-level, no action |
| 4 | `frontend/src/components/settings/ProjectSettings.test.jsx` | 3 / 3 / 3s | 2.56s | N | Component (DOM render) — unit-level, no action |
| 5 | `frontend/src/components/App.test.jsx` | 3 / 3 / 3s | 1.30s | N | Component (app shell) — unit-level, no action |

## Budget verdict

**No pre-agreed per-suite budget exists, and no suite comes close to its
framework timeout (slowest standalone: 11s vs 120s API; 5s vs 60s frontend).
Verdict: no suite exceeds budget; push-down candidates are named by rank only
(advisory, per plan — no test is moved by this WP).** If WP-8 sets a budget
(e.g. 30s standalone), the re-rank procedure is: re-run the two commands
below and diff against these tables.

## How to regenerate

```sh
# 1. Full-enumeration ranking (test selection unchanged; JSON is a sidecar):
cd api && npx vitest run --reporter=default --reporter=json --outputFile=/tmp/api-timing.json
cd frontend && npx vitest run --reporter=default --reporter=json --outputFile=/tmp/frontend-timing.json
# 2. Tail confirmation for the slowest N via the existing tool:
node scripts/repeat-tests.mjs --suite api --pattern <slowest-file> --runs 3
node scripts/repeat-tests.mjs --suite frontend --pattern <slowest-file> --runs 3
```

Pyramid mapping follows `docs/tasks/67789de0-4fac-48f6-91f8-1c8d3a7447c5/FRAMEWORKS.md`
§3 (unit / integration / contract-API / E2E). Timing runs were sequential and
standalone — never overlapped with other suites — so wall times are comparable.
