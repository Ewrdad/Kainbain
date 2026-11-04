# ADR 0013 — Operator command channel: backend-to-Runner nudges over the heartbeat pull

**Status:** Accepted (2026-11-03)
**Date:** 2026-11-03
**Task:** Runner config page refinement (Settings › Runners: Re-detect models, Update now)
**Amends:** `docs/adr/0009-runner-protocol-sketch.md` (adds a backend→Runner step), `docs/adr/0011-runner-steering.md` (reuses its pull-channel pattern)
**Design note:** `docs/tasks/8ded2dfc-0df7-424a-8c19-f2f8b78c0941/phase0-command-channel-design.md`

## Context

The Runners settings screen needs two operator-initiated nudges: re-run
model discovery now, and self-update at the next idle point. Both are
backend→Runner messages, and the protocol has no such step — everything
flows Runner→backend except steers, which ride the heartbeat response
(ADR 0011) but are fenced to a live execution, which commands are not.

## Decision

- **One command channel for both nudges (D1).** `POST /runners/:id/commands`
  with `{ command }` queues one entry per command name (re-requesting
  refreshes it; idempotent). Unknown commands 400 `UNKNOWN_COMMAND`
  (fail-closed); unknown Runners 404; non-`active` Runners 409
  `COMMAND_INVALID_STATE` (a Runner that never heartbeats can never
  collect the nudge, so nothing is queued for it).
- **Delivery on the heartbeat pull channel, peek-until-ack.** The
  heartbeat response carries `pendingCommands: [names…]` until the
  Runner confirms. Entries clear only on ack or TTL expiry (24h, recorded
  as an `expired` result, never silent), so a Runner that crashes between
  delivery and action still collects the command on its next heartbeat.
  At-least-once: the daemon skips commands already staged or in flight.
- **Acks ride heartbeat facts (`facts.commandAck`), no new endpoint.**
  The registry records the last result per command (`{ ok, detail, at }`)
  on the public record, which is what Settings renders as queued /
  progress / failed without polling forever.
- **Runner stays authoritative for facts; backend for operator intent.**
  Discovery results and effective directories flow Runner→backend via
  heartbeat facts; the pending queue is operator intent and persists
  across backend restarts (a queued "update at next idle" survives one).
- **Capability advertisement, not version sniffing (R1).** New daemons
  send `facts.commands`; the backend intersects that with its closed set
  and exposes `supported` per record. The UI disables the buttons with
  visible guidance (manual update) when the Runner predates commands,
  instead of offering a dead control.
- **Idle-only update invariant (D5, ADR 0012).** `requestUpdate` means
  "update at next idle", never "interrupt a task": a live execution
  parks the request for the next idle point (dispatch loop and
  single-assignment alike), and the UI says so. A Runner that stages an
  update confirms its ack over a final heartbeat before exiting, or the
  rebooted Runner would collect a redundant command.

## Consequences

- The heartbeat response gains one optional key; old Runners ignore it
  (safe), and old backends simply never send commands (the UI falls back
  to `facts.commands` and disables the buttons).
- Redelivery races are handled daemon-side (in-flight + staged dedup);
  concurrent heartbeats cannot double-apply an update.
- Fleet-wide bulk commands are a non-goal: the channel is per-Runner,
  matching the settings page scope.
