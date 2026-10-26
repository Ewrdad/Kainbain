---
name: stage-report
description: Opt an agent stage into writing a summary report to the task's documentation folder. Attach this skill (or set stage.report: true) when a stage's prose summary alone is not enough and you want a durable, structured report file (duration, model, modified files, verification status) in docs/tasks/<taskId>/.
lastUpdated: 2026-10-11
---

# Stage Report (opt-in)

Reporting is **off by default** for agent stages. Only attach this skill (or set
`report: true` on the stage) when this stage's output genuinely needs a durable
report file — e.g. a plan artefact like `IMPLEMENTATION_PLAN.md` that later
stages or humans will re-read from disk.

## What happens when this skill is attached

1. The curated prompt gains a `# Reporting` section telling you to write a
   summary report to the path shown there (it follows the engine's naming:
   `./docs/tasks/<taskId>/<stage-slug>-<timestamp>.md`).
2. The engine writes ONE structured report on success — carrying the task,
   stage type, model, duration, status, summary, execution output, modified
   files, and verification status. This is the single deterministic writer;
   do not also hand-write a duplicate file.

## What to include

Keep the report concise but complete:

- Key changes made (files, behaviour).
- Decisions reached and where they are documented.
- Remaining risks or open items.

## What is NOT affected

- **Failure reports** are always written by the engine on stage failure
  (`<stage-slug>-failure-<timestamp>.md`, status FAILED) — they are separate
  from this opt-in success report and need no skill.
- **CI / script / deploy / merge** stages write their own command reports
  regardless of this skill.
- **Human checkpoint** approvals are recorded by the engine regardless.
