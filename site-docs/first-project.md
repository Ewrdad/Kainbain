---
title: Your First Project & Workflow
section: working-with
order: 30
slug: first-project
---

# Your First Project & Workflow

A project is one codebase plus its pipeline definition and settings. This
guide takes you from an empty board to a shaped pipeline and your first
successful run.

## Create a project

In the UI, create a project with a name and a working directory (`cwd`) — the sandbox root the agent's file tools and the Files & Repo explorer are confined to. Or via API:

```bash
curl -X POST http://localhost:3100/projects \
  -H 'Content-Type: application/json' \
  -d '{"name": "My app", "cwd": "/home/user/projects/my-app", "gitUrl": "https://git.example.com/me/my-app.git"}'
```

Creating a project requires a fetchable git remote (pass `gitUrl`, or set
a `KAINBAIN_GIT_REMOTE_TEMPLATE` default) — without one the API answers
`400` naming the missing remote. Local-only work stays available through
adoption instead (see below).

`POST /projects/:id/activate` marks the default project used when calls omit `projectId`.

Already have a repository? Adopt it instead — see Load Existing Projects
(`#/docs/existing-projects`). (Formerly in `first-project`, removed —
adoption and the custom state-folder flow now live there.)

## Shape the pipeline

Each project owns an ordered stage list. Start simple — one agent stage plus a human review:

- `GET /projects/:id/workflow` — inspect stages, `currentStageId`, named workflows.
- `PUT /projects/:id/workflow` — replace the stage list (`{ stages: [...] }`).
- `POST /projects/:id/workflows` — save a named variant; `GET` the collection to list them.

Keep stage instructions short and verifiable ("implement X, prove with `npm test`"), and attach a **stage skill** when one stage needs heavy domain instructions (see Custom Skills (`#/docs/custom-skills`)). Stage kinds, runner policies, and the 200-stage cap are documented in Pipeline Stages (`#/docs/pipeline-stages`).

## Explore

The **Files & Repo** tab (keyboard `2`) browses the project's sandboxed filesystem with markdown/code preview and links out to notes and git. It is read-only exploration — real changes happen through tasks.

## Project settings tabs

Project Settings is split into focused tabs: **Project Settings** (name, model, look, retry/timeout budgets), **Aliases** (model nicknames), **Files & Repos** (folders, git address), **Addresses**, **Named Workflows**, and **Skills**. The search box at the top right jumps to and highlights the matching setting across every tab. Switching between the Project, Aliases, and Files & Repos tabs keeps unsaved edits; leaving for Named Workflows or Skills with unsaved edits asks for confirmation first.

## Your first successful run

1. Submit one small task ("add a health-check endpoint and prove it with a test") — see Submit & Track Tasks (`#/docs/submit-track-task`).
2. Watch it move through the pipeline on the board. Agent stages run on a runner (see Adding a New Runner (`#/docs/add-new-runner`)); if no runner is available the task waits.
3. When the stage finishes, open the task and read the stage output. If the stage-report skill is attached, a structured report lands in the task's docs folder too.
4. Approve the human review step to advance, then merge when the pipeline completes — see Review Gates (`#/docs/review-gates`).

If the run fails, the failure report names the cause and the fix path.
Common first-run issues (no runner, no model access) are covered in the
Triage FAQ (`#/docs/faq`).
