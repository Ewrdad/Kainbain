# Stage review — section-rename guardrail (2026-11-16)

Scope: branch `kb/ee3ca5d2-8b05-4908-bbd1-808c667d1175` vs `origin/main`.
Touched product files: `api/siteDocs.js`, `api/siteDocs.test.js`, `DEPRECATIONS.md`
(+ task docs). No UI change, so no screenshots apply.

## Verdict: PASS (recommendation to the engine)

All three acceptance criteria were re-verified independently in this review
(see Evidence), not taken on trust from the implementation notes.

## Against the review questions

- **Achieves the goal? Yes.** Retired section ids keep resolving via
  `LEGACY_SECTION_ALIASES` with a recorded warning; a rename without an alias
  fails loudly naming the retired id; every section-caused skip warns.
- **Followed the plan? Yes, with one documented deviation.** The plan assumed
  SURVEY.md had no recorded answers; it does (q1 = keep showing the old
  category). The implementation correctly let the task's explicit acceptance
  criteria (alias + recorded warning) win over the incompatible q1 answer, and
  recorded the decision in `notes-20261116-implementation.md`. Extras beyond
  the plan (`resolveSectionName` export, `KNOWN_SECTION_HISTORY` living in the
  module, loud skips for unknown/missing/unaliased-retired sections, ENOENT vs
  real-I/O-error distinction) are justified in `notes-20261116-cleanup.md`,
  covered by tests, and introduce no signature changes or new imports.
- **Code standards? Yes.** New exports carry `MARK:`/`@description`/`@example`;
  `docs:check` jsdoc gate passes with no new baseline entries; descriptive
  identifiers per KB readability; `check-one-function` passes; no new bare
  imports (deploy solo-copy constraint respected); no README edit.
- **Easy to modify? Yes.** Single source of truth (history next to the
  taxonomy), pure resolver, shared `writeLegacyDocsDir` /
  `captureOwnerWarnings` helpers, failure messages that name the id and the fix.
- **Best practices? Yes.** Black-box temp-dir tests, clean suite output via
  warn capture, mutation probes in both directions, warnings-only behavior
  change with an operational-continuity note.
- **Tech debt? None material.** Cosmetic renames enlarge the diff but follow
  the repo readability standard. Pinned exact-equality lists mean a real rename
  touches several assertions — pre-existing pattern, and the procedure's
  step 6 (run the suites) surfaces each one loudly.
- **Docs updated? Yes.** `DOC_SECTIONS` REQUIRED RENAME PROCEDURE,
  `LEGACY_SECTION_ALIASES` pointer, `KNOWN_SECTION_HISTORY` docblock,
  `DEPRECATIONS.md` coverage bullet, and task notes with probe evidence.

## Evidence (all observed this session, working tree left clean)

- `npm run test --prefix api -- siteDocs`: 4 files, **39/39 green**
  (6 guardrail + 4 legacy-regression + 4 loud-skip + 4 resolver tests).
- Live probe on a `/tmp` legacy dir (`how-it-works`/`working-with`
  frontmatter): `listDocs` returned both slugs aliased to
  `concepts`/`workflows`, `getDoc` non-null, warnings name file + retired id
  + replacement. Runtime alias-bypass control: `readDocFile` null with a loud
  warning naming the id and the fix — the old silent shape is gone.
- Red-path mutation on a scratch worktree (alias entry deleted, worktree
  removed afterwards): **6 failures**, including the guardrail:
  `[siteDocs taxonomy guardrail] Retired section "working-with" is neither a
  current DOC_SECTIONS member nor a key of LEGACY_SECTION_ALIASES ...`.
- Valid-rename mutation on a scratch worktree (`reference` → `handbook` with
  alias + history + deprecation mention + frontend mirror + pinned-list
  updates): **39/39 green**.
- `npm run docs:check`: 57 passed, doc-links + jsdoc-example PASS.
- `npm run lint --prefix api`: **0 errors**; `siteDocs.js` carries only the 2
  pre-existing warnings (frontmatter regex + meta sink).
- Full `npm run test --prefix api`: **7220 passed, 3 skipped** (pre-existing
  environment-conditional skips), 0 failed.
- `git status` empty and scratch worktree removed after probing; no live
  operations touched (read-only runs + `/tmp` scratch).

## Follow-up (non-blocking, for a later task — not this stage)

1. Procedure step 4 in the `DOC_SECTIONS` docblock says "Append the retired id
   to `KNOWN_SECTION_HISTORY`" without the plan's "if it is not already there"
   qualifier. Since the guardrail already requires every current id to be in
   history, a literal reading duplicates the entry on a normal rename. The
   hygiene assertion catches it loudly (`lists "x" twice — keep one entry`),
   so it self-corrects and cannot cause a silent drop — but the docblock
   should say "ensure the retired id is listed (append only if missing) and
   append the brand-new id". One-line fix in `api/siteDocs.js` (outside this
   docs-only stage's write scope).
2. `getDoc` on a legacy article warns more than once (index scan + direct
   re-read). Loud-by-design and unpinned except for `listDocs`; consider
   dedupe only if log noise ever matters.
