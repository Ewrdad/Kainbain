# ADR 0012 — Runner artifact update channel (external, versioned, signature-verified)

**Status:** Accepted (2026-10-31, architecture discussion)
**Date:** 2026-10-31
**Task:** Option A implementation (decision doc 2026-10-31)
**Amends:** `docs/adr/0008-portable-runner-decisions.md` (D7), `docs/adr/0009-runner-protocol-sketch.md`

## Context

The risk register (`docs/MuseCodeHackathon2026/Portability/RiskAssessment.md`)
frames the runner update problem:

- **R05 (backend→runner code execution supply chain):** the backend already
  curates prompts/skills that runners execute. If it also distributed runner
  binaries, one backend compromise = silent RCE on every runner host.
- **R03 (backend SPOF, accepted):** updates must keep working while the
  backend is down.
- **R11 (version/protocol skew):** the fleet drifts; the backend must know
  who runs what and refuse work a runner cannot serve.

Survey refinements (binding over the raw decision text): versioned archives
over the host Node runtime (not Node SEA binaries); Linux + macOS only
(x64/arm64, Windows deferred); badge-then-dispatch for routine releases
with 409 blocks only below the minimum floor; air-gapped override URL +
failed-boot rollback in v1; no pre-release opt-in, no per-runner pinning.

## Decision

Adopt **Option A: an external, versioned artifact store as the runner
update channel** — GitHub Releases on `github.com/Ewrdad/Kainbain`
($0, no bandwidth cap on public repos; Actions free on public repos).

- **Release pipeline (CI):** tag `runner-v*` builds four archives
  (linux/darwin × x64/arm64), emits `manifest.json` (schema 1:
  version + per-asset sha256/size + assetBase), signs it in minisign
  format with pure-Node Ed25519 (secret in GitHub Secrets, never in repo),
  attaches all artifacts + manifest + `.minisig` to the release. Canary
  tags (`*-rc.N`/`*-beta*`/`*-alpha*`) publish as pre-release; v1 runners
  skip them automatically.
- **Runner pull on idle:** jittered hourly check (min 5 min) plus on 409.
  Compares `tag_name`/manifest version to its own `RUNNER_VERSION`
  (from `runner/version.json`, stamped per release).
- **Verify before install (mandatory):** manifest signature against the
  **pinned key compiled into the runner source** (never fetched), then
  asset sha256 against the manifest. Any failure aborts, keeps the old
  version, and alerts via heartbeat facts. Trust order: pinned key only —
  neither backend nor store is trusted.
- **Self-update-on-idle:** download to temp, verify, atomic symlink flip
  (`current`/`previous`), exit 0, wrapper restarts, re-register. One
  previous version kept; three crashed boots auto-roll-back.
- **Backend coordination, no code transfer:** register/heartbeat carry
  `facts.versions.runner`; the backend stores it, shows the fleet version
  matrix + "update available" badge, and refuses dispatch/claim below
  `KAINBAIN_RUNNER_MIN_VERSION` (409 `RUNNER_VERSION_BELOW_MINIMUM`).
  `KAINBAIN_RUNNER_RECOMMENDED_VERSION` drives badge-only nagging.
- **Rollback:** delete/un-publish the bad release so `releases/latest`
  resolves to the prior tag; lower the recommended knob. No re-tagging.
- **Air-gapped:** `KAINBAIN_RUNNER_UPDATE_URL` mirror override; same gates.

## Consequences

New env vars (runner): `KAINBAIN_RUNNER_UPDATE_URL`,
`KAINBAIN_RUNNER_AUTO_UPDATE`, `KAINBAIN_RUNNER_UPDATE_CHECK_INTERVAL_MS`,
`KAINBAIN_RUNNER_INSTALL_ROOT`. New backend knobs:
`KAINBAIN_RUNNER_MIN_VERSION`, `KAINBAIN_RUNNER_RECOMMENDED_VERSION`
(default both `0.1.0`; old version-less runners stay dispatchable).
Supported entrypoint becomes `runner/bin/kainbain-runner`; direct
`node runner/main.js` is dev-only. New suites registered in
`scripts/run-tests.mjs`. `.env.example` regenerated.

## Alternatives rejected

- **Option B (backend serves/pushes runner code):** maximises R05 blast
  radius, couples updates to the backend SPOF, costs backend bandwidth.
- **Raw AWS S3:** $0.20/mo base but uncapped egress tail risk ($0.09/GB);
  CloudFront would fix it but adds setup for no benefit over Releases.
- **Node SEA single executables:** dropped for plain archives + host Node
  (smaller, no per-platform toolchain in CI).
- **cosign keyless / GPG:** minisign-format Ed25519 with one pinned key is
  sufficient and dependency-free (pure Node `crypto`).
- **Windows v1, pre-release opt-in, per-runner pinning:** deferred by survey.

## Amendments

(None yet — record deviations here, not by rewriting history.)
