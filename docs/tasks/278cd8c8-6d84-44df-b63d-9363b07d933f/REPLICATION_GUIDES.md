# Replication & Test Guides — "PR view blank for all MRs" (task 278cd8c8-6d84-44df-b63d-9363b07d933f)

Follow-up to `WIDE_NET_ANALYSIS.md`. Each of the 5 candidate causes gets a
quick guide: how to **replicate** it and/or how to **test** for it
(TDD-style). Every guide states up front whether it is:

- **REPLICABLE LOCALLY (SAFE)** — reproduces in a temp git repo / unit test on
  this machine. No prod, no agents, no network beyond localhost. Run freely.
- **NEEDS PROD / REAL AGENTS (PERMISSION REQUIRED)** — can only be confirmed
  against the live deployment or by really dispatching agent stages. **Do not
  run any of these without explicit user permission.** The guide describes how
  it would go; see `PROD_VERIFICATION.md` for the exact read-only commands.
- **NOT REPLICABLE AS A BUG** — evidence already rules it out; the guide
  explains what to check instead.

## Replicability matrix

| Cause (from WIDE_NET_ANALYSIS.md) | Guide | Status | Why |
|---|---|---|---|
| 1. Review diff uses local refs only, never fetches; runner commits exist only on `origin` | `GUIDE-cause1-stale-local-refs-no-fetch.md` | REPLICABLE LOCALLY (SAFE) — git-mechanics repro already executed and captured below; vitest example included | Pure git ref semantics in temp repos |
| 2. Pipeline base/destination mismatch in `resolveReviewBase` (three-dot diff empty, or silent fallback to repo default) | `GUIDE-cause2-base-branch-mismatch.md` | REPLICABLE LOCALLY (SAFE) | Temp-repo merges + missing-local-base; one case already covered by an existing integration test |
| 3. `filterTaskFiles` strips `docs/tasks/**` so docs-only tasks render blank | `GUIDE-cause3-docs-tasks-filter.md` | REPLICABLE LOCALLY (SAFE) — by design; verify which empty-state text renders | Pure path filter + temp repo |
| 4. Preserved-diff baseline frozen/empty/unresolvable after merge | `GUIDE-cause4-preserved-baseline.md` | REPLICABLE LOCALLY (SAFE) — existing integration tests already cover most of it | `reviewAssembly.integration.test.js` builds real temp repos |
| 5. Frontend payload scoping in `useReview` / `TaskReviewPage` | `GUIDE-cause5-frontend-scoping.md` | NOT REPLICABLE AS A BUG (ruled out by screenshot evidence) — only pursue if 1–4 are cleared | Screenshot shows a fully rendered payload with `files: []` from the server |
| Cross-cutting: confirm which cause fires on a real affected MR | `PROD_VERIFICATION.md` | NEEDS PROD (PERMISSION REQUIRED) — read-only commands only; no agent invocation | Needs the live backend checkout, API, and logs |

## How to run the tests (repo conventions)

The API is ESM (`api/package.json` → `"type": "module"`) and uses **vitest**:

```bash
# from the repo root
npm run test --prefix api -- reviewAssembly        # run tests matching a pattern
# or directly
cd api && npx vitest run reviewAssembly.integration.test.js   # one file
npm run test --prefix frontend -- TaskReviewPage    # frontend (vitest + duplicate-identifier check)
```

Integration tests that need real git build temp repos with
`fs.mkdtempSync(os.tmpdir())` + `execFileSync("git", …)` — copy the pattern from
`api/reviewAssembly.integration.test.js` (`initRepo`, `makeDeps`, `makeTask`).
Those helpers build exactly the `{ projectStore, taskStore, eventBridge }`
shape `buildTaskReview(deps, cwd, projectId, taskId)` expects.

**This stage is docs-only**: the test examples below are markdown code blocks
only. To use them, paste them into a new file such as
`api/reviewAssembly.staleRefs.integration.test.js` in a later code stage.

## Safety model for these guides

- Temp-repo repros (`mktemp -d`, bare `origin.git`, clones) touch **nothing**
  outside `/tmp`. Safe to run as-is; the captured outputs in the guides were
  produced exactly this way on this machine.
- Anything under `PROD_VERIFICATION.md` touches the **live deployment**. Even
  `git fetch` inside the prod project checkout mutates local remote-tracking
  refs — prefer `git ls-remote` (network read, zero local mutation). All prod
  steps are flagged **PERMISSION REQUIRED** and are read-only.
- No guide here invokes a real agent stage. The one scenario that would
  (dispatch a stage to a real Runner, then open the review) is described in
  `PROD_VERIFICATION.md` §"End-to-end" and must **not** be tried without
  explicit user permission.
