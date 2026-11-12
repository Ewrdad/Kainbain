<!-- KAINBAIN AUTO-GENERATED REPORT -->
# Stage Report: Automated tests

**Task:** Runners are not autodetecting correctly  Key error seems to be with muse code but I suspect on others. Muse has just released a new model in the harness however for some reason it is not selectable in the ui ( but is in muse code)   Crutially this hasnt made it sway to the alias choices either, especailly since muse code keeps having its model for aliases wiped.    Please fix all this behaviour and make sure we have a firm and trusted way to build our model catalogue from the attached harnesses. For context the model catalogue should get model options from the runner, convert them into the kainbain standard harness::model::effort and save them then the Ui should allow selecting from that central list.
**Stage Type:** `ci`
**Model:** `default`
**Duration:** 117.437s
**Status:** FAILED

### Summary of Changes
Execution failed: git checkout main failed (exit 1): error: The following untracked working tree files would be overwritten by checkout:
	docs/tasks/2b990c4f-1e24-47f6-9c64-8bd239b68c83/task.md
	docs/tasks/8815d13d-e43e-45ec-b013-725c705ae59b/task.md
	docs/tasks/8ded2dfc-0df7-424a-8c19-f2f8b78c0941/task.md
	docs/tasks/b15f4ec4-786a-4edf-9a18-d38d538d825e/task.md
	docs/tasks/dc5ba91d-23c7-423f-8379-7ac2a4b46506/task.md
	docs/tasks/e60de7fa-113f-414c-9192-0ac11973b146/task.md
	docs/tasks/f42d4ab0-15c8-4707-98da-75c26b505bcc/task.md
Please move or remove them before you switch branches.
Aborting

### Execution Output
```
git checkout main failed (exit 1): error: The following untracked working tree files would be overwritten by checkout:
	docs/tasks/2b990c4f-1e24-47f6-9c64-8bd239b68c83/task.md
	docs/tasks/8815d13d-e43e-45ec-b013-725c705ae59b/task.md
	docs/tasks/8ded2dfc-0df7-424a-8c19-f2f8b78c0941/task.md
	docs/tasks/b15f4ec4-786a-4edf-9a18-d38d538d825e/task.md
	docs/tasks/dc5ba91d-23c7-423f-8379-7ac2a4b46506/task.md
	docs/tasks/e60de7fa-113f-414c-9192-0ac11973b146/task.md
	docs/tasks/f42d4ab0-15c8-4707-98da-75c26b505bcc/task.md
Please move or remove them before you switch branches.
Aborting
```

### Modified Files
- (No files modified / inspection only)

### Verification Status
- Stage execution failed with error: git checkout main failed (exit 1): error: The following untracked working tree files would be overwritten by checkout:
	docs/tasks/2b990c4f-1e24-47f6-9c64-8bd239b68c83/task.md
	docs/tasks/8815d13d-e43e-45ec-b013-725c705ae59b/task.md
	docs/tasks/8ded2dfc-0df7-424a-8c19-f2f8b78c0941/task.md
	docs/tasks/b15f4ec4-786a-4edf-9a18-d38d538d825e/task.md
	docs/tasks/dc5ba91d-23c7-423f-8379-7ac2a4b46506/task.md
	docs/tasks/e60de7fa-113f-414c-9192-0ac11973b146/task.md
	docs/tasks/f42d4ab0-15c8-4707-98da-75c26b505bcc/task.md
Please move or remove them before you switch branches.
Aborting
- Triggered fallback routing.