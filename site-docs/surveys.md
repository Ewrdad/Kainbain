---
title: Question-Me Surveys
section: working-with
order: 36
slug: surveys
---

# Question-Me Surveys

Some stages need answers only a human has. Attach the `question-me` skill to an
**agent stage** and the agent generates its whole questionnaire up front (unlike
the iterative grill-me style), writes it to `{{outputFile}}` (default
`SURVEY.md`) in the task folder, and parks the task for a human instead of
auto-advancing. The survey page (`/tasks/:taskId/survey`, works on mobile and
desktop) collects the answers; submitting them advances the task to its next
stage, which can then read `{{outputFile}}` — for example a plan stage told to
"factor in {{outputFile}}, and fail the stage with information needed when
there is not enough information".

By default the output file is `SURVEY.md`. The stage skill configuration can
override it with `outputFile` (aliases: `surveyFile`, `surveyFileName`,
`fileName`, `targetFile`, `file`), for example
`{ "name": "question-me", "config": { "outputFile": "FEEDBACK.md" } }`.
Use distinct names such as `FEEDBACK.md`, `SECURITY_QUESTIONARY.md`, or
`INTENT_SURVEY.md` when a task has multiple question stages; plain names
without an extension gain `.md`. Path-unsafe values fall back to `SURVEY.md`.

The suggested minimum question count is configurable as `minQuestions` (soft
prompt guidance only; `0` disables it).

## Setting it up

1. Add the `question-me` skill to an agent stage (prompt it with what to ask
   about, e.g. "ask me about the security posture" or "help me refine this need").
2. Optionally tell the *next* stage to read `SURVEY.md` and fail back when
   answers are missing.
3. Run. When the agent finishes, the task card and detail page show a survey
   banner; the survey page opens from there.

## The SURVEY.md format

The file holds one `survey-json` fenced block per round. Rounds are
**append-only**: when a stage fails back and the agent has more questions, it
reads the file and appends a new `## Round N` block at the bottom. Earlier
rounds and their answers are never rewritten or removed, and the API rejects
any answer submit that would do so.

```markdown
# Survey

## Round 1

```survey-json
{
  "round": 1,
  "generatedAt": "2026-10-18T12:00:00.000Z",
  "stage": "ask",
  "questions": [
    {
      "id": "q1",
      "type": "single",
      "text": "What is the primary security concern?",
      "options": ["Authentication", "Authorization", "Data protection", "Other"],
      "required": true,
      "showIf": null
    },
    {
      "id": "q2",
      "type": "multiple",
      "text": "Which frameworks apply?",
      "options": ["PCI-DSS", "HIPAA", "GDPR", "None"],
      "required": false,
      "showIf": { "questionId": "q1", "value": "Data protection" }
    }
  ],
  "answers": {
    "q1": { "selected": ["Data protection"], "notes": "PII in uploads" }
  }
}
```
```

- `type` is `single` (radio group), `multiple` (checkboxes), or `image`
  (generated picture cards, single-pick — see below). Every question
  renders with a free-form **Notes** field underneath.
- `required: true` blocks completion until answered — unless the question is
  hidden by its condition (see below).
- `answers` maps each question id to `{ selected: [...], notes: "..." }`.

## Conditional questions

One object form only, deliberately kept simple for agents:

- `{ "questionId": "q1", "value": "Data protection" }` — show when that
  answer was selected.
- `{ "questionId": "q1", "values": ["A", "B"] }` — show when any of them was selected.

The condition may reference the same round (an earlier question) or any earlier
round. Hidden questions never block completion, and answers stored for a
now-hidden question are preserved. A condition pointing at an unknown question
keeps the question hidden rather than showing it.

## Image questions (generated design examples)

A stage can ask the human to pick a favourite from up to 4 generated pictures
(UI mocks, logos, …). The agent writes an `image` question whose `options` are
detailed descriptions; the backend generates one picture per description when
the task parks, and the survey page renders them as selectable image cards
with radio semantics (pick one, plus the usual Notes field).

```json
{
  "id": "q3",
  "type": "image",
  "text": "Which dashboard design should we build?",
  "options": [
    "Dark analytics dashboard, left sidebar navigation, teal accent charts, modern SaaS look",
    "Light minimal dashboard, top navigation bar, large KPI cards, generous whitespace"
  ],
  "required": true,
  "showIf": null
}
```

Rules: `options` holds 1–4 descriptions (each becomes a picture, so make them
detailed enough to render: layout, palette, key elements, style). Agents never
write the `images` field — the backend owns it (per-picture generation
status). Answers work like `single`: the selected description is stored in
`answers`, and on submit the chosen picture is copied to a stable
`assets/survey-r<round>-<qid>-chosen.<ext>` file (the extension always matches
the stored bytes — usually `png`) and referenced from a `## Chosen designs`
section in the survey file, so downstream stages can work from the picked
design.

Image questions are enabled per survey stage with the question-me skill's
`imageGen` setting (`none` by default, which removes the image-question
guidance from the agent prompt entirely; otherwise a provider id such as
`muse`). Provider API keys live in System Settings › Images and stay on the
server — runners and the survey page never see them (a
`KAINBAIN_IMAGE_GEN_MUSE_API_KEY` environment variable overrides the stored
key). Generation runs in the background at park time and costs about $0.01 per
picture (at most 12 per survey file); pictures that cannot be made — no key
saved, an error, or the survey limit — degrade to their written descriptions,
so answering never blocks. Pictures still generating stay selectable by
description, and a submit that lands before they are ready still gains its
chosen-picture reference once they arrive.

## When there is nothing to ask

An agent with genuinely no questions writes a round with `"questions": []`.
That round completes immediately — the task advances without parking, and the
survey page offers a plain Continue. If the agent wrote no file at all, the
task still parks so a human confirms there is nothing to ask (the survey page
offers the same Continue / Skip path, which only works while nothing requires
answering).
