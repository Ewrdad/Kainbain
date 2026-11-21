# GUIDE 04 — Backend-unreachable / 502 windows crashing the daemon mid-run

Cause 4 in `WIDE_NET_ANALYSIS.md`. server2-alpha is a LAN runner, so every
backend blip hits it: journal since 11-19 shows 501 x `fetch failed` and 16 x
`Backend 502` (`/runners/heartbeat`, `/runners/dispatch`), including a proven
backend downtime window 11-20 20:40:20–20:40:57 (build 637 `deployedAt`
20:40:14). A failure inside `executeAssignment`'s try is fatal on the daemon:
interrupt (bare on 0.1.0) + rethrow -> `exit(1)` -> systemd restart -> re-claim.

- **Verdict: REPLICABLE-LOCALLY** for the client/daemon behaviour (localhost
  mock backend returning 502 or dropping connections — no prod). Joining
  crashes to specific task interrupts is PROD-READ-ONLY (flagged in §4).
- **Code seams:** `runner/client.js` `call()` — non-2xx throws
  `Error("Backend " + res.status + " on " + path)` with `err.statusCode`
  (`:34-36`); network failure surfaces as undici `fetch failed`;
  `runner/daemon.js:2441-2452` generic catch — interrupt (with reason on
  0.2.0) then `throw err` (fatal); renewal/heartbeat path tolerates failures
  up to the lease TTL.

## 1. Signature (recognise it)

- Runner journal: `Runner failed: fetch failed` or `Runner failed: Backend 502
  on /tasks/…` with `restart counter` increments; when it lands mid-assignment
  the backend task history shows a (bare on 0.1.0) interrupt seconds after the
  last progress event.
- Backend/proxy log: 502 window or restart (`build.json` `deployedAt` jump vs
  `GET /status/observability` `engine.updatedAt`).
- Note: a 502 window does NOT always interrupt the in-flight task — 11-20
  20:40 window left `7f6220c3`'s Quick review running to completion at
  20:44:48. Fatality depends on which call fails (in-`try` = fatal; heartbeat =
  tolerated until lease TTL).

## 2. Safe local replication — mock backend on localhost (runner, `node:test`)

Point `createRunnerClient` at a real localhost HTTP server that misbehaves in
the two observed ways, and assert the exact error shapes the daemon branches on.
Proposed file (code stage): `runner/client.backendOutage.test.js`

```js
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createRunnerClient } from "./client.js";

let server, port, mode;
before(async () => {
  server = http.createServer((req, res) => {
    if (mode === "502") { res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "upstream unavailable" })); return; }
    if (mode === "drop") { req.socket.destroy(); return; } // undici: fetch failed
    res.writeHead(200, { "content-type": "application/json" }); res.end("{}");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
});
after(() => server.close());

describe("backend outage error shapes (Cause 4)", () => {
  it("502 -> Error('Backend 502 on <path>') with statusCode 502", async () => {
    mode = "502";
    const client = createRunnerClient({ backendUrl: `http://127.0.0.1:${port}` });
    await assert.rejects(client.heartbeat({ runnerId: "r1", facts: {} }), (err) => {
      assert.equal(err.statusCode, 502);
      assert.match(err.message, /Backend 502 on \/runners\/heartbeat/);
      return true;
    });
  });

  it("dropped socket -> 'fetch failed' network error (no statusCode)", async () => {
    mode = "drop";
    const client = createRunnerClient({ backendUrl: `http://127.0.0.1:${port}` });
    await assert.rejects(client.dispatchClaim(), /fetch failed/);
  });

  it("recovery: once the backend is back the same client succeeds", async () => {
    mode = "ok";
    const client = createRunnerClient({ backendUrl: `http://127.0.0.1:${port}` });
    assert.deepEqual(await client.heartbeat({ runnerId: "r1", facts: {} }), {});
  });
});
```

Run: `node --test runner/client.backendOutage.test.js`

## 3. Safe local replication — daemon fatality boundary (runner, `node:test`)

Pin which failures are fatal. In `executeAssignment`'s catch
(`runner/daemon.js:2299-2452`): `STALE_EPOCH` rethrows silently;
`WORKTREE_CAP_REACHED` and deterministic `gitFailure` return without rethrow;
**everything else** (including `Backend 502` / `fetch failed` from any
in-assignment call) sends an interrupt and **rethrows** -> process exit ->
systemd restart. A daemon-level test with a stub client (see
`runner/daemon.test.js` for the existing harness) asserts:

```js
it("mid-assignment backend 502 -> interrupt sent (with reason on 0.2.0) AND error rethrown (fatal)", async () => {
  const client = { interrupt: async () => ({}), /* ...other stubs */ };
  await assert.rejects(
    executeAssignment({ client, /* claim prepared, prepareWorkdir stubbed to throw 502-shaped error */ }),
    /Backend 502/,
  );
  assert.equal(client.interruptCalls.length, 1);
  assert.match(client.interruptCalls[0].reason, /Backend 502/); // reason present only on >= 0.2.0 builds
});
```

TDD angle: if the desired fix is "in-assignment transient backend errors
should interrupt WITHOUT rethrow (lease TTL bounds the damage)", write the red
test `expect(rethrown).toBe(false)`, watch it fail, then change the catch.

## 4. Prod-only verification

`PROD-ONLY — DO NOT RUN WITHOUT EXPLICIT USER PERMISSION` (read-only, prod
hosts/API):

```bash
# E4 — timestamp-join server2-alpha crashes to its task interrupts (this host):
journalctl --user -u kainbain-runner-server2-alpha --since '2026-11-19' \
  | grep -E 'Runner failed: (fetch failed|Backend 502)' | tail -50
curl -s 'http://192.168.1.206:3100/tasks/db24c124?projectId=0fd41821' | jq '.history[] | select(.action | test("interrupted execution|started"))'

# E7 — enumerate real backend downtime windows (backend host / proxy):
journalctl --user -u kainbain.service --since '2026-11-19' | grep -iE '502|restart|listen|EADDR' | tail -30
curl -s http://192.168.1.206:3100/deploy/status | jq '{build, deployedAt}'
curl -s http://192.168.1.206:3100/status/observability | jq '.engine.updatedAt'
```

## 5. Evidence to collect when reproduced

- Journal `Runner failed:` line with exact message + path, and the
  `restart counter` delta (proves crash-loop vs re-claim loop).
- Matching backend history pair (last progress event -> interrupt) with
  timestamps, per server2-alpha task (`db24c124`, `1f8959ca`, `f56e9878`,
  `ef21e99b`, `bae668cb`).
- Backend availability window from proxy/journal for the same timestamps.
