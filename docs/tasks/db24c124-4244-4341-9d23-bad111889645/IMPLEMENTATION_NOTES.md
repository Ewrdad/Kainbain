# WP1 — Tenant fence: implementation notes

## Route table (verified against handlers in `api/flow/runnerRoutes.js`)

Strict — missing/blank `projectId` → `400 { code: "MISSING_PROJECT_ID" }`, never the active project:

| Route | Guard |
|---|---|
| `POST /tasks/:id/claim` | `resolveAndGuardRequiredProject` (inline) + unknown id → existing 404 |
| `POST /tasks/:id/claim-heartbeat` | `guardedTask` (strict) + `ledger.checkProjectFence` before renewal/timeout |
| `POST /tasks/:id/progress` | `guardedTask` (strict); ledger `_holdOrThrow` fences |
| `POST /tasks/:id/logs` | `guardedTask` (strict); ledger `_holdOrThrow` fences |
| `POST /tasks/:id/log-events` | `guardedTask` (strict); ledger `_holdOrThrow` fences |
| `POST /tasks/:id/verify-sha` | `guardedTask` (strict); ledger `_holdOrThrow` fences |
| `POST /tasks/:id/complete-execution` | `guardedTask` (strict); ledger pre-check fences BEFORE `claimStore.complete()` consumes the hold |
| `POST /tasks/:id/interrupt` | `guardedTask` (strict); ledger pre-check fences BEFORE `claimStore.invalidate()` |
| `POST /tasks/:id/steer-ack` | `guardedTask` (strict) + `ledger.checkProjectFence` before `steerStore.ack` |
| `POST /runners/integration/acquire` | `resolveAndGuardPresentProject` (presence-only; queue owns unknown scopes) |
| `POST /runners/integration/heartbeat` | `resolveAndGuardPresentProject` (presence-only) |
| `POST /runners/integration/report` | `resolveAndGuardPresentProject` (presence-only) |
| `POST /tasks/:id/steer` (operator route in `taskFlowRoutes.js`) | keeps the view fallback for project resolution, but when a live lease exists the steer is fenced: `liveHold.projectId` ≠ request project → `409 PROJECT_FENCE_MISMATCH`, nothing queued (counted/audited via `executionLedger.checkProjectFence` when wired) |

Fallback kept (read-only views, survey q2):

| Route | Guard |
|---|---|
| `GET /tasks/:id/steers` | `guardedTaskView` (fallback `resolveAndGuardProject`) |
| `GET /runners/monitor`, `GET /runners/models/catalogue`, `GET /runners/integration` | never resolve a task project |
| `POST /runners/dispatch` | exempt by construction: optional `projectIds` scope only narrows the scan; claims are stamped server-side with the candidate's own `projectId` |
| Runner identity (`register`, `heartbeat`, `commands`, `approve`/`rotate`/`deny`/`revoke`/`pause`/`resume`/`skip`, `config`) | not project writes; untouched |

## Fence contract

- Missing/blank/non-string `projectId` on a strict route → `400 MISSING_PROJECT_ID`. Unknown-but-present id on task routes → existing 404 from `requireProject` (unchanged shape). Unknown-but-present scope on integration routes → queue semantics (`leased:false` / `STALE_EPOCH`), locked by `runnerPolicyAcquire` + `runnerRoutes` integration tests.
- Request `projectId` ≠ `hold.projectId` → `409 PROJECT_FENCE_MISMATCH`, `fencedRejected + 1`, security audit appended to the lease's HOME task only. Original hold untouched; legitimate retry with the home project succeeds.
- Error ordering is exec-first everywhere: wrong execution/epoch stays `STALE_EPOCH` even when the project also mismatches (`completeExecution` peeks before fencing to preserve this without consuming the lease).
- Legacy `projectId: null` holds are honored for named requests; unnamed requests against named holds pass at the ledger (strictness for new requests lives at the routes).

## Caller audit (all verified, none fixed — daemon was already clean)

| Caller file | Verdict |
|---|---|
| `runner/daemon.js` (26 mutating call sites: claim/claimHeartbeat/progress/logs/complete/interrupt/verifySha/steerAck/integrationHeartbeat/integrationReport) | clean — `projectId` threaded from the assignment on every call; `steerAck` uses server-issued `steer.projectId` |
| `runner/logEvents.js` (`client.logEvents`) | clean — sender constructed with `projectId` in `daemon.js` |
| `runner/client.js` (all mutating methods) | clean — `projectId` always in the body |
| `runner/impromptu.js`, `runner/harness.js` | clean — no mutating project calls (impromptu endpoints are not project-scoped) |
| `frontend/src` (non-test) | clean — zero direct calls to runner-mutating endpoints |
| `scripts/`, `canary-e2e/` (excl. `node_modules`) | clean — zero calls to runner-mutating endpoints |

## Files changed

- `api/projectResolution.js` — added `resolveRequiredProjectId`, `resolveAndGuardRequiredProject`, `resolveAndGuardPresentProject` (fallback resolvers untouched).
- `api/index.js` — threads the new resolvers through `deps`.
- `api/flow/claimStore.js` — `describe()` now carries `projectId` (additive).
- `api/flow/executionLedger.js` — `fencedRejected` counter, `PROJECT_FENCE_MISMATCH` error, `_assertProjectFence` + public `checkProjectFence`; fenced `_holdOrThrow`, `completeExecution`, `interruptExecution`.
- `api/flow/runnerRoutes.js` — strict/presence guards on all mutating routes; `guardedTaskView` for `GET steers`; `dispatch` exemption documented.
- `api/flow/taskFlowRoutes.js` — `POST /tasks/:id/steer` fences the live-lease queue path by `hold.projectId` (409 `PROJECT_FENCE_MISMATCH` on cross-project steer; legacy null-projectId holds still allowed).
- `runner/README.md` — operator-facing upgrade note (symptom → action, no data migration).
- Tests: `api/projectResolution.test.js`, `api/flow/claimStore.test.js`, `api/flow/executionLedger.test.js` extended (no existing assertion changed); new `api/flow/runnerTenantFence.test.js` (Q4 matrix, 25 tests incl. the cross-project steer control).

## Verification

- New Q4 suite green in isolation; observed 15 pre-flip failures first (14 fallback misses + cross-project heartbeat succeeding at 200), then 25/25 post-flip (incl. cross-project steer control).
- Named suites green with zero existing-test edits: `projectResolution`, `claimStore`, `executionLedger`, `runnerRoutes` (+ bootstrap/attribution/handover), `runnerPolicyDispatch`, `runnerPolicyAcquire`, `integrationDispatch`, `integrationBusyFallsThrough`, `taskFlowRoutes`.
- Full regression: api suite 450 files / 7365 tests passed (1 skipped); runner `node --test` 422 passed; eslint clean on all touched files; `npm run check:jsdoc-example` PASS.
- Contamination: `~/projects`, `~/.kainbain/projects.json`, `~/.kainbain/engine/*.json` checksummed before/after the runs — byte-identical (live projects never touched; all fixtures under temp roots).
