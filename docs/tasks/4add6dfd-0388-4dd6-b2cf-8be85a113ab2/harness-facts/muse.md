# Harness facts: muse

- What: headless Muse CLI sessions. Tier 2 via MSP (Muse Session
  Protocol) over `muse serve` (one host per project workspace, idle
  TTL, one MSP session per KainBain session); `KAINBAIN_MUSE_MSP=off`
  rolls back to one `muse exec` per turn.
- Binary: `muse` on PATH, or pin with `KAINBAIN_MUSE_BIN`.
  This box: `/usr/local/bin/muse`, `Muse Code 1.4.14`.
- Model selection: `none` (harness manages its own model; dispatch
  logs the ignore line).
- Env: `KAINBAIN_MUSE_BIN` (default `muse`), `KAINBAIN_MUSE_MSP`
  (`auto` default; never `true`), `KAINBAIN_MUSE_YOLO` (`true`
  default — auto-approve until an approval UI exists).
- Auth: box-local Muse login; keys never leave the host.
- Runner discovery: the ONLY harness with model auto-discovery —
  daemon asks the installed CLI over `muse serve` stdio `model/list`
  at boot + every `KAINBAIN_RUNNER_MODEL_DISCOVERY_INTERVAL_MS`
  (default 12h, `0` disables); advertises `muse::<provider>::<model>`
  ids; pinned `KAINBAIN_RUNNER_MODELS` always wins; failures keep the
  previous list and warn, never break heartbeats.
- Verify: `muse --version`; `GET /harnesses` muse entry;
  `GET /runners/models/catalogue` includes `muse::…` ids.
