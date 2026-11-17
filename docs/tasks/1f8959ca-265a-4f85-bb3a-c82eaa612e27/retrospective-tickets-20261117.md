# Retrospective — follow-on tickets from WP2 (2026-11-17)

Source task: `1f8959ca-265a-4f85-bb3a-c82eaa612e27` (WP2 production signals).
Reviewed: `IMPLEMENTATION_PLAN.md`, `SURVEY.md`, `UPGRADE_SAFETY.md`,
`code-standards-review-20261116-wp2.md`, `stage-review-20261117-wp2.md`,
`automated-tests-failure-20261116-234841.md`, `check-for-plan-failure-20261116-205335.md`,
`ci-fast-gate-20261116-232853/canary-tests.full.log`.
API note: the KainBain backend for this host is `http://192.168.1.206:3100`
(from the runner env), not `localhost:3100` (connection refused).

## Tickets created (project kainbain, workflow wf-default, stage 1 Idea, execute:false)

1. `984cc6f6-9d8a-48dc-ab8a-d9dff944a3bf` — "Stop canary resource-exhaustion
   flakes from failing the whole CI gate". Case: WP2 burned a full 1750s CI
   run plus fallback routing on one infra-class canary failure
   (`footer-overlay.spec.js`, browser closed after ~15 min serial) with all
   13 fast branches green and zero UI files touched. Asks for root-causing
   serial-run resource pressure, routing infra-class failures (existing
   `helpers.js` regex) to the 8769b002 quarantine lane, and scope
   attribution. Verified: `currentStageId` = 1.
2. `67de002b-3b93-4b30-aac4-b30fe62ffb01` — "Wire WP2 load-window slicing
   through the served observability endpoint". Case: `{ windowMs, now }`
   works via direct calls only; `getObservabilityMetrics` (`api/taskStore.js:1104`)
   and `/status` (`api/routes/status.js:357-358`) drop it, so HTTP consumers
   silently get full history. WP5 makes no product change, so nobody owns
   the fix without this ticket. Includes the `runner/version.json` bump
   (still 0.1.0, verified safe both directions). Verified: `currentStageId` = 1.

## Deliberately not ticketed

- Unanswered Round-1 survey (agent assumed Recommended options): already
  covered structurally by completed ticket `73f23a38` (gate implementation
  on answered surveys).
- Fast-gate reporting delay: already covered by completed `3c12ffcd`.
- Quarantine mechanism itself: completed `8769b002`; ticket 1 above extends
  it to a new flake class rather than duplicating it.
- Check-for-plan 71s failure (plan file raced the check): by-design
  fallback routing to planning, negligible cost.
- Root-workdir `runnerRoutes.test.js` guard failure: by-design isolation
  guard whose message already names the fix (`KAINBAIN_ACCESSIBILITY_FEEDBACK_FILE`
  + `api/testSetup.isolation.js`); no ticket warranted.
