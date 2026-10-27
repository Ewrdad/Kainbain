# Survey – runner boxes in the now playing bar

This survey clarifies how the little runner boxes should look and behave. Please answer below — each question has a Notes box if you want to add detail.

```survey-json
{
  "round": 1,
  "generatedAt": "2026-10-27T17:15:00Z",
  "stage": "question",
  "questions": [
    {
      "id": "q1",
      "type": "single",
      "text": "When there are 5 or more runners at once, what should the bar do? (Your request covers fewer than 5.)",
      "options": [
        "Keep the current single-task view",
        "Show a short summary like '6 runners' that can be expanded",
        "Show a scrolling row of boxes",
        "You decide"
      ],
      "required": true,
      "showIf": null
    },
    {
      "id": "q2",
      "type": "multiple",
      "text": "What should each little box show? (Pick all you want.)",
      "options": [
        "Runner name",
        "Task name",
        "Stage name",
        "Status word (e.g. running, paused, failed)",
        "Elapsed time"
      ],
      "required": true,
      "showIf": null
    },
    {
      "id": "q3",
      "type": "single",
      "text": "What should the colour on each box mean?",
      "options": [
        "Task state (e.g. green = running, yellow = paused, red = failed)",
        "System health (e.g. green = healthy, red = errors)",
        "Both combined into one colour",
        "You decide"
      ],
      "required": true,
      "showIf": null
    },
    {
      "id": "q4",
      "type": "single",
      "text": "What should happen when you click (or tap) a runner box?",
      "options": [
        "Open that runner's details",
        "Switch the main view to that runner",
        "Nothing — display only",
        "You decide"
      ],
      "required": true,
      "showIf": null
    },
    {
      "id": "q5",
      "type": "single",
      "text": "If a runner has no task right now (idle), how should its box look?",
      "options": [
        "Show a greyed-out box saying idle",
        "Hide that box until it has work",
        "You decide"
      ],
      "required": true,
      "showIf": null
    },
    {
      "id": "q6",
      "type": "single",
      "text": "If a runner name or task name is too long for its little box, what should happen?",
      "options": [
        "Cut it short with ...",
        "Let the box grow / wrap to two lines",
        "You decide"
      ],
      "required": false,
      "showIf": null
    }
  ],
  "answers": {}
}
```

## Round 2

```survey-json
{
  "round": 2,
  "generatedAt": "2026-10-27T17:37:59Z",
  "stage": "question",
  "questions": [
    {
      "id": "q7",
      "type": "single",
      "text": "When you say 'runner', what do you mean? (This decides where each little box gets its info.)",
      "options": [
        "Each task that is running right now",
        "Each pipeline/board that has work on it",
        "Each connected worker machine",
        "You decide"
      ],
      "required": true,
      "showIf": null
    },
    {
      "id": "q8",
      "type": "single",
      "text": "Should the little boxes fully replace the left side, or keep the overall status badge (like RUNNING / PAUSED) next to them as well?",
      "options": [
        "Replace fully — boxes only",
        "Keep the status badge too",
        "You decide"
      ],
      "required": false,
      "showIf": null
    }
  ],
  "answers": {}
}
```
