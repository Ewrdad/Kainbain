# Central queue runner dispatch fallback — 2026-11-11

Audit task `b8c9bb8e` (stage `2` Audit, `wf-audit-e09c23`) sat `in_stage` with `enteredStageAt: 2026-11-10T23:09:29Z` for ~18 h while `openQueueDepth: 2` and `engine: idle`. The central-queue ordering fix (task 16d6fbd6) was already correct — oldest-first across all projects — but with `KAINBAIN_RUNNER_EXECUTION_ONLY=1` the scheduler deferred every servable agent stage to runner dispatch and the only runner advertising the required model (`pi::ollama-cloud-direct::beam::high`) was single-concurrency busy on the implementor task.

Operational fix: resumed `local-bravo` (`paused: true → false`). Fleet capable slots 1 → 2; queue 2 → 1 within one poll cycle (5 s). `82e49a05` claimed by `local-bravo` epoch 1, `9d2b75a2` claimed by `server2-alpha` (CI, model-free).

Code fix (408 lines, commit 413b709): `api/flow/execution/executeStage.js` now checks runner availability before deferring — no-capable-runner → immediate embedded fallback; fleet-busy → bounded wall-clock fallback (`KAINBAIN_RUNNER_DISPATCH_FALLBACK_MS`, default 90 s, `0` disables for container-only deploys). New helpers `isRunnerClaimable` and `isRunnerDispatchFallbackDue` with unit tests; `TaskQueueing.md` documents both fallbacks. Backend restart pending next deploy — `KAINBAIN_CLAIM_STATE_FILE` persists claims so no loss on restart.
