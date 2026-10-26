---
title: Triage FAQ
section: working-with
order: 70
slug: faq
---

# Triage FAQ

**The board is empty.**
No project is active, or the project has no tasks yet. Create/select a project, then submit a goal with `N`.

**A task sits in `waiting_human` / `checkpoint`.**
That is a review gate asking for you — open the review page from the card and approve, reject, or re-route. It will not move on its own. See Review Gates (`#/docs/review-gates`).

**A stage failed.**
Read the stage reports and the preceding error output, then `retry` (fresh prompt, same stage) or reject/failback with feedback pointing at the cause. After the configured auto-iteration limit, tasks park as `failed` for a human.

**The agent seems stuck.**
Check `GET /compute/status` and the activity tail: `PROCESS_*` frames show live output, and a missing heartbeat plus `interrupted` status means it can be resumed. `abort` resets the engine to idle.

**The UI shows nothing / the socket drops.**
Confirm the API is up (`GET /status`), check the header traffic light, and verify `VITE_API_BASE` / `VITE_WS_URL` point at the API origin — a bundle opened from another host with loopback baked in self-heals to the serving host. See Ports & Environment (`#/docs/ports-env`) and Transport & Health (`#/docs/transport-health`).

**A deploy failed.**
The health gate auto-rolls back to `.prev`, so the app should still be up — check `GET /deploy/status` and the deploy log tail in Settings → Deployment, then `rollback` explicitly if needed. See Self-Deployment & Rollback (`#/docs/self-deploy`).

**I am an external agent. Where do I start?**
`GET /agent` (structured guide), `GET /agent/guide` (readable markdown), `GET /agent/schema` (compact manifest) — then `GET /docs` for this knowledge base as raw markdown per article.

**Where are logs stored?**
`api/logs/` for server logs, and each project keeps a `session.log` inside its workspace. (Formerly in `working-with-kainbain`, removed — kept here.)

**How do I upgrade the model?**
Edit `shared/modelAliases.js` or set `KAINBAIN_DEFAULT_MODEL`; the backend picks it up on restart. (Formerly in `working-with-kainbain`, removed — kept here, with the stale `LLM_MODEL` name corrected.)

**Antigravity shows no models.**
The model picker names the cause when it knows it: "CLI was not found" means the `agy` binary was not found on the server's PATH, in `~/.local/bin` or `~/bin` (both are searched automatically), or via `KAINBAIN_AGY_BIN` — install the Antigravity CLI in one of those places or set `KAINBAIN_AGY_BIN` to its absolute path, then Refresh. The same search order applies to the `muse` CLI (`KAINBAIN_MUSE_BIN`); `GET /harnesses` shows where each binary was found. "Authentication problem" means the CLI is not logged in — run `agy auth login` on the server, then Refresh. A stage that warns its model "is not available" and runs on the session default is the same root cause at dispatch time; set `KAINBAIN_STRICT_MODEL_DISCOVERY=1` to fail such stages instead of spending quota on the wrong backend.
