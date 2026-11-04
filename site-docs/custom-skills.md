---
title: Custom Skills
section: working-with
order: 52
slug: custom-skills
---

# Custom Skills

A **skill** is a small markdown instruction package you attach to a
stage that needs heavy domain knowledge — a review checklist, a house
coding style, a question flow. Skills keep prompts lean: heavy
instructions ship to one stage, not every prompt.

> **When to use one:** a stage's instructions are getting long, the
> same instructions repeat across tasks, or only one stage needs them.
> One worked example below takes you from idea to a verified working
> skill. The full contract reference lives in Prompts, Tokens & Stage
> Skills (`#/docs/prompts-tokens`); the endpoint contract in API
> Reference (`#/docs/api-reference`) under Skills.

## Worked example: hello-reviewer

Goal: a review checklist injected into the review stage of one project.

### 1. Create the folder and SKILL.md

A skill is a folder `<slug>/SKILL.md` — YAML frontmatter plus a
markdown body. Slugs match `/^[a-z0-9][a-z0-9-]*$/` (lowercase,
hyphens only, must start with a letter or digit).

```text
hello-reviewer/SKILL.md
```

```md
---
name: hello-reviewer
description: Review checklist for the hello project — what every review must check.
lastUpdated: 2026-11-04
---

# Hello Reviewer

You are reviewing a change to the hello project. Check every item:

1. Tests exist for the changed behavior and pass.
2. No secrets or host-specific paths in the diff.
3. The change matches the task goal — flag scope creep.

Report each item as pass or fail with the file and line.
```

An existing skill to copy the shape from: `skills/stage-report/SKILL.md`
in the repo (frontmatter `name`, `description`, `lastUpdated`, then
the body).

### 2. Add KB_config.json

Next to `SKILL.md`, an optional tolerant `KB_config.json` carries
keyword defaults. For our example, default to `direct` injection:

```text
hello-reviewer/KB_config.json
```

```json
{
  "isDefault": false,
  "description": "Review checklist for the hello project.",
  "defaults": {
    "mode": "direct"
  }
}
```

### 3. Import it

Open **Project Settings → Skills** for your project and import either
the `.md` file or a `.zip` holding `SKILL.md` at its root (or inside
exactly one top-level folder) with an optional sibling
`KB_config.json`. Imports land in the **project overlay only**
(`<projectRoot>/skills/`), which shadows the global library by name.

Missing frontmatter is normalized, never silent: the name comes from
the filename and the description from the first heading, and every
normalization is reported. API form:
`POST /projects/:id/skills/import`.

Alternatively, drop the folder into the global library
(`<repo>/skills`) or the project's `skills/` overlay directly — edits
apply to the next dispatch, no restart needed.

### 4. Attach it to a stage

Open the stage's **Skills panel** and attach `hello-reviewer`:

- `direct` injects the skill body into the curated prompt — use this for must-follow instructions like our checklist.
- `option` lists the skill in the `# Available Skills` manifest so the agent can self-read it — use this for reference material.

`GET /skills?projectId=<id>` lists the merged library (global plus
project overlay); omit `projectId` for the global library only.
`GET /skills/:name` fetches one skill's raw markdown for preview.

### 5. Run and verify

Preview the curated prompt without executing:

```bash
curl -X POST http://localhost:3100/tasks/preview \
  -H 'Content-Type: application/json' \
  -d '{"goal": "try the checklist", "projectId": "<id>", "stageId": "<stage>"}'
```

With `direct` attached, the skill body lands in the curated prompt.
With `option`, the skill appears in the manifest instead. Then run a
real task and confirm the stage follows the checklist.

## Common mistakes

| Mistake | What happens | Fix |
| --- | --- | --- |
| Slug has capitals or underscores | Rejected — slugs match `/^[a-z0-9][a-z0-9-]*$/` | Rename to lowercase hyphens |
| Name clashes with an existing skill | Import returns `409` naming the conflicts | Rename, or delete the old one (`DELETE /projects/:id/skills/:name`) |
| Same name as a global skill | Project overlay shadows it (a "shadow" badge marks this) | Intended for overrides; rename if accidental |
| Wrong file extension | Only `.md` files and `.zip` archives import | Repackage |
| Skill attached but prompt unchanged | Attached as `option` (manifest only), or attached to a different stage | Use `direct` for injection; check the stage id in the preview call |

Survey-driven skills (question flows) build on the canonical parent
`skills/question-me` — see Surveys (`#/docs/surveys`).
