# Retrospective — Remove inert runner package-lock stub

Task: `3232f6c6-9d02-4654-8d08-1a3fa27ab403`
Date: 2026-11-17
Stage: retrospective (docs-only; follow-on ticket fan-out)

## History review

The ticket deleted one 6-line / 85-byte stub file (`runner/package-lock.json`,
a lockfile with no sibling `runner/package.json`). The file was inert but
had a long history of wasting agent attention:

- It was flagged in **three** separate reviews of case-study task
  `b31cab50-3ece-4678-a933-3192288fbefd` (update-impact review, PR review,
  final re-verification) and left in place as out of scope each time.
- Removing it then required its own full-pipeline ticket: a survey round, a
  231-line implementation plan for a 1-file deletion, two full CI cycles
  (one ~43-minute run ending in a canary infra flake), and a PR review.
- Both CI cycles failed on causes unrelated to the change (see below); the
  task's own gates (packaging + runner suites) were green throughout.

## Where agent effort went (difficulties and fails)

1. **No guard against the file class.** Nothing in the repo stops an orphan
   lockfile (or any stray file under `runner/`) from landing in git or
   shipping in the release tarball: `scripts/package-runner.mjs`
   (`copyPruned`) copies the whole `runner/` tree except a small
   forbidden-name list, and no test pins the tarball file list. Every agent
   auditing the runner packaging path had to re-derive inertness from
   scratch. Structural fix, prevents recurrence entirely.
2. **Unrelated canary infra flake burned a full cycle.** CI run 1 failed with
   all 13 fast branches green and canary at 139/140: `footer-overlay` died
   in `page.goto` with "Target page, context or browser has been closed"
   (resource exhaustion on the shared gate host). ~43 minutes lost on a
   ticket touching no UI code.
3. **Unrelated frontend unit flake burned the retry.** CI run 2 failed
   `Unit Tests (frontend)` on one assertion out of 4791
   (`ProjectSettings.test.jsx` harness-combobox `not.toBeDisabled()`),
   on branch content identical to run 1 where frontend passed. One flaky
   assertion failed the fast gate and skipped canary. Run 2 also
   reinstalled frontend deps (535 packages) while run 1 was "up to date",
   so dependency drift is a second hypothesis alongside async timing.
4. **Minor: acceptance phrasing needed interpretation.** "Both runner test
   suites" did not name exact commands (plan covered it by running both the
   cited pair and the full 20-file branch), and "no reference remains in
   docs" needed an explicit exception for immutable history under
   `docs/tasks/`. Handled in-plan; not worth a ticket on its own.

## Dedupe check (KainBain)

Resolved project `0fd41821-d8a5-4e49-bc2e-28ce8c739a0a` (kainbain),
workflow `wf-default`, target stage `1` (Idea). Current task sits in
`stage-1794594754686` (retrospective), so targeting stage `1` respects the
recursion guard. Listed all 67 tasks in `wf-default`:

- Difficulty 2 (canary resource-exhaustion flake) already has open ticket
  `984cc6f6-9d8a-48dc-ab8a-d9dff944a3bf` in stage `1` with substantially
  the same goal (same spec, same error class). **Not duplicated.**
- The general quarantine lane + failure attribution already exists via
  completed ticket `8769b002-02e5-4e7d-8779-24865192d57c`.
- No open ticket covers orphan lockfiles / stray tarball entries or the
  ProjectSettings flake. **Two tickets created (cap: 10).**

Note: the skill's default API base `http://localhost:3100` refused
connections from this runner checkout (no local listener); all calls used
the runner backend `http://192.168.1.206:3100` from the runner env, which
serves the live orchestrator data.

## Tickets created

| Ticket | Title | Stage | Status |
|---|---|---|---|
| `2c1414d8-92ae-4ecc-9018-c3d4ca8a564d` | Fail CI on orphan package-lock.json files and stray runner tarball entries | `1` (Idea) | waiting_human |
| `8d41bf8c-f21d-4b3c-84d7-cd8891edddb0` | Quarantine and root-cause the ProjectSettings harness-combobox disabled flake | `1` (Idea) | waiting_human |

Both created with `execute: false` and deterministic idempotency keys, and
both verified via re-read to sit in `currentStageId: 1`. Each goal is
self-contained (problem, fix, success criteria) and cites this task
(`3232f6c6-9d02-4654-8d08-1a3fa27ab403`) as its case study with evidence
paths, so a human reviewer can audit either ticket with zero extra context.

- Ticket `2c1414d8` (difficulty 1): fast gate failing on any
  `package-lock.json` without a sibling `package.json`, plus a
  `package-runner-conformance` assertion that no lockfile ships under
  `runner/`. Prevents the entire ticket class.
- Ticket `8d41bf8c` (difficulty 3): quarantine the ProjectSettings flake in
  the lane from `8769b002`, then root-cause timing vs dep drift. Explicitly
  scoped to exclude the canary flake (owned by `984cc6f6`).

## Deliberately not ticketed

- Canary footer-overlay resource-exhaustion flake: covered by open ticket
  `984cc6f6` (dedupe, see above).
- Acceptance-phrasing nits (difficulty 4): absorbed by the plan's key
  decisions; too small for a standalone ticket.
- A "trivial-change fast lane" for the pipeline: considered, but speculative
  process design with lower reliability than the two concrete fixes above;
  the orphan-lockfile guard already removes this ticket class entirely.
