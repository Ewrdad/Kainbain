# Pre-warm workspace `node_modules` in runner images so stages and CI skip per-run `npm install`

## Context

Runner worktrees are fresh clones of a task branch and frequently arrive
**without installed dependencies**, so both agents and CI pay an install tax
every run:

**Case study (reference ticket: `05b5d046-9480-40e3-8ec9-c06596c51acc`,
"Regression-pin boot reconcile so server-restart orphans stay at zero"):**

- Implementation stage had to run `npm ci --prefix api` once because
  `api/node_modules` was absent in the checkout
  (`docs/tasks/05b5d046-9480-40e3-8ec9-c06596c51acc/implementation-report-20261123.md`
  §3 note).
- The CI stage log (`automated-tests-failure-20261123-085218.md` /
  `ci-fast-gate-20261123-083258/canary-tests.full.log`) shows the gate itself
  detecting and installing missing workspace deps every run:
  `added 117 packages` (api), `added 535 packages … in 7s` (frontend),
  `added 5 packages` (canary-e2e) before any test branch starts. The whole
  stage took ~1166 s, and the install/detect step is pure repeated overhead.

The gate auto-installs when deps are missing, so this is a latency/effort tax,
not a correctness bug — which is why it keeps recurring silently.

## Steps

1. Build the runner image (or a base layer) with workspace dependencies
   pre-installed for the root, `api/`, `frontend/`, `canary-e2e/` (and any
   other workspace in `package.json`), keyed to the lockfiles.
2. Alternatively/additionally: mount a shared, lockfile-hash-keyed
   `node_modules` cache into runner worktrees (e.g. content-addressed by
   `package-lock.json` sha256 per workspace) so a fresh worktree reuses the
   exact installed tree without network access.
3. Make `scripts/run-tests.mjs` (the fast gate) reuse the warm cache: detect
   the lockfile hash, reuse a matching cached `node_modules`, and only fall
   back to `npm install --prefix ...` when the hash is unknown (logging the
   fallback so it is visible).
4. Add a CI assertion that the install-fallback path was **not** taken on
   runner images (so the pre-warm cannot silently rot).

## Acceptance criteria

- [ ] A fresh runner worktree on a runner image starts with usable
      `node_modules` for all workspaces (verified by running one api unit test
      and one frontend unit test with no install step).
- [ ] Fast-gate runs on warm runners log no "Dependencies missing …
      installing" lines; the fallback still works when the cache is cold.
- [ ] Cache is keyed by lockfile hash, so a lockfile change triggers a real
      reinstall rather than a stale tree.
- [ ] Unit test for the hash-keyed cache lookup (hit / miss / lockfile change).

## Notes / examples

Evidence from case-study ticket `05b5d046-9480-40e3-8ec9-c06596c51acc`
CI stage output:

```
Dependencies missing for frontend (…long list…) — installing (npm install --prefix frontend)...
added 535 packages, and audited 536 packages in 7s
Dependencies missing for canary-e2e (@axe-core/playwright, @playwright/test) — installing (npm install --prefix canary-e2e)...
added 5 packages, and audited 6 packages in 1s
```

and agent-side: "`api/node_modules` was absent in this checkout, so
`npm ci --prefix api` was run once to execute the suites"
(`implementation-report-20261123.md` §3).

## Suggested owner areas

- `Dockerfile` / runner image build, `scripts/run-tests.mjs` (dep detect +
  install fallback → cache lookup), runner worktree provisioning.
