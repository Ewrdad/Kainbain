# ADR 0017 — Surface runner commit/hook failures in the task UI

**Status:** Accepted.
**Date:** 2026-11-21.
**Context:** Task `1cae113f-43ab-4613-801b-2de6297637fd` — on task
`7f6220c3-c536-489c-b952-9858aae9ef21` the repo pre-commit binary-guard hook
rejected 3 corrupt PNGs during a runner recovery commit. The runner wrote the
error only to its systemd journal, exited 1, and restarted 10,776 times under
`Restart=always`, while the task UI showed status `interrupted` with a stale
`lastError` from an earlier human rejection. Commit/hook failures were
invisible and crash-looped the runner.

## Decision

1. **One shared `GitFailureDetails` contract** (`shared/gitFailure/`): kind
   (`hook-rejected`, `commit-failed`, `merge-conflict`, reserved
   `push-failed`/`auth-failed`), lifecycle phase, failing command, exit code,
   hook name, affected files, hook output, remedy, and one-line summary, with
   transport caps. The runner, backend, and UI share it verbatim — no layer
   invents field names.
2. **The runner classifies hook/commit failures and reports them as failed
   completions, never rethrows.** A deterministic rejection (hook, commit, or
   merge conflict) flows through `complete({ outcome: "failed",
   failureKind: "commit-failed", gitFailure })` and the daemon returns, so
   the process stays alive and systemd never restarts. Transient git faults
   (lock/timeout) keep the interrupt path, now carrying a reason. This
   covers task-branch (stage/merge) commits; internal `kb-recovery/*`
   snapshots bypass hooks instead (see 6).
3. **Complete-not-interrupt is the reporting vehicle.** Only the complete path
   flows through failure routing into `lastError`, timeline, history, logs,
   and the `-failure-` stage report; `interrupt()` deliberately leaves
   `lastError` alone. Worktree-setup failures report the same way — the
   complete fence only checks the claim hold, never progress state.
4. **The backend persists the envelope as `lastError.gitDiagnostics`** (new
   `hook-rejected`/`commit-failed` kinds beside `merge-conflict`/
   `sync-blocked`), classifies `failureKind: "commit-failed"` as
   non-retryable logical feedback, and parks the task after three
   consecutive same-signature strikes (`gitFailureStreak`, scheduler +
   claim skip until an operator retries, resumes, or moves).
5. **The task UI renders a dedicated callout** (hook, command, files, remedy,
   expandable full output) inside both failure banners plus a distinct card
   label — driven by the envelope shape, so backend diagnostics shapes keep
   rendering as plain text.
6. **Scoped bypass for recovery snapshots only; never bypass or auto-repair
   task output.** Internal `kb-recovery/*` snapshots bypass repo hooks via
   `commitRecoverySnapshot` (a failing hook must never strand unpushed work;
   the bypass is warn-logged with the recovery branch). Task-branch
   (stage/merge) commits never bypass — no `--no-verify` there (pinned by a
   scope test), no file deletion, no hook disabling. Parking (stop retrying)
   is the only other automation.

**Reconciliation note (2026-11-21).** This ADR originally forbade all bypass
(q6 survey override). Merged task `db49d6c6` then fixed the same incident's
recovery path with `--no-verify` recovery snapshots, and the recorded human
survey answer for q6 selects `--no-verify` retry — so this branch reconciled
onto that design during the merge with `main` (`64e428e6`): bypass is allowed
exactly inside `commitRecoverySnapshot`, forbidden everywhere else. The
`recovery` envelope phase is retained for wire compatibility but has no
producer. Human confirmation of this q6 middle ground (scoped recovery
bypass, no blanket auto-retry) is requested at merge review.

## Consequences

- Hook rejections become visible, actionable task errors with a concrete fix
  instead of journal-only crash loops; the stale-`lastError` mechanism for
  this class is gone (fresh `failureReason` on every failed completion).
- Same-tree retries are bounded: one poll-cycle backoff on the runner, three
  strikes then scheduler/claim parking on the backend, operator action to
  unpark. No new task status was introduced.
- The envelope doubles as the agent handoff: failback already carries
  `gitDiagnostics` into the Tier-3 prompt, so a follow-up remediation stage
  can consume it without a new channel.

## Follow-ups (deliberately out of scope)

- Push/network/auth classification (reserved kinds, one parser).
- Team webhook on hook failure.
- Agent auto-remediation stage consuming `gitDiagnostics`.
