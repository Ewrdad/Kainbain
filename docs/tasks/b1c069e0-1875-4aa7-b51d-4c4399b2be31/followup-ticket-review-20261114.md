# Follow-up review — ticket b1c069e0-1875-4aa7-b51d-4c4399b2be31

Reference case study: task `b1c069e0-1875-4aa7-b51d-4c4399b2be31`
("Enforce binary-safe proof artifacts and repo-root scratch hygiene").

## What happened on this ticket

The feature work itself landed cleanly: `scripts/check-proof-and-hygiene.mjs`
plus tests, wiring, and guidance passed its own gates
(`check-proof-and-hygiene` 63/63, `run-tests` wiring 35/35, link checks PASS,
install-safety review verdict "safe to update").

All three recorded CI failures were unrelated to the change:

1. `automated-tests-failure-20261114-192301.md` — 3×
   `install-runner-wrapper.test.mjs` env-dependent failures
   (HOME/sandbox path assertions) plus 1× `header-desktop-1280.png` visual
   flake (`waitForFontsSettled` 15 s timeout → `toHaveScreenshot` 30 s
   timeout, Desktop 1280px only). ~1142 s run, fallback routing triggered.
2. `automated-tests-failure-20261114-194643.md` — the same 3×
   `install-runner-wrapper` failures on a clean tree; canary PASS. ~1020 s run.
3. `automated-test-2-failure-20261114-205321.md` — `gitGate.test.js`
   "never runs two git processes" hung the full `Unit Tests (api)` branch
   for 900 s (15+ min timeout), 7185 passed / 1 failed. ~1074 s run.

## Where agent effort was wasted

- Each failure cost a full 17–19 minute CI cycle plus fallback routing, on a
  ticket whose own tests take seconds.
- The `In Progress` prompt holds agents responsible for "all tests and checks
  pass, regardless if you implemented them or not", so the agent had to
  manually prove pre-existing-ness each time (see the install-safety review's
  archaeology on the `sandboxEnv` fix). Nothing in the pipeline distinguishes
  "your regression" from "known flake".
- No quarantine lane exists: one flaky visual snapshot or one hung
  serialization test fails the whole gate.

## Follow-on ticket raised

- `Quarantine flaky CI tests and attribute failures to ticket scope` → stage
  `1` (Idea), created as `8769b002-02e5-4e7d-8779-24865192d57c`
  (`waiting_human`). Idempotency key `a7c88a102d5404bff5135198211f4ea1`.
- Dedupe: checked all 32 workflow tasks (4 open); no open ticket covers
  flaky-test quarantine or failure attribution.
- Not targeting the currently executing stage (`stage-1794594754686`
  retrospective); targeting `1` (Idea) per the resolved targets.
