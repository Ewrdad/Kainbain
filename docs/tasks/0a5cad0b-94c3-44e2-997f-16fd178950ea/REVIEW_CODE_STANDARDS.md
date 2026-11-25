# Review — KB Code Standards compliance (task 0a5cad0b)

Scope: `origin/main...HEAD` (63 files, +40495/−247) vs `docs/KB Code Standards.md`.
Docs-only review stage; no source edits. Checks run in-session:

- `npm run check:jsdoc-example` — PASS (679 missing, baseline 680 grandfathered)
- `npm run check:one-function` — PASS (888 files scanned, 281 grandfathered)
- `npm run test:api` — PASS (481 files, 7780 passed, 3 skipped; EXIT 0)
- frontend scoped (taskImages, TaskImageAttach, FailureMessage, MarkdownViewer,
  TaskGoalSection, TaskReviewPage) — PASS (6 files, 219 passed; EXIT 0)
- MARK/@example scan of new exports — every new export carries MARK directly
  above the export plus @description and @example (script-verified).

## Values — user understandable

- Long descriptive names throughout (`ingestOutOfTaskRefs`, `resolveOutOfTaskRef`,
  `attachmentServeHeaders`, `taskAttachmentMaxAttachBytes`); no new short names.
- JSDoc explains why, not just what: `commitTaskAssets` states why there is no
  push and why branch affinity fails closed; `attachmentServeHeaders` states why
  html/svg are `attachment`; route handlers state why immutable caching is safe.
- Labelled destructuring used where it matters (`ingestAttachment`,
  `ingestOutOfTaskRefs`, `auditTaskAttachmentRefs`, frontend `resolveTask*Url`);
  getters keep positional args to match existing siblings (`listTaskAttachments`
  mirrors `listTaskImages`) per "common language profile".
- No design-pattern language anywhere in new code (searched for factory,
  singleton, observer, strategy, builder, facade, decorator — no hits).
- Noun getters (`attachmentKind`, `attachmentMediaType`, `taskAttachmentRequests`)
  deliberately parallel the pre-existing nouns (`imageMediaType`, `taskAssetDir`,
  `taskImageRequests`) instead of renaming the profile.

## Functional over OO

- One class only: `AttachmentIngestError extends Error` — matches existing
  `ConfigError` precedent and is needed for `instanceof` routing in
  `taskAttachments.js`; idiomatic for typed errors.
- Helpers are verbs (`isAllowed*`, `sanitize*`, `ingest*`, `rewrite*`, `commit*`,
  `collect*`, `audit*`); minimum data passed (each `ingestOutOfTaskRefs` call
  passes only its declared fields); ingest helpers are pure/tested.

## Co-location over abstraction

- Tests adjacent to sources: `api/work/commitTaskAssets.test.js`,
  `api/work/taskAttachments.test.js` + `taskAttachmentIngest.test.js` beside
  `taskAssets.js`, `api/routes/taskAttachments.test.js`, frontend tests beside
  components. Audit script test lives in `tests/` per repo convention
  (`check-*.test.mjs`).
- `commitTaskAssets.js` correctly extracted beside `taskAssets.js` in `api/work/`;
  `taskAssets.js` (grandfathered, 32 funcs) extended cohesively with
  delegation-equivalence tests rather than split.
- `ingestOutOfTaskRefs` has 5 call sites (taskWorkRoutes ×2, taskControl,
  routeStageError, review) — justified abstraction, not single-line duplication.
- Frontend `ATTACHMENT_EXTENSIONS` mirrors backend with a comment that backend
  enforces — intentional "don't fear repetition".

## Tested over trusted

- New behaviour fully covered (ingest, rewrite, allowlist, commit, audit,
  routes, runner); existing suites pass unmodified; full API suite green in
  this review run.

## Verdict

Complies with the standards. No concrete violation found.

KAINBAIN_VERDICT: PASS
