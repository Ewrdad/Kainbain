# WP1 — Cross-project tenant-safety fence (AUDIT H-1 + H-4): Implementation Plan

## Goal

Close the cross-project write gap so no runner-mutating request can ever land in a project it does not name: require explicit `projectId` (missing → 400, never active-project fallback) on every runner-mutating route, and fence every lease-guarded ledger call by comparing request `projectId` against `hold.projectId` (mismatch → named fencing error, original lease untouched). Unblock WP5 load testing on top of this fence.

## Success Criteria

- Every runner-mutating route returns 400 with a stable error code when `projectId` is missing, empty, or whitespace-only; none falls back to the active project.
- Every lease-guarded mutation (progress, logs, log-events, verify-sha, complete-execution, interrupt, claim-heartbeat, steer-ack, integration acquire/heartbeat/report) rejects a cross-project replay with a named fencing error; the original hold is left untouched and the rejection is counted/logged as a security signal.
- The committed Q4 regression matrix is green on synthetic fixtures (`proj-alpha` / `proj-beta` style): omitted-`projectId` → 400 per route; A's lease vs B's task → fencing error; stale epoch → `STALE_EPOCH`; second claimer → `CLAIM_CONFLICT`; unknown task → 404.
- Existing suites stay green: `claimStore`, `executionLedger`, `runnerPolicyDispatch`, `integrationDispatch`, `projectResolution`.
- Zero contamination: before/after snapshots of `~/projects`, `~/.kainbain/projects.json`, `~/.kainbain/engine/*` are identical; no live dummy project is mutated.
- A runner-operator-facing migration note is published (old runners without `projectId` get a clear 400).

## Approach — make the change easy, then make the change

The behavior change itself is small (two guards), but it touches a dozen routes and three stores. So the plan front-loads the big, de-risking work — route inventory, additive seams, unit-level fence — and flips behavior only after the seams and their tests exist:

1. **Inventory first** (Phase 0): build the authoritative mutating-vs-view route table from `api/flow/runnerRoutes.js` so no route is missed or over-fenced.
2. **Additive seams, no behavior change** (Phases 1–2): add a strict resolver next to the fallback resolver, and plumb `projectId` through `ClaimStore.describe()` as an additive field. Existing callers and tests keep passing untouched.
3. **Unit-level fence** (Phase 3): extend `_holdOrThrow` (and the `complete`/`heartbeat`/`interrupt` paths that bypass it) with the `projectId` comparison plus the named error, covered by store-level tests.
4. **Flip the routes** (Phase 4 — the actual change): switch the mutating routes to the strict resolver and pass request `projectId` into the ledger. This phase is deliberately thin: every line it touches is already covered by Phases 1–3.
5. **Lock it with the Q4 matrix + audit + docs** (Phases 5–7): committed route-level regression suite, caller audit, migration note, route-split documentation.

## Context and evidence (verified in this checkout)

- `api/projectResolution.js:8-14` — `resolveProjectId` falls back to `projectStore.getActiveProject()` when no id is given. Confirmed.
- `api/flow/runnerRoutes.js:530-542` — `guardedTask` resolves `request.body?.projectId || request.query?.projectId` through the fallback resolver for `progress` (L655), `logs` (L684), `log-events` (L734), `verify-sha` (L789), `complete-execution` (L815), `interrupt` (L949), `claim-heartbeat` (L1054), `steer-ack` (L1541), `steers` GET (L1572). The `claim` route (L973) calls `resolveAndGuardProject` directly (L1001). Integration routes: `acquire` (L1408), `heartbeat` (L1479), `report` (L1501), GET `integration` (L1527).
- `api/flow/claimStore.js:153-174` — `claim()` already stores `projectId`; `liveHolds()` (L248-263) and `countLiveHolds()` (L186-195) already use it; but `describe()` (L229-238) strips it. Confirmed.
- `api/flow/executionLedger.js:91-102` — `_holdOrThrow` compares only `executionId`/`epoch`; `runnerId` is compared separately at call sites (`recordProgress` L119, `noteRemoteVerification` L512). `completeExecution` (L339+) goes through `claimStore.complete()` (which also ignores `projectId`), and `interruptExecution` (L544+) uses `describe()` plus its own check — all three paths need the fence, not just `_holdOrThrow`.
- `runner/client.js:58-207` — every mutating client call already sends `projectId`; `runner/daemon.js` threads `projectId` through claim/heartbeat/progress/logs/complete/interrupt (sampled ~30 call sites, all pass it). Caller audit must still verify exhaustively.
- Test isolation: `api/testSetup.isolation.js` (global backstop, `api/vitest.config.js:34`) + per-file `api/isolatedTestRoots.js`; suites use `proj-*` temp fixtures and `afterAll` cleanup (see `api/flow/runnerRoutes.test.js:1-40`). Test command: `npm run test --prefix api` (`vitest run`, `api/package.json:11`).

Evidence gaps (recorded, not blocking): the cited `docs/tasks/5fdea223-…/AUDIT.md`, `DELIVERABLES.md`, `FRAMEWORKS.md`, and `FEEDBACK_SURVEY` do not exist in this checkout, and neither does `/tmp/kb-q4-probe.mjs`. All line references above were verified against live code instead and match the task text; the Q4 probe will be authored fresh as a committed suite (Phase 5) rather than extended from the `/tmp` script.

## Survey decisions (from `SURVEY.md`)

`SURVEY.md` contains four questions with empty `answers:{}` (asked but unanswered). The plan adopts the Recommended option on each as a locked assumption; if the answers arrive before implementation, re-check this table:

| # | Question | Adopted answer | Plan consequence |
|---|---|---|---|
| q1 | Old worker omits `projectId` | Reject immediately with a clear error — no grace period | Hard 400 from day one; no warning-mode / dual-write phase |
| q2 | Read-only views | Views may keep the active-project default; only mutations must name the project | Route split in Phase 0/4; the split is documented, not just coded |
| q3 | Receipt from A replayed vs B | Reject + record a security warning; leave the original receipt untouched | Named fencing error + counter/audit entry on the lease's home task; never `invalidate()` the hold on a mismatch |
| q4 | Upgrade-note audience | People who run the workers | Migration note is operator-facing (symptom → action), not admin/developer-facing |

## Steps

### Phase 0 — Route inventory and fence contract (research, first)

1. Read `api/flow/runnerRoutes.js` end to end and produce the route table below; verify each row by reading its handler (do not trust names alone). Publish the final table in the implementation notes or a code comment near `guardedTask`.
   - **Strict-400 mutating routes** (must name `projectId`): `POST /tasks/:id/claim`, `/claim-heartbeat`, `/progress`, `/logs`, `/log-events`, `/verify-sha`, `/complete-execution`, `/interrupt`, `/steer-ack`, `POST /runners/integration/acquire`, `/heartbeat`, `/report`.
   - **Keep-fallback view routes**: `GET /tasks/:id/steers`, `GET /runners/integration`, `GET /runners/monitor`, `GET /runners/models/catalogue`, and the existing UI `GET /tasks/:id` family.
   - **Explicitly exempt, with reason**: `POST /runners/dispatch` (poll with optional `projectIds` scope; the claim it issues is stamped server-side with the candidate's own `projectId` at `runnerRoutes.js:1275`, so there is no request-named project to fence — document this); runner-identity routes (`register`, `heartbeat`, `commands`, `approve`/`rotate`/`deny`/`revoke`/`pause`/`resume`/`skip`, `config`) which are not project writes.
2. Fix the fence contract names (proposed; alternatives in Key Decisions):
   - Missing/blank `projectId` on a strict route → `400 { code: "MISSING_PROJECT_ID" }` (400 = bad request; unknown-but-present id keeps the existing 404 from `requireProject`).
   - `projectId` mismatch vs hold → `409 { code: "PROJECT_FENCE_MISMATCH" }`, new `fencedRejected` ledger counter, plus an audit history entry written to the **lease's home task** (`hold.projectId`), never to the request-named project.
3. Grep-audit every `claimStore.describe / heartbeat / complete / release` and `ledger.*` caller outside `runnerRoutes.js` (engine, scheduler, impromptu, tests) so Phase 3 covers all fence entry points.

Validation: the route table exists and each row cites a handler line; contract names are written down before any code changes.

### Phase 1 — Strict resolver seam (additive, no behavior change)

4. In `api/projectResolution.js`, add alongside the existing helpers (do not modify `resolveProjectId`'s fallback — view routes keep it):
   - `resolveRequiredProjectId(requestedId)` → id or `null`; never consults `getActiveProject()`; trims and rejects empty/whitespace.
   - `resolveAndGuardRequiredProject(requestedId, reply)` → id, or `400 { code: "MISSING_PROJECT_ID" }` when blank, or 404 via `requireProject` when unknown.
   - Export both from `createProjectResolvers` and thread them through `api/index.js:110,249-250` deps next to the existing resolvers.
5. Extend `api/projectResolution.test.js`: known id resolves; unknown → null/404; missing/empty/whitespace → null and 400 via the guard; active project is never consulted (assert with a store whose `getActiveProject` throws).

Validation: `npx vitest run projectResolution.test.js` (from `api/`) green; no existing test modified.

### Phase 2 — Plumb `projectId` through `describe()` (additive, no behavior change)

6. Add `projectId: hold.projectId ?? null` to the object returned by `ClaimStore.describe()` (`api/flow/claimStore.js:229-238`). `liveHolds()` already exposes it; this just aligns `describe()`.
7. Extend `api/flow/claimStore.test.js`: `describe()` returns the claiming `projectId`; `null` for legacy holds claimed without one (the `projectId = null` default at `claim()` L153 must keep working so old in-memory holds and existing tests do not break).

Validation: `npx vitest run flow/claimStore.test.js` (from `api/`) green; no existing assertion changed.

### Phase 3 — Fence the ledger (unit level, still unreached by routes)

8. Extend `ExecutionLedger._holdOrThrow(claimStore, taskId, executionId, epoch, projectId)` with an optional 5th parameter: after the existing execution/epoch check, if the hold carries a non-null `projectId` and the request names a different one, increment `fencedRejected` (new counter, initialized in the constructor) and throw `409 PROJECT_FENCE_MISMATCH`. Keep the parameter optional so pre-existing direct callers/tests pass unchanged.
9. Fence the paths that bypass `_holdOrThrow`:
   - `completeExecution`: compare `describe(taskId).projectId` against request `projectId` **before** calling `claimStore.complete()` (a cross-project completion must not release A's lease — survey q3).
   - `interruptExecution`: same compare before `claimStore.invalidate()`.
   - `claim-heartbeat` path: `ClaimStore.heartbeat(taskId, executionId)` has no project parameter — add an optional expected-`projectId` argument (or a ledger-side `describe` pre-check at the route, whichever keeps `claimStore`'s signature stable; prefer the ledger/route-side check to avoid changing store semantics).
   - `release()`: audit callers in Phase 0; if any route reaches it with a request `projectId`, fence it the same way.
10. Decide the audit-trail write (survey q3 "record a security warning"): on mismatch, append a history entry to the task in the **home** project (`taskStore.getTask(hold.projectId, taskId)`), naming the rejected request project. Never write to the request-named project (that would be the very cross-project write being fenced). If `hold.projectId` is null (legacy hold), skip the history write but still count and reject.
11. Extend `api/flow/executionLedger.test.js`: for each fenced method — matching `projectId` passes; mismatched → `PROJECT_FENCE_MISMATCH` with 409 and `fencedRejected + 1`; hold survives (subsequent legitimate call with the right `projectId` still succeeds); legacy null-`projectId` hold + named request → allowed (back-compat) or rejected — pick one in implementation and test it (recommended: allowed, since `claim()` defaults to null and in-flight holds predate the fence; the route-level 400 still forces new callers to name a project).

Validation: `npx vitest run flow/executionLedger.test.js flow/claimStore.test.js` (from `api/`) green.

### Phase 4 — Flip the mutating routes (the change)

12. In `api/flow/runnerRoutes.js`, switch `guardedTask` to `resolveAndGuardRequiredProject` and pass `ctx.projectId` into every ledger call it guards. `GET /tasks/:id/steers` also uses `guardedTask` (L1572) but is a view — give it its own fallback guard so it keeps working without `projectId` (survey q2).
13. Switch the `claim` route's direct `resolveAndGuardProject` call (L1001) to the required variant.
14. Switch `integration/acquire`, `integration/heartbeat`, `integration/report` to require explicit `projectId` (400 when missing); check `integrationQueue` scoping at L1444-1470 for any active-project fallback hiding behind `peekHead`/acquire and fence it too.
15. Leave `POST /runners/dispatch`'s optional `projectIds` scope as is; add a code comment citing the Phase 0 exemption reason. Leave all view routes on the fallback resolver.
16. Document the split where the next reader will find it: a short comment block above `guardedTask` naming which routes are strict, which keep fallback, and why (survey q2).

Validation: existing `runnerRoutes.*`, `runnerPolicyDispatch`, `integrationDispatch` suites green (they send `projectId` already, so the flip should be invisible to them) — any red test here is either a route wrongly flipped or a test hiding a fallback dependency; fix the classification, not the test, unless the test is the fallback-dependent one.

### Phase 5 — Committed Q4 regression suite (the lock)

17. Create `api/flow/runnerTenantFence.test.js` (name negotiable; must import `../isolatedTestRoots.js` first and use `app.inject` like `runnerRoutes.test.js`). Fixtures: two synthetic projects (`proj-alpha`, `proj-beta`), one task each, no real projects touched.
18. **Omitted-`projectId` table test**: for every strict route from Phase 0, send the request with no `projectId` in body or query → expect 400 + `MISSING_PROJECT_ID`. Also send `""` and `"   "` for one representative route → 400.
19. **Cross-project replay matrix** (the AUDIT Q4 core):
    - Claim task in alpha as runner R (lease L1, epoch E1); replay L1/E1 against beta's task id → `PROJECT_FENCE_MISMATCH` (409), and L1 still valid for alpha afterwards (q3: original untouched).
    - Same replay for `progress`, `logs`, `verify-sha`, `complete-execution`, `interrupt`, `steer-ack`, `claim-heartbeat` — at minimum `progress` + `complete-execution` (the data-corrupting paths) plus one shared helper covering the rest.
    - Stale epoch: re-claim alpha's task (epoch E2), retry with E1 → `STALE_EPOCH`.
    - Second claimer: claim alpha's task as R2 while R1 holds → `CLAIM_CONFLICT`.
    - Unknown task id with valid `projectId` → 404 (fence must not mask not-found).
    - View-route control: `GET /tasks/:id/steers` (or one view route) without `projectId` still resolves via fallback — locks the q2 split against future over-fencing.
20. Assert the security signal: `fencedRejected` counter increments and the home-task history carries the warning entry; assert the wrong project's task history is byte-identical before/after (the true anti-corruption assertion).

Validation: new suite green in isolation and in the full run; suite deletes its temp roots in `afterAll`.

### Phase 6 — Caller audit and migration note

21. Exhaustively grep all callers of the strict routes: `runner/` (`daemon.js`, `impromptu.js`, `harness.js`), `frontend/src`, `scripts/`, `canary-e2e/`. Every mutating call must pass an explicit `projectId`. The task states the daemon is clean — verify, do not trust; any omission found is fixed in the same change (runner already accepts `projectId` everywhere per `runner/client.js`, so fixes are one-liners).
22. Write the operator-facing migration note (survey q4 audience: people who run the workers): symptom (`400 MISSING_PROJECT_ID` / `409 PROJECT_FENCE_MISMATCH` after upgrade), cause (old runner / stale lease), action (upgrade runner to ≥ this version; no data migration — holds are memory-only, epochs persist unaffected). Persistent location: a section in `runner/README.md` (preferred — lives with the thing operators read) plus a pointer from the release/changelog if the repo has one in use. Keep it under a page.

Validation: audit checklist in the implementation report lists every caller file checked and its verdict; migration note reviewed for operator readability (no code internals).

### Phase 7 — Docs, contamination checks, final gates

23. Document the route split in one durable place beyond the code comment (operator/dev docs wherever route auth is described; at minimum the implementation report + the `guardedTask` comment from Phase 4).
24. Contamination checks (global constraint): snapshot before and after the full verification run — `ls ~/projects`, `~/.kainbain/projects.json` checksum, `ls ~/.kainbain/engine/` — and diff; any delta fails the run. Live dummy projects are read-only evidence only.
25. Final gates, in order: new Q4 suite → `claimStore`, `executionLedger`, `runnerPolicyDispatch`, `integrationDispatch`, `projectResolution` suites → full `npm run test:unit` (or at minimum `npm run test:api` + lint if configured).

## Key Decisions

- **Hard 400, no grace period** (survey q1): old runners break loudly with a clear error instead of a warning window. Chosen because a grace period keeps the cross-project write hole open during exactly the load-testing window WP5 needs fenced; rejected alternative was dual-write-then-reject, which doubles the code paths under test.
- **Views keep fallback** (survey q2): only mutations are strict. Rejected "strict everywhere" because UI/dashboard flows legitimately resolve the active project and forcing `projectId` there adds breakage with no integrity gain (reads cannot corrupt).
- **409 + `PROJECT_FENCE_MISMATCH` for replays** (survey q3): stays in the lease-conflict family (`STALE_EPOCH`, `CLAIM_CONFLICT`) so existing 409-handling (retry/backoff) applies; rejected 403 because this is a fencing conflict, not an auth verdict, and rejected silent-409 because the survey requires a recorded security warning.
- **Audit entry goes to the home task**: writing the warning to the request-named project would itself be a cross-project write. Legacy null-`projectId` holds skip the history write but still count.
- **Legacy null-`projectId` holds are honored, not rejected**: `claim()`'s `projectId = null` default stays, so in-flight holds and existing tests survive the deploy; strictness applies to new requests (400) and to mismatches against named holds.
- **`_holdOrThrow` extended, not replaced**: a 5th optional parameter keeps every existing caller compiling and every existing test passing; the `complete`/`interrupt`/`heartbeat` bypass paths get explicit pre-checks rather than a store-signature overhaul. Consolidating the scattered `runnerId` checks into the guard was considered and rejected as out of scope (behavior-neutral refactor with its own regression risk).
- **`dispatch` exempt by construction**: its claims are stamped server-side with the candidate's project, so there is no request-named project to fence; documented, not coded.

## Validation Plan

| Gate | Command / check | Expected evidence |
|---|---|---|
| Strict resolver unit | `npx vitest run projectResolution.test.js` (from `api/`) | New 400/blank/active-never-consulted tests green; old tests untouched |
| `describe()` plumbing | `npx vitest run flow/claimStore.test.js` (from `api/`) | `projectId` present in `describe()`; legacy null holds pass |
| Ledger fence unit | `npx vitest run flow/executionLedger.test.js` (from `api/`) | Mismatch → 409 + `fencedRejected`; hold survives; legit retry succeeds |
| Route flip | `npx vitest run flow/runnerRoutes.test.js flow/runnerRoutes.bootstrap.test.js flow/runnerRoutes.attribution.test.js flow/runnerRoutes.handover.test.js flow/runnerPolicyDispatch.test.js flow/integrationDispatch.test.js` (from `api/`) | All green with no test edits (proves runners already send `projectId`) |
| Q4 matrix (new) | `npx vitest run flow/runnerTenantFence.test.js` (from `api/`) | Full matrix green on `proj-alpha`/`proj-beta` fixtures |
| Caller audit | `grep -rn` for mutating client calls in `runner/`, `frontend/src`, `scripts/`, `canary-e2e/` | Checklist: every call site passes `projectId` |
| Contamination | Snapshot + diff `~/projects`, `~/.kainbain/projects.json`, `~/.kainbain/engine/` before/after | Byte-identical diffs |
| Full gate | `npm run test:unit` (repo root) | Green; WP5 unblocked |

Highest-risk validation step: the Q4 `complete-execution` replay test — completion releases the lease, so a fence bug there both corrupts beta's history and drops alpha's lease; it gets its own explicit test (not just the shared helper) asserting lease survival plus wrong-project history invariance.

## Risks and mitigations

- **Route missed or over-fenced**: mitigated by Phase 0's handler-verified table plus the omitted-`projectId` table test (fails if a strict route is missed) and the view-route control test (fails if a view is over-fenced).
- **Old runners break on upgrade**: accepted per survey q1; mitigated by the clear 400 code/message and the operator migration note. Rollback is a plain revert — no data migration, holds are memory-only.
- **Bypass paths (`complete`/`interrupt`/`heartbeat`)**: explicitly fenced in Phase 3 step 9 with per-path tests; the Phase 0 caller grep prevents unknown entry points.
- **Cited audit docs absent**: AUDIT/DELIVERABLES/FRAMEWORKS references could not be consulted; mitigated by verifying every cited line against live code (all matched) and recording the gap here. If the docs surface, re-check the route table against them before Phase 4.
- **Survey answers arrive late**: q1–q4 adopted as Recommended; if answered differently, only Phases 4 (strictness scope) and 6 (note audience) change — Phases 1–3 seams are unaffected either way.

## Non-goals

- No change to view-route fallback behavior, `dispatch` scope semantics, or runner-identity routes.
- No consolidation of the scattered `runnerId` checks, no ClaimStore durability changes, no epoch-schema migration.
- No WP5 load-testing work — this plan only unblocks it.

## Open questions

None that block planning — all material unknowns were resolved from the workspace. Two confirmations for the implementer: (1) if `docs/tasks/5fdea223-…` audit docs surface, diff the Phase 0 route table against them; (2) if `SURVEY.md` gains answers, re-check the survey table above before Phase 4.
