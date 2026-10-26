# KainBain — Strengths, Weaknesses & How to Win the Muse Hackathon 2026

> **Date:** 2026-10-25 · **Method:** Read the live codebase (`~/projects/kainbain`), the
> hackathon docs in this folder, `KB Architecture.md`, ADRs 0001–0007, `ProjectStatus.md`,
> `PRODUCTION_READINESS_REPORT.md`, and the Muse spike — then re-ran the test suites to verify.
> Every number below was observed today unless marked *(stale — re-verify before pitching)*.
> **Verified today:** API `5681 passed, 1 skipped (330 files, 87s)` · Frontend `3759 passed (274 files, 28s)`
> = **9,440 tests green**. Prod code ≈185k LOC; test code ≈329k LOC (tests outweigh product code).

## 0. The one-sentence verdict

**KainBain is not a hackathon prototype — it is a production, self-hosting, harness-agnostic
agent orchestrator with an unusually deep safety story, and that is both its winning edge and
its biggest pitch risk: judges will believe the depth only if you demo it live in 3 minutes,
and will punish every unfinished hackathon deliverable (multi-runner, public open-source repo)
you claim but cannot show.**

Win condition: **pitch the trust system, demo the unattended loop, be brutally honest about
what the runner rewrite has not shipped yet.** Lose condition: pitch breadth (8 harnesses,
9k tests, 185k LOC) as a feature list — judges hear "solo over-engineering" instead of impact.

---

## 1. What KainBain actually is (for pitch framing)

| Claim you can make | Evidence |
|---|---|
| Local-first AI task orchestrator: kanban → multi-stage pipeline → agent executes → human reviews/re-routes | `README.md:1-5`, `ProjectStatus.md §1` |
| Stage types: `agent`, `human`, `review`, `ci`/`script` — one **fresh session per stage**, prior stages contribute distilled reports, never transcripts | `KB Architecture.md` "One session per stage" (anti context-rot, KB-9940) |
| Harness-agnostic engine behind one contract (`AgentHarness`/`HarnessSession`) | `api/agent/harnessContract.js`, `harnessRegistry.js`, `sessionContract.test.js` |
| 8+ harnesses shipping: `pi` (default), `muse`, `codex`, `antigravity`, `vibe`, `opencode`, `custom`, `mock` (+ `acp` folder) | `api/agent/harnesses/` directory listing |
| Repo/filesystem as source of truth — no database; tasks are markdown under `docs/tasks/<id>/` | ADR 0001, `ProjectStatus.md §2` |
| It builds itself: git log is dominated by `KainBain (task …): auto-commit work after stage …` on `kb/*` branches | `git log --oneline -20` (verified today) |

---

## 2. Strengths to lean into (ranked by judge impact)

### S1 — "Prove the process, not the work" — the compliance/trust moat ⭐ LEAN IN HARDEST
This is your most original idea (`Presentation/RoughPlan.md`: *"Allows people to do compliance
in the age of vibe coding… Prove the process not the work"*). Nobody else at a hackathon will
have it. It is implemented, not aspirational:
- **Swiss-cheese failback:** stage fail → auto re-run (max 8 iterations,
  `KAINBAIN_MAX_AUTO_ITERATIONS`), transient retries (5), tool-loop guard (3 strikes),
  review/verdict stages (`skills/stage-verdict`, `api/agent/verdictContract.test.js`),
  human approve/reject-with-feedback gates.
- **Audit trail by construction:** every stage emits a timestamped markdown report to
  `docs/tasks/<taskId>/`; full transcripts persist per stage; git auto-commits per stage.
- **Risk-based unattended operation** — the carer story (§S6) is *why* this exists.
- **Pitch line:** *"Vibe coding asks you to trust the output. KainBain asks you to trust —
  and audit — the process that produced it."*

### S2 — Harness agnosticism as anti-lock-in insurance ⭐
One contract, 8 harnesses, per-project selection, weighted **model aliases**
(e.g. review = 90% Muse / 10% Antigravity to balance quota — smooth weighted round-robin
in `api/aliasSelector.js`, deterministic, tested), canonical `harness::provider::id[::reasoning]`
keys in `shared/modelKeys.js`. Judges from Meta should love: *the engine survives any single
vendor's pricing, outage, or capability change.* Muse is a first-class citizen, not a dependency.

### S3 — Muse integration is already Tier-2 deep ⭐ (your home-turf advantage)
Per `MuseIntegrationSpike.md` + `EngineDetails/MuseHarness.md`: long-lived `muse serve`
MSP host per project, one session per KainBain session, `turn/start|steer|interrupt`,
approval interception, live `model/list` + `session/setModel`, `session/resume` (5 attempts),
`muse exec` rollback (`KAINBAIN_MUSE_MSP=off`). Most entrants will have a `subprocess.run("Muse …")`.
You have a supervised protocol client with contract tests. **Say the numbers:** MSP schema =
70 methods; you use ~10 deliberately and can name the next 3 (see W4 — turn this gap into roadmap).

### S4 — Engineering discipline that survives scrutiny
- 9,440 tests green today; test LOC (329k) > product LOC (185k); colocated tests per
  `KB Code Standards.md`; one-function-per-file + docs-coverage + JSDoc-example gates
  (`npm run docs:check`, `check:one-function`).
- CI on **Linux/macOS/Windows × Node 20/22** (`.github/workflows/`, WP-9) — rare for a solo entry.
- ADRs 0001–0007 record real decisions (storage abstraction after the 134-tasks-vanish
  incident, schema-driven config, git worktree isolation, resume-stall recovery).
- Schema-driven config: one descriptor table (`api/config/schema.js`), malformed env
  **fails boot** instead of running wrong; secrets redacted at `/status/config`.
- Security: Trivy HIGH/CRITICAL = 0, gitleaks/opengrep clean, SBOM shipped
  (`sbom.cyclonedx.json`), CORS hardened *(PRODUCTION_READINESS_REPORT.md §2 — re-run
  `Security_scans.sh` before quoting on stage)*.

### S5 — Accessibility as a finished feature, not a promise
WCAG 2.2 A/AA **conformant**, AAA conformant except 4 documented exemptions — certificate
`accessibility/WCAG_CERTIFICATE_2026-10-25.md` (issued today), audit registers going back to
2026-09-20. For a Meta-adjacent judging panel this is a quiet credibility multiplier.
One screenshot of the certificate beats five minutes of talking.

### S6 — The founder story is true, specific, and memorable ⭐
Full-time carer + full-time employed + "declared war on chat UIs" over earbud notifications
(`Presentation/RoughPlan.md`). Constraints → design: must run 24/7 unattended, must be
trustworthy on return, small local models need small well-defined tasks. **This is your
opening 30 seconds.** Generic "AI agents are the future" openings will lose to it.

### S7 — Compute smoothing / cost story (under-used — develop it)
Serialise-over-parallelise, run overnight on cheap power, full utilisation, "sell by thread"
(RoughPlan). Combined with aliases + per-stage reasoning levels
(`…::high` 4th key segment, `IMPLEMENTATION_SUMMARY.md`) you can claim *cost-shaped
orchestration*: cheap models on mechanical stages, expensive reasoning only where it pays.
No numbers yet — see W6.

### S8 — Portability groundwork is genuinely done
`docker compose up -d` → `:3100` with no credentials (mock/degraded honestly),
`PORTABLE_DEPLOYMENT.md`, ADR 0001–0004 all attack "only runs on the author's homelab."
A fresh-clone judge can run it. Protect this — it is Deliverable #2 and it is testable live.

---

## 3. Weaknesses — what will hurt you, ranked by severity

### 🔴 W1 — No LICENSE, no public repo, and a leaked credential in the git remote (BLOCKER)
- No `LICENSE*` file exists; `license` absent from all `package.json`s. "Open Sourceable"
  (Deliverables #1) is currently **legally false** — nobody may reuse the code.
- The only remote is private Forgejo (`forgejo.local`); worse, `git remote -v` shows an
  **embedded access token in the remote URL**. Rotate that token, scrub the URL
  (`git remote set-url origin <clean-url>`), and check history/notes for the same token
  before any public mirror. Do not let a judge find this first.
- Fix cost: ~1 hour (pick MIT/Apache-2.0, clean public mirror on GitHub/Codeberg, fresh-clone
  test on a clean VM). **Do this before anything else in §5.**

### 🔴 W2 — Hackathon Priority 1 (multi-threading / runner paradigm) is designed, not built
`Deliverables.md` P1 = switch to runner paradigm + Docker engine/UI + native Runner.
Status today: single-process, single embedded runner; `Portability/NewArchitecture.md` is a
proposal and `Portability/RiskAssessment.md` scores it **inherent HIGH / residual MEDIUM**,
16 risks (R01 double-claim/unfenced push, R04 unauthenticated runner channel, R03 backend SPOF…).
The UI is explicitly "not set up to deal with multiple threads." If you pitch parallelism as
shipped, one technical judge probing it ends your credibility. Pitch it as *gated Phase 1
(containerise, keep embedded runner) → Phase 2 (single runner over the wire)*, exactly as the
risk doc recommends — honesty here reads as engineering maturity, evasion reads as vapourware.

### 🔴 W3 — YOLO-by-default undermines the compliance pitch
`KAINBAIN_MUSE_YOLO=1` and `KAINBAIN_VIBE_AUTO_APPROVE=true` are defaults because "no approval
UI exists yet." Your headline is *trustworthy unattended agents*; a security-literate judge will
ask "so the agent has unrestricted shell access?" and the honest answer is currently yes.
Mitigations to name: sandbox-on escape hatches (`KAINBAIN_MUSE_YOLO=0`,
`KAINBAIN_MUSE_APPROVAL_MODE=never`), per-decision approval log lines, git worktree isolation
(ADR 0006), stage scoping. But until an approval/interactions surface exists
(`userInput/answer` is policy-cancelled today), frame it as: *"operator-chosen posture,
audited per decision, with the approval UI as the known next unlock"* — never as "safe by default."

### 🟠 W4 — Muse surface: 60 of 70 MSP methods unwired (opportunity disguised as gap)
From the spike: `goal/set` never sent (goal is prompt text only, `api/promptCuration.js`),
`skill/setActivation` never called (`taste` reachable only by citing it in prompt text),
`session/setReasoningEffort` unused, `--output-schema` unused (verdicts parse free text),
`visionSupport=false` for muse (no screenshot-verify stages). Each is small; together they are
the difference between "integrates Muse" and "uses Muse as a subprocess." The spike's
3 diffs (§6 of that doc) are your highest-value hackathon-week code. See P0-2 in §5.

### 🟠 W5 — Single-host fragility contradicts the 24/7 claim
`PRODUCTION_READINESS_REPORT.md §4.4`: per-project `.kainbain/project.json` (workflow defs,
model routing) **not backed up**; **no off-host backup at all**; backend is a SPOF (R03 residual
stays 8 even in the new architecture). The orchestrator that "runs while you sleep" loses its
workflow definitions if one disk dies. Cheap partial fix: include `~/projects/*/.kainbain/`
in the hourly git backup; state the rest as known debt with the runner plan as the answer.

### 🟠 W6 — No quantified impact (the silent pitch-killer)
Nowhere is there a number for: tasks completed unattended, human minutes saved, cost per task,
success-after-failback rate, or overnight throughput. Judges fund outcomes, not architecture.
You already have the raw material — `docs/tasks/` holds 261 task folders, alias reliability
is computed (`GET /projects/:id/aliases/reliability`), deploy history shows 32 successful
self-deploys *(stale — refresh)*. One evening of log-mining = your entire results slide.

### 🟠 W7 — Complexity & bus factor
185k LOC, ~150 documented env knobs (`.env.example` is 25 KB), 40 KB README, docs sprawl
across 261 task folders + Phase1/Phase2 archaeology. For a solo entrant this cuts both ways:
impressive stamina, alarming maintainability. Pre-empt it: "the engine is small; the surface
is harnesses + tests" and show the harness contract is ~1 file to implement. Never apologise
for size — show the seam that contains it. Also: homelab defaults still leak
(`~/projects` default root, author's paths in docs) — one more fresh-clone pass.

### 🟡 W8 — Presentation assets are rough
`Presentation/RoughPlan.md` is notes, not a deck; no demo video, no 3-minute script, no
one-page leave-behind. The hand-notes (`HandNotesOnParallelism.md`) contain your best diagrams
(queue-by-runner-count UI, runner lifecycle) but as transcriptions. Judges remember the demo,
not the repo tour.

### 🟡 W9 — Smaller, real, fixable
- Verdict stages parse free text (→ W4 `--output-schema`).
- Alias rotation counters are in-memory per process — "statistically correct, not exact,
  across instances" (`KB Architecture.md`) — fine at 1 runner, a lie at N runners (feeds W2).
- `docs` symlink model (ADR 0001) is clever but is the #1 fresh-clone footgun — the
  empty-board incident class. The storage-sanity checklist exists; rehearse it.
- Name: "KainBain" has no discoverable meaning for a cold judge. Give it a one-line gloss
  in the first minute or it becomes friction in every Q&A.

---

## 4. How the deliverables score today (say this, don't oversell)

| Deliverable (`Deliverables.md`) | Honest status | Pitch framing |
|---|---|---|
| Open-sourceable | ❌ Blocked by W1 (no licence, private remote, leaked token) | "Public mirror + licence land this week" — then prove with a judge-side clone |
| Runnable on almost any machine | ✅ Largely done (Docker no-creds boot, 3-OS CI, portable ADRs) | Demo `docker compose up` live; this is your reliability flex |
| Multithreading on agent tasks | ❌ Designed + risk-assessed, not built (W2) | "Architecture + 16-risk register + gated phases" — sell the rigour, not the feature |

## 5. What to work on — prioritised

### P0 — Before you pitch (days, in order)
1. **W1 licence + public mirror + token rotation.** Nothing else matters if a judge can't clone it.
2. **Spike Diff 1 (`MuseIntegrationSpike.md §6`):** send `goal/set` per MSP turn + promote
   `session/goalChanged` to a task-log event + cite `taste` in frontend stage prompts.
   ~10 lines in `msp/museMspSession.js`, echo-provider testable, exec rollback untouched.
   Demoable sentence: *"the goal is a tracked host object, not prose."*
3. **Mine your own logs for 4 numbers (W6):** unattended tasks completed, failback recovery
   rate, deploys self-shipped, est. human hours returned. Put them on slide 2.
4. **Re-run `Security_scans.sh` + full `npm test`** and date-stamp the results you quote.
5. **Write the 3-minute demo script (§6) and rehearse it twice on a clean clone.**

### P1 — Hackathon week (if time after P0)
6. Spike Diff 2: `skill/setActivation` (force `taste` on frontend stages) + `session/setReasoningEffort`
   from stage config. 7. Spike Diff 3: `--output-schema` verdict stages (kills W9 free-text parsing).
8. Add `.kainbain/project.json` to the hourly backup (W5 partial). 9. One-page leave-behind (W8).

### P2 — Roadmap slide only (do not build under deadline pressure)
Runner Phase 1 (containerise, embedded runner) → Phase 2 (single runner over the wire with
lease+fencing token checked at push time, authenticated channel — R01/R04) → approval UI
(unlocks `userInput/answer`, retires YOLO default, W3) → vision stages (`media/upload`, needs
sandbox-on proof R-07). Each line names its risk-register ID — judges reward that traceability.

## 6. The winning pitch (structure + demo)

**Arc (5–7 min):** ① *War on chat* (S6, 30s — personal, funny, true) → ② *The problem:*
agents you must babysit produce work you can't audit → ③ *The idea:* prove the process, not
the work (S1) — stages, verdicts, failback, markdown audit trail → ④ **Live demo** →
⑤ *Why it wins:* any harness, any model, local-first, runs while you sleep (S2/S7) →
⑥ *Honest frontier:* runner parallelism, designed + risk-registered, Phase-gated (W2) →
⑦ *Ask/close:* "steal this" — the patterns (harness contract, stage verdicts, alias routing)
are the contribution even if the product isn't.

**Demo storyboard (3 min, one task, no slides):**
1. Drop a real task on the kanban; show the pipeline (plan → build → review → verdict).
2. Let a stage **fail on purpose** (or show a recorded failback) — watch auto-iteration +
   verdict stage catch it. *This is the moment judges remember.*
3. Open the generated `docs/tasks/<id>/` markdown report — the audit artefact.
4. Show the task log with the Diff-1 `goal/set → goalChanged` rows (P0-2) — Muse depth, visible.
5. End on the board at rest: "I was asleep / at work for all of that."

**Q&A traps — prepared answers:**
- *"Isn't this just a cron job + kanban?"* → No: fresh session per stage with curated context,
  verdict contracts, weighted alias routing across 8 harnesses. Show `harnessContract.js`.
- *"What if the agent does something destructive unattended?"* → Worktree isolation (ADR 0006),
  per-decision approval logs, stage scoping — and concede W3 honestly with the approval-UI roadmap.
- *"Why not just use [incumbent orchestrator]?"* → Local-first, no DB, repo-as-truth, harness-
  agnostic; incumbents lock you to one vendor's agent. Never name-and-trash; contrast on lock-in.
- *"Who else uses it?"* → Don't inflate. "It develops itself — 261 task folders, N self-deploys"
  (your mined numbers) is stronger than a fake logo slide.
- *"Single maintainer?"* → Tests outweigh product code 329k:185k; ADRs + contract tests mean a
  second engineer (or agent) can extend a harness without reading the engine.

## 7. Bottom line for the author

Lean into **S1 (process-not-work) + S6 (your story) + S3 (Muse depth)**. Fix **W1 this week**
(it is the only weakness that can disqualify you outright), ship **Spike Diff 1**, and mine
**four numbers**. Pitch the runner as *rigour*, never as a feature. The codebase already does
the hard thing — your remaining work is almost entirely **proof packaging**: licence, demo,
metrics. That is a winnable position.

*— End of deep dive. Companion docs: [Deliverables.md](./Deliverables.md) ·
[MuseIntegrationSpike.md](./MuseIntegrationSpike.md) ·
[Portability/RiskAssessment.md](./Portability/RiskAssessment.md) ·
[Presentation/RoughPlan.md](./Presentation/RoughPlan.md)*


