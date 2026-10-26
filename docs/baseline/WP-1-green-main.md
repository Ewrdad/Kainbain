# WP-1 Baseline — Green-main record (API, frontend, canary)

Commit at capture: `d2f1e7690740774fb62520405a9644e1d3eab4122f7fd2a2083c4f64015dc0f1`  Node: `v26.4.0` / npm `11.18.0`  Captured: 2026-10-22 (untouched tree; only additive WP-1 artifacts on top).

Machine-readable copy: `docs/baseline/WP-1-green-main.json` (same commands/counts).

## Gate results

| # | Gate | Command | Result | Details |
|---:|---|---|---|---|
| 1 | Lint (api) | `npm run lint:api` | PASS | 0 errors, 340 warnings (all `security/detect-*`, existing) |
| 2 | Lint (frontend) | `npm run lint:frontend` | PASS | 0 errors, 153 warnings (all `security/detect-*`, existing) |
| 3 | Docs check | `npm run docs:check` | PASS | 37 tests passed, 53 doc files scanned |
| 4 | API unit | `npm run test:api` | PASS | 292 test files; 5312 tests passed, 1 skipped, 0 failed; 83.7s |
| 5 | Frontend unit | `npm run test:frontend` | PASS | 261 test files; 3604 tests passed, 0 failed; 28.1s |
| 6 | Canary smoke | `npm run test:canary` | PASS | 125 tests passed; ~6.3m; default (non-visual) selection — visual specs run via `npm run test:visual` |

Coverage (report-only) is recorded separately: `docs/baseline/WP-1-coverage.md` / `.json` (5390/5771 lines, 93.39%; 5763/6963 branches, 82.76%; 626/675 functions, 92.74% across api/work, api/flow, api/house, shared).

## Regression contract for WP-2 through WP-8

A later split WP passes only if all of the following hold on its branch:

1. **Lint**: 0 errors on both sides (security warnings remain advisory).
2. **Docs**: `npm run docs:check` PASS with at least 37 tests / 53 doc files.
3. **Test counts**: API ≥ 292 files / 5312 passing (plus the 1 known skipped), frontend ≥ 261 files / 3604 passing, canary ≥ 125 tests.
4. **Coverage**: per-module lines/branches/functions ≥ the WP-1 baseline values in `WP-1-coverage.md` (report-only until WP-8 enforces thresholds).

## How to regenerate this record

Run in order on a clean tree (`git status --short` empty):

```sh
npm run lint:api
npm run lint:frontend
npm run docs:check
npm run test:api
npm run test:frontend
npm run test:canary
```

Paste the counts into `WP-1-green-main.json` and this file, then capture the commit SHA (`git rev-parse HEAD`). Note: canary spawns its own web servers on scratch ports :3399/:5299; rerun `npm run test:canary` only after those are free.