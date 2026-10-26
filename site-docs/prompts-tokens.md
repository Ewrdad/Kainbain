---
title: Prompts, Tokens & Stage Skills
section: how-it-works
order: 50
slug: prompts-tokens
---

# Prompts, Tokens & Stage Skills

Every agent stage runs on a **freshly curated prompt**, composed at dispatch time — never a stale copy. Preview it without executing via `POST /tasks/preview` (`{ goal, projectId, stageId }`); the review modal in the UI is read-only for the same reason.

## Template tokens

Stage prompts are templates with tokens resolved from live state: the task goal, project context, stage instructions, and conversation history. Because curation happens at dispatch, edits you make before confirming are always reflected.

## Stage skills (lean context by default)

Stages can attach reusable, user-authored **skills** — small markdown instruction packages (`SKILL.md` plus an optional config) — injected only into the stages that need them. Heavy instructions ship to one stage, not every prompt.

- `GET /skills?projectId=<id>` lists the merged library (global plus project overlay, which shadows by name); omit `projectId` for the global library only.
- `GET /skills/:name` fetches one skill's raw markdown for preview.
- Skill edits apply to the next dispatch — no restart needed.

## Authoring and importing skills

A skill is a folder `<slug>/SKILL.md` — YAML frontmatter (`name`, `description`)
plus a markdown body — with an optional tolerant `KB_config.json` for keyword
defaults. Slugs match `/^[a-z0-9][a-z0-9-]*$/`.

Authors ship skills two ways: drop the folder into the global library or the
project's `skills/` overlay directly, or import through **Settings › Skills** —
a `.md` file, or a `.zip` holding `SKILL.md` at its root (or inside exactly one
top-level folder) with an optional sibling `KB_config.json`. Imports land in the
project overlay only; missing frontmatter is normalized (name from the filename,
description from the first heading) and every normalization is reported, never
silent. The endpoint contract lives in `#/docs/api-reference` under Skills.

Attach an imported skill in any stage's Skills panel: `direct` injects the body
into the curated prompt, `option` lists it in the `# Available Skills` manifest
for the agent to self-read.

## Default prompt layout editor

System Settings (`#/system-settings` → **Prompt Layout**) features a **Prompt Layout** editor allowing customization of the default prompt layout markdown template:

- **Section Tokens**: `{{task}}`, `{{stage}}`, `{{skills}}`, `{{taskImages}}`, `{{previousReports}}`, `{{reporting}}`, `{{failureDetails}}`, `{{testingGuidance}}`, `{{failureGuidance}}`.
- **Inline Tokens**: `{{project}}`, `{{projectRoot}}`, `{{projectRepo}}`, `{{taskRepo}}`, `{{taskId}}`, `{{taskGoal}}`, `{{stageName}}`, `{{taskDocs}}`, `{{latestReportPath}}`, `{{latestReport:<slug>}}`.
- **Mandatory Tokens**: `{{task}}`, `{{stage}}`, and `{{failureGuidance}}` must remain present so the agent stage contract (verdicts, failure guidance) is never silently omitted.
- **Conditional Auto-Re-Injection**: `{{failureDetails}}` and `{{testingGuidance}}` auto-re-inject when needed context is present even if omitted in the template.
- **Blast-Radius Containment & Fallbacks**: Dry-run preview allows testing layout changes before saving; per-task safe-mode (`useDefaultLayout`) allows bypassing custom layouts; persistent fallback detection automatically serves the default layout if runtime render errors occur.

## Context management

Long sessions can be compacted (`POST /compute/compact`; idempotent success when there is nothing worth compacting) and inspected (`GET /compute/context` always answers a `{ current, limit }` pair). Follow-up guidance and steering (`POST /tasks/:id/follow-up`, `/steer`) inject into the running session without losing history.

