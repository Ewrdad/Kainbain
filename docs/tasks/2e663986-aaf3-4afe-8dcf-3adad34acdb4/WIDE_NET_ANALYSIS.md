# WIDE_NET_ANALYSIS — high level of task interruptions

Task: `2e663986-aaf3-4afe-8dcf-3adad34acdb4` ("noticing a high level of interruptions").
Date: 2026-11-21. Stage: DO research (investigatory only — no solutions proposed).

## 0. Inputs

- **Bug report**: many tasks end with interruptions suggesting flakiness; reporter
  notes a `local-alpha` runner restart-loop incident and wonders if it is related;
  interruptions "should happen rarely but they are seemingly quite common".
- **Screenshot** (`assets/image.png`): task `7f6220c3` ("add support for projects
  having the kainbain docs in a seperate repo") showing repeated
  "Auto-resumed after server restart — prioritised in queue" rows and high
  "Tried N times" counts (Merge resolver ×6, Quick review ×6, Automated
  tests ×10, In Progress ×11).
- **Survey result**: the Questionnaire stage recorded `Survey completed (none)` —
  the `question-me` skill requested no survey questions, so there is no
  `SURVEY.md` with human answers. All evidence below comes from repo code,
  the live backend API, runner worktrees, and the runner systemd journal.

## 1. How interruptions work (mechanics primer)

Two code paths flip a task to `interrupted` (verified by repo search):

1. **Server-restart path** — `reconcileInterruptedRuns`
   (`api/flow/scheduler/reconcileInterruptedRuns.js`): at boot, any task left in
   `running_agent` / `running_ci` / `running_merge` / `advancing` (see
   `ORPHANED_RUNNING_STATUSES` in `api/flow/scheduler/orphanedRunningStatuses.js`)
   with no engine owner becomes `interrupted`, history
   `Stage execution interrupted by server restart`.
2. **Runner path** — `POST /tasks/:id/interrupt` (`api/flow/runnerRoutes.js:1067`)
   → `executionLedger.interruptExecution` (`api/flow/executionLedger.js:608`):
   the runner drops its lease and the task re-queues as `interrupted`, history
   `Runner <id> interrupted execution <exec> — lease dropped, re-queues as
   interrupted[ — Reason: <reason>]`. This is the ONLY writer of that history
   string, and the route requires runner auth, so every such entry was sent by
   an authenticated runner daemon.

Recovery: `autoResumeTask` (`api/flow/scheduler/autoResumeTask.js`) flips
`interrupted` → `in_stage` with Rule-0 queue priority and history
`Auto-resumed after server restart — prioritised in queue` — **including when no
server restart happened** (runner-path interrupts resume through the same
function via `scheduleTick`, pickup ≈150ms per `performStartupRecovery` docs in
`api/flow/startupRecovery.js`). Anti-loop guard: consecutive interrupts on the
same task+stage increment `runnerInterruptCount`; at `MAX_RUNNER_INTERRUPTS = 5`
(`api/flow/executionLedger.js:17`) the task is parked for the operator
(`runner-death-loop` in `api/flow/scheduler/isAutoResumableWithReason.js:52-57`).

## 2. Fleet-wide numbers (live backend, project `0fd41821`, 61 tasks, 2026-11-21)

| Signal | Count | Notes |
|---|---|---|
| Runner-path interrupts (`interrupted execution`) | 118 | across 30/61 tasks (~half the project) |
| Server-restart interrupts (`interrupted by server restart`) | **0** | no task, ever in retained history |
| `Execution recovered after server restart` | **0** | same |
| `Auto-resumed after server restart` entries | 100 | label fires for runner interrupts too |
| Runner split | local-alpha 96 / server2-alpha 22 | local-alpha dominates 4:1 |
| With `Reason:` suffix | 49 | **all 49 are the same reason** (Cause 1) |
| Bare (no reason) | 69 | cause invisible from backend history |
| Interrupt ≤15s after `started` (median 4.7s) | 99 | dies before/without `prompted`, i.e. in worktree setup |
| Interrupt ≥2min after `started` | 15 | post-harness: commit/push/complete phase |
| Death-streak escalations (`Runner deaths escalated`) | 42 | tasks parked at count ≥ 5 |

Timing detail: between the runner's `started` and `prompted` progress events
(`runner/daemon.js:1975` → `:2061`) the only uncaught fallible step is
`prepareWorkdir` (`runner/daemon.js:1984`; doc-sync and prompt-report are
try/caught). So a `started` → interrupt gap of seconds with no `prompted` event
localises the fault to worktree preparation (or the process dying there).
Between `finished` (`runner/daemon.js:2213`) and completion sit `commitAndPush`,
`sendLogs`, verdict, `collectTaskFiles`, and `client.complete`.

Deployed runner vintage: live runners report `0.1.0`, built from main
`f430f53` (2026-11-11); repo is at `0.2.0`. The deployed build HAS the 10-29
worktree-cap graceful path (`25feee39`) but LACKS the 11-21 interrupt-reason
and deterministic-git-failure handling (`046a6391`, merged 11-21 09:38 in
`7ac148ce`). Runner rollout is backend-nudged, at most daily per runner, idle
converge (`docs/runner-update-runbook.md`), so rollout lag is expected.

## 3. Possible causes

### Cause 1 — Worktree-capacity exhaustion loop (`WORKTREE_CAP_REACHED`, cap ~5)

**Summary.** The runner refuses new work when its work-root holds ~5 live/orphan
workdirs and none are stale enough to evict; it reports an interrupt with a
reason and keeps polling (`runner/daemon.js:2299-2314`). The task re-queues with
Rule-0 priority and is immediately re-claimed — often by the same still-full
runner — producing a tight interrupt/resume cycle. Each refusal also increments
the runner-death counter, so a capacity problem eventually parks the task as a
suspected death loop.

**Pros (for).**
- Direct textual evidence: all 49 reasoned interrupts (41% of the fleet total)
  carry `Reason: Runner workdir unavailable: Worktree cap reached (~5); ...
  (every orphan was used recently, nothing stale to evict)`. Both hosts appear
  (`/home/server/.kainbain` = local-alpha host, `/home/server2/.kainbain` =
  server2-alpha host).
- Timing fits: cap refusal happens inside `prepareWorkdir`, seconds after
  `started` — matching the dominant ≤15s bucket.
- Code path returns (no crash) and keeps polling, which explains rapid
  re-claim cycles without process restarts.
- Crash loops (Causes 2–4) leave orphan workdirs behind (observed: 5 orphans
  listed at every server2-alpha boot on 11-20), so this cause is also a
  second-order effect of the other causes — they feed each other.

**Cons (against).**
- Explains at most 49/118 interrupts; the 69 bare interrupts cannot be cap
  refusals on the deployed builds (both runners demonstrably emit the cap
  reason since the 10-29/11-11 build, and reasoned cap interrupts appear on
  both hosts).
- Does not explain the ≥2min post-`finished` interrupts (15 cases).
- Reasoned cap interrupts cluster 11-09 → 11-17; the 11-19/11-20 spike
  (48 bare) needs a different driver.

**Tasks / evidence wanted.**
- `350ca162` (12 cap interrupts), `db24c124` (9), `7b69d365` (6), `3c12ffcd`
  (5), `f56e9878` (4), `1f8959ca` (5) — confirm each shows the cap reason and
  same-runner re-claim.
- Runner-side: work-root occupancy time series per host around 11-09 and
  11-16/17; orphan-staleness / LRU-eviction decisions in daemon logs.
- Backend: `GET /tasks/<id>` history for `WORKTREE_CAP` reason strings is the
  cheapest ongoing detector (no host access needed).

### Cause 2 — Completion report rejected with HTTP 413 (payload > Fastify 1 MiB default)

**Summary.** After a fully successful agent run + `commitAndPush`
(commit AND push succeed), the runner's `complete-execution` POST exceeds the
backend JSON body limit and is rejected with 413. The daemon's generic catch
(`runner/daemon.js:2441-2452`, deployed 0.1.0 without reason attachment) reports
a bare interrupt and rethrows → `exit(1)` → systemd restart → re-claim → the
agent re-runs for minutes → commit+push again → 413 again. Deterministic loop;
each lap is recorded as one interruption + auto-resume and burns a full stage
run. The 413 trigger on the observed task is `collectTaskFiles`
(`runner/daemon.js:1820` / deployed `daemon.js:1346`): top-level task-doc files
up to ~1 MiB total — and this task's folder holds 2.8 MiB including many
top-level PNG screenshots each under the 256 KiB per-file cap — plus the 20 KiB
output and JSON envelope, against Fastify's default 1 MiB limit
(`api/index.js:116` sets no `bodyLimit`; the only explicit `bodyLimit` in the
API is the accessibility route).

**Pros (for).**
- Smoking gun in the server2-alpha journal (`journalctl --user
  -u kainbain-runner-server2-alpha`): on 11-20, five consecutive cycles of
  `Committed <sha> (pushed: true)` → `Runner failed: Backend 413 on
  /tasks/7f6220c3-.../complete-execution` → `Main process exited, status=1`
  → `Scheduled restart job, restart counter 830→834`, at 21:19, 21:29, 21:35,
  21:43, 21:47 — exactly matching the five `finished` → bare-interrupt pairs
  in task `7f6220c3` history.
- Worktree forensics agree: `kb-7f6220c3` holds the pushed stage-output commits
  with matching timestamps, and `origin` has them — proving failure happened
  strictly after push.
- Deterministic: same task files every lap → same 413 → loop only ends via the
  death-bound park (observed: parked at count 7).
- Explains why the newest, longest, most asset-heavy stages (Merge resolver
  with proof screenshots) interrupt while short stages complete.

**Cons (against).**
- Proven for exactly one task-stage so far (`7f6220c3` Merge resolver, 5
  interrupts); the other 10 post-`finished` bare interrupts are unexamined.
- Cannot explain the 99 sub-15s interrupts (413 only happens at completion,
  minutes in).
- Backend 413 leaves no task-history trace of its own (the backend rejects
  before routing), so backend history alone can never confirm/deny further
  cases — runner journals are required.

**Tasks / evidence wanted.**
- `7f6220c3` (screenshot task; Merge-resolver window 11-20 21:15–21:47):
  backend access/error log for the five 413s (confirm size vs limit);
  preserve `kb-7f6220c3` worktree (do not reap) — 2.8 MiB task-docs exhibit.
- Journal sweep on both runner hosts for `Backend 413` across all tasks/dates
  (server2-alpha: 5 hits since 11-19, all this task; local-alpha journal still
  needed — host `192.168.1.206`, user `server`).
- Any other task whose `finished` → interrupt gap is seconds with a preceding
  multi-minute run is a 413 suspect; check runner journals first, backend
  history second (it will be bare).

### Cause 3 — local-alpha premature-death loop in worktree setup (bare, ~5s, no `prompted`)

**Summary.** The volume-dominant signature: `local-alpha` claims a task
(`started`), then ~5–11s later reports a bare interrupt without ever emitting
`prompted` — i.e. it dies inside `prepareWorkdir` (git fetch/worktree-add,
residue handling, LRU eviction, docs worktree) or the process dies there — then
re-claims ~20–60s later and repeats until the death bound parks the task. This
matches the reporter's "local-alpha restart loop" incident. The underlying fault
is unknown precisely because the deployed 0.1.0 build attaches no reason on the
generic path (reason support landed 11-21 in `046a6391`, after these events).

**Pros (for).**
- Dominant by volume: 96/118 interrupts are local-alpha; 99/118 fleet-wide fall
  in the ≤15s bucket (median 4.7s); the bare-by-day spike is 11-19 (30) and
  11-20 (18).
- Two textbook exhibits: `c5c465c4` — 28 bare local-alpha interrupts ~18s apart
  on 11-19 12:15–12:37; `7f6220c3` — In-Progress loop (11-20 15:38–15:43, ×5 to
  escalation), Quick-review loop (18:39–18:41, ×4), plus 10:16 and 13:34
  single-shot deaths on 11-21 seconds after a manual resume.
- Localisation is tight: no `prompted` ⇒ pre-harness ⇒ `prepareWorkdir` region
  (only uncaught fallible step there).
- The deployed build cannot exonerate or name the fault (no reason), so "bare +
  fast + local" is exactly what any setup-phase fault looks like on 0.1.0.

**Cons (against).**
- Root fault genuinely unidentified — could be git (lock/fetch/push-race),
  disk, permissions, docs-worktree handling (note: `7f6220c3` IS the
  separate-docs-repo task, and stage output mentions docs worktrees), a stale
  mirror, or backend-call failures during setup. No evidence yet discriminates.
- Cycle period varies (~18s on `c5c465c4` vs ~40–60s on `7f6220c3`), suggesting
  possibly two sub-mechanisms (in-process re-claim vs systemd restart); local
  restart counters are unknown from here.
- "Restart loop" implies process restarts, but a tight claim→interrupt→re-claim
  cycle without restarts would look identical in backend history.

**Tasks / evidence wanted.**
- `c5c465c4` (28×, 11-19 12:15–12:37), `7f6220c3` (In Progress 11-20
  15:38–15:43; Quick review 18:39–18:41; 11-21 10:16 + 13:34), `350ca162`
  (12× local) — need the **local-alpha daemon journal on the backend host**
  (`192.168.1.206`, `~server`, systemd user unit) for those windows: the
  `Runner failed: <message>` line names the fault, and restart-counter lines
  separate crash-loops from re-claim loops.
- local-alpha build provenance: confirm it is also pre-11-21 (expected bare);
  after the 0.2.x rollout, bare interrupts should vanish and reasons should
  name this cause directly — re-run the §2 counts as the before/after test.
- Work-root/disk/git-mirror health on the backend host at those times.

### Cause 4 — Backend-unreachable / 502 windows crashing the daemon mid-run

**Summary.** The runner daemon treats backend call failures as fatal: `fetch
failed` (undici network error) and `Backend 502` crash the process (`exit(1)` →
systemd restart). When the failure lands inside an assignment (claim, logs,
progress, complete, heartbeat/renewal handling), the generic catch reports an
interrupt (bare on 0.1.0) and the restart cycle begins. server2-alpha is a
remote runner over LAN, so it is exposed to every network blip and every
backend restart/502 window.

**Pros (for).**
- server2-alpha journal since 11-19: 501 × `fetch failed` and 16 × `Backend
  502` (`/runners/heartbeat`, `/runners/dispatch`); the idle-loop sample
  (11-19 11:15:20–11:15:44) shows three consecutive `fetch failed` crashes with
  restart counters 366→367 — proving the daemon exits rather than retries.
- A proven backend 502 window on 11-20 20:40:20–20:40:57 (seven heartbeat 502s,
  new pid each ~6s) coincides with backend build 637 `deployedAt`
  2026-11-20T20:40:14Z and `engine.updatedAt` 20:40:57Z — i.e. a real backend
  restart/downtime window, observed from the runner side.
- Any in-flight assignment spanning such a window (or a LAN blip) on the 0.1.0
  build becomes a bare interrupt — consistent with scattered bare interrupts on
  both runners.

**Cons (against).**
- The 11-20 20:40 backend restart demonstrably did NOT interrupt the in-flight
  Quick-review stage on `7f6220c3` (it completed 20:44:48), so heartbeat/502
  windows are survivable mid-run at least sometimes — the fatality depends on
  which call fails (fatal inside `executeAssignment`'s try, tolerated in the
  renewal/heartbeat path).
- No bare interrupt has yet been timestamp-matched to a specific 502/fetch-fail
  crash mid-assignment; the 501 `fetch failed` lines are dominated by idle-loop
  polls with no task impact.
- local-alpha (96/118 interrupts) likely talks to the backend over localhost,
  where network blips are far less plausible — this cause fits server2-alpha
  better than the dominant offender.

**Tasks / evidence wanted.**
- Timestamp-join: server2-alpha `Runner failed: fetch failed` / `Backend 502`
  lines against `started` → interrupt pairs on server2-alpha tasks (`db24c124`,
  `1f8959ca`, `f56e9878`, `ef21e99b`, `bae668cb`) — a mid-assignment crash
  proves this cause per case.
- Backend availability log (or reverse-proxy log — the 502 implies a proxy or
  gateway in front) for 11-19 → 11-21 to enumerate real downtime windows.
- Renewal/heartbeat failure semantics: confirm from code + logs that mid-run
  heartbeat loss is tolerated (lease TTL) while in-`try` call failures are
  fatal — the boundary determines how often this cause bites.

### Cause 5 — Stage-end commit/push failure crash loop (pre-commit hooks, git faults)

**Summary.** A stage-end `commitAndPush` failure on the 0.1.0 build takes the
generic interrupt+rethrow path: bare interrupt, `exit(1)`, systemd restart,
re-claim, re-run, same failure — the classic crash loop. Deterministic faults
(pre-commit hook rejecting files, e.g. corrupt PNGs) loop forever until the
death bound parks the task. This is the documented "10,000 restarts" incident
class.

**Pros (for).**
- Documented precedent: task `1cae113f` survey (Round 1, Q2) states "the runner
  restarted over 10,000 times in a crash loop after the commit failed", with
  corrupt images vs the pre-commit hook as the trigger (Q6); the fix
  (deterministic-failure → failed completion, no crash; `046a6391`) merged
  11-21 09:38 — after every observed interruption — and still needs runner
  rollout.
- Code path exists and is fatal on the deployed build (generic catch at
  `runner/daemon.js:2441-2452`; the 0.1.0 build predates the
  `isDeterministicGitFailure` branch).
- Comment trail in code already links rethrow-on-git-fault to "crash-loops
  under Restart=always" (`runner/daemon.js:2322-2324`) and restart storms to
  task death loops (`runner/daemon.js:2301-2303`, ref `e79b1d25`).
- `db49d6c6` ("Fix runner recovery commits failing on pre-commit hooks") shows
  hook/commit friction is a live, recurring theme, not a one-off.

**Cons (against).**
- On the forensically examined case (`7f6220c3` Merge resolver), commit+push
  SUCCEEDED in all five cycles (journal `Committed … (pushed: true)` + origin
  has the SHAs) — this cause is affirmatively ruled out there; the killer was
  the 413 (Cause 2).
- No other `finished` → interrupt case has yet been shown to lack a
  stage-output commit; worktree forensics (`kb-<taskId>` dirs, still present
  for `158394ab`, `db49d6c6`, `1cae113f`, `7f6220c3`) can confirm/deny per case
  but has not been run beyond `7f6220c3`.
- Sub-15s interrupts cannot be commit failures (commit happens minutes in, post
  `finished`).

**Tasks / evidence wanted.**
- `1cae113f` (incident record + fix), `db49d6c6` (recovery-commit hook
  failures), `e79b1d25` (referenced death-loop task) — prior art and fix
  status.
- For each remaining post-`finished` bare interrupt: does `kb-<taskId>`
  contain a stage-output commit for that execution (→ Cause 2/4 territory) or
  not (→ this cause)? Plus the daemon journal `Runner failed:` line.
- Post-rollout check: deterministic commit failures should surface as FAILED
  completions with `gitFailure` payloads (per `1cae113f`), never as interrupts.

### Cause 6 — Backend server restarts (incl. self-deploys) orphaning running tasks

**Summary.** The reporter's alternate hypothesis, and what the UI label
("Auto-resumed after server restart") literally claims: backend restarts
(`deploy.sh` `restart_service`, crashes, OOM, operator restarts) orphan
`running_*` tasks, which reconcile to `interrupted` at boot.

**Pros (for).**
- Mechanically real: `deploy.sh` full deploys call `restart_service`
  (`systemctl --user restart kainbain.service`); the reconcile path exists and
  is tested (`api/flow/scheduler/reconcileInterruptedRuns.js`).
- A real backend restart/downtime window was observed 11-20 20:40:14–20:40:57
  (build 637 `deployedAt`, engine `updatedAt`, runner-visible 502s).
- The UI labels every auto-resume "after server restart", priming this reading.

**Cons (against — strong).**
- **Zero occurrences in retained history across all 61 tasks**: no `Stage
  execution interrupted by server restart`, no `Execution recovered after
  server restart`. All 118 interrupts are runner-initiated lease drops.
- The five most recent deploys (11-19 → 11-21, spanning the interruption spike)
  are all `--publish-only` (`registry + dist`), which `exit 0` before
  `restart_service` (`deploy.sh:1699-1712`, "prod untouched") — no restarts.
- The one observed restart (11-20 20:40) demonstrably orphaned nothing: the
  in-flight stage completed normally at 20:44:48.
- 1193 deploys in history with a 0-observed orphan rate suggests restarts
  either land on idle engines or claims survive them; either way this is not
  the current driver.

**Tasks / evidence wanted (to keep this ruled out, cheaply).**
- Backend uptime/restarts: backend host journal for the API unit + `build.json`
  `deployedAt` vs `GET /status/observability` `engine.updatedAt` divergence as
  a restart detector.
- Ongoing: any future `interrupted by server restart` history line re-opens
  this cause immediately (grep task histories; currently zero).

## 4. Amplifier (not a root cause): re-queue + display mechanics multiply every flake

These do not initiate interrupts, but they turn each one into the screenshot's
"quite common" impression and into parked tasks:

- **Instant priority re-dispatch, no backoff.** Every interrupt flips to
  `in_stage` with Rule-0 priority and dispatches in ~150ms
  (`performStartupRecovery`, `scheduleTick.js:178-181`, `findResumedCandidate`),
  so the same failing runner re-claims immediately — tight loops (18s laps on
  `c5c465c4`) instead of spaced retries, and no window for the sibling runner
  or the operator to intervene.
- **Death counter counts capacity refusals as deaths.** `interruptExecution`
  increments `runnerInterruptCount` unconditionally — including graceful
  `WORKTREE_CAP_REACHED` refusals where nothing died. Five cap refusals on one
  stage = `runner-death-loop` park (`isAutoResumableWithReason.js:52-57`),
  mislabelling a full disk-table as dying runners (42 escalations fleet-wide;
  `c5c465c4` hit 27).
- **`Tried N times` counts resumes as tries.** `summarizeStageRuns`
  (`frontend/src/components/tasks/taskFormatters.js:483-536`) sets `tryCount`
  to the number of grouped timeline rows per stage — `Advanced` + `Moved` +
  `Failed` + every `Resumed` row (each auto-resume writes one, `autoResumeTask`
  `:71-78`). Genuine failback cycles (e.g. four `CI command failed with exit
  code 1` round-trips on `7f6220c3`) and interrupt/resume cycles are summed
  into one scary number.
- **`Auto-resumed after server restart` mislabels runner interrupts.**
  `autoResumeTask` uses one history string for both recovery routes, so 100
  runner-path resumes display as server restarts that never happened (0
  recorded) — directly feeding the "server flake" reading of the report.

## 5. Evidence-wanted matrix (consolidated)

| # | Evidence | Source / command | Decides |
|---|---|---|---|
| E1 | local-alpha daemon journal 11-19 → 11-21 (`Runner failed:` lines + restart counters) | backend host `192.168.1.206`, `~server`, `journalctl --user -u <runner-unit>` | Cause 3 root fault; crash-loop vs re-claim loop |
| E2 | Backend access log 11-20 21:15–21:47 (five 413s, sizes) | backend host API/proxy logs | Cause 2 size-vs-limit confirmation |
| E3 | `Backend 413` journal sweep, both hosts, all dates | runner journals | Cause 2 scope beyond `7f6220c3` |
| E4 | Timestamp-join 502/`fetch failed` crashes vs server2-alpha interrupts | this host journal (have) + task histories (have) | Cause 4 per-case proof |
| E5 | Stage-output-commit presence per post-`finished` interrupt | `kb-<taskId>` worktrees (`158394ab`, `db49d6c6`, `1cae113f`, `7f6220c3` preserved) | Cause 5 vs Cause 2/4 split |
| E6 | local-alpha build provenance + post-0.2.x bare-interrupt recount | fleet versions; re-run §2 counts after rollout | whether rollout resolves the bare 69 |
| E7 | Backend/proxy availability log 11-19 → 11-21 | backend host | Cause 4 window enumeration; Cause 6 upkeep |

Preservation notes: do not reap `kb-7f6220c3` (2.8 MiB task-docs exhibit with
pushed stage-output commits); retain journals quoted above (restart counters
830–834 at 11-20 21:47, 366–367 at 11-19 11:15).

## 6. Method note (reproducibility)

- Backend API (`http://192.168.1.206:3100`): `GET /tasks?projectId=0fd41821…`
  (61 tasks), full `GET /tasks/<id>` for each, `GET /status/observability`,
  `GET /deploy/status`, `GET /runners`; history actions pattern-counted
  (`interrupted execution`, `Auto-resumed after server restart`, `interrupted
  by server restart`, `Execution recovered after server restart`, `Runner
  deaths escalated`) and `started` → interrupt deltas computed from ISO
  timestamps.
- Repo: `api/flow/{startupRecovery,scheduler/*,executionLedger.js}`,
  `api/flow/runnerRoutes.js:1067`, `runner/{daemon.js,client.js,project.js}`,
  `frontend/src/components/tasks/taskFormatters.js`, `deploy.sh`,
  `docs/runner-update-runbook.md`, `docs/tasks/1cae113f/SURVEY.md`.
- Runner host (this machine): `kb-7f6220c3` worktree git forensics; deployed
  runner `0.1.0` (`/home/server2/apps/kainbain/runner`, commit `f430f53`,
  no `interruptReason`); `journalctl --user -u
  kainbain-runner-server2-alpha` failure census since 11-19 (522 `Runner
  failed`: 501 `fetch failed`, 16 `Backend 502`, 5 `Backend 413`).
- Limits: local-alpha host (backend box) was not directly accessible — E1/E2/E7
  still open; task-history retention/capping was not verified, so very old
  interrupts could be undercounted; only project `0fd41821` was surveyed.

## 7. Cause scorecard

| Cause | Share it can explain | Confidence | Status |
|---|---|---|---|
| 1. Worktree-cap loop | 49/118 (proven by reason strings) | high | confirmed contributor |
| 2. HTTP 413 on complete | 5 proven; ≤15 suspected | high (proven case) | confirmed, scope open (E3) |
| 3. local-alpha setup-phase deaths | up to ~60 bare/fast | medium (localised, fault unnamed) | needs E1 |
| 4. Backend-unreachable crashes mid-run | scattered bare | medium-low | needs E4/E7 |
| 5. Commit/push crash loop | 0 proven here; precedent `1cae113f` | medium (mechanism real, ruled out on examined case) | needs E5 |
| 6. Backend restarts orphaning tasks | 0/118 | high (ruled out as driver) | monitor only |
| Amplifier (§4) | multiplies all above | high | confirmed mechanics |
