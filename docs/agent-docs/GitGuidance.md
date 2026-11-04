# Git Guidance for Agents

> **Status:** initial version created for AUDIT R2 (forward pointer from
> `agents.md`). Owned by R10 — R10 may expand or replace this file without
> touching `agents.md`.

## Branch discipline

- Stay on the current task branch (form `kb/<task-id>`). Do your work there.
- The engine owns the branch lifecycle: it creates the task branch, commits,
  pushes, and merges into the main branch after the stage passes.
- Do NOT checkout, merge, rebase, push, or delete branches — the pipeline's
  merge stage integrates your work.

## Commit hygiene

- Keep the working tree clean: only the files your stage owns should change.
- Never commit, amend, push, tag, rebase, cherry-pick, revert, or
  `reset --hard` unless the user asked for that exact write in this session.
- After installer/generator commands, check `git status` and revert collateral
  edits you did not intend (e.g. lockfile rewrites).
- Never touch the `docs/` symlink target (out-of-repo notes store, not versioned).
