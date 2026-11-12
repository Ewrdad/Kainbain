# Implementation Plan — stage+config hash in commits and stage history

Task: `d20f0c83-d132-43aa-95e0-d9fac42c9e6b`
Goal: prove that a task went through a given stage under a given config, by storing a hash of the task+stage config and a hash of the commit, in both stage history and wrap-up commits.

## 0. Evidence and inputs used

- Task text (this stage prompt): store "a hash of the task+stage config and hash of commit" in "stage history and wrap up commits" for compliance proof.
- Prior stage reports: the only file under `docs/tasks/d20f0c83-d132-43aa-95e0-d9fac42c9e6b/` in git history is `idea-20261111-003614.md` (commit `e7aafc6`), which is a 3-line auto-generated `PASSED` stub with no content.
- SURVEY.md: **does not exist** on branch `kb/d20f0c83-d132-43aa-95e0-d9fac42c9e6b` (checked working tree and `git log --all`). The "grill me" survey could therefore not be factored in. Step 1 includes reconciling this gap; the assumptions below (§1) are the fallback if no survey appears.
- Code inspected (all paths relative to repo root):
  - Embedded wrap-up commit: `buildStageCommitMessage` + `finalizeTaskBranch` in `api/work/taskFinalize.js` (subject + full curated prompt body, committed via `commitAllIfNeeded` in `api/git/commit.js`).
  - Runner wrap-up commit: `commitAndPush` in `runner/gitOps.js`, called from `runner/daemon.js` (~line 1664) with message ``kb/<taskId> <stageId>: Runner <runnerId> stage output``.
  - Stage history: `task.history` array of `{ timestamp, action, ... }` entries, written in `api/work/taskPersistence.js`, `api/work/taskFinalize.js`, `api/work/taskLifecycle.js`, `api/flow/commandStages.js`, `api/flow/executionLedger.js` (`recordProgress`, `completeExecution`, `noteRemoteVerification`), and `api/continuity/deployReconcile.js`.
  - Stage config source: stages come from the project/workflow config (`project.stages`, `workflowRegistry.js`); task state via `api/taskStore.js` + `api/work/*`.
  - Sharing precedent: `shared/stageVerdict` is the backend↔Runner shared module pattern to copy.
  - Existing hashing precedent: `node:crypto` sha256 in `api/auth/*` (e.g. `apiKeyStore.js`, `sessionStore.js`) and `runner/updates/verify.js`.
  - Tests: `vitest run` per package (`api/package.json`, `frontend/package.json`); gates are `npm run test:unit` and `npm test` (`scripts/run-tests.mjs`).

## 1. Assumptions (to confirm against SURVEY.md if it appears)

1. "Stage history" = the task's `task.history` entries (rendered in-app), not git history.
2. "Wrap up commits" = both per-stage auto-commits: embedded (`finalizeTaskBranch`) and Runner (`commitAndPush`).
3. "Task+stage config" = the task identity/goal plus the stage's resolved config (stage id, type, and workflow-defined settings) as they were at stage execution time. Exact field list is pinned in Step 2.
4. Proof is hash-based linkage (config hash + commit SHA recorded together with a timestamp), not cryptographic signing. No PKI in scope.
5. Old tasks/stages without hashes stay valid; absence of a hash means "predates this feature", never "failed compliance".

## 2. Goal

After each stage completes, a verifier can take the stage-history entry and/or the wrap-up commit and confirm: this task passed through this stage, under this exact config, producing this exact commit — without trusting prose log lines.

## 3. Success criteria

1. Every new stage completion records a `configHash` (hash of task+stage config) and `commitSha` (hash of the wrap-up commit, or explicit `no-commit` marker when the tree was clean) together in the task's stage history.
2. Every new wrap-up commit carries the same `configHash` (and self-identifying stage/task ids) in a machine-parseable form.
3. One documented verification procedure (command or doc steps) lets a human confirm history-entry ↔ commit ↔ config linkage for any recent task.
4. Embedded path and Runner path both covered; no behavior change for human-approval stages (which never finalise — see `ensureTaskBranchRef` note in `taskFinalize.js`).
5. `npm run test:unit` and `npm test` green; no existing test weakened to fit.

## 4. Approach

Make the change easy first, then make the change:

- **Easy first (Steps 2–4):** research to pin the exact config bytes; one shared canonical-hash module (backend + Runner import the same code, following the `shared/stageVerdict` pattern); small helpers to attach structured fields to history entries and trailers to commit messages; characterization tests locking current behavior.
- **Then the change (Steps 5–6):** wire the helpers into the two commit paths and the history writes.
- **Then proof it works (Steps 7–8):** verification procedure + docs, then the full test gate.

### Key decisions

1. **Algorithm: sha256 over canonical JSON** (`node:crypto`, already used in `api/auth` and `runner/updates`). Canonical form: UTF-8, recursively key-sorted JSON, no whitespace. Rationale: deterministic across backend/Runner, no new dependency. Rejected: object-hash libs (new dep, two runtimes to keep in sync), git-notes (invisible in current tooling, extra fetch surface).
2. **One shared module** (e.g. `shared/stageAttestation/` with one file per function, mirroring `shared/stageVerdict` / `shared/toolLogFormat` layout): canonicalize, hash config, format/parse commit trailers, build history-entry fields. Rationale: the compliance claim dies if backend and Runner hash differently; shared code makes drift a compile/test failure instead of a silent mismatch.
3. **Commit carriage: git trailers in the commit body** (e.g. `KainBain-Task:`, `KainBain-Stage:`, `KainBain-Config-Hash:`), appended after the existing body, parseable with `git log --format=%B`. Rationale: survives merges/pushes, needs no git-server features, keeps the scannable subject lines (`STAGE_COMMIT_GOAL_SUBJECT_CHARS`, Runner `stage output` subject, changelog admin-commit filter) untouched. The commit's own SHA is the commit hash — recorded into history after the commit returns, never predicted before.
4. **History carriage: structured fields on the entry** (`configHash`, `commitSha`, `stageId`, `taskId`, `timestamp` already exists), keeping the prose `action` line for humans. Precedent: `runnerId` is already attached structurally in `executionLedger.js`.
5. **Clean-tree stages record `commitSha: null` + stable marker** (e.g. `commit: none (clean tree)`) rather than skipping the entry. Rationale: compliance needs "stage ran, nothing to commit" to be distinguishable from "no record".
6. **No config snapshot stored, only the hash** (plus ids). Rationale: configs can carry secrets/keys; a hash cannot leak them, while a stored snapshot could. Verification re-hashes the config from the workflow definition + task record.

## 5. Steps

### Step 1 — Reconcile the missing SURVEY.md (unblocks assumptions)

- Check whether a grill survey exists anywhere else (task UI export, another branch, `docs/tasks/active/`): `git log --all --oneline -- "*d20f0c83*"` and ask the task owner.
- If found: update §1 assumptions and re-check decisions 2–6 against it before starting Step 5.
- If not found: proceed on §1; note the gap in the final report.
- Output: a 5-line note at the top of the final report saying which happened.

### Step 2 — Research: pin the exact hashed bytes (research spike, before any production edit)

- Identify the canonical sources at stage-execution time: stage definition (`project.stages` / `workflowRegistry.js` resolution, `stageResolution.js`, `stagePolicy.js`), task fields (`api/taskStore.js`), and what each path has in hand (`finalizeTaskBranch` has the full task; Runner `daemon.js` has dispatch payload + `client.getTask`).
- Enumerate every consumer of `task.history` entries and of the two commit message formats (UI renderers, changelog filter `shared/changelogHistory/isAdminCommitSubject.js`, `api/watch/stageReports.js`, tests) to fix compatibility constraints.
- Decide the exact hashed object, e.g. `{ taskId, goal, workflowId|workflowVersion, stage: { id, type, config } }`, and the rule for fields that legitimately vary (timestamps, SHAs must be excluded or the hash never verifies).
- Output: a short table (field → source → included/excluded + why) added to the final report or a `docs/` note. No production code changes in this step.

### Step 3 — Shared attestation module + unit tests (make-change-easy)

- Create `shared/stageAttestation/` (one file per function + `index.js` front file, per repo convention):
  - `canonicalize(value)` — stable stringify (recursive key sort; throws on `undefined`/functions/circular to fail loud, mirroring the `ingestLogEvents` JSON-safety stance).
  - `hashConfig(obj)` — `sha256(canonicalize(obj))` hex.
  - `formatTrailers({ taskId, stageId, configHash })` / `parseTrailers(body)` — round-trip safe.
  - `historyFields({ taskId, stageId, configHash, commitSha })` — the structured entry fields.
- Tests: `shared` consumers are tested via `*.shared.test.js` in `api/` (e.g. `stageVerdict.shared.test.js`, `survey.shared.test.js`) — add `api/stageAttestation.shared.test.js` covering: key-order independence, unicode/whitespace stability, trailer round-trip, rejection of unserializable input, and a golden vector (fixed input → fixed hash, guards against accidental algorithm drift).
- Wire the Runner import the same way Runner consumes `shared/stageVerdict` today (check `runner/` import of shared and `runner/updates` test setup).

### Step 4 — Characterization tests + helpers at the seams (make-change-easy)

- Add characterization tests locking current behavior before changing it: `buildStageCommitMessage` subject/body shapes (`api/work/taskFinalize.test.js` style), Runner `commitAndPush` message passthrough (`runner/gitOps.test.js` style), and the history `record()` / `recordProgress` / `completeExecution` entry shapes.
- Add the seam helpers without wiring them yet: an `appendAttestationTrailers(body, fields)` used by message builders, and a `recordStageAttestation(task, fields)` history helper. Unit-test both in isolation.
- Validation: new tests pass; `npm run test:unit` green; zero production behavior change (prove by `git stash`-free review: all edits are new files + new test files).

### Step 5 — Wire the embedded path (make the change)

- `api/work/taskFinalize.js`: compute `configHash` from the Step-2 object at finalize time; append trailers to the commit body in `buildStageCommitMessage` (or at the `commitAllIfNeeded` call site — prefer the call site so the pure builder's contract stays intact); after commit, `record()` the history entry with `{ stageId, configHash, commitSha: hash || null }`.
- Handle: clean tree (`committed: false` → `commitSha: null` + marker), commit failure (record `configHash` with `commitError`, never fake a SHA), push failure (hash still valid — push state is separate), human stages (no finalize — unchanged).
- Tests: extend `api/work/taskFinalize.test.js` — attested commit message contains parseable trailers; history entry carries both hashes; clean-tree and failure cases.

### Step 6 — Wire the Runner path (make the change)

- `runner/daemon.js` (+ `runner/gitOps.js` if the trailer append lives there): same `configHash` computation from the Runner-visible config (must be byte-identical input to Step 5 — this is the highest-risk item, covered by a cross-path test); commit message gains the trailers; `client.complete` already reports `sha` — extend the completion payload with `configHash` (check `api/flow/execution/applyRunnerReport.js` + `executionLedger.completeExecution` for the receiving side) so the backend writes the attested history entry.
- Mixed-version rollout: old Runners send no `configHash` → backend records entry without it (same posture as `pendingPushVerification`/serving-model null handling); new backend never rejects old reports.
- Tests: Runner unit tests for message + payload; backend tests for receiving side with and without `configHash`; one integration test asserting embedded and Runner produce the same `configHash` for the same fixture.

### Step 7 — Verification procedure + docs (prove the compliance story)

- Document the proof flow in `site-docs/` (or the task's report dir): given a task id, (a) read the history entry (`configHash`, `commitSha`), (b) `git log` the wrap-up commit and parse trailers, (c) re-hash the stage config per the Step-2 table and compare. Provide exact commands.
- If cheap, add a read-only verify helper (script or endpoint) that does (a)–(c) and prints PASS/FAIL; if not cheap, the doc procedure plus `parseTrailers` unit coverage is the floor.
- Update `CHANGELOG.md` and any agent-facing docs (`api/agentGuide.js` surface if it enumerates history/commit formats).

### Step 8 — Full gate + cleanup

- Run `npm run test:unit`, then `npm test` (`scripts/run-tests.mjs`), plus `npm run lint` for touched packages.
- Manual end-to-end on a scratch task: run one embedded stage and (if a Runner is available) one Runner stage; show `git log --format=%B` trailers and the history entry side by side in the final report.
- Confirm no widened scope: `git status`/`git diff --stat` contains only the planned files.

## 6. Validation plan

| Step | Check | Expected evidence |
|---|---|---|
| 1 | Survey search + owner ask | 5-line note: found (link) or not-found, assumptions stand |
| 2 | Config-source table | Field → source → in/out table; reviewer can reproduce the hashed object |
| 3 | `npx vitest run stageAttestation` (api) + golden vector | Green; golden hash stable across runs/machines |
| 4 | `npm run test:unit` | Green with zero production diff |
| 5 | `api/work/taskFinalize.test.js` + new cases | Trailers parseable; history has both hashes; clean-tree/failure cases covered |
| 6 | Runner + backend report tests; cross-path fixture test | Same `configHash` from both paths; old-Runner payload accepted |
| 7 | Doc procedure executed by hand on a scratch task | Pasted commands + outputs showing history ↔ commit ↔ config agreement |
| 8 | `npm test`, `npm run lint` | Green; diff scoped to plan |

Highest-risk validation: the Step 6 cross-path `configHash` equality test — if embedded and Runner disagree on one byte, the compliance claim is void. Write that test in Step 3 (as a fixture both paths must satisfy) even though it only goes green in Step 6.

## 7. Risks and open questions

- **Config drift over time:** if the workflow definition changes after a stage ran, re-hashing today's config won't match. Mitigation: hash a versioned/pinned stage config (Step 2 decides: workflow version or inline snapshot-of-hashed-fields). Open: does the project config carry a version today?
- **Runner/backend input mismatch:** different field availability per path. Mitigation: shared module + cross-path fixture test (Steps 3, 6).
- **Secret adjacency:** hashing is safe, but any debug logging of the pre-hash object is not. Mitigation: never log the config object; log only the hash (precedent: `redactSecrets.js`, processor redaction in `executionLedger.js`).
- **Commit body size:** trailers add ~200 bytes; curated-prompt bodies already truncate at `STAGE_COMMIT_BODY_MAX_CHARS` — trailers must be appended after truncation, never truncated away.
- **Changelog noise:** new trailers must not trip `isAdminCommitSubject` differently than today (subjects unchanged — verify in Step 5 tests).
- **Scope guard:** no signing/PKI, no backfill of old stages, no UI redesign — history entries render as today with extra structured fields available to consumers.

## 8. Non-goals

- Cryptographic signatures, timestamps from a third-party TSA, or any PKI.
- Backfilling hashes for stages completed before this change.
- Changing commit subjects, changelog filtering, or stage execution semantics.
- A compliance dashboard UI (the doc procedure + structured data is the deliverable; UI can follow).
