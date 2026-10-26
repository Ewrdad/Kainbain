# EGM Fundamentals — What the Elephant-Goldfish Model Actually Is

Sources: EGM repo `README.md`, `docs/index.md`, `docs/designs/architecture.md`, and Dave Rensin's foundational essay *Elephants, Goldfish and the New Golden Age of Software Engineering* (Medium, 2026-04-27; updated 2026-10-21 to announce the open-sourcing). Full source list in `05-sources.md`.

## 1. It is a method, not a model

Despite the name, **elephant-goldfish-model is not an LLM and ships no weights**. The repo describes itself as "an open-source method and skill set created at Google for spec-driven development with LLMs" — a plugin (Agent Plugins 1.0) of slash-command **skills**, reviewer **personas**, and **document standards** that wraps any coding agent (Antigravity, Claude Code, Claude Cowork, Codex, ChatGPT). The name is the metaphor that makes the method memorable.

The method grew out of a year of internal use at Google on a tool that reached 100,000+ Googlers, and is documented in a 27-minute essay by Dave Rensin (Google engineer, ex-\@drensin). The open-source plugin is the industrialized form of the essay.

## 2. The metaphor

| Role | Definition | Why the animal |
| --- | --- | --- |
| **🐘 The Elephant** | A heavily-prompted, **context-rich** AI session — loaded with system history, architecture, component boundaries, user journeys — that explores requirements and drafts the design document. Also: the design document itself, which carries all institutional knowledge and micro-decisions. | "An elephant never forgets." |
| **🐠 The Goldfish** | A **brand-new, completely fresh AI session with zero memory**. It sees only the draft spec and the files the spec references — no conversation history, no authorial intent. Its job is to stress-test: comprehension, criticism, readiness. | The (mythical) three-second memory. The repo footnotes that goldfish actually have good memories — "but that would ruin the metaphor." |
| **🧑 The Human** | Owns the outcomes. "AI is a tool, not a decision-maker." | Neither animal is accountable. |

The operating slogan: **"Feed the Elephant; test it against the Goldfish."**

The essay's central warning: *"If we aren't careful, we're not just writing code faster. We're mass-producing our mistakes."* If the rate of bad code exceeds the rate of productive code, "your project will eventually collapse under the weight of its own unreadable, unmaintainable slop."

## 3. The three "Aha" moments behind the method

From the essay (Part 2):

1. **Aha #1 — the document re-bootstraps the session.** Mid-feature, the model crashed; a new session was a blank slate and re-feeding it context was "tedious, token-heavy, and incredibly frustrating." A clearly written document of intent + current state made re-bootstrap a 30-second operation: *"Read this doc. Read the code it references. Tell me where we are, and let's continue."*
2. **Aha #2 — unguarded AI sprints off a cliff.** With context restored, the AI "immediately ran off the rails, sprinting in directions I never asked for, hallucinating APIs, and making architectural choices that made zero sense." Models are eager to please; they need strict guardrails.
3. **Aha #3 — `sizeof(docs) << sizeof(code)`.** You don't need to feed the AI source code to make it understand the system; feed it the design docs. Context through plain-English documents is cheaper, faster, and more reliable than reading tens of thousands of lines of code.

Corollary the essay draws: **"Design is the new code."** When AI writes the code, the human no longer makes the micro-decisions embedded in it — unless those decisions are forced to "shift left" into a human-readable, rigorously tested document. When code becomes opaque, "the only artifact that matters is the design."

## 4. The 9-step core process (from the essay)

**Phase 1 — Growing the Elephant (no code yet):** co-design the feature *and its evaluation criteria* before a single line of code.

1. **Context Loading** — the AI interrogates the engineer: ask clarifying questions, challenge assumptions, "argue to learn, not to win," until the engineer says stop. Output: a 2–3 page problem description.
2. **The "No Code" Rule** — strictly no implementation files during design; drafts live in markdown or a scratchpad.
3. **The Sycophant Challenge** — when the model gets agreeable ("That's a great point!"), break the loop: *"When you agree with me you are not being helpful. You are most helpful when you challenge my thinking."*
4. **The First Draft Technical Proposal** — plus **Step 2 of Part 1 applied to itself**: co-create the *acceptance criteria / grading rubric* with a skeptical-fact-checker persona, then run the deep work in a **new session** with both the topic and the rubric.

**Phase 2 — Testing against the Goldfish:** each test is a fresh zero-context session that sees only the document and the files it references.

5. **The Comprehension Test** — a naive reader must be able to explain the system from the doc alone. "If the Goldfish cannot explain your system based *only* on that document and the files it references, your doc is missing context. Add the details and repeat until it passes."
6. **The Critic Review** — "Tell me all the things I missed, all the faulty assumptions, all the edge cases… Every mistake and ambiguity you find makes you more helpful." Anecdotally ~30% of suggestions are highly valuable — "more than enough to make this worthwhile." Rinse until findings become nitpicks.
7. **Implementation Readiness** — "Does it absolutely have all the information you would require to successfully implement this feature in your first pass?" Answer questions *in the doc*. Then a real human reviews.

**Phase 3 — Implementation:**

8. **Coding with Guardrails** — only now write code. Hand the finalized doc to the AI: *"Read this design doc and the files it references. Implement the feature as described. Follow the plan exactly."* If the session crashes, a new session + the doc = instant resume (Aha #1 again).
9. **The "Mean" Code Review** — feed the code back: *"I have a strong intuition that this code is of poor quality. Please tear it to shreds."* Demand strict readability. Rinse until critiques are trivial.

**Bootstrapping ("Feeding the Elephant Peanuts and Hay"):** for an existing monolith, generate a **recursive hierarchy of README.md files** — leaves first (AI is ~50% wrong there; a human spends 5–10 minutes fixing each), then roll up level by level ("read all the READMEs below me, plus the code in just this directory"). A fresh session at the root fed only the README tree understands the codebase almost instantly, using far less context than reading source. Once design docs cover 100% of files, the READMEs can be deleted. Secondary benefit: instant onboarding (dump the hierarchy + design docs into a notebook; a new hire's first job is to write a design doc that passes the Goldfish test).

## 5. The open-source plugin: components

Four decoupled subsystems (`docs/designs/architecture.md`):

1. **Skills layer (`skills/`)** — seven slash-command capabilities:
   - `/egm-brainstorm` — zero-doc ideation; a **6-lens Goldfish shootdown swarm** (contrarian/YAGNI, cost & quota economics, UX & developer ergonomics, migration & compatibility, codebase grounding & reuse, maintainability & tech debt) stress-tests the concept; the synthesizer compiles `concepts_brief.md`.
   - `/egm-draft` — iterative, section-by-section compiler that turns the brief into a living design doc at `docs/designs/<feature>.md`. Establishes the **FeatureRange/DetailedRange semantic split** (high-level architecture vs concrete implementation plan) so downstream reviews can be targeted, and appends a **provenance watermark**.
   - `/egm-review` — the **multi-stage verification pipeline**: Zoom Out → Comprehension → Critic → (intermediate Zoom Out) → Implementation Readiness, with pass/abort gates between phases.
   - `/egm-review-loop` — concurrent review subagent dispatch engine (direct and hierarchical).
   - `/egm-resolve` — interactive triage of findings + automated patch application.
   - `/egm-drift-report` — sequential AST scanner detecting divergence between checked-in specs and live code; appends `{YYYY-MM-DD}_DRIFT_REPORT.md`.
   - `/egm-bootstrap` — recursive bottom-up codebase documentation generator with **idempotent sentinel-block upserting** (generated blocks wrapped in HTML sentinel markers; human content preserved byte-for-byte).
2. **Personas layer (`agents/`)** — stateless system prompts for isolated Goldfish subagents: `zoom_out` (Skeptical Architect), `comprehension` (Naive Reader), `design_critic`, `implementation_readiness`, `structural`, `style`, `codebase_details` (Codebase Auditor), `synthesizer` (fan-out/fan-in, dedup), `bootstrap_orchestrator`.
3. **Document standards (`resources/document_standards/`)** — the versioned rubrics Goldfish evaluate against:
   - `feature-spec-standard.md` — **Alternatives Rule** (a spec proposing a single path without documented rejection of viable alternatives fails), Risks & Limits, Goals/Non-Goals.
   - `zoom-out-standard.md` — context sufficiency prerequisite, root-problem focus (symptom vs cause), YAGNI, premature-optimization rejection, anti-weeds (altitude control), leverage-existing (reuse, pattern consistency, platform standards, anti-patterns).
   - `implementation-readiness-standard.md` — **Zero-Decision Rule** ("the plan must leave zero design or architectural choices to the implementer"), phasing into stable checkpoints, explicit file lists and test plans.
   - `heilmeier-standard.md` — the 8 Heilmeier Catechism questions (objectives, state of the art, new approach, impact, risks, cost, timeline, metrics & exams).
   - `re-implementation-standard.md` — **Zero-Assumption Rule** for codebase-state docs (a fresh engineer must be able to write functionally identical code from the doc alone).
4. **Living documentation (`docs/`)** — user guides plus the design docs themselves, checked into the tree and drift-monitored.

## 6. The four systemic failure modes EGM is built against

From `docs/designs/architecture.md` — this list is the "why" of the whole framework:

1. **Hallucination cascades & context pollution** — one thread that interviews, designs, and codes accumulates speculative hypotheses and conversational bias; the model validates its own faulty assumptions.
2. **Premature implementation ("Weeds Syndrome")** — coding agents default to writing code immediately in nearby files, bypassing architectural placement, YAGNI, and reuse.
3. **Chat dump fatigue** — multi-page specs dumped into chat clutter the conversation, degrade context performance, and are poor UX.
4. **Documentation drift** — kickoff design docs rot as code evolves, breaking future AI onboarding.

And the four design principles that answer them: **Elephant & Goldfish** (deep-context drafting vs isolated zero-context review), **human ownership**, **artifact-first UX** (no chat dumps; write to side-panel artifacts/files; turn-yielding checkpoints), **living specifications** (checked-in design docs, continuously monitored against drift).

## 7. End-to-end lifecycle (plugin form)

```
Human → /egm-brainstorm → concepts_brief.md            (Elephant ideation + Goldfish shootdown)
Human → /egm-draft      → docs/designs/FEATURE.md      (Elephant drafts, section by section)
Human → /egm-review     → review reports & findings    (Goldfish: ZoomOut→Comprehension→Critic→Readiness)
Human → /egm-resolve    → findings triaged, patches applied
Human → open PR with FEATURE.md → human peer review → merge   (spec approved)
Human → implement against FEATURE.md                    (fresh session, doc is the context)
      → /egm-drift-report periodically                  (spec↔code drift monitoring)
```

## 8. The general Part 1 lesson (beyond software)

The essay's Part 1 ("It's a Tool, Not a Toy") is method-agnostic: to get a great answer from an LLM, (1) **interrogate before you research** — let the model ask *you* clarifying questions until the problem description is complete; (2) **co-create the grading rubric** before the work — define the acceptance criteria you'll evaluate the output against; (3) **run the deep work in a fresh session** with both the full problem description and the rubric. "A simple change to the way you use the tools now will help you go faster today, much much faster tomorrow." Part 3 predicts the management consequence: "We are all managers now" — engineers will manage fleets of agents, and the skill is delegation with guardrails, not prompt craft.

## 9. Key numbers and honest caveats from the repo

- ~30% of critic-review suggestions are "highly valuable" (essay, anecdotal).
- Leaf READMEs from bootstrap are ~50% wrong; human verification is 5–10 minutes per directory; a full codebase takes "about a week, (almost) no matter how large."
- The FAQ is candid: EGM "will not always" produce zero-context-complete docs; it "can" create a human review bottleneck; productivity gains depend on the change — "use EGM for 'What's important now?', instead of everything."
- EGM's own governance (`AI_POLICY.md`) requires every feature >100 non-test lines or ≥3 core files in `skills/`/`agents/` to go through a design-doc PR **before** an implementation PR — the repo eats its own cooking.
