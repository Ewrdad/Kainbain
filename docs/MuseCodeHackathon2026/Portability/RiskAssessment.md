# Risk Assessment — New Portable Architecture (Runner Paradigm)

> **Scope:** [NewArchitecture.md](NewArchitecture.md) + `NewArchitecture.excalidraw` (2026-10-25), assessed against [EscalationLadder.md](~/projects/kainbain/docs/Reliability&Risk/EscalationLadder.md), [HandNotesOnParallelism.md](~/projects/kainbain/docs/MuseCodeHackathon2026/HandNotesOnParallelism.md), [MuseIntegrationSpike.md](~/projects/kainbain/docs/MuseCodeHackathon2026/MuseIntegrationSpike.md), [Deliverables.md](~/projects/kainbain/docs/MuseCodeHackathon2026/Deliverables.md), `KB Architecture.md`, `PORTABLE_DEPLOYMENT.md`, `Disaster Model Plan.md`, ADRs 0001–0007, and the risk template in `Reliability&Risk/RiskRegister/Template.md`.
> **Status:** Replaces the 2026-10-25 first-pass assessment (see §2 for the critique of that pass). Draft for decision, not yet accepted.
> **Method:** Template scoring — Impact = max(C, I, A) on 1–4, Likelihood 1–4, Score = Impact × Likelihood (1–16). Every risk also carries a **residual score**: the score that remains *if* its stated Prevention is actually built and tested. Likelihood means "likelihood if shipped exactly as documented today," not likelihood in the current single-process system.

---

## 1. Executive summary

The proposal splits one supervised process into three trust and failure domains: a Docker-Compose frontend, a Docker-Compose backend ("Engine": prompt curation, queue, project/task state, runner gateway), and N native Runner binaries that discover local harnesses, clone repos, create git worktrees, run harness sessions, and commit/push. The default install (backend + frontend + one local Runner) must reproduce today's behaviour exactly.

**Verdict: direction is sound, design is not yet buildable as specified. Overall inherent risk HIGH; residual risk MEDIUM if — and only if — the Phase gates in §7 are treated as blocking.**

Three judgements drive everything below:

1. **The two correct calls are already made.** Runners native (harness CLIs, git auth, worktree I/O do not containerise faithfully) and repo-as-source-of-truth retained. Neither should be re-litigated.
2. **The document names its dangers but specifies none of the mechanisms that retire them.** Authentication, mutual exclusion, failure detection, capability routing, push/report ordering, and version compatibility are all "need to explore." In a single-process system these are internal invariants the runtime enforces for free; in this design each becomes a protocol that must be designed, versioned, and tested. That gap — not any single bug — is the risk.
3. **The escalation ladder is the sharpest lens on the cost.** Distribution does not just add failure modes; it *reprices recovery*. Steps 1–3 (scripted retry, agent-led recovery, interrupt/resume) are cheap today because one supervisor owns the session, the queue, and the filesystem. Split across processes and hosts, the same faults land at steps 5–7 unless lease/fencing, heartbeat, and idempotent completion are built *first*. §5 quantifies this shift; §6 assigns every ladder step an owner.

**Recommendation:** strangler migration, four gated phases (§7). Do not build multi-Runner until single-Runner-over-the-wire has proven parity. The first phase (containerise, keep the embedded runner) captures most of the portability deliverable at a fraction of the risk and should be shippable on its own.

### Risk register at a glance (inherent → residual)

| # | Risk | Score | Residual | Ladder start (unmitigated → mitigated) |
|---|------|-------|----------|----------------------------------------|
| R01 | Double-claim and unfenced git push | 12 | 4 | 5 → 1 |
| R02 | Repo-as-truth consistency: dual writers, push/report ordering | 12 | 6 | 5 → 3 |
| R03 | Backend SPOF and single-writer bottleneck | 12 | 8 | 7 → 7 |
| R04 | Unauthenticated Runner→Backend channel | 12 | 4 | 9 → 1 |
| R05 | Backend→Runner code execution and prompt/skill supply chain | 12 | 8 | 9 → 6 |
| R06 | Escalation-ladder repricing / recovery-ownership vacuum | 12 | 6 | 5 → 3 |
| R07 | Capability and alias misrouting (incl. harness version drift) | 12 | 4 | 4 → 1 |
| R08 | Partition, zombie Runner, and lost mid-stage work | 9 | 6 | 3 → 3 |
| R09 | Secrets and git-credential sprawl; loss of attribution | 9 | 6 | 9 → 6 |
| R10 | Git worktree, clone, and disk contention; cleanup races | 9 | 4 | 3 → 1 |
| R11 | Version and protocol skew (backend / Runner / harness) | 9 | 6 | 7 → 6 |
| R12 | UI concurrency; steering and approval misrouting | 9 | 6 | 6 → 1 |
| R13 | Cost, quota, and compute runaway; priority starvation | 9 | 6 | 6 → 1 |
| R14 | Observability fragmentation; log ordering and completeness | 8 | 4 | 6 → 1 |
| R15 | Portability regressions defeat the portability goal | 6 | 4 | 1 → 1 |
| R16 | Migration, cutover, and rollback failure | 6 | 3 | 8 → 3 |

Residual scores assume the Prevention in each section is implemented *and covered by the named test*. A mitigation that exists only as prose earns no residual credit.

---

## 2. Critique of the first-pass assessment (what this document fixes)

The first pass (805 lines, 12 risks) was a good launching point: it found the right headline risks (SPOF, locking, auth, ladder shift, alias routing, worktrees), used the project template, and recommended a phased strangler. It is replaced, not patched, because of the following defects:

1. **Score inflation destroyed prioritisation.** Four risks scored 12 and one scored 16, with Likelihood 4 ("almost certain") asserted for seven risks without evidence. When everything is Likelihood 4, nothing is. R01's 16 required both Impact 4 *and* Likelihood 4 for a backend that is already a single point of failure today — it scored the *pre-existing* condition, not the *delta* this architecture introduces. This pass separates inherent delta from pre-existing exposure and cuts unjustified 4s.
2. **It treated a lease as a lock.** Its R02 fix ("claim returns a lease; Runner must hold lease to push") does not fence the actual write: the Runner pushes to the git remote directly, and a partitioned "zombie" Runner whose lease expired can still push after a second Runner has completed the task. A lease without a fencing token checked *at push/completion time* is advisory. Corrected in R01/R02/R08.
3. **It modelled trust in only one direction.** It covered rogue Runners attacking the backend, but not the reverse — and the reverse is the larger blast radius. The backend ships curated prompts and skill bodies to Runners that execute harness sessions (per the Muse spike, under an operator-chosen allow-all/YOLO posture). A compromised backend, or prompt injection from untrusted repo/task content, is remote code execution on *every* Runner host. Added as R05.
4. **It missed the second source of truth.** "Repo as source of truth" plus "Runner pushes to origin" plus "backend writes task/project files" is three writers with no stated transaction or ordering between *push succeeded* and *completion reported*. The first pass praised the invariant without stress-testing it. Added as R02.
5. **One ladder step per risk, presented as a property of the risk.** In reality the ladder start depends on which mitigations exist (its own text admitted this for R02/R03, then still printed a single number in the summary table, where it will be quoted out of context). This pass prints unmitigated → mitigated pairs everywhere.
6. **Missing risk classes entirely:** cost/quota runaway and priority starvation under parallel burn (the ladder's second goal is explicitly *minimise token burn*, yet the first pass never scored the risk that most directly attacks it); migration/cutover/rollback; harness *version* drift within "capability" (a Runner "has Muse" at the wrong version is not capable); steering/approval delivery to a specific live session; and the self-defeating risk that install complexity kills the portability deliverable it exists to serve. Added as R12–R16.
7. **Unverifiable specificity.** It cited precise internals (function names, test files, line-level behaviours) as load-bearing evidence for scores without distinguishing "verified in the cited doc" from "plausible inference." This pass keeps citations at the level of the documents actually in scope and flags inferences as inferences.
8. **Recommendations had no exit criteria.** "Implement lease/claim" is a task, not a gate. §7 restates the phases with pass/fail exit criteria and explicit kill criteria, so a phase cannot be declared done on enthusiasm.

What is deliberately retained: the CIA template, the ladder framing, the phased strangler recommendation, and the per-risk Prevention/Detection/Response shape. The first pass structured the problem well; it scored and closed it too optimistically.

---

## 3. Threat model and trust boundaries (new — absent from both prior docs)

Actors and what they can do if the channel is built as currently specified ("register, request task, receive prompt, push, report complete"):

| Actor | Reach today (as specified) | Boundary that must exist |
|-------|---------------------------|--------------------------|
| Rogue host on the network | Register as a Runner, claim tasks, receive prompts/skills, push commits | Authenticated, approved, project-scoped Runner identity (R04) |
| Compromised / malicious Runner | Exfiltrate task content, push arbitrary commits, hold leases hostage, burn quota | Least-privilege scope, revocable identity, push fencing, per-Runner budget (R01, R04, R13) |
| Compromised backend | Execute arbitrary harness sessions on every Runner host | Runner-side execution policy: project allowlist enforced *by the Runner*, skill/prompt provenance, sandbox posture (R05) |
| Untrusted repo / task content | Prompt-inject the agent via task text, repo files, skills | Treat all task/repo content as untrusted input to an executor; curated-prompt boundary documented (R05) |
| Honest-but-dead Runner | Stall a task indefinitely; push late after re-dispatch | Lease + heartbeat + fencing token (R01, R08) |
| Honest-but-old Runner | Mis-execute new stage shapes silently | Version handshake, protocol versioning (R11) |
| Operator error | Duplicate tasks from a desynced UI; steer the wrong session | Backend-authoritative UI, ownership-routed steering (R12) |

Two properties follow. First, **the Runner is an executor, not a client**: any design review that treats it as a thin API consumer will under-secure it. Second, **git is part of the trusted computing base**: whoever can push can land code that later stages execute. Backend-side checks that are not also enforced at push/completion time do not exist as far as the remote is concerned.

---

## 4. Decisions that must be taken before build (decision register)

These are not risks; they are unspecified decisions that *generate* risks. Each blocks the phase noted. Leaving any of them "to explore" during implementation converts a design decision into an emergent behaviour.

| ID | Decision | Options (summary) | Blocks |
|----|----------|-------------------|--------|
| D1 | Mutual exclusion | Backend lease + fencing token vs static sharding | Phase 2 |
| D2 | Completion atomicity | Push-then-report with idempotent reconciliation vs backend-mediated push | Phase 2 |
| D3 | Alias routing authority | Backend-routed (Runner advertises capability) vs Runner-routed | Phase 2 |
| D4 | Runner identity | Per-Runner token + human approval vs shared secret vs mTLS | Phase 2 (remote: Phase 3) |
| D5 | Session ownership | Steering/approval/pause routed via backend to owning Runner; behaviour when owner is offline | Phase 3 |
| D6 | Source-of-truth reconciliation | When backend re-reads repo state after a Runner push; cache invalidation rule | Phase 2 |
| D7 | Protocol versioning | Versioned Runner API + compatibility window + upgrade policy | Phase 2 |
| D8 | Global budget authority | Who can stop parallel burn: per-Runner, per-project, global caps | Phase 3 |
| D9 | Runner-side execution policy | Allowlist, skill provenance, sandbox/YOLO posture per Runner | Phase 3 |
| D10 | State ownership split | Diagram shows "Mounted Projects folder" (backend) *and* "Loaded Projects" per Runner: which writes win, and how do they converge? | Phase 1 |

D10 deserves emphasis: the Excalidraw diagram and the lifecycle text do not currently agree on a single-writer story for project/task state. Resolving D10 on paper is the cheapest risk reduction available in the whole programme.

---

## 5. Escalation-ladder analysis

The ladder (cheapest first): **1** scripted in-task recovery → **2** agent-led recovery → **3** interrupt/resume → **4** retry stage → **5** fail back to earlier stage → **6** request human, keep running → **7** halt task, keep others → **8** halt all, restart → **9** halt all, wait for human. Its stated goals, in order: minimise human intervention, minimise token burn, then prevent misaligned behaviour / wasted compute / network exposure.

### How distribution reprices each step

| Step | Today (single process) | As proposed (unmitigated) | Mechanism of the shift |
|------|------------------------|---------------------------|------------------------|
| 1 Scripted | Default path; supervisor retries in-process | Must be re-implemented identically in every Runner, on every OS | No shared supervisor; correctness is now N implementations |
| 2 Agent-led | Agent sees engine-surfaced errors | Roughly unchanged | Agent still co-located with its harness session |
| 3 Interrupt/resume | `session/resume` against a live supervised host | Session dies with its Runner; "resume" becomes re-dispatch and loses mid-stage context | Session ownership moved to the least reliable component |
| 4 Retry stage | Re-queue locally | Works, but costs a full re-claim + re-clone/pull cycle | Retry is now network- and git-priced |
| 5 Fail back | Rare | More frequent: push conflicts, capability rejects, divergent stage history | Every cross-Runner race resolves here |
| 6 Request human | Rare | More frequent: version skew, log gaps, stale credentials, budget trips | Heterogeneity surfaces as operator work |
| 7 Halt task | Rare | Backend stalls and zombie tasks land here by default | No failure detector specified |
| 8 Halt all / restart | Very rare | The only specified remedy for backend failure | SPOF with no failover story |
| 9 Halt all / wait | Very rare | New realistic class: auth bypass, credential leak, supply-chain execution | Trust boundaries that did not exist before |

**Net effect:** unmitigated, mean-time-to-human-intervention falls and expected token burn per completed task rises (re-dispatch restarts stages from scratch; failback loops across Runners can re-burn the same stage repeatedly). That is a direct regression against the ladder's two primary goals, and it should be stated that plainly in any go/no-go decision.

### Ladder-ownership matrix (the artefact R06 requires)

| Step | Owner after distribution | Signal that triggers it |
|------|--------------------------|-------------------------|
| 1 | Runner (harness-local retry) + Backend (claim retry, backoff) | Harness error; claim conflict (409) |
| 2 | Runner (in-session agent) | Agent-observable failure mid-run |
| 3 | Backend (lease expiry → re-dispatch) | Heartbeat missed beyond lease TTL |
| 4 | Backend (stage reset, new claim) | Runner reports stage unrecoverable |
| 5 | Backend (workflow regression) | Push/fencing conflict; stage verdict fail |
| 6 | Backend → UI (request, keep running) | Budget threshold; reliability threshold; log gap |
| 7 | Backend → UI (halt one task) | Retry exhaustion; unresolvable git state |
| 8 | Operator (restart/redeploy backend) | Backend health failure |
| 9 | Operator (security incident) | Auth bypass; credential leak; malicious push |

No ladder step may have two owners or none. Any failure mode that cannot be placed in this table is an unspecified recovery, and unspecified recoveries default to step 9 in practice — a human noticing.

---

## 6. Detailed risks

### R01 — Double-claim and unfenced git push

**Score: 12 (C1 · I3 · A2 × L4) → Residual: 4**

Two Runners polling the same queue *will* eventually claim the same task if claiming is not atomic — the architecture doc concedes the mechanism is unexplored. The subtler failure survives the obvious fix: Runner A is partitioned, its lease expires, Runner B completes the task, then A reconnects and pushes. A backend lease does not fence a direct `git push`; the remote accepts A's late, divergent history. Consequences: competing worktrees and commits, a failed or forced push, and stage history recording two contradictory outcomes for one execution.

- **Prevention:** atomic claim (`POST /tasks/:id/claim` → 200 + lease or 409); every claim carries a monotonically increasing **fencing token / execution epoch**; completion and any backend-mediated acceptance check the token, and the push path must be fenced too — either backend-mediated push, or a pre-receive check / branch naming that encodes the epoch so a stale Runner's push is rejected by construction. Idempotent completion keyed by a stable execution ID so a retried report is a no-op, not a duplicate.
- **Detection:** claim-conflict rate (any sustained non-zero rate outside deploys is a defect); rejected stale-epoch pushes; divergent stage-history check on completion.
- **Response:** losing execution's worktree is discarded; if a stale push landed, fail the task back for reconciliation (step 5) — never silent force-push.
- **Ladder start: 5 → 1.** Unmitigated, reconciliation needs an earlier stage; with claim + fencing, a conflict is a scripted 409/backoff, invisible to the user.
- **Test that earns the residual:** two Runners, one task, forced partition of the first mid-stage; assert exactly one completion is accepted and the stale push is rejected.

### R02 — Repo-as-truth consistency: dual writers, push/report ordering

**Score: 12 (C1 · I4 · A2 × L3) → Residual: 6**

The retained invariant — repo is source of truth, database is cache only — was safe when one process wrote the files. The proposal creates three writers (backend task/project files, Runner git operations, the git remote) and specifies no ordering between "push succeeded" and "completion reported," nor when the backend re-reads repo state after a push. Both orderings fail differently: report-then-push-crash leaves the backend believing work exists that the repo lacks; push-then-report-crash leaves repo work the backend will re-dispatch and duplicate. The diagram's "Mounted Projects folder" (backend) alongside per-Runner "Loaded Projects" (D10) makes the write-ownership question concrete and currently unanswered.

- **Prevention:** decide D2/D6/D10 explicitly. Completion must be reconcilable from the repo alone: the completion report references the pushed commit SHA, the backend verifies that SHA is reachable before marking the stage complete, and a boot/periodic reconciler repairs report/push divergence in either direction.
- **Detection:** reconciler divergence counter; "completed stage with unreachable SHA" must be a pageable-zero metric.
- **Response:** divergence → stage returns to interrupted (step 3) for re-dispatch or reconciliation, not to a human with a corrupted history.
- **Ladder start: 5 → 3.**

### R03 — Backend single point of failure and single-writer bottleneck

**Score: 12 (C2 · I4 · A4 × L3) → Residual: 8**

Every Runner polls, reports, and pushes metadata through one backend, which is also sole writer of queue and task state and sole server to the UI. Backend down means all Runners idle and the board empty; backend degraded means the queue degrades for everyone at once. Note the honest scoping the first pass missed: this is largely a *pre-existing* condition, not a new one. The delta this architecture adds is blast radius (N Runners' in-flight work now depends on it) and contention (N pollers/reporters against a write path designed for one process). It is scored on that delta, hence Likelihood 3, not 4.

- **Prevention:** durable queue/lease state (no in-memory-only dispatch state); atomic file writes; poll backpressure (long-poll or push with jittered backoff — N Runners must not be able to DDoS their own engine, especially in a thundering herd after a backend restart); a documented consistency model instead of "keep an eye on it."
- **Detection:** health endpoint exposing queue depth, dispatch latency, connected/idle Runner counts; alert on oldest-waiting-task age, not just up/down.
- **Response:** restart with transactional recovery that re-queues in-flight work as *interrupted*, never as *failed* and never as *complete*.
- **Ladder start: 7 → 7.** This is the one risk mitigations do not cheapen: a dead backend halts tasks until it returns (step 8 in the common case). The residual stays high deliberately — the honest mitigation is accepting and documenting it for current scale, with the consistency design kept replica-ready.

### R04 — Unauthenticated Runner→Backend channel

**Score: 12 (C4 · I4 · A3 × L3) → Residual: 4**

"Implement some sort of easy authentication" is currently the entire specification for a channel that hands out curated prompts, receives stage completions, and — via pushes — lands executable code. Any host that can reach the backend can register, claim work, exfiltrate task/skill content, and push commits that later stages execute. Likelihood is conditional and stated honestly: negligible on a loopback-only default install, high the moment a remote Runner is permitted — which is the stated purpose of the design.

- **Prevention:** per-Runner cryptographic identity issued at registration, human-approved (UI/CLI), project-scoped, revocable and rotatable; backend loopback-only by default with remote access an explicit, authenticated opt-in; least-privilege scopes (claim/report only for allowlisted projects).
- **Detection:** audit log keyed by Runner identity on every claim/report/push; alert on unknown identity or one identity appearing from multiple origins.
- **Response:** revoke identity → leases expire → work re-queues. A landed malicious push is a security incident (step 9), not a retry.
- **Ladder start: 9 → 1.** Mitigated, a bad request is a logged rejection; unmitigated, it is halt-everything.
- **Test that earns the residual:** unauthenticated and wrongly-scoped requests to every Runner endpoint are rejected; a revoked Runner cannot claim, report, or complete.

### R05 — Backend→Runner code execution and prompt/skill supply chain

**Score: 12 (C4 · I4 · A2 × L3) → Residual: 8**

The direction the first pass missed. The backend curates prompts and skills and dispatches them to Runners that run harness sessions with broad host permissions (the Muse integration operates under an operator-chosen allow-all posture, with repo/task content flowing into prompts). Whoever or whatever controls prompt/skill content — a compromised backend, a malicious project, an injected skill, hostile task text — gets execution on every Runner host, under that host's "Local git auth" (per the diagram). Parallelism multiplies this from one host to the fleet.

- **Prevention:** Runner-side execution policy that does not trust the backend blindly: per-Runner project allowlist *enforced by the Runner*, documented sandbox/approval posture per Runner (with the permissive mode an explicit per-Runner opt-in, never a fleet default), skill provenance (only backend-signed or locally pinned skills execute), and task/repo content explicitly classified as untrusted input in the prompt-curation boundary.
- **Detection:** Runner logs the provenance of every prompt/skill it executes; backend records which skill versions were dispatched to which Runner.
- **Response:** suspect dispatch → halt fleet execution pending human review (step 9 for confirmed compromise; step 6 for suspicion).
- **Ladder start: 9 → 6.** Residual stays elevated: mitigations shrink the surface but an executor fleet is inherently high-impact. This risk, not R03's, is the ceiling on how casually remote Runners should be added.

### R06 — Escalation-ladder repricing / recovery-ownership vacuum

**Score: 12 (C1 · I3 · A3 × L4) → Residual: 6**

This is the meta-risk quantified in §5: the proposal moves session ownership, retry logic, and filesystem state into the least reliable components while specifying no failure detector, no lease, and no owner per ladder step. It is Likelihood 4 not because any single failure is certain, but because *some* recovery path will be exercised by the first real multi-Runner run, and every unspecified one defaults to a human noticing (de facto step 9).

- **Prevention:** adopt the §5 ownership matrix as a design artefact; implement heartbeat + lease + progress reporting as the failure detector it assumes; require every new failure mode to be placed in the matrix before it ships.
- **Detection:** per-step escalation counters (how many tasks reached each ladder step per week) — this metric *is* the architecture's report card and should trend down after each phase.
- **Response:** any step-7+ event gets a written cause and, where possible, a demotion to a cheaper step.
- **Ladder start: 5 → 3.**

### R07 — Capability and alias misrouting (including harness version drift)

**Score: 12 (C1 · I3 · A2 × L4) → Residual: 4**

Heterogeneity is the point of the design, so misrouting is the default outcome unless routing authority is decided (D3). The sources already disagree in embryo: the architecture doc proposes renormalising alias weights over whatever a Runner happens to have, while the hand notes describe priority-ordered per-Runner selection with weighted choice. Those are different systems with different fairness and reproducibility properties; building both halves yields silent misroutes and meaningless reliability statistics. A further subtlety both miss: capability is not boolean. "Has Muse" at an incompatible version, or with a model installed but not credentialed/runnable, is not capability.

- **Prevention:** single authority — backend-routed dispatch over Runner-advertised, *versioned and runnable-checked* capabilities (harness + version + models + runnable flag, refreshed on heartbeat, with staleness expiry). Weighted selection stays deterministic and central so proportions and reliability attribution remain meaningful. A dispatch no connected Runner can serve fails loudly at claim time, never silently degrades to a different model.
- **Detection:** dispatch-rejection rate by alias/harness/version; "capability advertised but stale" count.
- **Response:** rejection → re-select excluding that Runner (step 1); no capable Runner → explicit operator signal (step 6), not a quiet substitution.
- **Ladder start: 4 → 1.**
- **Test that earns the residual:** heterogeneous Runner fleet with overlapping, version-skewed capabilities; assert dispatch proportions, no incapable Runner receives work, and stale advertisements expire.

### R08 — Partition, zombie Runner, and lost mid-stage work

**Score: 9 (C1 · I2 · A3 × L3) → Residual: 6**

Remote (SSH) Runners, reboots, and harness hangs guarantee mid-stage Runner death. Two distinct losses follow: the harness session (unrecoverable across hosts — a new Runner starts the stage's session fresh, which fits "one session per stage" but discards uncommitted mid-stage progress) and the zombie case, where a merely partitioned Runner returns and acts on stale ownership (fenced under R01, disruptive without it). Clock skew between Runner hosts and the backend additionally makes naive timestamp-based leases unreliable; lease logic must rest on backend-issued monotonic epochs/durations, not wall-clock agreement.

- **Prevention:** lease + heartbeat with backend-side expiry; graceful-shutdown and reboot recovery on the Runner (report interrupted; surface orphaned worktrees/unpushed work on startup instead of silently discarding or resuming them); idempotent stage start so re-dispatch is safe.
- **Detection:** claim age vs stage timeout alerting; orphaned-worktree report at Runner startup.
- **Response:** expiry → re-dispatch as interrupted (step 3); repeated partition from one host → halt that Runner's tasks (step 7) without punishing the fleet.
- **Ladder start: 3 → 3.** Correctly handled, this *is* step 3 by design — the risk is only that, unspecified, it silently becomes step 7.

### R09 — Secrets and git-credential sprawl; loss of attribution

**Score: 9 (C3 · I2 · A2 × L3) → Residual: 6**

Every Runner needs provider credentials to drive its harnesses and git credentials to push (the diagram's per-Runner "Local git auth"). Each Runner host is therefore another copy of the fleet's most sensitive material, and rotation must reach N hosts coherently — a Runner on stale credentials fails every stage it claims until noticed. A second, quieter loss: if all Runners push under one shared git identity, the repo history loses non-repudiation — after an incident (R04/R05) it becomes impossible to attribute a push to a Runner.

- **Prevention:** per-Runner credentials, scoped to its allowlisted projects, stored with owner-only permissions, never in compose files or process environments visible fleet-wide; per-Runner git identity so pushes are attributable; prefer short-lived or backend-exchanged credentials where the harness allows it; a documented fleet-wide rotation procedure tested before it is needed.
- **Detection:** per-Runner auth-failure metrics; credential age visible per Runner.
- **Response:** stale credential → stop dispatch to that Runner, signal operator (step 6); confirmed leak → rotate at provider, revoke Runner identities, halt if exfiltration is active (step 9).
- **Ladder start: 9 → 6** (worst case governs the unmitigated rating; routine staleness is step 6 once detection exists).

### R10 — Git worktree, clone, and disk contention; cleanup races

**Score: 9 (C1 · I3 · A3 × L3) → Residual: 4**

Per-task worktrees are the right isolation (consistent with ADR 0006), but the proposal's safeguards are local heuristics in a now-shared environment: "clear old worktrees after a limit (say 5)" with no coordination, concurrent clones/pulls against shared remotes, and N Runners' project copies multiplying disk use. The dangerous cases are cross-Runner: one Runner's cleanup or prune touching state another is using (if any directory is ever shared), and plain disk exhaustion presenting as random git failures. Likelihood is 3 rather than the first pass's 4 because the fix is mostly discipline, not invention — but it must be specified, not hoped for ("hoping preloading resolves this" is the doc's own wording).

- **Prevention:** strictly per-Runner working directories, enforced non-overlapping at registration; no shared filesystem state between Runners; per-repo serialisation of git operations inside each Runner with lock-retry/backoff; disk headroom reported in heartbeat with a dispatch cut-off; cleanup that only ever touches worktrees the same Runner owns and never one with an active claim.
- **Detection:** git lock-contention and disk-headroom metrics per Runner; cleanup actions audit-logged.
- **Response:** contention → backoff/retry (step 1); lost worktree → recreate and resume (step 3); disk-full Runner → dispatch halted for that Runner only (step 7, scoped).
- **Ladder start: 3 → 1.**

### R11 — Version and protocol skew (backend / Runner / harness)

**Score: 9 (C2 · I3 · A2 × L3) → Residual: 6**

Three version axes now drift independently: backend (containerised, centrally upgraded), Runners (native, per-host, upgraded whenever someone remembers), and each host's harness CLIs (the Muse spike documents schema/fingerprint drift between harness releases as an observed fact, not a hypothesis). An old Runner does not fail politely by default — it mis-executes: wrong prompt/skill handling, incompatible log shapes, new stage types mishandled quietly. The default single-host install hides this entirely, so it will be discovered exactly when the fleet grows.

- **Prevention:** version handshake at registration and heartbeat (backend, Runner, and per-harness versions); a versioned Runner API with a stated compatibility window; outside-window Runners receive no dispatch rather than best-effort dispatch; Runner upgrade path (ideally self-update-on-idle) treated as part of the product, not documentation.
- **Detection:** fleet version matrix in the UI with outdated flagging; dispatch refused-by-version counter.
- **Response:** outdated Runner idles with an explicit operator signal (step 6; step 7 only for tasks already stranded on it).
- **Ladder start: 7 → 6.**

### R12 — UI concurrency; steering and approval misrouting

**Score: 9 (C1 · I3 · A2 × L3) → Residual: 6**

The architecture doc concedes the UI assumes one thread. The concrete hazards go beyond rendering: with N live sessions, *steering, follow-up, pause, and human-stage approvals must reach one specific session on one specific Runner*. A steer delivered to the wrong session — or confidently delivered to a dead one — is an integrity fault, not a cosmetic one: the operator believes they redirected work they did not. Concurrent completions also stress ordering assumptions in board updates.

- **Prevention:** backend remains the UI's only source of truth (Runners never address the UI); every interactive command carries the owning Runner/execution identity and is acknowledged by that execution, with unacknowledged commands surfaced as undelivered rather than assumed sent; the multi-Runner queue views sketched in the hand notes are designed before multi-Runner ships, not retrofitted.
- **Detection:** steer/approval acknowledgement latency and failure rate; UI-vs-backend state divergence checks in end-to-end tests with concurrent completions.
- **Response:** undeliverable command → explicit operator signal while other tasks continue (step 6); display desync alone → refetch (step 1).
- **Ladder start: 6 → 1.** (The first pass rated this 1 by considering only display desync; the steering-integrity case governs.)

### R13 — Cost, quota, and compute runaway; priority starvation

**Score: 9 (C1 · I2 · A3 × L3) → Residual: 6**

Absent from the first pass despite the ladder's second goal being *minimise token burn*. Parallelism multiplies spend rate, and the design's own recovery mechanisms become cost amplifiers: re-dispatch restarts stages, failback loops can re-burn a stage across several Runners, and capability-filtered queues can starve low-priority work indefinitely while high-priority work monopolises the only capable Runner — or invert, with an incapable-but-idle fleet polling while one Runner saturates. There is no stated budget authority at any scope.

- **Prevention:** decide D8 — token/cost budgets per task, per project, and fleet-wide, enforced by the backend at dispatch (a Runner cannot claim work that would breach a cap); bounded retry/failback counts with the bounds visible; queue scheduling that is capability-aware *and* starvation-free (ageing), preserving the stated "same queue priority" semantics provably rather than by assertion.
- **Detection:** burn rate per Runner/project/alias with threshold alerts (the ladder's own step-6 example — flagging reliability/budget thresholds early — is the model).
- **Response:** budget trip → request human, keep running within remaining budget (step 6 by design); runaway loop → halt the offending task only (step 7).
- **Ladder start: 6 → 1** for ordinary variance once metering exists (scripted dispatch gating); 6 remains the designed response to a genuine budget decision, which is the ladder working as intended.

### R14 — Observability fragmentation; log ordering and completeness

**Score: 8 (C2 · I2 · A2 × L4) → Residual: 4**

One task's log is now produced on one host, transported over an unreliable channel, and reassembled on another. Unspecified, the failure modes are gaps (Runner dies before flush), duplication (retried ingest), and misordering (concurrent streaming without sequence numbers) — each quietly degrading the artefact operators and later stages reason from. Likelihood 4 because fragmentation is not a possibility but a definition of the topology; impact is capped at 2 because execution itself is unaffected.

- **Prevention:** Runner streams sequenced log entries incrementally (never only at completion); backend assigns the canonical ordering and validates/deduplicates on ingest by execution ID + sequence; Runner keeps a local spill file replayed after a crash; incompleteness is represented in the data ("logs truncated — Runner disconnected"), never papered over.
- **Detection:** ingest validation errors; per-task log-gap indicator.
- **Response:** gap flagged, work continues (step 6 only when the gap blocks diagnosis of a later failure).
- **Ladder start: 6 → 1.**

### R15 — Portability regressions defeat the portability goal

**Score: 6 (C1 · I2 · A2 × L3) → Residual: 4**

The deliverable is "runnable on almost any machine" with easy onboarding. The new default asks a first-time user to run Docker Compose *and* install, register, and maintain a native Runner *and* configure its harnesses, git auth, and working directories. Every host-integration behaviour the current system handles in one process — paths, mounted project folders, git identity, proxy/CA settings, the docs-link states — must now be correct across a container boundary and a process boundary simultaneously. The failure mode is not a crash; it is a new user failing to reach a running system, i.e. the headline deliverable failing silently.

- **Prevention:** the default install is one command that yields backend + frontend + one *working* local Runner with harness detection reporting honestly what it found; Phase 1 (§7) ships containerisation alone first so its regressions are not entangled with distribution regressions; path/state ownership (D10) documented in one place.
- **Detection:** clean-machine install test (fresh VM/container host, no prior state) as a release gate, timed from zero to first completed task.
- **Response:** install-time state problems should self-heal or fail with a named, fixable cause (step 1); anything requiring doc archaeology is a defect against this risk.
- **Ladder start: 1 → 1.**

### R16 — Migration, cutover, and rollback failure

**Score: 6 (C1 · I3 · A3 × L2) → Residual: 3**

Nothing in the proposal describes getting from today's deployment to this one: what happens to in-flight tasks at cutover, whether old and new dispatch can coexist, and how to roll back when (not if) Phase 2 misbehaves in its first real week. A flag-day cutover of the component that runs all work, with no coexistence story, converts every other risk in this document into a simultaneous, irreversible event.

- **Prevention:** the phased plan in §7 *is* the mitigation — each phase leaves the system in a working, revertible state; cutover only at stage boundaries with no in-flight stage owned by the old path; rollback is "return to the previous phase's topology," rehearsed, not improvised.
- **Detection:** phase-exit criteria (§7) checked before the next phase begins; parity metrics (below) compared old-vs-new on the same workload.
- **Response:** failed phase → halt and revert topology (step 8, planned rather than panicked).
- **Ladder start: 8 → 3.**

---

## 7. Phased delivery with gates (replaces an un-gated task list)

Each phase must leave a working, revertible system. A phase is done when its exit criteria pass, not when its code merges.

### Phase 0 — Decisions and protocol sketch (no code)

- Decide D1–D10 (§4); sketch the Runner↔Backend protocol (register, heartbeat, claim, progress, log ingest, completion, error) with versioning and auth; adopt the §5 ladder-ownership matrix.
- **Exit:** every risk in §6 names the phase that retires it; any risk with no owning phase blocks Phase 1.
- **Kill criterion:** if D2/D10 cannot be resolved without a second writable store, stop — the "repo as truth, DB as cache" invariant and this topology are in conflict and the architecture, not the wording, must change.

### Phase 1 — Containerise without distribution

- Backend + frontend in Compose with the *current embedded runner*. No new Runner binary, no new failure modes.
- **Exit:** clean-machine install reaches first completed task; default behaviour parity with the pre-container install on the same workload; path/state behaviour (D10) documented.
- **Value if the programme stopped here:** most of the portability deliverable, at R15-only risk. This phase must be independently shippable.

### Phase 2 — One Runner over the wire (local only)

- Extract the Runner as a separate process on loopback with per-Runner identity (D4), atomic claim + fencing (D1), reconciled completion (D2/D6), version handshake (D7), sequenced log streaming.
- **Exit:** parity suite passes with the Runner out-of-process; the R01 partition test and R04 auth tests pass; killing the Runner mid-stage recovers at ladder step 3 in test; escalation counters instrumented.
- **Kill criterion:** parity requires special-casing the local Runner differently from a remote one — the protocol, not the transport, is wrong.

### Phase 3 — Multi-Runner, heterogeneous, remote

- Capability advertisement and backend-routed dispatch (D3), per-Runner filesystem/disk discipline, steering/approval ownership routing (D5), budgets (D8), Runner-side execution policy (D9), multi-Runner UI.
- **Exit:** chaos suite passes — kill a Runner mid-stage, partition a Runner and let it return, run five Runners on one host, dispatch across version-skewed harnesses; burn-rate and starvation tests pass; steering reaches the owning session in test with concurrent tasks active.
- **Kill criterion:** any chaos case requires a human to restore correctness (as opposed to speed). That is a ladder regression and Phase 3 does not ship over it.

### Phase 4 — Hardening

- Backend durability and backpressure under fleet load; fleet credential rotation rehearsed; off-host backup of project/task state; escalation-counter review feeding demotions of step-6+ events.
- **Exit:** backend restart under load loses no completions and re-queues in-flight work as interrupted; rotation completes with zero stage failures.

---

## 8. What the proposal gets right (retained without reservation)

- **Native Runners.** Correct and load-bearing; do not let a future "just containerise everything" simplification reverse it.
- **Repo as source of truth, DB as cache.** Right invariant — this assessment's R02 is about defending it under new writers, not replacing it.
- **One session per stage, one Runner as one thread.** Maps cleanly onto the new topology and bounds the blast radius of Runner death.
- **Default install mirrors today's behaviour.** The only credible migration story (R16) starts here.
- **The architecture doc names its own dangers.** Every headline risk in §6 is pre-acknowledged in `NewArchitecture.md`. The gap is mechanism, not awareness — which is the best kind of gap to have at this stage.

## 9. Top five decisions for the next review (in order)

1. **D1 + D2 together** — claim, fencing, and completion reconciliation. Everything else is reversible; getting execution ownership wrong is not.
2. **D10** — single-writer story for project/task state across backend mount and Runner copies.
3. **D3** — alias routing authority. Blocks all Runner dispatch work and resolves a live disagreement between the architecture doc and the hand notes.
4. **D4 + D9 together** — Runner identity *and* Runner-side execution policy. Approving one without the other secures only half the channel (R04/R05).
5. **D8** — budget authority. Cheapest to design now, most painful to retrofit once parallel burn is normal.

## 10. Residual position if §7 is followed

Highest residuals after mitigation are R03 (8 — accepted SPOF, documented, replica-ready), R05 (8 — executor-fleet supply chain, inherent to the paradigm), and the 6-band (R02, R06, R08, R09, R11, R12, R13). That profile is a reasonable price for the deliverables (multithreading, run-anywhere, open-sourceable) **provided** Phase 3's kill criteria are honoured. The unacceptable version of this architecture is not any single risk above — it is Phase 3 scope attempted at Phase 1 maturity, which is precisely what the gates exist to prevent.

## References

- [NewArchitecture.md](NewArchitecture.md) and `NewArchitecture.excalidraw` — proposal under assessment (diagram elements: Machine 1/2, UI/API/Engine, Queue Management, Prompt Curation, Mounted Projects folder, Runner 1–3 with Loaded Projects / Git worktrees / Local harnesses / Local git auth)
- [EscalationLadder.md](~/projects/kainbain/docs/Reliability&Risk/EscalationLadder.md) — 9-step ladder, goals, and step 6–7 examples used in R06/R12/R13
- [HandNotesOnParallelism.md](~/projects/kainbain/docs/MuseCodeHackathon2026/HandNotesOnParallelism.md) — queue UI by Runner count, Runner config screen, per-Runner project allowlist, priority/weighted harness routing, Docker-Compose + native-Runner packaging
- [MuseIntegrationSpike.md](~/projects/kainbain/docs/MuseCodeHackathon2026/MuseIntegrationSpike.md) — harness session lifecycle, allow-all posture, harness schema/version drift
- [Deliverables.md](~/projects/kainbain/docs/MuseCodeHackathon2026/Deliverables.md) — multithreading, run-anywhere, open-sourceable
- `Reliability&Risk/RiskRegister/Template.md` — scoring rubric; `Disaster Model Plan.md` — failure domains; `KB Architecture.md`, `PORTABLE_DEPLOYMENT.md`, ADRs 0001–0007 — invariants cited per risk

---

#project/kainbain #risk #portability #architecture


