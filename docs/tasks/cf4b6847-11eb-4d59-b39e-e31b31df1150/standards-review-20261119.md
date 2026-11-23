# Standards Review: Per-Pipeline Configurable Main Branch (2026-11-19)

Task: `cf4b6847-11eb-4d59-b39e-e31b31df1150` — "add per pipeline configurable main branch".
Scope of this review: branch diff `main...HEAD` (44 source/test/doc files outside
`docs/tasks/`, ~2400 insertions) checked against `docs/KB Code Standards.md`
plus the enforced gates in `docs/agent-docs/KB-Code-Standards.md`
(`check:jsdoc-example`, `check:one-function`). Verdict: **PASS**.

## Gate evidence (re-run this session, read-only)

| Check | Result |
|---|---|
| `npm run check:jsdoc-example` | PASS — `jsdoc-@example: PASS (679 missing, baseline (680 grandfathered))`, exit 0 |
| `npm run check:one-function` | PASS — `one-function-per-file: PASS (840 files scanned, 281 grandfathered)`, exit 0 |
| `node scripts/check-doc-links.mjs` | PASS — `All referenced file paths exist (74 doc files scanned)` |
| Spot tests `npm run test --prefix api -- work/taskBaseBranch.test.js project/workflowDefaults.test.js work/taskBranches.test.js` | 3 files, **65 passed** |
| Full touched-area evidence (from prior PR review, independently re-run there) | API 482 passed, frontend 74 passed, runner 11 passed; fast gate green on last 4 consecutive runs |

No source file was modified by this review.

## Per-standard findings

- **User understands over technical language — pass.** New names are descriptive
  business language: `baseBranch`, `resolveTaskBaseBranch`, `ensureBaseBranchExists`,
  `normalizeBaseBranchUpdate`, `checkoutPrimaryBase`, locals `pinnedBaseBranch`,
  `resolvedBase`, `ensuredBase`, `reviewBaseOpts`, `primaryBranch`,
  `explicitRestore`. No `factory`/`Factory` tokens added; `barrel` appears only in
  three comments explaining an import choice (`api/work/taskBaseBranch.js`,
  `api/reviewAssembly.js`, `api/work/taskDiffStat.js`) and in the pre-existing
  `api/projectStore.barrel.test.js` filename — it is the codebase's own term for
  `index.js` re-exports, not a newly introduced design-pattern label. No design
  pattern is advertised elsewhere. Language profile is consistent: `task` always
  a task, `stage` always a stage; `workflow` (code) / `pipeline` (user-facing UI
  and docs) is the pre-existing dual vocabulary, and the new field is `baseBranch`
  everywhere with UI label `Base branch`.
- **JSDoc + MARK + `@example` — pass.** All five new exports carry `MARK:` +
  `@description` + `@example` directly above the `export` (gate-verified):
  `normalizeBaseBranchName`, `resolveTaskBaseBranch`, `ensureBaseBranchExists`,
  `ensureTaskBaseBranch` (`api/work/taskBaseBranch.js`),
  `normalizeBaseBranchUpdate` (`api/project/workflowDefaults.js`).
  `@description` blocks are plain English and state *why* (e.g. pinned-before-live
  ordering, fail-loud-not-silent-`main` rule, adopt-`origin/<base>`-before-fork
  reasoning). Updated JSDoc in `commandStages.js`, `runnerRoutes.js`,
  `git/branch.js`, `reviewAssembly.js`, `taskDiffStat.js`, `taskFinalize.js`,
  `projectStore.js` documents the new optional parameters (`targetBranch`,
  `restoreBranch`, `mainBranch`, `primaryBranch`, `baseBranch`) so unconfigured
  behaviour stays byte-identical.
- **Labelled data inport — pass.** The seam `resolveTaskBaseBranch({task,
  workflow, projectStore, projectId, cwd, repoDefault})` and the extended
  `resolveCiBranchPlan({stage, cwd, task, projectStore, projectId})` follow the
  `({varA, varB})` pattern; callers pass the minimum fields
  (`resolveTaskBaseBranch({task, projectStore, projectId, cwd})`).
  `ensureBaseBranchExists(cwd, baseBranch)` uses two positional scalars mirroring
  the existing git barrel (`branchExists(cwd, branch)`, `createBranch(cwd, ...)`),
  and single-value normalizers take one scalar — consistent with sibling git
  helpers, not a deviation.
- **Functional over OOP — pass.** No new `class`, no currying pseudo-classes.
  Every new function is named with a verb. Functions are black-box (same input →
  same output; git side effects isolated to `ensure*` paths and audited via
  `recordBranchHop` / history lines). State stays external: the pinned base is
  data on the task (`task.baseBranch` frontmatter) and pipeline (`workflow.baseBranch`
  in `.kainbain/project.json`); no hidden mutable state.
- **Co-location over abstraction — pass.** `api/work/taskBaseBranch.js` sits beside
  its caller `api/work/taskBranches.js` as the single resolver seam; every
  `defaultBranch(` call site was converted to it except documented repo-default
  fallbacks (`api/git/branch.js`, `api/git/remote.js`, `api/reviewAssembly.js`
  fallback, deploy continuity `api/continuity/deployReconcile.js` untouched by
  design). Unit tests are next to the file (`taskBaseBranch.test.js` beside
  `taskBaseBranch.js`; `pipelineBaseBranch.integration.test.js` in `api/work/`).
  Barrel re-exports updated (`api/work/index.js`, `api/project/index.js`) and the
  barrel-surface test extended (`api/projectStore.barrel.test.js`). One
  cross-domain import exists — `api/project/workflowDefaults.js` imports
  `normalizeBaseBranchName` from `../work/taskBaseBranch.js` — justified because
  the normalizer is shared by four modules (resolver, diff-stat, lifecycle,
  workflow defaults) and is defined with the resolver it serves; no import cycle
  is introduced (`api/work/` does not import from `api/project/`).
- **One function per file — pass.** The new file holds four arrow-const exports
  and zero top-level `function` declarations; the gate counts only `function`
  declarations per q1 and explicitly allows arrow constants. Gate re-run: PASS.
- **Tested over trusted — pass.** Black-box assertions on return values, git refs,
  and file contents (no log-based assertions in the new tests). Types validated
  before use (`typeof` checks + `isValidBranchName`); invalid names fall through
  the resolver chain on reads and throw loudly on writes (`400` at the API routes,
  inline UI hint + server `400` surfacing). No silent fallback to `main` anywhere:
  `resolveTaskBaseBranch` returns a null branch when unresolvable and callers throw.
  The integration suite (`pipelineBaseBranch.integration.test.js`) runs the real
  user story in throwaway repos: pin → branch-off-feature → merge-back (main
  untouched) → sequential merges → finalize → CI-primary vs custom → review diff →
  re-point safety. New tests are unit-level where possible, integration where the
  git interaction is the behaviour.

## Non-blocking nits (not standards failures)

- `checkoutPrimaryBase` (`runner/daemon.js`) is a non-exported `async function`
  whose JSDoc has `MARK:` + `@description` but no `@example`. `runner/` is outside
  the `check:jsdoc-example` scope (roots: `api/`, `shared/`, `frontend/src/`) and
  the file's previous docs also lack `@example` on internals, so adding one would
  be stylistically consistent but is not required by the enforced rule.
- Short locals (`done`, `base`, `pinned`, `live`, `def`) inside
  `taskBaseBranch.js` / `git/branch.js` satisfy "long names where needed" —
  each is descriptive in a 3-10 line scope and mirrors sibling code.
- `api/project/workflowDefaults.js` → `../work/taskBaseBranch.js` is the one
  import a strict call-stack reading could place in `shared/` or
  `api/git/validation.js`; co-locating the normalizer with the resolver it
  serves is defensible and cycle-free.

## Docs

`docs/git-branch-support.md` gains a "Per-Pipeline Base Branch" section (setting,
pinning, auto-create, invalid-name handling, self-deploy exception);
`site-docs/api-reference.md`, `site-docs/pipeline-stages.md`, and `CHANGELOG.md`
updated consistently. `check-doc-links`: PASS.
