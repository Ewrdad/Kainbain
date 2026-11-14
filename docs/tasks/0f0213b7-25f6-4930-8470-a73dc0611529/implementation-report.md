# Implementation report — Dependency-manifest guardrail for new frontend imports

Task: `0f0213b7-25f6-4930-8470-a73dc0611529`
Case study: `5a38ad45-74a6-4d00-b6fd-a1796e5f4f1f` (undeclared dynamic `import("mermaid")` caused Frontend Build → depcheck → 1500s canary → publish cascade)

## What was built

A zero-dependency, milliseconds-fast pre-check that fails when a frontend source file imports a bare
package specifier not listed in `frontend/package.json`.

| File | Change |
| --- | --- |
| `frontend/scripts/check-imports-declared.js` | New check script (comment/string-aware scanner; static, side-effect, type-only, multiline, `export … from`, dynamic `import()`, `require()`; scoped + subpath mapping; `--package <dir>` reuse flag) |
| `tests/check-imports-declared.test.mjs` | New committed `node:test` suite (15 tests: scanner, mapping, fixture fail/pass, real-tree clean, ordering pins) |
| `frontend/package.json` | New `check:deps` script, prepended as the first step of `build` (before `check-no-deprecations.js`, which runs vite) |
| `package.json` | New root `check:deps:frontend` script |
| `scripts/run-tests.mjs` | Gate preflight calling the check in-process before `runParallel(fast)`; new test file added to Harness Self-Tests |
| `tests/run-tests.test.mjs` | Pin: new test file stays in the Harness Self-Tests branch |
| `agents.md`, `AGENTS-MAP.md`, `docs/CI_SCRIPTS.md` | Same-commit rule documented (new import ⇒ `package.json` + lockfile in the same commit) |

`docs/agent-docs/KB-Code-Standards.md` was intentionally left untouched: it is a vendored copy whose
header forbids edits below it, so the normative text lives in `agents.md` per the plan.

## Fixture evidence (acceptance criteria)

Fixture: `frontend/src/__depcheck-fixture__.jsx` containing `import("some-undeclared-pkg")`
(added, proven, then deleted — never committed).

1. Direct check fails fast naming file + package (exit 1, 0.61s wall):
   `❌ Undeclared dependencies: … - some-undeclared-pkg imported by src/__depcheck-fixture__.jsx`
2. `npm run build --prefix frontend` fails at the `check:deps` step (exit 1, zero vite/rolldown output).
3. `npm test -- --no-canary` fails in 2.26s at the preflight, before any `▸ started …` overlap line.
4. Clean tree (fixture removed): `✅ Frontend imports check passed (732 files in ~430ms)` —
   declared deps pass, including the real `import('mermaid')` in `MarkdownViewer.jsx`.

Timing vs. replaced failure modes: check ~0.4s (0.6–0.7s via npm) vs. build ~30s+,
depcheck ~56s, canary 1500s timeout.

## Verification (clean tree)

- `node --test tests/check-imports-declared.test.mjs tests/run-tests.test.mjs` — 49/49 pass
- `npm run lint` — 0 errors (new file carries only the same `detect-non-literal-fs-filename`
  warnings its sibling check scripts already emit)
- `npm run check:one-function`, `check:jsdoc-example`, `docs:check` — PASS
- New files pass the repo's prettier; the 4 touched files prettier flags were already
  non-conformant at HEAD (no prettier gate exists; left as-is)
- Full gate `npm test -- --no-canary` — all 11 branches PASS, exit 0
