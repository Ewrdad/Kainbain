---
title: Getting Started
section: working-with
order: 5
slug: getting-started
---

# Getting Started

KainBain runs AI coding agents for you through a pipeline of stages: you
describe a task, each stage does its part (write code, review it, run tests),
and you approve the result. This page is the map — follow the five steps in
order and you will go from an empty machine to your first finished task.

## Pick your starting point

| If you… | Start here |
| --- | --- |
| Just want to try KainBain | First-Time Setup (`#/docs/first-time-setup`) — the ordered path, including a zero-credential mock mode |
| Already have a code repository | Load Existing Projects (`#/docs/existing-projects`) — adopt it in place, nothing is moved |
| Want to run work on more machines | Adding a New Runner (`#/docs/add-new-runner`) — after you have the basics working |

Everyone else: keep reading. The five steps below are the whole journey.

## The five things you will do

1. **Install and run** — get the app booted on your machine (Install & Run (`#/docs/install-run`)).
2. **Create or adopt a project** — a project is one codebase KainBain works on. Make a new one or adopt an existing repo (`#/docs/existing-projects`), then shape it in Your First Project & Workflow (`#/docs/first-project`).
3. **Shape your stages** — a stage is one step of the pipeline (for example "implement" then "human review"). Start with one agent stage plus one human review (Your First Project & Workflow (`#/docs/first-project`)).
4. **Submit a task** — a task is one unit of work ("add a login page"). See Submit & Track Tasks (`#/docs/submit-track-task`).
5. **Review and merge** — check the stage output, approve it, and merge (Review Gates (`#/docs/review-gates`)).

```bash
npm run setup          # once per clone: all deps + Playwright Chromium
npm run dev            # start API + frontend dev servers (any OS)
```

That is the whole install in two commands. The detail reference (manual
control, production deploy, every command) lives in Install & Run
(`#/docs/install-run`) — this box stays a copy so the two can never drift.

## Words you will see everywhere

| Word | What it means |
| --- | --- |
| Runner | A background worker process that executes agent stages. Agent stages ONLY run on runners. See Adding a New Runner (`#/docs/add-new-runner`) |
| Harness | The AI helper a runner talks to: Pi, Muse, OpenCode, and others. Each runner advertises which harnesses it offers |
| Project | One codebase plus its pipeline definition and settings |
| Task | One unit of work moving through the pipeline |
| Stage | One step of the pipeline (agent, human review, CI, …). See Pipeline Stages (`#/docs/pipeline-stages`) |
| Skill | A small instruction package attached to a stage that needs heavy domain knowledge. See Custom Skills (`#/docs/custom-skills`) |
| Model | The AI model a harness uses (for example a Pi catalogue entry) |
| Alias | A nickname for a model, so pipelines survive model renames |

## Where to get help

- Triage FAQ (`#/docs/faq`) — symptom → fix index for the most common problems.
- Ports & Environment (`#/docs/ports-env`) — every knob, port, and environment variable in one place.
- How KainBain works: Architecture (`#/docs/architecture`) for the big picture, Agent Execution (`#/docs/agent-execution`) for how stages run.
