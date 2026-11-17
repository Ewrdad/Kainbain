---
title: Update the UI
section: workflows
order: 15
slug: update-ui
---

# Update the UI

This guide updates the frontend (the screens you click) to a newer release.
To check whether you need it, open System Settings › About: the UI row shows
the installed and latest versions, and a warning banner appears when a newer
UI release is known.

## How to tell you need the update

- The About page (`#/system-settings/about`) shows **Status: Update available**
  on the UI row, or the banner names a newer UI version.
- After a backend update, the app may show a version-mismatch banner when the
  running UI no longer satisfies the backend's API range — updating the UI to
  the matching release clears it.

## Step-by-step update

From the repo checkout the app runs from:

```bash
git pull
npm run build:frontend
```

Then restart the frontend the same way it normally runs (for a production
host, `./deploy.sh --prod`; for local work, `npm run dev` — see
Install & Run (`#/docs/install-run`)).

When a release operator publishes a newer UI, they record it in
`KAINBAIN_LATEST_UI_VERSION` (see `.env.example`); the About page compares
that knob against the running UI version from `frontend/package.json`. While
the knob is unset, no newer release is advertised and the running version
reports Up to date.

## Verify it worked

1. Reopen System Settings › About: the UI row should show the new version as
   installed with **Status: Up to date** and no warning banner.
2. Reload the app and confirm the mismatch banner (if any) is gone.

## Rollback

```bash
./deploy.sh --rollback
```

This restores the last known-good deployment (kept as `<prod-dir>.prev`) and
restarts the service. Reopen the About page to confirm the previous UI version
is running again.
