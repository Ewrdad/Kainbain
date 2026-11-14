# IMPLEMENTATION_PLAN — WP-F: Roll out catalogue fix to live runners and purge test entries

Task: `8c7e2d15-3f17-41a1-b905-99ca5e536c83` · Parent bug: `b3401f19-2897-4049-aa3c-227bcee46a4c`
Source: `docs/tasks/b3401f19-2897-4049-aa3c-227bcee46a4c/RESPONSE.md` WP-F runbook (§4) + §6 end-to-end verification, `RESPONSE_SURVEY.md` q23/q24, `TICKETS.md` sequencing.
Survey input: this task's `SURVEY.md` (round 1, q1–q6, answers unrecorded at plan time — Recommended options adopted as assumptions, see §Survey mapping) + parent `RESPONSE_SURVEY.md` rounds 1–2.
Plan type: rollout / migration (ops runbook + live-state cleanup + verification). No product code changes; docs and operator handoffs only.

## Goal

Bring the live fleet onto the fixed catalogue stack (WP-A + WP-B + WP-C deployed, WP-E merged) and purge test pollution from live engine state, leaving zero `test-fleet` entries and a catalogue that satisfies RESPONSE.md §6 — without the agent ever touching a running task runner itself.

## Success Criteria

1. Gates honoured: WP-A, WP-B, WP-C merged and deployed (backend image rebuilt to a recorded commit), WP-E merged; WP-D status recorded (preferred, not blocking); explicit human permission recorded before any live-state step.
2. Agent performed only pre-approved live actions: read-only checks + DELETE of test/dummy catalogue entries via the WP-C admin route. All runner reinstall / env-edit / restart steps were executed by the human operator from agent-provided instructions (never by the agent).
3. RESPONSE.md §6 passes end to end: §3.1 shows `discovered`/`pinned+discovered` + per-harness `ok:true`, `versions.build.sha` matches deployed commit, `codeChangedSinceBoot: false`; §3.2 shows no `bare`/`provider` entries, no `test-fleet-model`, every entry `harnesses.length === 1`; UI checks pass; regression check passes; named `npm test` suites pass; WP-E guard proves no suite touched `~/.kainbain/engine`.
4. Live state contains zero `test-fleet` entries: `muse::meta::test-fleet-model` gone from `fleet-catalog.json`; revoked runner `test-fleet-muse` left revoked (per survey default) or deleted only on explicit operator say-so.
5. Execution evidence is recorded in this task's docs folder (gate record, operator handoff receipts, verification log) so WP-G can be decision-gated on it.

## Approach

"Make change easy, then make the change": the agent does all of the safe, reversible preparation itself (Phases 0–1: gate checks, read-only rehearsal, exact operator commands, backups, dry-run verification scripts), then hands precisely two execution bundles to the operator (Phases 2–3: reinstall/env/restart — recommended, never executed by the agent), then performs only the pre-approved purge itself (Phase 4), then verifies everything against §6 (Phase 5) and records the evidence WP-G needs (Phase 6).

Big/risky items come first: permission + gate verification and the self-kill-safe restart sequencing are resolved before any live state is touched; the irreversible DELETE comes only after WP-E-merged is proven (no re-pollution) and backups exist.

### Survey mapping (binding constraints)

Parent survey (`RESPONSE_SURVEY.md`):

- q23: user pre-approved ONLY "Removing test or dummy catalogue entries". Note: "restarting local runners … would likely cause task agents to kill themselves so maybe not but maybe recommend to user to do" → agent RECOMMENDS restarts, never executes them.
- q24: overall structural approach approved.
- Carried context: q1 keep 0-runner entries indefinitely + "Remove permanently" action; q3/q4 unverified = 0 runners, selectable but marked; q7 block non-canonical ids; q8 harness-qualified ids; q15 warn-only on version mismatch (block only on real incompatibility).

This task's `SURVEY.md` (q1–q6, no answers recorded — plan adopts each Recommended option as an assumption; the operator confirms at the Phase 0 gate):

| # | Question | Adopted (Recommended) |
|---|---|---|
| q1 | Agent restarting runners? | Agent suggests, operator executes |
| q2 | Cleanup timing? | As soon as WP-A/B/C deployed + WP-E merged |
| q3 | What to delete? | Only test/dummy entries |
| q4 | Revoked `test-fleet-muse` runner? | Leave revoked, kept for audit |
| q5 | `KAINBAIN_RUNNER_MODELS` pin list? | Remove it; discovery is source of truth |
| q6 | On any failed check? | Stop immediately and report |

If the operator overrides any q1–q6 answer at the gate, update this section and re-scope Phases 2–4 before proceeding.

## Steps

### Phase 0 — Gates, permission, baseline (agent, read-only). Do first.

1. Verify blockers: confirm WP-A (`ae1ae677…`), WP-B (`77a4072e…`), WP-C (`94ee5786…`) are merged AND the backend image was rebuilt after them (record deployed commit SHA + image tag); confirm WP-E (`99ccc12f…`) merged; record WP-D (`4ec027a7…`) status (preferred, not blocking). Source of truth: task tracker states + deploy log, not memory.
2. Obtain and record explicit human permission for the live-state steps (Phase 4 purge + Phase 5 live reads). Minimum record: who, when, exact scope ("DELETE `muse::meta::test-fleet-model` + read-only §3/§6 checks; runner restarts by operator only"). No permission → stop here.
3. Confirm the q1–q6 assumptions above with the operator (one message listing the six adopted defaults + asking for corrections). Record answers.
4. Baseline snapshot (read-only): run RESPONSE.md §3.1–§3.4 verbatim; save outputs to `docs/tasks/8c7e2d15-3f17-41a1-b905-99ca5e536c83/baseline-<date>.md`. Also copy (never move) live state to timestamped backups: `~/.kainbain/engine/runners.json`, `~/.kainbain/engine/fleet-catalog.json` → operator-owned backup dir; record paths + shasum. Backups are the rollback path for Phase 4.
5. Inventory runners: list every `local-*` runner, its service definition / launch script, its env file (`~/.kainbain/runner-local-*.env`), and `server2-alpha`'s install location + pi-leg state. Record which installs run from the engine checkout (the N1 failure: RESPONSE.md §2.2 N1, `daemon.js` replaced 4 s after boot) vs a dedicated dir.

Gate: all of Phase 0 recorded. Any gate fail (blocker unmerged, no permission, WP-E not merged) → stop, report, do not proceed.

### Phase 1 — Make the change easy (agent, no live state). Do second.

6. Rehearse §3 read-only checks end to end and confirm they reproduce the "before" picture (§3.1 `pinned` + `{}`, §3.2 bare/provider + `test-fleet-model`, §3.3 checkout cwd + missing `harnessModelDiscovery.js`, §3.4 isolation gap closed post-WP-E). Fix any stale paths (RESPONSE.md used `/home/server/...`; this host's engine state is under `/home/server2/.kainbain/engine` — verify and use the real path).
7. Draft the exact operator command bundles (Phase 2–3 handoff doc): reinstall-from-bundle commands per runner (`runner/updates` mechanism / `scripts/package-runner.mjs` + `scripts/install-local-runner.sh` paths verified against the deployed tree), target dirs (`~/.kainbain/runner-install/<runnerId>/`), service-definition edits for `local-alpha`/`local-bravo`/any `local-*`, env-file edits (REMOVE `KAINBAIN_RUNNER_MODELS` per q5 default; fallback: trim to harness-qualified ids only), `server2-alpha` pi-leg reinstall + `MUSE_MSP_MODELS_EMPTY` provider-config check. Each bundle: purpose, exact commands, expected output, rollback (prior install path / env backup).
8. Design the self-kill-safe restart sequence and put it in the handoff doc: operator picks a quiescent window (no active task agents on the runner being restarted), restarts ONE runner at a time, confirms re-registration + healthy `discoveryStatus` before the next. Never restart all runners at once; never restart the runner executing this task's agent from inside that agent (this is why the agent never runs these commands itself — q23 note).
9. Dry-run the Phase 4 purge + Phase 5 checks against fixtures (not live): exercise `DELETE /runners/models/catalogue/:id` semantics (204/404) and the §6 assertions against a temp copy of the catalogue / `createFleetModelSnapshotStore({filePath: null})` output. Prepare the literal §6 checklist commands (Phase 5) so execution is mechanical.
10. Write the operator handoff document to this task's docs folder (`operator-handoff-<date>.md`): the Phase 2–3 bundles, the restart sequence, what to report back (per-runner: new `versions.build.sha`, `discoveryStatus`, `modelSource`), and the explicit statement that the agent will not execute these steps.

Gate: handoff doc reviewed. Operator acknowledges receipt before Phase 2.

### Phase 2 — Runner reinstall + config (OPERATOR executes, agent only wrote the instructions)

11. Operator installs each `local-*` runner from the post-WP-B RUNNER BUNDLE into its dedicated directory (never from the engine checkout `…/runner-work/…/runner`), updates service definitions/launch scripts, and edits each `~/.kainbain/runner-local-*.env` (remove `KAINBAIN_RUNNER_MODELS` recommended).
12. Operator reinstalls `server2-alpha` from the post-WP-B bundle so the pi leg dependency (`@earendil-works/pi-coding-agent`) resolves, and checks the Muse MSP provider config (`MUSE_MSP_MODELS_EMPTY`).
13. Operator reports back per-runner: install path, bundle version, env diff. Agent records the receipt; agent runs NO commands on the runners.

### Phase 3 — Restart + rediscovery (OPERATOR executes, agent only wrote the instructions)

14. Operator restarts runners ONE at a time in a quiescent window per the Phase 1 sequence, then triggers `requestModelRediscovery` from Settings.
15. Operator reports back per-runner: `modelSource`, `discoveryStatus` (expect a key per configured harness, `ok:true` or a named error code, never `{}`), `versions.build.sha` vs deployed commit, `codeChangedSinceBoot`. Agent records the receipt. If any runner reports `LEG_MODULE_MISSING` / `NOT_YET_RUN` / stale code → stop, diagnose with operator, do not proceed to purge (per q6 stop-immediately).

### Phase 4 — Purge test pollution (agent, pre-approved scope only)

Preconditions (re-check immediately before): Phase 0 permission on file, WP-E merged (no re-pollution), backups from step 4 exist, Phase 3 receipts show healthy discovery.

16. DELETE `muse::meta::test-fleet-model` via the WP-C admin route (`DELETE /runners/models/catalogue/:id`, URL-encoded id; expect 204). Confirm absence in a fresh `GET /runners/models/catalogue` (and in `fleet-catalog.json`).
17. Quarantine: quarantined bare/provider ids — remove via `DELETE …/quarantine/:id` ONLY if the operator explicitly asked; otherwise leave for audit and record the decision. (Default: leave; q3 scope is test/dummy entries.)
18. Revoked runner `test-fleet-muse`: leave revoked for audit (q4 default). Delete via the existing runner API only on explicit operator say-so. Record the decision.
19. Re-run §3.2 immediately: expect zero `bare`/`provider` entries in `models`, zero `test-fleet-model`, every entry `harnesses.length === 1`. Any miss → stop per q6.

### Phase 5 — Section-6 verification (agent: live reads + suites; operator: UI pass)

20. §6.1 — runner health: §3.1 shows `discovered`/`pinned+discovered`, per-harness `ok:true` (or named error, never `{}`), `versions.build.sha` == deployed commit, `codeChangedSinceBoot: false`.
21. §6.2 — catalogue hygiene: §3.2 clean as in step 19.
22. §6.3 — UI pass (operator or headless check, no long-lived servers — see Validation Plan): Project Settings → Muse Code harness badge reads "N runners"; model list contains `muse-ember` (or current `muse serve` output) with "N runners"; no `gemma4`/`deepseek`/`test-fleet-model`; dropped models show grey "0 runners" with "Remove permanently" in Settings.
23. §6.4 — regression: remove a model from a fake leg's output → entry stays at "0 runners" (not deleted); admin DELETE → gone; re-advertise → back.
24. §6.5 — suites: `npm test` for `runner/`, `api/flow/dispatch/`, `api/routes/projects.*`, `fleetModelOptions`, `ModelSelector.test.jsx`; WP-E guard proves no suite touched `~/.kainbain/engine`. See Validation Plan for exact invocations.
25. Per q6: ANY check fails → stop immediately, report which check + evidence, do not continue to WP-G. Record pass/fail per check in `verification-<date>.md`.

### Phase 6 — Documentation + WP-G gate (agent)

26. Write `verification-<date>.md` (per-check evidence: commands + outputs) and update this plan's Survey-mapping + gate records with actuals.
27. Write the WP-G readiness note: does every live runner report healthy discovery? (WP-G may proceed to its human dispatch decision only on yes.) WP-G ticket: `6ba7e727-8b7a-4c46-ad4a-960bcd099bcb`.
28. Non-goals respected: no dispatch changes (WP-G owns `buildFleetModelCatalog`/`runnerMatches`/`confirmRunnerModel` claimability); no frontend changes (WP-D owns pickers); no backend contract changes (WP-C owns ingest/snapshot); no test-isolation changes (WP-E owns them).

## Validation Plan

- Pre-change rehearsal: §3.1–§3.4 read-only commands (RESPONSE.md §3, with host-corrected state paths) reproduce the documented "before" state; outputs saved as baseline. No live mutation.
- Purge correctness: `GET /runners/models/catalogue` before/after diff shows exactly one removal (`muse::meta::test-fleet-model`); §3.2 script returns zero rows; `grep -r test-fleet` over `~/.kainbain/engine/*.json` returns nothing except the intentionally retained revoked runner record (if q4 default kept).
- Runner health (§6.1): per-runner `modelSource`, `discoveryStatus`, `versions.build` (incl. `codeChangedSinceBoot`) asserted from `runners.json` + Settings runner card (WP-A warning renders on mismatch).
- UI (§6.3): prefer the headless screenshot tool (`npm run capture:screenshot`) or existing `ModelSelector`/`fleetModelOptions` fixtures over any live server; if a live UI look is needed, the operator performs it (agent does not spawn long-lived background servers per stage guidance).
- Regression (§6.4): fake-leg removal → "0 runners" persists; admin DELETE → 204 + absent; re-advertise → present again. Run against the-live-but-backed-up catalogue only after Phase 4; otherwise against fixture store first.
- Suites (§6.5): run the project's own gates — `npm run test:unit` (api + frontend) at minimum, scoped to at least: `runner/`, `api/flow/dispatch/`, `api/routes/projects.*`, `frontend/src/services/fleetModelOptions`, `frontend/src/components/common/ModelSelector.test.jsx`; plus the WP-E guard test. Highest-risk validation: §6.1 per-harness `ok:true` on every live runner (it gates both purge confidence and WP-G).
- Rollback: restore the two state files from Phase 0 backups; reinstall prior runner bundle / restore env backups (operator); re-trigger `requestModelRediscovery`; re-run §3.1/§3.2 to confirm pre-change state. Rollback is tested as a dry run against copies in Phase 1, never against live state speculatively.

## Risks / Open Questions

- R1 — Agent self-kill via runner restart (q23 note). Mitigation: agent never executes reinstall/restart; one-at-a-time operator restarts in a quiescent window; handoff doc states this explicitly.
- R2 — Re-pollution after purge. Mitigation: WP-E merged is a hard pre-purge gate; WP-E guard suite re-run in §6.5.
- R3 — Stale-runner blind spot (N1: checkout-switched code, `version.json 0.1.0` since 2026-10-31). Mitigation: WP-A build identity + `codeChangedSinceBoot` asserted in §6.1; installs moved off the checkout in Phase 2.
- R4 — `server2-alpha` pi leg still broken post-reinstall. Mitigation: Phase 3 receipt must show named `discoveryStatus.pi` (not `{}`); on `LEG_MODULE_MISSING`, stop per q6 and fix packaging before purge.
- R5 — Scope creep beyond pre-approval (q23/q3: only test/dummy DELETEs). Mitigation: quarantine + revoked-runner defaults are leave-for-audit; any extra deletion needs fresh explicit permission.
- OQ1 — `SURVEY.md` q1–q6 answers are unrecorded: do the six Recommended defaults stand? Owner: operator, at the Phase 0 gate. Plan proceeds on "yes" unless corrected.
- OQ2 — WP-D merged before WP-F? Preferred but not required: if unmerged, §6.3 UI expectations that depend on WP-D (count-first badges, fleet harness badge) are checked as far as the deployed frontend allows and the gap is recorded rather than failed spuriously.
- OQ3 — Exact live state paths on the execution host (`/home/server2/.kainbain/engine` observed here vs `/home/server/.kainbain/engine` in RESPONSE.md) and the live engine URL (TICKETS.md used `http://192.168.1.206:3100`): confirm at Phase 0; normalize all commands to the confirmed paths.

## Sources / provenance

- `docs/tasks/b3401f19-2897-4049-aa3c-227bcee46a4c/RESPONSE.md` (§2.2 N1–N6, §3.1–§3.4, §4 WP-F runbook, §6 verification) — read this run.
- `docs/tasks/b3401f19-2897-4049-aa3c-227bcee46a4c/RESPONSE_SURVEY.md` (q1–q24 incl. q23/q24) — read this run.
- `docs/tasks/b3401f19-2897-4049-aa3c-227bcee46a4c/TICKETS.md` (WP-F ticket `8c7e2d15…`, blockedBy wiring) — read this run.
- This task's `SURVEY.md` (q1–q6, answers empty) — read this run.
- Grounded against the live tree: `runner/` (+`harnessModelDiscovery.js`, `updates/`, `version.json`), `api/flow/dispatch/` (ingest/snapshot/confirmation), `api/testSetup.isolation.js`, `api/isolatedTestRoots.js`, `scripts/package-runner.mjs`, `scripts/install-local-runner.sh`, `requestModelRediscovery` call sites, `package.json` test scripts — inspected this run.
