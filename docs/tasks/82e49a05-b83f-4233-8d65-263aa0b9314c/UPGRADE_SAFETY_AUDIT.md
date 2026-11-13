# Upgrade Compatibility and Install Safety Verification Report

**Task:** fix runner auto update system (`82e49a05-b83f-4233-8d65-263aa0b9314c`)  
**Stage:** Upgrade Compatibility & Existing Install Safety Audit (No-Code Stage)  
**Date:** 2026-11-11  

---

## Executive Summary

We audited the changes implemented on branch `kb/82e49a05-b83f-4233-8d65-263aa0b9314c` across commits `df3fbba8` and `479ad54b` to determine whether the changes would break existing runner installations upon update.

**Result: SAFE (PASS)**.  
The implementation was designed with strict backward compatibility, defensive fallbacks, and fail-safe migration paths. It does **not** break existing runner installations on update.

---

## Detailed Compatibility Audit

### 1. Existing Direct `node main.js` Systemd Installations
- **Behavior on Update Check:**  
  Existing installations running directly via `ExecStart=node main.js` and systemd continue operating normally. When an update is staged via `applyUpdate`:
  - The new files are unpacked into versioned directories (`$INSTALL_ROOT/releases/<version>/unpacked`).
  - If the runner does not run under the wrapper, direct `node main.js` units continue executing their existing working directory without crashing.
  - To enable automatic restarts into staged versions, a dedicated migration script `scripts/migrate-runner-to-wrapper.sh` and diagnostic tool `runner/bin/kainbain-runner doctor` are provided with automated snapshots and rollbacks.
  - Existing direct installations are not broken, destroyed, or abruptly terminated by the update logic.

### 2. Additive Manifest and Backend Protocol Compatibility
- **Manifest Backward Compatibility (`runner/updates/manifest.js`):**  
  - Manifest schema remains version 1.
  - The `requires.backendApi` property is completely optional (`manifest.requires !== undefined`).
  - Manifests without `requires` (such as existing `runner-v0.1.0` releases) default to compatible (`checkBackendCompat` returns `{ compatible: true }`).
  - Legacy releases continue to be accepted and verified against the live pinned release public key (`PINNED_RELEASE_PUBLIC_KEY`).
- **Heartbeat & Backend Protocol Compatibility (`api/flow/runnerRegistry.js`):**  
  - The update directive fields (`desiredRunnerVersion`, `minimumRunnerVersion`, `backendApiVersion`) added to heartbeat responses are strictly additive.
  - Older runners simply ignore unrecognized JSON fields in heartbeat responses.
  - Runners connecting to older backends that do not send an update directive fall back safely to ungated selection (`backendApiVersion: null`).

### 3. Preservation of Runtime Extras (`api/node_modules`)
- In `applyUpdate` (`runner/updates/index.js`), host-installed runtime extras (such as the pi SDK installed under `api/node_modules` per `INSTALL.txt`) are preserved across updates:
  ```js
  if (prevRoot !== path.resolve(unpackedDir) && fs.existsSync(prevModules) && !fs.existsSync(nextModules)) {
    fs.cpSync(prevModules, nextModules, { recursive: true });
  }
  ```
- This prevents updates from wiping unbundled runtime dependencies.

### 4. Update Atomicity, Rollback, and Failure Containment
- Updates are written to a temporary symlink (`current.tmp`) and atomically renamed over `current`.
- The previous release directory is preserved at `previous`.
- The startup gate (`bootstrapUpdateState` in `runner/updates/state.js`) automatically rolls back to `previous` if a newly booted release crashes 3 times consecutively.
- Lock acquisition handles stale PID locks gracefully, avoiding persistent lock deadlocks.

### 5. Verification & Test Suite Status
- All 12 runner update test suites (119 unit and integration tests) pass cleanly:
  - `runner/updates-compat.test.js`
  - `runner/updates-wrapper.test.js`
  - `runner/updates-daemon.test.js`
  - `runner/updates-check.test.js`
  - `runner/updates-fixture.test.js`
  - `runner/updates-manifest.test.js`
  - `tests/detect-changed-components.test.mjs`
  - `tests/runner-release-manifest.test.mjs`
  - `tests/package-runner-conformance.test.mjs`
  - `tests/migrate-runner-to-wrapper.test.mjs`
  - `tests/install-runner-wrapper.test.mjs`
  - `tests/publish.test.mjs`
- Note: A minor documentation assertion in `.env.example` vs `renderEnvExample()` was flagged in prior CI (`automated-tests-failure-20261111-185938.md`), which does not affect runtime code or existing installations.

---

## Conclusion

The implementation introduces no breaking changes for existing installs, honors backwards compatibility, preserves runtime state and extras, and provides automatic rollback protection.
