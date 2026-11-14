# Follow-on tickets — structural review of 0f0213b7 (2026-11-14)

Source ticket: `0f0213b7-25f6-4930-8470-a73dc0611529` (dependency-manifest guardrail).
Case study: `5a38ad45-74a6-4d00-b6fd-a1796e5f4f1f` (undeclared `import("mermaid")` cascade).

## History reviewed

- `SURVEY.md`, `IMPLEMENTATION_PLAN.md`, `implementation-report.md`,
  `review-guardrail-20261114.md`, `install-safety-review-20261114.md`,
  `automated-test-2-failure-20261114-201542.md`, `final-review-20261114-224606.md`.
- Guardrail work itself went well: 41/41 scanner tests, fixture proof
  (~0.4 s check vs 30 s+ build / 56 s depcheck / 1500 s canary), correct
  gate ordering, docs updated. No agent struggle there.

## Difficult / failed areas found

1. **Scope narrowed by default, not by decision.** Survey answers landed at
   20:11, after the 19:11 implementation followed the plan's frontend-only
   default; the late survey chose "Whole project". Ticket text ("at least
   the frontend") saved it, but api/root coverage was left as an unwired
   `--package` flag with no follow-up.
2. **Unrelated host-env flake blocked the only full-CI signal.**
   `KAINBAIN_RUNNER_INSTALL_ROOT` leaked from the CI host into test
   children, failing 3 Harness Self-Tests; fixed test-only as a drive-by.
3. **No structural prevention for lockfile-vs-manifest drift** (plan §9
   follow-up, never ticketed).

## Dedupe check

Listed all 32 tasks in project `0fd41821` / `wf-default`. Open tasks
(`6ba7e727`, `8c7e2d15`, `b1c069e0`) cover unrelated dispatch/catalogue/
artifact work. No open ticket covers the three findings below.

## Tickets created (all `execute:false`, stage `1`, verified via re-read)

| Ticket | Title |
| --- | --- |
| `409a68a4-f933-48cf-85f4-da773f13f3e3` | Extend imports-declared guardrail to api and root packages |
| `b6b32117-37c2-4395-984f-7ffc224054e1` | Isolate runner host env vars from test child processes |
| `73f23a38-e929-4e96-a20e-f38b19243089` | Gate implementation on answered requirement survey to prevent scope drift |

Each ticket body references source ticket `0f0213b7-25f6-4930-8470-a73dc0611529`
for case-study lookup and stands alone otherwise.
