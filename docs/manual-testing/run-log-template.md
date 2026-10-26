# Manual regression run log — copy per run

Copy this file (or this table) into your run notes / PR description.
One row per test. Attach evidence, not summaries of evidence.

```text
Run ID:            2026____-__
Date:              2026-__-__
Tester (human/agent):
Stack:             scratch (:3417/:5417) / live read-only (:3100)
Source commit BEFORE refactor:
Source commit AFTER refactor:
Build (GET /status build.commit):
Saved pre-refactor GET /agent copy:  /tmp/agent-before.json  (MT-SMOKE-03)
Overall:           PASS / FAIL / BLOCKED   (failed/blocked ids below)
```

| Test | Result | Evidence (status code / field / UI text observed) | Cleanup verified? |
| --- | --- | --- | --- |
| MT-SETUP-01 | | api/ui http codes, PIDs recorded | n/a |
| MT-SETUP-02 | | live names vs scratch names disjoint | n/a |
| MT-SMOKE-01…06 | | | |
| MT-PROJ-01…08 | | | |
| MT-TASK-01…12 | | | |
| MT-EXEC-01…11 | | | |
| MT-UI-01…12 | | | |
| MT-DOC-01…10 | | | |
| MT-SET-01…09 | | | |
| MT-NEG-01…10 | | | |
| MT-SETUP-03 | | scratch stopped, live 200, /tmp clean | yes/no |

(Expand to one row per test ID when anything is not a plain PASS.)

## Failures / differences found

For each: test id, expected, observed (exact output), pre-refactor
behaviour if known, severity, follow-up task link.

```text
1. MT-____-__ —
   Expected:
   Observed:
   Before refactor:
   Severity:  regression / intentional-change / pre-existing / unknown
```

## Cleanup confirmation (all must be true before signing off)

- [ ] Every `MT <RUN_ID>` project deleted on scratch (`GET /projects` checked).
- [ ] Every `MT <RUN_ID>` task deleted (`GET /tasks` per project checked).
- [ ] Engine `idle`, circuit **not** tripped (`GET /status`).
- [ ] Prompt layout restored (`GET /settings/prompt-layout`, scratch).
- [ ] Push settings restored, no test subscription (scratch, if MT-SET-05 ran).
- [ ] App-status link cleared on the disposable project (if MT-SET-07 ran).
- [ ] Project skills imported by tests deleted (if MT-DOC-05 ran).
- [ ] Local fixtures removed (`mt-fixture`, `/tmp/mt-*.json`, layout/doc temp files).
- [ ] Scratch processes stopped by recorded PID only; live `:3100` still `200`.
- [ ] `$MT_ROOT` removed; `ls /tmp | grep kb-manual-<RUN_ID>` empty.
- [ ] No changes in the source checkout attributable to the run (`git status`).
