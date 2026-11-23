# Implementation Plan — `--no-verify` for `kb-recovery/*` snapshots + per-task daemon containment

Task: `db49d6c6-bdd5-4600-aaea-15a71042ae20`
Source problem: runner `git commit` without `--no-verify` on internal recovery branches; uncaught worktree-setup error crashes the runner into a systemd restart loop.
Survey input: [SURVEY.md](./SURVEY.md) (Round 1; `answers: {}` — unanswered, so the recommended options below are carried as assumptions pending confirmation).

## Goal

1. Internal `kb-recovery/*` snapshot commits in `runner/project.js` (both the reuse path and the eviction path) pass `--no-verify`, so repo `pre-commit` hooks (binary-guard, linters, formatters) can never block parking unpushed residue.
2. Worktree setup/recovery errors in the runner daemon are contained per-task: the task is failed/released cleanly and the daemon keeps polling instead of exiting 1 into a systemd restart loop.
3. Regression tests in `runner/project.test.js` prove dirty worktrees with a failing `pre-commit` hook still park cleanly onto `kb-recovery/*` via both reuse and eviction.

## Success Criteria

- Both recovery commits (`recovery: unpushed work from reused worktree (…)` in `refreshWorktreeToRemote`, `runner/project.js` ~line 789; `recovery: unpushed work parked before eviction (…)` in `preserveEvictedWorkdir`, `runner/project.js` ~line 466) succeed with a deliberately failing `pre-commit` hook installed, and the parked content is verifiable on the `kb-recovery/*` branch.
- A `prepareWorkdir`/recovery throw inside one assignment no longer terminates `runDispatchLoop`: the loop logs, releases the task, and continues to the next poll. No new crash path is introduced for `runSingleAssignment` (single-shot mode must still exit non-zero on failure so callers/CI see it).
- `node --test runner/project.test.js runner/daemon.test.js` passes, and the repo's unit gate (`npm test`, which runs the `runner` suite via `scripts/run-tests.mjs`) passes.
- Normal (non-recovery) runner commits — e.g. harness wrap-up commits on the task branch — still run hooks unchanged.

## Survey decisions (factored in)

`SURVEY.md` Round 1 asked three questions; all are unanswered (`"answers": {}`). This plan adopts the recommended option for each as a working assumption (flagged for confirmation in Open Questions):

| # | Question | Adopted (recommended) answer | Plan effect |
|---|----------|------------------------------|-------------|
| q1 | Skip checks for emergency backups? | Yes — emergency backups only | `--no-verify` applies ONLY to the two `kb-recovery/*` snapshot commits, never to task-branch or integration commits. |
| q2 | What to do with the one failed task? | Mark failed, move to next task | Contain per-task and keep polling. Refinement: keep the existing `interrupt` (release/re-queue) routing for generic errors rather than `complete(failed)` — see Key Decision 2 for why. Runner survival is the requirement; routing stays as-is. |
| q3 | Visibility of skipped checks? | Clear warning in logs | Emit a `logger.warn` naming the recovery branch and stating hooks were bypassed, at each snapshot commit. |

## Approach

Follow "make the change easy, then make the change":

1. **Easy first:** extract the two near-identical inline recovery-commit blocks into one shared helper (single home for identity flags, message, `--no-verify`, and the warn log), with zero behavior change; add a shared failing-hook test fixture. Land this refactor green before touching behavior.
2. **Then the change:** one-line behavior change inside the helper (`--no-verify` + warn log), plus the two regression tests.
3. **Then containment:** a loop-level `try/catch` around the `executeAssignment` call in `runDispatchLoop` (the proven crash path — see Evidence), with a daemon test; deliberately NOT by removing the rethrow inside `executeAssignment`, which single-shot mode depends on.

No new dependencies, no new config flags, no schema/wire changes.

## Evidence (what the research established)

- **Commit sites:** `runner/project.js` `preserveEvictedWorkdir` (~line 463–467) and `refreshWorktreeToRemote` (~line 786–790) both run `git commit` with `-c user.name/email` but no `--no-verify`. A hook failure surfaces as `RunnerGitError(code: "git-failed")` via `runGit`.
- **Crash path:** `executeAssignment` (`runner/daemon.js` ~line 2243–2333) catches generic errors, best-effort `client.interrupt`s, then **rethrows** (line 2332). `runDispatchLoop` awaits `executeAssignment` (line 2928) with **no `try/catch`**, and the loop body has only `try/finally` — so the throw escapes `runLoop` → `main()` (`runner/main.js`) rejects → process exits 1 → systemd restarts → the interrupted task re-queues and the same poisoned worktree is reclaimed → observed 10,776-restart loop. The `WORKTREE_CAP_REACHED` precedent (interrupt + return, lines 2246–2262) shows the codebase's own pattern for "infra problem, don't die".
- **Hook mechanics:** `scripts/githooks/pre-commit` is the binary guard; `core.hooksPath=scripts/githooks` is set repo-wide and inherited by linked `kb-*` worktrees (existing test at `runner/project.test.js` ~line 364 proves inheritance). So a corrupt PNG staged anywhere in a reused/evicted worktree deterministically aborts both recovery commits today.
- **Test patterns to reuse:** `originWithWorktree()` + `refreshWorktreeToRemote` reuse test (~line 73), eviction parking test (~line 525), staged-index regression test (~line 731), `localRepo()` helper (~line 27). New tests mirror these with a failing hook installed.
- **Test entrypoints:** focused — `node --test runner/project.test.js`; full unit gate — `npm test` (`scripts/run-tests.mjs`, "Unit Tests (runner)" suite names `runner/*.test.js` explicitly).

## Key Decisions

1. **Scope of `--no-verify`: recovery snapshots only (survey q1).** These commits are local safety snapshots on `kb-recovery/*`, never pushed as task output and never merged; hook value there is zero and hook cost is a wedged runner. All other runner-authored commits keep hooks. Rejected: `--no-verify` everywhere (loses the binary-guard backstop on real output), and deleting/disabling repo hooks (mutates user repos).
2. **Containment via loop-level catch, keeping `interrupt` routing (survey q2, refined).** The minimal correct fix is `try/catch` around `await executeAssignment(...)` in `runDispatchLoop`: log the error, continue polling. The task is already released by the `interrupt` inside `executeAssignment`'s catch, satisfying "failing/releasing the task cleanly". Changing generic errors to `complete(outcome: failed)` instead would newly fail tasks for transient infra blips (network, lock contention) — a behavior change far beyond this task — so routing is left untouched. Rejected: removing the rethrow in `executeAssignment` (breaks `runSingleAssignment`'s non-zero-exit contract and the `STALE_EPOCH` contract).
3. **Shared helper over two one-line edits.** Both commit blocks duplicate identity flags and message shape; a `commitRecoverySnapshot(workdir, message, { logger })` helper (name to match repo conventions at implementation time) makes the bypass auditable in one place and prevents future drift between the paths. The helper owns: `-c` identity flags, `--no-verify`, the message, and the q3 warn log.
4. **Failing-hook fixture, not the real binary guard, in tests.** Tests install a trivial `#!/bin/sh; exit 1` hook (via `core.hooksPath` on a fixture dir or a `.git/hooks/pre-commit` file in the temp repo) so they are hermetic, fast, and independent of `check-binary-guard.mjs` internals. One test may additionally exercise the real guard with a corrupt PNG if cheap, but it is not required.

## Steps

### Step 0 — Recon and reproduce (research; no behavior change)

- Confirm the two commit sites and the `runDispatchLoop` → `executeAssignment` → `prepareWorkdir` → `runGit` throw chain on the current checkout (line numbers above were read this session; re-verify at implementation time).
- Run the existing recovery tests green as a baseline: `node --test runner/project.test.js`.
- Write a throwaway repro (under `/tmp`, not committed): temp repo + failing `pre-commit` hook + dirty file → call `refreshWorktreeToRemote` and `preserveEvictedWorkdir` → confirm both reject today. This is the red baseline for Step 2.
- Depends on: nothing. Validates: problem statement is still accurate.

### Step 1 — Make the change easy: extract helper + fixture (refactor; no behavior change)

- In `runner/project.js`, extract a shared `commitRecoverySnapshot(workdir, message)` helper containing the exact current argv (`-c user.name/email`, `commit -m`) and replace both inline blocks with calls to it. No `--no-verify` yet. Update the MARK/JSDoc comments on `preserveEvictedWorkdir` / `refreshWorktreeToRemote` to point at the helper.
- In `runner/project.test.js`, add a `installFailingHook(repoDir)` fixture helper (writes an always-fail `pre-commit`, wires it via `core.hooksPath` or `.git/hooks`, asserts it actually fires with a scratch commit).
- Depends on: Step 0. Validates: `node --test runner/project.test.js` green; `git diff` shows argv-identical behavior (review the two call sites).

### Step 2 — Make the change: `--no-verify` + warn log + regression tests

- Add `--no-verify` to the helper's commit argv and a warn-level log naming the recovery branch/message and stating hooks were bypassed (survey q3). Thread the logger through (check how `project.js` logs today; if it has no logger, `console.warn` via an injectable param defaulting to console, matching testability).
- Add two regression tests in `runner/project.test.js` (mirror existing patterns):
  1. **Reuse:** `originWithWorktree()`-style setup + failing hook + dirty file → `refreshWorktreeToRemote` resolves, `recoveredTo` matches `^kb-recovery/…`, parked file present via `git ls-tree`, worktree clean.
  2. **Eviction:** `localRepo()` + `prepareWorkdir` + failing hook + dirty/staged file → `preserveEvictedWorkdir` (and/or the cap-eviction flow from the ~line 525 test) resolves, `kb-recovery/…` branch exists with the file, task-branch tip unchanged (mirror the ~line 731 assertions).
- Prove red→green: run the new tests against the pre-Step-2 helper (stash the argv change) to confirm they fail, then with the change to confirm they pass.
- Depends on: Step 1. Validates: new tests fail-before / pass-after; full `node --test runner/project.test.js` green.

### Step 3 — Daemon containment: per-task catch in the dispatch loop

- Wrap the `await executeAssignment({...})` call in `runDispatchLoop` (`runner/daemon.js` ~line 2928) in `try/catch`: on error, `logger.error`/`logger.warn` with task/project IDs and the message, then continue polling. Keep the post-assignment reap + self-update flow reachable after a caught error (place the catch so the loop proceeds to the next iteration cleanly; decide at implementation time whether reap should run for the failed assignment — recommended: yes, keep it inline by catching narrowly around `executeAssignment` only).
- Audit (no change expected, verify by reading): `runSingleAssignment` keeps throw/exit-non-zero; `STALE_EPOCH` still propagates (it must — epoch fencing); `executeIntegrationAssignment` throws are also covered by the same loop catch; `WORKTREE_CAP_REACHED` path unchanged.
- Add a `runner/daemon.test.js` test: stub `prepareWorkdir` (or the client/claim seam the existing daemon tests use) to throw on the first assignment and succeed/stop on the second poll; assert the loop survives the first failure and processes the second (or exits its bounded test run) instead of rejecting. Follow existing `daemon.test.js` fakes — do not build a new harness double if one exists.
- Depends on: Step 2 (independent code-wise, but sequenced after so the primary fix lands first). Validates: new daemon test fails-before (loop rejects) / passes-after; `node --test runner/daemon.test.js` green.

### Step 4 — Docs, hygiene, and full gates

- Update `runner/README.md` recovery/eviction section if it describes recovery commits or loop failure handling (short note: recovery snapshots bypass hooks by design; dispatch loop isolates per-task failures). Keep JSDoc on touched functions accurate.
- Run the full gates: `node --test runner/project.test.js runner/daemon.test.js`, then `npm test` (root, covers the runner suite) and any lint gate the repo configures for `runner/` (check `package.json` scripts / CI at implementation time).
- Re-verify non-goals: `git commit` argv for wrap-up/integration commits untouched; no hook files in the repo modified.
- Depends on: Steps 2–3.

## Validation Plan

| Check | Command / evidence | Expected |
|-------|--------------------|----------|
| Focused recovery tests | `node --test runner/project.test.js` | All pass, incl. 2 new failing-hook tests |
| Focused daemon tests | `node --test runner/daemon.test.js` | All pass, incl. new loop-survival test |
| Red→green proof | New tests vs pre-fix helper (Step 2) and pre-fix loop (Step 3) | Fail before, pass after (record output in the task docs) |
| Full unit gate | `npm test` | Green (runner suite included via `scripts/run-tests.mjs`) |
| Manual repro | `/tmp` script from Step 0 re-run post-fix | Both paths park cleanly with failing hook |
| Scope audit | `git diff --stat` + grep `--no-verify` in `runner/` | Only the helper + tests + loop catch + docs touched |

Highest-risk validation: the Step 3 daemon test — `runDispatchLoop` is timing/poll-driven, so the test must bound the loop deterministically using existing test seams; if no clean seam exists, prefer extracting a tiny `runOneDispatchIteration` pure-ish unit over sleeping/flaky polling.

## Risks

- **Masking real damage (q1 trade-off):** bypassed snapshots can park corrupt binaries. Accepted by design (survey q1): recovery branches are forensic snapshots, and the q3 warn log preserves discoverability. Mitigation: log message includes branch name + reason.
- **Poison-task flap:** after containment, a task whose setup fails persistently will interrupt/re-queue and be reclaimed repeatedly (runner survives, task flaps). This matches the existing `WORKTREE_CAP_REACHED` behavior and is strictly better than a restart storm; consecutive-failure backoff is explicitly out of scope (see Non-goals).
- **Logger threading in `project.js`:** if the module currently never logs, adding a logger param touches several signatures. Mitigation: optional param defaulting to console; keep the diff minimal.

## Non-goals

- Changing `interrupt` → `complete(failed)` routing for generic errors.
- Consecutive-failure backoff/circuit-breaking for flapping tasks.
- `--no-verify` on any non-recovery commit (wrap-up, integration merge, stage output).
- Touching `scripts/githooks/*`, hook installation, or the binary guard itself.
- Systemd unit changes (no `Restart=` tuning needed once the process stops crashing).

## Open Questions

1. **Survey confirmation:** `SURVEY.md` answers are empty — confirm the three adopted recommended options (q1 emergency-only bypass, q2 fail/move-on refined to interrupt-and-continue, q3 warn log). If q2's literal "mark failed" is required instead of interrupt-and-continue, Step 3 needs a routing change with wider blast radius — decide before implementing Step 3. (Default if unanswered: proceed as planned.)
2. None other — all technical facts were verified in-repo this session.

## Work estimate / sequencing note

Big/research pieces first per the stage brief: Step 0 (repro + chain verification) and the Step 3 seam investigation are the riskiest and come before/around the small behavior edits. Steps 1–2 are small and mechanical once the helper shape is chosen. Total: 4 implementation steps + gates, all in `runner/project.js`, `runner/daemon.js`, `runner/project.test.js`, `runner/daemon.test.js`, plus a short `runner/README.md` note.
