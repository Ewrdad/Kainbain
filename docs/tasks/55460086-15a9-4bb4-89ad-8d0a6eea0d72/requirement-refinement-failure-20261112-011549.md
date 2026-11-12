<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Requirement refinement

**Task:** bug. Runners seem unable to take tasks from non "active" pipelines Despite a bunch of work being done recently to fix it we still suffer from a problems where only the active pipeline in the UI has it's tasks picked up.  The point of the runner system is to allow for load balancing tasks across multiple projects and pipeline, pipelines just being a tools to organise different workers.  For example we currently have a task in our audit workflow that is not even looked at because the default pipeline is at as active. Arguably there is no point in having a active pipeline as they should all be active
**Stage Type:** `agent`
**Model:** `worker`
**Duration:** 103.873s
**Status:** FAILED

### Summary of Changes
Transient infrastructure error persisted after 5 retries (budget 5 from global config): [Agent Execution Error] Failed to start agy CLI 'agy': spawn agy ENOENT [AGY_BIN_MISSING] Install the Antigravity CLI and ensure it is on PATH or in ~/.local/bin, or set KAINBAIN_AGY_BIN to its absolute path.. Retry ladder: attempt 1/5: 2826ms [unknown] [Agent Execution Error] Failed to start muse CLI 'muse': spawn muse ENOENT | attempt 2/5: 4319ms [unknown] [Agent Execution Error] No API key found for the selected model.

Use /login to log into a provider via OAuth or API key. See:
  /app/api/node_modules/@earendil-works/pi-coding-agent/docs/providers.md
  /app/api/node_modules/@earendil-works/pi-coding-agent/docs/models.md | attempt 3/5: 8204ms [unknown] [Agent Execution Error] Failed to start muse CLI 'muse': spawn muse ENOENT | attempt 4/5: 15330ms [unknown] [Agent Execution Error] No API key found for the selected model.

Use /login to log into a provider via OAuth or API key. See:
  /app/api/node_modules/@earendil-works/pi-coding-agent/docs/providers.md
  /app/api/node_modules/@earendil-works/pi-coding-agent/docs/models.md | attempt 5/5: 32881ms [unknown] [Agent Execution Error] Failed to start muse CLI 'muse': spawn muse ENOENT.

### Execution Output
```
[Agent Execution Error] Failed to start agy CLI 'agy': spawn agy ENOENT [AGY_BIN_MISSING] Install the Antigravity CLI and ensure it is on PATH or in ~/.local/bin, or set KAINBAIN_AGY_BIN to its absolute path.
```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: [Agent Execution Error] Failed to start agy CLI 'agy': spawn agy ENOENT [AGY_BIN_MISSING] Install the Antigravity CLI and ensure it is on PATH or in ~/.local/bin, or set KAINBAIN_AGY_BIN to its absolute path.
- Triggered fallback routing.