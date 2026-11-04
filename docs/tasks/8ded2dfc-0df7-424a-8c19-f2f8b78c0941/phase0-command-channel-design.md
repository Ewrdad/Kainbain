# Phase 0.2 — Command-channel design (backend → runner nudges)

## Shape on the record

Each registry record gains two memory-first, persisted fields:

- `pendingCommands`: array of `{ command, requestedAt }`, at most one entry
  per command name (re-requesting refreshes `requestedAt`; idempotent).
- `commandResults`: map `command → { ok, detail, at }` holding the LAST ack
  per command (including expiry), so the UI can show success/failure without
  polling forever.

Both persist in the runners state file next to `operatorConfig` (operator
intent must survive a backend restart — a queued "update at next idle" still
applies after the reboot). TTL expiry is evaluated lazily: a queued entry
older than `RUNNER_COMMAND_TTL_MS` (24h) is treated as expired on read
(`commandStatus`) and recorded as `{ ok: false, detail: 'expired …' }`.

Supported commands (closed set, fail-closed on unknown):

- `requestModelRediscovery` — re-run `discoverClaudeModels()` promptly and
  advertise the fresh list on the next heartbeat.
- `requestUpdate` — run the existing idle-only update path at next idle
  (`maybeSelfUpdate` with `force: true`, so the interval gate does not eat
  an explicit operator request). Never interrupts live work (D5).

## Delivery

The heartbeat route appends `pendingCommands: [names…]` (queued, unexpired)
to the heartbeat response, next to the existing `pendingSteers` pull channel
(ADR 0011). No new runner→backend endpoint: the runner acks by echoing
`facts.commandAck = { command, ok, detail }` on its next heartbeats; the
registry's `heartbeat()` consumes a matching ack (drops the queued entry,
stores the result). Facts echo keeps D2 (facts flow runner→backend) and needs
no extra auth surface. A runner that never heartbeats simply never collects
the command; the UI reads that as "queued — waiting for runner" by comparing
`requestedAt` against `lastSeenAt`.

Only `active` runners accept commands: `pending`/`denied`/`revoked` have no
heartbeat loop, so enqueueing there 409s with `COMMAND_INVALID_STATE` instead
of queueing a nudge nothing will ever collect.

## Operator endpoint

`POST /runners/:id/commands` with `{ command }` → `202 { command, status:
'queued', requestedAt }`. Unknown command → `400 UNKNOWN_COMMAND` (fail-closed,
mirroring `runRunnerAction`). Unknown runner → `404 UNKNOWN_RUNNER` via the
shared store-error path.

The public record (`_public`) gains a `commands` block:

```json
{
  "pending": [{ "command": "requestModelRediscovery", "requestedAt": "…" }],
  "results": { "requestUpdate": { "ok": true, "detail": "…", "at": "…" } },
  "supported": ["requestModelRediscovery", "requestUpdate"]
}
```

`supported` is the intersection of the backend's closed set with the runner's
advertised `facts.commands` (see below), so the UI can distinguish "runner too
old" from "command failed".

## Runner capability advertisement (R1)

Old runners ignore unknown heartbeat-response keys, so delivery is safe — but
the UI must not offer a dead button. New daemons advertise
`facts.commands = ['requestModelRediscovery', 'requestUpdate']` (a
`SUPPORTED_RUNNER_COMMANDS` const in `runner/daemon.js`, emitted by
`factsFor`). The registry reports `supported` per record; when a command is
not in `supported`, the UI shows "update the runner" guidance instead of the
button. Facts-based (not version-based) so no version bump or semver
window is needed, and hand-rolled runners can opt in by echoing the key.

## Runner consumption points

- `deliverSteers` (every heartbeat pull cycle): after the steer pass, consume
  `beat.pendingCommands` — rediscovery runs inline (prompt, best-effort, then
  acked on the NEXT heartbeat via `state.commandAck`, since the ack rides
  facts); update sets `state.updateRequested = true` for the idle branch.
- `joinAndHeartbeat`'s first heartbeat: same consumption, so a command queued
  while the runner was down acts on boot.
- Dispatch-loop idle branch: when `state.updateRequested` is set, run
  `maybeSelfUpdate({ force: true })` at that idle point, then clear the flag
  and stage the ack. Single-assignment mode honors the flag once after the
  assignment completes (its only idle point).
- Pinned models (`config.models`/`config.model` set): discovery would change
  nothing (pins always win in `resolveAdvertisedModels`), so rediscovery acks
  `{ ok: true, detail: 'models pinned; discovery skipped' }` without probing.

Ack staging: `factsFor` spreads `state.commandAck` into facts when present;
each staged ack is consumed by exactly one registry heartbeat (the registry
clears the queue entry, and the daemon clears `state.commandAck` after the
heartbeat that carried it — tracked by keeping the ack until a heartbeat
round-trip completes, then dropping it).
