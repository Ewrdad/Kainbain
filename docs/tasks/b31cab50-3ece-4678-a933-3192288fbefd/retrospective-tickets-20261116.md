# Retrospective — follow-on tickets (2026-11-16)

## History reviewed

- Case study: task `0d29c64c-34f5-4740-ba25-f4e6ef4f90b5` (settings-page overflow
  fix) planned around a phantom screenshot; its task folder has no `assets/`
  directory at all.
- This task (`b31cab50-3ece-4678-a933-3192288fbefd`) fixed the render-time
  symptom with a copy-or-warn fallback. Reviews in this folder all PASS:
  `pr-review-20261116.md`, `pr-review-20261116-final.md`,
  `standards-review-20261116-132952.md`, `update-impact-20261116.md`.
- Survey (`SURVEY.md`) was answered: warn-and-continue, any attached file,
  cover old tasks, general warning (q4 yielded to the task FIX clause, which
  requires naming the file).

## Agent difficulty / failure points found

1. Agents wasted effort planning around a phantom screenshot with no signal
   the file was missing — fixed at render time by this task, but nothing stops
   the next author from creating another dangling ref (creation-time gap).
2. `runner/package-lock.json` 6-line stub flagged as cruft in three separate
   reviews but left in place as out of scope each time — classic tech-debt
   orphan.
3. `filterBranchBackedRefs` runs a synchronous `git ls-tree` in the curate
   path — noted as a future perf concern only if curate latency ever matters;
   not ticketed (no evidence of a problem).

## Dedupe check

Listed all 58 tasks in project `0fd41821-d8a5-4e49-bc2e-28ce8c739a0a`
(`wf-default`); 17 sit in stage `1`. None covers creation-time asset
validation or the lock-stub removal. No duplicates created.

## Tickets created (project kainbain, workflow wf-default, stage 1)

- `9f24b6c0-6bef-44a5-b074-dbe8391facaa` — Warn on dangling assets refs at
  task creation and image upload time (structural: prevents the defect class
  at the source so the render-time fallback rarely fires).
- `3232f6c6-9d02-4654-8d08-1a3fa27ab403` — Remove inert runner
  package-lock stub (tech debt flagged 3x in this task's reviews).
