<!-- KAINBAIN PR-REVIEW REPORT (docs-only stage) -->
# PR Review (reconciled tree): Surface runner commit/hook failures in the task UI

**Task:** `1cae113f-43ab-4613-801b-2de6297637fd` · **Branch:** `kb/1cae113f-43ab-4613-801b-2de6297637fd`
**Checked-out HEAD:** `b3f38f5f` · **Main tip at review:** `64e428e6` (merge `bb996858` + reconcile `d6fa0c44` already on branch)
**Scope:** 72 files vs `origin/main`, all feature-scoped (no `package.json`/lockfile/manifest/env changes).
**Method:** treated as an experiment — assumed it does not work, hunted for proof at each layer on the
current checkout: re-ran every touched suite, probed the shared parser directly, traced the daemon catch
coverage, dry-ran the merge, and rendered the real UI component to pixels.

## Verdict: suitable to integrate

The deep-review FAIL (`deep-review-failure-20261121-082957.md`) and merge FAIL (`merge-failure-20261121-082214.md`)
are both resolved on this tree: the branch merged `origin/main` and reconciled with `db49d6c6` by composition
(main's `--no-verify` recovery snapshots + dispatch-loop containment kept; this branch's structured surfacing
kept for the paths where hooks still run). `git merge-tree` against current `origin/main` reports **0 conflict
markers**. Every goal below is proven with fresh evidence from this session.

## Goal 1 — Runner captures structured failure detail: PROVEN

- `toRunnerGitError` (`runner/project.js:215`) classifies every commit/merge failure (except `--abort`) through
  the real `parseHookFailure` + `buildGitFailureDetails` contract; `readGitSubcommand` skips `-c` pairs so the
  incident's identity-prefixed commit parses as `commit`. Hook rejections become `git-hook-rejected` with the
  envelope; hook-less commits keep `git-failed` and gain `exitCode` + envelope.
- Coverage across all phases: `gitPhase` starts `worktree-setup` (`runner/daemon.js:1968`, before
  `prepareWorkdir`), flips to `stage-commit` (`:2223`, before `commitAndPush`), and the merge path tags `merge`
  (`:2672`) — all inside the `executeAssignment` try whose catch (`:2296`) holds the report-and-return branch
  (`:2316`). Recovery commits bypass hooks via `commitRecoverySnapshot` (`runner/project.js:513`, warn-logged),
  so the `recovery` phase is retained for wire compat with no producer (old runners still send it; backend/UI
  still accept it).
- Direct proof (this session, real modules, incident-shaped stderr): kind `hook-rejected`, hook `pre-commit`,
  phase `stage-commit`, exit 1, files `[a.png, b.png, c.png]`, `isDeterministicGitFailure → true`, summary
  `Commit blocked by pre-commit hook: 3 corrupt files: a.png, b.png, c.png`, concrete re-capture remedy;
  foreign hook degrades to `hook-rejected/unknown/[]`, hook-less output to `commit-failed`.
- Crash loop dead two ways: deterministic failures report `complete-failed` and `return` (never rethrow),
  composed with main's dispatch-loop containment (`assignmentResult` + try/catch, `:3092-3153`) and the
  one-poll-cycle backoff (`:3164-3172`). Runner suite: **246/246 pass**, incl. bypass-and-park recovery replay
  (residue lands on `kb-recovery/*`, stage completes normally), stage-commit/merge replays, N-failures→N-reports
  loop-dead proofs, and the narrowed `--no-verify`-only-in-`commitRecoverySnapshot` scope-guard test.

## Goal 2 — Backend records the failure (no stale error): PROVEN

- `complete({ outcome: "failed", failureKind: "commit-failed", gitFailure })` flows through the existing failure
  pipeline: route sanitizes via `sanitizeGitFailure` (malformed → warn-and-drop, never 400),
  `applyRunnerReport` attaches `err.gitDiagnostics` and leads `err.stdout` with hook output, so `lastError`
  (stale reason replaced), timeline `Failed` row, history, `[ERROR]` log, `-failure-` report, and `process:exit`
  all carry the detail — asserted by committed tests replaying the incident literally (stale
  `"Cant see settings in the Ui"` replaced).
- Classification `logical/commit-failed`, non-retryable → failback (explicit tag beats text heuristics);
  `gitFailureStreak` (signature-keyed, 3 strikes → park) enforced in the single dispatch gate
  `isSchedulerRunnable` plus `409 GIT_FAILURE_PARKED` direct-claim refusal; streak persisted in task markdown,
  cleared on success advance / operator retry / resume / move. Old-runner payloads take the identical path as
  before. API touched set via project entry: **349/349 pass** (12 files).

## Goal 3 — UI renders commit/hook failures clearly: PROVEN (pixels this time)

- `GitFailureDetails.jsx` (title, mono command + exit + phase, affected-files list, remedy, capped hook output
  with Show full output/less) mounts under `FailureMessage` in both `TaskDetailPageContent.jsx` and
  `TaskDetailsTabContent.jsx`; banner heading switches to `⚠️ Commit Failed` via shared `pickFailureBannerTitle`;
  `TaskCard.jsx` gets a distinct label; timeline rows show the file list. Shape-gated (`isCommitFailureTask`), so
  backend `merge-conflict`/`sync-blocked` shapes keep plain-text rendering — pinned by "keeps the generic banner"
  tests in both views. Frontend touched set: **154/154 pass** (6 files).
- Pixel proof: `review-callout-20261121.png` (same folder, PNG magic `89504e47` verified) renders the **real**
  `GitFailureDetails` component (JSX transformed, not re-implemented) with the **real** parser-built incident
  envelope and the **production** CSS bundle: `⚠️ COMMIT FAILED` heading, one-line summary, hook title, command +
  exit + phase, 3 affected files, How-to-fix remedy, and capped hook output with `Show full output`. Honest scope
  note: the banner frame replicates `TaskDetailsTabContent`'s classes around the SSR'd component (file:// page, no
  app server per guidance) — mounting inside both real banners is proven by the passing render tests, not by this
  capture. No servers were started; `:3100` is unserved (blank probe, removed).

## Plan compliance, standards, debt, docs

- Follows `IMPLEMENTATION_PLAN.md` as reconciled (reconciliation record + amended Decision 5 / q6 row / Steps
  12+15 / Success Criterion 1 / Non-goals): incident-replay-first, contract-first, scoped-bypass-only, wire-compat
  rules. No new runner test files, so no `run-tests.mjs` registration was needed.
- Code standards: MARK/JSDoc with runnable `@example`s; `check-one-function-per-file` PASS (880 scanned),
  `check-jsdoc-example` PASS, `check-doc-links` PASS; `eslint` 0 errors on both api and frontend (warnings only,
  pre-existing). No unrelated edits.
- Tech debt: negligible. Nits (non-blocking): redundant `kind` key in one spread (`applyRunnerReport.js:198`,
  spread overwrites the same value); arrow-const helpers used to satisfy the one-function gate (documented in
  comments). No new status, no systemd change, no schema migration; additive wire field only.
- Docs updated: ADR 0017 (with reconciliation note), runbook section in `docs/git-runner-coordination-spike.md`,
  CHANGELOG entry, pre-commit header pointer, `_PROOF_RULE.md` runner note — all describe the reconciled behavior.
- Human-awareness note (not a fail, carried forward): survey answers post-date the plan. q2/q4/q5 honored exactly;
  q1 (parking, no new status), q3 (commit/hook/merge now, push/auth reserved kinds), and q6 (scoped recovery
  bypass, no blanket auto-retry) are deliberate overrides/middle ground, each recorded in the plan and ADR 0017
  with rationale — and q6's middle ground matches what merged main already ships. ADR 0017 requests human
  confirmation of the q6 middle ground at merge review; that gate is the right place, not another rework loop.

## Test evidence (this session, current checkout)

- Runner: `node --test runner/project.test.js runner/gitOps.test.js runner/client.test.js` → 80/80;
  `node --test runner/daemon.test.js` → 166/166.
- API: `npm run test:api -- <12 touched files>` → 349/349.
- Frontend: `npm run test:frontend -- <6 touched files>` → 154/154.
- Gates: one-function PASS, jsdoc-example PASS, doc-links PASS, eslint 0 errors (api + frontend).
- Merge: `git merge-tree $(merge-base) HEAD origin/main` → 0 `<<<<<<<` markers.
- Live ops untouched: read-only inspection + isolated unit/headless runs on scratch paths only; no background
  servers, no :3100 service present.
