# Retrospective — Remove `[Paused]` from the UI title

Task: `0fac7482-a003-4f4c-9c65-79217d16c3f8` · Date: 2026-11-26 · Stage: retrospective (agent, docs-only)

## Ticket history

The task itself ran cleanly: six linear stage commits on `kb/0fac7482-a003-4f4c-9c65-79217d16c3f8`,
no failbacks, no retries, merged to main Nov 25 (`0ff87b5c`). Plan, implementation,
standards review, and PR review all passed first time. The friction was all structural,
around the pipeline rather than the code change:

1. **Survey never answered.** `SURVEY.md` stayed at `answers: {}` through every stage.
   The plan adopted explicit defaults (remove both prefixes; tab-title-only scope) and
   carried fallback logic plus wrong-scope risk through all downstream stages. The
   default happened to be accepted at review, but the pipeline never forced an answer.
2. **Phantom file in this retrospective prompt.** The prompt's Previous Reports section
   listed only `final-review-20261126-190301.md` as "present". That file exists in no
   git tree and could not be opened (verified: `git ls-tree` on both `main` and the
   task branch; failed read followed by folder listing). The four committed files that
   ARE present (`SURVEY.md`, `IMPLEMENTATION_PLAN.md`, `PR_REVIEW.md`,
   `STANDARDS_REVIEW.md`) were omitted.
3. **Ticket-creation skill pointed at a dead API.** Injected API base
   `http://localhost:3100` refused connections on this runner; the working backend was
   found via `KAINBAIN_RUNNER_BACKEND` in the runner env.

## Root-cause notes (verified from code)

- Previous Reports is enumerated from the **server** working tree
  (`api/work/taskDocsFiles.js`), while agents read from their **runner** worktree.
  Server-generated reports are written with a plain `writeFileSync` and never
  committed (`api/watch/stageReports.js` `saveStageReport`), so they are phantoms to
  runners — and the server checkout can simultaneously lack committed branch files.
  Completed ticket `4f927ecb` (merged Nov 16) made enumeration disk-authoritative
  against the wrong disk.
- The survey gate ticket `73f23a38` was closed as completed while still in the Idea
  stage with no implementation and no merged branch (verified via task history + git);
  the failure mode has recurred since.

## Dedupe

Checked all 83 tasks in `wf-default` on project `kainbain`. No open ticket covers any
finding above. Related tickets are completed/closed: `4f927ecb` (prior fix, wrong
disk), `73f23a38` (closed unimplemented).

## Tickets created (project `kainbain`, workflow `wf-default`, stage `1` Idea)

| Ticket | Title |
|--------|-------|
| `36ba9320-51a4-404b-a3f7-0d3bd20018e8` | Make Previous Reports match the runner workspace, not just server disk |
| `7dbb94c8-c4b4-4ab9-80d2-b4054d72beb7` | Gate Plan stage on answered requirement survey (re-raise of 73f23a38) |
| `b019bfb1-57b5-4119-9162-8339c3c6a082` | Resolve ticket-creation API base from the runner backend, not localhost |

All created with `execute: false` and deterministic idempotency keys; each verified
via re-read to sit in stage `1` (`waiting_human`). Each goal is standalone and cites
this task as its case study.
