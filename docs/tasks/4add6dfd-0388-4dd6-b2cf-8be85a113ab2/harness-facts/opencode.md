# Harness facts: opencode

- What: KainBain is an SDK client of `opencode serve`. Tier 2
  (two-way: SSE stream, per-message model selection, steer + abort).
- Server: spawned per project automatically, OR connect to a running
  server via `OPENCODE_URL`. Default `http://127.0.0.1:4096`.
  Without a reachable server the model list is honestly empty.
- Binary: `opencode` on PATH (`~/.opencode/bin` also searched), or pin
  with `KAINBAIN_OPENCODE_BIN`. Install: https://opencode.ai.
  This box: NOT installed (link guide covers install + both modes).
- Model selection: `list` (server provider list).
- Auth: OpenCode-native (provider keys where the server runs); never
  stored by KainBain.
- Runner link: runner host needs the `opencode` binary (or the project
  must point at a reachable `OPENCODE_URL`); advertise with
  `KAINBAIN_RUNNER_HARNESS=opencode` + pin models manually
  (no discovery for opencode).
- Verify: `opencode --version`; server reachable;
  `GET /harnesses` opencode entry with provider list.
