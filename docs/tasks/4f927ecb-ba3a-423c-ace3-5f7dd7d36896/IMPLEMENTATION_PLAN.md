# Implementation Plan — Disk-authoritative "Previous Reports" in stage prompts

**Task:** 4f927ecb-ba3a-423c-ace3-5f7dd7d36896
**Problem:** Stage prompts render a `# Previous Reports` list from task/history metadata (`task.reports`) without checking the filesystem, so stages name files that do not exist under `docs/tasks/<taskId>/`. Agents waste effort reading phantom files (case study: task `0d29c64c-34f5-4740-ba25-f4e6ef4f90b5`, whose retrospective prompt listed `idea-20261115-222653.md`, `review-plan-20261115-223714.md`, `automated-tests-failure-20261115-233558.md`, `final-review-20261116-064824.md` — none on disk; flagged in `docs/tasks/0d29c64c-34f5-4740-ba25-f4e6ef4f90b5/stage-review-20261116.md`).

**Fix (one sentence):** When rendering the Previous Reports list, enumerate the files actually present in `docs/tasks/<taskId>/` and list only those — never stale, planned, or templated filenames.

**Acceptance criteria:**
1. For any task, every file named in `# Previous Reports` opens successfully from the workspace.
2. No manually-created file on disk in the task docs folder is omitted from the listing (accounted for either by name or by an explicit overflow count + folder pointer — see survey q2 note).

---

## 1. Survey decisions to encode (from SURVEY.md, round 1)

| Q | Decision | Requirement |
|---|----------|-------------|
| q1 | "Leave it out completely" | A report referenced by history but missing on disk is **omitted** from the prompt list (no `MISSING` label in the prompt). |
| q2 | "Every file in the folder, including pictures", note: cap to ~top 5 most recently edited, then a guide to view the rest | Enumerate **all top-level files** in `docs/tasks/<taskId>/` (any extension, not just `.md`; `task.md` itself excluded), newest first, capped at `N` (default 5) with an overflow line pointing at the folder. |
| q3 | "Newest first" | Sort by file mtime, descending (filename tiebreak). |
| q4 | "Keep the section but say that no reports are available yet" | Empty/missing task folder → the section still renders, with an explicit "no previous reports available yet" line. |
| q5 | "Every stage prompt of every task, always" | The rule lives at the single render choke point in `curatePrompt` / `interpolatePromptKeywords`, so all callers get it uniformly. |

The task statement allows "omit or mark MISSING"; the survey chose **omit** — implement omit.

---

## 2. Root cause (research findings)

The prompt list is rendered from **metadata only**, never reconciled with disk:

- `api/promptCuration.js:883-895` (`curatePrompt`, section 3) builds `# Previous Reports` from `options.previousReports || options.reports || task.reports` (`api/promptCuration.js:760-776`) and prints each entry verbatim.
- `api/promptCuration.js:348-358` (`interpolatePromptKeywords`, `{{previousReports}}`) merges `reports` + `latestReports` + `task.reports` — same phantom source. This keyword also feeds `KAINBAIN_REPORTS` for command stages (`api/flow/commandStages.js:526`), and `{{latestReportPath}}` / `{{latestReport:<slug>}}` (`api/promptCuration.js:380-437`) derive from the same merged list.
- `task.reports` accumulates entries in `saveStageReport` (`api/watch/stageReports.js:247-257`) and in `syncTaskReports` (`api/work/taskPersistence.js:593-667`), which merges in-memory metadata with on-disk `.md` files but **never drops metadata entries whose file is gone** — phantom entries persist forever and flow into prompts.
- Callers that pass the list: `api/flow/execution/executeStage.js:693` (`store.getTaskReports(...)` → `reports` option), `api/flow/curateRunnerPrompt.js:48` (`task.reports`), plus the `task.reports` fallback for `api/work/taskWorkRoutes.js:249,323` and `api/flow/taskFlowRoutes.js:60`.

Verified against the case study: `docs/tasks/0d29c64c-34f5-4740-ba25-f4e6ef4f90b5/` contains only `SURVEY.md`, `IMPLEMENTATION_PLAN.md`, `OVERFLOW_FIX_NOTE.md`, three verdict/review `.md` files and three `.png`s — the four files named in the retrospective prompt do not exist.

---

## 3. Design (make the change easy, then make the change)

**Principle:** one disk-authoritative choke point at render time, so every caller and every task gets the fix without touching dispatch code.

1. **New enumerator** `listTaskDocsFiles(projectCwd, taskId, docsProject)` in a new module under `api/work/` (e.g. `api/work/taskDocsFiles.js`):
   - Resolves the task docs dir via the existing `resolveTaskDocsDir(projectCwd, docsProject, taskId)` (`api/docsPath.js`) so custom `docsDirName` projects work.
   - Reads top-level **files only** (`fs.readdirSync(..., { withFileTypes: true })`, `entry.isFile()`), excluding `task.md`; captures `mtimeMs`/`mtime` via `fs.statSync`; returns `[{ filename, path: './<docsDirName>/tasks/<taskId>/<filename>', mtimeMs }]` sorted **newest first** (mtime desc, filename asc tiebreak).
   - Missing/unreadable dir → `{ files: [], dirExists: false }` (never throws), mirroring `listTaskImages` in `api/work/taskAssets.js`.
   - Traversal safety like `taskAssetDir`: reject when the resolved folder's basename isn't the taskId.
   - Repo gate: `scripts/check-one-function-per-file.mjs` allows only ONE top-level `function` declaration per **new** file (arrow-function constants are exempt). Either split helpers into one file each or use `export const fn = (...) => {}` style; do not add to the allowlist.
   - eslint `security/detect-non-literal-fs-filename`: wrap fs calls in the same `eslint-disable/enable` pair used in `taskAssets.js`/`taskPersistence.js`.

2. **Render-time reconciliation in `api/promptCuration.js`** (the file is allowlisted for multiple functions):
   - Section 3 (`curatePrompt`, ~line 883): when `projectCwd` (from `interpolationContext`) and `task.id` are present, call `listTaskDocsFiles` and build the section **from disk files only**:
     - Header: `# Previous Reports` + "The following files are present in `./<docsDirName>/tasks/<taskId>/`:" (wording updated from "prior stage reports are available" since the list now includes every file, per q2).
     - One `- ./<docsDirName>/tasks/<taskId>/<filename>` line per file, newest first, capped at `appConfig.taskReportsMaxPromptRefs` (new, default 5), plus overflow line `- (+N more files not listed; list ./.<docsDirName>/tasks/<taskId>/ to see them)` (mirrors `formatImageRefs`' cap+overflow pattern at `api/promptCuration.js:76-108`).
     - Empty/missing dir → `# Previous Reports\nNo previous reports are available yet — the task folder ./.<docsDirName>/tasks/<taskId>/ contains no files.` (q4).
     - When `projectCwd` is absent (pure preview, e.g. `api/routes/promptLayout.js` sample which passes no cwd): keep the **legacy** passthrough of the passed-in list byte-identical, so preview routes and no-cwd layouts are unaffected.
   - `interpolatePromptKeywords` (`{{previousReports}}`, ~line 348; also feed `{{latestReportPath}}` / `{{latestReport:<slug>}}`): when `projectCwd` + `task.id` resolve, replace the merged `allReports` with the disk enumeration merged with metadata (match by `filename`) so content/slug for `{{latestReport:<slug>}}` still works for real files; phantom metadata entries are dropped (q1). The keyword lists **all** on-disk files newest-first (no cap — it is machine-consumed, e.g. `KAINBAIN_REPORTS`), each as a `./<docsDirName>/tasks/<taskId>/<file>` path; empty → keep the existing `(No previous stage reports available)` fallback. When no `projectCwd`: legacy behaviour unchanged.
   - `syncTaskReports` (`api/work/taskPersistence.js:593`): **non-destructive** hardening — when the task docs dir is readable, set `missingOnDisk: true` on metadata entries whose filename is absent (kept in `task.reports` because reliability/observability readers — `api/watch/reliabilityShared.js`, `harnessReliability.js`, `aliasReliability.js`, `observabilityMetrics.js` — consume metadata, not files). Do NOT delete entries. The prompt never reads this flag (it enumerates disk directly); it is there so API/UI consumers can later show/omit missing entries.

3. **New config knob** `taskReportsMaxPromptRefs` in `api/config/schema.js`, mirroring `taskImageMaxPromptRefs` (schema.js:1742): `env: "KAINBAIN_TASK_REPORTS_MAX_PROMPT_REFS"`, `type: "int"`, `default: 5`, `min: 0`, `group: "tasks"`, doc: "Max task-folder files listed in one curated stage prompt's # Previous Reports section (newest first; overflow is summarized). 0 = list all." Update the defaults snapshot in `api/config/config.test.js` (~line 185) and the env docs (`site-docs/ports-env.md`; enforced by `api/config/docs.envCoverage.test.js` / `scripts/generate-env-example.mjs`).

4. **Descriptor text updates** (semantics changed): `shared/promptLayout.js` `LAYOUT_TOKENS` entry for `previousReports` (~line 133), `shared/stageKeywordTokens.js` hint for `{{previousReports}}` (~line 68), and the JSDoc for `{{previousReports}}` in `api/promptCuration.js:116` — all should say "files actually present in the task docs folder, newest first".

**Why render-time and not in `getTaskReports`:** the prompt must enumerate disk directly (the requirement), and `task.reports` is shared with reliability analytics that legitimately keep metadata-only entries. Keeping the fix in `curatePrompt`/`interpolatePromptKeywords` covers all five call sites at once (q5) with no dispatch-code changes.

---

## 4. Step-by-step implementation order

1. **Config + enumerator (foundation first):** add `taskReportsMaxPromptRefs` to `api/config/schema.js`; create `api/work/taskDocsFiles.js` with `listTaskDocsFiles` (+ per-file split if the one-function gate requires); unit-test the enumerator alone (`api/work/taskDocsFiles.test.js`): tmp dir with mixed files (`.md`, `.png`, `task.md`, a subdir), mtime ordering, custom `docsDirName`, missing dir, traversal rejection.
2. **Render choke point:** change section 3 in `curatePrompt` and the `{{previousReports}}`/`{{latestReportPath}}`/`{{latestReport:<slug>}}` branches in `interpolatePromptKeywords` per §3.2. Add a `formatPreviousReportsSection(diskFiles, { maxRefs, docsDirName, taskId })` builder next to `formatImageRefs` so section text is testable in isolation.
3. **Non-destructive marking:** `syncTaskReports` sets `missingOnDisk` on metadata entries absent from a readable dir.
4. **Descriptors:** update `shared/promptLayout.js`, `shared/stageKeywordTokens.js`, JSDoc in `api/promptCuration.js`.
5. **Tests** (see §5).
6. **Docs** (see §6).
7. **Full gates** (see §7).

---

## 5. Testing plan

Primary gate: `npm run test:api` (vitest) — run touched suites first, then `npm run test:unit`; lint via `npm run lint:api`.

**New tests:**
- `api/work/taskDocsFiles.test.js` — enumerator behaviour (see step 1).
- `api/promptCuration.diskReports.test.js` (new file; promptCuration.test.js is huge) — with a **real tmp project dir**:
  - phantom entries in `options.previousReports`/`task.reports` are omitted from `# Previous Reports`; only on-disk files are listed;
  - manually created file (e.g. `MY_NOTES.md`) on disk with no metadata **is** listed (acceptance 2);
  - newest-first ordering by mtime; non-`.md` files (png) included; `task.md` excluded;
  - cap: with 7 files and cap 5, exactly 5 listed + overflow line with `(+2 more`;
  - empty dir / missing dir → section renders with the "no previous reports available yet" line (q4);
  - no `projectCwd` → legacy passthrough of the passed list (byte-identical to today);
  - custom `docsDirName` project → enumerates `<cwd>/kainbain-docs/tasks/<id>/` and lists `./kainbain-docs/...` paths;
  - `{{previousReports}}` keyword with real dir → all on-disk files newest-first, phantoms dropped; `{{latestReportPath}}` never returns a phantom; `{{latestReport:<slug>}}` returns content only for on-disk reports;
  - **case-study regression fixture**: replicate task `0d29c64c...` — metadata lists `idea-20261115-222653.md`, `review-plan-20261115-223714.md`, `automated-tests-failure-20261115-233558.md`, `final-review-20261116-064824.md`; disk has `SURVEY.md`, `IMPLEMENTATION_PLAN.md`, `OVERFLOW_FIX_NOTE.md`, 3 verdict files + pngs → assert none of the four phantoms appears in the prompt and every listed path exists on disk (acceptance 1, executable form).
- `api/taskStore.test.js` (extend near existing `getTaskReports` tests ~lines 431/1248/1618): `syncTaskReports` marks `missingOnDisk` on phantom metadata entries when the dir is readable, keeps metadata-only entries intact when the dir is absent (test-env fallback), and still picks up manually created `.md` files.
- Integration: in `api/flow/stageExecution.reportGating.test.js` (or `api/agentic.test.js` style with `makeStore()` + tmp dir), run `executeStage` with a `task.reports` seed containing a phantom, then assert the curated `task.prompt` contains only on-disk files under `# Previous Reports`.

**Existing tests to update (they pin the old phantom-permissive behaviour):**
- `api/promptCuration.test.js:151-166` ("includes previous reports section…") — passes no `projectCwd`, so legacy path keeps it green; add a cwd variant. Lines 337-363 (`{{previousReports}}` with `projectCwd: "/home/server/projects/kainbain"` + phantom reports) — must be reworked to a tmp dir with real files (or drop `projectCwd` to exercise the legacy path), because with a cwd the keyword becomes disk-authoritative.
- `api/promptCuration.layoutBaseline.test.js` — fixture uses `projectCwd: "/projects/demo"` + `previousReports: ["./docs/tasks/task-1/idea-old.md"]` and pins byte-exact output; either drop `projectCwd` from the fixture (legacy path → baseline unchanged) or point it at a tmp dir containing `idea-old.md` and keep the expected text.
- `api/promptCuration.layout.test.js:54` and `api/promptCuration.docsDir.test.js:59` — check whether they pass `projectCwd`; adjust the same way.
- `api/config/config.test.js:185` — defaults snapshot gains `taskReportsMaxPromptRefs: 5`.
- `api/routes/promptLayout.js` preview passes no `projectCwd` → stays green; verify with its route tests.
- Grep for any other test asserting phantom reports render (e.g. `api/watch/taskWatchRoutes.test.js`, `observabilityMetrics.test.js`) and align.

**Manual acceptance check (after implementation):** a one-off node/vitest script against the real repo: curate a prompt for task `0d29c64c-34f5-4740-ba25-f4e6ef4f90b5` with the real project cwd, parse every `- ./docs/...` line under `# Previous Reports`, and assert `fs.existsSync` for each — the case study must list only `SURVEY.md`, `IMPLEMENTATION_PLAN.md`, `OVERFLOW_FIX_NOTE.md`, the three verdict/review files and the three pngs (top 5 by mtime + overflow line).

---

## 6. Documentation plan

- `docs/KB Architecture.md` and `docs/agent-docs/KB-Architecture.md`: in the prompt-assembly/stage-skills paragraphs (~line 231 / ~186) and any prompt-section list, state that `# Previous Reports` is **enumerated from disk** (`docs/tasks/<taskId>/`), lists files newest-first capped at `KAINBAIN_TASK_REPORTS_MAX_PROMPT_REFS` (default 5) with an overflow pointer, omits files that no longer exist, and renders an explicit "none available yet" line when the folder is empty/missing. Same for `{{previousReports}}`.
- `site-docs/prompts-tokens.md` (line ~48 lists section tokens): update the `{{previousReports}}` description to match.
- `site-docs/ports-env.md` / env example: add `KAINBAIN_TASK_REPORTS_MAX_PROMPT_REFS` (keep `api/config/docs.envCoverage.test.js` green; regenerate via `scripts/generate-env-example.mjs` if that is the convention).
- `CHANGELOG.md`: add an entry per repo convention (check `scripts/generate-changelog.mjs` first — if generated, follow whatever mechanism produces entries).
- JSDoc/MARK comments in changed code (repo standard: why + `@example`), no code comments about deliberation.

---

## 7. Verification checklist (Definition of Done)

- [ ] `npm run test:api` passes (full vitest suite), including all touched suites listed in §5.
- [ ] `npm run test:unit` passes (api + frontend).
- [ ] `npm run lint:api` clean (incl. `security/detect-non-literal-fs-filename` handling on new fs calls).
- [ ] `node scripts/check-one-function-per-file.mjs` clean for new files.
- [ ] `node scripts/check-doc-links.mjs` clean after doc edits.
- [ ] Executable acceptance: a test (the case-study fixture in §5) proves every `# Previous Reports` entry exists on disk and no on-disk file is silently omitted; run the real-repo check for task `0d29c64c...` described in §5.
- [ ] Byte-stability check: prompts for tasks **without** a resolvable `projectCwd` (preview route, layout baseline with cwd removed) are unchanged.
- [ ] Docs updated per §6.

---

## 8. Risks and edge cases

- **Fake cwds in tests** (`/projects/demo`, `/home/server/projects/kainbain`): with a cwd set, rendering becomes disk-authoritative, so these fixtures must move to tmp dirs — handled in §5.
- **Custom `docsDirName`** projects: enumerator uses `resolveTaskDocsDir`, covered by a test.
- **Runner worktree retargeting:** curation happens backend-side with the backend `projectCwd`; the runner only rewrites the path prefix in the finished string, so relative `./docs/tasks/<id>/...` entries stay valid. No runner change needed.
- **Empty/missing task folder** (brand-new task): renders the "no previous reports available yet" line (q4) instead of omitting the section silently.
- **`task.md` exclusion:** the task's own metadata file must never be listed as a report.
- **Subdirectories (e.g. `assets/`):** only top-level files are listed; images under `assets/` remain covered by the separate `# Task Images` section (`collectTaskImageRefs`). Top-level pngs (like the case study's) are listed per survey q2.
- **Reliability analytics:** `task.reports` metadata is intentionally preserved (only flagged `missingOnDisk`), so `harnessReliability`/`aliasReliability`/`observabilityMetrics` are unaffected.
- **Cap vs. "no on-disk report omitted":** the survey (q2 note) explicitly caps the list at ~5 newest with a pointer line; the overflow line keeps every remaining file discoverable, satisfying acceptance 2. Setting `KAINBAIN_TASK_REPORTS_MAX_PROMPT_REFS=0` lists all files if a strict reading is ever required.
- **Performance:** one `readdirSync` + per-file `statSync` per prompt curation — same cost profile as the existing `collectTaskImageRefs` call in the same function; negligible.
