# Phase 0 recon notes — Runner agent-stage failure detection

Date: 2026-11-04. No behavior changes in this phase.

## 1. Repro evidence

`docs/tasks/384fb893-cc35-4e87-9333-063b76bbe27b/` contains only `task.md`,
which holds frontmatter + goal + one history line (task sits at stage `1`
Idea — the repro run's log/stage-report rows are not on disk). The two FAIL
signals (fail_stage tool call + KAINBAIN_VERDICT block) live in the task log
only. The task text is authoritative for the signal shapes; nothing further
to re-verify on disk.

## 2. Normalized `tool_started` shape (confirmed)

- Vocabulary: `api/agent/sessionEvents.js` — `tool_started` carries
  `toolName`, `toolCallId`, `args`, … (payload fields preserved untouched by
  the pi mapper, `api/agent/harnesses/pi/piSessionEvents.js`).
- `args` arrives as an object on the in-process path the Runner uses
  (`runHarnessStage` subscribes directly to the harness session). The muse
  mapper (`api/agent/harnesses/muse/museEventMapper.js`) may omit `args`
  entirely on `tool_started`.
- Embedded detection (`api/agentRunner.js` lines 800–820) reads
  `event.toolName || event.name` and `event.args || event.arguments || {}`,
  then `args.reason || args.message || "Stage failure reported by agent
  review"`. The daemon watcher must mirror this exactly (no JSON-parse
  branch — embedded has none; a string `args` degrades to the default
  reason on both paths).

## 3. `kind` values on the wire (confirmed)

- Claim route (`api/flow/runnerRoutes.js` `/tasks/:id/claim`) returns
  `ciPayloadFor(...)` + `prompt`: `kind: "ci"` only for CI stages, `{}` (no
  kind) for everything else.
- Dispatch route: agent answers carry no `kind` (`answer.kind` undefined →
  daemon `kind` stays `""`); CI answers spread `kind: "ci"` from
  `ciPayloadFor`; merge answers carry `integration` + `requirements` only.
- `taskRequirements` kinds: `"ci"`, `"merge"`, or the raw lowercased stage
  type (`"agent"`, legacy `"review"`, `"human"`, custom …).
- Daemon routing (`runner/daemon.js` `executeAssignment`): `kind ===
  "integrate"` returns early (defensive — currently unreachable from the
  wire), `kind === "ci"` takes the CI branch, everything else falls through
  to the agent path. So the agent-path position is the primary verdict
  guard; the synthesized-stage guard (`{ type: kind || "agent" }`) is
  belt-and-braces and correctly ignores legacy `"review"` (→ human).
- Trap (for the code comment): `normalizeStageType("integrate")` falls
  through to `"agent"`, so the guard would misfire if `integrate` ever
  reached the verdict check — it cannot today due to the early return.

## 4. Test seams (confirmed)

- `runner/daemon.test.js`: `runSingleAssignment` + `stubClient` claim stub
  (the CI test already injects `kind` via the claim stub — verdict tests use
  the same pattern) + `fakeHarness` emitting events from `subscribe`
  (extend the pattern to emit `tool_started fail_stage`).
- `runner/client.js` `complete()` already passes `failureKind`/
  `failureReason` through; `complete-execution` already forwards them into
  `applyRunnerReport`, which routes `failed` + `rejected` through
  `routeStageError`. No wire changes needed.
- Backend tests: `api/flow/execution/applyRunnerReport.test.js` (TaskStore +
  temp cwd pattern); shared logic via vitest `api/*.shared.test.js` (repo
  convention, e.g. `api/servingModelFor.shared.test.js`).
