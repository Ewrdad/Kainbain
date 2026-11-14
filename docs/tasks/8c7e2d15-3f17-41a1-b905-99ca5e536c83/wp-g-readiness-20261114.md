# WP-F → WP-G readiness note (2026-11-14)

WP-G ticket: `6ba7e727-8b7a-4c46-ad4a-960bcd099bcb` (decision-gated on WP-F;
blocked by this task).

## Verdict: WP-G NOT READY — do not start it

WP-G's entry condition (RESPONSE.md §5 / WP-G ticket) is "WP-F verification
shows every live runner reporting healthy discovery". Current state
(`verification-20261114.md` §6.1):

- local-alpha / local-bravo: no `modelSource`, no `discoveryStatus`, no
  build identity (pre-WP-A/B daemons still live on .206).
- server2-alpha: `discovered`, muse leg ok, but pi leg
  `ERR_MODULE_NOT_FOUND` (N3) and no build identity (bundle @ `f430f537`).
- Live catalogue still contains `muse::meta::test-fleet-model` (purge
  blocked on permission + Phase 3 receipts).

## What WP-G needs from WP-F completion

1. Operator executes `operator-handoff-20261114.md` (Bundles A+B, restart
   sequence) and returns per-runner receipts.
2. A permissioned run performs the Phase 4 purge + live §6.3/§6.4 and
   updates `verification-<date>.md` to all-pass.
3. Only then may WP-G proceed to its HUMAN dispatch decision (whether
   dispatch should treat unverified as unserved — WP-G is not required to
   fix the reported bug).

## WP-F assets handed over (this folder)

`IMPLEMENTATION_PLAN.md`, `gates-20261114.md`, `baseline-20261114.md`,
`operator-handoff-20261114.md`, `verification-20261114.md`, plus backups
at `/home/server2/.kainbain/backups/wp-f-20261114-1135/` (SHA256SUMS
verified). No product code changed in this run (docs only); no live
mutation performed (read-only GETs + test suites, engine dir externally
verified untouched).
