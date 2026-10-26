---
title: Agent Execution & Sandboxing
section: how-it-works
order: 30
slug: agent-execution
---

# Agent Execution & Sandboxing

Agent stages run inside **harness-scoped sessions**: one live session per project, resolved through a harness registry (`project.harness`, then the configured default, then `pi`).

## Sessions

- Sessions are **isolated per project** and **persisted to disk**, so the full message + tool history survives restarts. Reconnect via `GET /session/history`.
- The session keeps a **branching message tree**: you can inspect it (`GET /session/tree`), move the leaf (`POST /session/navigate`), or branch it (`POST /session/fork`).
- Idle sessions are disposed after a TTL; a cleanup sweep reclaims them.

## Capabilities degrade gracefully

Harnesses expose an optional capability surface (steering, follow-up, compaction, context usage, tree navigation). Calls go through a capability guard, so an unsupported capability returns `501 { code: "unsupported_by_harness" }` instead of a 500.

## Safety rails

- **Timeouts per stage kind**: agent and merge stages get the longest budget (30 min default), CI/script stages 10 min (the canonical `npm run test` gate includes the ~7-min canary E2E suite), deploy stages 5 min. Per-stage and per-project overrides still win.
- **Scheduler tick** (3 s default) dispatches queued work; overlapping runs are queued, not raced.
- **Process log cap** bounds in-memory stage output so one chatty stage cannot exhaust the server.
- Model references may be canonical (`harness::provider::id`), legacy (`provider::id`), or bare ids — all resolve; write the canonical form in new references.

## Alias display + self-managed harnesses

Stages can run through a model alias (`harness: "alias"` + `model: "<name>"`), which resolves to one weighted harness + model target per run. The monitor always shows halves from **one** target: a live session's actuals win over the peeked rotation preview (idle/queued runs show the full peeked preview), so a run never displays an impossible combination like a `muse` harness with a Gemini model. Some harnesses (`muse`, `custom`) manage their own model (`modelSelection: "none"`): dispatch never attempts a model switch there — a requested model is ignored with a run-log note naming the alias — the monitor shows the Harness pill with no Model pill, and alias targets for those harnesses must leave the model blank (the API refuses `none` + model rows with a 400 naming the alias). Rows saved before that refusal blank the model on load with a warning.

## Harness reliability

System Settings › Harness shows one reliability line per harness: both the all-time success rate and the last-10-runs rate side by side (e.g. `All-time 98% · 120 runs · Last 10 runs 100% · 10 runs`). Each agent run records its harness and outcome on its stage report; the rate counts timeouts, harness errors, and model/session failures as failures, while **deliberate agent decisions to fail a stage are excluded** (review feedback says the work needs redoing, not that the harness is unreliable). A transient failure that later succeeds on retry still counts as one failure plus one success. Reports written before this tracking existed carry no attribution and are ignored; harnesses with no attributed runs yet show `No reliability data yet` instead of a misleading 0%.

The same data feeds the monitor view's **Harness Reliability** widget (off by default, on in the Executive Telemetry preset): one row per harness with the all-time rate, the recent-10 rate, counted runs, infrastructure failures, and last-run time, sorted worst-first. A harness with at least 5 counted runs and below 90% success (all-time or recent) is flagged `Needs attention`; no-data harnesses are never flagged. The rule lives in `RELIABILITY_INTERVENTION_RULES` (`frontend/src/components/observability/reliabilityStatus.js`). The widget polls `GET /harnesses/reliability` on its own slow cycle (60 s plus socket-event/visibility refreshes) only while enabled, and the compact mobile view stays logs-only.

## Monitor widgets

The monitor view (keyboard `4` / `O`) is a grid of independent widgets, grouped in the add-widget menu by category — **Metrics & KPIs**, **Queue & Tasks**, **Logs & Console**, **System & Health**. Every card is an atom you can place on its own: each KPI (`KPI: Successes`, `KPI: Failures`, `KPI: Queue Depth`, `KPI: Human Review`, `KPI: Active Engine`) and each subsystem health card (`Health: LiteLLM Proxy`, `Health: Host Memory & CPU`, `Health: Ollama Cloud`, `Health: WebSocket Stream`, `Health: pi Harness Models`) is its own entry. The composites — **KPI Ribbon (all KPIs)** and **System Health (all subsystems)** — stay as one-click arrangements of the same cards, so a saved ribbon layout keeps working.

Any widget can be added more than once. Each copy is an independent instance with its own width, height, position, and visibility, and copies are distinguished in edit mode and by their DOM id (`queue`, `queue-2`). The layout is saved per browser under the version-2 key `kainbain_observability_layout_v2`; a layout saved by an older build (the version-1 key, or a pasted version-1 export) is migrated on first load by assigning instance ids, so upgrading never loses a customization. Widget-manager **Export / Import** emits and accepts that JSON (both versions), and **Reset to Factory Layout** restores the shipped cockpit.

The catalog in `frontend/src/components/observability/widgetRegistry.js` is the extension contract: a new widget is a component under `widgets/`, one catalog entry, and one `renderWidgetContent` case in `ObservabilityDashboard.jsx`. Each instance also carries an opaque `config` object reserved for per-instance settings (for example a future reliability card pinned to one harness) — currently edited through export/import JSON.

## Model alias reliability

Project Settings › Model Aliases displays per-target reliability lines under each alias target row: all-time success rate plus counted runs. Clean runs count as successes, while non-chosen failures — tool-failure loop-guard trips, connectivity errors, timeouts, and model/session errors (`failureKind: "infrastructure"`) — count as failures. As with harness reliability, **deliberate agent decisions to fail a stage are excluded** from both numerator and denominator. The settings line shows both the all-time and the recent 10-run figures (Labels: "All-time" and "Last 10 runs"); the same window is available per target to API consumers.

Stats are scoped strictly to that alias and project. Reports lacking attribution (pre-feature history, scripted stages, human rejections, or unresolvable-alias fallbacks) are ignored rather than misattributed; targets with no attributed runs show `No reliability data yet`, never a false 0%. Note that aliases are identified by name, so renaming an alias begins a new history.

## Refreshing the model catalogue

Model discovery runs behind caches so the catalogue loads instantly, which means a freshly installed model can take a while to appear. To refresh it on demand, click **Refresh** on a harness row in System Settings › Harness — that re-probes the harness and, by default, also re-runs the shared model catalogue past both caches (the same escape hatch the model pickers' empty state uses). System Settings › Models shows the live catalogue count with a **Refresh models** button as well.

The behaviour is config, not code: the backend key `refreshModelsOnHarnessRefresh` (env `KAINBAIN_REFRESH_MODELS_ON_HARNESS_REFRESH`, default `true`) is authoritative and visible in `GET /status/config`; set it to `0` to restore the harness-only refresh. In offline/frontend-only setups the build flag `VITE_ENABLE_SYSTEM_SETTINGS_MODEL_REFRESH=0` (in `frontend/.env`) is the fallback and does the same. Re-running the catalogue is best-effort and fire-and-forget — a slow or failing harness never blocks the availability probe.
