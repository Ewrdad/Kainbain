# WP-1 Baseline — Coverage (api/work, api/flow, api/house, shared)

Commit: `d2f1e7690740774fb62520405a9644e1d3eab4122f7fd2a2083c4f64015dc0f1`  Generated: `2026-10-22T22:01:00Z`  Command: npm run test:coverage (resolves to `npm run test:coverage --prefix api` → `vitest run --coverage`, configured in `api/vitest.config.js`)  Provider: `@vitest/coverage-v8` via vitest 5.0.3. Report-only; no thresholds enforced.

| Module group | Files | Lines (cov/tot %) | Branches (cov/tot %) | Functions (cov/tot %) |
|---|---:|---:|---:|---:|
| `api/work/` | 15 | 1523/1624 (93.78%) | 1481/1788 (82.83%) | 178/194 (91.75%) |
| `api/flow/` | 19 | 2964/3159 (93.83%) | 3186/3850 (82.75%) | 280/300 (93.33%) |
| `api/house/` | 3 | 36/37 (97.30%) | 30/31 (96.77%) | 7/7 (100.00%) |
| `shared/` | 11 | 867/951 (91.17%) | 1066/1294 (82.38%) | 161/174 (92.53%) |
| **Total (all four roots)** | 48 | **5390/5771 (93.40%)** | **5763/6963 (82.77%)** | **626/675 (92.74%)** |

## Per-file detail

### `api/work/` (15 files)
| File | Lines % | Branches % | Funcs % |
|---|---:|---:|---:|
| `gitLock.js` | 98.00 | 75.00 | 85.71 |
| `index.js` | 100.00 | 100.00 | 100.00 |
| `remediateNoVerdictRejections.js` | 98.53 | 86.15 | 100.00 |
| `taskAssets.js` | 97.22 | 85.92 | 100.00 |
| `taskBranches.js` | 89.16 | 86.55 | 65.22 |
| `taskDiffStat.js` | 95.16 | 96.43 | 100.00 |
| `taskErrors.js` | 97.35 | 97.60 | 100.00 |
| `taskFiles.js` | 96.88 | 81.08 | 100.00 |
| `taskFinalize.js` | 86.67 | 73.68 | 100.00 |
| `taskIdentity.js` | 100.00 | 100.00 | 100.00 |
| `taskLifecycle.js` | 99.11 | 87.80 | 100.00 |
| `taskPersistence.js` | 94.35 | 83.86 | 91.30 |
| `taskSurvey.js` | 89.63 | 71.72 | 88.00 |
| `taskWorkRoutes.js` | 99.37 | 82.93 | 100.00 |
| `taskWorkspace.js` | 74.07 | 53.06 | 75.00 |

### `api/flow/` (19 files)
| File | Lines % | Branches % | Funcs % |
|---|---:|---:|---:|
| `circuitBreaker.js` | 98.06 | 86.60 | 90.91 |
| `circuitSensors.js` | 99.04 | 82.03 | 100.00 |
| `commandLiveness.js` | 100.00 | 94.29 | 100.00 |
| `commandStages.js` | 90.93 | 83.84 | 87.10 |
| `executionQueue.js` | 95.56 | 84.52 | 100.00 |
| `humanGitSafety.audit.js` | 91.25 | 83.61 | 100.00 |
| `index.js` | 100.00 | 100.00 | 100.00 |
| `runAttribution.js` | 92.86 | 94.64 | 100.00 |
| `stageExecution.js` | 93.31 | 80.00 | 94.44 |
| `stageFailureRouting.js` | 92.72 | 76.05 | 87.18 |
| `stageHeartbeat.js` | 93.00 | 83.71 | 89.47 |
| `stageLifecycle.js` | 57.89 | 23.08 | 57.14 |
| `stagePolicy.js` | 98.46 | 94.33 | 94.12 |
| `stageResolution.js` | 100.00 | 100.00 | 100.00 |
| `stageTransitions.js` | 100.00 | 89.09 | 100.00 |
| `startupRecovery.js` | 95.31 | 78.38 | 100.00 |
| `taskControl.js` | 100.00 | 93.48 | 100.00 |
| `taskFlowRoutes.js` | 93.72 | 63.72 | 100.00 |
| `taskScheduler.js` | 94.22 | 89.56 | 95.35 |

### `api/house/` (3 files)
| File | Lines % | Branches % | Funcs % |
|---|---:|---:|---:|
| `fileWriting.js` | 100.00 | 100.00 | 100.00 |
| `index.js` | 100.00 | 100.00 | 100.00 |
| `projectStartup.js` | 96.77 | 96.55 | 100.00 |

### `shared/` (11 files)
| File | Lines % | Branches % | Funcs % |
|---|---:|---:|---:|
| `appUrl.js` | 96.61 | 91.03 | 100.00 |
| `modelAliases.js` | 95.86 | 82.95 | 100.00 |
| `modelKeys.js` | 98.84 | 97.84 | 100.00 |
| `promptLayout.js` | 98.70 | 87.27 | 100.00 |
| `reportTimestamp.js` | 100.00 | 87.50 | 100.00 |
| `stageDurations.js` | 91.36 | 85.21 | 78.95 |
| `stageKeywordTokens.js` | 100.00 | 100.00 | 100.00 |
| `stageTags.js` | 42.31 | 38.78 | 20.00 |
| `survey.js` | 88.95 | 78.73 | 100.00 |
| `toolLogFormat.fixtures.js` | 100.00 | 100.00 | 100.00 |
| `toolLogFormat.js` | 92.74 | 80.43 | 97.67 |

## How to regenerate

```sh
npm run test:coverage
cp api/coverage/coverage-summary.json docs/baseline/WP-1-coverage.json
node /tmp/gen-coverage-md.mjs  # regenerates this file (throwaway helper, not committed)
```

Raw `coverage-summary.json` keys are absolute paths on the generating host — normalize to repo-relative paths before diffing across machines. The committed `WP-1-coverage.json` is the byte-for-byte reporter output; this table is the portable record.
