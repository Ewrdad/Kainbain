# Stage report — update-safety of the pretty-tasks change (2026-11-14)

Task `5a38ad45-74a6-4d00-b6fd-a1796e5f4f1f`. Question: will the change as
implemented break existing installs on update?

## What was judged

The already-merged pretty-tasks change (merge `168e3f5`: `deriveTaskTitleFromGoal`,
mermaid rendering, two-stage skill, docs) plus the unmerged delta on this branch:
`extractGoalSection` fence-aware goal parsing in `api/work/taskPersistence.js`
with tests, and a stray `rt.mjs` scratch file at the repo root.

## Findings

1. **No migration, no new config.** Task JSON/frontmatter shapes are unchanged;
   new frontmatter markers default safely on legacy files (pinned by
   "defaults missing rehydration markers safely on legacy files").
2. **Stored titles survive.** `resolveTaskTitleAndGoal` lets the frontmatter
   title win; the first-line derivation only fills gaps. Update never rewrites
   existing tasks' titles.
3. **Standard task.md files parse identically.** The writer always emits
   `# History` immediately after the goal, and both old regex and new scanner
   terminate there. Old paragraph tasks are unaffected.
4. **New dependency is covered.** `mermaid ^12.3.0` is declared in
   `frontend/package.json` (+ lock); `deploy.sh` runs
   `npm install --prefix frontend`, and the renderer lazy-imports mermaid with
   a source-block fallback, so even a stale `node_modules` degrades instead of
   crashing. Prior build/depcheck failures are recorded as fixed (build passes,
   depcheck clean).
5. **Parser deltas are confined to pathological inputs:** fenced
   `# History`-like lines no longer truncate the goal (the intended fix;
   previously corrupted on every re-read); an *indented* terminator-like line
   outside a fence now terminates (old code ignored it); CRLF goals normalize
   to LF on re-read. None of these affects boot, install, or serving of
   existing tasks in their standard shapes.
6. **Non-blocking hygiene note:** `rt.mjs` (repo root, committed by a stage
   run, imports `./work/taskPersistence.js` which does not exist) is dead code
   — matched by no vitest glob, no lint scope (`lint:api`/`lint:frontend` are
   prefix-scoped), and no runtime import. It should be deleted by the next
   code-writing stage but cannot break an update.

## Conclusion

Nothing in the change requires migration, rewrites stored data, breaks the
update/install path, or alters existing installs' behaviour outside rare
hand-crafted edge cases (all in the fixing direction for real files).
Recorded gates are green (unit suites, frontend build, depcheck).

KAINBAIN_VERDICT: PASS
