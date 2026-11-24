# Fail the fast gate when a "no behaviour change / test-only PIN" task modifies prod files without a disclosed deviation

## Context

Several KainBain tasks are explicitly scoped as **test-only regression PINs**
with "Change: NONE to behaviour". The intent is that review can trust the
scope claim and verify the pin mechanically. In practice the claim is not
enforced anywhere:

**Case study (reference ticket: `05b5d046-9480-40e3-8ec9-c06596c51acc`,
"Regression-pin boot reconcile so server-restart orphans stay at zero"):**
the task text said "Change: NONE to behaviour. Add
`api/flow/scheduler/reconcileInterruptedRuns.boot.test.js` … Tests pass
immediately (PIN, not red)". The implementation stage honoured that (one new
test file), but the cleanup stage additionally modified the prod file
`api/flow/scheduler/reconcileInterruptedRuns.js` (fail-safe hardening). The
change was safe and well-tested, but because nothing in the pipeline flagged
it, the **review stage had to perform manual case-by-case regression analysis**
to accept a "Plan deviation (disclosed, accepted)"
(`review-20261123.md`) — exactly the investigative effort the "NONE to
behaviour" wording was supposed to eliminate.

Related but distinct: `73f23a38` gates implementation on answered surveys to
prevent scope drift from *answers*; this ticket covers scope drift in the
*diff* itself.

## Steps

1. In the fast gate (`scripts/run-tests.mjs` or a new dedicated branch, e.g.
   "Scope guard"), compute the diff of the task branch against its merge base
   (`git diff --name-only <base>...HEAD`).
2. Detect PIN/no-behaviour-change tasks by matching the task goal text for
   markers such as `NONE to behaviour`, `no behaviour change`, `test-only`,
   `PIN`, `regression-pin` (case-insensitive; make the marker list explicit and
   documented).
3. Classify changed files: prod = anything not matching test/docs patterns
   (`*.test.js`, `*.spec.js`, `docs/**`, `canary-e2e/tests/**`, snapshots).
4. If a marked task has prod-file changes **and** the stage report / commit
   message contains an explicit deviation section (e.g. a heading matching
   `deviation`), pass with a loud warning line in the verdict output.
5. If a marked task has prod-file changes and **no** deviation disclosure, fail
   the branch with a message naming the prod files and instructing the agent to
   either revert them or add a `## Plan deviation (disclosed)` section to the
   stage report with case-by-case regression reasoning (as review-20261123.md
   did manually).
6. Unit-test the classifier and the marker matcher (marked+prod+disclosed →
   pass; marked+prod+undisclosed → fail; unmarked → unaffected; marked+tests
   only → pass).

## Acceptance criteria

- [ ] Fast gate fails for a marked (test-only/PIN) task whose branch touches
      prod files without a disclosed deviation section; passes when disclosed.
- [ ] Unmarked tasks are completely unaffected (no false positives on normal
      feature tasks).
- [ ] Test-only changes (`*.test.js`, docs) in marked tasks never trip the
      guard.
- [ ] The verdict output names the offending prod files and the exact remediation.
- [ ] Unit tests cover the matcher/classifier combinations listed in Steps.

## Notes / examples

Marker phrases observed in real tasks (match these):

| Task | Goal wording |
|---|---|
| `05b5d046-9480-40e3-8ec9-c06596c51acc` | "Change: NONE to behaviour … (PIN, not red)" |
| `d164fb3f-ed08-4221-814e-e9e3a5d75a1e` | regression PIN family from `2e663986` |

Case-study evidence:
`docs/tasks/05b5d046-9480-40e3-8ec9-c06596c51acc/review-20261123.md`
("Plan deviation (disclosed, accepted)") shows the manual review cost this
guard would have made mechanical.

## Suggested owner areas

- `scripts/run-tests.mjs` (new "Scope guard" fast branch), git-diff helpers,
  task-goal metadata already available to the gate.
