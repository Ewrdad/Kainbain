<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Check for plan

**Task:** Everything seems to always say it's retrying ![18851.png](assets/18851.png) Retrying should be reserved for if something goes wrong on the current stage and for whatever reason we don't fail the stage and just want to retry in place . If it moves stage it shouldn't be retrying. Idk if it is tied to where the history on a task looks like it spams stage multiple times so that may need a look Please fix ![18852.png](assets/18852.png)
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 2970.685s
**Status:** FAILED

### Summary of Changes
Execution failed: CI command failed with exit code 1

### Execution Output
```
cat: /home/[REDACTED]/.kainbain/runner-work/kb-99709f05-1136-4b25-b8c4-68aee6929dd6/docs/tasks/99709f05-1136-4b25-b8c4-68aee6929dd6//IMPLEMENTATION_PLAN.md: No such file or directory

```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: CI command failed with exit code 1
- Triggered fallback routing.