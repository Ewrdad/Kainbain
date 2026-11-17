# WP1 — Tenant fence: stage review (PR review)

## Verdict: PASS (see final message for the engine verdict block)

## What was reviewed

- Branch diff `main...HEAD`: 14 files, +1583/−70. Core change in
  `api/projectResolution.js`, `api/flow/claimStore.js`,
  `api/flow/executionLedger.js`, `api/flow/runnerRoutes.js`,
  `api/flow/taskFlowRoutes.js`, `api/index.js`, plus `runner/README.md`
  and four test files (one new).
- Prior reports: `IMPLEMENTATION_PLAN.md`, `IMPLEMENTATION_NOTES.md`,
  `SURVEY.md` in this task folder.

## Goal achievement (AUDIT H-1 + H-4) — yes

- **H-1 (fail-open fallback):** all 12 runner-mutating routes now reject a
  missing/blank `projectId` with `400 MISSING_PROJECT_ID`. Verified by
  reading every guard call site: 8 `POST /tasks/:id/*` routes via strict
  `guardedTask` (progress, logs, log-events, verify-sha,
  complete-execution, interrupt, claim-heartbeat, steer-ack), `claim` via
  inline `resolveAndGuardRequiredProject`, and 3 integration routes via
  presence-only guard. Full route inventory taken: the only remaining
  fallback users are `GET /tasks/:id/steers` (view, intentional per survey
  q2), operator `taskFlowRoutes` (not runner routes), and exempt
  identity/catalogue/dispatch routes. `dispatch` exemption verified:
  claims are stamped server-side with `cand.projectId` at both call sites.
- **H-4 (ledger never compares):** `describe()` now carries `projectId`;
  `_holdOrThrow` (progress/logs/log-events/verify-sha),
  `completeExecution` (pre-check before `claimStore.complete()` consumes
  the hold), `interruptExecution` (before `invalidate()`), and
  `checkProjectFence` for claim-heartbeat/steer-ack all reject mismatches
  with `409 PROJECT_FENCE_MISMATCH`. Rejection counts `fencedRejected`,
  audits on the lease's **home** task only (best-effort, never masks the
  throw), and leaves the hold usable. Exec-first ordering preserved
  (wrong epoch stays `STALE_EPOCH`).
- **Q4 matrix:** `api/flow/runnerTenantFence.test.js` covers omitted-400
  on all 12 routes (+ blank variants, query-string control), 8-route
  cross-project replay with wrong-project byte-invariance + home-history
  assertions, lease survival, second claimer, stale epoch, 404 control,
  honest-runner control, and the q2 view-route control. 25/25 green,
  re-run in this review session.

## Plan compliance — yes

All 7 plan phases followed. Deviations are justified, not drift:
1. `_holdOrThrow` gained a 6th `taskStore` param (not just the planned
   5th) — required for the home-task audit write.
2. Integration routes use a presence-only guard (unknown scopes keep
   queue `leased:false`/STALE semantics) — the queue's exact-match scope
   key is the boundary (verified: no fallback in `integrationQueue.js`),
   and the semantics are locked by test.
3. `POST /tasks/:id/steer` (operator route) got a live-lease fence as
   defense-in-depth — same fence, same error code, counted/audited
   (`executionLedger` confirmed wired in production `deps`).

## Standards, modifiability, debt — clean

- Repo JSDoc `MARK:` conventions kept; named error codes; optional params
  preserve back-compat for direct callers/tests.
- Extended test files are additive-only (zero removed lines verified via
  diff for all three).
- One wart, accepted: `runnerRoutes.js` derives fallback resolvers from
  `projectStore` for hand-built test deps. It is documented fail-closed
  with a single-source-of-truth pointer; not worth a rework cycle.
- No new tech debt: no reimplementation of resolution logic, no
  grace-period dual paths, no durability-schema changes (all correctly
  out of scope).

## Docs — updated

Route-split comment above `guardedTask`, route table + fence contract +
caller audit in `IMPLEMENTATION_NOTES.md`, operator-facing migration note
in `runner/README.md` (symptom → action, no data migration). Matches the
plan's "at minimum" bar.

## Caller audit — spot-verified

Notes claim the daemon was already clean. Spot-checked ~30 `runner/daemon.js`
call sites (claim/progress/logs/complete/interrupt/verifySha/steerAck/
integration*) plus `runner/client.js` bodies: all thread `projectId`.
`steerAck` uses server-issued `steer.projectId`. No fix needed — claim holds.

## Verification performed in this review (all observed, not quoted)

- `flow/runnerTenantFence.test.js`: **25/25 pass**
- Named suites (`projectResolution`, `claimStore`, `executionLedger`,
  `runnerPolicyDispatch`, `integrationDispatch`): **90/90 pass**
- Route suites (`runnerRoutes` ×4, `taskFlowRoutes`): **99/99 pass**
- Full `api` suite: **450 files, 7363 passed / 3 skipped, exit 0**
  (notes said 7365/1 skipped — trivial skip-count variance, same green)
- `eslint` on all 7 touched source/test files: **clean**
- Contamination: new suite imports `isolatedTestRoots.js` first, uses
  `proj-alpha`/`proj-beta` temp fixtures with `afterAll` cleanup; live
  paths checked after my runs (`~/projects` and
  `~/.kainbain/projects.json` absent, `~/.kainbain/engine/` holds no
  test artifacts).

## Non-blocking notes for follow-up (not fail reasons)

- Legacy `projectId: null` holds are honored at the ledger by design;
  strictness for new requests lives at the routes. Correct per plan.
- If the cited `5fdea223` AUDIT/DELIVERABLES docs ever surface in this
  checkout, diff the Phase 0 route table against them (plan's own open
  item). All cited line numbers were re-verified against live code here.
