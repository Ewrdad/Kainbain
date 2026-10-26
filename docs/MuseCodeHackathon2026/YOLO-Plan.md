## Goal

Keep YOLO. It is not a shortcut to remove — for a headless, unattended orchestrator it is the only viable execution mode: a synchronous per-action approval prompt with no human present is a stall, not a safeguard (the engine already policy-cancels muse `userInput/request` for exactly this reason). The plan therefore does **not** add an approval UI as the fix. It formalises what KainBain already does — replace the vendor's per-action approval with KainBain-owned controls before, during, and after the run — into one named, tested, auditable policy, and closes the gaps where that replacement is currently implicit or missing.

Working name for the pitch and the UI: **Unattended Mode — auto-approve under KainBain controls**, never a naked `--yolo`.

## Success Criteria

- An unattended task still runs end-to-end with zero prompt stalls on every harness (muse, vibe, codex, antigravity, pi, opencode, custom, mock).
- Every agent run is labelled with its execution posture in the task report, process log, and `/status` — no run can be silently more privileged than the operator chose.
- Privilege can only be widened at one sanctioned construction site per harness (already true for muse/vibe/codex/antigravity; made true for `custom` and `pi`/`opencode`).
- A deliberately destructive test task (writes outside its worktree, touches a denied path, produces a secret-bearing diff) is stopped or quarantined by a KainBain control, with the intervention recorded in the stage report.
- Unattended runs cannot auto-merge/auto-push above their risk tier without a passing verdict/CI stage and, at the highest tier, a human stage.
- The pitch claim becomes provable in one demo: "the vendor asks permission; KainBain enforces policy."

## Approach

Swiss-cheese, four layers. No single layer is trusted; YOLO only removes the vendor's layer, the other four are KainBain's:

| Layer | Question it answers | Already in the codebase (verified) | Gap this plan closes |
|---|---|---|---|
| 1. Pre-flight | Should this run start, where, as what? | `--workspace`/workdir always pinned; `--yolo`/`--auto-approve`/`--dangerously-skip-permissions` built only from the resolved setting at one site per harness with `assertSafe*Args` guards (`musePermissions.js`, `vibePermissions.js`, `agyPermissions.js`, `codexHarness.js`); extra-args cannot smuggle the flag; child env is an allowlist with secret-shaped names dropped; schema config fails boot on malformed values (`api/config/schema.js`: `KAINBAIN_MUSE_YOLO`, `KAINBAIN_VIBE_AUTO_APPROVE`, `KAINBAIN_CODEX_YOLO`, all default `true`) | `custom` harness takes a free-text `project.harnessCommand` (its own doc example is `muse exec --yolo`) with no privilege guard; antigravity allow-rules are parsed but **logged-not-applied** (`parseAgyAllowRules`) |
| 2. Containment | What can it touch while running? | Git worktree/quarantine isolation (ADR 0006), `GitDirtyTreeError` clean-tree guard, fresh session per stage (no context rot), curated prompt per stage, per-stage timeout (30 min), process-tree kill | Agent runs as the host user with no denied-path or egress policy; worktree use is not yet a hard precondition for every agent stage |
| 3. In-flight guards | Is it behaving? | Tool-loop guard (3 strikes), transient retries (5), auto-iteration cap (8), MSP `approval/request` answered from a closed enum with default-deny on unusable shapes (`museMspSession.js handleHostRequest`), live log streaming | Guards react to failure patterns, not to *intent*: no denied-command/denied-path tripwire that aborts a run mid-flight |
| 4. Post-hoc verification | Did it do only what it claimed? | Verdict/review stages (`skills/stage-verdict`, `api/agent/verdictContract.test.js`), CI/script stages, human stages, timestamped markdown report + full transcript per stage in `docs/tasks/<id>/`, per-stage git auto-commit | A verdict stage is optional per workflow; nothing forces verification before unattended work is merged/pushed |

Key decisions:

1. **YOLO stays the default for unattended stages.** Rejected: making sandbox-on/approval-on the default — it deadlocks headless runs and reintroduces the chat-UI babysitting the product exists to kill. Rejected: per-action approval UI as the primary control — it only works when a human is watching, i.e. never in the 24/7 case.
2. **Policy is expressed as risk tiers, not booleans.** One shared `ExecutionPolicy` resolution (project → stage → task) replaces the current per-harness env booleans as the operator-facing surface; the env vars remain as deployment ceilings underneath it. Tiers: `T0` read-only/plan, `T1` write inside its worktree, `T2` commit/push its task branch, `T3` merge/deploy (never fully unattended — requires a human stage). Existing projects grandfather at `T1` (reversible assumption; see Open Questions).
3. **Fail closed, degrade honestly.** Unknown approval shapes already default-deny on MSP; extend that posture: a stage that cannot prove its containment (no worktree, unresolvable policy) does not run unattended — it parks for a human instead of running wide.
4. **Attended mode is asynchronous and tier-scoped, later.** If approvals ever appear, they are a queue (stage pauses, operator notified, run resumes) for `T3` only — never a synchronous prompt in a `T0–T2` unattended run.

## Steps

**Phase 0 — Name and expose the posture (no behaviour change).**
Add posture to run facts on every harness (extend the existing `runFacts` pattern in the muse/vibe/codex event mappers) so each stage report and the Logs tab state e.g. `posture=unattended tier=T1 harness=muse sandbox=off approvals=auto (KainBain controls)`. Surface the same in `/status` and as a board badge. Write the threat model as one site-doc page (`site-docs/`, alongside `review-gates.md`): what YOLO removes, the four layers above, what remains trusted (host user, operator config). Validation: existing harness contract tests plus report-rendering tests assert the posture line.

**Phase 1 — One policy spine.**
Introduce the shared tier resolver in `api/agent/` (harness-agnostic, like `harnessRegistry.js`); stage config gains an optional tier, project gains a ceiling, deployment env keeps veto via `api/config/schema.js`. Per-harness permission modules translate tier → their existing flags, keeping each `assertSafe*Args` single-site construction. Close the two Layer-1 gaps: run `custom` commands through a guarded-flags check equivalent to `assertSafeMuseArgs` (privilege flags in `harnessCommand` require the tier to allow them), and either wire antigravity allow-rules into scoped settings or delete the logged-not-applied path so the docs never claim a control that does not enforce. Validation: colocated unit tests per harness mirroring `musePermissions.test.js` (flag present ⇒ tier allows it; smuggled flag ⇒ throw); schema docs-coverage gate (`npm run docs:check`) stays green.

**Phase 2 — Containment as a precondition.**
Make a git worktree (or quarantine zone, ADR 0006) mandatory for `T1+` agent stages; add a denied-path list (`.env*`, credential dirs, the KainBain state folder of other projects) checked at dispatch and enforced by a pre-commit diff scan (gitleaks, already in `Security_scans.sh`) before any auto-commit lands. Validation: extend `gitWorkspaceIsolation.integration.test.js` with denied-path and cross-project cases; a canary task that writes outside its worktree must fail the stage, not the board.

**Phase 3 — In-flight tripwires.**
Feed the normalised agent event stream (`api/agent/sessionEvents.js`, `agentLogStreamer`) a small denied-pattern policy (destructive shell verbs, writes to denied paths, secret-shaped output) that aborts the run via the existing process-tree kill and records the trip in the stage report — distinct from the tool-loop guard, which counts failures, not intent. Keep patterns in schema-driven config, off-list additions logged like alias warnings. Validation: unit tests on synthetic event streams (hermetic, no credentials) + one mock-harness end-to-end abort.

**Phase 4 — Verification is the merge gate.**
For unattended tiers, require a passing verdict or CI stage before `T2` commit/push is honoured; use `--output-schema` for muse verdict stages where available so the verdict is machine-checked, not parsed prose. Failed verdict routes through the existing failback loop (cap already 8). Validation: `agentRunner.verdictFailOpen.test.js` extended so an absent/failed verdict blocks the push path; canary lifecycle test (`task-lifecycle.spec.js`) covers the happy path unchanged.

**Phase 5 — Recovery and kill story.**
One operator kill switch per run (existing abort/dispose + process-tree kill, surfaced in the Now Playing bar), automatic rollback to the pre-stage commit on tripwire abort, and quarantine of the task branch instead of deletion — the audit trail is the product. Validation: canary abort test; rollback asserted against a temp repo in integration tests.

**Phase 6 — Optional, post-hackathon: attended tier and runner isolation.**
Async approval queue for `T3` (muse `userInput/answer` wired only there); per-runner least-privilege identity when the runner paradigm lands (its risk register R04/R05 already names this). Neither gates Phases 0–5.

## Validation Plan

- Per-phase colocated tests as above; no phase merges with a red suite. Full gate before pitching: `npm test` (API + frontend), `npm run lint`, `npm run test:canary` against the mock harness.
- Black-box proof (the demo): (a) a normal task completes unattended start-to-finish; (b) the destructive test task from Success Criteria is tripped/quarantined live; (c) the stage report shows posture, trip, and verdict. If (b) cannot be shown, the claim is not made on stage.
- Regression guard: with policy at today's defaults, curated prompts and spawn argv are byte-identical to current behaviour (the prompt-curation contract tests already pin this pattern for skills; extend to posture).

## Risks / Open Questions

- **Deny-lists are bypassable** (obfuscation, indirect writes). They are one cheese slice, never the pitch's sole claim; the load-bearing layers are worktree containment + verdict gate + git audit. Stated plainly in the threat-model page.
- **False trips** could park legitimate work; tripwire aborts therefore quarantine-and-report rather than fail silently, and patterns start conservative (denied paths first, verbs second).
- **Open question (defaulted, reversible):** existing projects grandfather at `T1`. If you would rather grandfather at `T2` (today's effective commit behaviour), Phase 1 changes one default — decide before Phase 1, not during the pitch.
- **Scope risk:** Phases 2–3 touch `agentRunner` dispatch, the hottest path in the engine. They land behind the Phase 1 policy flag so each can be disabled per project without a deploy.
