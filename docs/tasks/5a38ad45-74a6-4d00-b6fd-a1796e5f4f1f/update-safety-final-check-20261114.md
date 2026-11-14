# Update-Safety Final Check — Pretty Tasks (2026-11-14)

Task `5a38ad45-74a6-4d00-b6fd-a1796e5f4f1f`. Stage is docs-only (no-code); this
file is the only artifact of the stage. Question: will the change **as
implemented** on this branch break existing installs on update? If yes, the
stage must FAIL and must not attempt a fix.

Branch `kb/5a38ad45-74a6-4d00-b6fd-a1796e5f4f1f` HEAD `e5c58aa5` vs `origin/main`
`2a5a8e22`. Method: `git diff main...HEAD` (28 files, 1742 insertions),
read every changed source file and its importer, ran smoke imports, the two
affected unit suites, the frontend production build, and compared old vs new
parsing on representative `task.md` shapes, byte-checked the PNG evidence, and
checked the install/build gates (`deploy.sh`, `publish.sh`, `Dockerfile`).

## What the branch delta actually contains

The core pretty-tasks work (API byte-identical markdown round-trip,
`deriveTaskTitleFromGoal` first-line title, mermaid rendering via lazy
`import('mermaid')`, two-stage skill with `{{taskDocs}}drafts/`, `mermaid
^12.3.0` in `frontend/package.json`) is **already on `main`** (merges
`168e3f5`, `22fbf8d9`, `2a5a8e22`). The unmerged delta under this stage is:

- `api/flow/` — split of `resolveStatePath.js` into five one-function files
  (new: `isLiveEnginePath.js`, `isLiveAccessibilityFeedbackPath.js`,
  `getLiveAccessibilityFeedbackFile.js`, `throwIfLiveEnginePathUnderTest.js`,
  `throwIfLiveAccessibilityFeedbackPathUnderTest.js`) with plain-language
  re-exports retained in `resolveStatePath.js`.
- `api/work/taskPersistence.js` — new exported `extractGoalSection`
  fence-aware parser; `parseTaskMarkdown` uses it, and the history scan now
  also stops at `# Log Entries`.
- `frontend/` — `check-mermaid-bundled.js` new, wired as the third step of
  `npm run build`; `MarkdownViewer.jsx` tilde-fence (`~~~`) support.
- `skills/creating-new-tickets/SKILL.md` — one wording fix (title verbatim
  copy), plus the `tasks.blocking.test.js` non-array-`blockedBy` pin (test only).

No Dockerfile, `.env`, DB schema, or `deploy.sh`/`publish.sh` install-logic
change is in the delta.

## Findings per install-break vector

### 1. No migration, no new config, no data rewrite

- Task JSON/frontmatter shape is unchanged; the writer (`saveTaskMarkdown`)
  still emits LF-joined `---` frontmatter + `# Goal` + goal + blank +
  `# History` + history/timeline/log-entries, byte-identical to `main`.
  An update never rewrites stored tasks on boot — rehydration only reads.
- No new environment variable, no `CREATE/ALTER TABLE`, no `goalFormat`
  versioning, no `blockedBy`/idempotency/dedupe/caps/`execute` change
  (`api/work/taskWorkRoutes.js` is identical between `main` and `HEAD`
  beyond the already-merged pretty work; pinned by the new non-array
  `blockedBy → 400` test).
- Stored titles survive: `resolveTaskTitleAndGoal` lets the frontmatter
  title win; first-line derivation only fills gaps. The title change itself
  is on `main`, but is identical for every legacy single-line goal (survey
  q5 allowed this tweak).

### 2. `taskPersistence` parsing — identical on every machine-written shape

- The old goal regex required `# History|Timeline|Process Logs` at column
  zero; `extractGoalSection` finds `# Goal` by `trim() === '# Goal'` and
  ends at the first of `# History|# Timeline|# Process Logs|# Log Entries`
  outside a fence, with same-marker fence closing and unclosed-fence
  fallback to the first terminator (matching the old fallback).
- Verified byte-identical on standard shapes:
  `# Goal\nhello\n# History`, with blank line, with `# Timeline`, with
  `# Process Logs`, and CRLF — old and new return the same goal. The suite
  `api/work/taskPersistence.test.js` (72 tests) and `taskPersistence.autoApprove`
  (2) pass on HEAD, including the fence, CRLF, same-marker, indented-
  terminator, `# Log Entries`, `# Details`, and round-trip-through-`task.md`
  tests.
- The divergences are confined to pathological/hand-crafted inputs and all
  point in the fixing direction for real files:
  fenced `# History`-like example text no longer truncates the goal
  (previously corrupted on every re-read — the intended fix, demonstrated
  pre-fix that a pretty goal round-tripped truncated);
  `# Details` is *not* a terminator (no writer emits it, so it stays goal
  text — two round-trip tests pin this);
  `# Log Entries` gains terminator status on the history scan (fixes the
  swallow-when-no-Timeline case);
  indented terminators now terminate (old regex required column zero);
  CRLF normalizes to LF (the writer already emits LF, so real files are
  unaffected). None affects boot, install, or serving of existing tasks.

### 3. `api/flow` split — re-exports preserve every import path

- Each moved function is byte-identical to its pre-split body (compared
  `git show main:api/flow/resolveStatePath.js` against the five new files);
  the new files only add relative imports between themselves.
- `resolveStatePath.js` now re-exports all five symbols, so all eight
  importers (`accessConfig`, `steerStore`, `claimStore`, `runnerRegistry`,
  `circuitBreaker`, `fleetModelSnapshot`, `durableState.test`,
  `routes/accessibility`, `api/index.js`) resolve unchanged. Smoke-imported
  `resolveStatePath`/`isLiveEnginePath`/`getLiveAccessibilityFeedbackFile`
  from both the old path and the new paths in this session.
- Production behaviour is `VITEST`-gated identically (no-throw when unset),
  so existing installs resolve state paths byte-identically.

### 4. Frontend — no new dependency in the delta; build guard is inert on current tree

- `frontend/package.json` delta is only the `build` script adding
  `check-mermaid-bundled.js`; the `mermaid ^12.3.0` dependency and
  `frontend/package-lock.json` (package `node_modules/mermaid 12.3.0`) are
  **already on `main`** and unchanged by this delta (`git diff main...HEAD
  -- frontend/package.json` shows only the script line; package-lock has no
  diff). An update from `main` to this `HEAD` therefore needs **no fresh
  `npm install`** to resolve a new package.
- `check-mermaid-bundled.js` only reads `frontend/vite.config.js` text and
  fails if `external: [...'mermaid'...]` is present. `vite.config.js` on both
  `main` and `HEAD` has no `external` (simple `defineConfig({ plugins:
  [react()], server: { fs: { allow: ['..'] } } })`), so the script prints
  `check-mermaid-bundled: OK` and exits 0. `npm run build --prefix frontend`
  was re-run on this tree and passed (`✓ built in 4.64s`, mermaid lazy chunks
  emitted, `check-mermaid-bundled: OK`). The script is present in the
  checkout after pull, uses only `node:fs/path/url`, and has no other gate.
- `MarkdownViewer.jsx` tilde support is purely additive (new `fenceMarkerOf`
  helper; backtick handling unchanged; cross-marker non-close and unclosed-
  fence behaviour pinned by three new `MarkdownViewer.mermaid` tests, 18/18
  passing). The `import('mermaid')` in `loadMermaid` already degrades to a
  source block on failure, so even a stale `node_modules` without the
  package cannot crash the page at runtime.
- Production images (`Dockerfile`: `npm ci --prefix ./frontend` always fresh)
  are unaffected; the host `deploy.sh`/`publish.sh` conditional
  `frontend-install` (`if [ ! -d frontend/node_modules ]`) predates this
  change and only matters when a *new* package is introduced — which this
  delta does not do.

### 5. Prior blockers are resolved on HEAD

- `pretty-proof.png` on both `HEAD` and `main` is a valid PNG
  (`xxd -l 8 → 8950 4e47 0d0a 1a0a`, `file → PNG image data, 1440 x 1600`,
  107722 bytes, IEND intact); the round-3/4/5 corruption (`ef bf bd …`)
  is gone. `rt.mjs` is untracked/absent. The banned "Barrel" term is gone
  (re-exports comment is now plain language). Gates re-observed in this
  session: `api` taskPersistence 72 passed, `frontend` MarkdownViewer.mermaid
  18 passed, frontend production build PASS.

## Conclusion

Nothing in the delta requires a migration, rewrites stored data, adds a
new dependency or env/config, breaks the update/install path, or changes
existing installs' behaviour outside rare hand-crafted edge cases that
operate in the fixing direction. Existing installs can `git pull` +
`deploy.sh` / pull the prebuilt image and continue serving their stored
tasks unchanged; old paragraph tasks parse and render identically.

KAINBAIN_VERDICT: PASS
