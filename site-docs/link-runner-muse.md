---
title: Link Runner to Muse
section: working-with
order: 14
slug: link-runner-muse
---

# Link Runner to Muse

**Muse in one sentence:** Muse is a headless Muse CLI that
KainBain drives per project workspace — with a live model catalogue
and steerable sessions when the installed CLI supports it.

> **Do I need this?** Yes, if your pipeline should run on Muse
> instead of (or alongside) Pi — for example one stage that needs
> Muse's models inside an otherwise Pi pipeline. The runner host needs
> the `muse` CLI installed and logged in.

## Install and log in

1. Install Muse on the runner host and log in there. Auth is **box-local**: keys stay on the host, KainBain never sees them.
2. Confirm the binary resolves: `muse --version` (this reference host runs Muse Code 1.4.14).
3. If `muse` is not on PATH, pin it with `KAINBAIN_MUSE_BIN` (default `muse`, name or absolute path).

## How the harness talks to Muse

- **Default (`KAINBAIN_MUSE_MSP=auto`):** one `muse serve` host per project workspace holds a long-lived two-way session (Tier 2): steerable turns, interrupt-based abort, per-request permission interception, live usage telemetry, and reconnect after a restart.
- **Fallback (`KAINBAIN_MUSE_MSP=off`):** one `muse exec` process per turn with JSONL parsed. Never set MSP to `true` — the mode is `auto` or `off`.
- **Approvals:** `KAINBAIN_MUSE_YOLO=true` (default) runs auto-approve until an approval UI exists.
- Model selection is **none**: Muse manages its own model, so the UI shows no model picker for Muse stages (dispatch logs the ignore line when a model ref is handed off anyway).

## Offer Muse from a runner

```bash
scripts/install-local-runner.sh --id local-muse --manual --harness muse
```

or set `KAINBAIN_RUNNER_HARNESS=muse` in the runner env file
(auto-detect also probes `muse` on PATH). Then approve the runner in
System Settings › Runners — see Adding a New Runner
(`#/docs/add-new-runner`).

Muse is the **only harness with model auto-discovery**: the daemon
asks the installed CLI over `muse serve` stdio `model/list` at boot
and refreshes every
`KAINBAIN_RUNNER_MODEL_DISCOVERY_INTERVAL_MS` (default 12h, `0`
disables), advertising the returned `muse::<provider>::<model>` ids.
A pinned `KAINBAIN_RUNNER_MODELS` list always wins over discovered
ids. Discovery failures keep the previous list and warn — they never
break heartbeats. From Settings › Runners, Re-detect models re-runs
discovery promptly (skipped with a "models pinned" ack when pinned).

## Verify

1. `muse --version` works on the runner host.
2. `GET /harnesses` lists `muse` with its Tier 2 label.
3. After approval, `GET /runners/models/catalogue` includes `muse::…` ids (discovered or pinned).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `muse` not found | Install it on the runner host (or `~/.local/bin`, also on PATH after restart) or set `KAINBAIN_MUSE_BIN` |
| Empty `muse::…` catalogue | Discovery found nothing: log Muse in on that host, wait for the refresh interval, or pin `KAINBAIN_RUNNER_MODELS` / press Re-detect models |
| MSP errors after a Muse upgrade | The harness pins a schema fingerprint so upstream drift fails loudly — check the backend log and file the exact error; `KAINBAIN_MUSE_MSP=off` rolls back to per-turn exec |

## See also

- Adding a New Runner (`#/docs/add-new-runner`) — install + approve.
- Link Runner to Pi (`#/docs/link-runner-pi`), Link Runner to OpenCode (`#/docs/link-runner-opencode`) — the other link guides.
- Ports & Environment (`#/docs/ports-env`) — `KAINBAIN_MUSE_BIN`, `KAINBAIN_MUSE_MSP`, `KAINBAIN_MUSE_YOLO`.
