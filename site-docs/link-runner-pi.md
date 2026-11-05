---
title: Link Runner to Pi
section: working-with
order: 13
slug: link-runner-pi
---

# Link Runner to Pi

**Pi in one sentence:** Pi is the in-process AI coding agent the engine
runs itself — no extra program to install, no server to start.

> **Do I need this?** Pi is the default harness
> (`KAINBAIN_DEFAULT_HARNESS=pi`) and the recommended starting point.
> On a single machine you usually need **no separate runner at all**
> for Pi: the backend runs Pi sessions in-process. Read this guide when
> you want a runner on another host to offer Pi, or you want to
> understand how Pi models are picked.

## How Pi fits together

- The engine holds a live Pi session directly (Tier 1 integration), so it can steer, abort, and switch models mid-run.
- Model selection is a **list**: the UI shows a model catalogue dropdown scoped to Pi, and each stage may override the project's default (`stage.harness` + `stage.model`; blank inherits).
- Underneath, model access comes from your LiteLLM / Ollama Cloud setup. `GET /status` probes report `disabled` when unconfigured — never an error.

## Offer Pi from a runner

On the runner host, Pi needs no CLI: either let the installer
auto-detect, or pin it explicitly:

```bash
scripts/install-local-runner.sh --id local-pi --manual --harness pi
```

or set `KAINBAIN_RUNNER_HARNESS=pi` (single) /
`KAINBAIN_RUNNER_HARNESSES=pi,muse` (multi) in the runner env file.
There are no `KAINBAIN_PI_*` variables — Pi is an SDK, not a binary.

Pin the advertised models when the runner should only serve some:

```bash
KAINBAIN_RUNNER_MODELS=deepseek-v4-flash:0731-cloud
```

Pi has no model auto-discovery (only the Muse harness discovers), so
an unpinned Pi runner matches model-less tasks only. The backend
matches assignments against the advertisement; each assignment serves
exactly the required model.

## Verify

1. `GET /harnesses` lists `pi` with its catalogue and Tier 1 label.
2. After the runner joins and is approved (Adding a New Runner (`#/docs/add-new-runner`)), `GET /runners/models/catalogue` includes the `pi::…` ids the runner advertises.
3. In the UI, the stage model picker shows the Pi catalogue when the stage's effective harness is Pi.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Pi stages fail on model access | Check the `GET /status` backend probes (LiteLLM / Ollama Cloud) and the `KAINBAIN_DEFAULT_MODEL` default, then re-run |
| Runner never matches Pi tasks | It advertises no Pi models: set `KAINBAIN_RUNNER_MODELS`, or scope the task model-less |
| Wrong model served | Dispatch owns the harness+model combination — check the stage's effective harness/model in the picker, not the runner default |

## See also

- Adding a New Runner (`#/docs/add-new-runner`) — install + approve.
- Link Runner to Muse (`#/docs/link-runner-muse`), Link Runner to OpenCode (`#/docs/link-runner-opencode`) — the other link guides.
- Ports & Environment (`#/docs/ports-env`) — `KAINBAIN_DEFAULT_HARNESS` and the other harness knobs.
