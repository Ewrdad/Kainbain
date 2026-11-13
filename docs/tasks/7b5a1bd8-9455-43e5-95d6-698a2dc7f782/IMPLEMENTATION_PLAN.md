# Implementation Plan – Remove embedded-execution fallback for runner-servable stages

Task: `7b5a1bd8-9455-43e5-95d6-698a2dc7f782`
Date: 2026-11-13
Related: `SURVEY.md` (round 1 answers), follow-up guidance 2026-11-13 ~21:20Z

## 1. Purpose

Completely remove the backend's ability to run a runner-servable stage in-process.
After this change `KAINBAIN_RUNNER_EXECUTION_ONLY=1` (the default) becomes a
true hard defer: servable agent/CI/remote-merge stages return
`deferred: "runner-dispatch"` and wait for a capable runner indefinitely.
No 90-second wall-clock fallback and no "no capable runner right now" immediate
fallback may run the work inside the container.

Embedded execution remains the correct behavior for:

- human checkpoints (`review` normalizes to `human`);
- CI/command (`ci`) stages when the runner gate is off (`KAINBAIN_RUNNER_EXECUTION_ONLY=false`),
  during circuit-canary probes, or for unresolvable aliases;
- unresolvable alias agent stages (dispatch is not servable, so they use the embedded path);
- circuit-canary probes (canary bypass preserved for the half-open probe);
- local-only merge stages (`hasUpstreamRepo !== true`).

## 2. Decisions adopted from the grill-me survey (`SURVEY.md`)

| Survey question | Decision |
|---|---|
| Q1 embedded fallback ever? | No — hard defer always. Note from survey: removing the backend *capability*, not a local runner. |
| Q2 alerting beyond queue view? | Existing queue chip/popup + scheduler stats (`deferredDispatch`, `lastOutcome`) is sufficient. No recurring alert. |
| Q3 wf-default Update command? | No mount or fallback change; runs on a runner honoring `runOnBranch` / runner whitelist (`local-alpha`/`local-bravo`). |
| Q4 tests with no runner? | Always defer, even empty registry / stale fleet. |
| Q5 `KAINBAIN_RUNNER_DISPATCH_FALLBACK_MS`? | Fully remove key, docs, `.env.example` references. Unknown/legacy value present in env must not error. |
| Q6 `isRunnerClaimable` helper? | Keep helper and its tests (dispatch/future use). Never wire it back into the defer decision. |

## 3. Success criteria (acceptance)

1. `api/flow/dispatch/isRunnerDispatchFallbackDue.js` and its test are deleted.
2. `api/flow/execution/executeStage.js` never imports or calls `isRunnerDispatchFallbackDue`,
   `isRunnerClaimable`, `resolveAliasRequirement`, or `taskRequirements` for the gate.
   When `config.runnerExecutionOnly !== false`, not a canary, and
   `isDispatchServable(...)` is true, `executeStage` returns `deferred: "runner-dispatch"`
   unconditionally — including empty registry, stale fleet, and "enteredStageAt 2 min ago".
3. `runnerDispatchFallbackMs` is absent from `api/config/schema.js` and
   `api/config/config.test.js` expected defaults; `CONFIG_SCHEMA` keys and defaults still
   match (loader equality tests).
4. `.env.example` no longer documents `KAINBAIN_RUNNER_DISPATCH_FALLBACK_MS`.
5. `docs/EngineDetails/TaskQueueing.md` no longer describes the two embedded fallbacks;
   it states runner-only hard defer and the starvation operator story.
6. Updated tests assert hard-defer in all capability-miss/stale-clock situations.
7. `npm run test:unit` passes for touched suites.
8. `KAINBAIN_RUNNER_DISPATCH_FALLBACK_MS=90000` left in an old env file produces no warning/error
   from `loadConfig` (unknown env is ignored by construction).

## 4. Risk & rollback

- Risk: tasks behind a fleet with zero capable runners now wait forever instead of
  silently failing inside the container. Mitigation: scheduler stats make this visible
  (`deferredDispatch`, `lastOutcome = deferred-runner-dispatch`); operator runbook
  (section 10) documents recovery; emergency rollback `KAINBAIN_RUNNER_EXECUTION_ONLY=false`.
- Risk: a test or caller still reads `config.runnerDispatchFallbackMs`. Mitigation: grep
  gate in verification (section 8).
- Rollback: revert the single PR; no persisted state/schema migration is involved.
  Fallback helpers/tests can be restored from git history if ever needed.

## 5. "Make change easy" preparatory phase (no behavior change)

These preparatory steps reduce the size and danger of the actual edit. They must
be landed/verified before the removal.

A. Baseline capture
- Run and record green results for:
  - `api/config/config.test.js`
  - `api/flow/dispatch/isRunnerClaimable.test.js`
  - `api/flow/dispatch/isRunnerDispatchFallbackDue.test.js`
  - `api/flow/execution/executeStage.runnerFallback.test.js`
  - `api/flow/execution/executeStage.cutover.test.js`
- Confirm current defer gate block boundaries (lines ~232-305 of `executeStage.js`)
  are stable and the two checks are visibly separated (they already are, per comments
  "Check 1" / "Check 2").

B. Simplify the gate to one computed decision (still behavior identical)
- In `executeStage.js`, compute a single local `fallbackDue` boolean before the early
  return using the existing two checks. The block is already shaped this way; only
  tidy so that all mutation and alias resolution is inside the `else { ... }` and the
  early-return is immediately below it. Add a comment that this entire block is slated
  for deletion in the next step. This keeps the removal a single-block deletion.
- Do not touch control flow.

C. Characterize the dead-import inventory before deletion
- Confirm via grep that `taskRequirements` and `resolveAliasRequirement` are only used
  inside the fallback block (they are - see section 6).
- Confirm `isRunnerClaimable` keeps test-only usage after removal; mark the helper
  `@internal`/future-use in its JSDoc so reviewers don't re-delete it.

## 6. Implementation (the change)

### 6.1 `api/flow/execution/executeStage.js`

Current gate (to be replaced):

```js
if (
	config.runnerExecutionOnly !== false &&
	!isCanaryTask(store, taskId) &&
	isDispatchServable({ project: projectEntity || {}, task, stages, stage })
) {
	let fallbackDue = false;
	let fallbackReason = "";
	const fallbackMs = Number(config?.runnerDispatchFallbackMs) || 0;
	if (isRunnerDispatchFallbackDue(task, fallbackMs)) {
		fallbackDue = true;
		fallbackReason = ` (runner fallback after ${fallbackMs}ms wait)`;
	} else {
		try {
			let req = taskRequirementsFor(projectEntity || {}, task);
			if (req?.runnableType) {
				if (req.alias && typeof req.alias === "string" && req.alias.trim()) {
					const resolved = resolveAliasRequirement({...});
					if (resolved) {
						req = { ...req, harness: resolved.harness, model: resolved.model,
							alias: { name: resolved.aliasName, targetIndex: resolved.targetIndex } };
					}
				}
				const registry = store.runnerRegistry || null;
				if (registry && !isRunnerClaimable(registry, req, { projectId })) {
					fallbackDue = true;
					fallbackReason = " (no capable runner for this task)";
				}
			}
		} catch { /* advisory */ }
	}
	if (!fallbackDue) {
		return { task, stageType, status: "deferred", deferred: "runner-dispatch",
			message: "Runner execution only; stage left for wire dispatch" };
	}
	try {
		bridge?.emitSystemLog?.(projectId, `[SYSTEM] Runner fallback${fallbackReason}: ...`, {...});
	} catch { /* advisory */ }
}
```

Replacement:

```js
if (
	config.runnerExecutionOnly !== false &&
	!isCanaryTask(store, taskId) &&
	isDispatchServable({ project: projectEntity || {}, task, stages, stage })
) {
	// Hard defer only: runner-servable stages never execute in-process.
	// The backend has no provider credentials / harness CLIs, so an embedded
	// run can only fail. Starvation is handled by the runner fleet and surfaced
	// via scheduler stats (deferredDispatch) + the queue display; the operator
	// recovers by approving/attaching a capable runner or setting
	// KAINBAIN_RUNNER_EXECUTION_ONLY=false (emergency rollback).
	return {
		task,
		stageType,
		status: "deferred",
		deferred: "runner-dispatch",
		message: "Runner execution only; stage left for wire dispatch",
	};
}
```

Import changes in `executeStage.js` - remove:

```js
import { isRunnerDispatchFallbackDue } from '../dispatch/isRunnerDispatchFallbackDue.js';
import { isRunnerClaimable } from '../dispatch/isRunnerClaimable.js';
import { resolveAliasRequirement } from '../dispatch/resolveAliasRequirement.js';
import { taskRequirements as taskRequirementsFor } from '../dispatch/taskRequirements.js';
```

Keep:

```js
import { isDispatchServable } from '../dispatch/isDispatchServable.js';
```

Update the gate comment above the `if` (lines ~232-238) to drop the
"fallback (task 16d6fbd6)" sentence and state that human checkpoints, commands,
CI, unresolvable aliases and canary probes keep embedded behavior. The word
"fallback" must not survive in this comment.

### 6.2 Delete wall-clock helper

- Delete `api/flow/dispatch/isRunnerDispatchFallbackDue.js`.
- Delete `api/flow/dispatch/isRunnerDispatchFallbackDue.test.js`.
- Do not re-create under another name.

### 6.3 Keep (don't touch) capability helper

- Keep `api/flow/dispatch/isRunnerClaimable.js` and its test.
- Remove its now-stale JSDoc sentence claiming executeStage "should fall back"
  and rewrite as: retained utility for dispatch capability checks/reporting;
  the defer gate no longer consumes it after the fallback removal.
- Make sure no import references it from `executeStage.js`.

### 6.4 Config (`api/config/schema.js`, `api/config/config.test.js`)

- Remove the whole schema object:
  ```js
  {
    key: "runnerDispatchFallbackMs",
    env: "KAINBAIN_RUNNER_DISPATCH_FALLBACK_MS",
    aliases: [],
    type: "int",
    default: 90000,
    group: "tasks",
    doc: "After a task has waited ...",
  },
  ```
- Remove `runnerDispatchFallbackMs: 90000,` from `expectedDefaults` in `config.test.js`
  (line ~200).
- The loader ignores unknown env vars by construction (existing behavior);
  no change is needed to support legacy `KAINBAIN_RUNNER_DISPATCH_FALLBACK_MS`
  in an env file, but add one test assertion in `config.test.js` (or a new small
  test) that `loadQuietly({ KAINBAIN_RUNNER_DISPATCH_FALLBACK_MS: "90000" })`
  returns no warnings and no config key - see section 7.

### 6.5 Environment file (`.env.example`)

- Remove the comment block and the line:
  ```
  KAINBAIN_RUNNER_DISPATCH_FALLBACK_MS=90000
  ```
  from the Runner section. Keep the `KAINBAIN_RUNNER_EXECUTION_ONLY` entry and
  (optionally) extend its doc comment with a single sentence:
  "With the embedded fallback removed, a servable task waits indefinitely for a
  capable Runner; set false only as an emergency rollback."

### 6.6 Documentation

- `docs/EngineDetails/TaskQueueing.md` - replace the "Runner dispatch fallback
  (no starvation behind the fleet)" subsection with:
  > ### Runner dispatch (hard defer, no embedded fallback)
  >
  > With `KAINBAIN_RUNNER_EXECUTION_ONLY=1` (default) the scheduler defers all
  > servable stages to runner dispatch and the backend never runs them in process.
  > A task that no runner can claim (empty registry, stale fleet, wrong
  > harness/model, or a busy single-concurrency runner) stays `in_stage` and
  > re-competes on every scheduler tick; the backend does not fall back to embedded
  > execution.
  >
  > Visibility:
  > - Scheduler stats: `deferredDispatch` count and `lastOutcome = deferred-runner-dispatch`.
  > - Runner settings screen: "N deferred to Runners".
  > - Task rows keep their normal `in_stage` state.
  >
  > Recovery (operator):
  > - Approve/attach/unpause a capable runner, clear a `paused` runner, or scale
  >   concurrency; the next tick dispatches.
  > - Emergency only: `KAINBAIN_RUNNER_EXECUTION_ONLY=false` restores the legacy
  >   (unmaintained) embedded path.
  >
  > The `KAINBAIN_RUNNER_DISPATCH_FALLBACK_MS` knob was removed; setting it has
  > no effect (no error).
- `docs/notes/2026-11-11-central-queue-runner-fallback.md` - append a clearly-dated
  addendum noting the fallback was removed by this task and that only `isRunnerClaimable`
  (utility, unused by the gate) survives; do not rewrite the historical body.
- Optional code scan: `docs/tasks/16d6fbd6-.../automated-tests-failure-...md` is a
  historical artifact; leave untouched.
- `README.md`/`DEPRECATIONS.md` - if they mention the fallback knob (grep showed no
  matches), no change. Re-run grep after edits.

### 6.7 Runbook note for the Update-stage contamination (follow-up guidance)

Document (in `TaskQueueing.md` or a linked note) that CI stages now run *only* on
runners, so `/home/server/apps/kainbain/...` paths resolve on the runner host; the
backend container does not need, and must not receive, an `/home/server/apps`
mount. The runner whitelist (`local-alpha`/`local-bravo`) is the placement control,
not a container mount. No Docker change.

## 7. Tests (updates)

### 7.1 Delete

- `api/flow/dispatch/isRunnerDispatchFallbackDue.test.js` (with its implementation).

### 7.2 Rewrite `executeStage.runnerFallback.test.js`

Rename to `executeStage.runnerDispatch.test.js` (or keep filename but update title).
Replace the three tests with assertions of hard defer. Suggested content:

```js
describe('executeStage runner dispatch (hard defer, no fallback)', () => {
  // shared makeProject/fakeRunnerRecord from the existing file

  test('defers when no runner registry is attached', async () => {
    // runnerExecutionOnly true; taskStore.runnerRegistry = null
    const result = await executeStage(...);
    expect(result?.deferred).toBe('runner-dispatch');
  });

  test('defers even when no runner can claim the task (capability miss)', async () => {
    // registry with a muse-only runner for a pi harness requirement
    // expect deferred, never embedded
  });

  test('defers even with a stale runner fleet', async () => {
    // registry with an old lastSeenAt record
  });

  test('defers after the former wall-clock ceiling has elapsed', async () => {
    // enteredStageAt 2 min ago; no runnerDispatchFallbackMs in mocked config
    // expect deferred
  });

  test('defers when a capable runner exists', async () => {
    // regression guard for the primary path
  });
});
```

Rules:
- Remove any use of `runnerDispatchFallbackMs` from mocked config objects.
- Remove the `vi.spyOn(taskStore, 'executeStage')` recursion hack; the test now
  only asserts the defer return and that `calls.enqueued === 0` / `engineSets === 0`.
- Rename describe to drop "fallback (task 16d6fbd6)".
- Add cases for `runnerExecutionOnly = false` (already covered by cutover test;
  no duplication needed).

### 7.3 `executeStage.cutover.test.js`

No code change needed; it already asserts embedded for human / unresolvable alias /
rollback. Add one short comment referencing the removal if desired.

### 7.4 Config test

- Remove the `runnerDispatchFallbackMs: 90000,` line.
- Add:
  ```js
  it("ignores the removed KAINBAIN_RUNNER_DISPATCH_FALLBACK_MS env var", () => {
    const { config, warnings } = loadQuietly({ KAINBAIN_RUNNER_DISPATCH_FALLBACK_MS: "90000" });
    expect(warnings).toEqual([]);
    expect(config).not.toHaveProperty("runnerDispatchFallbackMs");
  });
  ```
  (Verify `loadQuietly`'s unknown-env behavior in `index.js` first; the loader already
  indexes only schema entries, so an unknown env var is silently ignored. If it does
  not, the fallback plan is to add a no-op alias entry named
  `runnerDispatchFallbackMs` kept only for backward-compat env parsing — but survey
  Q5 chose full removal, so prefer pure ignorance and document it. Do not add a no-op
  key.)

### 7.5 Frontend

- No logic change. Optionally extend `RunnerConfigurationSection` empty-state? Survey
  says existing stats are enough. Do not change UI under this task.

## 8. Verification commands

```bash
# Unit suites touched by the change
npm run test:unit -- api/flow/execution/executeStage.runnerDispatch.test.js
npm run test:unit -- api/flow/execution/executeStage.cutover.test.js
npm run test:unit -- api/config/config.test.js
npm run test:unit -- api/config/docs.envCoverage.test.js
npm run test:unit -- api/flow/dispatch/isRunnerClaimable.test.js

# Full unit gate
npm run test:unit

# Static guards (must all print nothing)
grep -R "isRunnerDispatchFallbackDue" api tests || true
grep -R "KAINBAIN_RUNNER_DISPATCH_FALLBACK_MS" .env.example docs/EngineDetails site-docs || true
grep -R "runnerDispatchFallbackMs" api || true
```

The static guard for `api/` `runnerDispatchFallbackMs` should be empty except possibly
the config "ignored unknown env" test which only mentions the env var string, not the
key. Keep the test string, which contains the env var name; the grep above searches
the key name, so it remains clean.

## 9. Acceptance matrix

| Scenario | Expected |
|---|---|
| `runnerExecutionOnly=true`, agent servable, empty registry | `deferred: runner-dispatch`, no enqueue |
| servable, incapable runner (harness/model miss) | deferred |
| servable, stale fleet | deferred |
| servable, enteredStageAt now-2min | deferred (would have fallen back before) |
| servable, capable runner | deferred |
| `runnerExecutionOnly=false` | embedded queue path |
| human stage | embedded |
| unresolvable alias | embedded |
| canary task | embedded |
| local-only merge | embedded |
| `KAINBAIN_RUNNER_DISPATCH_FALLBACK_MS=90000` in env | ignored, no warning |

## 10. Operator runbook (starvation story)

- Runner-only now waits indefinitely; there is no automatic in-process safety net.
- Indicators: `scheduler.deferredDispatch`, `lastOutcome=deferred-runner-dispatch`,
  "N deferred to Runners" on the Runner settings screen, ordinary `in_stage` task rows.
- Recovery: approve/unpause/attach a capable runner, raise concurrency, or (emergency)
  `KAINBAIN_RUNNER_EXECUTION_ONLY=false` and restart.
- The scheduler remains live; an empty-but-waiting-for-runner state does **not**
  produce a `queue-empty` push because candidates exist. Operators should rely on the
  runner settings screen + scheduler stats (per survey Q2).
- wf-default Publish/Update stays runner-only; Update executes on an approved runner
  in `/home/server/apps/kainbain`, never in the container.

## 11. Out of scope (explicitly not done)

- Mounting `/home/server/apps` into the backend container (defense-in-depth option
  rejected by survey Q3).
- New recurring or one-time "no capable runner" alerts (rejected by survey Q2).
- Deleting `isRunnerClaimable` / its tests (rejected by survey Q6).
- Container bootstrap changes, runner whitelist changes.
- Frontend UI changes.
