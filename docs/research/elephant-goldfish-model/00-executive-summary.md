# Elephant-Goldfish Model (EGM) → KainBain: Executive Summary

**Research date:** 2026-10-25
**Subject:** [google/elephant-goldfish-model](https://github.com/google/elephant-goldfish-model) — open-sourced 2026-09-13 by a Google team (Dave Rensin et al.), Apache-2.0, ~743 stars, site: <https://egm.dev>. Not an officially supported Google product.
**Question:** How could EGM help KainBain? What are the lessons, what is the overlap, and how can we tailor KainBain better?

## TL;DR

EGM is **not a model** — it is an open-source *method and skill set* for spec-driven development with LLMs. Its one-sentence form: **"Feed the Elephant; test it against the Goldfish."** The Elephant is a deep-context session that drafts specifications; the Goldfish is a zero-context, fresh session that stress-tests the spec without conversational bias; the human owns the outcome.

The headline finding: **KainBain already implements the hardest part of EGM by accident of good architecture.** KainBain's "one session per stage" rule (`docs/KB Architecture.md`) *is* the Goldfish principle; its stage-report handoff (`api/watch/stageReports.js`, `{{previousReports}}` in `api/promptCuration.js`) *is* EGM's artifact-first, distilled-reports-not-transcripts discipline. EGM independently validates KainBain's core bet — that the wins are in context engineering and scaffolding around a frozen model, not in the model.

The main **gap** EGM exposes: KainBain's default pipeline (`Idea → Technical Elab → Plan → Review Plan (human) → In Progress → Deploy`, `api/project/stageNormalizers.js`) has **no automated adversarial review layer between plan and implementation** — review is human-only. EGM's entire contribution is a battery of zero-context reviewer personas (zoom-out, comprehension/naive-reader, design critic, implementation-readiness, structural, style, codebase auditor) plus versioned rubrics they evaluate against. That layer maps cleanly onto KainBain *because* KainBain runs stages serially (EGM's own `/egm-review` pipeline is sequential with gates; only its optional `egm_review_loop` fans out concurrently, which KainBain's single-active-runner invariant forbids anyway).

**Top tailoring moves** (details in `04-lessons-and-tailoring.md`):

1. Add a **Goldfish review stage** (sequential persona passes ported as KainBain skills) between Plan and implementation.
2. Port EGM's **five document standards** (feature-spec, zoom-out, implementation-readiness, Heilmeier, re-implementation) as attachable KainBain skills — versioned rubrics, not prompt prose.
3. Make EGM's **"NO CODE" design-phase rule structural**: fail upstream stages that modify files (KainBain already tracks `modifiedFiles` per stage — enforce, don't just prompt).
4. Adopt **Heilmeier catechism** for task intake; adopt **FeatureRange/DetailedRange + provenance watermark** for stage reports.
5. Add a **drift stage** (spec↔code) and a **bootstrap** pass (recursive README/AGENTS-MAP "peanuts and hay") so Elephant stages get cheap deep context.
6. Adopt EGM's **two-stage PR governance** (design-doc PR → implementation PR) as a KainBain workflow template for KainBain's own development.

**What not to copy:** EGM's "silent guard / no meta-talk" prompt-concealment pattern (conflicts with KainBain's transparency and monitoring ethos), and concurrent swarm fan-out (violates KainBain's single-active-runner invariant).

## Package contents

| File | Contents |
| --- | --- |
| `01-egm-fundamentals.md` | What EGM is: philosophy, the metaphor, the 9-step process, components, lifecycle. |
| `02-egm-mechanics-and-governance.md` | How the plugin is engineered: skills/personas/standards, harness abstraction, artifact-first UX, AI policy, testing. |
| `03-overlap-with-kainbain.md` | Concept-by-concept mapping EGM ↔ KainBain with file references. |
| `04-lessons-and-tailoring.md` | Lessons learned and concrete, ordered tailoring proposals for KainBain. |
| `05-sources.md` | All sources with what was taken from each. |
