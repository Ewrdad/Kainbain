# Monitor: active task and curated prompt

The **Active Task & Full Curated Prompt** card separates the task's goal
(**Full task**, expandable) from the instructions dispatched to its stage.
The goal is not used as a substitute prompt.

## Reading the card

- **Harness** identifies the running session's harness when available.
- **Model** shows the resolved model reference, with **Provider** and **Source**
  below it. Source is `session`, `stage`, `project`, or `unknown`, in precedence
  order. Stage/project sources describe configuration, not an observed model.
- Missing identity is shown as **Unknown**, never inferred as “Pi Agent”.
- The prompt prefers the matching live session's first user message, including
  dispatch-only context. Persisted curated text is a fallback. During the gap
  before an agent session is available, the previous prompt is suppressed.
- A session must match the active project, task, and stage. A project fallback
  session is not evidence of what the active task is running.

## Freshness

REST `/status/observability` owns the displayed payload. Engine, process-start,
and active-task update events invalidate it with a roughly 500 ms bounded
coalescing window. A 15-second poll remains as a safety net. Hidden tabs pause
polling; returning visibility or focus requests a fresh read. Network latency
still affects completion time; mismatched task/stage snapshots are not treated
as the current prompt/model.

Event invalidation bypasses only the browser's telemetry cache. It does **not**
request `refresh=true` or wait for new provider health probes. Health in the
response can therefore be older than the task metrics. Explicit health refresh
remains separate.

## Additive API fields

`observability.activeTask` includes `model`, `harness`,
`modelDetails: { provider, id, key, source }`, `stageId`, `stageName`, `stageType`,
`dispatchedPrompt`, `promptPending`, and `promptSource` (`session` or `curated`).
Consumers should honor `promptPending` before using a persisted prompt fallback.
Existing task `goal` and `prompt` fields remain unchanged; there is no migration
or API version bump. See [ModelKeys.md](ModelKeys.md) for reference grammar.

## Live console

The live log body under the monitoring headers renders through the unified
viewer — see [LogViewer.md](LogViewer.md) for lanes, density, timestamps, and
the intervention strip. Headers, status pills, and model details stay owned by
the dashboard and mobile views; only the log body is shared.
