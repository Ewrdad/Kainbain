# Retrospective — alias screen redo (task 158394ab)

Date: 2026-11-21. Stage: retrospective (docs-only). Author: agent.

## Ticket history

The alias screen truncated provider-prefixed model names mid-name while most
of the desktop page sat empty. The pipeline ran: survey (round 1, answers never
collected — plan proceeded on proposed defaults) → plan (IMPLEMENTATION_PLAN.md)
→ implementation (two-line collapsed rows, per-target chips) → PR review
(review-alias-redo: accepted at `max-w-4xl`/896px) → human rejection
("make the most of the full width") → full-width rework (`w-full min-w-0`,
reasoning-test fix, kept-model wrap) → second PR review (accepted).

## Structural pain points found

1. **Guessed width target, no measurable criterion.** The issue said the rest of
   the page was empty, yet the plan baked in `max-w-4xl` (896px of 1440px) and
   both agent stages accepted it. Only the human caught it, forcing a full
   rework loop. The surviving regression test
   (`SettingsCards.overflow.test.jsx`, "spans the full width") locks the section
   root/row classes but not the ancestor chain (`App.jsx` → settings section →
   tabpanel → `ProjectSettingsForm` wrapper → section), so a cap reintroduced
   on any ancestor (cf. `ProjectSettings.jsx:259` `max-w-2xl`) would silently
   re-squeeze the Aliases tab.
2. **Model-ref grammar trap produced a silently-wrong test.** `splitReasoning`
   (`shared/modelKeys.js:137-166`) returns a reasoning level only for 4-segment
   refs; the agent's chip test used 3-segment `google::m1::high` and passed via
   sr-only text instead of the muted-suffix span. Caught only in review; cost a
   second fix commit. No canonical ref fixtures exist anywhere in the repo.
3. **No reusable component-level visual-proof harness.** `capture-screenshot.mjs`
   needs a running app URL; clipping assertions exist only as one-off snippets
   (`mobile-responsive.spec.js`, `LogViewer.test.jsx`). The implementer skipped
   the required Step 6 screenshots, and the reviewer hand-rolled a scratch vite
   server (the forbidden ad-hoc-server pattern) to measure per-chip
   `scrollWidth` vs `clientWidth`.

Not ticketed (already covered): empty-survey scope drift (completed task
73f23a38), screenshot output path (completed b3ab7335), task-asset
materialization (completed b31cab50), feedback-asset validation (open 64fb8fbb).

## Dedupe

Resolved project `0fd41821…` (kainbain) → workflow `wf-default` → stage `1`
(Idea). Listed all 63 workflow tasks; none of the 11 non-completed tasks covers
these three findings (titles/goals inspected). Note: the skill's API base
`http://localhost:3100` refused connection on this runner; the reachable
backend from the runner env (`KAINBAIN_RUNNER_BACKEND`) is
`http://192.168.1.206:3100`, which was used instead.

## Tickets created (all `execute:false`, stage `1`/Idea, verified via re-read)

- `368363b6-2508-4ff7-ac83-3796f9394d52` — Lock the alias full-width contract
  across the whole render path (render-path no-cap test + measurable-criterion
  rule for Plan agents).
- `c2569064-b908-46c4-b69e-fe85bf1cc823` — Add canonical model-ref test fixtures
  so invented refs cannot silently pass (fixture module + grammar-trap doc).
- `ded73656-bda8-468c-b0be-396570e4d2d4` — Provide a reusable fixture-driven
  component clipping harness for visual proof (one-command no-clipping proof,
  no ad-hoc servers).

Each ticket goal stands alone and cites this task (`158394ab-3b43-4813-b94a-32d772a79972`)
plus the exact task-doc files as the case study. Current executing stage
(`stage-1794594754686`/retrospective) was never targeted.
