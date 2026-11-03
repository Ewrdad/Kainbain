# Implementation Plan — Option A: external versioned artifact store (GitHub Releases) as runner update channel

Source decision: `docs/tasks/.../idea-20261031-131801.md`, approved architecture discussion 2026-10-31.
Risk register: `docs/MuseCodeHackathon2026/Portability/RiskAssessment.md`, esp. **R05** (supply chain), **R03** (backend SPOF), **R11** (version/protocol skew).
Portability baseline: `docs/adr/0008-portable-runner-decisions.md` (D7), `docs/adr/0009-runner-protocol-sketch.md`.
Survey constraints: `docs/tasks/5c3497b5-dace-441d-8350-75b59108a7fc/SURVEY.md`.

This document is the plan only. No code changes are made by this stage.

---

## 0. Survey decisions applied (deviations from the raw decision doc)

The "question-me" survey refined three decisions. These take precedence over the original decision text:

| Decision-doc statement | Survey refinement (authoritative for implementation) |
|---|---|
| Build artefact as Node SEA single executables | **Ship a normal versioned archive (tar.gz / zip) that runs on the host's existing Node runtime** (q4). The runner's self-update swaps an extraction directory, not a binary. Shell wrapper + symlink flip. |
| All six platform targets | **Linux + macOS only, x64 + arm64** (q5). Windows deferred. Four assets per release, not six. |
| Refuse dispatch to below-min runners with 409 (R11) | **Show an "update available" badge and still dispatch when the *API contract is unchanged***; block (409) only when the API/protocol contract differs. The backend then tells the runner to update on its next task request (q6 note). |
| Release = GitHub Releases | GitHub Releases only (q2). |
| Signing = minisign/cosign keyless | minisign, one pinned public key embedded in the runner (q3). |
| Scope | Full end-to-end Option A in this pass (q1): CI + runner self-update + backend gating + fleet matrix UI + docs + ADR. |
| Runner-side options | Air-gapped override URL (`KAINBAIN_RUNNER_UPDATE_URL`) **and** rollback after a failed boot (q7). **Not** in v1: pre-release/canary opt-in downloads, per-runner pinned version (`KAINBAIN_RUNNER_PINNED_VERSION`). Canary releases are produced by CI but runners skip them automatically. |
| Tests | Unit tests for verification + mocked update flows (q8), plus one integration test against a local release-style HTTP fixture. |

Consequences carried through the plan:
- No Windows packaging/signing in CI (but keep asset-name grammar extensible).
- No Windows self-update code path in v1 (platform guard).
- No pre-release opt-in env var in v1 (pre-releases are invisible to runners).
- Backend does **not** ship or mirror runner code (Option B rejected), only coordination.

---

## 1. Goals and non-goals

### Goals (acceptance-criteria mapping)

| # | Criterion | Plan section |
|---|---|---|
| A1 | CI publishes a signed runner release on tag | §5 |
| A2 | Old runner picks it up on idle, verifies, updates, re-registers, fleet matrix shows new version | §3, §4, §6 |
| A3 | Tampered asset/manifest fails verification; runner keeps old version and alerts | §3.3, §8 |
| A4 | Backend refuses dispatch to a below-min-version runner; dispatch resumes after update | §4, §6 |
| A5 | Rollback to previous release works by reverting "latest" pointer | §5, §3.5 |
| A6 | Docs updated (PORTABLE_DEPLOYMENT + New Runner Onboarding) + ADR under `adr/` | §7 |

### Non-goals
- Backend serving/pushing runner code (rejected, R05).
- Raw S3 without a mirror/secondary (only air-gapped override URL, which may point at any S3-compatible HTTP server).
- Windows runners in v1.
- Per-runner pinned versions and canary opt-in in v1.
- Cosign/GPG (minisign only).

### Trust model (Invariant)
The runner trusts **only** the minisign public key compiled/pinned into its own source. It does not trust the backend, the GitHub API, the asset store, or any downloaded manifest beyond what that pinned key signs. Verification order is fixed: signature → manifest → asset sha256. Any failure aborts before extraction, keeps the current installation untouched, and reports to the backend.

---

## 2. "Make change easy, then make the change"

Before feature work, land low-risk preparatory edits so the real change is mechanical:

### Phase E0 — Easy (research + refactoring, no behaviour change)
1. **Research spikes (write up findings as short notes in the ADR/refresh)**:
   a. minisign library in Node: evaluate `minisign` npm package availability, `minisign` CLI (apt/brew), and `sodium-native`. Decide verification path. Prefer the `minisign` CLI if installed; fallback to a vendored JS implementation verified by tests. Document install requirement in `PORTABLE_DEPLOYMENT.md`.
   b. GitHub Releases API shape: `/repos/{owner}/{repo}/releases/latest` vs. `/releases` with semver sort and pre-release filtering; rate limits for unauthenticated (60/hr) and how to add `KAINBAIN_RUNNER_GITHUB_TOKEN` (optional) later. Confirm `assets[].browser_download_url`.
   c. Archive layout + restart mechanics: how an idling Node daemon replaces its own code directory and restarts cleanly (process exit → wrapper restart; or `process.execArgv` + `spawn` detached). Decide a thin **wrapper script `runner/bin/kainbain-runner`** (shell on Unix, `.cmd`/`.ps1` deferred) that `exec`s `node "$ROOT/current/runner/main.js"` after resolving the symlink.
   d. Platform detection: `process.platform`/`process.arch` → `linux-x64`, `linux-arm64`, `darwin-x64`, `darwin-arm64`. Node SEA is no longer relevant; just asset selection.
   e. atomic directory swap on Unix: `ln -sfn versions/<v> current.tmp && mv -Tf current.tmp current` (or `renameSync`). Confirm `fs.renameSync` over symlink works on both Linux/macOS.
2. **Extract runner product version to a single source**: today `RUNNER_VERSION = "0.1.0"` is hardcoded in `runner/daemon.js` while `runner/version.json` carries `apiVersion`. Add a `runner/version.json` field `runnerVersion` (or keep `apiVersion` for API compat and add `runnerVersion`) and have `daemon.js` read it like `RUNNER_API_VERSION`. Tests in `runner/daemon.test.js` must be updated to assert both. This makes the manifest version and runner self-identification agree.
3. **Config knob scaffolding on backend**: add runner-version config entries (`KAINBAIN_RUNNER_MIN_VERSION`, `KAINBAIN_RUNNER_RECOMMENDED_VERSION`) to `api/config/schema.js` with doc + defaults; no consumption yet. Run `npm run docs:check` to keep `.env.example` in sync.
4. **Env surface on runner**: add `KAINBAIN_RUNNER_UPDATE_URL` (default `https://api.github.com/repos/Ewrdad/Kainbain/releases/latest` semantics — but treat the base override as a full manifest-or-assets base; see §3.4) to `runner/config.js` (only parsed, not used yet). Follow the existing config pattern and add to `runner/config.test.js` only if needed.

### Phase E1 — Shared library stubs (types + helpers, tests)
1. Create `runner/updates/` (or `runner/updater/`) module with pure helpers and their unit tests:
   - `versionCompare.js` — semver compare (use `semver` if already a dependency; otherwise add to runner `package.json` — check root/api deps; npm `semver` likely transitively available; prefer adding explicit dependency).
   - `platformAssetName(version, platform, arch)` → canonical asset filename.
   - `manifestSchema.js` — validate a manifest object (`schema`, `component`, `version`, `assets[]` with `platform`, `arch`, `filename`, `sha256`, `size`, `minCompatibleBackend`).
   - `verifyManifest(manifest, sig, publicKey)` and `verifyAsset(filePath, expectedSha256)`.
   - `updateState.js` — read/write `~/.kainbain/runner/update-state.json` recording `{ previousVersion, pendingVersion, startedAt, attempts }`.
2. Backend: add `api/flow/runnerVersionCompat.js` exporting `runnerVersionAtLeast(runnerVersion, minVersion)` and `updateAvailable(runnerVersion, recommendedVersion)` pure helpers, unit-testable. No route wiring yet.
3. Frontend: add `updateAvailable`/`runnerVersion` fields to the runner service types (JSDoc/TS if applicable) only; no UI.

_Phase E0/E1 must pass existing tests (`npm run test:unit`) before proceeding._

---

## 3. Runner side — updater and self-update-on-idle

### 3.1 Module layout (new files)
```
runner/
  updates/
    index.js            # orchestrator: checkForUpdate, downloadAndVerify, applyUpdate
    platform.js         # platform/arch → asset key, validation
    manifest.js         # fetch, schema validate, semver handling
    verify.js           # minisign signature + sha256 verification
    state.js            # update-state read/write, rollback marker
    download.js         # atomic download to versioned temp dir
  updater.test.js       # mocked HTTP + temp dirs
  verify.test.js
  platform.test.js
```
Also add to `scripts/run-tests.mjs` explicit runner test list: `runner/updates.test.js` (or the individual file names chosen). Follow the pinned-list convention (a new suite file must be named there or it never runs).

### 3.2 Configuration (`runner/config.js`)
New env vars (all documented in `runner/README.md` and `.env`-equivalent runner docs):
- `KAINBAIN_RUNNER_UPDATE_URL` — full override. Semantics:
  - If it ends in `manifest.json` or `/releases/latest`-style GitHub API URL, fetch manifest directly.
  - Otherwise treat as a **base URL** and request `${base}/manifest.json`, `${base}/manifest.json.minisig`, and `${base}/${asset.filename}`.
  - Default: `https://api.github.com/repos/Ewrdad/Kainbain/releases/latest`.
- `KAINBAIN_RUNNER_AUTO_UPDATE` — bool, default `true`. When false, checks are skipped.
- `KAINBAIN_RUNNER_UPDATE_CHECK_INTERVAL_MS` — jittered poll base (default 3_600_000; min 300_000). Jitter ±20%.
- `KAINBAIN_RUNNER_UPDATE_WORK_ROOT` (optional) — defaults to `KAINBAIN_RUNNER_WORK_ROOT`'s sibling `runner-install` (state lives with installation, not task worktrees).
- `KAINBAIN_RUNNER_INCLUDE_PRERELEASE` — **not in v1** (survey). Runners never install pre-releases.

### 3.3 Update check (`updates/index.js`)

Algorithm:
```
checkForUpdate({ config, fetchImpl, currentVersion, logger }):
  if (!autoUpdate) return null
  if (runner has active task/lease) defer (caller gates on idle)
  raw = fetch latest release pointer:
    if updateUrl is GitHub releases/latest:
       GET updateUrl (Accept: application/vnd.github+json)
       if (response.prerelease) skip → return null   // v1 never takes prereleases
       manifestUrl = asset named manifest.json (or releases/{tag}/manifest.json)
    else:
       GET ${base}/manifest.json  (and sig)
  fetch manifest + sig
  verify sig with PINNED_MINISIGN_PUBLIC_KEY (embedded constant in runner binary/source)
  if verify fails: alert backend (new client method) + log; return { ok:false, reason }
  if manifest.version <= currentVersion (semver): return null
  platform = detectPlatform(); if no matching asset: alert + return null
  assetMeta = manifest.assets.find(a => a.platform===platform && a.arch===arch)
  return { version: manifest.version, manifest, assetMeta }
```
Alerting to backend on failure: needs an endpoint or reuse `progress`/heartbeat facts. Recommended minimal: heartbeat facts gain `updateStatus: { state: "failed", reason, at }` and backend stores it on the runner record (already stores `facts`). Plus `logger.error` locally. This avoids a new endpoint. If desired, add `POST /runners/update-alert` in §4.5 (optional).

Idle gating:
- The daemon's dispatch/idle loop already tracks consecutive empty polls (`DISPATCH_IDLE_LIMIT`). Hook `checkForUpdate` into the **idle branch** (after `NO_CLAIMABLE_TASKS`/`NO_CAPABLE_MATCH` and after any claim completion), not into the busy path.
- For explicit (non-dispatch) single-task runners, hook after `runOnce` completes and before process exit (offer update between assignments if multiple), but do not interrupt an active task.
- Concurrency lock: `update-state.json` lock file (`flock`-equivalent or atomic `O_EXCL` create) prevents two overlapping updater invocations if heartbeat + idle both fire.

### 3.4 Verification (`verify.js`)
- `verifyManifest(manifestBuffer, sigBuffer, publicKeyPemOrMinisignKey)`:
  - call minisign verify (CLI or library); returns boolean.
  - parse manifest only **after** verification (never trust parsed fields for control flow before verification).
- `verifyAsset(filePath, expectedSha256)`: stream sha256, compare hex (constant-time compare).
- If either fails: delete the downloaded directory, record `updateStatus=failed`, keep running.

Pinned public key:
- Stored as a constant in `runner/updates/verify.js` (and mirrored in source tree). Comment notes: "MUST NOT be fetched from the network; rotate only via a new runner release signed by the old key or bootstrap."
- Include the *public* key (minisign `RW...`) — no secret.
- Document key custody (minisign secret key in GitHub Actions secret `RUNNER_RELEASE_SIGNING_KEY`, password in another secret).

### 3.5 Download + atomic apply (`download.js`, `state.js`)
Download layout:
```
$RUNNER_INSTALL_ROOT/               # default ~/... or explicit
  releases/                         # never remove
    1.2.3/
      manifest.json
      manifest.json.minisig
      kainbain-runner-1.2.3-linux-x64.tar.gz
      unpacked/                     # extracted tree
  current -> releases/1.2.0/unpacked  # symlink (active)
  previous -> releases/1.1.9/unpacked # rollback target (kept one version)
  update-state.json
  boot-ok.marker
```
Steps:
1. Download asset to `releases/<v>/<filename>.part`, verify sha256, rename to final (atomic). Abort + cleanup on mismatch.
2. Extract to `releases/<v>/unpacked` (use `tar -xzf`; zip via `unzip` if needed; v1 Linux/macOS both have tar).
3. Re-run verification on extracted `runner/version.json`? Optional sanity: ensure `runnerVersion === manifest.version`. 
4. Write `update-state.json`: `{ from: currentVersion, to: manifest.version, appliedAt, status: "pending-boot" }`.
5. Flip symlinks:
   - `previous` = old `current` target (if different)
   - `current` = new unpacked dir
   (atomic rename)
6. Spawn a new daemon detached (same argv/env, but resolved through `current`) OR set a `restartRequested` flag and `process.exit(0)` so an outer supervisor restarts from `current`. Preferred: the daemon, when auto-updating, exits 0 after flipping; a systemd/launchd/Docker entrypoint restarts it. For interactive `node runner/main.js` users, document "restart the runner after update".
   - Because install as npx/node source is not supervised, provide `runner/bin/kainbain-runner` wrapper that loops restart on exit code (0 = restart, non-zero = stop). The wrapper is the supported entrypoint; direct `node` is dev-only.
7. Keep exactly one previous version; delete any `releases/<older>` except current + previous (garbage collection) only after a successful boot of the new version.

Failed-boot rollback:
- On startup, `main.js` reads `update-state.json`. If `status === "pending-boot"`:
  - increment `bootAttempts`.
  - if `bootAttempts >= 3` (or immediate crash loop detected by mtime within e.g. 30s), flip `current` back to `previous` and set state `rolled-back`, alert backend via heartbeat facts, log loudly.
  - else set state `booted` and unref; on first successful claim/completion or heartbeat, mark `success` and allow GC of therolled-back (now previous-new) dir.
- Simpler robust approach: mark pending; after first successful heartbeat, mark `success`. If process exits before `success` three times in a row, rollback. Use a `bootAttempts` counter and `lastBootAt`. 
- Tests: simulate state + symlink, run `main` bootstrap function, assert rollback decision. Keep these unit-testable by extracting a `bootstrapUpdateState({ root, fs })` pure-ish function.

### 3.6 Idle integration point in `runner/main.js`
- The dispatch loop idle branch (consecutive empty polls) calls `updates.checkAndApplyIfIdle`. 
- Add `--self-update-now` CLI flag? Optional; helpful for tests. Not required by acceptance; can include as a debugging hook.

---

## 4. Backend coordination (no code transfer)

### 4.1 Config knobs (schema entries)
Add to `api/config/schema.js`:
- `runnerMinVersion` / `KAINBAIN_RUNNER_MIN_VERSION` (string, default current runner version e.g. `"0.1.0"`). Semver. Runner product version, not API version.
- `runnerRecommendedVersion` / `KAINBAIN_RUNNER_RECOMMENDED_VERSION` (string, default same as min OR a pinned "latest known" default). Used for the UI badge.
Both in group `tasks`, documented. These are **operator knobs**, not fetched from GitHub.

(Do **not** add `KAINBAIN_RUNNER_PINNED_VERSION` — survey excluded per-runner pinning.)

### 4.2 Runner record fields
`runnerRegistry` already stores `facts` from heartbeats (including `facts.versions.runner` and, we advise, `facts.updateStatus`). Add derived, persisted-on-heartbeat (or computed in `_public`) fields:
- `runnerVersion` = `facts?.versions?.runner ?? null`
- `updateAvailable`: boolean, `semver.lt(runnerVersion, runnerRecommendedVersion)` when both valid; false otherwise.
- `belowMinimum`: boolean, `!semver.satisfies(runnerVersion, >=min)` (or explicit `semver.lt`).
- `apiCompatible`: from existing `runnerApiCompatible(facts.versions.api)`.
- `updateStatus`: `facts.updateStatus ?? null` (for alert surfacing).

Backward compat: old runners lacking `updateStatus` or version are treated as below-minimum possibly, but we must not break old runners' registration. Existing behaviour accepts missing api version as compatible (`runnerApiCompatible` returns ok true when blank). For runner product version missing, treat as below minimum? That would block all old runners before update capability exists — actually desired only after min is raised. Default min = current runner version (`0.1.0`), so a runner reporting `0.1.0` passes. A runner reporting no version: permissive default (true), with `updateAvailable` possibly true, to avoid sudden lockout. Document this.

### 4.3 Version handshake surfaces
- `/runners/register` and `/runners/heartbeat` already reject incompatible API versions (409 `PROTOCOL_VERSION_UNSUPPORTED`). Add to their responses (and to `_public` record) the fields in §4.2 when applicable, so the runner learns `updateAvailable` and `minimumVersion` on next heartbeat. This satisfies "backend tells the runner next time it requests a task to update" (survey note).
- Heartbeat response extension: `{ ..., update: { minimumVersion, recommendedVersion, updateAvailable, belowMinimum, apiCompatible } }`. Old runners ignore unknown fields.

### 4.4 Dispatch gating (relaxed per survey)
In `POST /runners/dispatch` and the direct `POST /tasks/:id/claim`:
1. Compute `apiCompat` (existing). If `!apiCompat.ok`: **block** 409 `PROTOCOL_VERSION_UNSUPPORTED` (legacy behaviour).
2. Compute `belowMinimum`. If below minimum **and** the runner version is known **and** `KAINBAIN_RUNNER_MIN_VERSION` has been raised above it:
   - If `apiCompat.ok` (same contract) → **allow dispatch**, include `updateAvailable: true` and `minimumVersion` in the response body, increment a metric/miss? Not a miss (it dispatched). Log at info.
   - If `!apiCompat.ok` → already blocked.
   Survey explicitly: "if the api differs then block but if the api contract is the same allow dispatch". So the matrix is:
     - API differs → 409 block (existing).
     - API same + below min recommended/required? → dispatch + badge.
   Actually this means min-version never blocks by itself? Then A4 "Backend refuses dispatch to below-min-version runner" conflicts. Reconciliation: the decision doc requires 409 refusal for below min. Survey softens. The right resolution: **block only when the running runner is below the *minimum compatible* version** (i.e., a version the backend knows it cannot serve correctly), but that minimum is defined so that a below-it runner is also API-incompatible in practice (bump min only when making breaking API changes). For normal additive releases, min stays put and recommended rises → badge only. For a breaking change, bump min AND api range → block via API check. This satisfies both: A4 holds for breaking changes; survey holds for routine updates.
   Document this contract explicitly in the ADR.

   Concretely, add an explicit `KAINBAIN_RUNNER_MIN_VERSION` compare in dispatch: if `runnerVersion` known and `< min` → 409 `RUNNER_VERSION_BELOW_MINIMUM` with `{ minimumVersion, runnerVersion }`. Default min = current bundled version; operators raise it for breaking releases. Badge logic uses recommended (>= min). This is clearest and matches decision doc; the survey note is handled because routine releases bump recommended but not min, yielding badge-without-block. State this clearly so tests cover both a min-raising (block) scenario and a recommended-only (badge) scenario.

3. On block, runner receives 409 and (per §3.3) must not retry the same dispatch blindly; it should enter update check and return `NO_CLAIMABLE...`? Actually a 409 from dispatch means "update then retry"; the runner should call `checkForUpdate`, apply if available, re-register, then poll. If no update available (already on min but mismatched api range?), idle-loop with backoff and alert.

### 4.5 Alert channel (optional but recommended)
Add `POST /runners/:id/update-alert` (operator-auth? runner-auth with credential) accepting `{ reason, detail, at }`, stored as `lastUpdateAlert` on the runner record and shown in the fleet UI. Heartbeat facts remains the primary path; endpoint is a convenience for immediate alerts. Scope optional; if time-constrained, facts-only is acceptable and reduces API surface. Plan recommends facts-only for v1, endpoint deferred, to keep changes smaller. (Final judgement: do facts-only; document the decision.)

### 4.6 Fleet matrix UI (`frontend/`)
Existing runners service at `frontend/src/services/runners/index.js`. Enhancements:
- Settings → Runners table: add columns `Runner version`, `API version`, `Compatibility`, `Update` badge.
- Add "update available" badge component (reuse existing badge styling).
- Per-runner detail drawer: show min/recommended, `belowMinimum`, `updateStatus`, last alert.
- Poll existing monitor endpoint (already used by PerRunnerTasksWidget?) and list endpoint; no new endpoint beyond enriched records.
- Tests: frontend component tests for badge rendering given mock runner records (extend existing runs).

### 4.7 Reporting after update
After applying update and restarting, the new daemon re-registers/heartbeats with the new `facts.versions.runner`. Backend record updates; UI flips. Ensure `RUNNER_VERSION` read from version.json so the new value is correct (Phase E0.2). This is the closed loop for A2.

---

## 5. Release pipeline (CI)

### 5.1 New files
```
.github/workflows/runner-release.yml
scripts/package-runner.mjs             # builds per-platform tarballs
scripts/generate-runner-manifest.mjs   # manifest.json
scripts/runner-pinned-key/              # PUBLIC key only (committed)
  runner-release.pub
```
Secrets required in GitHub (document, not commit):
- `RUNNER_RELEASE_SIGNING_KEY` — base64 minisign secret key.
- `RUNNER_RELEASE_SIGNING_KEY_PASSWORD`.
Signing happens in CI; the key never leaves GitHub Secrets.

### 5.2 Workflow
```yaml
name: Runner Release
on:
  push:
    tags: ['runner-v*']
  workflow_dispatch:
jobs:
  build:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest]
        arch: [x64, arm64]
    # cross-build or use native runners; macos-latest is arm64, so build x64 via macos-13 or Rosetta.
    runs-on: ${{ matrix... }}
    steps:
      - checkout
      - setup-node (engines floor)
      - npm ci (root + api? runner has no build)
      - run tests: npm run test:unit prerequisite (gate)
      - package: node scripts/package-runner.mjs --platform ... --arch ... --out dist/
      - upload artifact (tarball + sha256)
  manifest-and-sign:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - download all artifacts
      - node scripts/generate-runner-manifest.mjs --dir dist/ --version ${GITHUB_REF_NAME#runner-v} --out dist/manifest.json
      - install minisign
      - minisign -Sm dist/manifest.json -s <(base64 -d <<< $KEY) -p scripts/runner-pinned-key/runner-release.pub
        (password via env)
      - gh release create $TAG dist/* --notes ...   (--prerelease if tag contains -rc/-beta)
```
Pre-release detection: if tag matches `.*-(rc|beta|alpha).*`, mark `--prerelease`. v1 runners skip pre-releases (no opt-in).

### 5.3 Package layout (archive contents)
```
kainbain-runner-<version>-<platform>-<arch>.tar.gz
  kainbain-runner-<version>/
    runner/                      # all runner/*.js (incl. updates/)
    shared/                      # repo shared/ (servingModelFor etc.)
    api/agent/harnesses/mock/    # only mock? Full api needed for defaultLoadHarness dynamic imports.
    version.json                 # runnerVersion + apiVersion
    bin/kainbain-runner          # wrapper (exec loop)
```
Important: runner dynamically imports `../api/agent/harnesses/...`, so the archive must include at least those harness modules + dependencies. Research spike E0.1 should determine minimal include set vs bundling the whole `api/` tree. Simplest v1: package the entire repo at a tag (minus `.git`, `node_modules`, frontend, tests) — large but safe. Better: package `runner/`, `shared/`, `api/` (with all harnesses and supporting modules), and `package.json`. Given archive size target ~50 MB, including `api/` is likely fine. Use `.dockerignore`-style exclusions.

### 5.4 Manifest schema (versioned)
```json
{
  "schema": 1,
  "component": "runner",
  "version": "1.2.3",
  "releasedAt": "2026-...",
  "minCompatibleBackend": ">=1.0.0 <2.0.0",
  "assetBase": "https://github.com/Ewrdad/Kainbain/releases/download/runner-v1.2.3/",
  "assets": [
    { "platform": "linux", "arch": "x64", "filename": "kainbain-runner-1.2.3-linux-x64.tar.gz",
      "sha256": "...", "size": 12345 }
  ]
}
```
Manifest itself signed; per-asset sha256 verified after download. `minCompatibleBackend` lets the runner decide if this release can talk to the installed backend? Optional; helpful for air-gapped. v1: runner ignores `minCompatibleBackend` except logs (backend compat governs). Document.

### 5.5 Rollback (latest pointer)
- GitHub: to roll back, delete/re-draft the bad release or mark previous as latest via `gh release edit`. GitHub's `/releases/latest` resolves automatically when the latest non-prerelease changes.
- Documented in `PORTABLE_DEPLOYMENT.md` "Runner update rollback" runbook: `gh release delete runner-vX.Y.Z` (or un-publish) → runners' next check sees prior release.
- For air-gapped mirrors, operator re-points `latest` file pointer / directory.
- Backend `KAINBAIN_RUNNER_RECOMMENDED_VERSION` should also be lowered by operator during rollback (config change + restart backend) to stop badge nagging. Document.

---

## 6. Verification matrix (tests)

### 6.1 Unit tests (primary gate, `npm run test:unit`)
Runner (new/updated files):
- `runner/updates/platform.test.js` — platform/arch mapping + unsupported rejection.
- `runner/updates/manifest.test.js` — schema validation, prerelease handling, semver compare.
- `runner/updates/verify.test.js` — valid sig, tampered manifest, tampered sig, missing pub key (constant), asset sha match/mismatch. Use a committed **test** minisign keypair (public committed, private in repo for tests only; clearly labeled test-only).
- `runner/updates/state.test.js` — update-state transitions, rollback trigger.
- `runner/updates/downloader.test.js` — mocked fetch, partial download cleanup, sha gating before extract.
- `runner/updates/check.test.js` — idle-gated, version equal/newer, pre-release skip, air-gapped URL override resolution.
- Update `runner/daemon.test.js` for `RUNNER_VERSION`/`RUNNER_API_VERSION` from version.json.
- `runner/config.test.js` for new env vars.

Backend:
- `api/flow/runnerVersionCompat.test.js` (new) — version compare, updateAvailable, belowMinimum, missing-version permissiveness.
- `api/flow/runnerRegistry.test.js` (existing) — add cases: heartbeat records `runnerVersion`, `_public` derives `updateAvailable`/`belowMinimum`.
- `api/flow/runnerRoutes*.test.js` (existing) — dispatch/claim allow-with-badge vs block; callback existence checked against actual test file names before editing.
- Config test coverage for new knobs (existing `api/config/config.test.js` auto-validates schema; ensure values documented).

Frontend:
- Component tests for update badge in runner settings (extend existing runner components tests).

All new runner suite files must be added to `scripts/run-tests.mjs` pinned list, or they silently never run (existing guard test `tests/run-tests.test.mjs` enforces).

### 6.2 Integration test (one, local HTTP fixture)
- `runner/updates/fixtureUpdate.test.js` (or a new integration test under `tests/`) — boots a tiny Node HTTP server (in-process) serving a valid release (manifest+sig+asset built from test key) on 127.0.0.1; runs the updater end-to-end against a temp install root; asserts:
  1. Version bumps in `update-state` and `current` symlink moves.
  2. Old version dir retained as `previous`.
  3. Restart-simulated bootstrap marks success.
  4. Tampered asset variant aborts and leaves `current` on old version (separate test case or same test with second fixture).
- Marked as integration (uses ports/processes) but scoped to one fixture server; no long-lived background service.

### 6.3 Tamper tests (acceptance A3)
Explicit scenarios:
- Manifest signed but asset bytes flipped → sha mismatch → abort, old version remains, alert recorded.
- Manifest tampered (version bumped) without re-signing → signature fail → abort.
- Sig file tampered → signature fail → abort.
- Correct asset, wrong platform → no matching asset → no-op + alert (not a crash).

### 6.4 Verification commands to run before merge
```
npm run test:unit
npm run lint
npm run docs:check
node scripts/check-one-function-per-file.mjs
```
Plus manual:
- Fresh VM smoke: install v1, let it self-update to v1.0.1 from a controlled mirror; confirm version in Settings.
- Rollback smoke: delete the newer GitHub release, confirm runners report prior version on next check; backend recommended version lowered.

### 6.5 What cannot be automated in this pass
- Real GitHub release signing (needs secrets) — verified by the release runbook and a dry-run workflow dispatch in a fork.
- Multi-day soak for failed-boot rollback — exercised via injected state in unit tests plus one chaos manual check.

---

## 7. Documentation and ADR

### 7.1 ADR
Add `docs/adr/0012-runner-artifact-update-channel.md` (next number; current last is 0011). Sections:
- Context: R05/R03/R11, rejected Option B.
- Decision: GitHub Releases + minisign pinned key; archive-not-executable; relaxed gating contract (min vs recommended); air-gapped override; failed-boot rollback.
- Consequences: new env vars, config knobs, test/run-tests updates.
- Alternatives rejected: Option B backend-served; S3 raw; SEA binaries; cosign keyless; Windows v1; pre-release opt-in; per-runner pinning (survey-deferred).

### 7.2 Docs updates
- `PORTABLE_DEPLOYMENT.md`: new section "Runner updates" — automatic idle check, verification trust model, air-gapped override, rollback steps, minisign verify install requirement.
- New runner onboarding flow doc (locate in `docs/` — search "New Runner Onboarding"; `project_report`/grep confirms path at plan execution time) — add update verification step to onboarding checklist.
- `runner/README.md` — document new env vars and wrapper entrypoint, and that direct `node main.js` is dev-only post-update.
- `.env.example` via schema (run `npm run docs:check` to regenerate/validate).
- Risk register: append a note under R05/R11 that the mitigations in this plan reduce residual (optional; do not edit risk assessment scoring without review).

### 7.3 Versioning of this plan
If implementation deviates, record in ADR 0012's "amendments" note rather than rewriting history.

---

## 8. Implementation sequence (ordered, big pieces first)

Follow strictly. Each step must keep `npm run test:unit` green.

1. **R1 — Research + key generation**: generate test + release minisign keypairs; commit **public** test key + **public** release key; store release secret in GitHub (operator task). Deliverable: keys in repo (public only) + runbook note. No code.
2. **R2 — Manifest schema + verifier skeleton** (Phase E0.2/E1 pure helpers) with tests, no network. This proves verification locally.
3. **R3 — Backend config knobs + version compat helper** (no behavior change) with tests.
4. **R4 — Backend registry/heartbeat/public fields + dispatch/claim relaxed gating** with tests for both block (min bump) and badge (recommended bump) scenarios.
5. **R5 — Frontend fleet matrix badge** using enriched records.
6. **R6 — Runner check+download+verify** against a mocked GitHub in tests.
7. **R7 — Runner archive layout + wrapper + atomic apply + update-state/rollback**.
8. **R8 — Wire idle hook in runner daemon** (guarded by auto-update + active-task check).
9. **R9 — Integration test (local HTTP fixture)**.
10. **R10 — CI workflow + packaging scripts + manifest signing**.
11. **R11 — Docs + ADR 0012 + env example regeneration**.
12. **R12 — Final verification pass**: test commands, docs:check, lint, manual smoke.

Big research (R1, R2) comes before any wiring, per the stage instruction.

---

## 9. Risks and mitigations specific to this change

- **R05 residual stays 8 even after mitigation**: the runner still executes whatever the archive contains. Mitigation: pinned key, signature before parse, sha256 per asset, atomic apply, rollback; recommend a maintainer code-review gate on release tags (branch protection).
- **Archive packaging includes `api/` tree**: risk of shipping unintended modules/secrets. Mitigation: explicit allowlist in `scripts/package-runner.mjs`, plus a "package manifest" check listing files; CI fails if `.env*`, `.git`, or test files are included.
- **Self-update and in-flight tasks**: updater only runs when idle; active claim holds block it (lock + idle check). A race is guarded by the `update-state` lock file; if an update triggers mid-claim due to a missed gate, the new process simply starts with no claim (lease lapses → backend re-queues) — no data loss.
- **Failed boot loops**: capped at 3 attempts then auto-rollback; manual rollback runbook covers catastrophic cases.
- **GitHub unauthenticated rate limit (60/hr) for 10–20 runners**: runner check jittered to 60-min base + ±20%; 20 runners × 1/hr ≈ 20 calls/hr, well within. Document `GITHUB_TOKEN` override as future (not v1).
- **Air-gapped mirror**: `KAINBAIN_RUNNER_UPDATE_URL` must serve manifest+sig+assets at the conventions in §3.2; validate by mirror smoke test in docs.
- **Old runners lacking version field**: treated as permissive for dispatch, badge shown as "unknown (update available)" without blocking. Prevents sudden fleet lockout when min is first introduced.

---

## 10. Open (intentionally undecided) items

1. Whether the release archive includes the entire `api/` tree or a pruned subset — decide in R1 packaging spike; default to pruned allowlist.
2. Whether `minisign` CLI is required on runner hosts or bundled via npm dependency — decide in R1 library spike; if bundling, add ~50 KB to install. Tests must cover the chosen path.
3. Backend's handling of runner `updateStatus` alert — facts-only (recommended) vs dedicated endpoint. Recommended: facts-only for v1.
4. Exact UI placement (Settings → Runners new columns vs detail drawer) — decide during R5 using existing layout patterns; keep changes minimal.

No other open decisions; the rest are specified above.

---

## 11. Success evidence for this stage (KainBain gate)

This stage passes when:
- `/home/.../docs/tasks/5c3497b5-dace-441d-8350-75b59108a7fc/IMPLEMENTATION_PLAN.md` exists and contains sections 0–10.
- Plan reflects all survey answers (full E2E, GitHub only, minisign, archive+Node, Linux/macOS only, badge-then-dispatch unless API differs, air-gapped URL + failed-boot rollback, unit tests).
- Plan orders big pieces/research first (R1, R2 before wiring) and includes testing + docs phases.
- No unrelated files changed.

KAINBAIN_VERDICT: PASS