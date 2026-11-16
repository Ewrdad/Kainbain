# Standards Review — missing-asset branch vs `docs/KB Code Standards.md`

Scope: branch `kb/b31cab50-3ece-4678-a933-3192288fbefd` diffed against
merge-base `38917188` with `origin/main` (`git diff origin/main...HEAD`:
28 files, +2142/−36; this clone has no `master` ref, `main` is the
baseline). Prior review at
[standards-review-20261116-131206.md](./standards-review-20261116-131206.md)
covered an older base (`3248c9bf`); this review re-checks the current
diff. Reviewed the implementation diff only; this stage is docs-only so
no source was modified.

## Verdict: PASS

The change complies with the standards. No new source changes since the
prior review beyond docs (the only branch commits after
`standards-review-20261116-131206.md` are the merge of `origin/main`
and stage-output docs). Evidence and checks below.

## User understandable over technical language

- Every new export carries a `MARK:` JSDoc with plain-English
  `@description` and `@example`, directly above the export:
  `normalizeAssetSrc`, `extractAssetRefs` in
  [normalizeAssetSrc.js](/home/server2/.kainbain/runner-work/kb-b31cab50-3ece-4678-a933-3192288fbefd/shared/taskAssetRefs/normalizeAssetSrc.js:6)
  and
  [extractAssetRefs.js](/home/server2/.kainbain/runner-work/kb-b31cab50-3ece-4678-a933-3192288fbefd/shared/taskAssetRefs/extractAssetRefs.js:6),
  `taskAssetRefs (shared)` in
  [index.js](/home/server2/.kainbain/runner-work/kb-b31cab50-3ece-4678-a933-3192288fbefd/shared/taskAssetRefs/index.js:1),
  `resolveAssetRef`, `findMissingAssetRefs`, `filterBranchBackedRefs`,
  `formatMissingAssetWarning`, `collectTaskAssetPayload` in
  [taskAssets.js](/home/server2/.kainbain/runner-work/kb-b31cab50-3ece-4678-a933-3192288fbefd/api/work/taskAssets.js:249),
  `RUNNER_TASK_ASSET_MAX_BYTES` and `writeClaimTaskAssets` in
  [project.js](/home/server2/.kainbain/runner-work/kb-b31cab50-3ece-4678-a933-3192288fbefd/runner/project.js:766),
  and `taskAssetsFor` in
  [runnerRoutes.js](/home/server2/.kainbain/runner-work/kb-b31cab50-3ece-4678-a933-3192288fbefd/api/flow/runnerRoutes.js:84).
  Verified by running `npm run check:jsdoc-example`:
  `jsdoc-@example: PASS (680 missing, baseline (680 grandfathered))`.
- Comments explain *why*: branch-flap second look (tracked assets
  flapping with the shared checkout), `Buffer.from` silent-decode
  guard, never-overwrite delivery, single-source-of-truth grammar.
- No design-pattern names in the new diff (searched `factory`,
  `singleton`, `barrel`, `strategy`, `observer`, `decorator`,
  `facade`: zero hits). "Single front file" wording in
  [index.js](/home/server2/.kainbain/runner-work/kb-b31cab50-3ece-4678-a933-3192288fbefd/shared/taskAssetRefs/index.js:1)
  is plain English; layout mirrors the `shared/stageVerdict/`
  precedent (one file per function plus an index).
- Naming is long and descriptive; language is consistent
  (`task`, `stage`, `assets`, `missingAssets`);
  `writeClaimTaskAssets({ workdir, taskId, assets, ... })` uses the
  labelled-data pattern. Positional parameters in the new
  `taskAssets` helpers match every pre-existing sibling
  (`taskAssetDir`, `collectTaskImageRefs`, `writeTaskImage`) — the
  module's consistent convention (minor nit only, same as prior
  review).

## Functional over object oriented

- No new classes (the only `new` hits in the diff are test
  `PromptCurationEngine` instantiations and `new Set()`).
  `PromptCurationEngine` pre-dates this branch. New logic is plain
  functions with clear input → output.
- New functions are verb-named (`resolve`, `find`, `filter`,
  `format`, `collect`, `write`, `normalize`, `extract`);
  `taskAssetsFor` follows the file's `ciPayloadFor` convention.
- Single responsibility holds: grammar vs disk presence vs git
  second look vs formatting vs payload vs worktree write.
  New guards are total (never-throw) with documented degraded
  results. The `stats` object on `syncTaskDocs` is a documented,
  explicitly defined output state.

## Co-location over abstraction

- Shared grammar extracted because two consumers now share the
  regex handling (backend curation + frontend viewer) — the
  "repeatedly doing the same thing" / "complex logic like a regex"
  exception. Leftover `firstSrcToken` use in
  `frontend/src/services/taskImages.js` remains for the inline
  renderer, which is harmless repetition the standard prefers.
- Test placement follows repo precedent: no `shared/*.test.js`
  exists; `api/taskAssetRefs.shared.test.js` matches the
  `api/*.shared.test.js` family. Per-module tests sit next to
  source (`api/work/taskAssets.test.js`, `runner/project.test.js`).
- `runner/project.js` importing `sanitizeImageName` /
  `isAllowedImageExt` from `../api/work/taskAssets.js` follows the
  existing runner/api bundle layout, with a why-comment.

## Tested over trusted

- Tests added alongside every new behavior:
  `api/taskAssetRefs.shared.test.js`,
  `api/work/taskAssets.test.js` (266 lines),
  `api/promptCuration.test.js` (+174),
  `api/routes/promptLayout.test.js`, `api/promptLayout/`,
  `api/flow/runnerRoutes.test.js`, `runner/project.test.js`,
  `runner/daemon.test.js`.
- Verification gap (not a standards failure): `node_modules` is not
  installed (`vite` missing), so `vitest` cannot run here. As a
  substitute, smoke-tested the shared grammar directly with Node:
  5/5 `normalizeAssetSrc` cases and `extractAssetRefs`
  dedup/prefix handling passed, matching the documented examples.

## Fast iteration over long planning

- Plan and survey docs already exist in this task's docs folder;
  the change lands as reviewable unit-level steps with safe
  fallbacks everywhere (warning degrades to no warning; claim
  writes never overwrite; stored goal text never mutated).
