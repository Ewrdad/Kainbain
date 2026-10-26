# Migration Plan Review — `MigrationPlan.md` (Portability)

> **Scope:** Review of [MigrationPlan.md](MigrationPlan.md) (2026-10-26) against [RiskAssessment.md](RiskAssessment.md), [NewArchitecture.md](NewArchitecture.md), [HandNotesOnParallelism.md](../HandNotesOnParallelism.md), [Deliverables.md](../Deliverables.md), ADR 0006 (`adr/0006-git-workspace-isolation.md`), `PORTABLE_DEPLOYMENT.md`, and the cited code under `api/`.
> **Status:** Review complete; findings open for the plan author.
> **Date:** 2026-10-26

## Verdict

The plan is a sound strangler migration and is faithful to the phased, gated delivery that RiskAssessment §7 prescribes: never build multi-Runner before single-Runner-over-the-wire parity, every phase leaves a working revertible system, kill criteria are concrete and testable. The "Current vs Target" claims were spot-checked against the code and are accurate (see below).

The issues found are mostly **internal-consistency gaps between the plan and its own decision register**, plus **one topology case the target lifecycle cannot serve** (local-only repositories). None are fatal; all are fixable with edits to the plan, not the architecture.

## Verified claims (spot-checked against the code — accurate)

- `api/index.js` is the composition root (`ProjectStore`, `taskStore`, `sessionStore`, `createAgentRunner`, `eventBridge`) and serves `frontend/dist` **same-origin** (`api/index.js:224-227`). Relevant to P5.
- `api/flow/executionQueue.js`: single `active` latch with `highQueue`/`normalQueue`, as stated.
- `api/aliasSelector.js`: smooth weighted round-robin, in-memory counters keyed `projectId:aliasName`; the header itself notes per-process counters are "statically correct, not exact across instances — acceptable for quota balancing". Relevant to P4.
- ADR 0006 (`adr/0006-git-workspace-isolation.md`): quarantine default, `workspaceIsolation: 'worktree'` opt-in per project, `withRepoGitLock` serialisation — matches the normalisation in `api/projectStore.js:299-303` (default `quarantine`).
- `docker-compose.yml`: single `kainbain:latest` service with `./projects:/workspace/projects` bind mount, as stated.
- `PORTABLE_DEPLOYMENT.md` Scenarios A/B/C exist (plus a Scenario D the plan does not mention — see P1). `scripts/storage-sanity.mjs`, `npm run test:unit`, `npm run test:canary`, `api/agent/harnessContract.js`, `api/agent/sessionContract.test.js`, and `api/agent/logStream/` all exist as cited.
- HandNotes p.2 ("1 Runner … ^ current") and p.5 (priority-ordered alias flow: P1 → P2 → "Runner can't take job") match the plan's citations, including the doc-vs-hand-notes disagreement on alias semantics.

## Significant issues

### P1 — Local-only (no-remote) repositories break the target lifecycle; unaddressed

**Where:** MigrationPlan Phase 2 (claim/fencing/completion design and monitors); NewArchitecture "Lifecycle of a runner" steps 5/11; RiskAssessment R01/R02.

**Why it matters:** The Phase 2 model assumes clone-from-origin → worktree → push → "backend verification of pushed SHA reachable before marking complete", and the cross-phase monitors make "completed stage with unreachable SHA" a pageable-zero metric. But the current system treats remote-less repositories as first-class: `api/git/remote.js` `pushBranchIfRemote` explicitly returns `{ pushed: false, skipped: 'no-remote' }` for pure-local repos, and PORTABLE_DEPLOYMENT Scenario D ("bring your existing repositories") welcomes arbitrary existing repos, including local-only ones. For a repo with no remote there is nothing to clone, nothing to push, and no SHA to verify — so the completion, fencing, and reconciler story (D2, R01, R02) has no answer for them.

**Fix:** Either (a) specify a local-transport variant for the loopback Runner — adopt/share the repo path, completion verified by branch presence plus a backend fetch — or (b) declare remotes mandatory, which changes user-visible behaviour for existing local-only installs and therefore violates the plan's own Goal ("without changing user-visible behaviour"). This decision also has to answer the related loopback question the plan never asks: does the Runner clone from origin, clone from the backend's mounted `./projects` path, or adopt the repo in place? Each is a different D10/R02 answer, and Phase 2's "git clone to Runner projects folder" currently pre-commits one without saying which.

### P2 — Phase 0's blocking gate demands an artefact that does not exist

**Where:** MigrationPlan Phase 0 check-in gate ("Every risk R01–R16 names the phase that retires it"); RiskAssessment §7 Phase 0 exit.

**Why it matters:** Neither the plan nor RiskAssessment §6 contains a risk→phase retirement mapping. The risks carry Prevention/Detection/Response/Ladder/Test but no "retired in Phase N"; §7's phase exits name only R01 and R04 (Phase 2) and the chaos suite (Phase 3). R02, R05–R07, R09–R16 have no named retiring phase anywhere. As written, the Phase 0 gate cannot be passed — the deliverable it demands has not been produced.

**Fix:** Add the R01–R16 → phase retirement matrix to Phase 0's deliverables (it is the cheapest artefact in the programme and makes the gate checkable).

### P3 — D6 is dropped from decision tracking

**Where:** RiskAssessment §4 (D6 "blocks Phase 2") vs MigrationPlan Phase 0 priority order (D1+D2, D10, D3, D4+D9, D8) and "Risks / Open Questions" (D1, D2, D3, D5, D7).

**Why it matters:** D6 — source-of-truth reconciliation: when the backend re-reads repo state after a Runner push, and the cache-invalidation rule — blocks Phase 2 per the register, and Phase 2's reconciler work depends on it. But D6 appears in neither the Phase 0 priority list nor the plan's open-questions list, so nothing in the plan schedules its decision.

**Fix:** Add D6 to the Phase 0 priority list and the open-questions list, with its decision point named (Phase 2 build, per the register).

### P4 — Phase 3 pre-commits the D3 answer that Phase 0 is supposed to decide

**Where:** MigrationPlan "Current vs Target" (alias row: "conflicts with hand notes (priority-ordered). Unresolved") and Phase 0 (D3 to be decided) vs Phase 3 work ("Decide alias semantics centrally (deterministic weighted selection…)").

**Why it matters:** The plan flags the architecture-doc-vs-hand-notes disagreement as unresolved and assigns it to Phase 0's D3, but Phase 3's wording already names the winner (deterministic weighted selection — the architecture doc's position, not the hand notes' priority-ordered fallback). If D3 is genuinely open, Phase 3 should stay neutral; if the plan intends weighted selection, the table should say "proposed, pending D3". Related input the plan does not cite: `aliasSelector.js`'s header already treats per-process counters as acceptable, so centralising selection in the backend is feasible by reuse — but counter semantics (in-memory per-process vs central) should be an explicit part of D3, not just routing authority.

**Fix:** Keep Phase 3's alias wording conditional on the D3 outcome, and add counter semantics to D3's option list.

### P5 — Phase 1's "single-port or document the two-port change" escape hatch conflicts with the Goal

**Where:** MigrationPlan Goal ("without changing user-visible behaviour") vs Phase 1 work ("Keep single-port UX or document the two-port change explicitly").

**Why it matters:** Today the frontend is served same-origin from the API process, with the eventBridge/SSE stream on that origin (`api/index.js:224-227`). Splitting into `frontend` + `backend` Compose services either keeps same-origin via a reverse proxy or becomes a two-port + CORS/proxy change. The latter is a user-visible behaviour change — exactly what the Goal forbids — so "document the two-port change" is not an acceptable outcome under the plan's own terms.

**Fix:** Commit in Phase 1 to a same-origin topology (reverse proxy, or a frontend container that proxies `/api` and the event stream to the backend) and treat any two-port outcome as a Goal violation requiring a Goal amendment, not a documentation note.

### P6 — "Value if stopped at Phase 1: most of the portability deliverable" overstates Phase 1

**Where:** MigrationPlan Phase 1 ("Value if stopped here"); echoed in RiskAssessment §7 Phase 1.

**Why it matters:** Deliverables.md's firm deliverables are: open-sourceable, runnable on almost any machine, and **multithreading on agent tasks** (Priority 1). Phase 1 (containerise, embedded runner) delivers none of the three — the plan's own table notes PORTABLE_DEPLOYMENT Scenarios A/B/C already work today. The native-Runner packaging arrives in Phase 2; multithreading only in Phase 3.

**Fix:** Reframe Phase 1's value as risk reduction plus an independently shippable packaging improvement, and state plainly that the headline deliverables land in Phases 2–3, so the programme does not declare victory at Phase 1.

## Smaller issues

- **S1 — No rollback rehearsal in any gate.** R16's mitigation is "rehearsed, not improvised" and the plan asserts "Rollback = return to previous phase topology, rehearsed" — but no check-in gate includes actually rehearsing a rollback. Add a rollback rehearsal to at least the Phase 1 and Phase 2 gates.
- **S2 — Onboarding approve/deny UI is unassigned.** Phase 2 requires "per-Runner token + human approval even on loopback" and Phase 0 sketches the join → UI approve/deny handshake, but no phase lists building that UI (Phase 3's UI work is queue layouts + the Runners settings screen). The Phase 2 R04 gate ("human-approved" identity) depends on it, so it must be an explicit Phase 2 deliverable.
- **S3 — Frontend↔backend version skew is unaddressed.** D7 covers Runner↔Backend protocol versioning, but splitting one image into two creates a frontend↔backend skew axis that did not exist before; Phase 4's "fleet version matrix in UI" covers Runners only. Add a frontend/backend compatibility statement to Phase 1 or 4.
- **S4 — Monitors are not phase-scoped, and cutover of in-flight work is not operationalised.** The cross-phase table includes claim-conflict and stale-push metrics that are meaningless before Phase 2; the plan should say which monitors activate in which phase. "Completed stage with unreachable SHA" (pageable-zero) has no named alert owner. And although R16 says "cutover only at stage boundaries with no in-flight stage owned by the old path", no phase gate includes a drain-the-queue step before a topology change — relevant already at Phase 1, where `./projects` state moves across a container boundary.

## What the plan gets right (retained without reservation)

- **Strangler sequencing with blocking gates and kill criteria** — exactly what RiskAssessment §7 prescribes; a phase cannot be declared done on enthusiasm.
- **Fencing over leasing.** The Phase 2 insistence on a monotonically increasing fencing token checked at completion *and* at the push path (epoch-branch or backend-verified SHA) is the correct reading of R01/R02 — a lease alone does not fence a direct `git push`.
- **Reconciler + pageable-zero metric.** "Completed stage with unreachable SHA" as a pageable-zero, and divergence → `interrupted` (never silent force-push), is the right R02 response.
- **Honest risk acceptance.** R03 (backend SPOF accepted, documented, replica-ready — "do not pretend otherwise") and R05 (executor-fleet supply chain, Runner-side allowlist mandatory) are stated plainly rather than papered over.
- **Reuse over rewrite.** The named reuse list (harness contract, alias grammar, prompt curation, log streamer, storage-sanity gate) matches artefacts that verifiably exist.
- **The alias disagreement is surfaced, not hidden.** Flagging the doc-vs-hand-notes conflict as unresolved is the right instinct — the problem is only that Phase 3 then pre-commits the answer (P4).

## Suggested next edits (summary)

1. **P1:** Decide and document the local-only-repo story (local-transport variant vs mandatory remote) and the loopback clone topology; fold into D10/D2.
2. **P2:** Add the R01–R16 → phase retirement matrix as an explicit Phase 0 deliverable.
3. **P3:** Restore D6 to the Phase 0 priority list and open-questions list.
4. **P4:** Make Phase 3's alias wording conditional on D3; add counter semantics to D3's options.
5. **P5:** Commit Phase 1 to a same-origin proxy topology; reclassify two-port as a Goal amendment.
6. **P6:** Reword Phase 1's "value if stopped here" to risk reduction + shippable packaging.
7. **S1–S4:** Add a rollback rehearsal to the Phase 1/2 gates; assign the onboarding approval UI to Phase 2; add a frontend/backend compatibility note; phase-scope the monitors and add a cutover drain step.

---

#project/kainbain #review #portability #migration
