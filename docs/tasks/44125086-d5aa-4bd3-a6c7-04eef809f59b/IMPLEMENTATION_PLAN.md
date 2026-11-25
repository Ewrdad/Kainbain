# Implementation plan — canary browser-closed infra-flake (task 44125086)

## 0. Context (verified facts, not assumptions)

- **Failure:** `page.goto: Target page, context or browser has been closed` thrown from the
  retry line `canary-e2e/tests/helpers.js:65` inside `waitForAppReady` (`helpers.js:51-66`).
- **Root cause of non-recovery:** the `catch` at line 63 matches five substrings
  (`ERR_INSUFFICIENT_RESOURCES|has been closed|Target closed|Page crashed|Target crashed`),
  sleeps 1s, then re-issues `page.goto` **on the same dead page**. When the whole
  browser/context died under gate-host load, the retry line itself throws.
- **Gate cost:** `retries: 0` is deliberate in `canary-e2e/playwright.config.js:211`
  ("flakes stay visible"), so 1-2 flaked tests out of ~140 red the whole gate; each red
  gate burns a ~17-minute canary run plus a full failback loop.
- **Blast radius:** 24 spec files call `waitForAppReady`/`waitForAppReadyOnProject`
  (25 grep hits including `helpers.js` itself); any signature change to the helper
  touches all of them unless hidden in fixtures.
- **Case study:** task `cf4b6847-11eb-4d59-b39e-e31b31df1150`, 4 of 5 Automated-tests
  cycles on 2026-11-19 failed on this identical signature
  (`automated-tests-failure-20261119-152819/160115/162951/170814.md`, all at
  `helpers.js:65`, 137-140 passed with 1-2 flaked) while the ticket's own suites were green.
- **Gate wiring:** `scripts/run-tests.mjs` runs the `Canary Tests` branch as
  `npm run test:canary` (25-min ceiling); verdicts land via
  `scripts/lib/fast-gate-verdict.mjs` as `verdict.json` + `canary-tests.full.log` under
  `<task-docs>/ci-fast-gate-<timestamp>/`. `canary-e2e` `test` script =
  `canary-preflight.mjs && playwright test`.
- **Quarantine status:** task `8769b002`'s flaky-test quarantine is **not present in this
  branch** — no `docs/tasks/*8769*` folder exists and no `quarantine` match exists under
  `scripts/` or `canary-e2e/` (only the unrelated git-worktree quarantine and runner
  catalogue quarantine). Spike S0 must confirm whether it lives on another branch.

## 1. Survey mapping (SURVEY.md — both rounds currently unanswered)

`SURVEY.md` round 1 (q1-q5) and round 2 (q6-q9) both have `"answers": {}`. The plan
therefore treats every survey question as an **explicit decision gate** with a
recommendation, so an answerer can override without replanning:

| Survey Q | Decision | Plan default (if still unanswered) | Where it lands |
|---|---|---|---|
| q1 fix shape (helper vs quarantine vs both) | DEC-1 | **Both, staged:** helper recovery first (smallest robust), runner-level retry/quarantine as safety net | §4 then §5 |
| q2 scope (first load only vs whole helper incl. shell wait) | DEC-2 | First-load recovery now; shell-wait (`helpers.js:71-88`) covered only by the runner lane, not a second helper path | §5 step M5 |
| q3 report surface (annotation vs log vs JSON vs all) | DEC-3 | **All three**, cheapest first: gate log line + JSON summary, then HTML annotation | §5 step M6 |
| q4 quarantine semantics (run non-blocking vs skip) | DEC-4 | Run, non-blocking on signature-only failure (a skip hides regressions) | §5 step M5 |
| q5 signature list | DEC-5 | All four families from the task text (superset of the `helpers.js:63` regex) | §3 step E1 |
| q6 spec-file churn tolerance | DEC-6 | **Zero spec changes:** recovery hidden in helper + fixture override | §2 spike S2, §4 step M2 |
| q7 signature-list home | DEC-7 | Committed data file next to canary tests, **unless** S0 finds 8769b002's home — then reuse it | §2 spike S0, §3 step E1 |
| q8 rerun granularity (failed tests only vs whole run) | DEC-8 | Failed test(s) only via Playwright `--last-failed`/JSON-driven rerun | §5 step M5 |
| q9 baseline tracking (counters per signature or not) | DEC-9 | Yes, minimal: JSON summary accumulates per-signature counts (no new service) | §5 step M6 |

If the survey gets answered before implementation, replace the defaults above; no step
order changes, only the option taken inside the named step.

## 2. Research spikes (do first — big unknowns before any behavior change)

### S0. Locate the 8769b002 quarantine seed (feeds DEC-7, DEC-1)

1. Search all branches/remotes for the quarantine seed: task folder, signature file,
   gate-script hooks (`git branch -a`, `git log --all --grep=8769b002`,
   `git grep -i quarantine $(git rev-list --all --max-count=50)` sampled sensibly).
2. Record one of: (a) path of the existing signature list + its three signatures and
   gate hook; or (b) "not found — build fresh per DEC-7 default".
3. If (a): the new signature **extends** that list; the helper regex in `helpers.js:63`
   and the gate matcher must both import from it (single source of truth, see E1).
   Output: 1-page note appended to this plan's §7 evidence log.

### S1. Reproduce the dead-browser failure deterministically (feeds M1-M3)

1. Write a throwaway probe spec (under `/tmp`, never committed) that calls
   `waitForAppReady(page)` then kills the browser mid-test (`await page.context()
   .browser().close()` in a second step) to confirm: (a) error message matches the
   `helpers.js:63` regex, (b) the line-65 retry throws instead of recovering.
2. Capture the exact `err.message` strings for `browser.close()` vs `context.close()`
   vs `page.close()` — these become the negative/positive fixtures for the classifier
   unit tests in E2.
3. Confirm Playwright version behavior (`canary-e2e` pins `^1.62.1` per package.json;
   README notes a version-split history): does a dead context's `browser().newContext()`
   still work, or is a full `chromium.launch()` needed? This decides the M2 design.

### S2. Fixture design for zero-spec-change recovery (feeds DEC-6, M2)

1. Read 3-4 representative call sites (`task-lifecycle.spec.js:31`,
   `footer-overlay.spec.js:205`, `task-inspector.spec.js:102`, one `visual/*.spec.js`
   `beforeEach`) and confirm the only fixture used is `{ page }`.
2. Prototype (throwaway, `/tmp`) a Playwright fixture override that exposes the
   `context`/`browser` alongside `page` so the helper can mint a fresh page after a
   browser death **without changing call sites** — e.g. a test-scoped `flakyPage`
   fixture or a `waitForAppReady` overload that accepts an optional recovery handle
   defaulting to "no recovery" (old behavior) when absent.
3. Spike exit criteria: a written-down choice between:
   - **A. Helper-only, same page:** keep signature, catch browser-dead on retry and
     rethrow a marked `InfraFlakeError` for the runner lane (no fixture work, M2-trivial);
   - **B. Fixture-backed recovery:** helper returns/mutates to a fresh page via an
     opt-in fixture; specs that want in-test recovery adopt it, others get runner-lane
     coverage only.
   - Recommendation: **A now, B only if S1 shows the runner lane cannot cover a case**
     (keeps the diff smallest; honors q6 "not at all" default).

### S3. Reporting seams (feeds DEC-3, DEC-9, M6)

1. Confirm the cheapest JSON source: Playwright `--reporter=json` output file (write to
   the verdict dir) vs parsing `canary-tests.full.log`. Prefer the JSON reporter —
   add it alongside `html,list` in a gate-only config override, not by editing the
   committed reporter list if that churns snapshots (it does not — reporters don't
   affect snapshots — but verify).
2. Read `scripts/lib/fast-gate-verdict.mjs` `buildFastGateVerdict` signature and the
   `KAINBAIN_FAST_GATE_RESULT` marker contract (`api/flow/fastGateMarker.js`
   cross-checked test): decide where the quarantine summary attaches (new
   `canary-quarantine.json` next to `verdict.json` + one marker-suffixed log line, so
   the pinned marker spelling never changes).
3. Check `scripts/canary-preflight.mjs` for the natural home of a "quarantine rerun"
   step (it already wraps every `playwright test` invocation via the `test` script).

## 3. Make the change easy (enabling refactors — no behavior change)

### E1. Extract the single signature source of truth

1. Create `canary-e2e/tests/infra-flakes.js` (name negotiable; DEC-7): exports
   `INFRA_FLAKE_SIGNATURES` (array of `{ id, pattern, description }`, one entry per
   q5 family: `browser-closed`, `target-closed`, `page-crashed`,
   `insufficient-resources`), plus `isInfraFlake(message)` and
   `matchInfraFlake(message)` (returns the matched signature id or null).
2. Seed patterns from the union of the task text and the `helpers.js:63` regex:
   `has been closed`, `Target closed`, `Target crashed`, `Page crashed`,
   `ERR_INSUFFICIENT_RESOURCES`. Each pattern stays a substring/regex intentionally
   narrow — genuine failures (`net::ERR_CONNECTION_REFUSED`, bad URL, title mismatch,
   missing Project button after two waits) must never match (negative fixtures in E2).
3. If S0 found the 8769b002 list: import/merge rather than duplicate (one list wins;
   delete the loser and re-export).
4. Rewrite the `helpers.js:63` inline regex to call `isInfraFlake(err?.message)` —
   behavior-identical, covered by E2 tests.

### E2. Unit-test the classifier (fast, no browser)

1. Add `canary-e2e/tests/infra-flakes.test.js` runnable under the repo's unit gate
   (check whether `canary-e2e` has a unit-test runner; otherwise place under
   `scripts/tests/` following `fast-gate-verdict.test.mjs` precedent and import the
   module relatively).
2. Positive fixtures: exact strings captured in S1 plus the four 2026-11-19 tails.
3. Negative fixtures (must stay red — acceptance criterion 2): dead backend
   (`ERR_CONNECTION_REFUSED`), bad URL, `Timeout ... Project button` after retry,
   assertion failures, `toHaveTitle` mismatch. Each negative asserts
   `isInfraFlake(...) === false`.
4. Run `npm run test:unit` (and the canary-adjacent script tests) — green before
   proceeding.

### E3. Reporting skeleton (no producer yet)

1. Add the JSON-summary writer as a pure function
   (`scripts/lib/canary-quarantine.mjs`: `buildQuarantineSummary(matches)` →
   `{ signatures: {id: count}, tests: [{title, file, signature, lane}], baseline }`)
   with unit tests; wire the verdict-dir path and log-line format but leave the
   producer (M5/M6) to call it.
2. Document the "how to add a signature" checklist skeleton in `canary-e2e/README.md`:
   add entry → add positive/negative fixtures → run unit tests → note in summary docs.
   (Full prose lands in D1 after M-steps fix the final paths.)

## 4. Make the change, part 1 — helper recovery (smallest robust fix, DEC-1/DEC-6)

### M1. Mark, don't mask, the dead-browser retry failure

1. In `waitForAppReady`'s catch (`helpers.js:54-66`): wrap the line-65 retry in its own
   try/catch. If the retry throws and `matchInfraFlake(retryErr.message)` hits,
   throw a marked error carrying `{ signature, phase: "first-load", file/line context }`
   (e.g. `err.code = "CANARY_INFRA_FLAKE"` + `err.signature`) instead of the raw
   Playwright error — the message keeps the original text plus a
   `[infra-flake:<signature>]` tag so the runner lane (M5) and log grep (M6) can match
   deterministically.
2. If the retry throws a non-flake error (or the first error was non-flake), rethrow
   unchanged — dead backend / bad URL / broken shell stay red (acceptance criterion 2).
3. Per DEC-2 default, scope this to the first-load block only; the shell-wait block
   (`helpers.js:71-88`) keeps its reload+retry and gains flake-marking only if S1 shows
   browser-death surfaces there too (the four 2026-11-19 failures did not).

### M2. Best-effort in-helper context recovery (only if S1+S2 justify it)

1. If S1 proves `browser().newContext()` survives a dead context AND S2 yields a
   zero-spec-change fixture: implement exactly one guarded path — on retry-flake,
   create a fresh context+page via the injected handle, `goto` once more, and continue
   the test on the fresh page. Bound it: one attempt, same `readyTimeoutMs` budget
   (no budget inflation that could mask a hung app).
2. If either condition fails: skip M2 entirely — M1's marked error plus the M5 runner
   lane is the complete fix (smaller diff, same acceptance outcome). Record the
   decision and S1/S2 evidence in §7.

### M3. Negative-path verification for M1/M2

1. Broken-shell probe: point `APP_URL` at a page with the right title but no Project
   button → gate red, error unmarked.
2. Dead-backend probe: stop the scratch API → first error unmarked, gate red.
3. Dead-browser probe (S1 rig): marked `[infra-flake:browser-closed]`, gate forgiven
   only via M5 lane with summary entry (acceptance criteria 1+3).

## 5. Make the change, part 2 — runner-level retry / quarantine lane (safety net)

### M4. Gate-only flake-aware rerun (no committed `retries` change)

1. Keep `retries: 0` in the committed `playwright.config.js` (the "flakes stay visible"
   policy stands) — forgiveness happens explicitly in the gate, visibly, per DEC-4.
2. Add a gate wrapper (new `scripts/canary-with-quarantine.mjs`, invoked from the
   `Canary Tests` branch in `scripts/run-tests.mjs` in place of bare
   `npm run test:canary`, or from `canary-preflight.mjs` if S3 shows that seam is
   cleaner) that:
   - runs the suite once with `--reporter=json` to a temp file (plus existing reporters);
   - on failure, classifies each failed test's error text with `matchInfraFlake`;
   - if **every** failure matches a known signature (DEC-4: signature-only), reruns
     **only the failed tests** (DEC-8 default: `--last-failed` or a JSON-derived
     filter — minutes, not another ~17 min) up to once;
   - exit 0 with a quarantine summary only if the rerun passes (or fails solely on a
     *different* known signature — still recorded, still green); any non-flake failure
     at any stage exits non-zero immediately.
3. Mixed result (one flake + one genuine failure) stays red; the summary names both.

### M5. Quarantine semantics (DEC-2 shell-wait, DEC-4, DEC-8)

1. The M4 lane covers the whole helper including the shell-wait block (DEC-2's second
   half) for free, since classification happens on the final error text, not the phase.
2. Semantics: run non-blocking (DEC-4 default) — quarantined tests still execute; only
   a signature-only failure is forgiven, and only with a recorded summary entry.
   Nothing is ever skipped silently (canary README "zero silent skips" invariant).
3. Rerun granularity: failed tests only (DEC-8 default). Whole-run rerun is the
   fallback if `--last-failed` proves unreliable on this suite (record in §7).

### M6. Reporting: lane/signature naming + baseline (acceptance criterion 3, DEC-3/DEC-9)

1. Gate log line (always): `KAINBAIN_CANARY_QUARANTINE forgiven=<n> lane=runner-rerun
   signatures=<id:count,...> tests=<file:title,...>` — greppable, next to the
   existing `KAINBAIN_FAST_GATE_RESULT` banner; never alters the pinned marker spelling.
2. JSON summary (always): `canary-quarantine.json` beside `verdict.json` in the
   `ci-fast-gate-<timestamp>/` dir, written by the E3 `buildQuarantineSummary`
   function; includes per-signature counts (DEC-9 baseline: counts accumulate per run
   and are trivially diffable across runs to prove a flake is gone).
3. Playwright HTML annotation (DEC-3 "all three"): attach the `[infra-flake:<id>]`
   tag to the retried test via `test.info().annotations` in a fixture/reporter hook —
   last of the three, only if steps 1-2 prove insufficient in review.
4. Baseline file (DEC-9): commit `canary-e2e/infra-flake-baseline.json`
   (`{ signatureId: { firstSeen, forgivenRuns } }`); the M4 wrapper updates the working
   copy's counts and the summary diffs against the committed baseline. Removing a
   signature = deleting its entry + fixtures (documented in D1).

## 6. Test & assurance plan (proves the three acceptance criteria)

| Criterion | Probe | Expected | Where |
|---|---|---|---|
| (1) browser-closed no longer fails the gate alone | S1 dead-browser rig on 2 specs, full gate run | green gate + `canary-quarantine.json` + log line | M3.3, M4 |
| (2a) broken shell still fails | bad shell probe (title OK, no Project button) | red, unmarked error, no quarantine entry | M3.1 |
| (2b) dead backend still fails | stopped API probe | red, unmarked `ERR_CONNECTION_REFUSED` | M3.2 |
| (2c) bad URL still fails | invalid `APP_URL` probe | red, unmarked | M3.2 |
| (2d) mixed flake+genuine stays red | one dead-browser + one assertion failure | red, summary names both lanes | M4.3 |
| (3) report names lane/signature | inspect gate output of (1) | log line + JSON + (annotation) all agree | M6 |
| No-regression on green suite | full `npm run test:canary` on unmodified app | green, empty quarantine summary | §8 |
| Unit gate | `npm run test:unit` + script tests | green (E2, E3) | E2, E3 |

Assurance mechanics:

1. **Fail-before/pass-after:** run each M3 probe against the pre-change helper (via
   `git stash`) to show today's behavior (raw throw at `helpers.js:65`, red gate),
   then against the fixed tree. Record both outputs in §7.
2. **Flake-rate measurement:** use the existing `node scripts/repeat-tests.mjs --suite
   canary` harness (cited in `playwright.config.js:209`) on the two most-affected
   specs (`task-lifecycle`, `footer-overlay`) — 3× each, per the canary README
   checklist §6 — to show the lane triggers only on the signature, never spuriously.
3. **No long-lived servers:** all probes use the suite's own scratch stack
   (`:3399`/`:5299`) or the headless single-spec runner; visual checks via
   `npm run capture:screenshot` only if M6.3 touches rendered output (it should not).
4. **Review gates:** plan review → implementation → `npm run test:unit` →
   single-spec canary probes → full canary run → docs review (D1 checklist executed by
   a second pair of eyes adding a dummy signature, then reverting).

## 7. Documentation plan

### D1. "How to add a signature" (required by the task)

Extend `canary-e2e/README.md` with a short section:

1. Add one entry to `INFRA_FLAKE_SIGNATURES` in `canary-e2e/tests/infra-flakes.js`
   (id, narrow pattern, one-line description, link to a failing log).
2. Add one positive fixture (exact error text) and one near-miss negative fixture to
   `infra-flakes.test.js`; run the unit gate.
3. Add the id to `infra-flake-baseline.json` with `firstSeen` = today.
4. Rerun the affected spec 3× (`repeat-tests.mjs`); paste the quarantine summary line
   into the PR/task.
5. Never add a pattern that matches assertion text, timeouts on app waits, or HTTP
   4xx/5xx — the negative-fixture list in E2 is the guardrail (acceptance criterion 2).

### D2. Helper + gate comments

- Update the `waitForAppReady` MARK block to describe the marked-error contract
  (`code`, `signature`, tag format) and the M2 decision (recovery vs runner-lane-only).
- One comment at the `Canary Tests` branch in `scripts/run-tests.mjs` pointing at the
  wrapper and the README section.

### D3. Evidence log (append below during implementation)

**2026-11-24 implementation entries:**

- **S0 verdict:** the 8769b002 quarantine seed is NOT in this clone —
  `git log --all --grep=8769b002` empty, no `docs/tasks/*8769*` folder, and a
  sampled `git grep -i quarantine` over 200 commits hits only the unrelated
  `QUARANTINE_DIR` jsdoc-example baseline. DEC-7 default applied: fresh
  committed list at `canary-e2e/tests/infra-flakes.mjs` + baseline at
  `canary-e2e/infra-flake-baseline.json`.
- **S1 message strings (live Playwright 1.63 probe, canary-e2e workspace):**
  `browser.close()`, `context.close()` and `page.close()` all make the next
  navigation throw exactly `page.goto: Target page, context or browser has
  been closed` (same for `page.reload:`); a DEAD browser's `newContext()`
  throws `browser.newContext: Target page, context or browser has been
  closed` (`isConnected() === false`), while a LIVE browser can mint a fresh
  context after its context died. Playwright JSON report shape verified on
  1.63: `spec.file` is testDir-relative, `spec.line/column/id` present,
  `tests[].status === "unexpected"`, `results[].error.{message,stack}`.
- **S2/M2 decision:** skipped M2 (in-helper context recovery). The specs hold
  `page` as a destructured fixture binding (`async ({ page }) => …`), which a
  helper cannot rebind; and when the whole browser died even
  `browser.newContext()` throws. Option A chosen (mark + runner lane), per the
  plan's recommendation — zero spec-file changes (DEC-6 honored).
- **S3 seams:** gate-only JSON report via `KAINBAIN_CANARY_JSON_REPORT` env →
  `playwright.config.js` appends `["json", { outputFile }]` (default reporter
  list unchanged; reporters don't affect snapshots). Quarantine dir passed to
  the branch as `KAINBAIN_CANARY_QUARANTINE_DIR` (branch `env:` seam in
  run-parallel); gate re-emits the `KAINBAIN_CANARY_QUARANTINE` line from the
  written summary after the canary phase. `KAINBAIN_FAST_GATE_RESULT` marker
  spelling untouched.
- **E1/E2:** `canary-e2e/tests/infra-flakes.mjs` (5 signature families,
  tag-first classifier, `markInfraFlakeError`); `helpers.js:63` inline regex
  replaced by `isInfraFlake` (behavior-identical); retry wrapped → marked
  `CANARY_INFRA_FLAKE` error. `tests/infra-flakes.test.mjs`: 30 fixtures
  (positives = the four 2026-11-19 tails + live-probe strings; negatives =
  ERR_CONNECTION_REFUSED/INVALID_URL/ABORTED, assertion diffs, app-wait
  timeouts, near-miss "closed" phrasings) — 51/51 green together with the
  quarantine suite.
- **E3/M4-M6:** `scripts/lib/canary-quarantine.mjs` + `scripts/canary-with-quarantine.mjs`
  (preflight → run 1 + JSON → classify → failed-only rerun via `file:line`
  filters → summary + log line). `tests/canary-quarantine.test.mjs` drives
  `runCanaryGate` with fake playwright runs: forgiven-green, signature-only
  rerun, mixed-stays-red (no rerun), rerun-genuine-stays-red, unclassifiable
  crash-stays-red, green-first-run, preflight-failed — all green.
- **Gate wiring:** `buildBranches` gained `verdictDir` (branch `env`), Canary
  Tests branch now `node scripts/canary-with-quarantine.mjs` (25-min ceiling
  kept, covers the rerun); `runGatePhases` re-emits the quarantine log line;
  pins updated in `tests/run-tests.test.mjs` + `tests/deploy-gates.test.mjs`
  (wrapper pinned to drive the same canary-e2e suite; `npm run test:canary`
  and deploy.sh shards unchanged/strict). Harness Self-Tests list gained
  `tests/infra-flakes.test.mjs` + `tests/canary-quarantine.test.mjs`.
- **Full Harness Self-Tests list:** identical failure set before/after the
  change (60 pre-existing env failures in `check-duplicate-settings` /
  `storage-sanity` — root `node_modules` absent in this sandbox; verified by
  stash-diff). 142/142 green across run-tests, deploy-gates, canary-*,
  fast-gate-*.
- **DEC resolutions (survey unanswered → defaults):** DEC-1 both staged
  (helper marks, runner lane forgives); DEC-2 first-load marking + runner lane
  covers the shell-wait block via final error text; DEC-3 all three surfaces
  (log line + JSON + in-report error tag; HTML annotation via the tag, no
  spec churn); DEC-4 run non-blocking, signature-only; DEC-5 all four
  families; DEC-6 zero spec changes; DEC-7 fresh committed list (S0);
  DEC-8 failed tests only; DEC-9 per-signature counts in the JSON summary +
  committed baseline snapshot.
- **Live end-to-end probes:** see the stage output — a probe spec that kills
  the whole browser before `waitForAppReady` (first run only, via a /tmp
  marker) run through `node scripts/canary-with-quarantine.mjs` on the real
  scratch stack: run 1 fails signature-only → failed-only rerun passes →
  exit 0 with `KAINBAIN_CANARY_QUARANTINE forgiven=1 lane="runner-rerun"
  signatures="browser-closed:1"` + `canary-quarantine.json`; the same probe
  plus a genuine `expect(1).toBe(2)` spec stays red with no rerun.
- **M3 fail-before evidence:** the pre-change behavior is the four
  2026-11-19 failure tails themselves (raw throw at helpers.js:65, red gate);
  pass-after = the live probes above + the unit decision table.

**2026-11-25 deep-review failback fixes (both blocking defects resolved):**

- **Over-broad `browser-closed` pattern narrowed:** `canary-e2e/tests/infra-flakes.mjs`
  `browser-closed` pattern changed from `/has been closed/` to the full
  Playwright sentence `/Target page, context or browser has been closed/`
  (covers 100% of observed evidence — all four 2026-11-19 tails plus every
  historical `docs/tasks/*` tail and the live probes use exactly this
  sentence; a false negative fails safe red). Live proof after the change:
  `matchInfraFlake("page.goto: Target page, context or browser has been
  closed") === "browser-closed"` while `"Error: WebSocket connection has been
  closed unexpectedly"`, `"Error: Database connection has been closed"` and
  `"page.goto: net::ERR_CONNECTION_REFUSED"` all classify `null`, and through
  the real lane (`collectFailedTests` → `classifyFailures` → `planQuarantine`)
  the two connection-closed errors give `signature=null, rerun=false,
  red=true` — genuine failures stay red, no rerun, no forgiveness.
  `tests/infra-flakes.test.mjs` gained those two strings (plus two more
  near-misses) as negative fixtures and a re-broadening guard pinning
  `browser-closed`'s pattern source to the exact sentence.
- **README checklist corrected + executed once:** `canary-e2e/README.md`
  "Adding an infra-flake signature" now states the repo-root cwd, roots
  every path (`canary-e2e/tests/infra-flakes.mjs`, repo-root
  `tests/infra-flakes.test.mjs`, `canary-e2e/infra-flake-baseline.json`),
  and step 4 is the affected-spec form `node scripts/repeat-tests.mjs
  --suite canary --pattern tests/<spec>.spec.js --runs 3`. The
  `infra-flakes.mjs` header/JSDoc references to the test file now say
  repo-root explicitly. The checklist was EXECUTED once with a dummy
  signature (`checklist-probe-dummy` / `CHECKLIST_PROBE_DUMMY_SIGNATURE` +
  positive/near-miss fixtures + baseline row): `node --test
  tests/infra-flakes.test.mjs tests/canary-quarantine.test.mjs` from the
  repo root → 63/63 green with the dummy in place, and the corrected step-4
  command run against a temporary one-test dummy spec → 3/3 PASS, exit 0,
  each run executing exactly `1 tests/__checklist-probe__.spec.js` (3-4 s
  per run, i.e. the pattern selected only the affected spec, not the whole
  suite; scratch ports :3399/:5299 only, live :3100/:5173 untouched). All
  dummy edits were then reverted (no traces remain; baseline byte-identical
  to the committed version).
- **Re-verification after the fixes:** `node --test
  tests/infra-flakes.test.mjs tests/canary-quarantine.test.mjs` → **61/61
  pass**; `node --test tests/run-tests.test.mjs tests/deploy-gates.test.mjs`
  → **72/72 pass**; full root script suite `node --test tests/*.test.mjs` →
  **783 pass / 0 fail** (787 total); `check:jsdoc-example` PASS (679 missing
  vs 680 grandfathered), `check-one-function-per-file` PASS,
  `check-proof-and-hygiene` PASS.

**2026-11-25 cleanup-stage hardening (this stage):**

- **Live-probed Playwright 1.63 exit semantics and closed a real fail-safe
  hole:** `playwright test` exits **0** when zero tests run ("No tests
  found" — e.g. a `--last-failed` fallback with no record, or a drifted
  `file:line` filter), and the JSON report's `stats` are all-zero. The old
  `evaluateRerun` forgave any exit-0 rerun, so such a rerun would have
  green-ed the gate without running anything. Fix: new `countRanTests`
  (`stats.expected+unexpected+flaky`; null when stats unknown) and
  `evaluateRerun({ rerunRanTests })` — exit 0 with `rerunRanTests === 0` →
  `{ forgiven: false, outcome: "no-tests-ran" }`, recorded in the summary
  (`rerun.testsRan`) and the log line. Pinned by tests: fake rerun exiting 0
  with an all-zero-stats report stays red.
- **`outcome=` added to the `KAINBAIN_CANARY_QUARANTINE` log line** (the
  review's noted follow-up): the line is now
  `KAINBAIN_CANARY_QUARANTINE forgiven=<n> lane=<lane> outcome=<outcome> signatures=… tests=… summary=…`.
  No external consumer parses this line (grep-verified: only the producer,
  the gate's re-emit in `run-tests.mjs` — which calls the same formatter on
  the JSON — and the tests), so the format change is safe; the exact line is
  pinned in `tests/canary-quarantine.test.mjs` including quote-escaping.
- **Fail-open report scratch dir:** `runCanaryGate` previously called
  `fs.mkdtempSync` unguarded — a full/unwritable tmp would have crashed the
  wrapper (red gate) before the suite even ran. New `resolveWorkDir`
  (tmpdir → quarantine-dir → null); null degrades the lane to the plain
  strict run (no JSON reporter → unclassifiable failures stay red, green
  passes) with a logged "running strict" line. `resolveQuarantineDir`'s
  last-resort tmp candidate now uses `mkdtempSync` (unique) instead of
  `Date.now()`.
- **Docs:** `canary-e2e/README.md` lane section gained a "How this lane can
  fail (fail-safe map)" subsection listing every failure mode and its
  direction (all red except the proven-flake path), and the log-line format
  now shows `outcome=`; the wrapper's file MARK carries the same map.
- **Re-verification after hardening:** `node --test
  tests/infra-flakes.test.mjs tests/canary-quarantine.test.mjs` → **69/69
  pass**; `node --test tests/run-tests.test.mjs tests/deploy-gates.test.mjs`
  → **72/72 pass**; full root script suite `node --test tests/*.test.mjs` →
  **783 pass / 0 fail** (795 total, 4 skipped — same pre-existing env skips);
  `check:jsdoc-example` PASS, `check-one-function-per-file` PASS,
  `check-proof-and-hygiene` PASS (exit 0).

## 8. Sequencing, effort, risks

Suggested order (research/big pieces first, per the stage brief):

```
S0 (0.5d) ─┐
S1 (0.5d) ─┼─▶ E1+E2 (0.5d) ─▶ E3 (0.5d) ─▶ M1 (0.5d) ─▶ M3 probes ─▶ M4+M5 (1d) ─▶ M6 (0.5d) ─▶ D1+D2 ─▶ full gate
S2 (0.5d) ─┤         ▲                         │  ▲
S3 (0.5d) ─┘         └─ DEC-7                  └──┘└─ DEC-6 (M2 only if justified, +0.5-1d)
```

Total: ~3.5-4.5 days including the full-gate validation runs; the long pole is gate
wall time (~17 min per full canary run — budget at least 3: baseline, M1+M3, final).

| Risk | Likelihood | Mitigation |
|---|---|---|
| 8769b002 quarantine found late, design clash | Medium | S0 first; E1 merges instead of duplicating |
| Signature too broad masks genuine reds | Medium | Narrow patterns + E2 negative fixtures + M4.3 mixed test |
| `--last-failed` unreliable on serial scratch suite | Low | Fallback: JSON-derived explicit filter; whole-run rerun as last resort (DEC-8) |
| Fixture recovery (M2) destabilizes 24 specs | Low | Default to skipping M2 (runner lane suffices); zero-spec-change constraint |
| Verdict-marker contract break | Low | Never touch `FAST_GATE_MARKER` spelling; separate log line + file (S3.2) |
| Flake is load-caused and worsens | Low | Lane records counts (DEC-9) so the trend is visible; root-cause (host load) stays a follow-up, not this task |

Rollback: each M-step is independently revertible (M1: helper catch; M4: branch command
in `run-tests.mjs`; M6: reporter additions). Reverting M4 alone restores today's strict
gate with zero helper changes.

## 9. Definition of done

- [ ] S0-S3 complete, evidence in §7; DEC-1..DEC-9 resolved (survey answers or defaults).
- [ ] E1-E3 merged: single signature list, classifier unit tests green, summary writer tested.
- [ ] M1 (+M2 iff justified): marked flake errors; M3 probes show fail-before/pass-after.
- [ ] M4-M6: runner lane reruns failed-only, mixed/genuine stays red, log line + JSON
      (+ annotation) agree; baseline file committed.
- [ ] Acceptance criteria 1-3 demonstrated end-to-end on the gate (not just unit tests).
- [ ] D1 checklist executed once by hand (dummy signature added + reverted); D2 comments in.
- [ ] Full `npm run test:canary` green with empty-or-explained quarantine summary;
      `npm run test:unit` green.
