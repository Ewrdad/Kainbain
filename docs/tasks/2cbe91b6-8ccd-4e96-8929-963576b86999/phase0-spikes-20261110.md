# Phase 0 spike notes — Runner auto-detect models from all harnesses

Recorded 2026-11-10 on server2 (working dir `kb-2cbe91b6-8ccd-4e96-8929-963576b86999`).
All probes read-only; no live backend or runner touched.

## 0.1 Pi-on-Runner probe — PASS (direct `listModels()` call)

- `~/.pi/agent/` holds `auth.json`, `models.json`, `models-store.json` (pi configured, no `pi` CLI on PATH — SDK only).
- `createPiHarness({}).listModels({refresh:true})` headless: **77 models in ~960ms**, keys already canonical (`pi::mistral::codestral-2508`, via `withModelKey`).
- No-login simulation (`HOME=/tmp/empty-home-probe`): **0 models, no throw** — honest empty as expected.
- Decision: pi leg is a direct `listModels({refresh:true})` call through the bundled backend harness factory. No CLI/config-file fallback needed.

## 0.2 Opencode-on-Runner feasibility — honest-empty unless `OPENCODE_URL` set

- `OpencodeModelDiscovery` only talks to an existing server (`GET {baseUrl}/config/providers`); nothing in the repo spawns `opencode serve` on demand, and per-discovery-round spawn (port allocation, lifecycle, auth) is not sane for a 12h-cadence probe.
- Decision: opencode leg reads `OPENCODE_URL`/`OPENCODE_SERVER_URL` (+ `OPENCODE_SERVER_PASSWORD`); when unset it returns `[]` with status reason `OPENCODE_NOT_CONFIGURED` ("set OPENCODE_URL …"). Follow-up (out of scope): a managed opencode server per runner host.

## 0.3 Codex transport check — still UNVERIFIED, shim stays honest-empty

- `api/agent/harnesses/codex/codexHarness.js` header: "UNVERIFIED (must not be assumed live …): the exact `codex exec` flags, the programmatic app-server/JSON-RPC surface, model listing, …". `listModels()` returns `[]` by contract.
- Decision: no live codex leg this round; runner leg returns `[]` with status reason `CODEX_DISCOVERY_UNAVAILABLE`. Recorded here per plan; revisit when the transport lands.

## 0.4 Dispatch-match verification — PASS (no grammar fix needed)

- Read `api/flow/dispatch/runnerMatches.js` + `runnerMatches/effectiveRunnerModels.js` + `dispatch/fleetModelCatalog.js`.
- Dispatch gates `req.model` by exact-string membership in `effectiveRunnerModels(record)`; the fleet catalogue is built from the same function over the same records. A fleet-advertised id (e.g. `pi::google::gemini-x`) picked verbatim therefore matches that runner — the "fleet pick is a guaranteed match" invariant already holds (also stated in `ModelSelector.jsx` docs). No change needed.

## 0.5 Fleet-counts freshness — mount + manual refresh (docs-only)

- `useFleetModelCatalog` fetches `/runners/models/catalogue` once on mount; `refresh()` exists but no picker auto-polls. Backend derives the catalogue live per request (no stale snapshot).
- Outcome: after a Runner re-detection, pickers see new models on next mount (or manual refresh where wired). No picker change; operator guidance only.

## 2.7 AUTO_DETECTABLE_HARNESSES review — unchanged

- `defaultLoadHarness` (runner/daemon.js) can only run `mock, pi, muse, antigravity, vibe`; `codex`/`opencode` throw "Unknown harness". Adding them to PATH auto-detect would advertise unrunnable harnesses, so detection stays `["pi","muse","antigravity","vibe"]` (pinned by `daemon.test.js`). Discovery legs for codex/opencode exist but only run when explicitly configured, as honest-empty + status.

## Survey deviation from plan assumptions (q4)

- Plan assumed q4 = "typed-in list wins" (survey was empty when planned). SURVEY.md is now answered and q4 selected **"Auto-detect wins and replaces the typed-in list"**.
- Per the plan's own "revisit if the survey gets filled in differently" rule, this implementation follows the survey: on the runner, a non-empty discovery result replaces the `KAINBAIN_RUNNER_MODELS`/`MODEL` pin for advertisement; when discovery yields nothing, the pin is kept as fallback (consistent with q5 keep-old + warning). The backend `operatorConfig.availableModels` allowlist (Settings UI curation) is untouched — it is operator curation, not a worker-typed list.
- q1 (all six), q2 (ready-to-use only), q3 (scan again right away), q5 (keep old + warning), q6 (normal picker choices) match the plan; implemented as planned.
