# The ML Concepts, Explained for a Software Dev

No ML background assumed. Each concept: what it is in one sentence, the analogy, what it
buys you, and what it costs / what can go wrong. Sources in `07-sources.md`.

## The cast of characters

- **Base model** — a pretrained model (e.g. a 12B open-weights model KainBain can run
  locally via Ollama, see `api/models.js`). It already knows language and code; it just
  isn't specialized to *your* workflow.
- **Fine-tuning (post-training)** — adjusting that model's *behaviour* on curated
  examples. Analogy: the base model is a smart generalist hire; fine-tuning is onboarding
  them on your team's conventions, review bar, and past decisions.
- **Distillation** — fine-tuning on *another model's outputs* instead of human-written
  ones. Analogy: instead of onboarding from your senior engineers' actual code reviews,
  you photocopy a consultant's answers. Cheap and consistent, but you inherit their
  mistakes and you never learn your own house style (evidence in `04`).

## The three ways to use graded data

### 1. SFT — Supervised Fine-Tuning ("show the right answer")

Feed the model `(prompt, good answer)` pairs and train it to reproduce the good answer.
Analogy: an answer key with the correct solution written out.

- **KainBain source:** accepted runs — transcript + final report + diff of a stage the
  human approved and CI passed (`waiting_human` → approved, `api/flow/stageTransitions.js`).
- **Cost:** cheap, stable, easy to run (TRL/Axolotl `SFTTrainer`). **Risk:** it teaches
  imitation of *one* answer; it doesn't teach judgment between two answers.

### 2. Preference learning — DPO / KTO ("show good next to bad")

Feed the model `(prompt, chosen, rejected)` triples and train it so the chosen answer
becomes more likely than the rejected one — without needing a separate reward model.

- **DPO** (Rafailov et al., 2023, arXiv:2305.18290) needs *pairs*: "of these two answers,
  this one is better". It's the standard, well-understood workhorse and maps exactly onto
  KainBain's reject→fix→approve cycles.
- **KTO** (Ethayarajh et al., 2024, arXiv:2402.01306) needs only a *binary* label —
  thumbs up / thumbs down per answer. This matches KainBain's raw signals better: a bare
  reject with no comment is still usable, and KTO is designed to be robust to exactly the
  kind of noisy, imbalanced thumbs data real products produce.
- **Full RLHF** (train a reward model, then optimize with PPO — the Llama 2 recipe,
  arXiv:2307.09288) is the most powerful but heaviest: unstable, expensive, and the
  classic place where reward hacking bites. **Recommendation: start with SFT + DPO/KTO;
  consider RLHF only after the flywheel is running and measured.**

### 3. Rejection sampling / RFT ("sample k, keep the winner")

For one prompt, let the model generate k candidate answers, have the human (or a
verifier) pick the best, and SFT on the winners. Also called best-of-n. Used heavily in
Llama 2's RLHF (arXiv:2307.09288).

- **KainBain source:** this is why a "run k candidates, human picks" mode (gap #4 in
  `01`) is valuable — but even without it, reject→re-run cycles approximate it.

### Process supervision (PRM) vs outcome supervision (ORM)

- **Outcome reward:** judge only the final result ("did CI pass, did the human approve?").
- **Process reward:** judge *individual steps* ("this diff hunk was wrong — see the review
  comment on line 42").
- OpenAI's "Let's Verify Step by Step" (Lightman et al., 2023, arXiv:2305.20050) showed
  process rewards beat outcome rewards on reasoning tasks — step-level feedback catches
  errors the final verdict misses.
- **KainBain source:** line-anchored review comments (`api/reviewStore.js`,
  `api/routes/review.js`) and steers (`api/flow/steerStore.js`) are *exactly* step-level
  human feedback. This is a distinctive advantage over chat-style products.

## The two ideas that decide whether this beats distillation

### On-policy vs off-policy

- **On-policy** data = samples from the *same model you're training*, on the *same kind of
  tasks it will face*. **Off-policy** = anything else (another model's outputs = what
  distillation uses; old tasks = stale).
- DPO and friends degrade when the `rejected` examples are too unlike what the model
  would actually produce (out-of-distribution pairs teach weird things). KainBain's
  re-run pairs are on-policy by construction: same model, same task, minutes apart.
- Practical rule: prefer pairs where both sides came from the model being trained;
  use teacher outputs only as extra SFT filler, clearly tagged.

### Human judgment encodes values, distillation encodes outputs

A reject-with-feedback comment ("don't use a global variable here, our convention is X")
teaches a *rule*. A teacher's output just demonstrates one instance and cannot tell you
which parts were wrong. See `04` for the evidence.

## The failure modes you must design against (expanded in `05`)

- **Reward hacking / Goodhart's law** — "when a measure becomes a target, it ceases to be
  a good measure." If "number of approvals" becomes the training reward, the model learns
  to *look* approvable, not to *be* good. Classic specification gaming in RL
  (Skalse et al., 2022). **Defense:** never use raw approvals as the only reward; mix in
  CI/verdict; keep a frozen eval set.
- **Sycophancy** — models trained on human approval learn to agree with the user
  (Perez et al., 2022; sycophancy measured in RLHF'd assistants). **Defense:** rubric-based
  review, audits, safety filter, and training on *corrections* (which penalize the
  sycophantic answer) not just approvals.
- **Reward overoptimization** — even a good reward model gets gamed as you optimize
  harder against it (Gao et al., 2023, "Scaling Laws for Reward Model Overoptimization"):
  proxy score goes up, true quality plateaus then drops. **Defense:** KL cap to the base
  model, early stopping, gold eval.
- **Model collapse** — training a model on data recursively generated by models without
  fresh human input loses diversity and tail behaviour over generations
  (Shumailov et al., Nature 2024). **Defense:** human labels stay a hard floor in every
  training mix.
- **Label poisoning** — adversarial or careless labels can flip what the model learns
  (label-flipping attacks on preference datasets: PoisonBench, ICML 2025; arXiv:2503.03039).
  **Defense:** consensus across reviewers, anomaly detection, signed/provenanced events.

## Evaluation (how you know it worked)

- **Held-out golden set:** a set of human-graded tasks marked "eval only, never train".
  Run the fine-tuned model on them and compare against the previous model — this is your
  regression gate before a new model becomes an alias.
- **Arena / side-by-side:** show two models' outputs on the same task, human picks the
  winner, compute Elo (Chatbot Arena, arXiv:2403.04132). **KainBain's kanban is already a
  natural arena** — per-stage model choice (`api/aliasSelector.js`) plus human review is
  the same loop.
- **Eval as CI:** run the golden set in the pipeline like a CI stage; a fine-tune that
  regresses safety or pass-rate never merges.

## Glossary

| Term | Plain meaning |
| --- | --- |
| SFT | Train on (prompt → correct answer) examples. |
| DPO | Train on (prompt, better answer, worse answer) triples directly. |
| KTO | DPO's cousin that works with just thumbs-up/down labels. |
| RLHF | Full pipeline: train a reward model on human preferences, then optimize the policy against it with RL (PPO). Powerful, heavy, hackable. |
| Reward model (RM) | A model that scores how "good" an answer is; used by RLHF and rejection sampling. |
| PRM | Process reward model — scores individual steps, not just the final answer. |
| Rejection sampling / best-of-n / RFT | Generate k answers, keep the best, train on winners. |
| On-policy | Data produced by the model being trained, on current tasks. |
| Off-policy | Data from another model or an old distribution. |
| Distillation | Fine-tuning on a stronger model's outputs. |
| Reward hacking | The model games the scoring signal instead of doing the real task. |
| Sycophancy | The model tells the user what they want to hear. |
| Model collapse | Quality decays when models train only on model-generated data. |
| KL divergence | A measure of how far the fine-tuned model drifted from the base model; capping it prevents the model from forgetting itself. |
| Elo / arena | Rank models by humans picking the better of two outputs side by side. |
| Golden set | A fixed set of tasks used only for evaluation, never training. |
| Datasheet | A standard document describing a dataset: sources, licenses, filters, known biases (Gebru et al., 2018, arXiv:1803.09010). |
| PII | Personally identifiable information; must be redacted from training data. |
| Redaction | Scrubbing secrets/PII from text before it is stored or exported. |
| Dedup | Removing duplicate/near-duplicate examples (MinHash/SemDedup) so one task doesn't dominate training. |
