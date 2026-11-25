# Implementation Plan — In-assignment transient backend errors non-fatal to the runner (S4)

Task: `78eac844-250a-44d1-810e-6f047eb5a59e`
Source problem: any in-try backend-call failure inside `executeAssignment` sends an interrupt and rethrows → process exit → systemd restart, so every LAN blip or backend restart window can kill a run (501 fetch failed + 16 Backend 502s since 11-19 on server2-alpha; proven 502 window 11-20 20:40:20–20:40:57 during backend build 637).
Survey input: [SURVEY.md](./SURVEY.md) (Round 1, q1–q4; `answers: {}` — unanswered, so the recommended options below are carried as assumptions pending confirmation).

## Goal

1. Transient backend errors (fetch-failed network errors, HTTP 502/503/504) raised during an assignment make `executeAssignment` send an interrupt WITH a reason and RETURN (keep polling) instead of rethrowing — the same report-and-return precedent as the `WORKTREE_CAP_REACHED` and deterministic-gitFailure branches.
2. The idle loop stops crash-cycling on backend outages: bounded retries with backoff for idempotent calls (dispatch poll; heartbeat already warn-continues), or at minimum sleep-and-continue instead of exit.
3. The non-fatal set is enumerated explicitly; `STALE_EPOCH`, auth failures, and genuinely unknown errors stay fatal. No inverted catch-all, so new failure modes stay loud.
4. Regression tests in `runner/client.backendOutage.test.js` (+ daemon fatality-boundary tests) prove the transient/fatal boundary, registered in `scripts/run-tests.mjs`.

## Success Criteria

- A 502/503/504 or dropped-socket failure from any backend call inside `executeAssignment` produces a best-effort `interrupt` carrying a reason, a one-line log naming the cause, and a return (no throw) — the dispatch loop keeps polling and the process stays alive.
- A dispatch-poll (`dispatchClaim`) transient failure backs off and re-polls without consuming idle budget and without exiting; restart counters stop incrementing across a backend restart window.
- `STALE_EPOCH` still propagates (epoch fencing intact), auth/credential failures still exit loud, and unknown errors still throw — proven by boundary tests asserting `rethrown === false` for transient and `rethrown === true` for stale-epoch.
- `node --test runner/client.backendOutage.test.js runner/daemon.test.js runner/client.test.js` passes, the repo unit gate (`npm test` via `scripts/run-tests.mjs`) passes, and the new suite file is registered (the `tests/run-tests.test.mjs` pin fails the gate if it is not).
- Post-rollout (needs PROD-READ-ONLY permission): crash-restart rate in the runner journal drops across backend restart windows while assignment success holds; E4 timestamp-join confirmed on `db24c124`, `1f8959ca`, `f56e9878`, `ef21e99b`, `bae668cb`.

## Survey decisions (factored in)

Local `SURVEY.md` Round 1 is unanswered (`"answers": {}`). This plan adopts the recommended option for each as a working assumption (flagged for confirmation in Open Questions). The stage brief also cites the source-task survey q5 ("survive network/502/503/504, keep the rest fatal") — that maps to local q2 and is adopted the same way.

| # | Question | Adopted (recommended) answer | Plan effect |
|---|----------|------------------------------|-------------|
| q1 | Mid-task connection drop: what should the worker do? | Stay alive, report what happened, keep checking for work | Interrupt-with-reason + return; never rethrow for the transient set. |
| q2 (= source q5) | Which problems to survive vs still stop for? | Only survive short connection problems (network errors, 502/503/504); still stop for login problems, outdated orders, anything unknown | Explicit non-fatal enumeration (`isTransientBackendError`); `STALE_EPOCH`/auth/unknown stay fatal. |
| q3 | Idle poll/heartbeat outage: what to do? | Retry a few times with growing waits, then keep waiting without restarting | Bounded retries with backoff on idempotent idle calls; minimum acceptable fallback is sleep-and-continue. |
| q4 (optional) | Log visibility for ride-through? | A clear one-line note naming the cause, then keep going | One `warn`/`error` line with cause + task/project IDs per ride-through; no per-retry spam (retry attempts at debug/quiet). |

## Approach

Follow "make the change easy, then make the change", and build on the db49d6c6 containment — do NOT land a second competing catch-restructure:

1. **Easy first:** extract one shared `isTransientBackendError(err)` classifier (single home for the explicit non-fatal set) plus shared test fixtures (502-shape stub, dropped-socket stub), with zero behavior change. Land this refactor green before touching behavior.
2. **Then the change:** add one narrow branch in the `executeAssignment` catch using the classifier (interrupt-with-reason + return), mirroring the `WORKTREE_CAP_REACHED` block shape; same one-branch treatment for the `executeIntegrationAssignment` catch (parity, decided in Key Decision 4).
3. **Then the idle loop:** transient-aware handling in the `dispatchClaim` catch (backoff + re-poll, no idle-budget consumption); verify the heartbeat timer path already tolerates outages (it warns-and-continues today) and add bounded join-time retries only if the Step 0 probe shows join is a live crash path.
4. **Then proof:** `runner/client.backendOutage.test.js` + daemon boundary tests, registration in `scripts/run-tests.mjs`, red→green runs, full gates, rollout/confirm plan.

No new dependencies, no new config flags (backoff constants are module-local), no schema/wire changes (the interrupt `reason` field already exists).

## Evidence (what the research established)

Verified in-repo this session (line numbers are the current checkout — re-verify at implementation time):

- **In-assignment catch:** `executeAssignment` catch (`runner/daemon.js` ~2296–2453) special-cases `STALE_EPOCH` (rethrow, line 2298), `WORKTREE_CAP_REACHED` (interrupt-with-reason + return, lines 2299–2315), deterministic gitFailure (report + return, lines 2316–2376), `failedOutcome` (failed completion, lines 2377–2428), then the generic path: flush, best-effort interrupt with reason, **`throw err`** (lines 2441–2452). The S4 branch slots in just before the generic path, copying the `WORKTREE_CAP_REACHED` block shape.
- **db49d6c6 containment already landed (build on it):** `runDispatchLoop` wraps `executeAssignment` in try/catch (~3097–3153): `STALE_EPOCH` rethrows, anything else is logged and contained. So in dispatch mode a rethrow no longer exits — but the stage brief's crash path is still live in three places: (a) `dispatchClaim` unknown errors `throw err` at line 3018 → loop exits → systemd restart (this is the 366→367 crash-cycling); (b) `runSingleAssignment` has no loop, so any rethrow exits non-zero; (c) `joinAndHeartbeat` failures before the loop starts exit the process. S4 must target exactly these, not rework the db49 catch.
- **Client error shapes** (`runner/client.js` `call`, lines 17–40): non-2xx throws `Error` with `statusCode = res.status` and `code = data?.code ?? null` — so a 502 arrives as `{ statusCode: 502, code }`. A dropped socket / refused connection rejects `fetchImpl` itself (raw `TypeError: fetch failed`, `ECONNREFUSED`/`ECONNRESET` causes) with no `statusCode`. The classifier must cover both shapes.
- **Heartbeat already tolerates outages:** the periodic timer (`deliverSteers(...).catch(warn)`, lines 1241–1245) and claim renewal (`claimHeartbeat(...).then(warn)`, lines 796–808) both warn-and-continue; heartbeat failures ride the lease TTL. The idle-loop crash-cycling is the dispatch-poll path, not the heartbeat path.
- **Integration parity site:** `executeIntegrationAssignment` catch (~2655–2697) ends in the same interrupt + `throw err` (lines 2687–2696).
- **Fatality contract pinned by an existing test:** `runner/daemon.test.js` "never idles out with dispatchIdleLimit 0" throws a generic `persistent-loop-probe` error from `dispatchClaim` and asserts the loop rejects — unknown dispatch errors MUST keep throwing after S4 (consistent with q2). S4's dispatch branch must only catch the classifier-positive set.
- **Test seams to reuse:** `stubClient` / `fakeHarness` / `localRepo` / `loopConfig` helpers and the `waitFor` polling helper in `runner/daemon.test.js`; `stubFetch` + `ok`/`fail` helpers in `runner/client.test.js`.
- **Test registration:** `scripts/run-tests.mjs` "Unit Tests (runner)" (~lines 460–491) names every `runner/*.test.js` explicitly, and `tests/run-tests.test.mjs` pins that every suite file on disk is registered — a new `runner/client.backendOutage.test.js` must be added to that list or the gate fails.
- **Evidence gap (does not block):** the cited source-research folder `docs/tasks/2e663986-aaf3-4afe-8dcf-3adad34acdb4/` (`RESPONSE.md` S4, `WIDE_NET_ANALYSIS.md` Cause 4, `TDD-TEST-EXAMPLES.md`, `GUIDE-04-backend-unreachable-502.md`, `RESPONSE_SURVEY.md` q5) is absent from this checkout (verified: no such folder; repo-wide search for `backend-unreachable|WIDE_NET|Backend 502` finds nothing). The GUIDE-04 §2/§3 test shapes are therefore reconstructed from the stage brief plus the in-repo client shapes above; Step 0 re-derives the exact 502/dropped-socket fixtures from `runner/client.js` and Node fetch behavior rather than trusting the brief's prose. If the folder exists upstream, pull it in Step 0 and reconcile (shapes should match; any conflict is resolved in favor of the observed client behavior).

## Key Decisions

1. **Explicit non-fatal enumeration, never an inverted catch-all (survey q2).** One `isTransientBackendError(err)` predicate owns the set: `statusCode ∈ {502, 503, 504}` OR a network-layer failure (fetch rejection: `TypeError: fetch failed`, `ECONNREFUSED`/`ECONNRESET`/`ETIMEDOUT`/`EAI_AGAIN`/socket-hangup causes — exact list fixed in Step 0 from observed shapes). Everything else falls through to today's generic path. New failure modes stay loud by construction.
2. **Classifier lives next to the client, used by the daemon.** Recommended: export from `runner/client.js` (it defines the error shapes) and import in `runner/daemon.js`. Rejected: duplicating status checks at each catch site (drifts), or putting it in `shared/` (runner-only concern; no backend/wire change).
3. **In-assignment branch = interrupt-with-reason + return, copying `WORKTREE_CAP_REACHED`.** Return shape `{ interrupted: true, executionId, epoch, reason, transient: true }` so the loop (and logs) can distinguish outage ride-through from other interrupts. The `transient` flag is additive and internal-only.
4. **`executeIntegrationAssignment` gets the same branch (parity).** Same classifier, same interrupt+return shape. Cost is a few lines; leaving it out would keep "backend restart kills an integrate job's process" as a known hole. (Single-shot mode still ends the process either way — see Decision 6.)
5. **Idle loop: bounded retries with backoff on idempotent calls (survey q3), minimum sleep-and-continue.** `dispatchClaim` classifier-positive errors: retry up to N (recommended 3) with growing waits (recommended 1s→2s→4s, capped at `pollMs`), then keep waiting (back off one `pollMs` and re-poll) without consuming idle budget and without exiting — mirroring the existing 429/`RUNNER_PAUSED` branches (lines 2980–2997). Join-time (`joinAndHeartbeat`) transient failures: add the same bounded retry at startup only if the Step 0 probe confirms join is a live crash path during outages; otherwise document as a follow-up, not scope creep.
6. **Fatal set unchanged: `STALE_EPOCH`, auth/credential failures, unknown errors.** `STALE_EPOCH` keeps propagating in all three catches (epoch fencing). Auth failures (401/credential rejection) exit loud — retrying them would spin forever on a revoked credential. Unknown errors keep the generic interrupt+rethrow path (and the `persistent-loop-probe` test keeps passing unmodified). `runSingleAssignment` keeps its non-zero-exit contract: a transient-interrupted result there maps to a clean non-zero exit with the reason (the process must end anyway with no loop to continue; the win is the task is released WITH a reason instead of crashing). Confirm this mapping in Open Questions if CI callers need `interrupted:true` to read as success.
7. **One-line log per ride-through (survey q4).** `logger.warn` (or `logger.error` where the sibling branches use it — match the `WORKTREE_CAP_REACHED` sink) naming cause + `projectId/taskId`; retry attempts stay quiet (or debug-level) so a 37s outage window does not spam the journal.

## Steps

### Step 0 — Recon and reproduce (research; no behavior change) — biggest risk, first

- Re-verify all line numbers above on the implementation checkout; confirm the db49 loop catch is present and that `dispatchClaim` line ~3018 is still the idle crash path.
- Confirm fatal-code facts: which `code`/`statusCode` the backend sends for auth/credential rejection (401? `ROTATE_INVALID_STATE`? — read the backend runner-auth path) so the classifier provably excludes them; confirm `STALE_EPOCH` surfaces as `code` on 409 (already pinned by `client.test.js`).
- Derive the exact dropped-socket shapes: stub `fetchImpl` to reject the way Node fetch does on refused/reset connections and record `{ name, message, code, cause }` — these become the classifier's network set and the GUIDE-04 §2 fixtures. Check the Node version in `.node-version`/CI: undici error text differs across versions, so match on stable signals (`code`/`cause.code` + `statusCode` absence), not message substrings alone.
- If reachable, pull the upstream `2e663986-...` folder and reconcile GUIDE-04 §2/§3 shapes with the observed client behavior (observed behavior wins on conflict).
- Write a throwaway repro (under `/tmp`, not committed): stub client whose `complete`/`progress` throws a 502 mid-assignment → run `executeAssignment` (or the loop with `dispatchIdleLimit` bounded) → confirm today's interrupt+rethrow/exit; stub `dispatchClaim` to throw 502 → confirm the loop exits today. This is the red baseline for Steps 2–3.
- Depends on: nothing. Validates: problem statement still accurate; classifier inputs fully enumerated before any branch is written.

### Step 1 — Make the change easy: extract classifier + fixtures (refactor; no behavior change)

- Add and export `isTransientBackendError(err)` in `runner/client.js` (name to match repo conventions at implementation time; MARK/JSDoc comment block per repo style). Pure predicate, no logging, no dependencies.
- Add unit tests for the classifier (in the new `runner/client.backendOutage.test.js` file, or `runner/client.test.js` if that reads better — decide at implementation time; the outage file must exist regardless for Step 4): 502/503/504 (with and without backend `code`), dropped-socket shapes from Step 0, and negatives: `STALE_EPOCH`/409, 401/auth, 429, 500 (deliberately NOT transient — 500 is a backend bug, stays loud), generic `Error`, `WORKTREE_CAP_REACHED`.
- Add shared stub fixtures (`fail(502, ...)`, `fetchImpl` rejecting with socket-shape) for daemon tests to reuse.
- Depends on: Step 0. Validates: `node --test runner/client.test.js runner/client.backendOutage.test.js` green; `git diff` shows no behavior change (classifier unreachable from any catch yet).

### Step 2 — Make the change: in-assignment transient branch (interrupt + return)

- In `executeAssignment`'s catch (`runner/daemon.js` ~2296–2453), insert the transient branch after the `failedOutcome` block and before the generic flush/interrupt/rethrow path: `if (isTransientBackendError(err))` → best-effort flush (copy the sibling pattern), best-effort `client.interrupt` WITH the redacted reason (best-effort: the interrupt itself may 502 — swallow, lease TTL bounds it), one-line warn log (survey q4), `return { interrupted: true, executionId, epoch, reason, transient: true }`.
- Same branch in `executeIntegrationAssignment`'s catch (~2655–2697), adapted to its locals (`integrationExecutionId`/`integrationEpoch` untouched; task interrupt uses task `executionId`/`epoch` as the sibling code does).
- Audit `runSingleAssignment`: map a transient-interrupted result to a clean non-zero exit carrying the reason (Decision 6). Keep `STALE_EPOCH` propagation and all other branches byte-identical.
- Depends on: Step 1. Validates: Step 0 repro now returns instead of throwing; new daemon tests (Step 4) fail-before/pass-after.

### Step 3 — Idle loop: transient-aware dispatch polling (bounded retries + backoff)

- In `runDispatchLoop`'s `dispatchClaim` catch (~2976–3020), add a classifier-positive branch before the final `else { throw err }`: bounded retries (recommended: up to 3 attempts, 1s→2s→4s backoff) then — whether retries are exhausted or skipped per the minimum fallback — `polls += 1`, one-line log, `sleep(pollMs)`, `continue` WITHOUT consuming idle budget (same shape as the 429/`RUNNER_PAUSED` branches). Unknown errors still hit `throw err` (the `persistent-loop-probe` test must pass unmodified).
- Verify (no change expected): heartbeat timer and claim-renewal paths already warn-and-continue. Probe join-time: if `joinAndHeartbeat` transient failure is a live crash path, wrap it with the same bounded retry; if the probe shows it is rare/unverifiable, record as a follow-up instead of gold-plating.
- Depends on: Step 1 (Steps 2 and 3 are independent of each other once the classifier exists; sequence 2 before 3 so the in-assignment fix lands first). Validates: stub `dispatchClaim` to 502 twice then succeed → loop survives and processes work; stub it to 502 persistently with bounded `dispatchIdleLimit`... (note: transient backoff must not consume idle budget, so bound this test by polls/success instead of idling out).

### Step 4 — Tests: outage suite + fatality boundary + registration

- Create `runner/client.backendOutage.test.js` (GUIDE-04 §2 reconstructed): 502 shape through the real `createRunnerClient.call` path (stub `fetchImpl` returning `{ ok: false, status: 502 }`), dropped-socket shape (`fetchImpl` rejecting), and recovery (fail N times then succeed → client usable again, no wedged state).
- GUIDE-04 §3 fatality-boundary test (flipped red): drive `executeAssignment` (or the dispatch loop with a one-assignment harness fake, reusing `stubClient`/`fakeHarness`/`loopConfig` from `daemon.test.js`) with a stub backend call throwing transient → assert returned (not rethrown), interrupt carried the reason, loop kept polling; with `STALE_EPOCH` → assert still rethrown (`expect(rethrown).toBe(false)` transient / `toBe(true)` stale-epoch). Place daemon-level tests in `runner/daemon.test.js` beside the existing `runDispatchLoop` block; keep client-level shapes in the outage file.
- Register `runner/client.backendOutage.test.js` in `scripts/run-tests.mjs` "Unit Tests (runner)" args list (alphabetical position beside `runner/client.test.js`).
- Prove red→green: run the new tests against the pre-Step-2/3 code (stash the branches) to confirm they fail, then with the branches to confirm they pass. Record both outputs in the task docs.
- Depends on: Steps 2–3. Validates: `node --test runner/client.backendOutage.test.js runner/daemon.test.js runner/client.test.js` green; `tests/run-tests.test.mjs` registration pin green.

### Step 5 — Docs, hygiene, full gates, and rollout/confirm plan

- Docs: short note in `runner/README.md` if it documents loop failure handling (transient backend errors ride through with interrupt+reason; `STALE_EPOCH`/auth/unknown stay fatal); keep MARK/JSDoc on touched functions accurate. No wire/API doc changes (no contract change).
- Hygiene: `git diff --stat` + grep review — only `runner/client.js`, `runner/daemon.js`, `runner/client.backendOutage.test.js`, `runner/daemon.test.js`, `scripts/run-tests.mjs`, and docs touched. No second catch-restructure: the db49 loop catch stays exactly as-is (verify by diff).
- Full gates: focused files, then `npm test` (root gate incl. the runner suite), plus any lint gate configured for `runner/` (check `package.json` scripts/CI at implementation time).
- Rollout/confirm (post-merge, needs permission — PROD-READ-ONLY): E4 timestamp-join on `db24c124`, `1f8959ca`, `f56e9878`, `ef21e99b`, `bae668cb`; then after rollout, compare runner-journal crash-restart rate across a backend restart window before/after while assignment success holds. Do NOT run these without the permission grant; the implementation is verifiable without them.
- Depends on: Step 4.

## Validation Plan

| Check | Command / evidence | Expected |
|-------|--------------------|----------|
| Classifier unit tests | `node --test runner/client.backendOutage.test.js` (classifier block) | Transient positives pass; `STALE_EPOCH`/401/429/500/generic negatives pass |
| Outage shapes (GUIDE-04 §2) | Same file (502 shape, dropped-socket shape, recovery) | Fail-before / pass-after recorded |
| Fatality boundary (GUIDE-04 §3) | `node --test runner/daemon.test.js` (new boundary tests) | Transient returns + interrupt-with-reason + loop polls on; stale-epoch rethrows |
| No-regression on unknown | `node --test runner/daemon.test.js` (`persistent-loop-probe` test) | Passes unmodified — unknown dispatch errors still throw |
| Focused client tests | `node --test runner/client.test.js` | All pass (classifier export does not disturb existing shapes) |
| Registration pin | `node --test tests/run-tests.test.mjs` (or via `npm test`) | Green with the new suite file listed |
| Full unit gate | `npm test` | Green (runner suite included via `scripts/run-tests.mjs`) |
| Scope audit | `git diff --stat` + grep `isTransientBackendError` in `runner/` | Only the files listed in Step 5; db49 loop catch untouched |
| Manual repro | `/tmp` script from Step 0 re-run post-fix | Mid-assignment 502 → interrupt+return; dispatch 502s → backoff + re-poll, no exit |
| Prod confirm (needs permission) | E4 timestamp-join; journal crash-restart rate vs assignment success | Restart rate drops across backend windows; success holds |

Highest-risk validation: the Step 4 daemon boundary tests — `runDispatchLoop` is poll-driven, so bound the loop deterministically with the existing `stubClient`/`loopConfig({ dispatchPollMs: 1, dispatchIdleLimit })` seams (never wall-clock sleeps); follow the existing `runDispatchLoop` tests' count-then-succeed stub pattern.

## Risks

- **Over-matching the classifier (q2 trade-off):** an over-broad network set could swallow an auth or fencing failure and spin instead of exiting loud. Mitigation: allowlist only `502/503/504` + observed socket shapes; explicit negative tests for 401/`STALE_EPOCH`/429/500; match on stable `code`/`statusCode`, not message substrings.
- **Under-matching on undici version drift:** fetch-failure text varies by Node version. Mitigation: Step 0 derives shapes on the repo's pinned Node; predicate prefers `cause.code`/absence-of-`statusCode` signals.
- **Poison-task flap:** after S4, a persistently-502ing backend call re-queues the task each attempt (runner survives, task flaps until the backend heals). Strictly better than a restart storm; consecutive-failure backoff is out of scope (see Non-goals).
- **Interrupt-during-outage is best-effort by necessity:** the ride-through interrupt itself may 502; the lease TTL is the backstop (same as every sibling branch). The one-line log preserves discoverability.
- **Missing source research:** GUIDE-04 §2/§3 shapes are reconstructed (see Evidence gap). Mitigation: shapes are re-derived from the observed client code in Step 0; reconcile with upstream docs if they surface.

## Non-goals

- Any change to the db49d6c6 loop-level catch (it stays exactly as-is) or to `interrupt` → `complete(failed)` routing for generic errors.
- Retrying non-idempotent calls (`complete`, `interrupt` stay single-attempt best-effort); retries apply only to idempotent idle calls (dispatch poll, and join/heartbeat only per Step 3's probe).
- Consecutive-failure backoff/circuit-breaking for flapping tasks; treating HTTP 500 as transient.
- `--no-verify`, worktree, hook, or systemd unit changes.
- Running the PROD-READ-ONLY E4 timestamp-join or journal analysis without the permission grant.

## Open Questions

1. **Survey confirmation:** `SURVEY.md` answers are empty — confirm the four adopted recommended options (q1 stay-alive+report, q2 transient-only survival, q3 bounded backoff retries, q4 one-line log). If q3's simpler "just wait and re-check" is preferred, Step 3 collapses to the sleep-and-continue minimum with no retry counter. (Default if unanswered: proceed as planned.)
2. **Single-shot mapping (Decision 6):** confirm transient-interrupted in `runSingleAssignment` should exit non-zero with the reason (recommended, preserves the CI contract) rather than exit 0. If 0 is required, Step 2 skips the mapping.
3. **Retry budget (Decision 5):** confirm 3 attempts / 1s→2s→4s backoff for dispatch-poll retries, or name other bounds. Any reasonable bound fits the same code shape.
4. None other — all technical facts above were verified in-repo this session except the noted source-folder gap.

## Work estimate / sequencing note

Big/research pieces first per the stage brief: Step 0 (chain verification + exact error-shape derivation + upstream doc reconcile) and the Step 3 join-time probe are the riskiest and come before/around the small behavior edits. Steps 1–3 are small and mechanical once the classifier set is fixed. Total: 5 implementation steps + gates, all in `runner/client.js`, `runner/daemon.js`, `runner/client.backendOutage.test.js`, `runner/daemon.test.js`, `scripts/run-tests.mjs`, plus a short `runner/README.md` note and the post-rollout confirm (permission-gated).
