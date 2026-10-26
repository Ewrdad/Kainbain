# Lessons & Tailoring — What KainBain Should Learn from EGM, and How to Adopt It

Ordered by value/effort. Every proposal names the KainBain seam it lands in. EGM is Apache-2.0, so porting skill/persona/standard text is license-compatible (keep attribution; EGM is "not an officially supported Google product").

## 1. The lessons (what EGM teaches)

1. **KainBain's core architecture is independently validated.** "One session per stage" (`docs/KB Architecture.md`) *is* the Goldfish; distilled-reports-not-transcripts *is* artifact-first handoff. Google's team spent a year discovering the same principles KainBain's architecture already encodes (context rot, confirmation bias, oversized histories stalling providers — the KB-9940 rationale in the architecture doc reads like EGM's failure-mode list). This is strong evidence the architecture is right; the work now is the *methodology layer on top*, not the substrate.
2. **The missing layer is automated adversarial review between plan and implementation.** EGM's central claim: a zero-context critic finds hallucinations and blind spots that the authoring context cannot, and ~30% of critic findings are highly valuable. KainBain currently inserts only a *human* review there. The cheapest quality-per-dollar improvement available is a Goldfish review stage.
3. **Rubrics must be versioned, loadable standards — not prose buried in prompts.** EGM's five `document_standards/*.md` files are the review contract. KainBain's skills library is the right delivery mechanism; it currently ships *procedural* skills (how to report, how to fail) but no *evaluative* rubrics.
4. **Enforce structurally what EGM can only enforce by prompt.** EGM's NO CODE rule is prompt text (wrapped in a "silent guard" that forbids the agent from ever mentioning the rule). KainBain tracks `modifiedFiles` per stage already — a design stage that modifies files can be *failed by the engine*, not just scolded by a prompt. Same for verdicts (already structural: `api/agent/verdictContract.js`).
5. **Cheap deep context beats big context.** "Peanuts and hay" (recursive READMEs) and `sizeof(docs) << sizeof(code)` mean Elephant stages don't need to read source to understand a system — a generated, human-verified doc hierarchy suffices. KainBain's `AGENTS-MAP.md` proves the value by hand; it should be *generated and maintained* like EGM's bootstrap.
6. **Artifacts need semantic structure to be reviewable and drift-checkable.** FeatureRange/DetailedRange split + provenance watermark make docs machine-targetable. KainBain's stage reports (`api/watch/stageReports.js`) are free-form markdown; adding sections + provenance unlocks targeted review and drift checks.
7. **Drift is a first-class, periodic job — not a one-time write.** EGM runs `/egm-drift-report` on a schedule against checked-in specs. KainBain checks *its own* docs in tests; it does not check *task plans against merged code*.
8. **Governance scales the method.** EGM's `AI_POLICY.md` (design-doc PR before implementation PR; no threshold-evading splits; human accountability checkbox) is what makes the method safe at team scale. KainBain has all the *machinery* (separate agent/human/ci/merge stages, review baselines, git safety) but hasn't codified the *policy* as a workflow template.
9. **Anti-sycophancy is a review feature, not a personality quirk.** EGM's critique-first/counter-argument/banned-flattery battery is a *persona*, attachable to any review pass. KainBain has no equivalent attachable critic persona.
10. **Name the method.** "Feed the Elephant; test it against the Goldfish" is memorable. KainBain operators currently have no vocabulary for "this stage drafts with context" vs "this stage verifies without it."

## 2. Tailoring proposals (ordered)

### P1 — Add a Goldfish review stage to the default workflow (highest value)

Insert an **agent** stage between `Plan` and `Review Plan` (or replace/augment the human stage's input) that runs EGM's sequential review pipeline against the Plan stage's report. Because KainBain is serial (single active runner), use EGM's *sequential gated pipeline* (`/egm-review`), **not** `egm_review_loop`'s concurrent fan-out.

- **Seams:** `api/project/stageNormalizers.js` (`DEFAULT_STAGES`); stage `skills` attachment (`api/skills/skillInjection.js`); verdict contract for findings (`api/agent/verdictContract.js`); report handoff via `{{latestReport:plan}}` (`api/promptCuration.js`).
- **Shape:** one agent stage, internally sequential: zoom-out → comprehension → critic → readiness, each pass a *sub-run* writing findings into one consolidated report (serial fan-in, EGM's `synthesizer` role). Fail the stage (with `KAINBAIN_REASON`/`KAINBAIN_FIX` pointing at the plan report) when findings exceed a severity threshold; the existing `failback` routing sends the task back to `Plan` with the findings in `failureDetails` — this is exactly EGM's gate loop, expressed in KainBain's routing graph.
- **Content to port:** EGM personas `zoom_out.md`, `comprehension.md`, `design_critic.md`, `implementation_readiness.md` + the four rubrics, as four attachable skills (see P2).

### P2 — Port EGM's five document standards as KainBain skills

New skills under `skills/`: `egm-zoom-out`, `egm-comprehension`, `egm-feature-spec` (critic), `egm-readiness`, `egm-heilmeier` — each a `SKILL.md` + `KB_config.json` carrying the rubric as the stage's evaluation contract, attachable per stage like `stage-verdict`. This fills KainBain's "procedural skills only" gap with *evaluative* standards.

- **Seams:** `skills/` registry format (`api/skills/skillsRegistry.js`); `shared/promptLayout.js` `skills` section token; `MANDATORY_LAYOUT_TOKENS` guards.
- **Note:** EGM's standards are deliberately model-agnostic prose — they port cleanly. Keep the Heilmeier standard for intake (P3) and the re-implementation standard for the bootstrap output (P5).

### P3 — Heilmeier catechism at task intake

Require the 8 Heilmeier questions (objectives, state of the art, new approach, impact, risks, cost, timeline, metrics & exams) in the `Idea` stage's report (or the `creating-new-tickets` skill's intake template). Cheap, and it front-loads exactly the "context loading" EGM's Step 1 demands.

- **Seams:** `skills/creating-new-tickets/SKILL.md`; `api/work/` task creation; stage report template.

### P4 — Make the design-phase "NO CODE" rule structural

`Idea`, `Technical Elab`, and `Plan` stages should **fail (or hard-warn) when `modifiedFiles` is non-empty**. KainBain already records per-stage modified files (timeline `+0 -0` entries in `docs/tasks/<id>/task.md`; `generateStageReportContent` files list). Enforcement in `api/flow/stageExecution.js` turns EGM's prompt-only guard into an engine invariant — and it's *transparent* (the failure reason is logged and shown), unlike EGM's silent guard.

- **Seams:** `api/flow/stageExecution.js`; `api/watch/stageReports.js`; stage config (a `noCode: true` flag on the stage, off by default for backward compatibility).

### P5 — Bootstrap skill: generate the "peanuts and hay" for target projects

Port `egm_bootstrap` as a KainBain skill/stage that recursively generates per-directory README/AGENTS-MAP-style docs bottom-up with **idempotent sentinel-block upserts** (generated regions delimited by HTML sentinel markers; human content preserved byte-for-byte — `docs/designs/bootstrap.md` §2.7). This gives every Elephant stage cheap deep context on *any* target project, and turns KainBain's hand-maintained `AGENTS-MAP.md` into a generated artifact.

- **Seams:** `api/skills/` (new skill); `api/house/` (safe atomic file writing exists — reuse it); `docsPath.js` (`resolveDocsDirName`).

### P6 — Report structure standard: semantic sections + provenance watermark

Extend `generateStageReportContent` (`api/watch/stageReports.js`) with EGM's draft structure: a high-level **Design decisions** section (FeatureRange analogue), a **Changes & files** section (DetailedRange analogue), **Alternatives considered**, and a **provenance footer** (model, harness, attached skills, prompt-layout version, timestamp). This makes reports targetable by P1's reviewers and diffable by P7's drift check.

- **Seams:** `api/watch/stageReports.js`; `shared/promptLayout.js` (`reporting` token); must stay backward-compatible with existing report rendering (`frontend/src/components/reports/ReportViewer.jsx`).

### P7 — Drift stage: plan ↔ merged code

Add an optional `ci` or `agent` stage that runs a drift check between the `Plan` stage's report (files it promised to touch) and the actual merged state — EGM's `egm_drift_report` logic, adapted to KainBain's serialized, disk-persisted world (grep/structure checks per promised file; report-only diffs, never praise). KainBain's existing test-enforced docs integrity (`api/siteDocs.js` + tests) is the in-repo precedent; this extends it to per-task artifacts.

- **Seams:** `api/flow/commandStages.js` (ci stage commands); `api/watch/stageReports.js` (report parsing); `api/git.js` (diff/status primitives).

### P8 — Critic persona skill (anti-sycophancy, minus the concealment)

Port EGM's review-skill execution constraints as an attachable `egm-critic` skill: critique-first, generate counter-arguments, no flattery, no echo-chamber, plain-English standard. **Explicitly drop** the "silent enforcement / no meta-talk / no summaries" instructions — they hide the rules from the operator, which conflicts with KainBain's structured logging and report-first culture. The substance (adversarial posture) is the lesson; the concealment is the anti-pattern.

- **Seams:** `skills/` registry; attach to P1's review stage and any human-review-prep stage.

### P9 — Contradiction audit on steering

When a follow-up/steering message (`api/taskStore.js` `followUpTask`) contradicts the task's earlier goals or stage reports, the *next* stage should be required to flag the contradiction in its report rather than silently comply — EGM's contradiction-audit rule, made structural by storing steering history in the task record and surfacing it in the `failureDetails`/task-goal prompt sections.

- **Seams:** `api/taskStore.js`; `api/promptCuration.js` (task-goal assembly); `docs/tasks/<id>/task.md` timeline (already records steering events).

### P10 — Codify two-stage PR governance as a workflow template

Ship a "Spec-First PR" workflow template (design-doc agent stage → human review of the doc → implementation agent stage → ci → merge) mirroring EGM's `AI_POLICY.md` two-stage alignment, and adopt it for KainBain's own development (the repo already runs KainBain on itself — task timelines show `Requirement refinement` stages). Include the "no artificial splitting" norm in `agents.md`/`docs/KB Code Standards.md`.

- **Seams:** `api/project/workflowDefaults.js` (a second named workflow); `api/flow/humanGitSafety.audit.js`; `api/reviewAssembly.js` (review baseline at merge).

### P11 — Ship EGM itself as a KainBain skill bundle (composition, not reimplementation)

Because EGM is a portable Agent Plugins 1.0 package and KainBain's harness boundary already supports antigravity/vibe/opencode/custom harnesses, KainBain stages can *invoke* EGM skills (e.g. an Elephant stage that runs `/egm-brainstorm` + `/egm-draft` inside the harness) rather than reimplementing them. P1–P8 are the *native* ports; this is the *composable* option for users who want the full EGM loop inside one stage. Watch the support-tier honesty rule (EGM's Cowork/ChatGPT trace-verification gaps, issues #105/#106) when wiring harnesses.

- **Seams:** `api/agent/harnessRegistry.js`; `api/skills/skillInjection.js`; EGM `docs/harnesses.md` delegation table.

### P12 — Vocabulary: Elephant/Goldfish stage tags

Tag default stages `Elephant` (Idea, Technical Elab, Plan — context-rich drafting) and `Goldfish` (review, CI — isolated verification) using the existing free-form stage tags (`shared/stageTags.js`), document the convention in `docs/KB Architecture.md`, and let it drive contract differences later (e.g. Goldfish stages get a restricted reading list à EGM's `GoldfishContext` default: only files the target report references).

- **Seams:** `shared/stageTags.js`; `api/project/stageNormalizers.js`; workflow canvas tag filters (`frontend/src/components/workflow/hooks/useStageTagFilter.js`).

## 3. Suggested sequencing

1. **Week 1:** P2 (port the rubrics as skills — pure content, no engine change) + P3 (Heilmeier intake). Measure: attach to existing stages, no new machinery.
2. **Week 2–3:** P1 (Goldfish review stage in the default workflow) using P2's skills; P4 (structural no-code guard) as the first engine invariant.
3. **Then, by payoff:** P6 (report structure) → P7 (drift stage) → P5 (bootstrap) → P8/P9 (critic persona, contradiction audit) → P10 (governance template) → P11 (EGM bundle composition) → P12 (tags/vocabulary, can land anytime — it's free).

## 4. What NOT to copy from EGM

- **The "silent guard / no meta-talk" pattern** (`resources/execution_instructions.md`). Hiding constraints from the user is manipulative and unobservable; KainBain's design principles are transparency (structured logs, reports, verdicts) and server authority. Encode rules in the engine (P4), not in concealed prompt text.
- **Concurrent swarm fan-out as the default.** `egm_review_loop` runs reviewers in parallel; KainBain's single-active-runner invariant (`api/flow/singleActiveInvariant.test.js`) forbids concurrent agents — and the agent-swarms research (`docs/research/agent-swarms-comms/`) shows why that's a safety property, not a limitation. Use the sequential gated pipeline.
- **Prompt-only enforcement where the engine can enforce.** EGM relies on prompt discipline for NO CODE, artifact-first, and one-question rules because it lives inside a chat harness. KainBain has an engine; use it (P4, P9).
- **Big-bang adoption.** EGM's own FAQ: don't use the full loop for everything; "What's important now?" Gate P1 behind the default workflow but keep it optional per project; small bugfix workflows shouldn't pay the review tax.
- **EGM's PR-size thresholds as literal policy.** The 100-line / 3-file triage line is tuned to EGM's repo. If KainBain codifies two-stage governance (P10), pick thresholds from KainBain's own review data (`docs/research/harness2/` lesson #1: mine the verdicts you already have).

## 5. How this connects to KainBain's existing research

- `docs/research/harness2/harness2-kainbain-learnings.md` — same thesis from a different angle ("the model is frozen, the wins are in the scaffolding"). Its #2 (split stage prompts into procedure vs domain) is the *prompt-level* version of P1's persona split; its #1 (persist joined verdict records) is the *measurement* layer for evaluating P1's payoff.
- `docs/research/agent-swarms-comms/06-kainbain-implementation.md` — its "one session per stage kills live chat; use disk-mediated mailboxes" is the same Goldfish invariant; a Goldfish review stage needs no comms channel at all — the report *is* the channel.
- Both prior pieces assume KainBain's architecture as given. This research supplies the missing *methodology*: what the stages should do, in what order, against what rubrics.
