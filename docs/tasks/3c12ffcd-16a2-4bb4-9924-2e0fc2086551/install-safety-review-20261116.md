# Install-safety review — fast-gate fail-fast (update breakage check)

- **Branch:** `kb/3c12ffcd-16a2-4bb4-9924-2e0fc2086551` vs `origin/main` (22 files: new
  `scripts/lib/fast-gate-verdict.mjs` + `api/flow/fastGateMarker.js`; modified
  `scripts/run-tests.mjs`, `scripts/lib/run-parallel.mjs`, `api/flow/commandStages.js`,
  `.gitignore`, `site-docs/pipeline-stages.md`; new/modified gate tests).
- **Question:** would an existing install break on update (startup crash, data loss,
  API/persisted-format break, migration, required env)? **Verdict: PASS — no break found.**

## 1. No persisted / packaging / dependency surface

- **Zero diff** in `api/package.json`, root `package.json`, lockfiles, config schema,
  task store, prompt layouts, `Dockerfile`, `deploy.sh`. No DB migration, no
  frontmatter change, no new runtime dependency, no deleted/renamed file.
- **Docker image:** `Dockerfile` does `COPY api/ ./api/` wholesale, so new
  `api/flow/fastGateMarker.js` ships automatically. The gate runs from the CI
  checkout, not the image, so `scripts/` never needs to be in the image.
- **Runner tarball:** `scripts/package-runner.mjs` copies `runner/` + `shared/` +
  `api/` wholesale, so the engine scanner ships; the runner never runs
  `scripts/run-tests.mjs`, so no runner-side gap.

## 2. Backward-compatible behaviour (verified by execution)

- **Gate exit contract:** old `ok = fastOk && canaryOk` (canary always) → new
  `fastOk && canaryOk` with `canaryOk = true` when skipped. Fast-fail still exits 1,
  canary-only fail still exits 1 (canary runs when fast passes), green still exits 0
  and runs canary. Only red-fast timing changes (skip the ~13 min serial phase), with
  documented opt-outs `--no-fail-fast` / `KAINBAIN_NO_FAIL_FAST=1` (verified:
  default true, both opt-outs false, `--fail-fast` no-op true).
- **`runParallel` defaults:** `failureOutputTailLines` now resolves option → env →
  120; without env the default is still 120 (verified). Callers without the option
  (`depcheck.mjs`, `repeat-tests.mjs`) see byte-identical tails; new
  `failureDetailsPreamble` is optional and throwing-safe.
- **Engine scanner is advisory only:** `scanFastGateChunk` is wrapped in `try/catch`,
  once-only, and never touches routing (documented + tested: stage still fails back
  on the command's exit code). Passing/marker-free output records nothing.
- **Writers are fail-open:** `ensureVerdictDir` / `writeFastGateVerdict` /
  `writeBranchFullLog` return false/null instead of throwing; an unwritable verdict
  dir degrades banners to "unavailable" and never fails the gate.

## 3. No dirty-tree, prompt, or persistence pollution

- Verdict dirs land under `docs/tasks/<taskId>/ci-fast-gate-*/` (CI) or
  `docs/tasks/local-gate-runs/` (local fallback, newly gitignored) — both under the
  `docs/tasks/` prefix the clean-tree guard ignores (`_resolveIgnorePaths`), and
  `listTaskDocsFiles` lists only top-level files, so the verdict directories never
  appear in Previous Reports.
- Engine writes are additive only (one history entry + process-log line on fast-gate
  failure); `saveTaskMarkdown` writes no `lastError` frontmatter, so no bloat or
  old-file incompatibility. No new required env var; `KAINBAIN_FAILURE_TAIL_LINES`
  falls through safely on missing/non-numeric values.

## Evidence

- `node --test tests/fast-gate-verdict.test.mjs tests/fast-gate-excerpts.test.mjs
  tests/fast-gate-acceptance.test.mjs tests/run-parallel.test.mjs
  tests/run-tests.test.mjs` → 133/133 pass in this session.
- `node --check` clean for `scripts/run-tests.mjs` and `api/flow/commandStages.js`;
  both new modules import cleanly.
- The prior CI red run showed the mechanism end-to-end (early banner + skipped canary
  + verdict on disk); the follow-up harness re-probe fix is part of this branch.

## Conclusion

No startup crash, data loss, migration, API break, or packaging gap on update.
Existing installs replace the checkout and behave identically except the requested
fail-fast timing on red fast runs, which is opt-out capable and exit-code preserving.
**PASS.**
