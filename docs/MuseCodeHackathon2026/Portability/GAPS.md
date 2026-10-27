# GAPS — Migration plan vs current KainBain (remaining work)

> **Date:** 2026-10-27 · **Compared:** [MigrationPlan.md](MigrationPlan.md) rev 2 (Phases 0–4, D1–D14, R01–R16) against the live repo at `ca813e2` and the running production install (backend build `fa032df`, deployed 2026-10-27 00:32 UTC).
> **Update 2026-10-27 ~08:20 UTC:** items G1, G2, G4–G7, G12 and parts of G10/G11 were resolved and verified (details inline below). Production is now build 548. What is left is: G3/G8/G9 (deferred by plan, need an operator decision to start), G11 remainder (self-update-on-idle, off-host backup, long-poll backpressure), G13 (board queue views), and the unexecuted chaos drills (partition zombie, 5-Runners, version skew). One pre-existing failure found along the way: the deploy script's own `final-test-suite` gate (`tests/docker.test.js` port-mapping expectation) fails on the untouched tree — unrelated to this work, recorded under G12.
> **Verdict in one line:** The migration is substantially built and the app is live and usable again, but it is **not fully done** — one test gate is red, production wire-execution is not yet proven on a real task, and several Phase 3/4 items are partial or missing. This file lists only the remaining work; everything not listed here was verified present.

---

## 1. What was verified implemented (no action needed)

| Plan item | Evidence |
|---|---|
| Phase 0 — D1–D14 decided, protocol sketched, R01–R16 retirement matrix | `docs/adr/0008-portable-runner-decisions.md`, `docs/adr/0009-runner-protocol-sketch.md` (open-decision count 0) |
| WP-1.1 Compose `frontend`+`backend`, same-origin mandatory | `docker-compose.yml`, `frontend/nginx.conf`; `docker compose config` validates |
| WP-1.2 State ownership (D10) | Compose header + ADR 0008 D10 |
| WP-1.3 Host-reference derivation (D13) | Provider URLs derived from git remote; generic Notes labels |
| WP-1.4 Docs residence reversed (D12) | `docs/` is a real tracked directory, not a symlink |
| Leak guard (§7) | PASS 2026-10-27 (no session/task-history path tracked or staged) |
| Phase 2 claim + fencing (D1/D2) | `api/flow/claimStore.js` (monotonic epochs, idempotent completion, durable epochs/completed IDs) |
| Phase 2 identity + approval (D4/R04) | `api/flow/runnerRegistry.js`, `api/flow/runnerRoutes.js`; minimal onboarding UI in Settings › Harness › Runners (`frontend/src/components/settings/RunnersSection.jsx`) |
| Phase 2 loopback Runner daemon | `runner/` (`daemon.js`, `client.js`, `project.js`, `gitOps.js`, `harness.js`); transport matrix incl. grandfathered local-only `no-remote` adopt mode |
| D11 remote required for new projects | Enforced at creation; existing local-only projects grandfathered |
| Phase 3 capability dispatch + staleness + tier ceiling | `api/flow/dispatch/` (`runnerMatches.js`, `scanClaimableTasks.js`, `selectRunnerForTask.js`); stale Runners excluded after `KAINBAIN_RUNNER_STALE_AFTER_MS` |
| D3 alias semantics (backend-central smooth WRR) | Server-side alias resolution in dispatch; daemon needs no alias config |
| D5 steering + ack (ADR 0011) | `POST /tasks/:id/steer` → heartbeat pull → `steer-ack`; `UNSUPPORTED_HARNESS` NACK is loud |
| Phase 4 durability (partial) | Durable claim/runner/steer state (atomic writes, 0600); restart re-queues in-flight as `interrupted`; `POST /runners/:id/rotate`; per-Runner git commit identity |
| Cutover | Live: `KAINBAIN_RUNNER_EXECUTION_ONLY=1` on `kainbain.service`; 4 loopback Runner services (`local-agy`, `local-muse`, `local-pi`, `local-vibe`) active and polling dispatch |

## 2. Test evidence (run 2026-10-27 against `ca813e2`)

| Gate (per MigrationPlan §0.3) | Result |
|---|---|
| `npm run test:unit` | **PASS** — API 348 files / 5,786 tests (1 skipped); frontend 277 files / 3,779 tests |
| `node --test runner/*.test.js` | **PASS** — 36/36 (real temp git repos, mock harness) |
| `npm run test:canary` | **PASS** — 135/135 Playwright tests |
| `npm run docs:check` | **PASS** (37 tests, 59 doc files, jsdoc-example baseline green) |
| `node scripts/storage-sanity.mjs` | **PASS** (healthy leg restores; shadow detector armed) |
| Leak guard (§7 commands) | **PASS** |
| `npm run lint` | **FAIL** — see G1 |
| Live `/status` | `ok`; engine idle; health checks (LiteLLM, Ollama Cloud, device, harnesses) `ok` |

---

## 3. Remaining work

### G1 — `npm run lint` is red (gate failure) · Severity: medium · Blocks: any "all gates green" claim

One error (plus 543 warnings, which do not fail the gate):

```text
frontend/src/components/settings/RunnersSection.jsx:55:5
error  Calling setState synchronously within an effect can trigger cascading renders
```

The API half is clean (0 errors); the single frontend error is in migration-era Runner UI code. Fix the effect (derive state or move the fetch state update async), then re-run the full `npm run lint`.

**RESOLVED 2026-10-27:** the mount effect now defers the fetch to a microtask (`RunnersSection.jsx`); `npm run lint` is green — 0 errors (API 366 warnings, frontend 177 warnings, count unchanged from baseline).

### G2 — No real task has completed over the wire since cutover · Severity: high (confidence, not code) · Blocks: declaring Phase 2/3 parity proven in production

Since the cutover services started (2026-10-27 ~00:27 UTC) all four Runners have only ever answered `NO_CLAIMABLE_TASKS` / `NO_CAPABLE_MATCH`, and `GET /runners/monitor` counters are all zero (`completions: 0`, `progressRecorded: 0`). Wire execution is proven only by tests (mock harness + temp git repos), never by a real production task.

**Action:** run one small, low-risk real task end-to-end through a Runner (claim → worktree → harness → push → verified completion), watch the monitor counters move, then check the board/report/log parity against the embedded path. Until then, production parity is *unverified*, not failed.

**RESOLVED 2026-10-27 (production, build 548):** three scratch tasks ran over the wire on `local-pi` and completed; monitor moved `completions 0 → 2`, `progressRecorded`, `interrupts 1` (kill drill, see G10). Push verified on the origin (`kb/<taskId>` branches carry the agent's files, e.g. `hello-wire2.txt` = `wire-proof-2-ok`). Scratch project, worktrees, mirror, and tmp repos removed afterwards.
**Latent bug found by the proof and fixed:** the daemon passed the backend record straight into `createSession`, so the pi session's cwd was the backend checkout — the agent's first file landed in `/home/server/projects/…` while the worktree commit shipped nothing. `executeAssignment` now runs the session with `cwd: workdir` (`runner/daemon.js`); regression test `runs the harness session in the prepared worktree` fails on the old code, passes on the new.

### G3 — D8 budget authority is concurrency-only; token/cost budgets do not exist · Severity: medium

ADR 0010 deliberately implements per-project/fleet **concurrency** caps (`KAINBAIN_RUNNER_MAX_CONCURRENT_PER_PROJECT`, `KAINBAIN_RUNNER_MAX_CONCURRENT_FLEET`) and defers spend caps because no aggregated usage meter exists. R13's "who stops parallel burn" is answered for parallelism, not for cost.

**Action (when wanted):** build the aggregated usage ledger per task/project/fleet, then add token/cost caps at dispatch. Do not add config keys before the meter exists.

### G4 — Disk-headroom dispatch guard is dead code with real Runners · Severity: medium

`runner/daemon.js` (`factsFor`) always advertises `diskHeadroomMb: null`, so the `DISK_LOW` check in `api/flow/dispatch/runnerMatches.js` can never fire from a real daemon. R10's "disk headroom in heartbeat with dispatch cut-off" is unimplemented on the Runner side.

**Action:** measure free space on the Runner work root at heartbeat time and advertise it.

**RESOLVED 2026-10-27:** `diskHeadroomMbFor()` (`fs.statfsSync`, re-measured every heartbeat, null when unmeasurable so `DISK_LOW` stays skipped rather than firing on bad data) feeds `factsFor`; live fleet advertises real values (e.g. `local-pi: 135689` MB, build 548).

### G5 — Harness version advertisement is always `"unknown"` · Severity: medium

`factsFor({ config })` is called without `harnessVersions` at every call site, so Runners advertise `version: "unknown"`. The backend enforces the *protocol* N-1 window, but harness version drift (R07/R11: "has Muse at the wrong version ≠ capable") is not actually detected.

**Action:** probe each harness CLI's version at load/heartbeat and advertise it; add a dispatch mismatch rule if Phase 3 intends version floors.

**RESOLVED 2026-10-27 (advertisement half):** `probeHarnessVersions()` probes `<bin> --version` once per process (4 s timeout, cached; `mock` reports `mock`, missing CLIs stay `unknown` — never a boot failure) and every heartbeat carries it. Live: `local-pi` advertises `pi 1.4.0` (was `unknown`); a CLI-less harness correctly stays `unknown`. No dispatch version-floor rule added — no requirement source carries floors, and inventing one would be dead policy; drift is now visible in facts/capabilities for the operator instead.

### G6 — D14 periodic hard-reset of Runner masters is missing · Severity: low

`runner/project.js` does `pull --ff-only` on revisit. There is no periodic hard-reset of master copies to the remote, so a diverged local master fails pulls instead of self-healing. (Worktree cap ≈5 and owned-only, never-delete cleanup **are** implemented.)

**Action:** add the periodic master hard-reset (masters only, never an actively-claimed worktree).

**RESOLVED 2026-10-27:** `refreshMirror()` (`runner/project.js`) runs on every mirror revisit: `fetch` + `reset --hard @{u}`, falling back to `pull --ff-only` when no upstream is configured. Touches the mirror checkout only — per-task worktrees are never reset. Covered by `self-heals a diverged mirror with a hard reset`, which fails on the old `pull --ff-only` path by construction (diverged fixture).

### G7 — Interrupt-requeue has no bound · Severity: low

ADR 0010 deferred the interrupt-requeue bound to WP-4.1 ("interrupts skip the auto-iteration budget by design"); no interrupt counter/bound was found in the shipped code. A task whose Runner keeps dying mid-stage can re-queue indefinitely.

**Action:** count consecutive interrupts per task/stage and escalate (step 6/7) past a bound.

**RESOLVED 2026-10-27:** `ExecutionLedger` tracks `runnerInterruptCount`/`runnerInterruptStage` per task; at `MAX_RUNNER_INTERRUPTS = 5` consecutive deaths on the same stage the interrupt escalates (history entry + `interruptEscalations` monitor counter + `escalated` reply flag) while the task still re-queues as `interrupted` — visibility, not a lifecycle change. A stage change or a successful completion resets the count. Verified live: the kill drill's peer interrupt returned `{interrupted: true, interruptCount: 1, escalated: false}`.

### G8 — Remote (off-host) Runners are not built · Severity: medium · Scope note

Phase 3's "remote onboarding enabled only now (explicit opt-in; backend loopback-only by default)" has no implementation found: no remote-access opt-in in `api/config/schema.js` or `runnerRoutes.js`. The fleet is four loopback Runners on the backend host. This matches the loopback default, but the remote half of Phase 3 (and transport row 3 enforcement off-host) remains open.

**Action:** only if/when a second host is wanted — add the authenticated opt-in, then re-run the R04 auth suite against a non-loopback Runner.

### G9 — Impromptu read-only requests exist only as steering · Severity: low

C2's impromptu T0 channel (e.g. retrospective page comments) is implemented solely as steers to a *live* execution (ADR 0011). There is no standalone read-only impromptu request to an idle Runner.

**Action:** only if the retrospectives use-case is still wanted — add a T0-only impromptu endpoint; write-capable impromptu stays out of scope per plan.

### G10 — Chaos suite and rollback rehearsals are documents, not evidence · Severity: medium

Phase 3/4 gates require a passing chaos suite and *actually performed* rollback rehearsals. What exists is `docs/manual-testing/09-runner-chaos.md` (manual drills). No run record was found showing the drills (kill-mid-stage, partition-and-return zombie, 5 Runners one host, version skew, backend restart under load, rotation with zero stage failures) were executed, nor Phase 1/2 rollback rehearsals.

**Action:** execute the drills once, record results next to the doc (date, build, outcome per drill). This is also the cheapest way to close most of G2.

**PARTIAL 2026-10-27 (production, builds 547–548):**
- Backend restart under load — DONE (twice, via `./deploy.sh --fast` + health gate): fleet re-polled within seconds, zero stage failures, monitor `staleRejected 0`.
- Runner credential rotation on idle `local-vibe` — DONE: `POST /runners/local-vibe/rotate` → env updated → service restarted → heartbeat active with new `credentialIssuedAt`, no errors.
- Kill-mid-stage → interrupt → re-queue → complete — DONE: stopped `local-pi` mid-stage (epoch-1 lease held, task `in_stage`), peer-interrupted via another Runner's credential (`interruptCount 1`), restarted, re-dispatched at epoch 2, completed with the file pushed to origin. `interrupts 1`, `staleRejected 0`, `divergences 0`.
- Still unexecuted: partition-and-return zombie, 5-Runners-on-one-host, version skew, Phase 1/2 rollback rehearsals. The unit suite covers the fencing half (`partitioned Runner's late completion is stale`, R04 auth suite); the live half still needs an operator window.

### G11 — Phase 4 remainder · Severity: low (each)

Not found: Runner **self-update-on-idle**; **off-host backup** of project/task state; **long-poll/push backpressure** (daemons still poll dispatch every ~5 s — fine at 4 Runners, unproven at fleet scale); **credential-age display** in the UI (`credentialIssuedAt` is stored, not shown); **"one identity from multiple origins" audit alert**. Backend SPOF remains accepted/documented (R03), as planned.

**PARTIAL 2026-10-27:** credential-age display and the origin alert are now shipped — `Settings › Harness › Runners` shows `cred <issue time>` per Runner plus an `origin ×N` alert badge when one identity heartbeats from multiple origins; the backend counts `originConflicts` per Runner (persisted, exposed on `GET /runners`, address itself never leaves the server) and threads `request.ip` through the heartbeat route. Live conflicts: 0. Still open: self-update-on-idle, off-host backup, long-poll/push backpressure.

### G12 — Deployment drift · Severity: low

- Production runs **systemd bare-node** (`~/apps/kainbain`), not Docker Compose. The Phase 1 Compose topology validates (`docker compose config` OK) but is not the live path, and the Phase 1 "clean-machine `docker compose up` → first completed task" gate has no run evidence.
- Live build is `fa032df`; repo HEAD is `ca813e2` (one test-only commit: zeroed-stats `deferredDispatch` shape). Harmless, but deploy to close the gap so `/status` matches the repo.

**RESOLVED 2026-10-27:** deployed twice via the sanctioned `./deploy.sh --prod --fast` (health-check + auto-rollback gate; both green). Production is build 548 on repo content newer than `ca813e2`, all five units healthy.
**Pre-existing failure found (not caused by, not fixed by, this work):** the full `./deploy.sh --prod` path aborts at its own `final-test-suite` gate — `tests/docker.test.js` expects `${KAINBAIN_PORT:-3100}:3100` but `docker-compose.yml` maps `:80`. That file and that test are untouched by this work (verified via `git status`); the Compose topology is not the live path anyway (systemd bare-node). Fixing the port expectation is a separate decision — left alone deliberately.

### G13 — Multi-Runner board queue views · Severity: low

Hand-notes queue layouts for 2–5 and 6+ Runners were not found; what shipped is Settings › Harness › Runners (`liveAssignments`: who runs what) plus scheduler deferral counters. The Kanban board itself is unchanged for parallel execution.

---

## 4. Readiness assessment — is it ready to be used again?

**Yes, with two caveats.**

- The app is up and healthy: backend `/status` ok, engine idle, all health checks green, 4 Runners connected and polling, full unit (9,565 tests) + canary (135) + runner (36) suites pass, docs/storage/leak gates pass.
- The embedded path is one env flip away (`KAINBAIN_RUNNER_EXECUTION_ONLY=0` + restart), so the cutover is reversible if wire execution misbehaves on its first real task.

**Before trusting it with important work:**

1. Fix G1 so `npm run lint` is green (the plan's own gate set is otherwise fully green).
2. Do G2/G10: one real task over the wire + the chaos drills, recorded. Right now the Runner path is *test-proven but production-unproven* — the queue's 7 open tasks are all non-claimable (human/paused), so nothing has exercised it yet.

Nothing else in this file blocks daily use on this host. G3–G9 and G11–G13 are honest partials against the plan (several explicitly deferred by ADR 0010/0011) and should be scheduled, not treated as regressions.

---

#project/kainbain #portability #migration #gaps
