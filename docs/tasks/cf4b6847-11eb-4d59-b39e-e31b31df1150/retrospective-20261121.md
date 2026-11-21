# Retrospective: per-pipeline configurable main branch (2026-11-21)

Task: `cf4b6847-11eb-4d59-b39e-e31b31df1150` (kainbain / wf-default).
Retrospective stage: `stage-1794594754686`. Screenshot (`assets/image.png`) was
unavailable (MISSING-ASSET); this report proceeds from task source, history, and reports.

## Ticket history (from KainBain API + reports)

- 2026-11-16: created in Idea.
- 2026-11-19: requirement survey (q1–q8) answered; plan written; Risk review
  FAILED the plan twice on format (missing RiskRegister Template fields), then passed.
- 2026-11-19: Automated tests ran 5 cycles. Cycle 1 failed on real unit-test
  regressions (merge/task-branch seams, fixed by the agent). Cycles 2–5 failed ONLY
  on canary E2E infra flakes: `page.goto: Target page, context or browser has been
  closed` at `canary-e2e/tests/helpers.js:65` (the retry line), 1–2 tests of ~140,
  ~17 min per cycle.
- 2026-11-19: Merge FAILED on a conflict in `api/projectStore.barrel.test.js`
  (expected-exports list vs concurrently merged task 7f6220c3); Deep Review FAILED
  on mergeability only (code quality passed); Merge resolver loop fixed it
  (commit 359fa2d4); task merged, published, reached Final review.
- 2026-11-20: human REJECTED Final review with reason `![image.png](assets/image.png)`
  only (no text); the file was never attached. Goal later gained the text "There
  seems to be no way to edit this in the ui". In-Progress rework + reviews proceeded
  blind (pr-review-20261120-183718.md documents the screenshot was absent) and added
  UI-discoverability work (deep links, settings search entries).
- 2026-11-20: `automated test 2` failed on 6 frontend ProjectSettings alias tests
  (fixed in Cleaning pass); its failed-stage auto-commit was SKIPPED with
  "Refusing to commit on the wrong branch ... working tree is on kb/1cae113f ..."
  (concurrent task moved HEAD on the shared checkout). One Update-stage interruption
  and one retrospective interruption from server restarts (auto-recovered).
- 2026-11-21: Final review auto-approved after 1 day with no second human look;
  advanced to retrospective.

## Structural findings → tickets filed (5, all in kainbain / wf-default / Idea, execute:false)

1. `64fb8fbb-a1b6-4004-9986-90662cfc4498` — Validate human review feedback asset
   references at submit time (block/warn on unattached `assets/*` refs; require text
   with image-only feedback). Prior art b31cab50 covers downstream only.
2. `44125086-d5aa-4bd3-a6c7-04eef809f59b` — Survive dead-browser canary flakes without
   failing the whole gate (helpers.js retry cannot survive a dead browser/context;
   `retries: 0`). 4 wasted ~17-min cycles on this ticket.
3. `01a9b07f-4cdc-47a7-a5f6-47ee15f6f204` — Teach the Plan stage the RiskRegister
   template before Risk review (2 failbacks here + cited identical FAILs on ac988ba8,
   8dafdce1).
4. `9565c991-b800-4611-8483-16dd2c94038f` — Defuse the projectStore barrel
   expected-exports merge hotspot (hand-maintained map collides on concurrent adds).
5. `7f347a7a-0bfd-4a37-9500-a34eb5ee3219` — Re-establish branch and retry failed-stage
   report commits on shared checkouts (report commit silently skipped on HEAD contention).

All five verified via GET: correct project/workflow/stage, deterministic
idempotency keys, no duplicates of open tickets (checked 58 wf-default tasks; related
completed work b31cab50 / 8769b002 / 3c12ffcd referenced as prior art, not duplicated).

## Deliberately not filed

- Second Final review auto-approving without human eyes after a prior human rejection:
  real process observation, but auto-approve is an intentional feature (task e1fb125a);
  changing that policy needs a product decision, not a retrospective ticket.
- First automated-tests cycle unit failures and the ProjectSettings alias failures:
  genuine regressions the agent correctly fixed — normal iteration, not structural.
- Server-restart interruptions: auto-recovery worked as designed; no agent effort lost.
