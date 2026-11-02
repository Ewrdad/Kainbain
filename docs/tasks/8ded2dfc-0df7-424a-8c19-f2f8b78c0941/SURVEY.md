# Survey – Runner config page refinement (round 1)

The task asks to refine the Runner setup page in General Settings. Your notes list five starting points plus "do your own refinement". These questions pin down what each item should do. Plain language throughout — no file names.

```survey-json
{
  "round": 1,
  "generatedAt": "2026-11-02T09:56:00.000Z",
  "stage": "runner-config-refinement",
  "questions": [
    {
      "id": "q1",
      "type": "single",
      "text": "Clicking a Runner to open its settings: how far should the clickable area extend?",
      "options": [
        "Whole row is clickable",
        "Keep it as just the Runner name",
        "Whole row clickable plus keyboard support"
      ],
      "required": true,
      "showIf": null
    },
    {
      "id": "q2",
      "type": "single",
      "text": "The folder address fields are empty when left on defaults. What should the page show instead?",
      "options": [
        "Auto-fill with the Runner's own folders",
        "Show grey hint text with an example path",
        "Show the word 'Default' and reveal the real path on hover",
        "Leave blank — only fill in after someone saves"
      ],
      "required": true,
      "showIf": null
    },
    {
      "id": "q3",
      "type": "multiple",
      "text": "How should picking models work instead of the plain text box?",
      "options": [
        "Tick-boxes for each model the Runner detected",
        "Still allow typing a custom model name by hand",
        "Auto-select newly detected models when they appear",
        "Show when each model was last seen by the Runner"
      ],
      "required": true,
      "showIf": null
    },
    {
      "id": "q4",
      "type": "single",
      "text": "The new 're-check models' button asks the Runner to scan again. What should happen if that Runner is offline or busy?",
      "options": [
        "Queue the request and run it when the Runner is free",
        "Show an error straight away and do nothing",
        "Try anyway and show live progress, success or failure"
      ],
      "required": true,
      "showIf": null
    },
    {
      "id": "q5",
      "type": "single",
      "text": "Updating a Runner from this page: what should the update button do?",
      "options": [
        "Update when the Runner is idle (safe, may wait)",
        "Update right now even if it is working",
        "Only show the button when an update is actually available"
      ],
      "required": true,
      "showIf": null
    },
    {
      "id": "q6",
      "type": "multiple",
      "text": "Beyond your five points, which extra refinements matter most?",
      "options": [
        "Clearer status labels (waiting, paused, denied, needs update)",
        "Search or filter when there are many Runners",
        "Confirm step before removing or revoking a Runner",
        "Better error messages when saving fails",
        "Nothing else — just do the five listed items"
      ],
      "required": true,
      "showIf": null
    }
  ],
  "answers": {}
}
```
