# DELIVERABLES.md — Multi-project production-readiness work packages

Task: `5fdea223-6b10-460e-8ae7-388526798085` — make KainBain safe to run
multiple projects on shared runners at production-level workloads.

Source of truth: [AUDIT.md](./AUDIT.md) (verdict: READY WITH HITCHES at
small scale, 2–3 projects / 1–2 runners; production-scale gate open).
Guidance: [FRAMEWORKS.md](./FRAMEWORKS.md). Surveys:
[INTENT-SURVEY.md](./INTENT-SURVEY.md), [FEEDBACK_SURVEY.md](./FEEDBACK_SURVEY.md).

## How to read this file

- Each work package (WP) is a **whole, ticketable step**: one owner, one
  acceptance gate, shippable on its own. Ticket-splitting hints are inside
  each WP ("Slice into tickets").
- Ordering follows **"make the change easy, then make the change"** (Beck
  XP): structural seams and safety rails first (WP1–WP2), behaviour fixes
  next (WP3–WP4), measurement and drills once the signals exist (WP5),
  conditional scale-out only on evidence (WP6), config/docs last (WP7).
- Every WP states its **required knowledge** (files + framework clauses)
  so a ticket implementer never has to re-derive the audit.
- Global constraint on ALL WPs (from the task + AUDIT §6): **no real
  projects**. All verification uses ephemeral temp-dir fixtures
  (`proj-alpha`/`proj-beta`-style) behind `api/testSetup.isolation.js` +
  `api/isolatedTestRoots.js`, with before/after contamination checks on
  `~/projects`, `~/.kainbain/projects.json`, `~/.kainbain/engine/*`.
  Live dummy projects are read-only evidence, never mutation targets.
- Path note: AUDIT.md cites evidence under `/home/server2/...`; the live
  checkout root differs but relative paths (`api/...`, `runner/...`,
  `frontend/...`) are identical. Resolve relatively.

## Dependency map

```
WP1 (tenant-safety seam) ──┐
WP2 (observability seam) ───┼──▶ WP5 (SLO gate + failure drills)
WP3 (lifecycle semantics) ──┘         │
WP4 (poison-task policy) ────────────┘
WP6 (fairness quota, CONDITIONAL on WP5 evidence) — standalone, off critical path
WP7 (runbooks/ADRs/docs, config-only) — last, depends on WP1+WP3+WP4+WP5 outcomes
```

- WP5 is blocked on WP1 (correctness must be fenced before load proves
  anything), WP2 (no SLO verdict without the signals), WP3 (unload drill
  needs defined semantics), WP4 (poison drill needs the policy).
- WP6 must NOT start before WP5 has numbers; it is explicitly conditional.
- WP7 is pure config/docs; do it last so it documents what was actually built.

---

## WP1 — Close the cross-project tenant-safety gap (H-1 + H-4)

**Goal:** make cross-project writes structurally impossible on the runner
path, not merely unlikely. Covers AUDIT H-1 (fail-open active-project
fallback) and H-4 (ledger never compares `hold.projectId`).

**Required knowledge**

- Files: `api/projectResolution.js` (`resolveProjectId`, lines ~8–14 —
  the `?? activeProject` fallback); `api/flow/runnerRoutes.js` (`guardedTask`
  ~L510, claim path ~L980, plus `progress`/`logs`/`verify-sha`/
  `complete-execution`/`steer-ack`/`interrupt` and `integration*` routes);
  `api/flow/claimStore.js` (`describe()` ~L230–239 — strips `projectId`);
  `api/flow/executionLedger.js` (`_holdOrThrow` ~L91–103 — checks only
  executionId/epoch/runnerId); `runner/client.js` (all calls already send
  explicit `projectId` — the fix must not break the daemon).
- Frameworks: OWASP ASVS 4.0 V4.1/V5.1 object-level authorisation
  (every `projectId` is a BOLA boundary); ISO 25010 security/integrity.
- Survey anchor: FEEDBACK_SURVEY q5 — true `kainbain`-as-project/default-
  tenant assumptions are **blockers**.

**Deliverables**

1. Explicit-`projectId` enforcement on all runner-mutating routes:
   missing `projectId` → `400` (never active-project fallback). Non-mutating
   UI/view routes may keep the fallback; document the split.
2. `ClaimStore.describe()` includes `projectId`; `_holdOrThrow` (or its
   successor guard) compares request `projectId` against `hold.projectId`
   and rejects mismatches with a named fencing error.
3. Regression tests (synthetic only): omitted-`projectId` → 400 on every
   mutated route; cross-project replay (A's lease against B's task, stale
   epoch, second claimer → `CLAIM_CONFLICT`/`STALE_EPOCH`/404) — extend the
   AUDIT Q4 probe (`/tmp/kb-q4-probe.mjs` pattern) into a committed suite.
4. Brief migration note: any current caller omitting `projectId` (AUDIT says
   none in the daemon — verify) is updated.

**Acceptance**

- Full Q4 matrix green on synthetic fixtures: correct-project writes
  accepted; wrong-project/stale-epoch/double-claim always rejected; no
  fallback-to-active on any mutating route.
- Existing suites still green: `claimStore`, `executionLedger`,
  `runnerPolicyDispatch`, `integrationDispatch`, `projectResolution`.

**Blocks / unblocks:** blocks WP5 (load must run against fenced code).
No dependency on other WPs — do first.

**Slice into tickets:** (a) route-guard + 400 tests; (b) ledger `projectId`
plumbing + fencing tests; (c) caller audit + migration note. (a) and (b) can
parallelise; (c) follows (a).

**Effort signal:** small–medium. Centralised guards, no queue/semantics change.

---

## WP2 — Add the missing production signals (H-5)

**Goal:** make multi-project behaviour *measurable* so the SLO gate (WP5)
can pass or fail honestly. Covers AUDIT H-5. This is the "make the change
easy" seam for everything quantitative.

**Required knowledge**

- Files: `api/watch/observabilityMetrics.js` (existing: `queueDepth`,
  scheduler stats, git contention); ledger `staleRejected` counters;
  `/runners/monitor` live-hold source; dispatch path (`api/flow/dispatch/
  scanClaimableTasks.js`, `api/flow/scheduler/centralQueuePolicy.js`,
  `sortCentralQueue`); fleet cap `429 FLEET_CONCURRENCY_EXHAUSTED` and
  per-project `PROJECT_BUSY` skip paths (new counters hook here).
- Frameworks: SRE Ch.10 / OTel + RED/USE + golden signals (FRAMEWORKS §3.8);
  minimum set per §3.8: dispatch latency, queue depth, claim-fencing
  rejections, per-project throughput/fairness, worktree evictions,
  skill size-cap omissions.

**Deliverables**

1. New counters/histograms: dispatch-latency percentiles (p50/p95/p99),
   per-project claimed/completed throughput + wait-time (feeds fairness),
   claim success rate (non-conflict claims / attempts, excluding operator
   pauses and version refusals), scope/fencing rejection breakdown
   (`PROJECT_SCOPE`, `STALE_EPOCH`, `CLAIM_CONFLICT`).
2. Metrics are per-project labelled and queryable over a load window
   (whatever the existing exposition is — extend it, don't add a second
   system).
3. Unit/integration tests on synthetic fixtures: each new signal moves
   under a scripted scenario (burst → fairness counters diverge correctly;
   conflict → conflict counter increments).
4. One-page metric dictionary (name, labels, what proves what) — feeds WP7.

**Acceptance**

- Every §3.8 minimum signal exists and is observable during a scripted
  synthetic burst; AUDIT's "unmeasured" list for Q8 is empty.
- No live-project writes during verification (contamination check clean).

**Blocks / unblocks:** blocks WP5 (SLOs need these signals). Independent of
WP1/WP3 — can parallelise with WP1.

**Slice into tickets:** (a) latency + queue-depth percentiles; (b) claim/
fencing + scope counters; (c) per-project throughput/fairness + dictionary.
All three can parallelise behind the agreed metric exposition.

**Effort signal:** small–medium. Additive instrumentation, no behaviour change.

---

## WP3 — Define and fence project unload/delete (H-3)

**Goal:** turn unload/delete from "mostly works, with a zombie window"
into a documented, fenced lifecycle. Covers AUDIT H-3 (`DELETE
/projects/:id` is memory-only, unfenced; rescan resurrects; live holds
survive until TTL).

**Required knowledge**

- Files: `api/routes/projects.js` (`DELETE /projects/:id` ~L602);
  `api/projectStore.js` (`deleteProject` ~L2006, rescan logic, first-key
  active default ~L529–530); registry file handling (`api/projectRegistry.js`
  — advisory, missing/corrupt → empty); operator scope path
  (`PATCH /runners/:id/config` `{ projectScope }` via `operatorConfigVerdict`
  — the *already-correct* drain-and-fence reference implementation: future
  matching only, live holds drain); `runner/project.js` workdir hygiene
  (`WORKTREE_CAP`, LRU evict, `kb-recovery/*` parking).
- Frameworks: Twelve-Factor III/IX (config, disposability); Compensating
  Transaction (unload parks + fences + is reversible); ISO 25010
  reliability/recoverability.
- Survey anchor: FEEDBACK_SURVEY q2 — drain-and-fence is the required
  semantic (in-flight finishes or parks, no new claims, re-load clean).

**Deliverables**

1. Decide and implement ONE of: (a) fence holds + remove persisted state
   (registry/config entries) on delete, or (b) keep delete shallow but
   refuse it while holds are live (`409` with active-hold list) and
   document "scope-off → wait idle → delete". AUDIT recommends (a) or the
   documented (b); do not leave the current silent-zombie behaviour.
2. State-transition tests (synthetic): active → scope-off mid-task (no new
   claims, in-flight drains) → delete → rescan does NOT resurrect →
   re-register is clean and idempotent (`registerProjectPath` no-op).
3. Operator error codes for post-unload claims (loud refusal, never silent
   skip — same contract as `PROJECT_SCOPE`).

**Acceptance**

- Mid-task unload/delete drill: zero lost work, zero zombie claims past
  the defined fence, re-load resumes cleanly.
- Advisory-registry contract preserved: corrupt/missing registry still
  degrades to empty, never broken boot.

**Blocks / unblocks:** blocks WP5's unload-mid-task drill. Independent of
WP1/WP2 — can parallelise.

**Slice into tickets:** (a) decision + fence/delete implementation;
(b) state-transition suite; (c) operator error UX. (b) pins (a)'s contract.

**Effort signal:** medium. Lifecycle semantics touch store + registry + routes.

---

## WP4 — Decide the poison-task policy (O-3)

**Goal:** answer AUDIT's open question — what happens to a task that can
never succeed — before it wedges the shared queue in production. Covers
O-3 (quarantine exists for models only; task-level dead-letter unverified).

**Required knowledge**

- Files: stage-failure paths (task fail vs requeue-loop — trace from the
  runner daemon through completion routes); existing model quarantine
  (reuse its shape if suitable); `WORKTREE_CAP` + `kb-recovery/*` parking
  (poison tasks also consume workdirs); WP2 counters (poison retries must
  be visible).
- Frameworks: Poison Pill + Dead-Letter pattern (FRAMEWORKS §3.5); SRE
  Ch.7 overload handling; ISO 25010 fault tolerance.
- Note: AUDIT Q2 backpressure (fleet 429, per-project skip, circuit
  breaker) already bounds *load*; this WP bounds *permanent failure*.

**Deliverables**

1. Policy decision recorded as ADR: retry budget (N attempts) → quarantine/
   dead-letter with reason preserved → queue continues for other projects;
   operator unquarantine path. (If current fail-fast already bounds it,
   the ADR records the proof + test instead of new code.)
2. Implementation if the proof fails: attempt counter, quarantine state,
   per-project quarantine visibility, no requeue-loop.
3. Synthetic tests: always-failing stage/skill/repo task → quarantined
   after N, sibling-project tasks drain unaffected.

**Acceptance**

- One poison task cannot stall the mixed queue; quarantine is observable
  (WP2 signals) and reversible by the operator.
- ADR filed (feeds WP7's tradeoff log).

**Blocks / unblocks:** blocks WP5's poison drill. Independent of WP1–WP3 —
can parallelise once the ADR direction is set.

**Slice into tickets:** (a) failure-path trace + ADR; (b) implementation
(if needed) + tests. (b) is conditional on (a)'s finding.

**Effort signal:** small if fail-fast already bounds it; medium if a
dead-letter store is built. Timebox the trace before committing to a build.

---

## WP5 — Run the production-scale gate: SLOs + load + failure drills (Q8)

**Goal:** close the AUDIT Q8 gate — either prove production-scale
readiness against pre-declared SLOs or produce the bounded failure list.
This WP makes no product change; it renders the verdict WP1–WP4 earned.
Do NOT claim production readiness without it.

**Required knowledge**

- AUDIT §7 proposal (adopt or amend first): correctness 100% (zero
  mis-attributed claims/progress/reports — error-budget-zero); dispatch
  latency p95 < 2 s under the agreed profile (after WP2); claim success
  rate > 99% (excl. operator pauses/version refusals); dispatch-endpoint
  non-5xx > 99.9% over the soak.
- Load profile (synthetic, mock harnesses, REAL dispatch path — never mock
  the queue, Twelve-Factor X parity): steady state (2–3 projects × few
  tasks) → single-project burst (noisy neighbour) → all-project burst →
  sustained queue depth; Little's-law sanity (`L = λW`) on depth.
- Failure drills: runner kill mid-task (lease expiry → re-queue, no
  cross-project loss); backend restart mid-dispatch (holds drop, epochs
  persist, re-queue as interrupted); poison task (WP4 policy); worktree-cap
  pressure (LRU + recovery parking); scope-off unload mid-task (WP3).
- Frameworks: SRE Ch.3/5/17 (SLOs, capacity, readiness checklist); 29119
  load/performance type; Bulkhead/Idempotent-Consumer/Circuit-Breaker
  expectations.

**Deliverables**

1. Agreed SLO set (signed off before the rig runs — SRE Ch.3 rule).
2. Load + drill report: tool + script versions, results vs each SLO,
   Little's-law check, per-drill outcome (recover clean / bounded damage /
   blocker found).
3. Verdict update: production-ready / ready-with-hitches / NOT ready, with
   the failing clause cited; any new blocker gets a WP1–WP4-style follow-up.

**Acceptance**

- SLOs declared BEFORE measurement; all drills executed on synthetic
  fixtures; contamination check clean; report filed in the task docs.
- Q8 exit criteria (FRAMEWORKS §8) all met, or the miss is named.

**Blocked by:** WP1 (fenced code), WP2 (signals), WP3 (unload semantics),
WP4 (poison policy). Starts only when all four land.

**Slice into tickets:** (a) SLO sign-off + rig + steady/burst runs;
(b) failure drills (one ticket per drill is fine — they parallelise);
(c) report + verdict. (a) first, (b) in any order, (c) last.

**Effort signal:** medium. Mostly rig + runs, not product code.

---

## WP6 — Fairness quota, ONLY on WP5 evidence (H-2, conditional)

**Goal:** decide with data whether FIFO-oldest-first + 15-minute ceiling
(`sortCentralQueue` in `api/flow/scheduler/centralQueuePolicy.js`) is
enough, or whether a noisy neighbour needs a per-project quota. Covers
AUDIT H-2, currently an **accepted tradeoff — not a build task**.

**Required knowledge**

- Files: `sortCentralQueue` + 15-min starvation ceiling; fleet cap vs
  per-project `PROJECT_BUSY` skip; WP2 fairness counters; WP5 burst results.
- Frameworks: SRE Ch.5 fairness; KEDA/HPA resource model (analogy only);
  ATAM tradeoff + ADR.

**Deliverables (only if WP5 shows noisy-neighbour pain)**

1. ADR recording the decision (keep FIFO vs add quota, with the WP5 numbers).
2. If quota: per-project concurrency/share behind a flag, default off or
   conservative; synthetic tests proving the burst scenario that failed WP5
   now passes without starving anyone else.

**Acceptance**

- Either: WP5 shows no pain → ADR "keep FIFO, revisit on evidence", zero
  code. Or: quota implemented, WP5 burst re-run green.
- Explicit NON-goal: do not build this speculatively. AUDIT found no
  correctness failure here.

**Blocked by:** WP5 numbers. Off the critical path — never a launch blocker
unless WP5 makes it one.

**Slice into tickets:** single ticket (ADR first; implementation only if the
ADR requires it).

**Effort signal:** tiny (ADR only) or medium (quota implementation).

---

## WP7 — Runbooks, ADRs, and docs (config-only, last)

**Goal:** lock in everything WPs 1–5 decided so the next operator — and
the next app-dev project — inherits it. Pure config/docs; no behaviour
change. Do last so it documents reality, not intent.

**Required knowledge**

- Outcomes of WP1 (explicit-`projectId` contract), WP3 (unload/delete
  semantics), WP4 (poison ADR), WP5 (SLOs + drill results), WP6 (fairness
  ADR); existing runner README (drain-and-fence description lives here per
  AUDIT §8); WP2 metric dictionary.

**Deliverables**

1. Runner operator runbook: scope-off/on, safe delete ("scope-off → wait
   idle → delete" or the WP3 equivalent), mid-task unload, lease/credential
   recovery, worktree-cap pressure, quarantine handling (WP4).
2. ADR log: queue-fairness (WP6), unload semantics (WP3), shadowing
   (already implemented — record as-is), poison policy (WP4).
3. Past-ADR conformance note: 0009 (claim epochs), 0010 (burn caps), 0012
   (update floor), 0014 (impromptu priority) — still matching (AUDIT §8).
4. Skills matrix (AUDIT §5 table) committed as the per-project skills
   contract; rename-test record (synthetic non-`kainbain` slugs, 187 green)
   filed so Q5 never needs re-proving from scratch.

**Acceptance**

- A new operator can load/unload/delete/scope a project and handle each
  WP5 drill from the runbook alone.
- Zero code change in this WP (docs/config only) — any behaviour gap found
  while writing becomes a new ticket, not scope creep here.

**Blocked by:** WP1 + WP3 + WP4 + WP5 outcomes. Starts last.

**Slice into tickets:** (a) runbook; (b) ADRs + conformance note;
(c) skills contract + rename record. All parallelisable.

**Effort signal:** small. Writing only.

---

## What was deliberately left OUT (no WP)

- **Skills overlay rework (Q6):** AUDIT PASS with 55 + injection + curation
  suites green across shadowed/unshadowed/missing/invalid/oversized cases.
  No WP; the WP7 contract-doc pins the behaviour.
- **Hard-coding purge (Q5):** zero true assumptions found; §4 dispositions
  stand. No WP; WP1's explicit-`projectId` rule prevents the only
  adjacent smell (default-tenant fallback) from becoming one.
- **Switch-without-interruption (Q1) and single-queue collapse (Q2):**
  mechanisms verified + tested (`noDoubleDispatch`, `centralQueueFairness`,
  `scanClaimableTasks`, caps suites). No WP except the conditional WP6.
- **Synthetic-test infrastructure (Q7):** backstop + seams verified working
  (187 green, contamination clean). No WP; every WP above reuses it.

## Suggested ticket order (critical path)

```
WP1 ─┐
WP2 ─┼──▶ WP3 ─┬──▶ WP5 ─▶ WP6? ─▶ WP7
WP4 ─┘         │
     (WP2+WP3+WP4 feed WP5; WP1 gates WP5's validity)
```

Minimum launch sequence for "start developing apps" (AUDIT's small-scale
verdict already covers this): WP1 → WP3 → WP4(ADR) → WP7-runbook-lite.
Full production-scale claim additionally requires WP2 → WP5, with WP6 only
on WP5 evidence.
