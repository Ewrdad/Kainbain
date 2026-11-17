---
title: Update the backend
section: workflows
order: 25
slug: update-backend
---

# Update the backend

This guide updates the API server (the background part that runs tasks) to a
newer release. To check whether you need it, open System Settings › About:
the Backend row shows the installed and latest versions, and a warning banner
appears when a newer backend release is known.

## How to tell you need the update

- The About page (`#/system-settings/about`) shows **Status: Update available**
  on the Backend row, or the banner names a newer backend version.
- The API row's **accepts** map (from `api/version.json`) no longer matches
  the UI you run — update both sides together (see
  Update the UI (`#/docs/update-ui`)).

## Step-by-step update

From the repo checkout the app runs from:

```bash
git pull
npm run build:api
```

Then restart the API the same way it normally runs (for a production host,
`./deploy.sh --prod`; for local work, `npm run dev` — see Install & Run
(`#/docs/install-run`)).

Version bookkeeping the page relies on:

- Installed backend version comes from `api/package.json` (the single source).
- The newest backend release is recorded in `KAINBAIN_LATEST_BACKEND_VERSION`
  (see `.env.example`); the About page compares that knob against the running
  backend instead of guessing.
- Point `KAINBAIN_SECURITY_REPORT_PATH` at the JSON security report for the
  new build (written by CI or the deploy; see `./Security_scans.sh`) so the
  About page shows the report for exactly what is running. The file holds one
  JSON object:

  ```json
  {
    "status": "pass",
    "checkedAt": "2026-11-01T00:00:00.000Z",
    "summary": "Trivy + Semgrep clean.",
    "reportUrl": "https://secobserve.home/build/123"
  }
  ```

  `status` is `pass`, `fail`, or `warn`. A missing file, unparseable JSON,
  or any other status shows the honest "no security report recorded" state
  instead of guessing. `reportUrl` may be omitted to fall back to
  `KAINBAIN_SECURITY_REPORT_URL`, and omitted entirely when neither is set.

## Verify it worked

1. Reopen System Settings › About: the Backend row should show the new version
   as installed with **Status: Up to date** and no warning banner.
2. Check `GET /status` (see API Reference (`#/docs/api-reference`)): the
   `build.apiVersion` field should match `api/version.json`.
3. The Security report card should show the new build's report (or the honest
   "no security report recorded" state when none was written).

## Rollback

```bash
./deploy.sh --rollback
```

This restores the last known-good deployment (kept as `<prod-dir>.prev`) and
restarts the service. Reopen the About page to confirm the previous backend
version is running again.
