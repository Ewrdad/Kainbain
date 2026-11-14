# PR review — dependency-manifest guardrail (task 0f0213b7)

Reviewed `origin/main...HEAD` on branch `kb/0f0213b7-25f6-4930-8470-a73dc0611529`.
Assumed broken until proven working; every claim below was re-verified on this checkout.

## Verdict: suitable to integrate

## Acceptance criteria (all proven, not just read)

1. **Undeclared import fails fast naming file + package.** Reproduced independently
   with a `/tmp` fixture package (repo tree untouched): `import("some-undeclared-pkg")`
   and static `import ... from "some-undeclared-static"` both exit 1 with
   `- <pkg> imported by src/<file>` plus the same-commit fix hint. The committed
   suite (`tests/check-imports-declared.test.mjs`) passes 41/41, including fixture
   fail/pass and CLI exit-code tests.
2. **Declared deps pass.** `node frontend/scripts/check-imports-declared.js` on the
   clean tree: `Frontend imports check passed (732 files in ~450ms)`, exit 0.
   This covers the exact case-study form `import('mermaid')`
   (`frontend/src/components/common/MarkdownViewer.jsx:165`, single-quote dynamic).
3. **Runs before the frontend production build.** Two insertion points, both verified:
   - `frontend/package.json` `build` starts with `npm run check:deps`, ahead of
     `check-no-deprecations.js`, which is the step that spawns the real `vite build`.
     Chain confirmed: `build:frontend` → `build --prefix frontend` → `check:deps` first;
     `publish.sh` consumes `build:frontend`, so the publish gate is covered too.
   - `scripts/run-tests.mjs` `main()` runs the check as a synchronous preflight next to
     the Settings-duplicate check, before `runParallel(fast)` starts any overlap branch.
   - Contract tests pin both orderings and pass.

## Plan, standards, docs

- **Follows the plan.** Matches `IMPLEMENTATION_PLAN.md` phases (recon → unwired
  scripts → baseline → wiring → fixture proof → docs), the fail-fast preflight
  precedent, and the zero-dependency check-script template.
- **Code standards.** Zero `class`, pure scanner core, verb-named single-purpose
  functions, labelled-object gate entry points, `@example` on every function.
  `npx eslint frontend/scripts/check-imports-declared.js`: 0 errors (4
  `detect-non-literal-fs-filename` warnings, the same class sibling check scripts emit).
- **Docs updated.** Same-commit rule documented in `agents.md`, `AGENTS-MAP.md`, and
  `docs/CI_SCRIPTS.md`. `KB-Code-Standards.md` intentionally untouched (vendored copy
  whose header forbids edits) — reasonable, normative text lives in `agents.md`.
- **No new tech debt.** Stdlib-only (`node:fs/module/path/url`), no dependency or
  lockfile changes, read-only scanner, limitations documented in the script header,
  `--package <dir>` flag left for api/root extension. Easy to modify later.

## Prior CI failure addressed

`automated-test-2-failure-20261114-201542.md` failed only in Harness Self-Tests
(`tests/install-runner-wrapper.test.mjs`, 3 tests) because the CI host exports
`KAINBAIN_RUNNER_INSTALL_ROOT` and children inherited it. This branch adds a
test-only `childEnv()` strip plus a decoy regression test. Verified 8/8 pass both
with and without the host var set (CI simulation). Out-of-ticket scope but
test-only, minimal, and the fix that unblocks a green gate — acceptable to land
together; future branches should land such fixes separately.

## Notes / follow-ups (not blockers)

- **Survey scope.** `SURVEY.md` answers landed at 20:11 (after the 19:11
  implementation, which followed the approved plan's frontend-only default) and chose
  "Whole project". The ticket only requires "at least the frontend package" and all
  acceptance criteria are frontend-scoped, so this is satisfied; api/root coverage
  is a follow-up behind the existing `--package` flag.
- **Stale count.** `implementation-report.md` says "15 tests"; the suite now has 41.
  Cosmetic only.
