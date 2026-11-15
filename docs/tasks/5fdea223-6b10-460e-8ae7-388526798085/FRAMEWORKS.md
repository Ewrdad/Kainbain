# FRAMEWORKS.md — Auditor guidance for the multi-project / runner production-readiness audit

Task: `5fdea223-6b10-460e-8ae7-388526798085` — "Review the multi project mechanisms to ensure that we are good to handle production level workloads. Able to switch projects without interrupting others; multiple projects collapse to one queue for runners; projects loaded/unloaded from runners; runners take tasks from multiple projects; no hard-coded/assumed `kainbain` core project; per-project custom skills plus shared core skills; test multi-project behaviour without creating real projects."

This document does **not** perform the audit. It tells the auditor which industry-standard frameworks to use, how to apply each to KainBain, what evidence to collect, and what counts as a blocker versus a hitch. Read it before opening the chosen framework documents.

## 0. How to use this document

- §1 decomposes the task into auditable questions. §2 is the framework map (one line each). §3 is the per-framework apply-guide. §4 is the per-check playbook the auditor executes. §5–§7 are method notes for the two hardest parts (synthetic projects; the hard-coding hunt). §8–§10 define severity, entry/exit criteria, and the evidence pack.
- Cite framework clauses in the audit report (e.g. `ISO/IEC 25010:2023 §5.2.2`, `SRE Ch.17`, `ASVS 4.0 V4.1.1`). A finding without a framework anchor is an opinion, not an audit result.
- All version pins below are **2026-11-15 current**. Verify the pin at audit start; if a newer edition exists, note the delta and audit to the newer edition.
- Working directory / evidence roots for the auditor: `runner/` (daemon, client, project workdirs), `api/projectStore.js`, `api/projectRegistry.js`, `api/projectResolution.js`, `api/skills/skillsRegistry.js`, `api/skills/skillInjection.js`, `api/isolatedTestRoots.js`, `shared/` (stages/skills conventions). The live roots `~/projects/*`, `~/.kainbain/projects.json`, `~/.kainbain/engine/*` are **evidence sources for read-only inspection only — never mutation targets** (see §5 guardrails).

## 1. Task decomposition — auditable questions

| # | Task clause | Audit question | Primary frameworks |
|---|---|---|---|
| Q1 | Switch projects without interrupting others | Is project context (active project, sessions, tasks, runners, docs) isolated so switching one project never cancels, reassigns, or starves another? | ISO 25010 portability/compatibility; Twelve-Factor IX (disposability); SRE Ch.7 (capacity/toil); Bulkhead pattern |
| Q2 | Multiple projects collapse to one queue for runners | Does `dispatchClaim({ projectIds })` (`runner/client.js`, `runner/daemon.js`, `runner/config.js` `KAINBAIN_RUNNER_PROJECTS`) serve a single mixed queue without per-project silos, head-of-line blocking, or starvation? | Competing-consumers / priority-queue patterns; SRE Ch.5 (load balancing); KEDA/HPA resource model; ISO 25010 performance efficiency |
| Q3 | Projects loaded/unloaded from runners | Can a project be registered/adopted and later removed such that runners stop claiming its tasks, in-flight work drains or is fenced, and re-load is clean? | Twelve-Factor III/X (config, disposability); ATAM lifecycle; compensating-transaction pattern |
| Q4 | Runners take tasks from multiple different projects | Can one runner instance (and a fleet) interleave tasks across projects correctly — correct `projectId` on claim/progress/verify/steer, no cross-project write? | Multi-tenancy isolation (OWASP ASVS V4); Competing-consumers; ISO 25010 functional suitability |
| Q5 | No hard-coded / assumed `kainbain` core project | Are there no defaults, fallbacks, seed/demo paths, docs, or UI strings that silently assume the `kainbain` project exists or is first/active? | ATAM coupling/cohesion; ISO 25010 maintainability (modularity, reusability); OWASP secure-coding (no default-tenant) |
| Q6 | Per-project custom skills + access to core skills | Does the global skill library + per-project `<projectRoot>/skills/` overlay (shadowing, `mergeSkillSources`/`loadSkill` in `skillsRegistry.js`, injection in `skillInjection.js`) give each project independent skills while core skills remain usable across projects with different stage configs? | Plugin/overlay pattern; ISO 25010 maintainability (reusability); ISO 29119 functional test design |
| Q7 | Test multi-project behaviour without creating real projects | Is there a safe synthetic/ephemeral fixture strategy (temp roots, fakes, mock harness) that exercises Q1–Q6 without polluting `~/projects/*` or the live registry? | ISO/IEC 29119 test design; xUnit test-doubles (Fowler); Testcontainers/ephemeral-environment practice; SRE test-in-prod |
| Q8 | Production-level workloads; blockers/hitches | Under realistic concurrent multi-project load, does the system meet explicit throughput/latency/availability objectives, and are capacity, fairness, and failure modes bounded? | Google SRE (SLOs, error budgets, capacity, golden signals); ISO 25010 performance efficiency + reliability; DORA throughput/stability |

## 2. Framework map — what to open and why

| Framework (pinned edition) | Use it for | Skip it for |
|---|---|---|
| **ISO/IEC 25010:2023** *Systems and software quality models* | The audit's top-level quality spine: functional suitability, performance efficiency, compatibility, reliability, security, maintainability, portability. Every finding maps to a characteristic + sub-characteristic. | Specific queueing maths or test-case syntax (delegated below). |
| **ISO/IEC 29119-1/-2/-3/-4/-5:2022-2025** *Software testing* | Test process, test design techniques (equivalence partitioning, state transition, combinatorial), test types (functional, integration, system, load/performance), and entry/exit criteria for Q7/Q8. | Product quality judgement (that is 25010). |
| **Google SRE Book (2017) + SRE Workbook (2018)**, Ch. 3, 5, 7, 17–19 | SLOs/error budgets, capacity & load balancing, handling overload, production-readiness checklist, postmortem/blameless review. The "production level" bar for Q8. | Application-level API design. |
| **Twelve-Factor App (12factor.net, rev. 2023)** | Runner as a worker process: config in env, disposability, concurrency, admin processes, dev/prod parity — Q1, Q3. | Queue semantics (use patterns below). |
| **Microsoft Azure Architecture Center — design patterns** (Bulkhead, Competing Consumers, Priority Queue, Idempotent Consumer, Circuit Breaker, Poison Pill / Dead-Letter, Compensating Transaction) + **Enterprise Integration Patterns** (Hohpe, 2003) | Vocabulary and acceptance logic for Q1–Q4 queue/failure behaviour. Cite the named pattern, not an ad-hoc description. | Language-specific implementation. |
| **OWASP ASVS 4.0 (V4/V5) + OWASP Top 10:2021** (esp. A01 Broken Access Control / BOLA) | Cross-project isolation is an authorisation problem: can project A read/write/claim project B's tasks, docs, or skills? Q4, Q5, Q6. | General app hardening (out of scope). |
| **CNCF / Kubernetes multi-tenancy & KEDA practice** (namespaces, quotas, fair scheduling; KEDA scaled-objects/queue-length autoscaling) | Resource isolation and "collapse to one queue" fairness: quotas, noisy-neighbour, scale on queue depth. Analogy framework — KainBain is not Kubernetes; borrow the concepts, not the tooling. | Any claim that KainBain must run on Kubernetes. |
| **OpenTelemetry (1.x) + RED/USE method + SRE golden signals** | Observability acceptance: what metrics/logs/traces must exist to prove Q1/Q2/Q8 in production. | UI dashboards (out of scope). |
| **ATAM (Architecture Tradeoff Analysis Method, SEI) + C4 model + Nygard ADRs** | Architecture evaluation for coupling (Q5) and load/unload lifecycle (Q3); record tradeoff decisions as ADRs. | Re-litigation of past ADRs (read them as evidence). |
| **ISTQB / ISO 25010 testability + Fowler test-doubles (mocks, fakes, stubs, in-memory fakes)** | Q7 synthetic-project strategy: how to build ephemeral projects without real repos. | Load-test tooling choice (k6/Locust is the auditor's pick, §6). |
| **NIST CSF 2.0 (2024) / ISO 27001:2022 A.8** (supporting, optional) | Only if the audit touches credential/project-registration handling (`runner/credentialFile.js`, `projectRegistry.js`). Do not expand into a full security audit. | Full security compliance (explicitly out of scope). |

Explicit non-frameworks (do not audit against): WCAG 2.2 (no UI in scope), ISO 13485/62304 (not medical), GDPR (no personal data in scope), SOC 2 full attestation (use CSF/ASVS slices only).

## 3. Framework apply-guide — how to use each one on KainBain

### 3.1 ISO/IEC 25010:2023 — the quality spine

Map every finding to exactly one characteristic and sub-characteristic; a finding with no mapping is not yet a finding.

| Characteristic | Sub-characteristics to test here | KainBain evidence to inspect |
|---|---|---|
| Functional suitability (correctness, appropriateness) | Q2–Q4 claim/dispatch correctness, Q6 skill shadowing correctness | `runner/client.js` (`claim`, `dispatchClaim`), `runner/daemon.js` assignment loop, `api/skills/skillsRegistry.js` (`loadSkill`, `mergeSkillSources`), `api/skills/skillInjection.js` |
| Performance efficiency (time behaviour, resource utilisation, capacity) | Q2 queue throughput, Q8 concurrent dispatch, worktree cap (`WORKTREE_CAP`) pressure | `runner/project.js` (`WORKTREE_CAP`, `WORKTREE_EVICT_STALE_MS`), `runner/config.js`, daemon heartbeat/dispatch timings |
| Compatibility (co-existence, interoperability) | Runner↔backend API version (`runner/version.json`, `apiVersion`), multi-project co-existence on one host | `runner/daemon.js` `resolveRunnerBuild`, `runner/updates/*`, `api/projectStore.js` multi-root scan |
| Reliability (maturity, availability, fault tolerance, recoverability) | Q1 non-interruption, Q3 drain/fence, claim fencing (`executionId`/`epoch`), stale-lock recovery | `runner/project.js` (`maybeRecoverWorkdirLock`, `liveGitProcessRunning`), `runner/client.js` (`claimHeartbeat`, `verifySha`, `steerAck`) |
| Security (confidentiality, integrity, non-repudiation, accountability, authenticity) | Cross-project task/doc/skill access (BOLA), `projectId` spoofing on runner calls | Route guards via `api/projectResolution.js`, runner credential flow, `api/routes/files.js` `isPathSafe` |
| Maintainability (modularity, reusability, analysability, testability) | Q5 hard-coded assumptions, Q7 testability of multi-project seams | Grep/AST hunt (§7), `api/isolatedTestRoots.js` seams, injected `fetchImpl`/`runGit` seams in runner tests |
| Portability (installability, replaceability) | Load/unload (Q3), runner install/update with multi-project config | `runner/main.js`, `startRunner.sh`, `runner/updates/*`, `api/projectRegistry.js` |

Report format per finding: `25010:<characteristic>/<sub-characteristic>` + severity (§8) + evidence path + reproduction.

### 3.2 ISO/IEC 29119 — test process and design for Q7/Q8

- **29119-1 (concepts):** name the test levels/types used — component (single store/registry), integration (store+registry+runner client), system (multi-project dispatch), and load/performance (Q8). Do not label everything "E2E".
- **29119-2 (process):** follow planning → design → implementation → execution → closure. The audit's test plan must state entry criteria (e.g. isolated roots available, mock harness registered), exit criteria (e.g. per-check pass counts in §4), and suspension criteria (live-root pollutions detected → stop, §5).
- **29119-4 (test design techniques — mandatory picks):** equivalence partitioning on `projectIds` (empty / single / multi / duplicate / unknown id); state-transition testing on project lifecycle (unloaded → loading → active → draining → unloaded); decision-table / combinatorial testing on runner config × project set; boundary-value analysis on `WORKTREE_CAP` and queue depth. Record which technique each test case uses.
- **29119-3 (test documentation):** every synthetic test cites its technique, preconditions (temp roots seed), oracle (expected `projectId` on claim/progress), and cleanup (`afterAll` deletes temp roots — the `api/isolatedTestRoots.js` contract).
- **29119-5 (keyword-driven / data-driven):** recommended for the multi-project matrix (project sets as rows) so the same suite runs against 2-project, N-project, and mixed queues without code changes.

### 3.3 Google SRE — the "production level" bar (Q8)

- **Ch.3 (SLOs):** the audit must *propose* SLOs before judging production readiness — e.g. dispatch latency p95, claim success rate, cross-project correctness (must be 100%), availability of the runner fleet. No SLO → no "production ready" verdict; report "not yet measurable" instead.
- **Ch.5 (load balancing / capacity):** queue-depth as the load signal; verify the single queue does not head-of-line block (§4 Q2) and that per-project bursts are absorbed or shed with backpressure, not by dropping other projects' tasks.
- **Ch.7 (handling overload / toil):** measure operational toil per project (manual load/unload, manual lease/credential recovery, manual worktree reaping). Production-level fails if each additional project adds linear toil.
- **Ch.17 (production readiness):** use as the checklist for Q8 closure — capacity, deployment/safety, monitoring, on-call runbooks for "project unloaded mid-task" and "runner fleet half-dead".
- **Workbook (postmortems):** any pre-existing multi-project incident (e.g. the worktree-fleet outage referenced in `runner/project.js`) must be written up blamelessly and referenced by the audit — do not re-litigate, verify the fix holds.

### 3.4 Twelve-Factor App — runner as a worker (Q1, Q3)

- **III (config in the environment):** `KAINBAIN_RUNNER_PROJECTS` and backend root envs (`PROJECTS_ROOT`, `KAINBAIN_PROJECTS_REGISTRY_FILE`) are the *only* project-set inputs — verify no project set is baked into code, defaults, or an image layer.
- **IX (disposability):** a runner must be killable at any point (mid-claim, mid-progress, mid-push) and the system must recover via fencing (`executionId`/`epoch`), lease expiry, and `kb-recovery/*` parking — never via manual cleanup assuming one project.
- **X (dev/prod parity):** synthetic Q7 fixtures must run the same dispatch/claim code path as production (mock harness allowed; mock queue not allowed).
- **V (build/release/run):** `runner/updates/*` + `version.json` build identity must not bake a project list into the bundle; audit the update manifest for project-scoped state.

### 3.5 Named queue/failure patterns (Azure / Enterprise Integration Patterns) — Q1–Q4

Cite the pattern per behaviour; a behaviour matching no named pattern is a design gap to report.

| Pattern | Expected KainBain behaviour | Fails if |
|---|---|---|
| **Competing Consumers** | N runners (or 1 runner, 2+ projects) drain one queue; each task claimed exactly once (fenced by `executionId`/`epoch`). | Two runners claim the same task; or a project is pinned to a runner. |
| **Priority Queue / fairness** | Burst from project A does not starve project B indefinitely; oldest-claimable wins or a documented fairness rule applies. | A single hot project blocks others past the SLO window (§4 Q2). |
| **Bulkhead** | Worktree/disk/git-lock bulkheads per workdir (`workdirChains` in `runner/project.js`) contain a wedged project. | One project's git lock or disk exhaustion stalls all projects. |
| **Idempotent Consumer** | Retried `claimHeartbeat`/`verifySha`/`steerAck`/`integrationReport` are safe to replay; epoch fencing rejects stale writers. | Replay double-applies progress, merges, or steers. |
| **Poison Pill + Dead-Letter** | A task that always fails (bad repo, bad skill, bad stage config) is quarantined after N attempts and does not wedge the queue for other projects. | One poison task blocks the mixed queue. |
| **Compensating Transaction** | Unload (Q3) parks unpushed work (`kb-recovery/*`), fences in-flight claims, and is reversible by re-load. | Unload deletes work or leaves a half-claimed task. |
| **Circuit Breaker** (for backends/harnesses) | A dead harness/model for one project does not consume all runner slots. | One broken harness starves the fleet. |

### 3.6 OWASP ASVS 4.0 / Top 10:2021 — cross-project authorisation (Q4/Q5/Q6)

- Treat every `projectId` on every runner-facing endpoint (`/tasks/:id/claim`, `/runners/dispatch`, `/runners/integration/*`, `/tasks/:id/progress|verify-sha|steer-ack`) as **object-level authorisation** (ASVS V4.1, V5.1; Top 10 A01/BOLA). Test: project A's runner credential/assignment cannot claim, progress, or report on project B's task by supplying B's `projectId`/`taskId`.
- Audit `api/projectResolution.js` (`resolveProjectId` falls back to the *active* project): any runner or API route that resolves "no id → active project" is a default-tenant smell (Q5). Runner endpoints must require an explicit `projectId` — flag any that silently default.
- Audit skill/doc file reads (`api/routes/files.js` `isPathSafe`, `skillsRegistry.js` `skillPathForName`) for path traversal *across* projects (symlink/overlay escape), not just within one project.
- Scope limit: this is an authorisation-pattern audit, not a full ASVS certification. Do not report unrelated ASVS items as blockers.

### 3.7 CNCF/Kubernetes multi-tenancy + KEDA — resource isolation analogy

Borrow concepts, not tooling: namespaces ≈ projects; quotas ≈ per-project worktree/concurrency caps; fair scheduling ≈ queue fairness (Q2); scale-on-queue-depth (KEDA) ≈ "collapse to one queue, scale runners on depth". The audit question is always: *what is KainBain's quota/fairness/scale signal for a project, and is it enforced?* If none exists, that is a production-readiness gap (SRE Ch.5), not a Kubernetes gap.

### 3.8 OpenTelemetry + RED/USE + golden signals — observability acceptance

For each of Q1/Q2/Q8 the audit must name the metric/log/trace that *proves* the behaviour in production. Minimum set: dispatch latency + queue depth (RED: rate/errors/duration), claim fencing rejections, per-project task throughput/fairness counters, worktree eviction count, skill-injection size-cap omissions. No signal → behaviour is unverifiable → report as "unmeasured" (fails SRE Ch.10), not as "passes".

### 3.9 ATAM + C4 + Nygard ADRs — architecture evaluation (Q3, Q5)

- Draw (or require) a C4 container/context view of backend ↔ runner ↔ projects ↔ skills. Any arrow labelled "assumes kainbain" is a Q5 finding.
- Run ATAM-style tradeoff analysis on: single-queue vs per-project queues (Q2), load/unload semantics (Q3), skill shadowing (Q6). Record each tradeoff as an ADR (Nygard format: context/decision/consequences) if one does not already exist.
- Past ADRs on the runner seam (e.g. ADR 0009 referenced in `runner/client.js`) are evidence: verify the implementation still matches the recorded decision.

### 3.10 Test-doubles + ephemeral environments — Q7 strategy inputs

- Fowler's taxonomy: prefer **fakes** (in-memory `ProjectStore`/`ProjectRegistry` over temp dirs) and **stubs** (mock harness, stub `fetchImpl`) over **mocks** that assert call counts; assert *outcomes* (correct `projectId`, drained queue) not interactions.
- Existing seams to reuse (do not invent new ones): `api/isolatedTestRoots.js` (`tempProjectsRoot`, `tempNotesRoot`, `tempIsolatedRegistryFile`, `tempStateFiles`), constructor injection (`new ProjectStore({ projectsRoot, registryFile })`, `createRunnerClient({ fetchImpl })`, `resolveRunnerBuild({ runGit })`), `runner` harness mock (`api/agent/harnesses/mock/`), `api/project/seedDemo.js` for demo fixtures.
- Ephemeral principle (Testcontainers practice): every multi-project test mints its own roots and deletes them in `afterAll`; no test may read/write the live `~/projects`, `~/.kainbain/projects.json`, or `~/.kainbain/engine/*` (the `testSetup.isolation.js` backstop — verify it still fires, §5).

## 4. Per-check audit playbook — what to run for each question

Each check lists: **framework lens → method → evidence → pass / blocker thresholds**. Severity definitions are in §8; do not downgrade a blocker because "it works for kainbain".

### Q1 — Switch projects without interrupting others

- Lens: 25010 portability + reliability; Twelve-Factor IX; Bulkhead.
- Method (29119 state-transition): seed projects A and B (synthetic, §5); start a long task in A (mock harness, slow stage); switch active project to B; complete a task in B; then verify A's task continued (heartbeats advancing, no re-claim, no lease loss) and B's completion did not touch A's worktree/docs/session.
- Evidence: daemon + backend logs showing A heartbeat continuity across the switch; `runner/project.js` worktree listing before/after; `api/sessionStore.js` TTL/sweep state.
- Pass: zero A-task interruption attributable to the switch. Blocker: switch cancels/reassigns/kills A work, or A's queue position is lost.

### Q2 — Multiple projects collapse to one queue

- Lens: Competing Consumers + Priority Queue/fairness; SRE Ch.5; KEDA scale-on-depth; 25010 capacity.
- Method: one runner configured with `KAINBAIN_RUNNER_PROJECTS=pA,pB` (via `runner/config.js`); enqueue N tasks for A, M for B, including an A-burst; observe claim order and completion. Repeat with A idle, B idle, and one project unregistered mid-burst.
- Evidence: `dispatchClaim({ projectIds })` request/response logs (`runner/client.js`, `runner/daemon.js` dispatch loop), per-project completion counters, queue-depth metric over time.
- Pass: both projects drain; no unbounded starvation (define the window in the test plan, e.g. every claimable task claimed within X s under load); burst from A does not delay B past the SLO. Blocker: per-project silos (separate queues the runner cannot see), head-of-line blocking, or silent task drops.
- Hitch (non-blocker): fairness is FIFO-only with no quota — record as a capacity tradeoff (ATAM) with a follow-up, not a correctness failure.

### Q3 — Load / unload projects from runners

- Lens: Twelve-Factor III/IX; Compensating Transaction; ATAM lifecycle; 25010 installability/recoverability.
- Method (state-transition: unloaded → loading → active → draining → unloaded → re-loaded): register/adopt project C (registry file + `ProjectStore` rescan); start a task; unload C mid-task; verify: no new claims for C, in-flight task either completes or is fenced/parked (`kb-recovery/*`), worktree handled per `reapTaskWorkdirIfTerminal`; re-load C; verify it re-registers cleanly with no duplicate/orphan state. Check the advisory-failure contract: corrupt/missing `projects.json` degrades to "no registered entries", never a broken boot (`api/projectRegistry.js`).
- Evidence: registry file diffs, runner config diffs, worktree/orphan listings (`listOrphanWorkdirs`, `reapTerminalOrphanWorkdirs`), claim-rejection codes after unload.
- Pass: unload is safe (no lost work, no zombie claims), re-load is idempotent (`registerProjectPath` no-op on re-register). Blocker: unload deletes unpushed work, leaves half-claimed tasks, or requires a runner/backend restart to take effect.

### Q4 — Runners take tasks from multiple projects

- Lens: OWASP ASVS V4/V5 + A01/BOLA; Competing Consumers; 25010 functional suitability.
- Method: one runner, projects A+B; enqueue interleaved tasks; assert every `claim`/`progress`/`verifySha`/`steerAck`/`integrationReport` call carries the task's own `projectId` and `executionId`; then negative tests: replay A's assignment against B's task (wrong `projectId`, stale `epoch`) and expect rejection.
- Evidence: captured runner-client call log (stub `fetchImpl` asserting payloads, as in `runner/client.test.js`), backend rejection codes.
- Pass: 100% correct `projectId` attribution; cross-project replay rejected with fencing errors. Blocker: any cross-project write, claim, or report accepted.

### Q5 — No hard-coded / assumed `kainbain` core project

- Lens: ATAM coupling; 25010 modularity/reusability; OWASP default-tenant.
- Method: §7 hunt (grep + AST + runtime rename test). Runtime test is decisive: rename/copy the core project to a non-`kainbain` slug in synthetic roots and run Q1–Q4 — everything must pass. Any code path that only works when the core project is named `kainbain`, is first, or is active is a finding.
- Evidence: grep hit list with disposition per hit (true assumption vs benign string vs test fixture), rename-test results.
- Pass: zero true assumptions. Blocker: any default/fallback/seed/UI path that requires the `kainbain` project to exist (see §7 for known hotspots: active-project fallback in `api/projectResolution.js`, demo seeding, docs-path defaults).

### Q6 — Per-project custom skills + shared core skills

- Lens: overlay/shadowing pattern; 25010 reusability; 29119 equivalence partitioning (shadowed / unshadowed / missing / invalid skill).
- Method (29119 decision table): global skill `S` with no overlay → core body injected; overlay `S` in project A only → A sees overlay, B sees global; invalid overlay (bad frontmatter/`KB_config.json`) → listed `invalid: true`, never throws, stage still runs (`skillsRegistry.js` contract); oversized skill → size-cap omission marker (`skillInjection.js`); core skill attached to stages in *different* projects with different `stage.skills[].config` keywords → each project resolves its own keywords (no cross-project keyword bleed).
- Evidence: `mergeSkillSources`/`loadSkill` resolution traces per project, injected prompt sections per project/stage, UI "Shadows default" rows.
- Pass: independent overlays, core skills reusable across projects, shadowing is per-project (A's overlay never changes B's resolution). Blocker: overlay leaks across projects, invalid skill crashes a stage, or core skills only work for the core project.

### Q7 — Test without creating real projects

- Lens: 29119 process; Fowler test-doubles; Testcontainers ephemeral principle.
- Method: §5 in full. Count real-project writes during the audit (must be zero); every test must mint and delete its own temp roots.
- Evidence: test file list + `afterAll` cleanup proof + live-roots untouched check (mtime/content hash of `~/projects`, `~/.kainbain/projects.json` before/after the audit run).
- Pass: full Q1–Q6 matrix executable synthetically. Blocker: any check that *requires* a real project to validate (means the seam is untestable — 25010 testability failure).

### Q8 — Production-level workloads

- Lens: SRE SLOs/error budgets/capacity; 25010 performance efficiency + reliability; RED/USE.
- Method: §6. Declare SLOs first (SRE Ch.3); then run the load profile; then the failure drills (runner kill mid-task, backend restart mid-dispatch, poison task, full disk/worktree cap).
- Evidence: SLO definitions, load results vs SLO, golden-signal dashboards/metrics, drill outcomes.
- Pass: SLOs defined and met under the agreed profile + drills recover without cross-project damage. Blocker: no SLO, or SLO missed, or any drill causes cross-project loss.

## 5. Synthetic / no-real-projects strategy (Q7) — guardrails

The user constraint is absolute: **do not create real projects** (the fleet already carries many dummy projects). The auditor's job is to prove Q1–Q6 with synthetic fixtures only.

1. **Reuse the existing isolation backstop — never bypass it.** Every test file imports `api/isolatedTestRoots.js` *first* (before any `api/config.js` transitive import), which sets `PROJECTS_ROOT`, `NOTES_SPACE_ROOT`, and `KAINBAIN_PROJECTS_REGISTRY_FILE` to per-file `mkdtemp` dirs and mints per-file engine-state temp files. Verify `api/testSetup.isolation.js` still fails any suite that touches the live roots. If the backstop is missing or silent, that is a blocker for Q7 (untestable seams).
2. **Constructor/env injection, not globals.** `new ProjectStore({ projectsRoot, projectsRoots, notesRoot, registryFile })`, `createRunnerClient({ backendUrl, fetchImpl })`, `resolveRunnerBuild({ runGit })`, and runner `config.js` env (`KAINBAIN_RUNNER_PROJECTS`) are the seams. Tests pass temp values explicitly; no test edits the live registry or `~/projects`.
3. **Fixture shapes (29119-4):** two to three minimal synthetic projects (`proj-alpha`, `proj-beta`, optionally `proj-gamma`) as temp dirs containing only `.kainbain/project.json` (+ optional `skills/<name>/SKILL.md` overlay) and a git repo (bare or worktree as the test needs). No real remotes; git ops point at local temp remotes.
4. **Doubles:** mock harness (`api/agent/harnesses/mock/`) for slow/fast/failing stages; stub `fetchImpl` recording method/path/body for claim/dispatch assertions; in-memory fakes for `ProjectRegistry` where the file layer is not under test. Never mock the queue itself for Q2 (Twelve-Factor X parity) — mock the harness, keep the real dispatch path.
5. **Cleanup contract:** every fixture is created in `beforeEach`/`beforeAll` from temp roots and deleted in `afterAll` (the `isolatedTestRoots.js` header contract). Each test file mints its own roots — tests never share a registry file.
6. **Contamination check (run before and after the audit):** hash/ls `~/projects`, `~/.kainbain/projects.json`, `~/.kainbain/engine/*`; assert unchanged. Any audit step that writes live roots is stopped and reported as a process failure, not worked around.
7. **What "dummy projects already loaded" means for the audit:** treat existing dummy projects as *read-only evidence* of discovery behaviour (e.g. `ProjectStore` multi-root scan, `projectStore.multiroot.test.js`), never as mutation targets. If a check needs a clean slate, build it in temp roots — do not delete or rename live dummies.

## 6. Production workload & capacity method (Q8)

1. **Declare SLOs first (SRE Ch.3).** Minimum set the auditor must propose and then measure: (a) cross-project correctness = 100% (no silent mis-attribution — this is an error-budget-zero item); (b) dispatch latency p95 under the agreed profile; (c) claim success rate; (d) runner-fleet availability. If the team cannot agree SLOs, the audit verdict is "not yet measurable" — do not issue "production ready".
2. **Load profile (29119 load/performance type):** concurrent projects × tasks-per-project × burstiness, with at least: steady state, single-project burst (noisy neighbour), all-project burst, and sustained queue depth. Tool of auditor's choice (k6 or Locust recommended); record tool + script version in the evidence pack.
3. **Queueing check:** apply Little's law (`L = λW`) as a sanity oracle: predicted queue depth from arrival rate × wait time must match observed depth within tolerance — divergence indicates dropped or duplicated claims.
4. **Capacity limits to verify:** `WORKTREE_CAP` eviction behaviour (LRU + stale guard + `kb-recovery/*` parking, never deletion), git-lock contention (`workdirChains`), claim epoch fencing under retries, skill-injection size caps under many-skills-per-stage. Each limit must degrade *per project* (Bulkhead), never globally.
5. **Failure drills (SRE Ch.17):** kill a runner mid-task; restart backend mid-dispatch; submit a poison task (always-failing stage/skill/repo); fill worktrees to cap; unload a project mid-task (ties to Q3). Pass = recovery without cross-project loss; any cross-project damage is a blocker.
6. **Observability gate (OTel + golden signals):** the §3.8 metric set must exist and be queryable for the load+drill window. Missing signals = unverifiable = fail the Q8 gate until instrumented.

## 7. Hard-coded `kainbain` hunt — method for Q5

Run all three passes; a hit in any pass needs a disposition (true assumption / benign / fixture).

- **Pass 1 — text search:** `kainbain` / `KainBain` / `KAINBAIN` across `api/`, `runner/`, `shared/`, `frontend/src/` (case-insensitive), excluding tests, docs, and version stamps. Flag: default project names/ids, "first project" logic, fallback-to-active, demo/seed paths (`api/project/seedDemo.js`), docs/UI strings naming the core project as the user, env-var defaults that name a project.
- **Pass 2 — structural search:** `getActiveProject()` callers (fallback semantics in `api/projectResolution.js` and routes); any `projects[0]` / `find(... ) ?? projects[0]` selection; any slug/alias defaulting to `kainbain`; any skill path or `SKILL.md` resolution that assumes the core project's overlay dir.
- **Pass 3 — runtime rename test (decisive):** in synthetic temp roots, copy the core project under a non-`kainbain` slug, remove/rename any `kainbain` project, and re-run Q1–Q4 + Q6. Everything must pass. A failure here is a blocker regardless of Pass 1–2 silence.
- Known hotspots to check first: `api/projectResolution.js` (active-project fallback leaking into runner paths), `api/projectStore.js` scan/seed defaults, `api/docsPath.js` / `api/kainbainDir.js` (per-project state-dir naming — must be project-agnostic), `api/skills/*` (global library reads must not assume the core project's dir), `runner/config.js` defaults, frontend "current project" defaults.

## 8. Severity, blocker thresholds, and entry/exit criteria

| Severity | Definition (audit-specific) | Effect on verdict |
|---|---|---|
| **Blocker** | Breaks a Q1–Q8 must-have: cross-project data loss/corruption, cross-project unauthorised access, interruption of another project, unload deleting work, single-queue starvation/drop, hard-coded `kainbain` assumption, untestable seam (Q7), SLO defined and missed. | Audit verdict = **NOT production-ready** until fixed and re-tested. |
| **Hitch** | Works, but with documented pain: FIFO-only fairness with no quota, missing observability for one behaviour, toil scaling per project, eviction needing manual cleanup. | Production-ready *with* recorded follow-ups + owners; does not block. |
| **Observation** | Improvement opportunity with no behavioural impact (docs, naming, minor metric gaps). | Non-blocking; list in report. |

- **Entry criteria (before auditing):** isolated-roots backstop verified (§5); synthetic fixtures for ≥2 projects buildable; SLOs proposed (§6.1); audit contamination snapshot taken (§5.6).
- **Exit criteria (to declare production-ready):** every Q1–Q6 check passes synthetically; Q7 contamination check clean; Q8 SLOs met + drills recovered; §7 hunt has zero true assumptions; all blockers fixed and re-tested; evidence pack (§9) complete. A pass claim without any one of these is invalid.

## 9. Evidence pack — what the auditor must deliver

1. **Framework-anchored findings register:** one row per finding — `question (Q1–Q8) | framework + clause | severity | evidence (file:line / log / metric) | reproduction | status`.
2. **Per-check results (§4):** pass/blocker per question with the exact commands, fixture shapes, and oracles used (29119-3 documentation).
3. **Synthetic-test inventory (§5):** test files, temp-root cleanup proof, contamination before/after hashes, confirmation that zero real projects were created or mutated.
4. **Load + drill report (§6):** SLO definitions, load tool/script versions, results vs SLO (including Little's-law check), drill outcomes.
5. **Hard-coding hunt (§7):** hit list with per-hit disposition + rename-test results.
6. **Skills matrix (§4 Q6):** shadowed/unshadowed/missing/invalid/oversized cases per project with resolution traces.
7. **ADR/tradeoff log (§3.9):** queue-fairness, unload-semantics, and shadowing tradeoffs with decisions (or "no ADR exists — recommend creating one").
8. **Verdict statement:** production-ready / ready-with-hitches / NOT production-ready — derived strictly from §8 exit criteria, citing the clause that decides it.

## 10. References (pinned 2026-11-15)

- ISO/IEC 25010:2023, *Systems and software Quality Models* (supersedes 2011).
- ISO/IEC/IEEE 29119-1/-2/-3/-4 (2022), -5 (2025), *Software testing*.
- Beyer et al., *Site Reliability Engineering* (O'Reilly, 2017), Ch. 3, 5, 7, 10, 17–19; *SRE Workbook* (2018).
- Wenger et al., *The Twelve-Factor App* (12factor.net, rev. 2023).
- Microsoft Learn, *Azure Architecture Center — Design patterns* (Bulkhead, Competing Consumers, Priority Queue, Idempotent Consumer, Circuit Breaker, Poison Pill, Compensating Transaction), accessed 2026-11-15; Hohpe, *Enterprise Integration Patterns* (Addison-Wesley, 2003).
- OWASP *Application Security Verification Standard* 4.0 (V4 access control, V5 validation) and *Top 10:2021* (A01 Broken Access Control).
- CNCF *Kubernetes multi-tenancy* guidance; KEDA *ScaledObject / queue-length scaling* documentation.
- OpenTelemetry *Specification 1.x*; SRE *RED/USE method* and *four golden signals*.
- Bass, Clements & Kazman, *Software Architecture in Practice* (ATAM); Brown et al., *C4 Model*; Nygard, *Architecture Decision Records* (2011).
- Fowler, *Mocks Aren't Stubs* / test-doubles taxonomy (martinfowler.com); ISTQB *Syllabus v4.0* test design techniques.
- NIST CSF 2.0 (2024) / ISO/IEC 27001:2022 Annex A.8 (supporting slices only — runner credentials, registry handling).
- DORA / *Accelerate* (2018) throughput–stability metrics (supporting, for Q8 reporting).

## 11. Auditor's one-page summary

Audit to **ISO 25010** as the spine, **29119** for every test, **SRE** for the production bar, **Twelve-Factor** for runner lifecycle, **named queue patterns** for Q1–Q4 behaviour, and **ASVS V4/V5** for cross-project authorisation. Prove Q1–Q6 with **synthetic temp-root fixtures** behind the `isolatedTestRoots` backstop (never real projects), hunt hard-coding with **grep + structural search + the decisive rename test**, and declare production readiness only against **pre-declared SLOs + failure drills + complete evidence**. Everything else is a hitch or an observation.



