# Migration Plan — Portable Runner Architecture (Muse executable edition)

> **Status:** Rewritten 2026-10-26 (rev 2). Supersedes rev 1 (2026-10-26 09:19) in full.
> **Executor:** This plan is written to be executed by **Muse** (`muse-wonder-1.0`), one work package at a time. Each phase carries literal tool calls, verification commands, and pass/fail gates. Do not improvise equivalents for gated commands.
> **Goal source:** [NewArchitecture.md](NewArchitecture.md) · **Risk source:** [RiskAssessment.md](RiskAssessment.md) (R01–R16, D1–D10) · **Deliverables:** [Deliverables.md](../Deliverables.md)

---

## 0. How Muse must execute this plan (read first)

1. **One phase at a time, in order.** Never start phase N+1 until phase N's check-in gate is green and its rollback rehearsal has actually been performed. Call `muse.write_todos` at the start of every session and mirror the current phase's checklist into it.
2. **Orient before editing.** At the start of each phase run:
   - `muse.read_file` on this plan (the current phase in full), [RiskAssessment.md](RiskAssessment.md) §6 for the risks that phase retires, and every source file named in that phase's *Reuse* line.
   - `muse.search` for every call site of any symbol you are about to change (pattern = the symbol name, `paths` scoped to `api/`, `frontend/src/`, `shared/`). Unsearched symbols are not edited.
   - `muse.bash` with `git status --porcelain` and `git log --oneline -5`. A dirty tree is the user's property: do not stash, clean, or overwrite it without being told to.
3. **Verify with the repo's own gates, nothing else.** The configured gates are `npm run test:unit` (API + frontend), `npm run test:canary`, `npm run lint`, `npm run docs:check`, and `node scripts/storage-sanity.mjs`. Run the exact gate named in the phase. A narrowed run (`-k`, `--deselect`, skipped tests) is a failed gate.
4. **Tests are part of the deliverable.** Every behaviour change lands with a colocated test next to the code it covers (repo convention: `*.test.js` / `*.test.jsx` beside the source). New harness/Runner behaviour must pass `api/agent/sessionContract.test.js` and the harness contract suite it belongs to.
5. **Never commit, amend, push, or tag unless the user asks in that session.** Leave work uncommitted for review. (Loaded from the repo's git-safety rules; it overrides any "ship it" wording below.)
6. **Stop conditions are real.** A phase's *kill criterion* or a `shadowed` storage-sanity result means: stop, leave the tree in the last working topology, and report the evidence — do not engineer around a kill criterion in the same session.
7. **Parallel agents:** when a phase offers independent work packages, dispatch them with `muse.subagent_spawn` (one child per work package, `worktree_isolation` on for writers). The parent keeps the gate commands; children never run gates concurrently against the same tree.
8. **Report format at each gate:** gate command, its observed result (pass/fail counts, not a summary of intent), the rollback-rehearsal result, and any risk ID whose status changed. Claims without observed output are reported as unverified.

## 1. What changed in rev 2 (why rev 1 is superseded)

Rev 1 was written before four inputs landed or were updated. Each is reconciled here; where sources conflict, **the newest dated decision wins** and the conflict is named, not silently resolved.

| # | New / updated input | Date | Effect on this plan |
|---|---|---|---|
| C1 | [Things we can change.md](<Things we can change.md>) | 2026-10-26 17:15 | Four behaviour changes adopted as decisions D11–D14 (§4). Two contradict rev 1 — see C1a/C1b. |
| C1a | *"We should also require a remote repository for new projects"* | — | **Supersedes** the [MigrationPlan-Review-Response.md](MigrationPlan-Review-Response.md) rejection of mandatory remotes, **for new projects only**. Existing local-only projects keep the loopback transport (§4 D11). |
| C1b | *"Docs now should be committed into the repo… reverse symlink direction"* | — | New Phase 1 work package (WP-1.4): docs move in-repo; the optional central-store link points outward. Rev 1 assumed the current `docs → notes-space` symlink throughout. |
| C2 | [NewArchitecture.md](NewArchitecture.md) + diagram (64 elements) | 2026-10-26 15:57 | Adds: backend config as `sqliteDb` + `.env` on a mounted folder; Runner *impromptu read-only requests* (e.g. retrospectives page comments); Runner maintenance duties (harness-change detection, reboot safety, worktree cap ≈5); UI areas named in the diagram (Orchestration, Monitor, Settings, Supp. Systems). Folded into Phases 1–3. |
| C3 | [YOLO-Plan.md](../YOLO-Plan.md) (`Unattended Mode`, tiers T0–T3) | 2026-10-25 23:27 | Runner-side execution policy (D9) is now specified as YOLO tiers, not invented fresh: a Runner advertises the tiers it permits; T3 is never fully unattended. Phase 3 dispatches carry a tier; Phase 2 provenance logging records posture per run. |
| C4 | [Strengths-Weaknesses-Deep-Dive.md](../Strengths-Weaknesses-Deep-Dive.md) + repo state | 2026-10-25 / verified 2026-10-26 | W1 is **closed in the repo**: `LICENSE` (Apache-2.0) is tracked and `origin` is a clean GitHub SSH remote. Open-sourceable is unblocked; the plan no longer carries a licence/remote work package, only a fresh-clone gate. Test counts quoted there (9,440) are stale — re-derive at Phase 1, never quote from the doc. |

Everything in rev 1 that these inputs do not touch stands: strangler sequencing, fencing over leasing, the reconciler + pageable-zero rule, the R01–R16 retirement matrix, honest acceptance of R03/R05, and the reuse list.

## 2. Goal and non-goals

**Goal.** Migrate from today's single-process KainBain to the portable target in [NewArchitecture.md](NewArchitecture.md): Docker Compose `frontend` + `backend` (Engine) plus N native Runners — delivering the three firm deliverables in [Deliverables.md](../Deliverables.md): open-sourceable, runnable on almost any machine, multithreading on agent tasks. Default install is still backend + frontend + 1 local Runner behaving exactly as today.

**Non-goals (explicit).** Containerising harnesses (Runners stay native). Replacing repo-as-truth with a database (DB is cache only; the backend's `sqliteDb` config store in C2 is configuration, not task truth). Changing stage semantics (one session per stage, same queue priority, same failback ladder). Building the YOLO-Plan's Phases 0–5 — this plan consumes its tier vocabulary only (C3).

## 3. Current vs target (verified 2026-10-26 unless marked)

| Area | Today (verified) | Target |
|---|---|---|
| Process | One Fastify process — `api/index.js` is the composition root (`ProjectStore`, `taskStore`, `sessionStore`, `agentRunner`, `eventBridge`) and serves `frontend/dist` same-origin on `:3100` (`api/index.js:224-236`) | Compose `frontend` + `backend`; Runners are separate native processes |
| Execution | `api/flow/executionQueue.js` — single `active` latch, `high`/`normal` queues, in-process scheduler ticks. One thread by construction | Backend owns queue; each Runner is one thread. Claim over the wire |
| Agent run | In-process: `agentRunner` → `SessionStore` → `api/agent/harnessRegistry.js` (`pi` default, per-project harness). One session per stage | Runner discovers local harnesses, registers, loads repo, creates worktree, runs harness, commits/pushes, reports |
| State | Repo/filesystem is source of truth (`docs/tasks/`, `.kainbain/project.json`); DB/cache only. Single writer | Same invariant, now 3 writers (backend, Runner git ops, remote) — ordering specified in Phase 0 (D2/D6/D10) |
| Docs residence | `docs/` is a symlink **out** to the SilverBullet notes space; `/docs` is gitignored in this repo; curated docs live outside the repo they describe | **Reversed (D12/C1b):** curated docs committed in-repo; an optional backend-managed symlink may mirror them to a central store. Task run history is **never** committed (`.gitignore` leak guard, §7) |
| Git isolation | ADR 0006: quarantine default, `workspaceIsolation: 'worktree'` opt-in per project, `withRepoGitLock` serialises | Per-task worktree per Runner mandatory; per-Runner dirs only; Runner periodically hard-resets its master copies to remote (C1) |
| Project remotes | Local-only repos are first-class: `api/git/remote.js:50-57` `pushBranchIfRemote` returns `{ pushed: false, skipped: 'no-remote' }`; PORTABLE_DEPLOYMENT Scenario D welcomes them | **New projects require a remote (D11/C1a).** Existing local-only projects are grandfathered on loopback transport only (§5 Phase 0 transport matrix). A remote Runner advertises no capability for a repo it cannot fetch |
| Aliases | `shared/modelAliases.js` + `api/aliasSelector.js` smooth weighted round-robin, in-memory counters per process | Backend-routed over Runner-advertised capability, semantics decided by D3 in Phase 0 (see §4). Priority-ordered (hand notes p.5) vs renormalised weights (architecture doc) is settled by D3, never by code |
| Runner requests | None — execution is queue-only | Queue tasks **plus** impromptu, almost-always-read-only requests (C2: retrospectives-style comments), tier `T0` only, from Phase 3 |
| Deploy | Single service in `docker-compose.yml` (`kainbain:latest`, `./projects` bind mount, `kainbain-data` volume); PORTABLE_DEPLOYMENT Scenarios A/B/C work today | Split frontend/backend images; Runner installed natively beside Compose |
| Open-sourceable | `LICENSE` (Apache-2.0) tracked; `origin` = clean GitHub SSH remote (C4, verified) | Kept green by the leak guard (§7) + fresh-clone gate every phase |
| UI | Kanban assumes 1 Runner (`HandNotesOnParallelism.md` p.2: "1 Runner ^ current") | Queue views for 2–5 and 6+ Runners (hand notes p.2), Runners config screen (hand notes p.4), steering routed to the owning session |

## 4. Decision register

Phase 0 decides every row. D1–D10 are inherited from [RiskAssessment.md](RiskAssessment.md) §4; D11–D14 are new in rev 2 from [Things we can change.md](<Things we can change.md>). Each decision is recorded in the phase that consumes it, with rejected alternatives — a decision with no recorded rejection is not decided.

| ID | Decision | Options (summary) | Blocks | Rev 2 note |
|---|---|---|---|---|
| D1 | Mutual exclusion | Backend lease + fencing token vs static sharding | Phase 2 | Unchanged |
| D2 | Completion atomicity | Push-then-report + idempotent reconciliation vs backend-mediated push | Phase 2 | Must cover the transport matrix (below) |
| D3 | Alias routing authority **and counter semantics** | Backend-central deterministic counters vs per-Runner/per-process counters (today: `api/aliasSelector.js` per-process) | Phase 2 | Unchanged; Phase 3 implements whichever D3 decides |
| D4 | Runner identity | Per-Runner token + human approval vs shared secret vs mTLS | Phase 2 (remote: Phase 3) | Onboarding handshake: [New Runner Onboarding flow.md](<New Runner Onboarding flow.md>) |
| D5 | Session ownership | Steering/approval/pause via backend to owning Runner; owner-offline behaviour | Phase 3 | Unchanged |
| D6 | Source-of-truth reconciliation | When backend re-reads repo state after a Runner push; cache-invalidation rule | Phase 2 | Restored to tracking (rev 1 review P3) |
| D7 | Protocol versioning | Versioned Runner API + compatibility window + upgrade policy | Phase 2 | Frontend↔backend is lockstep (Phase 1), not D7 |
| D8 | Global budget authority | Per-Runner / per-project / fleet caps; who stops parallel burn | Phase 3 | Unchanged |
| D9 | Runner-side execution policy | Allowlist, skill provenance, sandbox/YOLO posture per Runner | Phase 3 (logging from Phase 2) | **Specified by C3:** tiers `T0` read-only, `T1` write-in-worktree, `T2` commit/push own branch, `T3` merge/deploy (never fully unattended). A Runner advertises permitted tiers; the permissive tier is a per-Runner opt-in, never a fleet default |
| D10 | State ownership split | Backend "Mounted Projects" vs Runner "Loaded Projects": which writes win, how they converge | Phase 1 | Now entangled with D12 — decide together |
| D11 | **Project remote requirement (new)** | (a) Remote mandatory for all projects; (b) remote required for **new** projects, existing local-only grandfathered; (c) local-only first-class forever (rev 1 position) | Phase 2 | **Recommended: (b).** (a) breaks existing installs and the Goal; (c) contradicts C1a. Under (b), project creation validates a fetchable remote; grandfathered repos use transport row 2 below and are never offered to remote Runners |
| D12 | **Docs residence (new)** | (a) Status quo: `docs/` symlinks out to the notes space; (b) docs committed in-repo, optional outward mirror symlink managed by the backend (C1b) | Phase 1 | **Recommended: (b).** Prerequisite for Runners on other machines reading curated docs at all. Task run history stays gitignored under both options (§7) |
| D13 | **Host-reference derivation (new)** | (a) Hardcoded SilverBullet/Forgejo references (today, e.g. `PORTABLE_DEPLOYMENT.md`, `KB Local Integration details.md`); (b) derive provider + URLs from each project's git remote; support GitHub/GitLab/Forgejo generically (C1) | Phase 1 | **Recommended: (b).** Local dev-infra references (semgrep, SecObserve) are explicitly out of scope — development infra, not product (C1) |
| D14 | **Runner master hygiene (new)** | (a) Runner masters drift, pulled on demand; (b) Runner periodically hard-resets master copies to remote, worktree cap ≈5 with owned-only cleanup (C1 + C2) | Phase 2 | **Recommended: (b).** Hard reset applies to the Runner's *master copies only*, never to a worktree with an active claim (R10) |

**Repository-transport matrix (decided with D2/D10/D11 in Phase 0):**

| Row | Repo kind | Runner kind | Transport | Completion verified by |
|---|---|---|---|---|
| 1 | Remote-backed | Any | Clone from origin → per-task worktree → push | Backend confirms pushed SHA reachable |
| 2 | Local-only (grandfathered, D11b) | Loopback only | Adopt/share the repo path — no clone-from-origin, no push (`no-remote`, as today) | Branch + SHA present in the backend-visible repo |
| 3 | Local-only | Remote | **Not dispatchable** — Runner advertises no capability for it | — |

## 5. Phases

Strangler migration. Never build multi-Runner before single-Runner-over-the-wire proves parity. Every phase leaves a working, revertible system.

**Reuse, don't rewrite** (all verified present 2026-10-26): harness contract (`api/agent/harnessContract.js`, `api/agent/sessionContract.test.js`), alias grammar (`shared/modelAliases.js`), prompt curation, log streamer (`api/agent/logStream/`), storage-sanity gate (`scripts/storage-sanity.mjs`), `pushBranchIfRemote` no-remote semantics (`api/git/remote.js`).

### Phase 0 — Decisions & protocol sketch (no code)

**Work (paper only — `muse.read_file` and writing docs; no `muse.bash` beyond orientation in §0):**

1. Decide D1–D14 (§4) in priority order: D1+D2 (claim/fencing/completion) → D11+D10+D12 (remote requirement, state ownership, docs residence — decide as one bundle) → D6 (reconciliation timing) → D3 (alias authority + counters) → D4+D9 (identity + tiers) → D13+D14 → D8.
2. Sketch the versioned Runner↔Backend protocol: `register → heartbeat → claim → progress → log ingest → complete/error`, plus the onboarding handshake (join request → UI approve/deny → secure channel) from [New Runner Onboarding flow.md](<New Runner Onboarding flow.md>).
3. Adopt the escalation-ladder ownership matrix ([RiskAssessment.md](RiskAssessment.md) §5) unchanged.
4. Record each decision with its rejected alternatives, appended to this plan or as an ADR in `docs/adr/` following the existing `0001`–`0007` format.

**Phase 0 deliverable — risk retirement matrix (blocking):**

| Risk | Retired in | Risk | Retired in |
|---|---|---|---|
| R01 Double-claim / unfenced push | Phase 2 | R09 Secrets / attribution | Phase 3, rehearsed Phase 4 |
| R02 Repo-as-truth ordering | Phase 2 (D2/D6) | R10 Worktree/disk contention | Phase 2 (loopback), Phase 3 (fleet) |
| R03 Backend SPOF | Accepted; durability Phase 2, backpressure Phase 4 | R11 Version/protocol skew | Phase 2 (handshake), Phase 3 (fleet) |
| R04 Unauthenticated channel | Phase 2 (loopback), Phase 3 (remote) | R12 UI concurrency / steering | Phase 3 |
| R05 Backend→Runner execution | Phase 3 (D9 tiers); provenance logging starts Phase 2 | R13 Cost / starvation | Phase 3 |
| R06 Ladder repricing | Instrumented Phase 2, owned every phase | R14 Log fragmentation | Phase 2 |
| R07 Capability/alias misrouting | Phase 3 (D3) | R15 Portability regressions | Phase 1, re-gated every phase |
| R08 Partition / zombie Runner | Phase 2 (lease/heartbeat), Phase 3 (chaos) | R16 Migration / rollback | Every phase gate (incl. rollback rehearsal) |

**Check-in gate (blocking):** matrix complete (every risk R01–R16 names its retiring phase); D1/D2/D6/D10/D11/D12 written down with rejected alternatives; open-decision count = 0.
**Kill criterion:** D2/D10 needs a second writable store → stop; "repo as truth" and this topology conflict.
**Monitor:** none (paper phase). Track open-decision count → 0.

### Phase 1 — Containerise without distribution (+ docs residence)

No Runner binary, no new failure modes. The embedded runner stays in the backend. Four work packages; WP-1.1→1.3 are sequential, WP-1.4 may run in parallel via `muse.subagent_spawn` (writer isolation on) once D12 is decided.

- **WP-1.1 — Compose split, same-origin mandatory.** Split the single `kainbain:latest` service in `docker-compose.yml` into `frontend` (static/Vite build) + `backend` (`api/` + `shared/`). Preserve one user-facing origin: the frontend container (or an edge proxy) proxies API routes and `/ws` to the backend — today the API serves `frontend/dist` same-origin with the stream on `/ws` (`api/routes/ws.js:14`, WebSocket, not SSE). A two-port outcome is a Goal violation requiring a Goal amendment, not a documentation note. Frontend↔backend compatibility: lockstep release (one Compose version pins both images); backend exposes its version on `/status`; a mismatched frontend shows an explicit mismatch banner instead of failing obscurely.
- **WP-1.2 — State ownership across the container boundary (D10 in practice).** Backend mounts one folder holding general config (`sqliteDb` + `.env` per C2) plus the master projects folder (repo-as-truth). Document, in one place, which side writes what; resolve path/state behaviour so `node scripts/storage-sanity.mjs` stays green across the boundary.
- **WP-1.3 — Host-reference derivation (D13).** Remove product-visible hardcoded SilverBullet/Forgejo references; derive provider and web URLs from each project's git remote (GitHub/GitLab/Forgejo generic). Dev-infra references (semgrep, SecObserve) are untouched. *Executor:* `muse.search` for `silverbullet|forgejo\.local|notes\.local` across `api/`, `frontend/src/`, `shared/`, and root docs; every hit is either derived, config-driven (`api/config/schema.js` — new knobs are declared there, never read ad hoc), or explicitly classified dev-infra in a comment.
- **WP-1.4 — Docs residence reversal (D12, only if D12 = option b).** Curated docs are committed into the repo they describe; `docs/` stops being a symlink out to the notes space. The backend may offer an optional outward mirror symlink to a central store for users who want one — the mirror is a view, never the source. **Before any docs file is tracked, §7's leak guard must be in force and verified** (it already is in this repo; re-run the §7 check). `TASK_DIRECTORY_HYGIENE.md` and the storage-sanity `shadowed` procedure are updated to the new direction in the same change.

**Check-in gate (all via `muse.bash`, observed output reported per §0.8):**
1. Drain first: no in-flight stage owned by the old topology; cutover only at stage boundaries.
2. Clean-machine install (fresh VM, no prior state) reaches a first completed task; fresh-clone checkout of the public repo boots with `docker compose up -d` and answers `curl http://localhost:3100/status`.
3. Parity run: same workload on pre-container vs Compose — same board, reports, logs.
4. `node scripts/storage-sanity.mjs` passes; `npm run test:unit` and `npm run test:canary` green; `npm run docs:check` green after WP-1.3/WP-1.4 doc moves.
5. **Rollback rehearsal actually performed:** revert to the single-service topology and prove the board survives.

**Rollback:** previous single-service `docker-compose.yml` (rehearsed at the gate).
**Monitor (activates this phase):** boot time, `/status` health, storage-sanity result, docs-link state (`shadowed` = stop).
**Value if stopped here:** risk reduction plus an independently shippable packaging improvement (the Compose frontend+backend split is one Priority-1 acceptance bullet in [Deliverables.md](../Deliverables.md)). It does **not** deliver the headline deliverables: native-Runner packaging lands in Phase 2, multithreading only in Phase 3. Do not declare victory at Phase 1.

### Phase 2 — One Runner over the wire (loopback only)

**Work:**

1. Extract the Runner as a separate native process reusing `api/agent/` harness implementations. It implements register/heartbeat with harness + version + model + permitted-tier (D9/C3) discovery; records execution posture (tier, harness, approvals mode) on every run from this phase (provenance logging, R05).
2. Project load per the transport matrix (§4): remote-backed → git clone to the Runner projects folder + pull; local-only loopback (grandfathered, D11b) → adopt/share the repo path, no clone-from-origin. **Project creation now requires a fetchable remote for new projects (D11)** — validation at creation, with a clear error naming the missing remote; existing projects are untouched.
3. Per-task worktree (`kb/<taskId>`, cap ≈5, own-dirs only), run, sequenced log streaming, commit/push (push skipped as `no-remote` for grandfathered local-only repos, matching `pushBranchIfRemote` today).
4. Runner maintenance baseline (C2/D14): harness-change detection reflected to the backend on heartbeat; reboot-safe startup that surfaces orphaned worktrees/unpushed work instead of discarding them; master copies periodically hard-reset to remote (masters only, never an actively-claimed worktree).
5. Backend: atomic claim `POST /tasks/:id/claim` → `200` + lease or `409`; monotonically increasing fencing token / execution epoch checked at completion **and** at the push path (remote-backed: epoch-branch or backend verification that the pushed SHA is reachable before marking complete; local-only: branch + SHA present in the backend-visible repo); idempotent completion keyed by execution ID; reconciler for push/report divergence.
6. Per-Runner token + human approval even on loopback. Version handshake. **Deliverable: minimal onboarding approval UI in Settings** (pending Runner join requests with approve/deny, per [New Runner Onboarding flow.md](<New Runner Onboarding flow.md>) steps 4–5) — the full Runners config screen is Phase 3, but Phase 2's R04 gate depends on this surface existing.

**Check-in gate:**
1. Drain first: no in-flight stage owned by the embedded runner.
2. Parity suite passes with the Runner out-of-process (same tasks, stages, failback, human stages) for **both** a remote-backed fixture repo and a grandfathered local-only (no-remote) fixture repo. New-project creation without a remote is rejected with the D11 error (test-covered).
3. R01 partition test: 2 Runners, 1 task, partition the first mid-stage → exactly one completion accepted, stale push rejected.
4. R04 auth tests: unauthenticated / wrong-scope / revoked Runner rejected on every endpoint.
5. Kill the Runner mid-stage → recovers at ladder step 3 (re-dispatch as `interrupted`, never `failed`/`complete`).
6. Harness contract suite passes inside the Runner (`api/agent/sessionContract.test.js`).
7. **Rollback rehearsal actually performed:** revert to the Phase 1 embedded-runner topology and prove in-flight work re-queues as `interrupted`.

**Kill criterion:** parity needs local-Runner special-casing vs remote beyond the transport matrix (transport difference is expected; protocol difference is not) → the protocol is wrong; fix the protocol, not the transport.
**Monitor (activates this phase; owner: backend operator on call):** claim-conflict rate (sustained non-zero = defect), rejected stale-epoch pushes, "completed stage with unverifiable SHA" (transport row 1: pushed SHA unreachable; row 2: branch/SHA absent — pageable-zero), log-gap/duplication on ingest, escalation counters per ladder step.

### Phase 3 — Multi-Runner, heterogeneous, remote

**Work:**

1. Backend-routed dispatch over versioned, runnable-checked capability advertisements (harness + version + models + runnable flag + permitted YOLO tiers, refreshed on heartbeat, staleness expiry — "has Muse" at the wrong version ≠ capable).
2. Alias semantics **as decided by D3** in Phase 0 (routing authority *and* counter semantics). This plan's recommendation, following [RiskAssessment.md](RiskAssessment.md) R07, is backend-central deterministic weighted selection reusing `selectAliasTarget` — but Phase 3 implements whichever D3 decides. No silent model substitution; no capable Runner → loud step-6 signal.
3. Per-Runner project allowlist enforced *by the Runner* (D9), tier ceiling enforced by both sides (a `T2` task never dispatches to a `T1`-max Runner), disk headroom in heartbeat with dispatch cut-off, per-repo git serialisation, fleet-wide master hard-reset hygiene (D14).
4. Steering/follow-up/pause/approval routed via backend to the owning Runner + execution, acknowledged — unacknowledged = shown undelivered. Impromptu read-only requests (C2) enabled here, tier `T0` only, separately authorised and logged; write-capable impromptu requests do not exist in this phase.
5. Multi-Runner UI (2–5 and 6+ layouts per hand notes p.2; full Runners settings screen per hand notes p.4, extending Phase 2's approval surface). Budgets per task/project/fleet enforced at dispatch (D8); bounded retry/failback; capability-aware, starvation-free (ageing) scheduling preserving queue priority. Remote onboarding enabled only now (explicit opt-in; backend loopback-only by default).

**Check-in gate:** chaos suite passes — kill Runner mid-stage, partition-and-return (zombie), 5 Runners on one host, version-skewed harnesses, concurrent completions with steering to the owning session. Burn-rate and starvation tests pass. No chaos case needs a human to restore *correctness* (speed is OK).
**Kill criterion:** any chaos case requires human correctness repair → ladder regression; Phase 3 does not ship.
**Monitor:** dispatch-rejection rate by alias/harness/version/tier, stale-capability count, per-Runner/project burn rate + budget trips, oldest-waiting-task age, steer/approval ack latency + failures, git lock contention, disk headroom, per-step escalation counters trending down.

### Phase 4 — Hardening & scale

**Work:** backend durability/backpressure (long-poll or push with jittered backoff; N pollers must not DDoS the engine after a restart thundering herd), durable lease/queue state, off-host backup of project/task state, fleet credential rotation rehearsed (per-Runner git identity for push attribution), Runner self-update-on-idle, fleet version matrix in UI. Accept backend SPOF explicitly (documented, replica-ready consistency) — do not pretend otherwise.

**Check-in gate:** backend restart under load loses no completions, re-queues in-flight as `interrupted`. Rotation completes with zero stage failures. Clean-machine install timed zero → first completed task as a release gate.
**Monitor:** queue depth, dispatch latency, connected/idle Runners, backend health, credential age per Runner, audit log by Runner identity (one identity from multiple origins = alert).

## 6. Cross-phase monitors (things to watch throughout)

Owner for all pageable alerts: the backend operator on call, unless a row names another owner.

| Signal | Activates | Healthy | Act when |
|---|---|---|---|
| Boot / `/status` / storage-sanity | Phase 1 | Green | `shadowed` docs-link = stop |
| Escalation counters (steps 1–9/week) | Phase 2 | Trending down per phase | Any step 7+ gets a written cause + demotion attempt |
| Claim conflicts / stale pushes | Phase 2 | ~0 outside deploys | Sustained >0 = fencing defect (R01) |
| Reconciler divergence / unverifiable SHA | Phase 2 | 0 (pageable-zero) | >0 → stage to `interrupted`, never silent force-push |
| Log gaps per task | Phase 2 | Flagged in data, rare | Unflagged gap = defect (R14) |
| Dispatch rejection / stale capability / burn rate | Phase 3 | Low; burn flat vs baseline | Rising burn = re-dispatch/failback loops (R13) |
| Mean time to human intervention | Phase 2 (baseline Phase 1) | Not falling vs today | Falling = distribution repriced recovery (R06) |
| Leak-guard check (§7) | Phase 1, re-run every phase | No task/session path staged or tracked | Any hit = stop; untrack before anything else ships |

## 7. Leak guard — past task/session history never reaches GitHub (standing rule)

Task runs accumulate prompts, full transcripts, stage reports and tool output that cannot be guaranteed free of sensitive information. Curated docs are publishable; run history is not. This rule outlives every phase and binds WP-1.4 (docs reversal) absolutely.

**Already in force in this repo (`.gitignore`, verified 2026-10-26):** `.kainbain/` (covers `.kainbain/sessions/` — 2,069 session files, ~679 MB), `/docs` (while the symlink lasts), plus the rev 2 additions `docs/tasks/`, `docs/docs/tasks/`, `scratch/sessions/`, `*.session.jsonl` so the guard survives the symlink reversal. The notes-space `.gitignore` independently ignores `/tasks/` (259 run dirs, ~374 MB). Verified clean: no session/task-history path is tracked (`git ls-files` shows only test fixtures under `api/agent/harnesses/*/fixtures/`).

**Executor check — run at Phase 1 start and at every later gate (`muse.bash`):**

```bash
git ls-files | grep -E '(^|/)(sessions|\.kainbain)/|docs/tasks/|\.session\.jsonl$' \
  && echo "LEAK-GUARD FAIL: run history is tracked" || echo "leak-guard: OK"
git status --porcelain | grep -E 'tasks/|sessions/' \
  && echo "LEAK-GUARD FAIL: run history is staged/untracked-in-repo" || echo "leak-guard: OK (nothing staged)"
```

Either FAIL line means stop. Fix by untracking (`git rm --cached`, with the user's approval) — never by deleting the history from disk, and never by rewriting git history without an explicit user request.

## 8. Risks / open questions

Highest inherent risks ([RiskAssessment.md](RiskAssessment.md) §6): R01 double-claim/unfenced push (12→4), R02 dual-writer ordering (12→6), R04 unauthenticated channel (12→4), R05 backend→Runner code execution — backend ships prompts/skills to YOLO-posture executors; Runner-side allowlist + tier ceiling are mandatory (12→8, tiers per D9/C3), R03 backend SPOF accepted (12→8).

Open (block Phase 2 build, not Phase 1): D1 fencing mechanism (epoch-branch vs backend-mediated push), D2 completion atomicity incl. transport rows 2–3, D6 reconciliation timing/cache invalidation after a Runner push, D3 alias authority + counter semantics (doc-vs-hand-notes disagreement settled by decision, not code). Open (block Phase 1 WP-1.4): D12 option confirmed and the §7 check green. Open (non-blocking, decide in Phase 0): default grandfather tier for existing projects under D9 (YOLO-Plan defaults existing projects to `T1`; its `T2` alternative changes one default — settle before Phase 2, not during).

Assumptions (do not re-litigate): Runners stay native (do not containerise harnesses); repo stays source of truth; one session per stage retained.

Highest-risk validation step: the Phase 2 partition test — the only proof fencing works at the git remote, not just in the backend.

## 9. Source map (what the executor reads, in precedence order)

1. **This plan** — sequencing, gates, kill criteria. On conflict with any source below, this plan's *gates* win and the conflict is reported, not silently resolved.
2. [Things we can change.md](<Things we can change.md>) (2026-10-26 17:15) — newest behaviour decisions (D11–D14). Wins over rev 1 and over [MigrationPlan-Review-Response.md](MigrationPlan-Review-Response.md) where they collide (C1a).
3. [NewArchitecture.md](NewArchitecture.md) + `NewArchitecture.excalidraw` (2026-10-26 15:57) — target topology, Runner lifecycle, impromptu requests, maintenance duties.
4. [RiskAssessment.md](RiskAssessment.md) — R01–R16, D1–D10, ladder ownership. The scoring authority; this plan does not rescore.
5. [YOLO-Plan.md](../YOLO-Plan.md) — execution tiers T0–T3 consumed by D9. Its own Phases 0–5 are a separate programme.
6. [New Runner Onboarding flow.md](<New Runner Onboarding flow.md>), [HandNotesOnParallelism.md](../HandNotesOnParallelism.md), [Deliverables.md](../Deliverables.md), [MuseIntegrationSpike.md](../MuseIntegrationSpike.md), `PORTABLE_DEPLOYMENT.md`, ADRs `0001`–`0007` — supporting evidence, read as needed per phase.
7. [MigrationPlan-Review.md](MigrationPlan-Review.md) + [MigrationPlan-Review-Response.md](MigrationPlan-Review-Response.md) — historical. All P1–P6/S1–S4 findings are incorporated above; the response's mandatory-remote rejection is superseded by C1a/D11 for new projects only.

---
#project/kainbain #portability #migration #claude-code


