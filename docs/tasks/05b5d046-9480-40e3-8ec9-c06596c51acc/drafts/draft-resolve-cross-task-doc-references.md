# Resolve cross-task `docs/tasks/<id>/` references in stage prompts (materialize into the runner workspace or warn MISSING)

## Context

KainBain tasks routinely cite another task's research docs with paths like
`docs/tasks/2e663986-aaf3-4afe-8dcf-3adad34acdb4/GUIDE-06-backend-restart-orphans.md`.
Those paths are **not guaranteed to exist in the runner worktree** that executes
the citing task:

- `docs/tasks/<id>/` (except `task.md`) is tracked on the project's `main`, but a
  task branch is cut from whatever `main` snapshot existed when the task was
  created. If the cited task's docs were committed to `main` later (or live only
  in the host-local engine store, e.g. `/home/server/projects/kainbain/docs/tasks/`),
  the citing task's branch simply does not contain them.

**Case study (reference ticket: `05b5d046-9480-40e3-8ec9-c06596c51acc`,
"Regression-pin boot reconcile so server-restart orphans stay at zero"):**
the task text instructed the agent to read
`docs/tasks/2e663986-aaf3-4afe-8dcf-3adad34acdb4/RESPONSE.md` (S7),
`GUIDE-06-backend-restart-orphans.md`, `WIDE_NET_ANALYSIS.md` and
`TDD-TEST-EXAMPLES.md` "before coding". Verified in the runner worktree
(`git ls-tree HEAD -- docs/tasks/ | grep 2e66` → empty), that directory does not
exist there. The implementation stage therefore had to **reconstruct the spec
from source code** and record a "risk accepted" note
(`docs/tasks/05b5d046-9480-40e3-8ec9-c06596c51acc/IMPLEMENTATION_PLAN.md` §0.3,
`implementation-report-20261123.md` §1). The real docs only surfaced later at
`/home/server/projects/kainbain/docs/tasks/2e663986-aaf3-4afe-8dcf-3adad34acdb4/`
(cleanup report), i.e. on the host's main checkout, not in the runner workspace.
Cost: wasted survey effort, a reconstruction risk on assertion wording, and a
review-stage detour.

This is the same class of defect already fixed for two narrower cases:
`4f927ecb` (Previous Reports listed phantom files) and `b31cab50` (phantom
`assets/*.png` references). Goal-text `docs/tasks/<id>/` references are the
remaining uncovered case.

## Steps

1. When the engine renders a stage prompt (or when a runner worktree is
   prepared), scan the task goal/prompt text for references matching
   `docs/tasks/<uuid>/...`.
2. For each reference, check whether the path exists in the runner worktree.
3. If it exists: leave as-is.
4. If it does not exist: resolve it against the canonical sources, in order:
   a. the project's `main` branch in the runner repo (`git show origin/main:<path>`
      or a checkout of the file),
   b. the backend task store / host-local project checkout
      (`<projectCwd>/docs/tasks/<id>/...`),
   c. the task archive (`~/archive/kainbain-tasks-*`).
5. If resolved, materialize the referenced file(s) into the runner worktree at
   the cited relative path (read-only copy) **before the first stage runs**, so
   plain relative reads work.
6. If unresolvable, rewrite the reference in the rendered prompt to an explicit
   `MISSING-DOCS: docs/tasks/<id>/<file> (referenced by task <id>; not present in
   this worktree)` warning naming the file, so the agent fails fast instead of
   silently planning around a phantom doc.
7. Add a regression test at the prompt-rendering layer covering: reference
   present, reference resolved from `main`, reference unresolvable.

## Acceptance criteria

- [ ] A task whose goal cites `docs/tasks/<other-id>/X.md` either has a readable
      file at that relative path in the runner worktree before stage 1, or its
      prompt carries an explicit `MISSING-DOCS` warning naming the file.
- [ ] No stage ever spends effort "verifying" that a cited cross-task doc is
      absent and then reconstructing the spec without flagging it.
- [ ] Existing behaviour for in-task reports (`docs/tasks/<own-id>/...`) and for
      `assets/*` references is unchanged.
- [ ] Unit test at the prompt-render layer covers present / resolved-from-main /
      missing cases.

## Notes / examples

Verified reproduction from case-study ticket `05b5d046-9480-40e3-8ec9-c06596c51acc`:

```bash
# in the runner worktree of kb/05b5d046-9480-40e3-8ec9-c06596c51acc:
git ls-tree --name-only HEAD -- docs/tasks/ | grep 2e66   # → empty
ls docs/tasks/ | grep 2e66                                  # → empty
# the cited docs exist only on the host project checkout:
ls /home/server/projects/kainbain/docs/tasks/2e663986-aaf3-4afe-8dcf-3adad34acdb4/
# → GUIDE-01..07, REPLICATION-INDEX.md, RESPONSE.md, RESPONSE_SURVEY.md, ...
```

Related (already shipped, do not regress): `4f927ecb` (list only prior stage
reports that exist), `b31cab50` (materialize or warn on `assets/*`).
Related open work, different scope: `7f6220c3` (storing kainbain docs in a
separate remote repo for non-kainbain collaborators).

## Suggested owner areas

- Engine prompt rendering (`runner/` + backend task fetch), plus a
  worktree-preparation hook that copies resolved `docs/tasks/<id>/` subtrees.
