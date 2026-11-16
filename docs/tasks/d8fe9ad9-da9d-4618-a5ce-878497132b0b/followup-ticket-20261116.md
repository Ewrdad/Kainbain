# Follow-up review — magic-number operation-count fix (task d8fe9ad9-da9d-4618-a5ce-878497132b0b)

## History reviewed

- Case study: ticket `cccd8b9d-9021-4d0f-b51c-26d489073567` (uncompleteTask) added one
  domain operation, flipping the pinned count 104 → 105 in
  `frontend/src/services/domainRequests.test.js:60` (`expect(names).toHaveLength(104)`).
  Evidence: `docs/tasks/cccd8b9d-9021-4d0f-b51c-26d489073567/automated-tests-failure-20261115-232533.md`
  (frontend suite FAIL after ~17 min / 1020 s CI; 2 failed of 4734 tests).
- Recurrence pattern: git history of `domainRequests.test.js` shows ~27 `toHaveLength`
  occurrences with repeated manual bumps (e.g. commit `1fc1b3b3` "95->97 op count").
  Every legitimate endpoint paid a full CI cycle to discover a correct change.
- This ticket's fix (per `IMPLEMENTATION_PLAN.md`, `SURVEY.md`, and
  `review-stage-20261116.md` in this folder): new single source of truth
  `frontend/src/services/domainRegistry.js`, `api.js` rewired to compose from it
  (key-for-key identical, 121 keys), both `domainRequests.test.js` (magic number +
  tally comment removed) and `api.surface.test.js` (121-key literal split into 16
  stable non-domain keys + registry-derived domain keys) now derive from the registry.
  Review verified via probes A–E: add-op stays green with no test edits; drops,
  duplicates, and unregistered adds still fail naming the domain/op.

## Agent-difficult areas found

1. Composition/test drift: the old test built clients from 7 factories while `api.js`
   composed 8 (missing `retrospectiveRequests`) — a test-only fix would have left the gap.
2. Overlap trap: `getFileRawUrl` is both a `houseRequests` key and an explicit `api`
   override, so counts are set unions, not sums.
3. Second pin: `api.surface.test.js` pinned all 121 `api` keys literally, so one endpoint
   meant touching two test files.
4. Stale map: root `AGENTS-MAP.md:49,54` still describes `api.js` as a pure re-export
   facade and omits `domainRegistry.js` — the next agent adding an endpoint will not
   discover the registry from the map. The review report flags this as the explicit
   non-blocking follow-up (not editable from its docs-only stage).
5. Slow feedback: the failure mode is only caught ~17 min into CI, not in seconds.

## Dedupe check

Listed all 55 tasks in project `kainbain` / workflow `wf-default` via
`GET /tasks?workflowId=wf-default&projectId=...`. Open stage-`1` tickets cover
unrelated areas (metric dictionary, quarantine policy, runbooks, SLO gate, unload
lifecycle, fairness quota, projectId fencing, flaky-test quarantine, env isolation,
imports guardrail, harness literal-assertion probes, JSDoc paths). None covers the
registry checklist or a service-test count-pin guard, so a new ticket is warranted.
Related but distinct: `36cf5f67` (harness self-test literals) and completed `3c12ffcd`
(fast CI failure reporting) — referenced in the ticket, not duplicated.

## Ticket created

- ID: `eb96c7c2-011f-472d-86a7-0e924e8f6714`
- Title: Document domain-registry endpoint checklist and guard against hardcoded operation-count pins
- Stage: `1` (Idea) in workflow `wf-default`, project `kainbain` — verified
  `currentStageId` is `1` via re-read. `execute:false`. Current task stage is
  `stage-1794594754686` (retrospective), so no recursion.
- Idempotency key: `7b3fc95da9de80692e4d4e540e45e4d2`
  (`sha256("domain-registry-checklist-and-count-pin-guard|1|d8fe9ad9-...")[:32]`).
- Self-contained: goal states the files, the checklist contents, three acceptance
  checks, and references this ticket (`d8fe9ad9-da9d-4618-a5ce-878497132b0b`) plus the
  `cccd8b9d` failure file as the case study.
