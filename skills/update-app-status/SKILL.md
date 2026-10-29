---
name: update-app-status
description: Point the project's "Go to App" quick-link at its running dev server via PATCH /projects/:id/app-status, with LAN network-host override and optional health endpoint. Use when starting, moving, or stopping the project's app.
lastUpdated: 2026-10-29
---

# Update App Status

Keep the project's "Go to App" link (Files & Repo header, top bar) pointing at
the app this run started. One PATCH call — no filesystem work.

**Resolved for this run:**

- API base: `{{kbApiBase}}`
- Target project: `{{targetProject}}`
- Network host override: `{{networkHost}}`
- Health endpoint: `{{healthEndpoint}}`

## 1. Find the app port

Check what this run actually started (dev server log, `package.json` scripts,
framework default). Prefer the process you started over a guessed port. When
`{{defaultPort}}` is set for this run it names the project's fixed dev-server
port — use it instead of guessing; when blank, detect the port from the
running process. If no app is running, skip to step 4 and clear the link
instead.

## 2. Resolve the project id

`GET {{kbApiBase}}/projects` → match `{{targetProject}}` by `name` or `slug`
(case-insensitive), take its `id`. No match → report and stop; never guess.

## 3. Set the link

```bash
curl -X PATCH {{kbApiBase}}/projects/<projectId>/app-status \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://localhost:<port>",
    "networkHost": "{{networkHost}}",
    "healthEndpoint": "{{healthEndpoint}}",
    "status": "running"
  }'
```

- `url` must be absolute `http(s)` — loopback is fine.
- `networkHost` rewrites loopback for LAN viewers (e.g. `lan-host.example`); omit or
  blank it when the app binds a LAN address already. An explicit
  `host:port` also overrides the port.
- `status` is one of `running`, `starting`, `degraded`, `stopped`.
- Partial updates merge: send just `{"status": "starting"}` while booting.

Non-agent projects can run the bundled helper instead (same endpoint):

```bash
./scripts/update-app-status.sh --port 5173 --network-host lan-host.example --health /health
```

## 4. Stopping the app

When the app stops, clear the link so nobody follows a dead URL:

```bash
curl -X PATCH {{kbApiBase}}/projects/<projectId>/app-status \
  -H "Content-Type: application/json" \
  -d '{"url": null}'
```

## 5. Verify (optional)

`GET {{kbApiBase}}/projects/<projectId>/app-status/health` probes
`url + healthEndpoint` server-side and records the outcome on the link.
