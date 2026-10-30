# Survey – model information reporting accuracy

This survey makes sure the Runner reports model information accurately to the backend/UI and that model catalogue behavior matches expectations. The Runner currently shows generic defaults (and sometimes a model that is not actually used on CI stages). Please answer below — each question has a Notes box if you want to add detail.

## Round 1

```survey-json
{
  "round": 1,
  "generatedAt": "2026-10-30T10:24:30.000Z",
  "stage": "stage-1792362077711",
  "questions": [
    {
      "id": "q1",
      "type": "single",
      "text": "For an agent stage, what should the UI show as the model in use?",
      "options": [
        "Only the actual model the Runner serves for that stage (Recommended)",
        "The Runner's configured default model",
        "Both the served model and the Runner default",
        "A simplified 'default' label regardless of details"
      ],
      "required": true,
      "showIf": null
    },
    {
      "id": "q2",
      "type": "single",
      "text": "For a CI stage (which does not use an LLM), what should the model field show?",
      "options": [
        "No model / blank (Recommended)",
        "A clear 'not used (CI)' value",
        "The runner default model",
        "The stage's configured model"
      ],
      "required": true,
      "showIf": null
    },
    {
      "id": "q3",
      "type": "single",
      "text": "How should the model be sourced for reporting (runner facts and dispatch matching)?",
      "options": [
        "The exact model required by the dispatched task (Recommended)",
        "The Runner's advertised model list",
        "The Runner's configured default model",
        "Ask the backend to decide per stage"
      ],
      "required": true,
      "showIf": null
    },
    {
      "id": "q4",
      "type": "single",
      "text": "What should happen if a dispatched task requires a model the Runner did not advertise?",
      "options": [
        "Refuse the assignment and leave it for another Runner (Recommended)",
        "Run it anyway with a warning",
        "Fallback to the Runner default model",
        "Fail the stage with a clear message"
      ],
      "required": true,
      "showIf": null
    },
    {
      "id": "q5",
      "type": "multiple",
      "text": "Which model catalogue behaviors must keep working (pick all)?",
      "options": [
        "Model picker in project settings is non-empty",
        "Harness-specific model lists show correct models",
        "Runnable/auth status labels are accurate",
        "Aliases resolve to real catalogue entries",
        "Runner dispatch matches available models"
      ],
      "required": true,
      "showIf": null
    },
    {
      "id": "q6",
      "type": "single",
      "text": "Should the model (and harness) pill be shown while a task is running in the Runners view?",
      "options": [
        "Yes, always while running (Recommended)",
        "Only for agent stages",
        "Only when a non-default model is used",
        "No, keep the view minimal"
      ],
      "required": false,
      "showIf": null
    }
  ],
  "answers": {
    "q1": {
      "selected": [
        "Only the actual model the Runner serves for that stage (Recommended)"
      ],
      "notes": ""
    },
    "q2": {
      "selected": [
        "No model / blank (Recommended)"
      ],
      "notes": ""
    },
    "q3": {
      "selected": [
        "The exact model required by the dispatched task (Recommended)"
      ],
      "notes": "Runners should advertise their availble harness +models and the task/stage should pick from them"
    },
    "q4": {
      "selected": [
        "Refuse the assignment and leave it for another Runner (Recommended)"
      ],
      "notes": "If it is an alais it should look to see if any others from that alias are availble"
    },
    "q5": {
      "selected": [
        "Runner dispatch matches available models",
        "Runnable/auth status labels are accurate",
        "Harness-specific model lists show correct models",
        "Model picker in project settings is non-empty",
        "Aliases resolve to real catalogue entries"
      ],
      "notes": ""
    },
    "q6": {
      "selected": [
        "Yes, always while running (Recommended)"
      ],
      "notes": ""
    }
  }
}
```
