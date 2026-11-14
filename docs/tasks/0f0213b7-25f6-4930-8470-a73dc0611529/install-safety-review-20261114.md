# Install-safety review: dependency-manifest guardrail

Scope of the change (`git diff origin/main...HEAD`): 16 files — `frontend/package.json`,
`package.json`, `scripts/run-tests.mjs`, new `frontend/scripts/check-imports-declared.js`,
`tests/check-imports-declared.test.mjs`, plus doc/test edits. No dependency versions changed.

## Would existing installs break on update?

No. Checked each install-breakage vector:

- **No new dependencies.** `frontend/package.json` and `package.json` only add scripts
  (`check:deps`, `check:deps:frontend`) and prepend `npm run check:deps` to the frontend
  `build` chain. `dependencies`/`devDependencies` are identical to the base, and
  `frontend/package-lock.json` / `package-lock.json` show no diff, so `npm ci`/`npm install`
  resolves the same tree. There are no `postinstall`/`preinstall`/`prepare` hooks that the
  new script could hook into.
- **stdlib-only, engine-compatible.** The new script imports only `node:fs`, `node:module`,
  `node:path`, `node:url` (no external packages), and uses `.at()` (Node 16.6+).
  Engines require `^20.19.0 || >=22.12.0`, so this runs on every supported install.
  Importing the module from `scripts/run-tests.mjs` does not execute the check
  (guarded by `invokedDirectly`), so merely loading the gate cannot break installs.
- **Passes on the unmodified tree.** `checkPackageDirectory({packageDirectoryPath: frontend})`
  returns `isClean: true` over 732 scanned files, and `npm run check:deps:frontend` exits 0
  with `✅ Frontend imports check passed (732 files in ~460ms)`. The build/test preflight
  therefore does not fail existing installs; it only fails when a genuinely undeclared bare
  import is present. No `@/`-style aliases or virtual modules exist (`vite.config.js`
  defines no `resolve.alias`), so the `@`-scoped mapping cannot false-positive on current code.
- **Tests agree.** `node --test tests/check-imports-declared.test.mjs` passes 41/41,
  including `the real frontend tree is clean (including the declared mermaid import)`.
  The prior full-CI failure on record (`automated-test-2-failure-20261114-201542.md`) failed
  in Harness Self-Tests; the guardrail line itself reported `✅ Frontend imports check passed
  (732 files in 357ms)` and Frontend Build passed — i.e. the new gate did not break installs there either.
- **Unrelated test fix is test-only.** `tests/install-runner-wrapper.test.mjs` strips an
  inherited `KAINBAIN_RUNNER_INSTALL_ROOT` from child env so tests observe the fake `$HOME`
  layout. This changes no installer behaviour and cannot break user installs.

## Verdict

Safe to update: existing installs resolve the same dependency tree, and the only new
execution (the guardrail preflight on build/test) passes on current code in milliseconds.
