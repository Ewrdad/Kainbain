---
name: creating-new-tickets
description: Create follow-on KainBain tasks (tickets) into a chosen project/pipeline/stage via the KainBain API. Use when findings should become actionable work items. Supports injecting the target project name and pipeline/stage through KB_config keywords (targetProject, targetWorkflow, targetStage).
lastUpdated: 2026-09-12
---

# Creating New Tickets (KainBain)

Use this skill to turn findings from the current task into actionable,
discrete KainBain tasks ("tickets") in a chosen project, pipeline (workflow),
and stage. Everything happens over the KainBain HTTP API — no filesystem or
shell work is required to create a ticket.

**Resolved targets for this run:**

- Target project: `{{targetProject}}`
- Target workflow: `{{targetWorkflow}}`
- Target stage: `{{targetStage}}`
- API base: `{{kbApiBase}}`

## 1. Resolve the ids first (names are case-insensitive but ids are exact)

1. `GET {{kbApiBase}}/projects` → find the project whose `name` or `slug`
   matches `{{targetProject}}`; take its `id`. If none matches, the target
   project does not exist — report that and stop; do NOT guess an id.
2. `GET {{kbApiBase}}/projects/<projectId>/workflows` → find the workflow
   matching `{{targetWorkflow}}` (its `id` is needed verbatim).
3. Inside that workflow, resolve `{{targetStage}}` to a stage `id`. Stage
   names may also be passed directly as `stageId` to `POST /tasks`
   (`resolveStage` matches by id **or** name, case-insensitively) — but
   resolving to the exact id is preferred for auditability.

## 2. Deduplicate before creating (guardrail)

Call `GET {{kbApiBase}}/tasks?workflowId=<workflowId>` (add `projectId` when
the task store does not default to the target project) and check the open
tasks. Do NOT create a ticket for a finding that already has an open task in
the same stage with substantially the same goal. Cap the run at **10 new
tickets**; if more findings qualify, create the 10 highest-value ones and
report the remainder instead of flooding the pipeline.

## 3. Create the ticket

`POST {{kbApiBase}}/tasks` with a JSON body:

```json
{
  "projectId": "<target project id>",
  "title": "<short imperative title>",
  "goal": "<one-paragraph description of the work>",
  "stageId": "<target stage id or exact name>",
  "workflowId": "<target workflow id>",
  "idempotencyKey": "<deterministic key>",
  "execute": false
}
```

- `idempotencyKey` is REQUIRED: derive it deterministically, e.g.
  `sha256(finding-summary + targetStage + currentTaskId).slice(0, 32)` — a
  retry of the same finding must not create a second ticket.
- Leave `execute` false unless the finding is explicitly ready for immediate
  agent execution; tickets land in the target stage for the pipeline to process.
- Never target the stage that is CURRENTLY executing this task (recursion
  guard): re-entering the running stage would loop the pipeline back onto
  itself.

## 4. Verify each creation

A successful response returns the created task with `id` and `status`.
Verify by re-reading `GET {{kbApiBase}}/tasks/<id>?projectId=<projectId>`:
confirm `currentStageId` matches the target stage. Report every created
ticket id, title, and stage in the stage report so operators can audit the
fan-out.

## Guardrails (always apply)

- Dedupe before create; never duplicate an existing open ticket.
- Hard cap: at most 10 tickets per run.
- Never create a ticket targeting the currently executing stage.
- Always send a deterministic `idempotencyKey`.
- If ids cannot be resolved (unknown project/workflow/stage), stop and report
  the miss instead of guessing.
- Tickets are created with `execute:false` by default; only set `execute:true`
  when the finding is verified and ready for autonomous execution.

## KB_config keyword reference metadata (for skill authors)

The `targetProject` / `targetWorkflow` / `targetStage` keywords in
`KB_config.json` carry optional metadata that tells the stage editor to render
them as dropdowns populated from KainBain's known data instead of free-text
inputs:

- `"kbRef": "project" | "workflow" | "stage"` — the keyword's value domain.
- `"dependsOn": "<otherKeyword>"` — the parent keyword whose selection scopes
  this one (project → workflow → stage).

Selecting from a dropdown stores the canonical entity **id**; the values are
resolved against KainBain's live data and validated when the stage is saved
(`PUT /projects/:id/workflow` rejects unknown references with a descriptive
400). Free text still works: the editor offers an "Enter value manually…"
fallback, and legacy stored values (names, slugs, `{{project}}`) keep working
exactly as before. See `docs/KB Architecture.md` → "Skill keyword reference
metadata" for the full contract.
