# Human-Graded Finetune Data Flywheel — Executive Summary

**Research date:** 2026-10-30
**Question:** Can KainBain use the human judgments its users already make — approving,
rejecting, commenting on, steering agent work on the kanban — to generate datasets for
fine-tuning its own (smaller) stage models, and can that beat simply distilling a larger
teacher model? How do we do it without amplifying bad behaviour?
**Audience:** software developers with no ML training background. ML terms are explained
in plain English in `02-concepts-in-plain-english.md`; every technical term also appears
in the glossary there.

## TL;DR

**Yes — KainBain is accidentally the perfect data-collection machine for this.** Every task
already produces a full agent transcript, a per-stage report, the diff, the model/harness
that ran it, and — crucially — a human verdict: approve, reject-with-feedback
(`frontend/src/components/FeedbackDialog.jsx`), line-anchored review comments
(`api/reviewStore.js`), steers (`api/flow/steerStore.js`), and survey answers
(`shared/survey.js`). A reject followed by a corrected, approved re-run is *already* a
preference pair `(rejected, chosen)` for the same prompt and context. We just never export
it as training data.

**Recommended shape:** a four-phase, local-first "data flywheel" —
(1) **capture** structured training events next to the run (opt-in per project, secrets
redacted at capture time), (2) **build** datasets (SFT trajectories, DPO/KTO preference
pairs, step-level process labels) with a CLI, (3) **train** offline with standard tooling
(TRL/Axolotl: SFT first, then DPO/KTO on pairs), (4) **evaluate** on a frozen set of
human-graded tasks plus in-product side-by-side comparisons — the kanban itself becomes the
eval arena. Details in `06-proposed-architecture.md`.

**Why this can beat distillation:** distilling a big teacher copies its *style* but not its
*reasoning ability*, and copies its blind spots verbatim (Gudibande et al., 2023,
arXiv:2305.15717). Human-graded KainBain data is the opposite: it is on-policy (real tasks,
real repos, the exact prompts the model will face), and every correction encodes what *this
team* considers good — rubrics, conventions from `AGENTS.md`, CI passing, review comments.
That judgment is exactly what a frozen teacher cannot give you. Distillation is still the
right cheap bootstrap for format/breadth; the hybrid strategy is in
`04-human-grading-vs-distillation.md`.

**Safety headline (the "don't amplify bad behaviour" part):** implicit approve/reject
signals are noisy and gameable. Approving polished-sounding output teaches sycophancy;
optimizing for approvals is reward hacking (Goodhart); training only on model outputs
causes model collapse. The guardrails that matter most, all detailed in
`05-safety-failure-modes-guardrails.md`:

1. **Never train on a raw approval alone.** Mix in objective verifiers KainBain already
   has (CI stage result, merge baseline, agent verdict `api/agent/verdictContract.js`) and
   require a rejection to carry a written reason before it becomes a negative label.
2. **Hard safety filter before training**, not after: run a safety/toxicity classifier over
   every candidate example; unsafe "chosen" samples are dropped or inverted, never kept.
3. **Frozen golden eval set** of human-graded tasks + a safety eval suite as a hard
   regression gate before any fine-tuned model replaces an alias.
4. **Privacy by construction:** per-project opt-in, PII/secret redaction at capture,
   erasure pipeline (GDPR Art. 17), and a dataset "datasheet" (provenance, licenses,
   filters applied) exported with every dataset.
5. **Keep a human floor:** never let the training mix become 100% model-generated; fresh
   human labels are what keep the loop from collapsing (Shumailov et al., Nature 2024).

## The one-paragraph mental model

Think of fine-tuning data as an **answer key with explanations**. Distillation writes the
answer key by photocopying a teacher's answers — fast, but you inherit the teacher's
mistakes and you only learn to imitate. KainBain's human grader writes a better answer key
for *your* problems: for each real task, the dataset records "the model tried X, the human
said no because Y, then the model produced Z and the human (and CI) accepted it." Training
on accepted trajectories teaches the model *what good looks like here*; training on
(rejected → accepted) pairs teaches it *which of two answers is better and why* — which is
a strictly stronger signal for judgment, and it is the signal distillation structurally
cannot provide.

## Package contents

| File | Contents |
| --- | --- |
| `01-human-grader-signals-in-kainbain.md` | Inventory of every human-judgment signal KainBain already captures, with file references, its value as training data, and what's missing |
| `02-concepts-in-plain-english.md` | SFT vs preference learning (DPO/KTO) vs RLHF, rejection sampling, process vs outcome rewards, on-policy vs off-policy, distillation, reward hacking, model collapse — explained for a dev with no ML background, plus a glossary |
| `03-dataset-recipes.md` | Concrete dataset schemas (SFT trajectory, preference pair, step-level labels), pairing rules, volume math, dedup/filter/audit pipeline, export formats |
| `04-human-grading-vs-distillation.md` | The evidence and argument for why human-graded beats distillation here, and where distillation still wins (hybrid strategy) |
| `05-safety-failure-modes-guardrails.md` | The deep safety pass: noisy labels, sycophancy, reward hacking, poisoned labels, feedback loops/model collapse, privacy & legal (GDPR, EU AI Act, code licenses), pluralism — each with concrete guardrails mapped to KainBain mechanisms |
| `06-proposed-architecture.md` | Phased design mapped onto KainBain's architecture (capture → build → train → eval-in-product), consent model, complexity knobs, open questions |
| `07-sources.md` | All external sources with what was taken from each |

## What we are NOT proposing

- No automatic retraining inside the core engine. Training runs as an ordinary KainBain
  task (dogfooding: the fine-tune job goes through the same pipeline with a human review
  stage before the new model becomes an alias).
- No shipping user transcripts anywhere by default. Everything is local-first; export is
  an explicit, per-project, audited action.
- No claim that this replaces a base model's pretraining. It adapts behavior on *your*
  workload — the distribution KainBain actually operates in.
