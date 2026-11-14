# Retrospective: follow-up tickets from pretty-tasks history (2026-11-14)

Source task: `5a38ad45-74a6-4d00-b6fd-a1796e5f4f1f` — pretty markdown tasks
(create-task skill: markdown with code blocks, mermaid, image references,
two-stage draft-file flow, first-line title, blocking behaviour).
This stage (retrospective) reviewed the full report history in this folder
and raised structural follow-ups. No duplicate open ticket existed in the
target stage, and neither ticket targets the currently executing stage.

## Method

- Read `implementation-report-pretty-tasks.md`, `review-pretty-tasks-20261114.md`,
  `final-review-20261114-183528.md`, and failure reports including
  `automated-tests-failure-20261114-045255.md`,
  `publish-failure-20261114-062622.md`,
  `deep-review-failure-20261114-093429.md`, and
  `continueity-failure-20261114-164203.md`.
- Resolved via KainBain API: project `0fd41821-d8a5-4e49-bc2e-28ce8c739a0a`
  (kainbain), workflow `wf-default`, target stage `1` (Idea).
- Dedupe: listed tasks in `wf-default`; stage `1` held only one unrelated open
  task ("Enforce verified-only serving in dispatch after cleanup"), so both
  findings below qualified. Cap observed (2 of max 10 created).
- Currently executing stage is `stage-1794594754686` (retrospective); both new
  tickets target `1`, satisfying the recursion guard.

## Tickets created (both `execute:false`, verified `currentStageId: 1`)

1. `0f0213b7-25f6-4930-8470-a73dc0611529` — Add dependency-manifest guardrail
   for new frontend imports. Structural cause: dynamic `import("mermaid")`
   added without a `package.json` entry produced a repeated cascade
   (frontend build Rolldown resolve failure, depcheck missing-dependency,
   1500s canary timeout, publish gate failure) across many stages.
2. `b1c069e0-1875-4aa7-b51d-4c4399b2be31` — Enforce binary-safe proof artifacts
   and repo-root scratch hygiene. Structural cause: `pretty-proof.png`
   committed byte-corrupted (efbfbd vs PNG magic 89504e47) plus stray
   repo-root `rt.mjs`; deep review failed the branch on this.

## Deliberately not ticketed

- Plan-drift nits (title-derivation exception, stale survey premise) and the
  docs-only continueity refusal were noted but judged one-off review noise,
  not structural tech debt; human reviewers can address them inline if needed.
