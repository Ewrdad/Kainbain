---
title: Link Runner to OpenCode
section: working-with
order: 16
slug: link-runner-opencode
---

# Link Runner to OpenCode

**OpenCode in one sentence:** OpenCode is an AI coding server that
KainBain talks to as a client — per project, with live model picking
and steerable sessions.

> **Do I need this?** Yes, if your pipeline should run on OpenCode's
> providers. You need the `opencode` CLI installed (so KainBain can
> spawn a server per project) **or** a reachable OpenCode server URL.

## Install or point at a server

**Option A — let KainBain spawn the server (simplest).** Install the
CLI from https://opencode.ai on the host that runs the sessions, so
`opencode --version` works. KainBain spawns `opencode serve` per
project automatically. If `opencode` is not on PATH, pin it with
`KAINBAIN_OPENCODE_BIN` (`~/.opencode/bin` is also searched).

**Option B — connect to a running server.** Set `OPENCODE_URL` to the
server base URL (default shape `http://127.0.0.1:4096`). In connect
mode KainBain only connects — it never spawns. If that URL is not
reachable, the harness says so honestly instead of pretending.

Auth is OpenCode-native (provider keys live where the server runs);
KainBain never stores them.

## How the harness talks to OpenCode

- Tier 2 client: the SSE event stream is translated to KainBain's normalized events, with per-message model selection plus two-way steer and abort.
- Model selection is a **list**: the UI dropdown shows the server's provider list. Without a reachable server the list is honestly empty — fallback models are never served for the wrong harness.
- Transcripts persist as JSONL per session.

## Offer OpenCode from a runner

```bash
scripts/install-local-runner.sh --id local-opencode --manual --harness opencode
```

or set `KAINBAIN_RUNNER_HARNESS=opencode` in the runner env file. Then
approve the runner in System Settings › Runners — see Adding a New
Runner (`#/docs/add-new-runner`).

OpenCode has **no model auto-discovery**: pin what the runner may
serve with `KAINBAIN_RUNNER_MODELS`, otherwise it matches model-less
tasks only. Make sure the runner host can reach the OpenCode server
(spawned locally needs the binary; connect mode needs the URL).

## Verify

1. `opencode --version` works (spawn mode) or the `OPENCODE_URL` answers (connect mode).
2. `GET /harnesses` lists `opencode` with its Tier 2 label and the provider list.
3. After approval, `GET /runners/models/catalogue` includes the pinned OpenCode ids.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `opencode` not found | Install it from https://opencode.ai (or `~/.opencode/bin`) or set `KAINBAIN_OPENCODE_BIN` |
| Server at OPENCODE_URL not reachable | Start it, or unset the variable to let KainBain spawn per project |
| Honestly empty model list | No reachable server or no providers configured — fix the server side, then refresh; check `GET /harnesses` for the hint |

## See also

- Adding a New Runner (`#/docs/add-new-runner`) — install + approve.
- Link Runner to Pi (`#/docs/link-runner-pi`), Link Runner to Muse (`#/docs/link-runner-muse`) — the other link guides.
- Ports & Environment (`#/docs/ports-env`) — `KAINBAIN_OPENCODE_BIN`, `OPENCODE_URL`.
