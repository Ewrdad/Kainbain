# S5 ops scripts — fleet recount, runner snapshots, E5 sweep

Read-only evidence tooling for task `683f0bfd` (0.2.x rollout + interrupt
recount). Every script in this folder only READS: the backend API, local git
state, and runner-host worktrees/journals. Nothing here restarts, updates,
reaps, or otherwise mutates any runner or the backend.

## Scripts

| Script | Purpose |
|---|---|
| `fleet-recount.sh <label> [task-dir]` | GUIDE-07 §5 recount + WIDE_NET §2 table over one project. Writes `recount-<label>.jsonl`, `-table.json`, `-e5worklist.json`, `-errors.jsonl`, `-meta.json`, plus `raw/<label>/<taskId>.json` evidence. |
| `runners-snapshot.sh <outdir> [--require-converged]` | Records GET /runners + GET /deploy/status and a per-runner convergence verdict (version ≥ 0.2.x AND build sha contains the fix commit, checked with `git merge-base --is-ancestor`). |
| `e5-sweep.sh <local\|server2> <prefix>...` | GUIDE-05 §4 forensics sweep: per `kb-<taskId>`, reports worktree state, origin refs, stage-output-commit presence, journal lines, and one VERDICT line. |
| `server2-ssh.sh <remote command>` | SSH to the server2-alpha host via `~/.passwrd` without ever printing it. Read-only use only. |
| `lib.sh` | Shared helpers (sourced, never run): logging, validated JSON GET, atomic writes, input guards. |
| `jq/*.jq` | The aggregation rules. `per-task.jq` + `aggregate.jq` output is pinned byte-identical against the recorded before-table by the test suite. |

## Exit codes

- `fleet-recount.sh`: 0 all tasks ok · 1 task list unusable, nothing written · 2 some tasks failed (errors file lists them, table still written)
- `runners-snapshot.sh`: 0 snapshot written · 1 setup/API failure · 3 snapshot written but `--require-converged` not met
- `e5-sweep.sh`: 0 all probed · 1 usage/setup error · 2 some probes failed (per-task VERDICT still printed)
- `server2-ssh.sh`: remote exit code on success · 64 no command · 66 password file missing/empty · 69 no sshpass/pexpect · 124 ssh timeout

## Environment knobs

`KAINBAIN_API_BASE` (default `http://192.168.1.206:3100`),
`KAINBAIN_PROJECT_ID`, `KAINBAIN_S5_NAMED_RUNNERS`,
`KAINBAIN_S5_FIX_COMMIT`, `E5_WORK_ROOT`, `E5_UNIT`, `E5_ORIGIN_REPO`,
`E5_JOURNAL_SINCE`. Each script header documents the ones it reads.

## Tests

```sh
bin/tests/run-tests.sh   # offline: recorded fixtures + local mock API, exit 0 = all pass
```

Nothing in the suite touches prod. Re-run it after any change to `*.sh`,
`jq/*.jq`, or `tests/mock-api.py` — T1 fails if the aggregation output
drifts from the recorded before-table.

## Safety rules for operators

1. Observe only — never force-restart a runner mid-assignment from here
   (that would create the very interrupts being measured).
2. A run is trustworthy only when its `*-meta.json` exists and the script's
   exit code was 0 (or an understood 2/3). A missing meta file means the run
   died before publishing; rerun it.
3. Snapshot stamps have second precision; recount labels must be single safe
   path segments (`[A-Za-z0-9][A-Za-z0-9_.-]*`).
