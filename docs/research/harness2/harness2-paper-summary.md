# Harness² — Paper Summary

Source: Xu et al. (Google Cloud AI Research), "Harness²: Recursive Agent Harnessing for an Open World",
arXiv [2610.14224](https://arxiv.org/abs/2610.14224), submitted 9 Oct 2026.
Code: [google-research/harness2](https://github.com/google-research/harness2) (Apache 2.0).
Website: [harness2.github.io](https://harness2.github.io).
No secondary coverage found as of 24 Oct 2026 (paper is ~2 weeks old) — this note is based on the paper + repo directly.

## One-line idea

Stop tuning the model; tune the *scaffolding around the model* (prompts, tools, memory, skills,
orchestration) — and, crucially, learn how to tune it better each time you do it.

## Definitions (their vocabulary)

- **Harness** `H = (c1..c8)`: the system around a frozen model that lets it act as an agent —
  system prompt, guardrails, memory, tool guidance, subagents, skills, scripts, plugins.
- **Harnessing**: the process of optimizing that system. Weights never change.
- **Execution harness**: the scaffolding used to run the *current* task.
- **Improvement harness**: the scaffolding used to *improve* execution harnesses (editor/selector
  sessions + an experience library). This is the second-order object — the thing that learns.

## The two recursions

**Task-level recursion** — refine this task's harness with a contrastive **Propose → Probe → Compose** step:

1. **Propose**: run a reference rollout with the current harness, then draft two candidate edits —
   an **invariant** candidate (agentic procedure: planning, tool use, delegation — domain-agnostic)
   and a **domain-specific** candidate (knowledge/procedures of this task's domain).
2. **Probe**: run each candidate on the *same* task under matched conditions. Compare
   trajectories/deliverables against the reference — a *behavioral contrast*, used as evidence,
   never as a correctness score.
3. **Compose**: selectively merge supported edits, revise, adopt one candidate, or keep the
   current harness. Every decision must cite a concrete observation, not a presumed score gain.

Scaled two ways with budget `k`: **parallel** (k invariant + k domain candidates, then k
independent compositions from shared evidence) and **sequential** (k chained steps, each
conditioned on accumulated evidence). At k>1 an agentic selector picks one anonymized
deliverable (no scores, no harness identity visible); at k=1 selection is skipped.

**Harnessing-level recursion** — after each task, an experience reflector distills what worked
into a **harness improvement library**: the full adopted harness tree + an `EXPERIENCE.md`
(cue / lesson / evidence / confidence). The next task starts from the *base* execution harness
(never inherits the previous task's), but refinement is guided by the library. Libraries are
per-domain; retrieval is by browsing an `INDEX.md`, not embeddings.

## Results (3 benchmarks × 4 model–harness configs; executors GLM-5, Gemini 3.5 Flash; harnesses OpenCode, Codex)

- One contrastive step beats the base harness in **all 12 cells**: up to **+11.5** on
  WorkBuddy-Bench, **+4.5** on JobBench, **+11.8pp** LAB partial pass rate.
- Parallel recursion at k=5 adds further gains (+2.9–3.9 WB, +3.0–4.2 JB, +2.6–6.7pp LAB).
- Weaker executors gain more: GLM-5 + improved harness beats base Gemini on WB/LAB.
- Same model as executor *and* editor still improves (no stronger-editor requirement).
- Ablation (Gemini/OpenCode, k=1): removing library −3.1/−1.8 pts, removing INV/DOM scoping
  −2.9/−3.7, removing composition −1.6/−1.9 (WB avg / JobBench).
- Library transfers: a JobBench-grown library improves WorkBuddy-Bench one-step refinement;
  refined harnesses transfer across executor models (unevenly).
- Tool-error rates fall on all three benchmarks (e.g. JobBench 14.4% → 9.1%).

## Baselines beaten and why they matter

- **ReasoningBank** (memory-only, fixed harness): Harness² wins — executing with a *better
  harness* beats retrieving *better memories* into a fixed one.
- **Meta-Harness** (offline search on training tasks, then deploy fixed): Harness² wins on
  WB/JobBench — a pre-selected harness doesn't survive open-world distribution shift.
- **Harness Scaling** (per-task revision without library/scoping/composition): often *below*
  base — unstructured test-time revision is the failure mode the structure avoids.

## Stated limitations (Appendix F–G)

- Refinement costs extra executions + editor sessions; no optimal budget analysis.
- No ground truth: contrasts + model judgment are noisy, shared-model biases persist, no
  transfer guarantee.
- Library management is primitive (append-only index; no consolidation, pruning, or
  retrieval ranking) — explicitly flagged as future work, alongside adaptive budgets.
- Nine failure cases grouped: selector picks weaker output; a wrong premise propagates
  across candidates; outcome noise vs. edit effects are hard to separate.

## Key table for orientation

Paper Appendix A, Table 4 compares ~28 harness-improvement methods on six axes
(Object / Stage / Label / Streaming / Scaling / Improver Update). Harness²'s claimed
unique cell: **Online + Label-free + Streaming + Scaling + Improver Update**.
