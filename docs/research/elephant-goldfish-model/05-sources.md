# Sources

Research performed 2026-10-25. EGM repo state: `google/elephant-goldfish-model@main` (created 2026-09-13, last push 2026-10-25, 743 stars, Apache-2.0, "not an officially supported Google product").

## Primary sources (EGM)

| Source | What was taken |
| --- | --- |
| <https://github.com/google/elephant-goldfish-model> — `README.md` | Identity of the project (method + skill set for spec-driven development, not a model), install matrix, skill table, philosophy summary, license. |
| `docs/index.md` | Elephant/Goldfish/Human definitions, benefits (velocity, accuracy, team), the goldfish-memory footnote. |
| `docs/designs/architecture.md` | The four failure modes (hallucination cascades/context pollution, weeds syndrome, chat dump fatigue, documentation drift), four design principles, four subsystems, five-phase lifecycle, artifact-first UX protocol, alternatives considered. |
| `docs/designs/review.md` | The five-phase gated review pipeline (Zoom Out → Comprehension → Critic → intermediate Zoom Out → Implementation Readiness), persona↔rubric mapping, self-review failure modes. |
| `docs/designs/draft.md` | Section-by-section drafting, FeatureRange/DetailedRange semantic split, provenance watermark, exhaustive file enumeration without code. |
| `docs/designs/brainstorm.md` | 6-lens shootdown swarm lenses, `concepts_brief.md` synthesis structure. |
| `docs/designs/bootstrap.md` | Recursive bottom-up README generation; idempotent sentinel-block upserting (§2.7). |
| `docs/harnesses.md` | One-canonical-manifest rule, no-forked-skill-text rule, persona adapters, delegation table, "a Goldfish review needs a fresh context… stop instead", artifact-directory config, support tiers and harness-contribution bar. |
| `docs/getting_started.md`, `docs/faq.md` | Core loop; honest caveats (review bottleneck, velocity depends, don't use for everything). |
| `resources/execution_instructions.md` | NO CODE guard, consensus gates, one-question rule, contradiction auditing — and the "silent enforcement / no meta-talk" pattern flagged as an anti-pattern in `04-lessons-and-tailoring.md` §4. |
| `resources/document_standards/*.md` | The five rubrics: feature-spec (Alternatives Rule), zoom-out (YAGNI, anti-weeds, leverage-existing), implementation-readiness (Zero-Decision Rule), Heilmeier catechism, re-implementation (Zero-Assumption Rule). |
| `skills/*/SKILL.md` (review, brainstorm, draft, drift_report, resolve, review_loop, bootstrap) | Skill mechanics, anti-sycophancy execution constraints, drift-report strict format, review-loop dispatch modes. |
| `AGENTS.md`, `AI_POLICY.md`, `.github/PULL_REQUEST_TEMPLATE.md` | Two-stage PR governance, triage taxonomy (100-line / 3-file threshold), no artificial PR splitting, human accountability. |
| `TESTING.md`, `tests/`, per-skill `TEST.md`/`test_scenarios.yaml` | Evidence-bar-per-skill pattern, skill load-limit tests, harness test record. |
| Dave Rensin, *Elephants, Goldfish and the New Golden Age of Software Engineering*, Medium, 2026-04-27 (27-min read; updated 2026-10-21) — <https://medium.com/@drensin/elephants-goldfish-and-the-new-golden-age-of-software-engineering-c33641a48874> | The foundational essay: three Aha moments, "design is the new code", "mass-producing our mistakes", the 9-step process, peanuts-and-hay bootstrapping, Part 1 tool-not-toy method (interrogate → rubric → fresh session), Part 3 agent-management prediction. |
| <https://egm.dev> (linked from README; site source in `site/`) | Project landing page (not separately scraped; README badge only). |

## Primary sources (KainBain, repo state 2026-10-25)

| Source | What was taken |
| --- | --- |
| `docs/KB Architecture.md` | Server-authoritative, non-declarative config, DDD, no in-memory storage, **one session per stage** (the Goldfish principle, with the KB-9940 context-rot rationale), locality of code, harness boundary. |
| `api/project/stageNormalizers.js` (`DEFAULT_STAGES`) | Default pipeline: Idea → Technical Elab → Plan → Review Plan (human) → In Progress → Deploy; stage types `agent`/`human`/`ci`/`merge`; `failback` semantics. |
| `api/project/workflowDefaults.js`, `api/workflowRegistry.js` | Workflow normalization, run registry with TTL sweep. |
| `api/promptCuration.js`, `shared/promptLayout.js`, `api/promptLayout/` | Curated prompt assembly; `SECTION_TOKENS`, `MANDATORY_LAYOUT_TOKENS` (`task`, `stage`, `failureGuidance`), `CONDITIONAL_LAYOUT_TOKENS` (`failureDetails`, `testingGuidance`); inline keywords incl. `{{previousReports}}`, `{{latestReport:<slug>}}`. |
| `api/watch/stageReports.js` | `generateStageReportContent`, `saveStageReport`, `AUTO_REPORT_MARKER`, verdict-block stripping. |
| `api/agent/verdictContract.js`, `skills/stage-verdict/SKILL.md` | `KAINBAIN_VERDICT/REASON/FIX` contract; fail-open on reasonless FAIL; failback routing. |
| `api/agentGuide.js` | `AGENT_GUIDE`, `TASK_STATUSES`, `STAGE_TYPES`, `RECOMMENDED_WORKFLOW`, `WS_EVENT_TYPES` — the context KainBain gives every agent session. |
| `api/agent/` (`harnessRegistry.js`, `harnessContract.js`, `sessionContract.test.js`, `harnessBoundary.test.js`, `harnessSupportTiers.js`, `harnesses/`) | Harness abstraction, acceptance suite, no-leakage regression gate, support tiers, supported harnesses (pi, antigravity, muse, vibe/ACP, opencode, custom, mock). |
| `api/flow/` (`executionQueue.js`, `singleActiveInvariant.test.js`, `stageExecution.js`, `stageFailureRouting.js`, `humanGitSafety.audit.js`) | Serialized execution, failure routing, git safety. |
| `api/taskStore.js`, `shared/survey.js`, `skills/question-me/`, `skills/creating-new-tickets/`, `skills/stage-report/` | Steering/follow-ups, survey machinery, intake and reporting skills, skill format (`SKILL.md` + `KB_config.json`). |
| `shared/stageTags.js` | Free-form stage tags (the P12 seam). |
| `AGENTS-MAP.md`, `docs/ARCHITECTURE_DOMAINS.md`, `agents.md`, `docs/KB Code Standards.md` | Domain ownership, reviewer roles, hand-maintained codebase map (bootstrap analogue). |
| `docs/research/harness2/harness2-kainbain-learnings.md` | Prior overlap analysis (scaffolding-over-model thesis; verdict mining; procedure/domain prompt split). |
| `docs/research/agent-swarms-comms/06-kainbain-implementation.md` | Prior overlap analysis (one-session-per-stage kills live chat; disk-mediated channels; harness-agnosticism). |
| `docs/tasks/<id>/task.md` (several) | Real stage timelines incl. "Requirement refinement" stages, `+0 -0` modified-file tracking, push/return branch events. |

## Method note

Discovery via the local SearXNG instance initially returned nothing (engines rate-limited); the repo was then fetched directly from GitHub (API + full tarball of `main`) and the essay via the local Firecrawl instance. All EGM quotations and file paths were read from the fetched tarball, not from memory. KainBain claims were verified by reading the cited files in this repo.
