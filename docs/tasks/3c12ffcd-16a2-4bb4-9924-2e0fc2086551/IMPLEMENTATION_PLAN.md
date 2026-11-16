# Implementation Plan: Fast-gate fail-fast + untrimmed failure detail for the Automated tests CI stage

## 0. Context and deliverable

- **Repository:** KainBain runner (branch `kb/3c12ffcd-16a2-4bb4-9924-2e0fc2086551`).
- **Problem:** The Automated tests stage runs fast unit suites first but only
  reports after the whole pipeline finishes, including a serial canary phase of
  ~13 minutes, so agents wait ~17 minutes to learn about trivial failures they
  could have fixed immediately. Failure logs are also heavily trimmed in the
  stage report.
- **Fix:** Restructure the CI runner so fast-gate failures (unit tests, lint,
  harness self-tests) are reported to the agent promptly without waiting for
  the slow canary phase — fail-fast with an early verdict plus failure
  excerpts, and stream or attach untrimmed failure sections for failed suites
  only.
- **Acceptance:** when a unit test fails, the agent-visible failure detail is
  available within minutes of the unit phase completing regardless of canary
  duration, and failure excerpts are not truncated away.
- **Case study:** KainBain task `cccd8b9d-9021-4d0f-b51c-26d489073567`
  (uncomplete-task feature) — three small failures (an op-count assertion, a
  button disabled state, a JSDoc baseline entry) took a 1020s CI run with
  23891 trimmed log lines to surface; see
  `docs/tasks/cccd8b9d-9021-4d0f-b51c-26d489073567/automated-tests-failure-20261115-232533.md`.
- **Deliverable of this stage:** this plan file only
  (`docs/tasks/3c12ffcd-16a2-4bb4-9924-2e0fc2086551/IMPLEMENTATION_PLAN.md`).
  Implementation, tests, and docs updates happen in later stages.

### Input status: survey unanswered, idea file missing

- `SURVEY.md` in this task's folder contains three questions but **no answers**
  (`"answers": {}`). This plan therefore records a **recommendation** for each
  survey question (Section 0.1) and lists them as explicit confirm-before-coding
  open questions (Section 6).
- The stage brief points at `idea-20261116-072313.md` in this task's docs
  folder, but that file is **absent** on disk (the folder holds only
  `SURVEY.md` at plan time). This plan is grounded in the task text, the survey
  questions, the case-study failure report, and direct code reads instead.

### 0.1 Recommended survey decisions (to confirm before coding)

1. **q1 — slow checks on fast-gate failure: stop everything and report
   (fail-fast stage exit).** Only a stage exit unblocks the agent loop: the
   next agent attempt starts at failback routing, which runs when the CI
   command exits (`api/flow/commandStages.js` `runCommandStage`). "Report early
   but let canary continue" helps a human watching the logs tab but does not
   let the agent start fixing sooner. The skipped canary is recorded explicitly
   in the verdict (`canary: skipped_due_to_fast_gate_failure`) plus a
   `SKIP` line in gate output, so no signal is silently lost.
2. **q2 — failure detail: full untrimmed logs for failed suites only, as files,
   plus a larger structured inline excerpt.** Prompt and timeline budgets
   (4000 / 3072 chars) cannot carry megabytes, and the agent runs in a worktree
   where it can read files — so files carry the weight and inline output
   carries pointers plus the failure summary. "Larger excerpt only" would still
   truncate the next case study.
3. **q3 — fast-gate set: unit tests (api, frontend, runner) + lint (api,
   frontend) + harness self-tests.** Matches the PROBLEM statement exactly;
   all three are cheap, deterministic, and already run in the fast overlap
   window (`scripts/run-tests.mjs` `buildBranches`).

## 1. Principle: make the change easy, then make the change

1. **Seams first, behaviour second.** Build the verdict builder, verdict-file
   writer, and banner printer as pure, unit-tested helpers with no behaviour
   change (Phase 1) before touching gate flow or engine routing.
2. **Additive output, never rewritten output.** Existing `Running <name>...
   PASS/FAIL (<s>s)` lines stay byte-identical so output parsers keep working;
   new verdict/banner lines are purely additive.
3. **Green runs stay green and identical.** Fail-fast only changes red runs;
   a passing gate still runs canary and exits 0 with the same suites
   (the #KB-0417 parity requirement).
4. **Files carry bulk, budgets carry pointers.** Nothing in this plan raises
   the timeline (3072) or retry-prompt (4000) char budgets; instead the
   excerpted surfaces are engineered to always contain the failed-suite names
   and verdict-file paths (printed at both head and tail, since `excerptLog`
   keeps head+tail).
5. **One layer at a time.** Gate layer (`scripts/`) first, engine layer
   (`api/flow/`) second, each independently testable and flaggable.

## 2. Scope map (grounded in current code)

Research verified the full failure path end to end, gate to next-agent prompt.
Every trim and every wait in the case study is accounted for below.

### 2.1 Where the 1020 seconds went (gate layer)

- `scripts/run-tests.mjs` `main()` runs `runParallel(fast)` (~217s in the case
  study), then **unconditionally** runs `runParallel(canary)` (~794s): lines
  625–630 compute `fastOk` but run canary regardless (`const ok = fastOk &&
  canaryOk`). There is no early exit on fast-gate failure.
- `splitGatePhases` (same file, ~line 382) puts every branch except
  `Canary Tests` in the fast overlap window. Canary runs alone afterwards by
  design (2026-10-15 load-flake history: overlapping canary with the vitest
  suites starved git-heavy api tests into timeouts). Fail-fast must therefore
  **skip** canary on red, never **overlap** it — overlapping reintroduces the
  load flake.
- Preflights (Settings duplicate check, Frontend imports check, ~lines 581–624)
  already fail fast before the overlap window starts. They stay as-is; Phase 0
  decides whether they join the verdict file.
- The canary branch carries a 25-minute `timeoutMs` and healthy runs take
  ~14 min (`buildBranches`, ~line 547). The project's CI stage overrides the
  engine timeout to 1800s (see gate header comment, ~line 35; engine default
  `ciTimeoutMs` is 600000 in `api/flow/stagePolicy.js`).

### 2.2 Where the 23891 trimmed lines went (three trim layers)

| Layer | Location | Budget | Case-study effect |
|---|---|---|---|
| Gate Details tail | `scripts/lib/run-parallel.mjs` `FAILURE_OUTPUT_TAIL_LINES = 120`, `failureDetailsExcerpt` | last 120 lines per failed branch | `(trimmed 23891 of 24011 lines; showing the tail)` — the engine never saw the full log |
| Timeline excerpt | `api/flow/routing/tables/failureLogExcerptLimit.js` (`3072` chars) via `excerptLog` (head+tail) | 3072 chars per stream on the Failed timeline row | `handleStageFailure` stores excerpted stdout/stderr on the timeline row |
| Retry-prompt excerpt | `api/flow/routing/tables/retryPromptLogBudget.js` (`4000` chars) via `excerptLog` | 4000 chars per stream in the next attempt's Failure Details section | `buildRetryFailureDetails` — this is what the fixing agent actually reads |

Key findings that shape the fix:

- The stage report itself does **not** trim: `generateStageReportContent`
  (`api/watch/stageReports.js`) embeds the full buffered stdout. The case-study
  report is trimmed because the **gate** trimmed before the engine ever saw the
  output. Fix layer 1 and the report is fixed.
- `handleStageFailure` stores the **full** stdout/stderr strings on
  `task.lastError` (only whitespace-trimmed), while the timeline row gets the
  excerpted form. So bulk must never be pasted into new fields carelessly —
  `task.md` persistence size is a Phase-0 research item.
- The fixing agent reads `task.lastError` through `buildRetryFailureDetails`
  (both the embedded path and the Runner path via `curateRunnerPrompt`), capped
  at 4000 chars per stream with head+tail semantics. Any pointer the agent
  needs (failed suite names, verdict-file paths) must therefore appear at the
  **head and the tail** of the gate's stdout.
- Live streaming already exists at the event level: `runCommandStage` emits
  `process:stdout`/`process:stderr` chunks over the bridge while the command
  runs. What is missing is an early **verdict** (machine-readable, persisted)
  and early **routing** (stage exit → failback), not more log bytes on the
  wire.

### 2.3 Surfaces the change touches

- **Gate:** `scripts/run-tests.mjs` (`main`, `buildBranches`,
  `splitGatePhases`, `resolveCanary` + a new `resolveFailFast`-style resolver),
  `scripts/lib/run-parallel.mjs` (`failureDetailsExcerpt`,
  `FAILURE_OUTPUT_TAIL_LINES`, `runParallel` — full text already stays on
  `result.output` for programmatic use).
- **Engine:** `api/flow/commandStages.js` (`runCommandStage` — chunk stream,
  exit/failback timing), `api/flow/routing/orchestrators/handleStageFailure.js`
  (lastError/timeline/report), `api/flow/execution/buildRetryFailureDetails.js`
  + `api/flow/curateRunnerPrompt.js` (agent-visible detail), possibly
  `api/promptCuration.js` (report inclusion budgets — Phase 0 research).
- **Config/env:** `KAINBAIN_TASK_DOCS` is already injected into every CI child
  env by `buildCommandStageEnv` — the verdict directory has a free ride to the
  gate. New flags follow the existing `resolveCanary` pattern
  (`--fail-fast` / `--no-fail-fast`, `KAINBAIN_NO_FAIL_FAST=1`).
- **Deploy parity:** `deploy.sh --prod` passes `--no-canary` to its
  `final-test-suite` gate and runs canary as its own blocking `canary-e2e`
  gate, so gate-level fail-fast cannot make deploy skip canary. `deploy-gates`
  tests pin this.

### Out of scope

- Splitting Automated tests into two pipeline stages (fast stage + canary
  stage). This is the main alternative to gate-internal fail-fast; it needs a
  workflow-config migration across projects and is recorded as a follow-up, not
  this change.
- Raising the 3072/4000 char budgets. Files carry bulk instead.
- Changing canary itself (duration, mutex, Playwright config) or the overlap
  window membership.
- New roles/permissions, UI work beyond what already renders reports/logs, and
  bulk/log-retention redesign.

## 3. Step-by-step plan (research and big pieces first)

### Phase 0 — Contract research (do first; blocks Phase 1–3 decisions)

Goal: replace every assumption in Section 0.1 and 2.2 with a checked fact.
No code changes; record answers in the implementation stage's notes.

1. **Enumerate the agent-visible failure surfaces.** For a CI failure, trace
   exactly what the next attempt's agent receives and under which budget:
   `PromptCurationEngine.curatePrompt` report inclusion (which reports, how
   much of each — `api/promptCuration.js`), `task.reports` ordering vs
   `{{latestReportPath}}`, `buildRetryFailureDetails` (4000 chars), timeline
   excerpts (3072). Confirm the verdict-file paths will be reachable from at
   least two of these surfaces.
2. **Check `task.md` persistence size risk.** Read `store._saveTaskMarkdown`
   and confirm whether `task.lastError.stdout/stderr` (full buffered CI output
   today) persist into frontmatter verbatim. If yes, the plan's files-not-paste
   rule is load-bearing: no new bulk fields on `lastError`, pointers only.
3. **Find this project's Automated tests stage definition.** Locate the
   workflow config carrying the stage (command, 1800s timeout override,
   failback target stage). Confirm (a) where to set the fail-fast flag, (b)
   which stage's agent is the "agent" in the acceptance criterion, (c) that no
   second consumer parses full gate stdout strictly (additive-lines safety).
4. **Confirm deploy parity boundaries.** Read the `deploy.sh --prod`
   `final-test-suite` invocation plus `tests/deploy-gates.test.mjs` and confirm
   gate-level fail-fast cannot change deploy behaviour (deploy already splits
   canary out). Record the exact flags deploy passes so Phase 2 keeps them
   working.
5. **Decide preflight membership.** The Settings-duplicate and Frontend-imports
   preflights fail before the overlap window. Decide: do they join the verdict
   file (recommended: yes, as `preflight` entries — they are the fastest gate
   of all) or stay verdict-exempt? One-line decision, recorded here.
6. **Fix names and defaults.** Confirm: flag spelling (`--fail-fast` /
   `--no-fail-fast`, `KAINBAIN_NO_FAIL_FAST=1` vs inverted default), verdict
   directory layout (`$KAINBAIN_TASK_DOCS/ci-fast-gate-<timestamp>/` with
   `verdict.json` + `<branch-slug>.full.log` for failed branches only),
   banner marker spelling (must be greppable and excerpt-stable, e.g.
   `KAINBAIN_FAST_GATE_RESULT ...`), enlarged inline tail size (proposal: env
   `KAINBAIN_FAILURE_TAIL_LINES`, default raised from 120 — exact number from
   the case-study fixture in Phase 4).
7. **Establish the timing baseline.** Reproduce the case study cheaply: stub
   the canary branch slow (sleep + progress ticks, no Playwright) and fail one
   fast branch; measure time-to-stage-exit today. This is the "before" number
   the acceptance rehearsal (Phase 5) beats.

### Phase 1 — Make the change easy (no behaviour change)

Goal: all new seams exist, tested, and wired additively. A green gate's
`Running ...` lines stay byte-identical; new lines are additive only.

1. **Extract a pure verdict builder.** New module (e.g.
   `scripts/lib/fast-gate-verdict.mjs`): `buildFastGateVerdict({ fastResults,
   canaryDecision, startedAt })` → `{ ok, failedBranches: [{ name, exitCode,
   wallSecs }], canary: 'ran' | 'skipped_due_to_fast_gate_failure' |
   'opted_out', ... }`. Pure, no I/O. Unit tests: all-pass, one-failure,
   all-fail, preflight-failure shape (per Phase 0.5).
2. **Add the verdict-file writer.** `writeFastGateVerdict({ dir, verdict,
   fullOutputs })` writes `verdict.json` plus one `<branch-slug>.full.log`
   per **failed** branch only (full untrimmed bytes from `result.output`,
   already available in `runParallel` results). Returns written paths.
   Unit-tested against tmp dirs: failed-only file set, empty-output branch,
   unwritable dir degrades to `{ ok: false }` without throwing (gate must
   never fail because the verdict write failed).
3. **Add the verdict-dir resolver.** `resolveVerdictDir({ env })`:
   `$KAINBAIN_TASK_DOCS/ci-fast-gate-<timestamp>/` when the env var names a
   writable dir (the engine injects it for CI runs), else a repo-local scratch
   fallback for local `npm test` (never `/tmp` scratch that agents cannot
   find — document the fallback path in the banner). Unit tests for each arm.
4. **Add the banner printer.** `formatFastGateBanner({ verdict, paths })`
   renders the greppable marker line plus human lines: failed suite names,
   verdict-file paths, one-line failure summaries. `main()` prints it right
   after the fast phase resolves **and repeats it at gate end** (excerpt
   survival: `excerptLog` keeps head+tail, so pointers printed once mid-log
   could be cut from the 4000-char retry excerpt). Wire additively in Phase 1
   with canary behaviour unchanged (always runs) — this alone gives operators
   the early signal in the logs tab with zero risk to exit semantics.
5. **Tests (Phase 1):** new unit suites beside the helpers (repo convention:
   `tests/*.test.mjs` run under `node --test`); existing
   `tests/run-parallel.test.mjs` and `tests/run-tests.test.mjs` must pass
   untouched (output-contract regression net).

### Phase 2 — The change, gate layer (fail-fast + untrimmed files)

Goal: fast-gate failure → verdict on disk + banner on stdout within seconds of
the fast phase, canary skipped, stage exits promptly.

1. **Branch-set constant.** Export the q3 fast-gate set from
   `scripts/run-tests.mjs` (e.g. `FAST_GATE_BRANCH_NAMES`: the three unit
   suites + two lint branches + Harness Self-Tests) so the fail-fast predicate
   and its tests share one definition. Note: other fast branches (build,
   depcheck, audit gate, proof hygiene, containers, security scripts) still run
   in the overlap window and still fail the gate — they just do not trigger
   the canary skip... or do they? Decide in implementation from Phase 0.3: the
   simplest correct predicate is "any fast-phase failure skips canary"
   (recommended — uniform, no surprise matrix), with the q3 set defining which
   branches' failures get the early-verdict emphasis. Record the choice.
2. **Fail-fast resolver.** `resolveFailFast({ argv, env })` mirroring
   `resolveCanary`: default ON (proposal), opt out via `--no-fail-fast` /
   `KAINBAIN_NO_FAIL_FAST=1`. Deploy keeps working because it already passes
   `--no-canary` (no canary branch → nothing to skip → identical behaviour).
3. **Rewire `main()`.** After `await runParallel(fast)`: build the verdict,
   write it, print the early banner. If fail-fast is on and the fast phase
   failed: print an explicit `Running Canary Tests... SKIP
   (fast-gate failed: <suites>; verdict at <paths>)` line, skip the canary
   `runParallel` call, set exit code 1, repeat the banner, return. If canary
   was opted out, keep the existing `⏭️ Skipping Canary Tests` note.
4. **Update the gate header JSDoc** (the behaviour contract block at the top of
   `scripts/run-tests.mjs`): fail-fast semantics, verdict layout, flags, and
   the unchanged #KB-0417 parity note (canary still runs on every green gate).
5. **Tests (Phase 2):** extend `tests/run-tests.test.mjs`: resolver
   default/opt-out matrix; `FAST_GATE_BRANCH_NAMES` matches `buildBranches`
   output; verdict predicate matrix (fast-fail → skip, green → run, canary
   opted out → unchanged); a hermetic `main()`-level test with stubbed
   branches proving canary's spawn is never attempted on fast failure and the
   SKIP line names the failed suites. Keep the canonical thirteen-branch order
   test green.

### Phase 3 — The change, engine layer (agent-visible detail, fast)

Goal: whatever the gate wrote early is what the agent reads, with pointers
that survive every excerpt.

1. **Pointer-first failure reason.** Ensure the very first lines of the CI
   stdout (head) and the closing banner (tail) carry: failed suite names,
   `verdict.json` path, and per-suite full-log paths. Implement in the gate
   (Phase 2 output), not by engine patching — the engine must not rewrite
   buffered stdout. Verify against `excerptLog` at both budgets (Phase 4.3).
2. **Early operator signal in full-run mode (cheap, optional).** When fail-fast
   is opted out (canary still runs ~13 min after a fast failure), scan
   `process:stdout` chunks in `runCommandStage` for the banner marker and, on
   first sight, append a process-log + history entry (`Fast-gate failed:
   <suites>; full logs at <paths>; canary still running`). This helps humans
   watching the task; document honestly that it does **not** unblock the agent
   loop (only stage exit does) — it exists for the q1="keep running"
   preference, not for the acceptance criterion.
3. **Failure-report coherence.** Confirm which report file the fixing agent
   reads first when both the `runCommandStage` report and the
   `handleStageFailure` failure report exist (Phase 0.1): the verdict paths
   must be visible in that file's head/tail. If the winning surface is the
   `generateStageReportContent` Execution Output (full stdout), no engine edit
   is needed beyond Phase 3.1 — record that as the verified outcome, not an
   assumption.
4. **No bulk in `lastError`/timeline.** Pointers only; do not attach full logs
   to `task.lastError` or timeline rows (frontmatter size — Phase 0.2). If
   Phase 0.2 finds `lastError.stdout` already persists verbatim, file a
   follow-up to cap it (out of scope for this change; do not bundle).
5. **Tests (Phase 3):** engine unit tests for the chunk-scan marker detection
   (present/absent/malformed marker, fires once); a routing test asserting the
   failure report content for a simulated fast-gate failure contains the
   verdict paths; no change to `failureLogExcerptLimit` / `retryPromptLogBudget`
   values (their tests stay green).

### Phase 4 — Excerpts: untrimmed for failed suites, bounded everywhere else

Goal: prove the acceptance criterion's second half — "failure excerpts are not
truncated away" — for failed suites, without bloating any budgeted surface.

1. **Structured Details sections (gate).** For each failed branch, replace the
   bare 120-line tail with: (a) `Full log: <path>` pointer line, (b) the
   failure summary (the tail, enlarged per Phase 0.6 default), (c) the
   `(trimmed N of M lines; ...)` marker retained for honesty when the inline
   tail still cuts. Passing branches stay silent. Full bytes always land in
   `<branch-slug>.full.log` regardless of tail size.
2. **Env-tunable tail.** `KAINBAIN_FAILURE_TAIL_LINES` overrides the default
   (plumb through `runParallel`'s existing `failureOutputTailLines` option —
   the seam already exists). Keep `FAILURE_OUTPUT_TAIL_LINES` as the code
   default so existing tests pinning `120` keep passing unless the project
   deliberately raises it.
3. **Excerpt-survival characterization test.** Build a fixture from the case
   study (a failing gate stdout with a 24000-line noisy branch): run it through
   `failureDetailsExcerpt` → `excerptLog(text, 4000)` and assert the result
   contains the failed suite names, the verdict paths, and at least one
   assertion line (`AssertionError`, `FAIL`, `✖`). This test is the executable
   form of the acceptance criterion.
4. **Docs:** document the three-budget model (inline tail, timeline 3072,
   retry prompt 4000) and the files-carry-bulk rule where gate/CI behaviour is
   described, so the next trim complaint has a map.

### Phase 5 — Verification, acceptance rehearsal, and documentation

1. **Automated gates** (primary gate per repo guidance): `npm run test:unit`
   (api + frontend suites), which includes the new gate/engine unit tests via
   the Harness Self-Tests branch and the api suite. Plus lint for touched
   packages.
2. **Acceptance rehearsal (the proof):** re-run the Phase 0.7 reproduction
   (one failing fast branch + 13-minute stub canary) and assert: (a) verdict
   dir with `verdict.json` + failed-branch full logs exists within 60s of the
   fast phase completing; (b) gate/stage exits within ~60s of the fast phase
   completing (fail-fast on) instead of after the canary; (c) the simulated
   next-attempt prompt (`buildRetryFailureDetails` over the produced stdout)
   contains suite names + verdict paths + an assertion line; (d) with
   `--no-fail-fast`, canary still runs and the verdict still appears early.
3. **Regression checks:** green gate output contract (existing run-parallel /
   run-tests tests); canary-only failure still surfaces canary detail and
   exits 1; `deploy.sh --prod` path unchanged (deploy-gates tests); Windows
   spawn-shape test (`every branch spawns a binary with argv`) still green.
4. **Documentation updates** (part of the change): gate header JSDoc + flag
   help; CI/stage-authoring docs (where the Automated tests stage and its
   timeout are described); the three-budget + verdict-layout map from Phase
   4.4; CHANGELOG entry if repo convention covers CI behaviour; `docs:check`
   clean if docs gates cover the touched pages.

## 4. Validation plan (how we prove it worked)

| Check | Command / method | Expected evidence |
|---|---|---|
| Gate unit tests | `node --test tests/run-tests.test.mjs tests/run-parallel.test.mjs` + new verdict-helper suites | Resolver matrix, predicate matrix, verdict writer, banner format green |
| Excerpt survival | New characterization test over the case-study fixture (Phase 4.3) | 4000-char excerpt contains suite names + verdict paths + assertion line |
| Engine unit tests | `npm run test:api` (chunk-scan, routing, failure-report suites) | Marker detection + report-coherence cases green; budget-value tests untouched |
| Full unit gate | `npm run test:unit` | Green (primary verification gate) |
| Lint | `npm run lint:api` + root lint for touched `scripts/` files | Clean |
| Timing acceptance | Phase 5.2 rehearsal: failing fast branch + 13-min stub canary | Verdict on disk <60s after fast phase; stage exit <~60s after fast phase (fail-fast on) |
| Detail acceptance | `buildRetryFailureDetails` over rehearsal stdout; read `verdict.json` + full logs from disk | Pointers + assertion lines present; full logs byte-complete for failed suites only, no files for passing suites |
| Full-run mode | Same rehearsal with `--no-fail-fast` | Canary runs to completion; verdict still written early; exit 1 |
| Green regression | Existing gate output-contract tests + a green rehearsal | `Running ...` lines byte-identical; canary runs; exit 0 |
| Canary-only red | All fast branches pass, canary stub fails | Canary detail surfaces; exit 1; verdict records `canary: ran` + failure |
| Deploy parity | `tests/deploy-gates.test.mjs` via `npm run test:unit` | Green; deploy flag flow unchanged |
| Docs gates | `npm run docs:check` if docs touched | Clean |

The highest-risk validation step is the **timing acceptance rehearsal**: it is
the only check that exercises the real staging behaviour (fast phase → verdict
→ skip → exit) instead of units. Run it before declaring the change done, not
after.

## 5. Risks and mitigations

- **Hiding canary-only signal on red runs.** When fast and canary would both
  fail, fail-fast reports only the fast failure this round. Mitigated by: the
  explicit `SKIP (fast-gate failed ...)` line, the verdict's recorded canary
  decision, and the fact that canary still runs on every green gate — the
  canary signal is deferred one iteration, never dropped. The alternative the
  plan rejects (overlapping canary with a re-run) would reintroduce the 2026-10-15
  load flake.
- **Verdict dir missing or unwritable.** Local `npm test` has no
  `KAINBAIN_TASK_DOCS`; a misconfigured stage may point it nowhere. Mitigated
  by the Phase 1.3 fallback chain plus fail-open writer semantics (a failed
  verdict write degrades the banner to "verdict unavailable", never fails the
  gate by itself) — covered by unit tests.
- **`task.md` / prompt bloat.** Mitigated by the files-carry-bulk rule and the
  Phase 0.2 size check; no new bulk fields on `lastError`, no budget raises.
- **Output-parser breakage.** External tooling matches `Running <name>...
  PASS/FAIL` lines. Mitigated by additive-only output (Phase 1.4) and the
  untouched output-contract tests; the new `SKIP` line for canary follows the
  existing `SKIP (reason)` shape already used for bash/docker/depcheck skips.
- **Survey answers arriving late and contradicting Section 0.1.** Mitigated by
  flag-seaming every survey decision (fail-fast on/off, tail size, branch set
  constant): a q1="keep running" outcome flips the default and leans on Phase
  3.2 + the follow-up two-stage split, without redesigning the verdict.
- **Flag-default surprise for local runs.** Fail-fast changes local `npm test`
  red runs too (canary skipped). This is the desired fast feedback, and
  `--no-fail-fast` preserves the old behaviour; the gate header documents it.

## 6. Open questions (confirm before coding)

1. **q1 — stop vs keep running:** plan recommends fail-fast stage exit
   (Section 0.1.1). If the survey eventually answers "keep running", the
   acceptance criterion's agent-wait half cannot be met by gate changes alone —
   confirm, then scope the two-stage split follow-up.
2. **q2 — full logs vs larger excerpt:** plan recommends full-log files for
   failed suites + enlarged inline excerpt (Section 0.1.2). Confirm the
   enlarged inline default (Phase 0.6) and that writing full logs to the task
   docs dir is acceptable (disk is cheap; task docs already hold reports).
3. **q3 — fast-gate membership:** plan recommends unit + lint + harness
   self-tests (Section 0.1.3), with "any fast-phase failure skips canary" as
   the simplest predicate (Phase 2.1). Confirm both halves.
4. **Fail-fast predicate edge:** should non-q3 fast branches (Frontend Build,
   depcheck, audit gate, proof hygiene, containers, security scripts) also skip
   canary when they fail alone? Recommended yes (uniform rule); needs one
   explicit confirmation.
5. **Missing idea file:** `idea-20261116-072313.md` is absent. Confirm no
   additional requirements (e.g. streaming UI, notifications) were specified
   there before implementation starts.
6. **Preflight membership in the verdict** (Phase 0.5) and **exact flag names**
   (Phase 0.6): small decisions, but they block Phase 1 module shapes — settle
   in Phase 0, not mid-implementation.
7. **Which report the fixing agent reads first** when both the command-stage
   report and the failure report exist (Phase 0.1/3.3): determines whether any
   engine edit beyond pointer-first output is needed at all.

## 7. Key decisions (summary for reviewers)

- **D1 (q1):** fail-fast stage exit on fast-gate failure (default on,
  flaggable off); skipped canary recorded explicitly, never silent.
- **D2 (q2):** full untrimmed logs for failed suites only, as files under the
  task docs dir; inline output keeps a bounded but enlarged structured excerpt
  with pointers.
- **D3 (q3):** fast-gate set = unit tests (api, frontend, runner) + lint (api,
  frontend) + harness self-tests; uniform "any fast failure skips canary"
  predicate recommended.
- **D4:** verdict location `$KAINBAIN_TASK_DOCS/ci-fast-gate-<timestamp>/`
  (`verdict.json` + `<branch-slug>.full.log`), reusing the already-injected
  `KAINBAIN_TASK_DOCS` env var with a documented local fallback.
- **D5:** no budget raises (120-line default stays pinnable, 3072/4000 char
  budgets untouched); excerpt survival engineered by head+tail pointer
  placement instead.
- **D6:** green runs byte-identical; deploy path provably unaffected (deploy
  already splits canary out); canary never overlaps the unit suites again.

