# Mock harness (`mock`)

Zero-credential built-in AgentHarness for evaluation, CI, demos, and
cold-start guidance on boxes with no CLIs and no API keys.

## What it is

- **No AI runs here.** Sessions echo the prompt back (`Mock reply: …`) and
  report a one-model synthetic catalog (`mock::mock::echo-v1`, labeled
  "Mock Echo v1 (no AI — evaluation/CI only)").
- **Full contract.** Sessions satisfy the same `runSessionContractTests`
  acceptance gate as the pi harness (conversation, streaming events, model
  control, context control, history-tree operations), so workflow code —
  agent dispatch, review, retrospective chat — runs against mock sessions
  exactly like real ones.
- **Always available.** Discovery reports `available: true`
  (`detectionSource: 'builtin'`) on every box; the harness owns no disk,
  spawns nothing, and needs no credentials.

## When it runs

**Explicit selection only** — the resolution chain never falls back to mock
silently, so synthetic output can never mask a real outage:

1. `project.harness = 'mock'` (project Settings, or the zero-harness
   guidance panel's "Use mock harness for evaluation" action),
2. a stage's `stage.harness = 'mock'` override,
3. `KAINBAIN_DEFAULT_HARNESS=mock` (evaluation/CI environments).

Unknown harness names still fall back to the built-in default (`pi`), never
to mock.

## What it does not do

- **No stuck-check diagnosis.** Like `custom`/`muse`, the mock has no
  `createDiagnosisSession` — the stuck-check route answers an honest 503
  and the UI disables the control (`supportsDiagnosis: false`). A synthetic
  diagnosis would be fake AI output; the 503 is the honest behavior.
- **No persisted history.** `readHistoryFromDisk` is always empty (the mock
  owns no disk), same as the antigravity harness.
- **No vision.** `echo-v1` is text-only; image dispatches degrade to
  file-path mentions via the standard capability guard.

## For tests

- `createMockHarness({ models })` — harness factory (the registry injects
  `MOCK_MODELS`; test seams inject their own or nothing).
- `createReferenceMockSession({ model, models, harnessId })` — one
  conforming session; also the sessionStore's `NODE_ENV=test` seam (which
  omits `harnessId`, keeping the generic seam shape unchanged).
