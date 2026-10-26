# Circuit Breaker Runbook (Tier 5 — "Stop all existing work till solved")

**Owner:** engine on-call · **Code:** `api/flow/circuitBreaker.js`,
`api/flow/circuitSensors.js`, `api/flow/taskScheduler.js`,
`api/flow/stageFailureRouting.js`, `api/flow/stageExecution.js`
**Audit trace:** F-21 (RPN 216), AUDIT §3.8 / §8 Tier 5, OCTAVE vulnerability 4.

The global circuit breaker stops **all** task dispatch when a systemic
infrastructure failure is detected, so queued work is *deferred*
(`in_stage`, budgets preserved) instead of cascading to `failed`.

## 1. Is it the breaker? (30-second diagnosis)

1. `curl -s localhost:3100/engine/state | jq .circuit`
   — `tripped: true`, `reason`, `source`, `trippedAt` tell the whole story.
2. UI: a red **"Engine tripped — all work stopped"** banner sits under the
   header with the reason, source, and a reset field.
3. Logs: `[CIRCUIT] Engine TRIPPED by <source> …` in the process log /
   WebSocket `NOTIFICATION` (error toast).
4. Queue: every item shows `engineTripped: true` and
   `priorityReason: "Engine tripped — deferred (…)"`.

`source` values: `manual` (operator `POST /engine/trip`), `auto:infra`
(repeated infrastructure failures), `auto:auth` (sustained 401/403),
`auto:disk` (free space below floor), `auto:memory` (memory-critical sustained),
`auto:probe` (half-open canary verdict).

## 2. What the breaker did to the queue

- No task was marked `failed`. Queued tasks remain `in_stage`; an in-flight
  task returns to `in_stage` on its next failure callback.
- No `infraRetryCount` / `autoIterationCount` was incremented **after** the
  trip. (`failureReason` / `lastError` are deliberately not written, so the
  next attempt's prompt is not poisoned.)
- History on each affected task records
  `… deferred by engine circuit trip … — task not failed, retry budgets preserved`.

## 3. Recover by cause

| Cause | Fix | Then |
| ----- | --- | ---- |
| `auto:disk` | Free space on the probe filesystem (`KAINBAIN_CIRCUIT_DISK_PROBE_PATH`, floor `KAINBAIN_CIRCUIT_DISK_FREE_FLOOR_BYTES`). Clear build caches, prune logs. | `POST /engine/reset {"reason":"disk freed …"}` |
| `auto:auth` | Rotate/restore the provider credential (expired key, revoked org token). Confirm with a manual provider call. | reset, then watch the canary |
| `auto:infra` | Provider gateway / host network. Confirm with `curl` to the provider or `GET /status/health`. | reset once reachable |
| `auto:memory` | Stop leaking consumers; memory must stay below `KAINBAIN_HEALTH_MEM_CRITICAL_PCT` for `KAINBAIN_CIRCUIT_MEM_SUSTAINED_TICKS` ticks *before* resetting, or it re-trips. | reset |
| `manual` | Whoever tripped it. | reset with a reason |

**Reset (reason required, logged + broadcast):**

```bash
curl -sX POST localhost:3100/engine/reset \
  -H 'content-type: application/json' \
  -d '{"reason":"litellm reachable again (checked 12:04Z)","operator":"you"}'
```

**Manual trip (emergency stop):**

```bash
curl -sX POST localhost:3100/engine/trip \
  -H 'content-type: application/json' \
  -d '{"reason":"suspected state corruption — freezing queue"}'
```

## 4. Half-open probe (auto-resume policy)

Reset lifts containment, but the breaker can also recover on its own:

1. After a trip, the scheduler waits `KAINBAIN_CIRCUIT_PROBE_COOLDOWN_MS`
   (default 60 s).
2. It then admits **exactly one** canary (the oldest candidate) and tags it
   `canaryTaskId`.
3. Canary **passes** → containment lifts automatically (`source: auto:probe`).
4. Canary **fails** → the engine re-trips and the cooldown doubles
   (`KAINBAIN_CIRCUIT_PROBE_COOLDOWN_MS` → ×2), capped at
   `KAINBAIN_CIRCUIT_PROBE_BACKOFF_CAP_MS` (default 10 min). Repeat.

A logical (non-infrastructure) canary failure re-trips conservatively by
default; set `KAINBAIN_CIRCUIT_PROBE_FAILURE_RETRIPS=0` to let a logical
failure lift the trip instead.

## 5. Tuning (see `.env.example` / `GET /status/config`)

| Knob | Default | Meaning |
| ---- | ------- | ------- |
| `KAINBAIN_CIRCUIT_ENABLED` | `true` | Master switch for the **auto-trip sensors**; the manual trip/reset routes keep working either way. |
| `KAINBAIN_CIRCUIT_INFRA_FAILURE_THRESHOLD` | `3` | Consecutive infrastructure failures (window below) before tripping. |
| `KAINBAIN_CIRCUIT_INFRA_FAILURE_WINDOW_MS` | `600000` | Sliding window for those failures. |
| `KAINBAIN_CIRCUIT_AUTH_FAILURE_THRESHOLD` / `_WINDOW_MS` | `3` / `600000` | Sustained provider-auth signature. |
| `KAINBAIN_CIRCUIT_DISK_FREE_FLOOR_BYTES` | `1073741824` | Free-disk floor (1 GiB). |
| `KAINBAIN_CIRCUIT_MEM_SUSTAINED_TICKS` | `3` | Consecutive memory-critical ticks before tripping. |
| `KAINBAIN_CIRCUIT_PROBE_*` | `true` / `60000` / `600000` | Half-open probe enable, cooldown, backoff cap. |
| `KAINBAIN_CIRCUIT_STATE_FILE` | `~/.kainbain/engine/circuit.json` | Durable containment state (atomic writes). |

**Flapping?** Raise `KAINBAIN_CIRCUIT_INFRA_FAILURE_WINDOW_MS` and/or the
threshold, or the probe cooldown/cap. A single GC spike never trips memory
(the debouncer requires M consecutive ticks); a probe failure always fails
open (a broken probe never blocks dispatch).

## 6. Persistence / restart behaviour

The state file is written atomically on every trip and reset. On boot,
`performStartupRecovery` loads it **before** any transition or dispatch, so a
restart during an outage comes back still tripped. A corrupt file loads as
healthy (fail-open on containment) and is reported via the load error seam —
never brick the boot over a rotted JSON file.
