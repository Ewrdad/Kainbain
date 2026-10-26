# Harness² — Code Anatomy (reference implementation)

Read from a shallow clone of [google-research/harness2](https://github.com/google-research/harness2)
(commit `1cfe254`). Paths below are repo-relative. This is a faithful map of *how they built it*,
for borrowing mechanisms, not code.

## Layout

```text
harness2/
  core/
    recursion.py    parallel (run_parallel) + sequential (run_sequential) task-level recursion
    proposer.py     agentic editor sessions (Propose / Compose / Reflect)
    selection.py    anonymized deliverable selection + experience extraction
    library.py      per-domain improvement library (adopted trees + EXPERIENCE.md + INDEX.md)
    context.py      evidence workspaces handed to improver sessions
    prompts.py      stage prompts: propose-INV, propose-DOM, aggregate/compose, select, reflect (~1150 lines)
    tree.py         the c1..c8 editable surface: read/write/validate/diff harness trees
    spec.py         BenchSpec / BenchmarkAdapter — "the benchmark seam"
    judge.py        rubric judging, called ONLY after selection commits (never guides refinement)
    ledger.py / schedule.py / selection.py / runmark.py / report.py
  substrate/        opencode.py, codex.py — executor backends behind a SubstrateLike protocol
  benchmarks/       jobbench.py, lab.py, workbuddy.py + runners
  cli/              harness2, harness2-judge, harness2-report, harness2-setup, ...
```

## The three separations (spec.py — worth imitating)

Method / substrate / benchmark are three independent axes: the recursion logic never knows which
agent framework or benchmark it serves; a `BenchmarkAdapter` supplies tasks, execution,
trajectories, and validation. Adding a benchmark = implementing the adapter protocol, no method changes.
(KainBain already does this for harnesses via `api/agent/harnessContract.js` — same instinct,
applied one layer up: *task sources* behind a contract, not just *agent runtimes*.)

## The editable surface (tree.py + D.3)

Eight components, each a file in a tree — so "an edit is a diff":

| Group | Components |
|---|---|
| Context construction | system prompt, guardrails, long-term memory, skills (on-demand via skill tool) |
| Tool interface | tool guidance, scripts (deterministic capability instead of reasoning) |
| Orchestration | subagents (own context window — "the sole component that adds an inference context") |
| Middleware | plugin (hook inside the tool loop — *enforces* rather than instructs) |

Activation matters: always-on text is paid for on every run, skills/scripts/subagents only when
invoked. Their case studies show the cheapest effective component usually wins (a tool-guidance
edit fixing pseudo-tool-calls 60→100; skills carrying the biggest ablation loss on Code/Web).

## Anti-leak discipline (the mechanism that makes "label-free" honest)

- Prompts are validated to never mention benchmark/evaluation/grader/rubric/score
  (`BenchPrompts.__post_init__` raises).
- Every improver session gets evidence as *files in a workspace*, never inlined; a guard refuses
  to hand over any directory containing a grader verdict, rubric, or score
  (`assert_tree_has_no_grader_verdicts`, enforced in `recursion.py`, `library.py`, `selection.py`).
- Judging (`judge.py` / `score()`) runs only *after* selection commits; scores never steer editing.
- Invalid proposals get exactly one retry with the validator message; persistent failure inherits
  the starting tree and records the fallback — degradation is a first-class status (`fell_back`,
  `kept_base`), not an exception.

## Selection without scores (selection.py)

At k>1, candidates are anonymized (seeded shuffle → A/B/C…), non-answers dropped with recorded
causes, and an agentic selector returns *an existing output* — it may not synthesize. Choice and
rationale parse from ```choice / <why> / <experience> / <edits> blocks. The same session emits
the experience record that feeds the library. Reference rollouts are excluded from the pool by
construction (`selection_pool`).

## Library (library.py)

- One directory per domain; entries = full adopted tree + `EXPERIENCE.md` (why chosen, what each
  edit did, transferable lesson as cue/lesson/evidence/confidence).
- `add()` refuses entries without a complete experience record (`has_experience` gate).
- `INDEX.md` is *regenerated from disk* (`rebuild_index`) — the index can never drift from contents.
- Measurement honesty: only 22–47% of later edits show library provenance, and mostly as
  adaptation, not copying — reuse is real but partial, and they report it.

## Cost model

One k=1 step ≈ 4 rollouts + 3 improvement sessions (shared base executions included); parallel
k=5 ≈ 20 rollouts + 15 sessions. Both evaluated configs sit on the empirical Pareto frontier
(performance vs. total tokens before submission), but absolute cost is high — this is test-time
compute traded for quality, same currency KainBain stages already spend.
