# Survey – project settings tabs break-down

This survey makes sure we split the Project Settings page the way you want. Right now the page has 3 tabs at the top (Project Settings, Named Workflows, Skills), and almost everything lives inside the first tab as one long page — including model nicknames (aliases), folder locations, and the app's web address. Please answer below — each question has a Notes box if you want to add detail.

## Round 1

```survey-json
{
  "round": 1,
  "generatedAt": "2026-10-27T23:55:00Z",
  "stage": "question",
  "questions": [
    {
      "id": "q1",
      "type": "single",
      "text": "How should we split the big Project Settings page?",
      "options": [
        "New Aliases tab + new Files & Links tab (Recommended)",
        "Aliases tab only",
        "Files & Links tab only",
        "No new tabs — just tidy the one long page"
      ],
      "required": true,
      "showIf": null
    },
    {
      "id": "q2",
      "type": "multiple",
      "text": "What should live in the new Files & Links tab? (Pick all you want.)",
      "options": [
        "Project folders (working folder, notes folder, docs folders)",
        "App link & health (the 'Go to App' web address)",
        "Git address (repository URL)",
        "Branch and review-diff options"
      ],
      "required": true,
      "showIf": null
    },
    {
      "id": "q3",
      "type": "single",
      "text": "What should stay on the main Project Settings tab after the split?",
      "options": [
        "Basics only: project name, working model, look & colour, retry/timeout options (Recommended)",
        "Basics plus folders — only web addresses move out",
        "You decide"
      ],
      "required": true,
      "showIf": null
    },
    {
      "id": "q4",
      "type": "single",
      "text": "What should the search box (top right of Project Settings) do?",
      "options": [
        "Jump to and highlight the matching setting (Recommended)",
        "Hide everything that does not match",
        "No search — tabs alone are enough"
      ],
      "required": true,
      "showIf": null
    },
    {
      "id": "q5",
      "type": "single",
      "text": "If you switch tabs with unsaved edits, what should happen?",
      "options": [
        "Warn me before switching so I do not lose edits (Recommended)",
        "Keep my edits when I switch tabs",
        "You decide"
      ],
      "required": false,
      "showIf": null
    }
  ],
  "answers": {}
}
```
