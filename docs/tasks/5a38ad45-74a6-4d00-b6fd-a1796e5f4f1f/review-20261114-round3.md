# PR Review Round 3 — Pretty tasks (task 5a38ad45)

Date: 2026-11-14. Reviewer: review stage (docs-only; no source touched).
Scope: branch `kb/5a38ad45-74a6-4d00-b6fd-a1796e5f4f1f` vs `origin/main` (6 files)
plus all prior reports in this folder. Method: assume nothing works until
evidence shows it does; re-ran the targeted suite, inspected every changed file,
compared byte-level evidence.

## Context

The main pretty-tasks change (API byte-identical markdown round-trip,
`deriveTaskTitleFromGoal`, mermaid rendering, two-stage skill, docs) is already
merged into `origin/main`. The remaining branch delta under review is:

- `api/work/taskPersistence.js` — new `extractGoalSection` (fence-aware `# Goal`
  parsing) + `parseTaskMarkdown` rewired to use it
- `api/work/taskPersistence.test.js` — 5 new tests (fence-aware extraction + round-trip)
- `docs/.../pretty-proof.png` — replaced (107722 → 191679 bytes)
- `docs/.../publish-failure-20261114-084737.md`, `update-safety-20261114.md` — reports
- `rt.mjs` — new file at repo root

## Does it achieve the goal?

Clauses A (rich markdown accepted) and B (two-stage file-first skill) remain
achieved via the already-merged work — verified present in this worktree
(`mermaid ^12.3.0` in `frontend/package.json`, two-stage wording in
`skills/creating-new-tickets/SKILL.md`, `deriveTaskTitleFromGoal` in
`api/work/taskIdentity.js`). The new `extractGoalSection` is a genuine
robustness fix in the same direction: a fenced code block containing
`# History`-like text no longer truncates the goal on re-read. Targeted suite
`work/taskPersistence.test.js` passes: 64/64 green (re-run in this session).

## Why it must NOT integrate (concrete, evidence-backed)

1. **The visual-proof "fix" shipped a corrupted PNG — worse than main.**
   `implementation-report-20261114.md` claims the regenerated `pretty-proof.png`
   is "valid … magic `89 50 4e 47` intact". Byte evidence contradicts this:
   - `origin/main` version magic: `89504e470d0a1a0a` (valid PNG).
   - Branch worktree version magic: `efbfbd504e470d0a` (UTF-8 replacement
     character `ef bf bd` where `0x89` belongs — text-mode corruption).
   - `file` reports the branch copy as `data`, not `PNG image data`.
   So the branch replaced a valid screenshot with an unreadable one, and the
   report's headline claim is factually false. Validation 5 (headless visual
   proof of "pretty") is unmet on this branch. The `.gitattributes` `*.png
   binary` rule did not prevent this — the bytes were corrupted before commit
   (written through a text path), so the rule never had a chance to help.

2. **Stray scratch file committed at the repo root: `rt.mjs` (tracked).**
   `git ls-files` confirms it is tracked. It imports
   `./work/taskPersistence.js`, which does not exist from the repo root, so it
   is dead code that cannot run as written; it matches no vitest glob and no
   lint scope. The `update-safety-20261114.md` report itself flags it as "should
   be deleted by the next code-writing stage". A scratch reproduction script
   must never be part of an integration diff — it is hygiene debt shipped as
   product. (This docs-only stage cannot delete it; a code-writing stage must.)

## Non-blocking observations

- `extractGoalSection` carries unrecorded behaviour deltas vs the old regex:
  indented terminator-like lines now terminate (old regex required `#` at
  column zero), `# Log Entries` is a new terminator, CRLF goals normalize to
  LF on re-read, and `historyMatch` still uses the old regex (asymmetric with
  the new goal scan). All are defensible, all confined to edge inputs per
  `update-safety-20261114.md`, but none is amended into `IMPLEMENTATION_PLAN.md`
  (same class of plan-drift already called out in rounds 1–2). Unclosed-fence
  behaviour (goal swallows later sections) is also untested — add a pin.
- `publish-failure-20261114-084737.md` is the same stale-tree mass-push noise
  as the earlier publish failures (missing-`mermaid` build on an old deploy
  tree); it carries no signal against the current tree and is correctly
  recorded as such.
- Prior rounds' blockers (mermaid dep, plan amendments for title derivation and
  survey answers) stay resolved; nothing here regresses them.

## Checklist

- Achieves goal? Yes for A+B (via merged work); branch delta is a compatible hardening.
- Followed plan? No — `extractGoalSection` is unplanned scope with no plan amendment.
- Code standards? Mostly — but a tracked dead scratch file (`rt.mjs`) fails hygiene.
- Easy to modify? Yes — isolated helper, fixture-driven tests.
- Best practices? No — corrupted binary evidence committed; report asserts the opposite.
- Unnecessary tech debt? Yes — `rt.mjs` is exactly that.
- Docs updated? No — implementation report contains a false validity claim;
  plan lacks the `extractGoalSection` amendment.

## Required before re-review

1. Regenerate `pretty-proof.png` through a binary-safe path, verify with
   `xxd -l 8` that magic is `89 50 4e 47` and `file` reports PNG, then commit.
   Correct the implementation report's validity claim.
2. Delete `rt.mjs` (code-writing stage) so the diff contains only the
   persistence fix, its tests, docs, and the valid PNG.
3. Amend `IMPLEMENTATION_PLAN.md` (or a short addendum here) for
   `extractGoalSection`: terminator set, indent rule, CRLF normalization, and
   an unclosed-fence pin.
