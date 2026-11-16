# Standards Review — missing-asset branch vs `docs/KB Code Standards.md`

Scope: branch `kb/b31cab50-3ece-4678-a933-3192288fbefd` diffed against merge-base
`3248c9bf` (25 files, +1870/−36). Baseline is `main` (this clone has no `master`
ref). Reviewed the implementation diff only; this stage is docs-only so no
source was modified.

## Verdict: PASS

The change complies with the standards. Each section below cites the evidence
in the diff. One minor documentation nit (not a blocker) is noted at the end.

## User understandable over technical language

- Every new exported function carries a `MARK` JSDoc with a plain-English
  `@description` and `@example` tags, as the standard requires: `normalizeAssetSrc`
  and `extractAssetRefs` in [normalizeAssetSrc.js](/home/server2/.kainbain/runner-work/kb-b31cab50-3ece-4678-a933-3192288fbefd/shared/taskAssetRefs/normalizeAssetSrc.js:6),
  [extractAssetRefs.js](/home/server2/.kainbain/runner-work/kb-b31cab50-3ece-4678-a933-3192288fbefd/shared/taskAssetRefs/extractAssetRefs.js:6),
  `resolveAssetRef`, `findMissingAssetRefs`, `filterBranchBackedRefs`,
  `formatMissingAssetWarning`, `collectTaskAssetPayload` in
  [taskAssets.js](/home/server2/.kainbain/runner-work/kb-b31cab50-3ece-4678-a933-3192288fbefd/api/work/taskAssets.js:249),
  `writeClaimTaskAssets` and `RUNNER_TASK_ASSET_MAX_BYTES` in
  [project.js](/home/server2/.kainbain/runner-work/kb-b31cab50-3ece-4678-a933-3192288fbefd/runner/project.js:766),
  and `taskAssetsFor` in [runnerRoutes.js](/home/server2/.kainbain/runner-work/kb-b31cab50-3ece-4678-a933-3192288fbefd/api/flow/runnerRoutes.js:84).
- Comments explain *why*, not just what: the branch-flap second look (tracked
  assets flapping with the shared checkout), the `Buffer.from` silent-decode
  guard, and never-overwrite delivery in
  [taskAssets.js](/home/server2/.kainbain/runner-work/kb-b31cab50-3ece-4678-a933-3192288fbefd/api/work/taskAssets.js:335)
  and [project.js](/home/server2/.kainbain/runner-work/kb-b31cab50-3ece-4678-a933-3192288fbefd/runner/project.js:789).
- No design-pattern names appear anywhere in the new diff (searched for
  factory/singleton/barrel/strategy/observer/decorator/facade: zero hits).
  The "single front file" wording in
  [index.js](/home/server2/.kainbain/runner-work/kb-b31cab50-3ece-4678-a933-3192288fbefd/shared/taskAssetRefs/index.js:1)
  is plain English, and the layout mirrors the established
  `shared/stageVerdict/` precedent (one file per function plus an index).
- Language is consistent (`task`, `stage`, `assets`, `missingAssets`), names are
  long and descriptive, and `writeClaimTaskAssets({ workdir, taskId, assets, ... })`
  uses the labelled-data pattern. Positional parameters in the new `taskAssets`
  helpers match every pre-existing sibling (`taskAssetDir`, `collectTaskImageRefs`,
  `writeTaskImage`) — the codebase's consistent convention for this module.

## Functional over object oriented

- No new classes. The only touched class, `PromptCurationEngine`, pre-dates this
  branch. New logic is plain functions with clear input → output.
- New functions are verb-named (`resolve`, `find`, `filter`, `format`, `collect`,
  `write`, `normalize`, `extract`). The one noun-shaped helper, `taskAssetsFor`,
  follows the file's existing `ciPayloadFor` convention.
- Single responsibility holds: grammar (`normalize`/`extract`), disk presence
  (`resolveAssetRef`), git second look (`filterBranchBackedRefs`), formatting,
  payload building, and worktree writing are separate functions. New guards are
  total (never-throw) with documented degraded results (`[]`, warning kept).
- The `stats` object on `syncTaskDocs` is a documented, explicitly defined
  output state, which the standard permits ("unless clearly defined states").

## Co-location over abstraction

- The shared grammar was extracted because the regex handling is now used by
  two consumers (backend curation and frontend viewer) — exactly the
  "repeatedly doing the same thing" + "complex logic like a regex" exception.
  The duplicated protocol-URL check in
  [taskImages.js](/home/server2/.kainbain/runner-work/kb-b31cab50-3ece-4678-a933-3192288fbefd/frontend/src/services/taskImages.js:29)
  is harmless repetition, which the standard prefers to over-abstraction.
- `api/taskAssetRefs.shared.test.js` follows the established
  `api/*.shared.test.js` precedent (see `api/accessibilityStatement.shared.test.js`,
  `api/autoApproveDuration.shared.test.js`); there are no `shared/*.test.js`
  files in this repo. Per-module tests sit next to their source
  (`api/work/taskAssets.test.js`, `runner/project.test.js`).
- `runner/project.js` importing `sanitizeImageName`/`isAllowedImageExt` from
  `../api/work/taskAssets.js` follows the existing runner-belongs-with-api
  bundle layout (runner already imports `api/agent/harnessDiscovery.js`,
  `api/work/resolveAttestationStage.js`, `api/routes/retrospectiveChat.js`)
  and the comment records why (single source of truth for storable names).

## Tested over trusted

- Every new behavior added tests in the same commit series: asset-ref grammar
  (`api/taskAssetRefs.shared.test.js`), missing-ref detection + warning +
  payload (`api/work/taskAssets.test.js`), prompt prepend/re-inject
  (`api/promptCuration.test.js`), layout guards
  (`api/routes/promptLayout.test.js`, `api/promptLayout/promptLayout.test.js`),
  dispatch shipment (`api/flow/runnerRoutes.test.js`), and worktree delivery
  (`runner/project.test.js`, `runner/daemon.test.js`). Tests assert the
  fail-safe branches (bad input, missing dirs, hostile names, oversize payloads).
- Verification gap (not a standards failure): workspace dependencies are not
  installed (`vite` missing), so `vitest` could not run in this environment.
  As a substitute, the shared grammar was smoke-tested directly with Node:
  6/6 `normalizeAssetSrc` cases passed (plain, titled, angle+title, URL
  rejection, query rejection, spaced names) and `extractAssetRefs`
  deduplication/prefix handling behaved as documented.

## Fast iteration over long planning

- The implementation plan and survey documents already exist under this task's
  docs folder, and the change lands as reviewable unit-level steps with a
  safe fallback everywhere (missing warning degrades to no warning; claim
  writes never overwrite; stored goal text is never mutated).

## Minor nit (non-blocking)

`filterBranchBackedRefs` and `resolveAssetRef` in the
[taskAssets.js](/home/server2/.kainbain/runner-work/kb-b31cab50-3ece-4678-a933-3192288fbefd/api/work/taskAssets.js:249)
block use positional parameters rather than the labelled-object form. This
matches all existing siblings in that file, so it is consistent and searchable;
converting only the new functions would reduce local consistency. Worth
considering only if the whole module ever migrates to labelled inputs.
