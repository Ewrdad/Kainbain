# Harness² → KainBain: Overlap and Learnings

## Framing correction (important)

The overlap is real, but the grader axis runs **opposite** to the hunch: Harness² does *not*
use a human grader — its entire design is a workaround for having **no ground truth at all**
(no labels, no verifiers, no human in the loop; an AI selector picks anonymized outputs and
scores never steer editing). KainBain **has** a human grader: the kanban review / reject /
re-route step with per-stage verdicts. That means KainBain holds the stronger signal Harness²
had to do without — KainBain is positioned to do *supervised* harnessing where Harness² proves
even the *unsupervised* version works.

## Where the goals overlap

Both systems say: the model is frozen, the wins are in the scaffolding around it.

| Harness² concept | KainBain equivalent today |
|---|---|
| Execution harness (c1–c8 files) | Stage curated prompt + attached skills + harness/model per stage |
| Improvement harness (editors + library) | Human operator on the kanban + Skills settings library |
| Per-domain library (adopted tree + EXPERIENCE.md) | Project skills overlay (bodies only — no "why it worked" record) |
| Reference rollout + behavioral contrast | Structured `logEntries` + human reject with reason |
| INV/DOM scoped editors | Single stage prompt (procedure and domain mixed) |
| Compose from candidate evidence | Retry / re-route (re-run, no composition) |
| Substrate contract (method ⊥ harness ⊥ benchmark) | `harnessContract.js` (engine ⊥ harness runtime) |
| Ledger (rollouts, sessions, USD) | Per-harness usage telemetry (partial — vibe/muse only) |

## What to learn (ordered by value/effort)

1. **Mine the verdicts you already have.** Harness²'s core finding: the refinement *experience*
   (what was tried, what the contrast showed, what was adopted and why) is the asset that
   compounds across tasks. KainBain already records (stage config, logEntries, human verdict).
   Persist them joined — prompt version + skills attached + model + verdict/reason — per project.
   That is a labeled dataset Harness² proves valuable even *unlabeled*.
2. **Split stage prompts into procedure vs. domain.** Their ablation: scoped INV/DOM editors
   beat generic ones by ~3 pts. KainBain stage prompts mix "how to work" with "what the work
   is". Offer an optional shared *procedure block* (retry/verify/reconcile discipline) composed
   with a per-stage *domain block* — reusable across stages the way their library reuses
   components across tasks.
3. **Compose on failure instead of blind retry.** On a failed stage, run two candidate variants
   (procedure-fix vs. domain-fix) on the same inputs and merge the supported fixes, citing the
   log evidence — their Compose step. Cheaper than it sounds: k=1 is 2 candidates + 1 compose.
4. **Store "why it worked" with skills.** The project skills overlay keeps bodies; Harness²
   keeps bodies *plus* the adoption rationale and transferable lesson (`EXPERIENCE.md`), and
   gates library writes on that record being complete. Add an optional note field on skill
   attach: what failure it fixed, what to watch for.
5. **Anonymize before auto-judging.** Wherever KainBain (or its operators) compare two candidate
   outputs — model aliases, A/B picks — strip model/harness identity first. One seeded-shuffle
   function; removes a whole class of bias.
6. **Attribute refinement cost.** Their ledger records every rollout/session/USD against the
   task. Extend KainBain's existing usage telemetry into a per-task refinement account
   (attempts × model × tokens) so operators see what a re-route costs.
7. **Fail closed with recorded fallback.** Their discipline: one retry with the validator
   message, then inherit the starting tree and *record* `fell_back`. KainBain's parked stages
   already inherit-then-wait; make the fallback explicit in the log entry.

## What NOT to copy

- **The label-free machinery itself.** Contrastive probing, score-blind selectors, and
  verdict guards exist because they have no grader. KainBain has one — use the human verdict
  directly instead of reconstructing evidence without it.
- **Append-only libraries.** Their own future work: no consolidation, pruning, or retrieval
  ranking. Any KainBain experience store should ship with expiry/consolidation from day one.
- **Per-task full-harness evolution as default.** Their cost: ~4 rollouts + 3 editor sessions
  per task at k=1. Worth it for high-value professional deliverables, not for every stage run.
  Gate it behind stage-level opt-in.

## Suggested next step

Cheapest experiment with the highest information value: (1) joined verdict records (#1) on one
active project for two weeks, then (2) a manual procedure/domain prompt split (#2) on its
highest-failure stage, reusing the verdict history as the before/after measure.
