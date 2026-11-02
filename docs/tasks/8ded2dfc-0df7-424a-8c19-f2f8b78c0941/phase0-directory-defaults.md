# Phase 0.3 — Directory-defaults decision

## Runner-side reality

`operatorConfig.directories = { masterDir, worktreeDir }` is today a
write-only backend preference: nothing runner-side reads it (hence the UI's
"not sent to the Runner yet" copy). The runner's actual layout derives from
one knob, `KAINBAIN_RUNNER_WORK_ROOT` (default `"runner-work"`, relative to
the daemon cwd):

- per-task worktrees: `<workRoot>/kb-<taskId>` (`prepareWorkdir`),
- ephemeral CI worktrees: `<workRoot>/kb-ci-<taskId>` (`resolveCiWorkdir`),
- master repo copies: `<workRoot>/mirrors/<slug>` (clone mode).

There is no "master checkout" on the runner; the closest true facts are the
two parents above.

## Facts keys

The daemon reports effective directories in every heartbeat/register facts
object:

```json
"directories": { "masterDir": "<abs workRoot>/mirrors", "worktreeDir": "<abs workRoot>" }
```

- `worktreeDir` = absolute-resolved `config.workRoot`: the parent under which
  per-task `kb-*` worktrees live — genuinely "the folders the runner uses".
- `masterDir` = `<abs workRoot>/mirrors`: where the runner keeps its master
  repo copies (clone mode). Adopt-mode runners still report it (the path is
  the effective default even when unused for a given task).
- Absolute (`path.resolve`) so the UI never shows a cwd-relative path from a
  remote host without context.

## Backend fallback

`_public` passes `facts` through untouched, so no registry change is needed
for transport. The UI resolves each field as: operator override (non-empty
`operatorConfig.directories[field]`) → runner-reported
`facts.directories[field]` (labelled "Runner default") → "Runner default
(unknown)" when an old runner sends no `directories` key. Unknown is a label,
never a guessed path (D3).

Out of scope (unchanged): actually pushing operator directory preferences
down to the runner. The save path stays backend-preference-only, but the copy
is corrected: with real defaults displayed, the double-confirm ("not sent
yet") drops to a single explicit save plus honest hint text.
