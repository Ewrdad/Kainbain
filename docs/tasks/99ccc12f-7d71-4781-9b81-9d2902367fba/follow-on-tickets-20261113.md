# Follow-on tickets — task 99ccc12f retrospective (2026-11-13)

Source task: `99ccc12f-7d71-4781-9b81-9d2902367fba` ("Isolate API tests from live
engine state files"). Case-study docs: `docs/tasks/99ccc12f-7d71-4781-9b81-9d2902367fba/`
(`SURVEY.md`, `IMPLEMENTATION_PLAN.md`, `update-compatibility-20261113.md`,
`plan-failure-*`, `catchup-failure-*`, `deep-review-failure-*`).

## History review

- All 22 stage failure reports on this ticket (6 Plan, 12 catchup, 4 Deep
  Review) are infrastructure, not content: `spawn vibe/muse/agy ENOENT`
  (incl. `[AGY_BIN_MISSING]`) or `No API key found for the selected model`
  (incl. mistral). Each burned a 5-attempt retry ladder (~100s per stage).
  No agent-content failure was found; the plan and implementation succeeded.
- The implementation is complete and matches the plan (plus auth-state
  coverage the plan had marked verify-only): `api/testSetup.isolation.js`
  pins all engine state files, auth dir, circuit, registry and prompt layout
  to temp paths, and `api/flow/resolveStatePath.js` throws under `VITEST`
  for live-engine paths. `api/` content is identical to `origin/main`.
- Deliberately NOT ticketed: stale task text about `isolatedTestRoots.js`
  (plan §3 already reconciled it, no action needed); `VITEST=true` exported
  in production throwing on boot (documented as pathological-only in
  `update-compatibility-20261113.md`); guard-test ambient-mtime flake risk
  (mitigated by sentinel-id content check, no flake observed).

## Tickets created (project kainbain, workflow wf-default, stage Idea)

1. `c104c57e-bf29-44d1-a023-77176f087684` — "Harden runner CLI provisioning
   and API-key configuration" (structural fail / flake). Verified
   `currentStageId=1`, `execute:false`.
2. `b3dec9b0-1319-45ed-bb7e-2ff2c484a7ae` — "Isolate accessibility-feedback
   store from live home directory in tests" (tech debt, residual D9:
   `api/routes/accessibility.js:82` still falls back to live
   `~/.kainbain/accessibility-feedback.jsonl` with no env override or guard,
   and `accessibility.test.js:271-274` asserts the live path). Verified
   `currentStageId=1`, `execute:false`.

Dedupe: checked all 29 tasks on `wf-default`; open Idea-stage tickets
(4ec027a7, 6ba7e727, 8c7e2d15, 6cbb5401) and failed runner tickets
(77a4072e model discovery, ae1ae677 build identity, 1c91140c skill docs)
cover different goals. Note: the KainBain API was reachable at the
runner-configured backend `http://192.168.1.206:3100`, not
`http://localhost:3100` (connection refused).
