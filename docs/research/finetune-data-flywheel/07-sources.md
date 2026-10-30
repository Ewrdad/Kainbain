# Sources

External sources consulted on 2026-10-30 (via SearXNG; arXiv IDs verified against
search results). Internal KainBain references are to files in this repo, all verified to
exist on 2026-10-30.

## Preference learning & post-training methods

- Rafailov et al., **"Direct Preference Optimization: Your Language Model is Secretly a
  Reward Model"**, NeurIPS 2023 — <https://arxiv.org/abs/2305.18290> — DPO: train on
  (prompt, chosen, rejected) pairs without a separate reward model. Basis for D2 pairs.
- Ethayarajh et al., **"KTO: Model Alignment as Prospect Theoretic Optimization"**, 2024 —
  <https://arxiv.org/abs/2402.01306> — alignment from binary thumbs up/down only, robust
  to noisy/imbalanced real-world feedback. Basis for treating bare rejects as weak labels.
- Touvron et al., **"Llama 2: Open Foundation and Fine-Tuned Chat Models"**, 2023 —
  <https://arxiv.org/abs/2307.09288> — rejection sampling (best-of-n) + PPO RLHF at
  production scale; iterative preference data collection.
- RLHF Book (Nathan Lambert), ch. on rejection sampling —
  <https://rlhfbook.com/c/09-rejection-sampling> — RS as core preference fine-tuning
  method; documentation gap noted.
- Lightman et al., **"Let's Verify Step by Step"**, ICLR 2024 —
  <https://arxiv.org/abs/2305.20050> — process reward models beat outcome rewards on
  reasoning; basis for D3 step labels from line comments. (PRM800K dataset:
  <https://www.potatoannotator.com/showcase/prm800k-step-verification>)
- Xu et al. / related, **"Online Iterative RLHF"** — <https://arxiv.org/abs/2402.07314> —
  online/on-policy preference learning framing (Nash equilibrium view); supports the
  "pairs from the current model" rule.
- DPO survey — <https://arxiv.org/abs/2410.15595> — off-policy/OOD failure modes of DPO;
  importance-sampling fixes. Basis for the on-policy pairing rule in `03`.
- Self-play/self-improvement direction: SPIN (Chen et al., 2024, arXiv:2402.01335) and
  self-rewarding LMs (Yuan et al., 2024) — iterative self-play as complement, not
  replacement, for human labels.

## Distillation vs human-graded data

- Gudibande et al., **"The False Promise of Imitating Proprietary LLMs"**, 2023 —
  <https://arxiv.org/abs/2305.15717> — distillation transfers style, not reasoning
  capability. The central citation for `04`.
- Prompt-Level Distillation follow-up, 2026 — <https://arxiv.org/abs/2602.21103> —
  confirms style-over-capability pattern.
- Coding-agent trajectory training: SWE-agent/OpenHands lineage and RL-for-agents work
  (e.g. Lego-RL, 2026, <https://arxiv.org/abs/2608.17393>; SWE-bench-Verified agent
  trajectories on Hugging Face) — agent trajectories + verifiable rewards are the
  established recipe for coding agents, which is KainBain's exact domain.

## Safety & failure modes

- Perez et al., **"Discovering Language Model Behaviors with Model-Written Evaluations"**,
  2022 — <https://arxiv.org/abs/2212.09251> — sycophancy and other RLHF-trained behaviors.
- **"Towards Understanding Sycophancy in Language Models"**, 2025 —
  <https://arxiv.org/abs/2310.13548> — sycophancy measured across commercial assistants.
- Skalse et al., **specification gaming / reward hacking** in RL, 2022 — surfaced via
  <https://en.wikipedia.org/wiki/Reward_hacking> and reward-hacking surveys
  (<https://arxiv.org/abs/2604.15149>, 2026) — basis for the reward-hacking guardrails.
- Gao et al., **"Scaling Laws for Reward Model Overoptimization"**, 2023 — proxy-vs-gold
  gap; basis for monitoring approval-rate vs golden-set divergence.
- Ouyang et al., **InstructGPT / RLHF** (2022) — helpfulness/harmlessness trade-off
  ("alignment tax"): helpful-only training can increase harmfulness. Basis for the hard
  safety filter in `05`.
- Shumailov et al., **"AI models collapse when trained on recursively generated data"**,
  Nature 2024 — <https://www.nature.com/articles/s41586-024-07566-y> — model collapse;
  basis for the human-floor rule.
- Bai et al., **"Constitutional AI: Harmlessness from AI Feedback"**, 2022 —
  <https://arxiv.org/abs/2212.08073> — constitution/rubric as a scaling filter (RLAIF)
  for safety labels.
- PoisonBench, **"Is Poisoning a Real Threat to DPO?"**, ICML 2025 —
  <https://openreview.net/pdf?id=IgrLJslvxa> and **"LLM Misalignment via Adversarial RLHF
  Platforms"** — <https://arxiv.org/abs/2503.03039> — label-flipping attacks on preference
  datasets; basis for consensus/anomaly guardrails.
- Engagement/Goodhart in implicit-feedback systems — recommender-systems literature on
  optimizing clicks; used as the analogy for approval-as-reward in `05` #2.

## Evaluation

- Chiang et al., **"Chatbot Arena: An Open Platform for Evaluating LLMs by Human
  Preferences"**, 2024 — <https://arxiv.org/abs/2403.04132> — blinded pairwise human
  eval + Elo; basis for the in-product arena in `06` phase 4.
- Eval-as-CI practice for LLM apps — MLflow guide
  (<https://mlflow.org/articles/role-of-evaluation-datasets-ai/>) and harness-engineering
  write-ups — golden set replayed in CI before model promotion.

## Data engineering & documentation

- Gebru et al., **"Datasheets for Datasets"**, 2018 — <https://arxiv.org/abs/1803.09010> —
  provenance documentation standard for every exported dataset.
- Dedup at scale: Penedo et al., FineWeb (NeurIPS 2024); SemDedup
  (<https://arxiv.org/abs/2303.09540>); MinHash-LSH surveys — exact + near-dup pipeline in
  `03`.
- PII/secret redaction tooling: Microsoft Presidio-style NER + regex secret scanners;
  OWASP LLM Top 10 (LLM05 data poisoning / log redaction guidance, 2026 entry) — basis
  for capture-time redaction in `06` phase 1.
- Production RLHF annotation practice: annotator training, gold-standard questions,
  consensus workflows (e.g. TaskMonk comparison of RLHF annotation platforms, 2026,
  <https://www.taskmonk.ai/blogs/rlhf-data-annotation-platforms>) — borrowed QC workflow
  for the audit sample.

## Legal & compliance

- EDPB, **"Effective implementation of data subjects' rights in AI"** (2025) —
  <https://www.edpb.europa.eu/system/files/2025-01/d2-ai-effective-implementation-of-data-subjects-rights_en.pdf>
  — models memorize training data; GDPR Art. 17 erasure ⇒ dataset removal + retrain.
- CNIL, **"AI system development: recommendations to comply with the GDPR"** —
  <https://www.cnil.fr/en/ai-system-development-cnils-recommendations-to-comply-gdpr>.
- EU AI Act **Article 53** (GPAI obligations: technical documentation, public summary of
  training data per Annex XII, copyright policy) —
  <https://artificialintelligenceact.eu/article/53/>; GPAI regime phasing in from
  2026-08 — see also Taylor Wessing summary (2026).
- Doe v. GitHub/Microsoft/OpenAI (N.D. Cal., filed 2022-11; Ninth Circuit 2026 ruling on
  output claims) — <https://en.wikipedia.org/wiki/Doe_v._GitHub,_Microsoft,_and_OpenAI>
  — code-license risk when training on repo code; basis for the license guardrail.

## Internal (KainBain repo) references

Signal inventory and architecture mapping cite: `api/eventBridge.js`,
`api/flow/executionLedger.js`, `api/flow/stageTransitions.js`, `api/flow/stageFailureRouting.js`,
`api/flow/steerStore.js`, `api/flow/humanGitSafety.audit.js`, `api/watch/stageReports.js`,
`api/agent/verdictContract.js`, `api/agent/sessionEvents.js`, `api/agent/logStream/agentLogStreamer.js`,
`api/reviewStore.js`, `api/reviewAssembly.js`, `api/reviewDiff.js`, `api/routes/review.js`,
`api/routes/tasks.js`, `api/routes/deploy.js`, `api/routes/retrospectiveChat.js`,
`api/taskStore.js`, `api/sessionStore.js`, `api/models.js`, `api/aliasSelector.js`,
`api/config.js`, `api/kainbainDir.js`, `api/docsPath.js`, `api/promptCuration.js`,
`api/agentGuide.js`, `api/projectStore.js`, `api/project/stageNormalizers.js`,
`api/work/taskSurvey.js`, `api/work/taskBranches.js`, `api/work/taskDiffStat.js`,
`shared/modelKeys.js`, `shared/survey.js`, `shared/promptLayout.js`,
`skills/stage-verdict/SKILL.md`, `skills/question-me/SKILL.md`,
`frontend/src/components/FeedbackDialog.jsx`, `frontend/src/components/tasks/TaskReviewPage.jsx`,
`frontend/src/context/useTaskMutations.js`, `docs/KB Architecture.md`,
`docs/ARCHITECTURE_DOMAINS.md`, `docs/README.md`, `AGENTS.md`, `AGENTS-MAP.md`.
