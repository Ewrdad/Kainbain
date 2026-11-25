# Upgrade-safety review — S1 (task 3b82f6ae)

Stage question: will the current implementation break existing installs on
update? Scope reviewed: `main...origin/kb/3b82f6ae-8c54-44bf-b283-0ffab76e7ab7`
@ `5b53cbcd` (13 source files, 9 test files, 2 docs). Read-only review
(`git show` / grep / `node --check` / runtime probes); no source edited.
Verdict: NO upgrade break found — update is backward-compatible.

## Persistence: no migration, no disk-format change

- `saveTaskMarkdown` (`api/work/taskPersistence.js:68-114`) writes frontmatter
  from an explicit allowlist. None of the new fields (`runnerInterruptCount`,
  `capacityRefusalCount`, `consecutiveResumes`, `lastCapacityRefusal`,
  `lastResumedAt`) are in it, so they are in-memory only and `task.md` bytes
  are identical before/after (history lines only).
- `parseTaskMarkdown` (`taskPersistence.js:994+`) reconstructs tasks from a
  fixed key list; new fields start `undefined` after restart/load. Every new
  reader is null-safe (`Number.isInteger(...) ? : 0`, `?? null`, `task?.`),
  so old files and missing fields cannot throw.
- Restart resets streaks to the fast path (same as pre-existing
  `runnerInterruptCount`); backoff can only delay, never park. Already-parked
  tasks are not stuck worse than before (park state was in-memory anyway).

## Signatures and API shape: additive-only, optional params

- `findResumedCandidate(store, {now, ignoreBackoff}={})`,
  `findNextCandidateTask(..., {now, ignoreBackoff})`,
  `scanClaimableTasks(deps, {runnerId, now})` — all new params optional with
  defaults; every old caller (`scheduleTick`, `taskStore`, `runnerRoutes`)
  keeps working. Verified call sites: `scheduleTick.js:157`,
  `taskStore.js:921,1061`, `runnerRoutes.js:1375` (new call passes `runnerId`).
- `interruptExecution` return: non-capacity path returns the identical
  `{interrupted, interruptCount, escalated}`; the capacity path adds fields
  only. The sole caller (`runnerRoutes.js:1077`) returns it as JSON; old
  runners ignore extras. No runner rollout needed (prefix already sent by
  existing runners via `daemon.js:2306`).
- No config, env, dependency, or `package.json` changes; no frontend changes.
- `isAutoResumableWithReason.js` change is comment-only; death-loop branch
  unchanged and still keys only off `runnerInterruptCount`.

## Runtime probes (executed, read-only, Node v24.22.2)

- `node --check --input-type=module` on all 10 touched/new modules: PASS.
- Classifier (`capacityRefusal.js`): `[null,"",42] -> false,false,false`;
  plain/leading-space prefix -> `true,true`.
- Backoff: `[null,{}, "x", 1.5, n=3, wrong-stage, n=10] -> [0,0,0,0,30000,0,300000]`.
- Remaining: `[null, garbage-ref, 30s-10s, future-ref, wrong-stage] ->
  [0,0,20000,300000,0]` (future clock-skew ref clamps to the curve).
- Hide: garbage/missing task -> false (fail-open). Garbage `at` returns true
  only for the unrealistic `now=1000`; with a real clock (~1.7e12) it is
  false — not a production break.

## Dispatch/recovery behavior on update

- First resumes stay instant (backoff threshold 3; fresh installs have no
  streaks). Backoff is capped at 5min, time-based, re-checked every poll —
  no stranding, no manual step.
- Startup recovery (`startupRecovery.js:101`) and `scheduleTick` use
  `autoResumeTask`/`findNextCandidateTask` directly; recovery is not blocked
  by backoff. Queue display (`getScheduledQueue.js`) uses its own checks,
  not `findResumedCandidate`, so backed-off work stays visible.
- `fireQueueEmptyPush` re-check now passes `ignoreBackoff:true`, so a
  backed-off task still counts as pending (no false queue-empty page).

## Caveat

Full `npm run test:api` was not re-run against the origin tree in this
docs-only stage (would require checking out non-docs code); relying on the
recorded gates in `STAGE-CLEANUP-VERIFY.md` plus the static compat analysis
and probes above. The decisive question — old installs updating without
crash, migration, or stuck tasks — is answered by that analysis.
