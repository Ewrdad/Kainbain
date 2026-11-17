# Update-impact review — will this change break existing installs?

Scope: branch diff vs `origin/main` (27 files, +2088/−36). Question for this stage: an install that updates to this branch — frontend, backend (Docker and native), and Runner fleet (old and new) — keeps working without manual migration, forced redeploy order, or data loss. Docs-only stage: no source changed.

## Verdict: PASS — safe to update in place

No install-breaking change found. Every update surface either stays byte-identical for healthy installs or degrades to the old behaviour when the new machinery is absent.

## Surfaces checked (evidence per surface)

### 1. Stored prompt layouts (`~/.kainbain/prompt-layout/prompt-layout.json`)

- Old saved layouts (10 tokens, no `{{missingAssets}}`) validate **ok** under the new code: `missingAssets` is *conditional*, not mandatory, so `validatePromptLayout` returns `ok: true` with one extra warning (verified headlessly: old-style 10-token layout → `ok: true, warnings: 1, errors: []`).
- PUT with an old layout still saves (only `!validation.ok` → 400; warnings are non-blocking). GET surfaces the new warning text, no error.
- Rendering an old layout with an empty warning is byte-identical (`renderPromptLayout` drops empty sections; verified by direct execution and by the layout suite). A dangling-ref task on an old layout gets the warning prepended by `resolveAutoReinjectedTokens` → render prepend path, exactly like the `{{testingGuidance}}` precedent — custom layouts cannot silently lose the warning.
- Installs with no stored file (`isDefault`) pick up the new `DEFAULT_PROMPT_LAYOUT` (11 tokens, `{{missingAssets}}` first). With no dangling refs the rendered prompt is byte-identical to the old default, so baselines and eyes see no churn.

### 2. Backend update (Docker `COPY shared/ ./shared/`; native checkout)

- New imports resolve in every shipped layout: `api/work/taskAssets.js` → `../../shared/taskAssetRefs/index.js`, and the Dockerfile production stage copies `api/` + `shared/` as siblings (the `/app/api + /app/shared` layout the comment in `Dockerfile` relies on); native repo checkouts keep the same relative paths. `shared/package.json` and `api/package.json` are both `"type": "module"`, so ESM resolution is unchanged.
- Curation hook is best-effort: `findMissingAssetRefs` / `filterBranchBackedRefs` / formatting run inside `try/catch {}` in `PromptCurationEngine.curatePrompt` — any failure (absent checkout, unreadable dir, missing git) dispatches *without* the warning, i.e. the old behaviour, never a failed dispatch. `filterBranchBackedRefs` never throws (catch → return input unchanged), uses argv-only `execFileSync("git", …)` with a validated branch shape and 5 s timeout, and only runs when dangling refs exist. Worst case is a bounded latency, not a crash.
- No dependencies, config, env vars, or DB migrations added: the diff touches no `package.json`, no lockfile for `api/`/`frontend/`, no schema, no stored format. Goal text is never mutated, so existing tasks, projects with custom `docsDirName` (respected via `resolveDocsDirName`), and old task folders need zero backfill.

### 3. Runner fleet — mixed versions both directions

- Wire addition is additive: the backend now includes `taskAssets: [] | [{name, size, contentBase64}]` on dispatch/claim answers. An **old daemon** ignores the unknown field (it destructures known keys; extra JSON keys are inert) and runs exactly as before.
- A **new daemon on an old backend** defaults the field to `[]` (`Array.isArray(taskAssets) ? … : Array.isArray(claim?.taskAssets) ? … : []`) and skips the write step — same behaviour as pre-change remote runs, plus the backend-side warning still arrives in the prompt text.
- `syncTaskDocs` gained an optional `stats` out-param (default `null`); return value and copy semantics are unchanged, so old callers are unaffected.
- `writeClaimTaskAssets` never throws (per-entry `try/catch`, flat allowlisted names only, strict-base64 guard, size caps, never-overwrite), so a corrupt or hostile entry cannot wedge a stage.
- The new `runner/project.js` import of `../api/work/taskAssets.js` resolves in the Runner tarball: `scripts/package-runner.mjs` copies `runner/`, `shared/`, and `api/` into the archive (verified in source), the same three-tree layout the daemon and Dockerfile already rely on. `runner/version.json` and the `backendApi >=1.0.0 <2.0.0` range are unchanged, and correctly so — this is a compatible additive change inside the declared range, so no fleet-wide version bump or deploy ordering is required.

### 4. Frontend update

- `frontend/src/services/taskImages.js` now resolves through `shared/taskAssetRefs` (`normalizeAssetSrc`). `frontend/vite.config.js` already allows serving `.. /shared`, and many frontend modules already import from `shared/`, so no bundler or allowlist change is needed. The Docker build stage copies `shared/` before `npm run build --prefix ./frontend`.
- Viewer resolution parity held on a 13-case probe (plain, `./`, `/`, task-folder prefix, titled, `<…>` + title, absolute/protocol URLs, query-suffixed, bare `assets/`, traversal): the new grammar matches the old regex on every case that matters (both reject query/fragment/protocol refs, both unwrap angle destinations and strip trailing titles). No existing task image that resolved before stops resolving.

### 5. Cosmetic-only file (not install-breaking)

- `runner/package-lock.json` is a 6-line stub (`packages: {}`) with no `runner/package.json` to anchor it. Nothing installs from it: no script, Dockerfile step, or publish step runs `npm ci --prefix runner`, and the Runner tarball ships it as inert bytes. `node --check runner/project.js` and `node --test runner/daemon.test.js runner/project.test.js` (182/182) pass with it present. It is cruft worth removing in a follow-up (also noted in `pr-review-20261116.md`), but it cannot break an update, so it does not fail this stage.

## What "break" would have looked like (none found)

- A mandatory-token promotion that 400s old saved layouts → not present (`missingAssets` is conditional).
- A required DB/config migration or goal-text rewrite → none; the warning is computed at render time.
- A wire-format break requiring lockstep backend+runner deploy → none; both directions degrade to old behaviour.
- A new runtime import unresolvable in the shipped layout → none; `shared/` ships in both the Docker image and the Runner tarball.

## Re-run commands used

- `node -e "import('./shared/taskAssetRefs/index.js')"` / `import('./api/work/taskAssets.js')` / `import('./runner/project.js')` — all import cleanly.
- `node -e` layout probe: old 10-token layout validates `ok: true`; new default validates `ok: true`; empty-section render starts with `# Task`.
- `node --test runner/daemon.test.js runner/project.test.js` — 182 pass, 0 fail.

Vitest-based api/frontend suites could not run in this workspace (`node_modules` absent, prior reports note the same); the behavioural assertions they cover were verified by the direct Node executions above and are recorded in `pr-review-20261116.md`.
