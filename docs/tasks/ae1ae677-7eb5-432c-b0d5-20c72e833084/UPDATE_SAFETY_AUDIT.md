# Audit: Update Safety and Existing Installation Compatibility

**Task:** Give runners a build identity and stale-code detection (`ae1ae677-7eb5-432c-b0d5-20c72e833084`)  
**Stage:** Update Safety Verification (Docs-Only)  
**Date:** 2026-11-14  

---

## 1. Executive Summary

We audited the changes implemented on branch `kb/ae1ae677-7eb5-432c-b0d5-20c72e833084` to verify whether the build identity and stale-code detection features could break existing runner installations when they update or interact with the backend.

**Verdict: SAFE (PASS)**.
The implementation preserves backward and forward compatibility across all layers:
- Existing runner installations updating via `applyUpdate` receive valid bundles stamped with version and build identity without breaking file layout expectations.
- Unupdated (legacy) runners reporting to an updated backend are accepted without errors or schema rejections.
- Updated runners reporting to older backends send backwards-compatible additive fields that do not disrupt older parsers.
- Dev runners running directly from git checkouts and production runners packaged as tarballs operate without crashes, graceful degradation is implemented for all fallback paths, and version mismatch warnings never block execution.

---

## 2. Detailed Findings

### A. Packaging & Packaging Layout (`scripts/package-runner.mjs`)
- `packageRunner` writes `version.json` containing `runnerVersion` and `build` (`{ sha, builtAt, dirty }`) into **both** required locations:
  1. Staging root (`version.json`), read by the self-updater's version checker and wrapper doctor.
  2. Subdirectory (`runner/version.json`), read by the daemon at runtime (`new URL("./version.json", import.meta.url)`).
- Verified via `tests/package-runner-conformance.test.mjs`:
  - `a packaged bundle stages through the real applyUpdate`: Passes.
  - `stamps the release version and build into both version.json copies`: Passes.
  - `a staged bundle's daemon-readable copy self-identifies as the release`: Passes.
- The bundle layout (`runner/`, `shared/`, `api/`, `version.json`, `INSTALL.txt`) is strictly preserved; runtime extras migration (`api/node_modules`) inside `applyUpdate` continues to operate cleanly.

### B. Daemon Boot & Stale-Code Detection (`runner/daemon.js`)
- `RUNNER_BUILD` resolution uses fallback resolution:
  - If stamped in `version.json` (packaged release), the stamp is used directly.
  - If running in a git checkout without a package stamp, it safely queries `git rev-parse HEAD` and `git status --porcelain`.
  - If git is absent or fails, it gracefully falls back to `{ sha: null, builtAt: null, dirty: null, source: null }` without throwing.
- Stale-code detection (`snapshotCodeTree` / `hasCodeChangedSinceBoot`) is strictly warn-only:
  - Missing directory, unreadable tree, or empty baseline returns `false` (no false positives, fails quiet).
  - Ignores `.git` and `node_modules` to avoid flagging harmless file updates.
  - Each heartbeat receives a defensive clone of `RUNNER_BUILD` (`build: { ...RUNNER_BUILD }`), preventing middleware mutations from corrupting module state.

### C. Backend Normalization & Protocol Compatibility (`api/flow/dispatch/normalizeCapabilities.js`)
- `sanitizeVersions` handles all legacy and future shapes:
  - Legacy runners sending `{ protocol: 'v1', runner: '0.1.0' }` without `build` pass through untouched; `build` is not injected if absent.
  - `build`, `bootedAtMs`, and `codeChangedSinceBoot` are sanitized leniently.
  - Any unknown future keys in `facts.versions` pass through untouched.
  - Malformed version objects or invalid types degrade gracefully to null or are deleted rather than throwing a 400 rejection.
- Heartbeat registration and updates remain non-blocking.

### D. Settings UI & Survey Constraints (`frontend/src/components/settings/`)
- Adheres to Survey round-2 q15 constraint: version or build mismatch produces an advisory warning banner and **never blocks** task claims or runner execution.
- If `build` is absent (legacy runner), the UI renders standard version info without errors or crash loops.

### E. CI Version Bump Gate (`scripts/check-runner-version-bump.mjs`)
- Enforces version bumps on releases touching runner code while ignoring docs (`.md`, `.markdown`, `.mdx`) and test files (`.test.*`, `.spec.*`).
- Existing release workflows are not disrupted for non-runner changes.

---

## 3. Test Verification
All touched and related test suites pass:
- `runner/daemon.test.js` (build identity, factsFor, codeChangedSinceBoot)
- `runner/updates-*.test.js` (all 103 update check, verify, manifest, and apply tests pass)
- `tests/package-runner-conformance.test.mjs` (all conformance and staging tests pass)
- `tests/check-runner-version-bump.test.mjs` (gate logic tests pass)
- `api/flow/dispatch/normalizeCapabilities.test.js` (15/15 tests pass via vitest)
- Frontend unit tests: `runnerConfigHelpers.test.js` and `RunnerConfigurationSection.test.jsx` (111/111 tests pass via vitest)
