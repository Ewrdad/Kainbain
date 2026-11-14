# Spike outcomes — WP-A build identity (task ae1ae677)

Short notes for reviewers and WP-F. All five Phase-0 spikes resolved during implementation.

## 0.1 — Which version.json does an installed runner read?

The booted daemon reads `runner/version.json` **beside itself** (`new URL("./version.json",
import.meta.url)` in `runner/daemon.js`). Installed layout is
`releases/<v>/unpacked/{runner/,api/,shared/,version.json}`, so the daemon reads
`unpacked/runner/version.json` — the **copied, unstamped** file. `scripts/package-runner.mjs`
only stamped the archive-root copy (`unpacked/version.json`, read by the updater's version
check and the wrapper doctor). Every self-updated Runner therefore kept reporting its old
`runnerVersion` (and now would have reported no build). Fix shipped: the packager stamps
**both** copies (pinned by `tests/package-runner-conformance.test.mjs` through the real
`applyUpdate` staging path).

## 0.2 — How do versions reach the Settings card?

No backend persistence change needed. `RunnerRegistry._public` embeds the raw heartbeat
`facts` object verbatim in `GET /runners` records, so `facts.versions.build`,
`facts.versions.bootedAtMs`, and `facts.versions.codeChangedSinceBoot` flow to the
frontend untouched; `capabilities.versions` (via `normalizeCapabilities`, now
sanitize-and-preserve) carries the same block. The card reads
`capabilities.versions ?? facts.versions` (same fallback order as the discovery-status
summary). No backend files touched — owned-files list honoured.

## 0.3 — What is "backend sha"?

`GET /status` → `build.commit` (from `deployManager.readBuild()`, already fetched by the
frontend's cached `api.systemStatus()`). Zero backend changes. Comparison is prefix-aware
(short backend commit vs full runner sha), case-insensitive, minimum 4 chars; unknown on
either side disables only the sha-mismatch branch, never the changed-since-boot branch.

## 0.4 — Managed-vs-dev discriminator (survey q4)

No existing signal, so the build itself carries one: new additive `build.source` —
`"package"` (release stamp) vs `"checkout"` (dev git fallback at boot) vs `null`
(unknown). The card shows build info for all runners but suppresses warnings for
`source === "checkout"`. No new registry invented.

## 0.5 — Heartbeat test surface

Seams shipped: `factsFor` exported with a `codeTree: { rootDir, baseline, bootedAtMs }`
override (temp-dir fixtures, no global mutation); pure `loadRunnerVersionInfo` /
`resolveRunnerBuild` / `snapshotCodeTree` / `hasCodeChangedSinceBoot` (node:test);
`normalizeCapabilities` passthrough (api vitest); `describeRunnerBuild` /
`runnerBuildWarning` (frontend vitest); bump gate with `--files` + `--root` hermetic
modes (tests/*.test.mjs in the Harness Self-Tests branch).

## Shipped heartbeat contract (WP-F handoff)

`facts.versions = { protocol, runner, api, build: { sha, builtAt, dirty, source },
bootedAtMs, codeChangedSinceBoot }`. Old runners omit the new keys (render "unknown",
no warning); old backends ignore them. Blocking behaviour unchanged
(`RUNNER_VERSION_BELOW_MINIMUM` only) — warn, never block.

## Open questions closed

- Q1–Q5/Q15 survey defaults: adopted as specified in the plan.
- Checked-in `runner/version.json`: carries explicit null `build` (self-documenting
  schema; `check-component-compat` unaffected — verified green).
- Manifest build sha (Q5): skipped — semver comparison is sufficient once bumps are
  enforced, and `runner/updates` selection changes are an explicit non-goal.
- `publish.sh` tag-skip path: left as-is (idempotent skip is pinned by
  `tests/publish.test.mjs`); enforcement lives in the release-workflow gate, which is
  where a mistagged release is actually stopped.
