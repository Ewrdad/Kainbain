<!-- KAINBain RETROSPECTIVE REPORT (docs-only stage) -->
# Retrospective: self-improvement follow-ups for 1cae113f

**Task:** `1cae113f-43ab-4613-801b-2de6297637fd` (Surface runner git/commit and pre-commit hook failures clearly in the UI)
**Stage:** retrospective (`stage-1794594754686`) · **Date:** 2026-11-22
**Method:** read every stage report in this task's docs folder, traced each FAIL/flake/rework loop to its structural cause, checked KainBain for existing tickets, filed only net-new structural tickets.

## Where agent effort was lost on this ticket

1. **Concurrent sibling tasks with opposite designs (biggest cost).** While this
   branch built hook-failure surfacing that runs hooks on recovery commits
   (plus a grep-guard test forbidding `--no-verify` anywhere in `runner/`),
   task `db49d6c6` merged the opposite fix (`--no-verify` recovery snapshots).
   Nothing flagged the overlap until a merge FAIL (`runner/daemon.js`,
   `runner/project.js` conflicts) and a deep-review FAIL (semantic collision:
   any mechanical merge broke the guard test or reverted main's fix). Recovery
   cost: full rebase, design reconciliation, narrowed scope-guard, retargeted
   incident-replay tests, rewritten ADR/runbook/plan notes, and re-verification
   of all suites (runner 246, API 349, frontend 154). Evidence:
   `merge-failure-20261121-082214.md`, `deep-review-failure-20261121-082957.md`,
   `review-integration-20261121-083500.md`, `review-reconciliation-20261121-094500.md`.
2. **Survey answers landed after planning.** `SURVEY.md` answers post-date the
   plan, so the implementation documented overrides of q1/q3/q6; the q6 override
   later contradicted both the human survey and merged main, needing an explicit
   human gate. Already covered structurally — see Dedupe below.
3. **Canary dead-browser flakes failed a 16-minute gate.** `automated-tests-failure-20261121-072700.md`:
   fast gate green, then 2 unrelated `page.goto: Target page ... has been closed`
   flakes failed the whole run; re-runs passed 9/9 (environmental). Already
   covered — see Dedupe below. (The earlier `...-063619.md` runner failure was a
   genuine merge-commit bug caught by CI and fixed — normal process, not structural.)
4. **No zero-server pixel-proof path for docs-only reviews.** Three review stages
   wrestled with `capture:screenshot` against unserved `:3100` (blank captures,
   no servers allowed): first review shipped an evidence gap, second skipped
   pixels, third hand-built a `file://` SSR harness around the real component +
   production CSS. Evidence: `review-commit-hook-surfacing-20261121.md`,
   `review-integration-20261121-083500.md`, `review-reconciliation-20261121-094500.md`.

## Dedupe (checked live KainBain data, 69 tasks in wf-default)

- Survey timing → `73f23a38` "Gate implementation on answered requirement survey" (completed). Skipped.
- Canary dead-browser flakes → `44125086` "Survive dead-browser canary flakes" (open, stage 1). Skipped.
- `9565c991` "Defuse the projectStore barrel merge hotspot" covers one file's adjacent-line hotspot, not
  cross-task semantic overlap. Distinct — filed below.
- No open task covers concurrent-task overlap detection or docs-only render proof. Filed below (2 of 10 cap used).

## Tickets created (project `kainbain`, workflow `wf-default`, stage `1` Idea, `execute:false`)

1. `13e1dcd1-3506-4317-bf96-c69645521d3e` — "Flag overlapping in-flight tasks before parallel designs diverge"
   (idempotency `cb807bf52ead1449fd67af7dbdd804ac`, verified `currentStageId=1`, `waiting_human`).
2. `728e1f8f-b7f1-4d71-9354-fb3b52011893` — "Give docs-only review stages a zero-server UI render-proof path"
   (idempotency `e273dc7c81deca7c4991e62fb5761bf1`, verified `currentStageId=1`, `waiting_human`).

Both stand alone (problem/fix/acceptance inline) and cite this task as the case study.
Recursion guard honored: executing stage is `stage-1794594754686` (retrospective), targets are stage `1`.

## Observations without tickets (for operators)

- **Possible recurrence of `4f927ecb`.** This stage's prompt listed
  `final-review-20261122-094929.md` as present in this task's docs folder, but the file does not exist
  on disk. `4f927ecb` ("List only prior stage reports that actually exist in stage prompts") is completed;
  if the listing comes from a different code path than the one fixed, it may need a follow-up. No ticket
  filed per dedupe guardrail.
- **Vitest invocation footgun** (from `review-upgrade-safety-20261121-093235.md`): invoking
  `api/node_modules/.bin/vitest` from the repo root mis-resolves config and yields environment-only
  failures; the same files pass via `npm run test:api`. Single-observer note; consider a docs one-liner
  rather than a ticket.
- **API reachability note:** the skill's `http://localhost:3100` base is refused on this runner host
  (it runs only the runner service); the live backend was reached via the runner's configured
  `KAINBAIN_RUNNER_BACKEND` (`http://192.168.1.206:3100`). Future runs from runner hosts should prefer
  that variable over localhost.
