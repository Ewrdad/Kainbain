# Retrospective — Prevent binary proof PNG corruption (ef569a1a)

Date: 2026-11-16. Stage: retrospective (docs-only). Author: retrospective agent.

## Ticket history reviewed

Full stage history of ef569a1a was read via the KainBain API (60 tasks
scanned in project `kainbain`, workflow `wf-default`). The ticket ran cleanly
end to end — Idea through Final review into this retrospective — with zero
stage failures or failbacks:

- One infra interruption only: the Plan stage execution was dropped by a
  runner lease loss ("Auto-resumed after server restart") and re-queued
  automatically. No agent action was needed; not a structural finding.
- Deep review verdict was PASS (recommend integrate):
  `review-pr-20261116.md` confirms all three acceptance criteria with
  independent evidence, 125/125 and 76/76 test runs green, and zero diff on
  the b1c069e0 detector.

## Where agents struggled or left gaps

From `review-pr-20261116.md` section 4 (nits) plus the plan's deferred scope:

1. **`capture-screenshot.mjs --out` still defaults to repo-root
   `screenshot.png`** (review nit 2; confirmed in code:
   `getArg("--out") || "screenshot.png"`). The safe recipe in
   `docs/tasks/_PROOF_RULE.md` only works when the agent remembers the
   explicit `--out docs/tasks/<id>/<name>-proof.png` flag. A forgotten flag
   writes to repo root, trips the root-hygiene gate, and burns a verification
   cycle — the same failure class this ticket exists to prevent. Structural:
   the default itself is the trap. **Ticket created (see below).**
2. **Harness-level interception of text-tool writes deferred.** The plan's
   mechanism (c) had no clean interception point without touching live runs;
   the review records this as a documented scope decision, not a shortcut,
   and AC2 ("impossible OR fails fast") is already satisfied by the pre-commit
   hook + `npm run check:binaries` guard. No ticket: re-raising it now would
   duplicate a deliberate decision with no new evidence.
3. **No implementation stage report quoting `xxd`/`file` outputs** (review
   nit 1). One-off audit-trail thinness; outcomes remain provable from
   code/tests. Not structural — no ticket.
4. **Live e2e capture not re-run in review** (playwright not installed at
   root here; review nit 3). Environment-specific verification gap, not a
   product defect. Noted, no ticket.

## Dedupe check

Resolved targets: project `0fd41821-d8a5-4e49-bc2e-28ce8c739a0a`
(kainbain), workflow `wf-default`, stage `1` (Idea). Note: the skill's
`http://localhost:3100` base refused connections from this runner; the live
backend from the runner env (`http://192.168.1.206:3100`) was used instead.

All 15 open stage-1 tickets plus the two image-adjacent tickets were checked:
`b31cab50` (materialize task-referenced assets into the workspace) and
`9f24b6c0` (warn on dangling assets refs at creation time) cover asset
presence/warnings, not capture-output defaults. No open ticket covers the
finding. Cap respected: 1 of 10 used.

## Ticket created

- **b3ab7335-f277-4aa7-b265-ad421e09ad1a** — "Default screenshot capture
  output to the task docs folder" — stage `1` (Idea), `execute:false`,
  verified via re-read (`currentStageId: 1`, `waiting_human`).
  Idempotency key: `8647f524970698dcdd9081c3e8e4b530`.
  Self-contained (problem, fix, acceptance criteria, non-goals) with a case
  study reference back to ef569a1a (`review-pr-20261116.md` section 4).

Effect if implemented: the no-flag capture invocation becomes correct by
default, removing the last easy-to-forget step on the binary-safe path and
preventing repo-root capture misfires from ever reaching CI.
