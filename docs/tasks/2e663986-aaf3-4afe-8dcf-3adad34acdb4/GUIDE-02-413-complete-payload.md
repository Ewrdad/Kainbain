# GUIDE 02 — HTTP 413 on `complete-execution` (payload > Fastify 1 MiB default)

Cause 2 in `WIDE_NET_ANALYSIS.md`. Proven for task `7f6220c3` Merge resolver on
server2-alpha (five `Committed … (pushed: true)` -> `Backend 413 on
/tasks/7f6220c3-…/complete-execution` -> `exit(1)` -> systemd restart cycles,
11-20 21:19–21:47, restart counters 830->834).

- **Verdict: REPLICABLE-LOCALLY** for the 413 mechanism itself (in-memory
  Fastify `inject`, or a localhost HTTP server). Confirming the *fleet scope*
  on real tasks is PROD-READ-ONLY (flagged in §4).
- **Code seams:** `api/index.js:116` — `const app = fastify({ logger: true })`
  with **no `bodyLimit`**, so Fastify's default 1 MiB (1,048,576 bytes) JSON
  body limit applies to every route; the only explicit `bodyLimit` in the API
  is the accessibility route (`api/routes/accessibility.js:371`).
  Runner side: `collectTaskFiles` (`runner/daemon.js:1820`) ships task-doc
  files (per-file cap 256 KiB, cumulative cap 1 MiB, `task.md` skipped) plus
  up to 20 KiB `output` in one JSON POST to `/tasks/:id/complete-execution`
  (`runner/daemon.js:2280-2296`); `runner/client.js:34` turns the 413 into
  `Error("Backend 413 on /tasks/.../complete-execution")` with `statusCode`.
  On the deployed 0.1.0 build that error hit the generic catch
  (`runner/daemon.js:2441-2452`) as a **bare** interrupt + rethrow -> `exit(1)`
  -> systemd restart -> re-claim -> agent re-runs -> 413 again: a deterministic
  loop that burns a full stage run per lap.

## 1. Signature (recognise it)

- Backend task history: a **bare** interrupt (`…lease dropped, re-queues as
  interrupted` with NO `Reason:`) that lands **seconds after a `finished`
  progress event**, following a multi-minute run; and the worktree
  `kb-<taskId>` on the runner host **does contain a pushed stage-output
  commit** (failure happened strictly after push).
- Runner journal (server2-alpha): `Runner failed: Backend 413 on
  /tasks/<id>-…/complete-execution` followed by `Main process exited,
  status=1` and an incrementing `restart counter`.
- Task docs folder large with many top-level binary assets (each under the
  256 KiB per-file cap, e.g. PNG screenshots) — the observed exhibit
  `kb-7f6220c3` held 2.8 MiB of task docs.

## 2. Safe local replication — the 413 mechanism (api, vitest)

Pin that the real server wiring rejects >1 MiB JSON bodies with 413 before
routing. Build the app the way `api/flow/runnerRoutes.test.js` does
(`app.inject`), register a runner, and POST an oversized `complete-execution`.

Proposed file (code stage): `api/flow/runnerRoutes.bodyLimit.413.test.js`

```js
import { describe, test, expect, beforeAll } from "vitest";
// build the fastify app with real runner routes exactly like
// api/flow/runnerRoutes.test.js does (see its beforeAll/buildApp helper),
// register one runner credential, claim a task, then:

describe("complete-execution body limit (Cause 2)", () => {
  test("POST /tasks/:id/complete-execution with >1 MiB JSON is rejected 413 before the handler runs", async () => {
    const big = "x".repeat(1024 * 1024 + 1); // 1 MiB + 1 byte
    const res = await app.inject({
      method: "POST",
      url: `/tasks/${taskId}/complete-execution`,
      headers: { "content-type": "application/json", ...runnerAuthHeaders },
      payload: JSON.stringify({ executionId, epoch, outcome: "passed", output: big }),
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().code).toBe("FST_ERR_CTP_BODY_TOO_LARGE");
    // The handler never ran: no completion recorded
    expect(ledger.snapshot().completions).toBe(0);
  });

  test("control: a body just under 1 MiB is accepted", async () => {
    const ok = "x".repeat(512 * 1024);
    const res = await app.inject({ /* same, payload with output: ok */ });
    expect(res.statusCode).toBe(200);
  });
});
```

A minimal standalone pin of the default (no wiring needed), proposed
`api/bodyLimit.default.test.js`:

```js
import { test, expect } from "vitest";
import fastify from "fastify";

test("fastify({ logger: true }) — as in api/index.js:116 — rejects >1 MiB JSON with 413", async () => {
  const app = fastify({ logger: true }); // mirrors api/index.js:116, no bodyLimit
  app.post("/x", async () => ({ ok: true }));
  const res = await app.inject({
    method: "POST", url: "/x",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({ pad: "x".repeat(1024 * 1024) }),
  });
  expect(res.statusCode).toBe(413);
  expect(res.json().code).toBe("FST_ERR_CTP_BODY_TOO_LARGE");
});
```

Run: `cd api && npx vitest run flow/runnerRoutes.bodyLimit.413.test.js bodyLimit.default.test.js`

## 3. Safe local replication — why task files can trigger it (runner, `node:test`)

`collectTaskFiles` caps the *files array* at 1 MiB cumulative, but the JSON
envelope adds the (up to 20 KiB) `output`, attestation, posture and JSON
escaping — and binary assets read as utf8 can inflate. Pin the boundary.
Proposed file (code stage): `runner/daemon.collectTaskFiles.test.js`

```js
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { collectTaskFiles } from "./daemon.js";

it("many sub-256KiB files are collectively capped near 1 MiB — envelope+output can still push the POST over the Fastify limit", () => {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-files-"));
  const dir = path.join(workdir, "docs", "tasks", "t1");
  fs.mkdirSync(dir, { recursive: true });
  // 6 x 200 KiB "PNGs" (each under the 256 KiB per-file cap) + task.md
  for (let i = 0; i < 6; i++) fs.writeFileSync(path.join(dir, `shot${i}.png`), Buffer.alloc(200 * 1024, 1));
  fs.writeFileSync(path.join(dir, "task.md"), "ignore me");
  const files = collectTaskFiles({ workdir, taskId: "t1" });
  const total = files.reduce((n, f) => n + Buffer.byteLength(f.content, "utf8"), 0);
  assert.ok(total <= 1024 * 1024, "file payload itself stays under 1 MiB");
  assert.ok(files.some((f) => f.name === "shot5.png") === false, "files past the cumulative cap are skipped");
  // …so the 413 comes from files(≤1MiB) + output(20KiB) + JSON overhead > 1 MiB
  const body = JSON.stringify({ taskFiles: files, output: "o".repeat(20_000) });
  assert.ok(Buffer.byteLength(body) > 1024 * 1024, "full complete-execution body exceeds Fastify default");
  fs.rmSync(workdir, { recursive: true, force: true });
});
```

Run: `node --test runner/daemon.collectTaskFiles.test.js`

## 4. Prod-only verification

`PROD-ONLY — DO NOT RUN WITHOUT EXPLICIT USER PERMISSION` (read-only, but prod
hosts/API):

```bash
# Backend access log, 11-20 21:15-21:47 — confirm the five 413s and sizes:
# (reverse-proxy or API journal on 192.168.1.206)
journalctl --user -u kainbain.service --since '2026-11-20 21:15' --until '2026-11-20 21:48' \
  | grep -E '413|complete-execution' | tail -20

# Journal sweep on BOTH runner hosts for the scope beyond 7f6220c3:
journalctl --user -u kainbain-runner-server2-alpha --since '2026-11-19' | grep -c 'Backend 413'
# local-alpha equivalent on the backend host (192.168.1.206, user server):
journalctl --user -u kainbain-runner-local-alpha --since '2026-11-19' | grep 'Backend 413' | tail -20

# Backend-side confirmation per task (read-only API):
curl -s "http://192.168.1.206:3100/tasks/7f6220c3?projectId=0fd41821" | jq '.history[] | select(.action | test("interrupted execution"))'
```

Worktree forensics (do NOT reap): `kb-7f6220c3` on server2-alpha holds the
pushed stage-output commits — `git -C ~/.kainbain/kb-7f6220c3 log --oneline -5`
and compare SHAs with `origin`.

## 5. Evidence to collect when reproduced

- The 413 response body (`FST_ERR_CTP_BODY_TOO_LARGE`) and the byte size of
  the rejected payload vs the 1,048,576 default.
- Runner journal lines `Backend 413 …` + `restart counter` increments.
- Task history pair: `finished` -> bare interrupt seconds later, with a
  pushed commit present in the worktree.
