---
title: Update the API contract
section: workflows
order: 45
slug: update-api
---

# Update the API contract

The "API versions" row on System Settings › About is the version of the
screen-to-server contract used to detect compatibility between the UI and the
backend — not a separately deployed service. It comes from `api/version.json`
(the `apiVersion` field plus the `accepts` map of compatible ranges), and the
frontend declares what it needs in `frontend/version.json`
(`requires.backendApi`).

## How to tell you need the update

- The About page (`#/system-settings/about`) shows **Status: Update available**
  on the API row, meaning the operator-published
  `KAINBAIN_LATEST_API_VERSION` knob (see `.env.example`) is newer than the
  running contract.
- The app shows a version-mismatch banner: the running UI no longer satisfies
  the backend's `accepts` range (or vice versa). Mismatches are fixed by
  updating the components, never by editing the contract files by hand.

## Step-by-step update

The contract ships inside the backend and the UI, so updating it means
updating both sides to the matching release:

1. Update the backend first (Update the backend (`#/docs/update-backend`)) —
   this ships the new `api/version.json`.
2. Update the UI to the release built against that contract
   (Update the UI (`#/docs/update-ui`)) — this ships the matching
   `frontend/version.json` requirement.

Do not hand-edit `api/version.json` or `frontend/version.json` on a running
install: release tooling (`./publish.sh`) keeps them consistent, and a
hand-edited contract only hides the mismatch the banner is warning about.

## Verify it worked

1. Reopen System Settings › About: the API row should show the new contract
   version with **Status: Up to date**.
2. The mismatch banner (if any) is gone.
3. `GET /status` (see API Reference (`#/docs/api-reference`)) reports
   `build.apiVersion` equal to the new contract version.

## Rollback

Roll back the components, which carries the contract back with them:

```bash
./deploy.sh --rollback
```

Then confirm on the About page that the API row shows the previous contract
version again.
