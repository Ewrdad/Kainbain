<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** can you please break the project settings down to more tabs mainly want aliases in their own tab like skills . And maybe a one for custom file/web addresses. generally just neeeds to be easier to use. Maybe worth adding a settings search to the top right thats unused for project settings  ![image.png](assets/image.png)
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 667.216s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```

up to date, audited 117 packages in 888ms

15 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities

> kainbain@1.0.0 test
> node scripts/run-tests.mjs

Starting full project verification...
✅ Settings duplicate check passed (28 files in 83ms)
▸ started Unit Tests (api)
▸ started Unit Tests (frontend)
▸ started Linting (api)
▸ started Linting (frontend)
▸ started Frontend Build
▸ started Security Script Tests
▸ started Dependency Check
▸ started Dependency Audit Gate
▸ started Harness Self-Tests
▸ started Container Tests
⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s)
⏳ still running: Unit Tests (api) (1m00s)
⏳ still running: Unit Tests (api) (1m30s)
⏳ still running: Unit Tests (api) (2m00s)
Running Unit Tests (api)... [0;32mPASS[0m (132s)
Running Unit Tests (frontend)... [0;32mPASS[0m (132s)
Running Linting (api)... [0;32mPASS[0m (132s)
Running Linting (frontend)... [0;32mPASS[0m (132s)
Running Frontend Build... [0;32mPASS[0m (132s)
Running Security Script Tests... [0;32mPASS[0m (132s)
Running Dependency Check... [0;32mPASS[0m (132s)
Running Dependency Audit Gate... [0;31mFAIL[0m (132s)
----------------------------------------------------------------------
Details for Dependency Audit Gate:
check-dep-audit: 1 non-allowlisted high/critical finding(s):
  - [high] happy-dom@frontend range <=21.0.3 (#1243084 Happy DOM: Incomplete fix for CVE-2026-33943: unsanitized import alias leads to host code execution; #1243623 Happy DOM: SSRF via iframe and link stylesheet when parsing untrusted HTML; #1243658 Happy DOM has cookie scope forgery: no DNS-label boundary on Domain= matching , attacker origin sets victim cookies)
Fix the finding (preferred) or add a dated entry to scripts/dep-audit-allowlist.json.
----------------------------------------------------------------------
Running Harness Self-Tests... [0;32mPASS[0m (132s)
Running Container Tests... [0;32mPASS[0m (132s)
Fast gate complete — starting Canary Tests alone (serial phase, no shared CPUs with the unit suites)...
▸ started Canary Tests
⏳ still running: Canary Tests (30s)
⏳ still running: Canary Tests (1m00s)
⏳ still running: Canary Tests (1m30s)
⏳ still running: Canary Tests (2m00s)
⏳ still running: Canary Tests (2m30s)
⏳ still running: Canary Tests (3m00s)
⏳ still running: Canary Tests (3m30s)
⏳ still running: Canary Tests (4m00s)
⏳ still running: Canary Tests (4m30s)
⏳ still running: Canary Tests (5m00s)
⏳ still running: Canary Tests (5m30s)
⏳ still running: Canary Tests (6m00s)
⏳ still running: Canary Tests (6m30s)
⏳ still running: Canary Tests (7m00s)
⏳ still running: Canary Tests (7m30s)
⏳ still running: Canary Tests (8m00s)
⏳ still running: Canary Tests (8m30s)
Running Canary Tests... [0;32mPASS[0m (530s)

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.