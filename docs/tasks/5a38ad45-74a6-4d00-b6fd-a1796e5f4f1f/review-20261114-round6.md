# Code-standards review against `./docs/KB Code Standards.md` — round 6 (2026-11-14)

Scope: full branch diff `origin/main` (= merge 2a5a8e22) to HEAD: 29 files, of which
14 are code (`api/flow/*`, `api/work/taskPersistence*.js`, `api/routes/tasks.blocking.test.js`,
`frontend/scripts/check-mermaid-bundled.js`, `frontend/src/components/common/MarkdownViewer*.jsx`,
`frontend/package.json`, `skills/creating-new-tickets/SKILL.md`) and the rest are task docs.

## Round-4/5 blockers — both resolved, verified at HEAD

1. **Banned "barrel" term — fixed.** `git diff 2a5a8e22..HEAD -- api/ frontend/ skills/`
   grepped for barrel/factory/singleton/strategy/observer/adapter/facade/design-pattern:
   **zero hits in code paths** (hits exist only in docs reports quoting the old violation).
   `api/flow/resolveStatePath.js:5` now reads plain-language
   `// Re-exports: each guard lives in its own file so the one-function check passes; …`.
   The word "barrel" elsewhere in the tree (e.g. `api/flow/*.js`, `api/projectStore.js`)
   pre-dates this branch on main — not part of this diff (checked the diff, not the tree).
2. **Corrupted `pretty-proof.png` — fixed.** Worktree file is 107722 bytes,
   `xxd -l 16` → `8950 4e47 0d0a 1a0a`, `file` → `PNG image data, 1440 x 1600`;
   the HEAD blob matches (`git cat-file -p HEAD:…`), byte count equal to origin/main's.
   `implementation-report-20261114.md` lines 3-26 transparently document the earlier
   false claim and the binary-safe restore via `git checkout origin/main -- <path>` —
   the claim is now accurate and corroborated by fresh inspection.

## Per-file compliance

- **`api/flow/*.js` split (5 files)** — five functions moved from `resolveStatePath.js`
  **byte-identically** (bodies extracted from main's file and diffed against the new
  one-function files: identical). Keeps existing import paths via re-exports, comment
  explains why. Verb-first names (`getLive…`, `isLive…`, `throwIfLive…`), MARK JSDoc
  with `@description` + `@example` everywhere, labelled params on the multi-field
  `throwIf*` guards. One-function-per-file gate PASS (822 files, 281 grandfathered).
- **`api/work/taskPersistence.js` `extractGoalSection`** — verb-first, MARK JSDoc with
  `@example`/`@param`/`@returns`, why explained (fence-aware so example text never
  truncates the goal; unclosed-fence fallback so an unbalanced fence can't swallow
  History), co-located with its single caller `parseTaskMarkdown`, long descriptive
  locals (`goalHeadingIndex`, `firstRawTerminator`). No class, no pattern language.
- **History terminator fix + `# Details` round-trip (same file)** — regex now also stops
  at `# Log Entries`; pinned by colocated tests. `taskPersistence.test.js` **72/72 pass**.
- **`api/routes/tasks.blocking.test.js` (+1 test)** — non-array `blockedBy` → 400,
  colocated, descriptive name, `tabs` consistent with file. **6/6 pass**.
  (Report's claim the dead `markdown` schema field was restored to `blockedBy` in
  `taskWorkRoutes.js` nets out of the final diff — net effect verified by this green suite.)
- **`frontend/src/components/common/MarkdownViewer.jsx`** — `fenceMarkerOf` helper used
  3× (open, close, paragraph guard), justified repetition-detecting helper; comment
  explains why; JSDoc updated, still `@example`-complete. Same-marker fence closing
  mirrors the API-side scan on purpose (stated in both JSDocs). No class.
  **16/16 `MarkdownViewer.mermaid.test.jsx` pass** (new tilde-fence, same-marker-close,
  and unclosed-fence tests colocated next to the component).
- **`frontend/scripts/check-mermaid-bundled.js`** — matches sibling script shape exactly
  (`check-no-deprecations.js`: shebang, MARK + `@description` why, `@example`, top-level
  script). Runs clean: `OK — mermaid stays in the production bundle.` Wired into the
  `frontend/package.json` `build` script.
- **`skills/creating-new-tickets/SKILL.md`** — purely additive clarifying wording, plain
  language; preserves first-line-title and `blockedBy` behaviour per the brief.

## Gates run this stage (not claims, observations)

- `node scripts/check-one-function-per-file.mjs` → `PASS (822 files scanned, 281 grandfathered)`
- `node scripts/check-jsdoc-example.mjs` → `PASS (681 missing, baseline (684 grandfathered))`
- api `work/taskPersistence.test.js` → 72/72; api `routes/tasks.blocking.test.js` → 6/6
- frontend `MarkdownViewer.mermaid.test.jsx` → 16/16 (deps freshly `npm ci`'d; `git status` clean, only ignored `node_modules` added)

## Non-blocking observations

- `extractGoalSection(body)` takes its single string positionally, like the sibling
  predicates `isLiveEnginePath(candidatePath)` and the file-mate `parseTaskMarkdown(…)`;
  the multi-field `throwIf*` guards do use the labelled pattern. Consistent with the
  immediate siblings, so not counted as a breach here.
- `fenceMarkerOf` is a verb-less getter name for a private closure; surrounding module
  functions are verb-first, but the name is descriptive and the standards' intent
  (user-understandable) is met.

## Verdict

Branch complies with the code standards. Both prior FAIL items are fixed and evidenced.
