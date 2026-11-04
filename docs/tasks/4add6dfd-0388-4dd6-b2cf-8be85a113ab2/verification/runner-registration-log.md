# runner-registration-log.md — mock runner join, approve, run

Daemon: `node runner/main.js`, harness `mock`, dispatch mode, isolated
work root /tmp/kb-verify/runner-work, backend http://localhost:3100.

## 1. No credential → register + poll + timeout

Env: no `KAINBAIN_RUNNER_CREDENTIAL`, approval timeout 15s (shortened).

```text
Join pending; waiting for human approval in Settings › Harness › Runners…
Join pending; waiting for human approval in Settings › Harness › Runners…
Join pending; waiting for human approval in Settings › Harness › Runners…
Runner failed: Join for verify-mock-1 still pending after timeout.
```

Exit 1. (Note: the daemon's own message still names the legacy
`Settings › Harness › Runners` path — the UI keeps `harness` as an alias
of the Runners tab, so the instruction still lands. Docs use the current
`System Settings › Runners` path. Code-string fix out of scope.)

## 2. Approve while polling → exits asking for the credential (D4)

`POST /runners/verify-mock-1/approve` while the daemon polled:

```text
Join pending; waiting for human approval in Settings › Harness › Runners…
Runner failed: Join for verify-mock-1 approved. Paste the one-time credential shown in Settings › Harness › Runners into KAINBAIN_RUNNER_CREDENTIAL and restart.
```

Approve response: `{"runnerId":"verify-mock-1","status":"active",…}`
plus a 36-char credential. Daemon never fetches the credential itself.

## 3. Credentialed run → heartbeat + dispatch poll + idle exit 0

```text
Runner assignment done: {"assignments":0,"polls":1,"idle":true}
```

Exit 0 with `KAINBAIN_RUNNER_DISPATCH_IDLE_LIMIT=1` and no claimable
tasks. `GET /runners/models/catalogue` → `{"models":[]}` (unpinned mock
matches model-less tasks only — as documented).

Raw logs: /tmp/kb-verify/runner-no-cred.log, runner-approve.log,
runner-live.log.
