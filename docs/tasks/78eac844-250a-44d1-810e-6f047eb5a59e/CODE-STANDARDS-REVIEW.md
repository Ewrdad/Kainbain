# Code-standards review — S4 branch vs `main` (this task's branch)

Task: `78eac844-250a-44d1-810e-6f047eb5a59e` — "Make in-assignment transient backend errors non-fatal to the runner (S4)". Branch `kb/78eac844-250a-44d1-810e-6f047eb5a59e` reviewed against `main` (`origin/main` / `main`; there is no `master` ref in this checkout — `main` is the comparison base). Standards file: `docs/KB Code Standards.md`, read together with its referenced detailed copy `docs/agent-docs/KB-Code-Standards.md` (§Documentation/Jsdoc). This stage is docs-only; no source was modified — this review was produced by read-only inspection and test runs.

## Scope reviewed (`git diff main...HEAD --stat`)

- `runner/client.js` (+53) — new `TRANSIENT_BACKEND_STATUSES`, `TRANSIENT_NETWORK_CODES`, exported `isTransientBackendError(err)`.
- `runner/daemon.js` (+159) — new `retryTransient`, `describeBackendOutageCause`; transient branches in `joinAndHeartbeat`, `executeAssignment`, `executeIntegrationAssignment`, `runSingleAssignment`, `runDispatchLoop`.
- `runner/client.backendOutage.test.js` (new, 202 lines), `runner/daemon.test.js` (+580), `scripts/run-tests.mjs` (registration), `publish.sh` (runner gate registration), `runner/README.md` (failure-handling note), `runner/version.json` (`0.2.0` -> `0.2.1`).
- Task docs under `docs/tasks/78eac844-250a-44d1-810e-6f047eb5a59e/` (implementation plan, survey, upgrade-safety review, two auto-generated reports).

The diff does **not** restructure the db49d6c6 dispatch-loop catch, per the MUST-READ constraint — verified by grep of the `runner/daemon.js` diff (only additive branches; the `else { throw err }` tail and `STALE_EPOCH` propagation remain).

## Verdict: PASS — no blocking standards violation found

Each standard below was checked against the actual diff and test runs. Minor observations are listed as notes, not failures.

### Values — user understandable over technical language

- **Long descriptive names — pass.** New identifiers are descriptive: `TRANSIENT_BACKEND_STATUSES`, `TRANSIENT_NETWORK_CODES`, `describeBackendOutageCause`, `retryTransient`, `callBackend`, `waitsMs`. The user-facing interrupt reason is plain English: `` `Backend unreachable mid-assignment: ${...}` `` (`runner/daemon.js:2513`, `:2787`) and the dispatch log `Dispatch: backend unreachable (...)` — no invented abstractions.
- **Technical language — pass.** No new "factory"/"barrel"/pattern vocabulary. A case-insensitive grep for `factory|Singleton|Strategy|Observer|design pattern` over `runner/client.js` + `runner/daemon.js` finds only the pre-existing comment "module singleton" (`runner/daemon.js:1055`), untouched by this branch. The word "transient" is the domain term from the task brief, used consistently with the test file header (`GUIDE-04 section 2/3` references) and `runner/README.md`.
- **Common language profile — pass.** `task`, `assignment`, `runner`, `backend`, `interrupt` are used in their established senses; nothing is renamed.
- **File structure reflects call stack — pass.** The classifier lives in `runner/client.js` (the file that defines the `{ statusCode, code }` vs raw-fetch-rejection error shapes) and `runner/daemon.js` imports it (`runner/daemon.js:47`). This is the correct call-hierarchy direction (daemon -> client), not an inversion.
- **JSDoc plain English + `@example` + MARK — pass, gate-verified.** Every new export/helper carries `MARK:` + `@description` + `@example` + `@param`/`@returns`:
  - `MARK: isTransientBackendError` (`runner/client.js:24-38`) with `@example isTransientBackendError(Object.assign(new Error('x'), { statusCode: 502 })) => true`,
  - `MARK: retryTransient` (`runner/daemon.js:1106-1121`),
  - `MARK: describeBackendOutageCause` (`runner/daemon.js:1135-1149`),
  - new suite header `MARK: backend-outage tests` (`runner/client.backendOutage.test.js:5-11`).
  - Live gate: `node scripts/check-jsdoc-example.mjs` -> `jsdoc-@example: PASS (679 missing, baseline (680 grandfathered))`. The new export is not added to the grandfather baseline, as the standard requires.
- **Why, not just what — pass.** JSDoc and inline comments explain the reason: e.g. client.js "Deliberately NOT matched: bare TypeError: fetch failed ... ambiguous failures stay loud rather than spinning the loop forever"; daemon.js "Bounded by construction, never infinite ... so a caller bug can never mask the backend's answer"; "The `transient` flag is additive and internal". The README note explains the ride-through in operator terms.
- **Labelled data-inport pattern `({varA,varB}) => {}` — pass (one acceptable note).** The two daemon helpers follow it exactly: `retryTransient({ callBackend, waitsMs = [] } = {})` (`runner/daemon.js:1121`), `describeBackendOutageCause({ error } = {})` (`runner/daemon.js:1149`). Note: `isTransientBackendError(err)` (`runner/client.js:38`) takes a single positional parameter. This matches existing repo precedent for one-argument predicates (`isModelsPinned(config)`, `isRunnableFile(...)`) and satisfies "Give the minimum data to each function" — a single-error predicate has no second field to label. Not a violation.

### Functional over object-oriented

- **No classes, no pattern framing — pass.** `grep -n "^class "` over both runtime files returns nothing. Functions are plain `function`/`async function` declarations, black-box with explicit inputs.
- **Black-box / immutable — pass.** `isTransientBackendError` is a pure predicate ("no logging, no dependencies" in its own description) that only reads `statusCode`/`code`/`cause.code`. `describeBackendOutageCause` only reads and redacts. Return values in the transient branches are fresh literals (`{ interrupted: true, executionId, epoch, reason, transient: true }` at `runner/daemon.js:2521` and `:2796`) — no mutation of shared state; the `transient` flag is additive/internal as the plan specified.
- **Verb-named functions — pass with note.** `retryTransient` and `describeBackendOutageCause` begin with verbs. `isTransientBackendError` is an `is-` predicate; the standard's "always named with a verb" is strictly a deviation here, but it follows the file's established predicate convention (`isModelsPinned`, `isRunnableFile`) — changing a predicate to a verb would break the convention the standard also asks for ("common language profile"). Not a failing violation.

### Co-location over abstraction

- **Tests next to the file — pass.** New `runner/client.backendOutage.test.js` sits beside `runner/client.js`; daemon boundary tests are appended in `runner/daemon.test.js` beside the existing `runDispatchLoop`/`runSingleAssignment` blocks, reusing `stubClient`/`fakeHarness`/`loopConfig`.
- **Helpers at the lowest common folder — pass.** `retryTransient`/`describeBackendOutageCause` are defined in `runner/daemon.js` (their sole user) and `isTransientBackendError` in `runner/client.js` (owner of the error shapes). No `shared/` leakage for a runner-only concern.
- **Abstraction only when repeated / non-trivial — pass.** Both helpers are used three times each (register, heartbeat, dispatch poll for `retryTransient`; executeAssignment, executeIntegrationAssignment, dispatch backoff for `describeBackendOutageCause`) and each contains non-trivial logic (a bounded retry loop with `isTransientBackendError` gate; a cause-chain walk), so they clear the standard's "don't abstract a single line unless it has complex logic" bar. Both mirror an existing sibling shape (`WORKTREE_CAP_REACHED` report-and-return, 429/`RUNNER_PAUSED` backoff) rather than inventing a layer.
- **Searchability — pass.** `isTransientBackendError` is the single grep-able home for the non-fatal set; all four catch sites call it. No status/close-code checks are duplicated inline.

### Tested over trusted

- **Tests planned and evidenced — pass, verified by execution in this review:**
  - `node --test runner/client.backendOutage.test.js` -> 9 pass / 0 fail (classifier boundary: gateway positives, socket-code positives incl. nested/cyclic causes, STALE_EPOCH/auth/429/500/501 negatives, bare-`fetch failed` stays loud; wire shapes: 502 json + proxy-HTML, 503/504, dropped socket, recovery).
  - `node --test runner/daemon.test.js` -> 180 pass / 0 fail, including the S4 boundary tests (transient returns with interrupt-with-reason and loop keeps polling; STALE_EPOCH/auth/unknown still rethrow; join ride-through and exhaustion; dispatch backoff without consuming idle budget; integration parity).
  - `node --test runner/client.test.js` -> 16 pass / 0 fail (no disturbance to existing client shapes).
  - Registration pins now green: `node --test tests/publish.test.mjs tests/run-tests.test.mjs` -> 68 pass / 0 fail. (The earlier `automated-tests-failure-20261123-092217.md` Harness-Self-Tests failure was the `publish.sh` runner gate missing the new suite; the current HEAD registers it in both `scripts/run-tests.mjs` and `publish.sh` and the pin passes — resolved, not open.)
- **Lowest level first, black-box, user-shaped — pass.** The outage suite exercises the real `createRunnerClient.call` path with a stubbed `fetchImpl` (GUIDE-04 §2 shapes); daemon tests drive real `runDispatchLoop`/`runSingleAssignment` with temp git repos and a fake harness (lowest level that proves the loop behavior; no live AI agent, no ports). Assertions are primarily behavioral (returned vs rethrown, interrupt carried the reason, assignments continue); the two log-capture assertions confirm the survey q4 "one-line note naming the cause" — consistent with "failures should be clear, transparent and observable" and with the existing suite's logger-capture style.
- **Fatality boundary is explicit — pass.** The classifier enumerates 502/503/504 + named network codes and falls through to false for everything else (STALE_EPOCH 409, 401/403, 429, 500, 501, unknown, non-thrown values). Tests pin both sides, including the flipped-red boundary (`rethrown === false` transient / `true` stale-epoch) by behavior, so new failure modes stay loud by construction.

### Fast iteration / blast radius

- The change is additive and narrow: no new dependencies or flags, no wire/schema change (`reason` field already existed), version bump `0.2.0` -> `0.2.1` with unchanged `requires.backendApi`, matching the upgrade-safety review (`UPGRADE-SAFETY-REVIEW.md` verdict PASS). The only error-text change an existing install could observe is the single-shot failure message (`Backend unreachable mid-assignment: ...` instead of the raw 502) — still a non-zero exit, noted there as not an install break.

## Notes (non-blocking, no action required unless a future edit touches the file)

1. `isTransientBackendError(err)` is positional while sibling helpers use the labelled object pattern — acceptable for a single-argument predicate (see above); a future multi-field extension should adopt `{ error }`.
2. `catch (err)` / `err` short names follow the surrounding file's convention (94 occurrences in `runner/daemon.js`); the standard's "long names where needed" is satisfied by the descriptive module-level identifiers.
3. `describeBackendOutageCause` mirrors the classifier's cause-chain walk (depth 4 in both). The duplication is 6 lines and flagged by its own comment; the standard's "don't fear repetition" permits it, and a shared walk helper would risk drifting on the deliberately-different semantics (first-found code vs recognized code).

## Evidence trail

- Diff base: `main` (no `master` ref exists in this checkout); `git diff main...HEAD --stat` = 15 files, 2644 insertions, 11 deletions — only the runner, its gates, README, version, and task docs.
- Gates run in this review: `node scripts/check-jsdoc-example.mjs` PASS; `run-tests`/`publish` pin tests 68 pass; `client.backendOutage` 9 pass; `client` 16 pass; `daemon` 180 pass.

KAINBAIN_VERDICT: PASS
