# IMPLEMENTATION_PLAN — Isolate API tests from the live accessibility-feedback inbox (residual D9 of 99ccc12f)

Task: `b3dec9b0-1319-45ed-bb7e-2ff2c484a7ae` · Residual D9 of task `99ccc12f-7d71-4781-9b81-9d2902367fba` ("Isolate API tests from live engine state files").
Parent plan: `docs/tasks/99ccc12f-7d71-4781-9b81-9d2902367fba/IMPLEMENTATION_PLAN.md` §3 (bypasses) + §8 D9 ("audit, do not fix here — record residuals for follow-up"). This ticket is that follow-up, scoped to exactly one residual: `api/routes/accessibility.js`.

## 1. Goal

No API test may read or write the live user inbox `~/.kainbain/accessibility-feedback.jsonl`. After this change the standard suite runs fully against a per-test temp inbox file, and any future code path that resolves the live inbox path under test fails loudly instead of silently polluting real user data — the same bug shape `99ccc12f` fixed for `durableState.test.js`, now closed for `accessibility.test.js:271-274`.

## 2. Success Criteria

1. `api/testSetup.isolation.js` pins the feedback inbox at a per-file temp path before config loads, so no suite in the standard run can reach the live fallback.
2. A structural guard throws when `VITEST` is set and the resolved inbox path is the live `~/.kainbain/accessibility-feedback.jsonl` (survey q1: stop the test with a clear error).
3. `api/routes/accessibility.test.js:269-275` no longer asserts the live fallback path; it asserts the throw/temp path instead (explicit wins, configured/temp wins, fallback throws under `VITEST`, fallback still works when `VITEST` is unset).
4. Guard test written first FAILS on current code (resolving the fallback under `VITEST` returns the live path without throwing), then PASSES after the fix.
5. Full `api` suite passes with the guard active; lint passes.
6. Verification runs leave the live inbox byte-identical (snapshot/restore around every red-run; content + mtime comparison).

## 3. Verified current-state evidence (read 2026-11-14 on branch kb/b3dec9b0-*)

- Root cause CONFIRMED: `api/routes/accessibility.js:78-83` `resolveFeedbackFile(configuredPath)` returns `path.join(os.homedir(), ".kainbain", "accessibility-feedback.jsonl")` whenever `configuredPath` is empty/non-string. It reads NO `KAINBAIN_*` env var itself — it depends entirely on its caller passing `config.accessibilityFeedbackFile`.
- The schema key ALREADY EXISTS (`api/config/schema.js:1931-1938`: `key: "accessibilityFeedbackFile"`, `env: "KAINBAIN_ACCESSIBILITY_FEEDBACK_FILE"`, `default: ""`), so the "add an override" work is pinning + guarding, not schema design. No new env-var name, no new schema entry, no new config key (survey q2 answered by the existing full-file-path setting).
- The pin is MISSING: `grep KAINBAIN_ACCESSIBILITY_FEEDBACK_FILE api/testSetup.isolation.js` prints nothing, and `api/isolatedTestRoots.js` does not set it either. `testSetup.isolation.js` pins circuit, registry, prompt-layout, all four engine files, and auth — but not the inbox. Under the standard setup `config.accessibilityFeedbackFile` therefore snapshots to `""` and every app-booted route (`api/index.js:328` registers `accessibilityRoutes` with `{ deps }` only, no `feedbackFile` opt) resolves the LIVE inbox via `accessibility.js:276`.
- The guard does NOT cover it: `throwIfLiveEnginePathUnderTest` (`api/flow/resolveStatePath.js:60-73`) only throws for paths at/under `~/.kainbain/engine/` (via `isLiveEnginePath`). The inbox lives at `~/.kainbain/accessibility-feedback.jsonl` — outside `engine/` — so the guard is a no-op for it. `api/auth/accessConfig.js:82-85` shows the reuse pattern (a sibling resolver calling the shared guard), but no equivalent call exists in `accessibility.js`.
- The test encodes the bug CONFIRMED: `api/routes/accessibility.test.js:269-275` asserts `resolveFeedbackFile("")` IS the live home path and `resolveFeedbackFile(null)` contains `"accessibility-feedback.jsonl"` — the exact shape `99ccc12f` §3 called out for `durableState.test.js:21-23` (asserting the live fallback under `VITEST`).
- Blast-radius note: most POST suites pass an explicit per-test `feedbackFile` (`buildApp({ feedbackFile: path.join(tmpDir, "inbox.jsonl") })`, `accessibility.test.js:43-52`), so they are safe by the explicit-wins branch. The exposed paths are (a) the helper unit test above, and (b) ANY suite that boots the full app (`api/index.js`) without a `feedbackFile` opt and hits `POST /accessibility/feedback` — that request `mkdir -p ~/.kainbain && appendFile(live inbox)` on real user data.
- Prior-stage inputs: `SURVEY.md` exists in this task folder and is factored in below (§4, all three answers). The `idea-20261113-231218.md` file named in the stage brief DOES NOT EXIST in this checkout (only `SURVEY.md` is present) — no idea-file content to reconcile; if it appears after a sync, re-read before coding.

## 4. Key decisions (survey-grounded)

| # | Decision | Choice | Why |
|---|----------|--------|-----|
| D1 | Failure mode when a test reaches the live inbox (survey q1) | Throw a clear error under `VITEST` (Recommended won) | Matches the `99ccc12f` guard contract; silent redirect would hide the next bypass the way the live fallback hid this one |
| D2 | Override shape (survey q2) | Full file path via the EXISTING `KAINBAIN_ACCESSIBILITY_FEEDBACK_FILE` (Recommended won) | Schema key already exists with `type: "path"`, `default: ""`; a dir-var would be a second knob for one file and would need new schema/config plumbing for zero benefit |
| D3 | Fix width (survey q3) | Only this one feedback file (Recommended won) | Task text and success line scope to `accessibility-feedback.jsonl`; a `~/.kainbain/`-wide guard is rejected — it would re-scope unrelated stores (projects registry, prompt layout) that already have their own pins |
| D4 | No new env var / schema key | Reuse `KAINBAIN_ACCESSIBILITY_FEEDBACK_FILE`; work is pin + guard + test | Verified present in schema (§3); adding an alias or dir-var duplicates the contract and touches non-owned config surface |
| D5 | Guard placement and predicate | Narrow `isLiveAccessibilityFeedbackPath` + `throwIfLiveAccessibilityFeedbackPathUnderTest` beside the engine guard in `api/flow/resolveStatePath.js` (or exported from `accessibility.js` if the owner prefers), called from `resolveFeedbackFile` on EVERY return branch | Exact-file comparison (`path.resolve` vs `path.resolve(homedir/.kainbain/accessibility-feedback.jsonl)`, trim + win32 case-fold mirroring `isLiveEnginePath`); guarding every branch (not just the fallback) also catches an explicit/configured value that literally points at the live file |
| D6 | Temp basename | Keep the real basename (`accessibility-feedback.jsonl`) in a fresh `mkdtempSync` dir, mirroring `makeTempEngineStateFile` | Same rationale as `99ccc12f` D3: any present or future basename assertion keeps passing; the temp path is recognisable in failure output |
| D7 | Per-file helper (`isolatedTestRoots.js`) | Mirror-only IF the file already gains an accessibility block; otherwise setup backstop alone suffices | The POST suites already pass explicit `feedbackFile`; the backstop is the fix seam (same reasoning as `99ccc12f` D1/D2). Do not invent per-file plumbing no suite needs |
| D8 | Red-run safety | Snapshot the live inbox (or its absence) before ANY red run; restore after; re-verify byte-identical | The fail-first demonstration itself can append to real user data; never proceed with a dirty live inbox |

## 5. Assumptions and evidence gaps

- G1 (load-bearing, cheap to re-check): Vitest sets `VITEST=true` in workers running `setupFiles`, so the guard is active in the standard suite. `99ccc12f` §8 G4 flags the same assumption with the same mitigation: one `node -e` / debug-print probe inside setup execution in Step 3; if unset there, gate on `VITEST` OR `NODE_ENV=test` exactly as the engine guard does (keep both guards' gates identical).
- G2: no suite other than `accessibility.test.js` asserts the live inbox path. Re-verify with a grep for `accessibility-feedback` / `resolveFeedbackFile` across `api/` in Step 1 — the implementer fixes each hit the same way (expect-throw / temp-path).
- G3: `config.accessibilityFeedbackFile` snapshots env at import time like the other `KAINBAIN_*` keys (the `testSetup.isolation.js` header comment states this for projects/notes; engine/auth pins rely on it). Setting the env in setup before config loads is therefore sufficient; no route-code change beyond the guard call.

## 6. Work plan — make the change easy, then make the change

Ordered big/risky first. The implementer owns: `api/testSetup.isolation.js`, `api/flow/resolveStatePath.js` (or the guard home the owner chooses), `api/routes/accessibility.js` (one guard call), plus the forced `accessibility.test.js` update.

### Step 0 — Safety snapshot (before any test runs)

1. `ls -la ~/.kainbain/accessibility-feedback.jsonl` (record exists vs absent); if present, copy to `/tmp/kainbain-a11y-inbox-snapshot-<date>/accessibility-feedback.jsonl` and record `sha256sum` + `stat -c %Y` (mtime).
2. Note whether a live engine/process is running on this host (`ps aux | grep -i kainbain`) — informs flake interpretation if the live file moves during validation.

### Step 1 — Research: re-verify the seams (small, first)

1. Re-run the §3 searches to catch tree drift: `resolveFeedbackFile` callers; `KAINBAIN_ACCESSIBILITY_FEEDBACK_FILE` setters; `accessibility-feedback` asserters; `feedbackFile:` opts in tests.
2. Confirm `api/index.js:328` still registers `accessibilityRoutes` without a `feedbackFile` opt (the production path that hits the fallback).
3. Confirm G1 (VITEST in setup) and G3 (config import-time snapshot covers the inbox key) by reading `api/config.js` loader + `api/vitest.config.js:34` setupFiles wiring.
4. Expected outcome: the only live-path asserter is `accessibility.test.js:269-275`; the only missing pin is the inbox var in setup.

### Step 2 — Make the change easy: test-first red

1. Rewrite the `accessibility.test.js` helper block FIRST (before any source edit), per survey q1 + D5:
   - `resolveFeedbackFile("/tmp/inbox.jsonl")` still returns it (explicit wins, no throw).
   - Temp/configured path (e.g. the setup-pinned temp file) never throws.
   - `resolveFeedbackFile("")` / `resolveFeedbackFile(null)` under `VITEST` THROWS with a message naming the live path and the `KAINBAIN_ACCESSIBILITY_FEEDBACK_FILE` fix.
   - Fallback still resolves the live path when `VITEST` (and `NODE_ENV=test` if adopted) is temporarily unset (save/restore env around the case) — locks in production byte-identical behaviour.
2. Run red from `api/`: `npx vitest run routes/accessibility.test.js`. EXPECTED: the new throw assertions FAIL on unpatched code (fallback returns the live path instead of throwing). Capture output as before-evidence.
3. IMMEDIATELY re-verify the live inbox against the Step 0 snapshot (`sha256sum` / absence check). Restore if touched. Do not proceed with dirty live state.

### Step 3 — Make the change, part 1: global backstop pin

1. In `api/testSetup.isolation.js`, add the temp-inbox block mirroring `makeTempEngineStateFile` (D6): mint `tempAccessibilityFeedbackFile` (`accessibility-feedback.jsonl` under `os.tmpdir()`), `process.env.KAINBAIN_ACCESSIBILITY_FEEDBACK_FILE = tempAccessibilityFeedbackFile`, export it for debuggability, with a comment cross-linking `resolveFeedbackFile`, the guard, and this task id.
2. Re-run `npx vitest run routes/accessibility.test.js`. EXPECTED: configured/temp cases green; fallback-throw cases still red (pin alone does not add the guard — that is Step 4). Live inbox untouched.

### Step 4 — Make the change, part 2: structural guard + route wiring

1. Add `isLiveAccessibilityFeedbackPath(candidatePath)` + `throwIfLiveAccessibilityFeedbackPathUnderTest({ candidatePath, callerName })` beside the engine guard (D5: exact-file compare, trim, win32 fold, no realpath — same contract notes as `isLiveEnginePath`).
2. Call it from `resolveFeedbackFile` on every return branch (explicit, configured, and fallback) with `callerName: "resolveFeedbackFile"`, so even a literal live path passed explicitly fails loudly under test.
3. Keep production byte-identical when `VITEST` is unset (guard no-ops; fallback string unchanged).
4. Run: `npx vitest run routes/accessibility.test.js flow/durableState.test.js`. EXPECTED: green, including the new throw assertions.

### Step 5 — Full-suite validation with guard active

1. Full `api` suite (`npm run test:api` from repo root, or the repo's documented api-suite command). EXPECTED: green. Any failure is either a newly caught live-inbox dependency (fix the suite's isolation — pass `feedbackFile` / rely on the setup pin — do NOT weaken the guard) or a genuine regression; triage each individually.
2. Lint the touched surface (`npm run lint --prefix api` or the repo's lint gate). EXPECTED: clean.
3. Live-inbox cleanliness: `sha256sum` / absence check vs Step 0 snapshot must match; `grep` the live file for test markers if it exists — the ONLY acceptable content is pre-existing user data identical to the snapshot.
4. If the box is slow/flaky, use `scripts/repeat-tests.mjs` for the touched suites per repo convention before declaring green.

### Step 6 — Documentation and handoff

1. Code-as-docs: MARK/JSDoc comments on the new setup block, the guard pair, the `resolveFeedbackFile` guard call, and the rewritten test, naming the 2026-11 pollution incident, this task id, and the survey-q1 invariant (live inbox access under test throws).
2. Final report must list: files changed, red/green evidence (commands + outputs), live-inbox snapshot verification, and confirmation that no test can touch `~/.kainbain/accessibility-feedback.jsonl` (grep for the live path in tests + guard-active full-suite green).

## 7. Validation plan (evidence-oriented)

| Check | Command (from `api/` unless noted) | Expected evidence |
|-------|------------------------------------|-------------------|
| Red (Step 2) | `npx vitest run routes/accessibility.test.js` on unpatched source with the rewritten test | FAIL on the new throw assertions; fallback returns the live path (then snapshot-restored) |
| Backstop (Step 3) | same command after Step 3 | Configured/temp cases PASS; throw cases still FAIL |
| Guard unit (Step 4) | `npx vitest run routes/accessibility.test.js flow/durableState.test.js` | PASS incl. new throw assertions; engine-guard suites unaffected |
| Full suite (Step 5) | `npm run test:api` (repo root) | All green with guard active |
| Lint | `npm run lint --prefix api` (repo root) | Clean |
| No residue | `sha256sum` / `ls` of `~/.kainbain/accessibility-feedback.jsonl` vs Step 0 snapshot | Identical (or still absent); no test writes |
| Static proof | `grep -c KAINBAIN_ACCESSIBILITY_FEEDBACK_FILE api/testSetup.isolation.js` | ≥1 (was 0) |

Highest-risk validation: the full-suite run (Step 5) — the guard may expose other suites that boot the full app and POST feedback without a `feedbackFile` opt; each must be fixed at the suite (use the pin), never by weakening the guard.

## 8. Risks and open questions

- R1: a live process appending to the real inbox during validation could move mtime/content — mitigated by the Step 0 process note + content comparison (test markers vs user data), same defence as `99ccc12f` D7.
- R2: `VITEST` unset in some runner context (G1) → guard silently inactive; mitigated by the Step 1 probe and the deterministic temp-path assertions (setup pin still protects even if the guard sleeps).
- R3: pre-existing live inbox content is NOT cleaned here — user data, not test residue; never delete or "clean" it as part of verification (snapshot/restore only).
- Open questions: none — survey q1–q3 all answered Recommended (throw / full file path / this file only), and all material facts were verified in-repo (§3). The absent `idea-*` file is noted, not blocking.
