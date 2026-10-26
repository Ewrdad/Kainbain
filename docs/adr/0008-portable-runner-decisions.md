# ADR 0008 — Portable Runner architecture: Phase 0 decisions (D1–D14)

**Status:** Accepted (MigrationPlan Phase 0 gate, 2026-10-26)
**Date:** 2026-10-26
**Task:** MigrationPlan Phase 0 (paper only; no code in this ADR)
**Context inputs:** MigrationPlan rev 2, RiskAssessment R01–R16, NewArchitecture,
Things-we-can-change list (2026-10-26), YOLO-Plan tiers T0–T3, New Runner
Onboarding flow, HandNotesOnParallelism transcription, Deliverables.

## Context

The single-process engine (one Fastify process in `api/index.js`, in-process
`api/flow/executionQueue.js` single `active` latch, per-process alias counters
in `api/aliasSelector.js`) must split into Docker Compose `frontend` +
`backend` plus N native Runners without changing default single-host
behaviour. RiskAssessment §4 leaves D1–D10 undecided and the October 2026
change list adds D11–D14. An undecided item is not a minor gap: each becomes
an emergent behaviour the first time two writers race. This ADR decides all
fourteen, each with its rejected alternatives. A decision with no recorded
rejection is not decided.

## Decision

- **D1 — Mutual exclusion: backend lease + fencing token (execution epoch).**
  Claim is `POST /tasks/:id/claim` → `200` + lease or `409`. Every claim
  carries a monotonically increasing fencing token issued backend-side
  (never wall-clock: clock skew between hosts makes timestamp leases
  unreliable). The token is checked at completion acceptance AND on the push
  path (remote-backed: epoch-branch naming or backend verification that the
  pushed SHA is reachable before the stage marks complete). Retried reports
  are idempotent on a stable execution ID.
  Rejected: static sharding (inflexible under heterogeneous Runners, wastes
  the one capable Runner while others idle, and cannot express "no capable
  Runner" loudly); advisory lease without fencing (a partitioned zombie
  Runner can still push after re-dispatch — the lease is not the lock).
- **D2 — Completion atomicity: push-then-report + idempotent reconciliation.**
  The Runner pushes first, then reports completion referencing the pushed
  commit SHA; the backend verifies reachability (remote-backed) or
  branch + SHA presence in the backend-visible repo (grandfathered
  local-only, matching `pushBranchIfRemote` `no-remote` semantics in
  `api/git/remote.js`) before marking complete. A boot/periodic reconciler
  repairs push/report divergence in either direction; divergence returns the
  stage to `interrupted`, never silent force-push.
  Rejected: backend-mediated push (makes the backend a git writer, adds a
  credential fan-in path, and cannot serve the loopback adopt-a-path
  transport where there is nothing to mediate).
- **D3 — Alias routing authority and counter semantics: backend-central,
  priority-tiered, renormalised weights.** Dispatch is backend-routed over
  Runner-advertised versioned capabilities (harness + version + models +
  runnable flag, refreshed on heartbeat, staleness expiry — "has Muse" at the
  wrong version is not capable). Within the capable set, the hand-notes
  priority tiers select the candidate tier (P1 before P2) and the
  architecture-doc weighted choice applies *within* the tier, reusing the
  smooth weighted round-robin semantics of `selectAliasTarget`
  (`api/aliasSelector.js`, `shared/modelAliases.js`) — but counters move from
  per-process memory to backend-central deterministic state so proportions
  stay exact and attributable across N Runners. No capable Runner is a loud
  step-6 operator signal, never a silent substitution to another model.
  Rejected: per-Runner/per-process counters (today's behaviour — proportions
  become statistical across processes and reliability stats meaningless);
  pure priority without weights (throws away the alias percent contract);
  silent fallback (misroutes billable inference silently).
- **D4 — Runner identity: per-Runner token + human approval, loopback
  included.** Registration issues a per-Runner identity approved in the UI
  (onboarding handshake steps 4–5: join request, approve/deny, secure
  channel) with project-scoped least privilege, revocable and rotatable —
  from Phase 2, on loopback too, so the auth path is identical everywhere.
  Backend listens loopback-only by default; remote Runner access is an
  explicit authenticated opt-in.
  Rejected: shared secret (no per-Runner revocation, no attribution after an
  incident); mTLS now (operational weight disproportionate to a homelab
  default install — revisit when a real remote fleet exists).
- **D5 — Session ownership: backend-routed, acknowledged, parked when
  offline.** Steering, follow-up, pause, and human-stage approvals travel
  UI → backend → owning Runner + execution, and each command is acknowledged
  by that execution. Unacknowledged commands surface as undelivered; an
  offline owner parks the command with an explicit signal, never a silent
  drop and never delivery to a different session.
  Rejected: direct UI→Runner (bypasses identity, audit, and the firewall
  story); fire-and-forget steering (an operator believing they redirected
  work they did not is an integrity fault, not a display bug).
- **D6 — Reconciliation timing: verify on completion, reconcile on
  boot/interval.** The backend re-reads repo state at completion (the D2
  SHA check) and runs the reconciler at boot plus on an interval; task-cache
  entries are keyed by (project, task, execution epoch) and invalidated on
  completion/progress ingest.
  Rejected: polling-only freshness (the board goes stale exactly when a
  Runner is partitioned); event-only invalidation (a restart drops the very
  events that would have invalided the cache).
- **D7 — Protocol versioning: semver handshake, N-1 window, lockstep UI.**
  Registration and heartbeat carry backend, Runner, and per-harness
  versions; the Runner API is versioned with a stated N-1 minor
  compatibility window. Outside-window Runners receive no dispatch and the
  UI flags them. Frontend↔backend is lockstep (one Compose release pins
  both images); the backend exposes its version on `/status` and a
  mismatched frontend shows an explicit banner instead of failing obscurely.
  Rejected: unversioned protocol (old Runners mis-execute new stage shapes
  quietly); strict-equal-only (the fleet could never roll).
- **D8 — Budget authority: backend-enforced caps at task/project/fleet
  scope.** The backend gates dispatch against token/cost budgets (per task,
  per project, fleet-wide), with bounded retry/failback counts and
  capability-aware, starvation-free (ageing) scheduling that preserves queue
  priority. Burn rate per Runner/project/alias is metered from Phase 2.
  Rejected: per-Runner-only caps (fleet burn unaccounted while N Runners
  multiply spend); no caps (the ladder's second goal is minimise token burn,
  and re-dispatch restarts are burn amplifiers).
- **D9 — Runner-side execution policy: YOLO tiers T0–T3, advertised,
  opt-in.** The YOLO-Plan tier vocabulary is the policy: T0 read-only/plan,
  T1 write inside its worktree, T2 commit/push its task branch, T3
  merge/deploy (never fully unattended — always behind a human stage). A
  Runner advertises the tiers it permits; the permissive tier is a per-Runner
  opt-in, never a fleet default. Every run records its posture (tier,
  harness, approvals mode) from Phase 2. Existing projects grandfather at
  T1 (today's effective containment); T2-for-all is one default change, not
  an implementation fork.
  Rejected: a single boolean flag (cannot express read-only vs push);
  fully-unattended T3 (merges without a verdict/human gate); fleet-default
  permissive (one compromised backend dispatch becomes fleet-wide RCE).
- **D10 — State ownership: backend mounts are authoritative, Runner copies
  converge.** The backend's mounted folder (general config plus master
  project copies, repo-as-truth) is the sole writer of project/task files;
  a Runner's loaded projects are git-operation copies that converge only via
  push + completion report (D2). Only the backend mutates task/project
  state; a Runner mutates only its own worktree and pushes its branch. No
  second writable store exists for task truth — that topology would violate
  the repo-as-truth invariant and is the programme kill criterion.
  Rejected: dual-writer task files (ordering between writers is
  unresolvable); Runner-writes-task-state (same, plus cache-invalidation
  sprawl); a database as second truth (demotes the repo to a view and
  re-litigates the retained invariant).
- **D11 — Project remote requirement: mandatory for new, grandfathered for
  existing.** Project creation validates a fetchable remote and rejects
  without one (clear error naming the missing remote). Existing local-only
  projects keep today's loopback transport (adopt/share the repo path, push
  skipped as `no-remote`, completion verified by branch + SHA presence in
  the backend-visible repo) and are never offered to remote Runners — a
  remote Runner advertises no capability for a repo it cannot fetch.
  Rejected: mandatory for all projects (breaks existing installs and the
  programme Goal); local-only first-class forever (contradicts the newest
  dated decision and leaves clone/push/verify-SHA with no clone source).
- **D12 — Docs residence: curated docs committed in-repo, optional outward
  mirror.** Runners on other machines must read curated docs, which a
  host-local symlink-out cannot provide. Curated docs are tracked in-repo;
  the backend may offer an opt-in outward mirror symlink to a central store
  for users who want one — the mirror is a view, never the source. Task run
  history is never committed (standing leak guard, verified every gate).
  Rejected: status-quo symlink-out (fresh clones and remote Runners get no
  docs; portability deliverable fails its own dogfood).
- **D13 — Host-reference derivation: derive from the project git remote.**
  Product-visible provider/web URLs come from each project's git remote
  (GitHub/GitLab/Forgejo generic: host + path → web file/commit URLs), not
  from hardcoded homelab hosts. New provider knobs are declared in
  `api/config/schema.js`, never read ad hoc. Local dev-infra references
  (semgrep, SecObserve scans) are explicitly out of scope — development
  infra, not product.
  Rejected: hardcoded SilverBullet/Forgejo hosts (a fresh machine performs
  local lookups that hang or 404; the portability deliverable must not name
  one operator's LAN).
- **D14 — Runner master hygiene: hard-reset masters, cap ≈5, owned-only
  cleanup.** Runner master copies are periodically hard-reset to the remote;
  per-task worktrees (`kb/<taskId>`) are capped at about five per Runner;
  cleanup touches only worktrees the same Runner owns and never one with an
  active claim. Reboot/startup surfaces orphaned worktrees and unpushed
  work instead of discarding or resuming them.
  Rejected: drift-until-pulled masters (stale/divergent bases, unbounded
  disk); cross-Runner cleanup (one Runner pruning state another is using).

**Repository-transport matrix (decided with D2/D10/D11):**

| Row | Repo kind | Runner kind | Transport | Completion verified by |
|---|---|---|---|---|
| 1 | Remote-backed | Any | Clone from origin → per-task worktree → push | Backend confirms pushed SHA reachable |
| 2 | Local-only (grandfathered, D11) | Loopback only | Adopt/share the repo path — no clone, no push (`no-remote`) | Branch + SHA present in the backend-visible repo |
| 3 | Local-only | Remote | Not dispatchable — Runner advertises no capability for it | — |

**Risk retirement (every risk R01–R16 names its retiring phase):**

| Risk | Retired in | Risk | Retired in |
|---|---|---|---|
| R01 Double-claim / unfenced push | Phase 2 | R09 Secrets / attribution | Phase 3, rehearsed Phase 4 |
| R02 Repo-as-truth ordering | Phase 2 (D2/D6) | R10 Worktree/disk contention | Phase 2 (loopback), Phase 3 (fleet) |
| R03 Backend SPOF | Accepted; durability Phase 2, backpressure Phase 4 | R11 Version/protocol skew | Phase 2 (handshake), Phase 3 (fleet) |
| R04 Unauthenticated channel | Phase 2 (loopback), Phase 3 (remote) | R12 UI concurrency / steering | Phase 3 |
| R05 Backend→Runner execution | Phase 3 (D9 tiers); provenance logging from Phase 2 | R13 Cost / starvation | Phase 3 |
| R06 Ladder repricing | Instrumented Phase 2, owned every phase | R14 Log fragmentation | Phase 2 |
| R07 Capability/alias misrouting | Phase 3 (D3) | R15 Portability regressions | Phase 1, re-gated every phase |
| R08 Partition / zombie Runner | Phase 2 (lease/heartbeat), Phase 3 (chaos) | R16 Migration / rollback | Every phase gate (incl. rollback rehearsal) |

Open-decision count: 0. The escalation-ladder ownership matrix from
RiskAssessment §5 is adopted unchanged. Kill criterion stands: if D2/D10
ever needs a second writable store, stop — repo-as-truth and this topology
conflict.

## Consequences

- Phase 1 (Compose split) can build against D10/D12/D13 now; Phase 2 builds
  claim/fencing/identity against D1/D2/D4/D6/D7/D9/D11/D14; Phase 3 builds
  dispatch/UI/budgets against D3/D5/D8.
- The grandfather clauses (D9 T1, D11 loopback transport) keep today's
  default install behaviour-identical — the migration's Goal constraint.
- T3 stays human-gated and remotes stay loopback-by-default: the two
  highest-blast-radius options require explicit operator action, never a
  default.

## Verification map

Phase 0 is paper: verification is the gate, not tests. Gate evidence for
this ADR: every D1–D14 above carries its rejected alternative(s); the
retirement matrix names a phase per risk; open-decision count is 0.
Downstream test hooks this ADR creates: Phase 2 partition test (D1),
dual-fixture parity incl. no-remote repo (D2/D11), auth rejection suite
(D4), version-handshake suite (D7), tier-advertisement + posture logging
(D9), provider-derivation unit tests (D13).
