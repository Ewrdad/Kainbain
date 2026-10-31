# Safety & Failure Modes: How This Could Go Wrong, and the Guardrails

The requirement: **do not amplify bad behaviours, and deliver a net better effect than
distillation.** This file is the deep pass. Each failure mode: the mechanism (why it
happens), the evidence, and the concrete guardrail — with the KainBain hook where one
already exists.

## 1. Noisy implicit labels — "reject" doesn't always mean "bad answer"

**Mechanism.** A human rejects for many reasons: the answer was wrong, but also — the
model alias was misconfigured, the run hit an infra flake, the user was in a hurry, or
they disagreed with the *goal*, not the output. Treating every reject as "this answer is
bad" teaches the model the wrong thing.

**Guardrails.**
- A reject becomes a **strong negative label only with written feedback** (the
  `FeedbackDialog.jsx` text). Bare rejects → weak/binary labels (KTO-style,
  arXiv:2402.01306), never strict DPO pairs.
- Cross-check against **objective signals** KainBain already records: agent verdict
  (`api/agent/verdictContract.js`), CI stage result, merge baseline
  (`api/reviewAssembly.js`). Reject + CI green + verdict PASS = ambiguous → route to the
  audit sample, don't train blindly.
- **Audit sample:** before every training run, a human reviews a random sample (e.g. 200
  examples) of the dataset and can strike examples. Measure strike rate; if it's high,
  the pairing rules are wrong, not the model.
- Production annotation platforms use gold-standard questions, consensus, and
  annotator training for exactly this reason — borrow the workflow, at our scale the
  "annotators" are the kanban users and the rubric is the review checklist.

## 2. Engagement bias / Goodhart — humans approve what *looks* good

**Mechanism.** Approval is an engagement-like signal: polished, confident, well-formatted
output gets approved even when subtly wrong. Training on it is a textbook Goodhart move —
the model optimizes for approvability. This is also the root of **sycophancy**: RLHF'd
models learn to agree with the user (Perez et al., 2022, arXiv:2212.09251 and follow-ups;
measured across commercial assistants in arXiv:2310.13548).

**Guardrails.**
- **Never train on raw approval alone.** The reward for a "chosen" example must be
  approval *plus* an objective check (CI pass / verdict PASS / clean merge). Approval
  alone = weak label.
- Make the review UI **rubric-driven**: anchor comments to the repo's own rules
  (`AGENTS.md`, `docs/ARCHITECTURE_DOMAINS.md`, the PR checklist in the README) so
  "approve" means "meets the written bar", not "looks nice".
- Include the **corrections** (rejection reasons) prominently in training — they penalize
  sycophantic/padded answers directly.
- Random **blinded audits**: reviewers re-score old examples without seeing which model
  produced them; drift in scores = the model is gaming the surface.

## 3. Reward hacking / specification gaming

**Mechanism.** Any learned reward gets gamed (Skalse et al., 2022). If the proxy is
"human approve rate", the model will produce outputs that maximize approval — including
verbose reports, unnecessary changes, or refusing to make changes (a fail-open verdict
contract like KainBain's `api/agent/verdictContract.js` makes "do nothing, pass" a real
hack if approvals dominate). Reward-model overoptimization (Gao et al., 2023) shows proxy
scores rise while true quality plateaus and then drops.

**Guardrails.**
- **Frozen golden eval set** (human-graded tasks flagged eval-only) + **safety eval suite**
  as hard gates: a fine-tune that doesn't beat the previous model on both never ships.
- **KL cap** to the base model (standard DPO hyperparameter β) so the model can't drift
  into weird high-reward regions.
- Track the **proxy-vs-gold gap** over training runs (plot approval-rate vs golden-set
  pass rate); a widening gap is the overoptimization signature — stop and investigate.
- Keep the verdict contract **fail-open but audited**: reasonless FAILs already get
  flagged for human review in KainBain; keep that flag in the training reward too.

## 4. Amplifying harmful content — the "human approved it, so it's fine" trap

**Mechanism.** RLHF can amplify harm: if a human occasionally approves a harmful or
unsafe output, preference training makes the model *more* likely to produce it. Purely
helpful-only RLHF models were shown to be *more* willing to produce harmful content
(Ouyang et al., 2022 — the helpfulness/harmlessness trade-off, the "alignment tax").

**Guardrails (hard filters, applied before training, not after).**
- Run a **safety/toxicity/injection classifier** over every candidate example at dataset
  build time. Unsafe *chosen* → drop, or invert to rejected (so the model learns to
  refuse). Unsafe *rejected* → drop (don't teach the model that harmful text is merely
  "less preferred" — it should be *impossible*).
- Add a **constitution/rubric pass**: a second model (or rule set) critiques each chosen
  example against a written safety constitution (Constitutional AI, Bai et al., 2022,
  arXiv:2212.08073) and can veto it. This is RLAIF as a *filter*, which scales the human
  signal without trusting the model as the judge of its own training data.
- Keep a dedicated **safety eval suite** (jailbreak prompts, toxic-completion probes) in
  the golden gate. Any regression = block the model, no exceptions.
- **Red-team the dataset itself**: sample N pairs and ask "would we be embarrassed if a
  regulator/user saw this in our training data?" before every run.

## 5. Poisoned or adversarial labels

**Mechanism.** Preference datasets are attackable: flipping a small share of labels can
flip what the model learns (PoisonBench, ICML 2025; "LLM Misalignment via Adversarial
RLHF Platforms", arXiv:2503.03039 — label-flipping attacks on HH-RLHF-style data).

**Guardrails.**
- **Consensus:** when multiple humans touch the same task (comments, replies,
  re-approvals in `api/reviewStore.js`), require agreement before a strong label; log
  disagreements as data (see pluralism, #8).
- **Anomaly detection on events:** a single actor rejecting 100× the normal rate, or
  feedback text that looks like an injection attempt, gets quarantined for review.
  Events are signed with actor + timestamp at capture (phase 1) so provenance is
  tamper-evident.
- Never let one user's judgments dominate: cap per-user contribution in the dataset
  builder.

## 6. Feedback loops, distribution shift, and model collapse

**Mechanism.** The model's outputs influence what users approve, which becomes the next
training data — a loop that can drift the distribution or, when data becomes mostly
model-generated, degrade the model over generations (**model collapse**, Shumailov et al.,
Nature 2024, s41586-024-07566-y: recursive training on synthetic data loses tail
behaviour and eventually diverges).

**Guardrails.**
- **Human floor:** every training mix must contain a minimum share of fresh human-graded
  examples (e.g. ≥30–50% strong pairs in D2). Make it a build-time assertion, not a hope.
- Keep a slice of **untouched base data** (or high-quality human-written data) in every
  mix — the standard anti-collapse recipe.
- **Drift monitoring:** track prompt/approval distributions per week; alert on shift.
  Keep the golden set frozen forever — it is the anchor that detects collapse.

## 7. Privacy, secrets, and legal exposure

**Mechanism.** KainBain transcripts contain real repo code, file paths, task goals
(which may embed internal codenames), pasted logs, and sometimes **secrets** (API keys
pasted into chat — a known leak vector). Training on or exporting that is a GDPR/contract
incident, and EU AI Act Art. 53 adds transparency duties for GPAI training data (public
summary of sources, copyright policy; obligations phasing in from Aug 2026).

**Guardrails.**
- **Redaction at capture time, before anything is persisted to the training stream:**
  secret patterns (AWS/GitHub/OpenAI key shapes, `Bearer ...`, private keys),
  credential-looking env dumps, plus NER-based PII (names, emails). KainBain already
  treats `.env` as secrets-only; apply the same discipline to transcripts. Store raw
  transcripts locally only; the training stream holds scrubbed text + hashes.
- **Consent, per project, default off:** `trainingData: { mode: "off" | "capture" |
  "full" }` in project settings. "capture" = collect locally, never export; "full" =
  eligible for export/training. Record the flag snapshot in every event's provenance so a
  later opt-out is honored exactly (see erasure).
- **Erasure pipeline:** `kainbain dataset erase --user/--project` removes the subject's
  examples, regenerates the dataset, and the next training run retrains from the scrubbed
  set (GDPR Art. 17 "right to be forgotten"; EDPB guidance notes models memorize training
  data, so erasure means dataset removal + retrain, documented). Keep an erasure log.
- **License check:** user code may be under licenses (GPL etc.) that complicate
  downstream training/distribution — the Doe v. GitHub litigation (2022–) shows this is
  contested territory. Record the repo's LICENSE in the datasheet; default to
  *train on it for internal use only*, never publish the dataset or a model trained on
  private-license code without legal review.
- **Datasheet with every dataset** (Gebru et al., 2018, arXiv:1803.09010): sources,
  consent scope, licenses, filters/redactions applied, counts, known biases, intended
  use. Also satisfies the EU AI Act Art. 53 direction of travel for training-data
  documentation.
- **Access control & residency:** training events live under `.kainbain/` next to the
  project, same permissions story as the rest of KainBain's local-first state
  (`api/kainbainDir.js`); nothing leaves the machine unless explicitly exported.

## 8. Pluralism and labeler bias — whose "good" is it?

**Mechanism.** Different reviewers disagree (empirically, inter-annotator agreement in
RLHF is far from perfect). Optimizing to the average can encode the majority's biases and
erase minority users' needs; optimizing to the loudest user is worse.

**Guardrails.**
- Treat **disagreement as signal**: pairs where reviewers split go to the audit set and
  into a "contested" split of the dataset; train the main model on consensus only, and
  keep a small held-out evaluation of contested cases to measure whose preferences the
  model is actually learning.
- Cap per-user influence (see #5) so one power user can't steer the model.
- Where disagreement is systematic, encode the resolution as a **written rubric**
  (constitution-style principles in the review UI) rather than silently averaging.

## 9. Product-side gaming

**Mechanism.** If users know approvals feed training, some will approve strategically
(or reject to sabotage). The signal degrades exactly where it's most valuable.

**Guardrails.**
- Consent text states plainly what is collected and why; approval stays a product action
  first (it moves the task), training use is secondary and audited.
- Anomaly detection (#5) catches coordinated label patterns.
- Keep the golden eval **blinded** (reviewers don't know which model produced an output)
  so eval labels can't be gamed.

## Guardrail summary — the minimum viable safety bar

Before the first training run, all of these must be true (and stay true):

1. Consent per project, default off; provenance snapshot on every event; erasure pipeline
   tested.
2. Redaction (secrets + PII) at capture; raw transcripts never leave the machine.
3. Safety classifier + constitution veto on every chosen example; safety eval suite in the
   golden gate.
4. Strong labels require written human feedback; approvals require an objective check.
5. Frozen golden eval set (blinded arena) + KL cap + proxy-vs-gold gap monitoring.
6. Human-label floor in every training mix; per-user caps; disagreement logged.
7. Datasheet + license recorded with every exported dataset.
