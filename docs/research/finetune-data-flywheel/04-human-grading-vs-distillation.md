# Why Human-Graded Beats Distillation (and Where Distillation Still Wins)

The user's core requirement: the human-grader approach must deliver a **better overall
effect than just distilling larger models** — not just be different. This file is the
evidence and the argument.

## What distillation actually transfers

The key negative result: **Gudibande et al., "The False Promise of Imitating Proprietary
LLMs" (2023, arXiv:2305.15717)** — fine-tuning a weaker open model on a proprietary
teacher's outputs transfers the teacher's *style* (verbosity, formatting, surface
fluency) but broadly **fails to transfer its underlying reasoning capabilities**. The
imitator gets better at *sounding* like the teacher, not at the hard parts. Follow-up work
(e.g. arXiv:2602.21103, 2026) confirms prompt-level distillation similarly copies style
over capability.

Three structural problems with distillation for KainBain specifically:

1. **It copies the teacher's blind spots verbatim.** Whatever the big model gets wrong on
   *your* codebase, your fine-tuned model will now get wrong *in your style*. Distillation
   has no error-correction channel; human grading does (the reject-with-feedback loop).
2. **It's off-policy by definition.** Teacher outputs are samples from the teacher's
   distribution, not from the small model you deploy. Preference methods degrade on
   off-policy pairs; SFT on off-policy data teaches the small model to imitate answers it
   can't reach, which shows up as confident-sounding but wrong output on edge cases.
3. **It can't encode your values.** "Our team never uses global mutable state", "reports
   must carry a verdict block", "don't touch `shared/` public constants" — these live in
   your `AGENTS.md` and in your reviewers' heads, not in any teacher's outputs. Only human
   judgments on *your* tasks carry them.

## What human grading adds that distillation cannot

1. **Corrections, not just demonstrations.** A reject-with-feedback pair says "answer X
   is worse than answer Y, *because* Z". DPO/KTO turn that into a durable preference. A
   teacher's single output has no "because" attached. This is the difference between
   copying homework and being told which line was wrong.
2. **On-policy data for free.** KainBain's pairs come from the exact model + harness +
   repo + task distribution the fine-tuned model will serve
   (`api/models.js`, `shared/modelKeys.js`, `api/aliasSelector.js` give you the attribution
   to prove it). This is the single biggest quality lever in post-training today —
   on-policy, real-distribution data beats bigger off-policy data.
3. **Objective verification mixed in.** CI pass/fail, merge baseline
   (`api/reviewAssembly.js`), verdict blocks (`api/agent/verdictContract.js`) are
   machine-checkable rewards that cost nothing and catch whole classes of teacher errors.
   Distillation can't use these; they only exist where humans/CI judge outputs.
4. **Step-level labels.** Line-anchored review comments (`api/reviewStore.js`) enable
   process supervision (arXiv:2305.20050 showed process rewards outperform outcome rewards
   on hard tasks). No teacher provides per-step labels.
5. **The flywheel compounds.** Distillation is a one-shot snapshot of a frozen teacher.
   Human-graded KainBain data improves *as the product is used*: more tasks → more pairs
   → better model → cleaner runs → better pairs. The teacher never improves; your model
   does. (With the collapse caveat handled in `05`: keep fresh human labels in every mix.)

## Where distillation still wins — and the recommended hybrid

Distillation is not useless; it's the right tool for **breadth and format**: cheap, fast,
great at teaching a small model to follow a chat template, produce structured reports,
and cover general knowledge. Gudibande et al. themselves note style does transfer.

**Recommended mix for a KainBain fine-tune:**

| Data | Share (starting point) | Role |
| --- | --- | --- |
| D1 SFT on human-accepted KainBain runs | ~50–70% | House style, workflow, tool use, report format |
| D2 human preference pairs (strong labels first) | ~20–30% | Judgment, corrections, review bar |
| Teacher-distilled general data (tagged as off-policy) | ~10–20% | Breadth, general capability, format — never the majority |
| Golden eval tasks | 0% (never trained) | Regression gate |

Tag every example with its source in `provenance` so you can ablate ("what if we drop the
distilled 15%?") — that's how you *prove* the human-graded share is earning its keep,
which is exactly the "better than distillation" claim, measured.

## How we'd measure "better than distillation" honestly

1. Build two candidate models from the same base: **A** = distilled-only, **B** =
   hybrid (human-graded majority). Same training budget.
2. Evaluate both on the **frozen golden set** of human-graded tasks (pass@1 on CI +
   human-approve rate in a blinded side-by-side arena inside KainBain — arXiv:2403.04132
   Elo methodology).
3. Also measure the things distillation can't show up on: review-comment count per task
   (fewer corrections needed = better), failback rate (`api/flow/stageFailureRouting.js`),
   time-to-approve. If B wins on golden-set pass rate *and* needs fewer human corrections,
   the claim is proven for your workload.
4. Safety gate: B must not regress the safety eval suite (next file). If it does, the
   hybrid loses — by design.
