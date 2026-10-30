# Dataset Recipes: What to Build, Exactly

Three dataset types, in increasing order of value per example. All are JSONL; every
example carries provenance so it can be filtered, audited, and erased later
(see `05`). Schemas are deliberately close to what TRL / Axolotl / OpenRLHF expect, so no
custom training code is needed.

## D1 — SFT trajectories ("accepted runs")

One example per accepted stage execution.

```json
{
  "id": "sft-<taskId>-<executionId>",
  "type": "sft",
  "messages": [
    { "role": "system", "content": "<curated stage prompt, api/promptCuration.js>" },
    { "role": "user", "content": "<task goal + repo context + previous reports>" },
    { "role": "assistant", "content": "<agent actions summarised: tool calls + final report>" }
  ],
  "provenance": {
    "taskId": "...", "stageId": "in-progress", "executionId": "...",
    "modelKey": "ollama-cloud::gemma4:12b", "harness": "pi",
    "verdict": "PASS", "humanApproved": true, "ciPassed": true,
    "consent": "full", "capturedAt": "2026-10-30T...", "sourceHash": "sha256:..."
  }
}
```

**Inclusion rule:** human approved at a checkpoint *and* (CI stage passed or no CI stage)
*and* a verdict exists (`api/agent/verdictContract.js`). The assistant message is the
*report + structured tool-call summary*, not raw token stream — shorter, and matches what
the model must produce at eval time (`api/watch/stageReports.js` artifacts).

## D2 — Preference pairs ("rejected → chosen")

One example per reject→re-run→approve cycle on the same task+stage+model.

```json
{
  "id": "pref-<taskId>-<execRejected>-<execChosen>",
  "type": "preference",
  "prompt": "<shared context: goal (pre-feedback) + stage prompt + repo state>",
  "chosen":  "<run 2 report/diff summary>",
  "rejected": "<run 1 report/diff summary>",
  "reason": "<the human's feedback text from FeedbackDialog.jsx>",
  "labelStrength": "strong",
  "provenance": { "taskId": "...", "stageId": "...", "modelKey": "...",
                  "pairKind": "reject_rerun", "consent": "full", ... }
}
```

**Pairing rules (important — bad pairs poison DPO):**

1. Same `taskId` + `stageId` + `modelKey` on both sides. Never pair across models — that
   teaches "model A is better than model B", not "answer X is better than answer Y".
2. `rejected` run must have an explicit human reject. If the run failed on its own
   (agent verdict FAIL, crash), it can still be a weak rejected side **only if** the
   re-run succeeded — label it `"labelStrength": "weak"`.
3. `reason` present → `strong` (use the feedback text; it's the explanation that makes the
   pair teach judgment). Bare reject, no text → `weak`; keep for KTO-style binary labels,
   exclude from strict DPO or down-weight.
4. Context must be comparable: if the goal was edited between runs, include the edit in
   `prompt` (the feedback was appended to the goal — that's fine, it's part of the
   prompt), but never pair runs whose *repo state* changed massively (e.g. after an
   unrelated merge) unless you include the new state.
5. **On-policy check:** drop pairs where the rejected side looks nothing like what the
   current model would generate (stale model) — this is the off-policy failure mode.

**Best-of-k variant (phase 2+):** if a stage can run k candidates, the human picks one →
k−1 rejected sides from the *same* prompt, all on-policy. Cheapest high-quality pairs
there are (rejection sampling, arXiv:2307.09288).

**Format for training:** TRL's DPO format is exactly
`{"prompt": [...], "chosen": [...], "rejected": [...]}` — our D2 maps 1:1.

## D3 — Process (step-level) labels

From line-anchored review comments and steers.

```json
{
  "id": "step-<taskId>-<commentId>",
  "type": "process",
  "trajectoryId": "sft-<taskId>-<executionId>",
  "stepRef": { "filePath": "api/foo.js", "line": 42, "side": "right" },
  "label": "negative",
  "feedback": "<comment body — the correction>",
  "resolution": "<the follow-up change that fixed it, if known>",
  "provenance": { ... }
}
```

Used to train a **process reward model** (PRM, arXiv:2305.20050) or to weight DPO by
step. Lower priority than D1/D2 but a genuine differentiator — most products can't label
steps this precisely.

## The build pipeline (`kainbain dataset build`, phase 2 of `06`)

```
raw sources                     transforms                          output
─────────────────────────────────────────────────────────────────────────────────────
docs/tasks/<id>/task.md   →   parse history/timeline     →   events.jsonl (phase 1)
docs/tasks/<id>/review-comments.json → comments        →   step labels (D3)
.kainbain sessions + runner-work transcripts → transcripts → trajectory refs
stage reports + diffs     →   report/diff summaries    →   D1 / D2 sides
CI + verdict + merge records → objective checks        →   reward features
        │
        ▼
  consent filter (project flag at capture time; honor later opt-outs via provenance)
  redaction: secret patterns + PII NER + path allowlist (never export raw transcripts
             until scrubbed; keep raw local-only)
  safety classifier on every candidate chosen/rejected text
        │  (unsafe "chosen" → drop or invert to rejected; unsafe "rejected" → drop)
  dedup: exact hash + MinHash LSH near-dup + per-task cap
  pair validation: rules above (same model, comparable context, on-policy check)
  split: train / val / golden-eval (eval tasks are flagged, never trained on)
  audit sample: random N examples exported for human review before any training run
        │
        ▼
  dataset v{n}: sft.jsonl, preferences.jsonl, process.jsonl,
                 DATASHEET.md (provenance, counts, licenses, filters, known biases)
```

## Volume math (rough, honest)

- Order of magnitude: **low thousands of high-quality pairs** move a small model
  measurably on a narrow domain (coding-agent work); tens of thousands for general chat
  behaviour. KainBain's per-project, per-workflow distribution is narrow, so the low end
  applies — this is the on-policy advantage again.
- Quality beats volume: 2,000 strong pairs (with reasons) usually beat 20,000 bare
  thumbs. Prefer `labelStrength: strong` early; add weak labels only with KTO.
- Diversity beats repetition: cap examples per task (dedup does this) — 50 re-runs of one
  task teach less than 50 different tasks.
- **Active selection:** when volume is low, spend human review time on examples the
  model is *uncertain* about or reviewers *disagree* on — disagreement is signal, not
  noise (see pluralism in `05`).
- Growth loop: each fine-tuned model runs the next tasks better → cleaner approvals →
  better data. That's the flywheel; the frozen golden set is what keeps it honest.

## Formats cheat-sheet

| Dataset | File | Training tool field |
| --- | --- | --- |
| D1 SFT | `sft.jsonl` | TRL `SFTTrainer` `messages` column (ShareGPT/ChatML style) |
| D2 preferences | `preferences.jsonl` | TRL `DPOTrainer` `prompt`/`chosen`/`rejected`; KTO via `kto` dataset variant with binary labels |
| D3 process | `process.jsonl` | PRM training (custom head) or step-weighted loss |
| Golden eval | `eval.jsonl` | never trained on; run as a CI-like stage + arena comparisons |
