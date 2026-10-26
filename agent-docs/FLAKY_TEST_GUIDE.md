# Flaky-test prevention & diagnosis

A test that passes *most* of the time is not a passing test — it is a failure
that hides. This repo runs its suites on a shared 4-core host under the
overlapped gate (`npm test` runs api + frontend + lint + build + scans in one
window), so a green run on an idle box is not evidence of stability. The
standard here is **a pass rate**, measured by repeating the suite.

## Measuring a flake

`scripts/repeat-tests.mjs` runs one suite (optionally filtered to one file)
`N` times and prints the per-run result plus the pass rate. Every run appends a
JSON object to a JSONL log under the OS temp dir and keeps the raw suite output
beside it, so a failing run's exact signature can be read afterwards.

```bash
node scripts/repeat-tests.mjs --suite api      --pattern api/index.test.js --runs 10
node scripts/repeat-tests.mjs --suite frontend --pattern StageSkillsPanel   --runs 10
node scripts/repeat-tests.mjs --suite canary   --runs 3
```

- `--suite api|frontend|canary` (default `api`), `--runs N` (default 5).
- `--pattern` is a file/name filter passed to the suite's own runner; a leading
  `api/` / `frontend/` prefix is stripped so `api/index.test.js` resolves in the
  `api` workspace.
- Logs land in `$TMPDIR/kainbain-flake-repeat/` (never committed).
- Exit code is `0` only when **every** run passed.

Under load is the only honest stress: run the suspects while the full gate is
running, or on a constrained CPU set, e.g.

```bash
npm test &                                             # the overlap window
taskset -c 0,1 node scripts/repeat-tests.mjs --suite frontend --pattern ObservabilityDashboard --runs 5
```

A fix closes its audit row only on **100% green** — 10 standalone runs plus 3
under the overlapped gate. A fix that lowers the rate without zeroing it is not
done.

## Checklist for writing a non-flaky test

1. **Isolate state.** Never touch the live projects root or notes space — the
   `api/testSetup.isolation.js` throwaway roots are the backstop, and per-file
   suites mint their own pair via `isolatedTestRoots.js` + clean up in
   `afterAll`. Use `fs.mkdtemp` for scratch dirs. Never hard-code a
   projects/notes path.
2. **Isolate ports.** Bind ephemeral ports (`listen(0)`) or go through
   `scripts/free-port.mjs`. Never hard-code a listener port in a unit test.
3. **Wait for conditions, not sleeps.** Use `waitFor` / `findBy*` /
   `waitForElementToBeRemoved` (React) and Playwright's auto-retrying web-first
   assertions. A fixed `setTimeout` is both slower and flakier: it passes a real
   regression that fires later and fails under load. For API/flow tests use the
   existing `waitFor(condition, { timeoutMs })` polling helpers.
4. **Never assert wall-clock durations or random values.** Inject or fake the
   clock (`vi.useFakeTimers`, `vi.spyOn(Date, "now")`), seed or stub randomness.
   Performance-shape assertions must have a measured margin and a comment.
5. **Keep the async budget in step with the suite budget.** React Testing
   Library's `waitFor`/`findBy*` default to their own 1000ms
   (`asyncUtilTimeout`), *not* vitest's `testTimeout`. It is pinned in
   `frontend/src/setupTests.js` (guarded by
   `frontend/src/setupTests.asyncBudget.test.js`); if you add a suite that needs
   longer, raise it there once, not per file.
6. **Stay hermetic for network / CLI.** Mock harness (`KAINBAIN_DEFAULT_HARNESS=mock`),
   the agy fixture (`KAINBAIN_AGY_BIN`), and the `NODE_ENV=test` pin are the
   seams — no live fetches or real CLI spawns in unit tests.
7. **Pool-pinning rule (frontend).** A suite that needs node builtins must use
   the `node` environment or drop the api/node import (the
   `ObservabilityDashboard.session` precedent, asserted by the node-env contract
   in `tests/run-parallel.test.mjs`). Only a suite that is *proven* sensitive to
   `vmThreads` worker sharing may move to `legacy-pool` (forks) — and then both
   the `include` **and** the matching `main` project `exclude` must be added, or
   the suite runs twice / silently drops.
8. **Timeout raises need measured justification.** A raised `testTimeout` /
   `hookTimeout` must carry a comment with the measured overlap evidence (see
   the `OVERLAP_TIMEOUT_MS` notes in both `vitest.config.js` files).
9. **No retries to hide flakes.** Do not add global `retries` to vitest,
   and the canary suite runs with `retries: 0` — every flake fails the gate
   loudly, gets filed as a flake row, and gets fixed.

## When you find a flake

1. Record a row in the task's flake audit table: suite/file/test, failure
   signature, hit rate (`x/N`), class (timing / shared-state / port-file /
   clock / random / pool / network), and the fix.
2. Fix the **root cause** with the smallest change (usually test-only); if the
   fix must touch production code, call it out explicitly for review.
3. Prove it: repeat the fixed file 10× standalone **and** 3× under the
   overlapped gate; attach the JSONL log path to the row.
4. If the hit rate is 0/N after 10 standalone + 3 overlapped runs, deprioritise
   it with a note instead of changing it blind.
