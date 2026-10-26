# EGM Mechanics & Governance — How the Plugin Is Engineered

Sources: EGM repo `docs/designs/*.md` (architecture, review, draft, brainstorm, bootstrap, drift_report, synthesizer), `docs/harnesses.md`, `docs/getting_started.md`, `docs/faq.md`, `resources/execution_instructions.md`, `skills/*/SKILL.md`, `AGENTS.md`, `AI_POLICY.md`, `TESTING.md`, `.github/PULL_REQUEST_TEMPLATE.md`. Details in `05-sources.md`.

## 1. Skills are prompt programs with a strict execution contract

Each skill is a `SKILL.md` with frontmatter (`name`, `license`, `disable-model-invocation`, `description`) plus `TEST.md` and `test_scenarios.yaml` beside it. The review skill's "Execution Constraints" are worth quoting because they are the operational DNA of the method:

- **Artifact-first delivery (mandatory):** large proposals/drafts/reports are *strictly forbidden* in the chat pane; write them to the working directory or artifact directory and point the user at the file.
- **Plain-English standard:** no buzzwords, no ungrounded promotional adjectives ("seamless", "robust", "blazingly fast").
- **Default to stress-testing; no glazing; critique first; reject echo-chamber framing; generate counter-arguments; earn your agreement** — an explicit anti-sycophancy battery, including banned adjectives ("brilliant", "great", "smart", "correct", "perfect", "excellent", "spot-on") and banned apologies.
- **One question per interaction gate** — never bundle questions.

`resources/execution_instructions.md` adds the design-phase rules: a **NO CODE** guard (no production files during drafting; scratchpad only), **explicit consensus gates** (never advance without the user's go-ahead), and **contradiction auditing** (if the user's new request contradicts earlier goals, stop and ask — never write files in the same turn you spot the contradiction).

> ⚠️ One pattern to *not* copy: the NO CODE guard ships with "SILENT ENFORCEMENT" instructions — the agent is forbidden from ever mentioning the rules, constraints, or its own compliance ("NO META-TALK"). The *substance* (no code during design) is sound; the *concealment* is a manipulative prompt pattern that conflicts with KainBain's transparency and monitoring ethos. See `04-lessons-and-tailoring.md` §4.

## 2. The review pipeline is sequential with gates — and that matters for KainBain

`/egm-review` runs five phases **in order**, each with a pass/abort gate (`docs/designs/review.md`):

```
Step 5  Zoom Out Review        (persona: zoom_out / Skeptical Architect; rubric: zoom-out-standard)
   └─ abort → refactor architecture
Step 6  Comprehension Test     (persona: comprehension / Naive Reader; rubric: self-containment)
   └─ gaps → clarify definitions/context in the doc
Step 7  Critic Review          (personas: design_critic + structural + style; rubric: feature-spec-standard)
   └─ egm_review_loop fan-out → egm_resolve triage
Step 8  Intermediate Zoom Out  (YAGNI / bloat check after fixes)
   └─ bloat → prune defensive over-engineering
Step 9  Implementation Readiness (personas: implementation_readiness + codebase_details + style;
                                  rubric: implementation-readiness-standard)
   └─ egm_review_loop fan-out → egm_resolve → ready for human peer review
```

Only `egm_review_loop` (an optional dispatch engine) runs reviewers **concurrently**; the default pipeline is serial. The Goldfish invariant is enforced structurally, not just by prompt: *"A Goldfish review needs a fresh context. If a harness has no subagent tool, the review skills stop instead of running in the same context"* (`docs/harnesses.md`). A review in the same context "is not a Goldfish review."

`egm_resolve` closes the loop: interactive triage of findings (accept/reject/defer per finding) and automated patch application to the doc, so review output becomes doc edits, not chat text. The `synthesizer` persona does fan-in: spawn isolated reviewers in parallel, aggregate raw findings, **deduplicate overlaps**, write one consolidated markdown report.

## 3. Draft discipline: semantic boundaries and watermarks

`/egm-draft` (`docs/designs/draft.md`) compiles `docs/designs/<feature>.md` section by section (Overview & Goals → Architecture & Diagrams → Alternatives → Implementation Plan), requesting feedback between sections. Two mechanics stand out:

- **FeatureRange / DetailedRange semantic split** — the doc is partitioned into a high-level conceptual section and a concrete execution section so downstream Goldfish reviews can be *targeted* (critic reads FeatureRange; readiness reads DetailedRange) and drift tooling can parse structure.
- **Provenance watermark** — finalized docs append a standardized footer recording AI-authoring state.
- The implementation plan must enumerate **every file to create/modify/delete with an architectural rationale — without generating raw source code**.

## 4. Harness abstraction: one canonical package, thin per-harness adapters

EGM's `docs/harnesses.md` is unusually disciplined about multi-harness support:

- **One canonical source.** Root `plugin.json` owns identity/version/description (Agent Plugins 1.0.0 schema). Marketplace files (`.claude-plugin/marketplace.json`, `.agents/plugins/marketplace.json`, `.codex-plugin/plugin.json`) are *discovery catalogs pointing at the package — not copies*. Unit tests reject metadata drift between manifests.
- **No fork of skill text.** All hosts share the same `skills/`, `agents/`, `resources/` content. "Skill-only installers that copy `skills/` alone break EGM, because the skills read `agents/` and `resources/document_standards/` at run time."
- **Persona adapters.** Where a harness registers named subagents, EGM ships thin adapters (`.claude-plugin/agents/*.md`) that read the shared persona file and set the harness's read-only tools and context isolation — "this avoids imposing Claude tool names on other hosts."
- **Delegation table.** Each harness maps "spawn a subagent" to its own tool (Antigravity `invoke_subagent`, Claude Code Agent/Task tool, Codex `spawn_agent`, Cowork subagents, ChatGPT native spawn/wait). Where no named persona exists, the skill spawns a general-purpose subagent and tells it to read `agents/<file>.md` first.
- **Configurable artifact directory** via a single line in the agent instructions file: `EGM artifact directory: .dev/docs`.
- **Honest support tiers.** Antigravity, Claude Code, Codex pass automated installation + reviewer isolation + end-to-end fixtures; Cowork and ChatGPT Work have "working installation paths with open cloud trace verification gaps" (tracked as issues #105/#106). A harness counts as supported only after `/egm-brainstorm`, `/egm-draft`, and `/egm-review` run end-to-end through its plugin install, with verification notes attached to the PR.

## 5. Governance: the repo practices the method on itself

- **`AI_POLICY.md`** — AI contributions are welcome but "purely autonomous contributions are not accepted." Every PR has a human author who reviewed, tested, and verified every line. Copying maintainer review comments into an LLM and pasting unverified responses back is prohibited. Feature work (>100 non-test lines or ≥3 core files in `skills/` or `agents/`) requires **two-stage alignment**: (a) a Feature Inquiry issue reaches `status: approved-for-design`; (b) a design-doc PR (`docs/designs/<name>.md`, authored via `/egm-brainstorm` → `/egm-draft` → `/egm-review`, `Refs #<issue>`) merges and the issue reaches `status: approved-for-pr`; (c) only then the implementation PR (`Closes #<issue>`). **No artificial PR splitting** to evade the threshold.
- **`AGENTS.md`** — same policy in agent-facing form, plus a triage taxonomy: *Bug Fix / Minor Patch* (≤100 non-test lines, <3 core files) vs *Feature / Architectural Change — Stage 1: Design Doc PR* vs *Stage 2: Implementation PR*. Every PR description must be the filled-in PR template (which includes a human **Accountability** checkbox); `gh pr create --body` skips the template, so it must be copied manually.
- **Living design docs** — `docs/designs/` holds the architecture, per-skill designs, and a `drift_report.md` design; the index links to PR #103 for harness verification reports.

## 6. Testing: every skill ships its own evidence bar

`TESTING.md` plus per-skill `TEST.md` / `test_scenarios.yaml`: Python `tests/unit/` (frontmatter validity, harness mapping, link integrity, scenario coverage, **skill load limits**, claude traces) and `tests/integration/` (per-harness install and workflow fixtures). The repo treats "the skill loads within the harness's limits" as a unit-testable property — a nice example of testing prompt *packaging*, not just behavior.

## 7. What EGM deliberately does NOT do

- It does not fine-tune or select models; it is model-agnostic and harness-agnostic.
- It does not automate the human gates — consensus checkpoints, PR review, and final approval stay human.
- It does not run reviewers in the author's context — that is the one hard rule ("stop instead of running in the same context").
- Its FAQ: don't use EGM for everything ("What's important now?"), don't expect zero-context completeness to be automatic, and don't open big PRs.
