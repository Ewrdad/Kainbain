# Survey – image choices for surveys

This survey is to make sure we build picture questions the way you want. The idea is the assistant can suggest up to 4 example designs (like app screens or logos) as pictures, and you pick your favourite. Please answer below — each question has a Notes box if you want to add detail.

## Round 1

```survey-json
{
  "round": 1,
  "generatedAt": "2026-11-02T00:58:42.000Z",
  "stage": "stage-1792362077711",
  "questions": [
    {
      "id": "q1",
      "type": "single",
      "text": "Which image service should we connect first? (You mentioned Muse/Meta — please confirm which one.)",
      "options": [
        "Meta's image service (please add key or account details in Notes)",
        "Muse built-in image generation (please add details in Notes)",
        "Not sure — use whatever is easiest for Muse/Meta",
        "Other service (please name it in Notes)"
      ],
      "required": true,
      "showIf": null
    },
    {
      "id": "q2",
      "type": "single",
      "text": "Where should the image key be saved?",
      "options": [
        "One shared key in general settings for everyone (Recommended)",
        "A separate key per project",
        "No preference — use the easiest option"
      ],
      "required": true,
      "showIf": null
    },
    {
      "id": "q3",
      "type": "single",
      "text": "How should image choices work in the survey?",
      "options": [
        "Show up to 4 pictures, I pick one favourite (Recommended)",
        "Show up to 4 pictures, I can pick more than one",
        "Show up to 4 pictures, plus a 'none of these' choice"
      ],
      "required": true,
      "showIf": null
    },
    {
      "id": "q4",
      "type": "single",
      "text": "When should the pictures be created?",
      "options": [
        "Before I open the survey, so they are ready with no waiting",
        "When I open the survey (I may wait a few seconds while they load)",
        "No preference — use the most reliable option (Recommended)"
      ],
      "required": true,
      "showIf": null
    },
    {
      "id": "q5",
      "type": "single",
      "text": "If pictures cannot be made (no key saved, or an error), what should happen?",
      "options": [
        "Show the written descriptions instead so I can still answer (Recommended)",
        "Show an error and wait until it is fixed",
        "Hide the picture part and continue without it"
      ],
      "required": true,
      "showIf": null
    },
    {
      "id": "q6",
      "type": "single",
      "text": "What picture shapes do you need in the first version? (For example, wide screens vs square logos.)",
      "options": [
        "One fixed size is fine for now (Recommended)",
        "Need at least two: wide for screens, square for logos",
        "Let the assistant choose the size for each question"
      ],
      "required": false,
      "showIf": null
    },
    {
      "id": "q7",
      "type": "single",
      "text": "How many picture questions should one survey be allowed to have?",
      "options": [
        "One set of up to 4 pictures per survey is enough",
        "Allow several picture questions, each with up to 4 pictures (Recommended)",
        "No preference"
      ],
      "required": false,
      "showIf": null
    }
  ],
  "answers": {}
}
```
