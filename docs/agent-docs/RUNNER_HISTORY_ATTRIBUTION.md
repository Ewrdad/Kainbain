# Runner attribution in task history (struggling-Runner detection is a follow-up)

Task-history rows already name the Runner that ran them; spotting a
struggling Runner is a future consumer of that data, not part of the capture
change (task `e60de7fa`).

## Where the data lives

- Timeline rows (`task.timeline`, persisted in `timelineMetadata` frontmatter):
  Runner-dispatched runs stamp `runnerId` on the stage's arrival row at
  claim/dispatch time, and on every Failed / Retrying / exhausted outcome row
  plus the terminal `Completed` row. Embedded runs leave it absent.
- Stage reports (`task.reports`, persisted in `reportMetadata` frontmatter):
  Runner-run reports carry the same `runnerId`.
- Audit entries (`task.history`, in-memory): Runner-narrating entries carry a
  structured `runnerId` alongside the prose; the rendered History markdown
  stays `- timestamp: action`.

`runnerId` is the operator-facing Runner id copied from the authenticated
Runner record at dispatch/report time — never resolved through the live
registry at read time, so rows stay interpretable after a Runner is
renamed or removed. Absent means "not Runner-attributed" (embedded run or
pre-feature history); it is never a placeholder string.

## Follow-up signals (not implemented)

A struggling-Runner detector can compute all of these from the persisted
fields without further schema work: failure rate per Runner (`status` on
rows/reports), slower-than-normal runs (`duration`), retry volume
(`infraRetryCount` / `autoIterationCount`, Retrying rows), and
stuck-on-one-task-type (`task.workflowId` / `stage` grouped by `runnerId`).
