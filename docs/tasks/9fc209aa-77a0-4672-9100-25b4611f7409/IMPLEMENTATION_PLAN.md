# Implementation Plan — Antigravity (agy) integration: verify against latest stable + stop silent passes

## Goal

Two things, per the task and SURVEY.md:

1. **Conformance**: prove the antigravity harness (`api/agent/harnesses/antigravity/`)
   spawns the `agy` CLI accurately against the **latest stable** Antigravity CLI
   (survey q4), not just against our own mock — today the wire format and flags are
   verified only against `fixtures/mock-agy.mjs` and documented shapes (the README
   itself records a live-conformance gap dated 2026-09-27).
2. **No silent skips**: a stage run on the antigravity harness must either do real
   work or fail loudly. Today an agy run that errors, crashes, or produces nothing
   can still report `passed` on the Runner path (survey q1/q2: "helper starts AND
   does real work on a test job"; "treat it as a failure so we notice it").

Survey q3 says check AND fix in this task; q5 wants proof: version-check results,
a real test job completed by the helper, and an honestly reported failure.

## Context and evidence

### How the integration works today

- Harness factory `createAntigravityHarness` (`api/agent/harnesses/antigravity/agyHarness.js`),
  registered as `"antigravity"` (Tier 2) in `api/agent/harnessRegistry.js:451`.
- Two transports, chosen by `selectAgyTransport` (`agyHarness.js:632`):
  - **exec** (default, `KAINBAIN_AGY_ACP=auto` with no `KAINBAIN_AGY_ACP_BIN`): one
    `agy -p <prompt> --output-format stream-json --print-timeout … [--sandbox]
    [--model …] [--effort …] [--conversation …] --dangerously-skip-permissions`
    process per `prompt()`; NDJSON parsed by `agyStreamParser.js`, mapped by
    `agyEventMapper.js`. argv built only in `agyPermissions.js#buildAgyArgs`.
  - **ACP session** (`KAINBAIN_AGY_ACP=on` or `KAINBAIN_AGY_ACP_BIN` set): long-lived
    JSON-RPC session over `agy acp` via the generic core in
    `api/agent/harnesses/acp/` + flavor in `agyAcpSupport.js`.
- Model discovery: `agy models` spawn in `agyModelCatalog.js` (15 s watchdog,
  TTL cache, classified failures `AGY_BIN_MISSING` / `AGY_MODELS_TIMEOUT` /
  `AGY_MODELS_AUTH` / `AGY_MODELS_FAILED` / `AGY_MODELS_UNPARSEABLE`).
- Runner side: `runner/daemon.js#defaultLoadHarness("antigravity")` imports the same
  factory; stages run through `runner/harness.js#runHarnessStage`; harness auto-detect
  probes `agy` on PATH (`HARNESS_DETECT_BINS.antigravity = ["agy"]`,
  `startRunner.sh:86`); `probeHarnessVersions` (`runner/daemon.js:416`) already runs
  `agy --version` once per boot into heartbeat facts.
- Run-failure taxonomy exists and is delivered as `run_error` events with
  `{code, message, hint}` (`agyRunErrors.js`): `AGY_BIN_MISSING`, `AGY_SPAWN_FAILED`,
  `AGY_RUN_TIMEOUT`, `AGY_AUTH_REQUIRED`, `AGY_CRASHED`.

### Finding 1 — the Runner path never fails a stage on `run_error` (the silent pass)

- Embedded path: `api/agentRunner.js:949` latches `event.type === "run_error"` into
  `sessionErrorOccurred`, and `api/agentRunner.js:1117` turns it into
  `failed: true, failureKind: "infrastructure"`. Honest.
- Runner path: `runner/daemon.js` `onEvent` (≈line 2250) latches ONLY `fail_stage`
  tool calls; a `run_error` is queued to the structured log sender
  (`runner/logEvents.js:247` flushes it) but nothing fails the stage.
  `session.prompt()` in the agy harness **never rejects** by design
  (`agyHarness.js: spawnAgyRun … never rejects`), so `runHarnessStage` returns
  `{ output: "" }`, `decideAgentStageVerdict` (`shared/stageVerdict/decideAgentStageVerdict.js`)
  sees no FAIL block and **passes open** → `client.complete({ outcome: "passed" })`.
  The backend double-check (`api/flow/execution/applyRunnerReport.js:156`) can only
  re-parse the output text ("the Runner owns the session events"), so it cannot
  catch this either. Net: agy missing / auth failure / crash / timeout on a Runner
  = stage passes with empty output. Exactly the reported symptom.

### Finding 2 — a clean-looking but empty agy run also passes

- If agy exits 0 with a `result` line of `status: "SUCCESS"` but an empty
  `response` and no `step_update` rows (e.g. a partial run — upstream v1.4.11+
  reports `finished_reason: "print_timeout"` with **exit code 0**), the mapper emits
  `run_finished`, `prompt()` resolves `""`, and the stage passes with zero work
  done. Nothing in the harness or runner distinguishes "did real work" from
  "did nothing" (survey q1).

### Finding 3 — conformance to the latest CLI is unverified

- `api/agent/harnesses/antigravity/README.md` records: "Live-conformance gap
  (2026-09-27): no machine with the `agy` CLI installed was available … verified
  against the mock + documented shapes only". Fixtures under `fixtures/*.ndjson`
  mirror `antigravity.google/docs/cli/headless` shapes and are marked
  re-capturable from a real run.
- External reference points (re-verify at implementation time; web data, current
  as of this writing): official repo `github.com/google-antigravity/antigravity-cli`,
  docs `antigravity.google/docs/cli`; releases seen up to ~v1.5.x; flags documented
  include `-p/--print/--prompt`, `--output-format text|json|stream-json`,
  `--print-timeout <dur>` (docs show `120s`/`15m` forms), `--sandbox`,
  `--dangerously-skip-permissions`, `--model`, `models` subcommand (since 1.0.5),
  `agy acp`, `agy changelog`/`agy update`; `--conversation <id>` resume exists;
  v1.4.11+ adds `finished_reason` (incl. `print_timeout`) to `--output-format json`
  results with exit code 0. `--effort` as a CLI flag is **not** clearly confirmed by
  current docs (effort is described as per-model settings) — must be verified
  against `agy --help` of the latest stable; the harness currently passes
  `--effort low|medium|high` (`agyPermissions.js#buildAgyArgs`).
- ACP: `resolveAgyAcpEndpoint` spawns `agy acp`; handshake is
  `buildAgyAcpHandshake()` (protocol version 1) in `agyAcpSupport.js`. Both the
  subcommand's existence and the protocol version must be re-checked against the
  latest CLI/ACP spec. `KAINBAIN_AGY_ACP=auto` (default) never probes, so the ACP
  path has likely never run against a real CLI either.

### Test/CI seams already in place (reuse, don't rebuild)

- `api/vitest.config.js` pins `KAINBAIN_AGY_BIN` to `fixtures/mock-agy.mjs` and
  `KAINBAIN_AGY_MODELS_TIMEOUT_MS=60s` so the api suite is hermetic without agy.
- Existing suites: `agyHarness.contract.test.js` (shared
  `runSessionContractTests`), `agyHarness.integration.test.js`,
  `agyHarness.acp.test.js`, `agyHarness.targetHandoff.test.js`,
  `agySpawnResolution.test.js`, plus per-module tests (`agyEventMapper`,
  `agyStreamParser`, `agyModelCatalog`, `agyPermissions`, `agyRunErrors`,
  `agyAcpSupport`), `runner/harness.test.js`, `runner/daemon.test.js`.
- New `runner/*.test.js` files must be listed explicitly in `scripts/run-tests.mjs`
  ("Unit Tests (runner)" suite) — prefer extending existing test files.
- Gates: `npm test` (root: api + frontend + runner suites), `npm run test:unit`
  (api + frontend), `npm run lint`, `npm run docs:check`. New `KAINBAIN_AGY_*` env
  vars must be added to `api/config/schema.js` AND `api/config/docs.envCoverage.test.js`.

## Survey mapping (SURVEY.md answers → requirements)

| Survey | Answer | Requirement in this plan |
| --- | --- | --- |
| q1 | Helper starts AND does real work on a test job | Phase 0 live probe + Phase 4 E2E test job; runtime empty-run detection (Phase 2.3) |
| q2 | Spawn-but-does-nothing = failure | Phase 2.1 latch `run_error` on the Runner; Phase 2.3 `AGY_EMPTY_RUN`; negative E2E in Phase 4 |
| q3 | Check it AND fix it | Whole plan; Phase 0 = check, Phases 1–3 = fix |
| q4 | Latest stable version | Phase 0.1 version matrix vs latest stable release; Phase 3 conformance script |
| q5 | Proof: version check results + honest failure + short summary | Validation plan table; artifacts recorded in this task folder |

## Approach (make change easy, then make the change)

1. **Phase 0 (research, first)**: on a host with the latest stable `agy`, capture
   ground truth — version, `--help` flag matrix, `models` output, a real
   `stream-json` run (incl. a `print_timeout` partial run), `agy acp` handshake —
   and diff every assumption the code makes. This de-risks everything; no code
   changes yet.
2. **Phase 1 (make change easy)**: add the *seams* with behavior unchanged and
   tests first — a shared session-error latch in `runHarnessStage`, an optional
   `sessionError` input to `decideAgentStageVerdict`, and an empty-run classifier
   in the agy session behind a test. Existing suites stay green untouched.
3. **Phase 2 (make the change)**: flip behavior — Runner fails stages on
   `run_error`; agy empty SUCCESS becomes `run_error AGY_EMPTY_RUN`; apply the
   Phase 0 wire/flag fixes (argv, parser tolerance, model-list parser, ACP
   handshake, partial-run mapping).
4. **Phase 3 (keep it conformant)**: a repeatable conformance script + refreshed
   fixtures so the next agy upgrade is a diff, not an investigation.
5. **Phase 4 (assurance)**: unit/contract/integration gates, live E2E test job on a
   Runner host (positive and negative), docs updates, summary artifacts in this
   task folder.

## Steps

### Phase 0 — Research: ground truth from the latest stable agy CLI

- [ ] 0.1 **Version matrix.** On a dev/Runner host (server2 if it has `agy`, else
  install latest stable from the official repo/installer): record `agy --version`,
  the latest stable release tag from `github.com/google-antigravity/antigravity-cli`
  releases (and `agy changelog` for breaking-change notes since the version our
  fixtures were captured against), and our harness's expectations. Output: a
  version matrix table saved in this task folder (`version-matrix.md`): installed
  vs latest stable, delta, and which of our flags/wire assumptions each version
  affects. Decision rule (q4): conform to latest stable; if the host runs older,
  record the minimum supported version and gate the harness on it.
- [ ] 0.2 **Flag matrix.** Diff `agy --help` (latest) against every argv element we
  construct in `agyPermissions.js#buildAgyArgs` plus `models` and `acp`
  subcommands: `-p/--print/--prompt`, `--output-format stream-json`,
  `--print-timeout` (accepts `10m`? docs show `120s` — verify duration grammar),
  `--sandbox`, `--dangerously-skip-permissions`, `--model`, `--effort`
  (verify it still exists and its value set; if renamed, e.g. thinking-effort
  setting, decide: keep `--effort` behind a version check or map to settings),
  `--conversation`. Record per-flag: present/renamed/removed + fix.
- [ ] 0.3 **Live wire capture.** In a scratch dir, run a real headless prompt
  (`agy -p "reply with exactly OK" --output-format stream-json
  --dangerously-skip-permissions`) and capture stdout NDJSON; also capture
  `agy models`; also force a partial run (`--print-timeout 1s` with a long prompt)
  and capture its exit code + result line / `finished_reason`. Diff row-by-row
  against `agyStreamParser.js` / `agyEventMapper.js` assumptions and
  `fixtures/*.ndjson`; list every drift (new fields, renamed fields, new statuses,
  `finished_reason` semantics, exit-0-partial behavior).
- [ ] 0.4 **ACP handshake check.** Run `agy acp` by hand (or via the mock contract)
  against the latest CLI: confirm the subcommand exists, the `initialize` protocol
  version we send (`buildAgyAcpHandshake`) is still accepted, `session/new`
  params (`buildAgyAcpSessionParams`) are still valid, and `requestPermission`
  shape matches `resolveAgyPermissionDecision`. Record the ACP protocol version
  supported by latest stable vs our pinned one.
- [ ] 0.5 **Auth/env behavior.** Confirm how the latest CLI authenticates
  headlessly (cached credentials after interactive login; any
  `AGY_ADC_AUTH`/CI env), and that our child-env allowlist
  (`buildAgyChildEnv`: PATH/HOME/locale/proxies + `AGY_*`/`GEMINI_*`/
  `ANTIGRAVITY_*`, secrets dropped) still suffices. Note any new env var the CLI
  needs.
- [ ] 0.6 **Decision log.** Write `phase0-findings.md` in this task folder: each
  finding classified as (a) no change, (b) parser/mapper tolerance fix, (c) argv
  fix, (d) new failure classification, (e) version gate. This is the input to
  Phase 2 — no code changes in Phase 0.

### Phase 1 — Make change easy: seams + tests first (no behavior change)

- [ ] 1.1 **Shared session-error latch in `runHarnessStage`** (`runner/harness.js`):
  while subscribed, latch the first `run_error` event
  (`{ error, code, hint }`); return it as `{ output, sessionError }` (additive
  field — existing callers/tests that read only `output` are unaffected) OR
  attach it to a thrown error like `failedOutcome` today. Pick one shape and
  document it in the MARK comment. Tests in `runner/harness.test.js`: a fake
  session that emits `run_error` then resolves `""` → `sessionError` is latched
  exactly once; a session with no error → `sessionError` null; existing cases
  unchanged.
- [ ] 1.2 **Optional `sessionError` input in `decideAgentStageVerdict`**
  (`shared/stageVerdict/decideAgentStageVerdict.js`): when present (agent stages
  only), return `{ failed: true, failureReason: "[Harness Run Error] …",
  failOpenWarning: null }` with precedence BELOW an explicit `fail_stage` call and
  ABOVE the fail-open text verdict. Old callers (embedded path, backend
  double-check) pass no `sessionError` and behave byte-identically. Unit tests:
  precedence order, reason formatting, non-agent stage + sessionError → still
  not failed by text rules (decide and document; expected: sessionError only
  applies where the engine actually ran a session, so keep it agent-stage-gated
  like the text verdict).
- [ ] 1.3 **Empty-run classifier seam in the agy session** (`agyHarness.js`): track
  per-run `sawToolEvent` / `deltaText` in `spawnAgyRun`; add
  `classifyAgyEmptyRun()` in `agyRunErrors.js` producing a new code
  `AGY_EMPTY_RUN` (`{ code, message, hint }` — message: agy exited SUCCESS with
  no response and no tool calls; hint: check auth/model/quota and re-run by hand).
  Behind a test seam (`deps.failOnEmptyRun`, default OFF in Phase 1) so behavior
  does not flip until Phase 2.3.
- [ ] 1.4 **Partial-run mapping seam**: extend the Phase 0.3 findings into a
  proposed mapping for exit-0 `finished_reason: "print_timeout"` (upstream v1.4.11+)
  — expected: treat as `run_error` with the existing `AGY_RUN_TIMEOUT`
  classification (message names both ceilings), never as SUCCESS. Parser-level:
  make `agyStreamParser`/`agyEventMapper` tolerate (ignore) `finished_reason` and
  any new result fields. Tests with new fixture rows; default behavior in
  Phase 1 unchanged.
- [ ] 1.5 Gate: `npm run test:unit` + `npm test` (root, incl. runner suite) green
  with zero behavior change; `npm run lint` green.

### Phase 2 — Make the change: honest failures + accurate spawn

- [ ] 2.1 **Runner fails stages on harness `run_error`**: in `runner/daemon.js`
  `onEvent`, latch `run_error` (same place `failStageRequest` is latched) and
  pass it through `runHarnessStage`'s new `sessionError` into
  `decideAgentStageVerdict({ stage, output, failStageRequest, sessionError })`;
  on failure complete with `outcome: "failed", failureKind: "infrastructure"`,
  `failureReason` naming the `[AGY_*]` code + hint — mirroring the embedded
  path's classification so reliability buckets agree. Tests in
  `runner/daemon.test.js`: run_error → failed/infrastructure; fail_stage still
  wins; PASS text + run_error → still failed (error is not a verdict); no
  run_error → unchanged.
- [ ] 2.2 **Apply Phase 0 wire/flag fixes**: update `buildAgyArgs`
  (`agyPermissions.js`) per the flag matrix (renamed/removed flags, duration
  grammar); keep the single sanctioned `--dangerously-skip-permissions`
  construction site and the `assertSafeAgyArgs` guard — extend the guard to any
  newly dangerous flag Phase 0.2 finds. Update `agyModelCatalog.js` parser for
  the live `agy models` shape; update `agyAcpSupport.js` handshake/params for the
  latest ACP protocol; update `agyEventMapper.js` status mapping (incl.
  partial-run status → `run_error`).
- [ ] 2.3 **Flip `failOnEmptyRun` ON** (default) in the agy exec session: a
  `result` with `status: "SUCCESS"`, empty `response`, empty accumulated deltas,
  and zero tool events now delivers `run_error [AGY_EMPTY_RUN]` instead of
  `run_finished` — scoped to stage runs (fresh sessions); keep `INTERRUPTED`/
  `CANCELED` and engine-initiated `abort()` graceful. Same classification for
  the ACP path via `AcpSessionWrapper` if its prompt resolves with no content and
  no tool calls. Update `agyHarness.contract.test.js` /
  `agyHarness.integration.test.js` expectations.
- [ ] 2.4 **Transport decision**: based on Phase 0.4, either enable
  `KAINBAIN_AGY_ACP=auto` to engage ACP when `agy acp --help` exists (probe once at
  harness init, cached — same philosophy as `auto` today: never speculative per
  stage), or keep exec-default and document why. ACP startup failures already
  classify to `run_error`, which now actually fails the stage via 2.1.
- [ ] 2.5 **Version gate (optional, from 0.1)**: if the flag matrix shows a hard
  minimum, add a boot-time `agy --version` comparison in the harness (reuse the
  runner's `probeHarnessVersions` result or a harness-level probe) that logs a
  loud `[AGY]` warning (or fails runs with a typed code) when the installed CLI
  predates the minimum. New env var only if operator-tunable — add to
  `api/config/schema.js` + `docs.envCoverage.test.js`.
- [ ] 2.6 Gate: `npm test`, `npm run test:unit`, `npm run lint` green; all agy
  contract/integration suites updated and passing.

### Phase 3 — Keep it conformant: repeatable conformance check + refreshed fixtures

- [ ] 3.1 New `scripts/agy-conformance.mjs` (repo script, opt-in, requires agy on
  PATH or `KAINBAIN_AGY_BIN`): runs the Phase 0 probes (version, `--help` flag
  matrix, `models`, one canned stream-json run, one forced print-timeout partial
  run, `acp` handshake), writes raw captures to a given output dir, and diffs
  parsed results against the code's expectations (imports `agyStreamParser`,
  `agyEventMapper`, `parseAgyModelsOutput`, `buildAgyArgs`), exiting non-zero on
  drift with a per-item report. Register in `scripts/run-tests.mjs` ONLY if it is
  a test; otherwise document as a manual check in the README.
- [ ] 3.2 Re-capture `api/agent/harnesses/antigravity/fixtures/*.ndjson` from the
  live latest-stable run (Phase 0.3) and extend `mock-agy.mjs` to emit the new
  wire shape (tolerate-and-echo new fields) so the whole suite runs against the
  current protocol.
- [ ] 3.3 Gate: `npm test` green with refreshed fixtures; conformance script run
  once against the host agy with its report saved in this task folder.

### Phase 4 — Assurance: tests, E2E proof, docs

- [ ] 4.1 **Unit/contract/integration** (primary gate): `npm run test:unit`,
  `npm test` (runner suite included — remember `scripts/run-tests.mjs` explicit
  file list if any new `runner/*.test.js` appears; prefer extending existing
  files), `npm run lint`. Cover: run_error latch precedence, AGY_EMPTY_RUN,
  partial-run mapping, flag changes, models-parse changes, ACP handshake changes.
- [ ] 4.2 **Live E2E positive (survey q1/q5)**: on a Runner host with latest
  stable agy installed and authenticated, run a real small agent stage through
  the antigravity harness (e.g. "add a file `docs/tasks/<id>/agy-e2e.txt` with
  content X and end with KAINBAIN_VERDICT: PASS"). Assert: stage passes, the
  commit/push contains the file, the transcript shows `run_started` + tool events
  + non-empty output + `run_finished`, `[AGY] spawn` log line names
  model/sandbox/approvals. Record commands + output in this task folder
  (`e2e-positive.md`).
- [ ] 4.3 **Live E2E negative (survey q2/q5)**: same host, point
  `KAINBAIN_AGY_BIN` at a wrapper that exits 1 with an auth-shaped stderr (or
  simply at `/nonexistent`), re-run the stage. Assert: stage reports **failed**
  (not passed) with `failureKind: "infrastructure"` and the `[AGY_*]` code in
  `failureReason`; and a second variant where agy exits 0 with SUCCESS-but-empty
  output (mock mode) asserts `AGY_EMPTY_RUN` failure. Record in
  `e2e-negative.md`.
- [ ] 4.4 **Version-check evidence (survey q4/q5)**: save the Phase 0.1 version
  matrix + conformance-script report in this task folder; the summary references
  them.
- [ ] 4.5 **Docs**: update `api/agent/harnesses/antigravity/README.md` (remove the
  2026-09-27 live-conformance gap note once closed; new taxonomy rows
  `AGY_EMPTY_RUN` + partial-run mapping; version matrix + minimum supported
  version; transport-selection note), `agents.md` (antigravity paragraph), any
  env-var docs (`api/config/schema.js` docs + `docs.envCoverage.test.js`),
  `CHANGELOG.md` entry. Keep `SURVEY.md` untouched (survey record). Run
  `npm run docs:check`.
- [ ] 4.6 Final gate: `npm test`, `npm run lint`, `npm run docs:check` all green;
  short written summary posted as the stage output referencing the artifacts.

## Validation plan (maps to phases and survey q5 proof)

| Phase | Check | Expected evidence |
| --- | --- | --- |
| 0 | probes on a host with latest stable agy | `version-matrix.md`, `phase0-findings.md` in this task folder |
| 1 | `npm run test:unit` + `npm test` | green, zero behavior change; new seam tests pass |
| 2 | `npm test` + `npm run lint` | green; daemon fails on run_error; AGY_EMPTY_RUN fires; flag/wire fixes covered |
| 3 | conformance script + refreshed fixtures; `npm test` | non-zero exit on injected drift; fixtures match live wire; suite green |
| 4 | unit gates + live E2E positive/negative + `docs:check` | `e2e-positive.md` (real work committed by agy), `e2e-negative.md` (honest FAIL), version evidence, docs gate green |

## Risks and mitigations

- **No host with agy installed** (the 2026-09-27 gap repeats) → Phase 0 installs
  latest stable on server2/a dev box via the official installer; if that is
  impossible, ship Phases 1–2 (silent-pass fixes, mock-verified) and mark the
  live conformance items as blocked with the exact commands for whoever has a
  host. Do not claim live conformance without a live run.
- **Latest CLI renamed/removed flags** (esp. `--effort`) → Phase 0.2 decides per
  flag; keep old flags behind a version check rather than silently dropping
  effort control; reasoningLevels stay `low|medium|high` unless upstream changed
  the set.
- **Exit-0 partial runs (`finished_reason: print_timeout`)** could be mistaken for
  success → explicit mapping to `run_error` in Phase 2; fixture captured in 0.3.
- **fail-closed regression risk**: latching `run_error` could fail stages that
  previously "worked" via pass-open. That is the intended behavior (q2), but
  scope it to agent stages only and keep `integrate`/`ci` paths untouched (they
  return before the verdict check already).
- **ACP enablement surprises** → keep `auto` = exec unless `agy acp` is verified
  in 0.4; ACP startup failures already classify to run_error, which now fails
  honestly instead of passing.
- **Test-suite hermeticity** → `api/vitest.config.js` pins `KAINBAIN_AGY_BIN` to
  the mock; any new live-spawning test must be opt-in/excluded there.
- **Shared verdict contract drift** → `decideAgentStageVerdict` changes are
  additive (optional input); embedded path and backend double-check byte-identical
  unless they pass the new input.

## Non-goals

- Reworking the ACP generic core (`api/agent/harnesses/acp/`) beyond the
  antigravity flavor fixes Phase 0 finds.
- Changing the fail-open TEXT verdict policy (reasonless FAIL still passes with a
  warning) — that is deliberate engine-wide policy; only engine-level `run_error`
  / empty-run signals become hard failures.
- Sandbox/permission policy changes (YOLO default stays; `KAINBAIN_AGY_ALLOW`
  stays validated-not-applied until scoped agy settings are verified).
- Frontend model-picker changes (discovery-error surfacing already exists).
- Touching `SURVEY.md` (survey record) or other tasks' folders.

## Open questions

- Q1: which host runs the Phase 0/4 live probes (server2 if `agy` is present or
  installable; else a dev box)? Default: server2 via the server2-ssh skill,
  installing latest stable if absent.
- Q2: if latest stable renamed `--effort`, do we keep effort control via a
  settings file write (rejected by policy) or drop to per-model default and warn?
  Default assumed: version-gated flag, warn when absent.
- Q3: should `KAINBAIN_AGY_ACP=auto` auto-engage ACP once `agy acp` is verified, or
  stay exec-default until operators opt in? Default assumed: stay exec-default
  (zero behavior change for existing deployments); document `on` for operators.
- Q4: minimum supported agy version to gate on (from the 0.1 matrix) — default:
  gate only if a hard breaking change is found; otherwise warn-only.
