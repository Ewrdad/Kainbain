# IMPLEMENTATION_PLAN.md — Guard site-docs section renames with legacy aliases and a no-silent-drop test

## 1. Goal

Make the next `DOC_SECTIONS` rename in [api/siteDocs.js](/home/server2/.kainbain/runner-work/kb-ee3ca5d2-8b05-4908-bbd1-808c667d1175/api/siteDocs.js) impossible to ship as a silent drop: any retired section id must keep resolving through `LEGACY_SECTION_ALIASES` (with a recorded warning), and removing or renaming a section id without that alias must fail a cheap, loudly-named check. This is the structural follow-on to task `68714709-3f50-4e5c-bfa6-bac16a36c393` (docs viewer sidebar regroup), whose upgrade-safety audit reproduced live that `readDocFile` returned `null` for old section values so `listDocs` returned `[]` and `getDoc` returned `null` on custom `KAINBAIN_SITE_DOCS` dirs — custom articles silently vanished with no alias, warning, or `DEPRECATIONS.md` entry (see [continueity-failure-20261115-214114.md](/home/server2/.kainbain/runner-work/kb-ee3ca5d2-8b05-4908-bbd1-808c667d1175/docs/tasks/68714709-3f50-4e5c-bfa6-bac16a36c393/continueity-failure-20261115-214114.md)). The branch fixed that instance ad hoc; this task builds the permanent guardrail, since all existing API suites passed with the new sections and did not catch the break.

## 2. Guiding principle — make the change easy, then make the change

Phases 0–A change no guardrail behavior: they pin down the decisions (survey defaults), centralize the taxonomy history in one asserted place, and add shared test fixtures for legacy frontmatter dirs. Phase B then lands the regression test, the rename guardrail, and the documented procedure as small edits on those seams. Phase C proves the guardrail both ways (red without alias, green with alias) and runs the full gates. Do not start Phase B until the Phase 0 decisions are confirmed and Phase A fixtures are green.

## 3. Current-state facts (researched this run)

- Taxonomy source of truth: `api/siteDocs.js` — `DOC_SECTIONS` (line 35: `["getting-started", "concepts", "workflows", "reference"]`), `SECTION_LABELS`, `LEGACY_SECTION_ALIASES` (`how-it-works → concepts`, `working-with → workflows`), and `readDocFile` (lines 133–166), which resolves aliases with a `console.warn` naming the file, then returns `null` for still-unknown sections.
- Ad-hoc fix already landed: [DEPRECATIONS.md](/home/server2/.kainbain/runner-work/kb-ee3ca5d2-8b05-4908-bbd1-808c667d1175/DEPRECATIONS.md) has a "Docs taxonomy rename" section (2026-11-15) stating the alias is retained indefinitely, and [api/siteDocs.test.js](/home/server2/.kainbain/runner-work/kb-ee3ca5d2-8b05-4908-bbd1-808c667d1175/api/siteDocs.test.js) has a `LEGACY_SECTION_ALIASES` suite (3 tests: mapping equality, `readDocFile` resolves old sections, `listDocs`/`getDoc` index old-section custom articles). Gap: no test asserts the warning is emitted, and nothing fails if a *future* rename drops an id without adding an alias.
- Frontend mirror: [frontend/src/components/docs/docsSections.js](/home/server2/.kainbain/runner-work/kb-ee3ca5d2-8b05-4908-bbd1-808c667d1175/frontend/src/components/docs/docsSections.js) duplicates order/labels; [api/siteDocs.frontendParity.test.js](/home/server2/.kainbain/runner-work/kb-ee3ca5d2-8b05-4908-bbd1-808c667d1175/api/siteDocs.frontendParity.test.js) locks the two copies together. Precedent for cheap taxonomy guards living in `api/*.test.js` and running in the default gate.
- Real-content-dir precedent: [api/siteDocs.integrity.test.js](/home/server2/.kainbain/runner-work/kb-ee3ca5d2-8b05-4908-bbd1-808c667d1175/api/siteDocs.integrity.test.js) deliberately reads the real `site-docs/` dir and repo-root files — so a guardrail test reading `DEPRECATIONS.md` has precedent.
- Gates: `npm run test:api` (`vitest run` in `api/`), `npm run lint:api`, root `npm run docs:check` (siteDocs suites + doc-link + jsdoc-example checks). No UI change, so no `capture:screenshot` or visual suite is needed.

## 4. Survey decisions (from SURVEY.md)

[SURVEY.md](/home/server2/.kainbain/runner-work/kb-ee3ca5d2-8b05-4908-bbd1-808c667d1175/docs/tasks/ee3ca5d2-8b05-4908-bbd1-808c667d1175/SURVEY.md) asked three questions; no answers were recorded in the file, so this plan adopts the marked Recommended option for each as the decided default (confirm in Phase 0; each is reversible before Phase B):

| # | Question | Adopted decision (Recommended) | Plan consequence |
|---|----------|-------------------------------|------------------|
| q1 | What happens to old-category articles? | Show under the new name automatically + record a warning for the site owner | Keep alias resolution + `console.warn`; regression test asserts both; no reader-facing "moved" notice |
| q2 | How long do old names keep working? | Forever | Aliases are never removed; guardrail asserts the known-history set only grows; matches the existing "retained indefinitely" note |
| q3 | Scope: docs categories only or reusable? | Docs categories only, keep it simple (optional question) | Guardrail is a siteDocs-local test + docblock, not a generic rename framework |

If the implementer hears otherwise from the task owner, only q1/q2 change behavior (warn text, alias lifetime); the guardrail shape in Phase B is unchanged.

## 5. Key decisions

1. **Guardrail mechanism: a committed vitest history assertion, not a new script.** A test in `api/` (extended `siteDocs.test.js` or a small new `siteDocs.taxonomy.test.js`) holds a `KNOWN_SECTION_HISTORY` list of every section id ever shipped. It asserts every history id is either in `DOC_SECTIONS` or a key of `LEGACY_SECTION_ALIASES`, and fails with a message naming the retired id plus the fix (`add LEGACY_SECTION_ALIASES['<id>'] → '<new>' and a DEPRECATIONS.md entry; see the DOC_SECTIONS docblock`). Rejected alternative: a standalone `scripts/check-*` job — heavier, needs new CI wiring, and the parity/integrity tests prove `vitest` is the established home for taxonomy guards.
2. **Alias-target and deprecation-note coupling included in the same check.** The guardrail also asserts every alias target is a current `DOC_SECTIONS` member (catches dangling aliases after a second rename) and that `DEPRECATIONS.md` mentions each retired id (catches alias-without-note). Reading `DEPRECATIONS.md` from the test follows the integrity-test precedent; message names the missing piece.
3. **Warning stays owner-facing `console.warn`, and the regression test asserts it.** Survey q1's recommended option is exactly current behavior; the gap is only that no test locks it. Use `vi.spyOn(console, "warn")` around `readDocFile`/`listDocs` on a legacy dir and assert the retired id and filename appear. Rejected: reader-facing "moved" banner (survey non-recommended) and silent aliasing (repeats the original failure mode).
4. **Procedure documented where the taxonomy is defined.** The required rename checklist (alias + warn + `DEPRECATIONS.md` entry + history-list update + test run) lives in the `DOC_SECTIONS` docblock in `api/siteDocs.js` as the primary copy future agents read first, with a one-line pointer from `LEGACY_SECTION_ALIASES` and no second full copy elsewhere (avoids drift).

## 6. Step-by-step work plan

### PHASE 0 — Grounding and decisions first (no code change; biggest unknowns up front)

**Step 1 — Confirm survey defaults and guardrail home.**
Confirm the three adopted survey defaults (§4) with the task owner (or record them as assumed if unreachable), and confirm the guardrail lives as a vitest history assertion in `api/` per Key Decision 1. Output: a short decision note appended to this plan's task folder if anything deviates from §4–§5.
*Why first:* q1/q2 answers change the warn/lifetime contract; settling them before fixtures avoids rewriting tests.

**Step 2 — Reproduce the original silent drop against current HEAD (red-team baseline).**
In a scratch temp dir (never committed), write two `.md` files with old `how-it-works`/`working-with` frontmatter, then run a throwaway node/vitest probe asserting `listDocs`/`getDoc` resolve them today (proves the ad-hoc alias works), and a second probe with the alias temporarily stubbed out proving `listDocs` returns `[]` / `getDoc` returns `null` (reproduces the continuity-failure report). Keep the probes in `/tmp`, not the repo.
*Why first:* this is the "big research piece" — it re-verifies the case study on the current tree and defines the exact red/green boundary the guardrail must enforce.

### PHASE A — Make the change easy (seams + fixtures, no behavior change)

**Step 3 — Add a shared legacy-docs-dir fixture helper for tests.**
Add a tiny helper (co-located with the siteDocs tests) such as `writeLegacyDocsDir(files)` that creates a temp dir of articles with given `section:` frontmatter and returns its path. Refactor the existing `LEGACY_SECTION_ALIASES` suite's inline temp-dir setup onto it with zero assertion changes; suite stays green.
*Why first:* the new regression + guardrail tests both need legacy dirs; one helper keeps them small and consistent.

**Step 4 — Introduce the `KNOWN_SECTION_HISTORY` seam (asserted, initially passing).**
Add the history list (initial value: the four current ids plus `how-it-works` and `working-with`) either as a test-local constant or an export from `api/siteDocs.js` next to `DOC_SECTIONS`, plus a passing assertion of the history ⊆ (current ∪ aliased) invariant. No failure-message polish yet; just the seam and a green test.
*Why first:* the guardrail in Phase B becomes a message + coupling upgrade on this seam rather than new machinery.

### PHASE B — The change (small edits on the seams)

**Step 5 — Harden the no-silent-drop regression test (acceptance criterion 2).**
Extend the legacy suite: (a) `listDocs` on a legacy-only dir is non-empty and maps to the aliased sections; (b) `getDoc` resolves each legacy slug (never `null`); (c) `console.warn` was called once per aliased file and the message names the retired id and filename. Cover both retired ids. This is the permanent proof old-section frontmatter still indexes via alias with a recorded warning.

**Step 6 — Build the rename guardrail (acceptance criteria 1 and 3).**
Upgrade the Phase A assertion into the full guardrail: for every id in `KNOWN_SECTION_HISTORY`, fail naming the retired id when it is neither current nor aliased; fail naming the alias when a target is not current; fail naming the retired id when `DEPRECATIONS.md` does not mention it. Each failure message states the exact fix (add the alias entry, correct the target, add the deprecation note) and points to the `DOC_SECTIONS` docblock procedure. Mutation-check immediately (see Step 8).

**Step 7 — Document the rename procedure at the taxonomy definition.**
Write the required checklist into the `DOC_SECTIONS` docblock in `api/siteDocs.js`: (1) choose the new id and update `DOC_SECTIONS`/`SECTION_LABELS` (+ frontend mirror, locked by the parity test); (2) add `LEGACY_SECTION_ALIASES['<old>'] = '<new>'` (never delete entries — aliases are forever per survey q2); (3) add a `DEPRECATIONS.md` entry (retired id, new id, date, auto-migration note); (4) append the retired id to `KNOWN_SECTION_HISTORY` if it is not already there; (5) migrate in-repo `site-docs/*.md` frontmatter; (6) run the siteDocs suites. Add a one-line pointer from the `LEGACY_SECTION_ALIASES` docblock. Keep it concise — a checklist, not an essay — so future agents follow it first time.

### PHASE C — Assurance (prove it both ways, then run the gates)

**Step 8 — Mutation probes: red without alias, green with alias (the highest-risk validation).**
With throwaway local edits (reverted immediately, or via `git stash`): (a) remove one `LEGACY_SECTION_ALIASES` entry → the guardrail test fails naming that retired id; (b) rename a `DOC_SECTIONS` id without adding an alias → the guardrail test fails naming the retired id; (c) perform a valid rename (new id + alias + `DEPRECATIONS.md` mention + history update) → the full siteDocs suites pass. Record the exact failure messages in the task notes as proof each acceptance criterion is enforced, not just asserted.

**Step 9 — Full automated verification.**
Run `npm run test:api` (all siteDocs suites incl. new guardrail, parity, integrity, deploy-layout), `npm run lint:api`, and root `npm run docs:check` (doc-link + jsdoc-example checks cover the edited docblocks). All green required; no frontend or visual suites affected (no UI change).

**Step 10 — Task documentation.**
Record in the task folder: the survey-default confirmation (Step 1), the red-team baseline result (Step 2), and the mutation-probe failure messages (Step 8). No `site-docs/` article changes needed (this is contributor-facing procedure, not user docs); the `DEPRECATIONS.md` taxonomy section needs no edit unless Step 8's valid-rename probe used a real id (it must not — use a fake id and revert).

## 7. Validation plan (maps to acceptance criteria)

| Acceptance criterion | Validation | Expected evidence |
|----------------------|------------|-------------------|
| Rename without alias fails the new check, naming the retired id | Step 8 probes (a) and (b) | Guardrail test output containing the retired id (e.g. `working-with`) plus the fix pointer; recorded in task notes |
| Old-section frontmatter still indexes (aliased) with a recorded warning, covered by a regression test | Step 5 suite + `npm run test:api` | New/extended tests green; `listDocs` non-empty, `getDoc` non-null, `console.warn` asserted per file |
| Valid renames with alias plus deprecation note pass | Step 8 probe (c) + Step 9 | Full `test:api` + `lint:api` + `docs:check` green on a valid-rename tree |

## 8. Risks and mitigations

- **Over-coupling the test to `DEPRECATIONS.md` prose:** assert only that each retired id string appears in the file, not its wording — robust to copy edits, still catches a missing entry.
- **History list itself drifting:** the guardrail fails closed — an id in neither current sections nor aliases fails with the id named, so forgetting the history update surfaces as the same loud failure, not silence.
- **Double-alias chains after a second rename:** alias targets must be current ids (Key Decision 2), so a rename of an already-aliased target fails until both entries point at the live id; document this in the checklist.
- **Frontend mirror drift on a real rename:** out of scope for the guardrail itself — already covered by `siteDocs.frontendParity.test.js`; the checklist references it.
- **Survey had no recorded answers:** mitigated by adopting Recommended defaults explicitly in §4 and confirming in Step 1 before any test is written.

## 9. Non-goals

- No generic rename-protection framework for other taxonomies (survey q3: docs categories only).
- No reader-facing "moved" notices (survey q1: owner-facing warning only).
- No alias expiry or removal schedule (survey q2: forever; matches "retained indefinitely").
- No frontend, sidebar, or styling changes; no new dependencies or CI jobs.

## 10. Definition of done

A section rename without an alias entry fails the new check naming the retired id; old-section frontmatter still indexes (aliased) with a recorded warning, covered by a regression test; valid renames with alias plus deprecation note pass; the rename procedure is documented in the `DOC_SECTIONS` docblock; `test:api`, `lint:api`, and `docs:check` are green; mutation-probe evidence is recorded in the task folder.
