# Update-compatibility review — test-isolation change (task 99ccc12f)

Scope: will the implemented change (branch `kb/99ccc12f-7d71-4781-9b81-9d2902367fba`
vs `origin/main`) break existing installs on update?

## What the change touches

- Production resolvers: `api/flow/resolveStatePath.js` (new `VITEST`-gated
  throw-guard + bare-fallback-name validation), and guard calls added to the
  explicit-path branches of `runnerRegistry.js`, `claimStore.js`,
  `steerStore.js`, `dispatch/fleetModelSnapshot.js`, `circuitBreaker.js`,
  `auth/accessConfig.js`.
- Test-only: `api/testSetup.isolation.js`, `api/isolatedTestRoots.js`, and
  `*.test.js` files (incl. new `api/flow/engineStateIsolation.test.js`).
- Untouched: `api/config/schema.js`, `package.json`, `vitest.config.js`,
  deploy/install scripts, all state-file schemas/versions, `loadStateFile` /
  `saveStateFile`.

## Checks performed (2026-11-13)

1. Guard is a no-op in production: `throwIfLiveEnginePathUnderTest` returns
   before any comparison when `process.env.VITEST` is unset, which is the
   case on every real install (only Vitest workers set it).
2. Runtime probe (`node -e`, `VITEST` unset, all `KAINBAIN_*` cleared):
   all 13 production resolutions are byte-identical to the old code —
   runners/claims/steers/fleet-catalog/circuit/seed-demo paths, auth dir,
   explicit-wins, configured-wins, whitespace-fallthrough, fleet
   null-disables. No throw from the new fallback-name validation.
3. All six production fallback names are bare literals
   (`runners.json`, `claims.json`, `steers.json`, `fleet-catalog.json`,
   `circuit.json`, `seed-demo.json`), so the new every-environment
   bare-name validation can never fire on the update path.
4. `circuitBreaker.js` dropped its `os`/`path` imports; repo search confirms
   no remaining `os.`/`path.` code use in that file (one comment match only).
5. Test-only files are unreachable from production: `isolatedTestRoots.js`
   is imported solely by `*.test.js` files; `testSetup.isolation.js` is
   referenced only by `vitest.config.js` `setupFiles`, tests, and docs.
6. No new required env vars, no schema keys, no state-file renames or format
   changes: existing `~/.kainbain/engine/*` files load exactly as before;
   existing `.env` files (incl. installer-written `KAINBAIN_SEED_DEMO=1`)
   behave identically.

## Non-blocking observation

If an operator exported `VITEST=true` in a production environment (nothing
sets it there today), boot would now throw instead of starting. Pathological
only; not an update break.

## Conclusion

Existing installs update safely: production path resolution is provably
identical, no migration or config change is needed, and all new failure
modes are confined to `VITEST` runs.
