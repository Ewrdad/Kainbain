# Manual completion report — fc3acfff (markdown cleanup)

Executed manually (human-driven) per `IMPLEMENTATION_PLAN.md`, following the
survey answers in `SURVEY.md`. Commit: `77bda2d` on branch
`kb/d84ab136-27e0-475e-8241-c5d5421f07b5` ("docs: clean up and consolidate
root-level markdown files", 37 files changed, +237/-2148).

## Root markdown end-state (exactly the 5 standard files)

`README.md`, `agents.md`, `AGENTS-MAP.md`, `CHANGELOG.md`, `DEPRECATIONS.md`

## Moved (git mv, history preserved)

- `CI_SCRIPTS.md` → `docs/CI_SCRIPTS.md`
- `PORTABLE_DEPLOYMENT.md` → `docs/PORTABLE_DEPLOYMENT.md` (root copy was
  canonical: diff showed it supersedes the docs copy — GitHub clone URL,
  two-image compose, publish.sh, Scenario D, "Runner updates", state
  ownership; docs copy had no unique sections)
- `agent-docs/` → `docs/agent-docs/` (6 files)
- `research/phase0-branch-dry-run.md` → `docs/research/phase0-branch-dry-run.md`;
  empty `research/` removed

## Deleted (13 obsolete files)

`CHANGES_SUMMARY.md`, `CHECKLIST.md`, `FINAL_SUMMARY.md`,
`IMPLEMENTATION_SUMMARY.md`, `IMPLEMENTATION_VERIFICATION.md`,
`PR_REVIEW_SUMMARY.md`, `README_IMPLEMENTATION.md`, `REVIEW_SUMMARY.md`,
`STAGE_REVIEW_SUMMARY.md`, `STAGE_VERDICT.md`, `VERDICT_WP5.md`,
`phase2_plan.md`, `phase2_completion_plan.md`

## References repaired

- `agents.md` — `agent-docs/…` → `docs/agent-docs/…` (5 links)
- `scripts/lint-agents-md.sh` — vendored paths + FORWARD_R10 (plan missed
  this script in its expected-reference list; found via sweep)
- `docs/EngineDetails/UnifiedLogging.md` — backtick path
- `DEPRECATIONS.md` — `PORTABLE_DEPLOYMENT.md` → `docs/PORTABLE_DEPLOYMENT.md`
- `.github/workflows/runner-release.yml` — release-notes pointer
- backticked `PORTABLE_DEPLOYMENT.md` refs in `docs/MuseCodeHackathon2026/*`
  (excluded `docs/tasks/` and `docs/progress report/` as historical evidence)
- `.pi-lens.json` — ignore `agent-docs/**` → `docs/agent-docs/**`
- `docs/README.md` — index entries for the relocated guides
- `CHANGELOG.md` — one-line entry under Unreleased → Changed

## Verification

- Root md list == 5 standard files; all new locations exist; no stale refs to
  moved/deleted files outside `docs/tasks/` (baseline snapshot:
  `md-ref-baseline.txt`)
- `bash scripts/lint-agents-md.sh` — PASS (26 checks)
- `npm run docs:check` — PASS (37 tests; "All referenced file paths exist
  (59 doc files scanned)"; jsdoc baseline OK)
- `npm run test:api` — 6278 passed / 1 failed / 1 skipped. The single failure
  (`flow/integrationBusyFallsThrough.test.js > assigns a free merge slot…`)
  also fails at HEAD~1 (pre-existing, unrelated — commit touches 0 JS files;
  verified in a clean worktree of the parent).

## Left untouched (per q5)

`site-docs/`, in-folder `README.md`s, `skills/*/SKILL.md`, all of `docs/`,
and root non-markdown junk (`*.jsonl`, `*.tgz`) per non-goals.
