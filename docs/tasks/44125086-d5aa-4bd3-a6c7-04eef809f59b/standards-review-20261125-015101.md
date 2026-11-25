# Standards review — task 44125086 (canary browser-closed infra-flake)

Date: 2026-11-25 UTC. Base: `origin/kb/44125086-d5aa-4bd3-a6c7-04eef809f59b`
tip `8765f0cf` vs `main` — 16 files, 2357 insertions, 36 deletions
(`git diff main...origin/kb/44125086...`). The local checkout in this
workspace (`dfee303f`) is 4 commits behind that tip, so the review was
run in a throwaway worktree at the origin tip; no source file in this
workspace was edited (docs-only stage).

## Verdict: PASS against `docs/KB Code Standards.md`

### User understandable over technical language — PASS
- New exports use long descriptive names (`collectFailedTests`,
  `planQuarantine`, `buildQuarantineSummary`, `markInfraFlakeError`,
  `resolveQuarantineDir`, `runCanaryGate`) and labelled destructuring
  (`planQuarantine({ firstExitCode, failed, globalErrors } = {})`).
- No `factory` / `barrel` / design-pattern wording anywhere in the new
  files; the only `pattern` occurrences are the regexp constant
  `INFRA_FLAKE_TAG_PATTERN` and the `pattern` field per signature.
- Every new export carries a `MARK:` block directly above the export
  with `@example` (and `@param`/`@returns` where applicable);
  `npm run check:jsdoc-example` passes on the tip
  (`PASS (679 missing, baseline (680 grandfathered))` — no new missing).
  JSDoc explains *why* (why a separate `KAINBAIN_CANARY_QUARANTINE`
  marker, why fail-open reporting, why classify on the FINAL result,
  why the same-page re-issue cannot heal a dead browser).
- File placement follows the call chain: `canary-e2e/tests/infra-flakes.mjs`
  next to its consumer `helpers.js`, `scripts/lib/canary-quarantine.mjs`
  next to `fast-gate-verdict.mjs`, wrapper `scripts/canary-with-quarantine.mjs`
  next to `scripts/run-tests.mjs`.

### Functional over object-oriented — PASS
- No `class`, no currying-as-classes. Pure functions (`classifyFailures`,
  `planQuarantine`, `evaluateRerun`, `buildQuarantineSummary`,
  `formatQuarantineLogLine`, `isInfraFlake`/`matchInfraFlake`) take the
  minimum destructured data and return new objects; I/O helpers
  (`loadReport`, `readBaseline`, `writeQuarantineSummary`,
  `resolveQuarantineDir`) are explicitly fail-open and seam-injected
  (`spawnFn`, `log`, `now`, `env`) for tests. Functions are verb-named
  with single responsibilities (collect → classify → plan → rerun →
  summarise → report).

### Co-location over abstraction — PASS (repo-precedent note)
- `infra-flakes.mjs` is the single signature list shared by three
  consumers (helper, quarantine lib, baseline + tests) — justified
  sharing, not a one-line abstraction. No spec files changed (DEC-6).
- Unit tests live in central `tests/` (`infra-flakes.test.mjs`,
  `canary-quarantine.test.mjs`), matching the checked-in precedent
  (`fast-gate-verdict.test.mjs`, `canary-preflight.test.mjs`) and the
  gate's explicit Harness Self-Tests file list. The standards'
  "next to the file" ideal is not the repo's layout; following the
  gate list is the correct call here.
- `node scripts/check-one-function-per-file.mjs` passes
  (`880 files, 281 grandfathered`); the gate scope is
  `api/ shared/ frontend/src`, so the new `.mjs` files are out of scope
  by design.

### Tested over trusted — PASS
- Classifier: positive fixtures are the exact four 2026-11-19 tail
  strings plus live Playwright 1.63 probe strings; negatives pin
  `ERR_CONNECTION_REFUSED`, bad URL, assertion diffs, app-wait timeouts,
  and near-miss "closed" phrasings as staying red (criterion 2).
- Lane: decision table (green / signature-only / mixed / unclassifiable)
  plus `runCanaryGate` driven with fake playwright runs —
  signature-only + green rerun forgives (criterion 1), mixed, rerun-red,
  no-JSON crash, and preflight failure stay red.
- Observed on the tip: `node --test tests/infra-flakes.test.mjs
  tests/canary-quarantine.test.mjs` → 56/56 pass;
  `tests/run-tests.test.mjs tests/deploy-gates.test.mjs` → 72/72;
  `check:jsdoc-example` + `check-one-function` + `fast-gate-*` green.
  The implementation plan's §7 records live scratch-stack probes
  (dead-browser → rerun → exit 0 with log line + JSON; dead-browser +
  genuine failure → red).

### Fast iteration over long planning — PASS
- `retries: 0` untouched, gate-only JSON reporter append, failed-only
  rerun (`file:line` filters, `--last-failed` fallback), 25-min ceiling
  kept. Single-signature list + `infra-flake-baseline.json` make the
  next signature a one-entry change; README documents the checklist;
  no new service or spec churn.

### Acceptance mapping
1. Browser-closed alone no longer fails the gate — helper marks
   (`CANARY_INFRA_FLAKE` + `[infra-flake:<id>]`), wrapper reruns only
   signature-only failures once and forgives on green/signature-only
   rerun. Proven by the harness tests above.
2. Genuine failures stay red — non-flake throws unchanged in the helper;
   mixed/unclassifiable/rerun-red exit non-zero with no forgiveness;
   negative fixtures pin the classifier. The 2026-11-19
   `152819` run's third failure (60s beforeEach timeout, no signature)
   would correctly stay red under the lane — conservative and intended.
3. Report names lane/signature — `KAINBAIN_CANARY_QUARANTINE
   forgiven=… lane="runner-rerun" signatures="browser-closed:1"
   tests="…" summary="…"` log line (re-emitted by `runGatePhases`),
   `canary-quarantine.json` next to `verdict.json`, and the
   `[infra-flake:<id>]` tag in the report error text. Pinned exactly by
   `formatQuarantineLogLine` tests.

### Nits (not verdict-blocking)
- `infraFlakeTag` is a noun-named function; `sig`/`e`/`r` are short
  loop vars. One helper among 20+, tiny scope — not worth a failback.
- Un-exported helpers in `canary-quarantine.mjs` (`walkSuites`,
  `errorTextOfResult`, …) carry inline why-comments rather than full
  JSDoc; all exports are fully documented.
- `scripts/run-tests.mjs` `buildBranches` JSDoc sits above the
  intervening `splitGatePhases` export — pre-existing on `main`, only
  the `@param` list was extended here. Not introduced by this change.
- 8769b002 quarantine was not found anywhere in the clone
  (`git log --all --grep=8769b002` empty, no `docs/tasks/*8769*`), so a
  fresh committed list was built and documented — matches DEC-7 default
  and the S0 evidence log.

## Scope reviewed
`canary-e2e/tests/infra-flakes.mjs`, `canary-e2e/tests/helpers.js`,
`canary-e2e/playwright.config.js`, `canary-e2e/README.md`,
`canary-e2e/infra-flake-baseline.json`, `scripts/lib/canary-quarantine.mjs`,
`scripts/canary-with-quarantine.mjs`, `scripts/run-tests.mjs`,
`tests/infra-flakes.test.mjs`, `tests/canary-quarantine.test.mjs`,
`tests/run-tests.test.mjs`, `tests/deploy-gates.test.mjs`,
`docs/tasks/44125086-*/IMPLEMENTATION_PLAN.md` (§7 evidence log),
`SURVEY.md`, `review-plan-20261124-234741.md`.
