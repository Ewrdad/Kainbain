---
title: Alert Webhooks
section: working-with
order: 76
slug: alert-webhooks
---

# Alert Webhooks

Parked failures rely on the dashboard unless you point the engine at a
webhook. Set one URL and every unscheduled human intervention — plus
checkpoints, rollbacks, and early warnings — arrives as a signed POST,
even when nobody is watching. For browser pop-ups instead, see
`#/docs/push-notifications`.

## Setup

| Knob | Default | Meaning |
| ---- | ------- | ------- |
| `KAINBAIN_ALERT_WEBHOOK_URL` | (empty) | Endpoint receiving every alert. Empty disables outbound alerting entirely. |
| `KAINBAIN_ALERT_WEBHOOK_SECRET` | (empty) | HMAC key for `X-KainBain-Signature`. Empty sends unsigned. |
| `KAINBAIN_ALERT_RETRIES` | `3` | POST attempts before giving up. |
| `KAINBAIN_ALERT_RETRY_BASE_MS` | `500` | Backoff base between attempts (exponential plus jitter). |
| `KAINBAIN_ALERT_TIMEOUT_MS` | `5000` | Timeout for one attempt. |

Restart the API after changing these. The secret never appears in
payloads, logs, or the timeline.

## Severity

| Event | Severity | Meaning |
| ----- | -------- | ------- |
| `task.failed` | `critical` | Unscheduled park: a human must step in. |
| `task.checkpoint_wait` | `info` | Scheduled checkpoint the flow designed for. Never pages. |
| `engine.trip` | `critical` | Circuit breaker tripped: all dispatch stopped. |
| `engine.reset` | `info` | Circuit breaker containment lifted. |
| `deploy.rollback` | `critical` | Live build rewound to the last known-good deployment. |
| `stage.failback_warning` | `warning` | Failbacks burned past 50% (then 75%) of the retry budget. Once per threshold. |

Operator aborts (pause, stop, supersede) never alert. A dead sink never
fails the task: delivery retries in the notifier only, and the task
settles identically whether the webhook answers or not.

## Payload

```text
{
  "version": 1,
  "event": "task.failed",
  "severity": "critical",
  "occurredAt": "2026-10-09T23:00:00.000Z",
  "task": { "projectId": "p1", "id": "t1" },
  "stage": { "id": "impl", "name": "Implementation", "type": "agent" },
  "error": { "kind": "logical", "signal": "test-failure", "message": "boom" },
  "excerpt": "TypeError: …\n… [14500 chars / 290 lines omitted] …\n[ERROR] …",
  "attemptCounts": { "transient": 0, "autoIteration": 9 }
}
```

Failure excerpts keep the error head (exception plus first frames) and
the diagnostic tail; the repetitive middle is replaced by one
`omitted` marker line. Verify deliveries with
`X-KainBain-Signature: sha256=<hmac of the raw body>`.
