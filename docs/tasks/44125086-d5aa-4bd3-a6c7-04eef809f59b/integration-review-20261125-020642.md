# Integration review — task 44125086 (canary browser-closed infra-flake)

Date: 2026-11-25 UTC. Base: branch `kb/44125086-d5aa-4bd3-a6c7-04eef809f59b`
tip `44be812f` vs `main` — 17 files, 2478 insertions, 36 deletions.
Docs-only stage: no source file edited; all verification is re-executed
read-only evidence below.

## Verdict: FAIL (2 defects, both small to fix)

The runner-lane design is sound and well tested, but it is not suitable to
integrate yet: (1) the `browser-closed` classifier demonstrably forgives
non-infra errors, contradicting "genuine app failures must stay red"; (2) the
required "how to add signatures" checklist contains wrong paths and commands
that were never executed as written.

## What was verified green (with fresh evidence, not inherited claims)

- `node --test tests/infra-flakes.test.mjs tests/canary-quarantine.test.mjs`
  → **56/56 pass** in this workspace (covers acceptance 1 forgiven-green,
  1b rerun-signature-only forgiven, 2a mixed red, 2b rerun-genuine red,
  2c unclassifiable red, green-run, preflight-failed, final-result-wins).
- `node --test tests/run-tests.test.mjs tests/deploy-gates.test.mjs`
  → **72/72 pass** (gate wiring + deploy parity pins hold).
- `npm run check:jsdoc-example` → PASS (679 missing vs 680 grandfathered).
- Case study corroborated: all four
  `docs/tasks/cf4b6847-*/automated-tests-failure-20261119-{152819,160115,162951,170814}.md`
  contain `page.goto: Target page, context or browser has been closed` at
  `helpers.js:65`; every historical instance is the FULL Playwright sentence —
  nothing observed needs the bare `has been closed` substring.
- Acceptance 3 plumbing sound: `KAINBAIN_CANARY_QUARANTINE` line + JSON +
  error tag agree; the `runGatePhases` re-emit condition
  (`canaryBranches.length > 0 && canPointAtFullLogs`, i.e. verdict dir ready)
  holds on forgiven-green runs too.
- Plan followed: S0–S3 evidenced, M2 skipped with justification (dead-page
  cannot be rebound; dead browser's `newContext()` throws), `retries: 0`
  untouched, zero spec-file changes, baseline committed.

## Defect 1 (blocking): `browser-closed` pattern is over-broad — proven false positives

`canary-e2e/tests/infra-flakes.mjs:65` uses `/has been closed/`. Live probe
in this workspace:

- `"page.goto: Target page, context or browser has been closed"` → `browser-closed` (correct)
- `"Error: WebSocket connection has been closed unexpectedly"` → `browser-closed` (**wrong**)
- `"Error: Database connection has been closed"` → `browser-closed` (**wrong**)

Any failing test whose error text contains that substring — e.g. a console/
pageerror-array assertion diff after an app WebSocket regression — would be
classified signature-only, rerun, and forgiven green. The breadth was copied
from the old `helpers.js:63` inline regex, but there it only gated a
same-page retry (still red on failure); here it gates gate forgiveness — a
semantic expansion of a loose pattern. The file's own JSDoc claims "Patterns
are deliberately narrow"; no negative fixture covers any `has been closed`
near-miss, and the plan's risk-table mitigation ("Narrow patterns + E2
negative fixtures") was not fully honored.

Fix: narrow to the exact observed sentence
`/Target page, context or browser has been closed/` (covers 100% of observed
evidence: 4 tails + S1 probes; false negatives fail safe = red status quo),
add the two probe strings above as negative fixtures in
`tests/infra-flakes.test.mjs`, re-run the 56.

## Defect 2 (blocking): "Adding an infra-flake signature" checklist is wrong as written

`canary-e2e/README.md:88-103` (a required deliverable):

- Step 2/5 say `tests/infra-flakes.test.mjs`, which from `canary-e2e/` resolves
  to `canary-e2e/tests/infra-flakes.test.mjs` — that file does NOT exist (real
  path: repo-root `tests/infra-flakes.test.mjs`). Steps 1/3 are canary-rooted
  while steps 2/4 (`node --test tests/...`, `node scripts/repeat-tests.mjs`)
  are repo-rooted, with no cwd stated anywhere.
- Step 4 says "Rerun the affected spec 3×" but the command
  `node scripts/repeat-tests.mjs --suite canary` reruns the WHOLE suite with
  default runs (missing `--pattern <spec> --runs 3` per the script's own
  usage line) and bypasses the quarantine wrapper.
- Same ambiguous `tests/infra-flakes.test.mjs` reference in the
  `canary-e2e/tests/infra-flakes.mjs` header ("To add one", "pin that").
- No evidence the plan's D1 gate ("checklist executed once by hand, dummy
  signature added + reverted") was ever run — consistent with the above.

Fix: qualify every path with its root (or a stated cwd), correct step 4 to a
`--pattern`/`--runs 3` form, fix the header reference, and actually execute
the checklist once with a dummy signature and revert it.

## Non-blocking observations (no action required to pass)

- `evaluateRerun` forgives a rerun that is still signature-only red, so a test
  that NEVER passes greens the gate. Documented + recorded and consistent with
  non-blocking quarantine semantics, but only `canary-quarantine.json`
  (`rerun.outcome`) distinguishes it from "rerun passed" — the log line does
  not. Consider adding `outcome=` to the log line.
- `deploy.sh --prod` sharded gates keep the strict invocation: a flake there
  still reds a deploy. Documented; acceptable scope cut, note as follow-up.
- The 152819 case-study run would STILL stay red under the lane (third failure
  is a `beforeEach` 60s timeout with no signature). Conservative and intended —
  but it means the lane forgives 3 of the 4 cited red gates, not 4 of 4.

## Scope reviewed

`canary-e2e/tests/infra-flakes.mjs`, `canary-e2e/tests/helpers.js`,
`canary-e2e/playwright.config.js`, `canary-e2e/README.md`,
`canary-e2e/infra-flake-baseline.json`, `scripts/lib/canary-quarantine.mjs`,
`scripts/canary-with-quarantine.mjs`, `scripts/run-tests.mjs`,
`tests/infra-flakes.test.mjs`, `tests/canary-quarantine.test.mjs`,
`tests/run-tests.test.mjs`, `tests/deploy-gates.test.mjs`,
`IMPLEMENTATION_PLAN.md` (§7), `SURVEY.md`, `standards-review-20261125-015101.md`.
