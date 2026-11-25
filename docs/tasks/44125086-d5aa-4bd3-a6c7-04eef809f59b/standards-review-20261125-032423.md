# Standards review — task 44125086 (canary browser-closed infra-flake)

Date: 2026-11-25 UTC. Base: `origin/main` vs branch
`kb/44125086-d5aa-4bd3-a6c7-04eef809f59b` tip `dd62ec12` —
19 files, 2982 insertions, 36 deletions
(`git diff origin/main...HEAD --stat`).
Scope per the stage prompt: this branch's changes vs master
against `docs/KB Code Standards.md`, docs-only (no source edited).

## Verdict: PASS

The change complies with the code standards. The two defects that
failed the earlier Deep Review / Integration Review
(`deep-review-failure-20261125-020721.md`,
`integration-review-20261125-020642.md`) are fixed on this tip and
the fixes themselves are standards-compliant (narrow pattern +
negative fixtures under Tested-over-trusted; repo-root paths + cwd
under User-understandable).

### User understandable over technical language — PASS
- Long descriptive names (`collectFailedTests`, `planQuarantine`,
  `buildQuarantineSummary`, `markInfraFlakeError`, `resolveQuarantineDir`,
  `runCanaryGate`) and labelled destructured params on every multi-arg
  function (`planQuarantine({ firstExitCode, failed, globalErrors } = {})`,
  `runCanaryGate({ canaryDir, repoRoot, env, argv, ... })`).
  Single-arg positionals (`matchInfraFlake(message)`, `loadReport(reportPath)`,
  `infraFlakeTag(signatureId)`) match the sibling idiom in the same file
  family (`taskButtonKey(taskId)`, `boxesOverlap(a, b)` in `helpers.js`).
- No `factory` / `barrel` / design-pattern wording in the new files
  (`grep -rniE "factory|barrel|singleton|prototype|inheritance|polymorph"`
  clean); the only `pattern` occurrences are the regexp constant
  `INFRA_FLAKE_TAG_PATTERN` and the `pattern` field per signature.
- Every new export carries a `MARK:` JSDoc block directly above the export
  with `@example` (and `@param`/`@returns` where applicable):
  `canary-e2e/tests/infra-flakes.mjs` (7 exports), `scripts/lib/canary-quarantine.mjs`
  (17 exports), `scripts/canary-with-quarantine.mjs` (5 exports), plus the
  extended `waitForAppReady` contract in `helpers.js`.
  `npm run check:jsdoc-example` → `PASS (679 missing, baseline (680 grandfathered))`.
  JSDoc explains *why* (why a separate `KAINBAIN_CANARY_QUARANTINE` marker,
  why fail-open reporting, why classify on the FINAL result, why the
  same-page re-issue cannot heal a dead browser).
- File placement follows the call chain: `infra-flakes.mjs` next to its
  consumer `helpers.js`, `canary-quarantine.mjs` next to `fast-gate-verdict.mjs`,
  wrapper next to `scripts/run-tests.mjs`.

### Functional over object-oriented — PASS
- No `class`, no currying-as-classes. Pure functions (`classifyFailures`,
  `planQuarantine`, `evaluateRerun`, `buildQuarantineSummary`,
  `formatQuarantineLogLine`, `isInfraFlake`/`matchInfraFlake`) take the
  minimum destructured data and return new objects; I/O helpers
  (`loadReport`, `readBaseline`, `writeQuarantineSummary`,
  `resolveQuarantineDir`) are fail-open and seam-injected (`spawnFn`,
  `log`, `now`, `env`). Functions are verb-named with single responsibilities
  (collect → classify → plan → rerun → summarise → report).

### Co-location over abstraction — PASS
- `infra-flakes.mjs` is the single signature list shared by three consumers
  (helper, quarantine lib, baseline + tests) — justified sharing with
  complex regexes, not a one-line abstraction. Zero spec files changed.
- Unit tests live in central `tests/` (`infra-flakes.test.mjs`,
  `canary-quarantine.test.mjs`), matching the checked-in precedent
  (`canary-preflight.test.mjs`, `fast-gate-verdict.test.mjs`) and the gate's
  Harness Self-Tests file list (`scripts/run-tests.mjs:575-576`).
  Placing them under `canary-e2e/tests/` would be picked up as Playwright
  specs by `testDir`; the README and the `infra-flakes.mjs` header now state
  repo-root explicitly.
- The new `.mjs` libs export multiple functions, but the one-function-per-file
  gate covers only `api/ shared/ frontend/src` by design (see
  `scripts/check-one-function-per-file.mjs` ROOTS), so the new `scripts/` +
  `canary-e2e/` libs are out of scope, matching `fast-gate-verdict.mjs`
  precedent. `helpers.js` (30 exports) predates this change.
  `node scripts/check-one-function-per-file.mjs` → PASS on this tip.

### Tested over trusted — PASS (incl. the Deep Review fixes)
- Classifier: `browser-closed` now matches only the exact observed sentence
  `/Target page, context or browser has been closed/`
  (`canary-e2e/tests/infra-flakes.mjs:75`) — the over-broad `/has been closed/`
  that forgave `"WebSocket connection has been closed"` / `"Database
  connection has been closed"` is gone. Negative fixtures in
  `tests/infra-flakes.test.mjs` pin those two strings plus two more near-misses,
  `ERR_CONNECTION_REFUSED`/bad-URL/timeout/assertion fixtures, and a
  re-broadening guard (`pattern.source` pinned to the full sentence).
- Lane: decision table (green / signature-only / mixed / unclassifiable)
  plus `runCanaryGate` driven with fake playwright runs — signature-only +
  green rerun forgives (criterion 1); mixed, rerun-red, no-JSON crash,
  preflight failure, and zero-tests-ran stay red (criterion 2); the
  `KAINBAIN_CANARY_QUARANTINE` line + `canary-quarantine.json` + provider report
  name lane/signature/tests (criterion 3). `retries: 0` untouched
  (`canary-e2e/playwright.config.js:220`).
- Observed on this tip: `node --test tests/infra-flakes.test.mjs
  tests/canary-quarantine.test.mjs` → **69 pass / 0 fail**;
  `node --test tests/run-tests.test.mjs tests/deploy-gates.test.mjs` →
  **72 pass / 0 fail**; `node --test tests/fast-gate-verdict.test.mjs` →
  28/28; `npm run check:jsdoc-example` + `check-one-function-per-file` green.
- `IMPLEMENTATION_PLAN.md` §7 records the Deep Review fixes plus the D1
  checklist execution (dummy signature added → 63/63 green, corrected step-4
  command → 3/3 single-spec PASS, then dummy fully reverted; re-verified
  61/61 + full root suite 783 pass).

### Fast iteration over long planning — PASS
- Gate-only JSON reporter append (manual runs unchanged), failed-only rerun
  (`file:line` filters, `--last-failed` fallback, never the whole run),
  25-min ceiling kept. Single signature list + `infra-flake-baseline.json`
  make the next signature a one-entry change; README "Adding an infra-flake
  signature" now states repo-root cwd, roots every path, and gives the
  single-spec step-4 form (`--pattern tests/<spec>.spec.js --runs 3`).

### Nits (not verdict-blocking)
- `infraFlakeTag` is a noun-named function; `sig`/`e`/`r` are short loop vars.
  One helper among 20+, tiny scope — not worth a failback.
- `scripts/run-tests.mjs` `buildBranches` JSDoc sits above the intervening
  `splitGatePhases` export — pre-existing on `main`, only the `@param` list
  was extended here. Not introduced by this change.

## Scope reviewed
`canary-e2e/tests/infra-flakes.mjs`, `canary-e2e/tests/helpers.js`,
`canary-e2e/playwright.config.js`, `canary-e2e/README.md`,
`canary-e2e/infra-flake-baseline.json`, `scripts/lib/canary-quarantine.mjs`,
`scripts/canary-with-quarantine.mjs`, `scripts/run-tests.mjs`,
`tests/infra-flakes.test.mjs`, `tests/canary-quarantine.test.mjs`,
`tests/run-tests.test.mjs`, `tests/deploy-gates.test.mjs`,
`IMPLEMENTATION_PLAN.md` (§7), `SURVEY.md`.
