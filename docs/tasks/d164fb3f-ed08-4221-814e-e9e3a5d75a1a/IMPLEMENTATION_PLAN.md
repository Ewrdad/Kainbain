# IMPLEMENTATION_PLAN — Fix the 413 completion-payload loop (S2)

Task: `d164fb3f-ed08-4221-814e-e9e3a5d75a1a`.
Source: task `2e663986-aaf3-4afe-8dcf-3adad34acdb4` § RESPONSE.md S2,
`GUIDE-02-413-complete-payload.md`, `WIDE_NET_ANALYSIS.md` Cause 2,
`TDD-TEST-EXAMPLES.md`, `RESPONSE_SURVEY.md` q3/q4, plus this task's
`SURVEY.md` (q1–q5).

Principle: **make the change easy, then make the change**. Research and
decisions come first (everything depends on ONE agreed limit value),
then red tests that pin today's behavior, then small no-behavior-change
seams, then the three behavior changes in ship order (backend limit
first, runner shrink second, 413 non-retryable handling third), then
verification, docs, and rollout.

## 0. Problem recap (one paragraph)

After a fully successful run + push, the runner's `complete-execution`
POST exceeds Fastify's default 1 MiB JSON body limit (`api/index.js:116`
sets no `bodyLimit`) and is rejected with 413; the daemon's generic
catch interrupts and rethrows → `exit(1)` → systemd restart → full
stage re-run → same 413. Proven: 5 laps on `7f6220c3` Merge resolver
11-20 21:19–21:47, restart counters 830→834; `kb-7f6220c3` worktree
holds pushed stage-output commits (**DO NOT REAP — exhibit**).
Either half of the fix breaks the loop; both halves together remove
the class.

## 1. Decisions (lock these before any code; all surveys unanswered)

Both surveys are unanswered at plan time (`"answers": {}` in this
task's `SURVEY.md` and in `RESPONSE_SURVEY.md`). The plan proceeds on
the recommended defaults below. The implementer (or reviewer at the
first checkpoint) confirms or overrides each row; overrides only change
constants, not the phase structure.

| # | Question | Decision (default) | Rationale |
|---|---|---|---|
| D1 (= q1) | ONE limit value shared by backend + runner budget | **10 MiB** (`10 * 1024 * 1024` bytes), task brief's value | 10x headroom over today's ~1 MiB reports; small enough to keep the default protection meaningful elsewhere |
| D2 (= q2) | Runner behavior on 413 from `complete-execution` | **Send ONE small `failed` report** (no `taskFiles`, exact byte size + limit in `failureReason`, e.g. `failureKind: "report-too-large"`), then stop; never resend the big report, never rethrow, never interrupt-loop | Matches brief ("report once as failed with size details, return, NEVER rethrow") and `RESPONSE_SURVEY` q4 recommended option |
| D3 (= q3) | Binary handling in `collectTaskFiles` | **Skip all common binary types entirely** by extension list (images, PDFs, archives, fonts, media, executables — documented list in code) | Matches brief + `RESPONSE_SURVEY` q3 recommended option; downsampling is explicitly rejected as extra complexity with unbounded output size |
| D4 (= q4) | Total file cap inside the report | **Keep ~1 MiB total for files, minus explicit headroom** for the 20 KiB `output` + JSON overhead (target: whole envelope provably < old 1 MiB default, so the runner half alone breaks the loop even against an un-upgraded backend) | Conservative, deterministic; scaling the file cap up to the 10 MiB limit would reintroduce the same cliff one asset-folder later |
| D5 (= q5, optional) | Which routes get the raised limit | **Only the runner `complete-execution` route**; every other route keeps Fastify's 1 MiB default, pinned by test | Smallest blast radius; matches brief and the accessibility-route precedent of per-route `bodyLimit` |

Derived budgets (from D1 + D4; exact arithmetic lands in code + tests):

- Backend accepts `complete-execution` bodies up to 10 MiB.
- Runner packs `taskFiles` so that `files + output(≤20 KiB) + JSON
  envelope overhead` stays under ~1 MiB (old default) with margin —
  i.e. files total cap ≈ 1 MiB − 64 KiB headroom, per-file cap stays
  256 KiB, binaries excluded per D3.

## 2. Phase plan (big / research pieces first)

### Phase 0 — Lock decisions (30 min, blocks everything)

1. Confirm D1–D5 with reviewer/human (survey answers still empty; if
   the human answers `SURVEY.md` q1–q5 first, those answers override
   this table and D1's number propagates to Phases 2–4).
2. Record the final numbers in this plan (edit the table) so backend
   and runner halves cannot drift.

Acceptance: D1 value written down; no code touched.

### Phase 1 — RED tests: pin today's behavior (TDD, no src changes)

Goal: failing-or-pinning tests that prove the bug exists and define
"done". All new test files are created here; src changes come later.

1. `api/bodyLimit.default.test.js` (vitest, standalone): Fastify with
   the same options as `api/index.js:116` rejects >1 MiB JSON with 413
   + `FST_ERR_CTP_BODY_TOO_LARGE`. Passes today (pin of the default).
2. `api/flow/runnerRoutes.bodyLimit.413.test.js` (vitest,
   `app.inject`, modeled on `api/flow/runnerRoutes.test.js` buildApp +
   runner registration): POST >1 MiB `complete-execution` → 413, and
   the handler never ran (no completion recorded); control body just
   under 1 MiB → accepted. Passes today (pin of the bug). **After
   Phase 3 this file flips**: >1 MiB now accepted, >10 MiB rejected
   413 with a backend log entry (see Phase 3 step 3).
3. `runner/daemon.collectTaskFiles.test.js` (`node:test`, modeled on
   GUIDE-02 §3): 6× 200 KiB fake PNGs + `task.md` → files payload
   ≤1 MiB but `JSON.stringify({ taskFiles, output: 20_000 chars })`
   > 1 MiB. Passes today (pin of the overflow composition). **After
   Phase 4 this file flips**: PNGs excluded, envelope + output +
   overhead under the Phase-2 budget constant.
4. Daemon-level RED test (new file or addition to
   `runner/daemon.test.js` harness — prefer a focused new file,
   e.g. `runner/daemon.complete413.test.js`, mirroring the GUIDE-04
   §3 stub-client shape): stub `client.complete` to throw a
   413-shaped error (`statusCode: 413`, `code:
   "FST_ERR_CTP_BODY_TOO_LARGE"`, message `Backend 413 on
   /tasks/.../complete-execution`) → expect: one small `failed`
   completion sent (no `taskFiles`, size details in reason), no
   `client.interrupt` call, no rethrow (resolves, not rejects).
   **Fails today** (today it interrupts + rethrows) — this is the
   red test for Phase 5.

Acceptance: `cd api && npx vitest run` passes incl. the two pin files;
`node --test runner/daemon.collectTaskFiles.test.js` passes;
daemon-413 test fails for exactly the right reason (interrupt +
rethrow observed). No `api/`, `runner/` src file modified.

### Phase 2 — Make the change easy (seams + constants, NO behavior change)

Goal: the behavior diffs in Phases 3–5 become one-liners against named,
tested seams. Each step keeps all tests green.

1. Backend: add an exported named constant for the completion limit,
   e.g. `COMPLETE_EXECUTION_BODY_LIMIT_BYTES = 10 * 1024 * 1024` in
   `api/flow/runnerRoutes.js` (same pattern as
   `FEEDBACK_BODY_LIMIT_BYTES` in `api/routes/accessibility.js:58`),
   with a comment citing this task + the 1 MiB default it overrides.
   Do NOT wire it into the route yet.
2. Backend: add a `setErrorHandler` (or route-level `onError`) seam
   that recognizes `FST_ERR_CTP_BODY_TOO_LARGE`, extracts the task id
   from `/tasks/:id/complete-execution` URLs, and logs
   `{ taskId, byteSize (content-length), limit, route }` via `app.log`.
   Unit-test the extractor/logger with an injected oversize POST to an
   UNCHANGED route (still 413s) — proves the logging works before the
   limit moves. No status-code behavior change.
3. Runner: extract pure helpers out of `collectTaskFiles`
   (`runner/daemon.js:1820`) without changing its behavior: e.g.
   `isSkippedBinary(name)`, `COMPLETION_FILES_BUDGET_BYTES` /
   `COMPLETION_ENVELOPE_HEADROOM_BYTES` constants, and a
   `measureCompletionBytes({ taskFiles, output, ... })` envelope
   measurer. Existing `runner/daemon.test.js`
   `collectTaskFiles docsDirName` tests (line ~2952) must stay green
   untouched.
4. Runner: add a tiny `isPayloadTooLarge(err)` predicate (413 by
   `statusCode === 413` or `code === "FST_ERR_CTP_BODY_TOO_LARGE"`)
   next to the daemon catch, unit-tested, unwired.

Acceptance: full gate green (`node scripts/run-tests.mjs --no-canary`
at minimum), zero behavior change (Phases 1 pins still assert old
behavior), new helpers covered by unit tests.

### Phase 3 — Backend: raise the limit + log oversize (SHIPS FIRST)

1. Add `{ bodyLimit: COMPLETE_EXECUTION_BODY_LIMIT_BYTES }` route
   options to `app.post("/tasks/:id/complete-execution", ...)` in
   `api/flow/runnerRoutes.js:914` (same options-object pattern as the
   accessibility route at `api/routes/accessibility.js:371`).
2. Document WHY on the constant: completion reports legitimately carry
   task docs + output; 10 MiB bound; other routes intentionally keep
   the 1 MiB default (D5).
3. Flip `api/flow/runnerRoutes.bodyLimit.413.test.js`: >1 MiB now
   200s; a >10 MiB body still 413s AND produces the structured log
   line with task id + byte size (assert via injected logger or
   captured `app.log`). Keep `api/bodyLimit.default.test.js` as the
   pin that the framework default (and hence all other routes) is
   still 1 MiB.
4. Deploy backend immediately (no runner dependency — old runners just
   get fewer 413s).

Acceptance: flipped api tests green; manual `app.inject` check shows
oversize log line; backend deployed before any runner change ships.

### Phase 4 — Runner: shrink the payload (`collectTaskFiles`)

1. Apply D3: skip binary extensions via `isSkippedBinary` (documented
   list; keep the existing `task.md` skip and unreadable-file skip).
2. Apply D4: cumulative cap becomes `COMPLETION_FILES_BUDGET_BYTES`
   (≈1 MiB − headroom), where headroom covers `output` (20 KiB slice
   at `runner/daemon.js:2273,2293`) + JSON escaping/overhead; assert
   in code comments how the arithmetic composes to < 1 MiB envelope.
   Keep the 256 KiB per-file cap. All five `collectTaskFiles` call
   sites (lines ~2105, 2130, 2132, 2272, 2292, 2359) inherit the fix
   automatically — no per-site edits.
3. Flip `runner/daemon.collectTaskFiles.test.js`: many sub-256 KiB
   PNGs → excluded; text files still shipped (assert the KEPT set so
   task-docs sync stays useful — RESPONSE.md S2 risk note); full
   envelope (`taskFiles + output + overhead`) under budget.
4. Register the suite in `scripts/run-tests.mjs` runner file list
   (required: `tests/run-tests.test.mjs` fails the gate if any
   `runner/*.test.js` on disk is unregistered).

Acceptance: flipped runner tests green; envelope-size assertion proves
fit under the old 1 MiB default (runner half alone breaks the loop).

### Phase 5 — Runner: 413 is non-retryable (daemon catch)

1. In `executeAssignment`'s catch (`runner/daemon.js:2296-2452`),
   add a branch BEFORE the generic interrupt+rethrow
   (lines 2441–2452), modeled on the deterministic-`gitFailure`
   branch (lines 2316–2376): if `isPayloadTooLarge(err)` AND the
   failure came from a `client.complete` call → send ONE small
   `failed` completion (no `taskFiles`, `failureKind:
   "report-too-large"`, `failureReason` carrying exact byte size +
   limit + original outcome), then RETURN (never rethrow, never
   `client.interrupt`).
   - Detecting "came from complete": cleanest is a small `try/catch`
     around the two post-run `client.complete` calls (lines
     2258, 2280) that tags the error (e.g. `err.fromComplete = true`
     + measured byte size attached at the throw site), rather than
     inferring it in the big catch. The early `client.complete`
     returns (lines 2130/2132/2399/2415, small bodies) need no wrap
     but must not be broken by the new branch.
   - If the small report itself fails: mirror the gitFailure
     fallback (lines 2364–2375) — best-effort `client.interrupt`
     WITH reason, then return. Still never rethrow.
2. The Phase-1 daemon-413 red test goes green unmodified (plus a
   second case: small-report-fails → interrupt-with-reason + return,
   no throw).
3. Register the new daemon-413 suite in `scripts/run-tests.mjs` if it
   is a separate file.

Acceptance: daemon-413 tests green; full runner suite green; code
review confirms no path from a complete-413 can reach `throw err` at
line 2452 or `process.exit(1)`.

### Phase 6 — Full verification gate

1. `node scripts/run-tests.mjs --no-canary` (fast gate) green; then
   the full gate with canary if time permits (canary is ~7 min).
2. Lint branches (`lint:api`, `lint:frontend` unaffected but must stay
   green) and the `tests/run-tests.test.mjs` registration pin.
3. Re-run the GUIDE-02 §2/`app.inject` checks as the before/after
   proof pair and paste results into the task folder (see §4).

### Phase 7 — Docs, rollout, post-deploy proof

1. Task folder: flip note in this plan (decisions final), plus a
   short `VERIFICATION.md` with the before/after test outputs.
2. Code-adjacent docs: constant comments (done in Phases 2–4) +
   CHANGELOG entry if the repo convention requires one for
   behavior fixes.
3. Rollout order (per RESPONSE.md S2): backend deploys immediately
   (Phase 3); runner ships via the normal idle-converge rollout,
   never force-restarted mid-task.
4. Post-deploy proof (read-only, needs prod permission; GUIDE-02
   §4 E2/E3): backend log shows no new `FST_ERR_CTP_BODY_TOO_LARGE`
   on `complete-execution` (or shows them WITH task id + size);
   `journalctl ... | grep -c 'Backend 413'` on both runner hosts
   stops growing; any future oversize report appears as a `failed`
   completion with size details, not an interrupt+restart. Recount
   on the WIDE_NET §2 numbers as the before/after test.
5. Preserve the `kb-7f6220c3` worktree exhibit (do NOT reap).

## 3. Test plan (every requirement → at least one test)

| Requirement | Test | Type |
|---|---|---|
| Fastify default still 1 MiB everywhere else (D5) | `api/bodyLimit.default.test.js` (kept pinning) | vitest, passes before + after |
| `complete-execution` accepts ≤10 MiB, 413s above, logs task id + bytes | `api/flow/runnerRoutes.bodyLimit.413.test.js` (pin → flip) | vitest `app.inject` |
| Oversize-log extractor correctness | Phase-2 unit test on the error-handler seam | vitest |
| Binaries excluded, text kept, envelope+output+overhead under budget | `runner/daemon.collectTaskFiles.test.js` (pin → flip) | `node:test` |
| 413 from complete → one small `failed` report, no interrupt, no rethrow | daemon-413 test (red → green) | `node:test`, stub client |
| Small-report-fails → interrupt-with-reason + return, no throw | daemon-413 second case | `node:test`, stub client |
| No existing behavior regressed | full `run-tests.mjs` gate + `tests/run-tests.test.mjs` registration pin | gate |
| Real-world loop gone | post-deploy journal + backend-log sweeps (read-only) | prod verification |

Edge cases explicitly covered: 413 arriving from a NON-complete call
(e.g. logs/progress) keeps today's interrupt+rethrow path (only
complete-413 is non-retryable); old backend + new runner (envelope
fits 1 MiB anyway); new backend + old runner (fewer 413s, old runners
still loop on truly huge reports until rollout completes — accepted,
bounded by rollout); empty/missing task-docs dir (existing skips kept).

## 4. Documentation plan

- This file (`IMPLEMENTATION_PLAN.md`): decisions table updated with
  finals when D1–D5 are confirmed.
- New `VERIFICATION.md` in this task folder: before/after outputs of
  the pin/flip tests + post-deploy sweep results.
- In-code: limit constant + route option comment (why 10 MiB, why
  only this route), binary skip-list comment, budget-arithmetic
  comment, 413-branch comment citing this task id.
- CHANGELOG entry per repo convention (check `CHANGELOG.md` format
  at implement time).

## 5. Risks

- R1: Q1–Q5 unanswered → implementer picks wrong default. Mitigation:
  Phase 0 confirmation gate; defaults equal the brief + survey
  "Recommended" options.
- R2: Runner shrink makes task-docs sync useless. Mitigation: tests
  assert the KEPT file set; D4 keeps ~1 MiB of text files.
- R3: `setErrorHandler` changes other error paths. Mitigation: handler
  only ADDS logging for `FST_ERR_CTP_BODY_TOO_LARGE` and rethrows /
  delegates everything else; full api suite guards.
- R4: Old runners loop until rollout. Mitigation: backend-first ship
  order shrinks the window; rollout via idle-converge; post-deploy
  sweep watches the 413 count decay.

## 6. Definition of done

- [ ] D1–D5 confirmed and recorded (§1 table final).
- [ ] All four §2-Phase-1 tests exist; api + collectTaskFiles flipped,
      daemon-413 green.
- [ ] New runner suites registered in `scripts/run-tests.mjs`; gate
      green (`--no-canary` minimum).
- [ ] No code path from a complete-413 reaches interrupt-loop or
      `throw`/exit(1) (review + tests).
- [ ] Backend deployed before runner rollout; post-deploy sweeps show
      no new unlogged 413 loops; exhibit worktree untouched.
- [ ] `VERIFICATION.md` filed in this task folder.

## Appendix — seam index (verified against this checkout)

- `api/index.js:116` — `fastify({ logger: true })`, no `bodyLimit`.
- `api/flow/runnerRoutes.js:914` — `app.post("/tasks/:id/complete-execution", …)`.
- `api/routes/accessibility.js:58,371` — `FEEDBACK_BODY_LIMIT_BYTES`
  precedent + per-route `bodyLimit` pattern.
- `runner/daemon.js:1820` — `collectTaskFiles` (256 KiB/file, 1 MiB
  total, skips `task.md`).
- `runner/daemon.js:2258,2280` — post-run `client.complete` calls;
  `:2273,2293` — `output.slice(0, 20000)`.
- `runner/daemon.js:2296-2452` — catch; deterministic branches
  (`STALE_EPOCH`, `WORKTREE_CAP_REACHED`, `gitFailure`,
  `failedOutcome`) return; generic path interrupts (2441–2451) and
  rethrows (2452).
- `runner/client.js:17-40` — `call()` error shape (`statusCode`,
  `code`); `:140-162` — `complete()` posts the JSON body.
- `scripts/run-tests.mjs:460-493` — explicit runner suite list;
  `tests/run-tests.test.mjs` pins registration completeness.
- `api/package.json` — api tests run under `vitest run` (auto-discovers
  new `*.test.js`); runner tests run under `node --test` with the
  explicit file list above.
