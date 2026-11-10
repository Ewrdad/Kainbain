# IA map — one canonical page per user question (task 4add6dfd)

## Canonical targets

| User question | Canonical slug | Section | Status |
| --- | --- | --- | --- |
| "How do I get started?" | `getting-started` | working-with | new (order 5) |
| "How do I install/run KainBain?" | `install-run` | working-with | rewrite (order 10) |
| "How do I add a new runner?" | `add-new-runner` | working-with | rewrite (order 12) |
| "How do I link a runner to Pi?" | `link-runner-pi` | working-with | new (order 13) |
| "How do I link a runner to Muse?" | `link-runner-muse` | working-with | new (order 14) |
| "First run, ordered path?" | `first-time-setup` | working-with | rewrite (order 15) |
| "How do I link a runner to OpenCode?" | `link-runner-opencode` | working-with | new (order 16) |
| "What do environment knobs do?" | `ports-env` | working-with | rewrite (order 20) |
| "How do I load an existing project?" | `existing-projects` | working-with | new (order 28) |
| "How do I do my first project?" | `first-project` | working-with | rewrite (order 30) |
| "How do I create a custom skill?" | `custom-skills` | working-with | new (order 52) |
| "How does KainBain work?" | `architecture`, `pipeline-stages`, … | how-it-works | audit only |

## Working-with order reservations (all unique)

5 getting-started · 10 install-run · 12 add-new-runner ·
13 link-runner-pi · 14 link-runner-muse · 15 first-time-setup ·
16 link-runner-opencode · 20 ports-env · 28 existing-projects ·
30 first-project · 35 task-images · 36 surveys · 40 submit-track-task ·
45 task-dependencies · 50 review-gates · 52 custom-skills ·
55 retrospective-review · 60 keyboard-shortcuts ·
65 git-index-lock-runbook · 66 red-shared-gate · 67 editing-tasks
(changed from 68) · 70 faq · 75 push-notifications ·
76 alert-webhooks · 80 api-reference.

## Duplication rules

- Install/dev/deploy commands live ONLY in `install-run.md`.
- Env/process knobs live ONLY in `ports-env.md`.
- `getting-started.md` links to those; at most one copy-paste quick-start
  box that mirrors `install-run.md` verbatim.
- Skill contract reference stays in `prompts-tokens.md`;
  `custom-skills.md` is the walkthrough ramp with one worked example.
- Other harnesses (`antigravity`, `custom`, `mock`, `vibe`, `codex`)
  get overview-level coverage inside `add-new-runner.md` (+ tier table),
  not their own link guides.
