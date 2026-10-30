# Proposed Architecture: The Flywheel Inside KainBain

Design goals: **local-first, opt-in, capture at existing write points, train outside the
core, evaluate in-product.** KainBain stays an orchestrator; the fine-tune itself is just
another task in a pipeline with a human review stage (dogfooding).

## Phase 0 — Consent & policy (small, do first)

- Project setting: `trainingData: { mode: "off" | "capture" | "full", redact: true }`,
  default `"off"`. Surfaced in project settings UI next to the existing docs/harness
  settings. "full" additionally requires an explicit acknowledgment that run data may be
  exported for training.
- Org/global config in `api/config.js`: redaction rules version, safety filter model,
  golden-eval task tag, human-floor percentage.
- Erasure + audit endpoints scaffolded (even if v1 is CLI-only).

## Phase 1 — Capture: a persisted training-event stream

New module `api/trainingData/` (own domain, per `docs/ARCHITECTURE_DOMAINS.md` ownership
model — this becomes a new "Training Data" domain with its own reviewer):

- One event vocabulary, schema-versioned, appended to
  `<projectRoot>/.kainbain/training-events/events.jsonl` (rotated, hash-chained optional):
  ```json
  { "v": 1, "ts": "...", "type": "human_reject|human_approve|comment|steer|verdict|ci_result|report|run_start|run_end",
    "taskId": "...", "stageId": "...", "executionId": "...", "actor": "human:<user>|agent|ci",
    "modelKey": "...", "harness": "pi", "consent": "capture|full",
    "payload": { ... scrubbed ... }, "payloadHash": "sha256:..." }
  ```
- Emit from the **existing write points** so UI and dataset can never disagree:
  history push in `api/flow/stageTransitions.js`, comments in `api/reviewStore.js`,
  steer acks in `api/flow/steerStore.js`, reports in `api/watch/stageReports.js`,
  verdict parse in `api/agent/verdictContract.js`, CI results in the stage lifecycle,
  plus a run_start/run_end wrapper in `api/flow/executionLedger.js`. Fan out from
  `api/eventBridge.js` so one emit reaches WS *and* the training sink.
- **Redaction at capture:** payload text passes through the secret/PII scrubber before
  append; raw session transcripts stay in `.kainbain/sessions` / runner worktrees,
  referenced by path+hash only.
- Storage is disk-persisted per project like the rest of engine state
  (`api/flow/loadStateFile.js` / `saveStateFile.js` pattern).

## Phase 2 — Build: `kainbain dataset build` (CLI / route, not core loop)

- Reads `events.jsonl` + `docs/tasks/<id>/` + session transcript refs → applies consent
  filter, dedup (exact + MinHash near-dup), safety classifier + constitution veto,
  pairing rules from `03`, train/val/**golden-eval** split → writes
  `sft.jsonl`, `preferences.jsonl`, `process.jsonl`, `eval.jsonl`, `DATASHEET.md`
  into a versioned output dir (`.kainbain/datasets/v<n>/`).
- Emits the **audit sample** (random N + all contested/disagreement cases) for human
  review before training is allowed; blocks build completion until the sample is signed
  off (recorded in the datasheet).
- `--erase` supports GDPR-style removal by user/project/task and regenerates downstream
  artifacts.
- Task tags (e.g. `eval-only`) mark golden-set tasks so the builder can never leak them
  into train.

## Phase 3 — Train: outside the core, as a KainBain task

- Standard tooling, no custom trainer: TRL (`SFTTrainer`, `DPOTrainer`/`KTOTrainer`) or
  Axolotl configs checked into the repo; runs on local GPU or Ollama-compatible endpoint.
- The training run itself is submitted as a normal KainBain **task** ("fine-tune
  gemma4:12b on dataset v7") so it flows through the same pipeline: plan → human review
  stage → run → human approves the eval results → only then can the model be registered.
- Recipe: SFT on D1 first (teaches format/house style), then DPO (strong pairs) or KTO
  (add weak labels), β/KL cap set, early stop on golden val. Optional: distilled filler
  ≤20% per the hybrid table in `04`, tagged off-policy.
- Base model choice: the small models KainBain already runs locally
  (`api/models.js` catalogue, e.g. `gemma4:12b`) — the point is to make *your* runner
  model better, not to train a new base.

## Phase 4 — Evaluate & ship: the kanban is the arena

- **Golden gate:** run `eval.jsonl` against candidate vs current model as a CI-like
  stage; pass = better on pass-rate *and* safety suite *and* fewer review comments
  needed. Regression = task fails, model not registered.
- **In-product arena:** per-stage model aliases (`api/aliasSelector.js`) let two models
  run the same task; the human review stage becomes a blinded side-by-side
  (Chatbot Arena-style Elo, arXiv:2403.04132). Feed arena votes back as new preference
  pairs — the loop closes.
- Register the winner as a new alias target only after the human review stage approves;
  keep the previous model as rollback (same pattern as deploy rollback history,
  `api/routes/deploy.js`).

## Complexity knobs (deliberately boring to start)

| Knob | Start with | Add later |
| --- | --- | --- |
| Datasets | D1 (SFT) only | + D2 pairs (strong only) → + weak/KTO → + D3 process/PRM |
| Pair source | reject→re-run cycles | + best-of-k candidate stage mode |
| Training | SFT, then DPO | KTO for noisy labels; RLHF/PPO only if measured need |
| Reward | human approve + CI/verdict | + PRM step scores; + arena Elo |
| Eval | golden set as CI stage | + in-product blinded arena |
| Safety | classifier + constitution veto + audit sample | + red-team suite, drift alerts |

Minimum viable flywheel = Phase 1 capture + Phase 2 D1 build + Phase 3 SFT + Phase 4
golden-set gate. Everything else is additive.

## Mapping to existing modules

| New thing | Reuses / touches |
| --- | --- |
| training-event sink | `api/eventBridge.js`, `api/flow/executionLedger.js`, `api/kainbainDir.js` |
| emit points | `api/flow/stageTransitions.js`, `api/reviewStore.js`, `api/flow/steerStore.js`, `api/watch/stageReports.js`, `api/agent/verdictContract.js` |
| consent flag | project entity + `api/projectStore.js`, `api/config.js`, settings UI |
| dataset builder CLI | `api/docsPath.js` task-dir resolution, `shared/modelKeys.js` for attribution, `api/aliasSelector.js` for model identity |
| eval gate | CI-stage machinery (`api/flow/stagePolicy.js`, `api/project/stageNormalizers.js`), deploy rollback pattern `api/routes/deploy.js` |
| arena | per-stage model picker + `frontend/src/components/tasks/TaskReviewPage.jsx` review UI |

## Open questions (for the next spike / ADR)

1. Consent UX: is per-project opt-in enough, or do we need per-task and per-user
   granularity? (Leaning: per-project + erasure pipeline covers GDPR; per-user caps
   cover abuse.)
2. Volume threshold: at what count of strong pairs do we switch from SFT-only to SFT+DPO?
   (Measure on the golden set; don't guess.)
3. Which base model first — the smallest one we actually deploy per stage, or the most
   capable local one?
4. Licensing: is training on the project's own repo code and publishing the resulting
   *model* (not the data) acceptable under the repo's license? Needs legal review per
   project; default internal-use-only.
5. Does the safety classifier run locally (small local model) or via a hosted API?
   Local-first says local; verify a small classifier is good enough at secret/PII
   detection, else layer hosted NER with no-retention terms.
6. Multi-tenant: if KainBain serves several teams on one server, training events must
   stay project-isolated (they do — `.kainbain` is per project) and datasets never mix
   projects without explicit consent on both sides.
7. Reward for CI/verdict: how much weight vs human approval? Start 50/50, tune on the
   golden set.
