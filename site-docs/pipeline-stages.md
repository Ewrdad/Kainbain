---
title: Workflow Pipeline & Stage Types
section: how-it-works
order: 20
slug: pipeline-stages
---

# Workflow Pipeline & Stage Types

A **project** owns an ordered list of **stages**; a **task** walks that pipeline from left to right on the kanban board. Named **workflows** let one project keep several stage lists and switch between them.

Execution, however, is **one shared pipeline across all projects**: a single global queue runs at most one task at a time, ordered linearly — follow-on work from the just-completed task first, then the task closest to completion (furthest stage), then the oldest. Per-project boards and per-project workflow editing are unchanged; they are views onto the shared queue, and the Now Playing bar always shows the queue's engine owner no matter which project is selected.

## Stage types

| Type | Meaning |
| ---- | ------- |
| `agent` | Automated execution by the AI agent. |
| `human` | Manual checkpoint — the task waits for your approval or rejection. |
| `ci` | Automated bash/script verification command. Runs no model. |
| `merge` | Git operations only — integrates the task branch into the default main branch, auto-commits, records the review baseline, and pushes. Never runs a command. Runs no model. |

There is no `deploy` stage type any more: **a stage whose command runs the deploy script** (e.g. `./deploy.sh --prod`) **is an ordinary `ci` stage**. The engine never branches on command text: a deploy-command stage gets the same `running_ci` status, CI timeout/stall budgets, heartbeat, and failback behaviour as any other `ci` stage. On failure it routes to its configured fallback like any other CI stage, so an agent can fix it. A deploy-command stage honours the same **Run on branch** contract as any other `ci` stage.

Git failures and deploy failures stay clearly separated: a merge-stage failure carries only git semantics (not a repository, no commits, missing branch, dirty tree, empty branch, merge conflict — routed by its configured failback; once a merge has landed it is never rewound and a later failure parks on the merge stage), and a command-stage failure carries only command semantics (the command, exit code, and captured output excerpt) and routes to its configured fallback like any other CI stage. Legacy `deploy`-typed stages (and composite "Merge and deploy" merge stages that carried a command) are migrated automatically on project load: the merge stage becomes git-only and a dedicated `Deploy` ci stage is inserted right after it.

KainBain's own cross-restart deploy continuity (surviving its self-redeploy) lives outside the shared pipeline in the implementation-specific continuity module, enabled only by the `KAINBAIN_SELF_DEPLOY_CONTINUITY=1` flag. Generic projects never load it.

Scripted stages (`ci`, `merge`) execute shell commands and git operations only — no AI agent, prompt, session, or model is involved. On the monitor view the model and harness pills are hidden for these stages (an `Automated — no model` pill is shown instead) so they never imply AI involvement.

### CI run-on branch

A `ci` stage has an optional **Run on branch** setting that decides which git branch the verification command runs against. It applies to deploy-command ci stages too — the only difference is the meaning of the default:

| Mode | Meaning |
| ---- | ------- |
| `task` *(default)* | The task's own branch / isolated worktree — today's behaviour, unchanged. For a deploy-command stage this runs `deploy.sh` from the task worktree: a branch-specific deploy for isolated testing (falls back to the primary checkout when none is provisioned). |
| `primary` | The project's primary/default branch, auto-resolved per repository (`origin/HEAD` → `main` → `master` → current → `main`), so a merge can be verified on main / master / dev / prod — whatever the project uses. |
| `custom` | A named branch you type in (e.g. `release/next`). It must already exist locally. |

Why you might want this: a pipeline of `… → merge → ci (primary)` verifies the **merged** result on the primary branch. If the merge broke main, the CI stage fails and routes to its configured failback (e.g. retask an agent to fix it) — the same evidence loop that replaced the old combined merge-and-deploy stage type with a plain merge plus a separate deploy CI stage.

How it behaves at run time:

- The command executes in the primary checkout, guarded onto the target branch, and the default branch is restored afterwards — on success and on failure alike.
- The switch is refused (with a clear stage failure) when the working tree is dirty or the project is not a git repository; a custom branch that is blank, invalid, or missing fails the stage before any checkout. A misconfigured stage never silently falls back to the task branch.
- Task-branch finalize (commit + push of task work) is **skipped** for `primary`/`custom` runs: a verification or deploy run must never commit or push onto the primary or custom branch. Keep CI commands on these modes read-only (tests, lint, builds) and gitignore their artifacts — a command that dirties the tree will make the restore refuse and fail the stage loudly.
- The stage report records the resolved branch and its tip SHA (`**Branch:** main (primary) @ <sha>`) so a failed run is auditable.

## Stage change badges

Each history row's `+N -M` badge measures that stage's own commit range (stage start → stage end on the task branch), not the whole task branch. An editing stage keeps its real counts; a testing stage that changes nothing shows `+0 -0`. When a stage fails, its partial work is committed with a `... (failed)` message first, so the failed attempt owns its own diff and a retry measures only the retry. Rows recorded before this scheme (no range data) render exactly as before.

## Task statuses

A task's `status` tells you where it stands: `idle`, `in_stage`, `waiting_human`, `running_agent`, `running_ci`, `advancing`, `checkpoint`, `blocked`, `paused`, `interrupted`, `failed`, `passed`, `completed`. (Old records may still carry the legacy `running_deploy` label, which reads as `running_ci`.)

## Driving a task

- **Execute** runs the current stage (`POST /tasks/:id/execute`).
- **Advance** approves a checkpoint and moves on; optional guidance is appended to the goal. Approving a last-stage checkpoint completes the task instead (the UI says "Approve & Mark Complete").
- **Reject** sends it back with required human feedback.
- **Failback / move / jump** route a task to an earlier or arbitrary stage.
- **Retry** re-runs a failed stage with a freshly curated prompt; **pause/resume** and **abort** control live execution.

Auto-iteration can re-run a failed stage automatically (fix, re-test, re-review) up to a configured limit before parking the task as `failed` for a human.

## Retry budgets

Every failed stage consumes from two loop budgets: the **auto-iteration budget** (failback-and-retry cycles) and the **transient budget** (same-stage retries for timeouts and infrastructure errors). Budgets resolve per stage as **stage override → project override → global default**; a project-wide value lives in Project Settings › Retry & Timeouts (Project tab), and a per-stage value (when set) still wins over both. A budget of `0` disables that loop; a blank project field follows the global default.

Hitting **retry** (`POST /tasks/:id/retry`, the failed-stage banner button) gives the task a genuinely fresh attempt: both loop counters restart at zero and the stage clock re-enters, so the next failure auto-retries again instead of parking immediately. The parking failure is still reinjected into the retried attempt's prompt as context. Plain **execute** (`POST /tasks/:id/execute`, the Run Stage button) is first-run/manual dispatch — it keeps counting from the current values and never restarts a budget, so the scheduler can never silently grant infinite retries.

## Exporting and importing pipelines

The ▾ menu next to **Add stage** (end of the board on desktop, end of the stage strip on phones) exports the active pipeline to a `.pipeline.json` file and imports one back. Export downloads pretty-printed JSON you can open in any text editor, tweak by hand, and re-import on another project.

Import always creates a **new** pipeline (default name `<original> (imported)`, editable in the confirmation step) — nothing existing is changed, and the new pipeline stays inactive until you switch to it. Stage ids are remapped on import so imports can never collide with existing stages.

Minimal example:

```json
{
  "kainbainPipeline": 1,
  "name": "My Pipeline",
  "exportedAt": "2026-10-08T10:00:00.000Z",
  "stages": [
    {
      "name": "Elaborate",
      "type": "agent",
      "prompt": "Plan the work for {{project}}.",
      "model": "deepseek-v4-pro:0813-cloud",
      "timeout": 1800000,
      "paused": false,
      "failback": "previous"
    },
    {
      "name": "Review",
      "type": "human",
      "prompt": "Checklist: scope, tests, docs.",
      "failback": "start"
    },
    {
      "name": "Verify",
      "type": "ci",
      "command": "npm run test:unit",
      "timeout": 60000,
      "failback": "previous"
    }
  ]
}
```

Rules for hand-edited files: `"kainbainPipeline"` must be `1`; `"name"` must be a non-empty string; `"stages"` must be a non-empty array (max 200); each stage needs a `"name"` and a known `"type"` (`agent`, `human`, `ci`, `merge` — legacy `review`, `script`, `deploy`, `custom` are also accepted; `deploy` normalizes to `ci`). Optional per-stage fields: `description`, `prompt`, `model`, `harness`, `command`, `timeout` (milliseconds), `skills` (array), `paused` (boolean), `failback` (string), `runOnBranch` (`ci` only: `"task"` | `"primary"` | `"custom"`), `customBranch` (string, `ci` with `runOnBranch: "custom"` only). Files over ~1 MB are rejected. Invalid files are refused with a message naming every problem, and nothing is written.

## Who is "running", and in which stage

The monitor, board, cards, and Now Playing bar all answer two questions the same way. The rules below are the contract; the code that enforces them is linked so a future change keeps them in sync.

- **Engine-owner-is-lock.** The engine runs one task at a time. The owner is `engineState.activeTaskId` while `engineState.status === 'running'`. A task with a `running_*` (or `advancing`) status that does *not* own the engine is **stale** — it is never rendered as RUNNING, only as interrupted/stale with a retry affordance. Frontend derivation lives in `frontend/src/components/tasks/runningTask.js` (`isTaskRunning` / `isStaleRunner` / `resolveRunningTask`); every RUNNING badge and active slot imports from it.
- **The running task's stage is its pipeline stage.** A header never names a stage from the raw engine snapshot when an owner task is known: the displayed stage is the task's `currentStageId` resolved through its pipeline (`api/activeTaskDisplay.js` `resolveEngineStageProjection`, `frontend/src/components/tasks/runningTask.js` `resolveDisplayedStage`). `getEngineState()` reconciles the snapshot at read time, so an already-stranded snapshot (from before a manual move) renders correctly without a migration and survives a page refresh.
- **Manual move interrupts a live run.** Dragging a task to another stage (or using the move/jump arrows, or the inspector's stage picker) is an explicit operator override. Because the in-flight execution belongs to the stage the task just left, the run is stopped and the engine released — the task is parked at the destination with a non-live status. The move records the abandoned stage (`task.supersededStageId`); when that orphaned run settles — a killed command-stage run surfaces as a plain non-zero exit with no abort marker — `handleStageFailure` settles it quietly like an operator abort instead of failing back and auto-retrying, so the move sticks. The marker is consumed by the settle and can never suppress a later genuine failure. It is intentionally memory-only (never persisted to the task file): after a server restart there is no orphaned run left to quiet, and startup recovery re-parks the task via the orphaned running-status collapse instead. Automatic `advance`/`failback` transitions only re-point the displayed stage; they never kill a settling run. The rules live in `api/flow/stageTransitions.js` `moveToStage` (`operatorMove`) and `api/flow/stageFailureRouting.js` (`handleStageFailure` / `settleOperatorAbort`).
- **Ambiguous second.** If a manual dispatch is attempted while another task owns the engine the API answers `409`, and the card renders a queued/busy signal instead of implying the run starts now (`isEngineBusyWithOther`).
