# Review — fast-gate fail-fast + untrimmed failure detail (2026-11-16)

## Scope reviewed

Branch `kb/3c12ffcd-16a2-4bb4-9924-2e0fc2086551` vs `origin/main` (23 files,
+3536/−28): new `scripts/lib/fast-gate-verdict.mjs` + `api/flow/fastGateMarker.js`;
modified `scripts/run-tests.mjs`, `scripts/lib/run-parallel.mjs`,
`api/flow/commandStages.js`, `.gitignore`, `site-docs/pipeline-stages.md`;
new/modified gate + engine tests; task docs (`IMPLEMENTATION_PLAN.md`,
`notes-20261116.md`, `install-safety-review-20261116.md`, CI failure report).

## Does it achieve the goal? Yes

- **Early verdict:** `runGatePhases` writes `verdict.json` + one untrimmed
  `<branch-slug>.full.log` per failed branch the moment the fast phase resolves,
  prints the greppable `KAINBAIN_FAST_GATE_RESULT` banner (twice: after the fast
  phase and at gate end, so it survives head+tail excerpts), and — with the
  default-on fail-fast — skips the ~13 min serial canary with an explicit
  `SKIP (fast-gate failed: …)` line. Stage exit follows in seconds, which is
  what unblocks the agent loop.
- **Proof, not assumption:** the branch's own CI red run
  (`automated-tests-failure-20261116-102004.md`, Harness Self-Tests 579/580)
  shows the mechanism end to end: early banner + verdict dir on disk +
  `Running Canary Tests... SKIP` + exit 1 in 1003s with no canary phase.
  Without the fix the same run would have cost ~1003s + ~800s more.
- **Untrimmed detail for failed suites only:** full bytes land in
  `<branch-slug>.full.log`; inline `Details for <branch>:` keeps a bounded
  (default 120-line, `KAINBAIN_FAILURE_TAIL_LINES`-tunable) tail with a
  `Full log:` pointer and an honest `(trimmed N of M)` marker. Passing
  branches stay silent. Matches survey q2 and its "don't pollute context" note.
- **No stray Playwright processes (survey q3 note):** skip means the canary
  `runParallel` call is never attempted — nothing is spawned, so nothing hangs.
- **Preflight failures** join the verdict with their full report as the log.

## Did it follow the plan? Yes

`IMPLEMENTATION_PLAN.md` Phases 0–5 are all accounted for: contract research
(notes §Phase 0, including the corrected `lastError`-isn't-persisted finding),
pure helper seams first, gate layer, engine layer, excerpt-survival
characterization test, acceptance rehearsal (stub-canary: fail-fast arm exits
in ~61ms with canary never running; opt-out arm runs canary and still writes
the verdict early). The three documented deviations are deliberate and sound:
mode-neutral history wording (the plan's "canary still running" text would be
false in fail-fast mode), 3072-char timeline row carrying pointers rather than
assertion lines (proven by the characterization test), and the
`docs/tasks/local-gate-runs/` gitignore leak guard. Late-arriving survey
answers (q1 stop, q2 full logs, q3 unit+lint+harness) match the plan's
recommendations, so no redesign was needed.

## Code standards, best practices, tech debt

- **Standards:** MARK+JSDoc+@example blocks per repo convention;
  `check-one-function-per-file`, `check-jsdoc-example`, `docs:check` all PASS;
  `lint:api`/`lint:frontend` clean (3 `commandStages.js` warnings verified
  pre-existing via stash).
- **Compatibility:** additive-only gate output (`Running <name>... PASS/FAIL`
  lines byte-identical, existing contract tests untouched and green); green
  runs still run canary (#KB-0417 parity); deploy unaffected (`--no-canary`
  leaves nothing to skip, `deploy-gates` suite green); 120-line default and
  3072/4000 budgets untouched; no new dependencies, no migrations, no required
  env; writers fail open (unwritable verdict dir degrades banners, never fails
  the gate); engine chunk scanner is advisory-only, once-only, try/catch.
- **Tech debt:** none material. Residual run history (CI verdict dirs under the
  task docs dir) is excluded from Previous Reports by the top-level-only
  listing and covered by the clean-tree guard; local verdicts are gitignored.
  One optional follow-up already filed by the author (cap `lastError` growth)
  is correctly out of scope.

## Docs

Gate header JSDoc, flags, verdict layout, and the three-budget map are
documented where CI behaviour is described (`site-docs/pipeline-stages.md` +
gate JSDoc). `CHANGELOG.md` untouched, which is correct per its own discipline
("Ordinary PRs are not required to touch this file"). Notes and the
install-safety review are thorough and honest about what was and wasn't run
(no live full `npm test` on the host; CI runs the gate on this branch).

## Verification performed in this review

- `node --test tests/fast-gate-verdict.test.mjs tests/fast-gate-excerpts.test.mjs
  tests/fast-gate-acceptance.test.mjs tests/run-parallel.test.mjs` → 73/73 pass.
- `node --test tests/run-tests.test.mjs` → 60/60 pass.
- `npx vitest run flow/fastGateMarker.test.js flow/fastGateCoherence.test.js`
  → 12/12 pass; `flow/commandStages.test.js` → 82/82 pass.
  (The api tests are vitest suites; `node --test` on them fails on the runner
  harness itself, which is expected and not a code defect.)
- Read the full `scripts/run-tests.mjs`, `run-parallel.mjs`, `commandStages.js`,
  and `fastGateMarker.js` diffs; no live canary run (host load + cross-task
  canary mutex), same as the author.

## Result: suitable to integrate, no more work required.
