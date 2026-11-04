# Implementation Plan — Runner agent-stage failure detection

- Task: `d84ab136-27e0-475e-8241-c5d5421f07b5`
- Date: 2026-11-04
- Status: plan (not started)
- Survey input: [SURVEY.md](./SURVEY.md) (unanswered — recommended options adopted, see §3)
- Prior idea doc: referenced as `idea-20261103-215857.md` but not present on disk (only `SURVEY.md` exists in this task dir); plan is grounded in the task text plus code reads instead.
- Evidence task: `docs/tasks/384fb893-cc35-4e87-9333-063b76bbe27b/` (contains only `task.md`; the FAIL signals live in logs — re-verify in Phase 0)

## 1. Goal

Make a runner-dispatched agent stage fail exactly the way the embedded/backend-executed agent path fails today when the agent either calls the `fail_stage` tool or ends with a well-formed `KAINBAIN_VERDICT: FAIL` + reason + fix block: report `failureKind: "rejected"` through `routeStageError` (failback per stage config) instead of recording `failureKind: "none"` and advancing.

## 2. Background / root cause (verified this session)

Embedded path (`api/agentRunner.js`) — the reference behavior:

- Line 771: `stageFailureRequested` latch, set at line 811 on `tool_started` events with `toolName === "fail_stage" || toolName === "Fail_stage_skill"`, capturing `args.reason || args.message` (lines 815–819).
- Lines 1042–1060: an explicit `fail_stage` call wins over session/model errors; returns `failureKind: "rejected"` with reason `[Agent Review Rejection] <reason>`.
- Lines 1139–1168: text-verdict fallback, fail-open — only parsed when `stageExpectsAgentVerdict(stage)` is true; FAIL with non-empty reason AND fix fails with `[Agent Review Rejection] <reason> Fix guidance: <fix>`; a reasonless FAIL logs `[WARN] Stage verdict FAIL ignored (fail-open)` and passes.
- Contract: `api/agent/verdictContract.js` (`stageExpectsAgentVerdict` lines 33–35, `parseStageVerdict` lines 162–218), which imports `normalizeStageType` from `../projectStore.js` (defined in `api/project/stageNormalizers.js`, lines 80–88 — a tiny pure function).

Runner path — the gap:

- `runner/daemon.js` agent path calls `runHarnessStage()` (line 1199); its `onEvent` only forwards to the structured log sender (lines 1219–1221) and never watches for `fail_stage`.
- After the run it unconditionally completes with `outcome: "passed"` (lines 1254–1267). The only failure route is the `err.failedOutcome` catch (lines 1288–1308), and `runner/harness.js` line 89 sets `failedOutcome` only when `session.prompt()` throws — but the `fail_stage` tool returns a normal success result, so nothing throws.
- Backend `api/flow/execution/applyRunnerReport.js`: `outcome.status === "failed"` routes through `routeStageError` (lines 126–164); the passed path records `failureKind: "none"` (lines 167–173) and calls `advanceStage` (line 242) without re-parsing any verdict.

Good news (no changes needed here): `runner/client.js` already passes `failureKind`/`failureReason` through on `complete` (lines 154–155, 180–181), and `api/flow/runnerRoutes.js` already forwards them into `applyRunnerReport`, which already routes `failed` + `failureKind: "rejected"` through `routeStageError`. The fix is purely: detect the failure on the runner (primary) and re-check on the backend (defense in depth).

## 3. Survey decisions (traceability)

[SURVEY.md](./SURVEY.md) round 1 is unanswered (`"answers": {}`). The plan adopts the recommended option for each question; the implementer should confirm with the human before Phase 4 (the only phase whose scope depends on Q1):

- Q1 safety net → **Yes, add the server-side double-check** (Phase 4). Protects against old runners that never learned failure detection.
- Q2 conflicting signals → **`fail_stage` tool call always wins over a PASS text block** (matches embedded precedence at `api/agentRunner.js` lines 1038–1042; encode in the shared helper).
- Q3 incomplete FAIL note → **same lenient fail-open behavior on both paths** (reasonless FAIL passes with a warning; encode in the shared helper, test parity with `api/agentRunner.verdictFailOpen.test.js`).
- Q4 proof level → **unit tests plus a live re-run of the failing example** (Phase 5 + Phase 6).

## 4. Key decisions

1. **One shared decision function, not two copies of the logic.** Create `shared/stageVerdict.js` exporting `parseStageVerdict`, `stageExpectsAgentVerdict`, plus a new pure helper `decideAgentStageVerdict({ stage, output, failStageRequest })` that encodes the embedded precedence verbatim: `fail_stage` request wins → well-formed FAIL+reason+fix fails → anything else passes (returning a `failOpenWarning` string when a FAIL was ignored, so callers can warn-log). All three call sites (runner daemon, `applyRunnerReport`, optionally `agentRunner` itself) delegate to it, so the paths cannot drift again. Rejected alternative: copying the if-chain into `runner/daemon.js` — cheaper today, guaranteed drift tomorrow (this bug is the drift).
2. **`normalizeStageType` must not be imported from `api/` by `shared/`.** `shared/` is the bottom layer (runner imports it via `../shared/`, `runner/daemon.js` lines 15–16); `api/agent/verdictContract.js` currently imports the normalizer from `../projectStore.js`. Move `normalizeStageType` into `shared/` (either inside `shared/stageVerdict.js` or as `shared/normalizeStageType.js`) and re-export it from `api/project/stageNormalizers.js` so all existing `api/` imports keep working. It is pure and 8 lines — the move is mechanical.
3. **Keep all existing import surfaces working.** `api/agent/verdictContract.js` re-exports everything from `shared/stageVerdict.js` (same pattern `api/agentRunner.js` lines 40–45 already uses for `parseStageVerdict`). `api/agent/verdictContract.test.js` must stay green unmodified.
4. **Daemon captures the `fail_stage` event; harness stays unchanged.** `runner/harness.js` already fans every normalized event out to `onEvent` (lines 57–68). The daemon's `onEvent` callback (line 1219) gains a verdict watcher alongside `structuredSender.queueEvent(event)` — no `runHarnessStage` signature change, no new harness API.
5. **Daemon agent-ness guard.** The daemon dispatches on `kind` from the claim (`runner/daemon.js` line 996): `integrate` returns early (line 1012), `ci` takes the CI branch (line 1117), everything else falls through to the agent path. The verdict check therefore lives only in the agent path (position is the primary guard) and additionally calls the shared helper with a synthesized stage `{ type: kind || "agent" }` as belt-and-braces. Trap to document in a comment: `normalizeStageType("integrate")` falls through to `"agent"`, so the guard would misfire if `integrate` ever reached it — it cannot today due to the early return, but the comment must say so.
6. **`applyRunnerReport` re-parse is scoped to agent stages reporting `passed`.** Non-agent stages and already-`failed` outcomes are untouched. On a well-formed FAIL it rewrites the outcome to `failed`/`rejected` and flows into the existing `routeStageError` branch (not a parallel failure path).
7. **Failure reason strings stay byte-identical to the embedded path** (`[Agent Review Rejection] <reason>` for tool calls, `[Agent Review Rejection] <reason> Fix guidance: <fix>` for text verdicts) so failure reports, timeline rows, and push-suppression (`failureKind: "rejected"` never alerts) behave identically.

## 5. Work plan (make the change easy, then make the change)

Big structural/research pieces first; each phase ends with a green test gate before the next begins.

### Phase 0 — Evidence + contract recon (research, ~0.5 day)

Goal: confirm every contract the later phases depend on; no behavior changes.

1. Re-locate the repro evidence: `docs/tasks/384fb893-…/` contains only `task.md` and a grep for `KAINBAIN_VERDICT|fail_stage` in it found nothing — find where the two signals (tool call + verdict block) are actually stored (task log? stage report?) and record the exact paths in the task notes.
2. Confirm the normalized `tool_started` event shape in `api/agent/sessionEvents.js` (field names for tool name and args; whether `args` arrives as object or JSON string) and mirror the exact `args.reason || args.message` fallback from `api/agentRunner.js` lines 811–819.
3. Confirm the `kind` values the backend sends on dispatch (`api/flow/dispatch/*`, `api/flow/runnerRoutes.js` claim/answer) so the daemon guard in §4.5 covers the real value set.
4. Confirm how `runSingleAssignment` tests inject `kind` today (claim stub returns only `executionId`/`epoch` in `runner/daemon.test.js`); decide the least-invasive injection for verdict tests (claim stub extension vs testing `executeAssignment` directly).

Done when: recon notes (event shape, kind values, evidence paths) are recorded in the task dir and §4 has no unverified assumption left.

### Phase 1 — Extract the shared verdict module (make the change easy; biggest piece, first)

Goal: `shared/stageVerdict.js` is the single source of truth; every existing test still green.

1. Create `shared/stageVerdict.js` (ESM, dependency-free — `shared/package.json` is `"type": "module"`):
   - `normalizeStageType` (moved verbatim from `api/project/stageNormalizers.js` lines 80–88),
   - `stageExpectsAgentVerdict` (moved verbatim),
   - `parseStageVerdict` (moved verbatim),
   - new `decideAgentStageVerdict({ stage, output, failStageRequest })` → `{ failed, failureReason, failOpenWarning }` encoding the embedded precedence (§2) verbatim, including byte-identical reason strings (§4.7).
   - Follow the `servingModelFor.js` header-comment style (MARK block documenting the shared-ownership contract and the runner bundle layout note from `runner/daemon.js` lines 11–13).
2. Re-export from `api/agent/verdictContract.js` (keep every existing export working) and re-export `normalizeStageType` from `api/project/stageNormalizers.js`.
3. Add `api/stageVerdict.shared.test.js` (vitest, following `api/servingModelFor.shared.test.js` / `api/formatPosture.shared.test.js`): parser parity cases plus `decideAgentStageVerdict` precedence matrix (tool-call wins over PASS text; FAIL+reason+fix fails; reasonless FAIL passes with warning; malformed/prose passes; non-agent stage ignores everything).
4. Run: `npm run test --prefix api -- verdictContract verdictFailOpen stageVerdict` — all green, with `verdictContract.test.js` and `verdictFailOpen.test.js` unmodified.

Done when: the shared module exists, both re-export shims are in place, new parity tests pass, and no existing test file was modified.

### Phase 2 — (Recommended, optional) Rewire `agentRunner` to delegate

Goal: prove the shared helper is behavior-identical by running the embedded path through it.

1. Replace the bodies at `api/agentRunner.js` lines 1042–1060 and 1139–1168 with calls to `decideAgentStageVerdict`, keeping the surrounding return-shape construction and the `eventBridge.emitSystemLog` warn call (feed it `failOpenWarning`).
2. Gate: the full existing `api/agentRunner.*` suite (especially `verdictFailOpen.test.js`) passes unmodified. If ANY behavioral difference appears, revert this phase and keep `agentRunner` as the reference implementation with parity tests instead — do not "fix" the tests.

Done when: suite green with delegation, or consciously skipped with a note. Either outcome unblocks Phase 3.

### Phase 3 — The change: runner daemon detection

Goal: the runner agent path reports agent-declared failures as `failed`/`rejected`.

1. In `runner/daemon.js` `executeAssignment` agent path:
   - Declare `let failStageRequest = null` before `runHarnessStage` (same hoist style as `structuredSender`, line 1040).
   - Extend the `onEvent` callback (line 1219) to also match `tool_started` with `fail_stage`/`Fail_stage_skill` and capture `args.reason || args.message` (mirror the Phase 0–confirmed event shape; observer-only — never throw).
   - After `runHarnessStage` returns (before the `complete` at line 1254): call `decideAgentStageVerdict({ stage: { type: kind || "agent" }, output, failStageRequest })`. If `failed`, `client.complete` with `outcome: "failed"`, `failureKind: "rejected"`, `failureReason`, full (capped) `output`, and the same posture/model/duration/taskFiles fields as the passed branch. If `failOpenWarning`, `logger.warn(...)` and continue to the existing passed completion. Add the §4.5 `integrate` trap comment.
2. No changes to `runner/harness.js` or `runner/client.js` (both already provide what is needed).

Done when: new runner tests (§6, rows R1–R6) pass and no existing runner test changed behavior.

### Phase 4 — Defense in depth: `applyRunnerReport` re-parse

Goal: an old runner that reports `passed` for output containing a well-formed FAIL block still cannot advance an agent stage. (Depends on Q1 confirmation if the human overrides the survey default.)

1. In `api/flow/execution/applyRunnerReport.js`, after the stage is resolved and before the `outcome.status === "failed"` branch: if `outcome.status === "passed"`, call `decideAgentStageVerdict({ stage, output: redactedOutput, failStageRequest: null })`. (Tool-call detection is unavailable here — the runner owns events; only the text block is re-checkable. Document that.)
2. On `failed`, rewrite the outcome to `{ status: "failed", failureKind: "rejected", failureReason }` and let it flow into the existing `routeStageError` branch — no new failure plumbing.
3. Document the decision (why the backend re-parses; old-runner protection) in the function's MARK comment.

Done when: new backend tests (§6, rows B1–B3) pass.

### Phase 5 — Test hardening + full gates

Goal: every acceptance criterion has a committed test; full suites green.

1. Fill any gaps in the §6 matrix (shared, runner, backend).
2. Run the full gates: `npm run test:api` (vitest: api + shared-via-api) and the runner node:test suite (`node --test runner/` or the repo's configured runner command — confirm in `package.json`/CI), plus `npm run lint --prefix api` if touched files are linted.
3. Re-run each gate on the untouched base for any failure that looks pre-existing/environmental before claiming done.

Done when: §6 matrix fully checked, full suites green.

### Phase 6 — Live repro + documentation

Goal: prove the fix end to end (survey Q4) and leave the contract documented.

1. Live repro: create a wf-test-style task whose agent stage prompts "Please fail this task" with the stage-verdict skill attached, dispatch to a remote Runner, and verify: stage ends failed, `failureKind` is `"rejected"`, and the task routes to the stage's failback instead of advancing to Review. Also verify the `fail_stage`-tool-only variant (no verdict block) fails.
2. Docs: MARK-comment updates are the primary docs (shared module header, daemon trap comment, `applyRunnerReport` note). If the repo has a runner ADR/runbook mentioning the completion contract (`runner/README.md`, `docs/`), add a short paragraph on agent-failure detection; otherwise code comments suffice — do not invent a new docs page.
3. Record repro evidence (task id, observed outcome) in this task's dir.

Done when: repro task fails back as specified and docs/comments are in place.

## 6. Test plan (acceptance criteria → tests)

Frameworks: `shared/` logic via vitest in `api/*.shared.test.js` (repo convention); runner via node:test (`runner/daemon.test.js` `runSingleAssignment` + `fakeHarness`/`stubClient` seams, `runner/harness.test.js` `createMockHarness`); backend via vitest (`api/flow/execution/applyRunnerReport.test.js`).

| ID | Acceptance criterion | Test (new unless noted) | Framework |
|----|----------------------|-------------------------|-----------|
| S1 | Shared parser/guard parity after the move | `api/stageVerdict.shared.test.js`: fence/malformed/last-wins cases; agent-only guard incl. legacy `review`/`script` | vitest |
| S2 | Shared precedence: tool call wins, FAIL+reason+fix fails, reasonless FAIL warns+passes, non-agent ignored | `decideAgentStageVerdict` matrix in the same file | vitest |
| S3 | Existing imports keep working | `api/agent/verdictContract.test.js` green UNMODIFIED; `api/agentRunner.verdictFailOpen.test.js` green UNMODIFIED | vitest |
| R1 | `fail_stage` tool event alone (no verdict block) → runner reports failed/`rejected` | daemon test: fake harness emits `tool_started fail_stage` with reason, returns plain output; assert `complete` args | node:test |
| R2 | FAIL+reason+fix block → runner reports failed/`rejected` with `Fix guidance:` reason | daemon test: prompt returns well-formed FAIL block | node:test |
| R3 | Reasonless FAIL → still passes open with a warning | daemon test: assert `outcome: "passed"` + `logger.warn` captured | node:test |
| R4 | Malformed block / prose verdict → passes | daemon test (mirror S1 fail-open cases at the daemon level) | node:test |
| R5 | Non-agent stage → verdict ignored | helper-level test: `decideAgentStageVerdict` with `{ type: "human" }`/`{ type: "ci" }` + FAIL block → passed; plus CI-path test asserting the CI branch never calls the helper | node:test + vitest |
| R6 | Conflict: `fail_stage` call + PASS text → fails (tool wins) | daemon test | node:test |
| B1 | `passed` + well-formed FAIL on agent stage → backend fails back with `rejected` (old-runner protection) | `applyRunnerReport` test: assert `routeStageError` path taken, no `advanceStage` | vitest |
| B2 | `passed` + reasonless FAIL → still advances (fail-open preserved) | `applyRunnerReport` test | vitest |
| B3 | `passed` + FAIL block on human/CI stage → advances unaffected | `applyRunnerReport` test | vitest |
| E2E | wf-test-730569-style repro dispatched to a remote Runner fails back | live repro task (Phase 6), evidence recorded | manual |

## 7. Documentation plan

- Code-level (primary): `shared/stageVerdict.js` MARK header (ownership, precedence, fail-open rule, agent-only rule); daemon trap comment (§4.5); `applyRunnerReport` MARK note (old-runner rationale).
- Task-level: Phase 0 recon notes + Phase 6 repro evidence in this task dir.
- Repo docs (only if they already describe this contract): short paragraph in `runner/README.md` or the relevant `docs/` page — check first, do not create new pages.

## 8. Validation plan

- After Phase 1: `npm run test --prefix api -- verdictContract verdictFailOpen stageVerdict` (all green, zero modifications to existing tests).
- After Phase 3: runner node:test suite green; new R1–R6 tests fail on the pre-fix code (verify by stashing the daemon change and re-running — a test that passes without the fix proves nothing).
- After Phase 4: `npm run test --prefix api -- applyRunnerReport` green; B1 fails on pre-fix code (same stash check).
- After Phase 5: full `npm run test:api` + runner suite + lint green.
- After Phase 6: live repro task ends failed with `failureKind "rejected"` and failback routing (not advanced to Review).

## 9. Risks / mitigations

- **Shared-module layering violation** (`shared` importing from `api/`): avoided by moving the normalizer down into `shared/` (§4.2). Mitigation: a test asserting `shared/stageVerdict.js` has no `../api` import is cheap — consider adding it.
- **Drift between embedded and runner semantics**: avoided by the single shared helper (§4.1) + parity tests (S2/S3).
- **`kind` value set incomplete** (e.g. a future kind reaching the agent path): Phase 0 enumerates real values; the synthesized-stage guard plus trap comment covers the rest.
- **Double-failure / double-report**: the runner reports once (either passed or failed); the backend re-parse only converts passed→failed, never re-fails an already-failed outcome. B3-style tests pin this.
- **Old-backend/old-runner interop**: new backend + old runner → protected by Phase 4; old backend + new runner → new runner still sends the same `complete` shape (`outcome`/`failureKind`/`failureReason` already exist on the wire), so nothing breaks.
- **Event-shape mismatch** (args as string vs object): Phase 0 confirms; implementation mirrors the embedded try/catch parse exactly.

## 10. Non-goals

- No changes to the verdict block syntax or the stage-verdict skill.
- No changes to `runner/harness.js`, `runner/client.js`, the dispatch/claim protocol, `routeStageError`, or failure taxonomy.
- No new docs site pages; no CI/human/merge stage behavior changes.
- No backfill of already-misreported runs (evidence task stays as history).

## 11. Open questions

1. (For the human, only if overriding survey defaults) Q1: keep the Phase 4 server-side double-check? Default yes.
2. `idea-20261103-215857.md` is referenced by the stage but absent on disk — confirm there is no extra context to incorporate. Default: no.
3. Exact live-repro mechanics (which Runner, which workflow fixture) — decide in Phase 6 with the operator.

## 12. Acceptance checklist (from the task)

- [ ] Repro-style task dispatched to a remote Runner ends failed (`rejected`, failback routing) instead of advancing.
- [ ] `fail_stage` tool call alone fails the stage on the runner path.
- [ ] FAIL block without reason/fix still passes open with a warning (embedded parity).
- [ ] Human and CI stages unaffected by verdict blocks.
- [ ] Runner daemon/harness tests: tool event → failed; FAIL+reason+fix → failed; reasonless FAIL → passed; non-agent → ignored.
- [ ] `api/agent/verdictContract.test.js` green after the shared move, unmodified.
