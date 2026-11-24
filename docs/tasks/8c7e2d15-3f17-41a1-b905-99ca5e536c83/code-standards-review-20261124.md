# Code-standards review — branch vs origin/main (2026-11-24, agent, read-only)

Task: `8c7e2d15-3f17-41a1-b905-99ca5e536c83`. Stage asks whether the branch
changes comply with `./docs/KB Code Standards.md`. This review is read-only
(docs-only stage; only this file written). No live mutation: no
reinstall / env-edit / restart / rediscovery / DELETE (survey q1 + parent
q23 binding — the agent RECOMMENDS runner restarts, it never executes them).

## Scope (code files only; 90+ docs files excluded)

Local HEAD `cec79eec` vs `origin/main` (`git diff origin/main...HEAD`):
- `runner/daemon.js` (+145) + `runner/daemon.test.js` (+169)
- `scripts/package-runner.mjs` (+203), `scripts/package-runner.sh` (+31),
  `scripts/lib/runner-install-root.sh` (+17)
- `tests/package-runner-conformance.test.mjs` (+158),
  `tests/install-runner-wrapper.test.mjs` (+60),
  `tests/runner-release-manifest.test.mjs` (+6)

Local checkout is 4 commits behind the branch tip
(`origin/kb/8c7e2d15-3f17-41a1-b905-99ca5e536c83`); the remote tip adds
`scripts/lib/bundle-receipt.sh` + `tests/bundle-receipt.test.mjs`, the
`runner-install-root.sh` staging-swap, and `packageRunner` JSDoc. Those
were reviewed via `git diff`/`git show` only (not checked out); their
tests were not executed here (flagged as unverified below).

## Verdict: COMPLIANT

- **Understandable over technical language.** New exports use long,
  descriptive names (`daemonFolder`, `statusPaths`, `missingPaths`,
  `parsePackagerArgs`, `validatePackageSourceTree`,
  `isSkippedCodeTreeFile`, `resolveCodeTreeScanRoot`). Every new export
  carries a `MARK:` label in its JSDoc block directly above the export
  with an `@example` tag (`isSkippedCodeTreeFile`,
  `resolveCodeTreeScanRoot`, `CODE_TREE_SCAN_ROOT`,
  `CODE_TREE_SKIP_FILE_NAMES/SUFFIXES`, `parsePackagerArgs`,
  `validatePackageSourceTree`; internal `copyPruned` also has both).
  All new public functions use the labelled pattern
  (`{ fileName }`, `{ daemonDir }`, `{ args }`, `{ root }`). JSDoc is
  plain English and states the *why* (WP-F false positive, NB…,
  fail-fast-before-staging). `grep -i factory|barrel|pattern|class`
  over the diff is empty — no design-pattern language, no classes.
- **Functional over object oriented.** No classes added. `parsePackagerArgs`
  is pure and never mutates its input (copies the argv slice; tested).
  New resolvers/predicates fail quiet and never throw
  (`resolveCodeTreeScanRoot`, `isSkippedCodeTreeFile`, `resolveRunnerBuild`).
  Function names are verbs/predicates (`parse`, `validate`, `resolve`,
  `isSkipped…`, matching the existing `hasCodeChangedSinceBoot` family).
- **Co-location over abstraction.** `daemon.test.js` sits next to
  `daemon.js`; packager/installer tests extend the existing `tests/`
  files that already own them (no new location invented). The shared
  receipt helper lives at the lowest common folder (`scripts/lib/`).
- **Tested over trusted.** Touched-area suites pass on this HEAD:
  `node --test runner/daemon.test.js` 188/188, and
  `package-runner-conformance` + `runner-release-manifest` +
  `install-runner-wrapper` 46/46. Coverage matches new behavior:
  artifact skip (`daemon.js~`, `.bak*`, `.log/.tmp`, OS junk) vs real
  code (`my.bakery.js` still counts), bundle-vs-checkout scan root,
  cli dirty-scope siblings (`runner/` + `../shared` + `../api`), bare
  `--out` rejection, fail-fast source validation with no partial
  tarball, symlink-cycle safety, REF-vs-HEAD guard, lay-down asserts,
  pi-leg warn-not-fail. `npm run check:jsdoc-example` = PASS
  (679 missing vs 680 grandfathered baseline).

## Honest limitations (not standards failures)

- `node --test runner/*.test.js` (full runner suite) cannot load
  `runner/harnessModelDiscovery.test.js` in this worktree:
  `ERR_MODULE_NOT_FOUND 'uuid'` because `api/node_modules` is absent.
  Environmental, unrelated to this branch (the branch does not touch
  `api/flow/runnerRegistry.js`; `uuid` is a declared api dep).
- Remote-only `tests/bundle-receipt.test.mjs` and the staging-swap in
  `runner-install-root.sh` were reviewed by diff only, never executed
  locally — unverified by execution.
- Minor, non-blocking: `copyPruned(src, dest, …)` and `snapshotCodeTree(rootDir)`
  keep pre-existing positional signatures; every *new* public API in this
  branch uses the labelled pattern.

## Live-state note

Code-standards compliance does not move live WP-F state. Per runs 50/51,
`server2-alpha` Bundle B and the `local-bravo` paused regression still
require operator action, and the explicit human grant (q3/q4) is still
absent — so WP-G readiness and §6 live checks remain operator-pending.
Recommendation to operator (not executed here): server2-alpha Bundle B
if not yet installed, bravo unpause decision, explicit DELETE grant,
then live §6.3 UI pass.
