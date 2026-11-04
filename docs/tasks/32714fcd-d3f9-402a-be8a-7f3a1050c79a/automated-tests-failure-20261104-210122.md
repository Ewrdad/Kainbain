<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** Fix problems with the first time install experience Current problems include: - Local runner not being autodetected and configured - Unable to load in projects - Unable to create new projects as they require git remote that currently cant be put in in the UI  - Projects directoory sits empty - No uninstall for if the install messes up Overall the whole new user onboarding needs refinement
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 177.666s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

up to date, audited 117 packages in 1s

15 packages are looking for funding
  run `npm fund` for details

2 moderate severity vulnerabilities

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
✅ Settings duplicate check passed (32 files in 136ms)
▸ started Unit Tests (api)
▸ started Unit Tests (frontend)
▸ started Unit Tests (runner)
▸ started Linting (api)
▸ started Linting (frontend)
▸ started Frontend Build
▸ started Security Script Tests
▸ started Dependency Check
▸ started Dependency Audit Gate
▸ started Harness Self-Tests
▸ started Container Tests
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s), Frontend Build (30s), Dependency Check (30s), Harness Self-Tests (30s)
⏳ still running: Unit Tests (api) (1m00s), Unit Tests (frontend) (1m00s)
⏳ still running: Unit Tests (api) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
⏳ still running: Unit Tests (api) (2m30s)
Running Unit Tests (api)... [0;32mPASS[0m (169s)
Running Unit Tests (frontend)... [0;32mPASS[0m (169s)
Running Unit Tests (runner)... [0;32mPASS[0m (169s)
Running Linting (api)... [0;32mPASS[0m (169s)
Running Linting (frontend)... [0;32mPASS[0m (169s)
Running Frontend Build... [0;32mPASS[0m (169s)
Running Security Script Tests... [0;32mPASS[0m (169s)
Running Dependency Check... [0;32mPASS[0m (169s)
Running Dependency Audit Gate... [0;32mPASS[0m (169s)
Running Harness Self-Tests... [0;32mPASS[0m (169s)
Running Container Tests... [0;32mPASS[0m (169s)
Fast gate complete — starting Canary Tests alone (serial phase, no shared CPUs with the unit suites)...
▸ started Canary Tests
Running Canary Tests... [0;31mFAIL[0m (1s)
----------------------------------------------------------------------
Details for Canary Tests:

> kainbain@1.0.0 test:canary
> npm run test --prefix canary-e2e --


> canary-e2e@1.0.0 test
> node ../scripts/canary-preflight.mjs && playwright test

canary-preflight: Port 3399 is held by pid(s) 862019, which did not match the expected process signature; refusing to terminate them. Stop the process yourself (or set PORT / VITE_PORT) and retry.
canary-preflight: freed port 5299 (pid 862041)
----------------------------------------------------------------------

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.