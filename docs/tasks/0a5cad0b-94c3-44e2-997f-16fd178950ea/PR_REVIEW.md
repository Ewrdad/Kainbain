# PR Review — attachments always saved to the task folder (task 0a5cad0b)

Reviewer stance: assumed broken until proven working. All proof below was
observed in-session on HEAD `27b978a1` (diff `origin/main...HEAD`, 64 files).

## Evidence (commands run, outputs observed)

- `npx vitest run` (api) on the 8 attachment/claim/coverage files, including
  the 3 files CI failed: **161/161 pass**, exit 0. The CI failures
  (`runnerRoutes` claim expectation, `agentGuide`/`docs` API coverage) were
  fixed by later commits and now pass.
- Full `npm run test:api`: **exit 0** (green).
- Full `npm run test:frontend`: **364 files / 5033 tests pass**, exit 0. The
  single CI frontend failure (`ProjectSettings.deepLink`, in code this change
  never touches) passes — transient/flaky, not a regression.
- `node scripts/check-jsdoc-example.mjs`: PASS. `check-one-function`: PASS.
  `npm run docs:check`: PASS (exit 0). `node --test
  tests/audit-task-attachments.test.mjs`: 17/17 pass.
- No `TODO/FIXME/HACK` in new code (only test-log noise and the CLI auditor's
  legitimate `console.log`); no long-lived servers started.

## Per-question verdicts

- **Achieves the goal? Yes.** Every surface whose bytes reach the backend now
  ingests into `docs/tasks/<id>/assets/` under a sanitized, deduped name,
  rewrites refs to `assets/<name>` (idempotent), and commit-assures the bytes:
  goal create/update (`taskWorkRoutes.js`), uploads (`/images` + new
  `/attachments`), rejection feedback (`rejectTask`), routed failure text
  (`routeStageError`, before the failed-work commit), review comments/replies.
  Remote delivery generalized both arms (`collectTaskAssetPayload` images-first
  + budget, `writeClaimTaskAssets` allowlist). Old tasks covered by the opt-in
  auditor (`--apply` repairs resolvable refs only). Works for images (byte-
  identical path via delegation) and ~40 allowlisted non-image types with a
  header-safe serving matrix (html/svg always download).
- **Followed the plan? Yes.** R1–R5 spikes landed as `RESEARCH_NOTES.md`;
  Phase 1 generalization delegates (image wrappers preserved); slices 2.1–2.6
  all present including comments (q1=everywhere) and backfill (q3=fix old);
  q2/q4 pinned behaviors implemented; docs/rollout done.
- **Code standards? Yes.** Repo gates green (above); MARK+@description+@example
  on new exports; long names; labelled destructuring; co-located tests.
- **Easy to modify? Yes.** One shared helper (`ingestOutOfTaskRefs`, 5 call
  sites), pure ingest/rewrite functions, image→generic delegation, chained
  config refs for caps.
- **Best practices? Yes.** Extension allowlist, per-file/per-task/per-payload
  caps, traversal collapse, realpath containment (project root or OS temp),
  never-overwrite, strict base64, `nosniff`, scoped `assets/`-only commits with
  fail-closed branch affinity, best-effort hooks that never break the write
  path.
- **Tech debt? None unnecessary.** The two duplications (ingest markdown scan
  vs shared grammar; frontend extension mirror) are intentional and commented.
- **Docs updated? Yes.** `docs/task-images.md`, `site-docs/task-images.md`,
  `site-docs/api-reference.md`, `agentGuide.js` ENDPOINTS, `.env.example`,
  schema `doc` strings, create-task skill ordering, auditor runbook.

UI note: the UI delta (download chips, broader picker `accept`) is minor and
covered by component suites (150 tests incl. `TaskImageAttach`, `FailureMessage`,
`MarkdownViewer`); no screenshots taken (docs-only stage, no live servers).

## Follow-ups (not fail-worthy)

1. **q5 conflict needs human reconciliation.** Survey answers landed at 14:43,
   after implementation; q1–q4 match exactly, but q5 says "Save it anyway"
   while the code enforces caps with 413/skip + clear message. The code matches
   the approved plan's success criterion ("oversized fails with a clear
   message"), and unbounded git-tracked/base64-shipped uploads are unsafe; caps
   are operator-raisable via `KAINBAIN_TASK_ATTACHMENT_*`. Recommend keeping
   limits; confirm with the requester.
2. **Runner-side ingest (remote worktree bytes).** Failure text naming files
   that exist only in a *remote* Runner's worktree still can't be healed
   backend-side (completion payload is text-only) — documented in code comments
   and research notes, fix is runner copy+rewrite before reporting riding
   `commitAndPush`. Also worth one line in `docs/task-images.md`'s Repairs
   section, where the limitation is currently implicit.
