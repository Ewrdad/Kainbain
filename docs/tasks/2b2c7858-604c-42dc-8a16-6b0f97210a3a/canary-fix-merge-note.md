<!-- KAINBAIN AUTO-GENERATED NOTE -->
# Canary-lock fix: manual merge needed

`origin/main` now carries the canary scratch-stack lock fix
(`canary-e2e/canary-lock.js`, commit `2830618`), which stops overlapping
suites from killing each other's scratch stacks.

An automated merge of `origin/main` into this branch was attempted and
**aborted cleanly** (your branch is untouched) because of content
conflicts in your feature area:

- api/flow/dispatch/runnerMatches.js
- frontend/src/hooks/useFleetModelCatalog.js
- frontend/src/services/fleetModelOptions.js

To resolve (from your checkout):

```bash
git fetch origin
git merge origin/main   # resolve the files above, keeping your feature intent
```

Note: a CI run on this branch merges `origin/main` the same way and will
hit these same conflicts until resolved, and until then the canary suite
runs without the lock.
