# Stage review (PR-review stage) — S1: cap refusals ≠ runner deaths + re-dispatch backoff

Task `3b82f6ae-8c54-44bf-b283-0ffab76e7ab7`, branch `kb/3b82f6ae…` @ `10a9f7c8`.
Scope reviewed: `git diff main...HEAD -- api/ docs/EngineDetails/` — 13 source files,
9 test files, 1 operator doc (plus task docs). Docs-only stage: no source edited;
all verification was read-only (unit tests, throwaway `/tmp` git worktree of `main`,
read-only probes). No prod system touched — the GUIDE-07 §5 fleet script is
PROD-READ-ONLY and was deliberately NOT run without permission.

## Verdict questions

| Question | Answer | Evidence |
|---|---|---|
| Achieves the goal? | Yes | Red/green repro below; 5 cap refusals → `runnerInterruptCount` 0, no escalation, no `runner-death-loop` park, reason still in history, `capacityRefusalCount` 5. Backoff: 3+ consecutive resumes → 30s doubling to 5min on BOTH dispatch paths; fresh work wins; first resumes instant; refusing runner hidden ~2min on fleet scan. Death-loop parking for true bare/crash streaks preserved (pin tests pass unmodified). |
| Followed the plan? | Yes | IMPLEMENTATION_PLAN phases map 1:1 to the diff: `capacityRefusal.js` classifier, `MAX_CAPACITY_REFUSALS_BEFORE_NOTE` note threshold (never parks), ledger exclusion, `resumeBackoff{,RemainingMs}.js` (threshold 3, 30s base, 5min cap), `capacityRefusalHide.js` (2min), `autoResumeTask` streak stamping, `fireQueueEmptyPush` `ignoreBackoff` re-check, runner id plumbed in `runnerRoutes.js` dispatch scan. Survey defaults (q1–q5 Recommended) match implementation; source RESPONSE_SURVEY.md was unanswered, this task's SURVEY.md recorded all-Recommended. Coordination respected: no runner-side setup-failure backoff (ticket e3d4e9db) duplicated — backend-only. |
| Code standards? | Yes | `check-one-function-per-file` PASS (884 files); `check-jsdoc-example` PASS; eslint on touched files: 0 errors, 2 warnings that also exist on `main` (same pattern, pre-existing); JSDoc `MARK:` blocks with `@example` on every new export; co-located `*.test.js` per KB standards. |
| Easy to modify later? | Yes | Constants centralized (`RESUME_BACKOFF_*`, `CAPACITY_REFUSAL_HIDE_MS`, `MAX_CAPACITY_REFUSALS_BEFORE_NOTE`); pure functions with injected clocks (`now` params) so tests pin exact boundaries; all new task fields read null-safe (`Number.isInteger(…) ? : 0`, `?? null`, `task?.`); all new options optional with defaults — every pre-existing call site works unchanged. |
| Best practices? | Yes | Fail-safe garbage handling everywhere (corrupt timestamps collapse to epoch → delay 0 / hide expired, never a park; future-dated clock-skew reference clamped to the curve; non-integer streaks read as 0). Backoff can only delay, never park; capped at 5min; re-checked every poll so no path can strand a task. Additive-only return shape (`{interrupted, interruptCount, escalated}` unchanged for non-capacity; capacity path adds fields) — old runners ignore extras, no runner rollout needed. |
| Unnecessary tech debt? | None found | No config/env/dependency/package.json changes; no frontend changes; no persistence migration (new streak fields are deliberately in-memory — verified they are absent from `taskPersistence.js`'s frontmatter allowlist, so `task.md` bytes unchanged and restart fails safe to the fast path). Queue display (`getScheduledQueue`) untouched, so backed-off work stays visible; queue-empty push re-check uses `ignoreBackoff:true` so no false "queue empty" page. |
| Docs updated? | Yes | `docs/EngineDetails/TaskQueueing.md` Rule-0 caveat documents the backoff + refusal hide; JSDoc updated (`MAX_RUNNER_INTERRUPTS`, `findResumedCandidate`, `findNextCandidateTask`, `scanClaimableTasks`, `autoResumeTask`); task-folder reports (IMPLEMENTATION_PLAN, STAGE-CLEANUP-VERIFY, UPGRADE-SAFETY-REVIEW, SURVEY) present. |

## Science experiment (assume it doesn't work — proof it does)

GUIDE-01 §3-equivalent repro (`/tmp/kb-repro/repro.mjs`, throwaway worktree of
`main` + this branch; repo working tree untouched), 5 interrupts with
`reason: "Runner workdir unavailable: Worktree cap reached (~5); …"` on one
task+stage:

| Tree | interruptCount | escalated | interruptEscalations | capacityRefusalCount | parked |
|---|---|---|---|---|---|
| `main` (base) | 5 | true | 1 | n/a | **runner-death-loop (bug reproduced)** |
| branch `kb/3b82f6ae` | 0 | false | 0 | 5 | resumable (`automated-stage`); `Reason:` still in history |

Pin on branch (via tests): 5 bare interrupts → count 5, escalated, parked — unchanged.

## Gates run in this stage (all green)

- Touched suites: 10 files, 111 tests passed (capInterruptLoop, priority, backoff,
  remainingMs, hide, streak, scanClaimableTasks, push, capacityRefusal, ledger).
- Full `npm run test:api`: **474 files, 7688 passed, 1 skipped, exit 0**.
- `npm run lint:api`: exit 0 (0 errors; warnings are repo-wide baseline).
- `node scripts/check-one-function-per-file.mjs`: PASS.
- `node scripts/check-jsdoc-example.mjs`: PASS.
- docs checks (`siteDocs docs.apiCoverage agentGuide docs.envCoverage`): 61 passed.

Not a UI feature — no screenshots applicable.

## Minor nits (non-blocking, recorded for the next cleanup)

1. `autoResumeTask.resumeStreak.test.js` last test is titled "durable across
   restarts", but the streak is intentionally in-memory only (frontmatter
   allowlist excludes it; restart fails safe to streak 1) — the test name
   contradicts the documented design; behavior is correct.
2. `completeExecution` clears the death/capacity/resume streak fields but not
   `lastCapacityRefusal`; harmless (the hide window is ~2min and only consulted
   for `in_stage` tasks in the fleet scan), just not fully symmetric.
3. GUIDE-07 §5 prod fleet re-count (`escalated` drops, `with_reason` stays visible
   on 350ca162 / db24c124 / 7b69d365) remains a post-deploy PROD-READ-ONLY step;
   local equivalent shows cap refusals keep the `Reason:` history row and write
   no `Runner deaths escalated` row.

KAINBAIN_VERDICT: PASS
