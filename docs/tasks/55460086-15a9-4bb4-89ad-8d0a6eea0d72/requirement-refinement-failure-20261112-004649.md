<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Requirement refinement

**Task:** bug. Runners seem unable to take tasks from non "active" pipelines Despite a bunch of work being done recently to fix it we still suffer from a problems where only the active pipeline in the UI has it's tasks picked up.  The point of the runner system is to allow for load balancing tasks across multiple projects and pipeline, pipelines just being a tools to organise different workers.  For example we currently have a task in our audit workflow that is not even looked at because the default pipeline is at as active. Arguably there is no point in having a active pipeline as they should all be active
**Stage Type:** `agent`
**Model:** `worker`
**Duration:** 96.728s
**Status:** FAILED

### Summary of Changes
Transient infrastructure error (attempt 3/5, budget 5 from global config, next delay 8739ms, signal unknown): [Agent Execution Error] Failed to start muse CLI 'muse': spawn muse ENOENT — retrying same stage

### Execution Output
```
[Agent Execution Error] Failed to start muse CLI 'muse': spawn muse ENOENT
```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: [Agent Execution Error] Failed to start muse CLI 'muse': spawn muse ENOENT
- Triggered fallback routing.