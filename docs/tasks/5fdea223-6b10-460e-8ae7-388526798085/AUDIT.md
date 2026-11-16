# AUDIT.md — Multi-project production-readiness audit

Task: `5fdea223-6b10-460e-8ae7-388526798085` — review the multi-project
mechanisms to confirm KainBain can handle production-level workloads across
multiple projects at once (untested since runners were implemented).

Guidance: [FRAMEWORKS.md](./FRAMEWORKS.md) (ISO 25010 spine, 29119 tests, SRE
bar, Twelve-Factor runner lifecycle, named queue patterns, ASVS V4/V5).
Survey inputs: [INTENT-SURVEY.md](./INTENT-SURVEY.md),
[FEEDBACK_SURVEY.md](./FEEDBACK_SURVEY.md).

## 0. Survey responses — disposition

Both survey files were read. Their `answers` blocks are empty (no operator
selections recorded), so per the survey's own "Auditor's choice / judgement
call" options this audit proceeds on auditor's judgement with these
recorded interpretations (each maps to one FEEDBACK_SURVEY question):

| Survey Q | Interpretation used |
|---|---|
| q1 queue model | Pass = one shared central queue drained in central-queue order, OR per-project queues with a shared pool + documented fairness — whichever exists must show no silos, no unbounded starvation, no silent drops. (Found: the former.) |
| q2 load/unload | Pass = drain-and-fence semantics: in-flight work finishes or is safely parked, no new claims after unload, re-load resumes cleanly. Hard-detach or restart-required unload would be a hitch/blocker. |
| q3 switch + interleave | All four guarantees required: switch never interrupts others; one runner interleaves with correct projectId; cross-project writes rejected; git/workdir isolation holds. |
| q4 skills | All four behaviours required: merge-not-replace; per-project-only shadowing; project-agnostic core skills; invalid/oversized never crashes a stage. |
| q5 hard-coding | True `kainbain`-as-project assumptions = blocker. Benign strings (product name, sample data, fallbacks) = observation with disposition. |
| q6 synthetic testing | Ephemeral temp-dir fixtures with auto-cleanup + contamination checks (live dummy projects read-only, never mutated, none added). |
| q7/q8 scale bar | Auditor's judgement: no full load rig in this stage; small-scale bar (2–3 projects, 1–2 runners) judged on code + unit/integration evidence, full production-scale SLO gate left explicitly open with a proposed SLO set. |

## 1. Verdict

**READY WITH HITCHES for small-scale multi-project use (2–3 concurrent
projects, 1–2 runners) — the "start developing apps" goal. NOT YET PROVEN at
production scale: the SRE SLO gate (FRAMEWORKS §6) is open.**

- Zero blockers found in Q1–Q7. Every must-have mechanism exists, is wired,
  and is covered by passing tests re-run in this audit (187 tests green).
- Five hitches (H-1…H-5) and three observations (O-1…O-3) are recorded below
  with owners' next actions. None stops app-development use.
- Q8 is `not yet measurable` per SRE Ch.3 (no declared SLOs, no load/soak or
  failure drills executed here). §7 proposes the SLO set and the drill list
  that closes the gate. Do not claim production-scale readiness until that
  gate is run.

## 2. Per-check results

### Q1 — Switch projects without interrupting others — PASS

Switching is a view-layer id flip with no execution coupling:

- Backend: `POST /projects/:id/activate` → `projectStore.setActiveProject`
  ([projects.js](/home/server2/.kainbain/runner-work/kb-5fdea223-6b10-460e-8ae7-388526798085/api/routes/projects.js) ~L612).
  It only sets `activeProjectId`; no task, claim, scheduler, or runner state
  is touched.
- Dispatch (`scanClaimableTasks`,
  [scanClaimableTasks.js](/home/server2/.kainbain/runner-work/kb-5fdea223-6b10-460e-8ae7-388526798085/api/flow/dispatch/scanClaimableTasks.js))
  and the embedded scheduler
  ([findNextCandidateTask.js](/home/server2/.kainbain/runner-work/kb-5fdea223-6b10-460e-8ae7-388526798085/api/flow/scheduler/findNextCandidateTask.js))
  iterate `projectStore.listProjects()` — all projects, never the active one.
- The runner daemon never reads the active project; every call carries an
  explicit `projectId` ([client.js](/home/server2/.kainbain/runner-work/kb-5fdea223-6b10-460e-8ae7-388526798085/runner/client.js)).
- The multi-runner monitor resolves each hold from the held task's own
  project, "never from whatever pipeline the viewer has selected"
  ([runnerRoutes.js](/home/server2/.kainbain/runner-work/kb-5fdea223-6b10-460e-8ae7-388526798085/api/flow/runnerRoutes.js) ~L523).
- Worktree bulkhead: per-workdir promise chains (`workdirChains`,
  [project.js](/home/server2/.kainbain/runner-work/kb-5fdea223-6b10-460e-8ae7-388526798085/runner/project.js))
  serialize git per workdir, and stale-lock recovery refuses to act while a
  live git process runs — one wedged project cannot stall another's git.

Hitch H-1 (see §3): runner-mutating endpoints resolve a *missing* projectId
to the active project instead of rejecting (fail-open default tenant).

### Q2 — Multiple projects collapse to one queue — PASS

One shared central queue, not per-project silos:

- `scanClaimableTasks` scans every project (allowlist-filtered only by the
  runner's own `projectIds`) and sorts through the single shared seam
  `sortCentralQueue`, used identically by runner dispatch, the embedded
  scheduler, and the queue display — the three can never disagree about
  "what runs next".
- Order: oldest-waiting-first globally, furthest-along percentage tiebreak,
  15-minute starvation ceiling (overdue jumps ahead oldest-first)
  ([centralQueuePolicy.js](/home/server2/.kainbain/runner-work/kb-5fdea223-6b10-460e-8ae7-388526798085/api/flow/scheduler/centralQueuePolicy.js)).
- Contention safety: the claim fence (`ClaimStore.claim`, `CLAIM_CONFLICT`
  on lost races) is the single arbiter; concurrent loops poll again rather
  than double-dispatch. `noDoubleDispatch.test.js` passes.
- Backpressure: fleet-wide cap → HTTP 429 `FLEET_CONCURRENCY_EXHAUSTED`
  (daemon backs off *without* consuming idle budget); per-project cap skips
  that project's candidates (`PROJECT_BUSY`) instead of blocking the queue.
- Tests re-run green: `scanClaimableTasks.test.js` (6),
  `centralQueueFairness.test.js` (7), `runnerDispatchCaps.test.js`,
  `runnerPolicyDispatch.test.js`, `noDoubleDispatch.test.js`.

Hitch H-2: fairness is FIFO-only with no per-project quota — a sustained
burst from one project delays others up to the ceiling. Documented tradeoff,
not a correctness failure.

### Q3 — Projects loaded/unloaded from runners — PASS WITH HITCH

Load/unload *from runners* works with drain-and-fence semantics and no
restart on the operator path:

- Load: `POST /projects/register` → idempotent `registerProjectPath`
  (re-register is a no-op) + `ProjectStore` rescan; registry file is
  advisory (missing/corrupt → empty, never broken boot).
- Runner-side scope: `KAINBAIN_RUNNER_PROJECTS` allowlist, sent on every
  `dispatchClaim` poll; empty = serve all.
- Operator-side unload at runtime: `PATCH /runners/:id/config`
  `{ projectScope: [...] }` (persisted, no restart), enforced on dispatch,
  direct claim, and merge-lease paths by the single point
  `operatorConfigVerdict` → loud `PROJECT_SCOPE` refusal, never silent skip.
- In-flight work drains: scope changes touch only future matching — live
  holds are not invalidated, so the running task finishes and reports
  normally, then the runner takes no further work from the unloaded project.
- Runner workdir hygiene supports churn: per-assignment reap plus a
  ~1-minute terminal-workdir sweep; `WORKTREE_CAP=5` evicts LRU *stale*
  workdirs and parks residue on `kb-recovery/*` branches, never deletes.

Hitch H-3: `DELETE /projects/:id` is memory-only and unfenced — it removes
just the in-memory map entry (no config-file/registry removal, so a rescan
resurrects it) and does not invalidate that project's live claims. A task
in-flight across a delete keeps its lease until TTL expiry and its progress
calls still resolve (task files remain on disk). For runner fleet use this
is contained (leases expire, work re-queues), but deletion mid-flight is
not a clean unload. Follow-up: fence holds + remove persisted state, or
document "scope-off first, delete only when idle".

### Q4 — Runners take tasks from multiple projects — PASS WITH HITCH

One runner interleaves across projects sequentially (one assignment at a
time per daemon; each poll may serve a different project); the fleet
parallelises. Attribution and fencing verified by code + a live probe:

- Every runner call carries the task's own `projectId` plus
  `executionId`/`epoch` (`claim`, `claimHeartbeat`, `progress`, `logs`,
  `verifySha`, `steerAck`, `integration*`).
- Task ids are `uuidv4` (globally unique,
  [taskLifecycle.js](/home/server2/.kainbain/runner-work/kb-5fdea223-6b10-460e-8ae7-388526798085/api/work/taskLifecycle.js) ~L259);
  claims are keyed by task id globally with monotonic backend epochs
  (never wall-clock — immune to host clock skew).
- Task lookup is project-scoped: `taskStore.getTask(projectId, taskId)` —
  a wrong-project replay finds no task and the route 404s before any write.
- Probe `/tmp/kb-q4-probe.mjs` (temp state only, cleaned after) observed:
  correct-project progress accepted; cross-project lookup → null (route
  404); stale epoch → `STALE_EPOCH`; second claimer → `CLAIM_CONFLICT`.
- Workdir/branch isolation: per-task worktree `kb-<taskId>` on branch
  `kb/<taskId>` (uuid-keyed, collision-free across projects).

Hitch H-4 (defense in depth): the execution ledger never compares
`hold.projectId` to the request's projectId — `ClaimStore.describe()`
strips `projectId` from its projection, so `_holdOrThrow` cannot check it.
Cross-project safety therefore rests on uuid uniqueness + scoped lookup +
unguessable lease tokens (all sound), but a belt-and-braces projectId
comparison is missing. The probe confirmed a *crafted colliding id* would
be accepted. Fix: include `projectId` in `describe()` and compare in the
ledger guard. Not a blocker (uuidv4 collision is infeasible and lease
tokens are unguessable), but cheap to close.

### Q5 — No hard-coded / assumed `kainbain` core project — PASS

Three-pass hunt (text + structural + runtime reasoning). Zero true
assumptions found. Full disposition table in §4; summary:

- Dispatch, claim, scheduler, skills, and registry paths never reference a
  `kainbain` project id/slug. Project identity is always carried explicitly
  or enumerated from the store/registry.
- "First project" defaults are order-based, never name-based
  (`scanProjects` first-key active default; UI `data[0]` fallback with
  stored-id preference). No path requires a project *named* kainbain, first,
  or active to function.
- Runtime-rename reasoning: the suites re-run here (`scanClaimableTasks`,
  `centralQueueFairness`, `skillsRegistry`, `claimStore`,
  `runnerPolicyDispatch`, `integrationDispatch`, …) all execute against
  synthetic non-`kainbain` slugs in temp roots and pass — equivalent in
  coverage to the FRAMEWORKS rename test for the audited paths.

### Q6 — Per-project custom skills + shared core skills — PASS

The overlay model meets all four required behaviours:

- Merge, not replace: `mergeSkillSources({ globalSkills, projectSkills })`
  retains both rows; the UI shows "Shadows default" for overrides.
- Per-project-only shadowing: `loadSkill` / `SkillsRegistry.getSkill` prefer
  `<projectCwd>/skills/<name>` for that project only; project B's
  resolution is untouched by project A's overlay. A same-dir guard
  (`isDistinctOverlay`) handles the self-managed KainBain case where the
  project dir *is* the global library dir.
- Project-agnostic core skills: the prompt engine binds lookup to the
  task's own `projectCwd`
  ([promptCuration.js](/home/server2/.kainbain/runner-work/kb-5fdea223-6b10-460e-8ae7-388526798085/api/promptCuration.js) ~L219-225),
  and per-stage `skills[i].config` overrides resolve per attachment —
  same core skill, different keywords per project/stage, no bleed.
- Invalid/oversized never crashes a stage: invalid frontmatter/config →
  `invalid: true` descriptor, never throws; oversized bodies rejected as
  invalid without being read whole; injection caps total chars
  (`maxChars`, default 16000) with visible
  `[skill <name> omitted: size cap]` markers; unknown skills land in
  `omitted`, not exceptions.
- Tests re-run green: `skillsRegistry.test.js` (55), `skillInjection.test.js`
  (all), plus prompt-curation keyword/contract suites in the wider run.

### Q7 — Test without creating real projects — PASS

The synthetic strategy is fully supported and was used by this audit:

- Backstop verified present and correct: `api/testSetup.isolation.js`
  (vitest `setupFiles` — temp projects/notes/circuit/registry roots before
  any import) plus the per-file `api/isolatedTestRoots.js` convention
  (temp projects, notes, registry, claim/runner/steer/fleet state files,
  auth dir). `testIsolation.guard.test.js` passes.
- Seams used: constructor/env injection everywhere the audit touched
  (`ClaimStore({ stateFile })`, `KAINBAIN_*` env, `createRunnerClient({
  fetchImpl })`); no live root was written.
- Contamination check: `git status --short` clean after the audit;
  `api/node_modules` (installed to run tests) is git-ignored; the Q4 probe
  minted and deleted its own tmp dir (verified absent after); no writes to
  `~/projects`, `~/.kainbain/projects.json`, or `~/.kainbain/engine/*`
  were made. Zero real or dummy projects created, mutated, or deleted.
- Existing dummy projects were treated as read-only and were not needed.

### Q8 — Production-level workloads — NOT YET MEASURABLE (gate open)

Per SRE Ch.3, no SLOs are declared anywhere in the repo, so no
"production ready at scale" verdict can be issued. What exists:

- Backpressure primitives: fleet 429, per-project skip, circuit breaker
  (`Engine is tripped — dispatch is stopped`), claim TTL + lazy expiry +
  `STALE_EPOCH` fencing, idempotent completion (retried executionId is a
  no-op), worktree cap with recovery parking.
- Partial observability: `queueDepth` + scheduler stats + git contention in
  [observabilityMetrics.js](/home/server2/.kainbain/runner-work/kb-5fdea223-6b10-460e-8ae7-388526798085/api/watch/observabilityMetrics.js);
  `staleRejected` ledger counters; `/runners/monitor` live holds. Missing:
  dispatch-latency percentiles, per-project throughput/fairness counters,
  claim success rate — H-5.
- Quarantine exists only for models, not for poison tasks; poison-task,
  runner-kill, and backend-restart drills were not executed in this stage.

§7 proposes the SLO set and drill list that close this gate. The Q1–Q7
evidence justifies starting app-development use at small scale now; the
gate must be run before claiming production-scale readiness.

## 3. Findings register

Format: `ID | Q | framework + clause | severity | evidence | status`.

| ID | Q | Framework clause | Severity | Finding + evidence | Status |
|---|---|---|---|---|---|
| H-1 | Q1/Q4 | `ASVS 4.0 V4.1` default-tenant; `25010:security/integrity` | Hitch | Runner-mutating endpoints fall back to the *active* project when `projectId` is omitted (`resolveProjectId`, [projectResolution.js](/home/server2/.kainbain/runner-work/kb-5fdea223-6b10-460e-8ae7-388526798085/api/projectResolution.js):8-14, via `guardedTask` [runnerRoutes.js](/home/server2/.kainbain/runner-work/kb-5fdea223-6b10-460e-8ae7-388526798085/api/flow/runnerRoutes.js):510 and claim [runnerRoutes.js](/home/server2/.kainbain/runner-work/kb-5fdea223-6b10-460e-8ae7-388526798085/api/flow/runnerRoutes.js):980). All current runner client calls send projectId, so this is latent — but a future caller omitting it silently acts on the wrong project instead of 400ing. Fix: require explicit projectId on `/tasks/:id/claim|progress|logs|verify-sha|complete-execution|steer-ack|interrupt` and integration routes. | Open — follow-up |
| H-2 | Q2 | `SRE Ch.5` fairness; `25010:performance/capacity` | Hitch | FIFO-only fairness, no per-project quota (`sortCentralQueue` oldest-first + 15-min ceiling). A sustained single-project burst delays others up to the ceiling. Record as ATAM tradeoff; add per-project quota only if app-dev use shows noisy-neighbour pain. | Open — accepted tradeoff |
| H-3 | Q3 | `Twelve-Factor IX` disposability; `25010:reliability/recoverability` | Hitch | `DELETE /projects/:id` ([projects.js](/home/server2/.kainbain/runner-work/kb-5fdea223-6b10-460e-8ae7-388526798085/api/routes/projects.js):602) → `deleteProject` ([projectStore.js](/home/server2/.kainbain/runner-work/kb-5fdea223-6b10-460e-8ae7-388526798085/api/projectStore.js):2006) removes only the in-memory entry: no config-file/registry removal (rescan resurrects), no live-hold invalidation (lease zombies until TTL, progress still accepted). Fix: fence holds + remove persisted state, or doc "scope-off, wait idle, then delete". | Open — follow-up |
| H-4 | Q4 | `ASVS 4.0 V4.1` BOLA; `25010:security/integrity` | Hitch | Ledger guard never compares `hold.projectId`: `describe()` strips it ([claimStore.js](/home/server2/.kainbain/runner-work/kb-5fdea223-6b10-460e-8ae7-388526798085/api/flow/claimStore.js):230-239), `_holdOrThrow` checks only executionId/epoch/runnerId ([executionLedger.js](/home/server2/.kainbain/runner-work/kb-5fdea223-6b10-460e-8ae7-388526798085/api/flow/executionLedger.js):91-103). Safety rests on uuid ids + scoped lookup + unguessable tokens (sound; probe-verified). Fix: projectId in `describe()` + compare. | Open — follow-up |
| H-5 | Q8 | `SRE Ch.10`; `OTel/RED` | Hitch | Missing production signals: dispatch-latency percentiles, per-project throughput/fairness counters, claim success rate. Present: `queueDepth`, scheduler stats, git contention, `staleRejected`, `/runners/monitor`. Unmeasured behaviours cannot gate the SLO verdict. | Open — instrument before scale gate |
| O-1 | Q5 | `25010:maintainability/modularity` | Observation | UI `data[0]` active fallback ([useProjects.js](/home/server2/.kainbain/runner-work/kb-5fdea223-6b10-460e-8ae7-388526798085/frontend/src/context/useProjects.js):137-141) and backend first-key active default ([projectStore.js](/home/server2/.kainbain/runner-work/kb-5fdea223-6b10-460e-8ae7-388526798085/api/projectStore.js):529-530) are order-based conveniences, not `kainbain` assumptions. No action; noted for the rename-test record. | Noted |
| O-2 | Q5 | `25010:maintainability/modularity` | Observation | Benign `kainbain` strings: prompt-layout dry-run sample data, `USER` fallback, `~/apps/kainbain` deploy default (injectable), MSP/Muse handshake client names, push tag, UI display fallbacks. Full table §4. No action. | Noted |
| O-3 | Q8 | `Poison Pill` pattern | Observation | No task-level dead-letter/quarantine found (quarantine exists only for models). Stage failure presumably fails the task rather than requeue-looping, but poison-task behaviour is unverified — include in the drill list (§7). | Drill will decide |

No blocker rows. No finding was downgraded for "works for kainbain".

## 4. Hard-coding hunt (Q5) — hit list with dispositions

Pass 1 (case-insensitive text search over `api/`, `runner/`, `shared/`,
`frontend/src/`, excluding tests/docs/version stamps) + Pass 2 (structural:
`getActiveProject` callers, `projects[0]`/`data[0]` selection, slug
defaults, skill-path assumptions):

| Hit | Disposition |
|---|---|
| `api/routes/promptLayout.js:30` `project: "kainbain"` | Benign — dry-run preview sample data only, never resolved. |
| `api/utils/platform.js:56` `... \|\| "kainbain"` | Benign — generic `USER` fallback for stage env when no OS user resolves; product identity, not a project. |
| `api/deployManager.js:67` `~/apps/kainbain` | Benign — default prod-deploy dir for the KainBain product itself; injectable via `opts.prodDir`. (If KainBain later deploys *other* apps, revisit — recorded, not a finding.) |
| `api/agent/harnesses/muse/msp/museMspSupport.js:50`, `runner/modelDiscovery.js:100` `name: "kainbain"` | Benign — MCP/handshake client identity strings. |
| `api/push/pushService.js:168,175` title/tag | Benign — notification branding defaults. |
| `api/agentGuide.js:1385` `name: "KainBain"` | Benign — guide branding. |
| `frontend/src/components/SystemGuideModal.jsx:480,488` display fallbacks | Benign — `'KainBain'` / example path shown only when no active project. |
| `frontend/src/components/layout/BuildHashTrigger.jsx:47` `~/apps/kainbain/build.json` | Benign — documents the deploy default above. |
| `api/projectStore.js:529-530` first-key active default; `frontend/.../useProjects.js:137-141` `data[0]` fallback | Order-based, not name-based (O-1). Neither requires a project named kainbain, nor any particular project to exist. |
| `api/agentRunner.js:368-398` `defaultProjectId` | Benign — per-instance injected default (constructor arg), never the literal `kainbain`; throws when no projectId resolves. |
| `api/project/seedDemo.js` demo seed | Benign — seeds a "Welcome Tour"-style demo project via `DEMO_SEED_PROJECT_NAME`, no `kainbain` slug. |
| `api/kainbainDir.js` `.kainbain` default state folder | Benign — per-project state *folder name* (customisable per project), not a project identity. |
| `api/projectResolution.js:12` active-project fallback | Flagged as H-1 (default-tenant smell on runner paths), not a `kainbain` assumption. |

Pass 3 (runtime rename reasoning): the suites re-run in this audit execute
entirely against synthetic non-`kainbain` slugs (`proj-alpha`-style fixtures
in temp roots) and pass — 187/187. No code path under audit branches on the
literal `kainbain`. A dedicated rename-the-live-core-project test was
deliberately *not* run (it would mutate live state, violating the Q7
constraint); the synthetic-suite coverage is the accepted substitute and is
recorded as such.

## 5. Skills matrix (Q6)

| Case | Project A | Project B | Observed |
|---|---|---|---|
| Unshadowed core skill `S` | global body | global body | Both inject identical global body. |
| Overlay `S` in A only | overlay body | global body | `loadSkill` prefers A's overlay; B unaffected (per-project lookup). |
| Missing skill | `omitted: skill not found` | same | Stage runs; omission recorded, never thrown. |
| Invalid overlay (bad frontmatter/config) | `invalid: true` descriptor | global body | Never throws; stage still runs. |
| Oversized `SKILL.md` / config | rejected invalid unread | — | Size-gated before full read. |
| Injection budget exceeded | `[skill omitted: size cap]` marker | — | Later skills in stage order omitted with marker. |
| Core skill, different `stage.skills[].config` per project | A's keywords | B's keywords | Per-attachment override resolution; no cross-project bleed. |
| Project dir == global library dir (self-managed) | single set, no double-count | — | `isDistinctOverlay` guard. |

Evidence: `api/skills/skillsRegistry.js`, `api/skills/skillInjection.js`,
`api/promptCuration.js:219-225`; suites `skillsRegistry.test.js` (55),
`skillInjection.test.js`, prompt-curation contract tests — all green.

## 6. Synthetic-test inventory + contamination statement (Q7)

- Suites re-run in this audit (all against temp roots via the
  `testSetup.isolation.js` backstop): `scanClaimableTasks`,
  `centralQueueFairness`, `skillsRegistry`, `claimStore`,
  `projectResolution`, `runnerDispatchCaps`, `runnerPolicyDispatch`,
  `executionLedger`, `skillInjection`, `projectStore.multiroot`,
  `testIsolation.guard`, `noDoubleDispatch`, `integrationDispatch` —
  **187 tests, 187 passed.**
- Standalone probe `/tmp/kb-q4-probe.mjs` (outside the repo, kept for
  re-run): temp claim-state + temp roots, verified deleted afterwards.
- Contamination: `git status --short` clean; no writes to `~/projects`,
  `~/.kainbain/projects.json`, `~/.kainbain/engine/*`; zero projects
  created, mutated, or deleted (live dummy projects untouched, read-only).
  `api/node_modules/` installed for the test run is git-ignored.
- Technique mapping (29119-4): equivalence partitioning on `projectIds`
  (existing suites), state-transition on load/unload (reasoned + partially
  covered by registry/scope tests — full mid-task unload drill is a
  follow-up), decision-table on runner config × project set (policy suites).

## 7. Proposed SLOs + drill list (closes the Q8 gate)

Proposed SLOs (SRE Ch.3) for the scale gate:

1. Cross-project correctness: 100% — zero mis-attributed claims, progress
   writes, or reports (error-budget-zero item).
2. Dispatch latency p95 under 2s under the agreed profile (requires H-5
   instrumentation first).
3. Claim success rate (non-conflict claims / attempts) above 99% excluding
   operator pauses and version refusals.
4. Runner-fleet availability: dispatch endpoint success (non-5xx) above
   99.9% over the soak window.

Load profile: steady state (2–3 projects × few tasks), single-project burst
(noisy neighbour), all-project burst, sustained queue depth — all with temp
fixtures, mock harnesses, real dispatch path (Twelve-Factor X parity).

Failure drills: runner kill mid-task (expect lease expiry + re-queue, no
cross-project loss); backend restart mid-dispatch (holds drop, epochs
persist, work re-queues as interrupted); poison task (decide O-3: fails
clean vs needs dead-letter); worktree cap pressure (LRU + recovery
parking); unload-via-scope mid-task (drain, no new claims).

## 8. ADR / tradeoff log

- Queue fairness (Q2/H-2): FIFO-oldest-first + ceiling, no quotas. No ADR
  file found — recommend recording one if quotas are later added.
- Unload semantics (Q3): implicit drain-and-fence via scope matching +
  untouched live holds. Matches the desired model; recommend documenting in
  the runner README.
- Skill shadowing (Q6): per-project overlay preference with dual-row
  listing. Implemented + tested; no ADR needed.
- Past decisions honoured: ADR 0009 claim lifecycle (epochs/executionId —
  implementation matches), ADR 0010 burn control (fleet/project caps
  present), ADR 0012 update floor (dispatch refusal present), ADR 0014
  impromptu (dispatch keeps priority — present).

## 9. Evidence pack + verdict restatement

1. Findings register: §3 (H-1…H-5, O-1…O-3), framework-anchored.
2. Per-check results: §2 with file:line evidence and oracles.
3. Synthetic-test inventory: §6 (187 green, contamination clean).
4. Load + drill report: gate open; SLOs + drills proposed in §7.
5. Hard-coding hunt: §4, zero true assumptions.
6. Skills matrix: §5.
7. ADR/tradeoff log: §8.
8. **Verdict: READY WITH HITCHES for small-scale multi-project
   app-development use (2–3 projects, 1–2 runners). Production-scale
   readiness is NOT YET PROVEN — run the §7 gate (after H-5
   instrumentation) before claiming it.** Decided per FRAMEWORKS §8: no
   blocker rows exist; Q8 exit criteria are unmet, so the verdict is
   explicitly scope-limited rather than a full production-ready claim.

Follow-up owners' list: H-1 require explicit projectId on runner-mutating
routes; H-3 fence/persist project deletion; H-4 compare hold.projectId in
the ledger; H-5 add dispatch/fairness metrics; O-3 poison-task drill; §7
load + drill gate.

