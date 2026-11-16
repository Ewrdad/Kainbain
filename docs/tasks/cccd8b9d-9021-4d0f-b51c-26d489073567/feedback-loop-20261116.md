# Feedback-loop report: uncomplete-task ticket (cccd8b9d)

- **Source task:** `cccd8b9d-9021-4d0f-b51c-26d489073567` (add the ability to
  uncomplete tasks), workflow `wf-default`, retrospective stage.
- **History reviewed:** `IMPLEMENTATION_PLAN.md`, `SURVEY.md`,
  `UPDATE_SAFETY_REVIEW.md`, `review-uncomplete-20261116.md`,
  `review-plan-20261115-223712.md`, `automated-tests-failure-20261115-232533.md`.
  (`idea-20261115-222317.md` and `final-review-20261116-064834.md` were listed
  in the stage brief but do not exist on disk — see "Not ticketed" below.)
- **API note:** the skill's default base `http://localhost:3100` refused
  connections on this runner; the live API was reached at
  `http://192.168.1.206:3100` (the runner backend URL). All ids below were
  resolved against the live server, not guessed.

## Tickets created (3, all in project `kainbain`, workflow `wf-default`, stage `1` Idea, `execute:false`)

1. `d8fe9ad9-da9d-4618-a5ce-878497132b0b` — "Replace hardcoded API operation-count
   test assertion with a derived check" (`waiting_human`, stage `1` verified
   by re-read). The `toHaveLength(104)` assertion in
   `src/services/domainRequests.test.js` breaks on every legitimate new
   endpoint and cost this ticket a full CI cycle.
2. `ef21e99b-88db-4d73-8648-658094820dcd` — "Surface the JSDoc-example
   convention for new exports before the CI gate" (`waiting_human`, stage `1`
   verified by re-read). The MARK + `@example` requirement is enforced only
   by the late Harness Self-Tests gate; agents need it in docs or a fast
   local check.
3. `3c12ffcd-16a2-4bb4-9924-2e0fc2086551` — "Report agent-actionable CI
   failures before the long serial canary phase" (`waiting_human`, stage `1`
   verified by re-read). Three trivial failures took a 1020s run (794s
   serial canary) with 23891 trimmed log lines to surface.

Cap respected (3 of 10). No ticket targets the currently executing
retrospective stage. Idempotency keys were deterministic
(`sha256(finding + stage + taskId)[:32]`).

## Findings reviewed but NOT ticketed (dedupe hits)

- **Phantom Previous Reports in stage prompts.** This stage's own brief listed
  two non-existent files. Already covered by open ticket
  `4f927ecb-ba3a-423c-ace3-5f7dd7d36896` ("List only prior stage reports that
  actually exist in stage prompts", `waiting_human` @ stage `1`) — no
  duplicate created.
- **Unanswered requirement survey.** `SURVEY.md` has empty `answers` yet
  Plan/implementation proceeded on recorded assumptions. Already covered by
  completed ticket `73f23a38-e929-4e96-a20e-f38b19243089` ("Gate implementation
  on answered requirement survey"), whose acceptance (no silent defaulting;
  the plan recorded its assumptions explicitly in Section 0/6) was met here —
  no duplicate created.
- **`enteredStageAt` not reset on reopen** (documented analytics caveat) and
  the **busy-button disabled miss** (normal test-driven iteration, fixed in
  the same ticket): judged too small / already-resolved to justify tickets;
  recorded here only.
