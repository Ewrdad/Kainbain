# Survey – make the task panel adjustable

Right now the task panel has a fixed size. This survey makes sure we make it adjustable the way you want. Please answer below — each question has a Notes box if you want to add detail.

## Round 1

```survey-json
{
  "round": 1,
  "generatedAt": "2026-11-05T17:34:16.000Z",
  "stage": "stage-1792362077711",
  "questions": [
    {
      "id": "q1",
      "type": "single",
      "text": "Which task panel should become adjustable?",
      "options": [
        "The task info panel on the right side of the question-and-answer (survey) page (Recommended)",
        "The task details view (the main page you see when you open a task)",
        "Somewhere else — I will describe it in Notes"
      ],
      "required": true,
      "showIf": null
    },
    {
      "id": "q2",
      "type": "single",
      "text": "How would you like to resize it?",
      "options": [
        "Drag the edge between the panel and the main area (Recommended)",
        "Size buttons (for example Small / Medium / Large)",
        "A button to expand it full-width and back again",
        "Something else — I will describe it in Notes"
      ],
      "required": true,
      "showIf": null
    },
    {
      "id": "q3",
      "type": "single",
      "text": "Should the app remember the size you picked?",
      "options": [
        "Yes — keep my size next time I open it (Recommended)",
        "No — start at the normal size every time"
      ],
      "required": true,
      "showIf": null
    },
    {
      "id": "q4",
      "type": "single",
      "text": "Should you also be able to hide the panel completely?",
      "options": [
        "Yes — add a way to collapse or hide it (Recommended)",
        "No — resizing is enough"
      ],
      "required": true,
      "showIf": null
    },
    {
      "id": "q5",
      "type": "single",
      "text": "How far should resizing be allowed to go?",
      "options": [
        "You decide sensible limits (Recommended)",
        "Let me make it almost full-screen if I want",
        "Keep it modest — only a little wider or narrower than today"
      ],
      "required": true,
      "showIf": null
    }
  ],
  "answers": {
    "q1": {
      "selected": [
        "The task details view (the main page you see when you open a task)"
      ],
      "notes": ""
    },
    "q2": {
      "selected": [
        "Drag the edge between the panel and the main area (Recommended)"
      ],
      "notes": ""
    },
    "q3": {
      "selected": [
        "Yes — keep my size next time I open it (Recommended)"
      ],
      "notes": ""
    },
    "q4": {
      "selected": [
        "No — resizing is enough"
      ],
      "notes": "Existing close options can be used"
    },
    "q5": {
      "selected": [
        "Let me make it almost full-screen if I want"
      ],
      "notes": ""
    }
  }
}
```
