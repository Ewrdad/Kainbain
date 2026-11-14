# PR Review — Runner build identity and stale-code detection

**Task:** `ae1ae677-7eb5-432c-b0d5-20c72e833084` · **Branch:** `kb/ae1ae677-7eb5-432c-b0d5-20c72e833084` · **Base:** `198ea82d`
**Date:** 2026-11-14 · **Reviewer:** stage agent (docs-only review; no source edits)
**Verdict:** PASS — shippable; two non-blocking observations for humans below.

## What was reviewed

Task-owned source diff vs merge-base (plus the task docs):

- `runner/version.json`, `scripts/package-runner.mjs`, `scripts/check-runner-version-bump.mjs` (new), `.github/workflows/runner-release.yml`
- `runner/daemon.js` (+ `runner/daemon.test.js`), `api/flow/dispatch/normalizeCapabilities.js` (+ test)
- `frontend/src/components/settings/RunnerConfigurationSection.jsx`, `runnerConfigHelpers.js` (+ tests)
- `tests/check-runner-version-bump.test.mjs`, `tests/package-runner-conformance.test.mjs`, `scripts/run-tests.mjs`
- Docs: `runner/README.md`, `docs/PORTABLE_DEPLOYMENT.md`, `IMPLEMENTATION_PLAN.md`, `SPIKES.md`, `UPDATE_SAFETY_AUDIT.md`, `DOCS_REVIEW.md`

## Goal achievement — yes, all four clauses plus all five acceptance criteria

1. **Build identity stamped at bundle time; dev fallback at boot.** `package-runner.mjs` stamps `build { sha, builtAt, dirty }` into BOTH `version.json` copies (archive root + `runner/` copy the daemon reads — the Spike 0.1 finding). `resolveRunnerBuild()` uses the stamp (`source: "package"`) or computes `git rev-parse HEAD` + `git status --porcelain` scoped to the runner tree at boot (`source: "checkout"`), fail-soft to nulls. `package-runner.sh` (the real `publish.sh` path) is a thin wrapper around the `.mjs`, so the stamp applies to real releases.
2. **Heartbeat signal.** `factsFor()` reports `versions.build` (defensive copy per call), `bootedAtMs`, and `codeChangedSinceBoot` from a boot fingerprint vs per-heartbeat mtime rescan (`snapshotCodeTree`/`hasCodeChangedSinceBoot`, skipping `.git`/`node_modules`, fail-quiet).
3. **Bump enforcement.** New `check-runner-version-bump.mjs` fails when `runner/**` or `api/agent/harnesses/**` changed without a semver increase (test/spec/md + `version.json` itself excluded); wired as the `version-bump-gate` job before packaging. End-to-end flow is coherent: `publish.sh --runner` cuts `runner-v*` from the bumped `runner/version.json` (verified in `publish.sh`), so tag-vs-base-file comparison enforces the bump under the documented flow.
4. **Settings card.** Roster shows `build <shortSha>` (+dirty/dev markers) and a `stale code` badge; detail panel shows build line + warning banner. Warn-only: zero diff lines touch `belowMinimum`/`RUNNER_VERSION_BELOW_MINIMUM`/409 paths.

## Verification — ran, not trusted (all green, this session)

- `node --test runner/daemon.test.js`: **140/140** (incl. `factsFor` build-identity test and temp-dir touch→`codeChangedSinceBoot:true` flip test, which uses explicit future `utimes` — not flaky).
- `node --test tests/check-runner-version-bump.test.mjs tests/package-runner-conformance.test.mjs`: **21/21** (incl. real-git-range reject-then-accept and dual-copy stamping through `applyUpdate`).
- API `normalizeCapabilities.test.js` (vitest): **15/15** (build passthrough, old-runner untouched, malformed dropped, future keys pass through).
- Frontend settings tests: **111/111** (build describe/warning helpers + card render/suppress cases).
- `node scripts/check-component-compat.mjs`: all OK (additive `build` key breaks nothing).
- ESLint on changed api/frontend files: **0 errors** (only pre-existing `security/detect-object-injection` warnings in untouched code); new code adds none.
- Corroborated the two spike claims the UI depends on: `RunnerRegistry._public` embeds raw `facts` verbatim (`api/flow/runnerRegistry.js:342`) so no backend change was needed, and `GET /status` returns `build` from `deployManager.readBuild()` (`api/routes/status.js:150`, `commit` per `api/deployManager.js:275`).

Screenshots skipped deliberately: the headless tool needs a live app with a staged stale runner; component tests already assert the rendered banner/badge/suppression states, and spinning up servers is out of scope for this review.

## Plan, standards, debt

- **Follows the plan:** all five Phase-2 slices shipped with the designed seams (`loadRunnerVersionInfo`, exported `factsFor` + `codeTree` override, temp-dir fixtures, `--files` hermetic gate mode). Deviations are documented and immaterial (manifest sha skipped as an explicit non-goal; no scan-perf assertion test).
- **Scope discipline:** `runner/daemon.js` diff is version-loading + build/stale helpers + `factsFor().versions` only — no `refreshDiscoveredModels`/boot changes, so the WP-B overlap note holds.
- **Standards:** MARK/JSDoc blocks, functional pure helpers, colocated tests, immutable-per-call heartbeat data. Matches repo conventions.
- **Tech debt:** minimal. Two trivial notes: (a) every heartbeat rescans even after flipping (no flip-cache; negligible at 60s cadence on a small tree); (b) the gate's base version comes from the base tag's file, which relies on the tag==file convention the docs establish — the failure message's "(or retag higher)" path lets a manual higher tag pass without a file bump, but updates still flow since the release version increased.

## Non-blocking observations (for humans, not fail reasons)

1. **Dev-checkout warnings are fully suppressed** (`runnerBuildWarning` returns null for `source === "checkout"`), per unanswered-survey q4's Recommended option adopted as a plan assumption. Note the irony: N1's evidence runner (local-bravo, running from the engine checkout) would show build info but never warn. The `codeChangedSinceBoot` signal still flows in heartbeat facts; only the card warning is suppressed, and checkout churn would otherwise be noise. Worth a product confirm, but the plan/survey/docs/tests are mutually consistent, so not a defect.
2. **Branch hygiene:** the branch also carries engine-auto-committed docs from other tasks (`b8c9bb8e`, `55460086`, `77a4072e`, `9d2b75a2`, `e597e05b` under `docs/tasks/`). Additive and unrelated to this change — leave for merge-time untangling; do not delete here (some may exist only on this branch).

## Files changed by this review

- `docs/tasks/ae1ae677-7eb5-432c-b0d5-20c72e833084/PR_REVIEW.md` (this file) — the only change; no source, config, or test edits.
