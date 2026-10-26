# Git Guidance for Agents

> **Status:** initial version created for AUDIT R2 (forward pointer from
> `agents.md`). Owned by R10 — R10 may expand or replace this file without
> touching `agents.md`.
>
> R10 expansion below: explicit allowlist + forbidden-list (AUDIT R10).
> Self-policing rule: KainBain develops KainBain, so there is no external
> branch enforcer — you are the control.

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

## Allowed (read-only / non-branch-changing inspection only)

- `git status`, `git diff` / `git diff --stat` / `git diff master...HEAD`
- `git log` / `git log master..HEAD`, `git show <sha> --stat`
- `git branch --show-current` (verify you are still on the task branch),
  `git remote -v`, `git stash list` (view only)
- `git fetch` / `git pull` of the default branch for comparison only,
  and only when it cannot move you off your branch

Never `git checkout <default>` to "compare" — compare from where you are
(e.g. `git diff master...HEAD`, `git log master..HEAD`). Substitute `main`
for `master` on `main`-based checkouts. See `docs/git-branch-support.md`
for the engine side.

## Forbidden (engine owns these)

- `git checkout`, `git switch`
- `git branch` (create/delete), `git worktree add/remove`
- `git merge`, `git rebase`, `git cherry-pick`, `git revert`
  (when it would commit on a branch you don't own)
- `git push`, `git pull` used as a branch-update mechanism
- `git stash push/pop/apply`, `git reset --hard`, `git clean -fd`

When in doubt, the command is forbidden — ask via the normal stage
output instead of running it.
