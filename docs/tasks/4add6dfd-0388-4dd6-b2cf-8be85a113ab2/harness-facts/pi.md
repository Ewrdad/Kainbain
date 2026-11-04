# Harness facts: pi

- What: in-process `@earendil-works/pi-coding-agent` SDK sessions.
  Tier 1 (already maximal). Engine default
  (`KAINBAIN_DEFAULT_HARNESS=pi`).
- Binary: NONE. Pi has no CLI for the harness; there are no
  `KAINBAIN_PI_*` vars in `api/`. (The `pi` name probed on PATH by
  `scripts/install-local-runner.sh` is best-effort auto-detect only.)
- Model selection: `list` (model catalogue dropdown in UI).
- This box: no `pi` binary on PATH — irrelevant, SDK is in-process.
- Runner link: usually none needed on a single box (backend runs pi
  sessions itself). A runner advertises pi via
  `KAINBAIN_RUNNER_HARNESS=pi` / auto-detect; models pinned with
  `KAINBAIN_RUNNER_MODELS`, no pi discovery (discovery is muse-only).
- Model access underneath: LiteLLM / Ollama Cloud probes on
  `GET /status` (`checks.litellm`, `checks.ollamaCloud`); app boots
  with both `disabled`.
- Verify: `GET /harnesses` shows pi entry; catalogue via UI dropdown.
