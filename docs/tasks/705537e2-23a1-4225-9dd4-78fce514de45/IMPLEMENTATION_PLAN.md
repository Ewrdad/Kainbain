# Implementation Plan — Single-source the runner test-suite gate list

Task: `705537e2-23a1-4225-9dd4-78fce514de45`
Date: 2026-11-24
Status: plan only — no code changed in this stage.

## 1. Goal and background

The runner unit-suite list is hand-maintained in two places:

1. `scripts/run-tests.mjs`, "Unit Tests (runner)" branch `args` (~lines 460–493) — the full-gate source.
2. `publish.sh`, `gate_for()` runner case (~line 265) — `runner) run node --test runner/... ;;`, a second hardcoded copy.

Two pins guard the duplication today: `tests/run-tests.test.mjs` ("runs the runner contract suites…", ~line 71) pins every `runner/*.test.js` on disk is named in `scripts/run-tests.mjs`, and `tests/publish.test.mjs:113` ("runner gate runs the same suite list as scripts/run-tests.mjs") pins the two lists equal via `deepStrictEqual`.

Verified failure (reference ticket `78eac844-250a-44d1-810e-6f047eb5a59e`, "Make in-assignment transient backend errors non-fatal to the runner (S4)"): the agent registered `runner/client.backendOutage.test.js` in `scripts/run-tests.mjs` only, per its brief. The Automated-tests CI stage then failed the whole fast gate in the Harness Self-Tests branch (`tests/publish.test.mjs:113` mismatch, because `publish.sh` lacked the new file) after a ~265s serial run; the canary was skipped and the task failed back to In Progress. Report: `docs/tasks/78eac844-250a-44d1-810e-6f047eb5a59e/automated-tests-failure-20261123-092217.md`. The fix at HEAD added the suite to `publish.sh` too — proving the list must be edited in two places today.

Goal of this task: make `scripts/run-tests.mjs` the single source of truth and have `publish.sh` derive its runner gate from it, so adding a new `runner/*.test.js` requires editing exactly one list and a run-tests/publish mismatch is impossible by construction.

Out of scope (do not touch): which tests run, any test content, canary/fast-gate ordering, any runner source code. Build/gate hygiene only.

## 2. Survey input (SURVEY.md)

`SURVEY.md` in this task folder ("question-me" round 1, 2026-11-24) asked three questions. At plan time the `answers` map is empty — the survey was generated but never answered. This plan therefore adopts the survey's Recommended options as defaults (they are also the task brief's suggested shape) and flags each as a confirm-at-implementation decision point:

| # | Question | Plan default (survey Recommended) | Rejected alternative |
|---|----------|-----------------------------------|----------------------|
| q1 | How should the release check get the list? | Live lookup: `publish.sh` asks `scripts/run-tests.mjs` for the current list each time it runs | Generated copy: codegen step copies the list into `publish.sh` + staleness test |
| q2 | What happens to the list-equality pin test? | Rewrite it: assert `publish.sh` reads from the single source and holds no copy of its own | Remove it |
| q3 (optional) | If the list cannot be read, what should publish do? | Stop with a clear error (fail closed, never guess) | Fall back to a backup list |

Rationale for the defaults:

- q1 live lookup: the publish path already invokes `node --test`, so node is guaranteed present; a print mode keeps `publish.sh` dependency-free bash (bash + node only, no npm/`require`) while making staleness structurally impossible. The generated-copy alternative keeps two lists and a sync test — the same failure class that caused this task, one step removed.
- q2 rewrite: the guard intent (never under-test the runner channel; never pass a bare directory or shell glob to `node --test`) must survive. An equality test becomes vacuous once there is one list, so it must be rewritten into a derivation test, not deleted.
- q3 fail closed: a fallback list is a third copy of the list and reintroduces the exact hazard being removed. On lookup failure, `gate_for runner` must exit non-zero with a message naming `scripts/run-tests.mjs`.

If the implementer (or reviewer) overrides any default, record the override and its reason in the task folder before implementing.

## 3. Design (chosen shape)

### 3.1 Single source of truth

`scripts/run-tests.mjs` owns the runner suite list. Concretely, after the "make change easy" refactor (§5), the list lives in exactly one module-level binding (suggested: an exported `RUNNER_TEST_SUITES` array of `runner/*.test.js` relative paths, in canonical order), and `buildBranches()` builds the "Unit Tests (runner)" branch `args` as `["--test", ...RUNNER_TEST_SUITES]`.

### 3.2 Print mode contract

Add a tiny print mode to `scripts/run-tests.mjs`:

- Invocation: `node scripts/run-tests.mjs --print-runner-suites` (exact flag name is the implementer's choice; keep it kebab-case and document it in the file header).
- Behavior: print the `runner/*.test.js` args of the "Unit Tests (runner)" branch — the same array `buildBranches()` uses, not a second literal — one path per line on stdout, exit 0. No other output on stdout in this mode (no gate preamble, no verdict lines).
- Constraints:
  - Must not run the gate, provision workspaces, prune tmpdirs, or touch the network. It should be importable-cost-only (sub-second, offline-safe).
  - Must exit non-zero with a one-line stderr message if the list cannot be produced or is empty.
  - Must stay within the file's existing dependency footprint (Node stdlib + the file's current imports; the print path itself should need no new imports — certainly no npm packages).
  - Must remain compatible with the existing CLI flags (`--no-canary`, `--no-fail-fast`, `--canary`, `--fail-fast`) and their tests: the print flag short-circuits before gate resolution, or is handled in a way `resolveCanary`/`resolveFailFast` tests do not observe.
- Output format decision (make at implementation time, then pin in tests): one path per line is preferred over space-separated, because it survives filenames with spaces and maps cleanly onto `mapfile`/`readarray` in bash. Trailing newline required; no blank lines.

### 3.3 publish.sh derivation

Rewrite the `runner)` case of `gate_for()` (~line 265) so it builds its `node --test` command from the print-mode output instead of a hardcoded list. Sketch (illustrative, not final code):

```bash
runner)
  # Single-sourced: the suite list lives in scripts/run-tests.mjs
  # (see --print-runner-suites). Never hardcode runner/*.test.js here.
  _suites="$(node scripts/run-tests.mjs --print-runner-suites)" || return 1
  [ -n "$_suites" ] || { echo "publish.sh: empty runner suite list" >&2; return 1; }
  # shellcheck disable=SC2086 — intentional word splitting on newline-separated paths
  run node --test $_suites ;;
```

Notes for the implementer:

- Prefer `mapfile -t`/`readarray` if the script's `bash` floor supports it (check shebang/env and existing usage); otherwise newline-splitting with `IFS` scoping is acceptable. Either way, quote correctly and add a `shellcheck` suppression comment only if the repo runs shellcheck on this file.
- The `run()` helper echoes the full command in `--dry-run` mode, so derivation must work under `--dry-run` too (the lookup itself always executes; only the test command is echoed). Verify the dry-run plan still shows every suite file.
- Fail-closed behavior (per q3): if the node invocation fails or yields empty output, the runner case must `return 1` with a stderr message — it must never silently run `node --test` with no files (which would pass vacuously or test the wrong thing) and must never fall back to a hardcoded list.
- `publish.sh` must remain bash + node only in the new path: no npm, no `require`, no new tools. `node` is already guaranteed (the gate itself is `node --test`).
- Keep the existing guard intent verbatim in a comment: never pass a bare directory (`node --test runner/`) or a shell glob — always an explicit file list. That comment moves next to the deriving line.

### 3.4 Alternatives considered and rejected

- Checked-in codegen (regenerate the `publish.sh` gate line from `buildBranches()` + a pin-in-sync test): keeps two physical lists and converts the failure from "forgot the second edit" to "forgot to run codegen"; strictly weaker than derivation. Revisit only if live lookup proves infeasible (e.g. a publish context without node — but the runner gate already needs node, so this should not occur).
- Sourcing a shared `.txt`/`.json` list file from both: adds a third file to keep in sync with the on-disk suites and weakens the existing `run-tests.test.mjs` pin; more moving parts than a print mode.

## 4. Principle: make change easy, then make the change

The change is sequenced in two commits/phases so the refactor is provably behavior-preserving before the behavior changes:

1. **Make change easy (§5):** extract the inline `args` array into one named, exported binding; `buildBranches()` references it. No behavior change — every existing test must pass unmodified.
2. **Make the change (§6):** add the print mode, rewire `publish.sh`, rewrite the pin test. The diff that changes behavior is then small and reviewable.

## 5. Phase 1 — Make change easy (refactor, no behavior change)

Biggest structural piece first: isolate the list so the print mode and the branch cannot diverge.

1. In `scripts/run-tests.mjs`, extract the `runner/*.test.js` literals (lines ~470–492) into a module-level exported constant, e.g. `RUNNER_TEST_SUITES`, preserving order byte-for-byte. Move the "explicit file list, never a bare directory or a glob" comment with it (it documents the binding now, not the branch).
2. Change the "Unit Tests (runner)" branch to `args: ["--test", ...RUNNER_TEST_SUITES]`.
3. Optional but recommended: add a tiny exported accessor (e.g. `runnerSuiteArgs()` returning `["--test", ...RUNNER_TEST_SUITES]`) if it makes the print mode and any test share one call path. Keep the surface minimal — one constant, at most one helper.
4. Run `node --test tests/run-tests.test.mjs tests/publish.test.mjs` — must pass unmodified (proves the extraction is behavior-preserving).
5. Run `bash -n publish.sh` (untouched, sanity) and `node --check scripts/run-tests.mjs`.

Exit criteria for Phase 1: `git diff` shows only the extraction in `scripts/run-tests.mjs`; both pin tests pass; no test file modified.

## 6. Phase 2 — Make the change

### Step 1 — Add the print mode to `scripts/run-tests.mjs` (largest new behavior)

1. Handle `--print-runner-suites` (or chosen flag name) at the CLI entry point (`invokedDirectly` / `main()` dispatch, ~lines 995–998): when present, print one suite path per line from the Phase-1 binding (via the same accessor `buildBranches()` uses, never a second literal) and exit 0 without running any gate logic.
2. Fail closed: non-zero exit + stderr message on empty/unavailable list.
3. Update the file's header doc block with an `@example` line for the new flag.
4. Manual checks: `node scripts/run-tests.mjs --print-runner-suites` prints the 22 current suites (spot-check count against `ls runner/*.test.js`); `echo $?` is 0; `--print-runner-suites --no-canary` still prints only the list; normal `node scripts/run-tests.mjs --help`-style invocations are unaffected (there is no `--help` today — do not add one).

### Step 2 — Rewire `publish.sh gate_for()` runner case (largest risk)

1. Replace the hardcoded `runner/*.test.js` list on ~line 265 with derivation from the print mode per §3.3. Keep the `backend)`/`frontend)` cases byte-identical.
2. Keep the `run` helper semantics: real runs execute `node --test <suites>`; `--dry-run` echoes `would run: node --test <suites…>`.
3. Verify bash-only constraints: no new external commands beyond `node`; `bash -n publish.sh` passes; if the repo lints shell scripts in CI (Security Script Tests branch), run that suite.

### Step 3 — Rewrite the pin test in `tests/publish.test.mjs` (~line 113)

The current test ("runner gate runs the same suite list…", deepStrictEqual of two lists) becomes vacuous once there is one list. Per survey q2, rewrite — do not delete — to pin the new contract:

1. Assert `publish.sh` contains no hardcoded runner suite filenames: grep-equivalent for `runner/[A-Za-z0-9.-]+\.test\.js` matches nothing in `publish.sh` (the task's acceptance grep; allow only the deriving line — which names the print-mode flag/script path, not suite files — so in practice expect zero matches).
2. Assert the runner gate derives from the single source: the `runner)` case of `gate_for()` references `scripts/run-tests.mjs` and the print-mode flag.
3. Assert end-to-end equivalence of what actually runs: capture the print-mode output and assert it deep-equals the `runner/*` args of the `buildBranches()` "Unit Tests (runner)" branch (this preserves the old test's "no under-tested channel" intent: publish can only run what the gate branch names, because it reads the same binding).
4. Optionally assert fail-closed behavior: temporarily breaking the lookup (e.g. invoking the gate extraction against a fixture `publish.sh` copy with a bogus script path) yields non-zero — only if this can be done hermetically without slowing the suite; otherwise cover it in the dry-run manual check (§7.4).
5. Update the stale comment ("The two lists are pinned equal here instead of sharing code: publish.sh must stay dependency-free bash") to describe derivation ("publish.sh derives the list live via node, which the gate already requires").

### Step 4 — Cover the print mode in `tests/run-tests.test.mjs`

Add a small `describe` block (or extend the existing runner-branch test) asserting:

1. The print-mode output (via `spawnSync(process.execPath, ["scripts/run-tests.mjs", "--print-runner-suites"])`) lists exactly the `runner/*` args of the `buildBranches()` runner branch, in order.
2. Exit code 0 and no extraneous stdout lines (every line matches `runner/…​.test.js`).
3. The guard intent: output contains no bare directory (`runner/` alone, `runner` alone) and no glob characters (`*`, `?`, `[`).

Keep the existing on-disk pin test (~line 71) as is — it now guards the single source, which is exactly its job.

## 7. Verification plan (proves the acceptance criteria)

Run in this order; every step must pass before declaring done. None of these change shipped behavior — they are the assurance plan.

### 7.1 Static checks (fast, run first and after every edit)

- `node --check scripts/run-tests.mjs`
- `bash -n publish.sh`
- `grep -nE 'runner/[A-Za-z0-9.-]+\.test\.js' publish.sh` returns nothing (acceptance: no hand-maintained copy outside the deriving line; the deriving line itself names no suite files, so expect zero matches total).
- `grep -n 'run-tests.mjs' publish.sh` shows the deriving line in the `runner)` case.
- Confirm no `npm`/`require` in the new publish path: inspect the `runner)` case diff (the rest of `publish.sh` legitimately uses both elsewhere).

### 7.2 Unit / self-test suites

- `node --test tests/run-tests.test.mjs tests/publish.test.mjs` — must pass (rewritten pin + new print-mode tests).
- Full Harness Self-Tests branch as the gate runs it (it includes both files plus the shell-script security tests if `publish.sh` is covered there).

### 7.3 Throwaway-suite acceptance test (the task's core criterion)

1. Create `runner/__tmp.test.js` — a minimal passing suite (e.g. one trivial `test()`), registered only in `scripts/run-tests.mjs` (append `runner/__tmp.test.js` to the Phase-1 binding).
2. Run `node --test tests/run-tests.test.mjs tests/publish.test.mjs` — both must pass with no `publish.sh` edit.
3. Prove both gates execute the new suite:
   - Gate side: `node scripts/run-tests.mjs --print-runner-suites | grep __tmp` (and/or run the runner branch command and observe the file in output).
   - Publish side: run the derived runner gate line in dry-run form (see §7.4) and observe `runner/__tmp.test.js` in the echoed `node --test` command; optionally execute the derived command for real against just the throwaway file.
4. Delete `runner/__tmp.test.js` and revert the one-line registration. Re-run the two test files to confirm green again.

### 7.4 publish.sh dry-run well-formedness (real `--fast`-style check)

- `./publish.sh --dry-run --runner` (and `--dry-run --all`): exit 0, output contains `would run: node --test runner/ciBranchWorkdir.test.js …` (full derived list) — or, under `--fast`, the documented skip line plus compat output; the task asks for a dry run of the runner gate line, so exercise the non-`--fast` dry-run path where `gate_for runner` actually expands.
- Negative check: temporarily point the deriving line at a nonexistent script (scratch copy of `publish.sh` in `/tmp`, never committed) and confirm the runner gate fails closed with a clear stderr message and non-zero exit — no vacuous `node --test` with zero files.
- Existing fixture tests in `tests/publish.test.mjs` copy the real `publish.sh` into fixture repos — confirm they still pass, since the deriving line now assumes `scripts/run-tests.mjs` exists next to `publish.sh` (fixtures that copy only `publish.sh` + stubs may need the fixture to also copy `scripts/run-tests.mjs`, or those tests only exercise `--fast`/`--dry-run` paths that never expand the runner gate — check each fixture: the tag test uses `--fast`, the tip/ff/stale-deps tests use `--frontend`, so none expands `gate_for runner`; document this finding either way).

### 7.5 Full gate (slow, run last)

- `node scripts/run-tests.mjs` full gate passes (or `--no-canary` for the fast signal plus a canary-inclusive run if time permits — do not change canary defaults; just report which form was run). Budget ~60–70s without canary, ~6–7 min with canary, per the file header.

## 8. Documentation plan

- Code comments (the primary docs for this change):
  - `scripts/run-tests.mjs`: header `@example` for the print flag; comment on the extracted binding restating single-source ownership ("publish.sh derives its runner gate from this via --print-runner-suites — edit here only").
  - `publish.sh`: comment on the `runner)` case stating derivation, the fail-closed contract, and the never-a-bare-directory-or-glob rule.
  - `tests/publish.test.mjs`: replace the stale "pinned equal instead of sharing code" comment with the derivation rationale.
- Task folder: if any survey default (§2) is overridden at implementation time, append a dated note to this task's docs naming the override and reason. No other docs changes needed — this is a hygiene change with no user-facing behavior delta. Do not update changelogs, ADRs, or READMEs unless the repo's proof-hygiene gate demands it.

## 9. Risks and mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Fixture tests copy `publish.sh` without `scripts/run-tests.mjs`, breaking a fixture that expands the runner gate | Low (current fixtures use `--fast`/`--frontend`, see §7.4) | Verify each fixture path; if one expands the runner gate, copy the script into the fixture or stub the print mode |
| Word-splitting/quoting bug in the deriving line drops or merges filenames | Medium (bash) | One-path-per-line + `mapfile`/scoped-`IFS` read; dry-run output asserted to contain every suite; `bash -n` + existing shell tests |
| Vacuous pass if lookup yields empty output and `node --test` runs with no files | Medium impact | Explicit empty-output guard returning 1 (§3.3); negative check in §7.4 |
| Print mode accidentally runs gate side effects (provisioning, pruning) | Low | Short-circuit before `main()`'s side effects; test asserts sub-second runtime and stdout purity |
| `--print-runner-suites` collides with a future gate flag or confuses `resolveCanary`/`resolveFailFast` | Low | Distinct `--print-*` namespace; existing resolver tests must pass unmodified |
| Windows portability of the new `publish.sh` line | None (`publish.sh` is already bash-only; `run-tests.mjs` portability is unaffected) | No action |

## 10. Ordered work checklist (big pieces first)

- [ ] 1. Read `scripts/run-tests.mjs` runner branch, `publish.sh gate_for()`, both pin tests, and the referenced failure report (done at plan time — re-verify line numbers at implementation time, HEAD may have drifted).
- [ ] 2. Confirm survey defaults (§2) or record overrides.
- [ ] 3. Phase 1: extract the suite list into one exported binding; `buildBranches()` references it; run §7.1–7.2 (tests unmodified, green).
- [ ] 4. Phase 2 Step 1: add `--print-runner-suites` to `scripts/run-tests.mjs` + header doc.
- [ ] 5. Phase 2 Step 2: rewire `publish.sh` runner case to derive; `bash -n`; dry-run check (§7.4).
- [ ] 6. Phase 2 Step 3: rewrite the `tests/publish.test.mjs:113` pin into a derivation test.
- [ ] 7. Phase 2 Step 4: add print-mode coverage to `tests/run-tests.test.mjs`.
- [ ] 8. Run §7.1 static checks (acceptance grep must be empty).
- [ ] 9. Run §7.2 suites green.
- [ ] 10. Run §7.3 throwaway-suite acceptance test, then remove the throwaway and re-green.
- [ ] 11. Run §7.4 dry-run well-formedness + fail-closed negative check.
- [ ] 12. Run §7.5 full gate; record the exact command and wall time.
- [ ] 13. Final review: `git diff --stat` touches only `scripts/run-tests.mjs`, `publish.sh`, `tests/publish.test.mjs`, `tests/run-tests.test.mjs` (+ task docs); no test-content, ordering, or runner-source changes.

## 11. What success looks like

After this change, the stage-brief instruction that caused the incident — "register the new suite in `scripts/run-tests.mjs` only" — is the correct and complete instruction: one edit, both gates run the suite, both pin tests pass, and no second list exists to forget.
