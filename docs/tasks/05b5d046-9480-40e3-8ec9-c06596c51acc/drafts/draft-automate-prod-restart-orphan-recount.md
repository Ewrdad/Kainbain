# Automate the read-only prod "interrupted by server restart" recount so Cause 6 stays ruled out without a manual operator handoff

## Context

Research task `2e663986-aaf3-4afe-8dcf-3adad34acdb4` ruled out **Cause 6
("backend restarts orphan `running_*` tasks", 0/118 interruptions)** on the
condition that the zero-count is re-verified after every deploy. The check is
specified in `GUIDE-06-backend-restart-orphans.md` §4 as **PROD-READ-ONLY —
"DO NOT RUN WITHOUT EXPLICIT USER PERMISSION"**:

```bash
# Any 'interrupted by server restart' row re-opens Cause 6 (currently zero):
for t in $(curl -s 'http://192.168.1.206:3100/tasks?projectId=0fd41821' | jq -r '.[].id'); do
  curl -s "http://192.168.1.206:3100/tasks/$t?projectId=0fd41821" \
    | jq -r '.history[]?.action | select(test("interrupted by server restart|recovered after server restart"))' \
    | sed "s/^/$t: /";
done
```

**Case study (reference ticket: `05b5d046-9480-40e3-8ec9-c06596c51acc`,
"Regression-pin boot reconcile so server-restart orphans stay at zero"):** the
PROD-READ-ONLY loop was deferred in **both** the implementation stage
(`implementation-report-20261123.md` §4: "NOT run by this task (needs operator
permission)") and the cleanup stage (`cleanup-report-20261123.md`: "NOT run
(no permission granted this stage)"). Net effect: the one check that keeps
Cause 6 ruled out has **never actually run**, and every follow-up task spawned
from `2e663986` (e.g. `78eac844`, `810acb8f`) carries the same manual
permission-gated handoff. The check is read-only (GET requests against the task
history API), so the "permission" gate is procedural, not technical — a
scheduled read-only job needs no operator.

## Steps

1. Add a read-only script, e.g. `scripts/prod-restart-orphan-audit.mjs`, that
   runs the GUIDE-06 §4 loop (GET `/tasks`, then GET `/tasks/<id>` histories) and
   counts history rows matching
   `interrupted by server restart|recovered after server restart` fleet-wide.
   It must perform **only GET requests** and write no state.
2. Wire it into automation that runs without a human in the loop: a post-deploy
   hook in `deploy.sh` (after publish) and/or a scheduled CI branch (e.g. a
   nightly canary-adjacent job) — not the per-task fast gate, to keep task CI
   hermetic.
3. On **zero** rows: log the count with a timestamp (evidence that Cause 6
   stays ruled out) to the run log / observability endpoint.
4. On **any** row: automatically create a KainBain task (via the API,
   `POST /tasks`) titled "Cause 6 re-opened: server-restart interrupt history row(s) found in prod"
   listing the offending task ids and rows, referencing research task
   `2e663986-aaf3-4afe-8dcf-3adad34acdb4` (WIDE_NET_ANALYSIS Cause 6, GUIDE-06),
   and fail the job loudly.
5. Also assert the single-writer invariant: the only legitimate writer of the
   string `Stage execution interrupted by server restart` is
   `api/flow/scheduler/reconcileInterruptedRuns.js` (pinned by
   `reconcileInterruptedRuns.boot.test.js`); any other history row with that
   text is a bug.

## Acceptance criteria

- [ ] `node scripts/prod-restart-orphan-audit.mjs` runs against the prod API
      using GET only, prints the fleet-wide count, exits 0 at zero.
- [ ] The script is invoked automatically after each prod deploy and on a
      schedule; no human permission prompt is involved.
- [ ] A simulated non-zero result (test fixture) causes a non-zero exit and a
      created KainBain ticket naming the offending rows.
- [ ] Unit test with a mocked HTTP layer covers zero-count, non-zero-count, and
      network-error (fail-closed with a clear message) paths.
- [ ] Docs: `GUIDE-06` §4 is updated to point at the automated check so future
      S-tasks stop deferring it manually.

## Notes / examples

- Read-only is the key design constraint that removes the permission gate: GETs
  against `http://<prod-host>:3100/tasks...` mutate nothing.
- The string to match is exactly what `reconcileInterruptedRuns.js` writes:
  `"Stage execution interrupted by server restart"` (plus the legacy
  `recovered after server restart` variant from GUIDE-06 §4).
- Case-study evidence files:
  `docs/tasks/05b5d046-9480-40e3-8ec9-c06596c51acc/implementation-report-20261123.md` §4
  and `docs/tasks/05b5d046-9480-40e3-8ec9-c06596c51acc/cleanup-report-20261123.md`
  ("Ops handoff — still deferred").

## Suggested owner areas

- `scripts/` (new audit script), `deploy.sh` (post-publish hook),
  `canary-e2e/` or CI workflow definition (scheduled run), API client for the
  auto-ticket creation.
