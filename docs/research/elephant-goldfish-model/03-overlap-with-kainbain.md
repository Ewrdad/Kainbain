# Overlap — EGM ↔ KainBain, Concept by Concept

All KainBain file references verified against the repo on 2026-10-25. EGM references are to `google/elephant-goldfish-model@main`.

## 0. The one-paragraph alignment

EGM is a **methodology** for one human driving one AI coding agent through spec-first development. KainBain is a **platform** that runs many such pipelines at team scale: multi-stage workflows, a kanban with human review/reject/re-route, serialized execution, per-stage models and harnesses, git safety, and full observability. EGM asks "how should an engineer work with an AI agent?"; KainBain answers "how does a *team* run hundreds of those work items safely?" KainBain is, architecturally, an industrialized EGM — and EGM is the missing *methodology layer* that tells KainBain what its stages should be *for*.

## 1. Mapping table

| # | EGM concept | KainBain equivalent today | Match | File references |
| --- | --- | --- | --- | --- |
| 1 | **Goldfish** = zero-context fresh session that reviews only what's in front of it | **"One session per stage"** — every stage execution begins a brand-new agent session whose only context is the curated prompt: task goal, stage instructions, prior stages' *report artifacts*, failure/steering guidance. "Earlier stages contribute their distilled REPORTS, never the research/conversation." | **Exact** | `docs/KB Architecture.md` ("One session per stage"); `api/watch/stageReports.js` (`saveStageReport`); `api/promptCuration.js` (`{{previousReports}}`, `{{latestReport:<stageSlug>}}`) |
| 2 | **Artifact-first UX** — no chat dumps; deliverables are files; turn-yielding checkpoints | **Stage reports** written to `docs/tasks/<taskId>/` with an auto-report marker; human checkpoints pause the pipeline; report viewer UI | **Exact** | `api/watch/stageReports.js` (`generateStageReportContent`, `AUTO_REPORT_MARKER`); `shared/promptLayout.js` (`reporting` section token); `frontend/src/components/reports/ReportViewer.jsx` |
| 3 | **Spec-driven lifecycle**: brainstorm → draft → review → resolve → implement → drift-monitor | **Default workflow**: `Idea → Technical Elab → Plan → Review Plan (human) → In Progress → Deploy`, with `failback` routing | **Strong, with one gap** (see #4) | `api/project/stageNormalizers.js` (`DEFAULT_STAGES`); EGM `docs/designs/architecture.md` lifecycle |
| 4 | **Goldfish review swarm/pipeline** between spec and code (zoom-out → comprehension → critic → readiness personas + rubrics) | **Only a human "Review Plan" stage.** No automated adversarial review stage exists; review personas/rubrics don't exist as attachable units | **Gap — the main opportunity** | `api/project/stageNormalizers.js` (stage 4 is `type: "human"`); EGM `agents/`, `resources/document_standards/`, ` skills/egm_review/` |
| 5 | **Elephant** = deep-context drafting session (system history, architecture, CUJs) | **Curated per-stage context**: `agentGuide.js` (statuses, stage types, API workflow, WS events) + project docs + `{{previousReports}}` chain + attached skills. But there is **no persistent deep-context session** that accumulates a task's upstream knowledge; each stage re-derives context from reports | **Partial** | `api/agentGuide.js` (`AGENT_GUIDE`, `RECOMMENDED_WORKFLOW`); `api/promptCuration.js`; `shared/promptLayout.js` (`SECTION_TOKENS`) |
| 6 | **Peanuts-and-hay / bootstrap**: recursive README hierarchy as cheap codebase context; idempotent sentinel-block upserts | **Hand-maintained equivalents**: `AGENTS-MAP.md`, `docs/ARCHITECTURE_DOMAINS.md`, `agents.md`. No generator, no sentinel blocks, manual drift | **Partial** | `AGENTS-MAP.md`; EGM `skills/egm_bootstrap/`, `docs/designs/bootstrap.md` |
| 7 | **Versioned document standards / rubrics** loaded at review time (feature-spec, zoom-out, implementation-readiness, Heilmeier, re-implementation) | **Skills library** (`skills/*/SKILL.md` + `KB_config.json`) attachable per stage with `{{keyword}}` interpolation; **layout token guards** (`MANDATORY_LAYOUT_TOKENS`, `CONDITIONAL_LAYOUT_TOKENS`); verdict contract. But no *review rubrics* as first-class attachable standards | **Partial — right shape, missing content** | `api/skills/skillsRegistry.js`, `api/skills/skillInjection.js`; `shared/promptLayout.js`; `skills/stage-verdict/`; EGM `resources/document_standards/` |
| 8 | **Verdict/gate discipline** — findings must carry reason + fix; loops until findings are trivial | **`KAINBAIN_VERDICT: PASS/FAIL` + `KAINBAIN_REASON` + `KAINBAIN_FIX`**; a reasonless FAIL passes open and is flagged for human review | **Exact in spirit** | `skills/stage-verdict/SKILL.md`; `api/agent/verdictContract.js` |
| 9 | **Contradiction auditing** — stop and ask when new input contradicts earlier goals | **Steering/follow-ups** append guidance to the task goal for later stages; no contradiction check | **Gap (small)** | `api/taskStore.js` (`followUpTask`); EGM `resources/execution_instructions.md` |
| 10 | **Anti-sycophancy battery** (critique first, counter-arguments, banned flattery, one question per gate) | Not present as an attachable standard; `question-me` skill batches survey questions up-front (see note below) | **Gap (small)** | EGM `skills/egm_review/SKILL.md` execution constraints; KainBain `skills/question-me/SKILL.md` |
| 11 | **Harness abstraction** — one canonical package, thin adapters, no forked skill text, honest support tiers, "if no fresh-context subagent tool, stop" | **Harness boundary** — engine never sees a harness SDK; `harnessRegistry` + per-project resolver; `harnessContract.js` docs-as-code contract; `sessionContract.test.js` acceptance suite any harness must pass; `harnessBoundary.test.js` regression gate (no SDK leakage); `harnessSupportTiers.js` | **Exact — same pattern, independently arrived at** | `api/agent/harnessRegistry.js`, `api/agent/harnessContract.js`, `api/agent/sessionContract.test.js`, `api/agent/harnessBoundary.test.js`, `api/agent/harnessSupportTiers.js`; EGM `docs/harnesses.md`, `plugin.json` |
| 12 | **Human ownership** — consensus gates, human PR review, accountability checkbox | **Human stages**, kanban review/reject/re-route, `waiting_human` + surveys, merge stage with review baseline, `humanGitSafety` audit | **Exact** | `api/project/stageNormalizers.js` (stage types `human`, `merge`); `api/flow/humanGitSafety.audit.js`; `api/agentGuide.js` (`TASK_STATUSES`); EGM `AI_POLICY.md` |
| 13 | **Two-stage PR governance** (design-doc PR → implementation PR; no threshold-evading splits) | Not codified as policy, but structurally supported: agent stages that write `docs/tasks/<id>/` artifacts, human review stage, separate `ci` and `merge` stages, review baseline recording | **Partial** | EGM `AI_POLICY.md`, `AGENTS.md`; KainBain `api/reviewAssembly.js`, `api/git.js` |
| 14 | **Living specs + drift report** (spec↔code AST scanner, periodic) | **Test-enforced docs integrity** (`siteDocs.integrity.test.js`, `docsPath.test.js`, `promptCuration.docsDir.test.js`, `changelog.test.js`) and per-task decision records in `docs/tasks/<id>/task.md` — but no drift check between a task's *plan* and the *merged code* | **Partial** | EGM `skills/egm_drift_report/`; KainBain `api/siteDocs.js`, `docs/tasks/` |
| 15 | **Serialized review with gates** as the default (concurrency only in the optional review-loop) | **Single active runner** — ExecutionQueue + scheduler busy-gate; at most one live runner | **Exact — and a constraint EGM doesn't have** | EGM `docs/designs/review.md`; KainBain `api/flow/singleActiveInvariant.test.js`, `api/flow/executionQueue.js` |
| 16 | **"Design is the new code"** — the spec is the primary artifact; code is its projection | **Task goal + stage reports are the primary artifacts**; code changes are tracked per stage (`modifiedFiles`, `+0 -0` timeline entries) | **Exact in spirit** | `docs/tasks/<id>/task.md` timelines; `api/watch/stageReports.js`; EGM essay Part 2 |
| 17 | **Clarify-before-draft interrogation** (Step 1: context loading) | **`question-me` skill** — agent generates a survey up-front, writes it to the task folder, marks the stage `waiting_human`; `creating-new-tickets` skill for intake | **Same intent, different surface** | KainBain `skills/question-me/SKILL.md`, `skills/creating-new-tickets/`; `shared/survey.js`; EGM essay Step 1 |
| 18 | **Failure → guided failback** (resolve findings, re-run with fix guidance) | **`failback` routing** per stage + `failureDetails`/`failureGuidance` prompt sections carrying the failure into the next attempt's context | **Exact** | `api/project/stageNormalizers.js` (`failback`); `shared/promptLayout.js` (`failureDetails`, `failureGuidance` conditional/required tokens); `api/flow/stageFailureRouting.js` |

## 2. The pipeline shapes, side by side

EGM lifecycle (plugin):

```
/egm-brainstorm → concepts_brief.md
/egm-draft      → docs/designs/FEATURE.md   (FeatureRange | DetailedRange, watermarked)
/egm-review     → Goldfish findings          (ZoomOut → Comprehension → Critic → ZoomOut → Readiness)
/egm-resolve    → findings applied to the doc
PR (spec) → human review → merge
implement against the doc (fresh session)
/egm-drift-report (periodic)
```

KainBain default workflow (`api/project/stageNormalizers.js`):

```
Idea (agent) → Technical Elab (agent) → Plan (agent) → Review Plan (HUMAN) → In Progress (agent) → Deploy (ci)
                    ▲___________________________________________|
                              failback / reject / re-route (kanban)
```

Stage-by-stage: EGM *brainstorm* ≈ KainBain *Idea*; EGM *draft* ≈ *Technical Elab* + *Plan*; EGM *review + resolve* ≈ **nothing automated** (human-only "Review Plan"); EGM *implement* ≈ *In Progress*; EGM *drift-report* ≈ **nothing** (only repo-level test hygiene). The two missing automated stages are precisely EGM's highest-leverage machinery.

## 3. Where KainBain is *ahead* of EGM

- **Scale and safety**: serialized execution, one active runner, per-stage model/harness selection, git branch isolation per task (`kb/<taskId>` branches), push/merge stages with review baselines, human git-safety audit, stuck/stall recovery, circuit breakers.
- **Observability**: structured `logEntries`, log streaming, stage reports, reliability metrics (`api/watch/`, `api/agent/logStream/`) — EGM's equivalent is "read the artifact."
- **Human-in-the-loop as a first-class stage type** with surveys and steering — EGM's human gates are conversational.
- **Harness breadth**: pi, antigravity, muse/MSP, vibe/ACP, opencode, custom, mock — EGM supports five IDEs/chat surfaces, all interactive.
- **Failure routing as a graph** (failback to previous/start/any, reject with feedback, re-route) — EGM's loop is linear with manual triage.

## 4. Note on the "one question at a time" tension

EGM forbids bundling questions (one question per turn — a chat-UX rule for interactive interrogation). KainBain's `question-me` skill deliberately **batches** a whole survey into one artifact because stages are asynchronous and round-trips are expensive. These are not in conflict: the shared principle is *front-load clarification before deep work, and minimize round-trips relative to the surface*. EGM's rule is tuned to a chat window; KainBain's to a queue. Keep both as-is.

## 5. Vocabulary opportunity

KainBain stages already carry free-form **tags** (`shared/stageTags.js`: up to 12 tags, normalized, filterable on the board). Tagging stages `Elephant` (context-rich drafting: Idea, Technical Elab, Plan) vs `Goldfish` (isolated verification: review stages, CI) would make the method legible to operators and would let the engine apply *different contracts* per class — e.g. Elephant stages may read broadly; Goldfish stages get a restricted reading list (mirroring EGM's `GoldfishContext` input, which defaults to *only* the files the design doc references).
