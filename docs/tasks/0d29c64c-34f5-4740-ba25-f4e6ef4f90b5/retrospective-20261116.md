# Retrospective — Settings Overflow Fix (0d29c64c)

**Date:** 2026-11-16
**Task:** `0d29c64c-34f5-4740-ba25-f4e6ef4f90b5` — "Please fix the overflow on the settings page"
**Stage kind:** no-code (docs-only). Ticket fan-out was done via the KainBain HTTP API; the only files created/modified are under `./docs/`.

## History reviewed

Reports actually present in `docs/tasks/0d29c64c-34f5-4740-ba25-f4e6ef4f90b5/`:

- `SURVEY.md` — 4 questions, zero answers recorded
- `IMPLEMENTATION_PLAN.md` — source-grounded plan (screenshot missing)
- `OVERFLOW_FIX_NOTE.md` — shared `TruncatedText` pattern + 14-component audit disposition
- `code-standards-review-20261116.md` — PASS
- `install-safety-verdict-20261116.md` — PASS (349 files / 4756 tests green)
- `stage-review-20261116.md` — PASS
- `overflow-after-320/768/1440.png` — headless proof screenshots

## Agent difficulties found

1. **Missing screenshot asset (highest cost).** The task referenced `assets/image.png`; the file was absent from the workspace, so planning had to be grounded in source inspection instead of the reported visual. Same dead-reference pattern appears in several other tasks — systemic.
2. **Phantom prior reports in prompts.** The retrospective prompt listed four reports (`idea-*`, `review-plan-*`, `automated-tests-failure-*`, `final-review-*`) that do not exist on disk, causing failed reads and confusion. `stage-review-20261116.md` flagged the same discrepancy.
3. **Unanswered survey forced assumptions.** `SURVEY.md` had no answers, so the plan defaulted q1–q4 (notably truncate-vs-wrap). Already covered structurally by completed ticket `73f23a38` ("Gate implementation on answered requirement survey") — no new ticket created.
4. **`SelectDropdown` default defeats truncation.** Its `inline-block` container + inner `nowrap` makes min-content the full label length (197px spill at 320px); five call sites carry a manual `block w-full min-w-0` workaround. Any future caller that forgets it reintroduces the defect.
5. **No automated overflow guard.** jsdom tests cannot measure pixels, so this whole defect class (14 components, one fix) required a manual headless-screenshot pass. Nothing fails when a new card ships unconstrained.

## Tickets created (all standalone, each references this task as case study)

Target: project `0fd41821-d8a5-4e49-bc2e-28ce8c739a0a` (kainbain), workflow `wf-default`, stage `1` (Idea). All created with `execute:false` and deterministic idempotency keys; all verified via re-read with `currentStageId == 1`.

| Ticket | Title | Stage |
|---|---|---|
| `b31cab50-3ece-4678-a933-3192288fbefd` | Materialize task-referenced image assets into the runner workspace | 1 |
| `4f927ecb-ba3a-423c-ace3-5f7dd7d36896` | List only prior stage reports that actually exist in stage prompts | 1 |
| `5d9a77ba-a4cc-4d2f-9019-77493d2a3b3e` | Make SelectDropdown overflow-safe by default | 1 |
| `4f7fa891-a1db-4d31-8c9b-612e82f22b92` | Add adversarial long-name overflow fixture and CI guard for settings cards | 1 |

## Dedupe notes

- Checked all 39 tasks on `wf-default` in the kainbain project. No open task matches any finding above.
- Survey-gating finding deliberately NOT ticketed: completed ticket `73f23a38` already covers it.
- Note: the skill's API base `http://localhost:3100` refused connections from this runner; the live backend from the runner config (`http://192.168.1.206:3100`) was used instead. The skill's localhost default may deserve a config-driven fallback.
