# 07 — Settings, push, harnesses, deploy safety

Read-only tests (MT-SET-01…04, 07…09) may run on live `:3100`.
Mutating tests (MT-SET-05, 06) are **scratch only**. Deploy *execution*
is never part of a manual regression run — see MT-SET-08.

## MT-SET-01 — Harnesses and reliability

- **Priority:** P0. Read-only.
- Steps: `curl -s $BASE/harnesses`; `curl -s $BASE/harnesses/pi/models`
  (id from the first call); `curl -s $BASE/harnesses/reliability`;
  `curl -s "$BASE/projects/$PID/aliases/reliability"` (scratch: use a
  seeded/disposable project id; on live use any real project id).
- Expected: harness list includes `pi` (Tier 1, default) plus the other
  shipped harnesses (mock/custom/muse/vibe/opencode/antigravity as
  available) each with `supportTier`, capabilities, `available`.
  Unavailable harnesses say so honestly (`available:false` + reason),
  never crash the list. Bogus harness id → 404.
- Cleanup: none.

## MT-SET-02 — Models list and cache refresh

- **Priority:** P1. Read-only.
- Steps: `curl -s $BASE/compute/models`; `curl -s "$BASE/compute/models?refresh=true"`.
- Expected: `200` both times; each model has `key` (`harness::provider::id`
  shape), `runnable`, `authConfigured`/`statusLabel`. On scratch the mock
  model is present. Refresh must not 500 when a provider CLI is missing.
- Cleanup: none.

## MT-SET-03 — Status/config already covered

- See MT-SMOKE-01/02/05. Do not duplicate; record cross-reference in the
  run log instead of re-running.
- Cleanup: none.

## MT-SET-04 — Push: VAPID key, settings, status (read-only)

- **Priority:** P1. Read-only.
- Steps: `curl -s $BASE/push/vapid-key`; `curl -s $BASE/push/settings`;
  `curl -s $BASE/push/status`.
- Expected: `200`s; VAPID public key present (or an honest unconfigured
  state); settings shape stable; no private key material anywhere.
- Cleanup: none. Do **not** call `/push/test` on live.

## MT-SET-05 — Push settings round-trip (scratch only)

- **Priority:** P2.
- Steps: save `GET /push/settings`; `PUT /push/settings` with one
  boolean flipped (body per `/agent`); GET; `POST /push/subscribe`
  with an invalid subscription; `POST /push/subscription-status`.
- Expected: PUT persists exactly the sent change; invalid subscribe →
  4xx, no subscription stored; status reflects reality.
- Cleanup: PUT the saved settings back verbatim; GET and diff against
  the saved copy; if a test subscription was created,
  `POST /push/unsubscribe` it and verify status.

## MT-SET-06 — Prompt layout: get, dry-run, save, reset (scratch only)

- **Priority:** P0. This guards the prompt-curation refactor surface.
- Steps:
  1. `GET $BASE/settings/prompt-layout` → save to `/tmp/mt-layout-before.json`.
  2. `POST $BASE/settings/prompt-layout/dry-run {"layout":"<saved layout>"}`.
  3. `PUT $BASE/settings/prompt-layout` with a layout missing a mandatory
     stage-contract token, and one with an unknown token.
  4. `PUT` a valid layout with one harmless marker line added.
  5. `POST $BASE/tasks/preview` (MT-TASK-02) and confirm the marker renders.
- Expected: GET reports layout + `isDefault`/warnings/fallback count;
  dry-run renders (`renderedMarkdown`, `warnings`, `fallbackUsed`)
  without persisting (GET unchanged); invalid PUTs → `400` naming the
  token problem, layout unchanged; valid PUT persists and preview
  reflects it.
- Cleanup: `POST $BASE/settings/prompt-layout/reset`; GET must equal
  the factory-default state from step 1 (or the saved body re-PUT if it
  was non-default — record which); re-run preview to confirm the marker
  is gone; `rm -f /tmp/mt-layout-before.json`.

## MT-SET-07 — App-status link (Go to App)

- **Priority:** P2. Scratch only for the mutating half.
- Steps: `PATCH $BASE/projects/$PID/app-status {"url":"http://localhost:5417","status":"running","healthEndpoint":"/"}`;
  `GET $BASE/projects/$PID/app-status/health`;
  `PATCH … {"url":null}`.
- Expected: PATCH merges partial updates and broadcasts the change
  (UI link updates live, MT-UI-12 style); health probe records
  `isHealthy`/`lastHealthCheck`; non-URL / non-http(s) url → 400;
  `url:null` clears the link.
- Cleanup: ensure the final state is cleared (`url:null` already sent —
  verify via `GET /projects/$PID` that no app-status link remains).

## MT-SET-08 — Deploy endpoints: read-only + hard refusal

- **Priority:** P0. Read-only on any stack. **Never** `POST /deploy` or
  `POST /deploy/rollback` during a regression run.
- Steps: `curl -s $BASE/deploy/status`; `curl -s "$BASE/deploy/log?maxLines=20"`;
  `curl -s "$BASE/deploy/changelog?limit=5"`.
- Expected: status shows last result + rollback history; log tails
  without exposing secrets; changelog is newest-first, or
  `changelog:null` with `reason:"not-baked"|"generation-failed"` on a
  build without a baked changelog (both are valid — record which).
- Cleanup: none. Log in the run log that deploy execution was
  deliberately not exercised, and why.

## MT-SET-09 — Agent guide endpoints still agree with reality

- **Priority:** P0. Read-only.
- Steps: for five sampled endpoints from `GET /agent` (one per area:
  projects, tasks, compute, docs, settings), call each exactly as
  documented (method + path + body shape).
- Expected: every sampled call succeeds as documented (2xx, or the
  documented 4xx for a deliberately bad id). Any mismatch between the
  guide and the server is a FAIL **in the guide or the route** —
  record the exact pair; this is the agent-integration contract.
- Cleanup: delete anything a sampled POST created (task/project per
  MT-TASK-04 / MT-PROJ-08); verify counts back to baseline.
