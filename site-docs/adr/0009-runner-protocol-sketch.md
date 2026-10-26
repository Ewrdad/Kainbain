# ADR 0009 — Runner↔Backend protocol sketch (v1)

**Status:** Accepted (MigrationPlan Phase 0 gate, 2026-10-26)
**Date:** 2026-10-26
**Task:** MigrationPlan Phase 0 (paper only; no code in this ADR)
**Decides:** the wire shape Phase 2 builds. Wire format is JSON over HTTPS
(same shapes over loopback HTTP for the default install); log frames stream
over the existing WebSocket channel pattern (`/ws`), sequenced per
execution.

## Context

RiskAssessment R01/R04/R07/R11/R14 turn today's in-process calls
(`agentRunner` → `SessionStore` → harness registry) into a protocol that must
be authenticated, versioned, fenced, and observable. This sketch fixes the
message set and the rules; Phase 2 assigns exact paths/status codes and the
conformance tests.

## Decision

Lifecycle, in order:

1. `register` — Runner presents: Runner id (stable per host, generated at
   install), human-approved join token (D4), host facts (OS, working dirs),
   discovered harnesses with versions, runnable models, permitted YOLO tiers
   (D9), disk headroom. Backend answers `pending` (awaits UI approve/deny per
   the onboarding flow) or `active` + per-Runner credential + protocol
   version. Unknown identity or wrong scope is rejected on every endpoint
   (R04 test: unauthenticated / wrong-scope / revoked Runner rejected
   everywhere).
2. `heartbeat` (interval, backend-side expiry) — refreshes capabilities,
   tier ceiling, disk headroom, project allowlist digest, and all three
   version axes (backend, Runner, per-harness versions; D7). Stale
   capability expires: no dispatch against a heartbeat older than the TTL.
   Heartbeat also carries harness-change detection (a harness whose version
   moved is re-advertised, never silently kept).
3. `claim` — `POST /tasks/:id/claim` → `200` + lease `{ executionId,
   epoch }` or `409` + holder epoch. The epoch is the fencing token (D1):
   backend-issued, monotonic, never wall-clock. One task, one holder.
4. `progress` — stage lifecycle events keyed by `executionId`; idempotent
   ingestion (a retried report is a no-op, not a duplicate stage).
5. `log ingest` — sequenced frames `{ executionId, seq, bytes }`; the
   backend assigns canonical ordering and validates/dedupes on ingest
   (execution ID + sequence). The Runner keeps a local spill file replayed
   after a crash. Gaps are represented in the data ("logs truncated —
   Runner disconnected"), never papered over (R14).
6. `complete` / `error` — references the pushed commit SHA (remote-backed,
   transport row 1) or branch + SHA presence (grandfathered local-only, row
   2). The backend verifies reachability/presence (D2/D6) before marking
   complete; a stale epoch's push is rejected by construction (D1) and the
   stage returns to `interrupted` for re-dispatch, never silent force-push.
7. `load` / project sync — backend tells the Runner to load a repo;
   remote-backed clones from origin then pulls; grandfathered local-only
   adopts/shares the path (no clone-from-origin, no push). A Runner
   advertises no capability for a repo it cannot fetch (transport row 3).

Onboarding handshake (unchanged from the onboarding flow): Runner boots with
env-pointed backend → optional backend-identity check → join request with
host/harness facts → user approves/denies in Settings → automatic secure
channel. Minimal approval UI (pending join requests, approve/deny) ships in
Phase 2; the full Runners config screen is Phase 3.

Versioning: `protocol: "v1"` on every message; compatibility window N-1
minor (D7). Outside-window Runners idle with an explicit operator signal
(step 6), never best-effort dispatch. Frontend↔backend stays lockstep (one
Compose release pins both; backend version on `/status`, mismatch banner in
the UI — Phase 1).

Error vocabulary reuses the existing contract style: unsupported capability
answers `501 { code }`, unknown session entries `404 { code }` (per the
harness-contract precedent in `api/agent/harnessContract.js`), auth failures
`401/403` with revocation taking effect at the next heartbeat at the latest
(leases expire; work re-queues).

Rejected: backend-mediated push (D2 rejects — backend never touches git
remotes); Runner-to-UI channel (D5 — the backend is the UI's only source of
truth); timestamp leases (clock skew); unsequenced log append (misordering
under retry is guaranteed, not hypothetical).

## Consequences

- Phase 2 implements exactly this message set; anything not here (impromptu
  read-only requests, T0-only, remote onboarding) waits for Phase 3.
- The partition test (two Runners, one task, first partitioned mid-stage →
  exactly one completion accepted, stale push rejected) is the test that
  earns the residual on R01; the auth matrix earns R04; the version-skew
  fleet earns R11.

## Verification map

Paper phase: verified by review against D1/D2/D4/D6/D7/D9/D14 in ADR 0005.
Code-phase hooks: claim-fencing tests, reconciler divergence counter
(pageable-zero), ingest validation errors, fleet version matrix in the UI.
