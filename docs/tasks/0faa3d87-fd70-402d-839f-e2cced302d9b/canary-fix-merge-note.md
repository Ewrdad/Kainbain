<!-- KAINBAIN AUTO-GENERATED NOTE -->
# Canary-lock fix: manual merge needed

`origin/main` now carries the canary scratch-stack lock fix
(`canary-e2e/canary-lock.js`, commit `2830618`), which stops overlapping
suites from killing each other's scratch stacks.

An automated merge of `origin/main` into this branch was attempted and
**aborted cleanly** (your branch is untouched) because of content
conflicts in your feature area:

- frontend/src/components/observability/widgets/PerRunnerTasksWidget.jsx
- frontend/src/components/observability/widgets/PerRunnerTasksWidget.test.jsx

(The staged jsonl files in this task's runner checkout were also left
alone — nothing there was touched.)

To resolve (from your checkout):

```bash
git fetch origin
git merge origin/main   # resolve the files above, keeping your feature intent
```

Note: your next CI run merges `origin/main` the same way and will hit
these same conflicts until resolved, and until then the canary suite runs
without the lock.
