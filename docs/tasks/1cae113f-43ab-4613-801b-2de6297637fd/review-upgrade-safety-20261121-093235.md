<!-- KAINBAIN PR-REVIEW REPORT (docs-only stage) -->
# PR Review (upgrade safety): Surface runner commit/hook failures in the task UI

**Task:** `1cae113f-43ab-4613-801b-2de6297637fd` · **Branch:** `kb/1cae113f-43ab-4613-801b-2de6297637fd`
**Scope of this stage:** will the current change, as implemented, break existing
installs on update? If yes, fail the stage; do not fix. Read-only audit of
`origin/main` (`64e428e6`) vs this branch's HEAD (`5d118739`), plus a live
old-install/new-format simulation. Docs-only: this file is the only change.

## Verdict: PASS — no install-breaking change found

Every persistence, wire, dispatch, and module-loading surface the change
touches is additive with a tolerant fallback on both sides of the version
skew. The change needs no migration, no new dependency, no new config, and
no new task status. Existing tasks on update behave byte-for-byte as before
until they newly emit a deterministic git failure — the only update-time
behavior change, and it is the feature itself.

## Evidence

### 1. On-disk format: optional frontmatter line, no migration

- `api/work/taskPersistence.js` persists `gitFailureStreak` only when truthy,
  via `_formatFrontmatterValue(JSON.stringify(...))` — the exact pattern
  already on `main` for `reviewBaseline`, `reportMetadata`, `timelineMetadata`,
  etc. (`git show origin/main:...` lines 75/96-98).
- `api/work/taskFiles.js` is byte-identical between `origin/main` and HEAD
  (verified in the simulation below), and its `_parseFrontmatter` is a generic
  `key: value` map. `parseTaskMarkdown` reads only known keys; `gitFailureStreak`
  appears 0 times in the `main` version, so older code ignores the line.
- Live simulation (`node /tmp/kb_upgrade_sim.mjs`, result archived below):
  NEW `saveTaskMarkdown` wrote
  `gitFailureStreak: "{\"stageId\":\"build\",...}"` (properly escaped);
  the `main` parser bytes read it as an opaque string key; NEW
  `parseTaskMarkdown` round-tripped it exactly; tasks without a streak write
  no line and parse to `undefined`. Downgrade- and upgrade-safe both ways.
- Complementary stale-file tolerance: the new parser drops corrupt streak
  JSON silently (fail-open, task dispatches normally), pinned by
  `taskPersistence.test.js` ("omits the streak line when absent and tolerates
  corrupt values").

### 2. Wire contract: additive optional field, tolerated on both sides

- Runner → backend: `gitFailure` on `POST /tasks/:id/complete-execution` is
  additive. The old handler (`origin/main` `runnerRoutes.js`, inspected) reads
  only named `request.body` fields with no JSON-schema validator, so a new
  runner talking to an old backend never 400s — the field is ignored and the
  failure is still recorded with the one-line `failureReason` (strictly more
  visible than today's journal-only behavior, no crash: the daemon catches
  report failures and falls back to interrupt-with-reason, then returns).
- Backend robustness: `sanitizeGitFailure` drops absent/malformed payloads with
  a warning, never a 400, and treats unknown fields leniently. Old-runner
  payloads hit the identical code path as before. Pinned by
  `applyRunnerReport.test.js` ("old-runner compat"), `runnerRoutes.test.js`,
  and `sanitizeGitFailure.test.js`.
- `interrupt` gaining an optional `reason` uses a parameter that already
  existed on `main` (`executionLedger.interruptExecution` accepts `reason`);
  `interrupt()` deliberately still never touches `lastError`.

### 3. Dispatch: gate is unreachable for legacy tasks

- `isSchedulerRunnable` gains `isGitFailureParked(task)`, which returns `false`
  for any task lacking a valid `gitFailureStreak` — i.e. every task in every
  existing install on the first post-update dispatch cycle. Parking requires
  three NEW successful `complete({outcome:"failed", gitFailure})` reports on
  the same stage with the same signature, a state pre-update code cannot
  produce.
- All four dispatch call sites (`scanClaimableTasks`, `findNextCandidateTask`,
  `findResumedCandidate`, `isWaitingForPickup`) go through the single gate, and
  the direct-claim `409 GIT_FAILURE_PARKED` follows the established 409-skip
  pattern (`RUNNER_VERSION_BELOW_MINIMUM`, `STALE_EPOCH`, …). Operator unpark
  paths (retry / resume / move / success advance) all clear the streak
  (`stageTransitions.js`).
- Embedded (non-runner) dispatch shares the gate but can never create a
  streak — identical behavior for embedded installs.

### 4. Classification: new tag only, old heuristics untouched

- `classifyStageError` gains one early equality branch for
  `failureKind === "commit-failed"` → `logical/commit-failed` (failback,
  non-retryable). The abort/auth/infra checks it precedes are untouched; the
  `"infrastructure"` tag check and every other classifier branch are unchanged.
  Old runners never send `"commit-failed"`, so no pre-existing report changes
  classification after update.
- `circuitSensors` likewise only adds `commit-failed` exclusions; all other
  kinds take the identical path.
- `failureKind` is a new value in an existing string field — no schema change,
  no new status, no exhaustive switch anywhere (`=== "rejected"`,
  `=== "infrastructure"` checks tolerate it by falling through).

### 5. Module loading and packaging: no new dependency, existing layouts

- `shared/gitFailure.js` (re-export shim) + `shared/gitFailure/` are importable
  everywhere required: `origin/main` `runner/daemon.js` already imports four
  `../shared/*.js` modules, so every runner install ships `shared/`;
  dozens of frontend files already import `../../../../shared/*.js` and
  `frontend/vite.config.js` sets `server.fs.allow: ['..']`.
- Live proof: `node --check` on all new files; ESM import smoke of
  `shared/gitFailure.js` (all 9 exports resolve); `npm run build --prefix
  frontend` succeeds (the new `GitFailureDetails.jsx` import bundles).
- `git diff --name-only` shows no `package.json`, lockfile, manifest, or env
  change. The pre-commit hook change is a 2-line comment. No new runner test
  files were added, so no `run-tests.mjs` registration was needed.

### 6. Frontend old/new skew

- Old frontend + new backend: `isRejectedTask` is `=== "rejected"`, so
  `failureKind: "commit-failed"` renders the generic banner; `gitDiagnostics`
  rides the untouched `gitDiagnosticsOf` channel (byte-identical file on both
  sides) and is ignored by old renders. No crash path.
- New frontend + old payloads: `GitFailureDetails` is null-safe on
  absent/malformed diagnostics and `isCommitFailureTask` is shape-gated
  (`hookOutput` string + `files` array + `remedy` string), so backend
  `merge-conflict`/`sync-blocked` shapes and plain failures keep the exact
  old banner — pinned in both `TaskDetailPage.test.jsx` and
  `TaskDetailsTabContent.test.jsx`.

## Test evidence (this session)

- Backend touched set via the project entry (`npm run test:api -- …`):
  349/349 pass (12 files, incl. streak round-trip, old-runner compat,
  malformed-payload, parking, scheduler gate, taxonomy, circuit sensors).
  Note: invoking `api/node_modules/.bin/vitest` from the repo root
  mis-resolved the config and produced 11 environment-only failures in
  `circuitSensors.test.js` / `taskErrors.taxonomy.test.js`; the same files
  pass via the project entry. Not a code issue.
- Frontend touched set (`npm run test:frontend -- …`): 154/154 pass (6 files).
- Runner touched set (`node --test runner/…`): 246/246 pass (4 files).
- Upgrade simulation (`node /tmp/kb_upgrade_sim.mjs`): taskFiles
  byte-identical; newline-free escaped streak line; old parser surface reads
  it as an opaque key (`main` has 0 references); new parser round-trips;
  streakless tasks parse to `undefined`. `git status` clean afterwards
  (`frontend/dist` ignored; scratch under `/tmp` only).

## Behavior changes on update (intended, not breaks)

- A task mid-crash-loop (the incident's 10,776-restart state) stops
  crash-looping on first post-update failure: it records a `failed` completion
  and parks after three same-signature strikes instead of spinning.
- Transient git faults now interrupt **with** a human-readable reason
  (same interrupt call, reason string was already supported).
- Mixed-fleet nuance (fail-open): a non-git failure report clears the streak,
  so interleaved old-runner reports delay parking but can never cause a
  wrong park. Worst case is a few extra retries, never a stuck or crashed
  install.

No install-breaking issue found; nothing to fail.
