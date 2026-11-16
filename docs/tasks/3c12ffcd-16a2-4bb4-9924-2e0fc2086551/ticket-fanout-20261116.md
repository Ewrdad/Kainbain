# Ticket fan-out — structural follow-ons (2026-11-16)

Source ticket: `3c12ffcd-16a2-4bb4-9924-2e0fc2086551` (fast-gate fail-fast for the Automated tests stage).
Case-study reference for all tickets below: `docs/tasks/cccd8b9d-9021-4d0f-b51c-26d489073567/automated-tests-failure-20261115-232533.md`
(1020s CI run, 23891 trimmed log lines, three trivial failures).

## History reviewed

- `IMPLEMENTATION_PLAN.md`, `SURVEY.md`, `notes-20261116.md` (incl. same-day stale-probe fix),
  `automated-tests-failure-20261116-102004.md` (579/580 red run proving the fix end to end),
  `stage-review-20261116.md`, `final-review-20261116-151909.md`.
- Agent difficulty found: after the fast-gate refactor moved the overlap window into
  `runGatePhases`, the harness self-test `the root gate exposes the check and runs it
  before the overlap window` (`tests/check-imports-declared.test.mjs`) failed because its
  probe matched the literal source string `runParallel(fast` — the behaviour contract
  (preflight before the overlap window) still held. Required a same-day probe repoint fix.

## Dedupe check (open tasks in stage `1`, project `kainbain`)

Already covered, NOT re-filed: hardcoded op-count assertion (`d8fe9ad9`),
JSDoc-example convention (`ef21e99b`), flaky-test quarantine (`8769b002`, completed).
No open ticket covers brittle source-literal test probes — filed below.

## Created

1. `36cf5f67-174e-4279-b27f-863f35f60780` — "Replace source-text-literal assertions in
   harness self-tests with behaviour-based probes" — stage `1` (Idea), `execute:false`,
   verified `currentStageId=1`. Standalone: case-study context inline in goal; this file
   holds the back-reference.
