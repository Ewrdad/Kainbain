# Replicate & Test Guides — high level of task interruptions

Task `2e663986-aaf3-4afe-8dcf-3adad34acdb4` ("noticing a high level of
interruptions"). Companion to `WIDE_NET_ANALYSIS.md` (the wide-net cause
analysis). This folder turns each hypothesis from that analysis into a quick
guide: **how to recognise it, how to replicate or test it, and what is safe
to run versus what needs explicit permission first.**

Screenshot reference: `assets/image.png` — task `7f6220c3` showing repeated
"Auto-resumed after server restart — prioritised in queue" rows and inflated
"Tried N times" badges (Merge resolver x6, Quick review x6, Automated tests
x10, In Progress x11).

Scope note: this stage is **docs-only**. Every test below is a markdown
snippet for a follow-up code stage; no source or test files were added to the
repo. Run commands assume `node_modules` is installed (`npm install` in
`api/` and `frontend/`; runner tests need only Node's built-in runner).

## Safety tiers used in every guide

| Tier | Meaning | Examples |
|---|---|---|
| **SAFE-LOCAL** | Runs entirely on this machine against temp dirs, in-memory Fastify (`app.inject`), or mock stores. No prod data, no agents, no network beyond localhost. | Unit tests for the ledger, scheduler, runner workdir cap, git-hook failure, 413 body limit |
| **PROD-READ-ONLY** | Reads production state (backend API `192.168.1.206:3100`, runner journals on the backend host or server2, worktrees `kb-<taskId>`). No writes, but still prod access. | Fleet-wide history recount, journal greps, worktree forensics |
| **PROD-ACTION** | Anything that invokes a real agent stage, restarts a runner/backend, reaps worktrees, or mutates task state. | Re-running `7f6220c3`'s Merge resolver, restarting `local-alpha`, manual resume of parked tasks |

**Rule for this task:** SAFE-LOCAL guides may be run freely. Anything marked
PROD-READ-ONLY or PROD-ACTION is documented as a *procedure only* — **do not
execute it without explicit user permission**. Each such section is marked
`PROD-ONLY — DO NOT RUN WITHOUT EXPLICIT USER PERMISSION`.

## Verdict table (cause -> guide -> replicability)

| # | Cause (from WIDE_NET_ANALYSIS.md) | Guide | Verdict |
|---|---|---|---|
| 1 | Worktree-cap exhaustion loop (`WORKTREE_CAP_REACHED`, cap 5) | `GUIDE-01-worktree-cap-loop.md` | REPLICABLE-LOCALLY (runner `node:test` + api vitest) |
| 2 | HTTP 413 on `complete-execution` (payload > Fastify 1 MiB default) | `GUIDE-02-413-complete-payload.md` | REPLICABLE-LOCALLY (Fastify `inject`); real-task confirmation is PROD-READ-ONLY |
| 3 | local-alpha setup-phase deaths (bare, ~5 s, no `prompted`) | `GUIDE-03-local-alpha-setup-deaths.md` | PARTIAL locally (backend side simulatable); root cause PROD-READ-ONLY on the local-alpha host |
| 4 | Backend-unreachable / 502 crashing the daemon mid-run | `GUIDE-04-backend-unreachable-502.md` | REPLICABLE-LOCALLY (localhost mock backend returning 502 / dropping); window-joining is PROD-READ-ONLY |
| 5 | Stage-end commit/push failure crash loop (pre-commit hooks) | `GUIDE-05-commit-push-crash-loop.md` | REPLICABLE-LOCALLY (temp git repo + failing hook); real agent e2e is PROD-ACTION |
| 6 | Backend server restarts orphaning `running_*` tasks | `GUIDE-06-backend-restart-orphans.md` | REPLICABLE-LOCALLY (mock-store unit test of `reconcileInterruptedRuns`); fleet check PROD-READ-ONLY. Analysis: 0 occurrences observed — monitor only |
| A | Amplifier: Rule-0 instant re-dispatch, death counter counts cap refusals, "Tried N times" and the "after server restart" label | `GUIDE-07-amplifier-requeue-and-display.md` | REPLICABLE-LOCALLY (api + frontend unit tests) |
| T | Consolidated copy-paste test recipes and exact run commands | `TDD-TEST-EXAMPLES.md` | Reference |

## How to read a guide

Each guide has the same sections:

1. **Signature** — what the flake looks like in the UI / task history / journals.
2. **Replicability verdict** — one of REPLICABLE-LOCALLY / PARTIAL / PROD-ONLY.
3. **Safe local replication** — steps + a TDD-style test example (red test first,
   then the code path that should satisfy it).
4. **Prod-only verification** (if any) — the exact commands that *would* be
   run on prod, clearly flagged, not to be executed without explicit user
   permission.
5. **Evidence to collect** — what to save if the issue is reproduced.

## Test-run commands used throughout

```bash
# api unit tests (vitest), from repo root:
cd api && npx vitest run flow/executionLedger.test.js        # single file
npm run test:api                                            # whole api suite

# frontend unit tests (vitest):
cd frontend && npx vitest run src/components/tasks/taskFormatters.test.js

# runner unit tests (node:test, no deps beyond Node >= 20):
node --test runner/project.test.js
node --test runner/daemon.test.js
```

New test files for these guides are **not** added in this docs-only stage;
`TDD-TEST-EXAMPLES.md` says exactly where each snippet would live. Note the
repo gate pins every `runner/*.test.js` in `scripts/run-tests.mjs`
(`buildBranches`), so a new runner suite file must also be registered there
in the code stage.
